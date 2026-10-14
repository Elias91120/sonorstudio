import { patternLength, songLength } from '../core/project';
import { BAR, STEP } from '../core/time';
import type { Project } from '../core/types';

export interface TLEvent {
  tick: number;
  channelId: string;
  key: number;
  vel: number;
  len: number;
}

/** Events sorted by tick, looping every `length` ticks. */
export interface Timeline {
  events: TLEvent[];
  length: number;
}

/** Swing delays the notes that sit exactly on every second step. */
export function swingOffset(pos: number, swing: number): number {
  return swing > 0 && pos % (STEP * 2) === STEP ? swing * STEP * 0.5 : 0;
}

const byTick = (a: TLEvent, b: TLEvent) => a.tick - b.tick;

export function buildPatternTimeline(project: Project, patternId: string): Timeline {
  const p = project.patterns.find((x) => x.id === patternId);
  if (!p) return { events: [], length: BAR };
  const events: TLEvent[] = [];
  for (const [channelId, notes] of Object.entries(p.notes)) {
    for (const n of notes) {
      events.push({ tick: n.pos + swingOffset(n.pos, project.swing), channelId, key: n.key, vel: n.vel, len: n.len });
    }
  }
  events.sort(byTick);
  return { events, length: patternLength(p) };
}

export function buildSongTimeline(project: Project): Timeline {
  const patterns = new Map(project.patterns.map((p) => [p.id, p]));
  const events: TLEvent[] = [];
  for (const c of project.clips) {
    if (c.muted || project.tracks[c.track]?.muted) continue;
    const p = patterns.get(c.patternId);
    if (!p) continue;
    const end = c.offset + c.len;
    for (const [channelId, notes] of Object.entries(p.notes)) {
      for (const n of notes) {
        if (n.pos < c.offset || n.pos >= end) continue;
        events.push({
          tick: c.pos + n.pos - c.offset + swingOffset(n.pos, project.swing),
          channelId,
          key: n.key,
          vel: n.vel,
          len: Math.min(n.len, end - n.pos),
        });
      }
    }
  }
  events.sort(byTick);
  return { events, length: songLength(project.clips) };
}

/** Index of the first event at or after `tick`. */
export function lowerBound(events: TLEvent[], tick: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].tick < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface WindowHit {
  event: TLEvent;
  /** Ticks from the start of the window. */
  at: number;
}

export interface WindowResult {
  hits: WindowHit[];
  /** Position in the loop after the window. */
  local: number;
  /** Offsets from the window start where playback wrapped back to 0. */
  wraps: number[];
}

/** Collects the events heard during `span` ticks of looped playback starting at `local`. */
export function collectWindow(tl: Timeline, local: number, span: number): WindowResult {
  const hits: WindowHit[] = [];
  const wraps: number[] = [];
  if (tl.length <= 0 || !(span > 0)) return { hits, local, wraps };
  let pos = local;
  if (pos >= tl.length) {
    pos = 0;
    wraps.push(0);
  }
  // Count down what is left rather than adding up what is done: with fractional ticks the sum
  // can stall just below `span` (pos + tiny === pos) and never end.
  let remaining = span;
  while (remaining > 0) {
    const room = tl.length - pos;
    const take = Math.min(room, remaining);
    const offset = span - remaining;
    const end = pos + take;
    for (let i = lowerBound(tl.events, pos); i < tl.events.length && tl.events[i].tick < end; i++) {
      hits.push({ event: tl.events[i], at: offset + tl.events[i].tick - pos });
    }
    remaining -= take;
    if (take === room) {
      pos = 0;
      wraps.push(span - remaining);
    } else {
      pos = end;
    }
  }
  return { hits, local: pos, wraps };
}
