// Authoritative game engine. Creates game state, applies validated actions, and
// produces per-player views (with opponents' secrets redacted).
//
// Action handling is built up across milestones. Milestone 3 wires the lobby +
// startGame; Milestones 4–6 fill in placement, turns, trading, dev cards, scoring.

import {
  emptyBag,
  generateBoard,
  addBag,
  bagTotal,
  bankTradeRate,
  canAfford,
  canBuildCityAt,
  canBuildRoadAt,
  canBuildSettlementAt,
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  computeLongestRoad,
  countBuildings,
  countRoads,
  distributeForRoll,
  playersOnTile,
  subtractBag,
  totalVictoryPoints,
  BANK_PER_RESOURCE,
  COSTS,
  DEV_DECK_COMPOSITION,
  LARGEST_ARMY_MIN,
  LONGEST_ROAD_MIN,
  PIECE_LIMITS,
  PLAYER_COLORS,
  RESOURCE_TYPES,
  ROBBER_DISCARD_LIMIT,
  WINNING_POINTS,
  type Action,
  type DevCardType,
  type GameState,
  type Player,
  type PlayerColor,
  type PlayerView,
  type ResourceBag,
  type ResourceType,
} from '@catan/shared';

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** Human-readable log lines broadcast to everyone. */
  logs: string[];
  /** Big moments shown to all as a centered banner (awards, winner). */
  announcements?: string[];
  /** Log lines sent privately to a single player (e.g. what was stolen). */
  privateLogs?: Record<string, string[]>;
}

function fullBank(): ResourceBag {
  return {
    brick: BANK_PER_RESOURCE,
    wood: BANK_PER_RESOURCE,
    sheep: BANK_PER_RESOURCE,
    wheat: BANK_PER_RESOURCE,
    ore: BANK_PER_RESOURCE,
  };
}

function buildDevDeck(): DevCardType[] {
  const deck: DevCardType[] = [];
  for (const [type, count] of Object.entries(DEV_DECK_COMPOSITION) as [DevCardType, number][]) {
    for (let i = 0; i < count; i++) deck.push(type);
  }
  return deck;
}

export function createPlayer(id: string, name: string, isHost: boolean, index: number): Player {
  return {
    id,
    name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    connected: true,
    isHost,
    resources: emptyBag(),
    devCards: [],
    playedKnights: 0,
    publicVictoryPoints: 0,
  };
}

/** Create a game in the lobby phase (no board yet — generated on startGame). */
export function createInitialGame(roomCode: string, host: Player): GameState {
  return {
    roomCode,
    phase: 'lobby',
    players: [host],
    // Placeholder board until the game starts; replaced in startGame.
    board: generateBoard({ seed: 1 }),
    bank: fullBank(),
    devDeck: [],
    currentPlayerIndex: 0,
    turnNumber: 0,
    lastRoll: null,
    hasRolledThisTurn: false,
    hasPlayedDevCardThisTurn: false,
    setupQueueIndex: 0,
    setupStep: 'settlement',
    lastSetupVertex: null,
    pendingTrade: null,
    mustDiscard: [],
    longestRoadOwner: null,
    largestArmyOwner: null,
    winnerId: null,
    targetPoints: WINNING_POINTS,
    turnEndsAt: null,
  };
}

// ----- Per-player view (redaction) -----

/**
 * Build the client-safe view for a given player: their own hand/dev cards are
 * full; opponents' are reduced to counts. The dev draw pile is never sent.
 */
export function toPlayerView(game: GameState, playerId: string): PlayerView {
  const opponentSecrets: PlayerView['opponentSecrets'] = {};
  const players = game.players.map((p) => {
    if (p.id === playerId) return p;
    const resourceCount = Object.values(p.resources).reduce((a, b) => a + b, 0);
    opponentSecrets[p.id] = { resourceCount, devCardCount: p.devCards.length };
    // Redact opponent private data.
    return { ...p, resources: emptyBag(), devCards: [] };
  });

  const safeGame: GameState = { ...game, players, devDeck: [] };
  return { game: safeGame, youId: playerId, opponentSecrets };
}

// ----- Action dispatch -----

const seededRng = () => Math.random();

export function applyAction(game: GameState, playerId: string, action: Action): ApplyResult {
  if (game.phase === 'ended') return { ok: false, error: 'Game is over', logs: [] };

  const result = dispatch(game, playerId, action);

  // After any successful, non-lobby action, recompute awards + points and check win.
  if (result.ok && game.phase !== 'lobby' && game.winnerId === null) {
    updateScores(game, result);
    const acting = game.players.find((p) => p.id === playerId);
    if (acting) checkWin(game, acting, result);
  }
  return result;
}

