import type { Draft } from 'immer';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { engine } from '../audio/engine';
import { uid } from '../core/ids';
import { DEFAULT_VEL, KEY_COUNT, ROOT_KEY, isBlackKey, noteName, patternLength } from '../core/project';
import { BAR, BEAT, STEP, ceilTo, formatPosition, snapFloor, snapRound } from '../core/time';
import type { Note, Project } from '../core/types';
import { useStudio } from '../state/store';
import { useEditorKeys } from './editorKeys';
import { SnapPicker, ToolPicker, ZoomButtons, type Tool } from './editorTools';
import { setHint } from './hint';
import { IconGhost } from './icons';
import { T } from './theme';
import { clamp, prepareCanvas, startDrag, useElementSize, useFrame, useNativeWheel } from './util';

const KEY_H = 13;
const KB_W = 56;
const RULER_H = 22;
const VEL_H = 72;
const VEL_BASE = VEL_H - 5;
const VEL_SPAN = VEL_H - 14;
const EMPTY_NOTES: Note[] = [];
const EMPTY_SEL: ReadonlySet<string> = new Set();

/** Shared between piano roll sessions, like FL Studio's clipboard. */
let clipboard: Note[] = [];

interface Live {
  notes: Note[];
  ghosts: Note[];
  selection: ReadonlySet<string>;
  zoom: number;
  patLen: number;
  color: string;
  patternId: string;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface GridPoint {
  x: number;
  y: number;
  tick: number;
  key: number;
  inside: boolean;
}

const keyY = (key: number, sy: number) => (KEY_COUNT - 1 - key) * KEY_H - sy;

export function PianoRoll() {
  const channelId = useStudio((s) => s.selectedChannelId);
  const pattern = useStudio((s) => s.project.patterns.find((p) => p.id === s.currentPatternId));
  const channels = useStudio((s) => s.project.channels);
  const channel = channels.find((c) => c.id === channelId) ?? null;
  const [tool, setTool] = useState<Tool>('draw');
  const [snap, setSnap] = useState(STEP);
  const [zoom, setZoom] = useState(0.9);
  const [ghosts, setGhosts] = useState(true);
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SEL);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const velRef = useRef<HTMLCanvasElement>(null);
  const size = useElementSize(scrollRef);
  const lastLen = useRef(STEP);
  const lastVel = useRef(DEFAULT_VEL);
  const rect = useRef<Rect | null>(null);
  const pressedKey = useRef<number | null>(null);
  const previewKey = useRef<number | null>(null);
  const dirty = useRef(true);
  const wasPlaying = useRef(false);
  const pendingScrollLeft = useRef<number | null>(null);

  const notes = (channelId && pattern?.notes[channelId]) || EMPTY_NOTES;
  const ghostNotes = useMemo(() => {
    if (!ghosts || !pattern) return EMPTY_NOTES;
    return Object.entries(pattern.notes)
      .filter(([id]) => id !== channelId)
      .flatMap(([, ns]) => ns);
  }, [pattern, channelId, ghosts]);
  const patLen = pattern ? patternLength(pattern) : BAR;
  const live = useRef<Live>({ notes, ghosts: ghostNotes, selection, zoom, patLen, color: T.dust, patternId: '' });
  live.current = { notes, ghosts: ghostNotes, selection, zoom, patLen, color: channel?.color ?? T.dust, patternId: pattern?.id ?? '' };
  dirty.current = true;

