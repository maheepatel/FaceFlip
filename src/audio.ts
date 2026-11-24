// Tiny synthesised sound kit (no audio files).
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('ff-muted') === '1'; } catch { return false; } })();

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('ff-muted', m ? '1' : '0'); } catch { /* ignore */ }
}

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, glideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, when = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  knock() { // wooden cube tumble
    tone(240 + Math.random() * 40, 0.07, 'triangle', 0.22);
    noise(0.05, 0.25, 1800, 2);
  },
  spin() {
    tone(420 + Math.random() * 30, 0.05, 'triangle', 0.14);
    noise(0.04, 0.12, 3200, 3);
  },
  swap() {
    tone(330, 0.08, 'triangle', 0.18);
    tone(495, 0.09, 'triangle', 0.15, 0.06);
  },
  bell() { // desk bell
    tone(1975, 1.4, 'sine', 0.28);
    tone(2637, 0.9, 'sine', 0.12);
    tone(4186, 0.35, 'sine', 0.05);
    noise(0.02, 0.3, 6000, 1);
  },
  buzz() {
    tone(140, 0.35, 'sawtooth', 0.12, 0, 90);
    tone(147, 0.35, 'square', 0.06, 0, 92);
  },
  flip() {
    noise(0.14, 0.35, 2400, 0.8);
  },
  point() {
    [784, 988, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, i * 0.07));
  },
  lose() {
    [392, 330].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.12));
  },
  fanfare() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, 'triangle', 0.17, i * 0.11));
  },
  tick() {
    tone(1200, 0.03, 'square', 0.05);
  },
};
