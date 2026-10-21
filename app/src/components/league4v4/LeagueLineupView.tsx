import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueLineupPlayerWithProfile, LeagueLineupWithPlayers } from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';

export default function LeagueLineupView({
  lineup,
  hidden = false,
  emptyHint,
}: {
  lineup: LeagueLineupWithPlayers | null;
  hidden?: boolean;
  emptyHint?: string;
}) {
  const { t } = useLocale();

  if (hidden) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-center">
        <Icon name="lock" className="mx-auto h-5 w-5 opacity-50" />
        <p className="mt-1 text-sm font-semibold">{t('league4.lineupHidden')}</p>
        <p className="mt-0.5 text-xs opacity-60">{t('league4.lineupHiddenHint')}</p>
      </div>
    );
  }

  if (!lineup) {
    return <p className="mt-2 text-sm opacity-60">{emptyHint ?? t('league4.lineupNotSubmitted')}</p>;
  }

  const starters = lineup.players.filter((entry) => entry.role === 'STARTER');
  const subs = lineup.players.filter((entry) => entry.role === 'SUB');

  function row(entry: LeagueLineupPlayerWithProfile, label: string) {
    const name = entry.player?.display_name ?? entry.player?.username ?? entry.player_id.slice(0, 8);
    return (
      <li key={entry.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2">
        <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-xs font-bold text-brand-400">
          {entry.slot}
        </span>
        <Avatar path={entry.player?.avatar_url} name={name} className="h-8 w-8 text-xs" zoomable={false} />
        <Link to={`/players/${entry.player_id}`} className="min-w-0 flex-1 truncate text-sm font-semibold">
          {name}
        </Link>
        <span className="text-[10px] uppercase tracking-wide opacity-50">{label}</span>
      </li>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {starters.map((entry) => row(entry, t('league4.starter')))}
      </ul>
      {subs.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-50">{t('league4.substitutes')}</p>
          <ul className="flex flex-col gap-1.5">
            {subs.map((entry) => row(entry, t('league4.substitute')))}
          </ul>
        </>
      )}
    </div>
  );
}
