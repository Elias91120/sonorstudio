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
