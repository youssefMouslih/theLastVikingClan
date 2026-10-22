import { useState } from 'react';
import { Link } from 'react-router';
import {
  normalizedReportScore,
} from '../../competition/league4v4/result';
import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueDisputeResolutionInput, LeagueDisputeWithContext } from '../../types/league4v4';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';
import LeagueEvidence from './LeagueEvidence';
import LeagueReportCard from './LeagueReportCard';

export default function LeagueDisputeCard({
  dispute,
  busy = false,
  onResolve,
}: {
  dispute: LeagueDisputeWithContext;
  busy?: boolean;
  onResolve: (input: LeagueDisputeResolutionInput) => Promise<void>;
}) {
  const { t, fmtDate , tError} = useLocale();
  const homeName = dispute.home?.name ?? '—';
  const awayName = dispute.away?.name ?? '—';
  const suggested = dispute.reports[0] ? normalizedReportScore(dispute.reports[0]) : null;
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [homeScore, setHomeScore] = useState(suggested ? String(suggested.home_score) : '');
  const [awayScore, setAwayScore] = useState(suggested ? String(suggested.away_score) : '');
  const [forfeit, setForfeit] = useState(false);
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);

  const homeNumber = homeScore.trim() === '' ? Number.NaN : Number(homeScore);
  const awayNumber = awayScore.trim() === '' ? Number.NaN : Number(awayScore);
  const scoresValid =
    forfeit
    || (
      Number.isInteger(homeNumber)
      && Number.isInteger(awayNumber)
      && homeNumber >= 0
      && homeNumber <= 99
      && awayNumber >= 0
      && awayNumber <= 99
      && homeNumber !== awayNumber
    );
  const winnerMatches =
    forfeit
    || !scoresValid
    || !winnerTeamId
    || !dispute.home
    || !dispute.away
    || winnerTeamId === (homeNumber > awayNumber ? dispute.home.id : dispute.away.id);
  const canSubmit =
    !!dispute.duel
    && dispute.season?.status === 'ACTIVE'
    && !!winnerTeamId
    && scoresValid
    && winnerMatches
    && resolution.trim().length >= 3;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!winnerTeamId) {
      setError(t('league4.resolutionWinnerRequired'));
      return;
    }
    if (!scoresValid) {
      setError(t('league4.resolutionScoresInvalid'));
      return;
    }
    if (!winnerMatches) {
      setError(t('league4.resolutionWinnerMismatch'));
      return;
    }
    if (resolution.trim().length < 3) {
      setError(t('league4.resolutionRequired'));
      return;
    }
    setError(null);
    void onResolve({
      winner_team_id: winnerTeamId,
      home_score: forfeit ? null : homeNumber,
      away_score: forfeit ? null : awayNumber,
      resolution: resolution.trim(),
      forfeit,
    }).catch((failure: unknown) => {
      setError(tError(failure));
    });
  }

  return (
    <article className="card mt-3">
      <div className="flex items-center gap-2">
        <span className="font-display flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-sm font-bold text-amber-500">
          {dispute.duel?.slot ?? '!'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {homeName} <span className="opacity-50">vs</span> {awayName}
          </p>
          <p className="truncate text-[11px] opacity-60">
            {dispute.season?.name ?? t('league4.title')}
            {dispute.duel ? ` · ${t('league4.duel')} ${dispute.duel.slot}` : ''}
            {' · '}
            {fmtDate(dispute.created_at)}
          </p>
        </div>
        <StatusBadge value={dispute.status} />
      </div>

      <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-500">{t('league4.disputeReason')}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{dispute.reason}</p>
        <p className="mt-1 text-[11px] opacity-60">
          {t('league4.resultDisputeOpenedBy', {
            name: dispute.opened_by_player?.display_name
              ?? dispute.opened_by_player?.username
              ?? dispute.opened_by.slice(0, 8),
          })}
        </p>
        {dispute.evidence_path && (
          <LeagueEvidence path={dispute.evidence_path} label={t('league4.resultDisputeEvidence')} className="max-h-48" />
        )}
      </div>

      {dispute.duel && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] opacity-70">
          <span className="rounded-full bg-white/5 px-2 py-0.5">
            {dispute.duel.home_player?.display_name ?? dispute.duel.home_player?.username ?? dispute.duel.home_player_id.slice(0, 8)}
          </span>
          <span>vs</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5">
            {dispute.duel.away_player?.display_name ?? dispute.duel.away_player?.username ?? dispute.duel.away_player_id.slice(0, 8)}
          </span>
          {dispute.fixture && (
            <Link to={`/4vs4/match/${dispute.fixture.id}`} className="btn-ghost ms-auto h-8 px-2 text-[11px]">
              {t('league4.openMatch')}
            </Link>
          )}
        </div>
      )}

      {dispute.reports.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--border)] pt-2">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-50">{t('league4.resultReports')}</p>
          {dispute.reports.map((report) => (
            <LeagueReportCard key={report.id} report={report} homeName={homeName} awayName={awayName} />
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-2 border-t border-[var(--border)] pt-2">
        <h3 className="flex items-center gap-1 text-sm font-bold">
          <Icon name="shield" className="h-4 w-4 text-brand-400" /> {t('league4.disputeResolve')}
        </h3>
        {dispute.season?.status !== 'ACTIVE' && (
          <p className="mt-1 rounded-lg border border-red-500/30 p-2 text-[11px] text-red-400">{t('league4.resolutionSeasonInactive')}</p>
        )}
        <label className="label mt-2 text-xs">{t('league4.resolutionWinner')}
          <select
            required
            value={winnerTeamId}
            onChange={(event) => setWinnerTeamId(event.target.value)}
            className="input h-10 text-sm"
          >
            <option value="">{t('league4.selectWinner')}</option>
            {dispute.home && <option value={dispute.home.id}>{homeName}</option>}
            {dispute.away && <option value={dispute.away.id}>{awayName}</option>}
          </select>
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={forfeit} onChange={(event) => setForfeit(event.target.checked)} />
          {t('league4.resolutionForfeit')}
        </label>
        {!forfeit && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="label text-xs">{homeName}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                required
                value={homeScore}
                onChange={(event) => setHomeScore(event.target.value)}
                className="input h-10 text-sm"
              />
            </label>
            <label className="label text-xs">{awayName}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                required
                value={awayScore}
                onChange={(event) => setAwayScore(event.target.value)}
                className="input h-10 text-sm"
              />
            </label>
          </div>
        )}
        {!scoresValid && !forfeit && <p className="mt-1 text-[11px] text-red-400">{t('league4.resolutionScoresInvalid')}</p>}
        {!winnerMatches && <p className="mt-1 text-[11px] text-red-400">{t('league4.resolutionWinnerMismatch')}</p>}
        <label className="label mt-2 text-xs">{t('league4.resolutionNote')}
          <textarea
            required
            minLength={3}
            maxLength={1000}
            rows={3}
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            className="input text-sm"
          />
        </label>
        {error && <p role="alert" className="mt-1 text-xs text-red-400">{error}</p>}
        <button type="submit" disabled={busy || !canSubmit} className="btn-primary mt-2 h-10 w-full text-sm">
          {busy ? t('league4.resolving') : t('league4.disputeResolve')}
        </button>
      </form>
    </article>
  );
}
