import { describe, expect, it } from 'vitest';
import { FlpError, isFlp, parseFlp } from './flp';
import { flpToProject, guessStandIn, relinkPlan } from '../state/flpImport';

/** Builds a .flp event stream the way FL Studio writes one. */
class FlpWriter {
  private parts: number[] = [];
  byte(id: number, v: number) {
    this.parts.push(id, v & 0xff);
    return this;
  }
  word(id: number, v: number) {
    this.parts.push(id, v & 0xff, (v >> 8) & 0xff);
    return this;
  }
  dword(id: number, v: number) {
    this.parts.push(id, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }
  data(id: number, bytes: number[]) {
    this.parts.push(id);
    let n = bytes.length;
    do {
      this.parts.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0));
      n >>= 7;
    } while (n);
    this.parts.push(...bytes);
    return this;
  }
  ascii(id: number, s: string) {
    return this.data(id, [...s].map((c) => c.charCodeAt(0)).concat(0));
  }
  wide(id: number, s: string) {
    return this.data(id, [...s, '\0'].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]));
  }
  build(ppq = 96): Uint8Array {
    const header = [0x46, 0x4c, 0x68, 0x64, 6, 0, 0, 0, 0, 0, 1, 0, ppq & 0xff, ppq >> 8];
    const len = this.parts.length;
    const dt = [0x46, 0x4c, 0x64, 0x74, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, len >>> 24];
    return new Uint8Array([...header, ...dt, ...this.parts]);
  }
}

const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const note = (pos: number, channel: number, len: number, key: number, vel = 100) =>
  [...u32(pos), ...u16(0x4000), ...u16(channel), ...u32(len), ...u16(key), ...u16(0), 120, 0, 64, 0, 64, vel, 128, 128];
const levels = (pan: number, vol: number, pitch = 0) => [...u32(pan), ...u32(vol), ...u32(pitch), ...u32(0), ...u32(0), ...u32(0)];

function drillFlp() {
  return new FlpWriter()
    .ascii(199, '20.7.0.1714')
    .dword(156, 148000)
    .wide(194, 'Drill test')
    .word(65, 1)
    .data(224, [...note(0, 0, 0, 60), ...note(72, 1, 0, 60, 80), ...note(0, 2, 48, 65)])
    .word(65, 2)
    .wide(193, 'Bridge')
    .data(224, note(192, 0, 0, 60))
    .word(64, 0)
    .byte(21, 0)
    .wide(203, 'Kick')
    .data(219, levels(6400, 9300))
    .byte(22, 1)
    .wide(196, 'D:\\Kits\\GASSED\\PG GASSED Kick - Axel.wav')
    .word(64, 1)
    .byte(21, 0)
    .wide(203, 'PG GASSED Hihat - Monolith')
    .data(219, levels(9600, 10000))
    .byte(22, 2)
    .wide(196, 'D:\\Kits\\GASSED\\PG GASSED Hihat - Monolith.wav')
    .word(64, 2)
    .byte(21, 0)
    .wide(203, '808')
    .data(219, levels(6400, 10000, -1200))
    .byte(22, 3)
    .wide(196, 'C:/808s/PG GASSED 808 - Omen - C.wav')
    .word(64, 3)
    .byte(21, 5)
    .word(99, 0)
    .data(233, [...u32(0), ...u16(20480), ...u16(20481), ...u32(768), ...u16(499), ...u16(0), 0, 0, ...u16(0), ...u32(0), ...u32(0xffffffff), ...u32(0xffffffff)])
    .data(236, [0, 0, 12, 0])
    .wide(201, 'Fruity Limiter')
    .dword(147, 0)
    .data(236, [0, 0, 12, 0])
    .wide(204, 'Kicks')
    .dword(147, 0)
    .data(236, [0, 0, 12, 0])
    .wide(201, 'Fruity Wrapper')
    .wide(203, 'Some VST')
    .wide(201, 'Fruity Parametric EQ 2')
    .dword(147, 0)
    .data(236, [0, 0, 12, 0])
    .dword(147, 0)
    .data(225, [...u32(0), 192, 0, ...u16(2 << 6), ...u32(11044)])
    .build();
}

