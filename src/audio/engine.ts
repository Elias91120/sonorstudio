import { DEFAULT_VEL, ROOT_KEY } from '../core/project';
import { secondsPerTick } from '../core/time';
import type { Channel, Project, SynthParams } from '../core/types';
import { useStudio, type StudioState } from '../state/store';
import { AudioGraph } from './graph';
import { getSound, loadSounds } from './soundBank';
import { buildPatternTimeline, buildSongTimeline, collectWindow, type Timeline } from './timeline';
import { userSamplesReady } from './userSamples';
import { playSample, playSynth, triggerNote, type TriggerTarget, type Voice } from './voices';

/** How far ahead notes are scheduled, in seconds. */
const LOOKAHEAD = 0.12;
const TICK_MS = 25;

/** A worker keeps the scheduler ticking when the tab is in the background. */
function makeTimer(onTick: () => void): Worker {
  const src = `let t=null;onmessage=e=>{if(e.data==='start'){if(t===null)t=setInterval(()=>postMessage(0),${TICK_MS})}else{clearInterval(t);t=null}}`;
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = onTick;
  return worker;
}

class Engine {
  ctx: AudioContext | null = null;
  graph: AudioGraph | null = null;
  private timer: Worker | null = null;
  private readonly voices = new Set<Voice>();
  private readonly lastVoice = new Map<string, Voice>();
  private readonly live = new Map<string, Voice>();
  private preview: Voice | null = null;

  private playing = false;
  private bpm = 120;
  /** Playback clock: tick `anchorTick` sounds at context time `anchorTime`. */
  private anchorTime = 0;
  private anchorTick = 0;
  /** Unwrapped tick up to which notes are scheduled, and the loop position there. */
  private nextTick = 0;
  private local = 0;
  /** Loop position at given unwrapped ticks, to map the clock back to a position. */
  private segments: { u: number; local: number }[] = [];

  private timeline: Timeline | null = null;
  private timelineProject: Project | null = null;
  private timelineKey = '';
  private channelsRef: Channel[] | null = null;
  private channelMap = new Map<string, Channel>();

  /** Creates or resumes the audio context. Browsers only allow this from a user gesture. */
  async ensureAudio(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.graph = new AudioGraph(ctx, ctx.destination, { meters: true });
      this.graph.sync(useStudio.getState().project);
      useStudio.subscribe((s, prev) => this.onState(s, prev));
      this.timer = makeTimer(() => this.pump());
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    // Imported sounds usually decode within a moment; a slow or stuck disk must not hold the transport.
    await Promise.all([loadSounds(), userSamplesReady(1500)]);
  }

  private onState(s: StudioState, prev: StudioState) {
    if (s.project !== prev.project) {
      this.graph?.sync(s.project);
      if (s.project.bpm !== prev.project.bpm) this.setTempo(s.project.bpm);
    }
    if (!this.playing) return;
    if (s.mode !== prev.mode || (s.mode === 'song' && s.songStart !== prev.songStart)) this.restart();
  }

  get isPlaying() {
    return this.playing;
  }

  async play() {
    await this.ensureAudio();
    const ctx = this.ctx;
    if (this.playing || !ctx) return;
    const st = useStudio.getState();
    this.bpm = st.project.bpm;
    this.timeline = null;
    const tl = this.currentTimeline(st);
    const start = st.mode === 'song' ? Math.min(st.songStart, tl.length - 1) : 0;
    this.anchorTime = ctx.currentTime + 0.05;
    this.anchorTick = 0;
    this.nextTick = 0;
    this.local = start;
    this.segments = [{ u: 0, local: start }];
    this.playing = true;
    useStudio.setState({ playing: true });
    this.timer?.postMessage('start');
    this.pump();
  }

  stop() {
    this.playing = false;
    this.timer?.postMessage('stop');
    const now = this.ctx?.currentTime ?? 0;
    for (const v of this.voices) v.kill(now);
    this.voices.clear();
    this.lastVoice.clear();
    if (useStudio.getState().playing) useStudio.setState({ playing: false });
  }

  togglePlay() {
    if (this.playing) this.stop();
    else void this.play();
  }

  private restart() {
    this.stop();
    void this.play();
  }

  private setTempo(bpm: number) {
    if (this.playing) {
      // Re-anchor at the scheduling horizon so already scheduled notes keep their timing.
      this.anchorTime = this.tickToTime(this.nextTick);
      this.anchorTick = this.nextTick;
    }
    this.bpm = bpm;
  }

  private tickToTime(u: number) {
    return this.anchorTime + (u - this.anchorTick) * secondsPerTick(this.bpm);
  }

  private timeToTick(t: number) {
    return this.anchorTick + (t - this.anchorTime) / secondsPerTick(this.bpm);
  }

