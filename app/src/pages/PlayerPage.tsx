import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import StatusBadge from '../components/ui/StatusBadge';
import { useLocale } from '../i18n/LocaleContext';
import { getMember } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';

// Player profile card (§60) + career stats (§59) from CONFIRMED matches.
export default function PlayerPage() {
  const { t } = useLocale();
  const { id } = useParams();
  const query = useQuery({ queryKey: ['member', id], queryFn: () => getMember(id ?? ''), enabled: !!id });
  const careerQuery = useQuery({ queryKey: ['career', id], queryFn: () => getPlayerCareer(id ?? ''), enabled: !!id });

  if (query.isLoading) return <main className="page text-sm">{t('player.loading')}</main>;
  const m = query.data;
  if (!m) return <main className="page text-sm">{t('player.notFound')}</main>;
  const c = careerQuery.data;

  return (
    <main className="page">
      <div className="hero p-5 text-center">
        <div aria-hidden className="font-display mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl">
          {(m.display_name ?? m.username).slice(0, 1).toUpperCase()}
        </div>
        <h1 className="font-display mt-2 text-2xl tracking-wide">{m.display_name ?? m.username}</h1>
        <p className="mt-1 flex items-center justify-center gap-1 text-sm opacity-70">@{m.username} • <StatusBadge value={m.role} /> • <StatusBadge value={m.status} /></p>
        {m.efootball_name && <p className="mt-1 text-sm">⚽ {m.efootball_name}{m.efootball_id ? ` (${m.efootball_id})` : ''}</p>}
        {m.country && <p className="text-sm opacity-70">{m.country}</p>}
        {m.bio && <p className="mt-2 text-sm">{m.bio}</p>}
      </div>
      <section aria-label={t('player.career')} className="card mt-3">
        <h2 className="card-title">{t('player.career')}</h2>
        {careerQuery.isLoading ? (
          <p className="mt-1 text-sm opacity-70">{t('player.loadingStats')}</p>
        ) : c ? (
          <>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
              <div><div className="font-display text-xl">{c.played}</div><div className="opacity-60">{t('player.matches')}</div></div>
              <div><div className="font-display text-xl">{c.wins}</div><div className="opacity-60">{t('player.wins')}</div></div>
              <div><div className="font-display text-xl">{c.draws}</div><div className="opacity-60">{t('player.draws')}</div></div>
              <div><div className="font-display text-xl">{c.losses}</div><div className="opacity-60">{t('player.losses')}</div></div>
              <div><div className="font-display text-xl">{c.goals_for}</div><div className="opacity-60">{t('player.goals')}</div></div>
              <div><div className="font-display text-xl">{c.goals_against}</div><div className="opacity-60">{t('player.conceded')}</div></div>
              <div><div className="font-display text-xl">{c.winRate}%</div><div className="opacity-60">{t('player.winRate')}</div></div>
              <div><div className="font-display text-xl">{c.titles}</div><div className="opacity-60">{t('player.titles')}</div></div>
            </div>
            <p className="mt-2 text-sm">{t('player.form')} {c.form.length ? c.form.map((f) => (f === 'W' ? '🟢' : f === 'L' ? '🔴' : '⚪')).join(' ') : '—'}</p>
          </>
        ) : (
          <p className="mt-1 text-sm opacity-70">{t('player.noMatches')}</p>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
