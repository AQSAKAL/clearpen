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
  /** How tall its lowercase x is, in ems (measured on the bundled file). At the same size, a taller x reads bigger. */
  xHeight: number;
}

const SERIF = 'Charter, "Iowan Old Style", Georgia, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export const FONTS: FontChoice[] = [
  {
    id: 'source-serif',
    label: 'Source Serif',
    group: 'Serif',
    stack: `"Source Serif 4 Variable", ${SERIF}`,
    xHeight: 0.492,
  },
  { id: 'literata', label: 'Literata', group: 'Serif', stack: `"Literata Variable", ${SERIF}`, xHeight: 0.507 },
  { id: 'newsreader', label: 'Newsreader', group: 'Serif', stack: `"Newsreader Variable", ${SERIF}`, xHeight: 0.441 },
  { id: 'lora', label: 'Lora', group: 'Serif', stack: `"Lora Variable", ${SERIF}`, xHeight: 0.5 },
  { id: 'inter', label: 'Inter', group: 'Sans', stack: `"Inter Variable", ${SANS}`, xHeight: 0.546 },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    group: 'Sans',
    stack: `"IBM Plex Sans Variable", ${SANS}`,
    xHeight: 0.516,
  },
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    group: 'Sans',
    stack: `"Atkinson Hyperlegible Next Variable", ${SANS}`,
    xHeight: 0.496,
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    group: 'Mono',
    stack: '"JetBrains Mono Variable", ui-monospace, monospace',
    xHeight: 0.55,
  },
];

export interface FontSettings {
  write: string;
  read: string;
}

export const DEFAULT_FONTS: FontSettings = { write: 'source-serif', read: 'source-serif' };

const font = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0]!;

export const fontStack = (id: string) => font(id).stack;

/** How much to scale a font so its lowercase is as tall as Source Serif's: every font then reads at the same size. */
export const fontScale = (id: string) => Math.round((FONTS[0]!.xHeight / font(id).xHeight) * 1000) / 1000;

export function applyFonts(fonts: FontSettings) {
  const root = document.documentElement.style;
  root.setProperty('--f-write', fontStack(fonts.write));
  root.setProperty('--f-read', fontStack(fonts.read));
  root.setProperty('--f-write-scale', String(fontScale(fonts.write)));
  root.setProperty('--f-read-scale', String(fontScale(fonts.read)));
}
