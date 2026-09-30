import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import PlayerCard from '../components/player/PlayerCard';
import { useLocale } from '../i18n/LocaleContext';
import { getMember } from '../services/playerService';
import { getRatingSummary, ratePlayer, TITLE_TAGS } from '../services/ratingService';
import { askGift } from '../services/sagaService';
import { getPlayerCareer } from '../services/statisticsService';
import { useAuthStore } from '../stores/authStore';

// Public player view — card, peer rating, challenge button.
export default function PlayerPage() {
  const { t } = useLocale();
  const { id } = useParams();
  const me = useAuthStore((s) => s.profile);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['member', id], queryFn: () => getMember(id ?? ''), enabled: !!id });
  const careerQuery = useQuery({ queryKey: ['career', id], queryFn: () => getPlayerCareer(id ?? ''), enabled: !!id });
  const ratingQuery = useQuery({ queryKey: ['rating', id], queryFn: () => getRatingSummary(id ?? '', me?.id), enabled: !!id });
  const isSelf = me?.id === id;
  const [dims, setDims] = useState({ tactical: 4, fairplay: 5, connection: 4, title_tag: '' });
  const [asking, setAsking] = useState(false);
  const [giftAmount, setGiftAmount] = useState(25);
  const [giftMsg, setGiftMsg] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    const mine = ratingQuery.data?.mine;
    if (mine && !prefilled) {
      setDims({ tactical: mine.tactical, fairplay: mine.fairplay, connection: mine.connection, title_tag: mine.title_tag ?? '' });
      setPrefilled(true);
    }
  }, [ratingQuery.data, prefilled]);

  if (query.isLoading) return <main className="page text-sm">{t('player.loading')}</main>;
  const m = query.data;
  if (!m) return <main className="page text-sm">{t('player.notFound')}</main>;
  const r = ratingQuery.data;

  async function submitRating() {
    setBusy(true); setMsg(null);
    try {
      await ratePlayer(m!.id, me!.id, { tactical: dims.tactical, fairplay: dims.fairplay, connection: dims.connection, title_tag: dims.title_tag || null });
      setMsg(t('profile.rateThanks'));
      await ratingQuery.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  function Stars({ value, onPick, label }: { value: number; onPick: (n: number) => void; label: string }) {
    return (
      <div className="flex items-center gap-1">
        <span className="w-24 text-xs opacity-70">{label}</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} disabled={busy} onClick={() => onPick(s)} aria-label={`${label} ${s}/5`} className={`font-display text-xl ${value >= s ? 'text-accent-400' : 'opacity-30'}`}>
            ★
          </button>
        ))}
        <span className="font-display text-sm">{value}.0</span>
      </div>
    );
  }

  return (
    <main className="page">
      <PlayerCard member={m} career={careerQuery.data ?? null} />
      {!isSelf && me && (
        <section className="card mt-3" aria-label={t('profile.rateTitle')}>
          <h2 className="card-title">{t('profile.rateTitle', { name: m.display_name ?? m.username })}</h2>
          {(r?.topTitles ?? []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(r?.topTitles ?? []).map((tt) => (
                <span key={tt.tag} className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300">{tt.tag} ×{tt.count}</span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            <Stars value={dims.tactical} onPick={(n) => setDims({ ...dims, tactical: n })} label={t('profile.dimTactical')} />
            <Stars value={dims.fairplay} onPick={(n) => setDims({ ...dims, fairplay: n })} label={t('profile.dimFair')} />
            <Stars value={dims.connection} onPick={(n) => setDims({ ...dims, connection: n })} label={t('profile.dimConn')} />
          </div>
          <select value={dims.title_tag} onChange={(e) => setDims({ ...dims, title_tag: e.target.value })} className="input mt-2 text-sm">
            <option value="">{t('profile.titleNone')}</option>
            {TITLE_TAGS.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          <div className="mt-2 flex items-center gap-2">
            <button disabled={busy} onClick={submitRating} className="btn-primary h-10 flex-1 text-xs">{t('profile.rateSubmit')}</button>
            <span className="text-xs opacity-70">
              {r && r.count > 0 ? t('profile.rateAvg3', { a: r.tactical ?? 0, b: r.fairplay ?? 0, c: r.connection ?? 0, n: r.count }) : t('profile.rateNone')}
            </span>
          </div>
          {msg && <p className="mt-1 text-xs">{msg}</p>}
        </section>
      )}
      {!isSelf && (
        <Link to={`/battles?opponent=${m.id}`} className="btn-cta mt-3 flex w-full items-center justify-center gap-2">
          <Icon name="swords" className="h-5 w-5" /> {t('battle.issue')}
        </Link>
      )}
      {!isSelf && me && (
        <section className="card mt-3" aria-label={t('gift.title')}>
          {!asking ? (
            <button onClick={() => setAsking(true)} className="btn-ghost flex w-full items-center justify-center gap-2 text-sm">
              <Icon name="medal" className="h-5 w-5 text-brand-400" /> {t('gift.ask')}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <h2 className="font-bold">{t('gift.ask')}</h2>
              <div className="grid grid-cols-2 gap-2">
                <label className="label">{t('gift.amount')}
                  <select value={giftAmount} onChange={(e) => setGiftAmount(Number(e.target.value))} className="input text-sm">
                    {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} GP</option>)}
                  </select>
                </label>
                <label className="label">{t('gift.message')}
                  <input value={giftMsg} onChange={(e) => setGiftMsg(e.target.value)} className="input text-sm" maxLength={120} />
                </label>
              </div>
              {msg && <p className="text-xs">{msg}</p>}
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true); setMsg(null);
                    try {
                      await askGift(m.id, me.id, giftAmount, giftMsg || null);
                      setMsg(t('gift.sent'));
                      setAsking(false);
                      setGiftMsg('');
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : 'Failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="btn-primary h-11 flex-1 text-sm"
                >
                  {t('gift.send')}
                </button>
                <button onClick={() => setAsking(false)} className="btn-ghost h-11 px-4 text-sm">{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </section>
      )}
      <BottomNav />
    </main>
  );
}
