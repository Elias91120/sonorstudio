import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { engine } from '../audio/engine';
import { getSound, onSoundsReady, soundsReady } from '../audio/soundBank';
import { SOUNDS, SOUND_CATEGORIES } from '../audio/sounds';
import { formatParam } from '../core/fxSpecs';
import { CONTENT_COLORS } from '../core/palette';
import { DEFAULT_CHANNEL_VOLUME, formatDb, formatPan, formatPercent, volToGain } from '../core/project';
import { PRESET_NAMES } from '../core/presets';
import type { Channel, SamplerParams, SynthParams, Wave } from '../core/types';
import {
  addChannel,
  applyPreset,
  commitChannel,
  renameChannel,
  setChannelTrack,
  updateChannel,
  updateOsc,
  updateSampler,
  updateSynth,
} from '../state/actions';
import { useStudio } from '../state/store';
import { Knob, Toggle } from './controls';
import { prepareCanvas } from './util';

export function ChannelSettingsTitle() {
  const ch = useStudio((s) => s.project.channels.find((c) => c.id === s.selectedChannelId));
  return (
    <span className="title-chip">
      {ch && <span className="swatch" style={{ background: ch.color }} />}
      {ch ? ch.name : 'Channel settings'}
    </span>
  );
}

export function ChannelSettings() {
  const ch = useStudio((s) => s.project.channels.find((c) => c.id === s.selectedChannelId));
  const mixer = useStudio((s) => s.project.mixer);
  if (!ch) return <p className="empty-note">Select a channel in the channel rack to see its settings.</p>;
  return (
    <div className="cs">
      <section className="cs-section">
        <NameField ch={ch} />
        <div className="swatches" role="radiogroup" aria-label="Channel color">
          {CONTENT_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={c === ch.color}
              aria-label={`Color ${c}`}
              className={`swatch-btn${c === ch.color ? ' is-on' : ''}`}
              style={{ '--c': c } as CSSProperties}
              onClick={() => commitChannel(ch.id, { color: c })}
            />
          ))}
        </div>
        <div className="cs-row">
          <Knob
            size={34}
            showLabel
            label="Volume"
            value={ch.volume}
            min={0}
            max={1}
            def={DEFAULT_CHANNEL_VOLUME}
            format={(v) => formatDb(volToGain(v))}
            onChange={(v) => updateChannel(ch.id, { volume: v })}
          />
          <Knob size={34} showLabel bipolar label="Pan" value={ch.pan} min={-1} max={1} def={0} format={formatPan} onChange={(v) => updateChannel(ch.id, { pan: v })} />
          <label className="field">
            <span>Mixer track</span>
            <select
              className="select"
              value={ch.mixerTrack}
              onChange={(e) => {
                useStudio.getState().checkpoint();
                setChannelTrack(ch.id, Number(e.target.value));
              }}
            >
              {mixer.map((t, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'Master' : `${i}. ${t.name}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {ch.type === 'sampler' && ch.sampler && <SamplerPanel ch={ch} sampler={ch.sampler} />}
      {ch.type === 'synth' && ch.synth && <SynthPanel ch={ch} synth={ch.synth} />}
    </div>
  );
}

function NameField({ ch }: { ch: Channel }) {
  const [value, setValue] = useState(ch.name);
  useEffect(() => setValue(ch.name), [ch.name, ch.id]);
  const save = () => {
    const name = value.trim();
    if (name && name !== ch.name) renameChannel(ch.id, name);
    else setValue(ch.name);
  };
  return (
    <input
      className="name-field"
      value={value}
      maxLength={40}
      aria-label="Channel name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(ch.name);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function listen(channelId: string) {
  engine.tap(channelId, 60, 450);
}

function SamplerPanel({ ch, sampler }: { ch: Channel; sampler: SamplerParams }) {
  return (
    <section className="cs-section">
      <h3 className="cs-title">Sample</h3>
      <div className="cs-row">
        <select
          className="select grow"
          value={sampler.sampleId}
          aria-label="Sample"
          onChange={(e) => {
            addChannel({ kind: 'sample', id: e.target.value }, ch.id);
            requestAnimationFrame(() => listen(ch.id));
          }}
        >
          {SOUND_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {SOUNDS.filter((s) => s.category === cat).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="btn" onClick={() => listen(ch.id)}>
          Listen
        </button>
      </div>
      <Waveform soundId={sampler.sampleId} color={ch.color} />
      <div className="cs-row">
        <Knob
          size={34}
          showLabel
          label="Pitch"
          value={sampler.pitch}
          min={-24}
          max={24}
          step={1}
          def={0}
          format={(v) => `${v > 0 ? '+' : ''}${v} st`}
          onChange={(v) => updateSampler(ch.id, { pitch: v })}
        />
        <Toggle
          on={sampler.cutItself}
          label="Cut itself"
          hint="A new note stops the one still ringing. Useful for 808s and open hats."
          onChange={(on) => updateSampler(ch.id, { cutItself: on }, true)}
        />
      </div>
    </section>
  );
}

function useSoundsLoaded() {
  const [ready, setReady] = useState(soundsReady());
  useEffect(() => onSoundsReady(() => setReady(true)), []);
  return ready;
}

function Waveform({ soundId, color }: { soundId: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useSoundsLoaded();
  useEffect(() => {
    const canvas = ref.current;
    const buf = getSound(soundId);
    if (!canvas || !buf) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const c = prepareCanvas(canvas, w, h);
    if (!c) return;
    c.clearRect(0, 0, w, h);
    const data = buf.getChannelData(0);
    const per = Math.max(1, Math.floor(data.length / w));
    c.fillStyle = color;
    for (let x = 0; x < w; x++) {
      let lo = 1;
      let hi = -1;
      for (let i = x * per; i < Math.min(data.length, (x + 1) * per); i++) {
        if (data[i] < lo) lo = data[i];
        if (data[i] > hi) hi = data[i];
      }
      if (hi < lo) continue;
      const y0 = ((1 - hi) / 2) * h;
      const y1 = ((1 - lo) / 2) * h;
      c.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }, [soundId, color, ready]);
  return <canvas className="waveform" ref={ref} aria-label="Waveform of the sample" role="img" />;
}

const WAVES: { id: Wave; label: string; path: string }[] = [
  { id: 'sine', label: 'Sine', path: 'M1 8c2-6 4-6 6 0s4 6 6 0' },
  { id: 'triangle', label: 'Triangle', path: 'M1 8l3-5 6 10 3-5' },
  { id: 'sawtooth', label: 'Saw', path: 'M1 12l6-8v8l6-8v8' },
  { id: 'square', label: 'Square', path: 'M1 12V4h6v8h6V4' },
];

function WaveSelect({ value, onChange }: { value: Wave; onChange: (w: Wave) => void }) {
  return (
    <div className="wave-select" role="radiogroup" aria-label="Waveform">
      {WAVES.map((w) => (
        <button
          key={w.id}
          role="radio"
          aria-checked={value === w.id}
          aria-label={w.label}
          data-hint={`Waveform: ${w.label.toLowerCase()}`}
          className={value === w.id ? 'is-on' : ''}
          onClick={() => onChange(w.id)}
        >
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
            <path d={w.path} />
          </svg>
        </button>
      ))}
    </div>
  );
}

const seconds = (v: number) => formatParam({ key: '', label: '', min: 0, max: 10, def: 0, unit: 's' }, v);
const hertz = (v: number) => formatParam({ key: '', label: '', min: 0, max: 20000, def: 0, unit: 'Hz' }, v);

function SynthPanel({ ch, synth }: { ch: Channel; synth: SynthParams }) {
  const set = (patch: Partial<SynthParams>) => updateSynth(ch.id, patch);
  return (
    <>
      <section className="cs-section">
        <div className="cs-row">
          <h3 className="cs-title">Synth</h3>
          <select
            className="select grow"
            value={ch.preset && PRESET_NAMES.includes(ch.preset) ? ch.preset : ''}
            aria-label="Preset"
            onChange={(e) => {
              applyPreset(ch.id, e.target.value);
              requestAnimationFrame(() => listen(ch.id));
            }}
          >
            <option value="" disabled>
              Custom
            </option>
            {PRESET_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => listen(ch.id)}>
            Listen
          </button>
        </div>
        {synth.osc.map((o, i) => (
          <div className="osc-row" key={i}>
            <span className="osc-num" aria-label={`Oscillator ${i + 1}`}>
              {i + 1}
            </span>
            <WaveSelect value={o.wave} onChange={(wave) => updateOsc(ch.id, i, { wave }, true)} />
            <Knob size={28} showLabel label="Coarse" value={o.coarse} min={-24} max={24} step={1} def={0} format={(v) => `${v > 0 ? '+' : ''}${v} st`} onChange={(v) => updateOsc(ch.id, i, { coarse: v })} />
            <Knob size={28} showLabel label="Fine" value={o.fine} min={-50} max={50} step={1} def={0} format={(v) => `${v > 0 ? '+' : ''}${v} ct`} onChange={(v) => updateOsc(ch.id, i, { fine: v })} />
            <Knob size={28} showLabel label="Level" value={o.level} min={0} max={1} def={0.5} format={formatPercent} onChange={(v) => updateOsc(ch.id, i, { level: v })} />
          </div>
        ))}
      </section>
      <section className="cs-section">
        <h3 className="cs-title">Filter</h3>
        <div className="cs-row">
          <Knob size={34} showLabel label="Cutoff" value={synth.cutoff} min={40} max={18000} curve="log" def={2000} format={hertz} onChange={(v) => set({ cutoff: v })} />
          <Knob size={34} showLabel label="Resonance" value={synth.resonance} min={0.3} max={18} curve="log" def={1} format={(v) => v.toFixed(1)} onChange={(v) => set({ resonance: v })} />
          <Knob size={34} showLabel label="Envelope" value={synth.envAmount} min={0} max={1} def={0.3} format={formatPercent} onChange={(v) => set({ envAmount: v })} />
        </div>
      </section>
      <section className="cs-section">
        <h3 className="cs-title">Envelope</h3>
        <div className="cs-row">
          <Knob size={34} showLabel label="Attack" value={synth.attack} min={0.001} max={4} curve="log" def={0.005} format={seconds} onChange={(v) => set({ attack: v })} />
          <Knob size={34} showLabel label="Decay" value={synth.decay} min={0.01} max={4} curve="log" def={0.3} format={seconds} onChange={(v) => set({ decay: v })} />
          <Knob size={34} showLabel label="Sustain" value={synth.sustain} min={0} max={1} def={0.7} format={formatPercent} onChange={(v) => set({ sustain: v })} />
          <Knob size={34} showLabel label="Release" value={synth.release} min={0.01} max={6} curve="log" def={0.2} format={seconds} onChange={(v) => set({ release: v })} />
        </div>
      </section>
    </>
  );
}
