import { uid } from '../core/ids';
import { colorAt } from '../core/palette';
import { DEFAULT_FADER, makeMixer, makeTracks } from '../core/project';
import { BAR, STEP } from '../core/time';
import type { Channel, Clip, Project } from '../core/types';
import { makeFx, makeNote, makePattern } from './factory';
import { BASS, DRILL_KIT, DRILL_PATTERNS } from '../core/drillPatterns';
import { guessStandIn } from './flpImport';

/** Where the demo's kit comes from: free, but its samples are not ours to ship, so the app points there. */
export const DEMO_KIT = {
  name: 'GASSED UK Drill Drum Kit',
  by: 'Producergrind',
  url: 'https://producergrind.com/products/gassed-free-uk-drill-drum-kit',
  prefix: 'PG GASSED',
};

/** The demo's patterns are PAV's, free to use with this credit. */
export const DEMO_CREDIT = {
  text: 'Drum patterns designed by PAV Music Production',
  url: 'https://www.youtube.com/c/pavmusicproduction',
};

export const DEMO_NAME = 'UK Drill (patterns by PAV)';

/** PAV's two UK drill patterns at 148 BPM, arranged over 16 bars, on the GASSED kit (built-in stand-ins until it is imported). */
export function createDemoProject(): Project {
  const channels: Channel[] = DRILL_KIT.map(([name, volume, insert], i) => ({
    id: uid('ch'),
    name: name.replace(`${DEMO_KIT.prefix} `, ''),
    color: colorAt(i),
    type: 'sampler',
    // The placeholder id is relinked by name as soon as the kit is in the library.
    sampler: { sampleId: `u_missing_${name}`, sampleName: name, standIn: guessStandIn(name), pitch: 0, cutItself: /808/.test(name) },
    volume: volume / 12800,
    pan: 0,
    muted: false,
    mixerTrack: insert,
  }));

  const patterns = DRILL_PATTERNS.map((def, i) => {
    const pt = makePattern(def.name, i, 2);
    for (const [step, chans] of def.hits) {
      for (const c of chans) (pt.notes[channels[c].id] ??= []).push(makeNote(step * STEP));
    }
    pt.notes[channels[BASS].id] = def.bass.map(([step, key, len]) => makeNote(step * STEP, key, len * STEP));
    for (const list of Object.values(pt.notes)) list.sort((a, b) => a.pos - b.pos);
    return pt;
  });

  const clips: Clip[] = [];
  // A A B B, twice: 16 bars.
  [0, 0, 1, 1, 0, 0, 1, 1].forEach((p, i) =>
    clips.push({ id: uid('clip'), patternId: patterns[p].id, track: p, pos: i * 2 * BAR, len: 2 * BAR, offset: 0, muted: false }),
  );
  const tracks = makeTracks();
  tracks[0].name = 'Drill A';
  tracks[1].name = 'Drill B';

  const mixer = makeMixer();
  ['Kick Axel', 'Kick Chemist', 'Countersnares', '808'].forEach((name, i) => (mixer[i + 1].name = name));
  mixer[0].fx = [makeFx('limiter')];
  mixer[3].volume = (11044 / 12800) * DEFAULT_FADER;
  mixer[3].fx = [makeFx('eq')];
  mixer[4].volume = (12501 / 12800) * DEFAULT_FADER;
  mixer[4].fx = [makeFx('eq'), makeFx('drive', { drive: 0.15, mix: 1, out: -1 })];

  return { version: 1, name: DEMO_NAME, bpm: 148, swing: 0, channels, patterns, clips, tracks, mixer };
}
