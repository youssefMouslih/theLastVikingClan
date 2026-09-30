import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import PlayerCard from '../components/player/PlayerCard';
import { useLocale } from '../i18n/LocaleContext';
import { getMember } from '../services/playerService';
import { getRatingSummary, ratePlayer } from '../services/ratingService';
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

  if (query.isLoading) return <main className="page text-sm">{t('player.loading')}</main>;
  const m = query.data;
  if (!m) return <main className="page text-sm">{t('player.notFound')}</main>;
  const r = ratingQuery.data;

  async function rate(score: number) {
    setBusy(true); setMsg(null);
    try {
      await ratePlayer(m!.id, me!.id, score);
      setMsg(t('profile.rateThanks'));
      await ratingQuery.refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <PlayerCard member={m} career={careerQuery.data ?? null} />
      {!isSelf && me && (
        <section className="card mt-3" aria-label={t('profile.rateTitle')}>
          <h2 className="card-title">{t('profile.rateTitle')}</h2>
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => rate(s)}
                aria-label={`${s}/5`}
                className={`font-display text-2xl ${(r?.mine ?? 0) >= s ? 'text-accent-400' : 'opacity-30'}`}
              >
                ★
              </button>
            ))}
            <span className="ms-2 text-xs opacity-70">
              {r && r.count > 0 ? t('profile.rateAvg', { n: r.avg ?? 0, c: r.count }) : t('profile.rateNone')}
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
      <BottomNav />
    </main>
  );
}
