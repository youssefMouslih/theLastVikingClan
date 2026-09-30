import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import PlayerCard from '../components/player/PlayerCard';
import { LOCALES } from '../i18n/dictionaries';
import { useLocale } from '../i18n/LocaleContext';
import { updateOwnProfile } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';
import { uploadAvatar } from '../services/storageService';
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
    division_pvp: me?.division_pvp ?? '',
    division_ai: me?.division_ai ?? '',
    fav_player_name: me?.fav_player_name ?? '',
    fav_player_rating: me?.fav_player_rating?.toString() ?? '',
    fav_player_position: me?.fav_player_position ?? '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const careerQuery = useQuery({ queryKey: ['career', me?.id], queryFn: () => getPlayerCareer(me!.id), enabled: !!me });

  if (!me) return <main className="page text-sm">{t('profile.notLogged')}</main>;

  function startEdit() {
    setForm({
      display_name: me?.display_name ?? '',
      efootball_name: me?.efootball_name ?? '',
      efootball_id: me?.efootball_id ?? '',
      country: me?.country ?? '',
      bio: me?.bio ?? '',
      division_pvp: me?.division_pvp ?? '',
      division_ai: me?.division_ai ?? '',
      fav_player_name: me?.fav_player_name ?? '',
      fav_player_rating: me?.fav_player_rating?.toString() ?? '',
      fav_player_position: me?.fav_player_position ?? '',
    });
    setAvatarFile(null);
    setMsg(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      let avatar_url = me!.avatar_url;
      if (avatarFile) avatar_url = await uploadAvatar(avatarFile, me!.id);
      await updateOwnProfile(me!.id, {
        display_name: form.display_name || null,
        efootball_name: form.efootball_name || null,
        efootball_id: form.efootball_id || null,
        country: form.country || null,
        bio: form.bio || null,
        division_pvp: form.division_pvp || null,
        division_ai: form.division_ai || null,
        fav_player_name: form.fav_player_name || null,
        fav_player_rating: form.fav_player_rating === '' ? null : Math.max(0, Math.min(99, Number(form.fav_player_rating) || 0)),
        fav_player_position: form.fav_player_position || null,
        avatar_url,
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
      <PlayerCard
        member={me}
        career={careerQuery.data ?? null}
        action={
          <button type="button" onClick={startEdit} aria-label={t('common.edit')} className="btn-ghost h-10 w-10 !px-0 text-white">
            <Icon name="pencil" className="h-5 w-5" />
          </button>
        }
      />

      {editing && (
        <form onSubmit={save} className="card mt-3 flex flex-col gap-2">
          <label className="label">{t('profile.avatar')}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} className="h-11 w-full text-sm" />
          </label>
          <label className="label">{t('profile.displayName')}<input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
          <label className="label">{t('profile.efootballName')}<input className="input" value={form.efootball_name} onChange={(e) => setForm({ ...form, efootball_name: e.target.value })} /></label>
          <label className="label">{t('profile.efootballId')}<input className="input" value={form.efootball_id} onChange={(e) => setForm({ ...form, efootball_id: e.target.value })} /></label>
          <label className="label">{t('profile.country')}<input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
          <label className="label">{t('profile.bio')}<textarea className="input h-auto py-2" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">{t('profile.divisionPvp')}<input className="input" value={form.division_pvp} onChange={(e) => setForm({ ...form, division_pvp: e.target.value })} placeholder="Division 3" /></label>
            <label className="label">{t('profile.divisionAi')}<input className="input" value={form.division_ai} onChange={(e) => setForm({ ...form, division_ai: e.target.value })} placeholder="Legend" /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="label col-span-2">{t('profile.favName')}<input className="input" value={form.fav_player_name} onChange={(e) => setForm({ ...form, fav_player_name: e.target.value })} /></label>
            <label className="label">{t('profile.favRating')}<input type="number" min={0} max={99} className="input" value={form.fav_player_rating} onChange={(e) => setForm({ ...form, fav_player_rating: e.target.value })} /></label>
          </div>
          <label className="label">{t('profile.favPos')}<input className="input" value={form.fav_player_position} onChange={(e) => setForm({ ...form, fav_player_position: e.target.value })} placeholder="AMF" /></label>
          {msg && <p className="text-sm opacity-80">{msg}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary h-12 flex-1">
              {busy ? t('profile.saving') : t('profile.save')}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost h-12 px-4">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {(me.role === 'OWNER' || me.role === 'ADMIN') && (
        <Link to="/admin" className="btn-primary mt-3 flex w-full items-center justify-center gap-2">
          <Icon name="shield" className="h-5 w-5" /> {t('admin.title')}
        </Link>
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