/** Append to an ApplyResult's announcements (lazily creating the array). */
function announce(result: ApplyResult, message: string): void {
  (result.announcements ??= []).push(message);
}

/** Greedily pick `n` resources from a bag (for auto-discarding on timeout). */
function autoPick(bag: ResourceBag, n: number): ResourceBag {
  const out = emptyBag();
  let left = n;
  for (const r of RESOURCE_TYPES) {
    while (bag[r] - out[r] > 0 && left > 0) { out[r]++; left--; }
  }
  return out;
}

/**
 * Auto-resolve the current player's turn when their timer expires, so the game
 * never stalls. Plays the minimal sensible moves (roll, auto-discard, move robber
 * to a random hex, end turn) and returns the combined log/announcements.
 */
export function forceTurnTimeout(game: GameState): ApplyResult {
  if (game.phase === 'lobby' || game.phase === 'ended') return { ok: false, logs: [] };
  const merged: ApplyResult = { ok: true, logs: [], announcements: [], privateLogs: {} };
  const merge = (r: ApplyResult) => {
    merged.logs.push(...r.logs);
    for (const m of r.announcements ?? []) (merged.announcements ??= []).push(m);
    for (const [k, v] of Object.entries(r.privateLogs ?? {})) (merged.privateLogs![k] ??= []).push(...v);
    return r.ok;
  };

  merged.logs.push(`${currentPlayer(game).name}'s turn timed out — auto-resolving.`);

  let guard = 0;
  // Cast to string: game.phase is mutated by applyAction inside the loop, so the
  // compiler's narrowing from the early return above doesn't apply at runtime.
  while (guard++ < 40 && (game.phase as string) !== 'lobby' && (game.phase as string) !== 'ended') {
    const cur = currentPlayer(game);
    if (game.phase === 'setupRound1' || game.phase === 'setupRound2') {
      if (game.setupStep === 'settlement') {
        const v = Object.values(game.board.vertices).find((x) => canPlaceSetupSettlement(game.board, x.id));
        if (!v || !merge(applyAction(game, cur.id, { type: 'placeSetupSettlement', vertexId: v.id }))) break;
      } else {
        const e = Object.values(game.board.edges).find(
          (x) => game.lastSetupVertex && canPlaceSetupRoad(game.board, x.id, game.lastSetupVertex)
        );
        if (!e) break;
        merge(applyAction(game, cur.id, { type: 'placeSetupRoad', edgeId: e.id }));
        break; // this player's setup turn is done
      }
    } else if (game.phase === 'rollDice') {
      if (!merge(applyAction(game, cur.id, { type: 'rollDice' }))) break;
    } else if (game.phase === 'discard') {
      for (const pid of [...game.mustDiscard]) {
        const p = game.players.find((x) => x.id === pid)!;
        merge(applyAction(game, pid, { type: 'discard', resources: autoPick(p.resources, Math.floor(bagTotal(p.resources) / 2)) }));
      }
      if (game.phase === 'discard') break; // couldn't clear — avoid spinning
    } else if (game.phase === 'moveRobber') {
      const tile = Object.values(game.board.tiles).find((t) => t.id !== game.board.robberTileId)!;
      const victims = [...playersOnTile(game.board, tile.id)].filter(
        (id) => id !== cur.id && bagTotal(game.players.find((p) => p.id === id)!.resources) > 0
      );
      if (!merge(applyAction(game, cur.id, { type: 'moveRobber', tileId: tile.id, stealFromPlayerId: victims[0] ?? null }))) break;
    } else if (game.phase === 'main') {
      if (game.pendingTrade) merge(applyAction(game, cur.id, { type: 'cancelTrade' }));
      merge(applyAction(game, cur.id, { type: 'endTurn' }));
      break;
    } else {
      break;
    }
  }
  return merged;
}

