import { useMemo, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { FX_SPECS, FX_TYPES, formatParam } from '../core/fxSpecs';
import { DEFAULT_FADER, faderToGain, formatDb, formatPan } from '../core/project';
import type { Channel, FxSlot, MixerTrack } from '../core/types';
import {
  MAX_FX,
  addFx,
  moveFx,
  removeFx,
  renameMixerTrack,
  setFxParam,
  soloMixerTrack,
  toggleFx,
  toggleMixerMute,
  updateMixerTrack,
} from '../state/actions';
import { useStudio } from '../state/store';
import { Fader, Knob, Led } from './controls';
import { IconClose, IconDown, IconPlus, IconUp } from './icons';
import { askText, openMenuBelow } from './overlay';
import { meterNorm, useFrame } from './util';

const NO_CHANNELS: Channel[] = [];

export function Mixer() {
  const mixer = useStudio((s) => s.project.mixer);
  const channels = useStudio((s) => s.project.channels);
  const selected = useStudio((s) => s.selectedMixerTrack);
  const meters = useRef<(HTMLElement | null)[][]>([]);
  const levels = useRef<number[][]>([]);

  const feeders = useMemo(() => {
    const map = new Map<number, Channel[]>();
    for (const c of channels) map.set(c.mixerTrack, [...(map.get(c.mixerTrack) ?? []), c]);
    return map;
  }, [channels]);

  useFrame(() => {
    for (let i = 0; i < meters.current.length; i++) {
      const els = meters.current[i];
      if (!els) continue;
      const peaks = engine.meter(i);
      const prev = levels.current[i] ?? [0, 0];
      const next = [0, 1].map((side) => Math.max(meterNorm(peaks[side]), prev[side] - 0.009));
      levels.current[i] = next;
      els.forEach((el, side) => {
        if (el) el.style.clipPath = `inset(${((1 - next[side]) * 100).toFixed(2)}% 0 0 0)`;
      });
    }
  });

  const setMeter = (index: number, side: number, el: HTMLElement | null) => {
    (meters.current[index] ??= [])[side] = el;
  };

  return (
    <div className="mx">
      <div className="mx-strips" role="list" aria-label="Mixer tracks">
        {mixer.map((t, i) => (
          <Strip
            key={i}
            index={i}
            track={t}
            selected={i === selected}
            feeders={feeders.get(i) ?? NO_CHANNELS}
            setMeter={setMeter}
          />
        ))}
      </div>
      <FxPanel index={selected} track={mixer[selected] ?? mixer[0]} />
    </div>
  );
}

interface StripProps {
  index: number;
  track: MixerTrack;
  selected: boolean;
  feeders: Channel[];
  setMeter: (index: number, side: number, el: HTMLElement | null) => void;
}

function Strip({ index, track, selected, feeders, setMeter }: StripProps) {
  const master = index === 0;
  const activeFx = track.fx.filter((f) => f.enabled).length;
  return (
    <div
      role="listitem"
      className={`mx-strip${selected ? ' is-selected' : ''}${master ? ' is-master' : ''}${track.muted ? ' is-muted' : ''}`}
      onPointerDown={() => useStudio.getState().selectMixerTrack(index)}
    >
      <div className="mx-feeders" aria-hidden="true">
        {feeders.slice(0, 5).map((c) => (
          <i key={c.id} style={{ background: c.color }} />
        ))}
      </div>
      <button
        className="mx-name"
        title={track.name}
        data-hint={`${track.name}${feeders.length ? `, fed by ${feeders.map((c) => c.name).join(', ')}` : ''}. Double-click to rename.`}
        onDoubleClick={async () => {
          const name = await askText('Rename mixer track', track.name);
          if (name) renameMixerTrack(index, name);
        }}
      >
        {track.name}
      </button>
      <Knob size={24} value={track.pan} min={-1} max={1} def={0} bipolar label="Pan" format={formatPan} onChange={(v) => updateMixerTrack(index, { pan: v })} />
      <div className="mx-fader-zone">
        <div className="mx-meter" aria-hidden="true">
          <span>
            <i ref={(el) => setMeter(index, 0, el)} />
          </span>
          <span>
            <i ref={(el) => setMeter(index, 1, el)} />
          </span>
        </div>
        <Fader
          value={track.volume}
          max={1}
          def={DEFAULT_FADER}
          label={`${track.name} volume`}
          format={(v) => formatDb(faderToGain(v))}
          onChange={(v) => updateMixerTrack(index, { volume: v })}
        />
      </div>
      <Led
        on={!track.muted}
        label={`Mute ${track.name}`}
        hint={master ? 'Mute the master' : 'Mute. Right-click to solo.'}
        onClick={() => toggleMixerMute(index)}
        onContextMenu={() => soloMixerTrack(index)}
      />
      <span className="mx-num">{master ? 'M' : index}</span>
      <span className={`mx-fx-dot${activeFx ? ' is-on' : ''}`} aria-label={`${activeFx} active effects`} />
    </div>
  );
}

function FxPanel({ index, track }: { index: number; track: MixerTrack }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = track.fx.find((f) => f.id === openId) ?? track.fx[0] ?? null;
  return (
    <aside className="fx-panel" aria-label={`Effects on ${track.name}`}>
      <header className="fx-head">
        <span className="fx-track">{index === 0 ? 'Master' : `Insert ${index}`}</span>
        <span className="fx-name">{track.name}</span>
      </header>
      <ol className="fx-slots">
        {track.fx.map((f, i) => (
          <li key={f.id} className={`fx-slot${open?.id === f.id ? ' is-open' : ''}${f.enabled ? '' : ' is-off'}`}>
            <Led on={f.enabled} label={`${FX_SPECS[f.type].name} on or off`} onClick={() => toggleFx(index, f.id)} />
            <button className="fx-slot-name" onClick={() => setOpenId(f.id)} data-hint={FX_SPECS[f.type].description}>
              {FX_SPECS[f.type].name}
            </button>
            <button className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => moveFx(index, f.id, -1)}>
              <IconUp />
            </button>
            <button className="icon-btn sm" aria-label="Move down" disabled={i === track.fx.length - 1} onClick={() => moveFx(index, f.id, 1)}>
              <IconDown />
            </button>
            <button className="icon-btn sm" aria-label={`Remove ${FX_SPECS[f.type].name}`} onClick={() => removeFx(index, f.id)}>
              <IconClose />
            </button>
          </li>
        ))}
      </ol>
      {track.fx.length < MAX_FX && (
        <button
          className="fx-add"
          onClick={(e) =>
            openMenuBelow(
              e.currentTarget,
              FX_TYPES.map((type) => ({
                label: `${FX_SPECS[type].name}: ${FX_SPECS[type].description.toLowerCase()}`,
                onSelect: () => {
                  const id = addFx(index, type);
                  if (id) setOpenId(id);
                },
              })),
            )
          }
        >
          <IconPlus /> Add effect
        </button>
      )}
      {track.fx.length === 0 && <p className="fx-empty">No effects on this track. Add an EQ, a compressor, a delay or a reverb.</p>}
      {open && <FxEditor index={index} slot={open} />}
    </aside>
  );
}

function FxEditor({ index, slot }: { index: number; slot: FxSlot }) {
  const spec = FX_SPECS[slot.type];
  return (
    <div className="fx-editor">
      <h4>{spec.name}</h4>
      <div className="fx-params">
        {spec.params.map((p) =>
          p.options ? (
            <div key={p.key} className="seg seg-small" role="radiogroup" aria-label={p.label}>
              {p.options.map((o, i) => (
                <button
                  key={o}
                  role="radio"
                  aria-checked={Math.round(slot.params[p.key] ?? p.def) === i}
                  className={Math.round(slot.params[p.key] ?? p.def) === i ? 'is-on' : ''}
                  onClick={() => setFxParam(index, slot.id, p.key, i, true)}
                >
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <Knob
              key={p.key}
              size={34}
              showLabel
              label={p.label}
              value={slot.params[p.key] ?? p.def}
              min={p.min}
              max={p.max}
              def={p.def}
              curve={p.curve}
              step={p.step}
              format={(v) => formatParam(p, v)}
              onChange={(v) => setFxParam(index, slot.id, p.key, v)}
            />
          ),
        )}
      </div>
    </div>
  );
}
