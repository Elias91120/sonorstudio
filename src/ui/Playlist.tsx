import type { Draft } from 'immer';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { engine } from '../audio/engine';
import { uid } from '../core/ids';
import { patternLength, songLength } from '../core/project';
import { BAR, BEAT, STEP, formatPosition, snapFloor, snapRound } from '../core/time';
import type { Clip, Pattern, PlaylistTrack, Project } from '../core/types';
import {
  addPattern,
  clonePattern,
  duplicateClips,
  recolorPattern,
  removePattern,
  renamePattern,
  renameTrack,
  toggleTrackMute,
} from '../state/actions';
import { useStudio } from '../state/store';
import { Led } from './controls';
import { useEditorKeys } from './editorKeys';
import { SnapPicker, ToolPicker, ZoomButtons, type Tool } from './editorTools';
import { setHint } from './hint';
import { IconFollow, IconPlus } from './icons';
import { askText, openMenu } from './overlay';
import { alpha, drawPlayhead, T } from './theme';
import { clamp, prepareCanvas, startDrag, useElementSize, useFrame, useNativeWheel } from './util';

const TRACK_H = 44;
const RULER_H = 24;
const EMPTY_SEL: ReadonlySet<string> = new Set();

interface PatternShape {
  pattern: Pattern;
  length: number;
  notes: { pos: number; len: number; key: number }[];
  lo: number;
  hi: number;
}

interface Live {
  clips: Clip[];
  tracks: PlaylistTrack[];
  shapes: Map<string, PatternShape>;
  selection: ReadonlySet<string>;
  zoom: number;
  songLen: number;
  songStart: number;
  mode: 'pattern' | 'song';
  follow: boolean;
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
  track: number;
  inside: boolean;
}

