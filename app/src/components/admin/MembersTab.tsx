import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import { confirmDialog } from '../ui/confirm';
import { supabase } from '../../lib/supabase';
import { listMembers, manageMember } from '../../services/playerService';
import { crownHolder, getCurrentReign, vacateThrone } from '../../services/throneService';
import type { MemberStatus, Profile, Role } from '../../types/database';
import { useAuthStore } from '../../stores/authStore';
import Pagination, { PAGE_SIZE } from '../ui/Pagination';
import Avatar from '../ui/Avatar';

const EDITABLE_ROLES: Role[] = ['PLAYER', 'MODERATOR', 'ADMIN'];
// No REMOVED — members can be suspended/left but never deleted from here.
const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT', 'BANNED'];

// Owner-managed user permissions (§10): who may create leagues/cups (ADMIN),
// moderate disputes (MODERATOR), or play (PLAYER). Owner-only guards inside.
export default function MembersTab() {
  const { t , tError} = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [drafts, setDrafts] = useState<Record<string, { role: Role; status: MemberStatus }>>({});
  const [banReasons, setBanReasons] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Ownership transfer (OWNER only): typed username confirmation + atomic swap.
  const [transferId, setTransferId] = useState('');
  const [transferConfirm, setTransferConfirm] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const query = useQuery({ queryKey: ['members'], queryFn: listMembers });
  const throneQuery = useQuery({ queryKey: ['throne'], queryFn: () => getCurrentReign().catch(() => null) });

  async function crown(m: Profile) {
    if (!(await confirmDialog({ message: t('throne.crownConfirm', { name: m.display_name ?? m.username }), danger: true }))) return;
    setBusyId(m.id); setMsg(null);
    try {
      await crownHolder(m.id, me!.id);
      setMsg(t('throne.crowned'));
      await Promise.all([query.refetch(), throneQuery.refetch()]);
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function save(m: Profile) {
    const d = drafts[m.id] ?? { role: m.role, status: m.status };
    setBusyId(m.id); setMsg(null);
    try {
      await manageMember({
        target: m,
        role: d.role,
        status: d.status,
        actorId: me!.id,
        actorRole: me!.role,
        reason: banReasons[m.id] ?? (d.status === 'SUSPENDED' ? m.suspend_reason : m.ban_reason) ?? '',
      });
      setMsg(t('members.saved'));
      await query.refetch();
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (query.isLoading) return <p className="text-sm">{t('common.loading')}</p>;
  const admins = (query.data ?? []).filter((m) => m.role === 'ADMIN' && m.status === 'ACTIVE');
  const transferTarget = admins.find((a) => a.id === transferId) ?? null;

  async function transfer() {
    if (!transferTarget || transferConfirm !== transferTarget.username) return;
    if (!(await confirmDialog({ message: `${t('admin.transferBtn')} → ${transferTarget.username}?`, danger: true }))) return;
    setTransferBusy(true); setMsg(null);
    try {
      const { error } = await supabase.rpc('transfer_ownership', {
        p_new_owner: transferTarget.id,
        p_confirmation: transferConfirm,
      });
      if (error) throw new Error(error.message);
      setMsg(t('admin.transferred'));
      setTransferId(''); setTransferConfirm('');
      // My role just became ADMIN — reload identity then the roster.
      await useAuthStore.getState().init();
      await query.refetch();
    } catch (err) {
      setMsg(tError(err));
    } finally {
      setTransferBusy(false);
    }
  }
  const q = filter.trim().toLowerCase();
  const rows = (query.data ?? [])
    .filter((m) => m.id !== me?.id)
    .filter((m) =>
      !q ||
      (m.display_name ?? '').toLowerCase().includes(q) ||
      m.username.toLowerCase().includes(q) ||
      (m.efootball_name ?? '').toLowerCase().includes(q) ||
      (m.known_name ?? '').toLowerCase().includes(q),
    );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="card flex items-center gap-2 p-3 text-sm">
        <span className="flex-1">
          <b>{t('throne.title')}:</b> {throneQuery.data?.holder ? (throneQuery.data.holder.display_name ?? throneQuery.data.holder.username) : t('throne.vacant')}
        </span>
        {throneQuery.data?.holder && (
          <button
            disabled={busyId === 'vacate'}
            onClick={async () => { if (!(await confirmDialog({ message: t('throne.vacate') + '?', danger: true }))) return; setBusyId('vacate'); try { await vacateThrone(me!.id); setMsg(t('throne.vacated')); throneQuery.refetch(); } catch (e) { setMsg(tError(e)); } finally { setBusyId(null); } }}
            className="btn-ghost h-9 px-3 text-xs"
          >
            {t('throne.vacate')}
          </button>
        )}
      </div>
      <p className="card p-3 text-xs opacity-80">{t('members.hint')}</p>
      {me?.role === 'OWNER' && (
        <div className="card border-red-500/40 p-3 text-sm" aria-label={t('admin.transferTitle')}>
          <h2 className="font-bold text-red-400">{t('admin.transferTitle')}</h2>
          <p className="mt-0.5 text-xs opacity-70">{t('admin.transferDesc')}</p>
          <label className="label mt-2">{t('admin.transferPh')}
            <select
              value={transferId}
              onChange={(e) => { setTransferId(e.target.value); setTransferConfirm(''); }}
              className="input text-sm"
            >
              <option value="">—</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.display_name ?? a.username} @{a.username}</option>
              ))}
            </select>
          </label>
          {transferTarget && (
            <label className="label mt-2">{t('admin.transferConfirm', { name: transferTarget.username })}
              <input
                value={transferConfirm}
                onChange={(e) => setTransferConfirm(e.target.value)}
                className="input text-sm" dir="ltr" autoComplete="off"
                placeholder={transferTarget.username}
              />
            </label>
          )}
          <button
            disabled={transferBusy || !transferTarget || transferConfirm !== transferTarget.username}
            onClick={transfer}
            className="btn-danger mt-2 h-11 w-full text-sm"
          >
            {t('admin.transferBtn')}
          </button>
        </div>
      )}
      <input
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setPage(1); }}
        placeholder={t('members.search')}
        aria-label={t('members.search')}
        className="input text-sm"
      />
      {msg && <p className="text-sm font-medium">{msg}</p>}
      <div className="card overflow-hidden !p-0">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_7rem_minmax(0,1fr)] items-center gap-2 border-b border-(--border) px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-(--muted) sm:grid">
          <span>{t('members.player')}</span>
          <span>{t('members.role')}</span>
          <span>{t('members.status')}</span>
          <span className="text-end">{t('members.actions')}</span>
        </div>
        {pageRows.length === 0 ? (
          <p className="p-3 text-sm text-(--muted)">{t('members.noResults')}</p>
        ) : (
          <div className="divide-y divide-(--border)">
            {pageRows.map((m) => {
              const d = drafts[m.id] ?? { role: m.role, status: m.status };
              const set = (patch: Partial<typeof d>) => setDrafts({ ...drafts, [m.id]: { ...d, ...patch } });
              const storedReason = d.status === 'SUSPENDED' ? m.suspend_reason : m.ban_reason;
              const reason = banReasons[m.id] ?? storedReason ?? '';
              const restricted = d.status === 'BANNED' || d.status === 'SUSPENDED' ||
                m.status === 'BANNED' || m.status === 'SUSPENDED';
              const dirty = d.role !== m.role || d.status !== m.status ||
                (restricted && reason.trim() !== (storedReason ?? '').trim());
              const isHolder = throneQuery.data?.holder_id === m.id;
              const isOwnerTarget = m.role === 'OWNER';
              // OWNER is gone from the dropdown for everyone — the owner keeps
              // their position no matter what (role locked + never grantable).
              // Admins get PLAYER/MODERATOR only (enforced server-side too).
              const availableRoles: Role[] =
                me?.role === 'OWNER' ? EDITABLE_ROLES : (['PLAYER', 'MODERATOR'] as Role[]);
              const roleOptions = availableRoles.includes(d.role)
                ? availableRoles
                : [d.role, ...availableRoles];
              return (
                <div key={m.id} className="grid gap-2 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1.6fr)_7rem_7rem_minmax(0,1fr)] sm:items-center">
                  <Link to={`/players/${m.id}`} className="flex min-w-0 items-center gap-2">
                    <Avatar path={m.avatar_url} name={m.display_name ?? m.username} className="h-9 w-9 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{m.display_name ?? m.username}</span>
                      <span className="block truncate text-xs text-(--muted)">@{m.username}</span>
                    </span>
                  </Link>
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <select
                      value={d.role}
                      disabled={isOwnerTarget}
                      aria-label={t('members.role')}
                      title={isOwnerTarget ? 'Owner keeps their position' : undefined}
                      onChange={(e) => set({ role: e.target.value as Role })}
                      className="input text-xs disabled:opacity-60"
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r} disabled={!availableRoles.includes(r)}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={d.status}
                      disabled={isOwnerTarget}
                      aria-label={t('members.status')}
                      title={isOwnerTarget ? t('ban.ownerUntouchable') : undefined}
                      onChange={(e) => set({ status: e.target.value as MemberStatus })}
                      className="input text-xs disabled:opacity-60"
                    >
                      {STATUSES.filter((s) => !(isOwnerTarget && (s === 'BANNED' || s === 'SUSPENDED'))).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {dirty && (
                      <button disabled={busyId === m.id} onClick={() => save(m)} className="btn-primary h-10 px-3 text-xs">
                        {busyId === m.id ? t('common.saving') : t('members.save')}
                      </button>
                    )}
                    {isHolder ? (
                      <span className="inline-block rounded-full bg-brand-500/15 px-2 py-1 text-[11px] font-bold text-brand-300">{t('throne.holder')}</span>
                    ) : (
                      <button disabled={busyId === m.id} onClick={() => crown(m)} className="btn-ghost h-10 px-3 text-xs">
                        {t('throne.crown')}
                      </button>
                    )}
                  </div>
                  {(d.status === 'BANNED' || d.status === 'SUSPENDED' || m.status === 'BANNED' || m.status === 'SUSPENDED') && (
                    <div className="flex flex-col gap-1 sm:col-span-4">
                      <label className="label text-xs">{d.status === 'SUSPENDED' ? t('suspend.motif') : t('ban.motif')}
                        <input
                          value={reason}
                          onChange={(e) => setBanReasons({ ...banReasons, [m.id]: e.target.value.slice(0, 400) })}
                          className="input h-10 text-xs"
                          placeholder={d.status === 'SUSPENDED' ? t('suspend.motifPlaceholder') : t('ban.motifPlaceholder')}
                          maxLength={400}
                        />
                      </label>
                      {m.status === 'BANNED' && m.ban_request && (
                        <div className="rounded-lg border border-(--border) bg-(--surface-2) p-2 text-xs">
                          <p className="font-bold text-amber-400">{t('ban.appealFromMember')}</p>
                          <p className="mt-0.5 whitespace-pre-line opacity-80">{m.ban_request}</p>
                        </div>
                      )}
                      {m.status === 'SUSPENDED' && m.suspend_request && (
                        <div className="rounded-lg border border-(--border) bg-(--surface-2) p-2 text-xs">
                          <p className="font-bold text-amber-400">{t('suspend.appealFromMember')}</p>
                          <p className="mt-0.5 whitespace-pre-line opacity-80">{m.suspend_request}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
