import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  armyCap,
  canAfford,
  canBuildCityAt,
  canBuildRoadAt,
  canBuildSettlementAt,
  canDeclareWarOn,
  canPlaceSetupRoad,
  canPlaceSetupSettlement,
  countBuildings,
  countRoads,
  garrisonAt,
  playersOnTile,
  sameCluster,
  totalArmy,
  COSTS,
  PIECE_LIMITS,
  RESOURCE_TYPES,
  SOLDIER_COST,
  type Action,
  type DevCardType,
  type Player,
  type PlayerView,
  type ResourceBag,
  type ResourceType,
} from '@catan/shared';
import type { Announcement } from '../net.js';
import { Board } from './Board.js';
import { ResourceHand } from './ResourceHand.js';
import { ResourceSelect } from './ResourceSelect.js';
import { TradePanel } from './TradePanel.js';
import { TradeBox } from './TradeBox.js';
import { DevCardPanel } from './DevCardPanel.js';
import { Inventory } from './Inventory.js';
import { CostCard } from './CostCard.js';
import { DiceRoll } from './DiceRoll.js';
import { DiceOverlay } from './DiceOverlay.js';
import { TurnBanner } from './TurnBanner.js';
import { playDing } from '../sound.js';

export interface GameViewProps {
  view: PlayerView;
  logs: string[];
  announcements: Announcement[];
  onAction: (action: Action) => void;
  onLeave: () => void;
}

type BuildMode = 'road' | 'settlement' | 'city' | 'train' | 'move' | 'attack' | null;

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
          out.push(<span key={`${p.id}-${i}-${out.length}`} style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>);
      });
      return out;
    });
  }
  return nodes;
}

