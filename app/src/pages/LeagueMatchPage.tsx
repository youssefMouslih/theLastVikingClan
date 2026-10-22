import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import LeagueDuelCard from '../components/league4v4/LeagueDuelCard';
import LeagueDuelResultPanel from '../components/league4v4/LeagueDuelResultPanel';
import LeagueLineupEditor from '../components/league4v4/LeagueLineupEditor';
import LeagueLineupView from '../components/league4v4/LeagueLineupView';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { Countdown, EmptyState, LoadingRegion } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import TeamLogo from '../components/league4v4/TeamLogo';
import { lineupLockReason, opponentLineupVisible, type LineupLockReason } from '../competition/league4v4/lineup';
import { isOpenDisputeStatus, type ResultDraft } from '../competition/league4v4/result';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import {
  confirmLeagueDuelResult,
  disputeLeagueDuel,
  getLeagueFixtureDetail,
  listLeagueDuels,
  listLeagueDuelReports,
  listLeagueFixtureDisputes,
  listLeagueLineups,
  listLeagueSubstitutions,
  startLeagueDuel,
  submitLeagueDuelResult,
  submitLeagueLineup,
  substituteLeaguePlayer,
} from '../services/leagueDuelService';
import { findMyLeagueTeam } from '../services/leagueTeamService';
import { deleteStoredFile, uploadLeagueEvidence } from '../services/storageService';
import { useAuthStore } from '../stores/authStore';
import type { LeagueLineupEntry } from '../types/league4v4';