function dispatch(game: GameState, playerId: string, action: Action): ApplyResult {
  switch (action.type) {
    case 'setColor':
      return setColor(game, playerId, action.color);
    case 'setTargetPoints':
      return setTargetPoints(game, playerId, action.points);
    case 'startGame':
      return startGame(game, playerId);
    case 'placeSetupSettlement':
      return placeSetupSettlement(game, playerId, action.vertexId);
    case 'placeSetupRoad':
      return placeSetupRoad(game, playerId, action.edgeId);
    case 'rollDice':
      return rollDice(game, playerId);
    case 'buildRoad':
      return buildRoad(game, playerId, action.edgeId);
    case 'buildSettlement':
      return buildSettlement(game, playerId, action.vertexId);
    case 'buildCity':
      return buildCity(game, playerId, action.vertexId);
    case 'endTurn':
      return endTurn(game, playerId);
    case 'discard':
      return discard(game, playerId, action.resources);
    case 'moveRobber':
      return moveRobber(game, playerId, action.tileId, action.stealFromPlayerId);
    case 'bankTrade':
      return bankTrade(game, playerId, action.give, action.receive);
    case 'proposeTrade':
      return proposeTrade(game, playerId, action.give, action.receive);
    case 'acceptTrade':
      return acceptTrade(game, playerId, action.tradeId);
    case 'counterTrade':
      return counterTrade(game, playerId, action.give, action.receive);
    case 'finalizeTrade':
      return finalizeTrade(game, playerId, action.tradeId, action.withPlayerId);
    case 'cancelTrade':
      return cancelTrade(game, playerId);
    case 'buyDevCard':
      return buyDevCard(game, playerId);
    case 'playKnight':
      return playKnight(game, playerId);
    case 'playRoadBuilding':
      return playRoadBuilding(game, playerId, action.edgeIds);
    case 'playYearOfPlenty':
      return playYearOfPlenty(game, playerId, action.resources);
    case 'playMonopoly':
      return playMonopoly(game, playerId, action.resource);
    default:
      return { ok: false, error: `Unknown action`, logs: [] };
  }
}

// ----- Turn / phase helpers -----

function currentPlayer(game: GameState): Player {
  return game.players[game.currentPlayerIndex];
}

function requireCurrent(game: GameState, playerId: string): string | null {
  if (currentPlayer(game).id !== playerId) return 'Not your turn';
  return null;
}

function nameOf(game: GameState, playerId: string): string {
  return game.players.find((p) => p.id === playerId)?.name ?? '?';
}

function checkWin(game: GameState, player: Player, result: ApplyResult): void {
  if (totalVictoryPoints(player) >= game.targetPoints) {
    game.phase = 'ended';
    game.winnerId = player.id;
    const msg = `${player.name} wins with ${totalVictoryPoints(player)} points!`;
    result.logs.push(msg);
    announce(result, `🏆 ${msg}`);
  }
}

// ----- Scoring: awards + victory points (Milestone 6) -----

/** Recompute Longest Road + Largest Army owners, then every player's points. */
function updateScores(game: GameState, result: ApplyResult): void {
  recomputeLongestRoad(game, result);
  recomputeLargestArmy(game, result);
  for (const p of game.players) {
    const b = countBuildings(game.board, p.id);
    let pts = b.settlements + b.cities * 2;
    if (game.longestRoadOwner === p.id) pts += 2;
    if (game.largestArmyOwner === p.id) pts += 2;
    p.publicVictoryPoints = pts;
  }
}

/** Generic "biggest, with incumbent keeps ties" award resolver. */
function resolveAward(
  game: GameState,
  values: Record<string, number>,
  minimum: number,
  current: string | null
): string | null {
  const max = Math.max(0, ...Object.values(values));
  if (max < minimum) return current && values[current] >= minimum ? current : null;
  if (current && values[current] === max) return current; // incumbent keeps on tie
  const leaders = game.players.filter((p) => values[p.id] === max);
  if (leaders.length === 1) return leaders[0].id;
  // Tie among newcomers: stays with incumbent if still qualifying, else unclaimed.
  return current && values[current] >= minimum ? current : null;
}

function recomputeLongestRoad(game: GameState, result: ApplyResult): void {
  const lens: Record<string, number> = {};
  for (const p of game.players) lens[p.id] = computeLongestRoad(game.board, p.id);
  const prev = game.longestRoadOwner;
  const next = resolveAward(game, lens, LONGEST_ROAD_MIN, prev);
  if (next !== prev) {
    game.longestRoadOwner = next;
    if (next) {
      result.logs.push(`${nameOf(game, next)} takes Longest Road.`);
      announce(result, `🛣️ ${nameOf(game, next)} now has the Longest Road (+2 VP)`);
    } else {
      result.logs.push('Longest Road is now unclaimed.');
    }
  }
}

function recomputeLargestArmy(game: GameState, result: ApplyResult): void {
  const knights: Record<string, number> = {};
  for (const p of game.players) knights[p.id] = p.playedKnights;
  const prev = game.largestArmyOwner;
  const next = resolveAward(game, knights, LARGEST_ARMY_MIN, prev);
  if (next !== prev) {
    game.largestArmyOwner = next;
    if (next) {
      result.logs.push(`${nameOf(game, next)} takes Largest Army.`);
      announce(result, `⚔️ ${nameOf(game, next)} now has the Largest Army (+2 VP)`);
    }
  }
}

// ----- Setup phase -----

