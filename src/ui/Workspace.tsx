import { useRef } from 'react';
import { useStudio } from '../state/store';
import { ChannelRack } from './ChannelRack';
import { ChannelSettings, ChannelSettingsTitle } from './ChannelSettings';
import { IconMixer, IconPiano, IconPlaylist, IconRack, IconWave } from './icons';
import { Mixer } from './Mixer';
import { PianoRoll } from './PianoRoll';
import { Playlist } from './Playlist';
import { useElementSize } from './util';
import { WindowFrame } from './WindowFrame';

export function Workspace() {
  const ref = useRef<HTMLElement>(null);
  const size = useElementSize(ref);
  const windows = useStudio((s) => s.windows);
  const anyOpen = Object.values(windows).some((w) => w.open);
  return (
    <main className="workspace" ref={ref}>
      {!anyOpen && (
        <div className="ws-empty">
          <p>All windows are closed.</p>
          <p>
            Press <kbd>F5</kbd> for the playlist, <kbd>F6</kbd> for the channel rack or <kbd>F9</kbd> for the mixer.
          </p>
        </div>
      )}
      {size.w > 0 && (
        <>
          {windows.playlist.open && (
            <WindowFrame id="playlist" title="Playlist" icon={<IconPlaylist />} bounds={size} minW={480} minH={240}>
              <Playlist />
            </WindowFrame>
          )}
          {windows.channelRack.open && (
            <WindowFrame id="channelRack" title="Channel rack" icon={<IconRack />} bounds={size} minW={460} minH={180}>
              <ChannelRack />
            </WindowFrame>
          )}
          {windows.pianoRoll.open && (
            <WindowFrame id="pianoRoll" title="Piano roll" icon={<IconPiano />} bounds={size} minW={480} minH={260}>
              <PianoRoll />
            </WindowFrame>
          )}
          {windows.mixer.open && (
            <WindowFrame id="mixer" title="Mixer" icon={<IconMixer />} bounds={size} minW={520} minH={320}>
              <Mixer />
            </WindowFrame>
          )}
          {windows.channelSettings.open && (
            <WindowFrame id="channelSettings" title={<ChannelSettingsTitle />} icon={<IconWave />} bounds={size} minW={340} minH={260}>
              <ChannelSettings />
            </WindowFrame>
          )}
        </>
      )}
    </main>
  );
}
