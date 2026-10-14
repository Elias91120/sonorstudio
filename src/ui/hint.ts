import { create } from 'zustand';

/** The hint bar text: what's under the pointer, or the value being changed. */
export const useHint = create<{ text: string }>(() => ({ text: '' }));

export function setHint(text: string) {
  if (useHint.getState().text !== text) useHint.setState({ text });
}
