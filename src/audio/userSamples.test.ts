import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { unpackProject } from '../state/bundle';
import {
  bundleCandidates,
  cleanName,
  describeImport,
  extFor,
  fallbackHash,
  folderOfPath,
  groupByFolder,
  guessCutItself,
  isAudioName,
  isZipName,
  LOOSE_FOLDER,
  MAX_FILE_BYTES,
  MAX_LOSSY_BYTES,
  mimeFor,
  planZipEntries,
  sampleId,
  sizeLimit,
  sortSamples,
  toArrayBuffer,
  tooBig,
  unzipCapped,
  type ImportResult,
  type UserSample,
} from './userSamples';

const bytes = (s: string) => new TextEncoder().encode(s);
const sample = (name: string, folder = LOOSE_FOLDER): UserSample => ({
  id: `u_${name}`,
  name,
  folder,
  mime: 'audio/wav',
  bytes: new ArrayBuffer(0),
  duration: 0.1,
  createdAt: 0,
});
const result = (over: Partial<ImportResult>): ImportResult => ({ added: [], existing: [], ordered: [], skipped: [], ...over });

describe('sampleId', () => {
  it('is the SHA-256 prefix of the bytes, whatever the file is called', async () => {
    // SHA-256("abc") = ba7816bf 8f01cfea 414140de ...
    expect(await sampleId(bytes('abc'))).toBe('u_ba7816bf8f01cfea');
    expect(await sampleId(toArrayBuffer(bytes('abc')))).toBe('u_ba7816bf8f01cfea');
    expect(await sampleId(bytes('abd'))).not.toBe('u_ba7816bf8f01cfea');
  });

  it('copies a view that does not span its buffer', () => {
    const big = new Uint8Array([1, 2, 3, 4, 5]);
    const view = big.subarray(1, 3);
    expect(Array.from(new Uint8Array(toArrayBuffer(view)))).toEqual([2, 3]);
    expect(toArrayBuffer(big)).toBe(big.buffer);
  });
});

describe('cleanName', () => {
  it('drops the path and the extension and reads underscores as spaces', () => {
    expect(cleanName('Kicks/808_Kick_Hard.WAV')).toBe('808 Kick Hard');
    expect(cleanName('C:\\packs\\clap.mp3')).toBe('clap');
    expect(cleanName('snare.v2.wav')).toBe('snare.v2');
    expect(cleanName('noext')).toBe('noext');
    expect(cleanName('___.wav')).toBe('Sound');
  });
});

describe('planZipEntries', () => {
  it('keeps the audio, names folders after the zip and drops the wrapping folder', () => {
    const paths = [
      'My Kit/',
      'My Kit/Kicks/kick_01.wav',
      'My Kit/Kicks/kick_02.wav',
      'My Kit/Snares/snare.flac',
      'My Kit/readme.txt',
      'My Kit/loop.wav',
      '__MACOSX/My Kit/Kicks/._kick_01.wav',
      'My Kit/.DS_Store',
    ];
    const { kept, skipped } = planZipEntries(paths, 'My Kit');
    expect(kept.map((k) => [k.folder, k.name])).toEqual([
      ['My Kit/Kicks', 'kick 01'],
      ['My Kit/Kicks', 'kick 02'],
      ['My Kit/Snares', 'snare'],
      ['My Kit', 'loop'],
    ]);
    expect(kept[0].path).toBe('My Kit/Kicks/kick_01.wav');
    // Junk is silent; a real file that is not audio is reported.
    expect(skipped).toEqual([{ name: 'readme.txt', reason: "isn't audio" }]);
  });

  it('keeps several top-level folders and files at the root as they are', () => {
    expect(planZipEntries(['Kicks/a.wav', 'Snares/b.wav'], 'kit').kept.map((k) => k.folder)).toEqual(['kit/Kicks', 'kit/Snares']);
    expect(planZipEntries(['a.wav', 'Kicks/b.wav'], 'kit').kept.map((k) => k.folder)).toEqual(['kit', 'kit/Kicks']);
    expect(planZipEntries([], 'kit')).toEqual({ kept: [], skipped: [] });
  });
});

describe('file types', () => {
  it('recognizes audio and zips by extension, case aside', () => {
    expect(isAudioName('x.WAV')).toBe(true);
    expect(isAudioName('dir.wav/x.txt')).toBe(false);
    expect(isAudioName('x.zip')).toBe(false);
    expect(isZipName('kit.ZIP')).toBe(true);
  });

  it('trusts a declared audio type and falls back to the extension', () => {
    expect(mimeFor('a.flac')).toBe('audio/flac');
    expect(mimeFor('a.flac', 'application/octet-stream')).toBe('audio/flac');
    expect(mimeFor('a.wav', 'audio/x-wav')).toBe('audio/x-wav');
    expect(mimeFor('a.xyz')).toBe('application/octet-stream');
  });

  it('maps types back to an extension for exports', () => {
    expect(extFor('audio/x-wav')).toBe('wav');
    expect(extFor('audio/mpeg')).toBe('mp3');
    expect(extFor('AUDIO/MP4')).toBe('m4a');
    expect(extFor('nope')).toBe('bin');
  });
});

describe('guessCutItself', () => {
  it('cuts bass sounds, not drums', () => {
    expect(guessCutItself('808 Long')).toBe(true);
    expect(guessCutItself('Sub Bass C')).toBe(true);
    expect(guessCutItself('Kick Hard')).toBe(false);
  });
});

