import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { setForcedPassword } from '../services/authService';
import { useLocale } from '../i18n/LocaleContext';
import { useAuthStore } from '../stores/authStore';

// Blocking rotation screen: provisioned accounts (must_change_password) land
// here after login and cannot reach the app until the temp password is gone.
// The router bounces every other page to /password while the flag is set.
export default function ForcePasswordPage() {
  const { t } = useLocale();
  const nav = useNavigate();
  const me = useAuthStore((s) => s.profile);
  const init = useAuthStore((s) => s.init);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <Navigate to="/login" replace />;
  if (!me.must_change_password) return <Navigate to="/home" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) {
      setError(t('auth.tooShort'));
      return;
    }
    if (pw !== confirm) {
      setError(t('auth.mismatch'));
      return;
    }
    setBusy(true);
    try {
      const self = me;
      if (!self) throw new Error('Not logged in.');
      await setForcedPassword(self.id, pw);
      await init();
      nav('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-4">
      <div className="mb-6 text-center">
        <img src="/logo.png" alt="VIK Clan logo" className="mx-auto h-24 w-24 rounded-3xl object-cover shadow-xl shadow-brand-500/30" />
        <h1 className="font-display mt-3 text-2xl tracking-wide">{t('auth.forceTitle')}</h1>
        <p className="mt-1 text-sm opacity-70">{t('auth.forceDesc')}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="label">
          {t('auth.newPassword')}
          <input
            className="input h-12 text-base"
            type="password" required minLength={6} autoComplete="new-password"
            value={pw} onChange={(e) => setPw(e.target.value)}
          />
        </label>
        <label className="label">
          {t('auth.confirmPassword')}
          <input
            className="input h-12 text-base"
            type="password" required minLength={6} autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm font-medium text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className="btn-cta h-12 text-base">
          {busy ? t('common.saving') : t('auth.setPassword')}
        </button>
      </form>
    </main>
  );
}
