import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import DisputesTab from '../components/admin/DisputesTab';
import AnnouncementsTab from '../components/admin/AnnouncementsTab';
import HonoursTab from '../components/admin/HonoursTab';
import MembersTab from '../components/admin/MembersTab';
import BottomNav from '../components/ui/BottomNav';
import CopyButton from '../components/ui/CopyButton';
import { usePersistentTab } from '../hooks/usePersistentTab';
import Icon from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { createCompetition, listCompetitions, type CreateCompetitionInput } from '../services/competitionService';
import { listDisputes } from '../services/disputeService';
import { checkSetup, type SetupCheckResult } from '../services/setupCheck';
import type { CompetitionType } from '../types/database';
import { useAuthStore } from '../stores/authStore';

// Admin dashboard (§70-72): quick actions + competition management + dispute queue.
const TABS = ['competitions', 'members', 'disputes', 'announcements', 'honours'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const isAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const [tab, setTab] = usePersistentTab('vik-tab-admin', 'competitions' as Tab, ['competitions', 'members', 'disputes', 'announcements', 'honours'] as const);
  const [form, setForm] = useState({
    name: '', type: 'LEAGUE' as CompetitionType, min_players: 4, max_players: 8,
    registration_deadline: '', match_deadline_hours: 48, description: '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<SetupCheckResult[] | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);

  const listQuery = useQuery({ queryKey: ['admin-competitions'], queryFn: () => listCompetitions(true), enabled: isAdmin });
  const disputesQuery = useQuery({ queryKey: ['disputes-count'], queryFn: () => listDisputes(true), enabled: isAdmin });

  if (!isAdmin) return <Navigate to="/home" replace />;

  const tabLabel = (tb: Tab) =>
    tb === 'competitions' ? t('admin.tabCompetitions') :
    tb === 'members' ? t('admin.tabMembers') :
    tb === 'disputes' ? t('admin.tabDisputes') :
    tb === 'announcements' ? t('admin.tabAnnouncements') : t('admin.tabHonours');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const input: CreateCompetitionInput = {
        name: form.name.trim(),
        description: form.description || null,
        type: form.type,
        min_players: form.min_players,
        max_players: form.max_players,
        registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
        match_deadline_hours: form.match_deadline_hours,
      };
      const c = await createCompetition(input, me!.id);
      setMsg(`Created ${c.name} — code ${c.join_code}. Share /join/${c.join_code}`);
      setLastCode(c.join_code);
      setForm({ ...form, name: '', description: '', registration_deadline: '' });
      await listQuery.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

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

      <nav aria-label="Admin tabs" className="mt-3 flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`h-11 shrink-0 px-3 text-sm font-semibold ${tab === tb ? 'border-b-2 border-brand-500 text-brand-400' : 'opacity-60'}`}>
            {tabLabel(tb)}{tb === 'disputes' && (disputesQuery.data?.length ?? 0) > 0 ? ` (${disputesQuery.data!.length})` : ''}
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
      ) : (
        <>
          <form onSubmit={create} className="card mt-4 flex flex-col gap-2">
            <h2 className="font-bold">{t('admin.create')}</h2>
            <label className="label">{t('admin.name')}<input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('admin.namePlaceholder')} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="label">{t('admin.type')}<select className="input px-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CompetitionType })}><option>LEAGUE</option><option>CUP</option><option>TOURNAMENT</option><option>SPECIAL_EVENT</option></select></label>
              <p className="col-span-2 -mt-1 text-xs opacity-70">
                {form.type === 'LEAGUE' ? t('admin.typeLeague') : form.type === 'CUP' ? t('admin.typeCup') : form.type === 'TOURNAMENT' ? t('admin.typeTournament') : t('admin.typeSpecial')}
              </p>
              <label className="label">{t('admin.matchHours')}<input type="number" min={1} max={336} className="input" value={form.match_deadline_hours} onChange={(e) => setForm({ ...form, match_deadline_hours: Number(e.target.value) })} /></label>
              <label className="label">{t('admin.min')}<input type="number" min={2} max={32} className="input" value={form.min_players} onChange={(e) => setForm({ ...form, min_players: Number(e.target.value) })} /></label>
              <label className="label">{t('admin.max')}<input type="number" min={2} max={32} className="input" value={form.max_players} onChange={(e) => setForm({ ...form, max_players: Number(e.target.value) })} /></label>
            </div>
            <label className="label">{t('admin.regDeadline')}<input required type="datetime-local" className="input" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} /></label>
            <label className="label">{t('admin.description')}<textarea className="input h-auto py-2" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            {msg && <p className="text-sm font-medium">{msg}</p>}
            {lastCode && (
              <div className="flex flex-wrap gap-2">
                <CopyButton text={lastCode} label={t('common.copy')} />
                <CopyButton text={`${window.location.origin}/join/${lastCode}`} label={t('common.inviteLink')} />
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary h-12">{busy ? t('admin.creating') : t('admin.create')}</button>
          </form>

          <h2 className="card-title mt-4">{t('admin.manage')}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {(listQuery.data ?? []).filter((c) => !c.is_deleted).map((c) => (
              <Link key={c.id} to={`/competitions/${c.id}`} className="card p-3 text-sm">
                <span className="font-semibold">{c.name}</span> <span className="opacity-60">• {c.status} • {c.join_code}</span>
                {c.delete_requested_by && <span className="status-badge ms-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">{t('detail.pendingShort')}</span>}
              </Link>
            ))}
          </div>
          {(listQuery.data ?? []).some((c) => c.is_deleted) && (
            <>
              <h2 className="card-title mt-4">{t('admin.deletedList')}</h2>
              <div className="mt-2 flex flex-col gap-2 opacity-70">
                {(listQuery.data ?? []).filter((c) => c.is_deleted).map((c) => (
                  <Link key={c.id} to={`/competitions/${c.id}`} className="card p-3 text-sm">
                    <span className="font-semibold">{c.name}</span> <span className="opacity-60">• {t('admin.deletedBadge')}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <BottomNav />
    </main>
  );
}