function placeSetupSettlement(game: GameState, playerId: string, vertexId: string): ApplyResult {
  if (game.phase !== 'setupRound1' && game.phase !== 'setupRound2')
    return { ok: false, error: 'Not in setup', logs: [] };
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return { ok: false, error: notCurrent, logs: [] };
  if (game.setupStep !== 'settlement') return { ok: false, error: 'Place your road first', logs: [] };
  if (!canPlaceSetupSettlement(game.board, vertexId))
    return { ok: false, error: 'Illegal settlement spot', logs: [] };

  const player = currentPlayer(game);
  game.board.vertices[vertexId].building = { type: 'settlement', owner: playerId };
  const logs = [`${player.name} placed a settlement.`];

  // The second settlement (round 2) yields starting resources.
  if (game.phase === 'setupRound2') {
    const gain = emptyBag();
    for (const tId of game.board.vertices[vertexId].tileIds) {
      const tile = game.board.tiles[tId];
      if (tile.resource !== 'desert') gain[tile.resource as ResourceType] += 1;
    }
    player.resources = addBag(player.resources, gain);
    game.bank = subtractBag(game.bank, gain);
  }

  game.setupStep = 'road';
  game.lastSetupVertex = vertexId;
  return { ok: true, logs };
}

function placeSetupRoad(game: GameState, playerId: string, edgeId: string): ApplyResult {
  if (game.phase !== 'setupRound1' && game.phase !== 'setupRound2')
    return { ok: false, error: 'Not in setup', logs: [] };
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return { ok: false, error: notCurrent, logs: [] };
  if (game.setupStep !== 'road' || !game.lastSetupVertex)
    return { ok: false, error: 'Place a settlement first', logs: [] };
  if (!canPlaceSetupRoad(game.board, edgeId, game.lastSetupVertex))
    return { ok: false, error: 'Road must connect to your new settlement', logs: [] };

  const player = currentPlayer(game);
  game.board.edges[edgeId].road = playerId;
  const logs = [`${player.name} placed a road.`];

  game.setupStep = 'settlement';
  game.lastSetupVertex = null;
  advanceSetup(game, logs);
  return { ok: true, logs };
}

/** Snake-draft progression: forward through round 1, reverse through round 2. */
function advanceSetup(game: GameState, logs: string[]): void {
  const last = game.players.length - 1;
  if (game.phase === 'setupRound1') {
    if (game.currentPlayerIndex < last) {
      game.currentPlayerIndex += 1;
    } else {
      game.phase = 'setupRound2'; // same player goes again (snake), at index `last`
    }
  } else if (game.phase === 'setupRound2') {
    if (game.currentPlayerIndex > 0) {
      game.currentPlayerIndex -= 1;
    } else {
      game.phase = 'rollDice';
      game.currentPlayerIndex = 0;
      game.turnNumber = 1;
      logs.push(`Setup complete. ${currentPlayer(game).name} to roll.`);
    }
  }
}

// ----- Rolling & production -----

function rollDice(game: GameState, playerId: string): ApplyResult {
  if (game.phase !== 'rollDice') return { ok: false, error: 'Cannot roll now', logs: [] };
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return { ok: false, error: notCurrent, logs: [] };

  const die1 = 1 + Math.floor(seededRng() * 6);
  const die2 = 1 + Math.floor(seededRng() * 6);
  const totalRoll = die1 + die2;
  game.lastRoll = { die1, die2, total: totalRoll };
  game.hasRolledThisTurn = true;
  const logs = [`${currentPlayer(game).name} rolled ${totalRoll} (${die1}+${die2}).`];

  if (totalRoll === 7) {
    // Players holding more than the limit must discard half (rounded down).
    game.mustDiscard = game.players
      .filter((p) => bagTotal(p.resources) > ROBBER_DISCARD_LIMIT)
      .map((p) => p.id);
    if (game.mustDiscard.length > 0) {
      game.phase = 'discard';
      logs.push('A 7! Players over 7 cards must discard half.');
    } else {
      game.phase = 'moveRobber';
      logs.push('A 7! Move the robber.');
    }
    return { ok: true, logs };
  }

  const { gains, bankSpend } = distributeForRoll(game, totalRoll);
  for (const p of game.players) p.resources = addBag(p.resources, gains[p.id]);
  game.bank = subtractBag(game.bank, bankSpend);

  // Log what each player gained from this roll.
  for (const p of game.players) {
    const parts = RESOURCE_TYPES.filter((r) => gains[p.id][r] > 0).map((r) => `${gains[p.id][r]} ${r}`);
    if (parts.length > 0) logs.push(`${p.name} got ${parts.join(', ')}.`);
  }

  game.phase = 'main';
  return { ok: true, logs };
}

// ----- Building -----

