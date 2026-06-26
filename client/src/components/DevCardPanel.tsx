import type { DevCard, DevCardType } from '@catan/shared';

const LABEL: Record<DevCardType, string> = {
  knight: 'Knight',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
  victoryPoint: 'Victory Point',
};

export interface DevCardPanelProps {
  cards: DevCard[];
  turnNumber: number;
  canPlay: boolean; // your turn, haven't played a card this turn
  canBuy: boolean;
  onBuy: () => void;
  onPlay: (type: DevCardType) => void;
}

// Your development-card hand: buy one, or play a playable one.
export function DevCardPanel({ cards, turnNumber, canPlay, canBuy, onBuy, onPlay }: DevCardPanelProps) {
  const counts = new Map<DevCardType, { total: number; playable: number }>();
  for (const c of cards) {
    const entry = counts.get(c.type) ?? { total: 0, playable: 0 };
    entry.total += 1;
    if (c.boughtOnTurn < turnNumber && c.type !== 'victoryPoint') entry.playable += 1;
    counts.set(c.type, entry);
  }

  return (
    <div className="dev-panel">
      <div className="dev-head">
        <strong>Dev cards</strong>
        <button disabled={!canBuy} onClick={onBuy}>Buy (🐑🌾⛰️)</button>
      </div>
      {cards.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="dev-list">
          {[...counts.entries()].map(([type, { total, playable }]) => (
            <li key={type}>
              {LABEL[type]} ×{total}
              {type !== 'victoryPoint' && (
                <button
                  className="mini"
                  disabled={!canPlay || playable === 0}
                  onClick={() => onPlay(type)}
                >
                  Play
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