  // Center the view on the channel's notes (or C5) when switching channels.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const keys = live.current.notes.map((n) => n.key);
    const center = keys.length ? (Math.min(...keys) + Math.max(...keys)) / 2 : ROOT_KEY;
    el.scrollTop = Math.max(0, (KEY_COUNT - 1 - center) * KEY_H - el.clientHeight / 2);
    dirty.current = true;
  }, [channelId, size.h > 0]);

  useEffect(() => setSelection(EMPTY_SEL), [channelId, pattern?.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScrollLeft.current !== null) {
      el.scrollLeft = pendingScrollLeft.current;
      pendingScrollLeft.current = null;
    }
  }, [zoom]);

  useFrame(() => {
    const playing = engine.isPlaying;
    if (!dirty.current && !playing && !wasPlaying.current) return;
    wasPlaying.current = playing;
    dirty.current = false;
    const el = scrollRef.current;
    if (!el) return;
    const L = live.current;
    const pos = L.patternId ? engine.patternPosition(L.patternId) : -1;
    drawGrid(gridRef.current, el.clientWidth, el.clientHeight, el.scrollLeft, el.scrollTop, L, pos, rect.current);
    drawKeys(keysRef.current, el.clientHeight, el.scrollTop, pressedKey.current);
    drawRuler(rulerRef.current, el.clientWidth, el.scrollLeft, L, pos);
    drawVelocity(velRef.current, el.clientWidth, el.scrollLeft, L);
  });

  const zoomBy = (factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const z = live.current.zoom;
    const next = clamp(z * factor, 0.15, 6);
    const ax = anchorX ?? el.clientWidth / 2;
    pendingScrollLeft.current = ((el.scrollLeft + ax) / z) * next - ax;
    setZoom(next);
  };

  useNativeWheel(scrollRef, (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : null;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, r ? e.clientX - r.left : undefined);
  });
  useNativeWheel(keysRef, (e) => {
    e.preventDefault();
    if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
  });
  useNativeWheel(velRef, (e) => {
    e.preventDefault();
    if (scrollRef.current) scrollRef.current.scrollLeft += e.deltaY || e.deltaX;
  });

  const point = (e: { clientX: number; clientY: number }): GridPoint => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return {
      x,
      y,
      tick: (x + el.scrollLeft) / live.current.zoom,
      key: clamp(KEY_COUNT - 1 - Math.floor((y + el.scrollTop) / KEY_H), 0, KEY_COUNT - 1),
      inside: x >= 0 && y >= 0 && x < el.clientWidth && y < el.clientHeight,
    };
  };

  const hitTest = (x: number, y: number) => {
    const el = scrollRef.current!;
    const L = live.current;
    for (let i = L.notes.length - 1; i >= 0; i--) {
      const n = L.notes[i];
      const nx = n.pos * L.zoom - el.scrollLeft;
      const ny = keyY(n.key, el.scrollTop);
      const nw = Math.max(4, n.len * L.zoom);
      if (x >= nx && x < nx + nw && y >= ny && y < ny + KEY_H) {
        return { note: n, zone: x >= nx + nw - Math.min(7, nw / 3) ? ('end' as const) : ('body' as const) };
      }
    }
    return null;
  };

  /** Edits this channel's notes in the current pattern. */
  const edit = (recipe: (notes: Draft<Note>[]) => void, history = false) => {
    const pid = live.current.patternId;
    const cid = channelId;
    if (!pid || !cid) return;
    const fn = (d: Draft<Project>) => {
      const p = d.patterns.find((x) => x.id === pid);
      if (!p) return;
      const arr = (p.notes[cid] ??= []);
      recipe(arr);
      if (arr.length === 0) delete p.notes[cid];
    };
    if (history) useStudio.getState().commit(fn);
    else useStudio.getState().mutate(fn);
  };

  const preview = (key: number | null) => {
    if (!channelId) return;
    if (previewKey.current !== null) engine.noteOff(channelId, previewKey.current);
    previewKey.current = key;
    if (key !== null && !engine.isPlaying) engine.noteOn(channelId, key, lastVel.current);
  };

  const beginMove = (group: Note[], anchor: Note, start: GridPoint, snapT: number) => {
    const orig = new Map(group.map((n) => [n.id, n]));
    const minPos = Math.min(...group.map((n) => n.pos));
    const minKey = Math.min(...group.map((n) => n.key));
    const maxKey = Math.max(...group.map((n) => n.key));
    let heard = anchor.key;
    preview(anchor.key);
    startDrag(
      (ev) => {
        const q = point(ev);
        const dt = Math.max(-minPos, snapRound(anchor.pos + q.tick - start.tick, snapT) - anchor.pos);
        const dk = clamp(q.key - start.key, -minKey, KEY_COUNT - 1 - maxKey);
        edit((arr) => {
          for (const n of arr) {
            const o = orig.get(n.id);
            if (o) {
              n.pos = o.pos + dt;
              n.key = o.key + dk;
            }
          }
        });
        if (anchor.key + dk !== heard) {
          heard = anchor.key + dk;
          preview(heard);
        }
        setHint(`${noteName(anchor.key + dk)} at ${formatPosition(anchor.pos + dt)}`);
      },
      () => preview(null),
    );
  };

  const beginResize = (group: Note[], anchor: Note, start: GridPoint, snapT: number) => {
    const orig = new Map(group.map((n) => [n.id, n]));
    const minLen = snapT > 1 ? snapT : 6;
    startDrag((ev) => {
      const q = point(ev);
      const end = snapRound(anchor.pos + anchor.len + q.tick - start.tick, snapT);
      const len = Math.max(minLen, end - anchor.pos);
      const d = len - anchor.len;
      edit((arr) => {
        for (const n of arr) {
          const o = orig.get(n.id);
          if (o) n.len = Math.max(minLen, o.len + d);
        }
      });
      lastLen.current = len;
      setHint(`Length: ${(len / STEP).toFixed(len % STEP ? 2 : 0)} steps`);
    });
  };

  const beginPaint = (start: GridPoint, snapT: number) => {
    const len = lastLen.current;
    const origin = Math.max(0, snapFloor(start.tick, snapT));
    const painted = new Set<string>();
    const paintAt = (tick: number, key: number) => {
      const cell = origin + Math.floor((tick - origin) / len) * len;
      if (cell < 0 || painted.has(`${cell}:${key}`)) return;
      painted.add(`${cell}:${key}`);
      edit((arr) => {
        if (!arr.some((n) => n.pos === cell && n.key === key)) arr.push({ id: uid('n'), pos: cell, len, key, vel: lastVel.current });
      });
    };
    paintAt(start.tick, start.key);
    preview(start.key);
    startDrag(
      (ev) => {
        const q = point(ev);
        paintAt(q.tick, q.key);
      },
      () => preview(null),
    );
  };

  const beginSelectBox = (start: GridPoint, additive: boolean) => {
    const el = scrollRef.current!;
    const x0 = start.x + el.scrollLeft;
    const y0 = start.y + el.scrollTop;
    const base = additive ? live.current.selection : EMPTY_SEL;
    rect.current = { x0, y0, x1: x0, y1: y0 };
    startDrag(
      (ev) => {
        const q = point(ev);
        const x1 = q.x + el.scrollLeft;
        const y1 = q.y + el.scrollTop;
        rect.current = { x0, y0, x1, y1 };
        const [ax, bx, ay, by] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
        const z = live.current.zoom;
        const sel = new Set(base);
        for (const n of live.current.notes) {
          const nx = n.pos * z;
          const ny = (KEY_COUNT - 1 - n.key) * KEY_H;
          if (nx < bx && nx + Math.max(4, n.len * z) > ax && ny < by && ny + KEY_H > ay) sel.add(n.id);
        }
        setSelection(sel);
      },
      () => {
        rect.current = null;
        dirty.current = true;
      },
    );
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pattern || !channel) return;
    const p = point(e);
    if (!p.inside) return;
    e.preventDefault();
    const st = useStudio.getState();
    const hit = hitTest(p.x, p.y);
    const L = live.current;

    if (e.button === 2 || (e.button === 0 && tool === 'delete')) {
      st.checkpoint();
      const erase = (x: number, y: number) => {
        const h = hitTest(x, y);
        if (!h) return;
        edit((arr) => {
          const i = arr.findIndex((n) => n.id === h.note.id);
          if (i >= 0) arr.splice(i, 1);
        });
      };
      erase(p.x, p.y);
      startDrag((ev) => {
        const q = point(ev);
        erase(q.x, q.y);
      });
      return;
    }
    if (e.button !== 0) return;

    const selecting = tool === 'select' || e.ctrlKey || e.metaKey;
    if (hit) {
      const n = hit.note;
      lastLen.current = n.len;
      lastVel.current = n.vel;
      let sel = L.selection;
      if (!sel.has(n.id)) {
        sel = selecting ? new Set(e.shiftKey ? [...sel, n.id] : [n.id]) : EMPTY_SEL;
        setSelection(sel);
      }
      const group = sel.has(n.id) ? L.notes.filter((x) => sel.has(x.id)) : [n];
      st.checkpoint();
      if (hit.zone === 'end') {
        beginResize(group, n, p, snap);
      } else if (e.shiftKey && !selecting) {
        const copies = group.map((x) => ({ ...x, id: uid('n') }));
        edit((arr) => {
          arr.push(...copies);
        });
        setSelection(new Set(copies.map((c) => c.id)));
        beginMove(copies, copies[group.indexOf(n)], p, snap);
      } else {
        beginMove(group, n, p, snap);
      }
      return;
    }
    if (selecting) {
      beginSelectBox(p, e.shiftKey);
      return;
    }
    st.checkpoint();
    setSelection(EMPTY_SEL);
    if (tool === 'paint') {
      beginPaint(p, snap);
      return;
    }
    const note: Note = { id: uid('n'), pos: Math.max(0, snapFloor(p.tick, snap)), len: lastLen.current, key: p.key, vel: lastVel.current };
    edit((arr) => {
      arr.push(note);
    });
    beginMove([note], note, p, snap);
  };

  const onHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons) return;
    const el = e.currentTarget;
    const p = point(e);
    const hit = p.inside ? hitTest(p.x, p.y) : null;
    el.style.cursor = !p.inside ? '' : hit ? (hit.zone === 'end' ? 'ew-resize' : 'move') : tool === 'delete' ? 'not-allowed' : 'crosshair';
  };

  const onKeysDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !channelId) return;
    e.preventDefault();
    const top = e.currentTarget.getBoundingClientRect().top;
    const keyAt = (clientY: number) =>
      clamp(KEY_COUNT - 1 - Math.floor((clientY - top + (scrollRef.current?.scrollTop ?? 0)) / KEY_H), 0, KEY_COUNT - 1);
    const press = (k: number) => {
      pressedKey.current = k;
      dirty.current = true;
      if (previewKey.current !== null) engine.noteOff(channelId, previewKey.current);
      previewKey.current = k;
      engine.noteOn(channelId, k, lastVel.current);
      setHint(noteName(k));
    };
    press(keyAt(e.clientY));
    startDrag(
      (ev) => {
        const k = keyAt(ev.clientY);
        if (k !== pressedKey.current) press(k);
      },
      () => {
        if (previewKey.current !== null) engine.noteOff(channelId, previewKey.current);
        previewKey.current = null;
        pressedKey.current = null;
        dirty.current = true;
      },
    );
  };

  const onVelDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !pattern || !channelId) return;
    e.preventDefault();
    useStudio.getState().checkpoint();
    const canvas = e.currentTarget;
    const apply = (ev: { clientX: number; clientY: number }) => {
      const el = scrollRef.current;
      if (!el) return;
      const r = canvas.getBoundingClientRect();
      const x = ev.clientX - r.left + el.scrollLeft;
      const vel = clamp((VEL_BASE - (ev.clientY - r.top)) / VEL_SPAN, 0, 1);
      const L = live.current;
      const onlySelected = L.selection.size > 0;
      const ids = new Set(
        L.notes.filter((n) => (!onlySelected || L.selection.has(n.id)) && Math.abs(n.pos * L.zoom - x) <= 5).map((n) => n.id),
      );
      if (!ids.size) return;
      edit((arr) => {
        for (const n of arr) if (ids.has(n.id)) n.vel = Math.round(vel * 127) / 127;
      });
      lastVel.current = vel;
      setHint(`Velocity: ${Math.round(vel * 100)}%`);
    };
    apply(e);
    startDrag(apply);
  };

  useEditorKeys('pianoRoll', (e) => {
    const L = live.current;
    if (!L.patternId || !channelId) return false;
    const mod = e.ctrlKey || e.metaKey;
    const selected = L.notes.filter((n) => L.selection.has(n.id));
    const removeSelected = () =>
      edit((arr) => {
        for (let i = arr.length - 1; i >= 0; i--) if (L.selection.has(arr[i].id)) arr.splice(i, 1);
      }, true);

    if (!mod && (e.code === 'Delete' || e.code === 'Backspace')) {
      if (!selected.length) return false;
      removeSelected();
      setSelection(EMPTY_SEL);
      return true;
    }
    if (mod && e.code === 'KeyA') {
      setSelection(new Set(L.notes.map((n) => n.id)));
      return true;
    }
    if (mod && e.code === 'KeyD') {
      setSelection(EMPTY_SEL);
      return true;
    }
    if (mod && (e.code === 'KeyC' || e.code === 'KeyX')) {
      if (!selected.length) return false;
      clipboard = selected.map((n) => ({ ...n }));
      if (e.code === 'KeyX') {
        removeSelected();
        setSelection(EMPTY_SEL);
      }
      setHint(`${selected.length} note${selected.length > 1 ? 's' : ''} ${e.code === 'KeyX' ? 'cut' : 'copied'}.`);
      return true;
    }
    if (mod && e.code === 'KeyV') {
      if (!clipboard.length) return false;
      const copies = clipboard.map((n) => ({ ...n, id: uid('n') }));
      edit((arr) => {
        arr.push(...copies);
      }, true);
      setSelection(new Set(copies.map((n) => n.id)));
      return true;
    }
    if (mod && e.code === 'KeyB') {
      const src = selected.length ? selected : L.notes;
      if (!src.length) return false;
      const start = Math.min(...src.map((n) => n.pos));
      const end = Math.max(...src.map((n) => n.pos + n.len));
      const shift = ceilTo(end - start, end - start >= BAR ? BAR : BEAT);
      const copies = src.map((n) => ({ ...n, id: uid('n'), pos: n.pos + shift }));
      edit((arr) => {
        arr.push(...copies);
      }, true);
      setSelection(new Set(copies.map((n) => n.id)));
      return true;
    }
    if (!mod && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      if (!selected.length) return false;
      const d = (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1);
      if (selected.some((n) => n.key + d < 0 || n.key + d >= KEY_COUNT)) return true;
      edit((arr) => {
        for (const n of arr) if (L.selection.has(n.id)) n.key += d;
      }, true);
      return true;
    }
    if (!mod && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      if (!selected.length) return false;
      const d = (e.code === 'ArrowRight' ? 1 : -1) * snap;
      if (selected.some((n) => n.pos + d < 0)) return true;
      edit((arr) => {
        for (const n of arr) if (L.selection.has(n.id)) n.pos += d;
      }, true);
      return true;
    }
    return false;
  });

  const contentW = Math.max(size.w + 1, (patLen + 4 * BAR) * zoom);
  return (
    <div className="editor">
      <div className="ed-toolbar">
        <label className="channel-picker" data-hint="Channel being edited">
          <span className="swatch" style={{ background: channel?.color }} />
          <select
            className="select"
            value={channelId ?? ''}
            onChange={(e) => useStudio.getState().selectChannel(e.target.value)}
            aria-label="Channel"
          >
            {!channel && <option value="">No channel</option>}
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <ToolPicker tool={tool} onChange={setTool} />
        <SnapPicker value={snap} onChange={setSnap} />
        <button
          className={`icon-btn${ghosts ? ' is-on' : ''}`}
          aria-pressed={ghosts}
          aria-label="Ghost notes"
          data-hint="Ghost notes: show the other channels of this pattern"
          onClick={() => setGhosts(!ghosts)}
        >
          <IconGhost />
        </button>
        <span className="ed-spacer" />
        <ZoomButtons onZoom={(f) => zoomBy(f)} />
      </div>
      <div className="pr-body">
        <div className="pr-corner" />
        <div className="pr-cell">
          <canvas ref={rulerRef} />
        </div>
        <div className="pr-cell">
          <canvas ref={keysRef} onPointerDown={onKeysDown} data-hint="Click a key to hear it" />
        </div>
        <div className="pr-cell">
          <canvas ref={gridRef} className="pr-canvas" />
          <div
            className="pr-scroll"
            ref={scrollRef}
            onScroll={() => (dirty.current = true)}
            onPointerDown={onPointerDown}
            onPointerMove={onHover}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div style={{ width: contentW, height: KEY_COUNT * KEY_H }} />
          </div>
          {!channel && <p className="pr-empty">Select a channel in the channel rack to edit its notes.</p>}
        </div>
        <div className="pr-vel-label">Velocity</div>
        <div className="pr-cell">
          <canvas ref={velRef} onPointerDown={onVelDown} data-hint="Velocity: drag over the notes to change how hard they hit" />
        </div>
      </div>
    </div>
  );
}

