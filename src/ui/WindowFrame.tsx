import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useStudio, type WinId } from '../state/store';
import { IconClose, IconMaximize } from './icons';
import { clamp, startDrag } from './util';

interface Props {
  id: WinId;
  title: ReactNode;
  icon: ReactNode;
  bounds: { w: number; h: number };
  minW?: number;
  minH?: number;
  /** Extra controls in the title bar. */
  extra?: ReactNode;
  children: ReactNode;
}

const HEADER = 34;

export function WindowFrame({ id, title, icon, bounds, minW = 320, minH = 160, extra, children }: Props) {
  const win = useStudio((s) => s.windows[id]);
  const focused = useStudio((s) => s.focused === id);
  const st = useStudio.getState;

  // Keep at least part of the title bar reachable when the workspace shrinks.
  const w = Math.min(win.w, Math.max(minW, bounds.w));
  const h = Math.min(win.h, Math.max(minH, bounds.h));
  const rect = win.max
    ? { x: 0, y: 0, w: bounds.w, h: bounds.h }
    : { x: clamp(win.x, 120 - w, bounds.w - 120), y: clamp(win.y, 0, Math.max(0, bounds.h - HEADER)), w, h };

  const onHeaderDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || win.max || (e.target as HTMLElement).closest('button, select, input, [role="slider"]')) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const { x, y } = rect;
    document.body.classList.add('is-moving-window');
    startDrag(
      (ev) => st().setWindowRect(id, { x: x + ev.clientX - sx, y: y + ev.clientY - sy }),
      () => document.body.classList.remove('is-moving-window'),
    );
  };

  const onResizeDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const { w: w0, h: h0 } = rect;
    document.body.classList.add('is-resizing-window');
    startDrag(
      (ev) => st().setWindowRect(id, { w: Math.max(minW, w0 + ev.clientX - sx), h: Math.max(minH, h0 + ev.clientY - sy) }),
      () => document.body.classList.remove('is-resizing-window'),
    );
  };

  return (
    <section
      className={`win${focused ? ' is-focused' : ''}${win.max ? ' is-max' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: win.z }}
      onPointerDownCapture={() => st().focusWindow(id)}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <header className="win-head" onPointerDown={onHeaderDown} onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, select, input, [role="slider"]')) st().toggleMax(id);
      }}>
        <span className="win-icon">{icon}</span>
        <span className="win-title">{title}</span>
        <div className="win-extra">{extra}</div>
        <button className="win-btn" aria-label={win.max ? 'Restore' : 'Maximize'} data-hint={win.max ? 'Restore' : 'Maximize'} onClick={() => st().toggleMax(id)}>
          <IconMaximize />
        </button>
        <button className="win-btn" aria-label="Close" data-hint="Close" onClick={() => st().closeWindow(id)}>
          <IconClose />
        </button>
      </header>
      <div className="win-body">{children}</div>
      {!win.max && <div className="win-resize" onPointerDown={onResizeDown} aria-hidden="true" />}
    </section>
  );
}
