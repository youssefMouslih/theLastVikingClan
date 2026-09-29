import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n/LocaleContext';
import { listDisputes, resolveDispute, type DisputeRow, type ResolveAction } from '../../services/disputeService';
import { useAuthStore } from '../../stores/authStore';

// Admin dispute queue (§43). Every decision audit-logged by the service.
export default function DisputesTab() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [scores, setScores] = useState<Record<string, { a: string; b: string; note: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['disputes-open'], queryFn: () => listDisputes(true) });

  async function run(d: DisputeRow, action: ResolveAction) {
    const s = scores[d.id] ?? { a: '', b: '', note: '' };
    setBusyId(d.id); setMsg(null);
    try {
      await resolveDispute(d, me!.id, action, s.a === '' ? undefined : Number(s.a), s.b === '' ? undefined : Number(s.b), s.note || undefined);
      setMsg(t('disputes.resolved', { action }));
      await query.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Resolve failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (query.isLoading) return <p className="text-sm">{t('disputes.loading')}</p>;
  const rows = query.data ?? [];
  if (rows.length === 0) return <p className="card text-sm opacity-70">{t('disputes.empty')}</p>;

  return (
    <div className="flex flex-col gap-2">
      {msg && <p className="text-sm font-medium">{msg}</p>}
      {rows.map((d) => {
        const s = scores[d.id] ?? { a: '', b: '', note: '' };
        const set = (patch: Partial<typeof s>) => setScores({ ...scores, [d.id]: { ...s, ...patch } });
        return (
          <article key={d.id} className="card p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="status-badge rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-400">{d.status}</span>
              <span className="font-semibold">{d.reason}</span>
            </div>
            <p className="mt-1 opacity-80">
              {d.reporter?.display_name ?? d.reporter?.username ?? d.created_by.slice(0, 8)} • {fmtDate(d.created_at)}
            </p>
            {d.description && <p className="mt-1 italic">“{d.description}”</p>}
            {d.match && <p className="mt-1">{t('disputes.matchPrefix')} <Link to={`/matches/${d.match.id}`} className="font-semibold text-brand-400">{t('disputes.viewMatch', { a: d.match.score_a ?? 0, b: d.match.score_b ?? 0, status: d.match.status })}</Link></p>}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input inputMode="numeric" type="number" min={0} placeholder={t('disputes.scoreA')} aria-label={t('disputes.scoreA')} value={s.a} onChange={(e) => set({ a: e.target.value })} className="input text-center" />
              <input inputMode="numeric" type="number" min={0} placeholder={t('disputes.scoreB')} aria-label={t('disputes.scoreB')} value={s.b} onChange={(e) => set({ b: e.target.value })} className="input text-center" />
              <input placeholder={t('disputes.note')} value={s.note} onChange={(e) => set({ note: e.target.value })} className="input" />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button disabled={busyId === d.id} onClick={() => run(d, 'confirm_submitted')} className="btn-primary h-9 px-3 text-xs">{t('disputes.accept')}</button>
              <button disabled={busyId === d.id} onClick={() => run(d, 'set_result')} className="btn-ghost h-9 px-3 text-xs">{t('disputes.change')}</button>
              <button disabled={busyId === d.id} onClick={() => run(d, 'forfeit_a')} className="btn-ghost h-9 px-3 text-xs">{t('disputes.forfeitA')}</button>
              <button disabled={busyId === d.id} onClick={() => run(d, 'forfeit_b')} className="btn-ghost h-9 px-3 text-xs">{t('disputes.forfeitB')}</button>
              <button disabled={busyId === d.id} onClick={() => { if (confirm(t('disputes.rejectConfirm'))) run(d, 'reject'); }} className="btn-ghost h-9 px-3 text-xs">{t('disputes.reject')}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
