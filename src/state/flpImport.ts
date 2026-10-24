import { colorAt } from '../core/palette';
import { DEFAULT_FADER, MIXER_INSERTS, PLAYLIST_TRACKS, makeMixer, makeTracks } from '../core/project';
import { BAR, PPQ, STEP } from '../core/time';
import type { FlpChannel, FlpProject } from '../core/flp';
import type { Channel, Clip, FxType, Project } from '../core/types';
import { uid } from '../core/ids';
import { guessCutItself, isUserSampleId } from '../audio/userSamples';
import { makeFx, makeNote, makePattern, synthChannel } from './factory';

export interface FlpImport {
  project: Project;
  /** Sample names the library doesn't have yet: their channels play a stand-in until they are imported. */
  missing: string[];
  /** Third-party plugins left out (instruments become empty synth channels, effects are dropped). */
  plugins: string[];
}

/** FL Studio's native effects that have a SonorStudio counterpart, by internal name. */
const FX_BY_PLUGIN: [RegExp, FxType, Record<string, number>?][] = [
  [/limiter|maximus/i, 'limiter'],
  [/parametric eq|equo|fruity eq/i, 'eq'],
  [/soft clipper/i, 'drive', { drive: 0.15, mix: 1, out: -1 }],
  [/fast dist|blood overdrive|wave ?shaper/i, 'drive'],
  [/compressor|soundgoodizer/i, 'compressor'],
  [/reeverb|convolver/i, 'reverb'],
  [/delay/i, 'delay'],
  [/filter|love philter/i, 'filter'],
];

/** A built-in sound close to what a sample's name says it is, so a project without its kit still plays. */
export function guessStandIn(name: string): string {
  const n = name.toLowerCase();
  if (/808|sub|bass/.test(n)) return '808-classic';
  if (/kick|bd\b/.test(n)) return 'kick-808';
  if (/open ?hat|oh\b/.test(n)) return 'hat-open';
  if (/hat|hh\b/.test(n)) return 'hat-closed';
  if (/clap/.test(n)) return 'clap';
  if (/counter|rim/.test(n)) return 'rim';
  if (/snare|sd\b/.test(n)) return 'snare-trap';
  if (/crash|cymbal/.test(n)) return 'crash';
  if (/ride/.test(n)) return 'ride';
  if (/shaker/.test(n)) return 'shaker';
  if (/perc|conga|bongo/.test(n)) return 'conga';
  if (/tom/.test(n)) return 'tom-low';
  if (/riser|sweep|uplift/.test(n)) return 'riser';
  if (/fx|impact|boom/.test(n)) return 'impact';
  return 'blip';
}

const fileName = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);

/**
 * A SonorStudio project from a parsed .flp. `findSample` gets a sample's clean name ("PG GASSED Kick - Axel") and
 * returns the id of the library sound with that name, if there is one.
 */
