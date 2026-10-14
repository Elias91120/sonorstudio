/** Colors for user content (channels, patterns), tuned to sit on the warm dark console. */
export const CONTENT_COLORS = [
  '#e8705a',
  '#eea04c',
  '#dcc25b',
  '#a3c96c',
  '#62c08f',
  '#4fb7b5',
  '#5f9fd8',
  '#8b8fe2',
  '#b382d8',
  '#d67ba9',
  '#c8b59b',
  '#8ea4a6',
];

export function colorAt(index: number): string {
  const n = CONTENT_COLORS.length;
  return CONTENT_COLORS[((index % n) + n) % n];
}

export function nextColor(current: string): string {
  const i = CONTENT_COLORS.indexOf(current);
  return colorAt(i + 1);
}
