import { RESOURCE_TYPES, type Player, type ResourceBag, type TradeOffer } from '@catan/shared';

const ICON: Record<string, string> = { brick: '🧱', wood: '🌲', sheep: '🐑', wheat: '🌾', ore: '⛰️' };

function bagText(bag: ResourceBag): string {
  const parts = RESOURCE_TYPES.filter((r) => bag[r] > 0).map((r) => `${bag[r]}${ICON[r]}`);
  return parts.join(' ') || '—';
}

export interface TradeBoxProps {
  trade: TradeOffer;
  players: Player[];
  youId: string;
  myResources: ResourceBag;
  onAccept: () => void;
  onFinalize: (withPlayerId: string) => void;
  onCancel: () => void;
}

// The active trade offer, shown to everyone. The proposer sees who accepted and
// picks one; others get an Accept button (enabled only if they can pay).
export function TradeBox({ trade, players, youId, myResources, onAccept, onFinalize, onCancel }: TradeBoxProps) {
  const proposer = players.find((p) => p.id === trade.from);
  const isProposer = trade.from === youId;
  const iCanAfford = RESOURCE_TYPES.every((r) => myResources[r] >= trade.receive[r]);
  const iAccepted = trade.acceptedBy.includes(youId);

  return (
    <div className="trade-box">
      <strong>Trade offer</strong>
      <div className="offer-line">
        <span style={{ color: proposer?.color, fontWeight: 600 }}>{proposer?.name}</span> gives{' '}
        <b>{bagText(trade.give)}</b> for <b>{bagText(trade.receive)}</b>
      </div>

      {isProposer ? (
        <div className="offer-actions">
          <span className="muted small">Accepted:</span>
          {trade.acceptedBy.length === 0 ? (
            <span className="muted small">nobody yet</span>
          ) : (
            trade.acceptedBy.map((id) => (
              <button key={id} className="mini" onClick={() => onFinalize(id)}>
                Trade with {players.find((p) => p.id === id)?.name}
              </button>
            ))
          )}
          <button className="mini link-button" onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <div className="offer-actions">
          {iAccepted ? (
            <span className="muted small">You accepted — waiting on {proposer?.name}…</span>
          ) : (
            <button className="mini" disabled={!iCanAfford} onClick={onAccept}>
              {iCanAfford ? 'Accept' : "Can't afford"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
