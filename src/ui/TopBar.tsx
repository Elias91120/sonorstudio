import { useRef, useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { DEFAULT_FADER, faderToGain, formatDb } from '../core/project';
import { formatPosition } from '../core/time';
import { addPattern, setBpm, updateMixerTrack } from '../state/actions';
import { useStudio, type WinId } from '../state/store';
import { Knob } from './controls';
import { exportWav, loadDemo, newProject, openProjectFile, saveProjectFile } from './fileActions';
import { setHint, useHint } from './hint';
import { IconBrowser, IconKeyboard, IconMidi, IconMixer, IconPause, IconPiano, IconPlay, IconPlaylist, IconPlus, IconRack, IconStop } from './icons';
import { enableMidi } from './midi';
import { openMenuBelow } from './overlay';
import { meterNorm, startDrag, useFrame, useNativeWheel } from './util';

export function TopBar() {
  return (
    <header className="topbar">
      <div className="tb-zone tb-left">
        <MainMenu />
        <HintBar />
      </div>
      <div className="tb-zone tb-center">
        <ModeSwitch />
        <Transport />
        <Tempo />
        <Position />
      </div>
      <div className="tb-zone tb-right">
        <PatternPicker />
        <WindowToggles />
        <InputToggles />
        <MasterOut />
      </div>
    </header>
  );
}

function MainMenu() {
  return (
    <button
      className="brand"
      aria-haspopup="menu"
      data-hint="Project menu: new, open, save, export"
      onClick={(e) => {
        const st = useStudio.getState();
        openMenuBelow(e.currentTarget, [
          { label: 'New project', onSelect: newProject },
          { label: 'Open project file…', onSelect: () => void openProjectFile() },
          { label: 'Save project file', shortcut: 'Ctrl+Shift+S', onSelect: saveProjectFile },
          { label: 'Export WAV', onSelect: () => void exportWav() },
          { separator: true },
          { label: 'Undo', shortcut: 'Ctrl+Z', disabled: st.past.length === 0, onSelect: st.undo },
          { label: 'Redo', shortcut: 'Ctrl+Y', disabled: st.future.length === 0, onSelect: st.redo },
          { separator: true },
          { label: 'Load the demo song', onSelect: loadDemo },
        ]);
      }}
    >
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-name">SonorStudio</span>
    </button>
  );
}

function HintBar() {
  const text = useHint((s) => s.text);
  return <div className="hintbar">{text}</div>;
}

function ModeSwitch() {
  const mode = useStudio((s) => s.mode);
  const setMode = useStudio((s) => s.setMode);
  return (
    <div className="seg" role="radiogroup" aria-label="Playback mode" data-hint="Loop the current pattern, or play the playlist (L)">
      <button role="radio" aria-checked={mode === 'pattern'} className={mode === 'pattern' ? 'is-on' : ''} onClick={() => setMode('pattern')}>
        Pattern
      </button>
      <button role="radio" aria-checked={mode === 'song'} className={mode === 'song' ? 'is-on' : ''} onClick={() => setMode('song')}>
        Song
      </button>
    </div>
  );
}

function Transport() {
  const playing = useStudio((s) => s.playing);
  return (
    <div className="transport">
      <button
        className={`tp-play${playing ? ' is-on' : ''}`}
        aria-label={playing ? 'Pause' : 'Play'}
        data-hint="Play or stop (Space)"
        onClick={() => engine.togglePlay()}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button className="tp-stop" aria-label="Stop" data-hint="Stop and go back to the start" onClick={() => engine.stop()}>
        <IconStop />
      </button>
    </div>
  );
}

function Tempo() {
  const bpm = useStudio((s) => s.project.bpm);
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);

  useNativeWheel(ref, (e) => {
    e.preventDefault();
    useStudio.getState().checkpoint();
    setBpm(bpm + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.1 : 1));
  });

  if (editing) {
    return (
      <div className="lcd tempo">
        <input
          className="lcd-input"
          autoFocus
          defaultValue={label}
          inputMode="decimal"
          aria-label="Tempo in BPM"
          onBlur={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'));
            if (Number.isFinite(v)) {
              useStudio.getState().checkpoint();
              setBpm(v);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <span className="lcd-unit">BPM</span>
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="lcd tempo is-draggable"
      role="spinbutton"
      tabIndex={0}
      aria-label="Tempo"
      aria-valuenow={bpm}
      aria-valuetext={`${label} BPM`}
      data-hint="Tempo: drag up or down, double-click to type"
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        useStudio.getState().checkpoint();
        setBpm(bpm + (e.key === 'ArrowUp' ? 1 : -1));
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        useStudio.getState().checkpoint();
        const startY = e.clientY;
        const start = bpm;
        document.body.classList.add('is-dragging-value');
        startDrag(
          (ev) => {
            const d = (startY - ev.clientY) / (ev.shiftKey ? 30 : 3);
            const v = ev.shiftKey ? start + d : Math.round(start + d);
            setBpm(v);
            setHint(`Tempo: ${v.toFixed(1)} BPM`);
          },
          () => document.body.classList.remove('is-dragging-value'),
        );
      }}
    >
      <span className="lcd-value">{label}</span>
      <span className="lcd-unit">BPM</span>
    </div>
  );
}

