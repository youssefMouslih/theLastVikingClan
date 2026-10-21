import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  moveTeam,
  resolveTiebreakOrder,
  validTiebreakReason,
} from '../../competition/league4v4/standings';
import { useLocale } from '../../i18n/LocaleContext';
import { leagueKeys } from '../../services/leagueKeys';
import {
  listLeagueTiebreakOrder,
  saveLeagueTiebreakOrder,
} from '../../services/leagueStandingsService';
import type { LeagueSeasonStatus, LeagueTeamSummary } from '../../types/league4v4';
import Icon from '../ui/Icon';

export default function LeagueTiebreakPanel({
  seasonId,
  seasonStatus,
  teams,
}: {
  seasonId: string;
  seasonStatus: LeagueSeasonStatus;
  teams: LeagueTeamSummary[];
}) {
  const { t, fmtDate } = useLocale();
  const queryClient = useQueryClient();
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tiebreakQuery = useQuery({
    queryKey: leagueKeys.tiebreak(seasonId),
    queryFn: () => listLeagueTiebreakOrder(seasonId),
  });
  const approvedIds = teams.map((team) => team.id);
  const savedOrder = (tiebreakQuery.data ?? []).map((row) => row.team_id);
  const order = resolveTiebreakOrder(draftOrder ?? savedOrder, approvedIds);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const editable = seasonStatus === 'ACTIVE' || seasonStatus === 'COMPLETED';
  const current = tiebreakQuery.data?.[0] ?? null;

  function move(index: number, direction: -1 | 1) {
    setDraftOrder(moveTeam(order, index, direction));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMsg(null);
    setErr(null);
    if (order.length < 2) {
      setErr(t('league4.tiebreakNoTeams'));
      return;
    }
    if (!validTiebreakReason(reason)) {
      setErr(t('league4.tiebreakReasonInvalid'));
      return;
    }
    setBusy(true);
    try {
      await saveLeagueTiebreakOrder({ seasonId, teamIds: order, reason });
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setDraftOrder(order);
      setMsg(t('league4.tiebreakSaved'));
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-3">
      <h2 className="card-title flex items-center gap-1"><Icon name="sliders" className="h-4 w-4 text-brand-400" /> {t('league4.tiebreakOrder')}</h2>
      <p className="mt-1 text-xs opacity-60">{t('league4.tiebreakHint')}</p>
      {current && <p className="mt-2 text-xs opacity-70">{t('league4.tiebreakCurrent', { date: fmtDate(current.created_at) })}</p>}

      {!editable ? (
        <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.tiebreakSeasonInactive')}</p>
      ) : teams.length < 2 ? (
        <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.tiebreakNoTeams')}</p>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
          <ol className="flex flex-col gap-1">
            {order.map((id, index) => (
              <li key={id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2">
                <span className="w-6 text-center text-xs font-bold opacity-60">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{teamNames.get(id) ?? id.slice(0, 8)}</span>
                <button type="button" aria-label={t('league4.moveUp')} disabled={index === 0} onClick={() => move(index, -1)} className="btn-ghost h-8 w-8 !px-0 text-sm">↑</button>
                <button type="button" aria-label={t('league4.moveDown')} disabled={index === order.length - 1} onClick={() => move(index, 1)} className="btn-ghost h-8 w-8 !px-0 text-sm">↓</button>
              </li>
            ))}
          </ol>
          <label className="label">{t('league4.tiebreakReason')}
            <textarea required minLength={3} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="input text-sm" />
          </label>
          <button type="submit" disabled={busy} className="btn-primary h-10 text-sm">
            {busy ? t('league4.savingTiebreak') : t('league4.saveTiebreak')}
          </button>
        </form>
      )}
      {err && <p role="alert" className="mt-2 rounded-lg border border-red-500/40 p-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 rounded-lg border border-brand-500/40 p-2 text-sm text-brand-400">{msg}</p>}
    </section>
  );
}
