import { useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useStudio } from '../state/store';
import { setHint } from './hint';
import { clamp, startDrag, useNativeWheel } from './util';

/** One undo step for a burst of wheel or arrow-key changes. */
function useBurstCheckpoint() {
  const last = useRef(0);
  return () => {
    const now = performance.now();
    if (now - last.current > 700) useStudio.getState().checkpoint();
    last.current = now;
  };
}

function dragging(on: boolean) {
  document.body.classList.toggle('is-dragging-value', on);
}

export interface KnobProps {
  value: number;
  min: number;
  max: number;
  def: number;
  label: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
  size?: number;
  curve?: 'log';
  step?: number;
  /** Arc grows from the center (pan). */
  bipolar?: boolean;
  color?: string;
  showLabel?: boolean;
}

const SWEEP = 135;

function polar(c: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}

function arc(c: number, r: number, from: number, to: number) {
  const [x0, y0] = polar(c, r, from);
  const [x1, y1] = polar(c, r, to);
  return `M${x0} ${y0}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function Knob({ value, min, max, def, label, format, onChange, size = 24, curve, step, bipolar, color, showLabel }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const burst = useBurstCheckpoint();
  const toNorm = (v: number) => (curve === 'log' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromNorm = (n: number) => {
    const c = clamp(n, 0, 1);
    let v = curve === 'log' ? min * (max / min) ** c : min + c * (max - min);
    if (step) v = Math.round(v / step) * step;
    return clamp(v, min, max);
  };
  const norm = clamp(toNorm(value), 0, 1);
  const set = (v: number) => {
    onChange(v);
    setHint(`${label}: ${format(v)}`);
  };
  const nudge = (dir: number, fine = false) => {
    burst();
    set(step ? clamp(value + dir * step, min, max) : fromNorm(norm + dir * (fine ? 0.005 : 0.03)));
  };

  useNativeWheel(ref, (e) => {
    e.preventDefault();
    nudge(e.deltaY < 0 ? 1 : -1, e.shiftKey);
  });

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    ref.current?.focus();
    useStudio.getState().checkpoint();
    const startY = e.clientY;
    const start = norm;
    dragging(true);
    startDrag(
      (ev) => set(fromNorm(start + (startY - ev.clientY) / (ev.shiftKey ? 900 : 160))),
      () => dragging(false),
    );
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nudge(1, e.shiftKey);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nudge(-1, e.shiftKey);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const c = size / 2;
  const r = c - 2.2;
  const angle = -SWEEP + norm * SWEEP * 2;
  const from = bipolar ? 0 : -SWEEP;
  const [px0, py0] = polar(c, r * 0.18, angle);
  const [px1, py1] = polar(c, r - 3.6, angle);
  return (
    <div
      ref={ref}
      className={`knob${showLabel ? ' has-label' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={format(value)}
      data-hint={`${label}: ${format(value)}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        useStudio.getState().checkpoint();
        set(def);
      }}
      onKeyDown={onKeyDown}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <path d={arc(c, r, -SWEEP, SWEEP)} className="knob-track" />
        {Math.abs(angle - from) > 1 && (
          <path
            d={arc(c, r, Math.min(from, angle), Math.max(from, angle))}
            className="knob-value"
            style={color ? ({ stroke: color } as CSSProperties) : undefined}
          />
        )}
        <circle cx={c} cy={c} r={Math.max(2, r - 2.6)} className="knob-cap" />
        <line x1={px0} y1={py0} x2={px1} y2={py1} className="knob-pointer" />
      </svg>
      {showLabel && <span className="knob-label">{label}</span>}
    </div>
  );
}

export interface FaderProps {
  value: number;
  max: number;
  def: number;
  label: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

export function Fader({ value, max, def, label, format, onChange }: FaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const burst = useBurstCheckpoint();
  const set = (v: number) => {
    const next = clamp(v, 0, max);
    onChange(next);
    setHint(`${label}: ${format(next)}`);
  };
  useNativeWheel(ref, (e) => {
    e.preventDefault();
    burst();
    set(value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.025));
  });
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    ref.current.focus();
    useStudio.getState().checkpoint();
    const travel = ref.current.clientHeight - 18;
    const startY = e.clientY;
    const start = value;
    dragging(true);
    startDrag(
      (ev) => set(start + ((startY - ev.clientY) / travel) * max * (ev.shiftKey ? 0.2 : 1)),
      () => dragging(false),
    );
  };
  return (
    <div
      ref={ref}
      className="fader"
      role="slider"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed(3))}
      aria-valuetext={format(value)}
      data-hint={`${label}: ${format(value)}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        useStudio.getState().checkpoint();
        set(def);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        e.stopPropagation();
        burst();
        set(value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 0.005 : 0.025));
      }}
    >
      <div className="fader-slot" />
      <div className="fader-unity" style={{ bottom: `calc(${def / max} * (100% - 18px) + 9px)` }} />
      <div className="fader-cap" style={{ bottom: `calc(${value / max} * (100% - 18px))` }} />
    </div>
  );
}

export interface LedProps {
  on: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
  onContextMenu?: () => void;
}

export function Led({ on, label, hint, onClick, onContextMenu }: LedProps) {
  return (
    <button
      className={`led${on ? ' is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      data-hint={hint ?? label}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.();
      }}
    />
  );
}

export function Toggle({ on, label, hint, onChange }: { on: boolean; label: string; hint?: string; onChange: (on: boolean) => void }) {
  return (
    <button className={`toggle${on ? ' is-on' : ''}`} role="switch" aria-checked={on} data-hint={hint ?? label} onClick={() => onChange(!on)}>
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
