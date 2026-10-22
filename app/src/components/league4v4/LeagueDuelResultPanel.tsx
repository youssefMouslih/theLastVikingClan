import {
  canConfirmOpponentResult,
  canEditOwnReport,
  canOpenDuelDispute,
  canReportDuelResult,
  isOpenDisputeStatus,
  normalizedReportScore,
  type ResultDraft,
} from '../../competition/league4v4/result';
import { useLocale } from '../../i18n/LocaleContext';
import { confirmDialog } from '../ui/confirm';
import type {
  LeagueDisputeWithOpener,
  LeagueDuelReportWithPlayer,
  LeagueDuelWithPlayers,
} from '../../types/league4v4';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';
import LeagueDisputeForm from './LeagueDisputeForm';
import LeagueEvidence from './LeagueEvidence';
import LeagueReportCard from './LeagueReportCard';
import LeagueResultForm from './LeagueResultForm';

export default function LeagueDuelResultPanel({
  duel,
  reports,
  dispute,
  myPlayerId,
  homeName,
  awayName,
  seasonActive,
  isCaptain,
  busy = false,
  onSubmitResult,
  onConfirm,
  onDispute,
}: {
  duel: LeagueDuelWithPlayers;
  reports: LeagueDuelReportWithPlayer[];
  dispute: LeagueDisputeWithOpener | null;
  myPlayerId?: string;
  homeName: string;
  awayName: string;
  seasonActive: boolean;
  isCaptain: boolean;
  busy?: boolean;
  onSubmitResult: (input: ResultDraft, file: File | null) => Promise<void>;
  onConfirm: () => Promise<void>;
  onDispute: (reason: string, file: File | null) => Promise<void>;
}) {
  const { t } = useLocale();
  const myReport = myPlayerId ? reports.find((report) => report.player_id === myPlayerId) ?? null : null;
  const opponentReport = myPlayerId
    ? reports.find((report) => report.player_id !== myPlayerId) ?? null
    : reports[0] ?? null;
  const openDispute = dispute && isOpenDisputeStatus(dispute.status) ? dispute : null;
  const hasOpenDispute = !!openDispute;
  const assigned = !!myPlayerId && (duel.home_player_id === myPlayerId || duel.away_player_id === myPlayerId);
  const canReport = seasonActive && canReportDuelResult(duel, myPlayerId);
  const canEdit = seasonActive && canEditOwnReport(duel, myReport, myPlayerId, hasOpenDispute);
  const canConfirm = seasonActive && canConfirmOpponentResult({
    duel,
    playerId: myPlayerId,
    myReport,
    opponentReport,
    hasOpenDispute,
  });
  const canDispute = seasonActive && canOpenDuelDispute({ duel, playerId: myPlayerId, isCaptain, hasOpenDispute });
  const opponentName =
    opponentReport?.player?.display_name
    ?? opponentReport?.player?.username
    ?? opponentReport?.player_id.slice(0, 8)
    ?? '—';

  if (reports.length === 0 && !canReport && !canDispute) {
    return null;
  }

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-2">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-50">{t('league4.resultReports')}</p>

      {reports.length === 0 && (
        <p className="mt-1 text-xs opacity-60">{t('league4.resultNoReports')}</p>
      )}
      {reports.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          {myReport && <LeagueReportCard report={myReport} homeName={homeName} awayName={awayName} isMine />}
          {opponentReport && opponentReport.player_id !== myPlayerId && (
            <LeagueReportCard report={opponentReport} homeName={homeName} awayName={awayName} />
          )}
          {!myReport && reports.filter((report) => report.player_id !== opponentReport?.player_id).map((report) => (
            <LeagueReportCard key={report.id} report={report} homeName={homeName} awayName={awayName} />
          ))}
        </div>
      )}

      {openDispute && (
        <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2">
          <div className="flex items-center gap-2">
            <Icon name="shield" className="h-4 w-4 text-amber-500" />
            <p className="min-w-0 flex-1 text-xs font-bold text-amber-500">{t('league4.resultUnderReview')}</p>
            <StatusBadge value={openDispute.status} />
          </div>
          <p className="mt-1 text-[11px] opacity-70">
            {t('league4.resultDisputeOpenedBy', {
              name: openDispute.opened_by_player?.display_name
                ?? openDispute.opened_by_player?.username
                ?? openDispute.opened_by.slice(0, 8),
            })}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs opacity-80">{openDispute.reason}</p>
          {openDispute.evidence_path && <LeagueEvidence path={openDispute.evidence_path} label={t('league4.resultDisputeEvidence')} className="max-h-40" />}
        </div>
      )}

      {!openDispute && dispute?.status === 'RESOLVED' && dispute.resolution && (
        <div className="mt-2 rounded-xl border border-green-500/30 bg-green-500/5 p-2 text-xs">
          <p className="font-semibold text-green-500">{t('league4.resultResolved')}</p>
          <p className="mt-0.5 whitespace-pre-wrap opacity-80">{dispute.resolution}</p>
        </div>
      )}

      {canConfirm && opponentReport && (
        <div className="mt-2 rounded-xl border border-brand-500/40 bg-brand-500/5 p-2">
          <p className="text-xs font-bold text-brand-400">{t('league4.resultConfirmTitle')}</p>
          <p className="mt-0.5 text-[11px] opacity-70">{t('league4.resultConfirmHint', { name: opponentName })}</p>
          <p className="mt-1 text-center font-display text-sm font-bold tabular-nums">
            {homeName} {normalizedReportScore(opponentReport).home_score}–{normalizedReportScore(opponentReport).away_score} {awayName}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirmDialog({ message: t('league4.resultConfirmAsk') })) void onConfirm().catch(() => {});
            }}
            className="btn-primary mt-2 h-10 w-full text-sm"
          >
            {busy ? t('league4.resultSubmitting') : t('league4.resultConfirm')}
          </button>
        </div>
      )}

      {canEdit && (
        <LeagueResultForm
          key={myReport ? `${myReport.id}-${myReport.updated_at}` : 'new-report'}
          myReport={myReport}
          busy={busy}
          onSubmit={onSubmitResult}
        />
      )}

      {canDispute && (
        <LeagueDisputeForm busy={busy} onSubmit={onDispute} />
      )}

      {!canReport && !canDispute && !canConfirm && !openDispute && reports.length === 0 && (
        <p className="mt-1 text-[11px] opacity-50">
          {duel.status === 'SCHEDULED'
            ? t('league4.resultStartFirst')
            : assigned
              ? t('league4.resultLocked')
              : t('league4.resultParticipantsOnly')}
        </p>
      )}

      {canReport && !canEdit && !hasOpenDispute && !canConfirm && (
        <p className="mt-1 text-[11px] opacity-50">{t('league4.resultLocked')}</p>
      )}
    </div>
  );
}
