import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Emblem from '../emblem/Emblem';
import { useLocale } from '../../i18n/LocaleContext';
import { generateBatch, generateOne, type BatchProgress } from '../../services/badgeForge';
import { listCompetitions } from '../../services/competitionService';
import { awardHonour, deleteHonour, listRecentHonours, type Honour, type HonourType } from '../../services/honourService';
import { notify } from '../../services/notificationService';
import { listActiveMembers } from '../../services/playerService';
import { getBadgeImageUrl } from '../../services/storageService';
import { useAuthStore } from '../../stores/authStore';

// Manual honours in V1 (§118): admin awards titles + season MVP.
export default function HonoursTab() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [form, setForm] = useState({ player_id: '', competition_id: '', type: 'LEAGUE_CHAMPION' as HonourType, name: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgeId, setForgeId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
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
      <div className="card mt-2 flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t('hon.forgeTitle')}</h2>
          <button
            type="button"
            disabled={batchBusy}
            onClick={async () => {
              setBatchBusy(true); setMsg(null); setProgress({ done: 0, total: 0, current: null, failed: 0 });
              try {
                const report = await generateBatch({ onProgress: setProgress });
                setMsg(t('hon.forgeBatchDone', { n: report.ok.length, f: report.failed.length }));
                await honoursQuery.refetch();
              } catch (err) {
                setMsg(err instanceof Error ? err.message : 'Batch failed.');
              } finally {
                setBatchBusy(false);
                setProgress(null);
              }
            }}
            className="btn-ghost h-10 px-3 text-xs"
          >
            {batchBusy ? t('hon.forging') : t('hon.forgeAll')}
          </button>
        </div>
        {progress && progress.total > 0 && (
          <div role="status" className="text-xs opacity-80">
            {t('hon.forgeProgress', { done: progress.done, total: progress.total, f: progress.failed })}
            {progress.current && ` — ${progress.current}`}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="bar-fill h-full bg-brand-500" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}
        <p className="text-xs opacity-60">{t('hon.forgeHint')}</p>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {(honoursQuery.data ?? []).map((h) => (
          <div key={h.id} className="card flex items-center gap-2 p-2 text-sm">
            <ForgeThumb honour={h} />
            <span className="flex-1">{h.name} — <b>{names[h.player_id] ?? '?'}</b> <span className="opacity-60">• {h.type}</span></span>
            <button
              type="button"
              disabled={forgeId === h.id}
              onClick={async () => {
                setForgeId(h.id); setMsg(null);
                try {
                  await generateOne(h);
                  setMsg(t('hon.forged'));
                  await honoursQuery.refetch();
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : 'Forge failed.');
                } finally {
                  setForgeId(null);
                }
              }}
              className="text-xs font-semibold text-brand-300 underline"
            >
              {forgeId === h.id ? t('hon.forging') : t('hon.forgeOne')}
            </button>
            <button onClick={async () => { if (confirm(t('hon.removeConfirm'))) { await deleteHonour(h.id); honoursQuery.refetch(); } }} className="text-xs underline">{t('hon.remove')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForgeThumb({ honour }: { honour: Honour }) {
  const imgQuery = useQuery({
    queryKey: ['badge-url', honour.id, honour.image_url],
    queryFn: () => getBadgeImageUrl(honour.image_url),
    enabled: !!honour.image_url,
    staleTime: 1000 * 60 * 60,
  });
  const img = imgQuery.data ?? null;
  if (!img) {
    return <Emblem type={honour.type} className="h-10 w-12" />;
  }
  return <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />;
}
