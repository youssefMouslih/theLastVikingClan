import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { pushStatus, subscribePush, unsubscribePush } from '../services/pushService';
import { useAuthStore } from '../stores/authStore';
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
  const me = useAuthStore((s) => s.profile);
  const [push, setPush] = useState<'on' | 'off' | 'unsupported' | 'no-key' | 'checking'>('checking');
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (me) pushStatus(me.id).then(setPush).catch(() => setPush('off'));
  }, [me]);

  async function togglePush() {
    if (!me) return;
    setPushBusy(true); setPushMsg(null);
    try {
      if (push === 'on') {
        await unsubscribePush(me.id);
        setPush('off');
      } else {
        await subscribePush(me.id);
        setPush('on');
      }
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setPushBusy(false);
    }
  }

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

      <section className="card mt-3" aria-label={t('push.title')}>
        <h2 className="card-title flex items-center gap-1"><Icon name="bell" className="h-4 w-4" /> {t('push.title')}</h2>
        <p className="mt-1 text-xs opacity-70">{t('push.desc')}</p>
        {pushMsg && <p className="mt-1 text-xs">{pushMsg}</p>}
        <button
          disabled={pushBusy || push === 'checking' || push === 'unsupported' || push === 'no-key'}
          onClick={togglePush}
          className={push === 'on' ? 'btn-ghost mt-2 h-11 w-full text-sm' : 'btn-primary mt-2 h-11 w-full text-sm'}
        >
          {pushBusy ? t('common.loading') : push === 'on' ? t('push.disable') : push === 'no-key' ? t('push.nokey') : push === 'unsupported' ? t('push.off') : t('push.enable')}
        </button>
        {push === 'on' && <p className="mt-1 text-xs font-bold text-green-400">{t('push.on')}</p>}
      </section>

      <Link to="/profile" className="btn-ghost mt-3 w-full">{t('settings.back')}</Link>
      <BottomNav />
    </main>
  );
}
