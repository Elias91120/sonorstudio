/** Colors for user content (channels, patterns, clips, notes), balanced to sit on the slate glass. */
export const CONTENT_COLORS = [
  '#f26d5f',
  '#f39a4c',
  '#ebc652',
  '#a8d15e',
  '#5ecf9e',
  '#4ec8d6',
  '#5faef5',
  '#8a8df5',
  '#b88af2',
  '#ec82cf',
  '#f57da6',
  '#a2b1c2',
];

/** The first palette, from before the redesign: saved projects still carry these. */
const LEGACY_COLORS: Record<string, string> = {
  '#e8705a': '#f26d5f',
  '#eea04c': '#f39a4c',
  '#dcc25b': '#ebc652',
  '#a3c96c': '#a8d15e',
  '#62c08f': '#5ecf9e',
  '#4fb7b5': '#4ec8d6',
  '#5f9fd8': '#5faef5',
  '#8b8fe2': '#8a8df5',
  '#b382d8': '#b88af2',
  '#d67ba9': '#ec82cf',
  '#c8b59b': '#a2b1c2',
  '#8ea4a6': '#a2b1c2',
};

export const migrateColor = (color: string) => LEGACY_COLORS[color.toLowerCase()] ?? color;

export function colorAt(index: number): string {
  const n = CONTENT_COLORS.length;
  return CONTENT_COLORS[((index % n) + n) % n];
}

export function nextColor(current: string): string {
  const i = CONTENT_COLORS.indexOf(current);
  return colorAt(i + 1);
}
