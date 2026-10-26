// The writing and reading fonts. Bundled with the app, so they work offline
// and never ask a font server for anything.
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/literata';
import '@fontsource-variable/lora';
import '@fontsource-variable/newsreader';
import '@fontsource-variable/source-serif-4';

export interface FontChoice {
  id: string;
  label: string;
  group: 'Serif' | 'Sans' | 'Mono';
  stack: string;
}

const SERIF = 'Charter, "Iowan Old Style", Georgia, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export const FONTS: FontChoice[] = [
  { id: 'source-serif', label: 'Source Serif', group: 'Serif', stack: `"Source Serif 4 Variable", ${SERIF}` },
  { id: 'literata', label: 'Literata', group: 'Serif', stack: `"Literata Variable", ${SERIF}` },
  { id: 'newsreader', label: 'Newsreader', group: 'Serif', stack: `"Newsreader Variable", ${SERIF}` },
  { id: 'lora', label: 'Lora', group: 'Serif', stack: `"Lora Variable", ${SERIF}` },
  { id: 'inter', label: 'Inter', group: 'Sans', stack: `"Inter Variable", ${SANS}` },
  { id: 'plex-sans', label: 'IBM Plex Sans', group: 'Sans', stack: `"IBM Plex Sans Variable", ${SANS}` },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    group: 'Sans',
    stack: `"Atkinson Hyperlegible Next Variable", ${SANS}`,
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    group: 'Mono',
    stack: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
];

export interface FontSettings {
  write: string;
  read: string;
}

export const DEFAULT_FONTS: FontSettings = { write: 'source-serif', read: 'source-serif' };

export const fontStack = (id: string) => (FONTS.find((f) => f.id === id) ?? FONTS[0]!).stack;

export function applyFonts(fonts: FontSettings) {
  const root = document.documentElement.style;
  root.setProperty('--f-write', fontStack(fonts.write));
  root.setProperty('--f-read', fontStack(fonts.read));
}
