import { describe, it, expect, vi } from 'vitest';
import {
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  countBuildings,
  countPlaced,
  PLAYER_COLORS,
  type GameState,
} from '@catan/shared';
import { applyAction, createInitialGame, createPlayer, forceTurnTimeout } from './game.js';

function startedGame(): GameState {
  const host = createPlayer('A', 'Alice', true, 0);
  const game = createInitialGame('TEST', host);
  game.players.push(createPlayer('B', 'Bob', false, 1));
  applyAction(game, 'A', { type: 'startGame' });
  // Auto-run setup.
  let guard = 0;
  while (game.phase === 'setupRound1' || game.phase === 'setupRound2') {
    if (guard++ > 100) throw new Error('setup stuck');
    const pid = game.players[game.currentPlayerIndex].id;
    if (game.setupStep === 'settlement') {
      const v = Object.values(game.board.vertices).find((x) => canPlaceSetupSettlement(game.board, x.id))!;
      applyAction(game, pid, { type: 'placeSetupSettlement', vertexId: v.id });
    } else {
      const e = Object.values(game.board.edges).find((x) =>
        canPlaceSetupRoad(game.board, x.id, game.lastSetupVertex!)
      )!;
      applyAction(game, pid, { type: 'placeSetupRoad', edgeId: e.id });
    }
  }
  // startGame now randomizes turn order; for deterministic tests, put A first as
  // the current player, then drop into the main (post-roll) phase.
  game.players.sort((x, y) => (x.id === 'A' ? -1 : y.id === 'A' ? 1 : 0));
  game.currentPlayerIndex = 0;
  game.hasRolledThisTurn = true;
  game.phase = 'main';
  return game;
}

describe('bank trade', () => {
  it('exchanges at 4:1', () => {
    const game = startedGame();
    game.board.ports = {}; // no ports -> plain 4:1
    const a = game.players[0];
    a.resources = { brick: 0, wood: 4, sheep: 0, wheat: 0, ore: 0 };
    const res = applyAction(game, 'A', { type: 'bankTrade', give: 'wood', receive: 'ore' });
    expect(res.ok).toBe(true);
    expect(a.resources.wood).toBe(0);
    expect(a.resources.ore).toBe(1);
  });

  it('rejects when short of the rate', () => {
    const game = startedGame();
    game.board.ports = {}; // no ports -> plain 4:1
    game.players[0].resources = { brick: 0, wood: 3, sheep: 0, wheat: 0, ore: 0 };
    expect(applyAction(game, 'A', { type: 'bankTrade', give: 'wood', receive: 'ore' }).ok).toBe(false);
  });
});

