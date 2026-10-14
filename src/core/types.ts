export type Wave = 'sine' | 'triangle' | 'sawtooth' | 'square';

export interface OscParams {
  wave: Wave;
  /** Semitones. */
  coarse: number;
  /** Cents. */
  fine: number;
  level: number;
}

export interface SynthParams {
  osc: OscParams[];
  cutoff: number;
  resonance: number;
  /** Filter envelope depth, 0..1 (up to 5 octaves above the cutoff). */
  envAmount: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface SamplerParams {
  sampleId: string;
  /** Name of an imported sample, kept so the rack can say which one is missing after it was deleted. */
  sampleName?: string;
  /** Semitones. */
  pitch: number;
  /** A new note stops the previous one (808s, open hats). */
  cutItself: boolean;
}

export interface Channel {
  id: string;
  name: string;
  color: string;
  type: 'sampler' | 'synth';
  sampler?: SamplerParams;
  synth?: SynthParams;
  /** Name of the synth preset the channel started from. */
  preset?: string;
  /** 0..1, 0.78 is unity gain. */
  volume: number;
  pan: number;
  muted: boolean;
  /** 0 is the master track. */
  mixerTrack: number;
}

export interface Note {
  id: string;
  pos: number;
  len: number;
  /** MIDI key; 60 is C5 in FL Studio's naming. */
  key: number;
  vel: number;
}

export interface Pattern {
  id: string;
  name: string;
  color: string;
  /** Minimum length; notes past it extend the pattern bar by bar. */
  bars: number;
  /** Notes by channel id. */
  notes: Record<string, Note[]>;
}

export interface Clip {
  id: string;
  patternId: string;
  track: number;
  pos: number;
  len: number;
  /** Where the clip starts reading inside the pattern. */
  offset: number;
  muted: boolean;
}

export interface PlaylistTrack {
  name: string;
  muted: boolean;
}

export type FxType = 'eq' | 'filter' | 'drive' | 'compressor' | 'delay' | 'reverb' | 'limiter';

export interface FxSlot {
  id: string;
  type: FxType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface MixerTrack {
  name: string;
  /** 0..1, 0.8 is 0 dB. */
  volume: number;
  pan: number;
  muted: boolean;
  fx: FxSlot[];
}

export interface Project {
  version: 1;
  name: string;
  bpm: number;
  /** 0..1, delays every second step. */
  swing: number;
  channels: Channel[];
  patterns: Pattern[];
  clips: Clip[];
  tracks: PlaylistTrack[];
  /** Index 0 is the master track. */
  mixer: MixerTrack[];
}
