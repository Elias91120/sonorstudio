import '@fontsource-variable/instrument-sans/wdth.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { engine } from './audio/engine';
import { loadSounds } from './audio/soundBank';
import { loadUserSamples } from './audio/userSamples';
import { startAutosave } from './state/autosave';
import { useStudio } from './state/store';
import './styles/app.css';
import { App } from './ui/App';
import { guardFileDrops } from './ui/importSounds';

void loadSounds();
void loadUserSamples();
startAutosave();
guardFileDrops();

// Browsers only start audio after a user gesture: the first click or key press unlocks it.
const unlock = () => void engine.ensureAudio();
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

if (import.meta.env.DEV) {
  Object.assign(window, { __sonor: { engine, useStudio } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
