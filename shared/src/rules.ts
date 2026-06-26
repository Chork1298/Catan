// Pure game-rules helpers: resource math, build-cost/affordability checks,
// placement legality, and dice resource distribution. No mutation of game state
// happens here — the server engine calls these and applies the results.

import type { Board, GameState, Player, ResourceBag, ResourceType } from './types.js';
import { ARMY_CAP_BASE, ARMY_PER_CITY, ARMY_PER_SETTLEMENT, COSTS, LONGEST_ROAD_MIN } from './constants.js';

// ----- Resource bag math -----

export function canAfford(have: ResourceBag, cost: ResourceBag): boolean {
  return (Object.keys(cost) as ResourceType[]).every((r) => have[r] >= cost[r]);
}

export function subtractBag(a: ResourceBag, b: ResourceBag): ResourceBag {
  const out = { ...a };
  for (const r of Object.keys(b) as ResourceType[]) out[r] -= b[r];
  return out;
}

export function addBag(a: ResourceBag, b: ResourceBag): ResourceBag {
  const out = { ...a };
  for (const r of Object.keys(b) as ResourceType[]) out[r] += b[r];
  return out;
}

export function bagTotal(bag: ResourceBag): number {
  return Object.values(bag).reduce((sum, n) => sum + n, 0);
}

export { COSTS };

// ----- Placement legality -----

/** Distance rule: a settlement may not sit on a vertex adjacent to any building. */
export function violatesDistanceRule(board: Board, vertexId: string): boolean {
  const v = board.vertices[vertexId];
  if (v.building) return true;
  return v.vertexIds.some((nId) => board.vertices[nId].building !== null);
}

/** Is a vertex connected to the given player's road network? (Required off-setup.) */
export function vertexConnectedToPlayer(board: Board, vertexId: string, playerId: string): boolean {
  const v = board.vertices[vertexId];
  return v.edgeIds.some((eId) => board.edges[eId].road === playerId);
}

/**
 * Can this player legally build a road on this edge?
 * Connected if an endpoint holds their building, or one of their roads meets the
 * endpoint — but an OPPONENT's building on that endpoint blocks continuation
 * through it (you can't build a road past someone else's settlement/city).
 */
export function canBuildRoadAt(board: Board, edgeId: string, playerId: string): boolean {
  const edge = board.edges[edgeId];
  if (!edge || edge.road) return false;
  return edge.vertexIds.some((vId) => {
    const v = board.vertices[vId];
    // An opponent's building on this corner blocks connecting through it.
    if (v.building && v.building.owner !== playerId) return false;
    // Your own building here always connects.
    if (v.building?.owner === playerId) return true;
    // Otherwise an empty corner connects if one of your roads meets it.
    return v.edgeIds.some((eId) => eId !== edgeId && board.edges[eId].road === playerId);
  });
}

/** Can this player build a settlement here during the main game? */
export function canBuildSettlementAt(board: Board, vertexId: string, playerId: string): boolean {
  const v = board.vertices[vertexId];
  if (!v || v.building) return false;
  if (violatesDistanceRule(board, vertexId)) return false;
  return vertexConnectedToPlayer(board, vertexId, playerId);
}

/** Can this player upgrade to a city here? (Must own a settlement on the vertex.) */
export function canBuildCityAt(board: Board, vertexId: string, playerId: string): boolean {
  const v = board.vertices[vertexId];
  return !!v && v.building?.type === 'settlement' && v.building.owner === playerId;
}

/** Setup settlement: empty + distance rule, no connectivity requirement. */
export function canPlaceSetupSettlement(board: Board, vertexId: string): boolean {
  const v = board.vertices[vertexId];
  return !!v && !v.building && !violatesDistanceRule(board, vertexId);
}

/** Setup road: empty + must touch the just-placed settlement vertex. */
export function canPlaceSetupRoad(board: Board, edgeId: string, fromVertexId: string): boolean {
  const edge = board.edges[edgeId];
  return !!edge && !edge.road && edge.vertexIds.includes(fromVertexId);
}

// ----- Piece counting (for limits and scoring) -----

