import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';

// Offline indicator: tells the truth when the network drops so cached
// data is never mistaken for live data.
export default function OfflineBanner() {
  const { t } = useLocale();
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[9999] mx-auto max-w-2xl p-3" style={{ transform: 'translateZ(0)' }}>
      <p className="card border-amber-400 p-3 text-center text-sm font-bold">{t('pwa.offline')}</p>
    </div>
  );
}
