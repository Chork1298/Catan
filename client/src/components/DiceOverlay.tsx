import { useEffect, useState } from 'react';

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export interface DiceOverlayProps {
  die1: number;
  die2: number;
  /** Called when the whole animation is finished so the parent can unmount it. */
  onDone: () => void;
}

// Big centered dice roll: shuffles in the middle of the screen, settles on the
// result, then shrinks up toward the board and disappears.
export function DiceOverlay({ die1, die2, onDone }: DiceOverlayProps) {
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  const [stage, setStage] = useState<'shuffle' | 'settle' | 'shrink'>('shuffle');

  // Shuffle phase.
  useEffect(() => {
    let ticks = 0;
    const iv = setInterval(() => {
      setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
      if (++ticks >= 10) {
        clearInterval(iv);
        setFaces([die1, die2]);
        setStage('settle');
      }
    }, 70);
    return () => clearInterval(iv);
  }, [die1, die2]);

  // Settle -> shrink -> done.
  useEffect(() => {
    if (stage === 'settle') {
      const t = setTimeout(() => setStage('shrink'), 850);
      return () => clearTimeout(t);
    }
    if (stage === 'shrink') {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
  }, [stage, onDone]);

  return (
    <div className="dice-overlay-wrap">
      <div className={`dice-overlay ${stage}`}>
        <span className="big-die">{FACES[faces[0]]}</span>
        <span className="big-die">{FACES[faces[1]]}</span>
        {stage !== 'shuffle' && <span className="big-total">{die1 + die2}</span>}
      </div>
    </div>
  );
}
