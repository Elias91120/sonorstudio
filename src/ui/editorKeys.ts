import { useEffect, useRef } from 'react';
import type { WinId } from '../state/store';

type Handler = (e: KeyboardEvent) => boolean;

const handlers = new Map<WinId, { current: Handler }>();

/** Registers keyboard shortcuts for a window; they run while it has focus. Return true when handled. */
export function useEditorKeys(id: WinId, handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    handlers.set(id, ref);
    return () => {
      if (handlers.get(id) === ref) handlers.delete(id);
    };
  }, [id]);
}

export function runEditorKeys(id: WinId | null, e: KeyboardEvent): boolean {
  return id ? (handlers.get(id)?.current(e) ?? false) : false;
}
