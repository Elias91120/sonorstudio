/**
 * The user's own sounds: audio files and zipped kits imported into the app.
 * The original encoded bytes are kept in IndexedDB (database "sonorstudio", store "samples") so a
 * library survives reloads and can travel with a project. Decoded buffers live in memory at the
 * bank's sample rate, so playback and the WAV export treat them exactly like the built-in sounds.
 */

import { strFromU8, unzipSync } from 'fflate';
import { create } from 'zustand';

export interface UserSample {
  /** "u_" plus the first 16 hex digits of the SHA-256 of the bytes: the same file never gets in twice. */
  id: string;
  /** File name without its extension. */
  name: string;
  /** "Imported" for loose files, or "<zip name>/<subfolder>" for kits. */
  folder: string;
  mime: string;
  /** The file as it was imported, not PCM: it is what exports and reloads start from. */
  bytes: ArrayBuffer;
  duration: number;
  createdAt: number;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface ImportResult {
  added: UserSample[];
  /** Already in the library, left untouched; callers may still want a channel for them. */
  existing: UserSample[];
  /** Every sound the import ended up with, new or already known, in the order the files came in. */
  ordered: UserSample[];
  skipped: SkippedFile[];
  /** Project bundles (.sonor.zip) whose sounds came in: the song itself is opened from the project menu. */
  projects?: string[];
  /** Set when the sounds work for this session but could not be saved for the next one. */
  storageError?: string;
}

/** A file from an input or a drop, with the folder it sat in when a whole folder came in. */
export interface IncomingFile {
  file: File;
  folder?: string;
}

/** A sound about to enter the library: a loose file, a zip entry or a sound from a project bundle. */
export interface SoundCandidate {
  name: string;
  folder: string;
  mime: string;
  bytes: ArrayBuffer;
}

export const LOOSE_FOLDER = 'Imported';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/**
 * Lossy files are small for their length (25 MB of MP3 is half an hour) and the length is only known
 * once the whole file is decoded to PCM, so they get a tighter cap to keep that decode affordable.
 */
export const MAX_LOSSY_BYTES = 8 * 1024 * 1024;
export const MAX_ZIP_BYTES = 250 * 1024 * 1024;
/** Sampler material, not whole songs: every decoded sound stays in memory for the session. */
export const MAX_SECONDS = 180;
/** The built-in bank and the WAV export both run at 44.1 kHz. */
export const SAMPLE_RATE = 44100;
export const STORAGE_ERROR = "This browser couldn't save them (storage is full or blocked), so they'll be gone after a reload.";
export const PROJECT_ENTRY = 'project.json';
export const MANIFEST_ENTRY = 'sounds.json';

const DB_NAME = 'sonorstudio';
const STORE = 'samples';
/** The stored library is already within the caps; new files may still hold a surprise. */
const LOAD_PARALLEL = 4;
const IMPORT_PARALLEL = 2;
const DB_TIMEOUT_MS = 5000;

const AUDIO_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  wave: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  aifc: 'audio/aiff',
  webm: 'audio/webm',
  weba: 'audio/webm',
  caf: 'audio/x-caf',
};

const EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/webm': 'webm',
  'audio/x-caf': 'caf',
};

/* Pure helpers, shared with the tests. */

export const isUserSampleId = (id: string) => id.startsWith('u_');

function extOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export const isAudioName = (name: string) => extOf(name) in AUDIO_TYPES;
export const isZipName = (name: string) => extOf(name) === 'zip';

const LOSSY_EXTENSIONS = new Set(['mp3', 'ogg', 'oga', 'opus', 'aac', 'm4a', 'webm', 'weba']);
const LOSSY_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/webm']);

/** Size cap for a sound, from its file name or, for bundle sounds without one, its type. */
export function sizeLimit(name: string, mime = ''): number {
  return LOSSY_EXTENSIONS.has(extOf(name)) || LOSSY_TYPES.has(mime.toLowerCase()) ? MAX_LOSSY_BYTES : MAX_FILE_BYTES;
}

export const tooBig = (limit: number) => `is bigger than ${Math.round(limit / (1024 * 1024))} MB`;

/** The folder of a file picked with a folder picker ("Kit/Kicks/a.wav" → "Kit/Kicks"), if any. */
export function folderOfPath(relativePath: string): string | undefined {
  const i = relativePath.lastIndexOf('/');
  return i > 0 ? relativePath.slice(0, i) : undefined;
}

