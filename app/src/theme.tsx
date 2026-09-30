import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'vik-theme';

function systemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

function initial(): ThemePref {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'dark' || s === 'light' || s === 'system') return s;
  } catch { /* ignore */ }
  return 'system';
}

const Ctx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(initial);

  useEffect(() => {
    const apply = () => {
      const dark = pref === 'system' ? systemDark() : pref === 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    try {
      localStorage.setItem(KEY, pref);
    } catch { /* ignore */ }
    if (pref !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => setPrefState(p), []);
  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
