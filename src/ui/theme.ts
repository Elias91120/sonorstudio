/** Canvas colors; they mirror the tokens in styles/app.css. */
export const T = {
  gridBg: '#141922',
  /** The playlist grid lies on the workspace floor. */
  floor: '#0c0f14',
  ruler: '#151a23',
  rowBlack: 'rgba(0, 0, 0, 0.24)',
  trackLine: 'rgba(255, 255, 255, 0.045)',
  octaveLine: 'rgba(255, 255, 255, 0.13)',
  barLine: 'rgba(255, 255, 255, 0.13)',
  beatLine: 'rgba(255, 255, 255, 0.055)',
  stepLine: 'rgba(255, 255, 255, 0.022)',
  playlistBar: 'rgba(255, 255, 255, 0.09)',
  playlistBeat: 'rgba(255, 255, 255, 0.028)',
  hair: 'rgba(255, 255, 255, 0.07)',
  rulerLine: 'rgba(255, 255, 255, 0.14)',
  text: '#e6ebf2',
  text2: '#a3adbc',
  text3: '#838e9f',
  onColor: '#0e1116',
  lamp: '#eaf2ff',
  lampGlow: 'rgba(170, 205, 255, 0.5)',
  accent: '#78aeff',
  pastEnd: 'rgba(6, 8, 12, 0.5)',
  ghost: 'rgba(255, 255, 255, 0.2)',
  ivoryKey: '#dce2ea',
  ebonyKey: '#2a3039',
  keySeam: 'rgba(20, 28, 40, 0.22)',
  keyLabel: '#5a6472',
  font: '"Instrument Sans Variable", "Instrument Sans", system-ui, sans-serif',
};

/** `hex` moved `amount` (0..1) of the way to white: selected notes read lighter than their siblings. */
export function tint(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** A line of light with a soft glow: the only thing on the canvases that moves on its own. */
export function drawPlayhead(c: CanvasRenderingContext2D, x: number, h: number) {
  c.save();
  c.strokeStyle = T.lamp;
  c.shadowColor = T.lampGlow;
  c.shadowBlur = 8;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, 0);
  c.lineTo(x, h);
  c.stroke();
  c.restore();
}

/** `hex` with an alpha, for clip bodies and rings drawn in the pattern colour. */
export function alpha(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