export function GameView({ view, logs, announcements, onAction, onLeave }: GameViewProps) {
  const { game, youId, opponentSecrets } = view;
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [devRoad, setDevRoad] = useState<string[] | null>(null);
  const [robberTile, setRobberTile] = useState<string | null>(null);
  const [modal, setModal] = useState<'yearOfPlenty' | 'monopoly' | null>(null);
  const [showTurnBanner, setShowTurnBanner] = useState(false);
  const [diceOverlay, setDiceOverlay] = useState<{ die1: number; die2: number; key: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [moveSource, setMoveSource] = useState<string | null>(null); // war: troop move source

  const me = game.players.find((p) => p.id === youId)!;
  const current = game.players[game.currentPlayerIndex];
  const isMyTurn = current?.id === youId;
  const playerColors = Object.fromEntries(game.players.map((p) => [p.id, p.color]));
  const inSetup = game.phase === 'setupRound1' || game.phase === 'setupRound2';
  const mustDiscard = game.mustDiscard.includes(youId);
  const inRobber = game.phase === 'moveRobber' && isMyTurn;
  const rollKey = game.lastRoll ? `${game.turnNumber}:${game.lastRoll.die1}:${game.lastRoll.die2}` : 'none';

  const built = countBuildings(game.board, youId);
  const roadsUsed = countRoads(game.board, youId);
  const canAffordRoad = canAfford(me.resources, COSTS.road) && roadsUsed < PIECE_LIMITS.roads;
  const canAffordSettlement = canAfford(me.resources, COSTS.settlement) && built.settlements < PIECE_LIMITS.settlements;
  const canAffordCity = canAfford(me.resources, COSTS.city) && built.cities < PIECE_LIMITS.cities;
  const canAffordDev = canAfford(me.resources, COSTS.devCard);
  const myArmy = totalArmy(game.board, youId);
  const canTrain = canAfford(me.resources, SOLDIER_COST) && myArmy < armyCap(game.board, youId);
  const warPending = !!game.pendingWar;
  const iAmDefender = warPending && game.pendingWar!.defenderId === youId;
  const iAmAttacker = warPending && game.pendingWar!.attackerId === youId;

  // Big centered dice animation on each new roll.
  const prevRollKey = useRef('none');
  useEffect(() => {
    if (game.lastRoll && rollKey !== 'none' && rollKey !== prevRollKey.current) {
      setDiceOverlay({ die1: game.lastRoll.die1, die2: game.lastRoll.die2, key: rollKey });
    }
    prevRollKey.current = rollKey;
  }, [rollKey, game.lastRoll]);

  // "Your turn" banner + ding when you become the current player.
  const prevCurrentId = useRef<string | null>(null);
  useEffect(() => {
    const curId = current?.id ?? null;
    const justBecameMine = curId === youId && prevCurrentId.current !== youId && game.phase !== 'lobby' && game.phase !== 'ended';
    prevCurrentId.current = curId;
    if (justBecameMine) {
      setShowTurnBanner(true);
      playDing();
      const t = setTimeout(() => setShowTurnBanner(false), 2200);
      return () => clearTimeout(t);
    }
  }, [current?.id, youId, game.phase]);

  // Tick once a second for the turn countdown.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const secsLeft = game.turnEndsAt ? Math.max(0, Math.ceil((game.turnEndsAt - now) / 1000)) : null;

  // Auto-scroll the log to the newest message.
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
    } else if (mode === 'train' && canTrain) {
      for (const v of Object.values(b.vertices)) if (v.building?.owner === youId) verts.add(v.id);
    } else if (mode === 'move') {
      if (!moveSource) {
        for (const v of Object.values(b.vertices)) if (v.building?.owner === youId && garrisonAt(b, v.id) > 0) verts.add(v.id);
      } else {
        for (const v of Object.values(b.vertices))
          if (v.id !== moveSource && v.building?.owner === youId && sameCluster(b, youId, moveSource, v.id)) verts.add(v.id);
        verts.add(moveSource);
      }
    } else if (mode === 'attack') {
      for (const v of Object.values(b.vertices)) if (canDeclareWarOn(b, youId, v.id)) verts.add(v.id);
    }
    return { highlightVertices: verts, highlightEdges: edges };
  }, [game.board, game.lastSetupVertex, mode, devRoad, moveSource, isMyTurn, youId, canTrain]);

  const highlightTiles = useMemo(() => {
    const set = new Set<string>();
    if (inRobber) for (const t of Object.values(game.board.tiles)) if (t.id !== game.board.robberTileId) set.add(t.id);
    return set;
  }, [inRobber, game.board]);

  const handleVertex = (vId: string) => {
    if (!isMyTurn || !highlightVertices.has(vId)) return;
    if (mode === 'setup-settlement') { onAction({ type: 'placeSetupSettlement', vertexId: vId }); setBuildMode(null); }
    else if (mode === 'settlement') { onAction({ type: 'buildSettlement', vertexId: vId }); setBuildMode(null); }
    else if (mode === 'city') { onAction({ type: 'buildCity', vertexId: vId }); setBuildMode(null); }
    else if (mode === 'train') { onAction({ type: 'trainSoldier', vertexId: vId }); /* stay in train mode */ }
    else if (mode === 'attack') { onAction({ type: 'declareWar', targetVertexId: vId }); setBuildMode(null); }
    else if (mode === 'move') {
      if (!moveSource) {
        setMoveSource(vId);
      } else if (vId === moveSource) {
        setMoveSource(null); // deselect
      } else {
        onAction({ type: 'moveSoldiers', fromVertexId: moveSource, toVertexId: vId, count: garrisonAt(game.board, moveSource) });
        setMoveSource(null);
        setBuildMode(null);
      }
    }
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
    const victims = [...playersOnTile(game.board, tileId)].filter((id) => id !== youId && (opponentSecrets[id]?.resourceCount ?? 0) > 0);
    if (victims.length === 0) onAction({ type: 'moveRobber', tileId, stealFromPlayerId: null });
    else setRobberTile(tileId);
  };

  const chooseMode = (m: BuildMode) => {
    setBuildMode(m);
    setMoveSource(null);
  };

  const playDevCard = (type: DevCardType) => {
    if (type === 'knight') onAction({ type: 'playKnight' });
    else if (type === 'roadBuilding') setDevRoad([]);
    else if (type === 'yearOfPlenty') setModal('yearOfPlenty');
    else if (type === 'monopoly') setModal('monopoly');
  };

  const handTotal = bagToList(me.resources).length;
  const canPlayDev = isMyTurn && !game.hasPlayedDevCardThisTurn && (game.phase === 'main' || game.phase === 'rollDice');
  const showDevPanel = isMyTurn && (game.phase === 'main' || game.phase === 'rollDice') && devRoad === null;
  const showTradePanel = isMyTurn && game.phase === 'main' && devRoad === null;

  const instruction = () => {
    if (game.phase === 'ended') return '🏆 Game over';
    if (warPending) {
      const w = game.pendingWar!;
      if (iAmDefender) return '⚔️ You are under attack! Fight or retreat.';
      if (iAmAttacker) return `Waiting for ${nameById(w.defenderId)} to respond to your attack…`;
      return `⚔️ ${nameById(w.attackerId)} is attacking ${nameById(w.defenderId)}.`;
    }
    if (mustDiscard) return 'You must discard.';
    if (inRobber) return robberTile ? 'Choose a player to steal from.' : 'Click a tile to move the robber.';
    if (game.phase === 'discard') return 'Waiting for players to discard…';
    if (game.phase === 'moveRobber') return `Waiting for ${current?.name} to move the robber…`;
    if (!isMyTurn) return `Waiting for ${current?.name}…`;
    if (mode === 'devroad') return 'Pick up to 2 road spots, then confirm.';
    if (mode === 'setup-settlement') return 'Place a settlement.';
    if (mode === 'setup-road') return 'Place a road next to your settlement.';
    if (mode === 'train') return 'Click your building to train a soldier there.';
    if (mode === 'move') return moveSource ? 'Click a connected building to move the garrison there.' : 'Click a building with soldiers to move.';
    if (mode === 'attack') return 'Click an enemy building your road reaches to attack it.';
    if (game.phase === 'rollDice') return 'Roll the dice (or play a dev card first).';
    if (buildMode) return `Click a highlighted spot to build a ${buildMode}.`;
    return 'Build, train, trade, attack, or end your turn.';
  };

  const nameById = (id: string) => game.players.find((p) => p.id === id)?.name ?? '?';

  const winner = game.players.find((p) => p.id === game.winnerId);

  return (
    <div className="game-grid">
      <TurnBanner show={showTurnBanner && isMyTurn} />
      {diceOverlay && <DiceOverlay key={diceOverlay.key} die1={diceOverlay.die1} die2={diceOverlay.die2} onDone={() => setDiceOverlay(null)} />}
      <div className="announce-stack">
        {announcements.map((a) => <div key={a.id} className="announce">{a.text}</div>)}
      </div>

      <header className="g-header">
        <span>Room <strong>{game.roomCode}</strong></span>
        <span className="muted">Turn {game.turnNumber}</span>
        <span className="muted">Win at {game.targetPoints}</span>
        {game.lastRoll && <DiceRoll die1={game.lastRoll.die1} die2={game.lastRoll.die2} />}
        {secsLeft !== null && <span className={secsLeft <= 15 ? 'turn-clock low' : 'turn-clock'}>⏱ {secsLeft}s</span>}
        <button className="link-button" onClick={onLeave}>Leave</button>
      </header>

      <section className="g-left">
        <h3>Players</h3>
        <ul className="player-list big">
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
                <span className="pstats muted">{p.publicVictoryPoints}vp · {handCount}🃏 · {devCount}d · 🛡️{totalArmy(game.board, p.id)}</span>
              </li>
            );
          })}
        </ul>
        <Inventory
          board={game.board}
          playerId={youId}
          hasLongestRoad={game.longestRoadOwner === youId}
          hasLargestArmy={game.largestArmyOwner === youId}
        />
        <CostCard />
      </section>

      <section className="g-board">
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
      </section>

      <aside className="g-right">
        {game.pendingTrade && (
          <TradeBox
            trade={game.pendingTrade}
            players={game.players}
            youId={youId}
            myResources={me.resources}
            onAccept={() => onAction({ type: 'acceptTrade', tradeId: game.pendingTrade!.id })}
            onCounter={(give, receive) => onAction({ type: 'counterTrade', tradeId: game.pendingTrade!.id, give, receive })}
            onFinalize={(withId) => onAction({ type: 'finalizeTrade', tradeId: game.pendingTrade!.id, withPlayerId: withId })}
            onCancel={() => onAction({ type: 'cancelTrade' })}
          />
        )}
        {showTradePanel && (
          <TradePanel
            board={game.board}
            playerId={youId}
            myResources={me.resources}
            hasPendingTrade={!!game.pendingTrade}
            onPropose={(give, receive) => onAction({ type: 'proposeTrade', give, receive })}
            onBankTrade={(give, receive) => onAction({ type: 'bankTrade', give, receive })}
          />
        )}
        {showDevPanel && (
          <DevCardPanel
            cards={me.devCards}
            turnNumber={game.turnNumber}
            canPlay={canPlayDev}
            canBuy={game.phase === 'main' && canAffordDev}
            onBuy={() => onAction({ type: 'buyDevCard' })}
            onPlay={playDevCard}
          />
        )}
        <h3>Log</h3>
        <div className="log" ref={logRef}>
          {logs.length === 0 ? <p className="muted">No events yet.</p> : logs.map((l, i) => <p key={i}>{colorizeLog(l, game.players)}</p>)}
        </div>
      </aside>

      <footer className="g-bottom">
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
          {isMyTurn && game.phase === 'main' && devRoad === null && !warPending && (
            <>
              <button className={buildMode === 'road' ? 'sel' : ''} disabled={!canAffordRoad} onClick={() => chooseMode('road')}>Road</button>
              <button className={buildMode === 'settlement' ? 'sel' : ''} disabled={!canAffordSettlement} onClick={() => chooseMode('settlement')}>Settlement</button>
              <button className={buildMode === 'city' ? 'sel' : ''} disabled={!canAffordCity} onClick={() => chooseMode('city')}>City</button>
              <span className="ctrl-sep" />
              <button className={buildMode === 'train' ? 'sel' : ''} disabled={!canTrain} onClick={() => chooseMode('train')} title="Train a soldier (1🌾 + 1⛰️)">Train ⚔️</button>
              <button className={buildMode === 'move' ? 'sel' : ''} disabled={myArmy === 0} onClick={() => chooseMode('move')}>Move troops</button>
              <button className={buildMode === 'attack' ? 'sel' : ''} disabled={myArmy === 0} onClick={() => chooseMode('attack')}>Attack</button>
              {buildMode && <button className="link-button" onClick={() => chooseMode(null)}>Done</button>}
              <button onClick={() => onAction({ type: 'endTurn' })}>End Turn ▶</button>
            </>
          )}
        </div>
        <ResourceHand resources={me.resources} />
      </footer>

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
        <ResourceSelect title="Year of Plenty — take 2" target={2}
          onConfirm={(bag) => { onAction({ type: 'playYearOfPlenty', resources: bagToList(bag) }); setModal(null); }}
          onCancel={() => setModal(null)} />
      )}
      {modal === 'monopoly' && (
        <ResourceSelect title="Monopoly — choose 1" target={1} confirmLabel="Take all"
          onConfirm={(bag) => { onAction({ type: 'playMonopoly', resource: bagToList(bag)[0] }); setModal(null); }}
          onCancel={() => setModal(null)} />
      )}

      {iAmDefender && game.pendingWar && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>⚔️ Under attack!</h3>
            <p>
              <span style={{ color: playerColors[game.pendingWar.attackerId], fontWeight: 600 }}>
                {nameById(game.pendingWar.attackerId)}
              </span>{' '}
              is attacking your building with <strong>{game.pendingWar.attackerArmy}</strong> soldiers.
            </p>
            <p className="muted small">
              Your rallied defense: <strong>{game.pendingWar.defenderArmy}</strong> (+ home bonus, + dice). Defender wins ties.
            </p>
            <div className="modal-actions">
              <button onClick={() => onAction({ type: 'respondToWar', response: 'fight' })}>Fight</button>
              <button onClick={() => onAction({ type: 'respondToWar', response: 'retreat' })}>Retreat (give it up)</button>
            </div>
          </div>
        </div>
      )}

      {game.phase === 'ended' && winner && (
        <div className="modal-backdrop">
          <div className="modal winner-modal">
            <h2>🏆 {winner.name} wins!</h2>
            <p>{winner.publicVictoryPoints}+ victory points</p>
            <button onClick={onLeave}>Back to menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
