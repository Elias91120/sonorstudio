import { migrateColor } from '../core/palette';
import { makeMixer, makeTracks } from '../core/project';
import type { Project } from '../core/types';

const PROJECT_KEY = 'sonorstudio.project.v1';
const UI_KEY = 'sonorstudio.ui.v1';

/** Fills fields that older or hand-edited files may lack. Returns null when the data is not a project. */
export function normalizeProject(data: unknown): Project | null {
  if (!data || typeof data !== 'object') return null;
  const p = data as Partial<Project>;
  if (p.version !== 1 || !Array.isArray(p.channels) || !Array.isArray(p.patterns) || p.patterns.length === 0) return null;
  const mixer = makeMixer().map((m, i) => p.mixer?.[i] ?? m);
  const tracks = makeTracks().map((t, i) => p.tracks?.[i] ?? t);
  return {
    version: 1,
    name: typeof p.name === 'string' && p.name ? p.name : 'Untitled',
    bpm: typeof p.bpm === 'number' ? Math.min(522, Math.max(10, p.bpm)) : 130,
    swing: typeof p.swing === 'number' ? p.swing : 0,
    channels: p.channels.map((c) => ({ ...c, color: migrateColor(c.color ?? '') })),
    patterns: p.patterns.map((pt) => ({ ...pt, color: migrateColor(pt.color ?? '') })),
    clips: Array.isArray(p.clips) ? p.clips : [],
    tracks,
    mixer,
  };
}

export function loadStoredProject(): Project | null {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    return raw ? normalizeProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storeProject(p: Project): boolean {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadStoredUi<T>(): Partial<T> | null {
  try {
    const raw = localStorage.getItem(UI_KEY);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function storeUi(ui: unknown) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // Storage full or blocked: the layout just won't be remembered.
  }
}