function spend(game: GameState, player: Player, cost: ResourceBag): void {
  player.resources = subtractBag(player.resources, cost);
  game.bank = addBag(game.bank, cost);
}

function ensureBuildPhase(game: GameState, playerId: string): string | null {
  if (game.phase !== 'main') return 'You must roll first';
  return requireCurrent(game, playerId);
}

function buildRoad(game: GameState, playerId: string, edgeId: string): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (countRoads(game.board, playerId) >= PIECE_LIMITS.roads)
    return { ok: false, error: 'No roads left', logs: [] };
  if (!canAfford(player.resources, COSTS.road)) return { ok: false, error: 'Cannot afford a road', logs: [] };
  if (!canBuildRoadAt(game.board, edgeId, playerId))
    return { ok: false, error: 'Illegal road location', logs: [] };

  spend(game, player, COSTS.road);
  game.board.edges[edgeId].road = playerId;
  return { ok: true, logs: [`${player.name} built a road.`] };
}

function buildSettlement(game: GameState, playerId: string, vertexId: string): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (countBuildings(game.board, playerId).settlements >= PIECE_LIMITS.settlements)
    return { ok: false, error: 'No settlements left', logs: [] };
  if (!canAfford(player.resources, COSTS.settlement))
    return { ok: false, error: 'Cannot afford a settlement', logs: [] };
  if (!canBuildSettlementAt(game.board, vertexId, playerId))
    return { ok: false, error: 'Illegal settlement location', logs: [] };

  spend(game, player, COSTS.settlement);
  game.board.vertices[vertexId].building = { type: 'settlement', owner: playerId };
  return { ok: true, logs: [`${player.name} built a settlement.`] };
}

function buildCity(game: GameState, playerId: string, vertexId: string): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (countBuildings(game.board, playerId).cities >= PIECE_LIMITS.cities)
    return { ok: false, error: 'No cities left', logs: [] };
  if (!canAfford(player.resources, COSTS.city)) return { ok: false, error: 'Cannot afford a city', logs: [] };
  if (!canBuildCityAt(game.board, vertexId, playerId))
    return { ok: false, error: 'Must upgrade your own settlement', logs: [] };

  spend(game, player, COSTS.city);
  game.board.vertices[vertexId].building = { type: 'city', owner: playerId };
  return { ok: true, logs: [`${player.name} upgraded to a city.`] };
}

function endTurn(game: GameState, playerId: string): ApplyResult {
  if (game.phase !== 'main') return { ok: false, error: 'Cannot end turn now', logs: [] };
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return { ok: false, error: notCurrent, logs: [] };

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.turnNumber += 1;
  game.hasRolledThisTurn = false;
  game.hasPlayedDevCardThisTurn = false;
  game.lastRoll = null;
  game.pendingTrade = null;
  game.phase = 'rollDice';
  return { ok: true, logs: [`${currentPlayer(game).name}'s turn.`] };
}

// ----- Robber & discard (Milestone 5) -----

/** Where to return after the robber is moved: mid-turn build phase, or pre-roll. */
function robberReturnPhase(game: GameState): 'main' | 'rollDice' {
  return game.hasRolledThisTurn ? 'main' : 'rollDice';
}

function discard(game: GameState, playerId: string, resources: ResourceBag): ApplyResult {
  if (game.phase !== 'discard') return { ok: false, error: 'Not discarding now', logs: [] };
  if (!game.mustDiscard.includes(playerId))
    return { ok: false, error: 'You do not need to discard', logs: [] };
  const player = game.players.find((p) => p.id === playerId)!;
  const required = Math.floor(bagTotal(player.resources) / 2);
  if (bagTotal(resources) !== required)
    return { ok: false, error: `You must discard exactly ${required} cards`, logs: [] };
  if (!canAfford(player.resources, resources))
    return { ok: false, error: 'You do not have those cards', logs: [] };

  player.resources = subtractBag(player.resources, resources);
  game.bank = addBag(game.bank, resources);
  game.mustDiscard = game.mustDiscard.filter((id) => id !== playerId);

  const logs = [`${player.name} discarded ${required} cards.`];
  if (game.mustDiscard.length === 0) {
    game.phase = 'moveRobber';
    logs.push(`${currentPlayer(game).name} moves the robber.`);
  }
  return { ok: true, logs };
}

