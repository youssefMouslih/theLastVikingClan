import { Link } from 'react-router';
import { matchShouldBeOverdue } from '../../competition/deadlineEngine';
import type { Match } from '../../types/database';
import { useLocale } from '../../i18n/LocaleContext';
import StatusBadge from '../ui/StatusBadge';

export default function MatchCard({ match, names }: { match: Match; names?: Record<string, string> }) {
  const { t } = useLocale();
  const a = names?.[match.player_a_id] ?? match.player_a_id.slice(0, 6);
  const b = names?.[match.player_b_id] ?? match.player_b_id.slice(0, 6);
  const scored = match.score_a != null && match.score_b != null;
  let sub: string;
  if (!match.deadline) sub = t('mcard.noDeadline');
  else if (match.status === 'CONFIRMED' || match.status === 'FORFEIT') sub = t('mcard.completed');
  else if (matchShouldBeOverdue(match.status, match.deadline) || match.status === 'OVERDUE') sub = t('mcard.passed');
  else {
    const ms = new Date(match.deadline).getTime() - Date.now();
    sub = t('mcard.left', { h: Math.floor(ms / 3600000), m: Math.max(0, Math.floor((ms % 3600000) / 60000)) });
  }
  return (
    <Link to={`/matches/${match.id}`} className="card block p-3 transition hover:shadow-md">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex-1 truncate">{a}</span>
        <span className="font-mono text-base">{scored ? `${match.score_a}–${match.score_b}` : 'vs'}</span>
        <span className="flex-1 truncate text-right">{b}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
        <StatusBadge value={match.status} />
        <span>•</span>
        <span>{sub}</span>
      </div>
    </Link>
  );
}
