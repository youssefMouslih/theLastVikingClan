import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { useOath } from '../../hooks/useOath';
import { useAuthStore } from '../../stores/authStore';
import { needsOnboarding } from '../onboarding/OnboardingGate';
import Icon from '../ui/Icon';

const OATH_KEYS = ['code.o1', 'code.o2', 'code.o3', 'code.o4', 'code.o5', 'code.o6', 'code.o7'] as const;

// Every member swears the Viking's Oath on their first connection, before any
// page (and therefore before any event or tournament) is reachable.
export default function OathGate() {
  const { t, tError } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const { swear } = useOath();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me || me.status === 'BANNED' || me.must_change_password) return null;
  // Name + VIK tag + phone come first; the oath follows.
  if (needsOnboarding(me)) return null;
  if (me.oath_accepted_at) return null;

  async function accept() {
    setBusy(true); setError(null);
    try {
      await swear();
    } catch (err) {
      setError(tError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="oath-gate-title" className="fixed inset-0 z-[9992] flex items-center justify-center overflow-y-auto bg-black/90 p-4">
      <div className="card w-full max-w-md text-center">
        <Icon name="shield" className="mx-auto h-12 w-12 text-brand-400" />
        <h1 id="oath-gate-title" className="font-display mt-2 text-2xl tracking-wide">{t('code.oathTitle')}</h1>
        <p className="mt-1 text-sm opacity-70">{t('oath.gateIntro')}</p>
        <div className="mx-auto mt-4 max-h-[45vh] max-w-sm space-y-1.5 overflow-y-auto text-start">
          {OATH_KEYS.map((k, i) => (
            <p key={k} className={i >= 5 ? 'font-display text-accent-400' : 'text-sm'}>{t(k)}</p>
          ))}
        </div>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-red-500">{error}</p>}
        <button type="button" disabled={busy} onClick={accept} className="btn-cta mt-4 h-12 w-full">
          {busy ? t('common.loading') : t('code.oathSwear')}
        </button>
        <p className="mt-2 text-xs opacity-60">{t('oath.gateRequired')}</p>
      </div>
    </div>
  );
}
