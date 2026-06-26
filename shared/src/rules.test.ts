import { describe, it, expect } from 'vitest';
import { generateBoard } from './board.js';
import {
  bankTradeRate,
  canAfford,
  canBuildRoadAt,
  canPlaceSetupSettlement,
  computeLongestRoad,
  distributeForRoll,
  violatesDistanceRule,
} from './rules.js';
import { COSTS } from './constants.js';
import { emptyBag, type GameState, type Player, type ResourceBag } from './types.js';

function makePlayer(id: string): Player {
  return {
    id, name: id, color: 'red', connected: true, isHost: false,
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
    setupStep: 'settlement', lastSetupVertex: null, pendingTrade: null, mustDiscard: [],
    longestRoadOwner: null, largestArmyOwner: null, winnerId: null,
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
