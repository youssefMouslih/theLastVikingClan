import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import CompetitionCard from '../components/competition/CompetitionCard';
import LeagueEntryCard from '../components/league4v4/LeagueEntryCard';
import LeagueDraftList from '../components/league4v4/LeagueDraftList';
import LeagueSeasonCreateForm from '../components/league4v4/LeagueSeasonCreateForm';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Motion';
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
  const competitions = query.data ?? [];
  const openRegistrations = competitions.filter((competition) => competition.status === 'REGISTRATION_OPEN').length;
  const activeCompetitions = competitions.filter((competition) => competition.status === 'ACTIVE').length;

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
    <main className="page max-w-4xl">
      <AppBar title={t('comps.title')} />
      <LeagueEntryCard />
      <section aria-label={t('comps.title')} className="hero relative isolate mt-4 !p-4 sm:!p-6">
        <Icon name="trophy" className="pointer-events-none absolute -end-3 -top-4 -z-10 h-32 w-32 rotate-12 text-brand-300 opacity-[0.08] sm:h-40 sm:w-40" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">{t('nav.league')}</p>
            <h2 className="font-display mt-1 text-xl tracking-wide sm:text-2xl">{t('comps.title')}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed opacity-75">{t('comps.standardHint')}</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowForm((s) => !s)}
              aria-expanded={showForm}
              aria-controls="competition-create-form"
              className="btn-primary h-11 shrink-0 px-4 text-sm"
            >
              <Icon name={showForm ? 'x' : 'plus'} className="h-4 w-4" />
              {showForm ? t('common.close') : t('comps.new')}
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 border-t border-white/10 pt-3 text-center">
          <div className="border-e border-white/10 px-1">
            <p className="font-display text-2xl tabular-nums">{query.isLoading || query.isError ? '—' : competitions.length}</p>
            <p className="text-[11px] leading-tight opacity-70">{t('comps.title')}</p>
          </div>
          <div className="border-e border-white/10 px-1">
            <p className="font-display text-2xl tabular-nums">{query.isLoading || query.isError ? '—' : openRegistrations}</p>
            <p className="text-[11px] leading-tight opacity-70">{t('status.REGISTRATION_OPEN')}</p>
          </div>
          <div className="px-1">
            <p className="font-display text-2xl tabular-nums">{query.isLoading || query.isError ? '—' : activeCompetitions}</p>
            <p className="text-[11px] leading-tight opacity-70">{t('status.ACTIVE')}</p>
          </div>
        </div>
      </section>
      {canCreate && showForm && (
        <div id="competition-create-form" className="mt-3 flex flex-col gap-2">
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

      <form onSubmit={handleJoinCode} className="card mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="label min-w-0 flex-1">{t('comps.joinCode')}
          <input
            className="input h-12 w-full text-center font-mono text-lg tracking-widest uppercase"
            placeholder="VIK7X92" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={12} required autoComplete="off" dir="ltr"
          />
        </label>
        <button type="submit" disabled={joining} className="btn-primary h-12 w-full px-5 sm:w-auto">
          <Icon name="users" className="h-4 w-4" />
          {joining ? t('comps.joining') : t('comps.join')}
        </button>
      </form>
      {joinError && <p role="alert" className="mt-1 text-sm text-red-500">{joinError}</p>}

      <section aria-label={t('comps.title')} className="mt-5">
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="card-title flex items-center gap-2">
            <Icon name="calendar" className="h-4 w-4 text-brand-400" />
            {t('comps.standard')}
          </h2>
          {!query.isLoading && !query.isError && competitions.length > 0 && (
            <span className="text-xs tabular-nums opacity-60">{competitions.length}</span>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {query.isLoading && <div className="sm:col-span-2" aria-busy="true" aria-label={t('comps.loading')}><SkeletonList rows={3} /></div>}
          {query.isError && <div className="sm:col-span-2"><QueryError error={query.error} onRetry={() => void query.refetch()} compact /></div>}
          {countsQuery.isError && !query.isError && <div className="sm:col-span-2"><QueryError error={countsQuery.error} onRetry={() => void countsQuery.refetch()} compact /></div>}
          {!query.isLoading && !query.isError && competitions.length === 0 && (
            <p className="card text-sm opacity-70 sm:col-span-2">{t('comps.empty')}</p>
          )}
          {!query.isLoading && !query.isError && competitions.map((c) => (
            <CompetitionCard key={c.id} comp={c} count={countsQuery.data?.[c.id]} />
          ))}
        </div>
        {countsQuery.isFetching && !countsQuery.isLoading && (
          <p role="status" className="mt-2 text-xs opacity-60">{t('common.loading')}</p>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