describe('parseFlp', () => {
  it('reads tempo, channels, notes, playlist and mixer', () => {
    const flp = parseFlp(drillFlp());
    expect(flp.version).toBe('20.7.0.1714');
    expect(flp.bpm).toBe(148);
    expect(flp.title).toBe('Drill test');
    expect(flp.channels.map((c) => c.name)).toEqual(['Kick', 'PG GASSED Hihat - Monolith', '808', undefined]);
    expect(flp.channels[0]).toMatchObject({ volume: 9300, pan: 6400, insert: 1, samplePath: 'D:\\Kits\\GASSED\\PG GASSED Kick - Axel.wav' });
    expect(flp.channels[2].pitch).toBe(-1200);
    expect(flp.channels[3].kind).toBe(5);
    expect(flp.patterns.map((p) => [p.index, p.name, p.notes.length])).toEqual([
      [1, undefined, 3],
      [2, 'Bridge', 1],
    ]);
    expect(flp.patterns[0].notes[2]).toEqual({ pos: 0, channel: 2, len: 48, key: 65, vel: 100 });
    expect(flp.playlist).toEqual([{ pos: 0, len: 768, pattern: 1, track: 0, startOffset: -1, muted: false }]);
    expect(flp.inserts.map((i) => [i.name, i.plugins, i.volume])).toEqual([
      [undefined, ['Fruity Limiter'], 12800],
      ['Kicks', [], 12800],
      [undefined, ['Some VST', 'Fruity Parametric EQ 2'], 11044],
    ]);
  });

  it('rejects files that are not FL Studio projects', () => {
    expect(isFlp(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(() => parseFlp(new TextEncoder().encode('{"version":1}'))).toThrow(FlpError);
    // Cut in the middle of an event.
    expect(() => parseFlp(drillFlp().subarray(0, 60))).toThrow(FlpError);
  });

  it('rescales other resolutions to 96 PPQ', () => {
    const flp = parseFlp(new FlpWriter().ascii(199, '21.0.0').word(65, 1).data(224, note(192, 0, 0, 60)).word(64, 0).wide(196, 'kick.wav').build(192));
    const { project } = flpToProject(flp, 'x', () => null, (p) => p.replace(/\.wav$/, ''));
    expect(project.patterns[0].notes[project.channels[0].id][0].pos).toBe(96);
  });
});

describe('flpToProject', () => {
  const clean = (path: string) => path.replace(/\.[^.]+$/, '');

  it('links samples by name and plays stand-ins for the missing ones', () => {
    const library: Record<string, string> = { 'PG GASSED Kick - Axel': 'u_kick' };
    const { project, missing, plugins } = flpToProject(parseFlp(drillFlp()), 'file', (n) => library[n] ?? null, clean);
    expect(project.name).toBe('Drill test');
    expect(project.bpm).toBe(148);
    expect(project.channels).toHaveLength(3);
    const [kick, hat, bass] = project.channels;
    expect(kick.sampler).toMatchObject({ sampleId: 'u_kick', sampleName: 'PG GASSED Kick - Axel', standIn: 'kick-808' });
    expect(kick.volume).toBeCloseTo(9300 / 12800);
    expect(kick.mixerTrack).toBe(1);
    expect(hat.pan).toBeCloseTo(0.5);
    expect(hat.sampler?.sampleId).toMatch(/^u_missing_/);
    expect(bass.sampler).toMatchObject({ standIn: '808-classic', pitch: -12, cutItself: true });
    expect(missing).toEqual(['PG GASSED Hihat - Monolith', 'PG GASSED 808 - Omen - C']);
    expect(plugins).toEqual(['Some VST']);

    const [main, bridge] = project.patterns;
    expect(bridge.name).toBe('Bridge');
    expect(main.notes[kick.id][0]).toMatchObject({ pos: 0, len: 24, key: 60 });
    expect(main.notes[hat.id][0].vel).toBeCloseTo(80 / 128);
    expect(main.notes[bass.id][0]).toMatchObject({ len: 48, key: 65 });
    expect(project.clips).toMatchObject([{ patternId: main.id, track: 0, pos: 0, len: 768, offset: 0 }]);

    expect(project.mixer[0].fx.map((f) => f.type)).toEqual(['limiter']);
    expect(project.mixer[1].name).toBe('Kicks');
    expect(project.mixer[2].name).toBe('PG GASSED Hihat - Monolith');
    expect(project.mixer[2].volume).toBeCloseTo((11044 / 12800) * 0.8);
    expect(project.mixer[2].fx.map((f) => f.type)).toEqual(['eq']);
  });

  it('guesses stand-ins from sample names', () => {
    expect(guessStandIn('PG GASSED Countersnare - Nova')).toBe('rim');
    expect(guessStandIn('PG GASSED Snare - Faded')).toBe('snare-trap');
    expect(guessStandIn('PG GASSED Percussion - Kato - G')).toBe('conga');
    expect(guessStandIn('Open Hat 3')).toBe('hat-open');
  });
});

describe('relinkPlan', () => {
  it('links missing samples to library sounds of the same name, ignoring case', () => {
    const { project } = flpToProject(parseFlp(drillFlp()), 'file', () => null, (p) => p.replace(/\.[^.]+$/, ''));
    const plan = relinkPlan(project, [
      { id: 'u_hat', name: 'pg gassed hihat - monolith' },
      { id: 'u_other', name: 'Something else' },
    ]);
    expect([...plan.values()]).toEqual(['u_hat']);
    expect(plan.get(project.channels[1].id)).toBe('u_hat');
    expect(relinkPlan(project, [])).toEqual(new Map());
  });
});
