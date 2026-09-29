import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import { listMembers, manageMember } from '../../services/playerService';
import type { MemberStatus, Profile, Role } from '../../types/database';
import { useAuthStore } from '../../stores/authStore';

const ROLES: Role[] = ['PLAYER', 'MODERATOR', 'ADMIN', 'OWNER'];
const STATUSES: MemberStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LEFT', 'REMOVED'];

// Owner-managed user permissions (§10): who may create leagues/cups (ADMIN),
// moderate disputes (MODERATOR), or play (PLAYER). Owner-only guards inside.
export default function MembersTab() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [drafts, setDrafts] = useState<Record<string, { role: Role; status: MemberStatus }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['members'], queryFn: listMembers });

  async function save(m: Profile) {
    const d = drafts[m.id] ?? { role: m.role, status: m.status };
    setBusyId(m.id); setMsg(null);
    try {
      await manageMember({ target: m, role: d.role, status: d.status, actorId: me!.id, actorRole: me!.role });
      setMsg(t('members.saved'));
      await query.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (query.isLoading) return <p className="text-sm">{t('common.loading')}</p>;
  const rows = (query.data ?? []).filter((m) => m.id !== me?.id);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="card p-3 text-xs opacity-80">{t('members.hint')}</p>
      {msg && <p className="text-sm font-medium">{msg}</p>}
      {rows.map((m) => {
        const d = drafts[m.id] ?? { role: m.role, status: m.status };
        const set = (patch: Partial<typeof d>) => setDrafts({ ...drafts, [m.id]: { ...d, ...patch } });
        const dirty = d.role !== m.role || d.status !== m.status;
        return (
          <div key={m.id} className="card p-3 text-sm">
            <Link to={`/players/${m.id}`} className="font-semibold">{m.display_name ?? m.username} <span className="opacity-60">@{m.username}</span></Link>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="label">{t('members.role')}
                <select value={d.role} onChange={(e) => set({ role: e.target.value as Role })} className="input text-sm">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
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
          </div>
        );
      })}
    </div>
  );
}
