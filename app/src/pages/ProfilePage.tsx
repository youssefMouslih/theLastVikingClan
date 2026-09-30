import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import StatusBadge from '../components/ui/StatusBadge';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { updateOwnProfile } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';
import { useAuthStore } from '../stores/authStore';

// Pro player card (eFootball style): view by default, Edit reveals the form.
export default function ProfilePage() {
  const { t, locale, setLocale } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const init = useAuthStore((s) => s.init);
  const logout = useAuthStore((s) => s.logout);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    display_name: me?.display_name ?? '',
    efootball_name: me?.efootball_name ?? '',
    efootball_id: me?.efootball_id ?? '',
    country: me?.country ?? '',
    bio: me?.bio ?? '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const careerQuery = useQuery({ queryKey: ['career', me?.id], queryFn: () => getPlayerCareer(me!.id), enabled: !!me });

  if (!me) return <main className="page text-sm">{t('profile.notLogged')}</main>;
  const c = careerQuery.data;

  function startEdit() {
    setForm({
      display_name: me?.display_name ?? '',
      efootball_name: me?.efootball_name ?? '',
      efootball_id: me?.efootball_id ?? '',
      country: me?.country ?? '',
      bio: me?.bio ?? '',
    });
    setMsg(null);
    setEditing(true);
  }

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
      setEditing(false);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      {/* Pro card */}
      <section aria-label={t('profile.title')} className="hero overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div aria-hidden className="font-display flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-3xl shadow-inner">
              {(me.display_name ?? me.username).slice(0, 1).toUpperCase()}
            </div>
            <div className="font-display mt-1 text-2xl text-accent-400">{c ? `${c.winRate}%` : '—'}</div>
            <div className="text-[10px] uppercase tracking-widest opacity-70">{t('player.winRate')}</div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl tracking-wide">{me.display_name ?? me.username}</h1>
            <p className="truncate text-sm opacity-70">@{me.username}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge value={me.role} />
              <StatusBadge value={me.status} />
            </div>
            {(me.efootball_name || me.efootball_id || me.country) && (
              <div className="mt-2 space-y-0.5 text-xs opacity-85">
                {me.efootball_name && <p className="flex items-center gap-1"><Icon name="swords" className="h-3.5 w-3.5" /> {me.efootball_name}{me.efootball_id ? ` • ID ${me.efootball_id}` : ''}</p>}
                {me.country && <p>{me.country}</p>}
              </div>
            )}
          </div>
          <button type="button" onClick={startEdit} aria-label={t('common.edit')} className="btn-ghost h-10 w-10 !px-0 text-white">
            <Icon name="pencil" className="h-5 w-5" />
          </button>
        </div>
        {me.bio && <p className="mt-3 border-t border-white/10 pt-2 text-sm opacity-85">{me.bio}</p>}
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center text-xs">
          <div><div className="font-display text-lg">{c?.played ?? '—'}</div><div className="opacity-60">{t('player.matches')}</div></div>
          <div><div className="font-display text-lg">{c?.wins ?? '—'}</div><div className="opacity-60">{t('player.wins')}</div></div>
          <div><div className="font-display text-lg">{c?.goals_for ?? '—'}</div><div className="opacity-60">{t('player.goals')}</div></div>
          <div><div className="font-display text-lg">{c?.titles ?? '—'}</div><div className="opacity-60">{t('player.titles')}</div></div>
        </div>
      </section>

      {editing && (
        <form onSubmit={save} className="card mt-3 flex flex-col gap-2">
          <label className="label">{t('profile.displayName')}<input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="label">{t('profile.efootballName')}<input className="input" value={form.efootball_name} onChange={(e) => setForm({ ...form, efootball_name: e.target.value })} /></label>
          <label className="label">{t('profile.efootballId')}<input className="input" value={form.efootball_id} onChange={(e) => setForm({ ...form, efootball_id: e.target.value })} /></label>
          <label className="label">{t('profile.country')}<input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
          <label className="label">{t('profile.bio')}<textarea className="input h-auto py-2" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
          {msg && <p className="text-sm opacity-80">{msg}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary h-12 flex-1">
              {busy ? t('profile.saving') : t('profile.save')}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost h-12 px-4">{t('common.cancel')}</button>
          </div>
        </form>
      )}

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