export function flpToProject(flp: FlpProject, fileTitle: string, findSample: (name: string) => string | null, clean: (path: string) => string): FlpImport {
  const scale = PPQ / (flp.ppq || PPQ);
  const ticks = (t: number) => Math.round(t * scale);
  const missing: string[] = [];
  const plugins = new Set<string>();

  const channels: Channel[] = [];
  const byIndex = new Map<number, Channel>();
  for (const fc of flp.channels) {
    const ch = toChannel(fc, channels.length, findSample, clean, missing, plugins);
    if (!ch) continue;
    channels.push(ch);
    byIndex.set(fc.index, ch);
  }

  const patterns = flp.patterns
    .filter((fp) => fp.notes.length || fp.name)
    .map((fp, i) => {
      const pt = makePattern(fp.name ?? `Pattern ${fp.index}`, i);
      let end = 0;
      for (const fn of fp.notes) {
        const ch = byIndex.get(fn.channel);
        if (!ch) continue;
        const len = fn.len > 0 ? Math.max(1, ticks(fn.len)) : STEP;
        const note = makeNote(ticks(fn.pos), fn.key, len, Math.min(1, fn.vel / 128));
        (pt.notes[ch.id] ??= []).push(note);
        end = Math.max(end, note.pos + 1);
      }
      for (const list of Object.values(pt.notes)) list.sort((a, b) => a.pos - b.pos || a.key - b.key);
      pt.bars = Math.max(1, Math.ceil(end / BAR));
      return { index: fp.index, pt };
    });
  if (!patterns.length) patterns.push({ index: 1, pt: makePattern('Pattern 1', 0) });
  const patternByIndex = new Map(patterns.map((x) => [x.index, x.pt]));

  const clips: Clip[] = [];
  for (const item of flp.playlist) {
    const pt = item.pattern !== null ? patternByIndex.get(item.pattern) : undefined;
    if (!pt || item.track < 0 || item.track >= PLAYLIST_TRACKS) continue;
    clips.push({
      id: uid('clip'),
      patternId: pt.id,
      track: item.track,
      pos: ticks(item.pos),
      len: Math.max(STEP, ticks(item.len)),
      offset: item.startOffset > 0 ? ticks(item.startOffset) : 0,
      muted: item.muted,
    });
  }

  const mixer = makeMixer();
  for (const ins of flp.inserts) {
    if (ins.index > MIXER_INSERTS) break;
    const track = mixer[ins.index];
    if (ins.name) track.name = ins.name;
    track.volume = Math.max(0, Math.min(1, (ins.volume / 12800) * DEFAULT_FADER));
    track.pan = Math.max(-1, Math.min(1, ins.pan / 6400));
    for (const plugin of ins.plugins) {
      const match = FX_BY_PLUGIN.find(([re]) => re.test(plugin));
      if (match && track.fx.length < 8) track.fx.push(makeFx(match[1], match[2]));
      else if (!match) plugins.add(plugin);
    }
  }
  // Inserts keep FL Studio's numbers; name the unnamed ones after the channels routed to them.
  for (const ch of channels) {
    const track = mixer[ch.mixerTrack];
    if (ch.mixerTrack > 0 && track.name === `Insert ${ch.mixerTrack}`) track.name = ch.name;
  }

  const tracks = makeTracks();
  return {
    project: {
      version: 1,
      name: flp.title || fileTitle,
      bpm: Math.min(522, Math.max(10, Math.round(flp.bpm * 100) / 100)),
      swing: 0,
      channels,
      patterns: patterns.map((x) => x.pt),
      clips,
      tracks,
      mixer,
    },
    missing,
    plugins: [...plugins],
  };
}

function toChannel(
  fc: FlpChannel,
  index: number,
  findSample: (name: string) => string | null,
  clean: (path: string) => string,
  missing: string[],
  plugins: Set<string>,
): Channel | null {
  // Automation clips and layers don't make sound of their own.
  if (fc.kind === 5 || fc.kind === 3) return null;
  const common = {
    volume: Math.max(0, Math.min(1, fc.volume / 12800)),
    pan: Math.max(-1, Math.min(1, (fc.pan - 6400) / 6400)),
    muted: false,
    mixerTrack: fc.insert >= 0 && fc.insert <= MIXER_INSERTS ? fc.insert : 0,
  };
  if (fc.samplePath) {
    const sampleName = clean(fileName(fc.samplePath));
    const found = findSample(sampleName);
    if (!found) missing.push(sampleName);
    return {
      id: uid('ch'),
      name: fc.name || sampleName,
      color: colorAt(index),
      type: 'sampler',
      sampler: {
        // A missing sample keeps a placeholder id; it is relinked by name once the sound is imported.
        sampleId: found ?? `u_missing_${sampleName}`,
        sampleName,
        standIn: guessStandIn(sampleName),
        pitch: fc.pitch / 100,
        cutItself: guessCutItself(sampleName),
      },
      ...common,
    };
  }
  // A plugin instrument: its sound can't be read, an empty synth keeps the channel and its notes.
  if (fc.plugin && !/sampler|audio clip/i.test(fc.plugin)) plugins.add(fc.name && fc.name !== fc.plugin ? `${fc.name} (${fc.plugin})` : fc.plugin);
  const ch = synthChannel('Pluck', index, common.mixerTrack);
  return { ...ch, ...common, name: fc.name || fc.plugin || 'Channel' };
}

/**
 * Channels whose imported sample is missing, paired with a library sound of the same name: the new sample id by
 * channel id. A project opened from FL Studio, or from another browser, finds its kit this way once it is imported.
 */
export function relinkPlan(project: Project, library: { id: string; name: string }[]): Map<string, string> {
  const plan = new Map<string, string>();
  if (!library.length) return plan;
  const have = new Set(library.map((s) => s.id));
  const byName = new Map<string, string>();
  for (const s of library) if (!byName.has(s.name.toLowerCase())) byName.set(s.name.toLowerCase(), s.id);
  for (const ch of project.channels) {
    const s = ch.sampler;
    if (!s?.sampleName || !isUserSampleId(s.sampleId) || have.has(s.sampleId)) continue;
    const id = byName.get(s.sampleName.toLowerCase());
    if (id) plan.set(ch.id, id);
  }
  return plan;
}
