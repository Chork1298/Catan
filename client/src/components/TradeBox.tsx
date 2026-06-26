import { useState } from 'react';
import { RESOURCE_TYPES, emptyBag, type Player, type ResourceBag, type TradeOffer } from '@catan/shared';

const ICON: Record<string, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };
const total = (b: ResourceBag) => RESOURCE_TYPES.reduce((a, r) => a + b[r], 0);

function bagText(bag: ResourceBag): string {
  const parts = RESOURCE_TYPES.filter((r) => bag[r] > 0).map((r) => `${bag[r]}${ICON[r]}`);
  return parts.join(' ') || '—';
}

function MiniStepper({ bag, set, caps }: { bag: ResourceBag; set: (b: ResourceBag) => void; caps?: ResourceBag }) {
  return (
    <div className="bag-stepper">
      {RESOURCE_TYPES.map((r) => (
        <div key={r} className="bag-cell">
          <span className="bag-icon">{ICON[r]}</span>
          <button className="mini" disabled={bag[r] === 0} onClick={() => set({ ...bag, [r]: bag[r] - 1 })}>−</button>
          <span className="bag-count">{bag[r]}</span>
          <button className="mini" disabled={caps ? bag[r] >= caps[r] : false} onClick={() => set({ ...bag, [r]: bag[r] + 1 })}>+</button>
        </div>
      ))}
    </div>
  );
}

export interface TradeBoxProps {
  trade: TradeOffer;
  players: Player[];
  youId: string;
  myResources: ResourceBag;
  onAccept: () => void;
  onCounter: (give: ResourceBag, receive: ResourceBag) => void;
  onFinalize: (withPlayerId: string) => void;
  onCancel: () => void;
}

// The active trade offer, shown to everyone. The proposer sees accepters and
// counter-offers and picks one; others can Accept or send a Counter.
export function TradeBox({ trade, players, youId, myResources, onAccept, onCounter, onFinalize, onCancel }: TradeBoxProps) {
  const proposer = players.find((p) => p.id === trade.from);
  const isProposer = trade.from === youId;
  const iCanAffordOriginal = RESOURCE_TYPES.every((r) => myResources[r] >= trade.receive[r]);
  const iAccepted = trade.acceptedBy.includes(youId);
  const myCounter = trade.counters.find((c) => c.from === youId);

  const [building, setBuilding] = useState(false);
  const [cGive, setCGive] = useState<ResourceBag>(emptyBag());
  const [cWant, setCWant] = useState<ResourceBag>(emptyBag());
  const canSendCounter = total(cGive) > 0 && total(cWant) > 0;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';

  return (
    <div className="trade-box">
      <strong>Trade offer</strong>
      <div className="offer-line">
        <span style={{ color: proposer?.color, fontWeight: 600 }}>{proposer?.name}</span> gives{' '}
        <b>{bagText(trade.give)}</b> for <b>{bagText(trade.receive)}</b>
      </div>

      {isProposer ? (
        <div className="offer-actions">
          <span className="muted small">Pick a deal:</span>
          {trade.acceptedBy.length === 0 && trade.counters.length === 0 && (
            <span className="muted small">no responses yet</span>
          )}
          {trade.acceptedBy.map((id) => (
            <button key={id} className="mini" onClick={() => onFinalize(id)}>
              ✓ {nameOf(id)} (your terms)
            </button>
          ))}
          {trade.counters.map((c) => (
            <button key={c.from} className="mini" onClick={() => onFinalize(c.from)} title={`You give ${bagText(c.receive)} for ${bagText(c.give)}`}>
              ⇄ {nameOf(c.from)}: give {bagText(c.receive)} get {bagText(c.give)}
            </button>
          ))}
          <button className="mini link-button" onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <div className="offer-actions">
          {iAccepted && <span className="muted small">You accepted — waiting…</span>}
          {!iAccepted && (
            <button className="mini" disabled={!iCanAffordOriginal} onClick={onAccept}>
              {iCanAffordOriginal ? 'Accept' : "Can't afford"}
            </button>
          )}
          {myCounter ? (
            <span className="muted small">Your counter: give {bagText(myCounter.give)} for {bagText(myCounter.receive)}</span>
          ) : (
            <button className="mini" onClick={() => setBuilding((b) => !b)}>{building ? 'Close' : 'Counter…'}</button>
          )}
        </div>
      )}

      {!isProposer && building && !myCounter && (
        <div className="trade-build">
          <div className="trade-side">
            <span className="muted small">You give</span>
            <MiniStepper bag={cGive} set={setCGive} caps={myResources} />
          </div>
          <div className="trade-side">
            <span className="muted small">You want</span>
            <MiniStepper bag={cWant} set={setCWant} />
          </div>
          <button className="mini" disabled={!canSendCounter} onClick={() => { onCounter(cGive, cWant); setBuilding(false); setCGive(emptyBag()); setCWant(emptyBag()); }}>
            Send counter
          </button>
        </div>
      )}
    </div>
  );
}
