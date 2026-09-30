import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { useTheme, type ThemePref } from '../theme';

// App settings: language + appearance.
const THEMES: { code: ThemePref; icon: 'swords' | 'clock' | 'check'; labelKey: 'settings.system' | 'settings.dark' | 'settings.light' }[] = [
  { code: 'system', icon: 'swords', labelKey: 'settings.system' },
  { code: 'dark', icon: 'clock', labelKey: 'settings.dark' },
  { code: 'light', icon: 'check', labelKey: 'settings.light' },
];

export default function SettingsPage() {
  const { t, locale, setLocale } = useLocale();
  const { pref, setPref } = useTheme();

  return (
    <main className="page">
      <h1 className="font-display flex items-center gap-2 text-xl tracking-wide">
        <Icon name="shield" className="h-6 w-6 text-brand-400" /> {t('settings.title')}
      </h1>

      <section className="card mt-3" aria-label={t('settings.language')}>
        <h2 className="card-title">{t('settings.language')}</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={locale === l.code ? 'btn-primary h-11 text-sm' : 'btn-ghost h-11 text-sm'}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-3" aria-label={t('settings.theme')}>
        <h2 className="card-title">{t('settings.theme')}</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {THEMES.map((th) => (
            <button
              key={th.code}
              type="button"
              onClick={() => setPref(th.code)}
              className={pref === th.code ? 'btn-primary h-11 text-sm' : 'btn-ghost h-11 text-sm'}
            >
              {t(th.labelKey)}
            </button>
          ))}
        </div>
      </section>

      <Link to="/profile" className="btn-ghost mt-3 w-full">{t('settings.back')}</Link>
      <BottomNav />
    </main>
  );
}
