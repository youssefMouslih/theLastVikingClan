import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import CompetitionCard from '../components/competition/CompetitionCard';
import BottomNav from '../components/ui/BottomNav';
import { useLocale } from '../i18n/LocaleContext';
import { getCompetitionByCode, listCompetitions, listParticipants } from '../services/competitionService';
import { useAuthStore } from '../stores/authStore';

export default function CompetitionsPage() {
  const { t } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const canCreate = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const query = useQuery({ queryKey: ['competitions'], queryFn: () => listCompetitions() });
  const countsQuery = useQuery({
    queryKey: ['competition-counts', query.data?.map((c) => c.id).join(',')],
    enabled: !!query.data,
    queryFn: async () => {
      const entries = await Promise.all(
        (query.data ?? []).map(async (c) => [c.id, (await listParticipants(c.id)).length] as const),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });

  async function handleJoinCode(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null); setJoining(true);
    try {
      const comp = await getCompetitionByCode(code);
      if (!comp) throw new Error(t('comps.noCode'));
      nav(`/join/${comp.join_code}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Join failed.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="page">
      <div className="flex items-center gap-2">
        <h1 className="font-display flex-1 text-xl tracking-wide">{t('comps.title')}</h1>
        {canCreate && <Link to="/admin" className="btn-primary h-10 px-4 text-sm">{t('comps.new')}</Link>}
      </div>

      <form onSubmit={handleJoinCode} className="card mt-3 flex gap-2">
        <input
          aria-label={t('comps.joinCode')}
          className="input h-12 flex-1 text-center font-mono text-lg tracking-widest uppercase"
          placeholder="VIK7X92" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12} required
        />
        <button type="submit" disabled={joining} className="btn-primary h-12 px-5">
          {joining ? t('comps.joining') : t('comps.join')}
        </button>
      </form>
      {joinError && <p role="alert" className="mt-1 text-sm text-red-500">{joinError}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {query.isLoading && <p className="text-sm">{t('comps.loading')}</p>}
        {query.isError && <p className="text-sm text-red-500">{t('comps.loadError')}</p>}
        {query.data?.length === 0 && <p className="card text-sm opacity-70">{t('comps.empty')}</p>}
        {query.data?.map((c) => <CompetitionCard key={c.id} comp={c} count={countsQuery.data?.[c.id]} />)}
      </div>
      <BottomNav />
    </main>
  );
}
