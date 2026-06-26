import { describe, it, expect } from 'vitest';
import { generateBoard } from './board.js';
import {
  bankTradeRate,
  canAfford,
  canBuildRoadAt,
  canDeclareWarOn,
  canPlaceSetupSettlement,
  computeLongestRoad,
  distributeForRoll,
  ralliedArmy,
  violatesDistanceRule,
} from './rules.js';
import { COSTS } from './constants.js';
import { emptyBag, PLAYER_COLORS, type GameState, type Player, type ResourceBag } from './types.js';

function makePlayer(id: string): Player {
  return {
    id, name: id, color: PLAYER_COLORS[0], connected: true, isHost: false,
    resources: emptyBag(), devCards: [], playedKnights: 0, publicVictoryPoints: 0,
  };
}

function makeGame(): GameState {
  return {
    roomCode: 'TEST', phase: 'main', players: [makePlayer('A'), makePlayer('B')],
    board: generateBoard({ seed: 99 }),
    bank: { brick: 19, wood: 19, sheep: 19, wheat: 19, ore: 19 },
    devDeck: [], currentPlayerIndex: 0, turnNumber: 1, lastRoll: null,
    hasRolledThisTurn: true, hasPlayedDevCardThisTurn: false, setupQueueIndex: 0,
    setupStep: 'settlement', lastSetupVertex: null, pendingTrade: null, pendingWar: null, mustDiscard: [],
    longestRoadOwner: null, largestArmyOwner: null, winnerId: null, targetPoints: 10, turnEndsAt: null, mapRadius: 2,
  };
}

describe('canAfford', () => {
  it('compares a hand against a cost', () => {
    const hand: ResourceBag = { brick: 1, wood: 1, sheep: 1, wheat: 1, ore: 0 };
    expect(canAfford(hand, COSTS.settlement)).toBe(true);
    expect(canAfford(hand, COSTS.city)).toBe(false);
  });
});

describe('distributeForRoll', () => {
  it('pays the owner of a building on a matching tile', () => {
    const game = makeGame();
    // Find a numbered (non-desert, non-robber) tile and put a settlement on it.
    const tile = Object.values(game.board.tiles).find(
      (t) => t.numberToken !== undefined && t.id !== game.board.robberTileId
    )!;
    const vId = tile.vertexIds[0];
    game.board.vertices[vId].building = { type: 'settlement', owner: 'A' };

    const { gains } = distributeForRoll(game, tile.numberToken!);
    expect(gains['A'][tile.resource as 'brick']).toBeGreaterThanOrEqual(1);
    expect(gains['B'][tile.resource as 'brick']).toBe(0);
  });

  it('pays double for a city', () => {
    const game = makeGame();
    const tile = Object.values(game.board.tiles).find(
      (t) => t.numberToken !== undefined && t.id !== game.board.robberTileId
    )!;
    const res = tile.resource as 'wood';
    game.board.vertices[tile.vertexIds[0]].building = { type: 'city', owner: 'A' };
    const { gains } = distributeForRoll(game, tile.numberToken!);
    expect(gains['A'][res]).toBe(2);
  });

  it('produces nothing from the robber-blocked tile', () => {
    const game = makeGame();
    const tile = Object.values(game.board.tiles).find((t) => t.numberToken !== undefined)!;
    game.board.robberTileId = tile.id;
    game.board.vertices[tile.vertexIds[0]].building = { type: 'settlement', owner: 'A' };
    const { gains } = distributeForRoll(game, tile.numberToken!);
    expect(Object.values(gains['A']).every((n) => n === 0)).toBe(true);
  });

  it('gives nobody a resource when the bank is short and 2+ players are owed it', () => {
    const game = makeGame();
    const tile = Object.values(game.board.tiles).find(
      (t) => t.numberToken !== undefined && t.id !== game.board.robberTileId
    )!;
    const res = tile.resource as 'wheat';
    // Two players each own a building on the tile (different corners).
    game.board.vertices[tile.vertexIds[0]].building = { type: 'settlement', owner: 'A' };
    game.board.vertices[tile.vertexIds[2]].building = { type: 'settlement', owner: 'B' };
    game.bank[res] = 1; // not enough for both
    const { gains } = distributeForRoll(game, tile.numberToken!);
    expect(gains['A'][res]).toBe(0);
    expect(gains['B'][res]).toBe(0);
  });
});

