import { useStudio } from '../state/store';
import { Browser } from './Browser';
import { ContextMenuHost, PromptHost } from './overlay';
import { useGlobalShortcuts, useHintTracking } from './shortcuts';
import { TopBar } from './TopBar';
import { Workspace } from './Workspace';

export function App() {
  useGlobalShortcuts();
  useHintTracking();
  const browserOpen = useStudio((s) => s.browserOpen);
  return (
    <div className="app">
      {/* Knob caps are filled from CSS with these, so every knob shares two gradients instead of owning copies. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="knob-cap" cx="38%" cy="28%" r="80%">
            <stop offset="0" stopColor="#3b4453" />
            <stop offset="1" stopColor="#1f252f" />
          </radialGradient>
          <radialGradient id="knob-cap-hi" cx="38%" cy="28%" r="80%">
            <stop offset="0" stopColor="#4a5467" />
            <stop offset="1" stopColor="#262d39" />
          </radialGradient>
        </defs>
      </svg>
      <TopBar />
      <div className="main">
        {browserOpen && <Browser />}
        <Workspace />
      </div>
      <ContextMenuHost />
      <PromptHost />
    </div>
  );
}
