import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import DisputesTab from '../components/admin/DisputesTab';
import AnnouncementsTab from '../components/admin/AnnouncementsTab';
import HonoursTab from '../components/admin/HonoursTab';
import MembersTab from '../components/admin/MembersTab';
import AccessTab from '../components/admin/AccessTab';
import TryoutsTab from '../components/admin/TryoutsTab';
import BottomNav from '../components/ui/BottomNav';
import { usePersistentTab } from '../hooks/usePersistentTab';
import Icon, { type IconName } from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { listDisputes } from '../services/disputeService';
import { listTryouts } from '../services/tryoutService';
import { checkSetup, type SetupCheckResult } from '../services/setupCheck';
import { useAuthStore } from '../stores/authStore';

// Admin dashboard: members (roles, status, throne crowning), disputes,
// announcements, honours, platform access. Competition creation and
// management live in the League section (/competitions), not here.
const TABS = ['members', 'disputes', 'announcements', 'honours', 'access', 'tryouts'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { t, tError } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [tab, setTab] = usePersistentTab('vik-tab-admin', 'members' as Tab, ['members', 'disputes', 'announcements', 'honours', 'access', 'tryouts'] as const);
  const [setup, setSetup] = useState<SetupCheckResult[] | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const disputesQuery = useQuery({ queryKey: ['disputes-count'], queryFn: () => listDisputes(true), enabled: isAdmin });
  const tryoutsQuery = useQuery({ queryKey: ['tryouts-count'], queryFn: listTryouts, enabled: isAdmin });
  const pendingTryouts = (tryoutsQuery.data ?? []).filter((r) => r.status === 'PENDING').length;
  const pendingDisputes = disputesQuery.data?.length ?? 0;

  if (!isAdmin) return <Navigate to="/home" replace />;

  const tabLabel = (tb: Tab) =>
    tb === 'members' ? t('admin.tabMembers') :
    tb === 'disputes' ? t('admin.tabDisputes') :
    tb === 'announcements' ? t('admin.tabAnnouncements') :
    tb === 'honours' ? t('admin.tabHonours') :
    tb === 'access' ? t('admin.tabAccess') : t('admin.tabTryouts');
  const tabIcon: Record<Tab, IconName> = {
    members: 'users',
    disputes: 'alert',
    announcements: 'mega',
    honours: 'medal',
    access: 'lock',
    tryouts: 'shield',
  };

  async function runSetupCheck() {
    setSetupBusy(true);
    setSetupError(null);
    try {
      setSetup(await checkSetup());
    } catch (err) {
      setSetupError(tError(err));
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <main className="page max-w-5xl">
      <header className="mb-5 flex flex-col justify-between gap-4 border-b border-(--border) pb-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-400">{me?.username}</p>
          <h1 className="font-display flex items-center gap-2 text-2xl tracking-wide">
            <Icon name="shield" className="h-6 w-6 text-brand-400" /> {t('admin.title')}
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Link to="/competitions" className="btn-ghost gap-2 text-sm">
            <Icon name="trophy" className="h-4 w-4 text-brand-400" /> {t('admin.tabCompetitions')}
          </Link>
          <Link to="/clan" className="btn-ghost gap-2 text-sm">
            <Icon name="users" className="h-4 w-4 text-brand-400" /> {t('nav.clan')}
          </Link>
          <Link to="/4vs4/admin" className="btn-ghost col-span-2 gap-2 text-sm sm:col-span-1">
            <Icon name="swords" className="h-4 w-4 text-brand-400" /> {t('league4.admin')}
          </Link>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-2 sm:max-w-md" aria-label="Pending administration">
        <button type="button" onClick={() => setTab('disputes')} className={`card flex min-h-20 items-center gap-3 p-3 text-start transition-colors hover:border-brand-400/50 ${tab === 'disputes' ? 'border-brand-400/60' : ''}`}>
          <Icon name="alert" className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="min-w-0">
            <span className="block truncate text-xs text-(--muted)">{t('admin.tabDisputes')}</span>
            <span className="font-display text-xl tabular-nums">{disputesQuery.isPending ? '—' : pendingDisputes}</span>
          </span>
        </button>
        <button type="button" onClick={() => setTab('tryouts')} className={`card flex min-h-20 items-center gap-3 p-3 text-start transition-colors hover:border-brand-400/50 ${tab === 'tryouts' ? 'border-brand-400/60' : ''}`}>
          <Icon name="shield" className="h-5 w-5 shrink-0 text-brand-400" />
          <span className="min-w-0">
            <span className="block truncate text-xs text-(--muted)">{t('admin.tabTryouts')}</span>
            <span className="font-display text-xl tabular-nums">{tryoutsQuery.isPending ? '—' : pendingTryouts}</span>
          </span>
        </button>
      </section>
      {disputesQuery.isError && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p role="alert" className="text-red-400">{tabLabel('disputes')}: {tError(disputesQuery.error)}</p>
          <button type="button" onClick={() => void disputesQuery.refetch()} className="btn-ghost text-xs">{t('common.retry')}</button>
        </div>
      )}
      {tryoutsQuery.isError && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p role="alert" className="text-red-400">{tabLabel('tryouts')}: {tError(tryoutsQuery.error)}</p>
          <button type="button" onClick={() => void tryoutsQuery.refetch()} className="btn-ghost text-xs">{t('common.retry')}</button>
        </div>
      )}

      <section className="card mb-5" aria-labelledby="admin-setup-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border) pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--surface-2) text-brand-400">
              <Icon name="gear" className="h-5 w-5" />
            </span>
            <div>
              <h2 id="admin-setup-title" className="font-display text-base tracking-wide">Setup health</h2>
              <p className="mt-1 text-xs text-(--muted)">Verifies .env, private buckets, OWNER bootstrap, VAPID key.</p>
            </div>
          </div>
          <button type="button" onClick={runSetupCheck} disabled={setupBusy} className="btn-ghost gap-2 text-sm">
            <Icon name={setupBusy ? 'refresh' : 'check'} className="h-4 w-4" />
            {setupBusy ? 'Checking…' : setup ? 'Re-check' : 'Run check'}
          </button>
        </div>
        {setupError && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p role="alert" className="text-red-400">{setupError}</p>
            <button type="button" onClick={runSetupCheck} disabled={setupBusy} className="btn-ghost text-xs">Try again</button>
          </div>
        )}
        {setup && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {setup.map((item) => (
              <li key={item.key} className="flex items-start gap-3 rounded-lg border border-(--border) bg-(--surface-2) p-3 text-sm">
                <Icon name={item.ok ? 'check' : 'x'} className={`mt-0.5 h-4 w-4 shrink-0 ${item.ok ? 'text-green-400' : 'text-red-400'}`} />
                <span><strong className="block">{item.label}</strong><span className="text-xs text-(--muted)">{item.hint}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto border-b border-(--border) pb-1">
        {TABS.map((tb) => (
          <button
            key={tb}
            type="button"
            aria-pressed={tab === tb}
            onClick={() => setTab(tb)}
            className={`flex min-h-12 shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 text-sm font-semibold transition-colors ${
              tab === tb
                ? 'border-brand-400 bg-brand-500/10 text-brand-300'
                : 'border-transparent text-(--muted) hover:bg-white/5 hover:text-(--text)'
            }`}
          >
            <Icon name={tabIcon[tb]} className="h-4 w-4" />
            {tabLabel(tb)}
            {tb === 'disputes' && pendingDisputes > 0 && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">{pendingDisputes}</span>
            )}
            {tb === 'tryouts' && pendingTryouts > 0 && (
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-300">{pendingTryouts}</span>
            )}
          </button>
        ))}
      </nav>

      <section aria-labelledby="admin-active-section-title" className="mt-4">
        <h2 id="admin-active-section-title" className="sr-only">{tabLabel(tab)}</h2>
      {tab === 'disputes' ? (
        <DisputesTab />
      ) : tab === 'members' ? (
        <MembersTab />
      ) : tab === 'announcements' ? (
        <AnnouncementsTab />
      ) : tab === 'honours' ? (
        <HonoursTab />
      ) : tab === 'access' ? (
        <AccessTab />
      ) : (
        <TryoutsTab />
      )}
      </section>
      <BottomNav />
    </main>
  );
}