/** The declared type when the browser knows one, else the type the extension suggests. */
export function mimeFor(name: string, declared = ''): string {
  if (declared.startsWith('audio/')) return declared;
  return AUDIO_TYPES[extOf(name)] ?? 'application/octet-stream';
}

/** File extension to write a sample back under; decoders sniff the content, so it is only cosmetic. */
export const extFor = (mime: string) => EXTENSIONS[mime.toLowerCase()] ?? 'bin';

/** "Kicks/808_Kick_Hard.WAV" → "808 Kick Hard". Underscores are how packs write spaces. */
export function cleanName(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const i = base.lastIndexOf('.');
  const stem = i > 0 ? base.slice(0, i) : base;
  return stem.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sound';
}

export async function sampleId(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  // Web Crypto only exists on secure origins (https, localhost); elsewhere a plain hash still dedups.
  if (!globalThis.crypto?.subtle) return `u_${fallbackHash(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))}`;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest, 0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  return `u_${hex}`;
}

/** Two 32-bit FNV-1a style lanes: 16 hex digits, like the Web Crypto ids. */
export function fallbackHash(u8: Uint8Array): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < u8.length; i++) {
    a = Math.imul(a ^ u8[i], 0x01000193);
    b = Math.imul(b ^ u8[i], 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** Bass sounds usually want one note at a time, like the built-in 808s. */
export const guessCutItself = (name: string) => /808|sub/i.test(name);

export interface ZipEntryPlan {
  path: string;
  name: string;
  folder: string;
}

/**
 * Picks the audio entries of a zip and names their folders "<zip>/<subfolder>". Packs often wrap
 * everything in a single top-level folder named like the zip itself, so that one is dropped.
 * macOS resource forks, dotfiles and directories are junk and skipped silently.
 */
export function planZipEntries(paths: string[], zipName: string): { kept: ZipEntryPlan[]; skipped: SkippedFile[] } {
  const skipped: SkippedFile[] = [];
  const files: string[] = [];
  for (const path of paths) {
    if (path.endsWith('/')) continue;
    const parts = path.split('/');
    if (parts[0] === '__MACOSX' || parts.some((p) => p.startsWith('.'))) continue;
    if (!isAudioName(path)) {
      skipped.push({ name: parts[parts.length - 1], reason: "isn't audio" });
      continue;
    }
    files.push(path);
  }
  const tops = new Set(files.map((p) => (p.includes('/') ? p.slice(0, p.indexOf('/')) : '')));
  const strip = tops.size === 1 && !tops.has('') ? [...tops][0].length + 1 : 0;
  const kept = files.map((path) => {
    const rel = path.slice(strip);
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    return { path, name: cleanName(rel), folder: dir ? `${zipName}/${dir}` : zipName };
  });
  return { kept, skipped };
}

export interface ManifestEntry {
  id: string;
  name: string;
  folder: string;
  mime: string;
  file: string;
}

function readManifest(entries: Record<string, Uint8Array>): ManifestEntry[] {
  try {
    const raw: unknown = entries[MANIFEST_ENTRY] ? JSON.parse(strFromU8(entries[MANIFEST_ENTRY])) : [];
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (m): m is ManifestEntry =>
        !!m && typeof m === 'object' && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.folder === 'string' && typeof m.file === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * The sounds inside a project zip, named from its manifest. A hand-made zip without one falls back
 * on the sample names the channels remember, and on the file names for the rest.
 */
export function bundleCandidates(entries: Record<string, Uint8Array>, project: unknown): SoundCandidate[] {
  const sounds: SoundCandidate[] = [];
  const manifest = readManifest(entries);
  if (manifest.length) {
    for (const m of manifest) {
      const bytes = entries[m.file];
      if (bytes) sounds.push({ name: m.name, folder: m.folder, mime: typeof m.mime === 'string' ? m.mime : mimeFor(m.file), bytes: toArrayBuffer(bytes) });
    }
    return sounds;
  }
  const names = new Map<string, string>();
  const channels = (project as { channels?: { sampler?: { sampleId?: string; sampleName?: string } }[] } | null)?.channels;
  if (Array.isArray(channels)) {
    for (const c of channels) if (c?.sampler?.sampleId && c.sampler.sampleName) names.set(c.sampler.sampleId, c.sampler.sampleName);
  }
  for (const [path, bytes] of Object.entries(entries)) {
    if (!path.startsWith('sounds/') || path.endsWith('/')) continue;
    const id = path.slice('sounds/'.length, path.lastIndexOf('.') > 0 ? path.lastIndexOf('.') : undefined);
    sounds.push({ name: names.get(id) ?? cleanName(path), folder: LOOSE_FOLDER, mime: mimeFor(path), bytes: toArrayBuffer(bytes) });
  }
  return sounds;
}

/** Unzips with the size caps checked on each entry's header, before anything is inflated. */
export function unzipCapped(data: Uint8Array): { entries: Record<string, Uint8Array>; skipped: SkippedFile[] } {
  const skipped: SkippedFile[] = [];
  let total = 0;
  let overflow = false;
  const entries = unzipSync(data, {
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      const limit = sizeLimit(f.name);
      if (f.originalSize > limit) {
        if (isAudioName(f.name)) skipped.push({ name: f.name.slice(f.name.lastIndexOf('/') + 1), reason: tooBig(limit) });
        return false;
      }
      total += f.originalSize;
      if (total > MAX_ZIP_BYTES) {
        overflow = true;
        return false;
      }
      return true;
    },
  });
  if (overflow) skipped.push({ name: 'the rest of the zip', reason: 'goes past 250 MB once unpacked' });
  return { entries, skipped };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Loose files first, then kits alphabetically; names sort numerically so "Kick 2" comes before "Kick 10". */
export function sortSamples(samples: UserSample[]): UserSample[] {
  return [...samples].sort((a, b) => {
    if (a.folder !== b.folder) {
      if (a.folder === LOOSE_FOLDER) return -1;
      if (b.folder === LOOSE_FOLDER) return 1;
      return collator.compare(a.folder, b.folder);
    }
    return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
  });
}

export function groupByFolder(samples: UserSample[]): { folder: string; items: UserSample[] }[] {
  const groups: { folder: string; items: UserSample[] }[] = [];
  for (const s of samples) {
    const last = groups[groups.length - 1];
    if (last && last.folder === s.folder) last.items.push(s);
    else groups.push({ folder: s.folder, items: [s] });
  }
  return groups;
}

/** One sentence for the hint bar: "12 sounds imported. 1 skipped: cover.jpg isn't audio." */
export function describeImport(r: ImportResult): string {
  const n = r.added.length;
  const e = r.existing.length;
  let text = n ? `${n} sound${n === 1 ? '' : 's'} imported` : 'Nothing imported';
  if (e) text += n ? `, ${e} already in your library` : ` (${e} already in your library)`;
  text += '.';
  if (r.skipped.length) {
    const shown = r.skipped.slice(0, 3).map((s) => `${s.name} ${s.reason}`);
    const more = r.skipped.length - shown.length;
    text += ` ${r.skipped.length} skipped: ${shown.join(', ')}${more ? `, and ${more} more` : ''}.`;
  }
  if (r.projects?.length) {
    const what = r.projects.length === 1 ? `${r.projects[0]} is a project` : `${r.projects.length} files are projects`;
    text += ` ${what}: open it from the SonorStudio menu to load the song.`;
  }
  if (r.storageError) text += ` ${r.storageError}`;
  return text;
}

/** An ArrayBuffer holding exactly these bytes, without copying when the view already spans its buffer. */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength && u8.buffer instanceof ArrayBuffer) return u8.buffer;
  return u8.slice().buffer as ArrayBuffer;
}

/* The library */

interface LibraryState {
  samples: UserSample[];
  /** False until IndexedDB has been read, so a referenced sample is not reported missing too early. */
  loaded: boolean;
}

export const useUserSamples = create<LibraryState>(() => ({ samples: [], loaded: false }));

const records = new Map<string, UserSample>();
const buffers = new Map<string, AudioBuffer>();

function publish() {
  useUserSamples.setState({ samples: sortSamples([...records.values()]), loaded: true });
}

export const getUserSample = (id: string): UserSample | null => records.get(id) ?? null;
export const getUserBuffer = (id: string): AudioBuffer | null => buffers.get(id) ?? null;

function isRecord(x: unknown): x is UserSample {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<UserSample>;
  return typeof r.id === 'string' && typeof r.name === 'string' && typeof r.folder === 'string' && r.bytes instanceof ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    // An open request can stay pending forever (a stuck upgrade in another tab): give up rather than hang
    // everything that waits on the library.
    const timer = setTimeout(() => reject(new Error('IndexedDB did not answer')), DB_TIMEOUT_MS);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      // The browser can close the connection under us (storage cleared, another tab upgrading).
      db.onclose = () => (dbPromise = null);
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error ?? new Error('IndexedDB refused to open'));
    };
    req.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB is blocked by another tab'));
    };
  });
  // A failed open is tried again next time: storage may be allowed later in the session.
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

