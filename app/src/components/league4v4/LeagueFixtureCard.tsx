import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueFixtureWithContext } from '../../types/league4v4';
import Icon from '../ui/Icon';
import { Countdown } from '../ui/Motion';
import StatusBadge from '../ui/StatusBadge';
import TeamLogo from './TeamLogo';

export default function LeagueFixtureCard({ fixture, showMatchday = true }: { fixture: LeagueFixtureWithContext; showMatchday?: boolean }) {
  const { t, fmtDate } = useLocale();
  const hasResult = fixture.status === 'COMPLETED' || fixture.status === 'FORFEITED';
  const final = hasResult || fixture.status === 'CANCELLED';
  return (
    <article className="card p-3">
      <div className="flex items-center gap-2 text-xs">
        {showMatchday && fixture.matchday && (
          <span className="font-semibold opacity-70">{t('league4.matchday')} {fixture.matchday.number}</span>
        )}
        <span className="flex-1" />
        <StatusBadge value={fixture.status} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <Link to={`/4vs4/teams/${fixture.home_team_id}`} className="flex min-w-0 flex-1 items-center justify-end gap-1.5 font-semibold underline decoration-brand-500/40 underline-offset-2">
          <span className="truncate">{fixture.home?.name ?? '?'}</span>
          <TeamLogo path={fixture.home?.logo_path} name={fixture.home?.name ?? '?'} className="h-7 w-7 text-xs" rounded="rounded-lg" />
        </Link>
        <span className="font-display shrink-0 text-lg font-bold tabular-nums">
          {hasResult ? `${fixture.home_duel_wins}–${fixture.away_duel_wins}` : 'vs'}
        </span>
        <Link to={`/4vs4/teams/${fixture.away_team_id}`} className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold underline decoration-brand-500/40 underline-offset-2">
          <TeamLogo path={fixture.away?.logo_path} name={fixture.away?.name ?? '?'} className="h-7 w-7 text-xs" rounded="rounded-lg" />
          <span className="truncate">{fixture.away?.name ?? '?'}</span>
        </Link>
      </div>
      {hasResult && (
        <p className="mt-1 text-center text-xs opacity-70">
          {t('league4.points')}: {fixture.home_points}–{fixture.away_points}
        </p>
      )}
      {fixture.matchday && (
        <p className="mt-2 flex items-center gap-1 text-xs opacity-70">
          <Icon name="clock" className="h-3.5 w-3.5" />
          {fmtDate(fixture.matchday.deadline)}
          {!final && <Countdown deadline={fixture.matchday.deadline} />}
        </p>
      )}
      <Link to={`/4vs4/match/${fixture.id}`} className="btn-ghost mt-2 h-9 w-full text-xs">
        <Icon name="swords" className="h-3.5 w-3.5" /> {t('league4.openMatch')}
      </Link>
    </article>
  );
}
