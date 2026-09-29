import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { listCompetitions } from '../../services/competitionService';
import { awardHonour, deleteHonour, listRecentHonours, type HonourType } from '../../services/honourService';
import { notify } from '../../services/notificationService';
import { listActiveMembers } from '../../services/playerService';
import { useAuthStore } from '../../stores/authStore';

// Manual honours in V1 (§118): admin awards titles + season MVP.
export default function HonoursTab() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [form, setForm] = useState({ player_id: '', competition_id: '', type: 'LEAGUE_CHAMPION' as HonourType, name: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const compsQuery = useQuery({ queryKey: ['competitions'], queryFn: () => listCompetitions() });
  const honoursQuery = useQuery({ queryKey: ['honours'], queryFn: () => listRecentHonours() });
  const names = Object.fromEntries((membersQuery.data ?? []).map((m) => [m.id, m.display_name ?? m.username]));

  async function award(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await awardHonour({ player_id: form.player_id, competition_id: form.competition_id || null, type: form.type, name: form.name || form.type.replace(/_/g, ' ') }, me!.id);
      await notify(form.player_id, 'COMPETITION_FINISHED', form.name || form.type, 'An honour was added to your profile.');
      setMsg(t('hon.awarded'));
      setForm({ player_id: '', competition_id: '', type: 'LEAGUE_CHAMPION', name: '' });
      await honoursQuery.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Award failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <form onSubmit={award} className="card flex flex-col gap-2">
        <h2 className="font-bold">{t('hon.award')}</h2>
        <select required value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value })} className="input text-sm">
          <option value="">{t('hon.selectPlayer')}</option>
          {(membersQuery.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.display_name ?? m.username}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as HonourType })} className="input text-sm">
            <option>LEAGUE_CHAMPION</option><option>CUP_CHAMPION</option><option>TOURNAMENT_CHAMPION</option><option>SEASON_MVP</option><option>SPECIAL</option>
          </select>
          <select value={form.competition_id} onChange={(e) => setForm({ ...form, competition_id: e.target.value })} className="input text-sm">
            <option value="">{t('hon.noComp')}</option>
            {(compsQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <input placeholder={t('hon.label')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input text-sm" />
        {msg && <p className="text-sm font-medium">{msg}</p>}
        <button disabled={busy} className="btn-primary h-11">
          {busy ? t('hon.awarding') : t('hon.awardBtn')}
        </button>
      </form>
      <div className="mt-2 flex flex-col gap-1">
        {(honoursQuery.data ?? []).map((h) => (
          <div key={h.id} className="card flex items-center gap-2 p-2 text-sm">
            <span className="flex-1">{h.name} — <b>{names[h.player_id] ?? '?'}</b> <span className="opacity-60">• {h.type}</span></span>
            <button onClick={async () => { if (confirm(t('hon.removeConfirm'))) { await deleteHonour(h.id); honoursQuery.refetch(); } }} className="text-xs underline">{t('hon.remove')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
