import type { FxType } from './types';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  unit?: string;
  curve?: 'log';
  step?: number;
  /** Discrete choices shown as buttons instead of a knob. */
  options?: string[];
}

export interface FxSpec {
  name: string;
  description: string;
  params: ParamSpec[];
}

export const FX_SPECS: Record<FxType, FxSpec> = {
  eq: {
    name: 'EQ',
    description: 'Three-band equalizer',
    params: [
      { key: 'low', label: 'Low', min: -15, max: 15, def: 0, unit: 'dB' },
      { key: 'mid', label: 'Mid', min: -15, max: 15, def: 0, unit: 'dB' },
      { key: 'midFreq', label: 'Mid freq', min: 200, max: 5000, def: 1000, unit: 'Hz', curve: 'log' },
      { key: 'high', label: 'High', min: -15, max: 15, def: 0, unit: 'dB' },
    ],
  },
  filter: {
    name: 'Filter',
    description: 'Resonant filter',
    params: [
      { key: 'mode', label: 'Mode', min: 0, max: 2, def: 0, step: 1, options: ['Low-pass', 'High-pass', 'Band-pass'] },
      { key: 'cutoff', label: 'Cutoff', min: 40, max: 18000, def: 4000, unit: 'Hz', curve: 'log' },
      { key: 'q', label: 'Resonance', min: 0.3, max: 16, def: 0.8, curve: 'log' },
    ],
  },
  drive: {
    name: 'Drive',
    description: 'Saturation',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, def: 0.35 },
      { key: 'tone', label: 'Tone', min: 500, max: 18000, def: 9000, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, def: 1 },
      { key: 'out', label: 'Output', min: -18, max: 6, def: -3, unit: 'dB' },
    ],
  },
  compressor: {
    name: 'Compressor',
    description: 'Dynamics compressor',
    params: [
      { key: 'threshold', label: 'Threshold', min: -60, max: 0, def: -18, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1, max: 20, def: 4, curve: 'log' },
      { key: 'attack', label: 'Attack', min: 0.001, max: 0.2, def: 0.01, unit: 's', curve: 'log' },
      { key: 'release', label: 'Release', min: 0.02, max: 1, def: 0.2, unit: 's', curve: 'log' },
      { key: 'makeup', label: 'Gain', min: -12, max: 12, def: 0, unit: 'dB' },
    ],
  },
  delay: {
    name: 'Delay',
    description: 'Tempo-synced echo',
    params: [
      { key: 'steps', label: 'Time', min: 1, max: 16, def: 3, step: 1, unit: 'steps' },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, def: 0.35 },
      { key: 'tone', label: 'Tone', min: 500, max: 18000, def: 5000, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, def: 0.25 },
    ],
  },
  reverb: {
    name: 'Reverb',
    description: 'Room and hall reverb',
    params: [
      { key: 'size', label: 'Decay', min: 0.3, max: 8, def: 2.2, unit: 's', curve: 'log' },
      { key: 'damp', label: 'Damping', min: 1000, max: 16000, def: 6000, unit: 'Hz', curve: 'log' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, def: 0.25 },
    ],
  },
  limiter: {
    name: 'Limiter',
    description: 'Keeps peaks under the ceiling',
    params: [
      { key: 'gain', label: 'Input', min: 0, max: 18, def: 0, unit: 'dB' },
      { key: 'ceiling', label: 'Ceiling', min: -12, max: 0, def: -0.3, unit: 'dB' },
    ],
  },
};

export const FX_TYPES = Object.keys(FX_SPECS) as FxType[];

export function defaultFxParams(type: FxType): Record<string, number> {
  return Object.fromEntries(FX_SPECS[type].params.map((p) => [p.key, p.def]));
}

export function formatParam(spec: ParamSpec, v: number): string {
  if (spec.options) return spec.options[Math.round(v)] ?? '';
  switch (spec.unit) {
    case 'dB':
      return `${v > 0.05 ? '+' : ''}${v.toFixed(1)} dB`;
    case 'Hz':
      return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`;
    case 's':
      return v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
    case 'steps':
      return `${Math.round(v)} ${Math.round(v) === 1 ? 'step' : 'steps'}`;
    default:
      return spec.max <= 1 && spec.min >= 0 ? `${Math.round(v * 100)}%` : v.toFixed(1);
  }
}
