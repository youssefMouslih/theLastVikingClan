import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import PlayerCard from '../components/player/PlayerCard';
import { useLocale } from '../i18n/LocaleContext';
import { getMember } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';

// Public player view — same eFootball card as own profile (read-only).
export default function PlayerPage() {
  const { t } = useLocale();
  const { id } = useParams();
  const query = useQuery({ queryKey: ['member', id], queryFn: () => getMember(id ?? ''), enabled: !!id });
  const careerQuery = useQuery({ queryKey: ['career', id], queryFn: () => getPlayerCareer(id ?? ''), enabled: !!id });

  if (query.isLoading) return <main className="page text-sm">{t('player.loading')}</main>;
  const m = query.data;
  if (!m) return <main className="page text-sm">{t('player.notFound')}</main>;

  return (
    <main className="page">
      <PlayerCard member={m} career={careerQuery.data ?? null} />
      <BottomNav />
    </main>
  );
}
