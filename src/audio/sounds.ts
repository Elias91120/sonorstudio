/**
 * The built-in sound library. Every sound is synthesized with Web Audio when the app starts,
 * so the app ships no third-party samples and needs no download.
 */

export type SoundCategory = 'Kicks' | 'Snares' | 'Claps & snaps' | 'Hats & cymbals' | 'Percussion' | '808s' | 'FX';

export interface SoundDef {
  id: string;
  name: string;
  category: SoundCategory;
  /** Rendered length in seconds. */
  dur: number;
  /** Peak level after normalization. */
  level: number;
  render: (ctx: BaseAudioContext, out: AudioNode) => void;
}

export const SOUND_CATEGORIES: SoundCategory[] = ['Kicks', 'Snares', 'Claps & snaps', 'Hats & cymbals', 'Percussion', '808s', 'FX'];

const C2 = 65.406;

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // xorshift32: the same seed always gives the same sound.
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

function noise(ctx: BaseAudioContext, seconds: number, seed: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, seed);
  src.start(0);
  return src;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(0);
  return o;
}

function amp(ctx: BaseAudioContext, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function filt(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function tanhCurve(k: number, size = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

function drive(ctx: BaseAudioContext, k: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  ws.curve = tanhCurve(k);
  ws.oversample = '2x';
  return ws;
}

function wire(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
}

/** Instant attack then exponential decay with time constant `tc`. */
function perc(p: AudioParam, peak: number, attack: number, tc: number, at = 0) {
  p.setValueAtTime(0, at);
  p.linearRampToValueAtTime(peak, at + attack);
  p.setTargetAtTime(0, at + attack, tc);
}

function pitchDrop(p: AudioParam, from: number, to: number, time: number, settle?: [number, number]) {
  p.setValueAtTime(from, 0);
  p.exponentialRampToValueAtTime(to, time);
  if (settle) p.exponentialRampToValueAtTime(settle[0], settle[1]);
}

function metal(ctx: BaseAudioContext, base: number): GainNode {
  const mix = amp(ctx, 1 / 6);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) osc(ctx, 'square', base * r).connect(mix);
  return mix;
}

function clapBursts(ctx: BaseAudioContext, out: AudioNode, seed: number, center: number, q: number, taps: number[], tail: number) {
  const n = noise(ctx, 0.8, seed);
  const g = amp(ctx);
  g.gain.setValueAtTime(0, 0);
  taps.forEach((t, i) => {
    const last = i === taps.length - 1;
    g.gain.setValueAtTime(last ? 1 : 0.85, t);
    if (!last) g.gain.exponentialRampToValueAtTime(0.08, t + 0.0095);
  });
  g.gain.setTargetAtTime(0, taps[taps.length - 1] + 0.001, tail);
  wire(n, filt(ctx, 'highpass', 600), filt(ctx, 'bandpass', center, q), g, out);
}

function kick(
  ctx: BaseAudioContext,
  out: AudioNode,
  o: { from: number; to: number; drop: number; settle: [number, number]; tc: number; attack: number; drive: number },
) {
  const s = osc(ctx, 'sine', o.from);
  pitchDrop(s.frequency, o.from, o.to, o.drop, o.settle);
  const g = amp(ctx);
  perc(g.gain, 1, o.attack, o.tc);
  wire(s, g, drive(ctx, o.drive), out);
}

function click(ctx: BaseAudioContext, out: AudioNode, seed: number, filter: BiquadFilterNode, level: number, tc: number) {
  const g = amp(ctx);
  perc(g.gain, level, 0.0004, tc);
  wire(noise(ctx, 0.05, seed), filter, g, out);
}

function bass808(ctx: BaseAudioContext, out: AudioNode, punch: number, drop: number, tc: number, k: number) {
  const s = osc(ctx, 'sine', C2 * punch);
  pitchDrop(s.frequency, C2 * punch, C2, drop);
  const g = amp(ctx);
  perc(g.gain, 1, 0.002, tc);
  wire(s, g, drive(ctx, k), out);
}

export const SOUNDS: SoundDef[] = [
  {
    id: 'kick-808',
    name: 'Kick 808',
    category: 'Kicks',
    dur: 1.2,
    level: 0.95,
    render(ctx, out) {
      kick(ctx, out, { from: 165, to: 54, drop: 0.07, settle: [46, 0.8], tc: 0.3, attack: 0.002, drive: 1.5 });
      click(ctx, out, 7, filt(ctx, 'highpass', 1500), 0.35, 0.004);
    },
  },
  {
    id: 'kick-punch',
    name: 'Kick punch',
    category: 'Kicks',
    dur: 0.6,
    level: 0.95,
    render(ctx, out) {
      kick(ctx, out, { from: 280, to: 62, drop: 0.035, settle: [52, 0.3], tc: 0.11, attack: 0.001, drive: 2.4 });
      click(ctx, out, 8, filt(ctx, 'bandpass', 3500, 0.8), 0.6, 0.005);
    },
  },
  {
    id: 'kick-deep',
    name: 'Kick deep',
    category: 'Kicks',
    dur: 1.6,
    level: 0.95,
    render(ctx, out) {
      kick(ctx, out, { from: 120, to: 40, drop: 0.15, settle: [36, 1.2], tc: 0.45, attack: 0.004, drive: 1.1 });
    },
  },
  {
    id: 'kick-tight',
    name: 'Kick tight',
    category: 'Kicks',
    dur: 0.35,
    level: 0.95,
    render(ctx, out) {
      kick(ctx, out, { from: 320, to: 75, drop: 0.022, settle: [60, 0.2], tc: 0.06, attack: 0.0007, drive: 3 });
      click(ctx, out, 9, filt(ctx, 'highpass', 2000), 0.5, 0.003);
    },
  },
  {
    id: 'snare-808',
    name: 'Snare 808',
    category: 'Snares',
    dur: 0.45,
    level: 0.8,
    render(ctx, out) {
      const t1 = osc(ctx, 'triangle', 238);
      pitchDrop(t1.frequency, 238, 186, 0.03);
      const g1 = amp(ctx);
      perc(g1.gain, 0.7, 0.001, 0.045);
      wire(t1, g1, out);
      const g2 = amp(ctx);
      perc(g2.gain, 0.35, 0.001, 0.03);
      wire(osc(ctx, 'sine', 330), g2, out);
      const gn = amp(ctx);
      perc(gn.gain, 0.75, 0.001, 0.065);
      wire(noise(ctx, 0.5, 11), filt(ctx, 'highpass', 1800), filt(ctx, 'lowpass', 9500), gn, out);
    },
  },
  {
    id: 'snare-crack',
    name: 'Snare crack',
    category: 'Snares',
    dur: 0.4,
    level: 0.8,
    render(ctx, out) {
      const t = osc(ctx, 'triangle', 210);
      pitchDrop(t.frequency, 210, 180, 0.03);
      const g = amp(ctx);
      perc(g.gain, 0.55, 0.001, 0.035);
      wire(t, g, out);
      const gn = amp(ctx);
      perc(gn.gain, 0.9, 0.0008, 0.09);
      wire(noise(ctx, 0.4, 12), filt(ctx, 'highpass', 1100), drive(ctx, 2), gn, out);
    },
  },
  {
    id: 'snare-trap',
    name: 'Snare trap',
    category: 'Snares',
    dur: 0.6,
    level: 0.8,
    render(ctx, out) {
      const t = osc(ctx, 'sine', 200);
      pitchDrop(t.frequency, 200, 170, 0.04);
      const g = amp(ctx);
      perc(g.gain, 0.5, 0.001, 0.06);
      wire(t, g, out);
      const g1 = amp(ctx);
      perc(g1.gain, 0.85, 0.001, 0.14);
      wire(noise(ctx, 0.6, 13), filt(ctx, 'bandpass', 3200, 0.6), g1, out);
      const g2 = amp(ctx);
      perc(g2.gain, 0.3, 0.001, 0.2);
      wire(noise(ctx, 0.6, 14), filt(ctx, 'highpass', 6000), g2, out);
    },
  },
  {
    id: 'clap',
    name: 'Clap',
    category: 'Claps & snaps',
    dur: 0.6,
    level: 0.75,
    render(ctx, out) {
      clapBursts(ctx, out, 21, 1150, 0.9, [0, 0.011, 0.022, 0.032], 0.065);
    },
  },
  {
    id: 'clap-wide',
    name: 'Clap wide',
    category: 'Claps & snaps',
    dur: 0.7,
    level: 0.75,
    render(ctx, out) {
      clapBursts(ctx, out, 22, 1500, 0.7, [0, 0.008, 0.019, 0.027, 0.036], 0.09);
    },
  },
  {
    id: 'snap',
    name: 'Finger snap',
    category: 'Claps & snaps',
    dur: 0.2,
    level: 0.6,
    render(ctx, out) {
      const hp = filt(ctx, 'highpass', 800);
      hp.connect(out);
      const gn = amp(ctx);
      perc(gn.gain, 1, 0.0005, 0.018);
      wire(noise(ctx, 0.2, 23), filt(ctx, 'bandpass', 2300, 3.5), gn, hp);
      const gt = amp(ctx);
      perc(gt.gain, 0.25, 0.0003, 0.004);
      wire(osc(ctx, 'sine', 1800), gt, hp);
    },
  },
  {
    id: 'hat-closed',
    name: 'Hat closed',
    category: 'Hats & cymbals',
    dur: 0.25,
    level: 0.45,
    render(ctx, out) {
      const g = amp(ctx);
      perc(g.gain, 1, 0.0005, 0.016);
      wire(metal(ctx, 40), filt(ctx, 'bandpass', 10000, 0.8), filt(ctx, 'highpass', 7000), g, out);
      const ga = amp(ctx);
      perc(ga.gain, 0.25, 0.0005, 0.012);
      wire(noise(ctx, 0.25, 31), filt(ctx, 'highpass', 9000), ga, out);
    },
  },
  {
    id: 'hat-open',
    name: 'Hat open',
    category: 'Hats & cymbals',
    dur: 0.9,
    level: 0.42,
    render(ctx, out) {
      const g = amp(ctx);
      perc(g.gain, 1, 0.0005, 0.11);
      wire(metal(ctx, 40), filt(ctx, 'bandpass', 10000, 0.8), filt(ctx, 'highpass', 7000), g, out);
      const ga = amp(ctx);
      perc(ga.gain, 0.25, 0.0005, 0.09);
      wire(noise(ctx, 0.9, 32), filt(ctx, 'highpass', 9000), ga, out);
    },
  },
  {
    id: 'hat-tick',
    name: 'Hat tick',
    category: 'Hats & cymbals',
    dur: 0.12,
    level: 0.4,
    render(ctx, out) {
      const g = amp(ctx);
      perc(g.gain, 1, 0.0003, 0.006);
      wire(noise(ctx, 0.12, 33), filt(ctx, 'highpass', 9500), filt(ctx, 'bandpass', 12000, 1), g, out);
    },
  },
  {
    id: 'ride',
    name: 'Ride',
    category: 'Hats & cymbals',
    dur: 2.2,
    level: 0.38,
    render(ctx, out) {
      const g = amp(ctx);
      perc(g.gain, 0.8, 0.001, 0.45);
      wire(metal(ctx, 58), filt(ctx, 'bandpass', 7000, 1.2), filt(ctx, 'highpass', 5000), g, out);
      const gp = amp(ctx);
      perc(gp.gain, 0.18, 0.001, 0.35);
      wire(osc(ctx, 'sine', 3150), gp, out);
      const gn = amp(ctx);
      perc(gn.gain, 0.2, 0.001, 0.3);
      wire(noise(ctx, 2.2, 34), filt(ctx, 'highpass', 8000), gn, out);
    },
  },
  {
    id: 'crash',
    name: 'Crash',
    category: 'Hats & cymbals',
    dur: 3,
    level: 0.4,
    render(ctx, out) {
      const gn = amp(ctx);
      perc(gn.gain, 0.9, 0.002, 0.7);
      wire(noise(ctx, 3, 35), filt(ctx, 'highpass', 4000), gn, out);
      const gm = amp(ctx);
      perc(gm.gain, 0.5, 0.002, 0.55);
      wire(metal(ctx, 47), filt(ctx, 'highpass', 6000), gm, out);
    },
  },
  {
    id: 'rim',
    name: 'Rim',
    category: 'Percussion',
    dur: 0.15,
    level: 0.55,
    render(ctx, out) {
      const hp = filt(ctx, 'highpass', 300);
      hp.connect(out);
      const g1 = amp(ctx);
      perc(g1.gain, 0.6, 0.0003, 0.008);
      wire(osc(ctx, 'triangle', 1750), g1, hp);
      const g2 = amp(ctx);
      perc(g2.gain, 0.5, 0.0003, 0.012);
      wire(osc(ctx, 'sine', 480), g2, hp);
      const g3 = amp(ctx);
      perc(g3.gain, 0.5, 0.0002, 0.004);
      wire(noise(ctx, 0.15, 41), filt(ctx, 'bandpass', 2500, 1.5), g3, hp);
    },
  },
  {
    id: 'tom-low',
    name: 'Tom low',
    category: 'Percussion',
    dur: 0.8,
    level: 0.8,
    render(ctx, out) {
      const s = osc(ctx, 'sine', 165);
      pitchDrop(s.frequency, 165, 92, 0.3);
      const g = amp(ctx);
      perc(g.gain, 1, 0.002, 0.17);
      wire(s, g, out);
      click(ctx, out, 42, filt(ctx, 'lowpass', 2000), 0.15, 0.01);
    },
  },
  {
    id: 'tom-high',
    name: 'Tom high',
    category: 'Percussion',
    dur: 0.6,
    level: 0.8,
    render(ctx, out) {
      const s = osc(ctx, 'sine', 270);
      pitchDrop(s.frequency, 270, 170, 0.25);
      const g = amp(ctx);
      perc(g.gain, 1, 0.002, 0.12);
      wire(s, g, out);
      click(ctx, out, 43, filt(ctx, 'lowpass', 3000), 0.12, 0.008);
    },
  },
  {
    id: 'cowbell',
    name: 'Cowbell',
    category: 'Percussion',
    dur: 0.6,
    level: 0.5,
    render(ctx, out) {
      const mix = amp(ctx, 0.5);
      osc(ctx, 'square', 540).connect(mix);
      osc(ctx, 'square', 800).connect(mix);
      const g = amp(ctx);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 0.001);
      g.gain.exponentialRampToValueAtTime(0.35, 0.02);
      g.gain.setTargetAtTime(0, 0.02, 0.12);
      wire(mix, filt(ctx, 'bandpass', 1050, 0.7), filt(ctx, 'highpass', 400), g, out);
    },
  },
  {
    id: 'shaker',
    name: 'Shaker',
    category: 'Percussion',
    dur: 0.25,
    level: 0.4,
    render(ctx, out) {
      const g = amp(ctx);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(0.9, 0.018);
      g.gain.setTargetAtTime(0, 0.02, 0.035);
      wire(noise(ctx, 0.25, 44), filt(ctx, 'bandpass', 6500, 1.1), g, out);
    },
  },
  {
    id: 'conga',
    name: 'Conga',
    category: 'Percussion',
    dur: 0.45,
    level: 0.65,
    render(ctx, out) {
      const s = osc(ctx, 'sine', 360);
      pitchDrop(s.frequency, 360, 310, 0.04);
      const g = amp(ctx);
      perc(g.gain, 1, 0.001, 0.09);
      wire(s, g, out);
      const g2 = amp(ctx);
      perc(g2.gain, 0.15, 0.001, 0.02);
      wire(osc(ctx, 'triangle', 720), g2, out);
    },
  },
  {
    id: 'blip',
    name: 'Blip',
    category: 'Percussion',
    dur: 0.3,
    level: 0.5,
    render(ctx, out) {
      const car = osc(ctx, 'sine', 880);
      const mod = osc(ctx, 'sine', 1320);
      const depth = amp(ctx);
      depth.gain.setValueAtTime(800, 0);
      depth.gain.setTargetAtTime(0, 0, 0.03);
      wire(mod, depth);
      depth.connect(car.frequency);
      const g = amp(ctx);
      perc(g.gain, 0.8, 0.001, 0.06);
      wire(car, g, out);
    },
  },
  {
    id: '808-classic',
    name: '808 classic',
    category: '808s',
    dur: 2.6,
    level: 0.95,
    render(ctx, out) {
      bass808(ctx, out, 2.4, 0.045, 0.6, 1.6);
    },
  },
  {
    id: '808-dirty',
    name: '808 dirty',
    category: '808s',
    dur: 2.2,
    level: 0.9,
    render(ctx, out) {
      const lp = filt(ctx, 'lowpass', 3500);
      lp.connect(out);
      bass808(ctx, lp, 3, 0.06, 0.5, 5);
    },
  },
  {
    id: '808-long',
    name: '808 long',
    category: '808s',
    dur: 3.6,
    level: 0.95,
    render(ctx, out) {
      bass808(ctx, out, 2, 0.04, 1.1, 1.3);
    },
  },
  {
    id: 'riser',
    name: 'Noise riser',
    category: 'FX',
    dur: 3,
    level: 0.55,
    render(ctx, out) {
      const bp = filt(ctx, 'bandpass', 300, 3);
      bp.frequency.setValueAtTime(300, 0);
      bp.frequency.exponentialRampToValueAtTime(9000, 2.9);
      const g = amp(ctx);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 2.85);
      g.gain.linearRampToValueAtTime(0, 3);
      wire(noise(ctx, 3, 51), bp, g, out);
    },
  },
  {
    id: 'downlifter',
    name: 'Downlifter',
    category: 'FX',
    dur: 2,
    level: 0.5,
    render(ctx, out) {
      const lp = filt(ctx, 'lowpass', 9000);
      lp.frequency.setValueAtTime(9000, 0);
      lp.frequency.exponentialRampToValueAtTime(150, 1.9);
      const g = amp(ctx);
      g.gain.setValueAtTime(1, 0);
      g.gain.setTargetAtTime(0, 0.05, 0.5);
      wire(noise(ctx, 2, 52), lp, g, out);
    },
  },
  {
    id: 'impact',
    name: 'Impact',
    category: 'FX',
    dur: 3,
    level: 0.85,
    render(ctx, out) {
      const s = osc(ctx, 'sine', 95);
      pitchDrop(s.frequency, 95, 30, 0.7);
      const g = amp(ctx);
      perc(g.gain, 1, 0.002, 0.7);
      wire(s, g, drive(ctx, 2), out);
      const gn = amp(ctx);
      perc(gn.gain, 0.6, 0.001, 0.35);
      wire(noise(ctx, 3, 53), filt(ctx, 'lowpass', 900), gn, out);
    },
  },
  {
    id: 'zap',
    name: 'Zap',
    category: 'FX',
    dur: 0.35,
    level: 0.5,
    render(ctx, out) {
      const s = osc(ctx, 'sine', 3200);
      pitchDrop(s.frequency, 3200, 90, 0.22);
      const g = amp(ctx);
      perc(g.gain, 0.9, 0.001, 0.07);
      wire(s, g, out);
    },
  },
];

export const SOUNDS_BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

async function renderOne(s: SoundDef, sampleRate: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(s.dur * sampleRate), sampleRate);
  const out = ctx.createGain();
  // Short fade so the cut at the end of the buffer never clicks.
  out.gain.setValueAtTime(1, Math.max(0, s.dur - 0.015));
  out.gain.linearRampToValueAtTime(0, s.dur);
  out.connect(ctx.destination);
  s.render(ctx, out);
  const buf = await ctx.startRendering();
  normalize(buf, s.level);
  return buf;
}

function normalize(buf: AudioBuffer, level: number) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak === 0) return;
  const k = level / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

export async function renderSounds(sampleRate = 44100): Promise<Map<string, AudioBuffer>> {
  const rendered = await Promise.all(SOUNDS.map(async (s) => [s.id, await renderOne(s, sampleRate)] as const));
  return new Map(rendered);
}
