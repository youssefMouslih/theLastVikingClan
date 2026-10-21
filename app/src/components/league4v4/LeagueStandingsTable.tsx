import { Link } from 'react-router';
import { formatDiff } from '../../competition/league4v4/standings';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueStandingRow } from '../../types/league4v4';

export default function LeagueStandingsTable({ rows }: { rows: LeagueStandingRow[] }) {
  const { t } = useLocale();
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[680px] text-sm" aria-label={t('league4.standings')}>
        <thead>
          <tr className="border-b text-left text-xs uppercase opacity-60">
            <th className="p-2 text-center">#</th>
            <th className="p-2">{t('league4.team')}</th>
            <th className="p-2 text-center" title={t('league4.played')}>P</th>
            <th className="p-2 text-center" title={t('league4.wins')}>W</th>
            <th className="p-2 text-center" title={t('league4.draws')}>D</th>
            <th className="p-2 text-center" title={t('league4.losses')}>L</th>
            <th className="p-2 text-center" title={t('league4.duelsWon')}>DW</th>
            <th className="p-2 text-center" title={t('league4.duelsLost')}>DL</th>
            <th className="p-2 text-center" title={t('league4.duelDiff')}>DD</th>
            <th className="p-2 text-center" title={t('league4.points')}>PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team_id} className="border-b last:border-0">
              <td className="p-2 text-center font-bold">{row.standing_position}</td>
              <td className="max-w-[200px] truncate p-2 font-semibold">
                <Link to={`/4vs4/teams/${row.team_id}`} className="underline decoration-brand-500/60 underline-offset-2">
                  {row.team_name}
                </Link>
              </td>
              <td className="p-2 text-center tabular-nums">{row.played}</td>
              <td className="p-2 text-center tabular-nums">{row.wins}</td>
              <td className="p-2 text-center tabular-nums">{row.draws}</td>
              <td className="p-2 text-center tabular-nums">{row.losses}</td>
              <td className="p-2 text-center tabular-nums">{row.duels_won}</td>
              <td className="p-2 text-center tabular-nums">{row.duels_lost}</td>
              <td className="p-2 text-center tabular-nums">{formatDiff(row.duel_diff)}</td>
              <td className="p-2 text-center font-black tabular-nums">
                {row.points}
                {row.penalty_points !== 0 && (
                  <span className="block text-[10px] font-semibold text-red-400" title={t('league4.includesPenalties')}>
                    {formatDiff(row.penalty_points)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
