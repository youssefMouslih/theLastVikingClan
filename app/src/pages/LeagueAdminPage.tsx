import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import { confirmDialog } from '../components/ui/confirm';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import StatusBadge from '../components/ui/StatusBadge';
import LeaguePenaltyPanel from '../components/league4v4/LeaguePenaltyPanel';
import TeamLogo from '../components/league4v4/TeamLogo';
import LeagueDraftList from '../components/league4v4/LeagueDraftList';
import LeagueSeasonCreateForm from '../components/league4v4/LeagueSeasonCreateForm';
import { getBadgeImageUrl, uploadBadgeImage } from '../services/storageService';
import LeagueTiebreakPanel from '../components/league4v4/LeagueTiebreakPanel';
import type { Dict } from '../i18n/dictionaries';
import { statusLabel, useLocale } from '../i18n/LocaleContext';
import {
  approveLeagueTeam,
  awardLeagueWinnerBadge,
  cancelLeagueSeason,
  generateLeagueFixtures,
  setLeagueSeasonRules,
  setLeagueSeasonStatus,
  setLeagueWinnerBadge,
  updateLeagueSeason,
} from '../services/leagueAdminService';
import { getLeagueSchedule } from '../services/leagueFixtureService';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { listLeagueTeams } from '../services/leagueTeamService';
import { getLeagueStandings } from '../services/leagueStandingsService';
import type { LeagueSeasonSettings, LeagueSeasonStatus } from '../types/league4v4';

