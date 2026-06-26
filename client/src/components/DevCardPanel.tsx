import type { DevCard, DevCardType } from '@catan/shared';

const LABEL: Record<DevCardType, string> = {
  knight: 'Knight',
  roadBuilding: 'Road Building',
  yearOfPlenty: 'Year of Plenty',
  monopoly: 'Monopoly',
  victoryPoint: 'Victory Point',
};

// Hover text explaining what each card does.
const DESC: Record<DevCardType, string> = {
  knight: 'Move the robber and steal a card. 3 played = Largest Army (+2 VP).',
  roadBuilding: 'Place 2 roads for free.',
  yearOfPlenty: 'Take any 2 resources from the bank.',
  monopoly: 'Name a resource; every other player gives you all of theirs.',
  victoryPoint: 'Worth 1 victory point. Kept secret until you win.',
};

export interface DevCardPanelProps {
  cards: DevCard[];
  turnNumber: number;
  canPlay: boolean;
  canBuy: boolean;
  onBuy: () => void;
  onPlay: (type: DevCardType) => void;
}

// Your development-card hand: buy one, or play a playable one. Hover for details.
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
        <button className="mini" disabled={!canBuy} onClick={onBuy} title="Costs 1 sheep, 1 wheat, 1 ore">
          Buy (🐑🌾⛰️)
        </button>
      </div>
      {cards.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <ul className="dev-list">
          {[...counts.entries()].map(([type, { total, playable }]) => (
            <li key={type} title={DESC[type]}>
              <span>{LABEL[type]} ×{total}</span>
              {type !== 'victoryPoint' && (
                <button className="mini" disabled={!canPlay || playable === 0} onClick={() => onPlay(type)}>
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
