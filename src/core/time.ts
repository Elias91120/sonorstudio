/** Ticks per quarter note (FL Studio's default resolution). */
export const PPQ = 96;
export const STEP = PPQ / 4;
export const BEAT = PPQ;
export const BAR = PPQ * 4;
export const STEPS_PER_BAR = BAR / STEP;

export const secondsPerTick = (bpm: number) => 60 / bpm / PPQ;

export const snapFloor = (tick: number, snap: number) => Math.floor(tick / snap) * snap;
export const snapRound = (tick: number, snap: number) => Math.round(tick / snap) * snap;
export const ceilTo = (tick: number, unit: number) => Math.ceil(tick / unit) * unit;

/** Song position as bar:beat:step, 1-based. */
export function formatPosition(tick: number): string {
  const t = Math.max(0, Math.floor(tick));
  const bar = Math.floor(t / BAR) + 1;
  const beat = Math.floor((t % BAR) / BEAT) + 1;
  const step = Math.floor((t % BEAT) / STEP) + 1;
  return `${bar}:${beat}:${step}`;
}

export interface SnapOption {
  label: string;
  ticks: number;
}

export const SNAP_OPTIONS: SnapOption[] = [
  { label: 'No snap', ticks: 1 },
  { label: '1/6 step', ticks: STEP / 6 },
  { label: '1/4 step', ticks: STEP / 4 },
  { label: '1/3 step', ticks: STEP / 3 },
  { label: '1/2 step', ticks: STEP / 2 },
  { label: 'Step', ticks: STEP },
  { label: '1/2 beat', ticks: BEAT / 2 },
  { label: 'Beat', ticks: BEAT },
  { label: 'Bar', ticks: BAR },
];
