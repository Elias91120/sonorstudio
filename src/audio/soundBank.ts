import { renderSounds } from './sounds';
import { getUserBuffer } from './userSamples';

let buffers: Map<string, AudioBuffer> | null = null;
let pending: Promise<Map<string, AudioBuffer>> | null = null;
const listeners = new Set<() => void>();

export function loadSounds(): Promise<Map<string, AudioBuffer>> {
  pending ??= renderSounds().then((b) => {
    buffers = b;
    listeners.forEach((l) => l());
    return b;
  });
  return pending;
}

/** A built-in sound or one the user imported; null while loading or when the sample is gone. */
export const getSound = (id: string): AudioBuffer | null => buffers?.get(id) ?? getUserBuffer(id);

export const soundsReady = () => buffers !== null;

export function onSoundsReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
