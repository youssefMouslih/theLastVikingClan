import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import LeaguePenaltyPanel from '../components/league4v4/LeaguePenaltyPanel';
import LeagueTiebreakPanel from '../components/league4v4/LeagueTiebreakPanel';
import { statusLabel, useLocale } from '../i18n/LocaleContext';
import {
  approveLeagueTeam,
  createLeagueSeason,
  generateLeagueFixtures,
  setLeagueSeasonStatus,
  updateLeagueSeason,
} from '../services/leagueAdminService';
import { getLeagueSchedule } from '../services/leagueFixtureService';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { listLeagueTeams } from '../services/leagueTeamService';
import type { LeagueSeasonSettings, LeagueSeasonStatus } from '../types/league4v4';

type SeasonForm = {
  name: string;
  description: string;
  registration_opens_at: string;
  registration_closes_at: string;
  starts_at: string;
  matchday_days: number;
  min_teams: number;
  max_teams: number;
  roster_min: number;
  roster_max: number;
};

const EMPTY_FORM: SeasonForm = {
  name: '',
  description: '',
  registration_opens_at: '',
  registration_closes_at: '',
  starts_at: '',
  matchday_days: 7,
  min_teams: 4,
  max_teams: 8,
  roster_min: 6,
  roster_max: 8,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toISO(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function settingsFromForm(form: SeasonForm): LeagueSeasonSettings {
  return {
    name: form.name,
    description: form.description || null,
    registration_opens_at: toISO(form.registration_opens_at),
    registration_closes_at: toISO(form.registration_closes_at),
    starts_at: toISO(form.starts_at),
    matchday_days: form.matchday_days,
    min_teams: form.min_teams,
    max_teams: form.max_teams,
    roster_min: form.roster_min,
    roster_max: form.roster_max,
  };
}

export default function LeagueAdminPage() {
  const { t, fmtDate } = useLocale();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [createForm, setCreateForm] = useState<SeasonForm>(EMPTY_FORM);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const autoSelectedId = seasons.length > 0 ? pickCurrentLeagueSeason(seasons)?.id ?? seasons[0].id : '';
  const activeId = selectedId || autoSelectedId;
  const selected = useMemo(() => seasons.find((season) => season.id === activeId) ?? null, [seasons, activeId]);
  const teamsQuery = useQuery({
    queryKey: leagueKeys.teams(activeId || 'none'),
    queryFn: () => listLeagueTeams(activeId),
    enabled: !!selected,
  });
  const scheduleQuery = useQuery({
    queryKey: leagueKeys.schedule(activeId || 'none'),
    queryFn: () => getLeagueSchedule(activeId),
    enabled: !!selected,
  });
  const teams = teamsQuery.data ?? [];
  const pendingTeams = teams.filter((team) => team.status === 'PENDING');
  const approvedTeams = teams.filter((team) => team.status === 'APPROVED');
  const fixtures = scheduleQuery.data?.fixtures ?? [];
  const matchdays = scheduleQuery.data?.matchdays.length ?? 0;
  const expectedMatchdays = approvedTeams.length === 0 ? 0 : approvedTeams.length % 2 === 0 ? 2 * (approvedTeams.length - 1) : 2 * approvedTeams.length;
  const expectedFixtures = approvedTeams.length * (approvedTeams.length - 1);
  const scheduleReady = !!selected
    && !!selected.starts_at
    && approvedTeams.length >= selected.min_teams
    && approvedTeams.length <= selected.max_teams
    && matchdays === expectedMatchdays
    && fixtures.length === expectedFixtures;
  const allFixturesFinal = fixtures.length > 0 && fixtures.every((fixture) => ['COMPLETED', 'FORFEITED', 'CANCELLED'].includes(fixture.status));
  const canEdit = !!selected && (selected.status === 'DRAFT' || selected.status === 'REGISTRATION');
  const canGenerate = !!selected && (selected.status === 'DRAFT' || selected.status === 'REGISTRATION' || selected.status === 'ACTIVE');

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key); setErr(null); setMsg(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(success);
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create'); setErr(null); setMsg(null);
    try {
      const id = await createLeagueSeason(settingsFromForm(createForm));
      await queryClient.invalidateQueries({ queryKey: leagueKeys.seasons });
      setSelectedId(id);
      setCreateForm(EMPTY_FORM);
      setMsg(t('league4.seasonCreated'));
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
    } finally {
      setBusy(null);
    }
  }

  function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const form: SeasonForm = {
      name: String(data.get('name') ?? ''),
      description: String(data.get('description') ?? ''),
      registration_opens_at: String(data.get('registration_opens_at') ?? ''),
      registration_closes_at: String(data.get('registration_closes_at') ?? ''),
      starts_at: String(data.get('starts_at') ?? ''),
      matchday_days: Number(data.get('matchday_days')),
      min_teams: Number(data.get('min_teams')),
      max_teams: Number(data.get('max_teams')),
      roster_min: Number(data.get('roster_min')),
      roster_max: Number(data.get('roster_max')),
    };
    void run('update', () => updateLeagueSeason(selected.id, settingsFromForm(form)), t('league4.seasonUpdated'));
  }

  function changeStatus(status: LeagueSeasonStatus) {
    if (!selected) return;
    if (!confirm(t('league4.statusConfirm', { status: statusLabel(t, status) }))) return;
    void run(`status-${status}`, () => setLeagueSeasonStatus(selected.id, status), t('league4.statusChanged'));
  }

  function approve(teamId: string, approveTeam: boolean) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) return;
    void run(
      `${approveTeam ? 'approve' : 'reject'}-${teamId}`,
      () => approveLeagueTeam(teamId, approveTeam, notes[teamId]),
      approveTeam ? t('league4.teamApproved') : t('league4.teamRejected'),
    );
  }

  function generate(reset: boolean) {
    if (!selected) return;
    if (reset && !confirm(t('league4.regenerateConfirm'))) return;
    void run('generate', () => generateLeagueFixtures(selected.id, reset), reset ? t('league4.fixturesRegenerated') : t('league4.fixturesGenerated'));
  }

  if (seasonsQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.admin')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }

  return (
    <main className="page">
      <AppBar title={t('league4.admin')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{t('league4.title')}</p>
      </div>

      {err && <p role="alert" className="mt-2 rounded-lg border border-red-500/40 p-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 rounded-lg border border-brand-500/40 p-2 text-sm text-brand-400">{msg}</p>}

      <form onSubmit={handleCreate} className="card mt-3 flex flex-col gap-2">
        <h2 className="card-title flex items-center gap-1"><Icon name="plus" className="h-4 w-4 text-brand-400" /> {t('league4.createSeason')}</h2>
        <label className="label">{t('league4.seasonName')}
          <input required minLength={2} maxLength={80} value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.description')}
          <textarea maxLength={2000} rows={2} value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} className="input text-sm" />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="label">{t('league4.registrationOpens')}
            <input type="datetime-local" value={createForm.registration_opens_at} onChange={(event) => setCreateForm({ ...createForm, registration_opens_at: event.target.value })} className="input text-sm" />
          </label>
          <label className="label">{t('league4.registrationCloses')}
            <input type="datetime-local" value={createForm.registration_closes_at} onChange={(event) => setCreateForm({ ...createForm, registration_closes_at: event.target.value })} className="input text-sm" />
          </label>
        </div>
        <label className="label">{t('league4.startsAt')}
          <input type="datetime-local" value={createForm.starts_at} onChange={(event) => setCreateForm({ ...createForm, starts_at: event.target.value })} className="input text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="label">{t('league4.matchdayLength')} ({t('league4.daysShort')})
            <input type="number" min={1} max={14} value={createForm.matchday_days} onChange={(event) => setCreateForm({ ...createForm, matchday_days: Number(event.target.value) })} className="input text-sm" />
          </label>
          <label className="label">{t('league4.minTeams')}
            <input type="number" min={4} max={16} value={createForm.min_teams} onChange={(event) => setCreateForm({ ...createForm, min_teams: Number(event.target.value) })} className="input text-sm" />
          </label>
          <label className="label">{t('league4.maxTeams')}
            <input type="number" min={4} max={16} value={createForm.max_teams} onChange={(event) => setCreateForm({ ...createForm, max_teams: Number(event.target.value) })} className="input text-sm" />
          </label>
          <label className="label">{t('league4.rosterMin')}
            <input type="number" min={6} max={8} value={createForm.roster_min} onChange={(event) => setCreateForm({ ...createForm, roster_min: Number(event.target.value) })} className="input text-sm" />
          </label>
          <label className="label">{t('league4.rosterMax')}
            <input type="number" min={6} max={8} value={createForm.roster_max} onChange={(event) => setCreateForm({ ...createForm, roster_max: Number(event.target.value) })} className="input text-sm" />
          </label>
        </div>
        <button type="submit" disabled={busy === 'create' || createForm.name.trim().length < 2} className="btn-primary h-11 text-sm">
          {busy === 'create' ? t('league4.creatingSeason') : t('league4.createSeason')}
        </button>
      </form>

      {seasons.length === 0 ? (
        <EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
      ) : (
        <>
          <section className="card mt-3">
            <h2 className="card-title">{t('league4.manageSeason')}</h2>
            <select value={activeId} onChange={(event) => setSelectedId(event.target.value)} className="input mt-2 text-sm">
              {seasons.map((season) => <option key={season.id} value={season.id}>{season.name} · {statusLabel(t, season.status)}</option>)}
            </select>
          </section>

          {selected && (
            <>
              <section className="hero hero-glow mt-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-display min-w-0 flex-1 truncate text-xl tracking-wide">{selected.name}</h2>
                  <StatusBadge value={selected.status} />
                </div>
                <p className="mt-1 text-xs opacity-60">
                  {selected.starts_at ? fmtDate(selected.starts_at) : t('league4.startNotSet')} · {selected.roster_min}–{selected.roster_max} {t('league4.players')} · {selected.min_teams}–{selected.max_teams} {t('league4.teams')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selected.status === 'DRAFT' && <button type="button" disabled={!!busy} onClick={() => changeStatus('REGISTRATION')} className="btn-primary h-10 px-4 text-sm">{t('league4.openRegistration')}</button>}
                  {selected.status === 'REGISTRATION' && <button type="button" disabled={!!busy || !scheduleReady} onClick={() => changeStatus('ACTIVE')} className="btn-primary h-10 px-4 text-sm">{t('league4.activateSeason')}</button>}
                  {selected.status === 'ACTIVE' && <button type="button" disabled={!!busy || !allFixturesFinal} onClick={() => changeStatus('COMPLETED')} className="btn-ghost h-10 px-4 text-sm">{t('league4.completeSeason')}</button>}
                  {selected.status === 'COMPLETED' && <button type="button" disabled={!!busy} onClick={() => changeStatus('ARCHIVED')} className="btn-ghost h-10 px-4 text-sm">{t('league4.archiveSeason')}</button>}
                  <Link to="/4vs4/teams" className="btn-ghost h-10 px-4 text-sm">{t('league4.teams')}</Link>
                  <Link to="/4vs4/fixtures" className="btn-ghost h-10 px-4 text-sm">{t('league4.fixtures')}</Link>
                  <Link to="/4vs4/standings" className="btn-ghost h-10 px-4 text-sm">{t('league4.standings')}</Link>
                  <Link to="/4vs4/stats" className="btn-ghost h-10 px-4 text-sm">{t('league4.stats')}</Link>
                  <Link to="/4vs4/disputes" className="btn-ghost h-10 px-4 text-sm">{t('league4.disputes')}</Link>
                </div>
                {selected.status === 'REGISTRATION' && !scheduleReady && <p className="mt-2 text-xs opacity-60">{t('league4.activateRequirements')}</p>}
                {selected.status === 'ACTIVE' && !allFixturesFinal && <p className="mt-2 text-xs opacity-60">{t('league4.completeRequirements')}</p>}
              </section>

              {canEdit && (
                <form key={selected.id} onSubmit={handleUpdate} className="card mt-3 flex flex-col gap-2">
                  <h2 className="card-title">{t('league4.editSeason')}</h2>
                  <label className="label">{t('league4.seasonName')}
                    <input name="name" required minLength={2} maxLength={80} defaultValue={selected.name} className="input text-sm" />
                  </label>
                  <label className="label">{t('league4.description')}
                    <textarea name="description" maxLength={2000} rows={2} defaultValue={selected.description ?? ''} className="input text-sm" />
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="label">{t('league4.registrationOpens')}
                      <input name="registration_opens_at" type="datetime-local" defaultValue={toLocalInput(selected.registration_opens_at)} className="input text-sm" />
                    </label>
                    <label className="label">{t('league4.registrationCloses')}
                      <input name="registration_closes_at" type="datetime-local" defaultValue={toLocalInput(selected.registration_closes_at)} className="input text-sm" />
                    </label>
                  </div>
                  <label className="label">{t('league4.startsAt')}
                    <input name="starts_at" type="datetime-local" defaultValue={toLocalInput(selected.starts_at)} className="input text-sm" />
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <label className="label">{t('league4.matchdayLength')} ({t('league4.daysShort')})
                      <input name="matchday_days" type="number" min={1} max={14} defaultValue={selected.matchday_days} className="input text-sm" />
                    </label>
                    <label className="label">{t('league4.minTeams')}
                      <input name="min_teams" type="number" min={4} max={16} defaultValue={selected.min_teams} className="input text-sm" />
                    </label>
                    <label className="label">{t('league4.maxTeams')}
                      <input name="max_teams" type="number" min={4} max={16} defaultValue={selected.max_teams} className="input text-sm" />
                    </label>
                    <label className="label">{t('league4.rosterMin')}
                      <input name="roster_min" type="number" min={6} max={8} defaultValue={selected.roster_min} className="input text-sm" />
                    </label>
                    <label className="label">{t('league4.rosterMax')}
                      <input name="roster_max" type="number" min={6} max={8} defaultValue={selected.roster_max} className="input text-sm" />
                    </label>
                  </div>
                  <button type="submit" disabled={busy === 'update'} className="btn-primary h-10 text-sm">{t('league4.saveSeason')}</button>
                </form>
              )}

              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="calendar" className="h-4 w-4 text-brand-400" /> {t('league4.schedule')}</h2>
                {scheduleQuery.isLoading ? (
                  <p className="mt-2 text-sm opacity-60">{t('common.loading')}</p>
                ) : (
                  <p className="mt-1 text-xs opacity-70">
                    {fixtures.length} {t('league4.fixtures')} · {scheduleQuery.data?.matchdays.length ?? 0} {t('league4.matchdays')}
                  </p>
                )}
                {approvedTeams.length < selected.min_teams && (
                  <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.notEnoughTeams', { n: approvedTeams.length, min: selected.min_teams })}</p>
                )}
                {approvedTeams.length > selected.max_teams && (
                  <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.tooManyTeams', { n: approvedTeams.length, max: selected.max_teams })}</p>
                )}
                {!selected.starts_at && <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.startNotSetHint')}</p>}
                {canGenerate && (
                  <button type="button" disabled={!!busy || approvedTeams.length < selected.min_teams || approvedTeams.length > selected.max_teams || !selected.starts_at} onClick={() => generate(fixtures.length > 0)} className="btn-primary mt-2 h-10 w-full text-sm">
                    {fixtures.length > 0 ? t('league4.regenerateFixtures') : t('league4.generateFixtures')}
                  </button>
                )}
              </section>

              <LeaguePenaltyPanel
                key={`penalties-${selected.id}`}
                seasonId={selected.id}
                seasonStatus={selected.status}
                teams={approvedTeams}
                matchdays={scheduleQuery.data?.matchdays ?? []}
              />

              <LeagueTiebreakPanel
                key={`tiebreak-${selected.id}`}
                seasonId={selected.id}
                seasonStatus={selected.status}
                teams={approvedTeams}
              />

              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="shield" className="h-4 w-4 text-brand-400" /> {t('league4.teamApprovals')}</h2>
                <p className="mt-1 text-xs opacity-60">{approvedTeams.length}/{teams.length} {t('league4.approved')}</p>
                {pendingTeams.length === 0 ? (
                  <p className="mt-2 text-sm opacity-60">{t('league4.noPendingTeams')}</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {pendingTeams.map((team) => (
                      <div key={team.id} className="rounded-xl border border-[var(--border)] p-2">
                        <div className="flex items-center gap-2">
                          <Link to={`/4vs4/teams/${team.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold">{team.name}</Link>
                          <span className={`text-xs ${team.member_count >= selected.roster_min ? 'text-brand-400' : 'text-red-400'}`}>{team.member_count}/{selected.roster_max}</span>
                        </div>
                        <input
                          value={notes[team.id] ?? ''}
                          onChange={(event) => setNotes({ ...notes, [team.id]: event.target.value })}
                          className="input mt-2 h-9 text-xs"
                          maxLength={500}
                          placeholder={t('league4.adminNote')}
                        />
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={!!busy || team.member_count < selected.roster_min} onClick={() => approve(team.id, true)} className="btn-primary h-9 flex-1 text-xs">{t('league4.approve')}</button>
                          <button type="button" disabled={!!busy} onClick={() => approve(team.id, false)} className="btn-danger h-9 flex-1 text-xs">{t('league4.reject')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
      <BottomNav />
    </main>
  );
}