function drawGrid(canvas: HTMLCanvasElement | null, w: number, h: number, sx: number, sy: number, L: Live, playPos: number, sel: Rect | null) {
  const c = prepareCanvas(canvas, w, h);
  if (!c) return;
  const z = L.zoom;
  c.fillStyle = T.gridBg;
  c.fillRect(0, 0, w, h);
  const top = Math.min(KEY_COUNT - 1, KEY_COUNT - 1 - Math.floor(sy / KEY_H));
  const bottom = Math.max(0, KEY_COUNT - 1 - Math.floor((sy + h) / KEY_H));
  for (let k = bottom; k <= top; k++) {
    const y = keyY(k, sy);
    if (isBlackKey(k)) {
      c.fillStyle = T.rowBlack;
      c.fillRect(0, y, w, KEY_H);
    }
    if (k % 12 === 0) {
      c.fillStyle = T.octaveLine;
      c.fillRect(0, y + KEY_H - 1, w, 1);
    }
  }
  const unit = STEP * z >= 7 ? STEP : BEAT * z >= 7 ? BEAT : BAR;
  c.lineWidth = 1;
  for (let t = Math.floor(sx / z / unit) * unit; t * z - sx <= w; t += unit) {
    const x = Math.round(t * z - sx) + 0.5;
    c.strokeStyle = t % BAR === 0 ? T.barLine : t % BEAT === 0 ? T.beatLine : T.stepLine;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  const end = L.patLen * z - sx;
  if (end < w) {
    c.fillStyle = 'rgba(8, 6, 4, 0.42)';
    c.fillRect(Math.max(0, end), 0, w - Math.max(0, end), h);
  }
  c.strokeStyle = 'rgba(239, 231, 218, 0.2)';
  for (const n of L.ghosts) {
    const x = n.pos * z - sx;
    const y = keyY(n.key, sy);
    const nw = Math.max(3, n.len * z);
    if (x > w || x + nw < 0 || y > h || y + KEY_H < 0) continue;
    c.strokeRect(Math.round(x) + 0.5, y + 1.5, Math.max(2, nw - 1), KEY_H - 3);
  }
  c.font = `600 9px ${T.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  for (const n of L.notes) {
    const x = n.pos * z - sx;
    const y = keyY(n.key, sy);
    const nw = Math.max(4, n.len * z);
    if (x > w || x + nw < 0 || y > h || y + KEY_H < 0) continue;
    const selected = L.selection.has(n.id);
    c.globalAlpha = 0.45 + 0.55 * n.vel;
    c.fillStyle = selected ? T.paper : L.color;
    c.beginPath();
    c.roundRect(x + 0.5, y + 1, nw - 1, KEY_H - 2, 2.5);
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(21, 18, 15, 0.35)';
    c.fillRect(x + nw - 3.5, y + 3, 1.5, KEY_H - 6);
    if (nw > 28) {
      c.fillStyle = 'rgba(21, 18, 15, 0.85)';
      c.fillText(noteName(n.key), x + 4, y + KEY_H / 2 + 0.5);
    }
  }
  if (sel) {
    const x = Math.min(sel.x0, sel.x1) - sx;
    const y = Math.min(sel.y0, sel.y1) - sy;
    const rw = Math.abs(sel.x1 - sel.x0);
    const rh = Math.abs(sel.y1 - sel.y0);
    c.fillStyle = 'rgba(239, 231, 218, 0.06)';
    c.fillRect(x, y, rw, rh);
    c.strokeStyle = 'rgba(239, 231, 218, 0.7)';
    c.setLineDash([3, 3]);
    c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, rw, rh);
    c.setLineDash([]);
  }
  if (playPos >= 0) {
    const x = Math.round(playPos * z - sx) + 0.5;
    c.strokeStyle = T.paper;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
}

function drawKeys(canvas: HTMLCanvasElement | null, h: number, sy: number, pressed: number | null) {
  const c = prepareCanvas(canvas, KB_W, h);
  if (!c) return;
  c.fillStyle = T.ivoryKey;
  c.fillRect(0, 0, KB_W, h);
  const top = Math.min(KEY_COUNT - 1, KEY_COUNT - 1 - Math.floor(sy / KEY_H));
  const bottom = Math.max(0, KEY_COUNT - 1 - Math.floor((sy + h) / KEY_H));
  c.font = `600 9px ${T.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'right';
  for (let k = bottom; k <= top; k++) {
    const y = keyY(k, sy);
    if (isBlackKey(k)) {
      c.fillStyle = k === pressed ? T.lamp[1] : T.ebonyKey;
      c.fillRect(0, y + 1, KB_W * 0.6, KEY_H - 2);
      continue;
    }
    if (k === pressed) {
      c.fillStyle = T.lamp[1];
      c.fillRect(0, y, KB_W, KEY_H);
    }
    c.fillStyle = 'rgba(21, 18, 15, 0.22)';
    c.fillRect(0, y + KEY_H - 1, KB_W, 1);
    if (k % 12 === 0) {
      c.fillStyle = '#4a4238';
      c.fillText(noteName(k), KB_W - 5, y + KEY_H / 2);
    }
  }
  c.fillStyle = T.seam;
  c.fillRect(KB_W - 1, 0, 1, h);
}

function drawRuler(canvas: HTMLCanvasElement | null, w: number, sx: number, L: Live, playPos: number) {
  const c = prepareCanvas(canvas, w, RULER_H);
  if (!c) return;
  const z = L.zoom;
  c.fillStyle = T.console;
  c.fillRect(0, 0, w, RULER_H);
  c.fillStyle = T.seam;
  c.fillRect(0, RULER_H - 1, w, 1);
  const barPx = BAR * z;
  const every = Math.max(1, Math.ceil(36 / barPx));
  c.font = `600 10px ${T.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  for (let b = Math.floor(sx / barPx); b * barPx - sx <= w; b++) {
    const x = Math.round(b * barPx - sx);
    const labelled = b % every === 0;
    c.fillStyle = 'rgba(239, 231, 218, 0.26)';
    c.fillRect(x, labelled ? 5 : 13, 1, RULER_H);
    if (labelled) {
      c.fillStyle = b * BAR < L.patLen ? T.paper : T.dust2;
      c.fillText(String(b + 1), x + 4, 10);
    }
    if (BEAT * z >= 12) {
      c.fillStyle = 'rgba(239, 231, 218, 0.13)';
      for (let i = 1; i < 4; i++) c.fillRect(Math.round(x + i * BEAT * z), 15, 1, RULER_H - 15);
    }
  }
  const ex = L.patLen * z - sx;
  if (ex >= 0 && ex <= w) {
    c.fillStyle = T.lamp[1];
    c.beginPath();
    c.moveTo(ex, RULER_H - 1);
    c.lineTo(ex - 7, RULER_H - 1);
    c.lineTo(ex, RULER_H - 8);
    c.fill();
  }
  if (playPos >= 0) {
    const x = playPos * z - sx;
    c.fillStyle = T.paper;
    c.beginPath();
    c.moveTo(x - 5, 0);
    c.lineTo(x + 5, 0);
    c.lineTo(x, 7);
    c.fill();
  }
}

function drawVelocity(canvas: HTMLCanvasElement | null, w: number, sx: number, L: Live) {
  const c = prepareCanvas(canvas, w, VEL_H);
  if (!c) return;
  const z = L.zoom;
  c.fillStyle = T.gridBg;
  c.fillRect(0, 0, w, VEL_H);
  c.fillStyle = T.seam;
  c.fillRect(0, 0, w, 1);
  c.fillStyle = 'rgba(239, 231, 218, 0.07)';
  c.fillRect(0, Math.round(VEL_BASE - DEFAULT_VEL * VEL_SPAN), w, 1);
  c.lineWidth = 1.5;
  for (const n of L.notes) {
    const x = Math.round(n.pos * z - sx) + 0.5;
    if (x < -4 || x > w + 4) continue;
    const top = VEL_BASE - n.vel * VEL_SPAN;
    const color = L.selection.has(n.id) ? T.paper : L.color;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, VEL_BASE);
    c.lineTo(x, top);
    c.stroke();
    c.beginPath();
    c.arc(x, top, 2.6, 0, Math.PI * 2);
    c.fill();
  }
}