export function countBuildings(board: Board, playerId: string): { settlements: number; cities: number } {
  let settlements = 0;
  let cities = 0;
  for (const v of Object.values(board.vertices)) {
    if (v.building?.owner !== playerId) continue;
    if (v.building.type === 'settlement') settlements++;
    else cities++;
  }
  return { settlements, cities };
}

export function countRoads(board: Board, playerId: string): number {
  let n = 0;
  for (const e of Object.values(board.edges)) if (e.road === playerId) n++;
  return n;
}

/**
 * Count the pieces from a player's fixed pool that are currently "spent": ones
 * they PLACED and STILL OWN. Pieces captured *from* them free their pool (lost),
 * and pieces they captured don't count (not from their pool). Drives piece limits
 * and the Inventory panel.
 */
export function countPlaced(board: Board, playerId: string): { settlements: number; cities: number; roads: number } {
  let settlements = 0;
  let cities = 0;
  let roads = 0;
  for (const v of Object.values(board.vertices)) {
    const b = v.building;
    if (b && b.owner === playerId && (b.placedBy === undefined || b.placedBy === playerId)) {
      if (b.type === 'settlement') settlements++;
      else cities++;
    }
  }
  for (const e of Object.values(board.edges)) {
    if (e.road === playerId && (e.placedBy === undefined || e.placedBy === playerId)) roads++;
  }
  return { settlements, cities, roads };
}

// ----- Trading -----

/** Best bank/port exchange rate for giving away a resource (4:1, 3:1, or 2:1). */
export function bankTradeRate(board: Board, playerId: string, give: ResourceType): number {
  let rate = 4;
  for (const port of Object.values(board.ports)) {
    const touches = port.vertexIds.some((vId) => board.vertices[vId].building?.owner === playerId);
    if (!touches) continue;
    if (port.type === 'generic') rate = Math.min(rate, 3);
    else if (port.type === give) rate = Math.min(rate, 2);
  }
  return rate;
}

// ----- Longest road -----

/**
 * Length of a player's longest continuous road (a trail of non-repeating edges).
 * An opponent's building breaks the road at that vertex — you can't chain two
 * roads *through* it, though a road may still end there.
 */
export function computeLongestRoad(board: Board, playerId: string): number {
  const playerEdges = Object.values(board.edges).filter((e) => e.road === playerId);
  if (playerEdges.length === 0) return 0;

  const edgeById = new Map(playerEdges.map((e) => [e.id, e]));
  const incident = new Map<string, string[]>(); // vertexId -> player's edge ids
  for (const e of playerEdges) {
    for (const v of e.vertexIds) {
      if (!incident.has(v)) incident.set(v, []);
      incident.get(v)!.push(e.id);
    }
  }

  const blocked = (vId: string) => {
    const b = board.vertices[vId].building;
    return b != null && b.owner !== playerId;
  };

  let best = 0;
  const used = new Set<string>();
  function dfs(vId: string, len: number, isStart: boolean) {
    if (len > best) best = len;
    // Can't pass *through* an opponent-occupied intermediate vertex.
    if (!isStart && blocked(vId)) return;
    for (const eId of incident.get(vId) ?? []) {
      if (used.has(eId)) continue;
      const e = edgeById.get(eId)!;
      const next = e.vertexIds[0] === vId ? e.vertexIds[1] : e.vertexIds[0];
      used.add(eId);
      dfs(next, len + 1, false);
      used.delete(eId);
    }
  }
  for (const startV of incident.keys()) dfs(startV, 0, true);
  return best;
}

/** Players adjacent to a tile (own a building on one of its corners). */
export function playersOnTile(board: Board, tileId: string): Set<string> {
  const owners = new Set<string>();
  for (const vId of board.tiles[tileId].vertexIds) {
    const b = board.vertices[vId].building;
    if (b) owners.add(b.owner);
  }
  return owners;
}

// ----- War: garrisons & connectivity (supply network) -----

/** Soldiers garrisoned at a building (0 if none/empty). */
export function garrisonAt(board: Board, vertexId: string): number {
  return board.vertices[vertexId]?.building?.garrison?.length ?? 0;
}

