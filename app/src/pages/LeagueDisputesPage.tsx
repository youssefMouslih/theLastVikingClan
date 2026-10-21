import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import LeagueDisputeCard from '../components/league4v4/LeagueDisputeCard';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { listOpenLeagueDisputes, resolveLeagueDispute } from '../services/leagueAdminService';
import { leagueKeys } from '../services/leagueKeys';
import type { LeagueDisputeResolutionInput } from '../types/league4v4';

export default function LeagueDisputesPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const query = useQuery({ queryKey: leagueKeys.openDisputes, queryFn: listOpenLeagueDisputes });
  const disputes = query.data ?? [];

  async function resolve(disputeId: string, input: LeagueDisputeResolutionInput) {
    setBusy(disputeId);
    setErr(null);
    setMsg(null);
    try {
      await resolveLeagueDispute(disputeId, input);
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(t('league4.disputeResolved'));
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
      throw error;
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <AppBar title={t('league4.disputes')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{t('league4.disputeQueue')}</p>
      </div>

      {err && <p role="alert" className="mt-2 rounded-lg border border-red-500/40 p-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 rounded-lg border border-brand-500/40 p-2 text-sm text-brand-400">{msg}</p>}

      <LoadingRegion loading={query.isLoading} label={t('common.loading')} skeleton="card">
        {disputes.length === 0 ? (
          <EmptyState icon={<Icon name="shield" />} title={t('league4.noDisputes')} hint={t('league4.noDisputesHint')} />
        ) : (
          <>
            <p className="mt-3 text-xs opacity-60">{t('league4.disputesWaiting', { n: disputes.length })}</p>
            {disputes.map((dispute) => (
              <LeagueDisputeCard
                key={dispute.id}
                dispute={dispute}
                busy={busy === dispute.id}
                onResolve={(input) => resolve(dispute.id, input)}
              />
            ))}
          </>
        )}
      </LoadingRegion>

      <BottomNav />
    </main>
  );
}
