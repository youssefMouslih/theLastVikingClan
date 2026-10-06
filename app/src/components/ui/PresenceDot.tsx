import { useLocale } from '../../i18n/LocaleContext';

// Presence indicator (Fluent PresenceBadge / MUI Badge dot pattern):
// small filled circle overlapping the avatar's lower-right edge, with a 2px
// border in the surface color as separation ring. Color is driven by one
// explicit status value; the same meaning is always in visible text or the
// accessible name — never color alone. Live (available) state centers a
// motion-safe animate-ping halo behind the dot; the solid core stays still.
export type PresenceStatus = 'available' | 'away' | 'busy' | 'offline';

const DOT: Record<PresenceStatus, string> = {
  available: 'bg-green-500',
  away: 'bg-amber-400',
  busy: 'bg-red-500',
  offline: 'bg-zinc-500',
};

export function presenceFor(lastLoginAt: string | null | undefined, now = Date.now()): PresenceStatus {
  if (!lastLoginAt) return 'offline';
  const age = now - new Date(lastLoginAt).getTime();
  if (Number.isNaN(age) || age < 0) return 'offline';
  if (age < 5 * 60_000) return 'available';
  if (age < 60 * 60_000) return 'away';
  return 'offline';
}

export function presenceKey(status: PresenceStatus): 'presence.available' | 'presence.away' | 'presence.busy' | 'presence.offline' {
  return `presence.${status}`;
}

export default function PresenceDot({
  status,
  showLabel = false,
  size = 'md',
}: {
  status: PresenceStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { t } = useLocale();
  const label = t(presenceKey(status));
  const dim = size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={label}>
      <span className={`relative inline-flex ${dim}`} aria-hidden>
        {status === 'available' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex ${dim} rounded-full border-2 border-[var(--surface)] ${DOT[status]}`} />
      </span>
      {showLabel && <span className="text-xs opacity-70">{label}</span>}
    </span>
  );
}
