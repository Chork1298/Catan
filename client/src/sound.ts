// A tiny "ding" using the Web Audio API — no audio file needed. Used to alert a
// player when it becomes their turn.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function playDing(): void {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
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

// ----- War "heavy metal" synth fallback (used when no bundled track is present) -----

let riffTimer: ReturnType<typeof setInterval> | null = null;
let distortion: WaveShaperNode | null = null;

function makeDistortion(c: AudioContext): WaveShaperNode {
  const ws = c.createWaveShaper();
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + 12) * x) / (Math.PI + 12 * Math.abs(x)); // soft-clip overdrive
  }
  ws.curve = curve;
  ws.oversample = '4x';
  return ws;
}

/** Start a looping, gritty power-chord riff (palm-muted-ish driving 8ths). */
export function startWarRiff(): void {
  try {
    const c = getCtx();
    if (!c || riffTimer) return;
    if (c.state === 'suspended') void c.resume();
    distortion = makeDistortion(c);
    distortion.connect(c.destination);
    const roots = [82.41, 82.41, 110, 98]; // E2 E2 A2 G2 — a chuggy progression
    let step = 0;
    const hit = () => {
      const c2 = getCtx();
      if (!c2 || !distortion) return;
      const now = c2.currentTime;
      const root = roots[step % roots.length];
      step++;
      for (const f of [root, root * 1.5]) { // root + fifth = power chord
        const o = c2.createOscillator();
        const g = c2.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        o.connect(g);
        g.connect(distortion);
        o.start(now);
        o.stop(now + 0.24);
      }
    };
    hit();
    riffTimer = setInterval(hit, 260);
  } catch {
    /* best-effort */
  }
}

export function stopWarRiff(): void {
  if (riffTimer) { clearInterval(riffTimer); riffTimer = null; }
  if (distortion) { try { distortion.disconnect(); } catch { /* ignore */ } distortion = null; }
}
