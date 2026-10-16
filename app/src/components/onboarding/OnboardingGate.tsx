import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { supabase } from '../../lib/supabase';
import { isKnownNameTaken, updateOwnProfile } from '../../services/playerService';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../ui/Toast';

export const ONBOARDING_REWARD_GP = 80;

// Post-signup gate: after account creation + sign-in, the profile-details
// form appears automatically until name + VIK tag + phone are set.
// Completing it correctly awards 80 GP once (idempotent xp_ledger ref).
export function needsOnboarding(profile: { display_name: string | null; known_name: string | null; whatsapp: string | null } | null): boolean {
  if (!profile) return false;
  return !profile.display_name?.trim() || !profile.known_name?.trim() || !profile.whatsapp?.trim();
}

export default function OnboardingGate() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const init = useAuthStore((s) => s.init);
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('VIK ');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!needsOnboarding(me)) return null;
  // Forced password rotation takes precedence (router already confines
  // flagged users to /password, where this gate must not overlay).
  if (me?.must_change_password) return null;

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const cleanTag = tag.trim();
    const digits = phone.replace(/[^\d+]/g, '');
    if (cleanName.length < 2) {
      setError(t('onboard.needName'));
      return;
    }
    if (!/vik/i.test(cleanTag) || cleanTag.length < 5) {
      setError(t('onboard.needTag'));
      return;
    }
    if (digits.replace(/\D/g, '').length < 8) {
      setError(t('onboard.needPhone'));
      return;
    }
    setBusy(true);
    try {
      if (await isKnownNameTaken(cleanTag, me!.id)) {
        setError(t('onboard.tagTaken'));
        setBusy(false);
        return;
      }
    } catch { /* fail open: DB constraint is the final guard */ }
    try {
      await updateOwnProfile(me!.id, {
        display_name: cleanName,
        known_name: cleanTag,
        whatsapp: digits,
      });
      // Idempotent server-side +80 (0034 claim_onboarding_reward RPC) — safe to retry.
      const { error: rpcErr } = await supabase.rpc('claim_onboarding_reward');
      if (rpcErr) throw new Error(rpcErr.message);
      await init();
      toast(t('onboard.reward', { n: ONBOARDING_REWARD_GP }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="onboard-title" className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/80 p-4">
      <form onSubmit={claim} className="card w-full max-w-sm">
        <h1 id="onboard-title" className="font-display text-xl tracking-wide">{t('onboard.title')}</h1>
        <p className="mt-1 text-sm opacity-70">{t('onboard.subtitle', { n: ONBOARDING_REWARD_GP })}</p>
        <div className="mt-3 flex flex-col gap-2">
          <label className="label">{t('onboard.name')}
            <input className="input h-12 text-base" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="label">{t('onboard.tag')}
            <input className="input h-12 text-base" required value={tag} onChange={(e) => setTag(e.target.value)} dir="ltr" autoComplete="off" />
            <span className="text-xs font-normal opacity-60">{t('onboard.tagHint')}</span>
          </label>
          <label className="label">{t('profile.whatsapp')}
            <input type="tel" inputMode="tel" className="input h-12 text-base" required value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, '').slice(0, 18))} placeholder="+212600000000" dir="ltr" autoComplete="tel" />
          </label>
        </div>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary mt-3 h-12 w-full">
          {busy ? t('onboard.claiming') : t('onboard.claim', { n: ONBOARDING_REWARD_GP })}
        </button>
      </form>
    </div>
  );
}