/** Runs one transaction and resolves when it is committed, with the result of the request `run` returns. */
function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        let result: T | undefined;
        const req = run(tx.objectStore(STORE));
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      }),
  );
}

let decoder: OfflineAudioContext | null = null;

function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  // An offline context needs no user gesture and resamples everything to the bank's rate.
  decoder ??= new OfflineAudioContext(1, 1, SAMPLE_RATE);
  // decodeAudioData detaches the buffer it is given: it gets a copy, the record keeps the original.
  return decoder.decodeAudioData(bytes.slice(0));
}

async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

let loading: Promise<void> | null = null;

/** Reads the library from IndexedDB and decodes it. Never rejects: without storage the session starts empty. */
export function loadUserSamples(): Promise<void> {
  loading ??= (async () => {
    let stored: unknown[] = [];
    try {
      stored = (await transact<unknown[]>('readonly', (s) => s.getAll())) ?? [];
    } catch {
      // Private mode or blocked storage: imports still work for the session.
    }
    await eachLimit(stored, LOAD_PARALLEL, async (rec) => {
      if (!isRecord(rec)) return;
      try {
        buffers.set(rec.id, await decode(rec.bytes));
        records.set(rec.id, rec);
      } catch {
        // A corrupt entry, or a format this browser cannot decode: left out, not deleted.
      }
    });
    publish();
  })();
  return loading;
}

