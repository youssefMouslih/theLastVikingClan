import type { StandingRow } from '../../types/database';
import { useLocale } from '../../i18n/LocaleContext';

// League table §31: Pos, Player, P W D L GF GA GD PTS.
export default function StandingsTable({ rows, names }: { rows: StandingRow[]; names?: Record<string, string> }) {
  const { t } = useLocale();
  if (rows.length === 0) return <p className="card text-sm opacity-70">{t('stand.empty')}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase opacity-60">
            <th className="p-2">{t('stand.pos')}</th><th className="p-2">{t('stand.player')}</th>
            <th className="p-2 text-center">P</th><th className="p-2 text-center">W</th>
            <th className="p-2 text-center">D</th><th className="p-2 text-center">L</th>
            <th className="p-2 text-center">GF</th><th className="p-2 text-center">GA</th>
            <th className="p-2 text-center">GD</th><th className="p-2 text-center">PTS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player_id} className="border-b last:border-0">
              <td className="p-2 font-bold">{i + 1}</td>
              <td className="max-w-[140px] truncate p-2 font-semibold">{names?.[r.player_id] ?? r.player_id.slice(0, 8)}</td>
              <td className="p-2 text-center">{r.played}</td><td className="p-2 text-center">{r.wins}</td>
              <td className="p-2 text-center">{r.draws}</td><td className="p-2 text-center">{r.losses}</td>
              <td className="p-2 text-center">{r.goals_for}</td><td className="p-2 text-center">{r.goals_against}</td>
              <td className="p-2 text-center">{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}</td>
              <td className="p-2 text-center font-black">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