export default function LeagueMatchPage() {
  const { t, fmtDate , tError} = useLocale();
  const { fixtureId } = useParams();
  const me = useAuthStore((state) => state.profile);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fixtureQuery = useQuery({
    queryKey: leagueKeys.fixture(fixtureId ?? 'none'),
    queryFn: () => getLeagueFixtureDetail(fixtureId!),
    enabled: !!fixtureId,
  });
  const fixture = fixtureQuery.data ?? null;
  const seasonId = fixture?.season_id;
  const myTeamQuery = useQuery({
    queryKey: leagueKeys.myTeam(seasonId ?? 'none', me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(seasonId!, me!.id),
    enabled: !!seasonId && !!me,
  });
  const myTeam = myTeamQuery.data ?? null;
  const isStaff = me?.role === 'OWNER' || me?.role === 'ADMIN' || me?.role === 'MODERATOR';
  const isParticipant = !!myTeam && !!fixture && (myTeam.id === fixture.home_team_id || myTeam.id === fixture.away_team_id);
  const isCaptain = isParticipant && myTeam?.captain_id === me?.id;

  const revealed = !!fixture && opponentLineupVisible(fixture.status);
  const lineupsQuery = useQuery({
    queryKey: leagueKeys.lineups(fixtureId ?? 'none'),
    queryFn: () => listLeagueLineups(fixtureId!),
    enabled: !!fixture,
  });
  const duelsQuery = useQuery({
    queryKey: leagueKeys.duels(fixtureId ?? 'none'),
    queryFn: () => listLeagueDuels(fixtureId!),
    enabled: !!fixture && revealed,
  });
  const substitutionsQuery = useQuery({
    queryKey: leagueKeys.substitutions(fixtureId ?? 'none'),
    queryFn: () => listLeagueSubstitutions(fixtureId!),
    enabled: !!fixture && revealed,
  });
  const reportsQuery = useQuery({
    queryKey: leagueKeys.reports(fixtureId ?? 'none'),
    queryFn: () => listLeagueDuelReports((duelsQuery.data ?? []).map((duel) => duel.id)),
    enabled: !!fixture && revealed && (duelsQuery.data?.length ?? 0) > 0,
  });
  const disputesQuery = useQuery({
    queryKey: leagueKeys.fixtureDisputes(fixtureId ?? 'none'),
    queryFn: () => listLeagueFixtureDisputes((duelsQuery.data ?? []).map((duel) => duel.id)),
    enabled: !!fixture && revealed && (duelsQuery.data?.length ?? 0) > 0,
  });

  const lineups = lineupsQuery.data ?? [];
  const duels = duelsQuery.data ?? [];
  const substitutions = substitutionsQuery.data ?? [];
  const reports = reportsQuery.data ?? [];
  const fixtureDisputes = disputesQuery.data ?? [];
  const myLineup = myTeam ? lineups.find((lineup) => lineup.team_id === myTeam.id) ?? null : null;
  const opponentTeamId = fixture
    ? fixture.home_team_id === myTeam?.id
      ? fixture.away_team_id
      : fixture.home_team_id
    : null;
  const opponentLineup = opponentTeamId ? lineups.find((lineup) => lineup.team_id === opponentTeamId) ?? null : null;
  const homeLineup = lineups.find((lineup) => lineup.team_id === fixture?.home_team_id) ?? null;
  const awayLineup = lineups.find((lineup) => lineup.team_id === fixture?.away_team_id) ?? null;

  const lockReason: LineupLockReason | null = fixture
    ? lineupLockReason({
        seasonStatus: fixture.season?.status,
        fixtureStatus: fixture.status,
        deadline: fixture.matchday?.deadline,
        lineupStatus: myLineup?.status,
      })
    : null;
  const canEditLineup = isCaptain && lockReason === null;
  const bench = useMemo(() => {
    if (!myTeam || !myLineup) return [];
    const benchIds = new Set(
      myLineup.players.filter((entry) => entry.role === 'SUB').map((entry) => entry.player_id),
    );
    return myTeam.members.filter((member) => benchIds.has(member.player_id));
  }, [myLineup, myTeam]);

  const homeName = fixture?.home?.name ?? '—';
  const awayName = fixture?.away?.name ?? '—';
  const finalScore = fixture && (fixture.status === 'COMPLETED' || fixture.status === 'FORFEITED');

  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    setErr(null);
    setMsg(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(success);
    } catch (error) {
      setErr(tError(error));
      throw error;
    } finally {
      setBusy(null);
    }
  }

  function handleSubmitLineup(entries: LeagueLineupEntry[]) {
    if (!fixture) return;
    void run('lineup', () => submitLeagueLineup(fixture.id, entries), t('league4.lineupSubmitted')).catch(() => {});
  }

  function handleStartDuel(duelId: string) {
    void run(`start-${duelId}`, () => startLeagueDuel(duelId), t('league4.duelStarted')).catch(() => {});
  }

  function handleSubstitute(duelId: string, outPlayerId: string, inPlayerId: string) {
    void run(`sub-${duelId}`, () => substituteLeaguePlayer(duelId, outPlayerId, inPlayerId), t('league4.substitutionDone')).catch(() => {});
  }

  function handleSubmitResult(duelId: string, input: ResultDraft, file: File | null): Promise<void> {
    if (!fixture || !me) return Promise.resolve();
    const existing = reports.find((report) => report.duel_id === duelId && report.player_id === me.id) ?? null;
    return run(`result-${duelId}`, async () => {
      let uploadedPath: string | null = null;
      let evidencePath = existing?.evidence_path ?? null;
      if (file) {
        uploadedPath = await uploadLeagueEvidence(file, fixture.season_id, fixture.id, duelId, me.id);
        evidencePath = uploadedPath;
      }
      if (!evidencePath) throw new Error(t('league4.resultEvidenceRequired'));
      try {
        await submitLeagueDuelResult(duelId, { ...input, evidence_path: evidencePath });
      } catch (error) {
        if (uploadedPath) await deleteStoredFile('match-evidence', uploadedPath).catch(() => {});
        throw error;
      }
      if (uploadedPath && existing?.evidence_path && existing.evidence_path !== uploadedPath) {
        await deleteStoredFile('match-evidence', existing.evidence_path).catch(() => {});
      }
    }, t('league4.resultSubmitted'));
  }

  function handleConfirmResult(duelId: string): Promise<void> {
    return run(`confirm-${duelId}`, () => confirmLeagueDuelResult(duelId), t('league4.resultConfirmed'));
  }

  function handleDispute(duelId: string, reason: string, file: File | null): Promise<void> {
    if (!fixture || !me) return Promise.resolve();
    return run(`dispute-${duelId}`, async () => {
      let uploadedPath: string | null = null;
      if (file) uploadedPath = await uploadLeagueEvidence(file, fixture.season_id, fixture.id, duelId, me.id);
      try {
        await disputeLeagueDuel(duelId, reason, uploadedPath);
      } catch (error) {
        if (uploadedPath) await deleteStoredFile('match-evidence', uploadedPath).catch(() => {});
        throw error;
      }
    }, t('league4.resultDisputeOpened'));
  }

  function lockMessage(reason: LineupLockReason): string {
    if (reason === 'SEASON') return t('league4.lineupLockedSeason');
    if (reason === 'FIXTURE') return t('league4.lineupLockedFixture');
    if (reason === 'DEADLINE') return t('league4.lineupLockedDeadline');
    return t('league4.lineupLockedRevealed');
  }

  function disputeForDuel(duelId: string) {
    const list = fixtureDisputes.filter((dispute) => dispute.duel_id === duelId);
    return list.find((dispute) => isOpenDisputeStatus(dispute.status)) ?? list[0] ?? null;
  }

  if (fixtureQuery.isLoading || myTeamQuery.isLoading || lineupsQuery.isLoading) {
    return (
      <main className="page">
        <AppBar title={t('league4.match')} />
        <LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion>
        <BottomNav />
      </main>
    );
  }

  if (!fixture) {
    return (
      <main className="page">
        <AppBar title={t('league4.match')} />
        <EmptyState icon={<Icon name="swords" />} title={t('league4.matchNotFound')} />
        <Link to="/4vs4/fixtures" className="btn-ghost mt-3 h-11 w-full">{t('league4.fixtures')}</Link>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="page">
      <AppBar title={t('league4.match')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4/fixtures" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">
          {fixture.season?.name ?? t('league4.title')}
          {fixture.matchday ? ` · ${t('league4.matchday')} ${fixture.matchday.number}` : ''}
        </p>
        <StatusBadge value={fixture.status} />
      </div>

      <section className="hero hero-glow mt-3">
        <div className="flex items-center gap-2">
          <Link to={`/4vs4/teams/${fixture.home_team_id}`} className="flex min-w-0 flex-1 items-center justify-end gap-2 font-display text-lg font-bold">
            <span className="truncate">{homeName}</span>
            <TeamLogo path={fixture.home?.logo_path} name={homeName} className="h-9 w-9 text-sm" rounded="rounded-lg" />
          </Link>
          <span className="font-display shrink-0 text-xl font-bold tabular-nums">
            {finalScore ? `${fixture.home_duel_wins}–${fixture.away_duel_wins}` : 'vs'}
          </span>
          <Link to={`/4vs4/teams/${fixture.away_team_id}`} className="flex min-w-0 flex-1 items-center gap-2 font-display text-lg font-bold">
            <TeamLogo path={fixture.away?.logo_path} name={awayName} className="h-9 w-9 text-sm" rounded="rounded-lg" />
            <span className="truncate">{awayName}</span>
          </Link>
        </div>
        {finalScore && (
          <p className="mt-1 text-center text-xs opacity-70">
            {t('league4.points')}: {fixture.home_points}–{fixture.away_points}
          </p>
        )}
        {fixture.status === 'FORFEITED' && (
          <p className="mt-1 text-center text-xs text-orange-400">{t('league4.fixtureForfeitedHint')}</p>
        )}
        {fixture.status === 'CANCELLED' && (
          <p className="mt-1 text-center text-xs opacity-70">{t('league4.fixtureCancelledHint')}</p>
        )}
        {fixture.matchday && (
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs opacity-70">
            <span className="flex items-center gap-1">
              <Icon name="clock" className="h-3.5 w-3.5" /> {t('league4.lineupDeadline')}: {fmtDate(fixture.matchday.deadline)}
            </span>
            {!finalScore && <Countdown deadline={fixture.matchday.deadline} />}
          </p>
        )}
      </section>

      {err && <p role="alert" className="mt-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 text-sm text-brand-400">{msg}</p>}

      {isParticipant && (
        <section className="card mt-3">
          <div className="flex items-center gap-2">
            <h2 className="card-title min-w-0 flex-1 flex items-center gap-1">
              <Icon name="users" className="h-4 w-4 text-brand-400" /> {t('league4.myLineup')}
            </h2>
            {myLineup && <StatusBadge value={myLineup.status} />}
          </div>
          {canEditLineup ? (
            <LeagueLineupEditor
              key={myLineup ? `${myLineup.id}-${myLineup.version}` : 'new'}
              roster={myTeam?.members ?? []}
              lineup={myLineup}
              busy={busy === 'lineup'}
              onSubmit={handleSubmitLineup}
            />
          ) : (
            <>
              <LeagueLineupView
                lineup={myLineup}
                emptyHint={isCaptain ? t('league4.lineupNotSubmitted') : t('league4.captainSubmitLineup')}
              />
              {lockReason && <p className="mt-2 text-xs opacity-60">{lockMessage(lockReason)}</p>}
            </>
          )}
        </section>
      )}

      {isParticipant && (
        <section className="card mt-3">
          <div className="flex items-center gap-2">
            <h2 className="card-title min-w-0 flex-1 flex items-center gap-1">
              <Icon name="shield" className="h-4 w-4 text-brand-400" /> {t('league4.opponentLineup')}
            </h2>
            {opponentLineup && <StatusBadge value={opponentLineup.status} />}
          </div>
          {revealed || isStaff ? (
            <LeagueLineupView lineup={opponentLineup} />
          ) : (
            <LeagueLineupView lineup={null} hidden />
          )}
          {isStaff && !revealed && opponentLineup && (
            <p className="mt-2 text-xs text-accent-400">{t('league4.staffPreview')}</p>
          )}
        </section>
      )}

      {!isParticipant && isStaff && (
        <>
          <section className="card mt-3">
            <h2 className="card-title">{homeName}</h2>
            <LeagueLineupView lineup={homeLineup} />
            {!revealed && homeLineup && <p className="mt-2 text-xs text-accent-400">{t('league4.staffPreview')}</p>}
          </section>
          <section className="card mt-3">
            <h2 className="card-title">{awayName}</h2>
            <LeagueLineupView lineup={awayLineup} />
            {!revealed && awayLineup && <p className="mt-2 text-xs text-accent-400">{t('league4.staffPreview')}</p>}
          </section>
        </>
      )}

      {!isParticipant && !isStaff && (
        <p className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs opacity-60">
          {t('league4.lineupSpectatorHint')}
        </p>
      )}

      <section className="card mt-3">
        <h2 className="card-title flex items-center gap-1">
          <Icon name="swords" className="h-4 w-4 text-brand-400" /> {t('league4.duels')}
        </h2>
        {!revealed ? (
          <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
            <Icon name="lock" className="mx-auto h-5 w-5 opacity-50" />
            <p className="mt-1 text-sm font-semibold">{t('league4.duelsAfterReveal')}</p>
            <p className="mt-0.5 text-xs opacity-60">{t('league4.duelsAfterRevealHint')}</p>
          </div>
        ) : duels.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">{t('league4.duelsAfterReveal')}</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {duels.map((duel) => (
              <LeagueDuelCard
                key={duel.id}
                duel={duel}
                homeName={homeName}
                awayName={awayName}
                myPlayerId={me?.id}
                myTeamId={isParticipant ? myTeam?.id : undefined}
                isCaptain={isCaptain}
                bench={bench}
                duels={duels}
                substitutions={substitutions}
                busy={!!busy}
                onStart={handleStartDuel}
                onSubstitute={handleSubstitute}
              >
                <LeagueDuelResultPanel
                  duel={duel}
                  reports={reports.filter((report) => report.duel_id === duel.id)}
                  dispute={disputeForDuel(duel.id)}
                  myPlayerId={me?.id}
                  homeName={homeName}
                  awayName={awayName}
                  seasonActive={fixture.season?.status === 'ACTIVE'}
                  isCaptain={isCaptain}
                  busy={!!busy}
                  onSubmitResult={(input, file) => handleSubmitResult(duel.id, input, file)}
                  onConfirm={() => handleConfirmResult(duel.id)}
                  onDispute={(reason, file) => handleDispute(duel.id, reason, file)}
                />
              </LeagueDuelCard>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  );
}
