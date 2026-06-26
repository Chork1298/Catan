import { useState } from 'react';
import { RESOURCE_TYPES, bankTradeRate, type Board, type ResourceType } from '@catan/shared';

export interface TradePanelProps {
  board: Board;
  playerId: string;
  onTrade: (give: ResourceType, receive: ResourceType) => void;
}

// Bank/port trading: shows your best rate for the chosen resource.
export function TradePanel({ board, playerId, onTrade }: TradePanelProps) {
  const [give, setGive] = useState<ResourceType>('wood');
  const [receive, setReceive] = useState<ResourceType>('ore');
  const rate = bankTradeRate(board, playerId, give);

  return (
    <div className="trade-panel">
      <strong>Bank trade</strong>
      <div className="trade-row">
        <span>Give</span>
        <select value={give} onChange={(e) => setGive(e.target.value as ResourceType)}>
          {RESOURCE_TYPES.map((r) => <option key={r} value={r}>{rate}× {r}</option>)}
        </select>
        <span>→</span>
        <select value={receive} onChange={(e) => setReceive(e.target.value as ResourceType)}>
          {RESOURCE_TYPES.map((r) => <option key={r} value={r}>1× {r}</option>)}
        </select>
        <button disabled={give === receive} onClick={() => onTrade(give, receive)}>
          Trade ({rate}:1)
        </button>
      </div>
    </div>
  );
}
