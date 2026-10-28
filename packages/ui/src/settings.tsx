// Preferences and app state, kept in the library (not the webview's storage,
// which may not survive an app update). Changes apply at once and are saved
// in the background.

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { Backend, ModelChoice } from './backend.ts';
import { DEFAULT_FONTS, type FontSettings } from './fonts.ts';
import type { ThemeSetting } from './theme.tsx';

export interface Settings {
  theme: ThemeSetting;
  fonts: FontSettings;
  /** The library sidebar is open (wide windows). */
  libraryOpen: boolean;
  /** Ids of collapsed projects. */
  collapsed: string[];
  /** The article open last. */
  last: string | null;
  /** The first run's "What will you write?" was answered or skipped once; never asked again on its own. */
  welcomed: boolean;
  /** What the writer said they will write (a goal id from core's `GOALS`): the kind new articles start as. */
  goal: string | null;
  /** The model chosen for each role. */
  models: ModelChoice;
  /** Suggest the next sentence when a paragraph is missing one. */
  autocomplete: boolean;
  /** Fix typos as the writer types. */
  autocorrect: boolean;
  /** The writer said "not now" to setting up the AI: don't offer it at launch again. */
  setupSkipped: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fonts: DEFAULT_FONTS,
  libraryOpen: true,
  collapsed: [],
  last: null,
  welcomed: false,
  goal: null,
  models: {},
  autocomplete: true,
  autocorrect: true,
  setupSkipped: false,
};

interface SettingsValue {
  settings: Settings;
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export async function loadSettings(backend: Backend): Promise<Settings> {
  const stored = await backend.library.settings.all();
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key in stored) Object.assign(out, { [key]: stored[key] });
  }
  return out;
}

export function SettingsProvider({
  backend,
  initial,
  children,
}: {
  backend: Backend;
  initial: Settings;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState(initial);
  const set = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      backend.library.settings.set(key, value).catch((err) => console.error(`Couldn't save the ${key} setting`, err));
    },
    [backend],
  );
  const value = useMemo(() => ({ settings, set }), [settings, set]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const v = useContext(SettingsContext);
  if (!v) throw new Error('useSettings needs a SettingsProvider');
  return v;
}
