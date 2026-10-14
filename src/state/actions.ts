import { current, type Draft } from 'immer';
import { uid } from '../core/ids';
import { nextColor } from '../core/palette';
import { isDefaultInsertName, nextFreeInsert, patternLength } from '../core/project';
import { presetParams } from '../core/presets';
import { BAR, STEP, ceilTo } from '../core/time';
import type { Channel, FxType, MixerTrack, Project, SamplerParams, SynthParams, OscParams } from '../core/types';
import { makeFx, makeNote, makePattern, samplerChannel, samplerParams, synthChannel } from './factory';
import { useStudio } from './store';

const S = () => useStudio.getState();
const findPattern = (d: Draft<Project>, id: string) => d.patterns.find((p) => p.id === id);
const findChannel = (d: Draft<Project>, id: string) => d.channels.find((c) => c.id === id);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type LibraryItem = { kind: 'sample'; id: string } | { kind: 'synth'; preset: string };

/* Channels */

function swapSound(ch: Draft<Channel>, item: LibraryItem) {
  if (item.kind === 'sample') {
    const { name, sampler } = samplerParams(item.id);
    ch.type = 'sampler';
    ch.sampler = sampler;
    ch.synth = undefined;
    ch.preset = undefined;
    ch.name = name ?? ch.name;
  } else {
    ch.type = 'synth';
    ch.synth = presetParams(item.preset);
    ch.preset = item.preset;
    ch.sampler = undefined;
    ch.name = item.preset;
  }
}

/** Appends a channel on the next free insert, naming the insert after it like FL Studio does. */
function pushChannel(d: Draft<Project>, item: LibraryItem): string {
  const track = nextFreeInsert(d.channels, d.mixer.length);
  const ch =
    item.kind === 'sample' ? samplerChannel(item.id, d.channels.length, track) : synthChannel(item.preset, d.channels.length, track);
  d.channels.push(ch);
  const insert = d.mixer[track];
  if (track > 0 && insert && isDefaultInsertName(insert.name, track)) insert.name = ch.name;
  return ch.id;
}

/** Adds a channel for a library item, or swaps the sound of `replaceId`. */
export function addChannel(item: LibraryItem, replaceId?: string) {
  let added: string | null = null;
  S().commit((d) => {
    if (replaceId) {
      const ch = findChannel(d, replaceId);
      if (ch) swapSound(ch, item);
      return;
    }
    added = pushChannel(d, item);
  });
  if (added) S().selectChannel(added);
}

/**
 * One channel per sample, in order, as a single undo step. The first sample takes over `replaceId`'s
 * row when that channel still exists (an import can outlive the row it was dropped on).
 */
export function addSampleChannels(ids: string[], replaceId?: string) {
  if (!ids.length) return;
  let last: string | null = null;
  S().commit((d) => {
    const target = replaceId ? findChannel(d, replaceId) : undefined;
    const rest = target ? ids.slice(1) : ids;
    if (target) {
      swapSound(target, { kind: 'sample', id: ids[0] });
      last = target.id;
    }
    for (const id of rest) last = pushChannel(d, { kind: 'sample', id });
  });
  if (last) S().selectChannel(last);
}

export function updateChannel(id: string, patch: Partial<Channel>) {
  S().mutate((d) => {
    const ch = findChannel(d, id);
    if (ch) Object.assign(ch, patch);
  });
}

export function commitChannel(id: string, patch: Partial<Channel>) {
  S().commit((d) => {
    const ch = findChannel(d, id);
    if (ch) Object.assign(ch, patch);
  });
}

export function updateSampler(id: string, patch: Partial<SamplerParams>, history = false) {
  const recipe = (d: Draft<Project>) => {
    const ch = findChannel(d, id);
    if (ch?.sampler) Object.assign(ch.sampler, patch);
  };
  if (history) S().commit(recipe);
  else S().mutate(recipe);
}

/** Synth edits detach the channel from its preset, so the preset menu shows "Custom". */
export function updateSynth(id: string, patch: Partial<SynthParams>) {
  S().mutate((d) => {
    const ch = findChannel(d, id);
    if (!ch?.synth) return;
    Object.assign(ch.synth, patch);
    ch.preset = undefined;
  });
}

export function updateOsc(id: string, index: number, patch: Partial<OscParams>, history = false) {
  const recipe = (d: Draft<Project>) => {
    const ch = findChannel(d, id);
    const osc = ch?.synth?.osc[index];
    if (!ch || !osc) return;
    Object.assign(osc, patch);
    ch.preset = undefined;
  };
  if (history) S().commit(recipe);
  else S().mutate(recipe);
}

