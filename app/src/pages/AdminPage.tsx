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
import Icon from '../components/ui/Icon';
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
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [tab, setTab] = usePersistentTab('vik-tab-admin', 'members' as Tab, ['members', 'disputes', 'announcements', 'honours', 'access', 'tryouts'] as const);
  const [setup, setSetup] = useState<SetupCheckResult[] | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  const disputesQuery = useQuery({ queryKey: ['disputes-count'], queryFn: () => listDisputes(true), enabled: isAdmin });
  const tryoutsQuery = useQuery({ queryKey: ['tryouts-count'], queryFn: listTryouts, enabled: isAdmin });
  const pendingTryouts = (tryoutsQuery.data ?? []).filter((r) => r.status === 'PENDING').length;

  if (!isAdmin) return <Navigate to="/home" replace />;

  const tabLabel = (tb: Tab) =>
    tb === 'members' ? t('admin.tabMembers') :
    tb === 'disputes' ? t('admin.tabDisputes') :
    tb === 'announcements' ? t('admin.tabAnnouncements') :
    tb === 'honours' ? t('admin.tabHonours') :
    tb === 'access' ? t('admin.tabAccess') : t('admin.tabTryouts');

  async function runSetupCheck() {
    setSetupBusy(true);
    try {
      setSetup(await checkSetup());
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="font-display text-xl tracking-wide">{t('admin.title')}</h1>
      <section className="card mt-3 p-3 text-sm" aria-label="Setup health">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Setup health</h2>
          <button type="button" onClick={runSetupCheck} disabled={setupBusy} className="btn-ghost h-9 px-3 text-xs">
            {setupBusy ? 'Checking…' : setup ? 'Re-check' : 'Run check'}
          </button>
        </div>
        {!setup ? (
          <p className="mt-1 text-xs opacity-70">Verifies .env, private buckets, OWNER bootstrap, VAPID key.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {setup.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-xs">
                <span aria-hidden>{s.ok ? '✅' : '❌'}</span>
                <span><strong>{s.label}:</strong> {s.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <Link to="/competitions" className="card flex items-center gap-2 p-3 font-semibold"><Icon name="trophy" className="h-5 w-5 text-brand-400" /> {t('admin.tabCompetitions')}</Link>
        <Link to="/clan" className="card flex items-center gap-2 p-3 font-semibold"><Icon name="users" className="h-5 w-5 text-brand-400" /> {t('nav.clan')}</Link>
      </div>
      <Link to="/4vs4/admin" className="card mt-2 flex items-center gap-2 p-3 text-sm font-semibold">
        <Icon name="shield" className="h-5 w-5 text-brand-400" /> {t('league4.admin')}
      </Link>

      <nav aria-label="Admin tabs" className="mt-3 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`h-11 shrink-0 px-3 text-sm font-semibold ${tab === tb ? 'border-b-2 border-brand-500 text-brand-400' : 'opacity-60'}`}>
            {tabLabel(tb)}{tb === 'disputes' && (disputesQuery.data?.length ?? 0) > 0 ? ` (${disputesQuery.data!.length})` : ''}{tb === 'tryouts' && pendingTryouts > 0 ? ` (${pendingTryouts})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'disputes' ? (
        <div className="mt-3"><DisputesTab /></div>
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
      <BottomNav />
    </main>
  );
}
