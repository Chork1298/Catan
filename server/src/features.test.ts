import { describe, it, expect } from 'vitest';
import {
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
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
