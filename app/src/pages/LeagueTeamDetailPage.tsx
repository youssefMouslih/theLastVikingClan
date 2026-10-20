import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueRoster from '../components/league4v4/LeagueRoster';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { getLeagueSeason } from '../services/leagueSeasonService';
import { getLeagueTeamSummary } from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function LeagueTeamDetailPage() {
  const { t } = useLocale();
  const { id } = useParams();
  const me = useAuthStore((state) => state.profile);
  const teamQuery = useQuery({
    queryKey: leagueKeys.team(id ?? 'none'),
    queryFn: () => getLeagueTeamSummary(id!),
    enabled: !!id,
  });
  const team = teamQuery.data ?? null;
  const seasonQuery = useQuery({
    queryKey: leagueKeys.season(team?.season_id ?? 'none'),
    queryFn: () => getLeagueSeason(team!.season_id),
    enabled: !!team,
  });
  const season = seasonQuery.data ?? null;
  const captainName = team?.captain_profile?.display_name ?? team?.captain_profile?.username ?? '—';
  const isMember = !!me && !!team?.members.some((member) => member.player_id === me.id);
  const isCaptain = me?.id === team?.captain_id;

  if (teamQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.team')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }
  if (!team) {
    return <main className="page"><AppBar title={t('league4.team')} /><EmptyState icon={<Icon name="shield" />} title={t('league4.teamNotFound')} /><Link to="/4vs4/teams" className="btn-ghost mt-3 h-11 w-full">{t('league4.teams')}</Link><BottomNav /></main>;
  }

  return (
    <main className="page">
      <AppBar title={t('league4.team')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4/teams" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{season?.name ?? t('league4.title')}</p>
      </div>

      <section className="hero hero-glow mt-3">
        <div className="flex items-center gap-3">
          <span className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500/20 text-2xl font-bold text-brand-300">
            {team.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl tracking-wide">{team.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-xs opacity-70">
              <Icon name="crown" className="h-3.5 w-3.5 text-brand-400" /> {captainName}
            </p>
          </div>
          <StatusBadge value={team.status} />
        </div>
        {team.status === 'PENDING' && <p className="mt-3 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.awaitingApprovalHint')}</p>}
        <p className="mt-3 flex items-center gap-1.5 text-xs opacity-70">
          <Icon name="users" className="h-4 w-4" /> {t('league4.playersCount', { n: team.member_count })}
        </p>
        {isCaptain && <Link to="/4vs4/my-team" className="btn-primary mt-3 h-10 w-full text-sm">{t('league4.manageSquad')}</Link>}
        {isMember && !isCaptain && <Link to="/4vs4/my-team" className="btn-ghost mt-3 h-10 w-full text-sm">{t('league4.mySquad')}</Link>}
      </section>

      <section className="card mt-3">
        <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4 text-brand-400" /> {t('league4.roster')}</h2>
        <div className="mt-2">
          <LeagueRoster members={team.members} captainId={team.captain_id} currentPlayerId={me?.id} />
        </div>
      </section>
      <BottomNav />
    </main>
  );
}
