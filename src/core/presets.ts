import type { OscParams, SynthParams, Wave } from './types';

const osc = (wave: Wave, coarse: number, fine: number, level: number): OscParams => ({ wave, coarse, fine, level });

export const SYNTH_PRESETS: Record<string, SynthParams> = {
  Pluck: {
    osc: [osc('sawtooth', 0, 0, 0.7), osc('square', 12, 0, 0.22), osc('sine', -12, 0, 0.35)],
    cutoff: 520,
    resonance: 3.5,
    envAmount: 0.85,
    attack: 0.001,
    decay: 0.24,
    sustain: 0,
    release: 0.2,
  },
  Keys: {
    osc: [osc('triangle', 0, 0, 0.75), osc('sine', 12, 3, 0.28), osc('sine', 0, -4, 0.4)],
    cutoff: 2600,
    resonance: 0.7,
    envAmount: 0.3,
    attack: 0.002,
    decay: 0.9,
    sustain: 0.28,
    release: 0.4,
  },
  'Soft pad': {
    osc: [osc('sawtooth', 0, -9, 0.45), osc('sawtooth', 0, 9, 0.45), osc('triangle', 12, 0, 0.3)],
    cutoff: 1300,
    resonance: 0.9,
    envAmount: 0.2,
    attack: 0.4,
    decay: 1.2,
    sustain: 0.75,
    release: 1.1,
  },
  'Saw lead': {
    osc: [osc('sawtooth', 0, -7, 0.6), osc('sawtooth', 0, 7, 0.6), osc('square', -12, 0, 0.3)],
    cutoff: 2800,
    resonance: 2,
    envAmount: 0.35,
    attack: 0.005,
    decay: 0.25,
    sustain: 0.7,
    release: 0.15,
  },
  'Square lead': {
    osc: [osc('square', 0, -4, 0.5), osc('square', 12, 4, 0.22), osc('sine', -12, 0, 0.3)],
    cutoff: 2200,
    resonance: 1.5,
    envAmount: 0.4,
    attack: 0.003,
    decay: 0.3,
    sustain: 0.6,
    release: 0.12,
  },
  'Sub bass': {
    osc: [osc('sine', -12, 0, 0.9), osc('triangle', -12, 0, 0.25), osc('sine', 0, 0, 0)],
    cutoff: 900,
    resonance: 0.7,
    envAmount: 0.1,
    attack: 0.004,
    decay: 0.3,
    sustain: 0.9,
    release: 0.08,
  },
  'Reese bass': {
    osc: [osc('sawtooth', -12, -14, 0.6), osc('sawtooth', -12, 14, 0.6), osc('sine', -24, 0, 0.4)],
    cutoff: 650,
    resonance: 3,
    envAmount: 0.15,
    attack: 0.01,
    decay: 0.5,
    sustain: 0.85,
    release: 0.2,
  },
  Bell: {
    osc: [osc('sine', 0, 0, 0.6), osc('sine', 19, 0, 0.3), osc('sine', 28, 0, 0.12)],
    cutoff: 9000,
    resonance: 0.5,
    envAmount: 0,
    attack: 0.001,
    decay: 1.4,
    sustain: 0,
    release: 1,
  },
};

export const PRESET_NAMES = Object.keys(SYNTH_PRESETS);

export function presetParams(name: string): SynthParams {
  return structuredClone(SYNTH_PRESETS[name] ?? SYNTH_PRESETS.Pluck);
}
