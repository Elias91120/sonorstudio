import { BAR, STEP, ceilTo } from './time';
import type { Channel, Clip, MixerTrack, Note, Pattern, PlaylistTrack } from './types';

/** C5: the key a channel rack step plays. */
export const ROOT_KEY = 60;
export const DEFAULT_VEL = 100 / 128;
export const DEFAULT_CHANNEL_VOLUME = 100 / 128;
export const DEFAULT_FADER = 0.8;
export const MIXER_INSERTS = 24;
export const PLAYLIST_TRACKS = 32;
export const KEY_COUNT = 128;

export function patternLength(p: Pattern): number {
  let lastStart = -1;
  for (const notes of Object.values(p.notes)) {
    for (const n of notes) if (n.pos > lastStart) lastStart = n.pos;
  }
  return Math.max(p.bars * BAR, ceilTo(lastStart + 1, BAR));
}

export function songLength(clips: Clip[]): number {
  let end = 0;
  for (const c of clips) end = Math.max(end, c.pos + c.len);
  return Math.max(BAR, ceilTo(end, BAR));
}

export function isStepNote(n: Note): boolean {
  return n.key === ROOT_KEY && n.len === STEP && n.pos % STEP === 0;
}

/** Whether a channel's notes can be shown as steps; otherwise the rack shows a piano roll preview. */
export function fitsSteps(notes: Note[] | undefined): boolean {
  if (!notes) return true;
  const seen = new Set<number>();
  for (const n of notes) {
    if (!isStepNote(n) || seen.has(n.pos)) return false;
    seen.add(n.pos);
  }
  return true;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const noteName = (key: number) => `${NOTE_NAMES[key % 12]}${Math.floor(key / 12)}`;

export const isBlackKey = (key: number) => [1, 3, 6, 8, 10].includes(key % 12);

export const volToGain = (v: number) => (v / DEFAULT_CHANNEL_VOLUME) ** 2;
export const faderToGain = (v: number) => (v / DEFAULT_FADER) ** 2;
export const velToGain = (vel: number) => Math.min(1.7, (vel / DEFAULT_VEL) ** 2);
export const dbToGain = (db: number) => 10 ** (db / 20);

export function formatDb(gain: number): string {
  if (gain <= 0.00001) return '-inf dB';
  const db = 20 * Math.log10(gain);
  return `${db >= 0.05 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function formatPan(p: number): string {
  if (Math.abs(p) < 0.005) return 'centered';
  return `${Math.round(Math.abs(p) * 100)}% ${p < 0 ? 'left' : 'right'}`;
}

export const formatPercent = (v: number) => `${Math.round(v * 100)}%`;

export function makeMixer(): MixerTrack[] {
  return Array.from({ length: MIXER_INSERTS + 1 }, (_, i) => ({
    name: i === 0 ? 'Master' : `Insert ${i}`,
    volume: DEFAULT_FADER,
    pan: 0,
    muted: false,
    fx: [],
  }));
}

export function makeTracks(): PlaylistTrack[] {
  return Array.from({ length: PLAYLIST_TRACKS }, (_, i) => ({ name: `Track ${i + 1}`, muted: false }));
}

export const isDefaultInsertName = (name: string, index: number) => name === `Insert ${index}`;

/** First insert no channel is routed to, or the master when all are taken. */
export function nextFreeInsert(channels: Channel[], mixerSize: number): number {
  const used = new Set(channels.map((c) => c.mixerTrack));
  for (let i = 1; i < mixerSize; i++) if (!used.has(i)) return i;
  return 0;
}
