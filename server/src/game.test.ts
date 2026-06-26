import { describe, it, expect, vi } from 'vitest';
import {
  canBuildRoadAt,
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  countBuildings,
  countRoads,
  type GameState,
} from '@catan/shared';
import { applyAction, createInitialGame, createPlayer } from './game.js';

function newTwoPlayerGame(): GameState {
  const host = createPlayer('A', 'Alice', true, 0);
  const game = createInitialGame('TEST', host);
  game.players.push(createPlayer('B', 'Bob', false, 1));
  return game;
}

/** Drive the snake-draft setup to completion by picking legal spots. */
function autoSetup(game: GameState): void {
  let guard = 0;
  while (game.phase === 'setupRound1' || game.phase === 'setupRound2') {
    if (guard++ > 100) throw new Error('setup did not converge');
    const pid = game.players[game.currentPlayerIndex].id;
    if (game.setupStep === 'settlement') {
      const v = Object.values(game.board.vertices).find((x) => canPlaceSetupSettlement(game.board, x.id))!;
      const res = applyAction(game, pid, { type: 'placeSetupSettlement', vertexId: v.id });
      expect(res.ok).toBe(true);
    } else {
      const e = Object.values(game.board.edges).find(
        (x) => canPlaceSetupRoad(game.board, x.id, game.lastSetupVertex!)
      )!;
      const res = applyAction(game, pid, { type: 'placeSetupRoad', edgeId: e.id });
      expect(res.ok).toBe(true);
    }
  }
}

describe('full game engine flow', () => {
  it('starts only via the host, with >=2 players', () => {
    const game = newTwoPlayerGame();
    expect(applyAction(game, 'B', { type: 'startGame' }).ok).toBe(false); // not host
    expect(applyAction(game, 'A', { type: 'startGame' }).ok).toBe(true);
    expect(game.phase).toBe('setupRound1');
  });

  it('randomizes who plays first (not always the host)', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const host = createPlayer('A', 'Alice', true, 0);
      const game = createInitialGame('T', host);
      game.players.push(createPlayer('B', 'Bob', false, 1));
      game.players.push(createPlayer('C', 'Cara', false, 2));
      game.players.push(createPlayer('D', 'Dan', false, 3));
      applyAction(game, 'A', { type: 'startGame' });
      firsts.add(game.players[0].id);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('runs the snake-draft setup giving each player 2 settlements + 2 roads', () => {
    const game = newTwoPlayerGame();
    applyAction(game, 'A', { type: 'startGame' });
    autoSetup(game);

    expect(game.phase).toBe('rollDice');
    expect(game.currentPlayerIndex).toBe(0); // back to first player
    for (const p of game.players) {
      expect(countBuildings(game.board, p.id).settlements).toBe(2);
      expect(countRoads(game.board, p.id)).toBe(2);
      expect(p.publicVictoryPoints).toBe(2);
    }
  });

  it('grants starting resources from the second settlement', () => {
    const game = newTwoPlayerGame();
    applyAction(game, 'A', { type: 'startGame' });
    autoSetup(game);
    const totalResources = game.players.reduce(
      (sum, p) => sum + Object.values(p.resources).reduce((a, b) => a + b, 0),
      0
    );
    expect(totalResources).toBeGreaterThan(0);
  });

  it('rejects out-of-turn and pre-roll actions', () => {
    const game = newTwoPlayerGame();
    applyAction(game, 'A', { type: 'startGame' });
    autoSetup(game);
    const cur = game.players[game.currentPlayerIndex].id;
    const other = game.players.find((p) => p.id !== cur)!.id;
    expect(applyAction(game, other, { type: 'rollDice' }).ok).toBe(false); // not your turn
    expect(applyAction(game, cur, { type: 'endTurn' }).ok).toBe(false); // must roll first
  });

  it('rolls, then allows a legal road build', () => {
    const game = newTwoPlayerGame();
    applyAction(game, 'A', { type: 'startGame' });
    autoSetup(game);
    const cur = game.players[game.currentPlayerIndex].id;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // dice = 1+1 = 2 (never a 7)
    const roll = applyAction(game, cur, { type: 'rollDice' });
    spy.mockRestore();
    expect(roll.ok).toBe(true);
    expect(game.phase).toBe('main');

    // Hand the current player enough for a road and place it on a legal edge.
    const player = game.players[game.currentPlayerIndex];
    player.resources.brick += 1;
    player.resources.wood += 1;
    const edge = Object.values(game.board.edges).find((e) => canBuildRoadAt(game.board, e.id, cur))!;
    const build = applyAction(game, cur, { type: 'buildRoad', edgeId: edge.id });
    expect(build.ok).toBe(true);
    expect(game.board.edges[edge.id].road).toBe(cur);
  });

  it('advances turns with endTurn', () => {
    const game = newTwoPlayerGame();
    applyAction(game, 'A', { type: 'startGame' });
    autoSetup(game);
    const cur = game.players[game.currentPlayerIndex].id;
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // never a 7
    applyAction(game, cur, { type: 'rollDice' });
    spy.mockRestore();
    const end = applyAction(game, cur, { type: 'endTurn' });
    expect(end.ok).toBe(true);
    expect(game.currentPlayerIndex).toBe(1);
    expect(game.phase).toBe('rollDice');
    expect(game.hasRolledThisTurn).toBe(false);
  });
});
