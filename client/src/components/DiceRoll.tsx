const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Small static dice shown in the header (current result). The animated roll is
// handled separately by DiceOverlay.
export function DiceRoll({ die1, die2 }: { die1: number; die2: number }) {
  return (
    <span className="dice">
      <span className="die">{FACES[die1]}</span>
      <span className="die">{FACES[die2]}</span>
      <span className="dice-total">= {die1 + die2}</span>
    </span>
  );
}
