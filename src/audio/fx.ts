import { dbToGain } from '../core/project';
import { STEP, secondsPerTick } from '../core/time';
import type { FxSlot, FxType } from '../core/types';
import { tanhCurve } from './sounds';

export interface FxNode {
  input: AudioNode;
  output: AudioNode;
  update(params: Record<string, number>, bpm: number, immediate?: boolean): void;
  dispose(): void;
}

const isOffline = (ctx: BaseAudioContext) =>
  typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

/** Sets a parameter, gliding briefly on a live context to avoid zipper noise. */
export function setParam(ctx: BaseAudioContext, p: AudioParam, v: number, immediate = false) {
  if (!Number.isFinite(v)) return;
  if (immediate || isOffline(ctx)) {
    p.cancelScheduledValues(0);
    p.value = v;
  } else {
    p.setTargetAtTime(v, ctx.currentTime, 0.012);
  }
}

function gainNode(ctx: BaseAudioContext, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function disconnectAll(...nodes: AudioNode[]) {
  for (const n of nodes) n.disconnect();
}

function eq(ctx: BaseAudioContext): FxNode {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 110;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 7500;
  low.connect(mid).connect(high);
  return {
    input: low,
    output: high,
    update(p, _bpm, now) {
      setParam(ctx, low.gain, p.low, now);
      setParam(ctx, mid.gain, p.mid, now);
      setParam(ctx, mid.frequency, p.midFreq, now);
      setParam(ctx, high.gain, p.high, now);
    },
    dispose: () => disconnectAll(low, mid, high),
  };
}

const FILTER_MODES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];

function filter(ctx: BaseAudioContext): FxNode {
  const f = ctx.createBiquadFilter();
  return {
    input: f,
    output: f,
    update(p, _bpm, now) {
      const type = FILTER_MODES[Math.round(p.mode)] ?? 'lowpass';
      if (f.type !== type) f.type = type;
      setParam(ctx, f.frequency, p.cutoff, now);
      setParam(ctx, f.Q, p.q, now);
    },
    dispose: () => f.disconnect(),
  };
}

function drive(ctx: BaseAudioContext): FxNode {
  const input = gainNode(ctx);
  const dry = gainNode(ctx, 0);
  const wet = gainNode(ctx);
  const out = gainNode(ctx);
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '4x';
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  input.connect(dry).connect(out);
  input.connect(shaper).connect(tone).connect(wet).connect(out);
  let amount = -1;
  return {
    input,
    output: out,
    update(p, _bpm, now) {
      if (p.drive !== amount) {
        amount = p.drive;
        shaper.curve = tanhCurve(1 + amount * 20);
      }
      setParam(ctx, tone.frequency, p.tone, now);
      setParam(ctx, wet.gain, p.mix, now);
      setParam(ctx, dry.gain, 1 - p.mix, now);
      setParam(ctx, out.gain, dbToGain(p.out), now);
    },
    dispose: () => disconnectAll(input, dry, wet, out, shaper, tone),
  };
}

function compressor(ctx: BaseAudioContext): FxNode {
  const c = ctx.createDynamicsCompressor();
  c.knee.value = 6;
  const makeup = gainNode(ctx);
  c.connect(makeup);
  return {
    input: c,
    output: makeup,
    update(p, _bpm, now) {
      setParam(ctx, c.threshold, p.threshold, now);
      setParam(ctx, c.ratio, p.ratio, now);
      setParam(ctx, c.attack, p.attack, now);
      setParam(ctx, c.release, p.release, now);
      setParam(ctx, makeup.gain, dbToGain(p.makeup), now);
    },
    dispose: () => disconnectAll(c, makeup),
  };
}

function delay(ctx: BaseAudioContext): FxNode {
  const input = gainNode(ctx);
  const dry = gainNode(ctx);
  const wet = gainNode(ctx);
  const out = gainNode(ctx);
  const line = ctx.createDelay(4);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  const feedback = gainNode(ctx);
  input.connect(dry).connect(out);
  input.connect(line);
  line.connect(tone);
  tone.connect(feedback).connect(line);
  tone.connect(wet).connect(out);
  return {
    input,
    output: out,
    update(p, bpm, now) {
      setParam(ctx, line.delayTime, Math.min(3.9, p.steps * STEP * secondsPerTick(bpm)), now);
      setParam(ctx, feedback.gain, p.feedback, now);
      setParam(ctx, tone.frequency, p.tone, now);
      setParam(ctx, wet.gain, p.mix, now);
    },
    dispose: () => disconnectAll(input, dry, wet, out, line, tone, feedback),
  };
}

