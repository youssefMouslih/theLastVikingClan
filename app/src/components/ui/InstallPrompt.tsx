import { useEffect, useState } from 'react';
import Icon from './Icon';
import { useLocale } from '../../i18n/LocaleContext';

interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'vik-install-dismissed';

function isInstalled(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Mac/i.test(ua) && navigator.maxTouchPoints > 1; // iPadOS desktop mode
}

// Install card: native prompt where supported (Android/desktop), guided
// Share → Add to Home Screen steps on iOS (no programmatic install there).
export default function InstallPrompt() {
  const { t } = useLocale();
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [done, setDone] = useState(() => isInstalled());
  const ios = isIOS();

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPrompt);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const onChange = () => setDone(isInstalled());
    window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', onChange);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (done || dismissed || (!deferred && !ios)) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDone(true);
    setDeferred(null);
  }

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <section aria-label={t('install.title')} className="card mt-3 border-brand-500/40">
      <div className="flex items-center gap-3">
        <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-brand-400 to-brand-700 text-lg text-white">V</span>
        <div className="flex-1">
          <h2 className="font-display text-sm tracking-wide">{t('install.title')}</h2>
          <p className="text-xs opacity-70">{t('install.desc')}</p>
        </div>
        <button type="button" onClick={later} aria-label={t('install.later')} className="btn-ghost h-9 w-9 !px-0 text-xs">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      {deferred ? (
        <button type="button" onClick={install} className="btn-primary mt-3 w-full">
          {t('install.button')}
        </button>
      ) : (
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          <li><b>1.</b> {t('install.ios1')}</li>
          <li><b>2.</b> {t('install.ios2')}</li>
          <li><b>3.</b> {t('install.ios3')}</li>
        </ol>
      )}
    </section>
  );
}