  private currentTimeline(st: StudioState): Timeline {
    const key = st.mode === 'song' ? 'song' : `pattern:${st.currentPatternId}`;
    if (!this.timeline || this.timelineProject !== st.project || this.timelineKey !== key) {
      this.timeline = st.mode === 'song' ? buildSongTimeline(st.project) : buildPatternTimeline(st.project, st.currentPatternId);
      this.timelineProject = st.project;
      this.timelineKey = key;
    }
    return this.timeline;
  }

  private channels(project: Project): Map<string, Channel> {
    if (this.channelsRef !== project.channels) {
      this.channelsRef = project.channels;
      this.channelMap = new Map(project.channels.map((c) => [c.id, c]));
    }
    return this.channelMap;
  }

  private target(): TriggerTarget | null {
    if (!this.ctx || !this.graph) return null;
    return { ctx: this.ctx, graph: this.graph, lastVoice: this.lastVoice, voices: this.voices };
  }

  private pump() {
    const ctx = this.ctx;
    const target = this.target();
    if (!this.playing || !ctx || !target) return;
    const st = useStudio.getState();
    const tl = this.currentTimeline(st);
    const now = ctx.currentTime;
    const until = this.timeToTick(now + LOOKAHEAD);
    if (until > this.nextTick) {
      const w = collectWindow(tl, this.local, until - this.nextTick);
      for (const off of w.wraps) this.segments.push({ u: this.nextTick + off, local: 0 });
      if (this.segments.length > 8) this.segments.splice(0, this.segments.length - 8);
      const channels = this.channels(st.project);
      const spt = secondsPerTick(this.bpm);
      for (const h of w.hits) {
        const ch = channels.get(h.event.channelId);
        if (!ch) continue;
        const at = Math.max(now, this.tickToTime(this.nextTick + h.at));
        triggerNote(target, ch, h.event.key, h.event.vel, at, h.event.len * spt);
      }
      this.nextTick = until;
      this.local = w.local;
    }
    for (const v of this.voices) if (v.end < now) this.voices.delete(v);
  }

  /** Current position in the playing pattern or song, in ticks. */
  position(): number {
    const st = useStudio.getState();
    if (!this.playing || !this.ctx) return st.mode === 'song' ? st.songStart : 0;
    const u = this.timeToTick(this.ctx.currentTime);
    let seg = this.segments[0];
    for (const s of this.segments) {
      if (s.u <= u) seg = s;
      else break;
    }
    const len = this.timeline?.length ?? 1;
    return (seg.local + Math.max(0, u - seg.u)) % len;
  }

  /** Position inside the given pattern if it is audible right now, else -1. */
  patternPosition(patternId: string): number {
    if (!this.playing) return -1;
    const st = useStudio.getState();
    const pos = this.position();
    if (st.mode === 'pattern') return st.currentPatternId === patternId ? pos : -1;
    for (const c of st.project.clips) {
      if (c.patternId === patternId && !c.muted && pos >= c.pos && pos < c.pos + c.len) return pos - c.pos + c.offset;
    }
    return -1;
  }

  /** Plays a channel live (typing keyboard, MIDI, piano roll keys). */
  noteOn(channelId: string, key: number, vel = DEFAULT_VEL) {
    const target = this.target();
    if (!target || !this.ctx) return;
    const ch = useStudio.getState().project.channels.find((c) => c.id === channelId);
    if (!ch) return;
    const id = `${channelId}:${key}`;
    this.live.get(id)?.release(this.ctx.currentTime);
    const v = triggerNote(target, ch, key, vel, this.ctx.currentTime, null);
    if (v) this.live.set(id, v);
    else this.live.delete(id);
  }

  noteOff(channelId: string, key: number) {
    const id = `${channelId}:${key}`;
    const v = this.live.get(id);
    if (!v || !this.ctx) return;
    v.release(this.ctx.currentTime);
    this.live.delete(id);
  }

  /** A short note, as feedback for a click. */
  tap(channelId: string, key = ROOT_KEY, ms = 180) {
    this.noteOn(channelId, key);
    setTimeout(() => this.noteOff(channelId, key), ms);
  }

  /** Short audition of a library sound or synth preset, straight to the master track. */
  previewSound(soundId: string) {
    const buf = getSound(soundId);
    if (!this.ctx || !this.graph || !buf) return;
    const now = this.ctx.currentTime;
    this.preview?.kill(now);
    this.preview = playSample(this.ctx, buf, this.graph.master.input, now, 1, 0.8);
  }

  previewSynth(params: SynthParams, key = ROOT_KEY) {
    if (!this.ctx || !this.graph) return;
    const now = this.ctx.currentTime;
    this.preview?.kill(now);
    this.preview = playSynth(this.ctx, params, this.graph.master.input, now, key, DEFAULT_VEL);
    this.preview.release(now + 0.45);
  }

  meter(track: number): [number, number] {
    return this.graph?.mixer[track]?.meter() ?? [0, 0];
  }
}

export const engine = new Engine();
