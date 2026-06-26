import { describe, it, expect } from 'vitest';
import {
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  type GameState,
} from '@catan/shared';
import { applyAction, createInitialGame, createPlayer } from './game.js';

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
  // Put A into the main (post-roll) phase for build/trade tests.
  game.hasRolledThisTurn = true;
  game.phase = 'main';
  return game;
}

describe('bank trade', () => {
  it('exchanges at 4:1', () => {
    const game = startedGame();
    const a = game.players[0];
    a.resources = { brick: 0, wood: 4, sheep: 0, wheat: 0, ore: 0 };
    const res = applyAction(game, 'A', { type: 'bankTrade', give: 'wood', receive: 'ore' });
    expect(res.ok).toBe(true);
    expect(a.resources.wood).toBe(0);
    expect(a.resources.ore).toBe(1);
  });

  it('rejects when short of the rate', () => {
    const game = startedGame();
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

    // Bob cannot take Alice's color.
    expect(applyAction(game, 'B', { type: 'setColor', color: 'red' }).ok).toBe(false);
    // Bob can take a free color.
    expect(applyAction(game, 'B', { type: 'setColor', color: 'orange' }).ok).toBe(true);
    expect(game.players.find((p) => p.id === 'B')!.color).toBe('orange');
  });

  it('cannot change color once the game has started', () => {
    const host = createPlayer('A', 'Alice', true, 0);
    const game = createInitialGame('TEST', host);
    game.players.push(createPlayer('B', 'Bob', false, 1));
    applyAction(game, 'A', { type: 'startGame' });
    expect(applyAction(game, 'A', { type: 'setColor', color: 'white' }).ok).toBe(false);
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
