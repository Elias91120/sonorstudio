import { useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { engine } from '../audio/engine';
import { PRESET_NAMES } from '../core/presets';
import { DEFAULT_CHANNEL_VOLUME, fitsSteps, formatDb, formatPan, formatPercent, patternLength, volToGain } from '../core/project';
import { STEP } from '../core/time';
import type { Channel, Note, Pattern } from '../core/types';
import {
  addChannel,
  addPattern,
  clearNotes,
  cloneChannel,
  fillSteps,
  moveChannel,
  recolorChannel,
  removeChannel,
  renameChannel,
  setChannelTrack,
  setPatternBars,
  setStep,
  setSwing,
  soloChannel,
  toggleChannelMute,
  updateChannel,
} from '../state/actions';
import { useStudio } from '../state/store';
import { Knob, Led } from './controls';
import { hasDragItem, readDragItem } from './dnd';
import { IconPlus } from './icons';
import { askText, openMenu, openMenuBelow } from './overlay';
import { clamp, startDrag, useFrame, useNativeWheel } from './util';

/** Shared by all rows so a drag can paint steps across channels. */
let paint: { value: boolean } | null = null;

export function openPianoRoll(channelId: string) {
  const st = useStudio.getState();
  st.selectChannel(channelId);
  st.openWindow('pianoRoll');
}

export function openChannelSettings(channelId: string) {
  const st = useStudio.getState();
  st.selectChannel(channelId);
  st.openWindow('channelSettings');
}

export function ChannelRack() {
  const channels = useStudio((s) => s.project.channels);
  const pattern = useStudio((s) => s.project.patterns.find((p) => p.id === s.currentPatternId));
  const selected = useStudio((s) => s.selectedChannelId);
  const swing = useStudio((s) => s.project.swing);
  const mixerSize = useStudio((s) => s.project.mixer.length);
  const [dropping, setDropping] = useState(false);
  if (!pattern) return null;
  const steps = patternLength(pattern) / STEP;

  return (
    <div
      className={`rack${dropping ? ' is-drop' : ''}`}
      onDragOver={(e) => {
        if (!hasDragItem(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        setDropping(false);
        const item = readDragItem(e);
        if (!item) return;
        e.preventDefault();
        addChannel(item);
      }}
    >
      <div className="rack-head">
        <PatternControls pattern={pattern} />
        <Knob size={26} value={swing} min={0} max={1} def={0} label="Swing" format={formatPercent} onChange={setSwing} />
        <span className="rack-head-label" aria-hidden="true">
          Swing
        </span>
      </div>
      <div className="rack-body">
        <div className="rack-grid" style={{ '--steps': steps } as CSSProperties}>
          <div className="rack-row is-leds">
            <div className="rack-ctrl" />
            <StepLeds patternId={pattern.id} steps={steps} />
          </div>
          {channels.map((ch) => (
            <ChannelRow key={ch.id} ch={ch} pattern={pattern} steps={steps} selected={ch.id === selected} mixerSize={mixerSize} />
          ))}
        </div>
        {channels.length === 0 && <p className="rack-empty">No channels yet. Drag a sound from the browser, or add one below.</p>}
        <button className="rack-add" onClick={(e) => openAddMenu(e.currentTarget)} data-hint="Add a sampler or a synth channel">
          <IconPlus /> Add channel
        </button>
      </div>
    </div>
  );
}

function openAddMenu(el: Element) {
  openMenuBelow(el, [
    { label: 'Sampler', onSelect: () => addChannel({ kind: 'sample', id: 'kick-808' }) },
    { separator: true },
    ...PRESET_NAMES.map((name) => ({ label: `Synth (${name.toLowerCase()})`, onSelect: () => addChannel({ kind: 'synth', preset: name }) })),
  ]);
}

function PatternControls({ pattern }: { pattern: Pattern }) {
  const patterns = useStudio((s) => s.project.patterns);
  const setCurrent = useStudio((s) => s.setCurrentPattern);
  const lengths = [...new Set([1, 2, 4, 8, pattern.bars])].sort((a, b) => a - b);
  return (
    <div className="rack-pattern">
      <span className="swatch" style={{ background: pattern.color }} />
      <select className="select" value={pattern.id} onChange={(e) => setCurrent(e.target.value)} aria-label="Pattern">
        {patterns.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="icon-btn" aria-label="New pattern" data-hint="New pattern" onClick={() => addPattern()}>
        <IconPlus />
      </button>
      <select
        className="select"
        value={pattern.bars}
        onChange={(e) => setPatternBars(pattern.id, Number(e.target.value))}
        aria-label="Pattern length"
        data-hint="Pattern length. Notes placed further out extend it."
      >
        {lengths.map((b) => (
          <option key={b} value={b}>
            {b === 1 ? '1 bar' : `${b} bars`}
          </option>
        ))}
      </select>
    </div>
  );
}

function useCurrentStep(patternId: string) {
  const [step, setStep] = useState(-1);
  useFrame(() => {
    const pos = engine.patternPosition(patternId);
    const s = pos < 0 ? -1 : Math.floor(pos / STEP);
    setStep((prev) => (prev === s ? prev : s));
  });
  return step;
}

function StepLeds({ patternId, steps }: { patternId: string; steps: number }) {
  const current = useCurrentStep(patternId);
  return (
    <div className="steps" aria-hidden="true">
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} className={`step-led${i === current ? ' is-on' : ''}`} data-group={Math.floor(i / 4) % 4} />
      ))}
    </div>
  );
}

