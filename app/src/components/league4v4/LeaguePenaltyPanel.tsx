import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDiff, validatePenaltyInput } from '../../competition/league4v4/standings';
import { useLocale } from '../../i18n/LocaleContext';
import { leagueKeys } from '../../services/leagueKeys';
import { applyLeaguePenalty, listLeaguePenalties } from '../../services/leagueStandingsService';
import type { LeagueMatchday, LeagueSeasonStatus, LeagueTeamSummary } from '../../types/league4v4';
import Icon from '../ui/Icon';

export default function LeaguePenaltyPanel({
  seasonId,
  seasonStatus,
  teams,
  matchdays,
}: {
  seasonId: string;
  seasonStatus: LeagueSeasonStatus;
  teams: LeagueTeamSummary[];
  matchdays: LeagueMatchday[];
}) {
  const { t, fmtDate } = useLocale();
  const queryClient = useQueryClient();
  const [teamId, setTeamId] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [matchdayId, setMatchdayId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const penaltiesQuery = useQuery({
    queryKey: leagueKeys.penalties(seasonId),
    queryFn: () => listLeaguePenalties(seasonId),
  });
  const penalties = penaltiesQuery.data ?? [];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const matchdayNumbers = new Map(matchdays.map((matchday) => [matchday.id, matchday.number]));
  const archived = seasonStatus === 'ARCHIVED';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMsg(null);
    setErr(null);
    const parsedPoints = points.trim() === '' ? Number.NaN : Number(points);
    const validation = validatePenaltyInput({ teamId, points: parsedPoints, reason });
    if (validation === 'team') {
      setErr(t('league4.penaltyTeamRequired'));
      return;
    }
    if (validation === 'points') {
      setErr(t('league4.penaltyInvalid'));
      return;
    }
    if (validation === 'reason') {
      setErr(t('league4.penaltyReasonInvalid'));
      return;
    }
    setBusy(true);
    try {
      await applyLeaguePenalty({ seasonId, teamId, points: parsedPoints, reason, matchdayId: matchdayId || null });
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      setMsg(t('league4.penaltyApplied'));
      setPoints('');
      setReason('');
      setMatchdayId('');
    } catch (error) {
      setErr(error instanceof Error ? error.message : t('league4.actionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mt-3">
      <h2 className="card-title flex items-center gap-1"><Icon name="shield" className="h-4 w-4 text-brand-400" /> {t('league4.penalties')}</h2>
      {archived ? (
        <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.penaltyArchived')}</p>
      ) : teams.length === 0 ? (
        <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.penaltyNoTeams')}</p>
      ) : (
        <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
          <label className="label">{t('league4.penaltyTeam')}
            <select required value={teamId} onChange={(event) => setTeamId(event.target.value)} className="input text-sm">
              <option value="">—</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="label">{t('league4.penaltyPoints')}
              <input required type="number" min={-100} max={100} step={1} value={points} onChange={(event) => setPoints(event.target.value)} className="input text-sm" />
            </label>
            <label className="label">{t('league4.penaltyMatchday')}
              <select value={matchdayId} onChange={(event) => setMatchdayId(event.target.value)} className="input text-sm">
                <option value="">{t('league4.penaltyAllMatchdays')}</option>
                {matchdays.map((matchday) => <option key={matchday.id} value={matchday.id}>{t('league4.matchday')} {matchday.number}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs opacity-60">{t('league4.penaltyPointsHint')}</p>
          <label className="label">{t('league4.penaltyReason')}
            <textarea required minLength={3} maxLength={1000} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} className="input text-sm" />
          </label>
          <button type="submit" disabled={busy} className="btn-primary h-10 text-sm">
            {busy ? t('league4.applyingPenalty') : t('league4.applyPenalty')}
          </button>
        </form>
      )}
      {err && <p role="alert" className="mt-2 rounded-lg border border-red-500/40 p-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 rounded-lg border border-brand-500/40 p-2 text-sm text-brand-400">{msg}</p>}

      <h3 className="mt-3 text-sm font-semibold">{t('league4.penaltyHistory')}</h3>
      {penalties.length === 0 ? (
        <p className="mt-1 text-sm opacity-60">{t('league4.noPenalties')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {penalties.map((penalty) => (
            <li key={penalty.id} className="rounded-xl border border-[var(--border)] p-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-semibold">{teamNames.get(penalty.team_id) ?? penalty.team_id.slice(0, 8)}</span>
                <span className={`font-black tabular-nums ${penalty.points < 0 ? 'text-red-400' : 'text-brand-400'}`}>{formatDiff(penalty.points)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs opacity-80">{penalty.reason}</p>
              <p className="mt-1 text-[11px] opacity-50">
                {fmtDate(penalty.created_at)}
                {penalty.matchday_id && matchdayNumbers.has(penalty.matchday_id) ? ` · ${t('league4.matchday')} ${matchdayNumbers.get(penalty.matchday_id)!}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