type AdminTab = 'setup' | 'squads' | 'schedule' | 'disputes';

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
  const { t, fmtDate , tError} = useLocale();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(params.get('season') ?? '');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>('setup');

  const seasonsQuery = useQuery({
    queryKey: leagueKeys.seasons,
    queryFn: listLeagueSeasons,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const autoSelectedId = seasons.length > 0 ? pickCurrentLeagueSeason(seasons)?.id ?? seasons[0].id : '';
  const activeId = seasons.some((season) => season.id === selectedId) ? selectedId : autoSelectedId;
  const selected = useMemo(() => seasons.find((season) => season.id === activeId) ?? null, [seasons, activeId]);
  const draftSeasons = seasons.filter((season) => season.status === 'DRAFT');
  const otherDrafts = draftSeasons.filter((season) => season.id !== selected?.id);
  const showCreateForm = seasons.length === 0 || (tab === 'setup' && draftSeasons.length === 0);
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
  const winnerBadgeQuery = useQuery({
    queryKey: ['league-winner-badge', selected?.winner_badge_path],
    queryFn: () => getBadgeImageUrl(selected!.winner_badge_path),
    enabled: !!selected?.winner_badge_path,
  });
  const teams = teamsQuery.data ?? [];
  const winnerTeam = selected?.winner_team_id
    ? teams.find((team) => team.id === selected.winner_team_id) ?? null
    : null;
  const pendingTeams = teams.filter((team) => team.status === 'PENDING');
  const approvedTeams = teams.filter((team) => team.status === 'APPROVED');
  const reviewableTeams = teams.filter((team) => team.status === 'PENDING' || team.status === 'APPROVED');
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

  function chooseSeason(id: string) {
    setSelectedId(id);
    setParams(id ? { season: id } : {}, { replace: true });
  }

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key); setErr(null); setMsg(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(success);
    } catch (error) {
      setErr(tError(error));
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
    const rules = String(data.get('rules') ?? '');
    void run('update', async () => {
      await updateLeagueSeason(selected.id, settingsFromForm(form));
      await setLeagueSeasonRules(selected.id, rules);
    }, t('league4.seasonUpdated'));
  }

  async function changeStatus(status: LeagueSeasonStatus) {
    if (!selected) return;
    const message = t('league4.statusConfirmDetail', { name: selected.name, status: statusLabel(t, status) });
    if (!(await confirmDialog({ message }))) return;
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

  async function cancelSeason() {
    if (!selected) return;
    const message = t('league4.cancelSeasonConfirmCounts', {
      name: selected.name,
      teams: teams.length,
      fixtures: fixtures.length,
    });
    if (!(await confirmDialog({ message, danger: true }))) return;
    void run('cancel-season', async () => {
      await cancelLeagueSeason(selected.id);
      chooseSeason('');
    }, t('league4.seasonCancelled'));
  }

  async function uploadWinnerBadge(file: File) {
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErr(t('league4.winnerBadgeFile'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr(t('league4.winnerBadgeSize'));
      return;
    }
    setBusy('winner-badge'); setErr(null); setMsg(null);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = await uploadBadgeImage(file, `league-winner-${selected.id}-${Date.now()}.${ext}`);
      await setLeagueWinnerBadge(selected.id, path);
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(t('league4.winnerBadgeSaved'));
    } catch (error) {
      setErr(tError(error));
    } finally {
      setBusy(null);
    }
  }

  async function awardWinnerBadge() {
    if (!selected) return;
    let message = t('league4.awardWinnerConfirm', { name: selected.name });
    try {
      const standings = await getLeagueStandings(selected.id);
      const top = standings[0];
      const team = top ? teams.find((item) => item.id === top.team_id) : null;
      if (team) {
        message = t('league4.awardWinnerConfirmTeam', { name: selected.name, team: team.name, n: team.member_count });
      }
    } catch {
      // Fall back to the generic confirmation.
    }
    if (!(await confirmDialog({ message, danger: true }))) return;
    setBusy('award-badge'); setErr(null); setMsg(null);
    try {
      const awarded = await awardLeagueWinnerBadge(selected.id);
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(t('league4.winnerBadgeAwardedMsg', { n: awarded }));
    } catch (error) {
      setErr(tError(error));
    } finally {
      setBusy(null);
    }
  }

  async function generate(reset: boolean) {
    if (!selected) return;
    if (reset && !(await confirmDialog({ message: t('league4.regenerateConfirm'), danger: true }))) return;
    void run('generate', () => generateLeagueFixtures(selected.id, reset), reset ? t('league4.fixturesRegenerated') : t('league4.fixturesGenerated'));
  }

  const checklist: { key: string; label: keyof Dict; done: boolean; tab: AdminTab }[] = selected
    ? [
        { key: 'details', label: 'league4.checkDetails', done: !!selected.starts_at && !!selected.registration_closes_at, tab: 'setup' },
        { key: 'rules', label: 'league4.checkRules', done: !!selected.rules?.trim(), tab: 'setup' },
        { key: 'squads', label: 'league4.checkSquads', done: approvedTeams.length >= selected.min_teams, tab: 'squads' },
        { key: 'fixtures', label: 'league4.checkFixtures', done: fixtures.length > 0, tab: 'schedule' },
      ]
    : [];

  if (seasonsQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.admin')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }

  if (seasonsQuery.isError) {
    return <main className="page"><AppBar title={t('league4.admin')} /><QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} /><BottomNav /></main>;
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

      {showCreateForm && (
      <section className="card mt-3">
        <h2 className="card-title flex items-center gap-1"><Icon name="plus" className="h-4 w-4 text-brand-400" /> {t('league4.createSeason')}</h2>
        <div className="mt-2">
          <LeagueSeasonCreateForm
            onCreated={(id) => {
              chooseSeason(id);
              setMsg(t('league4.seasonCreated'));
            }}
          />
        </div>
      </section>
      )}

      {tab === 'setup' && otherDrafts.length > 0 && (
        <section className="card mt-3">
          <LeagueDraftList drafts={otherDrafts} onResume={chooseSeason} />
        </section>
      )}

      {seasons.length === 0 ? (
        <EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
      ) : (
        <>
          <section className="card mt-3">
            <h2 className="card-title">{t('league4.manageSeason')}</h2>
            <select value={activeId} onChange={(event) => chooseSeason(event.target.value)} className="input mt-2 text-sm">
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
                  <Link to={`/4vs4/teams?season=${selected.id}`} className="btn-ghost h-10 px-4 text-sm">{t('league4.teams')}</Link>
                  <Link to={`/4vs4/fixtures?season=${selected.id}`} className="btn-ghost h-10 px-4 text-sm">{t('league4.fixtures')}</Link>
                  <Link to={`/4vs4/standings?season=${selected.id}`} className="btn-ghost h-10 px-4 text-sm">{t('league4.standings')}</Link>
                  <Link to={`/4vs4/stats?season=${selected.id}`} className="btn-ghost h-10 px-4 text-sm">{t('league4.stats')}</Link>
                  <Link to={`/4vs4/disputes?season=${selected.id}`} className="btn-ghost h-10 px-4 text-sm">{t('league4.disputes')}</Link>
                  {(selected.status === 'DRAFT' || selected.status === 'REGISTRATION' || selected.status === 'ACTIVE') && (
                    <button type="button" disabled={!!busy} onClick={cancelSeason} className="btn-danger h-10 px-4 text-sm">
                      {busy === 'cancel-season' ? t('league4.cancellingSeason') : t('league4.cancelSeason')}
                    </button>
                  )}
                </div>
                {selected.status === 'REGISTRATION' && !scheduleReady && <p className="mt-2 text-xs opacity-60">{t('league4.activateRequirements')}</p>}
                {selected.status === 'ACTIVE' && !allFixturesFinal && <p className="mt-2 text-xs opacity-60">{t('league4.completeRequirements')}</p>}
              </section>
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 sm:grid-cols-4" role="tablist">
                {([
                  { id: 'setup', label: t('league4.tabSetup'), icon: 'gear' },
                  { id: 'squads', label: t('league4.tabSquads'), icon: 'users' },
                  { id: 'schedule', label: t('league4.tabSchedule'), icon: 'calendar' },
                  { id: 'disputes', label: t('league4.tabDisputes'), icon: 'shield' },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex h-10 items-center justify-center gap-1 rounded-lg text-xs font-semibold ${tab === item.id ? 'bg-brand-500 text-black' : 'opacity-60'}`}
                  >
                    <Icon name={item.icon} className="h-4 w-4" /> {item.label}
                  </button>
                ))}
              </div>

              {tab === 'setup' && (
                <section className="card mt-3">
                  <h2 className="card-title flex items-center gap-1"><Icon name="check" className="h-4 w-4 text-brand-400" /> {t('league4.setupChecklist')}</h2>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {checklist.map((item) => (
                      <li key={item.key} className="flex items-center gap-2 text-sm">
                        <span className={item.done ? 'text-brand-400' : 'text-accent-400'}>
                          <Icon name={item.done ? 'check' : 'alert'} className="h-4 w-4" />
                        </span>
                        <span className={`flex-1 ${item.done ? 'opacity-60' : ''}`}>{t(item.label)}</span>
                        {!item.done && (
                          <button type="button" onClick={() => setTab(item.tab)} className="text-xs font-semibold text-brand-400">
                            {t('league4.checkTodo')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {tab === 'schedule' && (
              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="trophy" className="h-4 w-4 text-brand-400" /> {t('league4.winnerBadge')}</h2>
                {selected.winner_badge_awarded_at ? (
                  <div className="mt-2 flex items-center gap-3">
                    {winnerBadgeQuery.data
                      ? <img src={winnerBadgeQuery.data} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                      : <Icon name="trophy" className="h-10 w-10 shrink-0 text-brand-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t('league4.winnerBadgeAwarded', { team: winnerTeam?.name ?? '—' })}</p>
                      <p className="mt-0.5 text-xs opacity-60">{t('league4.winnerBadgeAwardedHint')}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-xs opacity-60">{t('league4.winnerBadgeHint')}</p>
                    {selected.winner_badge_path && (
                      <div className="mt-2 flex items-center gap-3">
                        {winnerBadgeQuery.data
                          ? <img src={winnerBadgeQuery.data} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                          : <Icon name="trophy" className="h-10 w-10 shrink-0 text-brand-400" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{t('league4.winnerBadgeReady')}</p>
                          <p className="mt-0.5 text-xs opacity-60">
                            {selected.status === 'COMPLETED' || selected.status === 'ARCHIVED'
                              ? t('league4.winnerBadgeReadyHint')
                              : t('league4.winnerBadgePendingHint')}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className={`btn-primary h-11 cursor-pointer px-4 text-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                        {busy === 'winner-badge'
                          ? t('league4.uploadingWinnerBadge')
                          : selected.winner_badge_path ? t('league4.changeWinnerBadge') : t('league4.uploadWinnerBadge')}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          disabled={!!busy}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void uploadWinnerBadge(file);
                          }}
                        />
                      </label>
                      {(selected.status === 'COMPLETED' || selected.status === 'ARCHIVED') && selected.winner_badge_path && (
                        <button type="button" disabled={!!busy} onClick={() => void awardWinnerBadge()} className="btn-cta h-11 px-4 text-sm">
                          {busy === 'award-badge' ? t('league4.awardingWinnerBadge') : t('league4.awardWinnerBadge')}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
              )}

              {canEdit && tab === 'setup' && (
                <form key={selected.id} onSubmit={handleUpdate} className="card mt-3 flex flex-col gap-2">
                  <h2 className="card-title">{t('league4.editSeason')}</h2>
                  <label className="label">{t('league4.seasonName')}
                    <input name="name" required minLength={2} maxLength={80} defaultValue={selected.name} className="input text-sm" />
                  </label>
                  <label className="label">{t('league4.description')}
                    <textarea name="description" maxLength={2000} rows={2} defaultValue={selected.description ?? ''} className="input text-sm" />
                  </label>
                  <label className="label">{t('league4.rules')}
                    <textarea name="rules" maxLength={5000} rows={5} defaultValue={selected.rules ?? ''} placeholder={t('league4.rulesPlaceholder')} className="input text-sm" />
                  </label>
                  <p className="-mt-1 text-xs opacity-60">{t('league4.rulesHint')}</p>
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

              {tab === 'schedule' && (
              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="calendar" className="h-4 w-4 text-brand-400" /> {t('league4.schedule')}</h2>
                {scheduleQuery.isLoading ? (
                  <p className="mt-2 text-sm opacity-60">{t('common.loading')}</p>
                ) : scheduleQuery.isError ? (
                  <QueryError error={scheduleQuery.error} onRetry={() => void scheduleQuery.refetch()} compact />
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
              )}

              {tab === 'disputes' && (
                <>
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
                </>
              )}

              {tab === 'squads' && (
              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="shield" className="h-4 w-4 text-brand-400" /> {t('league4.teamApprovals')}</h2>
                <p className="mt-1 text-xs opacity-60">{approvedTeams.length}/{reviewableTeams.length} {t('league4.approved')}</p>
                {pendingTeams.length === 0 ? (
                  <p className="mt-2 text-sm opacity-60">{t('league4.noPendingTeams')}</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {pendingTeams.map((team) => (
                      <div key={team.id} className="rounded-xl border border-[var(--border)] p-2">
                        <div className="flex items-center gap-2">
                          <TeamLogo path={team.logo_path} name={team.name} className="h-8 w-8 text-sm" rounded="rounded-lg" />
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
                        {team.member_count < selected.roster_min && (
                          <p className="mt-1 text-[10px] text-red-400">{t('league4.approvalNeedsRoster', { min: selected.roster_min, current: team.member_count })}</p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={!!busy || team.member_count < selected.roster_min} onClick={() => approve(team.id, true)} className="btn-primary h-9 flex-1 text-xs">{t('league4.approve')}</button>
                          <button type="button" disabled={!!busy} onClick={() => approve(team.id, false)} className="btn-danger h-9 flex-1 text-xs">{t('league4.reject')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              )}
            </>
          )}
        </>
      )}
      <BottomNav />
    </main>
  );
}