/** Total soldiers a player has across all their buildings. */
export function totalArmy(board: Board, playerId: string): number {
  let n = 0;
  for (const v of Object.values(board.vertices)) {
    if (v.building?.owner === playerId) n += v.building.garrison?.length ?? 0;
  }
  return n;
}

/** Max army a player may field, gated by their economy. */
export function armyCap(board: Board, playerId: string): number {
  const b = countBuildings(board, playerId);
  return ARMY_CAP_BASE + b.settlements * ARMY_PER_SETTLEMENT + b.cities * ARMY_PER_CITY;
}

/**
 * All vertices reachable from `start` through a player's own roads. An enemy
 * building severs the network at its vertex (you can reach it but not pass
 * through it) — the same rule that breaks Longest Road.
 */
export function reachableVertices(board: Board, playerId: string, start: string): Set<string> {
  const visited = new Set<string>([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    // Can't push supply *through* an enemy-held corner (start is exempt).
    if (u !== start) {
      const b = board.vertices[u].building;
      if (b && b.owner !== playerId) continue;
    }
    for (const eId of board.vertices[u].edgeIds) {
      const e = board.edges[eId];
      if (e.road !== playerId) continue;
      const w = e.vertexIds[0] === u ? e.vertexIds[1] : e.vertexIds[0];
      if (!visited.has(w)) {
        visited.add(w);
        stack.push(w);
      }
    }
  }
  return visited;
}

/** Soldiers a player can rally to a vertex via their connected road network. */
export function ralliedArmy(board: Board, playerId: string, start: string): number {
  let n = 0;
  for (const v of reachableVertices(board, playerId, start)) {
    const b = board.vertices[v].building;
    if (b?.owner === playerId) n += b.garrison?.length ?? 0;
  }
  return n;
}

/** Nearest building owned by `ownerId`, reached from `start` via their roads (BFS). */
export function nearestOwnedBuilding(board: Board, ownerId: string, start: string): string | null {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const u = queue.shift()!;
    const b = board.vertices[u].building;
    if (b?.owner === ownerId) return u; // BFS → nearest
    if (u !== start && b && b.owner !== ownerId) continue; // don't path through enemy holdings
    for (const eId of board.vertices[u].edgeIds) {
      const e = board.edges[eId];
      if (e.road !== ownerId) continue;
      const w = e.vertexIds[0] === u ? e.vertexIds[1] : e.vertexIds[0];
      if (!visited.has(w)) { visited.add(w); queue.push(w); }
    }
  }
  return null;
}

/**
 * Enemy buildings this player can attack, mapped to the staging building the
 * assault launches from. A "contact" is any vertex where the attacker has a road
 * AND an enemy has a road or building; the target is the enemy building nearest
 * that contact, the staging is the attacker building nearest it.
 */
export function attackTargets(board: Board, attackerId: string): Map<string, string> {
  const targets = new Map<string, string>(); // targetVertexId -> stagingVertexId
  for (const e of Object.values(board.edges)) {
    if (e.road !== attackerId) continue;
    for (const c of e.vertexIds) {
      const enemies = new Set<string>();
      const cb = board.vertices[c].building;
      if (cb && cb.owner !== attackerId) enemies.add(cb.owner);
      for (const eId of board.vertices[c].edgeIds) {
        const ce = board.edges[eId];
        if (ce.road && ce.road !== attackerId) enemies.add(ce.road);
      }
      if (enemies.size === 0) continue;
      const staging = nearestOwnedBuilding(board, attackerId, c);
      if (!staging) continue;
      for (const enemy of enemies) {
        const target = nearestOwnedBuilding(board, enemy, c);
        if (!target) continue;
        const prev = targets.get(target);
        if (!prev || garrisonAt(board, staging) > garrisonAt(board, prev)) targets.set(target, staging);
      }
    }
  }
  return targets;
}

/** Can this player declare war on the building at this vertex? */
export function canDeclareWarOn(board: Board, attackerId: string, targetVertexId: string): boolean {
  return attackTargets(board, attackerId).has(targetVertexId);
}

