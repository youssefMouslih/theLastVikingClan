import type { StandingRow } from '../../types/database';
import { useLocale } from '../../i18n/LocaleContext';
import FormDots, { type FormResult } from '../ui/FormDots';

// League table §31: Pos, Player, P W D L GF GA GD PTS.
export default function StandingsTable({
  rows,
  names,
  onPlayerClick,
  form,
  highlightPlayerId,
}: {
  rows: StandingRow[];
  names?: Record<string, string>;
  onPlayerClick?: (playerId: string) => void;
  form?: Record<string, FormResult[]>;
  highlightPlayerId?: string | null;
}) {
  const { t } = useLocale();
  if (rows.length === 0) return <p className="card text-sm opacity-70">{t('stand.empty')}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[420px] text-sm sm:min-w-[520px]">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-black/60 dark:text-white/60">
            <th className="sticky top-0 z-10 w-10 min-w-10 bg-[var(--surface)] p-2">{t('stand.pos')}</th>
            <th className="sticky top-0 left-10 z-10 min-w-[150px] bg-[var(--surface)] p-2">{t('stand.player')}</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">P</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">W</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">D</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">L</th>
            <th className="sticky top-0 z-10 hidden bg-[var(--surface)] p-2 text-center sm:table-cell">GF</th>
            <th className="sticky top-0 z-10 hidden bg-[var(--surface)] p-2 text-center sm:table-cell">GA</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">GD</th>
            <th className="sticky top-0 z-10 bg-[var(--surface)] p-2 text-center">PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = r.player_id === highlightPlayerId;
            const rankClass = i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-500 dark:text-zinc-300' : i === 2 ? 'text-amber-700 dark:text-amber-600' : '';
            return (
              <tr key={r.player_id} aria-current={isMe ? 'true' : undefined} className={`border-b last:border-0 ${isMe ? 'bg-brand-500/10' : ''}`}>
                <td className={`sticky left-0 z-[1] w-10 min-w-10 bg-[var(--surface)] p-2 font-bold ${isMe ? 'border-s-2 border-brand-500' : ''} ${rankClass}`}>{i + 1}</td>
                <td className="sticky left-10 z-[1] max-w-[180px] bg-[var(--surface)] p-2 font-semibold">
                  {onPlayerClick ? (
                    <button type="button" onClick={() => onPlayerClick(r.player_id)} className="block max-w-full truncate text-left underline decoration-brand-500/60 underline-offset-2">
                      {names?.[r.player_id] ?? r.player_id.slice(0, 8)}
                    </button>
                  ) : (
                    <span className="block truncate">{names?.[r.player_id] ?? r.player_id.slice(0, 8)}</span>
                  )}
                  {isMe && <span className="ms-1 text-[9px] font-bold uppercase text-brand-400">{t('stand.you')}</span>}
                  {form?.[r.player_id]?.length ? <FormDots results={form[r.player_id]} /> : null}
                </td>
                <td className="p-2 text-center">{r.played}</td><td className="p-2 text-center">{r.wins}</td>
                <td className="p-2 text-center">{r.draws}</td><td className="p-2 text-center">{r.losses}</td>
                <td className="hidden p-2 text-center sm:table-cell">{r.goals_for}</td><td className="hidden p-2 text-center sm:table-cell">{r.goals_against}</td>
                <td className="p-2 text-center">{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
                <td className="p-2 text-center font-black">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
