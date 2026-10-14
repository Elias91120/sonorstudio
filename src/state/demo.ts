import { uid } from '../core/ids';
import { makeMixer, makeTracks } from '../core/project';
import { BAR, BEAT, STEP } from '../core/time';
import type { Clip, Project } from '../core/types';
import { makeFx, makeNote, makePattern, samplerChannel, stepNotes, synthChannel } from './factory';

/** A 16-bar beat in C minor at 140 BPM: pad intro, drop with drums and 808, then a pluck melody. */
export function createDemoProject(): Project {
  const kick = samplerChannel('kick-808', 0, 1);
  const clap = samplerChannel('clap', 1, 2);
  const snare = samplerChannel('snare-trap', 2, 2);
  const hat = samplerChannel('hat-closed', 3, 3);
  const bass = samplerChannel('808-classic', 4, 4);
  const pad = synthChannel('Soft pad', 5, 5);
  const pluck = synthChannel('Pluck', 6, 6);
  const riser = samplerChannel('riser', 8, 7);
  const impact = samplerChannel('impact', 9, 7);
  bass.name = '808';
  clap.volume = 0.7;
  snare.volume = 0.52;
  hat.volume = 0.6;
  hat.pan = 0.12;
  pad.volume = 0.62;
  pluck.volume = 0.64;
  riser.volume = 0.6;
  const channels = [kick, clap, snare, hat, bass, pad, pluck, riser, impact];

  const drums = makePattern('Drums', 0);
  drums.notes[kick.id] = stepNotes([0, 10]);
  drums.notes[clap.id] = stepNotes([8]);
  drums.notes[snare.id] = stepNotes([8]);
  drums.notes[hat.id] = stepNotes([0, 2, 4, 6, 7, 8, 10, 12, 14, 15]).map((n, i) => ({ ...n, vel: i % 2 ? 0.62 : 0.78 }));

  const roots = [60, 56, 63, 58];
  const bassLine = makePattern('808', 1, 4);
  bassLine.notes[bass.id] = roots.flatMap((key, bar) => [
    makeNote(bar * BAR, key, 10 * STEP),
    makeNote(bar * BAR + 10 * STEP, key, 6 * STEP),
  ]);

  const chords = [
    [60, 63, 67],
    [60, 63, 68],
    [58, 63, 67],
    [58, 62, 65],
  ];
  const pads = makePattern('Chords', 2, 4);
  pads.notes[pad.id] = chords.flatMap((keys, bar) => keys.map((k) => makeNote(bar * BAR, k, BAR, 0.7)));

  // [step, key, length in steps] per bar.
  const phrase: [number, number, number][][] = [
    [[0, 67, 2], [3, 63, 2], [6, 65, 2], [8, 67, 3], [11, 70, 2], [14, 67, 2]],
    [[0, 68, 3], [3, 67, 3], [6, 63, 2], [8, 60, 6]],
    [[0, 70, 2], [3, 67, 2], [6, 63, 2], [8, 67, 3], [11, 70, 2], [14, 72, 2]],
    [[0, 74, 4], [6, 72, 2], [8, 70, 4], [12, 65, 4]],
  ];
  const melody = makePattern('Melody', 3, 4);
  melody.notes[pluck.id] = phrase.flatMap((bar, b) =>
    bar.map(([step, key, len]) => makeNote(b * BAR + step * STEP, key, len * STEP, 0.74)),
  );

  const fx = makePattern('Transition', 4, 3);
  fx.notes[riser.id] = [makeNote(BEAT)];
  fx.notes[impact.id] = [makeNote(2 * BAR)];

  const clip = (patternId: string, track: number, pos: number, len: number): Clip => ({
    id: uid('clip'),
    patternId,
    track,
    pos,
    len,
    offset: 0,
    muted: false,
  });
  const clips: Clip[] = [];
  for (let bar = 4; bar < 16; bar++) clips.push(clip(drums.id, 0, bar * BAR, BAR));
  for (const bar of [4, 8, 12]) clips.push(clip(bassLine.id, 1, bar * BAR, 4 * BAR));
  for (const bar of [0, 4, 8, 12]) clips.push(clip(pads.id, 2, bar * BAR, 4 * BAR));
  for (const bar of [8, 12]) clips.push(clip(melody.id, 3, bar * BAR, 4 * BAR));
  clips.push(clip(fx.id, 4, 2 * BAR, 3 * BAR));

  const tracks = makeTracks();
  ['Drums', '808', 'Chords', 'Melody', 'Transition'].forEach((name, i) => (tracks[i].name = name));

  const mixer = makeMixer();
  ['Kick', 'Clap + snare', 'Hats', '808', 'Pad', 'Pluck', 'FX'].forEach((name, i) => (mixer[i + 1].name = name));
  mixer[0].fx = [makeFx('limiter', { gain: 2 })];
  mixer[4].fx = [makeFx('drive', { drive: 0.22, mix: 0.6, out: -2 })];
  mixer[5].fx = [makeFx('filter', { cutoff: 2600 }), makeFx('reverb', { size: 3.2, mix: 0.32 })];
  mixer[6].fx = [makeFx('delay', { steps: 3, feedback: 0.38, mix: 0.24 }), makeFx('reverb', { size: 2, mix: 0.2 })];
  mixer[7].fx = [makeFx('reverb', { size: 2.6, mix: 0.25 })];
  mixer[3].volume = 0.74;

  return {
    version: 1,
    name: 'First beat',
    bpm: 140,
    swing: 0,
    channels,
    patterns: [drums, bassLine, pads, melody, fx],
    clips,
    tracks,
    mixer,
  };
}
