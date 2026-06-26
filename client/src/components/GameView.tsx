import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  canAfford,
  canBuildCityAt,
  canBuildRoadAt,
  canBuildSettlementAt,
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  countBuildings,
  countRoads,
  playersOnTile,
  COSTS,
  PIECE_LIMITS,
  RESOURCE_TYPES,
  type Action,
  type DevCardType,
  type Player,
  type PlayerView,
  type ResourceBag,
  type ResourceType,
} from '@catan/shared';
import { Board } from './Board.js';
import { ResourceHand } from './ResourceHand.js';
import { ResourceSelect } from './ResourceSelect.js';
import { TradePanel } from './TradePanel.js';
import { DevCardPanel } from './DevCardPanel.js';
import { Inventory } from './Inventory.js';
import { CostCard } from './CostCard.js';
import { DiceRoll } from './DiceRoll.js';
import { TurnBanner } from './TurnBanner.js';
import { playDing } from '../sound.js';

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

/** Wrap any player name appearing in a log line with that player's color. */
function colorizeLog(line: string, players: Player[]): ReactNode[] {
  const sorted = [...players].sort((a, b) => b.name.length - a.name.length);
  let nodes: ReactNode[] = [line];
  for (const p of sorted) {
    nodes = nodes.flatMap((node) => {
      if (typeof node !== 'string' || !node.includes(p.name)) return [node];
      const out: ReactNode[] = [];
      const parts = node.split(p.name);
      parts.forEach((part, i) => {
        if (part) out.push(part);
        if (i < parts.length - 1)
          out.push(
            <span key={`${p.id}-${i}-${out.length}`} style={{ color: p.color, fontWeight: 600 }}>
              {p.name}
            </span>
          );
      });
      return out;
    });
  }
  return nodes;
}

export function GameView({ view, logs, onAction, onLeave }: GameViewProps) {
  const { game, youId, opponentSecrets } = view;
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [devRoad, setDevRoad] = useState<string[] | null>(null);
  const [robberTile, setRobberTile] = useState<string | null>(null);
  const [modal, setModal] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  const [showTurnBanner, setShowTurnBanner] = useState(false);

  const me = game.players.find((p) => p.id === youId)!;
  const current = game.players[game.currentPlayerIndex];
  const isMyTurn = current?.id === youId;
  const playerColors = Object.fromEntries(game.players.map((p) => [p.id, p.color]));
  const inSetup = game.phase === 'setupRound1' || game.phase === 'setupRound2';
  const mustDiscard = game.mustDiscard.includes(youId);
  const inRobber = game.phase === 'moveRobber' && isMyTurn;

  // --- Affordability + piece limits (for greying out build buttons) ---
  const built = countBuildings(game.board, youId);
  const roadsUsed = countRoads(game.board, youId);
  const canAffordRoad = canAfford(me.resources, COSTS.road) && roadsUsed < PIECE_LIMITS.roads;
  const canAffordSettlement = canAfford(me.resources, COSTS.settlement) && built.settlements < PIECE_LIMITS.settlements;
  const canAffordCity = canAfford(me.resources, COSTS.city) && built.cities < PIECE_LIMITS.cities;
  const canAffordDev = canAfford(me.resources, COSTS.devCard);

  // --- "Your turn" banner + ding on transition to your turn ---
  const prevCurrentId = useRef<string | null>(null);
  useEffect(() => {
    const curId = current?.id ?? null;
    const justBecameMine =
      curId === youId && prevCurrentId.current !== youId && game.phase !== 'lobby' && game.phase !== 'ended';
    prevCurrentId.current = curId;
    if (justBecameMine) {
      setShowTurnBanner(true);
      playDing();
      const t = setTimeout(() => setShowTurnBanner(false), 2000);
      return () => clearTimeout(t);
    }
  }, [current?.id, youId, game.phase]);

  // --- Auto-scroll the log to the newest message ---
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
      for (const e of Object.values(b.edges)) {
        if (e.road || devRoad.includes(e.id)) continue;
        const base = canBuildRoadAt(b, e.id, youId);
        const chained = devRoad.some((sel) => b.edges[sel].vertexIds.some((v) => e.vertexIds.includes(v)));
        if (base || chained) edges.add(e.id);
      }
      for (const id of devRoad) edges.add(id);
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
  const rollKey = game.lastRoll ? `${game.turnNumber}:${game.lastRoll.die1}:${game.lastRoll.die2}` : 'none';

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
      <TurnBanner show={showTurnBanner} />

      <div className="game-main">
        <div className="game-header">
          <span>Room <strong>{game.roomCode}</strong></span>
          <span className="muted">Turn {game.turnNumber}</span>
          {game.lastRoll && <DiceRoll die1={game.lastRoll.die1} die2={game.lastRoll.die2} rollKey={rollKey} />}
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
              <button className={buildMode === 'road' ? 'sel' : ''} disabled={!canAffordRoad} onClick={() => setBuildMode('road')}>Road (🧱🌲)</button>
              <button className={buildMode === 'settlement' ? 'sel' : ''} disabled={!canAffordSettlement} onClick={() => setBuildMode('settlement')}>Settlement (🧱🌲🐑🌾)</button>
              <button className={buildMode === 'city' ? 'sel' : ''} disabled={!canAffordCity} onClick={() => setBuildMode('city')}>City (🌾🌾⛰️⛰️⛰️)</button>
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
              canBuy={game.phase === 'main' && canAffordDev}
              onBuy={() => onAction({ type: 'buyDevCard' })}
              onPlay={playDevCard}
            />
          </div>
        )}

        <div className="info-row">
          <Inventory board={game.board} playerId={youId} />
          <CostCard />
        </div>

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
                <span className="pname" style={{ color: p.color }}>{p.name}</span>
                {isYou && <span className="tag">you</span>}
                {game.longestRoadOwner === p.id && <span className="tag" title="Longest Road">🛣️</span>}
                {game.largestArmyOwner === p.id && <span className="tag" title="Largest Army">⚔️</span>}
                <span className="pstats muted">{p.publicVictoryPoints}vp · {handCount}🃏 · {devCount}d</span>
              </li>
            );
          })}
        </ul>

        <h3>Log</h3>
        <div className="log" ref={logRef}>
          {logs.length === 0 ? <p className="muted">No events yet.</p> : logs.map((l, i) => <p key={i}>{colorizeLog(l, game.players)}</p>)}
        </div>

        <button className="link-button" onClick={onLeave}>Leave game</button>
      </aside>

      {mustDiscard && (
        <ResourceSelect
          title={`Discard ${Math.floor(handTotal / 2)} cards`}
          target={Math.floor(handTotal / 2)}
          caps={me.resources}
          confirmLabel="Discard"
          onConfirm={(bag) => onAction({ type: 'discard', resources: bag })}
        />
      )}

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

      {modal === 'yearOfPlenty' && (
        <ResourceSelect
          title="Year of Plenty — take 2"
          target={2}
          onConfirm={(bag) => { onAction({ type: 'playYearOfPlenty', resources: bagToList(bag) }); setModal(null); }}
          onCancel={() => setModal(null)}
        />
      )}

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
