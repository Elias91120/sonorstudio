/**
 * Reader for FL Studio project files (.flp), from the publicly documented format (see the PyFLP project).
 * It keeps what SonorStudio can play: tempo, channels and their samples, pattern notes, playlist clips and the
 * mixer's levels and native effects. Plugin states are opaque blobs and are not read.
 *
 * A .flp is a "FLhd" header chunk then a "FLdt" chunk holding a flat list of events. The event id gives the size:
 * below 64 one byte follows, below 128 a word, below 192 a dword, from 192 a varint length then that many bytes.
 * Ownership is positional: a "new channel" event opens a channel and the events after it belong to it, and so on.
 */

export interface FlpNote {
  /** Channel index ("iid") the note plays. */
  channel: number;
  pos: number;
  /** 0 for a step sequencer note, which plays the whole sample. */
  len: number;
  key: number;
  /** 0..128, 100 is FL Studio's default. */
  vel: number;
}

export interface FlpPattern {
  /** 1-based, as playlist items refer to it. */
  index: number;
  name?: string;
  notes: FlpNote[];
}

export interface FlpChannel {
  index: number;
  /** 0 sampler, 2 native plugin, 3 layer, 4 instrument, 5 automation. */
  kind: number;
  name?: string;
  plugin?: string;
  samplePath?: string;
  /** 0..12800, 10000 is the default. */
  volume: number;
  /** 0..12800, 6400 is centered. */
  pan: number;
  /** Cents. */
  pitch: number;
  insert: number;
}

export interface FlpPlaylistItem {
  pos: number;
  len: number;
  /** 1-based pattern index, or null for an audio or automation clip. */
  pattern: number | null;
  /** 0-based playlist track. */
  track: number;
  /** Ticks into the pattern where the clip starts reading, or -1. */
  startOffset: number;
  muted: boolean;
}

export interface FlpInsert {
  index: number;
  name?: string;
  /** 0..16000, 12800 is 0 dB. */
  volume: number;
  /** -6400..6400. */
  pan: number;
  /** Internal names of the plugins in its slots, in slot order. */
  plugins: string[];
}

export interface FlpProject {
  version: string;
  ppq: number;
  bpm: number;
  title?: string;
  artist?: string;
  channels: FlpChannel[];
  patterns: FlpPattern[];
  playlist: FlpPlaylistItem[];
  inserts: FlpInsert[];
}

const EV = {
  version: 199,
  tempo: 156,
  tempoCoarse: 66,
  tempoFine: 93,
  title: 194,
  artist: 207,
  newChannel: 64,
  channelKind: 21,
  channelInsert: 22,
  samplePath: 196,
  pluginInternalName: 201,
  pluginName: 203,
  channelLevels: 219,
  newPattern: 65,
  patternName: 193,
  patternNotes: 224,
  newArrangement: 99,
  playlistItems: 233,
  insertFlags: 236,
  insertName: 204,
  insertOutput: 147,
  mixerParams: 225,
} as const;

const MIXER_VOLUME = 192;
const MIXER_PAN = 193;
/** FL Studio 12.9 and later count playlist tracks down from this one. */
const LAST_TRACK = 499;
const MUTED_ITEM = 1 << 13;

export class FlpError extends Error {}

export const isFlp = (bytes: Uint8Array) => bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'FLhd';