describe('development cards', () => {
  it('buys a card and deducts resources', () => {
    const game = startedGame();
    const a = game.players[0];
    a.resources = { brick: 0, wood: 0, sheep: 1, wheat: 1, ore: 1 };
    const res = applyAction(game, 'A', { type: 'buyDevCard' });
    expect(res.ok).toBe(true);
    expect(a.devCards.length).toBe(1);
    expect(a.resources.sheep + a.resources.wheat + a.resources.ore).toBe(0);
  });

  it('cannot play a card bought the same turn', () => {
    const game = startedGame();
    const a = game.players[0];
    a.devCards.push({ type: 'knight', boughtOnTurn: game.turnNumber });
    expect(applyAction(game, 'A', { type: 'playKnight' }).ok).toBe(false);
  });

  it('Monopoly takes all of one resource from opponents', () => {
    const game = startedGame();
    const [a, b] = game.players;
    a.devCards.push({ type: 'monopoly', boughtOnTurn: game.turnNumber - 1 });
    b.resources.wheat = 3;
    a.resources.wheat = 1;
    const res = applyAction(game, 'A', { type: 'playMonopoly', resource: 'wheat' });
    expect(res.ok).toBe(true);
    expect(a.resources.wheat).toBe(4);
    expect(b.resources.wheat).toBe(0);
  });

  it('Year of Plenty draws 2 from the bank', () => {
    const game = startedGame();
    const a = game.players[0];
    a.devCards.push({ type: 'yearOfPlenty', boughtOnTurn: game.turnNumber - 1 });
    a.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
    const res = applyAction(game, 'A', { type: 'playYearOfPlenty', resources: ['ore', 'wheat'] });
    expect(res.ok).toBe(true);
    expect(a.resources.ore).toBe(1);
    expect(a.resources.wheat).toBe(1);
  });

  it('three knights earns Largest Army (+2 VP)', () => {
    const game = startedGame();
    const a = game.players[0];
    for (let i = 0; i < 3; i++) a.devCards.push({ type: 'knight', boughtOnTurn: game.turnNumber - 1 });
    // Play three knights across turns (reset the per-turn flag + robber phase each time).
    for (let i = 0; i < 3; i++) {
      game.phase = 'main';
      game.hasPlayedDevCardThisTurn = false;
      const res = applyAction(game, 'A', { type: 'playKnight' });
      expect(res.ok).toBe(true);
      // Resolve the robber move it triggers.
      const tile = Object.values(game.board.tiles).find((t) => t.id !== game.board.robberTileId)!;
      applyAction(game, 'A', { type: 'moveRobber', tileId: tile.id, stealFromPlayerId: null });
    }
    expect(a.playedKnights).toBe(3);
    expect(game.largestArmyOwner).toBe('A');
    expect(a.publicVictoryPoints).toBeGreaterThanOrEqual(2 + 2); // setup buildings + army
  });
});

describe('color selection (lobby)', () => {
  it('rejects a taken color and accepts a free one', () => {
    const host = createPlayer('A', 'Alice', true, 0); // red (index 0)
    const game = createInitialGame('TEST', host);
    game.players.push(createPlayer('B', 'Bob', false, 1)); // blue (index 1)

    const aColor = game.players.find((p) => p.id === 'A')!.color; // PLAYER_COLORS[0]
    const free = PLAYER_COLORS.find((c) => c !== aColor && c !== game.players.find((p) => p.id === 'B')!.color)!;
    // Bob cannot take Alice's color.
    expect(applyAction(game, 'B', { type: 'setColor', color: aColor }).ok).toBe(false);
    // Bob can take a free color.
    expect(applyAction(game, 'B', { type: 'setColor', color: free }).ok).toBe(true);
    expect(game.players.find((p) => p.id === 'B')!.color).toBe(free);
  });

  it('cannot change color once the game has started', () => {
    const host = createPlayer('A', 'Alice', true, 0);
    const game = createInitialGame('TEST', host);
    game.players.push(createPlayer('B', 'Bob', false, 1));
    applyAction(game, 'A', { type: 'startGame' });
    expect(applyAction(game, 'A', { type: 'setColor', color: PLAYER_COLORS[5] }).ok).toBe(false);
  });
});