export function applyPreset(id: string, preset: string) {
  S().commit((d) => {
    const ch = findChannel(d, id);
    if (!ch || ch.type !== 'synth') return;
    ch.synth = presetParams(preset);
    ch.preset = preset;
  });
}

export function renameChannel(id: string, name: string) {
  commitChannel(id, { name });
}

export function recolorChannel(id: string) {
  S().commit((d) => {
    const ch = findChannel(d, id);
    if (ch) ch.color = nextColor(ch.color);
  });
}

export function setChannelTrack(id: string, track: number) {
  S().mutate((d) => {
    const ch = findChannel(d, id);
    if (ch) ch.mixerTrack = clamp(Math.round(track), 0, d.mixer.length - 1);
  });
}

export function toggleChannelMute(id: string) {
  S().commit((d) => {
    const ch = findChannel(d, id);
    if (ch) ch.muted = !ch.muted;
  });
}

/** Solo mutes every other channel; soloing the soloed channel unmutes everything. */
export function soloChannel(id: string) {
  S().commit((d) => {
    const target = findChannel(d, id);
    if (!target) return;
    const soloed = !target.muted && d.channels.every((c) => c.id === id || c.muted);
    for (const c of d.channels) c.muted = soloed ? false : c.id !== id;
  });
}

export function removeChannel(id: string) {
  S().commit((d) => {
    d.channels = d.channels.filter((c) => c.id !== id);
    for (const p of d.patterns) delete p.notes[id];
  });
}

export function cloneChannel(id: string) {
  let cloneId: string | null = null;
  S().commit((d) => {
    const i = d.channels.findIndex((c) => c.id === id);
    if (i < 0) return;
    const src = current(d.channels[i]);
    const copy: Channel = { ...src, id: uid('ch'), name: `${src.name} 2` };
    d.channels.splice(i + 1, 0, copy);
    for (const p of d.patterns) {
      const notes = p.notes[id];
      if (notes) p.notes[copy.id] = current(notes).map((n) => ({ ...n, id: uid('n') }));
    }
    cloneId = copy.id;
  });
  if (cloneId) S().selectChannel(cloneId);
}

export function moveChannel(id: string, dir: -1 | 1) {
  S().commit((d) => {
    const i = d.channels.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.channels.length) return;
    const [ch] = d.channels.splice(i, 1);
    d.channels.splice(j, 0, ch);
  });
}

/* Steps and notes */

export function setStep(patternId: string, channelId: string, step: number, on: boolean) {
  S().mutate((d) => {
    const p = findPattern(d, patternId);
    if (!p) return;
    const pos = step * STEP;
    const notes = p.notes[channelId] ?? [];
    const i = notes.findIndex((n) => n.pos === pos);
    if (on && i < 0) p.notes[channelId] = [...notes, makeNote(pos)];
    if (!on && i >= 0) {
      notes.splice(i, 1);
      if (notes.length === 0) delete p.notes[channelId];
    }
  });
}

export function fillSteps(patternId: string, channelId: string, every: number) {
  S().commit((d) => {
    const p = findPattern(d, patternId);
    if (!p) return;
    const steps = patternLength(p) / STEP;
    p.notes[channelId] = Array.from({ length: Math.ceil(steps / every) }, (_, i) => makeNote(i * every * STEP));
  });
}

export function clearNotes(patternId: string, channelId: string) {
  S().commit((d) => {
    const p = findPattern(d, patternId);
    if (p) delete p.notes[channelId];
  });
}

/* Patterns */

export function addPattern(): string {
  let id = '';
  S().commit((d) => {
    let n = d.patterns.length + 1;
    while (d.patterns.some((p) => p.name === `Pattern ${n}`)) n++;
    const p = makePattern(`Pattern ${n}`, d.patterns.length);
    d.patterns.push(p);
    id = p.id;
  });
  if (id) S().setCurrentPattern(id);
  return id;
}

export function clonePattern(id: string) {
  let cloneId = '';
  S().commit((d) => {
    const i = d.patterns.findIndex((p) => p.id === id);
    if (i < 0) return;
    const src = current(d.patterns[i]);
    const notes = Object.fromEntries(
      Object.entries(src.notes).map(([ch, ns]) => [ch, ns.map((n) => ({ ...n, id: uid('n') }))]),
    );
    const copy = { ...src, id: uid('pat'), name: `${src.name} 2`, color: nextColor(src.color), notes };
    d.patterns.splice(i + 1, 0, copy);
    cloneId = copy.id;
  });
  if (cloneId) S().setCurrentPattern(cloneId);
}