export function parseFlp(bytes: Uint8Array): FlpProject {
  if (!isFlp(bytes)) throw new FlpError('not an FL Studio project');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = view.getUint32(4, true);
  const ppq = view.getUint16(12, true) || 96;
  let p = 8 + headerLen;
  if (String.fromCharCode(...bytes.subarray(p, p + 4)) !== 'FLdt') throw new FlpError('missing data chunk');
  p += 8;

  const out: FlpProject = { version: '', ppq, bpm: 0, channels: [], patterns: [], playlist: [], inserts: [] };
  let wide = true;
  let coarse = 0;
  let fine = 0;
  let channel: FlpChannel | null = null;
  let pattern: FlpPattern | null = null;
  // Once the mixer starts, plugin names belong to insert slots, not to channels.
  let insert: FlpInsert | null = null;
  let mixerIndex = 0;
  const insertAt = (i: number) => {
    while (out.inserts.length <= i) out.inserts.push({ index: out.inserts.length, volume: 12800, pan: 0, plugins: [] });
    return out.inserts[i];
  };
  const patternAt = (i: number) => {
    let pt = out.patterns.find((x) => x.index === i);
    if (!pt) out.patterns.push((pt = { index: i, notes: [] }));
    return pt;
  };
  const text = (data: Uint8Array) => {
    let s = '';
    if (wide) for (let i = 0; i + 1 < data.length; i += 2) s += String.fromCharCode(data[i] | (data[i + 1] << 8));
    else s = String.fromCharCode(...data);
    return s.replace(/\0+$/, '');
  };

  while (p < bytes.length) {
    const id = bytes[p++];
    let num = 0;
    let data: Uint8Array | null = null;
    if (id < 64) num = bytes[p++];
    else if (id < 128) (num = view.getUint16(p, true)), (p += 2);
    else if (id < 192) (num = view.getUint32(p, true)), (p += 4);
    else {
      let len = 0;
      for (let shift = 0; ; shift += 7) {
        if (p >= bytes.length) throw new FlpError('truncated event');
        const b = bytes[p++];
        len |= (b & 0x7f) << shift;
        if (b < 128) break;
      }
      if (p + len > bytes.length) throw new FlpError('truncated event');
      data = bytes.subarray(p, p + len);
      p += len;
    }

    switch (id) {
      case EV.version:
        out.version = String.fromCharCode(...data!).replace(/\0+$/, '');
        // Text became UTF-16 in FL Studio 11.5.
        wide = versionAtLeast(out.version, 11, 5);
        break;
      case EV.tempo:
        out.bpm = num / 1000;
        break;
      case EV.tempoCoarse:
        coarse = num;
        break;
      case EV.tempoFine:
        fine = num;
        break;
      case EV.title:
        // Titles may hold typographic spaces (U+2006 and friends).
        out.title = text(data!).replace(/\s+/g, ' ').trim() || undefined;
        break;
      case EV.artist:
        out.artist = text(data!) || undefined;
        break;
      case EV.newChannel:
        insert = null;
        channel = { index: num, kind: 0, volume: 10000, pan: 6400, pitch: 0, insert: 0 };
        out.channels.push(channel);
        break;
      case EV.channelKind:
        if (channel) channel.kind = num;
        break;
      case EV.channelInsert:
        if (channel) channel.insert = num;
        break;
      case EV.samplePath:
        if (channel) channel.samplePath = text(data!) || undefined;
        break;
      case EV.pluginInternalName: {
        const name = text(data!);
        if (insert) {
          if (name) insert.plugins.push(name);
        } else if (channel && name) channel.plugin = name;
        break;
      }
      case EV.pluginName: {
        const name = text(data!);
        // A VST in a mixer slot is saved as "Fruity Wrapper" followed by its real name.
        if (insert) {
          if (name && insert.plugins[insert.plugins.length - 1] === 'Fruity Wrapper') insert.plugins[insert.plugins.length - 1] = name;
        } else if (channel) channel.name = name || channel.name;
        break;
      }
      case EV.channelLevels:
        if (channel && data!.length >= 12) {
          const v = new DataView(data!.buffer, data!.byteOffset, data!.byteLength);
          channel.pan = v.getUint32(0, true);
          channel.volume = v.getUint32(4, true);
          channel.pitch = v.getInt32(8, true);
        }
        break;
      case EV.newPattern:
        pattern = patternAt(num);
        break;
      case EV.patternName:
        if (pattern) pattern.name = text(data!) || undefined;
        break;
      case EV.patternNotes:
        if (pattern) pattern.notes.push(...readNotes(data!));
        break;
      case EV.newArrangement:
        channel = null;
        break;
      case EV.playlistItems:
        // Only the first arrangement: SonorStudio has one playlist.
        if (!out.playlist.length) out.playlist = readPlaylist(data!, versionAtLeast(out.version, 21, 0));
        break;
      case EV.insertFlags:
        channel = null;
        insert = insertAt(mixerIndex);
        break;
      case EV.insertName:
        if (insert) insert.name = text(data!) || undefined;
        break;
      case EV.insertOutput:
        // The output event closes an insert; what follows belongs to the next one.
        if (insert) insert = insertAt(++mixerIndex);
        break;
      case EV.mixerParams:
        readMixerParams(data!, insertAt);
        break;
    }
  }
  if (!out.bpm) out.bpm = coarse ? coarse + fine / 1000 : 140;
  // Closing the last insert opened an empty one, and FL Studio saves unused inserts too.
  while (out.inserts.length && isBlankInsert(out.inserts[out.inserts.length - 1])) out.inserts.pop();
  out.patterns.sort((a, b) => a.index - b.index);
  return out;
}

const isBlankInsert = (i: FlpInsert) => !i.name && !i.plugins.length && i.volume === 12800 && i.pan === 0;

function versionAtLeast(version: string, major: number, minor: number): boolean {
  const [a = 0, b = 0] = version.split('.').map((x) => parseInt(x, 10) || 0);
  return a > major || (a === major && b >= minor);
}

/** 24 bytes per note. */
function readNotes(data: Uint8Array): FlpNote[] {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const notes: FlpNote[] = [];
  for (let i = 0; i + 24 <= data.length; i += 24) {
    notes.push({
      pos: v.getUint32(i, true),
      channel: v.getUint16(i + 6, true),
      len: v.getUint32(i + 8, true),
      key: v.getUint16(i + 12, true),
      vel: data[i + 21],
    });
  }
  return notes;
}

/** 32 bytes per item, 60 since FL Studio 21. */
function readPlaylist(data: Uint8Array, fl21: boolean): FlpPlaylistItem[] {
  const size = fl21 && data.length % 60 === 0 ? 60 : 32;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const items: FlpPlaylistItem[] = [];
  for (let i = 0; i + size <= data.length; i += size) {
    const base = v.getUint16(i + 4, true);
    const index = v.getUint16(i + 6, true);
    items.push({
      pos: v.getUint32(i, true),
      len: v.getUint32(i + 8, true),
      pattern: index > base ? index - base : null,
      track: LAST_TRACK - v.getUint16(i + 12, true),
      startOffset: v.getInt32(i + 24, true),
      muted: (v.getUint16(i + 18, true) & MUTED_ITEM) !== 0,
    });
  }
  return items;
}

/** 12 bytes per parameter; the insert is packed in the "channel data" word with the slot. */
function readMixerParams(data: Uint8Array, insertAt: (i: number) => FlpInsert) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i + 12 <= data.length; i += 12) {
    const param = data[i + 4];
    if (param !== MIXER_VOLUME && param !== MIXER_PAN) continue;
    const ins = insertAt((v.getUint16(i + 6, true) >> 6) & 0x7f);
    const value = v.getInt32(i + 8, true);
    if (param === MIXER_VOLUME) ins.volume = value;
    else ins.pan = value;
  }
}
