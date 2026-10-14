import { engine } from '../audio/engine';
import { encodeWav, peakOf, renderProject } from '../audio/exportWav';
import { importCandidates, loadUserSamples } from '../audio/userSamples';
import { isProjectZip, packProject, PROJECT_ZIP_SUFFIX, unpackProject } from '../state/bundle';
import { createDemoProject } from '../state/demo';
import { createEmptyProject } from '../state/factory';
import { normalizeProject, storeProject } from '../state/storage';
import { useStudio } from '../state/store';
import { setHint } from './hint';
import { downloadBlob, slug } from './util';

export function newProject() {
  engine.stop();
  useStudio.getState().loadProject(createEmptyProject(), 'pattern');
  setHint('New project. Click the steps to start a beat.');
}

export function loadDemo() {
  engine.stop();
  useStudio.getState().loadProject(createDemoProject(), 'song');
  setHint('Demo song loaded. Press Space to play.');
}

export function saveNow() {
  const ok = storeProject(useStudio.getState().project);
  setHint(ok ? 'Project saved in this browser.' : 'This browser blocked local storage. Save the project as a file instead.');
}

export function saveProjectFile() {
  const p = useStudio.getState().project;
  downloadBlob(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${slug(p.name)}.sonor.json`);
  setHint('Project file downloaded.');
}

/** A .sonor.zip with the imported sounds inside, for another browser or another person. */
export async function exportProjectBundle() {
  // The library loads in the background at startup; packing before it is ready would leave the sounds out.
  await loadUserSamples();
  const p = useStudio.getState().project;
  const { blob, sounds, missing } = packProject(p);
  downloadBlob(blob, `${slug(p.name)}${PROJECT_ZIP_SUFFIX}`);
  const packed = sounds ? `${sounds} sound${sounds === 1 ? '' : 's'}` : 'no imported sound';
  setHint(missing ? `Project exported with ${packed}; ${missing} missing from your library could not be included.` : `Project exported with ${packed}.`);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function openProjectFile() {
  const file = await pickFile('.json,.zip,application/json,application/zip');
  if (!file) return;
  try {
    if (isProjectZip(file)) {
      const bundle = unpackProject(new Uint8Array(await file.arrayBuffer()));
      const p = bundle && normalizeProject(bundle.project);
      if (!p) throw new Error('not a project');
      // The sounds go in first so the channels find them the moment the project shows up.
      const restored = bundle.sounds.length ? await importCandidates(bundle.sounds) : null;
      engine.stop();
      useStudio.getState().loadProject(p, 'pattern');
      const n = restored ? restored.added.length : 0;
      let text = n ? `Opened ${p.name}, ${n} sound${n === 1 ? '' : 's'} added to your library.` : `Opened ${p.name}.`;
      const lost = bundle.skipped.length + (restored?.skipped.length ?? 0);
      if (lost) text += ` ${lost} sound${lost === 1 ? '' : 's'} couldn't be restored and will show as missing.`;
      if (restored?.storageError) text += ` ${restored.storageError}`;
      setHint(text);
      return;
    }
    const p = normalizeProject(JSON.parse(await file.text()));
    if (!p) throw new Error('not a project');
    engine.stop();
    useStudio.getState().loadProject(p, 'pattern');
    setHint(`Opened ${p.name}.`);
  } catch {
    setHint(`${file.name} isn't a SonorStudio project file.`);
  }
}

let exporting = false;

export async function exportWav() {
  if (exporting) return;
  exporting = true;
  const st = useStudio.getState();
  setHint(st.mode === 'song' ? 'Rendering the song to WAV…' : 'Rendering the current pattern to WAV…');
  try {
    const buffer = await renderProject(st.project, st.mode, st.currentPatternId);
    downloadBlob(encodeWav(buffer), `${slug(st.project.name)}.wav`);
    const clipped = peakOf(buffer) >= 1;
    setHint(
      clipped
        ? `WAV exported (${buffer.duration.toFixed(1)} s), but it clips: lower the master or put a limiter on it.`
        : `WAV exported (${buffer.duration.toFixed(1)} s).`,
    );
  } catch {
    setHint('The WAV export failed. Try again, or export a shorter song.');
  } finally {
    exporting = false;
  }
}
