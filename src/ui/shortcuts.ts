import { useEffect } from 'react';
import { engine } from '../audio/engine';
import { ROOT_KEY } from '../core/project';
import { useStudio, type WinId } from '../state/store';
import { runEditorKeys } from './editorKeys';
import { saveNow, saveProjectFile } from './fileActions';
import { setHint } from './hint';
import { isTypingTarget } from './util';

/** FL Studio's typing keyboard layout, by physical key so it works on AZERTY too. */
const TYPING_KEYS: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11, Comma: 12,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
  Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};

const WINDOW_KEYS: Record<string, WinId | 'browser'> = {
  F5: 'playlist',
  F6: 'channelRack',
  F7: 'pianoRoll',
  F8: 'browser',
  F9: 'mixer',
};

export function useGlobalShortcuts() {
  useEffect(() => {
    const held = new Map<string, { channelId: string; key: number }>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const st = useStudio.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (runEditorKeys(st.focused, e)) {
        e.preventDefault();
        return;
      }

      const win = WINDOW_KEYS[e.code];
      if (win) {
        e.preventDefault();
        if (win === 'browser') st.toggleBrowser();
        else st.toggleWindow(win);
        return;
      }

      if (mod) {
        if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) st.redo();
          else st.undo();
        } else if (e.code === 'KeyY') {
          e.preventDefault();
          st.redo();
        } else if (e.code === 'KeyS') {
          e.preventDefault();
          if (e.shiftKey) saveProjectFile();
          else saveNow();
        }
        return;
      }
      if (e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        // A focused button would also "click" on Space.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (!e.repeat) engine.togglePlay();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        st.setMode(st.mode === 'pattern' ? 'song' : 'pattern');
        setHint(st.mode === 'pattern' ? 'Song mode: the playlist plays.' : 'Pattern mode: the current pattern loops.');
        return;
      }

      const offset = TYPING_KEYS[e.code];
      if (st.typingKeyboard && offset !== undefined) {
        e.preventDefault();
        if (e.repeat || !st.selectedChannelId || held.has(e.code)) return;
        const key = ROOT_KEY + offset;
        held.set(e.code, { channelId: st.selectedChannelId, key });
        engine.noteOn(st.selectedChannelId, key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const note = held.get(e.code);
      if (!note) return;
      held.delete(e.code);
      engine.noteOff(note.channelId, note.key);
    };

    const releaseAll = () => {
      for (const note of held.values()) engine.noteOff(note.channelId, note.key);
      held.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, []);
}

/** Shows the hint of whatever is under the pointer, FL Studio style. */
export function useHintTracking() {
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      if (e.buttons || document.body.classList.contains('is-dragging-value')) return;
      const el = e.target instanceof Element ? e.target.closest('[data-hint]') : null;
      setHint(el?.getAttribute('data-hint') ?? '');
    };
    document.addEventListener('pointerover', onOver);
    return () => document.removeEventListener('pointerover', onOver);
  }, []);
}
