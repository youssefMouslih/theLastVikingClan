import { Link } from 'react-router';
import { matchShouldBeOverdue } from '../../competition/deadlineEngine';
import type { Match } from '../../types/database';
import { useLocale } from '../../i18n/LocaleContext';
import type { MatchWithPhones } from '../../services/matchService';
import { useAuthStore } from '../../stores/authStore';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';

export default function MatchCard({ match, names, avatars, compName }: { match: Match; names?: Record<string, string>; avatars?: Record<string, string | null>; compName?: string }) {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
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

  // Direct message to the opponent: WhatsApp when they shared a number,
  // otherwise the prefilled text goes through the share sheet.
  const withPhones = match as MatchWithPhones;
  const iAmA = me?.id === match.player_a_id;
  const oppId = iAmA ? match.player_b_id : me?.id === match.player_b_id ? match.player_a_id : null;
  const oppName = oppId ? (names?.[oppId] ?? oppId.slice(0, 6)) : null;
  const oppPhone = oppId
    ? ((iAmA ? withPhones.pb?.whatsapp : withPhones.pa?.whatsapp) ?? null)
    : null;
  const dmText = oppName
    ? t('match.dmText', { name: oppName, comp: compName ?? t('comps.title'), date: match.deadline ? fmtDate(match.deadline) : '—' })
    : '';

  async function dm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dmText) return;
    const digits = (oppPhone ?? '').replace(/[^\d]/g, '');
    if (digits) {
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(dmText)}`, '_blank');
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text: dmText });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(dmText);
      }
    } catch { /* dismissed */ }
  }

  return (
    <div className="card block p-3 transition hover:shadow-md">
      <Link to={`/matches/${match.id}`} className="flex items-center gap-2 text-sm font-semibold">
        <Avatar path={avatars?.[match.player_a_id]} name={a} className="h-7 w-7 text-xs" />
        <span className="flex-1 truncate">{a}</span>
        <span className="font-mono text-base">{scored ? `${match.score_a}–${match.score_b}` : 'vs'}</span>
        <span className="flex-1 truncate text-right">{b}</span>
        <Avatar path={avatars?.[match.player_b_id]} name={b} className="h-7 w-7 text-xs" />
      </Link>
      <div className="mt-1 flex items-center gap-2 text-xs opacity-70">
        <StatusBadge value={match.status} />
        <span>•</span>
        <span className="flex-1">{sub}</span>
        {oppId && dmText && (
          <button
            type="button"
            onClick={dm}
            aria-label={t('match.dmChat')}
            title={t('match.dmChat')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25d366]/15 text-[#25d366]"
          >
            <Icon name="chat" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
