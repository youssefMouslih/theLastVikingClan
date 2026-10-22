import { Link } from 'react-router';
import { formatDiff } from '../../competition/league4v4/standings';
import { useLocale } from '../../i18n/LocaleContext';
import FormDots, { type FormResult } from '../ui/FormDots';
import TeamLogo from './TeamLogo';
import type { LeagueStandingRow } from '../../types/league4v4';

export default function LeagueStandingsTable({
  rows,
  logos = {},
  form,
  highlightTeamId,
}: {
  rows: LeagueStandingRow[];
  logos?: Record<string, string | null>;
  form?: Record<string, FormResult[]>;
  highlightTeamId?: string | null;
}) {
  const { t } = useLocale();
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[520px] text-sm sm:min-w-[680px]" aria-label={t('league4.standings')}>
        <thead>
          <tr className="border-b text-left text-xs uppercase text-black/60 dark:text-white/60">
            <th className="sticky top-0 left-0 z-10 w-10 min-w-10 bg-[var(--surface)] p-2 text-center">{t('stand.pos')}</th>
            <th className="sticky top-0 left-10 z-10 min-w-[170px] bg-[var(--surface)] p-2">{t('league4.team')}</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center" title={t('league4.played')}>P</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center" title={t('league4.wins')}>W</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center" title={t('league4.draws')}>D</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center" title={t('league4.losses')}>L</th>
            <th className="hidden bg-[var(--surface)] p-2 text-center sm:table-cell" title={t('league4.duelsWon')}>DW</th>
            <th className="hidden bg-[var(--surface)] p-2 text-center sm:table-cell" title={t('league4.duelsLost')}>DL</th>
            <th className="hidden bg-[var(--surface)] p-2 text-center sm:table-cell" title={t('league4.duelDiff')}>DD</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center" title={t('league4.points')}>PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isMe = row.team_id === highlightTeamId;
            const rankClass = index === 0 ? 'text-amber-400' : index === 1 ? 'text-zinc-500 dark:text-zinc-300' : index === 2 ? 'text-amber-700 dark:text-amber-600' : '';
            return (
              <tr key={row.team_id} aria-current={isMe ? 'true' : undefined} className={`border-b last:border-0 ${isMe ? 'bg-brand-500/10' : ''}`}>
                <td className={`sticky left-0 z-[1] w-10 min-w-10 bg-[var(--surface)] p-2 text-center font-bold ${isMe ? 'border-s-2 border-brand-500' : ''} ${rankClass}`}>
                  {row.standing_position}
                </td>
                <td className="sticky left-10 z-[1] max-w-[220px] bg-[var(--surface)] p-2 font-semibold">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo path={logos[row.team_id]} name={row.team_name} className="h-6 w-6 text-[10px]" rounded="rounded-md" />
                    <div className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1">
                        <Link to={`/4vs4/teams/${row.team_id}`} className="truncate underline decoration-brand-500/60 underline-offset-2">
                          {row.team_name}
                        </Link>
                        {isMe && <span className="shrink-0 text-[9px] font-bold uppercase text-brand-400">{t('stand.you')}</span>}
                      </span>
                      {form?.[row.team_id]?.length ? <FormDots results={form[row.team_id]} /> : null}
                    </div>
                  </div>
                </td>
                <td className="p-2 text-center tabular-nums">{row.played}</td>
                <td className="p-2 text-center tabular-nums">{row.wins}</td>
                <td className="p-2 text-center tabular-nums">{row.draws}</td>
                <td className="p-2 text-center tabular-nums">{row.losses}</td>
                <td className="hidden p-2 text-center tabular-nums sm:table-cell">{row.duels_won}</td>
                <td className="hidden p-2 text-center tabular-nums sm:table-cell">{row.duels_lost}</td>
                <td className="hidden p-2 text-center tabular-nums sm:table-cell">{formatDiff(row.duel_diff)}</td>
                <td className="p-2 text-center font-black tabular-nums">
                  {row.points}
                  {row.penalty_points !== 0 && (
                    <span className="block text-[10px] font-semibold text-red-400" title={t('league4.includesPenalties')}>
                      {formatDiff(row.penalty_points)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