export function Playlist() {
  const clips = useStudio((s) => s.project.clips);
  const tracks = useStudio((s) => s.project.tracks);
  const patterns = useStudio((s) => s.project.patterns);
  const currentPatternId = useStudio((s) => s.currentPatternId);
  const mode = useStudio((s) => s.mode);
  const songStart = useStudio((s) => s.songStart);
  const [tool, setTool] = useState<Tool>('draw');
  const [snap, setSnap] = useState(BAR);
  const [zoom, setZoom] = useState(64 / BAR);
  const [follow, setFollow] = useState(true);
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SEL);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(scrollRef);
  const rect = useRef<Rect | null>(null);
  const dirty = useRef(true);
  const wasPlaying = useRef(false);
  const pendingScrollLeft = useRef<number | null>(null);

  const shapes = useMemo(() => {
    const map = new Map<string, PatternShape>();
    for (const p of patterns) {
      const notes = Object.values(p.notes).flat();
      const keys = notes.map((n) => n.key);
      map.set(p.id, { pattern: p, length: patternLength(p), notes, lo: Math.min(...keys), hi: Math.max(...keys) });
    }
    return map;
  }, [patterns]);
  const songLen = useMemo(() => songLength(clips), [clips]);

  const live = useRef<Live>({ clips, tracks, shapes, selection, zoom, songLen, songStart, mode, follow });
  live.current = { clips, tracks, shapes, selection, zoom, songLen, songStart, mode, follow };
  dirty.current = true;

  useEffect(() => {
    const ids = new Set(clips.map((c) => c.id));
    setSelection((sel) => (Array.from(sel).every((id) => ids.has(id)) ? sel : new Set(Array.from(sel).filter((id) => ids.has(id)))));
  }, [clips]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScrollLeft.current !== null) {
      el.scrollLeft = pendingScrollLeft.current;
      pendingScrollLeft.current = null;
    }
  }, [zoom]);

  useFrame(() => {
    const el = scrollRef.current;
    if (!el) return;
    const L = live.current;
    const playing = engine.isPlaying;
    const pos = playing && L.mode === 'song' ? engine.position() : -1;
    if (pos >= 0 && L.follow) {
      const x = pos * L.zoom - el.scrollLeft;
      if (x > el.clientWidth * 0.92 || x < 0) el.scrollLeft = Math.max(0, pos * L.zoom - el.clientWidth * 0.08);
    }
    if (!dirty.current && !playing && !wasPlaying.current) return;
    wasPlaying.current = playing;
    dirty.current = false;
    if (headsRef.current) headsRef.current.style.transform = `translateY(${-el.scrollTop}px)`;
    drawGrid(gridRef.current, el.clientWidth, el.clientHeight, el.scrollLeft, el.scrollTop, L, pos, rect.current);
    drawRuler(rulerRef.current, el.clientWidth, el.scrollLeft, L, pos);
  });

  const zoomBy = (factor: number, anchorX?: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const z = live.current.zoom;
    const next = clamp(z * factor, 12 / BAR, 640 / BAR);
    const ax = anchorX ?? el.clientWidth / 2;
    pendingScrollLeft.current = ((el.scrollLeft + ax) / z) * next - ax;
    setZoom(next);
  };

  useNativeWheel(scrollRef, (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = scrollRef.current!.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left);
  });
  useNativeWheel(rulerRef, (e) => {
    e.preventDefault();
    if (scrollRef.current) scrollRef.current.scrollLeft += e.deltaY || e.deltaX;
  });
  useNativeWheel(headsRef, (e) => {
    e.preventDefault();
    if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
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
      track: clamp(Math.floor((y + el.scrollTop) / TRACK_H), 0, live.current.tracks.length - 1),
      inside: x >= 0 && y >= 0 && x < el.clientWidth && y < el.clientHeight,
    };
  };

  const hitTest = (x: number, y: number) => {
    const el = scrollRef.current!;
    const L = live.current;
    for (let i = L.clips.length - 1; i >= 0; i--) {
      const c = L.clips[i];
      const cx = c.pos * L.zoom - el.scrollLeft;
      const cy = c.track * TRACK_H - el.scrollTop;
      const cw = Math.max(4, c.len * L.zoom);
      if (x >= cx && x < cx + cw && y >= cy + 1 && y < cy + TRACK_H - 1) {
        const edge = Math.min(7, cw / 4);
        return { clip: c, zone: x < cx + edge ? ('start' as const) : x >= cx + cw - edge ? ('end' as const) : ('body' as const) };
      }
    }
    return null;
  };

  const edit = (recipe: (clips: Draft<Clip>[]) => void, history = false) => {
    const fn = (d: Draft<Project>) => recipe(d.clips);
    if (history) useStudio.getState().commit(fn);
    else useStudio.getState().mutate(fn);
  };

  const beginMove = (group: Clip[], anchor: Clip, start: GridPoint, snapT: number) => {
    const orig = new Map(group.map((c) => [c.id, c]));
    const minPos = Math.min(...group.map((c) => c.pos));
    const minTrack = Math.min(...group.map((c) => c.track));
    const maxTrack = Math.max(...group.map((c) => c.track));
    startDrag((ev) => {
      const q = point(ev);
      const dt = Math.max(-minPos, snapRound(anchor.pos + q.tick - start.tick, snapT) - anchor.pos);
      const dr = clamp(q.track - start.track, -minTrack, live.current.tracks.length - 1 - maxTrack);
      edit((arr) => {
        for (const c of arr) {
          const o = orig.get(c.id);
          if (o) {
            c.pos = o.pos + dt;
            c.track = o.track + dr;
          }
        }
      });
      setHint(`Bar ${formatPosition(anchor.pos + dt)}, ${live.current.tracks[anchor.track + dr]?.name ?? ''}`);
    });
  };

  const beginResize = (group: Clip[], anchor: Clip, start: GridPoint, snapT: number) => {
    const orig = new Map(group.map((c) => [c.id, c]));
    const minLen = Math.max(snapT, STEP);
    startDrag((ev) => {
      const q = point(ev);
      const end = snapRound(anchor.pos + anchor.len + q.tick - start.tick, snapT);
      const d = Math.max(minLen, end - anchor.pos) - anchor.len;
      edit((arr) => {
        for (const c of arr) {
          const o = orig.get(c.id);
          if (o) c.len = Math.max(minLen, o.len + d);
        }
      });
    });
  };

  const beginTrim = (anchor: Clip, start: GridPoint, snapT: number) => {
    const minLen = Math.max(snapT, STEP);
    startDrag((ev) => {
      const q = point(ev);
      const pos = clamp(snapRound(anchor.pos + q.tick - start.tick, snapT), anchor.pos - anchor.offset, anchor.pos + anchor.len - minLen);
      const d = pos - anchor.pos;
      edit((arr) => {
        const c = arr.find((x) => x.id === anchor.id);
        if (!c) return;
        c.pos = anchor.pos + d;
        c.offset = anchor.offset + d;
        c.len = anchor.len - d;
      });
    });
  };

  const beginPaint = (start: GridPoint, pattern: Pattern, snapT: number) => {
    const len = patternLength(pattern);
    const origin = Math.max(0, snapFloor(start.tick, snapT));
    const track = start.track;
    const painted = new Set<number>();
    const paintAt = (tick: number) => {
      const cell = origin + Math.floor((tick - origin) / len) * len;
      if (cell < 0 || painted.has(cell)) return;
      painted.add(cell);
      edit((arr) => {
        if (!arr.some((c) => c.track === track && c.pos === cell))
          arr.push({ id: uid('clip'), patternId: pattern.id, track, pos: cell, len, offset: 0, muted: false });
      });
    };
    paintAt(start.tick);
    startDrag((ev) => paintAt(point(ev).tick));
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
        for (const c of live.current.clips) {
          const cx = c.pos * z;
          const cy = c.track * TRACK_H;
          if (cx < bx && cx + c.len * z > ax && cy < by && cy + TRACK_H > ay) sel.add(c.id);
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
          const i = arr.findIndex((c) => c.id === h.clip.id);
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
      const c = hit.clip;
      st.setCurrentPattern(c.patternId);
      let sel = L.selection;
      if (!sel.has(c.id)) {
        sel = selecting ? new Set(e.shiftKey ? [...sel, c.id] : [c.id]) : EMPTY_SEL;
        setSelection(sel);
      }
      const group = sel.has(c.id) ? L.clips.filter((x) => sel.has(x.id)) : [c];
      st.checkpoint();
      if (hit.zone === 'end') beginResize(group, c, p, snap);
      else if (hit.zone === 'start') beginTrim(c, p, snap);
      else if (e.shiftKey && !selecting) {
        const copies = group.map((x) => ({ ...x, id: uid('clip') }));
        edit((arr) => {
          arr.push(...copies);
        });
        setSelection(new Set(copies.map((x) => x.id)));
        beginMove(copies, copies[group.indexOf(c)], p, snap);
      } else beginMove(group, c, p, snap);
      return;
    }
    if (selecting) {
      beginSelectBox(p, e.shiftKey);
      return;
    }
    const shape = L.shapes.get(st.currentPatternId);
    if (!shape) return;
    st.checkpoint();
    setSelection(EMPTY_SEL);
    if (tool === 'paint') {
      beginPaint(p, shape.pattern, snap);
      return;
    }
    const clip: Clip = {
      id: uid('clip'),
      patternId: shape.pattern.id,
      track: p.track,
      pos: Math.max(0, snapFloor(p.tick, snap)),
      len: shape.length,
      offset: 0,
      muted: false,
    };
    edit((arr) => {
      arr.push(clip);
    });
    beginMove([clip], clip, p, snap);
  };

  const onHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons) return;
    const p = point(e);
    const hit = p.inside ? hitTest(p.x, p.y) : null;
    e.currentTarget.style.cursor = !p.inside ? '' : hit ? (hit.zone === 'body' ? 'move' : 'ew-resize') : tool === 'delete' ? 'not-allowed' : 'crosshair';
  };

  const onRulerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const canvas = e.currentTarget;
    const set = (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const x = clientX - canvas.getBoundingClientRect().left + el.scrollLeft;
      const tick = Math.max(0, snapFloor(x / live.current.zoom, BEAT));
      useStudio.getState().setSongStart(tick);
      setHint(`Song starts at ${formatPosition(tick)}`);
    };
    set(e.clientX);
    startDrag((ev) => set(ev.clientX));
  };

  useEditorKeys('playlist', (e) => {
    const L = live.current;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod && (e.code === 'Delete' || e.code === 'Backspace')) {
      if (!L.selection.size) return false;
      edit((arr) => {
        for (let i = arr.length - 1; i >= 0; i--) if (L.selection.has(arr[i].id)) arr.splice(i, 1);
      }, true);
      setSelection(EMPTY_SEL);
      return true;
    }
    if (mod && e.code === 'KeyA') {
      setSelection(new Set(L.clips.map((c) => c.id)));
      return true;
    }
    if (mod && e.code === 'KeyD') {
      setSelection(EMPTY_SEL);
      return true;
    }
    if (mod && e.code === 'KeyB') {
      if (!L.selection.size) return false;
      setSelection(new Set(duplicateClips(L.selection)));
      return true;
    }
    return false;
  });

  const contentW = Math.max(size.w + 1, (songLen + 16 * BAR) * zoom);
  return (
    <div className="editor playlist">
      <div className="ed-toolbar">
        <ToolPicker tool={tool} onChange={setTool} />
        <SnapPicker value={snap} onChange={setSnap} />
        <button
          className={`icon-btn${follow ? ' is-on' : ''}`}
          aria-pressed={follow}
          aria-label="Follow playback"
          data-hint="Follow: scroll with the song position while playing"
          onClick={() => setFollow(!follow)}
        >
          <IconFollow />
        </button>
        <span className="ed-spacer" />
        <span className="ed-note">{mode === 'pattern' ? 'Pattern mode: press L to play the song' : ''}</span>
        <ZoomButtons onZoom={(f) => zoomBy(f)} />
      </div>
      <div className="pl-body">
        <PatternPicker patterns={patterns} currentId={currentPatternId} />
        <div className="pl-main">
          <div className="pl-corner">Tracks</div>
          <div className="pr-cell">
            <canvas ref={rulerRef} onPointerDown={onRulerDown} data-hint="Click or drag to set where the song starts playing" />
          </div>
          <div className="pl-heads-wrap">
            <div className="pl-heads" ref={headsRef}>
              {tracks.map((t, i) => (
                <TrackHeader key={i} index={i} track={t} />
              ))}
            </div>
          </div>
          <div className="pr-cell">
            <canvas ref={gridRef} className="pr-canvas" />
            <div
              className="pr-scroll"
              ref={scrollRef}
              onScroll={() => (dirty.current = true)}
              onPointerDown={onPointerDown}
              onPointerMove={onHover}
              onDoubleClick={(e) => {
                const p = point(e);
                const hit = hitTest(p.x, p.y);
                if (!hit) return;
                const st = useStudio.getState();
                st.setCurrentPattern(hit.clip.patternId);
                st.openWindow('channelRack');
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div style={{ width: contentW, height: tracks.length * TRACK_H }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackHeader({ index, track }: { index: number; track: PlaylistTrack }) {
  return (
    <div className={`pl-head${track.muted ? ' is-muted' : ''}`} style={{ height: TRACK_H }}>
      <button
        className="pl-head-name"
        data-hint="Double-click to rename"
        onDoubleClick={async () => {
          const name = await askText('Rename track', track.name);
          if (name) renameTrack(index, name);
        }}
      >
        {track.name}
      </button>
      <Led on={!track.muted} label={`Mute ${track.name}`} hint="Mute this track" onClick={() => toggleTrackMute(index)} />
    </div>
  );
}

function PatternPicker({ patterns, currentId }: { patterns: Pattern[]; currentId: string }) {
  const menu = (e: ReactMouseEvent, p: Pattern) => {
    e.preventDefault();
    openMenu(e, [
      {
        label: 'Open in the channel rack',
        onSelect: () => {
          const st = useStudio.getState();
          st.setCurrentPattern(p.id);
          st.openWindow('channelRack');
        },
      },
      {
        label: 'Rename…',
        onSelect: async () => {
          const name = await askText('Rename pattern', p.name);
          if (name) renamePattern(p.id, name);
        },
      },
      { label: 'Change color', onSelect: () => recolorPattern(p.id) },
      { label: 'Clone', onSelect: () => clonePattern(p.id) },
      { separator: true },
      { label: 'Delete pattern and its clips', danger: true, disabled: patterns.length <= 1, onSelect: () => removePattern(p.id) },
    ]);
  };
  return (
    <aside className="pl-picker" aria-label="Patterns">
      <div className="pl-picker-head">
        <span>Patterns</span>
        <button className="icon-btn" aria-label="New pattern" data-hint="New pattern" onClick={() => addPattern()}>
          <IconPlus />
        </button>
      </div>
      <div className="pl-picker-list">
        {patterns.map((p) => (
          <button
            key={p.id}
            className={`pick${p.id === currentId ? ' is-on' : ''}`}
            style={{ '--c': p.color } as CSSProperties}
            data-hint="Click to draw this pattern in the playlist. Right-click for more."
            onClick={() => useStudio.getState().setCurrentPattern(p.id)}
            onDoubleClick={() => useStudio.getState().openWindow('channelRack')}
            onContextMenu={(e) => menu(e, p)}
          >
            <span className="swatch" />
            {p.name}
          </button>
        ))}
      </div>
    </aside>
  );
}

function drawGrid(canvas: HTMLCanvasElement | null, w: number, h: number, sx: number, sy: number, L: Live, playPos: number, sel: Rect | null) {
  const c = prepareCanvas(canvas, w, h);
  if (!c) return;
  const z = L.zoom;
  c.fillStyle = T.floor;
  c.fillRect(0, 0, w, h);
  const first = Math.floor(sy / TRACK_H);
  const last = Math.min(L.tracks.length - 1, Math.floor((sy + h) / TRACK_H));
  for (let t = first; t <= last; t++) {
    const y = t * TRACK_H - sy;
    if (L.tracks[t]?.muted) {
      c.fillStyle = 'rgba(6, 8, 12, 0.45)';
      c.fillRect(0, y, w, TRACK_H);
    }
    c.fillStyle = T.trackLine;
    c.fillRect(0, y + TRACK_H - 1, w, 1);
  }
  const unit = BEAT * z >= 10 ? BEAT : BAR;
  for (let t = Math.floor(sx / z / unit) * unit; t * z - sx <= w; t += unit) {
    const x = Math.round(t * z - sx);
    c.fillStyle = t % BAR === 0 ? (t % (4 * BAR) === 0 ? T.barLine : T.playlistBar) : T.playlistBeat;
    c.fillRect(x, 0, 1, h);
  }
  const end = L.songLen * z - sx;
  if (end < w && L.clips.length > 0) {
    c.fillStyle = 'rgba(6, 8, 12, 0.35)';
    c.fillRect(Math.max(0, end), 0, w - Math.max(0, end), h);
  }

  c.font = `600 10.5px ${T.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  for (const clip of L.clips) {
    const x = clip.pos * z - sx;
    const y = clip.track * TRACK_H - sy;
    const cw = Math.max(4, clip.len * z);
    if (x > w || x + cw < 0 || y > h || y + TRACK_H < 0) continue;
    const shape = L.shapes.get(clip.patternId);
    const color = shape?.pattern.color ?? T.text3;
    const muted = clip.muted || L.tracks[clip.track]?.muted;
    const selected = L.selection.has(clip.id);
    const top = y + 3;
    const ch = TRACK_H - 6;
    c.save();
    c.globalAlpha = muted ? 0.4 : 1;
    if (selected) {
      c.shadowColor = T.lampGlow;
      c.shadowBlur = 12;
    }
    c.beginPath();
    c.roundRect(x + 1, top, cw - 2, ch, 6);
    c.fillStyle = alpha(color, 0.13);
    c.fill();
    c.shadowBlur = 0;
    c.clip();
    c.fillStyle = color;
    c.fillRect(x, top, cw, 14);
    // The glint along the header, as on the steps and the windows.
    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.fillRect(x + 2, top, cw - 4, 1);
    if (cw > 24 && shape) {
      c.fillStyle = T.onColor;
      c.fillText(shape.pattern.name, x + 7, top + 7.5);
    }
    if (shape && shape.notes.length) {
      const range = Math.max(1, shape.hi - shape.lo);
      const bodyTop = top + 18;
      const bodyH = ch - 22;
      c.fillStyle = alpha(color, 0.85);
      // Patterns longer than the clip are cut; shorter ones leave empty space, as in FL Studio.
      for (const n of shape.notes) {
        if (n.pos < clip.offset || n.pos >= clip.offset + clip.len) continue;
        const nx = x + (n.pos - clip.offset) * z;
        const nw = Math.max(2, Math.min(n.len, clip.offset + clip.len - n.pos) * z - 0.5);
        const ny = shape.hi === shape.lo ? bodyTop + bodyH / 2 - 1 : bodyTop + ((shape.hi - n.key) / range) * (bodyH - 2);
        c.beginPath();
        c.roundRect(nx, ny, nw, 2, 1);
        c.fill();
      }
    }
    c.restore();
    c.save();
    c.globalAlpha = muted ? 0.4 : 1;
    c.lineWidth = selected ? 1.5 : 1;
    c.strokeStyle = selected ? T.lamp : alpha(color, 0.32);
    c.beginPath();
    c.roundRect(x + 1.5, top + 0.5, cw - 3, ch - 1, 6);
    c.stroke();
    c.restore();
  }

  if (sel) {
    const x = Math.min(sel.x0, sel.x1) - sx;
    const y = Math.min(sel.y0, sel.y1) - sy;
    c.fillStyle = 'rgba(120, 174, 255, 0.1)';
    c.fillRect(x, y, Math.abs(sel.x1 - sel.x0), Math.abs(sel.y1 - sel.y0));
    c.strokeStyle = T.accent;
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.abs(sel.x1 - sel.x0), Math.abs(sel.y1 - sel.y0));
    c.setLineDash([]);
  }
  if (playPos >= 0) drawPlayhead(c, Math.round(playPos * z - sx) + 0.5, h);
}

function drawRuler(canvas: HTMLCanvasElement | null, w: number, sx: number, L: Live, playPos: number) {
  const c = prepareCanvas(canvas, w, RULER_H);
  if (!c) return;
  const z = L.zoom;
  c.fillStyle = T.ruler;
  c.fillRect(0, 0, w, RULER_H);
  c.fillStyle = T.hair;
  c.fillRect(0, RULER_H - 1, w, 1);
  const barPx = BAR * z;
  const every = [1, 2, 4, 8, 16].find((n) => n * barPx >= 34) ?? 32;
  c.font = `600 11px ${T.font}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  for (let b = Math.floor(sx / barPx); b * barPx - sx <= w; b++) {
    const x = Math.round(b * barPx - sx);
    const labelled = b % every === 0;
    c.fillStyle = T.rulerLine;
    c.fillRect(x, labelled ? 6 : 15, 1, RULER_H);
    if (labelled) {
      c.fillStyle = b * BAR < L.songLen ? T.text2 : T.text3;
      c.fillText(String(b + 1), x + 6, 12);
    }
  }
  const sx0 = L.songStart * z - sx;
  if (sx0 >= -6 && sx0 <= w) {
    c.fillStyle = T.text2;
    c.beginPath();
    c.moveTo(sx0, RULER_H - 1);
    c.lineTo(sx0, RULER_H - 10);
    c.lineTo(sx0 + 6, RULER_H - 5.5);
    c.closePath();
    c.fill();
  }
  if (playPos >= 0) {
    const x = playPos * z - sx;
    c.save();
    c.fillStyle = T.lamp;
    c.shadowColor = T.lampGlow;
    c.shadowBlur = 6;
    c.beginPath();
    c.moveTo(x - 4.5, 0);
    c.lineTo(x + 4.5, 0);
    c.lineTo(x, 7);
    c.fill();
    c.restore();
  }
}
