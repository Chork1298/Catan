import { useMemo, useState } from 'react';
import {
  canBuildCityAt,
  canBuildRoadAt,
  canBuildSettlementAt,
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  playersOnTile,
  RESOURCE_TYPES,
  type Action,
  type DevCardType,
  type PlayerView,
  type ResourceBag,
  type ResourceType,
} from '@catan/shared';
import { Board } from './Board.js';
import { ResourceHand } from './ResourceHand.js';
import { ResourceSelect } from './ResourceSelect.js';
import { TradePanel } from './TradePanel.js';
import { DevCardPanel } from './DevCardPanel.js';

export interface GameViewProps {
  view: PlayerView;
  logs: string[];
  onAction: (action: Action) => void;
  onLeave: () => void;
}

type BuildMode = 'road' | 'settlement' | 'city' | null;

function bagToList(bag: ResourceBag): ResourceType[] {
  const out: ResourceType[] = [];
  for (const r of RESOURCE_TYPES) for (let i = 0; i < bag[r]; i++) out.push(r);
  return out;
}

export function GameView({ view, logs, onAction, onLeave }: GameViewProps) {
  const { game, youId, opponentSecrets } = view;
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [devRoad, setDevRoad] = useState<string[] | null>(null); // road-building selection
  const [robberTile, setRobberTile] = useState<string | null>(null); // chosen, picking victim
  const [modal, setModal] = useState<'yearOfPlenty' | 'monopoly' | null>(null);

  const me = game.players.find((p) => p.id === youId)!;
  const current = game.players[game.currentPlayerIndex];
  const isMyTurn = current?.id === youId;
  const playerColors = Object.fromEntries(game.players.map((p) => [p.id, p.color]));
  const inSetup = game.phase === 'setupRound1' || game.phase === 'setupRound2';
  const mustDiscard = game.mustDiscard.includes(youId);
  const inRobber = game.phase === 'moveRobber' && isMyTurn;

  // Effective placement mode for vertex/edge highlighting.
  const mode: 'setup-settlement' | 'setup-road' | 'devroad' | BuildMode = inSetup
    ? game.setupStep === 'settlement' ? 'setup-settlement' : 'setup-road'
    : devRoad !== null ? 'devroad'
    : buildMode;

  const { highlightVertices, highlightEdges } = useMemo(() => {
    const verts = new Set<string>();
    const edges = new Set<string>();
    if (!isMyTurn) return { highlightVertices: verts, highlightEdges: edges };
    const b = game.board;
    if (mode === 'setup-settlement') {
      for (const v of Object.values(b.vertices)) if (canPlaceSetupSettlement(b, v.id)) verts.add(v.id);
    } else if (mode === 'setup-road' && game.lastSetupVertex) {
      for (const e of Object.values(b.edges)) if (canPlaceSetupRoad(b, e.id, game.lastSetupVertex)) edges.add(e.id);
    } else if (mode === 'settlement') {
      for (const v of Object.values(b.vertices)) if (canBuildSettlementAt(b, v.id, youId)) verts.add(v.id);
    } else if (mode === 'city') {
      for (const v of Object.values(b.vertices)) if (canBuildCityAt(b, v.id, youId)) verts.add(v.id);
    } else if (mode === 'road') {
      for (const e of Object.values(b.edges)) if (canBuildRoadAt(b, e.id, youId)) edges.add(e.id);
    } else if (mode === 'devroad' && devRoad) {
      // Legal base roads, plus edges chained off already-selected ones.
      for (const e of Object.values(b.edges)) {
        if (e.road || devRoad.includes(e.id)) continue;
        const base = canBuildRoadAt(b, e.id, youId);
        const chained = devRoad.some((sel) =>
          b.edges[sel].vertexIds.some((v) => e.vertexIds.includes(v))
        );
        if (base || chained) edges.add(e.id);
      }
      for (const id of devRoad) edges.add(id); // keep picks visible
    }
    return { highlightVertices: verts, highlightEdges: edges };
  }, [game.board, game.lastSetupVertex, mode, devRoad, isMyTurn, youId]);

  const highlightTiles = useMemo(() => {
    const set = new Set<string>();
    if (inRobber) for (const t of Object.values(game.board.tiles)) if (t.id !== game.board.robberTileId) set.add(t.id);
    return set;
  }, [inRobber, game.board]);

  const handleVertex = (vId: string) => {
    if (!isMyTurn || !highlightVertices.has(vId)) return;
    if (mode === 'setup-settlement') onAction({ type: 'placeSetupSettlement', vertexId: vId });
    else if (mode === 'settlement') onAction({ type: 'buildSettlement', vertexId: vId });
    else if (mode === 'city') onAction({ type: 'buildCity', vertexId: vId });
    setBuildMode(null);
  };

  const handleEdge = (eId: string) => {
    if (!isMyTurn || !highlightEdges.has(eId)) return;
    if (mode === 'setup-road') onAction({ type: 'placeSetupRoad', edgeId: eId });
    else if (mode === 'road') { onAction({ type: 'buildRoad', edgeId: eId }); setBuildMode(null); }
    else if (mode === 'devroad' && devRoad) {
      const next = devRoad.includes(eId) ? devRoad.filter((x) => x !== eId) : [...devRoad, eId];
      setDevRoad(next.slice(0, 2));
    }
  };

  const handleTile = (tileId: string) => {
    if (!inRobber || tileId === game.board.robberTileId) return;
    const victims = [...playersOnTile(game.board, tileId)].filter(
      (id) => id !== youId && (opponentSecrets[id]?.resourceCount ?? 0) > 0
    );
    if (victims.length === 0) onAction({ type: 'moveRobber', tileId, stealFromPlayerId: null });
    else setRobberTile(tileId);
  };

  const playDevCard = (type: DevCardType) => {
    if (type === 'knight') onAction({ type: 'playKnight' });
    else if (type === 'roadBuilding') setDevRoad([]);
    else if (type === 'yearOfPlenty') setModal('yearOfPlenty');
    else if (type === 'monopoly') setModal('monopoly');
  };

  const handTotal = bagToList(me.resources).length;
  const canPlayDev = isMyTurn && !game.hasPlayedDevCardThisTurn && (game.phase === 'main' || game.phase === 'rollDice');

  const instruction = () => {
    if (game.phase === 'ended') {
      const winner = game.players.find((p) => p.id === game.winnerId);
      return `🏆 ${winner?.name ?? 'Someone'} wins!`;
    }
    if (mustDiscard) return 'You must discard.';
    if (inRobber) return robberTile ? 'Choose a player to steal from.' : 'Click a tile to move the robber.';
    if (game.phase === 'discard') return 'Waiting for players to discard…';
    if (game.phase === 'moveRobber') return `Waiting for ${current?.name} to move the robber…`;
    if (!isMyTurn) return `Waiting for ${current?.name}…`;
    if (mode === 'devroad') return 'Pick up to 2 road spots, then confirm.';
    if (mode === 'setup-settlement') return 'Place a settlement (highlighted spots).';
    if (mode === 'setup-road') return 'Place a road next to your settlement.';
    if (game.phase === 'rollDice') return 'Roll the dice to start your turn.';
    if (buildMode) return `Click a highlighted spot to build a ${buildMode}.`;
    return 'Build, trade, play a card, or end your turn.';
  };

  return (
    <div className="game">
      <div className="game-main">
        <div className="game-header">
          <span>Room <strong>{game.roomCode}</strong></span>
          <span className="muted">Turn {game.turnNumber}</span>
          {game.lastRoll && <span>🎲 {game.lastRoll.total} ({game.lastRoll.die1}+{game.lastRoll.die2})</span>}
        </div>

        <Board
          board={game.board}
          playerColors={playerColors}
          highlightVertices={highlightVertices}
          highlightEdges={highlightEdges}
          highlightTiles={highlightTiles}
          onVertexClick={isMyTurn ? handleVertex : undefined}
          onEdgeClick={isMyTurn ? handleEdge : undefined}
          onTileClick={inRobber ? handleTile : undefined}
        />

        <p className="instruction">{instruction()}</p>

        {/* Action controls */}
        <div className="controls">
          {isMyTurn && game.phase === 'rollDice' && (
            <button onClick={() => onAction({ type: 'rollDice' })}>🎲 Roll Dice</button>
          )}

          {mode === 'devroad' && devRoad && (
            <>
              <button disabled={devRoad.length === 0} onClick={() => { onAction({ type: 'playRoadBuilding', edgeIds: devRoad }); setDevRoad(null); }}>
                Build {devRoad.length} road(s)
              </button>
              <button className="link-button" onClick={() => setDevRoad(null)}>Cancel</button>
            </>
          )}

          {isMyTurn && game.phase === 'main' && devRoad === null && (
            <>
              <button className={buildMode === 'road' ? 'sel' : ''} onClick={() => setBuildMode('road')}>Road (🧱🌲)</button>
              <button className={buildMode === 'settlement' ? 'sel' : ''} onClick={() => setBuildMode('settlement')}>Settlement (🧱🌲🐑🌾)</button>
              <button className={buildMode === 'city' ? 'sel' : ''} onClick={() => setBuildMode('city')}>City (🌾🌾⛰️⛰️⛰️)</button>
              {buildMode && <button className="link-button" onClick={() => setBuildMode(null)}>Cancel</button>}
              <button onClick={() => onAction({ type: 'endTurn' })}>End Turn ▶</button>
            </>
          )}
        </div>

        {isMyTurn && game.phase === 'main' && devRoad === null && (
          <div className="panels">
            <TradePanel board={game.board} playerId={youId} onTrade={(give, receive) => onAction({ type: 'bankTrade', give, receive })} />
            <DevCardPanel
              cards={me.devCards}
              turnNumber={game.turnNumber}
              canPlay={canPlayDev}
              canBuy={game.phase === 'main'}
              onBuy={() => onAction({ type: 'buyDevCard' })}
              onPlay={playDevCard}
            />
          </div>
        )}

        <h3>Your hand</h3>
        <ResourceHand resources={me.resources} />
      </div>

      <aside className="game-side">
        <h3>Players</h3>
        <ul className="player-list">
          {game.players.map((p) => {
            const isYou = p.id === youId;
            const handCount = isYou ? handTotal : opponentSecrets[p.id]?.resourceCount ?? 0;
            const devCount = isYou ? p.devCards.length : opponentSecrets[p.id]?.devCardCount ?? 0;
            return (
              <li key={p.id} className={p.id === current?.id ? 'active' : ''}>
                <span className="swatch" style={{ background: p.color }} />
                {p.name}
                {isYou && <span className="tag">you</span>}
                {game.longestRoadOwner === p.id && <span className="tag">🛣️</span>}
                {game.largestArmyOwner === p.id && <span className="tag">⚔️</span>}
                <span className="muted"> · {p.publicVictoryPoints} VP · {handCount}🃏 · {devCount} dev</span>
              </li>
            );
          })}
        </ul>

        <h3>Log</h3>
        <div className="log">
          {logs.length === 0 ? <p className="muted">No events yet.</p> : logs.map((l, i) => <p key={i}>{l}</p>)}
        </div>

        <button className="link-button" onClick={onLeave}>Leave game</button>
      </aside>

      {/* Discard modal (forced) */}
      {mustDiscard && (
        <ResourceSelect
          title={`Discard ${Math.floor(handTotal / 2)} cards`}
          target={Math.floor(handTotal / 2)}
          caps={me.resources}
          confirmLabel="Discard"
          onConfirm={(bag) => onAction({ type: 'discard', resources: bag })}
        />
      )}

      {/* Steal target picker */}
      {robberTile && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Steal from…</h3>
            <div className="modal-actions">
              {[...playersOnTile(game.board, robberTile)]
                .filter((id) => id !== youId && (opponentSecrets[id]?.resourceCount ?? 0) > 0)
                .map((id) => (
                  <button key={id} onClick={() => { onAction({ type: 'moveRobber', tileId: robberTile, stealFromPlayerId: id }); setRobberTile(null); }}>
                    {game.players.find((p) => p.id === id)?.name}
                  </button>
                ))}
              <button className="link-button" onClick={() => setRobberTile(null)}>Pick another tile</button>
            </div>
          </div>
        </div>
      )}

      {/* Year of Plenty */}
      {modal === 'yearOfPlenty' && (
        <ResourceSelect
          title="Year of Plenty — take 2"
          target={2}
          onConfirm={(bag) => { onAction({ type: 'playYearOfPlenty', resources: bagToList(bag) }); setModal(null); }}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Monopoly */}
      {modal === 'monopoly' && (
        <ResourceSelect
          title="Monopoly — choose 1"
          target={1}
          confirmLabel="Take all"
          onConfirm={(bag) => { onAction({ type: 'playMonopoly', resource: bagToList(bag)[0] }); setModal(null); }}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
