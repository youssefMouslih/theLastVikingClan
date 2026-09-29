import { useState } from 'react';
import BottomNav from '../components/ui/BottomNav';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { updateOwnProfile } from '../services/playerService';
import { useAuthStore } from '../stores/authStore';

export default function ProfilePage() {
  const { t, locale, setLocale } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);
  const [form, setForm] = useState({
    display_name: me?.display_name ?? '',
    efootball_name: me?.efootball_name ?? '',
    efootball_id: me?.efootball_id ?? '',
    country: me?.country ?? '',
    bio: me?.bio ?? '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <main className="page text-sm">{t('profile.notLogged')}</main>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await updateOwnProfile(me!.id, {
        display_name: form.display_name || null,
        efootball_name: form.efootball_name || null,
        efootball_id: form.efootball_id || null,
        country: form.country || null,
        bio: form.bio || null,
      });
      await init();
      setMsg(t('profile.saved'));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="font-display text-xl tracking-wide">{t('profile.title')}</h1>
      <p className="text-xs opacity-70">@{me.username} • {me.role} • {me.status} • {me.email}</p>
      <form onSubmit={save} className="card mt-3 flex flex-col gap-2">
        <label className="label">{t('profile.displayName')}<input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
        <label className="label">{t('profile.efootballName')}<input className="input" value={form.efootball_name} onChange={(e) => setForm({ ...form, efootball_name: e.target.value })} /></label>
        <label className="label">{t('profile.efootballId')}<input className="input" value={form.efootball_id} onChange={(e) => setForm({ ...form, efootball_id: e.target.value })} /></label>
        <label className="label">{t('profile.country')}<input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
        <label className="label">{t('profile.bio')}<textarea className="input h-auto py-2" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        {msg && <p className="text-sm opacity-80">{msg}</p>}
        <button type="submit" disabled={busy} className="btn-primary h-12">
          {busy ? t('profile.saving') : t('profile.save')}
        </button>
      </form>
      <section className="card mt-3" aria-label={t('profile.language')}>
        <h2 className="card-title">{t('profile.language')}</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={locale === l.code ? 'btn-primary h-11 text-sm' : 'btn-ghost h-11 text-sm'}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>
      <button onClick={logout} className="btn-ghost mt-3 w-full">{t('profile.logout')}</button>
      <BottomNav />
    </main>
  );
}
