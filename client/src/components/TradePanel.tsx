import { useState } from 'react';
import {
  RESOURCE_TYPES,
  bankTradeRate,
  emptyBag,
  type Board,
  type ResourceBag,
  type ResourceType,
} from '@catan/shared';

const ICON: Record<ResourceType, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

export interface TradePanelProps {
  board: Board;
  playerId: string;
  myResources: ResourceBag;
  hasPendingTrade: boolean;
  onPropose: (give: ResourceBag, receive: ResourceBag) => void;
  onBankTrade: (give: ResourceType, receive: ResourceType) => void;
}

const total = (b: ResourceBag) => RESOURCE_TYPES.reduce((a, r) => a + b[r], 0);

function Stepper({
  bag,
  set,
  caps,
}: {
  bag: ResourceBag;
  set: (b: ResourceBag) => void;
  caps?: ResourceBag;
}) {
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

// Build a player-trade offer, or do a quick bank/port trade. Both confirm first.
export function TradePanel({ board, playerId, myResources, hasPendingTrade, onPropose, onBankTrade }: TradePanelProps) {
  const [give, setGive] = useState<ResourceBag>(emptyBag());
  const [want, setWant] = useState<ResourceBag>(emptyBag());
  const [confirming, setConfirming] = useState(false);

  const [bankGive, setBankGive] = useState<ResourceType>('wood');
  const [bankGet, setBankGet] = useState<ResourceType>('ore');
  const [bankConfirm, setBankConfirm] = useState(false);
  const rate = bankTradeRate(board, playerId, bankGive);

  const canPropose = total(give) > 0 && total(want) > 0;

  return (
    <div className="trade-panel">
      <strong>Trade with players</strong>
      {hasPendingTrade ? (
        <p className="muted small">An offer is already on the table.</p>
      ) : (
        <>
          <div className="trade-build">
            <div className="trade-side">
              <span className="muted small">You give</span>
              <Stepper bag={give} set={setGive} caps={myResources} />
            </div>
            <div className="trade-side">
              <span className="muted small">You want</span>
              <Stepper bag={want} set={setWant} />
            </div>
          </div>
          {confirming ? (
            <div className="confirm-row">
              <span className="small">Send this offer?</span>
              <button className="mini" onClick={() => { onPropose(give, want); setGive(emptyBag()); setWant(emptyBag()); setConfirming(false); }}>Confirm</button>
              <button className="mini link-button" onClick={() => setConfirming(false)}>No</button>
            </div>
          ) : (
            <button className="mini" disabled={!canPropose} onClick={() => setConfirming(true)}>Propose Offer</button>
          )}
        </>
      )}

      <hr className="sep" />

      <strong>Bank / port</strong>
      <div className="trade-row">
        <select value={bankGive} onChange={(e) => setBankGive(e.target.value as ResourceType)}>
          {RESOURCE_TYPES.map((r) => <option key={r} value={r}>{rate}× {r}</option>)}
        </select>
        <span>→</span>
        <select value={bankGet} onChange={(e) => setBankGet(e.target.value as ResourceType)}>
          {RESOURCE_TYPES.map((r) => <option key={r} value={r}>1× {r}</option>)}
        </select>
      </div>
      {bankConfirm ? (
        <div className="confirm-row">
          <span className="small">Trade {rate} {bankGive} for 1 {bankGet}?</span>
          <button className="mini" onClick={() => { onBankTrade(bankGive, bankGet); setBankConfirm(false); }}>Confirm</button>
          <button className="mini link-button" onClick={() => setBankConfirm(false)}>No</button>
        </div>
      ) : (
        <button className="mini" disabled={bankGive === bankGet || myResources[bankGive] < rate} onClick={() => setBankConfirm(true)}>
          Bank trade ({rate}:1)
        </button>
      )}
    </div>
  );
}
