import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueMemberWithProfile } from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';

export default function LeagueRoster({
  members,
  captainId,
  currentPlayerId,
  canManage = false,
  busy = false,
  onRemove,
  onTransfer,
}: {
  members: LeagueMemberWithProfile[];
  captainId: string;
  currentPlayerId?: string;
  canManage?: boolean;
  busy?: boolean;
  onRemove?: (member: LeagueMemberWithProfile) => void;
  onTransfer?: (member: LeagueMemberWithProfile) => void;
}) {
  const { t } = useLocale();
  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => {
        const name = member.player?.display_name ?? member.player?.username ?? member.player_id.slice(0, 8);
        const isCaptain = member.player_id === captainId;
        return (
          <li key={member.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2">
            <Link to={`/players/${member.player_id}`} className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar path={member.player?.avatar_url} name={name} className="h-9 w-9 text-sm" zoomable={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {name}
                  {member.player_id === currentPlayerId ? ` (${t('league4.you')})` : ''}
                </span>
                <span className="flex items-center gap-1 text-[11px] opacity-60">
                  {isCaptain && <Icon name="crown" className="h-3.5 w-3.5 text-brand-400" />}
                  {isCaptain ? t('league4.captain') : t('league4.member')}
                </span>
              </span>
            </Link>
            {canManage && !isCaptain && (
              <div className="flex shrink-0 gap-1">
                {onTransfer && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTransfer(member)}
                    className="btn-ghost h-9 px-2 text-[11px]"
                    title={t('league4.transferCaptain')}
                  >
                    <Icon name="crown" className="h-3.5 w-3.5" />
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(member)}
                    className="btn-danger h-9 px-2 text-[11px]"
                    title={t('league4.remove')}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
