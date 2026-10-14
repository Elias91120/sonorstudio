import { engine } from '../audio/engine';
import { encodeWav, peakOf, renderProject } from '../audio/exportWav';
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
  const file = await pickFile('.json,application/json');
  if (!file) return;
  try {
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
