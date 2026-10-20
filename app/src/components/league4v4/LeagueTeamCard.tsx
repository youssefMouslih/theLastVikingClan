import { Link } from 'react-router';
import type { LeagueTeamSummary } from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import StatusBadge from '../ui/StatusBadge';
import { useLocale } from '../../i18n/LocaleContext';

export default function LeagueTeamCard({ team }: { team: LeagueTeamSummary }) {
  const { t } = useLocale();
  const captainName = team.captain_profile?.display_name ?? team.captain_profile?.username ?? '?';
  return (
    <Link to={`/4vs4/teams/${team.id}`} className="card block transition hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 font-display font-bold text-brand-400">
          {team.name.slice(0, 1).toUpperCase()}
        </span>
        <h3 className="font-display min-w-0 flex-1 truncate text-sm tracking-wide">{team.name}</h3>
        <StatusBadge value={team.status} />
      </div>
      <p className="mt-2 text-xs opacity-70">
        {t('league4.playersCount', { n: team.member_count })} · {t('league4.teamCaptain')}: {captainName}
      </p>
      <div className="mt-2 flex items-center gap-1">
        {team.members.slice(0, 5).map((member) => (
          <Avatar
            key={member.id}
            path={member.player?.avatar_url}
            name={member.player?.display_name ?? member.player?.username ?? '?'}
            className="h-7 w-7 text-xs"
            zoomable={false}
          />
        ))}
      </div>
    </Link>
  );
}