describe('player-to-player trading', () => {
  it('proposes, accepts, and finalizes a swap', () => {
    const game = startedGame();
    const [a, b] = game.players;
    a.resources = { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 };
    b.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 1 };

    const give = { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 };
    const receive = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 1 };
    expect(applyAction(game, 'A', { type: 'proposeTrade', give, receive }).ok).toBe(true);
    const tradeId = game.pendingTrade!.id;

    // Proposer can't accept their own; B accepts.
    expect(applyAction(game, 'A', { type: 'acceptTrade', tradeId }).ok).toBe(false);
    expect(applyAction(game, 'B', { type: 'acceptTrade', tradeId }).ok).toBe(true);

    expect(applyAction(game, 'A', { type: 'finalizeTrade', tradeId, withPlayerId: 'B' }).ok).toBe(true);
    expect(a.resources.ore).toBe(1);
    expect(a.resources.wood).toBe(0);
    expect(b.resources.wood).toBe(1);
    expect(b.resources.ore).toBe(0);
    expect(game.pendingTrade).toBeNull();
  });

  it('rejects accept when the partner lacks the asked resources', () => {
    const game = startedGame();
    game.players[0].resources = { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 };
    game.players[1].resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
    applyAction(game, 'A', {
      type: 'proposeTrade',
      give: { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 },
      receive: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 1 },
    });
    expect(applyAction(game, 'B', { type: 'acceptTrade', tradeId: game.pendingTrade!.id }).ok).toBe(false);
  });

  it('lets another player counter, and the proposer finalize on counter terms', () => {
    const game = startedGame();
    const [a, b] = game.players;
    a.resources = { brick: 0, wood: 1, sheep: 0, wheat: 1, ore: 0 };
    b.resources = { brick: 0, wood: 0, sheep: 1, wheat: 0, ore: 0 };

    applyAction(game, 'A', {
      type: 'proposeTrade',
      give: { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 },
      receive: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 1 },
    });
    const tradeId = game.pendingTrade!.id;
    // B counters: B gives 1 sheep, wants 1 wheat.
    expect(applyAction(game, 'B', {
      type: 'counterTrade', tradeId,
      give: { brick: 0, wood: 0, sheep: 1, wheat: 0, ore: 0 },
      receive: { brick: 0, wood: 0, sheep: 0, wheat: 1, ore: 0 },
    }).ok).toBe(true);
    expect(game.pendingTrade!.counters).toHaveLength(1);

    // A finalizes with B on the counter terms: A gives wheat, gets sheep.
    expect(applyAction(game, 'A', { type: 'finalizeTrade', tradeId, withPlayerId: 'B' }).ok).toBe(true);
    expect(a.resources.sheep).toBe(1);
    expect(a.resources.wheat).toBe(0);
    expect(b.resources.wheat).toBe(1);
    expect(b.resources.sheep).toBe(0);
  });
});

