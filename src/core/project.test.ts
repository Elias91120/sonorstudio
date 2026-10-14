import { describe, expect, it } from 'vitest';
import { fitsSteps, nextFreeInsert, noteName, patternLength, songLength } from './project';
import { BAR, STEP, formatPosition } from './time';
import type { Channel, Note, Pattern } from './types';

const note = (pos: number, key = 60, len = STEP): Note => ({ id: `${pos}:${key}`, pos, len, key, vel: 0.78 });
const pattern = (notes: Record<string, Note[]>, bars = 1): Pattern => ({ id: 'p', name: 'P', color: '#fff', bars, notes });

describe('patternLength', () => {
  it('is at least the minimum bar count', () => {
    expect(patternLength(pattern({}))).toBe(BAR);
    expect(patternLength(pattern({}, 4))).toBe(4 * BAR);
  });

  it('extends to the bar holding the last note start', () => {
    expect(patternLength(pattern({ a: [note(BAR - STEP)] }))).toBe(BAR);
    expect(patternLength(pattern({ a: [note(BAR)] }))).toBe(2 * BAR);
    // A long last note does not add bars by itself.
    expect(patternLength(pattern({ a: [note(BAR - STEP, 60, 8 * STEP)] }))).toBe(BAR);
  });
});

describe('fitsSteps', () => {
  it('accepts step-sequencer notes only', () => {
    expect(fitsSteps(undefined)).toBe(true);
    expect(fitsSteps([note(0), note(4 * STEP)])).toBe(true);
    expect(fitsSteps([note(0, 62)])).toBe(false);
    expect(fitsSteps([note(0, 60, 2 * STEP)])).toBe(false);
    expect(fitsSteps([note(STEP / 2)])).toBe(false);
    expect(fitsSteps([note(0), { ...note(0), id: 'dup' }])).toBe(false);
  });
});

describe('helpers', () => {
  it('names keys like FL Studio (60 is C5)', () => {
    expect(noteName(60)).toBe('C5');
    expect(noteName(61)).toBe('C#5');
    expect(noteName(0)).toBe('C0');
  });

  it('formats positions as bar:beat:step', () => {
    expect(formatPosition(0)).toBe('1:1:1');
    expect(formatPosition(BAR + 96 + STEP)).toBe('2:2:2');
  });

  it('measures the song in whole bars', () => {
    expect(songLength([])).toBe(BAR);
    expect(songLength([{ id: 'c', patternId: 'p', track: 0, pos: BAR, len: BAR / 2, offset: 0, muted: false }])).toBe(2 * BAR);
  });

  it('routes new channels to the first free insert', () => {
    const ch = (mixerTrack: number) => ({ mixerTrack }) as Channel;
    expect(nextFreeInsert([ch(1), ch(2), ch(4)], 25)).toBe(3);
    expect(nextFreeInsert([ch(1), ch(2)], 3)).toBe(0);
  });
});