describe('describeImport', () => {
  it('counts what came in and names what did not', () => {
    const added = Array.from({ length: 12 }, (_, i) => sample(`s${i}`));
    expect(describeImport(result({ added, skipped: [{ name: 'cover.jpg', reason: "isn't audio" }] }))).toBe(
      "12 sounds imported. 1 skipped: cover.jpg isn't audio.",
    );
    expect(describeImport(result({ added: [sample('a')] }))).toBe('1 sound imported.');
    expect(describeImport(result({ existing: [sample('a'), sample('b')] }))).toBe('Nothing imported (2 already in your library).');
  });

  it('keeps long skip lists short and mentions storage trouble', () => {
    const skipped = ['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, reason: "couldn't be decoded" }));
    expect(describeImport(result({ added: [sample('x')], existing: [sample('y')], skipped, storageError: 'No room.' }))).toBe(
      "1 sound imported, 1 already in your library. 5 skipped: a couldn't be decoded, b couldn't be decoded, c couldn't be decoded, and 2 more. No room.",
    );
  });
});

describe('fallbackHash', () => {
  it('gives 16 stable hex digits that change with the content', () => {
    expect(fallbackHash(bytes('abc'))).toMatch(/^[0-9a-f]{16}$/);
    expect(fallbackHash(bytes('abc'))).toBe(fallbackHash(bytes('abc')));
    expect(fallbackHash(bytes('abc'))).not.toBe(fallbackHash(bytes('abd')));
    expect(fallbackHash(new Uint8Array(0))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('size caps and folders', () => {
  it('caps lossy files tighter, by extension or by type', () => {
    expect(sizeLimit('kick.wav')).toBe(MAX_FILE_BYTES);
    expect(sizeLimit('kick.flac')).toBe(MAX_FILE_BYTES);
    expect(sizeLimit('loop.MP3')).toBe(MAX_LOSSY_BYTES);
    expect(sizeLimit('Kick hard', 'audio/mpeg')).toBe(MAX_LOSSY_BYTES);
    expect(tooBig(MAX_LOSSY_BYTES)).toBe('is bigger than 8 MB');
  });

  it('reads the folder out of a folder-picker path', () => {
    expect(folderOfPath('Vinyl kit/Kicks/kick.wav')).toBe('Vinyl kit/Kicks');
    expect(folderOfPath('kick.wav')).toBeUndefined();
    expect(folderOfPath('')).toBeUndefined();
  });
});

describe('unzipCapped', () => {
  it('reports oversized audio from the headers instead of inflating it', () => {
    const big = new Uint8Array(MAX_LOSSY_BYTES + 1);
    const zip = zipSync({ 'Kit/loop.mp3': [big, { level: 0 }], 'Kit/kick.wav': strToU8('RIFF'), 'Kit/notes.bin': [big, { level: 0 }] });
    const { entries, skipped } = unzipCapped(zip);
    expect(Object.keys(entries)).toEqual(['Kit/kick.wav', 'Kit/notes.bin']);
    expect(skipped).toEqual([{ name: 'loop.mp3', reason: 'is bigger than 8 MB' }]);
  });
});

describe('project bundles', () => {
  const project = { version: 1, channels: [{ sampler: { sampleId: 'u_aaaa', sampleName: 'Kick hard' } }] };

  it('names the sounds from the manifest', () => {
    const zip = zipSync({
      'project.json': strToU8(JSON.stringify(project)),
      'sounds.json': strToU8(JSON.stringify([{ id: 'u_aaaa', name: 'Kick hard', folder: 'Vinyl kit', mime: 'audio/wav', file: 'sounds/u_aaaa.wav' }])),
      'sounds/u_aaaa.wav': strToU8('RIFFdata'),
    });
    const bundle = unpackProject(zip);
    expect(bundle?.sounds.map((s) => [s.name, s.folder, s.mime])).toEqual([['Kick hard', 'Vinyl kit', 'audio/wav']]);
    expect(bundle?.skipped).toEqual([]);
  });

  it('falls back on the channels and file names without a manifest', () => {
    const entries = { 'sounds/u_aaaa.wav': strToU8('a'), 'sounds/u_bbbb.mp3': strToU8('b') };
    expect(bundleCandidates(entries, project).map((s) => [s.name, s.folder, s.mime])).toEqual([
      ['Kick hard', LOOSE_FOLDER, 'audio/wav'],
      ['u bbbb', LOOSE_FOLDER, 'audio/mpeg'],
    ]);
  });

  it('is not a project without project.json', () => {
    expect(unpackProject(zipSync({ 'kick.wav': strToU8('a') }))).toBeNull();
    expect(unpackProject(strToU8('not a zip'))).toBeNull();
  });

  it('tells the user how to open a bundle that came in as sounds', () => {
    expect(describeImport(result({ added: [sample('a')], projects: ['beat.sonor.zip'] }))).toBe(
      '1 sound imported. beat.sonor.zip is a project: open it from the SonorStudio menu to load the song.',
    );
  });
});

describe('sortSamples and groupByFolder', () => {
  it('puts loose files first, then kits, with numeric names in order', () => {
    const list = [sample('Kick 10', 'Zed/Kicks'), sample('clap'), sample('Kick 2', 'Zed/Kicks'), sample('hat', 'Alpha'), sample('Clap 2')];
    const groups = groupByFolder(sortSamples(list));
    expect(groups.map((g) => [g.folder, g.items.map((s) => s.name)])).toEqual([
      [LOOSE_FOLDER, ['clap', 'Clap 2']],
      ['Alpha', ['hat']],
      ['Zed/Kicks', ['Kick 2', 'Kick 10']],
    ]);
  });
});
