import { countPlaced, PIECE_LIMITS, type Board } from '@catan/shared';

export interface InventoryProps {
  board: Board;
  playerId: string;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
}

// Remaining buildable pieces (only the ones you placed — captured ones don't
// refund your pool), plus any bonus VP awards the player holds.
export function Inventory({ board, playerId, hasLongestRoad, hasLargestArmy }: InventoryProps) {
  const placed = countPlaced(board, playerId);
  return (
    <div className="inventory">
      <span className="inv-item">🛣️ Roads {PIECE_LIMITS.roads - placed.roads}/{PIECE_LIMITS.roads}</span>
      <span className="inv-item">🏠 Settlements {PIECE_LIMITS.settlements - placed.settlements}/{PIECE_LIMITS.settlements}</span>
      <span className="inv-item">🏙️ Cities {PIECE_LIMITS.cities - placed.cities}/{PIECE_LIMITS.cities}</span>
      {hasLongestRoad && <span className="inv-item award">🛣️ Longest Road (+2 VP)</span>}
      {hasLargestArmy && <span className="inv-item award">⚔️ Largest Army (+2 VP)</span>}
    </div>
  );
}
