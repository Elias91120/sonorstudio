import { secondsPerTick } from '../core/time';
import type { Project } from '../core/types';
import { AudioGraph } from './graph';
import { loadSounds } from './soundBank';
import { buildPatternTimeline, buildSongTimeline } from './timeline';
import { loadUserSamples } from './userSamples';
import { triggerNote, type Voice } from './voices';

const SAMPLE_RATE = 44100;
/** Room for reverb and delay tails after the last bar. */
const TAIL = 3;

export async function renderProject(project: Project, mode: 'pattern' | 'song', patternId: string): Promise<AudioBuffer> {
  await Promise.all([loadSounds(), loadUserSamples()]);
  const tl = mode === 'song' ? buildSongTimeline(project) : buildPatternTimeline(project, patternId);
  const spt = secondsPerTick(project.bpm);
  const ctx = new OfflineAudioContext(2, Math.ceil((tl.length * spt + TAIL) * SAMPLE_RATE), SAMPLE_RATE);
  const graph = new AudioGraph(ctx, ctx.destination, { meters: false });
  graph.sync(project);
  const channels = new Map(project.channels.map((c) => [c.id, c]));
  const target = { ctx, graph, lastVoice: new Map<string, Voice>() };
  for (const ev of tl.events) {
    const ch = channels.get(ev.channelId);
    if (ch) triggerNote(target, ch, ev.key, ev.vel, 0.01 + ev.tick * spt, ev.len * spt);
  }
  return ctx.startRendering();
}

export function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

/** 16-bit PCM WAV. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerFrame = channels * 2;
  const data = new ArrayBuffer(44 + frames * bytesPerFrame);
  const view = new DataView(data);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * bytesPerFrame, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * bytesPerFrame, true);
  const planes = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, planes[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([data], { type: 'audio/wav' });
}
