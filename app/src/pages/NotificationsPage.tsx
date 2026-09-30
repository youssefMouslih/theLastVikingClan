import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { listNotifications, markAllRead, markRead } from '../services/notificationService';
import { useAuthStore } from '../stores/authStore';

// Notification center (§69): empty state §111.
export default function NotificationsPage() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(me!.id), enabled: !!me });

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.read_at);

  return (
    <main className="page">
      <div className="flex items-center gap-2">
        <h1 className="font-display flex flex-1 items-center gap-2 text-xl tracking-wide">
          <Icon name="bell" className="h-6 w-6" /> {t('notif.title')} {unread.length > 0 && <span className="rounded-full bg-accent-500 px-2 py-0.5 text-xs text-white">{unread.length}</span>}
        </h1>
        <button
          type="button"
          aria-label={t('common.refresh')}
          onClick={() => query.refetch()}
          className="btn-ghost h-10 w-10 !px-0 text-xs"
        >
          ⟳
        </button>
        {unread.length > 0 && (
          <button
            onClick={async () => { await markAllRead(me!.id); query.refetch(); }}
            className="btn-ghost h-10 px-3 text-xs"
          >
            {t('notif.markAll')}
          </button>
        )}
      </div>
      {query.isLoading && <p className="mt-2 text-sm">{t('notif.loading')}</p>}
      {query.isError && <p className="mt-2 text-sm text-red-500">{t('notif.error')}</p>}
      {!query.isLoading && items.length === 0 && (
        <p className="card mt-3 text-sm opacity-70">{t('notif.empty')}</p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {items.map((n) => (
          <article key={n.id} className={`card p-3 text-sm ${n.read_at ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-2">
              <span className="status-badge rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-400">{n.type.replace(/_/g, ' ')}</span>
              <span className="ms-auto text-xs opacity-60">{fmtDate(n.created_at)}</span>
            </div>
            <p className="mt-1 font-bold">{n.title}</p>
            <p className="opacity-80">{n.message}</p>
            <div className="mt-1 flex gap-3 text-xs">
              {n.entity_type === 'match' && n.entity_id && <Link to={`/matches/${n.entity_id}`} className="font-semibold text-brand-400">{t('notif.viewMatch')}</Link>}
              {n.entity_type === 'competition' && n.entity_id && <Link to={`/competitions/${n.entity_id}`} className="font-semibold text-brand-400">{t('notif.viewComp')}</Link>}
              {n.entity_type === 'battle' && <Link to="/battles" className="font-semibold text-brand-400">{t('notif.viewBattle')}</Link>}
              {!n.entity_id && n.entity_type !== 'battle' && <Link to="/home" className="font-semibold text-brand-400">{t('notif.viewHome')}</Link>}
              {n.entity_type === 'battle' && <Link to="/battles" className="font-semibold text-brand-400">{t('notif.viewBattle')}</Link>}
              {!n.entity_id && <Link to="/home" className="font-semibold text-brand-400">{t('notif.viewHome')}</Link>}
              {!n.read_at && (
                <button onClick={async () => { await markRead(n.id); query.refetch(); }} className="underline">{t('notif.markRead')}</button>
              )}
            </div>
          </article>
        ))}
      </div>
      <BottomNav />
    </main>
  );
}