describe('war', () => {
  /** A → road → B's settlement, with A holding `aSoldiers` at the staging vertex. */
  const garr = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: 'X' }));
  function warScenario(aSoldiers: number, bSoldiers: number) {
    const game = startedGame(); // A is current, main phase
    const edge = Object.values(game.board.edges)[0];
    const [u, w] = edge.vertexIds;
    game.board.edges[edge.id].road = 'A';
    game.board.vertices[u].building = { type: 'settlement', owner: 'A', garrison: garr(aSoldiers) };
    game.board.vertices[w].building = { type: 'settlement', owner: 'B', garrison: garr(bSoldiers) };
    return { game, attackerVertex: u, targetVertex: w };
  }

  it('trains a soldier for 1 wheat + 1 ore (gated by army cap)', () => {
    const game = startedGame();
    const a = game.players[0];
    const myBuilding = Object.values(game.board.vertices).find((v) => v.building?.owner === 'A')!;
    a.resources = { brick: 0, wood: 0, sheep: 0, wheat: 1, ore: 1 };
    const res = applyAction(game, 'A', { type: 'trainSoldier', vertexId: myBuilding.id });
    expect(res.ok).toBe(true);
    expect(myBuilding.building!.garrison!.length).toBe(1);
    expect(a.resources.wheat).toBe(0);
    expect(a.resources.ore).toBe(0);
  });

  it('only lets you attack a road-adjacent enemy building', () => {
    const { game, targetVertex } = warScenario(2, 0);
    expect(applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex }).ok).toBe(true);
    expect(game.pendingWar).not.toBeNull();
    expect(game.pendingWar!.attackerArmy).toBe(2);
  });

  it('attacker wins a battle and captures the building', () => {
    const { game, targetVertex } = warScenario(3, 0);
    applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex });
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // both roll 1
    const res = applyAction(game, 'B', { type: 'respondToWar', response: 'fight' });
    spy.mockRestore();
    expect(res.ok).toBe(true);
    expect(game.board.vertices[targetVertex].building!.owner).toBe('A'); // captured
    expect(game.pendingWar).toBeNull();
  });

  it('defender repels a weak attacker', () => {
    const { game, targetVertex } = warScenario(1, 9); // huge defender garrison
    applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex });
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    applyAction(game, 'B', { type: 'respondToWar', response: 'fight' });
    spy.mockRestore();
    expect(game.board.vertices[targetVertex].building!.owner).toBe('B'); // held
  });

  it('retreat hands over the building without a fight', () => {
    const { game, targetVertex } = warScenario(2, 1);
    applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex });
    const res = applyAction(game, 'B', { type: 'respondToWar', response: 'retreat' });
    expect(res.ok).toBe(true);
    expect(game.board.vertices[targetVertex].building!.owner).toBe('A');
    expect(game.pendingWar).toBeNull();
  });

  it('cannot end the turn while a war is pending', () => {
    const { game, targetVertex } = warScenario(2, 0);
    applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex });
    expect(applyAction(game, 'A', { type: 'endTurn' }).ok).toBe(false);
  });

  it('moves a partial garrison between connected buildings', () => {
    const game = startedGame();
    const edge = Object.values(game.board.edges)[0];
    const [u, w] = edge.vertexIds;
    game.board.edges[edge.id].road = 'A';
    game.board.vertices[u].building = { type: 'settlement', owner: 'A', garrison: garr(3) };
    game.board.vertices[w].building = { type: 'settlement', owner: 'A', garrison: garr(0) };
    const res = applyAction(game, 'A', { type: 'moveSoldiers', fromVertexId: u, toVertexId: w, count: 2 });
    expect(res.ok).toBe(true);
    expect(game.board.vertices[u].building!.garrison!.length).toBe(1);
    expect(game.board.vertices[w].building!.garrison!.length).toBe(2);
  });

  it('peace: defender offers tribute, attacker accepts, war ends', () => {
    const { game, targetVertex } = warScenario(3, 1);
    const b = game.players.find((p) => p.id === 'B')!;
    b.resources = { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 0 };
    const a = game.players.find((p) => p.id === 'A')!;
    const aWheat0 = a.resources.wheat;
    applyAction(game, 'A', { type: 'declareWar', targetVertexId: targetVertex });
    const tribute = { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 0 };
    expect(applyAction(game, 'B', { type: 'respondToWar', response: 'peace', tribute }).ok).toBe(true);
    expect(game.pendingWar!.awaiting).toBe('attacker');
    expect(applyAction(game, 'A', { type: 'respondToPeace', accept: true }).ok).toBe(true);
    expect(game.pendingWar).toBeNull();
    expect(game.board.vertices[targetVertex].building!.owner).toBe('B'); // defender kept it
    expect(b.resources.wheat).toBe(0);
    expect(a.resources.wheat).toBe(aWheat0 + 2);
  });

  it('upgrading a settlement to a city keeps its garrison and name', () => {
    const game = startedGame();
    const mine = Object.values(game.board.vertices).find((v) => v.building?.owner === 'A' && v.building.type === 'settlement')!;
    mine.building!.garrison = garr(2);
    mine.building!.name = 'Fort Greg';
    const a = game.players.find((p) => p.id === 'A')!;
    a.resources = { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 3 };
    const res = applyAction(game, 'A', { type: 'buildCity', vertexId: mine.id });
    expect(res.ok).toBe(true);
    expect(mine.building!.type).toBe('city');
    expect(mine.building!.garrison!.length).toBe(2);
    expect(mine.building!.name).toBe('Fort Greg');
  });

  it('captured pieces do not count toward your placed-piece pool', () => {
    const game = startedGame();
    const v = Object.values(game.board.vertices).find((x) => !x.building)!;
    // A captured B's settlement: A owns it, but B originally placed it.
    game.board.vertices[v.id].building = { type: 'settlement', owner: 'A', placedBy: 'B' };
    const aPlaced = countPlaced(game.board, 'A').settlements;
    const aOwned = countBuildings(game.board, 'A').settlements;
    expect(aOwned).toBeGreaterThan(aPlaced); // owns more than it placed (the captured one)
  });

  it('a player can decline a trade offer', () => {
    const game = startedGame();
    game.players[0].resources = { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 };
    applyAction(game, 'A', {
      type: 'proposeTrade',
      give: { brick: 0, wood: 1, sheep: 0, wheat: 0, ore: 0 },
      receive: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 1 },
    });
    const tradeId = game.pendingTrade!.id;
    expect(applyAction(game, 'B', { type: 'declineTrade', tradeId }).ok).toBe(true);
    expect(game.pendingTrade!.declinedBy).toContain('B');
  });

  it('rename a soldier and name a building', () => {
    const game = startedGame();
    const mine = Object.values(game.board.vertices).find((v) => v.building?.owner === 'A')!;
    mine.building!.garrison = garr(1);
    const sid = mine.building!.garrison![0].id;
    expect(applyAction(game, 'A', { type: 'renameSoldier', vertexId: mine.id, soldierId: sid, name: 'Sir Bonk' }).ok).toBe(true);
    expect(mine.building!.garrison![0].name).toBe('Sir Bonk');
    expect(applyAction(game, 'A', { type: 'nameBuilding', vertexId: mine.id, name: 'Fort Kickass' }).ok).toBe(true);
    expect(mine.building!.name).toBe('Fort Kickass');
  });
});

