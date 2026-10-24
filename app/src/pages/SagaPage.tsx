import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Avatar from '../components/ui/Avatar';
import CoinImg from '../components/ui/CoinImg';
import { usePersistentTab } from '../hooks/usePersistentTab';
import { CountUp, FadeIn } from '../components/ui/Motion';
import StatusBadge from '../components/ui/StatusBadge';
import Icon from '../components/ui/Icon';
import QueryError from '../components/ui/QueryError';
import { useLocale } from '../i18n/LocaleContext';
import { claimQuest, currentSeason, getSeasonBoard, getTotalXP, levelFor, QUESTS, questProgress, answerGift, listIncomingGifts, listOutgoingGifts, type QuestDef } from '../services/sagaService';
import { getClanSettings } from '../services/clanService';
import { useAuthStore } from '../stores/authStore';

// Saga: Glory levels, quest board, seasonal leaderboard.
export default function SagaPage() {
  const { t, tError } = useLocale();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.profile);
  const [params] = useSearchParams();
  const sagaTabs = ['quests', 'ranks', 'gifts'] as const;
  const requestedTab = sagaTabs.find((candidate) => candidate === params.get('tab'));
  const [tab, setTab] = usePersistentTab('vik-tab-saga', requestedTab ?? 'quests', sagaTabs, requestedTab !== undefined);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [giftBusy, setGiftBusy] = useState<string | null>(null);

  const xpQuery = useQuery({ queryKey: ['xp', me?.id], queryFn: () => getTotalXP(me!.id), enabled: !!me });
  const boardQuery = useQuery({ queryKey: ['season-board'], queryFn: () => getSeasonBoard() });
  const giftsInQuery = useQuery({ queryKey: ['gifts-in', me?.id], queryFn: () => listIncomingGifts(me!.id), enabled: !!me });
  const giftsOutQuery = useQuery({ queryKey: ['gifts-out', me?.id], queryFn: () => listOutgoingGifts(me!.id), enabled: !!me });
  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const norse = (clanQuery.data?.quest_names ?? 'classic') === 'norse';
  const xp = xpQuery.data ?? 0;
  const { level, next, progress } = levelFor(xp);
  const tabs = ['quests', 'ranks', 'gifts'] as const;
  const incomingGifts = giftsInQuery.data ?? [];

  useEffect(() => {
    const giftId = params.get('gift');
    if (!giftId || !giftsInQuery.data) return;
    document.getElementById(`gift-request-${giftId}`)?.scrollIntoView({ block: 'center' });
  }, [giftsInQuery.data, params]);

  return (
    <main className="page">
      <header className="hero">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <Icon name="medal" className="h-6 w-6 text-brand-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">{t('saga.teaser')}</p>
            <h1 className="font-display mt-1 text-2xl tracking-wide">{t('saga.title')}</h1>
          </div>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold tabular-nums text-white/75">{currentSeason()}</span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/65">{xpQuery.isError ? '—' : t(level.nameKey)}</p>
            <p className="font-display mt-1 flex items-center gap-2 text-3xl tabular-nums">
              <CoinImg className="h-7 w-7" />
              {xpQuery.isLoading ? <span className="skeleton inline-block h-8 w-20 rounded-md">000</span> : xpQuery.isError ? '—' : <CountUp value={xp} />}
              <span className="text-sm text-white/65">GP</span>
            </p>
          </div>
          {next && !xpQuery.isError && (
            <p className="max-w-40 text-end text-xs leading-relaxed text-white/70">
              {t('saga.nextLevel', { name: t(next.nameKey), n: next.min - xp })}
            </p>
          )}
        </div>
        {xpQuery.isError ? (
          <QueryError error={xpQuery.error} onRetry={() => void xpQuery.refetch()} compact />
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-white/75">{next ? `${level.min} GP` : t(level.nameKey)}</span>
              <span className="tabular-nums text-white/75">{next ? `${next.min} GP` : t('saga.lvl7')}</span>
            </div>
            <progress
              className="mt-2 block h-3 w-full overflow-hidden rounded-full accent-brand-400"
              value={progress * 100}
              max={100}
              aria-label={next ? t('saga.nextLevel', { name: t(next.nameKey), n: next.min - xp }) : t(level.nameKey)}
            />
            <p className="mt-2 text-end text-xs font-semibold tabular-nums text-white/75">{Math.round(progress * 100)}%</p>
          </>
        )}
      </header>

      <div role="tablist" aria-label={t('saga.title')} aria-orientation="horizontal" className="mt-4 flex gap-1 overflow-x-auto border-b border-(--border)">
        {tabs.map((tb, i) => {
          const label = tb === 'quests' ? t('saga.quests') : tb === 'ranks' ? t('saga.ranks') : `${t('gift.title')}${incomingGifts.length ? ` (${incomingGifts.length})` : ''}`;
          return (
            <button
              key={tb}
              ref={(element) => { tabRefs.current[i] = element; }}
              id={`saga-tab-${tb}`}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              aria-controls="saga-tab-panel"
              tabIndex={tab === tb ? 0 : -1}
              onClick={() => setTab(tb)}
              onKeyDown={(event) => {
                const rtl = document.documentElement.dir === 'rtl';
                const direction = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
                const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : direction ? (i + direction + tabs.length) % tabs.length : -1;
                if (nextIndex >= 0) {
                  event.preventDefault();
                  setTab(tabs[nextIndex]);
                  tabRefs.current[nextIndex]?.focus();
                }
              }}
              className={`h-12 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors ${tab === tb ? 'border-brand-500 text-brand-400' : 'border-transparent opacity-65 hover:opacity-100'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p
        role={feedback?.isError ? 'alert' : 'status'}
        aria-live={feedback?.isError ? 'assertive' : 'polite'}
        aria-atomic="true"
        className={feedback ? `mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${feedback.isError ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-brand-500/30 bg-brand-500/10'}` : 'sr-only'}
      >
        {feedback?.message ?? ''}
      </p>

      {tab === 'quests' && (
        <section id="saga-tab-panel" role="tabpanel" tabIndex={0} aria-labelledby="saga-tab-quests" className="mt-4 flex flex-col gap-4 focus-visible:rounded-xl">
          {(['daily', 'weekly'] as const).map((kind) => {
            const quests = QUESTS.filter((quest) => quest.kind === kind);
            return (
              <section key={kind} aria-labelledby={`saga-${kind}-heading`}>
                <h2 id={`saga-${kind}-heading`} className="card-title mb-2">{kind === 'daily' ? t('saga.daily') : t('saga.weekly')}</h2>
                <div className="flex flex-col gap-2">
                  {quests.map((quest, i) => (
                    <FadeIn key={quest.key} delay={Math.min(i * 60, 240)}>
                      <QuestRow quest={quest} userId={me!.id} busyKey={busyKey} setBusyKey={setBusyKey} setFeedback={setFeedback} norse={norse} onClaimed={() => {
                        void queryClient.invalidateQueries({ queryKey: ['xp', me?.id] });
                        void queryClient.invalidateQueries({ queryKey: ['season-board'] });
                      }} />
                    </FadeIn>
                  ))}
                </div>
              </section>
            );
          })}
          {norse && (
            <>
              <button
                type="button"
                onClick={() => document.getElementById('war-words')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
                className="h-11 text-sm font-semibold text-brand-400 underline"
              >
                {t('saga.wordsLink')}
              </button>
              <WarWords />
            </>
          )}
        </section>
      )}

      {tab === 'gifts' && (
        <section id="saga-tab-panel" role="tabpanel" tabIndex={0} aria-labelledby="saga-tab-gifts" className="mt-4 flex flex-col gap-5 focus-visible:rounded-xl">
          <section aria-labelledby="saga-incoming-heading">
            <h2 id="saga-incoming-heading" className="card-title mb-2">{t('gift.incoming')}</h2>
            {giftsInQuery.isLoading && <div aria-busy="true"><SkeletonRows count={2} /></div>}
            {giftsInQuery.isError && <QueryError error={giftsInQuery.error} onRetry={() => void giftsInQuery.refetch()} compact />}
            {!giftsInQuery.isLoading && !giftsInQuery.isError && incomingGifts.length === 0 && <p className="card text-sm opacity-70">{t('gift.emptyIn')}</p>}
          {(giftsInQuery.data ?? []).map((g) => (
            <article id={`gift-request-${g.id}`} key={g.id} className="card mt-2 scroll-mt-4 grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 p-3 text-sm">
              <Avatar path={g.requester?.avatar_url} name={g.requester?.display_name ?? g.requester?.username ?? '?'} className="h-10 w-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate font-bold">{g.requester?.display_name ?? g.requester?.username}</p>
                <p className="mt-0.5 text-xs opacity-70">{t('gift.balance', { n: g.amount })}{g.message ? ` — “${g.message}”` : ''}</p>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <button
                  disabled={giftBusy !== null}
                  onClick={async () => {
                    setGiftBusy(g.id); setFeedback(null);
                    try {
                      await answerGift(g, true);
                      setFeedback({ message: t('gift.accepted'), isError: false });
                      await Promise.all([giftsInQuery.refetch(), xpQuery.refetch(), boardQuery.refetch()]);
                    } catch (err) {
                      setFeedback({ message: tError(err), isError: true });
                    } finally {
                      setGiftBusy(null);
                    }
                  }}
                  className="btn-primary h-11 px-3 text-xs"
                >
                  {giftBusy === g.id ? t('common.loading') : t('gift.accept')}
                </button>
                <button
                  disabled={giftBusy !== null}
                  onClick={async () => {
                    setGiftBusy(g.id); setFeedback(null);
                    try {
                      await answerGift(g, false);
                      setFeedback({ message: t('gift.declined'), isError: false });
                      await giftsInQuery.refetch();
                    } catch (err) {
                      setFeedback({ message: tError(err), isError: true });
                    } finally {
                      setGiftBusy(null);
                    }
                  }}
                  className="btn-ghost h-11 px-3 text-xs"
                >
                  {giftBusy === g.id ? t('common.loading') : t('gift.decline')}
                </button>
              </div>
            </article>
          ))}
          </section>
          <section aria-labelledby="saga-outgoing-heading">
            <h2 id="saga-outgoing-heading" className="card-title mb-2">{t('gift.outgoing')}</h2>
            {giftsOutQuery.isLoading && <div aria-busy="true"><SkeletonRows count={2} /></div>}
            {giftsOutQuery.isError && <QueryError error={giftsOutQuery.error} onRetry={() => void giftsOutQuery.refetch()} compact />}
            {!giftsOutQuery.isLoading && !giftsOutQuery.isError && (giftsOutQuery.data ?? []).length === 0 && <p className="card text-sm opacity-70">{t('gift.emptyOut')}</p>}
          {(giftsOutQuery.data ?? []).map((g) => (
            <article key={g.id} className="card mt-2 flex min-h-16 items-center gap-3 p-3 text-sm">
              <Avatar path={g.giver?.avatar_url} name={g.giver?.display_name ?? g.giver?.username ?? '?'} className="h-10 w-10 text-sm" />
              <span className="min-w-0 flex-1 truncate font-semibold">{g.giver?.display_name ?? g.giver?.username}</span>
              <span className="font-display flex items-center gap-1 text-brand-300"><CoinImg className="h-4 w-4" />{g.amount}</span>
              <StatusBadge value={g.status} />
            </article>
          ))}
          </section>
        </section>
      )}

      {tab === 'ranks' && (
        <section id="saga-tab-panel" role="tabpanel" tabIndex={0} aria-labelledby="saga-tab-ranks" className="mt-4 flex flex-col gap-2 focus-visible:rounded-xl">
          <h2 className="card-title mb-1">{currentSeason()}</h2>
          {boardQuery.isLoading && <div aria-busy="true"><SkeletonRows count={5} /></div>}
          {boardQuery.isError && <QueryError error={boardQuery.error} onRetry={() => void boardQuery.refetch()} />}
          {(boardQuery.data ?? []).map((b, i) => (
            <FadeIn key={b.player_id} delay={Math.min(i * 50, 400)}>
            <div className={`card flex min-h-16 items-center gap-3 p-3 text-sm ${b.player_id === me?.id ? 'border-brand-500/60' : ''}`}>
              <span className={`font-display w-7 text-center text-base ${i < 3 ? 'text-brand-300' : 'text-(--muted)'}`}>{i + 1}</span>
              <Avatar path={b.avatar_url} name={b.display_name ?? b.username} className="h-9 w-9 text-sm" />
              <span className="flex-1 truncate font-semibold">{b.display_name ?? b.username}</span>
              <span className="font-display flex items-center gap-1 text-brand-300"><CoinImg className="h-4 w-4" />{b.xp}</span>
            </div>
            </FadeIn>
          ))}
          {!boardQuery.isLoading && !boardQuery.isError && (boardQuery.data ?? []).length === 0 && <p className="card text-sm opacity-70">{t('saga.emptyBoard')}</p>}
        </section>
      )}
      <BottomNav />
    </main>
  );
}

// War-words glossary: every Old Norse term used in the app, with its meaning
// in the player's own language (norse.* keys follow the selected locale).
const QUEST_WORDS = ['berserksgangr', 'viking', 'strandhogg', 'felag', 'drengskapr', 'holmganga'] as const;
const MORE_WORDS = ['utlagr', 'mansongr', 'hersir', 'vikingaferd', 'skjaldborg', 'blodorn'] as const;

function WarWords() {
  const { t } = useLocale();
  const group = (titleKey: 'saga.wordsQuests' | 'saga.wordsMore', words: readonly string[]) => (
    <>
      <h3 className="card-title mt-2">{t(titleKey)}</h3>
      <dl className="mt-1 flex flex-col">
        {words.map((w) => (
          <div key={w} className="border-b border-(--border) py-1.5 last:border-0">
            <dt className="font-display text-sm tracking-wide text-brand-300">{t(`norse.${w}` as 'norse.viking')}</dt>
            <dd className="text-xs opacity-75">{t(`norse.${w}D` as 'norse.vikingD')}</dd>
          </div>
        ))}
      </dl>
    </>
  );
  return (
    <section id="war-words" aria-label={t('saga.wordsTitle')} className="card mt-1 scroll-mt-24 p-4">
      <h2 className="font-display text-base tracking-wide">{t('saga.wordsTitle')}</h2>
      <p className="mt-0.5 text-xs opacity-70">{t('saga.wordsHint')}</p>
      {group('saga.wordsQuests', QUEST_WORDS)}
      {group('saga.wordsMore', MORE_WORDS)}
    </section>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card flex min-h-16 items-center gap-3 p-3" aria-hidden="true">
          <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton h-4 w-2/5 rounded" />
            <span className="skeleton h-3 w-3/5 rounded" />
          </span>
        </div>
      ))}
    </div>
  );
}

function QuestRow({ quest, userId, busyKey, setBusyKey, setFeedback, norse, onClaimed }: {
  quest: QuestDef;
  userId: string;
  busyKey: string | null;
  setBusyKey: (k: string | null) => void;
  setFeedback: (feedback: { message: string; isError: boolean } | null) => void;
  norse: boolean;
  onClaimed: () => void;
}) {
  const { t, tError } = useLocale();
  const query = useQuery({ queryKey: ['quest', userId, quest.key], queryFn: () => questProgress(userId, quest) });
  const p = query.data;

  async function claim() {
    setBusyKey(quest.key); setFeedback(null);
    try {
      await claimQuest(userId, quest);
      setFeedback({ message: t('saga.claimed', { n: quest.xp }), isError: false });
      await Promise.all([query.refetch(), Promise.resolve(onClaimed())]);
    } catch (err) {
      setFeedback({ message: tError(err), isError: true });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <article className="card p-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <h3 className="font-bold">{t(norse ? quest.norseKey : quest.titleKey)}</h3>
          <p className="mt-0.5 text-xs opacity-70">{t(quest.descKey)}</p>
        </div>
        <span className="font-display flex shrink-0 items-center gap-1 text-brand-300"><CoinImg className="h-4 w-4" />+{quest.xp}</span>
      </div>
      {query.isLoading ? (
        <div className="mt-3" aria-busy="true"><span className="skeleton block h-2 w-full rounded-full" /></div>
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} compact />
      ) : p && (
        <>
          <progress
            className="mt-3 block h-2 w-full overflow-hidden rounded-full accent-brand-400"
            value={p.done}
            max={quest.target}
            aria-label={`${t(norse ? quest.norseKey : quest.titleKey)} ${p.done}/${quest.target}`}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tabular-nums">{p.done}/{quest.target}</span>
            <span className="status-badge ms-auto rounded-full bg-(--surface-2) px-2 py-1 text-[11px]">{quest.kind === 'daily' ? t('saga.daily') : t('saga.weekly')}</span>
        {p?.complete && !p.claimed && (
          <button disabled={busyKey === quest.key} onClick={claim} className="btn-primary h-11 px-4 text-xs">
            {busyKey === quest.key ? t('common.loading') : t('saga.claim')}
          </button>
        )}
        {p?.claimed && <span className="text-xs font-bold text-green-400">{t('saga.claimedDone')}</span>}
          </div>
        </>
      )}
    </article>
  );
}
