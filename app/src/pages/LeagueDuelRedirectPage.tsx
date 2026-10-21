import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { getLeagueDuelFixtureId } from '../services/leagueDuelService';

export default function LeagueDuelRedirectPage() {
  const { t } = useLocale();
  const { duelId } = useParams();
  const query = useQuery({
    queryKey: ['league', 'duel-redirect', duelId],
    queryFn: () => getLeagueDuelFixtureId(duelId!),
    enabled: !!duelId,
  });

  if (query.isLoading) {
    return (
      <main className="page">
        <AppBar title={t('league4.match')} />
        <LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion>
        <BottomNav />
      </main>
    );
  }

  if (query.data) return <Navigate to={`/4vs4/match/${query.data}`} replace />;

  return (
    <main className="page">
      <AppBar title={t('league4.match')} />
      <EmptyState icon={<Icon name="swords" />} title={t('league4.matchNotFound')} />
      <Link to="/4vs4/fixtures" className="btn-ghost mt-3 h-11 w-full">{t('league4.fixtures')}</Link>
      <BottomNav />
    </main>
  );
}
