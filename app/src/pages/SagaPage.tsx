import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import BottomNav from '../components/ui/BottomNav';
import Avatar from '../components/ui/Avatar';
import CoinImg from '../components/ui/CoinImg';
import Icon from '../components/ui/Icon';
import { useLocale } from '../i18n/LocaleContext';
import { claimQuest, getSeasonBoard, getTotalXP, levelFor, QUESTS, questProgress, type QuestDef } from '../services/sagaService';
import { useAuthStore } from '../stores/authStore';

// Saga: Glory levels, quest board, seasonal leaderboard.
export default function SagaPage() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const [tab, setTab] = useState<'quests' | 'ranks'>('quests');
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const xpQuery = useQuery({ queryKey: ['xp', me?.id], queryFn: () => getTotalXP(me!.id), enabled: !!me });
  const boardQuery = useQuery({ queryKey: ['season-board'], queryFn: () => getSeasonBoard() });
  const xp = xpQuery.data ?? 0;
  const { level, next, progress } = levelFor(xp);

  return (
    <main className="page">
      <h1 className="font-display flex items-center gap-2 text-xl tracking-wide">
        <Icon name="medal" className="h-6 w-6 text-brand-400" /> {t('saga.title')}
      </h1>

      <section className="hero mt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">{t(level.nameKey)}</p>
            <p className="font-display flex items-center gap-1.5 text-3xl"><CoinImg className="h-7 w-7" />{xp} <span className="text-sm opacity-70">GP</span></p>          </div>
          {next && <p className="text-xs opacity-70">{t('saga.nextLevel', { name: t(next.nameKey), n: next.min - xp })}</p>}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </section>

      <nav aria-label="Saga" className="mt-3 flex gap-1 border-b border-[var(--border)]">
        {(['quests', 'ranks'] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`h-11 flex-1 px-3 text-sm font-semibold ${tab === tb ? 'border-b-2 border-brand-500 text-brand-400' : 'opacity-60'}`}>
            {tb === 'quests' ? t('saga.quests') : t('saga.ranks')}
          </button>
        ))}
      </nav>
      {msg && <p className="mt-1 text-sm font-medium">{msg}</p>}

      {tab === 'quests' && (
        <div className="mt-3 flex flex-col gap-2">
          {QUESTS.map((q) => (
            <QuestRow key={q.key} quest={q} userId={me!.id} busyKey={busyKey} setBusyKey={setBusyKey} setMsg={setMsg} />
          ))}
        </div>
      )}

      {tab === 'ranks' && (
        <div className="mt-3 flex flex-col gap-2">
          {(boardQuery.data ?? []).map((b, i) => (
            <div key={b.player_id} className={`card flex items-center gap-2 p-3 text-sm ${b.player_id === me?.id ? 'border-brand-500/60' : ''}`}>
              <span className="font-display w-6 text-center">{i + 1}</span>
              <Avatar path={b.avatar_url} name={b.display_name ?? b.username} className="h-9 w-9 text-sm" />
              <span className="flex-1 truncate font-semibold">{b.display_name ?? b.username}</span>
              <span className="font-display flex items-center gap-1 text-brand-300"><CoinImg className="h-4 w-4" />{b.xp}</span>
            </div>
          ))}
          {(boardQuery.data ?? []).length === 0 && <p className="card text-sm opacity-70">{t('saga.emptyBoard')}</p>}
        </div>
      )}
      <BottomNav />
    </main>
  );
}

function QuestRow({ quest, userId, busyKey, setBusyKey, setMsg }: {
  quest: QuestDef;
  userId: string;
  busyKey: string | null;
  setBusyKey: (k: string | null) => void;
  setMsg: (m: string | null) => void;
}) {
  const { t } = useLocale();
  const query = useQuery({ queryKey: ['quest', userId, quest.key], queryFn: () => questProgress(userId, quest) });
  const p = query.data;

  async function claim() {
    setBusyKey(quest.key); setMsg(null);
    try {
      await claimQuest(userId, quest);
      setMsg(t('saga.claimed', { n: quest.xp }));
      await query.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <article className="card p-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <p className="font-bold">{t(quest.titleKey)}</p>
          <p className="text-xs opacity-70">{t(quest.descKey)}</p>
        </div>
        <span className="font-display flex items-center gap-1 text-accent-400"><CoinImg className="h-4 w-4" />+{quest.xp}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-brand-400" style={{ width: `${p ? Math.round((p.done / quest.target) * 100) : 0}%` }} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs opacity-70">{p ? `${p.done}/${quest.target}` : '…'}</span>
        <span className="status-badge ms-auto rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{quest.kind === 'daily' ? t('saga.daily') : t('saga.weekly')}</span>
        {p?.complete && !p.claimed && (
          <button disabled={busyKey === quest.key} onClick={claim} className="btn-primary h-9 px-4 text-xs">
            {busyKey === quest.key ? t('common.loading') : t('saga.claim')}
          </button>
        )}
        {p?.claimed && <span className="text-xs font-bold text-green-400">{t('saga.claimedDone')}</span>}
      </div>
    </article>
  );
}
