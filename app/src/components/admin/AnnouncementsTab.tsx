import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { createAnnouncement, deleteAnnouncement, listActiveAnnouncements } from '../../services/announcementService';
import { notify } from '../../services/notificationService';
import { listActiveMembers } from '../../services/playerService';
import type { AnnouncementPriority } from '../../types/database';
import { useAuthStore } from '../../stores/authStore';

// Announcements management (§65). Publishing notifies all active members.
export default function AnnouncementsTab() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [form, setForm] = useState({ title: '', content: '', priority: 'NORMAL' as AnnouncementPriority, expires: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['announcements-admin'], queryFn: listActiveAnnouncements });

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const a = await createAnnouncement(
        { title: form.title, content: form.content, priority: form.priority, expires_at: form.expires ? new Date(form.expires).toISOString() : null },
        me!.id,
      );
      const members = await listActiveMembers();
      for (const m of members) {
        if (m.id !== me!.id) await notify(m.id, 'ANNOUNCEMENT', a.title, a.content.slice(0, 140));
      }
      setMsg(`Published to ${members.length} members.`);
      setForm({ title: '', content: '', priority: 'NORMAL', expires: '' });
      await query.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <form onSubmit={publish} className="card flex flex-col gap-2">
        <h2 className="font-bold">{t('ann.new')}</h2>
        <input required placeholder={t('ann.title')} aria-label={t('ann.title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input text-sm" />
        <textarea required placeholder={t('ann.content')} aria-label={t('ann.content')} rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="input h-auto py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as AnnouncementPriority })} className="input text-sm">
            <option>NORMAL</option><option>IMPORTANT</option><option>URGENT</option>
          </select>
          <input type="datetime-local" aria-label={t('ann.expiry')} value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} className="input text-sm" />
        </div>
        {msg && <p className="text-sm font-medium">{msg}</p>}
        <button disabled={busy} className="btn-primary h-11">
          {busy ? t('ann.publishing') : t('ann.publish')}
        </button>
      </form>
      <div className="mt-2 flex flex-col gap-2">
        {(query.data ?? []).map((a) => (
          <article key={a.id} className="card p-3 text-sm">
            <p className="font-bold">{a.title} <span className="status-badge opacity-60">{a.priority}</span></p>
            <p className="opacity-80">{a.content}</p>
            <button
              onClick={async () => { if (confirm(t('ann.deleteConfirm'))) { await deleteAnnouncement(a.id); query.refetch(); } }}
              className="mt-1 text-xs underline"
            >
              {t('ann.delete')}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
