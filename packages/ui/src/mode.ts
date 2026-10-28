// The open article's writing mode: which aids are on, how the review reads,
// and whether a guided template comes with it.

import { type Mode, modeOf } from '@clearpen/core';
import { useLibrary } from './library.tsx';

export function useMode(): Mode {
  const { current } = useLibrary();
  return modeOf(current?.brief);
}
