import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { Project } from '../core/types';
import { createDemoProject } from './demo';
import { loadStoredProject, loadStoredUi } from './storage';

export type WinId = 'playlist' | 'channelRack' | 'pianoRoll' | 'mixer' | 'channelSettings';
export type Mode = 'pattern' | 'song';

export interface WinState {
  open: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean;
}

export type ProjectRecipe = (d: Draft<Project>) => void;

export interface StudioState {
  project: Project;
  past: Project[];
  future: Project[];
  mode: Mode;
  playing: boolean;
  currentPatternId: string;
  /** Channel edited by the piano roll and played by the typing keyboard. */
  selectedChannelId: string | null;
  selectedMixerTrack: number;
  songStart: number;
  windows: Record<WinId, WinState>;
  focused: WinId | null;
  topZ: number;
  browserOpen: boolean;
  typingKeyboard: boolean;

  /** Saves the current project as an undo step; call it when a gesture begins. */
  checkpoint(): void;
  /** Edits the project without an undo step (used during gestures). */
  mutate(recipe: ProjectRecipe): void;
  /** Edits the project as one undo step. */
  commit(recipe: ProjectRecipe): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project, mode?: Mode): void;

  setMode(m: Mode): void;
  setCurrentPattern(id: string): void;
  selectChannel(id: string | null): void;
  selectMixerTrack(i: number): void;
  setSongStart(tick: number): void;
  openWindow(id: WinId): void;
  closeWindow(id: WinId): void;
  toggleWindow(id: WinId): void;
  focusWindow(id: WinId): void;
  setWindowRect(id: WinId, rect: Partial<Pick<WinState, 'x' | 'y' | 'w' | 'h'>>): void;
  toggleMax(id: WinId): void;
  toggleBrowser(): void;
  setTypingKeyboard(on: boolean): void;
}

export interface StoredUi {
  windows: Record<WinId, WinState>;
  browserOpen: boolean;
  typingKeyboard: boolean;
  mode: Mode;
}

const HISTORY = 100;
export const BROWSER_WIDTH = 236;
export const TOPBAR_HEIGHT = 56;

function defaultWindows(): Record<WinId, WinState> {
  const W = Math.max(960, window.innerWidth - BROWSER_WIDTH);
  const H = Math.max(560, window.innerHeight - TOPBAR_HEIGHT);
  return {
    playlist: { open: true, x: 0, y: 0, w: W, h: H, z: 1, max: true },
    channelRack: { open: true, x: 28, y: 32, w: 780, h: Math.min(H - 48, 520), z: 4, max: false },
    pianoRoll: { open: false, x: 64, y: 56, w: Math.min(W - 96, 1080), h: Math.min(H - 80, 540), z: 2, max: false },
    mixer: { open: false, x: 40, y: Math.max(24, H - 420), w: Math.min(W - 64, 1180), h: 400, z: 2, max: false },
    channelSettings: { open: false, x: Math.max(40, W - 440), y: 32, w: 400, h: Math.min(H - 56, 680), z: 3, max: false },
  };
}

/** Keeps selections pointing at things that still exist after an edit, undo or load. */
function validSelection(p: Project, s: Pick<StudioState, 'currentPatternId' | 'selectedChannelId' | 'selectedMixerTrack'>) {
  return {
    currentPatternId: p.patterns.some((x) => x.id === s.currentPatternId) ? s.currentPatternId : (p.patterns[0]?.id ?? ''),
    selectedChannelId:
      s.selectedChannelId && p.channels.some((c) => c.id === s.selectedChannelId)
        ? s.selectedChannelId
        : (p.channels[0]?.id ?? null),
    selectedMixerTrack: Math.min(s.selectedMixerTrack, p.mixer.length - 1),
  };
}

function topmostOpen(windows: Record<WinId, WinState>, except: WinId): WinId | null {
  let best: WinId | null = null;
  for (const [id, w] of Object.entries(windows) as [WinId, WinState][]) {
    if (id !== except && w.open && (!best || w.z > windows[best].z)) best = id;
  }
  return best;
}

