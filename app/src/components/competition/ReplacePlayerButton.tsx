import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { listActiveMembers } from '../../services/playerService';
import { replacePlayer } from '../../services/replacementService';
import { useAuthStore } from '../../stores/authStore';

// Admin player replacement (§46-49). Future SCHEDULED only; history preserved.
export default function ReplacePlayerButton({
  competitionId,
  originalId,
  originalName,
  memberIds,
  onDone,
}: {
  competitionId: string;
  originalId: string;
  originalName: string;
  memberIds: string[];
  onDone: (msg: string) => void;
}) {
  const me = useAuthStore((s) => s.profile);
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; username: string; display_name: string | null }[]>([]);
  const [replacementId, setReplacementId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setOpen(true);
    const all = await listActiveMembers();
    setCandidates(all.filter((m) => !memberIds.includes(m.id)).map((m) => ({ id: m.id, username: m.username, display_name: m.display_name })));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!replacementId || !reason.trim()) return;
    if (!confirm(t('replace.confirmDialog', { name: originalName }))) return;
    setBusy(true);
    try {
      const r = await replacePlayer({ competitionId, originalId, replacementId, reason: reason.trim(), adminId: me!.id });
      setOpen(false);
      onDone(t('replace.done', { n: r.transferred }));
    } catch (err) {
      onDone(err instanceof Error ? err.message : 'Replace failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button onClick={load} className="h-8 rounded-lg border px-2 text-xs">{t('replace.replace')}</button>;

  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-1 rounded-xl bg-gray-50 p-2 dark:bg-gray-900">
      <select required value={replacementId} onChange={(e) => setReplacementId(e.target.value)} className="h-10 rounded-lg border px-2 text-sm">
        <option value="">{t('replace.select')}</option>
        {candidates.map((c) => <option key={c.id} value={c.id}>{c.display_name ?? c.username} (@{c.username})</option>)}
      </select>
      <input required placeholder={t('replace.reason')} value={reason} onChange={(e) => setReason(e.target.value)} className="h-10 rounded-lg border px-2 text-sm" />
      <div className="flex gap-1">
        <button disabled={busy} className="h-9 flex-1 rounded-lg bg-black text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">{busy ? '…' : t('replace.confirm')}</button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border px-3 text-xs">{t('common.cancel')}</button>
      </div>
    </form>
  );
}
