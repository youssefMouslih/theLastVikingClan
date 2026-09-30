import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Avatar from '../ui/Avatar';
import { useLocale } from '../../i18n/LocaleContext';
import { listActiveMembers } from '../../services/playerService';
import { answerSquadMember, createSquad, disbandSquad, listSquads, requestToJoin, type SquadDetail } from '../../services/squadService';
import { useAuthStore } from '../../stores/authStore';

// War Council: 3v3 / 4v4 squads. Leader invites (top-down) or players
// request (bottom-up); both sides accept.
export default function SquadsTab() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [form, setForm] = useState({ name: '', size: 4 as 3 | 4, invites: [] as string[], opponent_label: '', match_at: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['squads'], queryFn: listSquads });
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const candidates = (membersQuery.data ?? []).filter((m) => m.id !== me?.id);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      await query.refetch();
      if (ok) setMsg(ok);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () => createSquad({ name: form.name, size: form.size, inviteIds: form.invites, opponent_label: form.opponent_label || null, match_at: form.match_at || null }, me!.id),
      t('squad.created'),
    );
    setForm({ name: '', size: 4, invites: [], opponent_label: '', match_at: '' });
  }

  function toggleInvite(id: string) {
    setForm({ ...form, invites: form.invites.includes(id) ? form.invites.filter((x) => x !== id) : [...form.invites, id].slice(0, form.size - 1) });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {msg && <p className="text-sm font-medium">{msg}</p>}
      <form onSubmit={create} className="card flex flex-col gap-2">
        <h2 className="font-bold">{t('squad.new')}</h2>
        <label className="label">{t('squad.name')}<input required className="input text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Iron Raven Division" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="label">{t('squad.size')}
            <select value={form.size} onChange={(e) => setForm({ ...form, size: Number(e.target.value) as 3 | 4, invites: [] })} className="input text-sm">
              <option value={3}>3v3</option>
              <option value={4}>4v4</option>
            </select>
          </label>
          <label className="label">{t('squad.opponent')}<input value={form.opponent_label} onChange={(e) => setForm({ ...form, opponent_label: e.target.value })} className="input text-sm" placeholder="Clan Valkyrie" /></label>
        </div>
        <label className="label">{t('squad.when')}<input type="datetime-local" value={form.match_at} onChange={(e) => setForm({ ...form, match_at: e.target.value })} className="input text-sm" /></label>
        <div>
          <p className="text-sm font-semibold">{t('squad.invite', { n: form.size - 1 })}</p>
          <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {candidates.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5 text-sm">
                <input type="checkbox" checked={form.invites.includes(m.id)} onChange={() => toggleInvite(m.id)} className="h-5 w-5 accent-[#eab308]" />
                <Avatar path={m.avatar_url} name={m.display_name ?? m.username} className="h-7 w-7 text-xs" />
                <span className="flex-1 truncate">{m.display_name ?? m.username}</span>
              </label>
            ))}
          </div>
        </div>
        <button disabled={busy} className="btn-cta h-11 text-sm">{busy ? t('common.loading') : t('squad.create')}</button>
      </form>

      {(query.data ?? []).map((s) => (
        <SquadCard key={s.id} squad={s} busy={busy} run={run} fmtDate={(iso: string | null) => (iso ? fmtDate(iso) : '—')} />
      ))}
    </div>
  );
}

function SquadCard({ squad: s, busy, run, fmtDate }: {
  squad: SquadDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  fmtDate: (iso: string | null) => string;
}) {
  const { t } = useLocale();
  const me = useAuthStore((st) => st.profile);
  const isLeader = me?.id === s.leader_id;
  const myRow = s.members.find((mm) => mm.player_id === me?.id);
  const accepted = s.members.filter((mm) => mm.status === 'ACCEPTED').length;
  const pendForMe = myRow?.status === 'PENDING' && myRow.role !== 'LEADER';
  const pendForLeader = (m: (typeof s.members)[number]) => isLeader && m.status === 'PENDING' && m.player_id !== me?.id;
  const inSquad = !!myRow && myRow.status !== 'DECLINED';

  return (
    <article className="card p-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="font-display tracking-wide">{s.name}</p>
          <p className="text-xs opacity-70">{s.size}v{s.size}{s.opponent_label ? ` vs ${s.opponent_label}` : ''}{s.match_at ? ` • ${fmtDate(s.match_at)}` : ''} • {accepted}/{s.size}</p>
        </div>
        <span className="status-badge rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] text-brand-300">{s.status}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {s.members.map((mm) => (
          <li key={mm.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5">
            <Avatar path={mm.player?.avatar_url} name={mm.player?.display_name ?? mm.player?.username ?? '?'} className="h-7 w-7 text-xs" />
            <span className="flex-1 truncate font-semibold">{mm.player?.display_name ?? mm.player?.username ?? '?'}</span>
            {mm.role === 'LEADER' && <span className="text-[11px] font-bold text-brand-300">{t('squad.leader')}</span>}
            {mm.status === 'PENDING' && <span className="text-[11px] opacity-60">{t('squad.pending')}</span>}
            {pendForLeader(mm) && (
              <span className="flex gap-1">
                <button disabled={busy} onClick={() => run(() => answerSquadMember(mm.id, true), t('squad.updated'))} className="btn-primary h-8 px-2 text-[11px]">{t('battle.accept')}</button>
                <button disabled={busy} onClick={() => run(() => answerSquadMember(mm.id, false), t('squad.updated'))} className="btn-ghost h-8 px-2 text-[11px]">{t('battle.decline')}</button>
              </span>
            )}
          </li>
        ))}
        {Array.from({ length: Math.max(0, s.size - s.members.filter((mm) => mm.status !== 'DECLINED').length) }).map((_, i) => (
          <li key={`open-${i}`} className="rounded-lg border border-dashed border-white/15 p-1.5 text-xs opacity-50">{t('squad.openSlot')}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        {pendForMe && (
          <>
            <button disabled={busy} onClick={() => run(() => answerSquadMember(myRow!.id, true), t('squad.updated'))} className="btn-primary h-10 flex-1 text-xs">{t('battle.accept')}</button>
            <button disabled={busy} onClick={() => run(() => answerSquadMember(myRow!.id, false), t('squad.updated'))} className="btn-ghost h-10 flex-1 text-xs">{t('battle.decline')}</button>
          </>
        )}
        {!inSquad && s.status === 'FORMING' && (
          <button disabled={busy} onClick={() => run(() => requestToJoin(s.id, me!.id), t('squad.requested'))} className="btn-ghost h-10 flex-1 text-xs">{t('squad.request')}</button>
        )}
        {isLeader && (
          <button disabled={busy} onClick={() => { if (confirm(t('squad.disband') + '?')) run(() => disbandSquad(s.id), t('squad.disbanded')); }} className="btn-danger h-9 px-3 text-xs">{t('squad.disband')}</button>
        )}
      </div>
    </article>
  );
}
