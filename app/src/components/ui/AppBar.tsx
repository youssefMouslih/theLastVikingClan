import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router';
import Icon from './Icon';
import { listNotifications } from '../../services/notificationService';
import { getTotalXP } from '../../services/sagaService';
import { syncAppBadge } from '../../services/appBadge';
import { useAuthStore } from '../../stores/authStore';
import CoinImg from './CoinImg';

// Clan top bar: shield logo | Glory + coin | raven bell.
// Also mirrors the unread count to the installed PWA icon badge.
export default function AppBar({ title }: { title?: string }) {
  const me = useAuthStore((s) => s.profile);
  const xpQuery = useQuery({ queryKey: ['xp', me?.id], queryFn: () => getTotalXP(me!.id), enabled: !!me });
  const notifQuery = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(me!.id, 20), enabled: !!me });
  const unread = (notifQuery.data ?? []).filter((n) => !n.read_at).length;

  useEffect(() => {
    if (me) void syncAppBadge(me.id);
  }, [me, unread]);

  return (
    <header className="flex items-center gap-2">
      <Link to="/home" aria-label="VIK Clan home">
        <img src="/logo.png" alt="" aria-hidden className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-brand-500/30" />
      </Link>
      {title && <h1 className="font-display flex-1 truncate text-lg tracking-wide">{title}</h1>}
      {!title && <span className="flex-1" />}
      <Link to="/saga" className="flex h-10 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-bold">
        <CoinImg className="h-5 w-5" />
        {xpQuery.data ?? '—'}
      </Link>
      <Link to="/notifications" aria-label="Notifications" className="btn-ghost relative h-10 w-10 !px-0">
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
      </Link>
    </header>
  );
}

// Bell icon aliased as the clan raven.
export function RavenBell(props: { className?: string }) {
  return <Icon name="bell" {...props} />;
}
