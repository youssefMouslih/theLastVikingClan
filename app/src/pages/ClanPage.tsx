import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import MemberRow from '../components/player/MemberRow';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { getClanSettings, updateClanSettings } from '../services/clanService';
import { listMembers } from '../services/playerService';
import { getClanTotals, getHallOfFame } from '../services/statisticsService';
import { useAuthStore } from '../stores/authStore';

export default function ClanPage() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', tag: '', description: '', rules: '' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const membersQuery = useQuery({ queryKey: ['members'], queryFn: listMembers });
  const totalsQuery = useQuery({ queryKey: ['clan-totals'], queryFn: getClanTotals });
  const fameQuery = useQuery({ queryKey: ['hall-of-fame'], queryFn: getHallOfFame });

  const clan = clanQuery.data;
  const members = membersQuery.data ?? [];
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;

  function startEdit() {
    setForm({
      name: clan?.name ?? '',
      tag: clan?.tag ?? '',
      description: clan?.description ?? '',
      rules: clan?.rules ?? '',
    });
    setSaveError(null);
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      await updateClanSettings({ name: form.name.trim() || 'VIK', tag: form.tag.trim() || null, description: form.description || null, rules: form.rules || null });
      await clanQuery.refetch();
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      {clanQuery.isLoading ? (
        <p className="text-sm">{t('clan.loading')}</p>
      ) : clanQuery.isError ? (
        <p role="alert" className="text-sm text-red-500">{t('clan.loadError')}</p>
      ) : (
        <header className="card overflow-hidden !p-0">
          {clan?.banner_url && <img src={clan.banner_url} alt="" className="h-28 w-full object-cover" />}
          <div className="flex items-center gap-3 p-4">
            {clan?.logo_url ? (
              <img src={clan.logo_url} alt={`${clan.name} logo`} className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <div aria-hidden className="font-display flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-b from-brand-400 to-brand-700 text-lg text-white">V</div>
            )}
            <div className="flex-1">
              <h1 className="font-display text-lg tracking-wide">{clan?.name ?? 'VIK Clan'}</h1>
              <p className="text-xs opacity-70">{clan?.tag ? `[${clan.tag}]` : ''} • {t('clan.activeMembers', { n: activeCount })} • {clan?.country ?? '—'} • {clan?.timezone ?? 'Africa/Casablanca'}</p>
            </div>
            {canEdit && !editing && (
              <button onClick={startEdit} className="btn-ghost h-10 px-3 text-xs">{t('clan.edit')}</button>
            )}
          </div>
          {clan?.description && <p className="px-4 pb-3 text-sm">{clan.description}</p>}
        </header>
      )}

      {editing && (
        <form onSubmit={save} className="card mt-3 flex flex-col gap-2">
          <label className="label">{t('clan.name')}<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="label">{t('clan.tag')}<input className="input" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="VIK" /></label>
          <label className="label">{t('clan.description')}<textarea className="input h-auto py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="label">{t('clan.rules')}<textarea className="input h-auto py-2" rows={4} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} placeholder={t('clan.rulesPlaceholder')} /></label>
          {saveError && <p role="alert" className="text-sm text-red-500">{saveError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary h-11 flex-1">{saving ? t('clan.saving') : t('clan.save')}</button>
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost h-11 px-4">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {clan?.rules && !editing && (
        <section aria-label={t('clan.rulesTitle')} className="card mt-3">
          <h2 className="card-title">{t('clan.rulesTitle')}</h2>
          <p className="mt-1 whitespace-pre-line text-sm">{clan.rules}</p>
        </section>
      )}

      <section aria-label="Members" className="mt-4">
        <h2 className="card-title mb-2">{t('clan.members', { n: members.length })}</h2>
        {membersQuery.isLoading ? (
          <p className="text-sm">{t('clan.loadingMembers')}</p>
        ) : membersQuery.isError ? (
          <p role="alert" className="text-sm text-red-500">{t('clan.membersError')}{membersQuery.error instanceof Error ? ` (${membersQuery.error.message})` : ''}</p>
        ) : members.length === 0 ? (
          <p className="card text-sm opacity-70">{t('clan.noMembers')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m) => <MemberRow key={m.id} member={m} />)}
          </div>
        )}
      </section>
      <section aria-label="Clan records" className="card mt-4">
        <h2 className="card-title">{t('clan.stats')}</h2>
        {totalsQuery.data ? (
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
            <div><div className="font-display text-xl">{totalsQuery.data.members}</div><div className="opacity-60">{t('clan.stMembers')}</div></div>
            <div><div className="font-display text-xl">{totalsQuery.data.matches}</div><div className="opacity-60">{t('clan.stMatches')}</div></div>
            <div><div className="font-display text-xl">{totalsQuery.data.goals}</div><div className="opacity-60">{t('clan.stGoals')}</div></div>
            <div><div className="font-display text-xl">{totalsQuery.data.seasons}</div><div className="opacity-60">{t('clan.stSeasons')}</div></div>
          </div>
        ) : (
          <p className="mt-1 text-sm opacity-70">{t('clan.fameLoading')}</p>
        )}
      </section>

      <section aria-label={t('clan.fame')} className="card mt-3">
        <h2 className="card-title flex items-center gap-1"><Icon name="medal" className="h-4 w-4 text-brand-400" /> {t('clan.fame')}</h2>
        {fameQuery.isLoading ? (
          <p className="mt-1 text-sm opacity-70">{t('clan.fameLoading')}</p>
        ) : (fameQuery.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm opacity-70">{t('clan.fameEmpty')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {fameQuery.data!.map((h) => {
              const champ = members.find((x) => x.id === h.championId);
              return (
                <li key={h.competitionId} className="flex items-center gap-1.5"><Icon name="trophy" className="h-4 w-4 text-brand-400" /> {h.name} — <span className="font-semibold">{champ ? (champ.display_name ?? champ.username) : '—'}</span></li>
              );
            })}
          </ul>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
