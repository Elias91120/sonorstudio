import { storeProject, storeUi } from './storage';
import { useStudio, type StoredUi } from './store';

/** Saves the project and the window layout to localStorage shortly after each change. */
export function startAutosave() {
  let projectTimer: ReturnType<typeof setTimeout> | undefined;
  let uiTimer: ReturnType<typeof setTimeout> | undefined;
  useStudio.subscribe((s, prev) => {
    if (s.project !== prev.project) {
      clearTimeout(projectTimer);
      projectTimer = setTimeout(() => storeProject(useStudio.getState().project), 400);
    }
    if (
      s.windows !== prev.windows ||
      s.browserOpen !== prev.browserOpen ||
      s.typingKeyboard !== prev.typingKeyboard ||
      s.mode !== prev.mode
    ) {
      clearTimeout(uiTimer);
      uiTimer = setTimeout(() => {
        const st = useStudio.getState();
        const ui: StoredUi = {
          windows: st.windows,
          browserOpen: st.browserOpen,
          typingKeyboard: st.typingKeyboard,
          mode: st.mode,
        };
        storeUi(ui);
      }, 300);
    }
  });
  window.addEventListener('pagehide', () => storeProject(useStudio.getState().project));
}
