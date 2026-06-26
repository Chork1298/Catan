// A tiny "ding" using the Web Audio API — no audio file needed. Used to alert a
// player when it becomes their turn.
//
// Browsers forbid starting an AudioContext before the user interacts with the
// page, so we don't create/resume it until the first gesture. Until then, dings
// are silently skipped (no console warning).
let ctx: AudioContext | null = null;
let primed = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

// Create + resume the AudioContext on the first user gesture.
if (typeof window !== 'undefined') {
  const prime = () => {
    primed = true;
    const c = getCtx();
    if (c && c.state === 'suspended') void c.resume();
    window.removeEventListener('pointerdown', prime);
    window.removeEventListener('keydown', prime);
  };
  window.addEventListener('pointerdown', prime, { once: true });
  window.addEventListener('keydown', prime, { once: true });
}

export function playDing(): void {
  if (!primed) return; // no gesture yet — skip silently to avoid the autoplay warning
  try {
    const c = getCtx();
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1320, now + 0.09); // a quick lift
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  } catch {
    // Audio is best-effort; never let it break the game.
  }
}
