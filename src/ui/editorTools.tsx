import type { ReactNode } from 'react';
import { SNAP_OPTIONS } from '../core/time';
import { IconBrush, IconEraser, IconPencil, IconSelect, IconZoomIn, IconZoomOut } from './icons';

export type Tool = 'draw' | 'paint' | 'delete' | 'select';

const TOOLS: { id: Tool; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'draw', label: 'Pencil', hint: 'Pencil: click to add, drag to move, drag the right edge to resize', icon: <IconPencil /> },
  { id: 'paint', label: 'Brush', hint: 'Brush: drag to paint repeated copies', icon: <IconBrush /> },
  { id: 'delete', label: 'Eraser', hint: 'Eraser: click or drag over items to delete them. Right-click erases with any tool.', icon: <IconEraser /> },
  { id: 'select', label: 'Select', hint: 'Select: drag a box. Ctrl+drag selects with any tool.', icon: <IconSelect /> },
];

export function ToolPicker({ tool, onChange }: { tool: Tool; onChange: (t: Tool) => void }) {
  return (
    <div className="seg seg-icons" role="radiogroup" aria-label="Tool">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={tool === t.id}
          aria-label={t.label}
          data-hint={t.hint}
          className={tool === t.id ? 'is-on' : ''}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}

export function SnapPicker({ value, onChange }: { value: number; onChange: (ticks: number) => void }) {
  return (
    <label className="snap" data-hint="Snap: the grid that positions and lengths stick to">
      <span>Snap</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {SNAP_OPTIONS.map((o) => (
          <option key={o.label} value={o.ticks}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ZoomButtons({ onZoom }: { onZoom: (factor: number) => void }) {
  return (
    <div className="tb-group">
      <button className="icon-btn" aria-label="Zoom out" data-hint="Zoom out (Ctrl+wheel)" onClick={() => onZoom(1 / 1.4)}>
        <IconZoomOut />
      </button>
      <button className="icon-btn" aria-label="Zoom in" data-hint="Zoom in (Ctrl+wheel)" onClick={() => onZoom(1.4)}>
        <IconZoomIn />
      </button>
    </div>
  );
}
