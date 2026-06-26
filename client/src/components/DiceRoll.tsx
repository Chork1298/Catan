import { useEffect, useState } from 'react';

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export interface DiceRollProps {
  die1: number;
  die2: number;
  /** Changes whenever a new roll happens; drives the shuffle animation. */
  rollKey: string;
}

// Shows two dice. On each new roll, the faces shuffle briefly then settle on the
// real result (and only then reveal the total).
export function DiceRoll({ die1, die2, rollKey }: DiceRollProps) {
  const [faces, setFaces] = useState<[number, number]>([die1, die2]);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    setRolling(true);
    let ticks = 0;
    const iv = setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      if (++ticks >= 9) {
        clearInterval(iv);
        setFaces([die1, die2]);
        setRolling(false);
      }
    }, 60);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey]);

  return (
    <span className="dice">
      <span className={`die ${rolling ? 'shaking' : ''}`}>{FACES[faces[0]]}</span>
      <span className={`die ${rolling ? 'shaking' : ''}`}>{FACES[faces[1]]}</span>
      <span className="dice-total">{rolling ? '…' : `= ${die1 + die2}`}</span>
    </span>
  );
}