function Position() {
  const ref = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const text = formatPosition(engine.position());
    if (el.textContent !== text) el.textContent = text;
  });
  return (
    <div className="lcd position" data-hint="Song position: bar, beat, step">
      <span className="lcd-value" ref={ref}>
        1:1:1
      </span>
    </div>
  );
}

function PatternPicker() {
  const patterns = useStudio((s) => s.project.patterns);
  const currentId = useStudio((s) => s.currentPatternId);
  const setCurrent = useStudio((s) => s.setCurrentPattern);
  const current = patterns.find((p) => p.id === currentId);
  return (
    <div className="pattern-picker" data-hint="Current pattern: shown in the channel rack, drawn by the playlist pencil">
      <span className="swatch" style={{ background: current?.color }} />
      <select className="select" value={currentId} onChange={(e) => setCurrent(e.target.value)} aria-label="Current pattern">
        {patterns.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" aria-label="New pattern" data-hint="New pattern" onClick={() => addPattern()}>
        <IconPlus />
      </button>
    </div>
  );
}

const WINDOW_BUTTONS: { id: WinId | 'browser'; label: string; key: string; icon: ReactNode }[] = [
  { id: 'playlist', label: 'Playlist', key: 'F5', icon: <IconPlaylist /> },
  { id: 'channelRack', label: 'Channel rack', key: 'F6', icon: <IconRack /> },
  { id: 'pianoRoll', label: 'Piano roll', key: 'F7', icon: <IconPiano /> },
  { id: 'browser', label: 'Browser', key: 'F8', icon: <IconBrowser /> },
  { id: 'mixer', label: 'Mixer', key: 'F9', icon: <IconMixer /> },
];

function WindowToggles() {
  const windows = useStudio((s) => s.windows);
  const browserOpen = useStudio((s) => s.browserOpen);
  return (
    <nav className="tb-group" aria-label="Windows">
      {WINDOW_BUTTONS.map((b) => {
        const on = b.id === 'browser' ? browserOpen : windows[b.id].open;
        return (
          <button
            key={b.id}
            className={`icon-btn${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={`${b.label} (${b.key})`}
            data-hint={`${b.label} (${b.key})`}
            onClick={() => {
              const st = useStudio.getState();
              if (b.id === 'browser') st.toggleBrowser();
              else st.toggleWindow(b.id);
            }}
          >
            {b.icon}
          </button>
        );
      })}
    </nav>
  );
}

function InputToggles() {
  const typing = useStudio((s) => s.typingKeyboard);
  const [midi, setMidi] = useState(false);
  return (
    <div className="tb-group input-toggles">
      <button
        className={`icon-btn${typing ? ' is-on' : ''}`}
        aria-pressed={typing}
        aria-label="Typing keyboard to piano"
        data-hint="Play the selected channel with your computer keyboard: Z to M, and Q to P one octave up"
        onClick={() => useStudio.getState().setTypingKeyboard(!typing)}
      >
        <IconKeyboard />
      </button>
      <button
        className={`icon-btn${midi ? ' is-on' : ''}`}
        aria-pressed={midi}
        aria-label="MIDI input"
        data-hint={midi ? 'MIDI input is on: it plays the selected channel' : 'Play the selected channel from a MIDI keyboard'}
        onClick={async () => {
          try {
            const n = await enableMidi();
            setMidi(true);
            setHint(n ? `MIDI on: ${n} input${n > 1 ? 's' : ''} connected.` : 'MIDI on. Plug in a keyboard and play.');
          } catch (err) {
            setHint(err instanceof Error ? err.message : 'MIDI access was refused.');
          }
        }}
      >
        <IconMidi />
      </button>
    </div>
  );
}

function MasterOut() {
  const volume = useStudio((s) => s.project.mixer[0].volume);
  const left = useRef<HTMLElement>(null);
  const right = useRef<HTMLElement>(null);
  const levels = useRef([0, 0]);
  useFrame(() => {
    const peaks = engine.meter(0);
    [left.current, right.current].forEach((el, i) => {
      const v = Math.max(meterNorm(peaks[i]), levels.current[i] - 0.01);
      levels.current[i] = v;
      // Clipping (not scaling) keeps the green-to-red gradient anchored to the full scale.
      if (el) el.style.clipPath = `inset(0 ${((1 - v) * 100).toFixed(2)}% 0 0)`;
    });
  });
  return (
    <div className="master-out">
      <Knob
        size={28}
        value={volume}
        min={0}
        max={1}
        def={DEFAULT_FADER}
        label="Master volume"
        format={(v) => formatDb(faderToGain(v))}
        onChange={(v) => updateMixerTrack(0, { volume: v })}
      />
      <div className="hmeter" aria-hidden="true" data-hint="Master output level">
        <span>
          <i ref={left} />
        </span>
        <span>
          <i ref={right} />
        </span>
      </div>
    </div>
  );
}
