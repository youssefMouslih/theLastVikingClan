import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FadeIn } from '../components/ui/Motion';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { resetPassword, signIn, signUpWithInvite } from '../services/authService';
import { getClanSettings } from '../services/clanService';
import { submitTryout } from '../services/tryoutService';
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
  // Admin-controlled platform access: null = still loading, default open.
  const [regOpen, setRegOpen] = useState<boolean | null>(null);
  useEffect(() => {
    getClanSettings().then(
      (s) => setRegOpen(s?.registration_open ?? true),
      () => setRegOpen(true),
    );
  }, []);
  // Tryout request (always available, even when signup is closed).
  const [tryoutOpen, setTryoutOpen] = useState(false);
  const [tName, setTName] = useState('');
  const [tContact, setTContact] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tNote, setTNote] = useState('');
  const [tBusy, setTBusy] = useState(false);
  const [tSent, setTSent] = useState(false);
  const [tErr, setTErr] = useState<string | null>(null);

  async function handleTryout(e: React.FormEvent) {
    e.preventDefault();
    setTErr(null); setTBusy(true);
    try {
      const digits = tContact.replace(/[^\d+]/g, '');
      if (tName.trim().length < 2) throw new Error(t('auth.usernameShort'));
      if (digits.replace(/\D/g, '').length < 7) throw new Error(t('tryout.failed'));
      if (!/.+@.+\..+/.test(tEmail.trim())) throw new Error(t('tryout.failed'));
      await submitTryout({ name: tName.trim(), contact: digits, email: tEmail.trim(), note: tNote.trim() || null });
      setTSent(true);
      setTName(''); setTContact(''); setTEmail(''); setTNote('');
    } catch (err) {
      setTErr(err instanceof Error ? err.message : t('tryout.failed'));
    } finally {
      setTBusy(false);
    }
  }

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
      if (regOpen === false) throw new Error(t('auth.signupClosed'));
      const clean = username.trim().replace(/[^a-zA-Z0-9_]/g, '');
      if (clean.length < 3) throw new Error(t('auth.usernameShort'));
      const data = await signUpWithInvite(email.trim(), password, clean);
      if (data.session) {
        await useAuthStore.getState().init();
        nav('/code?tab=oath', { replace: true });
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
      <FadeIn>
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
            {regOpen !== false && (
              <button type="button" onClick={() => setMode('signup')} className="btn-ghost h-11 text-sm">
                {t('auth.noAccount')}
              </button>
            )}
            {regOpen === false && (
              <p role="status" className="rounded-xl bg-white/5 p-3 text-center text-sm opacity-70">
                {t('auth.signupClosed')}
              </p>
            )}
          </div>
        </form>
      ) : mode === 'signup' ? (
        <form onSubmit={handleSignup} className="flex flex-col gap-3">
          <label className="label">
            {t('auth.username')}
            <input
              className="input h-12 text-base"
              required minLength={3} maxLength={24} autoComplete="username"
              value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24))}
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

      <div className="card mt-4 p-3">
        {!tSent ? (
          tryoutOpen ? (
            <form onSubmit={handleTryout} className="flex flex-col gap-2">
              <h2 className="font-bold">{t('tryout.title')}</h2>
              <p className="-mt-1 text-xs opacity-70">{t('tryout.desc')}</p>
              <label className="label">{t('tryout.name')}
                <input className="input h-11 text-base" required minLength={2} maxLength={40} value={tName} onChange={(e) => setTName(e.target.value.slice(0, 40))} />
              </label>
              <label className="label">{t('tryout.contact')}
                <input type="tel" inputMode="tel" dir="ltr" className="input h-11 text-base" required value={tContact} onChange={(e) => setTContact(e.target.value.replace(/[^\d+]/g, '').slice(0, 20))} placeholder="+212600000000" />
              </label>
              <label className="label">{t('tryout.email')}
                <input type="email" dir="ltr" className="input h-11 text-base" required value={tEmail} onChange={(e) => setTEmail(e.target.value)} placeholder="you@mail.com" />
              </label>
              <label className="label">{t('tryout.note')}
                <textarea className="input h-auto py-2 text-base" rows={2} maxLength={280} value={tNote} onChange={(e) => setTNote(e.target.value)} />
              </label>
              {tErr && <p role="alert" className="text-sm font-medium text-red-500">{tErr}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={tBusy} className="btn-primary h-11 flex-1 text-sm">
                  {tBusy ? t('tryout.sending') : t('tryout.send')}
                </button>
                <button type="button" onClick={() => setTryoutOpen(false)} className="btn-ghost h-11 px-4 text-sm">{t('common.cancel')}</button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setTryoutOpen(true)} className="btn-ghost h-11 w-full text-sm">
              {t('tryout.cta')}
            </button>
          )
        ) : (
          <div className="flex flex-col gap-2 text-center">
            <p className="text-sm font-bold text-green-500">{t('tryout.sent')}</p>
            <button type="button" onClick={() => { setTSent(false); setTryoutOpen(true); }} className="h-9 text-xs underline opacity-70">
              {t('tryout.cta')}
            </button>
          </div>
        )}
      </div>

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
      </FadeIn>
    </main>
  );
}
