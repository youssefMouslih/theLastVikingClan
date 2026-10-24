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
const THEMES: { code: ThemePref; icon: 'monitor' | 'moon' | 'sun'; labelKey: 'settings.system' | 'settings.dark' | 'settings.light' }[] = [
  { code: 'system', icon: 'monitor', labelKey: 'settings.system' },
  { code: 'dark', icon: 'moon', labelKey: 'settings.dark' },
  { code: 'light', icon: 'sun', labelKey: 'settings.light' },
];

export default function SettingsPage() {
  const { t, locale, setLocale, tError } = useLocale();
  const { pref, setPref } = useTheme();
  const me = useAuthStore((s) => s.profile);
  const [push, setPush] = useState<'on' | 'off' | 'unsupported' | 'no-key' | 'install-first' | 'checking' | 'error'>(
    () => needsInstallFirst() ? 'install-first' : 'checking',
  );
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushRefresh, setPushRefresh] = useState(0);
  const installState = useInstallPrompt();
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    if (!me || needsInstallFirst()) return;
    let active = true;
    pushStatus(me.id)
      .then((status) => { if (active) setPush(status); })
      .catch((err: unknown) => {
        if (!active) return;
        setPush('error');
        setPushMsg(tError(err));
      });
    return () => { active = false; };
  }, [me, pushRefresh, tError]);

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
    <main className="page max-w-4xl">
      <header className="mb-5 flex flex-col gap-3 border-b border-(--border) pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-400">{me?.username}</p>
          <h1 className="font-display flex items-center gap-2 text-2xl tracking-wide">
            <Icon name="gear" className="h-6 w-6 text-brand-400" /> {t('settings.title')}
          </h1>
        </div>
        <Link to="/profile" className="btn-ghost self-start gap-2 text-sm sm:shrink-0">
          <Icon name="user" className="h-4 w-4" /> {t('settings.back')}
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card" aria-labelledby="settings-language-title">
          <div className="mb-4 flex items-start gap-3 border-b border-(--border) pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-2) text-brand-400">
              <Icon name="chat" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-language-title" className="card-title">{t('settings.language')}</h2>
              <p className="mt-1 text-xs text-(--muted)">{LOCALES.find((l) => l.code === locale)?.label}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                aria-pressed={locale === l.code}
                onClick={() => setLocale(l.code)}
                className={locale === l.code ? 'btn-primary min-h-12 text-sm' : 'btn-ghost min-h-12 text-sm'}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="settings-theme-title">
          <div className="mb-4 flex items-start gap-3 border-b border-(--border) pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-2) text-brand-400">
              <Icon name="sun" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-theme-title" className="card-title">{t('settings.theme')}</h2>
              <p className="mt-1 text-xs text-(--muted)">{t(THEMES.find((theme) => theme.code === pref)?.labelKey ?? 'settings.system')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((theme) => {
              const selected = pref === theme.code;
              return (
                <button
                  key={theme.code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPref(theme.code)}
                  className={`${selected ? 'border-brand-400 bg-brand-500/10 text-brand-300' : 'border-(--border) bg-transparent text-(--text) hover:bg-(--surface-2)'} flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-xs font-bold transition-colors active:scale-[0.98]`}
                >
                  <Icon name={theme.icon} className="h-5 w-5" />
                  {t(theme.labelKey)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card" aria-labelledby="settings-push-title">
          <div className="mb-3 flex items-start gap-3 border-b border-(--border) pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-2) text-brand-400">
              <Icon name="bell" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-push-title" className="card-title">{t('push.title')}</h2>
              <p className="mt-1 text-xs text-(--muted)">{t('push.desc')}</p>
            </div>
          </div>
          {pushMsg && <p role="alert" className="mb-2 text-sm text-red-400">{pushMsg}</p>}
          {pushNote ? (
            <p role="status" className="rounded-lg border border-(--border) bg-(--surface-2) p-3 text-sm text-(--text)">{pushNote}</p>
          ) : push === 'error' ? (
            <button
              type="button"
              onClick={() => {
                setPush('checking');
                setPushMsg(null);
                setPushRefresh((value) => value + 1);
              }}
              className="btn-ghost w-full gap-2 text-sm"
            >
              <Icon name="refresh" className="h-4 w-4" /> {t('common.retry')}
            </button>
          ) : (
            <button
              type="button"
              disabled={pushBusy || push === 'checking'}
              onClick={togglePush}
              className={push === 'on' ? 'btn-ghost w-full text-sm' : 'btn-primary w-full text-sm'}
            >
              {pushBusy || push === 'checking' ? t('common.loading') : push === 'on' ? t('push.disable') : t('push.enable')}
            </button>
          )}
          {push === 'on' && <p role="status" className="mt-2 text-sm font-bold text-green-700 dark:text-green-400">{t('push.on')}</p>}
        </section>

        <section className="card" aria-labelledby="settings-install-title">
          <div className="mb-3 flex items-start gap-3 border-b border-(--border) pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--surface-2) text-brand-400">
              <Icon name="download" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="settings-install-title" className="card-title">{t('install.title')}</h2>
              <p className="mt-1 text-xs text-(--muted)">{t('install.desc')}</p>
            </div>
          </div>
          {installState.installed ? (
            <p role="status" className="text-sm font-bold text-green-700 dark:text-green-400">{t('install.done')}</p>
          ) : installState.canInstall ? (
            <button
              type="button"
              disabled={installBusy}
              onClick={async () => { setInstallBusy(true); try { await installState.install(); } finally { setInstallBusy(false); } }}
              className="btn-primary w-full text-sm"
            >
              {installBusy ? t('common.loading') : t('install.button')}
            </button>
          ) : installState.ios ? (
            <ol className="flex flex-col gap-2 text-sm">
              <li><b>1.</b> {t('install.ios1')}</li>
              <li><b>2.</b> {t('install.ios2')}</li>
              <li><b>3.</b> {t('install.ios3')}</li>
            </ol>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              <li><b>1.</b> {t('install.android1')}</li>
              <li><b>2.</b> {t('install.android2')}</li>
            </ol>
          )}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