function moveRobber(
  game: GameState,
  playerId: string,
  tileId: string,
  stealFromPlayerId: string | null
): ApplyResult {
  if (game.phase !== 'moveRobber') return { ok: false, error: 'Cannot move robber now', logs: [] };
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return { ok: false, error: notCurrent, logs: [] };
  if (!game.board.tiles[tileId]) return { ok: false, error: 'No such tile', logs: [] };
  if (tileId === game.board.robberTileId)
    return { ok: false, error: 'Robber must move to a new tile', logs: [] };

  game.board.robberTileId = tileId;
  const logs = [`${currentPlayer(game).name} moved the robber.`];

  // Validate / perform the steal.
  const victims = [...playersOnTile(game.board, tileId)].filter(
    (id) => id !== playerId && bagTotal(game.players.find((p) => p.id === id)!.resources) > 0
  );
  const privateLogs: Record<string, string[]> = {};
  if (stealFromPlayerId) {
    if (!victims.includes(stealFromPlayerId))
      return { ok: false, error: 'Cannot steal from that player', logs: [] };
    const victim = game.players.find((p) => p.id === stealFromPlayerId)!;
    const thief = currentPlayer(game);
    const pool: ResourceType[] = [];
    for (const r of RESOURCE_TYPES) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
    const stolen = pool[Math.floor(seededRng() * pool.length)];
    victim.resources[stolen] -= 1;
    thief.resources[stolen] += 1;
    // Public line hides the resource; the two players involved learn it privately.
    logs.push(`${thief.name} stole a card from ${victim.name}.`);
    privateLogs[thief.id] = [`You stole 1 ${stolen} from ${victim.name}.`];
    privateLogs[victim.id] = [`${thief.name} stole 1 ${stolen} from you.`];
  }

  game.phase = robberReturnPhase(game);
  return { ok: true, logs, privateLogs };
}

// ----- Trading (Milestone 5) -----

function bankTrade(
  game: GameState,
  playerId: string,
  give: ResourceType,
  receive: ResourceType
): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  if (give === receive) return { ok: false, error: 'Pick two different resources', logs: [] };
  const player = currentPlayer(game);
  const rate = bankTradeRate(game.board, playerId, give);
  if (player.resources[give] < rate)
    return { ok: false, error: `Need ${rate} ${give} to trade`, logs: [] };
  if (game.bank[receive] < 1) return { ok: false, error: 'Bank is out of that resource', logs: [] };

  player.resources[give] -= rate;
  player.resources[receive] += 1;
  game.bank[give] += rate;
  game.bank[receive] -= 1;
  return { ok: true, logs: [`${player.name} traded ${rate} ${give} for 1 ${receive} (${rate}:1).`] };
}

// ----- Player-to-player trading -----
// Standard Catan timing: only the current player (after rolling) may propose a
// trade; other players accept; the proposer finalizes with one of them.

let tradeCounter = 0;

/** Sanitize a client-supplied bag to non-negative integers for the 5 resources. */
function cleanBag(bag: ResourceBag): ResourceBag {
  const out = emptyBag();
  for (const r of RESOURCE_TYPES) out[r] = Math.max(0, Math.floor(bag?.[r] ?? 0));
  return out;
}