/** Are two of a player's buildings in the same connected cluster (for transport)? */
export function sameCluster(board: Board, playerId: string, a: string, b: string): boolean {
  return reachableVertices(board, playerId, a).has(b);
}

/**
 * Roads a player may claim after a conquest. Claiming spreads outward from each
 * building they captured, along that defeated nation's roads — but is BLOCKED by
 * any building the captor doesn't own (the loser's other settlements). To claim
 * roads beyond one, you must capture that settlement too.
 */
export function claimableRoads(board: Board, attackerId: string): Set<string> {
  const claimable = new Set<string>();
  for (const start of Object.values(board.vertices)) {
    const b = start.building;
    // A building captured from someone (you own it, but they placed it).
    if (!b || b.owner !== attackerId || !b.placedBy || b.placedBy === attackerId) continue;
    const enemy = b.placedBy;
    const visited = new Set<string>([start.id]);
    const stack = [start.id];
    while (stack.length) {
      const u = stack.pop()!;
      // Can't push past a vertex held by anyone other than the captor.
      if (u !== start.id) {
        const ub = board.vertices[u].building;
        if (ub && ub.owner !== attackerId) continue;
      }
      for (const eId of board.vertices[u].edgeIds) {
        const e = board.edges[eId];
        if (e.road !== enemy) continue; // only that nation's roads
        claimable.add(eId);
        const w = e.vertexIds[0] === u ? e.vertexIds[1] : e.vertexIds[0];
        if (!visited.has(w)) { visited.add(w); stack.push(w); }
      }
    }
  }
  return claimable;
}

/** Total points used for the win check (public points + hidden VP dev cards). */
export function totalVictoryPoints(player: Player): number {
  const vpCards = player.devCards.filter((c) => c.type === 'victoryPoint').length;
  return player.publicVictoryPoints + vpCards;
}

export { LONGEST_ROAD_MIN };

// ----- Dice resource distribution -----

/**
 * Compute resources produced by a dice roll, applying the official bank-shortage
 * rule: if the bank can't satisfy total demand for a resource and more than one
 * player is owed it, nobody receives that resource.
 *
 * Returns the gains per player; the caller deducts from the bank.
 */
export function distributeForRoll(
  game: GameState,
  total: number
): { gains: Record<string, ResourceBag>; bankSpend: ResourceBag } {
  const board = game.board;
  const gains: Record<string, ResourceBag> = {};
  for (const p of game.players) {
    gains[p.id] = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  }

  // Demand per resource, and which players are owed it.
  const demand: Record<ResourceType, number> = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  const claimants: Record<ResourceType, Set<string>> = {
    brick: new Set(), wood: new Set(), sheep: new Set(), wheat: new Set(), ore: new Set(),
  };

  for (const tile of Object.values(board.tiles)) {
    if (tile.resource === 'desert' || tile.numberToken !== total) continue;
    if (board.robberTileId === tile.id) continue; // robber blocks production
    const res = tile.resource as ResourceType;
    for (const vId of tile.vertexIds) {
      const b = board.vertices[vId].building;
      if (!b) continue;
      const amount = b.type === 'city' ? 2 : 1;
      gains[b.owner][res] += amount;
      demand[res] += amount;
      claimants[res].add(b.owner);
    }
  }

  // Apply bank-shortage rule.
  const bankSpend: ResourceBag = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  for (const res of Object.keys(demand) as ResourceType[]) {
    const available = game.bank[res];
    if (demand[res] <= available) {
      bankSpend[res] = demand[res];
      continue;
    }
    if (claimants[res].size === 1) {
      // Single claimant gets whatever is left.
      const [only] = [...claimants[res]];
      const owed = gains[only][res];
      const give = Math.min(owed, available);
      gains[only][res] = give;
      bankSpend[res] = give;
    } else {
      // Multiple claimants, not enough: nobody gets this resource.
      for (const p of game.players) gains[p.id][res] = 0;
      bankSpend[res] = 0;
    }
  }

  return { gains, bankSpend };
}
