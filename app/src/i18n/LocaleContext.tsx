import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, LOCALES, type Dict, type Locale } from './dictionaries';

const KEY = 'vik-locale';

function initial(): Locale {
  try {
    const saved = localStorage.getItem(KEY) as Locale | null;
    if (saved === 'en' || saved === 'fr' || saved === 'ar') return saved;
  } catch { /* private mode */ }
  return 'en';
}

interface LocaleCtx {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
  fmtDate: (iso: string | null, withTime?: boolean) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const dir = LOCALES.find((l) => l.code === locale)?.dir ?? 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(KEY, locale);
    } catch { /* ignore */ }
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const t = useCallback(
    (key: keyof Dict, vars?: Record<string, string | number>) => {
      let s: string = dictionaries[locale][key] ?? dictionaries.en[key] ?? String(key);
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );

  const fmtDate = useCallback(
    (iso: string | null, withTime = true) => {
      if (!iso) return t('match.noDeadline');
      try {
        return new Date(iso).toLocaleString(locale, withTime ? undefined : { dateStyle: 'medium' });
      } catch {
        return new Date(iso).toLocaleString();
      }
    },
    [locale, t],
  );

  const value = useMemo(() => ({ locale, dir, setLocale, t, fmtDate }), [locale, dir, setLocale, t, fmtDate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocale must be used inside LocaleProvider');
  return ctx;
}

export function statusLabel(t: LocaleCtx['t'], value: string): string {
  const key = `status.${value}` as keyof Dict;
  const s = dictionaries.en[key];
  return s ? t(key) : value.replace(/_/g, ' ');
}
