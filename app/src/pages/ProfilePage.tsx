import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import PlayerCard from '../components/player/PlayerCard';
import { useLocale } from '../i18n/LocaleContext';
import { updateOwnProfile } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';
import { uploadAvatar, uploadBanner } from '../services/storageService';
import { useAuthStore } from '../stores/authStore';

// Pro player card (eFootball style): view by default, Edit reveals the form.
export default function ProfilePage() {
  const { t } = useLocale();
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
    banner_color: me?.banner_color ?? '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
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
      banner_color: me?.banner_color ?? '',
    });
    setAvatarFile(null);
    setBannerFile(null);
    setMsg(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      let avatar_url = me!.avatar_url;
      if (avatarFile) avatar_url = await uploadAvatar(avatarFile, me!.id);
      let banner_image = me!.banner_image;
      if (bannerFile) banner_image = await uploadBanner(bannerFile, me!.id);
      await updateOwnProfile(me!.id, {
        display_name: form.display_name || null,
        efootball_name: form.efootball_name || null,
        efootball_id: form.efootball_id || null,
        country: form.country || null,
        bio: form.bio || null,
        division_pvp: form.division_pvp || null,
        division_ai: null,
        fav_player_name: null,
        fav_player_rating: null,
        fav_player_position: null,
        banner_color: form.banner_color || null,
        banner_image,
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
      <div className="mb-2 flex justify-end">
        <Link to="/settings" aria-label={t('settings.title')} className="btn-ghost h-10 w-10 !px-0">
          <Icon name="sliders" className="h-5 w-5" />
        </Link>
      </div>
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
          <label className="label">{t('profile.divisionPvp')}<input className="input" value={form.division_pvp} onChange={(e) => setForm({ ...form, division_pvp: e.target.value })} placeholder="Division 3" /></label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-sm font-semibold">{t('profile.bannerColor')}</p>
              <div className="mt-1 flex gap-1.5">
                {['', '#7c3aed', '#f43f5e', '#2540ff', '#d4af37', '#16a34a'].map((c) => (
                  <button
                    key={c || 'none'}
                    type="button"
                    aria-label={c || 'default'}
                    onClick={() => setForm({ ...form, banner_color: c })}
                    className={`h-9 w-9 rounded-lg border-2 ${form.banner_color === c ? 'border-white' : 'border-transparent'}`}
                    style={{ background: c || 'linear-gradient(115deg,#ffe500 20%,#2540ff 60%,#0f0f23)' }}
                  />
                ))}
              </div>
            </div>
            <label className="label">{t('profile.bannerImage')}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)} className="h-11 w-full text-xs" />
            </label>
          </div>
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
      <button onClick={logout} className="btn-ghost mt-3 w-full">{t('profile.logout')}</button>
      <BottomNav />
    </main>
  );
}
