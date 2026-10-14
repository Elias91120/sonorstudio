import { describe, expect, it } from 'vitest';
import { BAR, STEP } from '../core/time';
import type { Clip, Note, Pattern, Project } from '../core/types';
import { buildPatternTimeline, buildSongTimeline, collectWindow, swingOffset, type TLEvent, type Timeline } from './timeline';

const ev = (tick: number): TLEvent => ({ tick, channelId: 'c', key: 60, vel: 1, len: STEP });
const note = (pos: number, key = 60, len = STEP): Note => ({ id: `n${pos}:${key}`, pos, len, key, vel: 0.78 });

function project(patterns: Pattern[], clips: Clip[] = [], swing = 0): Project {
  return {
    version: 1,
    name: 'test',
    bpm: 120,
    swing,
    channels: [],
    patterns,
    clips,
    tracks: Array.from({ length: 4 }, (_, i) => ({ name: `Track ${i + 1}`, muted: false })),
    mixer: [],
  };
}

describe('collectWindow', () => {
  const tl: Timeline = { events: [ev(0), ev(96), ev(288)], length: BAR };

  it('returns the events inside the window with their offset', () => {
    const w = collectWindow(tl, 0, 100);
    expect(w.hits.map((h) => [h.event.tick, h.at])).toEqual([
      [0, 0],
      [96, 96],
    ]);
    expect(w.local).toBe(100);
    expect(w.wraps).toEqual([]);
  });

  it('wraps at the loop end and keeps counting from the window start', () => {
    const w = collectWindow(tl, 300, 120);
    expect(w.hits.map((h) => [h.event.tick, h.at])).toEqual([[0, 84]]);
    expect(w.local).toBe(36);
    expect(w.wraps).toEqual([84]);
  });

  it('restarts at zero when the loop became shorter than the position', () => {
    const w = collectWindow({ events: [ev(0)], length: BAR }, BAR + 50, 10);
    expect(w.wraps).toEqual([0]);
    expect(w.hits.map((h) => h.at)).toEqual([0]);
    expect(w.local).toBe(10);
  });

  it('handles fractional windows without stalling, dropping or repeating events', () => {
    let local = 0;
    const heard: number[] = [];
    // 90 windows of 7.68 ticks cover 691.2 ticks: all of loop one and up to 307.2 in loop two.
    for (let i = 0; i < 90; i++) {
      const w = collectWindow(tl, local, 7.68);
      heard.push(...w.hits.map((h) => h.event.tick));
      local = w.local;
    }
    expect(heard).toEqual([0, 96, 288, 0, 96, 288]);
    expect(local).toBeCloseTo(691.2 - BAR, 6);
  });

  it('ends when the window stops a hair before the loop end', () => {
    const w = collectWindow(tl, BAR - 1e-12, 1e-13);
    expect(w.hits).toEqual([]);
    expect(w.wraps).toEqual([]);
  });
});

describe('swing', () => {
  it('only delays notes sitting exactly on every second step', () => {
    expect(swingOffset(0, 1)).toBe(0);
    expect(swingOffset(STEP, 1)).toBe(STEP / 2);
    expect(swingOffset(STEP + 1, 1)).toBe(0);
    expect(swingOffset(STEP * 3, 0.5)).toBe(STEP / 4);
    expect(swingOffset(STEP, 0)).toBe(0);
  });
});

describe('buildPatternTimeline', () => {
  it('sorts the notes of every channel and uses the pattern length', () => {
    const p: Pattern = { id: 'p', name: 'P', color: '#fff', bars: 1, notes: { a: [note(96)], b: [note(0), note(BAR + 24)] } };
    const tl = buildPatternTimeline(project([p]), 'p');
    expect(tl.events.map((e) => [e.channelId, e.tick])).toEqual([
      ['b', 0],
      ['a', 96],
      ['b', BAR + 24],
    ]);
    expect(tl.length).toBe(2 * BAR);
  });
});

describe('buildSongTimeline', () => {
  const p: Pattern = { id: 'p', name: 'P', color: '#fff', bars: 1, notes: { a: [note(0), note(2 * STEP), note(8 * STEP, 60, 12 * STEP)] } };
  const clip = (over: Partial<Clip>): Clip => ({ id: 'c', patternId: 'p', track: 0, pos: 0, len: BAR, offset: 0, muted: false, ...over });

  it('places pattern notes at the clip position', () => {
    const tl = buildSongTimeline(project([p], [clip({ pos: 2 * BAR })]));
    expect(tl.events.map((e) => e.tick)).toEqual([2 * BAR, 2 * BAR + 2 * STEP, 2 * BAR + 8 * STEP]);
    expect(tl.length).toBe(3 * BAR);
  });

  it('reads the pattern from the clip offset and cuts notes at the clip end', () => {
    // Reads steps 2 to 10 of the pattern: the note on step 8 is cut to the 2 steps left.
    const tl = buildSongTimeline(project([p], [clip({ pos: BAR, offset: 2 * STEP, len: 8 * STEP })]));
    expect(tl.events.map((e) => [e.tick, e.len])).toEqual([
      [BAR, STEP],
      [BAR + 6 * STEP, 2 * STEP],
    ]);
    const cut = buildSongTimeline(project([p], [clip({ len: 10 * STEP })]));
    expect(cut.events.at(-1)?.len).toBe(2 * STEP);
  });

  it('skips muted clips and clips on muted tracks', () => {
    const proj = project([p], [clip({ muted: true }), clip({ id: 'd', track: 1, pos: BAR })]);
    proj.tracks[1].muted = true;
    expect(buildSongTimeline(proj).events).toEqual([]);
  });
});
