import type { DragEvent } from 'react';
import type { LibraryItem } from '../state/actions';

export const DND_TYPE = 'application/x-sonor-item';

export function setDragItem(e: DragEvent, item: LibraryItem) {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify(item));
  e.dataTransfer.effectAllowed = 'copy';
}

export const hasDragItem = (e: DragEvent) => e.dataTransfer.types.includes(DND_TYPE);

export function readDragItem(e: DragEvent): LibraryItem | null {
  try {
    const raw = e.dataTransfer.getData(DND_TYPE);
    return raw ? (JSON.parse(raw) as LibraryItem) : null;
  } catch {
    return null;
  }
}
