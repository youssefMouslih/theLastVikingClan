import { useState } from 'react';
import Icon from './Icon';
import { useLocale } from '../../i18n/LocaleContext';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const DISMISS_KEY = 'vik-install-dismissed';

// Install card: native prompt where supported (Android/desktop), guided
// Share → Add to Home Screen steps on iOS (no programmatic install there).
// A permanent entry point also lives in Settings (survives dismissal).
export default function InstallPrompt() {
  const { t } = useLocale();
  const { canInstall, installed, ios, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  if (installed || dismissed || (!canInstall && !ios)) return null;

  async function onInstall() {
    setBusy(true);
    try {
      if (await install()) return;
    } finally {
      setBusy(false);
    }
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
      {canInstall ? (
        <button type="button" onClick={onInstall} disabled={busy} className="btn-primary mt-3 w-full">
          {busy ? t('common.loading') : t('install.button')}
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
