import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { resetPassword, signIn, signUpWithInvite } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { t, locale, setLocale } = useLocale();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [mode, setMode] = useState<'login' | 'reset' | 'signup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      await signIn(email.trim(), password);
      await useAuthStore.getState().init();
      nav('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      const clean = username.trim().replace(/[^a-zA-Z0-9_]/g, '');
      if (clean.length < 3) throw new Error(t('auth.usernameShort'));
      const data = await signUpWithInvite(email.trim(), password, clean);
      if (data.session) {
        await useAuthStore.getState().init();
        nav('/home', { replace: true });
      } else {
        setInfo(t('auth.confirmEmail'));
        setMode('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      await resetPassword(email.trim());
      setInfo(t('auth.resetSent'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-4">
      <div className="mb-6 text-center">
        <img src="/logo.png" alt="VIK Clan logo" className="mx-auto h-24 w-24 rounded-3xl object-cover shadow-xl shadow-brand-500/30" />
        <div className="font-display mt-3 bg-gradient-to-r from-brand-400 via-brand-500 to-accent-400 bg-clip-text text-3xl tracking-wide text-transparent">VIK CLAN</div>
        <p className="mt-1 text-sm opacity-70">{t('auth.tagline')}</p>
        {!isSupabaseConfigured && (
          <p role="alert" className="mx-auto mt-3 max-w-xs rounded-xl border border-amber-500 p-3 text-xs">
            {t('auth.offline')}
          </p>
        )}
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <label className="label">
            {t('auth.email')}
            <input
              className="input h-12 text-base"
              type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="label">
            {t('auth.password')}
            <input
              className="input h-12 text-base"
              type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm font-medium text-red-500">{error}</p>}
          {info && <p className="text-sm text-green-500">{info}</p>}
          <button type="submit" disabled={busy} className="btn-primary h-12 text-base">
            {busy ? t('auth.loggingIn') : t('auth.login')}
          </button>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setMode('reset')} className="h-11 text-sm underline">
              {t('auth.forgot')}
            </button>
            <button type="button" onClick={() => setMode('signup')} className="btn-ghost h-11 text-sm">
              {t('auth.noAccount')}
            </button>
          </div>
        </form>
      ) : mode === 'signup' ? (
        <form onSubmit={handleSignup} className="flex flex-col gap-3">
          <label className="label">
            {t('auth.username')}
            <input
              className="input h-12 text-base"
              required minLength={3} maxLength={24} autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="label">
            {t('auth.email')}
            <input
              className="input h-12 text-base"
              type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="label">
            {t('auth.password')}
            <input
              className="input h-12 text-base"
              type="password" required minLength={6} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm font-medium text-red-500">{error}</p>}
          {info && <p className="text-sm text-green-500">{info}</p>}
          <button type="submit" disabled={busy} className="btn-cta h-12 text-base">
            {busy ? t('auth.creating') : t('auth.signup')}
          </button>
          <button type="button" onClick={() => setMode('login')} className="h-11 text-sm underline">
            {t('auth.haveAccount')}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="flex flex-col gap-3">
          <label className="label">
            {t('auth.accountEmail')}
            <input
              className="input h-12 text-base"
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm font-medium text-red-500">{error}</p>}
          {info && <p className="text-sm text-green-500">{info}</p>}
          <button type="submit" disabled={busy} className="btn-primary h-12">
            {busy ? t('auth.sending') : t('auth.sendReset')}
          </button>
          <button type="button" onClick={() => setMode('login')} className="h-11 text-sm underline">
            {t('auth.backToLogin')}
          </button>
        </form>
      )}

      <div className="mt-6 flex justify-center gap-1 text-xs" role="group" aria-label="Language">
        {LOCALES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => setLocale(l.code)}
            className={`h-9 rounded-lg px-3 ${locale === l.code ? 'bg-brand-500/20 font-bold text-brand-300' : 'opacity-60'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </main>
  );
}