function describeBag(bag: ResourceBag): string {
  const parts = RESOURCE_TYPES.filter((r) => bag[r] > 0).map((r) => `${bag[r]} ${r}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

function proposeTrade(game: GameState, playerId: string, rawGive: ResourceBag, rawReceive: ResourceBag): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  if (game.players.length < 2) return { ok: false, error: 'No one to trade with', logs: [] };
  const give = cleanBag(rawGive);
  const receive = cleanBag(rawReceive);
  if (bagTotal(give) === 0 || bagTotal(receive) === 0)
    return { ok: false, error: 'Offer must give and ask for something', logs: [] };
  const player = currentPlayer(game);
  if (!canAfford(player.resources, give))
    return { ok: false, error: "You don't have what you offered", logs: [] };

  game.pendingTrade = { id: `trade${++tradeCounter}`, from: playerId, give, receive, acceptedBy: [], counters: [] };
  return { ok: true, logs: [`${player.name} offers ${describeBag(give)} for ${describeBag(receive)}.`] };
}

function counterTrade(game: GameState, playerId: string, rawGive: ResourceBag, rawReceive: ResourceBag): ApplyResult {
  const trade = game.pendingTrade;
  if (!trade) return { ok: false, error: 'No active trade', logs: [] };
  if (trade.from === playerId) return { ok: false, error: "You can't counter your own offer", logs: [] };
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found', logs: [] };
  const give = cleanBag(rawGive);
  const receive = cleanBag(rawReceive);
  if (bagTotal(give) === 0 || bagTotal(receive) === 0)
    return { ok: false, error: 'Counter must give and ask for something', logs: [] };
  if (!canAfford(player.resources, give))
    return { ok: false, error: "You don't have what you offered", logs: [] };

  // Replace any prior counter from this player.
  trade.counters = trade.counters.filter((c) => c.from !== playerId);
  trade.counters.push({ from: playerId, give, receive });
  // A counter implies they're no longer a plain accepter of the original.
  trade.acceptedBy = trade.acceptedBy.filter((id) => id !== playerId);
  return { ok: true, logs: [`${player.name} counters: gives ${describeBag(give)} for ${describeBag(receive)}.`] };
}

function acceptTrade(game: GameState, playerId: string, tradeId: string): ApplyResult {
  const trade = game.pendingTrade;
  if (!trade || trade.id !== tradeId) return { ok: false, error: 'No such trade', logs: [] };
  if (trade.from === playerId) return { ok: false, error: "You can't accept your own offer", logs: [] };
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found', logs: [] };
  if (!canAfford(player.resources, trade.receive))
    return { ok: false, error: "You don't have what they want", logs: [] };
  if (!trade.acceptedBy.includes(playerId)) trade.acceptedBy.push(playerId);
  return { ok: true, logs: [`${player.name} will accept the trade.`] };
}

function finalizeTrade(game: GameState, playerId: string, tradeId: string, withPlayerId: string): ApplyResult {
  const trade = game.pendingTrade;
  if (!trade || trade.id !== tradeId) return { ok: false, error: 'No such trade', logs: [] };
  if (trade.from !== playerId) return { ok: false, error: 'Only the proposer can finalize', logs: [] };
  const proposer = game.players.find((p) => p.id === playerId)!;
  const partner = game.players.find((p) => p.id === withPlayerId)!;
  if (!partner) return { ok: false, error: 'No such player', logs: [] };

  // Determine the terms: a counter from this player overrides the original offer.
  const counter = trade.counters.find((c) => c.from === withPlayerId);
  // What the proposer gives / receives in this deal.
  const proposerGives = counter ? counter.receive : trade.give;
  const proposerGets = counter ? counter.give : trade.receive;
  if (!counter && !trade.acceptedBy.includes(withPlayerId))
    return { ok: false, error: 'That player has not accepted', logs: [] };
  if (!canAfford(proposer.resources, proposerGives) || !canAfford(partner.resources, proposerGets))
    return { ok: false, error: 'Someone no longer has the resources', logs: [] };

  proposer.resources = addBag(subtractBag(proposer.resources, proposerGives), proposerGets);
  partner.resources = addBag(subtractBag(partner.resources, proposerGets), proposerGives);
  game.pendingTrade = null;
  return { ok: true, logs: [`${proposer.name} traded with ${partner.name}.`] };
}

function cancelTrade(game: GameState, playerId: string): ApplyResult {
  const trade = game.pendingTrade;
  if (!trade) return { ok: false, error: 'No active trade', logs: [] };
  if (trade.from !== playerId) return { ok: false, error: 'Only the proposer can cancel', logs: [] };
  game.pendingTrade = null;
  return { ok: true, logs: [`${nameOf(game, playerId)} cancelled the trade.`] };
}

// ----- Development cards (Milestone 5) -----

function buyDevCard(game: GameState, playerId: string): ApplyResult {
  const blocked = ensureBuildPhase(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (game.devDeck.length === 0) return { ok: false, error: 'No development cards left', logs: [] };
  if (!canAfford(player.resources, COSTS.devCard))
    return { ok: false, error: 'Cannot afford a development card', logs: [] };

  spend(game, player, COSTS.devCard);
  const type = game.devDeck.pop()!;
  player.devCards.push({ type, boughtOnTurn: game.turnNumber });
  return { ok: true, logs: [`${player.name} bought a development card.`] };
}

/** Remove one playable dev card of a type (not one bought this turn). */
function takePlayableCard(game: GameState, player: Player, type: DevCardType): boolean {
  const idx = player.devCards.findIndex((c) => c.type === type && c.boughtOnTurn < game.turnNumber);
  if (idx === -1) return false;
  player.devCards.splice(idx, 1);
  return true;
}

function canPlayDevCard(game: GameState, playerId: string): string | null {
  if (game.phase !== 'main' && game.phase !== 'rollDice') return 'Cannot play a card now';
  const notCurrent = requireCurrent(game, playerId);
  if (notCurrent) return notCurrent;
  if (game.hasPlayedDevCardThisTurn) return 'Already played a card this turn';
  return null;
}

function playKnight(game: GameState, playerId: string): ApplyResult {
  const blocked = canPlayDevCard(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (!takePlayableCard(game, player, 'knight'))
    return { ok: false, error: 'No playable Knight card', logs: [] };

  player.playedKnights += 1;
  game.hasPlayedDevCardThisTurn = true;
  game.phase = 'moveRobber'; // robber resolution returns to the prior phase
  return { ok: true, logs: [`${player.name} played a Knight.`] };
}

function playRoadBuilding(game: GameState, playerId: string, edgeIds: string[]): ApplyResult {
  const blocked = canPlayDevCard(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  const ids = edgeIds.slice(0, 2);
  // Validate sequentially: placing the first road may legalize the second.
  for (const eId of ids) {
    if (countRoads(game.board, playerId) >= PIECE_LIMITS.roads)
      return { ok: false, error: 'No roads left', logs: [] };
    if (!canBuildRoadAt(game.board, eId, playerId))
      return { ok: false, error: 'Illegal road location', logs: [] };
    game.board.edges[eId].road = playerId;
  }
  if (!takePlayableCard(game, player, 'roadBuilding')) {
    // Roll back placed roads if the card wasn't actually playable.
    for (const eId of ids) game.board.edges[eId].road = null;
    return { ok: false, error: 'No playable Road Building card', logs: [] };
  }
  game.hasPlayedDevCardThisTurn = true;
  return { ok: true, logs: [`${player.name} played Road Building (${ids.length} roads).`] };
}

function playYearOfPlenty(game: GameState, playerId: string, resources: ResourceType[]): ApplyResult {
  const blocked = canPlayDevCard(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const picks = resources.slice(0, 2);
  if (picks.length !== 2) return { ok: false, error: 'Pick two resources', logs: [] };
  for (const r of picks) if (game.bank[r] < 1) return { ok: false, error: 'Bank is short', logs: [] };

  const player = currentPlayer(game);
  if (!takePlayableCard(game, player, 'yearOfPlenty'))
    return { ok: false, error: 'No playable Year of Plenty card', logs: [] };
  for (const r of picks) {
    player.resources[r] += 1;
    game.bank[r] -= 1;
  }
  game.hasPlayedDevCardThisTurn = true;
  return { ok: true, logs: [`${player.name} played Year of Plenty.`] };
}

function playMonopoly(game: GameState, playerId: string, resource: ResourceType): ApplyResult {
  const blocked = canPlayDevCard(game, playerId);
  if (blocked) return { ok: false, error: blocked, logs: [] };
  const player = currentPlayer(game);
  if (!takePlayableCard(game, player, 'monopoly'))
    return { ok: false, error: 'No playable Monopoly card', logs: [] };

  let taken = 0;
  for (const other of game.players) {
    if (other.id === playerId) continue;
    taken += other.resources[resource];
    other.resources[resource] = 0;
  }
  player.resources[resource] += taken;
  game.hasPlayedDevCardThisTurn = true;
  return { ok: true, logs: [`${player.name} played Monopoly on ${resource} (took ${taken}).`] };
}

function setColor(game: GameState, playerId: string, color: PlayerColor): ApplyResult {
  if (game.phase !== 'lobby') return { ok: false, error: 'Can only change color in the lobby', logs: [] };
  if (!PLAYER_COLORS.includes(color)) return { ok: false, error: 'Invalid color', logs: [] };
  if (game.players.some((p) => p.id !== playerId && p.color === color))
    return { ok: false, error: 'That color is taken', logs: [] };
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'Player not found', logs: [] };
  player.color = color;
  return { ok: true, logs: [`${player.name} chose ${color}.`] };
}

function setTargetPoints(game: GameState, playerId: string, points: number): ApplyResult {
  if (game.phase !== 'lobby') return { ok: false, error: 'Can only change this in the lobby', logs: [] };
  const host = game.players.find((p) => p.id === playerId);
  if (!host?.isHost) return { ok: false, error: 'Only the host can change the target', logs: [] };
  if (!Number.isInteger(points) || points < 3 || points > 20)
    return { ok: false, error: 'Target must be between 3 and 20', logs: [] };
  game.targetPoints = points;
  return { ok: true, logs: [`Target to win set to ${points} points.`] };
}

function startGame(game: GameState, playerId: string): ApplyResult {
  const host = game.players.find((p) => p.id === playerId);
  if (!host?.isHost) return { ok: false, error: 'Only the host can start the game', logs: [] };
  if (game.phase !== 'lobby') return { ok: false, error: 'Game already started', logs: [] };
  if (game.players.length < 2) return { ok: false, error: 'Need at least 2 players', logs: [] };

  game.board = generateBoard({ seed: Math.floor(seededRng() * 1e9) });
  game.devDeck = shuffleInPlace(buildDevDeck());
  game.phase = 'setupRound1';
  game.currentPlayerIndex = 0;
  game.setupQueueIndex = 0;
  game.turnNumber = 0;

  return { ok: true, logs: [`Game started with ${game.players.length} players. Setup begins.`] };
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