/** Decaying stereo noise, low-passed by `damp`, reaching -60 dB after `seconds`. */
function impulse(ctx: BaseAudioContext, seconds: number, damp: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const pre = Math.floor(rate * 0.012);
  const buf = ctx.createBuffer(2, length + pre, rate);
  const a = 1 - Math.exp((-2 * Math.PI * damp) / rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let s = ((c + 1) * 2654435761) >>> 0;
    let y = 0;
    for (let i = 0; i < length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      y += a * (((s >>> 0) / 4294967296) * 2 - 1 - y);
      d[pre + i] = y * Math.exp((-6.9 * i) / length);
    }
  }
  return buf;
}

function reverb(ctx: BaseAudioContext): FxNode {
  const input = gainNode(ctx);
  const dry = gainNode(ctx);
  const wet = gainNode(ctx);
  const out = gainNode(ctx);
  const conv = ctx.createConvolver();
  input.connect(dry).connect(out);
  input.connect(conv).connect(wet).connect(out);
  let size = -1;
  let damp = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = () => {
    conv.buffer = impulse(ctx, size, damp);
  };
  return {
    input,
    output: out,
    update(p, _bpm, now) {
      setParam(ctx, wet.gain, p.mix, now);
      if (p.size === size && p.damp === damp) return;
      size = p.size;
      damp = p.damp;
      clearTimeout(timer);
      // Regenerating the impulse is the costly part: wait until a knob drag settles.
      if (now || isOffline(ctx)) rebuild();
      else timer = setTimeout(rebuild, 120);
    },
    dispose() {
      clearTimeout(timer);
      disconnectAll(input, dry, wet, out, conv);
    },
  };
}

/**
 * Linear up to 2 dB under the ceiling, then bends smoothly towards it. The curve spans
 * -2..2 (the shaper input is halved) so overs up to +6 dB are rounded off, not cut flat.
 */
function softClipCurve(ceiling: number, size = 4096): Float32Array<ArrayBuffer> {
  const knee = ceiling * 0.8;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u = ((i / (size - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    curve[i] = Math.sign(u) * y;
  }
  return curve;
}

const LIMIT_RATIO = 20;

/** A fast compressor catches the body of the peaks; a soft clipper guarantees the ceiling. */
function limiter(ctx: BaseAudioContext): FxNode {
  const pre = gainNode(ctx);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 0;
  comp.ratio.value = LIMIT_RATIO;
  comp.attack.value = 0.001;
  comp.release.value = 0.1;
  const makeup = gainNode(ctx);
  const half = gainNode(ctx, 0.5);
  const clip = ctx.createWaveShaper();
  clip.oversample = '4x';
  pre.connect(comp).connect(makeup).connect(half).connect(clip);
  let ceiling = Number.NaN;
  return {
    input: pre,
    output: clip,
    update(p, _bpm, now) {
      const threshold = p.ceiling - 2;
      setParam(ctx, pre.gain, dbToGain(p.gain), now);
      setParam(ctx, comp.threshold, threshold, now);
      // Web Audio's compressor adds its own make-up gain (0.6 power of the full-range
      // reduction); take it back so the limiter doesn't make the mix louder by itself.
      setParam(ctx, makeup.gain, dbToGain(0.6 * threshold * (1 - 1 / LIMIT_RATIO)), now);
      if (p.ceiling !== ceiling) {
        ceiling = p.ceiling;
        clip.curve = softClipCurve(dbToGain(ceiling));
      }
    },
    dispose: () => disconnectAll(pre, comp, makeup, half, clip),
  };
}

const BUILDERS: Record<FxType, (ctx: BaseAudioContext) => FxNode> = {
  eq,
  filter,
  drive,
  compressor,
  delay,
  reverb,
  limiter,
};

export function createFx(ctx: BaseAudioContext, slot: FxSlot, bpm: number): FxNode {
  const node = BUILDERS[slot.type](ctx);
  node.update(slot.params, bpm, true);
  return node;
}
