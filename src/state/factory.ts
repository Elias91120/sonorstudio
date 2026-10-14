import { uid } from '../core/ids';
import { colorAt } from '../core/palette';
import { DEFAULT_CHANNEL_VOLUME, DEFAULT_VEL, ROOT_KEY, makeMixer, makeTracks } from '../core/project';
import { presetParams } from '../core/presets';
import { defaultFxParams } from '../core/fxSpecs';
import { STEP } from '../core/time';
import type { Channel, FxSlot, FxType, Note, Pattern, Project, SamplerParams } from '../core/types';
import { SOUNDS_BY_ID } from '../audio/sounds';
import { getUserSample, guessCutItself } from '../audio/userSamples';

/** Sampler defaults for a built-in or imported sample. The name is undefined when the id is unknown. */
export function samplerParams(sampleId: string): { name?: string; sampler: SamplerParams } {
  const sound = SOUNDS_BY_ID.get(sampleId);
  if (sound) return { name: sound.name, sampler: { sampleId, pitch: 0, cutItself: sound.category === '808s' } };
  const user = getUserSample(sampleId);
  if (user) return { name: user.name, sampler: { sampleId, sampleName: user.name, pitch: 0, cutItself: guessCutItself(user.name) } };
  return { sampler: { sampleId, pitch: 0, cutItself: false } };
}

export function samplerChannel(sampleId: string, index: number, mixerTrack: number): Channel {
  const { name, sampler } = samplerParams(sampleId);
  return {
    id: uid('ch'),
    name: name ?? 'Sampler',
    color: colorAt(index),
    type: 'sampler',
    sampler,
    volume: DEFAULT_CHANNEL_VOLUME,
    pan: 0,
    muted: false,
    mixerTrack,
  };
}

export function synthChannel(preset: string, index: number, mixerTrack: number): Channel {
  return {
    id: uid('ch'),
    name: preset,
    color: colorAt(index),
    type: 'synth',
    synth: presetParams(preset),
    preset,
    volume: DEFAULT_CHANNEL_VOLUME,
    pan: 0,
    muted: false,
    mixerTrack,
  };
}

export function makePattern(name: string, index: number, bars = 1): Pattern {
  return { id: uid('pat'), name, color: colorAt(index * 5 + 2), bars, notes: {} };
}

export function makeNote(pos: number, key = ROOT_KEY, len = STEP, vel = DEFAULT_VEL): Note {
  return { id: uid('n'), pos, len, key, vel };
}

export const stepNotes = (steps: number[], vel = DEFAULT_VEL) => steps.map((s) => makeNote(s * STEP, ROOT_KEY, STEP, vel));

export function makeFx(type: FxType, params: Record<string, number> = {}): FxSlot {
  return { id: uid('fx'), type, enabled: true, params: { ...defaultFxParams(type), ...params } };
}

/** FL Studio's default template: four drum channels, one empty pattern, a limiter on the master. */
export function createEmptyProject(): Project {
  const sounds = ['kick-808', 'clap', 'hat-closed', 'snare-808'];
  const channels = sounds.map((id, i) => samplerChannel(id, i, i + 1));
  const mixer = makeMixer();
  channels.forEach((c) => (mixer[c.mixerTrack].name = c.name));
  mixer[0].fx = [makeFx('limiter')];
  return {
    version: 1,
    name: 'Untitled',
    bpm: 130,
    swing: 0,
    channels,
    patterns: [makePattern('Pattern 1', 0)],
    clips: [],
    tracks: makeTracks(),
    mixer,
  };
}
