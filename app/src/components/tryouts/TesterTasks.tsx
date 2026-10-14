import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { listMyTesterTasks, submitVerdict } from '../../services/tryoutService';
import { useAuthStore } from '../../stores/authStore';
import WhatsAppIcon from '../ui/WhatsAppIcon';

// Trial matches assigned to me: play, then report pass/fail with the score.
export default function TesterTasks() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [scores, setScores] = useState<Record<string, { a: string; b: string; note: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['tester-tasks', me?.id], queryFn: () => listMyTesterTasks(me!.id), enabled: !!me });

  const rows = (query.data ?? []).filter((r) => !r.verdict);
  if (!me || rows.length === 0) return null;

  const get = (id: string) => scores[id] ?? { a: '', b: '', note: '' };
  const set = (id: string, patch: Partial<{ a: string; b: string; note: string }>) =>
    setScores({ ...scores, [id]: { ...get(id), ...patch } });

  async function send(id: string, verdict: 'PASS' | 'FAIL') {
    const s = get(id);
    const sa = Math.max(0, Math.min(30, parseInt(s.a, 10) || 0));
    const sb = Math.max(0, Math.min(30, parseInt(s.b, 10) || 0));
    setBusyId(id); setMsg(null);
    try {
      await submitVerdict(id, { verdict, sa, sb, note: s.note || null });
      setMsg(t('tryout.verdictSaved'));
      await query.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label={t('tryout.tasksTitle')} className="card mt-3 border-brand-500/50">
      <h2 className="card-title">{t('tryout.tasksTitle')}</h2>
      <p className="mt-1 text-xs opacity-70">{t('tryout.tasksDesc')}</p>
      {msg && <p className="mt-1 text-sm font-medium">{msg}</p>}
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const s = get(r.id);
          const digits = r.contact.replace(/[^\d]/g, '');
          return (
            <div key={r.id} className="rounded-xl bg-white/5 p-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-bold">{r.name}</span>
                {digits && (
                  <a
                    href={`https://wa.me/${digits}?text=${encodeURIComponent(`Salam ${r.name} — VIK Clan`)}`}
                    target="_blank" rel="noreferrer" aria-label={t('tryout.chat')}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25d366]/15"
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                  </a>
                )}
              </div>
              {r.note && <p className="mt-1 whitespace-pre-line text-xs opacity-70">{r.note}</p>}
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs opacity-60">{t('tryout.testerScore')}
                  <input value={s.a} onChange={(e) => set(r.id, { a: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={2} aria-label={t('tryout.testerScore')} className="input ml-1 h-10 w-12 text-center font-bold" />
                </label>
                <span className="font-mono opacity-60">–</span>
                <label className="text-xs opacity-60">{t('tryout.candidateScore')}
                  <input value={s.b} onChange={(e) => set(r.id, { b: e.target.value.replace(/\D/g, '') })} inputMode="numeric" maxLength={2} aria-label={t('tryout.candidateScore')} className="input ml-1 h-10 w-12 text-center font-bold" />
                </label>
              </div>
              <input value={s.note} onChange={(e) => set(r.id, { note: e.target.value })} maxLength={280} placeholder={t('tryout.verdictNote')} aria-label={t('tryout.verdictNote')} className="input mt-2 h-10 text-sm" />
              <div className="mt-2 flex gap-2">
                <button disabled={busyId === r.id} onClick={() => send(r.id, 'PASS')} className="btn-primary h-10 flex-1 text-xs">
                  {t('tryout.verdictPass')}
                </button>
                <button disabled={busyId === r.id} onClick={() => send(r.id, 'FAIL')} className="btn-danger h-10 flex-1 text-xs">
                  {t('tryout.verdictFail')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
