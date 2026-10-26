import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeSetting = 'light' | 'dark' | 'system';

interface ThemeValue {
  theme: ThemeSetting;
  resolved: 'light' | 'dark';
  setTheme(theme: ThemeSetting): void;
}

const ThemeContext = createContext<ThemeValue>({ theme: 'system', resolved: 'light', setTheme() {} });

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** Light, dark, or whatever the system says; the `dark` class on <html> does the rest. */
export function ThemeProvider({
  theme,
  onChange,
  children,
}: {
  theme: ThemeSetting;
  onChange(theme: ThemeSetting): void;
  children: ReactNode;
}) {
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const q = darkQuery();
    if (!q) return;
    const update = () => setSystemDark(q.matches);
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const value = useMemo(() => ({ theme, resolved, setTheme: onChange }), [theme, resolved, onChange]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
