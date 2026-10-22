import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import CompetitionCard from '../components/competition/CompetitionCard';
import LeagueEntryCard from '../components/league4v4/LeagueEntryCard';
import LeagueDraftList from '../components/league4v4/LeagueDraftList';
import LeagueSeasonCreateForm from '../components/league4v4/LeagueSeasonCreateForm';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import QueryError from '../components/ui/QueryError';
import { useLocale } from '../i18n/LocaleContext';
import { getCompetitionByCode, listCompetitions, listParticipantCounts, createCompetition } from '../services/competitionService';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons } from '../services/leagueSeasonService';
import type { CompetitionType } from '../types/database';
import { useAuthStore } from '../stores/authStore';

export default function CompetitionsPage() {
  const { t, tError } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const canCreate = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [format, setFormat] = useState<'STANDARD' | '4VS4'>('STANDARD');
  const [form, setForm] = useState({ name: '', description: '', type: 'LEAGUE' as CompetitionType, min_players: 4, max_players: 16, registration_deadline: '', start_date: '', match_deadline_hours: 48 });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const query = useQuery({ queryKey: ['competitions'], queryFn: () => listCompetitions() });
  const countsQuery = useQuery({
    queryKey: ['competition-counts', query.data?.map((c) => c.id).join(',')],
    enabled: !!query.data,
    queryFn: () => listParticipantCounts((query.data ?? []).map((c) => c.id)),
  });
  const leagueSeasonsQuery = useQuery({
    queryKey: leagueKeys.seasons,
    queryFn: listLeagueSeasons,
    enabled: canCreate && showForm && format === '4VS4',
    staleTime: 0,
  });
  const draftSeasons = (leagueSeasonsQuery.data ?? [])
    .filter((season) => season.status === 'DRAFT')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  async function handleJoinCode(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null); setJoining(true);
    try {
      const comp = await getCompetitionByCode(code);
      if (!comp) throw new Error(t('comps.noCode'));
      nav(`/join/${comp.join_code}`);
    } catch (err) {
      setJoinError(tError(err));
    } finally {
      setJoining(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    setCreateError(null); setCreating(true);
    try {
      const toISO = (v: string) => (v ? new Date(v).toISOString() : null);
      const c = await createCompetition({
        name: form.name,
        description: form.description || null,
        type: form.type,
        min_players: form.min_players,
        max_players: form.max_players,
        registration_deadline: toISO(form.registration_deadline),
        start_date: toISO(form.start_date),
        match_deadline_hours: form.match_deadline_hours,
      }, me.id);
      nav(`/competitions/${c.id}`);
    } catch (err) {
      setCreateError(tError(err));
    } finally {
      setCreating(false);
    }
  }

  const typeHint =
    form.type === 'LEAGUE' ? t('admin.typeLeague') :
    form.type === 'CUP' ? t('admin.typeCup') :
    form.type === 'TOURNAMENT' ? t('admin.typeTournament') : t('admin.typeSpecial');
  const typeText =
    form.type === 'LEAGUE' ? t('comps.typeLeague') :
    form.type === 'CUP' ? t('comps.typeCup') :
    form.type === 'TOURNAMENT' ? t('comps.typeTournament') : t('comps.typeSpecial');
  const rosterValid = form.min_players >= 2 && form.max_players <= 32 && form.max_players >= form.min_players;

  return (
    <main className="page">
      <AppBar title={t('comps.title')} />
      <LeagueEntryCard />
      {canCreate && (
        <div className="mt-2 flex justify-end">
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary h-10 px-4 text-sm">{t('comps.new')}</button>
        </div>
      )}
      {canCreate && showForm && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
            {(['STANDARD', '4VS4'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setFormat(kind)}
                aria-pressed={format === kind}
                className={`h-10 rounded-lg text-sm font-semibold ${format === kind ? 'bg-brand-500 text-black' : 'opacity-60'}`}
              >
                {kind === 'STANDARD' ? t('comps.standard') : t('league4.title')}
              </button>
            ))}
          </div>
          <p className="text-xs opacity-60">{format === 'STANDARD' ? t('comps.standardHint') : t('comps.league4Hint')}</p>
          {format === '4VS4' ? (
            <section className="card flex flex-col gap-2 p-3">
              {leagueSeasonsQuery.isLoading || (leagueSeasonsQuery.isFetching && draftSeasons.length === 0) ? (
                <p className="text-sm opacity-60">{t('common.loading')}</p>
              ) : leagueSeasonsQuery.isError ? (
                <QueryError error={leagueSeasonsQuery.error} onRetry={() => void leagueSeasonsQuery.refetch()} />
              ) : draftSeasons.length > 0 ? (
                <LeagueDraftList drafts={draftSeasons} onResume={(id) => nav(`/4vs4/admin?season=${id}`)} />
              ) : (
                <>
                  <h2 className="font-bold">{t('comps.createTitle')}</h2>
                  <LeagueSeasonCreateForm onCreated={(id) => nav(`/4vs4/admin?season=${id}`)} />
                </>
              )}
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost h-10 text-sm">{t('common.close')}</button>
            </section>
          ) : (
              <form onSubmit={handleCreate} className="card flex flex-col gap-2 p-3">
                <h2 className="font-bold">{t('comps.createTitle')}</h2>
                <label className="label">{t('detail.editName')}
                  <input required className="input text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
                </label>
                <label className="label">{t('admin.type')}
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CompetitionType })} className="input text-sm">
                    <option value="LEAGUE">{t('comps.typeLeague')}</option>
                    <option value="CUP">{t('comps.typeCup')}</option>
                    <option value="TOURNAMENT">{t('comps.typeTournament')}</option>
                    <option value="SPECIAL_EVENT">{t('comps.typeSpecial')}</option>
                  </select>
                </label>
                <p className="text-xs opacity-60">{typeHint}</p>
                <label className="label">{t('detail.editDesc')}
                  <textarea className="input h-auto py-2 text-sm" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={280} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="label">{t('detail.editMin')}
                    <input type="number" min={2} max={32} className="input text-sm" value={form.min_players} onChange={(e) => setForm({ ...form, min_players: Number(e.target.value) })} />
                  </label>
                  <label className="label">{t('detail.editMax')}
                    <input type="number" min={2} max={32} className="input text-sm" value={form.max_players} onChange={(e) => setForm({ ...form, max_players: Number(e.target.value) })} />
                  </label>
                  <label className="label">{t('detail.editMatchHours')}
                    <input type="number" min={1} max={336} className="input text-sm" value={form.match_deadline_hours} onChange={(e) => setForm({ ...form, match_deadline_hours: Number(e.target.value) })} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="label">{t('detail.editDeadline')}
                    <input type="datetime-local" className="input text-sm" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} />
                  </label>
                  <label className="label">{t('detail.editStart')}
                    <input type="datetime-local" className="input text-sm" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </label>
                </div>
                {!rosterValid && <p role="alert" className="text-sm text-red-500">{t('comps.rosterInvalid')}</p>}
                {form.name.trim() && (
                  <div className="rounded-xl border border-[var(--border)] p-2 text-xs opacity-80">
                    <p className="font-semibold opacity-60">{t('comps.preview')}</p>
                    <p className="mt-0.5">{form.name.trim()} · {typeText} · {form.min_players}–{form.max_players} {t('league4.players')}</p>
                  </div>
                )}
                {createError && <p role="alert" className="text-sm text-red-500">{createError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating || !rosterValid || !form.name.trim()} className="btn-primary h-11 flex-1 text-sm">
                    {creating ? t('comps.creating') : t('comps.create')}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost h-11 px-4 text-sm">{t('common.cancel')}</button>
                </div>
              </form>
          )}
        </div>
      )}

      <form onSubmit={handleJoinCode} className="card mt-3 flex gap-2">
        <input
          aria-label={t('comps.joinCode')}
          className="input h-12 flex-1 text-center font-mono text-lg tracking-widest uppercase"
          placeholder="VIK7X92" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12} required
        />
        <button type="submit" disabled={joining} className="btn-primary h-12 px-5">
          {joining ? t('comps.joining') : t('comps.join')}
        </button>
      </form>
      {joinError && <p role="alert" className="mt-1 text-sm text-red-500">{joinError}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {query.isLoading && <p className="text-sm">{t('comps.loading')}</p>}
        {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} compact />}
        {query.data?.length === 0 && <p className="card text-sm opacity-70">{t('comps.empty')}</p>}
        {query.data?.map((c) => <CompetitionCard key={c.id} comp={c} count={countsQuery.data?.[c.id]} />)}
      </div>
      <BottomNav />
    </main>
  );
}
