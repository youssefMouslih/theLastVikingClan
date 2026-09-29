import { Link } from 'react-router';
import type { Profile } from '../../types/database';
import StatusBadge from '../ui/StatusBadge';

export default function MemberRow({ member }: { member: Profile }) {
  const inactive = member.status !== 'ACTIVE';
  return (
    <Link
      to={`/players/${member.id}`}
      className={`card flex items-center gap-3 p-3 ${inactive ? 'opacity-60' : ''}`}
    >
      <div aria-hidden className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-lg text-brand-300">
        {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{member.display_name ?? member.username}</div>
        <div className="truncate text-xs opacity-70">
          @{member.username}
          {member.efootball_name ? ` • ${member.efootball_name}` : ''}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge value={member.role} />
        {inactive && <StatusBadge value={member.status} />}
      </div>
    </Link>
  );
}
