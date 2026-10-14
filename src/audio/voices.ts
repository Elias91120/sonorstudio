import { ROOT_KEY, velToGain } from '../core/project';
import type { Channel, SynthParams } from '../core/types';
import type { AudioGraph } from './graph';
import { getSound } from './soundBank';

export interface Voice {
  start: number;
  /** When the voice is silent and can be forgotten. */
  end: number;
  /** Note off: lets the envelope release. */
  release(at: number): void;
  /** Hard stop with a few milliseconds of fade. */
  kill(at: number): void;
}

const KILL_FADE = 0.006;

export function playSample(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  at: number,
  rate: number,
  gain: number,
): Voice {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const out = ctx.createGain();
  out.gain.value = gain;
  src.connect(out).connect(dest);
  src.start(at);
  let killedAt = Infinity;
  const voice: Voice = {
    start: at,
    end: at + buffer.duration / rate,
    // Samples play to their end, like FL Studio's sampler without an envelope.
    release() {},
    kill(t) {
      const when = Math.max(t, at);
      if (when >= killedAt) return;
      killedAt = when;
      out.gain.cancelScheduledValues(0);
      out.gain.setValueAtTime(gain, when);
      out.gain.linearRampToValueAtTime(0, when + KILL_FADE);
      try {
        src.stop(when + KILL_FADE + 0.002);
      } catch {
        // Already stopped.
      }
      voice.end = Math.min(voice.end, when + KILL_FADE + 0.002);
    },
  };
  return voice;
}

export function playSynth(ctx: BaseAudioContext, p: SynthParams, dest: AudioNode, at: number, key: number, vel: number): Voice {
  const f0 = 440 * 2 ** ((key - 69) / 12);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = p.resonance;
  const env = ctx.createGain();
  env.gain.value = 0;
  // Separate gains for note-off and kill so their automation never collides with the envelope.
  const rel = ctx.createGain();
  const kill = ctx.createGain();
  const totalLevel = p.osc.reduce((sum, o) => sum + Math.max(0, o.level), 0);
  rel.gain.value = (velToGain(vel) * 0.3) / Math.max(1, totalLevel);
  const oscs: OscillatorNode[] = [];
  for (const o of p.osc) {
    if (o.level <= 0) continue;
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    osc.frequency.value = f0 * 2 ** (o.coarse / 12);
    osc.detune.value = o.fine;
    const g = ctx.createGain();
    g.gain.value = o.level;
    osc.connect(g).connect(filter);
    osc.start(at);
    oscs.push(osc);
  }
  filter.connect(env).connect(rel).connect(kill).connect(dest);

  const attack = Math.max(0.002, p.attack);
  const decayTc = Math.max(0.005, p.decay) / 3;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(1, at + attack);
  env.gain.setTargetAtTime(p.sustain, at + attack, decayTc);

  const base = Math.max(30, p.cutoff);
  const peak = Math.min(20000, base * 2 ** (p.envAmount * 5));
  filter.frequency.setValueAtTime(base, at);
  filter.frequency.linearRampToValueAtTime(peak, at + attack);
  filter.frequency.setTargetAtTime(base, at + attack, decayTc);

  let releasedAt = Infinity;
  let killedAt = Infinity;
  const stopAll = (t: number) => {
    for (const o of oscs) {
      try {
        o.stop(t);
      } catch {
        // Already stopped.
      }
    }
  };
  const voice: Voice = {
    start: at,
    end: Infinity,
    release(t) {
      const when = Math.max(t, at + 0.003);
      if (when >= releasedAt || killedAt !== Infinity) return;
      releasedAt = when;
      const r = Math.max(0.01, p.release);
      rel.gain.setValueAtTime(rel.gain.value, when);
      rel.gain.setTargetAtTime(0, when, r / 4);
      voice.end = when + r * 1.6 + 0.05;
      stopAll(voice.end);
    },
    kill(t) {
      const when = Math.max(t, at);
      if (when >= killedAt) return;
      killedAt = when;
      kill.gain.cancelScheduledValues(0);
      kill.gain.setValueAtTime(1, when);
      kill.gain.linearRampToValueAtTime(0, when + KILL_FADE);
      voice.end = Math.min(voice.end, when + KILL_FADE + 0.002);
      stopAll(voice.end);
    },
  };
  return voice;
}

export interface TriggerTarget {
  ctx: BaseAudioContext;
  graph: AudioGraph;
  /** Last voice per channel, for "cut itself". */
  lastVoice: Map<string, Voice>;
  voices?: Set<Voice>;
}

/** Starts a note on a channel. `dur` null means held until `release` is called. */
export function triggerNote(t: TriggerTarget, ch: Channel, key: number, vel: number, at: number, dur: number | null): Voice | null {
  const dest = t.graph.channelInput(ch.id);
  if (!dest) return null;
  let voice: Voice | null = null;
  if (ch.type === 'sampler' && ch.sampler) {
    const buf = getSound(ch.sampler.sampleId);
    if (!buf) return null;
    if (ch.sampler.cutItself) t.lastVoice.get(ch.id)?.kill(at);
    const rate = 2 ** ((key - ROOT_KEY + ch.sampler.pitch) / 12);
    voice = playSample(t.ctx, buf, dest, at, rate, velToGain(vel));
    t.lastVoice.set(ch.id, voice);
  } else if (ch.type === 'synth' && ch.synth) {
    voice = playSynth(t.ctx, ch.synth, dest, at, key, vel);
    if (dur !== null) voice.release(at + dur);
  }
  if (voice) t.voices?.add(voice);
  return voice;
}
