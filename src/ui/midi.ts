import { engine } from '../audio/engine';
import { useStudio } from '../state/store';

let access: MIDIAccess | null = null;

function onMessage(e: MIDIMessageEvent) {
  const data = e.data;
  const channelId = useStudio.getState().selectedChannelId;
  if (!data || data.length < 3 || !channelId) return;
  const cmd = data[0] & 0xf0;
  if (cmd === 0x90 && data[2] > 0) engine.noteOn(channelId, data[1], data[2] / 127);
  else if (cmd === 0x80 || cmd === 0x90) engine.noteOff(channelId, data[1]);
}

/** Asks for MIDI access and plays the selected channel from every connected input. Returns the input count. */
export async function enableMidi(): Promise<number> {
  if (!navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI support. Try Chrome or Edge.');
  access ??= await navigator.requestMIDIAccess();
  const bind = () => access?.inputs.forEach((input) => (input.onmidimessage = onMessage));
  bind();
  access.onstatechange = bind;
  return access.inputs.size;
}