/** The library, or whatever part of it is ready after `ms`: playback should not wait on a slow disk. */
export function userSamplesReady(ms: number): Promise<void> {
  return Promise.race([loadUserSamples(), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

interface ReadOutcome {
  candidates: SoundCandidate[];
  skipped: SkippedFile[];
  projects: string[];
}

/** The bytes of a file, or null when the browser cannot read it (moved, permission revoked, unplugged drive). */
async function readBytes(file: File): Promise<ArrayBuffer | null> {
  try {
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function readCandidates(files: IncomingFile[]): Promise<ReadOutcome> {
  const out: ReadOutcome = { candidates: [], skipped: [], projects: [] };
  for (const { file, folder: given } of files) {
    const folder = given ?? folderOfPath(file.webkitRelativePath ?? '');
    // Hidden files come along with whole folders; nobody picked them on purpose.
    if (folder && file.name.startsWith('.')) continue;
    if (isZipName(file.name)) {
      if (file.size > MAX_ZIP_BYTES) {
        out.skipped.push({ name: file.name, reason: 'is bigger than 250 MB' });
        continue;
      }
      await readZip(file, out);
      continue;
    }
    if (!isAudioName(file.name) && !file.type.startsWith('audio/')) {
      out.skipped.push({ name: file.name, reason: "isn't audio" });
      continue;
    }
    const limit = sizeLimit(file.name, file.type);
    if (file.size > limit) {
      out.skipped.push({ name: file.name, reason: tooBig(limit) });
      continue;
    }
    const bytes = await readBytes(file);
    if (!bytes) {
      out.skipped.push({ name: file.name, reason: "couldn't be read" });
      continue;
    }
    out.candidates.push({ name: cleanName(file.name), folder: folder ?? LOOSE_FOLDER, mime: mimeFor(file.name, file.type), bytes });
  }
  return out;
}

async function readZip(file: File, out: ReadOutcome) {
  const data = await readBytes(file);
  if (!data) {
    out.skipped.push({ name: file.name, reason: "couldn't be read" });
    return;
  }
  let unzipped: ReturnType<typeof unzipCapped>;
  try {
    unzipped = unzipCapped(new Uint8Array(data));
  } catch {
    out.skipped.push({ name: file.name, reason: "isn't a zip the app can read" });
    return;
  }
  out.skipped.push(...unzipped.skipped);
  const { entries } = unzipped;
  if (entries[PROJECT_ENTRY]) {
    // A project bundle dropped as sounds: its sounds come in under their real names, not their file ids.
    let project: unknown = null;
    try {
      project = JSON.parse(strFromU8(entries[PROJECT_ENTRY]));
    } catch {
      // The sounds are still worth having without the song.
    }
    out.candidates.push(...bundleCandidates(entries, project));
    out.projects.push(file.name);
    return;
  }
  const plan = planZipEntries(Object.keys(entries), cleanName(file.name));
  out.skipped.push(...plan.skipped);
  for (const e of plan.kept) {
    out.candidates.push({ name: e.name, folder: e.folder, mime: mimeFor(e.path), bytes: toArrayBuffer(entries[e.path]) });
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Imports serially so two drops of the same file cannot race past the duplicate check. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

/** Audio files, folders' contents and .zip kits from a file input or a drop. Everything is reported. */
export function importFiles(files: Iterable<File | IncomingFile>): Promise<ImportResult> {
  const list = Array.from(files, (f) => (f instanceof File ? { file: f } : f));
  return enqueue(async () => {
    const { candidates, skipped, projects } = await readCandidates(list);
    const result = await addToLibrary(candidates);
    result.skipped.unshift(...skipped);
    if (projects.length) result.projects = projects;
    return result;
  });
}

/** Sounds that come with a project bundle: already named and foldered. */
export function importCandidates(candidates: SoundCandidate[]): Promise<ImportResult> {
  return enqueue(() => addToLibrary(candidates));
}

async function addToLibrary(candidates: SoundCandidate[]): Promise<ImportResult> {
  await loadUserSamples();
  const result: ImportResult = { added: [], existing: [], ordered: [], skipped: [] };
  const fresh: { c: SoundCandidate; id: string }[] = [];
  const order: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const limit = sizeLimit(c.name, c.mime);
    if (c.bytes.byteLength > limit) {
      result.skipped.push({ name: c.name, reason: tooBig(limit) });
      continue;
    }
    const id = await sampleId(c.bytes);
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const known = records.get(id);
    if (known) result.existing.push(known);
    else fresh.push({ c, id });
  }

  const decoded: { rec: UserSample; buf: AudioBuffer }[] = [];
  await eachLimit(fresh, IMPORT_PARALLEL, async ({ c, id }) => {
    let buf: AudioBuffer;
    try {
      buf = await decode(c.bytes);
    } catch {
      result.skipped.push({ name: c.name, reason: "couldn't be decoded" });
      return;
    }
    if (buf.duration > MAX_SECONDS) {
      result.skipped.push({ name: c.name, reason: 'is longer than 3 minutes' });
      return;
    }
    const rec: UserSample = { id, name: c.name, folder: c.folder, mime: c.mime, bytes: c.bytes, duration: buf.duration, createdAt: Date.now() };
    decoded.push({ rec, buf });
  });
  // Keep the candidates' order, not the order the decoders finished in.
  decoded.sort((a, b) => fresh.findIndex((f) => f.id === a.rec.id) - fresh.findIndex((f) => f.id === b.rec.id));

  if (decoded.length) {
    try {
      await transact('readwrite', (store) => {
        for (const { rec } of decoded) store.put(rec);
      });
    } catch {
      result.storageError = STORAGE_ERROR;
    }
    for (const { rec, buf } of decoded) {
      records.set(rec.id, rec);
      buffers.set(rec.id, buf);
      result.added.push(rec);
    }
    publish();
  }
  // Sounds that failed to decode are not in the library, so they drop out here.
  result.ordered = order.map((id) => records.get(id)).filter((s): s is UserSample => !!s);
  return result;
}

export async function removeSample(id: string): Promise<void> {
  if (!records.delete(id)) return;
  buffers.delete(id);
  publish();
  try {
    await transact('readwrite', (store) => store.delete(id));
  } catch {
    // Storage already failed at import time; the in-memory library is what counts this session.
  }
}

export async function removeFolder(folder: string): Promise<number> {
  const ids = [...records.values()].filter((s) => s.folder === folder).map((s) => s.id);
  for (const id of ids) {
    records.delete(id);
    buffers.delete(id);
  }
  if (ids.length) publish();
  try {
    await transact('readwrite', (store) => {
      for (const id of ids) store.delete(id);
    });
  } catch {
    // Same as removeSample.
  }
  return ids.length;
}

export async function renameSample(id: string, name: string): Promise<void> {
  const rec = records.get(id);
  const clean = name.trim();
  if (!rec || !clean || clean === rec.name) return;
  const next = { ...rec, name: clean };
  records.set(id, next);
  publish();
  try {
    await transact('readwrite', (store) => store.put(next));
  } catch {
    // Same as removeSample.
  }
}
