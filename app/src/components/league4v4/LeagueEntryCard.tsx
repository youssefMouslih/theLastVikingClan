import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { leagueNextAction } from '../../competition/league4v4/action';
import { useLocale } from '../../i18n/LocaleContext';
import { getLeagueMatchActionSnapshot } from '../../services/leagueDuelService';
import { findNextLeagueFixture, getLeagueSchedule } from '../../services/leagueFixtureService';
import { leagueKeys } from '../../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../../services/leagueSeasonService';
import { findMyLeagueTeam } from '../../services/leagueTeamService';
import { useAuthStore } from '../../stores/authStore';
import { Countdown } from '../ui/Motion';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';

export default function LeagueEntryCard({ compact = false }: { compact?: boolean }) {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((state) => state.profile);
  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const season = pickCurrentLeagueSeason(seasonsQuery.data ?? []);
  const visible = !!season && (season.status === 'ACTIVE' || season.status === 'REGISTRATION');
  const myTeamQuery = useQuery({
    queryKey: leagueKeys.myTeam(season?.id ?? 'none', me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(season!.id, me!.id),
    enabled: !!season && !!me,
  });
  const scheduleQuery = useQuery({
    queryKey: leagueKeys.schedule(season?.id ?? 'none'),
    queryFn: () => getLeagueSchedule(season!.id),
    enabled: !!season && season.status === 'ACTIVE',
  });
  const myTeam = myTeamQuery.data ?? null;
  const next = scheduleQuery.data ? findNextLeagueFixture(scheduleQuery.data, myTeam?.id) : null;
  const actionQuery = useQuery({
    queryKey: leagueKeys.action(next?.id ?? 'none', myTeam?.id ?? 'none', me?.id ?? 'none'),
    queryFn: () => getLeagueMatchActionSnapshot(next!.id),
    enabled: !!next && !!myTeam && !!me && season?.status === 'ACTIVE',
  });
  const action = next?.matchday && myTeam && me && actionQuery.data
    ? leagueNextAction({
        fixtureStatus: next.status,
        matchdayStatus: next.matchday.status,
        deadline: next.matchday.deadline,
        myTeamId: myTeam.id,
        myPlayerId: me.id,
        isCaptain: myTeam.captain_id === me.id,
        lineups: actionQuery.data.lineups,
        duels: actionQuery.data.duels,
        reports: actionQuery.data.reports,
      })
    : null;
  const actionLabel = action === 'SUBMIT_LINEUP'
    ? t('league4.actionLineup')
    : action === 'START_DUEL'
      ? t('league4.actionStartDuel')
      : action === 'SUBMIT_RESULT'
        ? t('league4.actionSubmitResult')
        : action === 'CONFIRM_RESULT'
          ? t('league4.actionConfirmResult')
          : null;

  if (seasonsQuery.isLoading) {
    if (compact) return null;
    return <section className="card mt-3 text-sm opacity-70">{t('common.loading')}</section>;
  }
  if (!visible) {
    if (!compact && canManage) {
      return (
        <section className="card mt-3">
          <h2 className="card-title flex items-center gap-1">
            <Icon name="trophy" className="h-4 w-4 text-brand-400" /> {t('league4.title')}
          </h2>
          <p className="mt-1 text-sm opacity-70">{t('league4.noSeason')}</p>
          <Link to="/4vs4/admin" className="btn-primary mt-2 h-11 text-sm">{t('league4.createSeason')}</Link>
        </section>
      );
    }
    return null;
  }

  return (
    <section className="card mt-3 border-brand-500/40">
      <div className="flex items-center gap-2">
        <Icon name="trophy" className="h-4 w-4 text-brand-400" />
        <Link to="/4vs4" className="font-display min-w-0 flex-1 truncate text-sm tracking-wide">{t('league4.title')}</Link>
        <StatusBadge value={season.status} />
      </div>
      <p className="mt-1 truncate text-sm font-semibold">{season.name}</p>
      <p className="text-xs opacity-60">
        {season.status === 'REGISTRATION'
          ? `${t('league4.registrationCloses')}: ${season.registration_closes_at ? fmtDate(season.registration_closes_at) : '—'}`
          : `${t('league4.startsAt')}: ${season.starts_at ? fmtDate(season.starts_at) : '—'}`}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xs">
        <Icon name="users" className="h-3.5 w-3.5 text-brand-400" />
        {myTeam ? myTeam.name : t('league4.noSquad')}
      </p>
      {next && (
        <>
          <p className="mt-1 truncate text-xs opacity-70">
            {t('league4.nextFixture')}: {next.home?.name ?? '?'} vs {next.away?.name ?? '?'}
          </p>
          {next.matchday && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] opacity-60">
              <Icon name="clock" className="h-3 w-3" />
              <Countdown deadline={next.matchday.deadline} />
            </p>
          )}
        </>
      )}
      {action && next ? (
        <>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-accent-400">{t('league4.actionNeeded')}</p>
          <Link to={`/4vs4/match/${next.id}`} className="btn-cta mt-1 h-11 w-full text-sm">{actionLabel}</Link>
          <Link to="/4vs4" className="mt-1 block text-center text-xs font-semibold text-brand-400">{t('league4.openHub')}</Link>
        </>
      ) : (
        <Link to="/4vs4" className="btn-primary mt-3 h-11 w-full text-sm">{t('league4.openHub')}</Link>
      )}
    </section>
  );
}
