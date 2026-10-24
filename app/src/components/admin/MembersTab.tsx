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

const EDITABLE_ROLES: Role[] = ['PLAYER', 'MODERATOR', 'ADMIN'];
// No REMOVED — members can be suspended/left but never deleted from here.
const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT'];

// Owner-managed user permissions (§10): who may create leagues/cups (ADMIN),
// moderate disputes (MODERATOR), or play (PLAYER). Owner-only guards inside.
export default function MembersTab() {
  const { t , tError} = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [drafts, setDrafts] = useState<Record<string, { role: Role; status: MemberStatus }>>({});
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
      await manageMember({ target: m, role: d.role, status: d.status, actorId: me!.id, actorRole: me!.role });
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
      {pageRows.map((m) => {
        const d = drafts[m.id] ?? { role: m.role, status: m.status };
        const set = (patch: Partial<typeof d>) => setDrafts({ ...drafts, [m.id]: { ...d, ...patch } });
        const dirty = d.role !== m.role || d.status !== m.status;
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
          <div key={m.id} className="card p-3 text-sm">
            <Link to={`/players/${m.id}`} className="font-semibold">{m.display_name ?? m.username} <span className="opacity-60">@{m.username}</span></Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="label">{t('members.role')}
                <select
                  value={d.role}
                  disabled={isOwnerTarget}
                  title={isOwnerTarget ? 'Owner keeps their position' : undefined}
                  onChange={(e) => set({ role: e.target.value as Role })}
                  className="input text-sm disabled:opacity-60"
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r} disabled={!availableRoles.includes(r)}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">{t('members.status')}
                <select value={d.status} onChange={(e) => set({ status: e.target.value as MemberStatus })} className="input text-sm">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            {dirty && (
              <button disabled={busyId === m.id} onClick={() => save(m)} className="btn-primary mt-2 h-10 text-xs">
                {busyId === m.id ? t('common.saving') : t('members.save')}
              </button>
            )}
            {isHolder ? (
              <span className="mt-1 inline-block rounded-full bg-brand-500/15 px-2 py-1 text-[11px] font-bold text-brand-300">{t('throne.holder')}</span>
            ) : (
              <button disabled={busyId === m.id} onClick={() => crown(m)} className="btn-ghost mt-1 h-9 text-xs">
                {t('throne.crown')}
              </button>
            )}
          </div>
        );
      })}
      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </div>
  );
}