describe('placement rules', () => {
  it('enforces the distance rule', () => {
    const board = generateBoard({ seed: 5 });
    const v = Object.values(board.vertices)[0];
    expect(canPlaceSetupSettlement(board, v.id)).toBe(true);
    board.vertices[v.id].building = { type: 'settlement', owner: 'A' };
    // A neighbour of an occupied vertex is now illegal.
    const neighbour = v.vertexIds[0];
    expect(violatesDistanceRule(board, neighbour)).toBe(true);
    expect(canPlaceSetupSettlement(board, neighbour)).toBe(false);
  });

  it('requires roads to connect to your network', () => {
    const board = generateBoard({ seed: 5 });
    const edge = Object.values(board.edges)[0];
    expect(canBuildRoadAt(board, edge.id, 'A')).toBe(false); // nothing of A's nearby
    // Give A a building on one endpoint -> now legal.
    board.vertices[edge.vertexIds[0]].building = { type: 'settlement', owner: 'A' };
    expect(canBuildRoadAt(board, edge.id, 'A')).toBe(true);
  });

  it("cannot build a road through an opponent's settlement", () => {
    const board = generateBoard({ seed: 5 });
    // Find a vertex with two distinct edges; use it as the shared corner.
    const corner = Object.values(board.vertices).find((v) => v.edgeIds.length >= 2)!;
    const [e1, e2] = corner.edgeIds;
    board.edges[e1].road = 'A'; // A's road meets the corner via e1
    expect(canBuildRoadAt(board, e2, 'A')).toBe(true); // normally A could continue onto e2

    board.vertices[corner.id].building = { type: 'settlement', owner: 'B' }; // opponent blocks the corner
    expect(canBuildRoadAt(board, e2, 'A')).toBe(false); // now blocked through it
  });
});

describe('computeLongestRoad', () => {
  it('measures a connected trail of roads', () => {
    const board = generateBoard({ seed: 11 });
    // Greedy walk: lay 5 connected roads for player A.
    let v = Object.values(board.vertices)[0].id;
    const usedEdges = new Set<string>();
    let placed = 0;
    while (placed < 5) {
      const next = board.vertices[v].edgeIds.find((eId) => !usedEdges.has(eId));
      if (!next) break;
      board.edges[next].road = 'A';
      usedEdges.add(next);
      const e = board.edges[next];
      v = e.vertexIds[0] === v ? e.vertexIds[1] : e.vertexIds[0];
      placed++;
    }
    expect(computeLongestRoad(board, 'A')).toBe(5);
    expect(computeLongestRoad(board, 'B')).toBe(0);
  });
});

const garr = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: 'X' }));

describe('war connectivity', () => {
  it('rallies soldiers across a connected road network but not across a gap', () => {
    const board = generateBoard({ seed: 8 });
    // Build a 3-vertex chain for A: vA -road- vB -road- vC, garrison each.
    let vA = Object.values(board.vertices).find((v) => v.edgeIds.length >= 2)!.id;
    const usedEdges = new Set<string>();
    const chain = [vA];
    for (let step = 0; step < 2; step++) {
      const next = board.vertices[vA].edgeIds.find((eId) => !usedEdges.has(eId));
      if (!next) break;
      board.edges[next].road = 'A';
      usedEdges.add(next);
      const e = board.edges[next];
      vA = e.vertexIds[0] === vA ? e.vertexIds[1] : e.vertexIds[0];
      chain.push(vA);
    }
    for (const v of chain) board.vertices[v].building = { type: 'settlement', owner: 'A', garrison: garr(2) };

    // From one end, A rallies all 3 garrisons (connected).
    expect(ralliedArmy(board, 'A', chain[0])).toBe(6);

    // An enemy building in the middle severs the network.
    board.vertices[chain[1]].building = { type: 'settlement', owner: 'B', garrison: garr(0) };
    expect(ralliedArmy(board, 'A', chain[0])).toBe(2); // only the start end remains
  });

  it('allows declaring war only on a road-adjacent enemy building', () => {
    const board = generateBoard({ seed: 8 });
    const edge = Object.values(board.edges)[0];
    const [u, w] = edge.vertexIds;
    board.edges[edge.id].road = 'A';
    board.vertices[w].building = { type: 'settlement', owner: 'B', garrison: garr(1) };
    expect(canDeclareWarOn(board, 'A', w)).toBe(true); // A's road reaches B's settlement
    expect(canDeclareWarOn(board, 'A', u)).toBe(false); // empty vertex, no enemy building
    board.vertices[u].building = { type: 'settlement', owner: 'A' };
    expect(canDeclareWarOn(board, 'A', u)).toBe(false); // can't attack your own
  });
});

describe('bankTradeRate', () => {
  it('is 4:1 by default, better with a matching port', () => {
    const board = generateBoard({ seed: 3 });
    const anyPlayer = 'A';
    // No buildings yet -> 4:1 for everything.
    expect(bankTradeRate(board, anyPlayer, 'wood')).toBe(4);

    const generic = Object.values(board.ports).find((p) => p.type === 'generic')!;
    board.vertices[generic.vertexIds[0]].building = { type: 'settlement', owner: anyPlayer };
    expect(bankTradeRate(board, anyPlayer, 'wood')).toBe(3); // generic 3:1

    const orePort = Object.values(board.ports).find((p) => p.type === 'ore')!;
    board.vertices[orePort.vertexIds[0]].building = { type: 'settlement', owner: anyPlayer };
    expect(bankTradeRate(board, anyPlayer, 'ore')).toBe(2); // 2:1 on ore
  });
});
