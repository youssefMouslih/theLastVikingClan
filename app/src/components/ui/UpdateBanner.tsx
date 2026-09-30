import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';

const KEY = 'pwa-just-updated';
const DISMISS_KEY = 'pwa-update-dismissed';

// "New version available" banner: user chooses when to refresh.
// Dismiss sticks for 24h; post-update suppression avoids instant nagging.
export default function UpdateBanner() {
  const { t } = useLocale();
  const { needRefresh, updateServiceWorker } = useRegisterSW();
  const [show, setShow] = useStateSuppressed();

  useEffect(() => {
    if (!needRefresh) return;
    try {
      const now = Date.now();
      const updatedAt = Number(localStorage.getItem(KEY) ?? 0);
      if (now - updatedAt < 30_000) return;
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (now - dismissedAt < 24 * 3600_000) return;
    } catch { /* ignore */ }
    setShow(true);
  }, [needRefresh, setShow]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[9999] mx-auto max-w-2xl p-3" style={{ transform: 'translateZ(0)' }}>
      <div className="card flex items-center gap-2 p-3 text-sm">
        <p className="flex-1 font-bold">{t('pwa.update')}</p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(KEY, String(Date.now()));
            } catch { /* ignore */ }
            updateServiceWorker(true);
          }}
          className="btn-primary h-10 px-4 text-xs"
        >
          {t('pwa.refresh')}
        </button>
        <button type="button" onClick={dismiss} className="btn-ghost h-10 px-3 text-xs" aria-label={t('common.close')}>
          ✕
        </button>
      </div>
    </div>
  );
}

function useStateSuppressed(): [boolean, (v: boolean) => void] {
  return useState(false);
}
