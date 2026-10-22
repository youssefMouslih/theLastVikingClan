import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { pushStatus, subscribePush, unsubscribePush, needsInstallFirst } from '../services/pushService';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemePref } from '../theme';

// App settings: language + appearance.
const THEMES: { code: ThemePref; icon: 'swords' | 'clock' | 'check'; labelKey: 'settings.system' | 'settings.dark' | 'settings.light' }[] = [
  { code: 'system', icon: 'swords', labelKey: 'settings.system' },
  { code: 'dark', icon: 'clock', labelKey: 'settings.dark' },
  { code: 'light', icon: 'check', labelKey: 'settings.light' },
];

export default function SettingsPage() {
  const { t, locale, setLocale , tError} = useLocale();
  const { pref, setPref } = useTheme();
  const me = useAuthStore((s) => s.profile);
  const [push, setPush] = useState<'on' | 'off' | 'unsupported' | 'no-key' | 'install-first' | 'checking'>('checking');
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const installState = useInstallPrompt();
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    if (needsInstallFirst()) {
      setPush('install-first');
      return;
    }
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
      setPushMsg(tError(err));
    } finally {
      setPushBusy(false);
    }
  }

  const pushNote = push === 'no-key'
    ? t('push.nokey')
    : push === 'install-first'
      ? t('push.needInstall')
      : push === 'unsupported'
        ? t('push.off')
        : null;

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
        {pushNote ? (
          <p role="status" className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs opacity-80">{pushNote}</p>
        ) : (
          <button
            disabled={pushBusy || push === 'checking'}
            onClick={togglePush}
            className={push === 'on' ? 'btn-ghost mt-2 h-11 w-full text-sm' : 'btn-primary mt-2 h-11 w-full text-sm'}
          >
            {pushBusy || push === 'checking' ? t('common.loading') : push === 'on' ? t('push.disable') : t('push.enable')}
          </button>
        )}
        {push === 'on' && <p className="mt-1 text-xs font-bold text-green-700 dark:text-green-400">{t('push.on')}</p>}
      </section>

      <section className="card mt-3" aria-label={t('install.title')}>
        <h2 className="card-title flex items-center gap-1"><Icon name="shield" className="h-4 w-4" /> {t('install.title')}</h2>
        <p className="mt-1 text-xs opacity-70">{t('install.desc')}</p>
        {installState.installed ? (
          <p className="mt-2 text-sm font-bold text-green-400">{t('install.done')}</p>
        ) : installState.canInstall ? (
          <button
            disabled={installBusy}
            onClick={async () => { setInstallBusy(true); try { await installState.install(); } finally { setInstallBusy(false); } }}
            className="btn-primary mt-2 h-11 w-full text-sm"
          >
            {installBusy ? t('common.loading') : t('install.button')}
          </button>
        ) : installState.ios ? (
          <ol className="mt-2 flex flex-col gap-1 text-xs">
            <li><b>1.</b> {t('install.ios1')}</li>
            <li><b>2.</b> {t('install.ios2')}</li>
            <li><b>3.</b> {t('install.ios3')}</li>
          </ol>
        ) : (
          <ol className="mt-2 flex flex-col gap-1 text-xs">
            <li><b>1.</b> {t('install.android1')}</li>
            <li><b>2.</b> {t('install.android2')}</li>
          </ol>
        )}
      </section>

      <Link to="/profile" className="btn-ghost mt-3 w-full">{t('settings.back')}</Link>
      <BottomNav />
    </main>
  );
}
