import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { notificationPath } from '../competition/notificationLinks';
import { LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { syncAppBadge } from '../services/appBadge';
import { listNotifications, markAllRead, markRead } from '../services/notificationService';
import { useAuthStore } from '../stores/authStore';

// Notification center (§69): empty state §111.
export default function NotificationsPage() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(me!.id), enabled: !!me });

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.read_at);
  const linkLabel = (entityType: string | null, path: string) => entityType?.startsWith('league_')
    ? t('notif.viewLeague')
    : entityType === 'match'
      ? t('notif.viewMatch')
      : entityType === 'competition'
        ? t('notif.viewComp')
        : entityType === 'battle'
          ? t('notif.viewBattle')
          : entityType === 'tryout'
            ? t('notif.viewTryouts')
            : path.startsWith('/saga')
              ? t('gift.title')
              : path.startsWith('/battles?tab=commands')
                ? t('squad.title')
                : t('notif.viewHome');

  useEffect(() => {
    if (me && !query.isLoading) void syncAppBadge(me.id);
  }, [me, query.isLoading, unread.length]);

  return (
    <main className="page">
      <div className="flex items-center gap-2">
        <h1 className="font-display flex min-w-0 flex-1 items-center gap-2 text-xl tracking-wide">
          <Icon name="bell" className="h-6 w-6 shrink-0" /> <span className="truncate">{t('notif.title')}</span> {unread.length > 0 && <span className="shrink-0 rounded-full bg-accent-600 px-2 py-0.5 text-xs text-white">{unread.length}</span>}
        </h1>
        <button
          type="button"
          aria-label={t('common.refresh')}
          onClick={() => query.refetch()}
          className="btn-ghost h-10 w-10 shrink-0 !px-0"
        >
          <Icon name="refresh" className="h-5 w-5" />
        </button>
      </div>
      {unread.length > 0 && (
        <div className="mt-1 flex justify-end">
          <button
            onClick={async () => { await markAllRead(me!.id); query.refetch(); }}
            className="inline-flex min-h-11 items-center whitespace-nowrap text-xs font-semibold text-brand-400 underline decoration-brand-500/60 underline-offset-2"
          >
            {t('notif.markAll')}
          </button>
        </div>
      )}
      <LoadingRegion loading={query.isLoading} label={t('notif.loading')} skeleton="list">
        <>
          {query.isError && <p className="mt-2 text-sm text-red-500">{t('notif.error')}</p>}
          {items.length === 0 && !query.isError && (
            <p className="card mt-3 text-sm opacity-70">{t('notif.empty')}</p>
          )}
        </>
      </LoadingRegion>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((n) => {
          const path = notificationPath(n.entity_type, n.entity_id, n.type, n.title) ?? '/home';
          return (
          <article key={n.id} className={`card p-3 text-sm ${n.read_at ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="status-badge rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-400">{n.type.replace(/_/g, ' ')}</span>
              <span className="ms-auto shrink-0 whitespace-nowrap text-[11px] opacity-60">{fmtDate(n.created_at)}</span>
            </div>
            <Link to={path} className="mt-1 block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">
              <p className="font-bold">{n.title}</p>
              <p className="opacity-80">{n.message}</p>
            </Link>
            <div className="mt-1 flex gap-3 text-xs">
              <Link to={path} className="inline-flex min-h-11 items-center font-semibold text-brand-400">{linkLabel(n.entity_type, path)}</Link>
              {!n.read_at && (
                <button onClick={async () => { await markRead(n.id); query.refetch(); }} className="inline-flex min-h-11 items-center underline">{t('notif.markRead')}</button>
              )}
            </div>
          </article>
          );
        })}
      </div>
      <BottomNav />
    </main>
  );
}