const storedProject = loadStoredProject();
const initialProject = storedProject ?? createDemoProject();
const storedUi = loadStoredUi<StoredUi>();
const initialWindows = { ...defaultWindows(), ...storedUi?.windows };

export const useStudio = create<StudioState>()((set, get) => ({
  project: initialProject,
  past: [],
  future: [],
  mode: storedUi?.mode ?? (storedProject ? 'pattern' : 'song'),
  playing: false,
  ...validSelection(initialProject, { currentPatternId: '', selectedChannelId: null, selectedMixerTrack: 1 }),
  songStart: 0,
  windows: initialWindows,
  focused: topmostOpen(initialWindows, 'playlist') ?? 'playlist',
  topZ: Math.max(...Object.values(initialWindows).map((w) => w.z)),
  browserOpen: storedUi?.browserOpen ?? true,
  typingKeyboard: storedUi?.typingKeyboard ?? true,

  checkpoint: () => set((s) => ({ past: [...s.past.slice(-(HISTORY - 1)), s.project], future: [] })),

  mutate: (recipe) =>
    set((s) => {
      const next = produce(s.project, recipe);
      return next === s.project ? s : { project: next, ...validSelection(next, s) };
    }),

  commit: (recipe) =>
    set((s) => {
      const next = produce(s.project, recipe);
      if (next === s.project) return s;
      return {
        project: next,
        past: [...s.past.slice(-(HISTORY - 1)), s.project],
        future: [],
        ...validSelection(next, s),
      };
    }),

  undo: () =>
    set((s) => {
      const past = [...s.past];
      let prev = past.pop();
      // Checkpoints taken for gestures that changed nothing are skipped.
      while (prev === s.project && past.length) prev = past.pop();
      if (!prev || prev === s.project) return s;
      return { project: prev, past, future: [s.project, ...s.future].slice(0, HISTORY), ...validSelection(prev, s) };
    }),

  redo: () =>
    set((s) => {
      const [next, ...future] = s.future;
      if (!next) return s;
      return { project: next, future, past: [...s.past, s.project].slice(-HISTORY), ...validSelection(next, s) };
    }),

  loadProject: (p, mode = 'pattern') =>
    set((s) => ({
      project: p,
      past: [],
      future: [],
      mode,
      songStart: 0,
      ...validSelection(p, { ...s, currentPatternId: '', selectedChannelId: null }),
    })),

  setMode: (mode) => set({ mode }),
  setCurrentPattern: (currentPatternId) => set({ currentPatternId }),
  selectChannel: (selectedChannelId) => set({ selectedChannelId }),
  selectMixerTrack: (selectedMixerTrack) => set({ selectedMixerTrack }),
  setSongStart: (tick) => set({ songStart: Math.max(0, tick) }),

  openWindow: (id) =>
    set((s) => {
      const z = s.topZ + 1;
      return { topZ: z, focused: id, windows: { ...s.windows, [id]: { ...s.windows[id], open: true, z } } };
    }),

  closeWindow: (id) =>
    set((s) => ({
      windows: { ...s.windows, [id]: { ...s.windows[id], open: false } },
      focused: s.focused === id ? topmostOpen(s.windows, id) : s.focused,
    })),

  toggleWindow: (id) => {
    const s = get();
    if (s.windows[id].open && s.focused === id) s.closeWindow(id);
    else s.openWindow(id);
  },

  focusWindow: (id) =>
    set((s) => {
      if (s.focused === id && s.windows[id].z === s.topZ) return s;
      const z = s.topZ + 1;
      return { topZ: z, focused: id, windows: { ...s.windows, [id]: { ...s.windows[id], z } } };
    }),

  setWindowRect: (id, rect) => set((s) => ({ windows: { ...s.windows, [id]: { ...s.windows[id], ...rect } } })),

  toggleMax: (id) => set((s) => ({ windows: { ...s.windows, [id]: { ...s.windows[id], max: !s.windows[id].max } } })),

  toggleBrowser: () => set((s) => ({ browserOpen: !s.browserOpen })),
  setTypingKeyboard: (typingKeyboard) => set({ typingKeyboard }),
}));