export function renamePattern(id: string, name: string) {
  S().commit((d) => {
    const p = findPattern(d, id);
    if (p) p.name = name;
  });
}

export function recolorPattern(id: string) {
  S().commit((d) => {
    const p = findPattern(d, id);
    if (p) p.color = nextColor(p.color);
  });
}

/** Removes a pattern and its playlist clips. The last pattern can't be removed. */
export function removePattern(id: string) {
  S().commit((d) => {
    if (d.patterns.length <= 1) return;
    d.patterns = d.patterns.filter((p) => p.id !== id);
    d.clips = d.clips.filter((c) => c.patternId !== id);
  });
}

export function setPatternBars(id: string, bars: number) {
  S().commit((d) => {
    const p = findPattern(d, id);
    if (p) p.bars = clamp(Math.round(bars), 1, 64);
  });
}

/* Playlist */

export function toggleTrackMute(index: number) {
  S().commit((d) => {
    const t = d.tracks[index];
    if (t) t.muted = !t.muted;
  });
}

export function renameTrack(index: number, name: string) {
  S().commit((d) => {
    const t = d.tracks[index];
    if (t) t.name = name;
  });
}

/** Copies clips right after the span they cover, rounded up to whole bars. */
export function duplicateClips(ids: ReadonlySet<string>): string[] {
  const created: string[] = [];
  S().commit((d) => {
    const src = d.clips.filter((c) => ids.has(c.id));
    if (!src.length) return;
    const start = Math.min(...src.map((c) => c.pos));
    const end = Math.max(...src.map((c) => c.pos + c.len));
    const shift = ceilTo(end - start, BAR);
    for (const c of src) {
      const copy = { ...current(c), id: uid('clip'), pos: c.pos + shift };
      d.clips.push(copy);
      created.push(copy.id);
    }
  });
  return created;
}

/* Mixer */

export function updateMixerTrack(index: number, patch: Partial<MixerTrack>) {
  S().mutate((d) => {
    const t = d.mixer[index];
    if (t) Object.assign(t, patch);
  });
}

export function renameMixerTrack(index: number, name: string) {
  S().commit((d) => {
    const t = d.mixer[index];
    if (t) t.name = name;
  });
}

export function toggleMixerMute(index: number) {
  S().commit((d) => {
    const t = d.mixer[index];
    if (t) t.muted = !t.muted;
  });
}

/** Solo mutes every other insert (the master is never muted by a solo). */
export function soloMixerTrack(index: number) {
  if (index === 0) return;
  S().commit((d) => {
    const target = d.mixer[index];
    if (!target) return;
    const soloed = !target.muted && d.mixer.every((t, i) => i === 0 || i === index || t.muted);
    d.mixer.forEach((t, i) => {
      if (i > 0) t.muted = soloed ? false : i !== index;
    });
  });
}

export const MAX_FX = 8;

export function addFx(index: number, type: FxType): string | null {
  let id: string | null = null;
  S().commit((d) => {
    const t = d.mixer[index];
    if (!t || t.fx.length >= MAX_FX) return;
    const fx = makeFx(type);
    t.fx.push(fx);
    id = fx.id;
  });
  return id;
}

export function removeFx(index: number, fxId: string) {
  S().commit((d) => {
    const t = d.mixer[index];
    if (t) t.fx = t.fx.filter((f) => f.id !== fxId);
  });
}

export function toggleFx(index: number, fxId: string) {
  S().commit((d) => {
    const f = d.mixer[index]?.fx.find((x) => x.id === fxId);
    if (f) f.enabled = !f.enabled;
  });
}

export function moveFx(index: number, fxId: string, dir: -1 | 1) {
  S().commit((d) => {
    const t = d.mixer[index];
    if (!t) return;
    const i = t.fx.findIndex((f) => f.id === fxId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= t.fx.length) return;
    const [f] = t.fx.splice(i, 1);
    t.fx.splice(j, 0, f);
  });
}

export function setFxParam(index: number, fxId: string, key: string, value: number, history = false) {
  const recipe = (d: Draft<Project>) => {
    const f = d.mixer[index]?.fx.find((x) => x.id === fxId);
    if (f) f.params[key] = value;
  };
  if (history) S().commit(recipe);
  else S().mutate(recipe);
}

/* Project */

export function setBpm(bpm: number) {
  S().mutate((d) => {
    d.bpm = clamp(Math.round(bpm * 10) / 10, 10, 522);
  });
}

export function setSwing(swing: number) {
  S().mutate((d) => {
    d.swing = clamp(swing, 0, 1);
  });
}