interface RowProps {
  ch: Channel;
  pattern: Pattern;
  steps: number;
  selected: boolean;
  mixerSize: number;
}

function ChannelRow({ ch, pattern, steps, selected, mixerSize }: RowProps) {
  const notes = pattern.notes[ch.id];
  const asSteps = fitsSteps(notes);
  const on = useMemo(() => new Set(asSteps && notes ? notes.map((n) => n.pos / STEP) : []), [notes, asSteps]);
  const [dropping, setDropping] = useState(false);

  const onStepDown = (e: ReactPointerEvent, i: number) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const value = e.button === 0 && !on.has(i);
    useStudio.getState().checkpoint();
    paint = { value };
    setStep(pattern.id, ch.id, i, value);
    if (value && !engine.isPlaying) engine.tap(ch.id);
    window.addEventListener('pointerup', () => (paint = null), { once: true });
  };

  const menu = (e: ReactMouseEvent) => {
    e.preventDefault();
    useStudio.getState().selectChannel(ch.id);
    openMenu(e, [
      { label: 'Piano roll', onSelect: () => openPianoRoll(ch.id) },
      { label: 'Channel settings', onSelect: () => openChannelSettings(ch.id) },
      { separator: true },
      {
        label: 'Rename…',
        onSelect: async () => {
          const name = await askText('Rename channel', ch.name);
          if (name) renameChannel(ch.id, name);
        },
      },
      { label: 'Change color', onSelect: () => recolorChannel(ch.id) },
      { separator: true },
      { label: 'Fill every 2 steps', onSelect: () => fillSteps(pattern.id, ch.id, 2) },
      { label: 'Fill every 4 steps', onSelect: () => fillSteps(pattern.id, ch.id, 4) },
      { label: 'Fill every 8 steps', onSelect: () => fillSteps(pattern.id, ch.id, 8) },
      { label: 'Clear notes', disabled: !notes?.length, onSelect: () => clearNotes(pattern.id, ch.id) },
      { separator: true },
      { label: 'Move up', onSelect: () => moveChannel(ch.id, -1) },
      { label: 'Move down', onSelect: () => moveChannel(ch.id, 1) },
      { label: 'Clone channel', onSelect: () => cloneChannel(ch.id) },
      { label: 'Delete channel', danger: true, onSelect: () => removeChannel(ch.id) },
    ]);
  };

  return (
    <div
      className={`rack-row${selected ? ' is-selected' : ''}${dropping ? ' is-drop' : ''}${ch.muted ? ' is-muted' : ''}`}
      onDragOver={(e) => {
        if (!hasDragItem(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        setDropping(false);
        const item = readDragItem(e);
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        addChannel(item, ch.id);
      }}
    >
      <div className="rack-ctrl">
        <Led
          on={!ch.muted}
          label={`Mute ${ch.name}`}
          hint="Mute. Right-click to solo."
          onClick={() => toggleChannelMute(ch.id)}
          onContextMenu={() => soloChannel(ch.id)}
        />
        <Knob size={22} value={ch.pan} min={-1} max={1} def={0} bipolar label="Pan" format={formatPan} onChange={(v) => updateChannel(ch.id, { pan: v })} />
        <Knob
          size={22}
          value={ch.volume}
          min={0}
          max={1}
          def={DEFAULT_CHANNEL_VOLUME}
          label="Volume"
          format={(v) => formatDb(volToGain(v))}
          onChange={(v) => updateChannel(ch.id, { volume: v })}
        />
        <TrackNumber value={ch.mixerTrack} max={mixerSize - 1} onChange={(v) => setChannelTrack(ch.id, v)} />
        <button
          className="rack-name"
          style={{ '--c': ch.color } as CSSProperties}
          data-hint={`${ch.name}: click for settings, right-click for more`}
          onClick={() => openChannelSettings(ch.id)}
          onContextMenu={menu}
        >
          {ch.name}
        </button>
        <button
          className="rack-select"
          aria-pressed={selected}
          aria-label={`Select ${ch.name}`}
          data-hint="Select: the piano roll and your keyboard play this channel"
          onClick={() => useStudio.getState().selectChannel(ch.id)}
        />
      </div>
      {asSteps ? (
        <div className="steps" onContextMenu={(e) => e.preventDefault()}>
          {Array.from({ length: steps }, (_, i) => (
            <button
              key={i}
              className="step"
              data-group={Math.floor(i / 4) % 4}
              aria-pressed={on.has(i)}
              aria-label={`${ch.name}, step ${i + 1}`}
              onPointerDown={(e) => onStepDown(e, i)}
              onPointerEnter={() => {
                if (paint) setStep(pattern.id, ch.id, i, paint.value);
              }}
              onClick={(e) => {
                // Keyboard activation; pointer clicks are handled on pointerdown.
                if (e.detail !== 0) return;
                useStudio.getState().checkpoint();
                setStep(pattern.id, ch.id, i, !on.has(i));
              }}
            />
          ))}
        </div>
      ) : (
        <NotePreview notes={notes ?? []} length={steps * STEP} color={ch.color} onOpen={() => openPianoRoll(ch.id)} />
      )}
    </div>
  );
}

function NotePreview({ notes, length, color, onOpen }: { notes: Note[]; length: number; color: string; onOpen: () => void }) {
  const keys = notes.map((n) => n.key);
  const hi = Math.max(...keys);
  const lo = Math.min(...keys);
  const range = Math.max(1, hi - lo);
  return (
    <button className="note-preview" style={{ '--c': color } as CSSProperties} onClick={onOpen} data-hint="Edited in the piano roll. Click to open it.">
      {notes.map((n) => (
        <i
          key={n.id}
          style={{
            left: `${(n.pos / length) * 100}%`,
            width: `${Math.max(0.5, (n.len / length) * 100)}%`,
            top: `${hi === lo ? 42 : 10 + ((hi - n.key) / range) * 70}%`,
          }}
        />
      ))}
    </button>
  );
}

function TrackNumber({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useNativeWheel(ref, (e) => {
    e.preventDefault();
    useStudio.getState().checkpoint();
    onChange(clamp(value + (e.deltaY < 0 ? 1 : -1), 0, max));
  });
  const name = value === 0 ? 'Master' : `Insert ${value}`;
  return (
    <div
      ref={ref}
      className="track-num"
      role="spinbutton"
      tabIndex={0}
      aria-label="Mixer track"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={name}
      data-hint={`Mixer track: ${name}. Drag up or down to change.`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        useStudio.getState().checkpoint();
        const startY = e.clientY;
        const start = value;
        startDrag((ev) => onChange(clamp(start + Math.round((startY - ev.clientY) / 8), 0, max)));
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        useStudio.getState().checkpoint();
        onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1), 0, max));
      }}
    >
      {value === 0 ? 'M' : value}
    </div>
  );
}