describe('turn timeout', () => {
  it('auto-ends the active turn (main phase)', () => {
    const game = startedGame(); // A's main phase, already rolled
    const res = forceTurnTimeout(game);
    expect(res.ok).toBe(true);
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.phase).toBe('rollDice');
  });

  it('auto-rolls and passes the turn when timing out before rolling', () => {
    const game = startedGame();
    game.phase = 'rollDice';
    game.hasRolledThisTurn = false;
    forceTurnTimeout(game);
    // The turn resolves and moves on to the next player.
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.phase).toBe('rollDice');
  });
});

describe('target points to win', () => {
  it('only the host can set the target, within range', () => {
    const host = createPlayer('A', 'Alice', true, 0);
    const game = createInitialGame('TEST', host);
    game.players.push(createPlayer('B', 'Bob', false, 1));
    expect(applyAction(game, 'B', { type: 'setTargetPoints', points: 5 }).ok).toBe(false); // not host
    expect(applyAction(game, 'A', { type: 'setTargetPoints', points: 2 }).ok).toBe(false); // out of range
    expect(applyAction(game, 'A', { type: 'setTargetPoints', points: 5 }).ok).toBe(true);
    expect(game.targetPoints).toBe(5);
  });

  it('win respects the chosen target', () => {
    const game = startedGame(); // post-setup: each player has 2 settlements (2 VP)
    game.targetPoints = 3;
    // Upgrade one of A's settlements to a city -> 1 settlement + 1 city = 3 VP.
    const aVertex = Object.values(game.board.vertices).find(
      (v) => v.building?.owner === 'A' && v.building.type === 'settlement'
    )!;
    game.board.vertices[aVertex.id].building = { type: 'city', owner: 'A' };
    applyAction(game, 'A', { type: 'endTurn' }); // triggers score recompute + win check
    expect(game.winnerId).toBe('A');
    expect(game.phase).toBe('ended');
  });
});

describe('robber discard', () => {
  it('forces discarding half and rejects the wrong count', () => {
    const game = startedGame();
    const a = game.players[0];
    a.resources = { brick: 2, wood: 2, sheep: 2, wheat: 2, ore: 0 }; // 8 cards
    game.phase = 'discard';
    game.mustDiscard = ['A'];
    // Must discard floor(8/2)=4.
    expect(
      applyAction(game, 'A', { type: 'discard', resources: { brick: 1, wood: 1, sheep: 0, wheat: 0, ore: 0 } }).ok
    ).toBe(false); // only 2
    const ok = applyAction(game, 'A', {
      type: 'discard',
      resources: { brick: 2, wood: 2, sheep: 0, wheat: 0, ore: 0 },
    });
    expect(ok.ok).toBe(true);
    expect(game.phase).toBe('moveRobber');
  });
});
