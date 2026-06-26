import { countBuildings, countRoads, PIECE_LIMITS, type Board } from '@catan/shared';

// Remaining buildable pieces for a player (limit minus what's on the board).
export function Inventory({ board, playerId }: { board: Board; playerId: string }) {
  const built = countBuildings(board, playerId);
  const roads = countRoads(board, playerId);
  return (
    <div className="inventory">
      <span className="inv-item">🛣️ Roads {PIECE_LIMITS.roads - roads}/{PIECE_LIMITS.roads}</span>
      <span className="inv-item">🏠 Settlements {PIECE_LIMITS.settlements - built.settlements}/{PIECE_LIMITS.settlements}</span>
      <span className="inv-item">🏙️ Cities {PIECE_LIMITS.cities - built.cities}/{PIECE_LIMITS.cities}</span>
    </div>
  );
}
