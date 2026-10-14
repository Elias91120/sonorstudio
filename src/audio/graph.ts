import { faderToGain, volToGain } from '../core/project';
import type { Channel, FxSlot, MixerTrack, Project } from '../core/types';
import { createFx, setParam, type FxNode } from './fx';

/** One mixer track: input, effect chain, pan, fader and optional stereo meter. */
export class MixerStrip {
  readonly input: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly fader: GainNode;
  private readonly analysers: AnalyserNode[] = [];
  private readonly meterData: Float32Array<ArrayBuffer> | null = null;
  private readonly fx = new Map<string, { node: FxNode; slot: FxSlot }>();
  private chainKey = '';
  private track: MixerTrack | null = null;
  private bpm = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    output: AudioNode,
    meterSink: AudioNode | null,
  ) {
    this.input = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.fader = ctx.createGain();
    this.input.connect(this.panner);
    this.panner.connect(this.fader);
    this.fader.connect(output);
    if (meterSink) {
      const split = ctx.createChannelSplitter(2);
      this.fader.connect(split);
      for (let i = 0; i < 2; i++) {
        const a = ctx.createAnalyser();
        a.fftSize = 1024;
        split.connect(a, i);
        // Analysers only run when something pulls them; a muted sink keeps them alive.
        a.connect(meterSink);
        this.analysers.push(a);
      }
      this.meterData = new Float32Array(1024);
    }
  }

  sync(t: MixerTrack, bpm: number) {
    if (t === this.track && bpm === this.bpm) return;
    const first = this.track === null;
    const ids = new Set(t.fx.map((f) => f.id));
    for (const [id, f] of this.fx) {
      if (!ids.has(id)) {
        f.node.dispose();
        this.fx.delete(id);
      }
    }
    for (const slot of t.fx) {
      const cur = this.fx.get(slot.id);
      if (!cur || cur.slot.type !== slot.type) {
        cur?.node.dispose();
        this.fx.set(slot.id, { node: createFx(this.ctx, slot, bpm), slot });
      } else if (cur.slot !== slot || bpm !== this.bpm) {
        cur.node.update(slot.params, bpm);
        cur.slot = slot;
      }
    }
    const key = t.fx
      .filter((f) => f.enabled)
      .map((f) => `${f.id}:${f.type}`)
      .join('|');
    if (key !== this.chainKey) {
      this.chainKey = key;
      this.rewire(t);
    }
    setParam(this.ctx, this.panner.pan, t.pan, first);
    setParam(this.ctx, this.fader.gain, t.muted ? 0 : faderToGain(t.volume), first);
    this.track = t;
    this.bpm = bpm;
  }

  private rewire(t: MixerTrack) {
    this.input.disconnect();
    for (const { node } of this.fx.values()) node.output.disconnect();
    let prev: AudioNode = this.input;
    for (const slot of t.fx) {
      const f = slot.enabled ? this.fx.get(slot.id) : undefined;
      if (!f) continue;
      prev.connect(f.node.input);
      prev = f.node.output;
    }
    prev.connect(this.panner);
  }

  /** Peak level per side since the last analyser window. */
  meter(): [number, number] {
    const data = this.meterData;
    if (!data || this.analysers.length < 2) return [0, 0];
    const out: [number, number] = [0, 0];
    for (let c = 0; c < 2; c++) {
      this.analysers[c].getFloatTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > peak) peak = a;
      }
      out[c] = peak;
    }
    return out;
  }
}

class ChannelStrip {
  /** Voices connect here. */
  readonly input: GainNode;
  private readonly volume: GainNode;
  private readonly panner: StereoPannerNode;
  private target = -1;
  private channel: Channel | null = null;

  constructor(private readonly ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.volume = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.input.connect(this.volume).connect(this.panner);
  }

  sync(ch: Channel, mixer: MixerStrip[]) {
    if (ch === this.channel) return;
    const first = this.channel === null;
    setParam(this.ctx, this.volume.gain, ch.muted ? 0 : volToGain(ch.volume), first);
    setParam(this.ctx, this.panner.pan, ch.pan, first);
    const target = Math.min(Math.max(0, ch.mixerTrack), mixer.length - 1);
    if (target !== this.target) {
      this.panner.disconnect();
      this.panner.connect(mixer[target].input);
      this.target = target;
    }
    this.channel = ch;
  }

  dispose() {
    this.input.disconnect();
    this.volume.disconnect();
    this.panner.disconnect();
  }
}

/** Mirrors the project's channels and mixer as Web Audio nodes. Works on live and offline contexts. */
export class AudioGraph {
  readonly mixer: MixerStrip[] = [];
  private readonly channels = new Map<string, ChannelStrip>();
  private readonly meterSink: GainNode | null = null;
  private project: Project | null = null;

  constructor(
    readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    opts: { meters: boolean },
  ) {
    if (opts.meters) {
      this.meterSink = ctx.createGain();
      this.meterSink.gain.value = 0;
      this.meterSink.connect(destination);
    }
  }

  sync(p: Project) {
    if (p === this.project) return;
    while (this.mixer.length < p.mixer.length) {
      const i = this.mixer.length;
      this.mixer.push(new MixerStrip(this.ctx, i === 0 ? this.destination : this.mixer[0].input, this.meterSink));
    }
    p.mixer.forEach((t, i) => this.mixer[i].sync(t, p.bpm));
    const ids = new Set<string>();
    for (const ch of p.channels) {
      ids.add(ch.id);
      let strip = this.channels.get(ch.id);
      if (!strip) {
        strip = new ChannelStrip(this.ctx);
        this.channels.set(ch.id, strip);
      }
      strip.sync(ch, this.mixer);
    }
    for (const [id, strip] of this.channels) {
      if (!ids.has(id)) {
        strip.dispose();
        this.channels.delete(id);
      }
    }
    this.project = p;
  }

  channelInput(id: string): AudioNode | null {
    return this.channels.get(id)?.input ?? null;
  }

  get master(): MixerStrip {
    return this.mixer[0];
  }
}
