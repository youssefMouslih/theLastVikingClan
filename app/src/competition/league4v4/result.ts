import type {
  LeagueDecidedBy,
  LeagueDisputeStatus,
  LeagueDuel,
  LeagueDuelReport,
  LeagueResultInput,
} from '../../types/league4v4';

export const RESULT_DECIDED_BY: LeagueDecidedBy[] = ['REGULATION', 'EXTRA_TIME', 'PENALTIES'];
export const OPEN_DISPUTE_STATUSES: LeagueDisputeStatus[] = ['OPEN', 'UNDER_REVIEW'];

export type ResultValidationError = 'scores' | 'decisive' | 'decided-by' | 'evidence' | 'note';

export type ResultDraft = Omit<LeagueResultInput, 'evidence_path'>;

export function validateResultInput(input: ResultDraft, hasEvidence: boolean): ResultValidationError | null {
  if (
    !Number.isInteger(input.score_for)
    || !Number.isInteger(input.score_against)
    || input.score_for < 0
    || input.score_for > 99
    || input.score_against < 0
    || input.score_against > 99
  ) {
    return 'scores';
  }
  if (input.score_for === input.score_against) return 'decisive';
  if (!RESULT_DECIDED_BY.includes(input.decided_by)) return 'decided-by';
  if (!hasEvidence) return 'evidence';
  if (input.note && input.note.trim().length > 1000) return 'note';
  return null;
}

export function canReportDuelResult(duel: LeagueDuel, playerId: string | undefined): boolean {
  if (!playerId) return false;
  if (duel.status !== 'STARTED' && duel.status !== 'AWAITING_RESULTS') return false;
  return duel.home_player_id === playerId || duel.away_player_id === playerId;
}

export function canEditOwnReport(
  duel: LeagueDuel,
  myReport: LeagueDuelReport | null | undefined,
  playerId: string | undefined,
  hasOpenDispute: boolean,
): boolean {
  if (hasOpenDispute || !canReportDuelResult(duel, playerId)) return false;
  return !myReport || myReport.status === 'SUBMITTED';
}

export function canConfirmOpponentResult({
  duel,
  playerId,
  myReport,
  opponentReport,
  hasOpenDispute,
}: {
  duel: LeagueDuel;
  playerId: string | undefined;
  myReport: LeagueDuelReport | null | undefined;
  opponentReport: LeagueDuelReport | null | undefined;
  hasOpenDispute: boolean;
}): boolean {
  if (!playerId || (duel.home_player_id !== playerId && duel.away_player_id !== playerId)) return false;
  if (hasOpenDispute || duel.status !== 'AWAITING_RESULTS') return false;
  if (myReport && (myReport.status === 'SUBMITTED' || myReport.status === 'DISPUTED')) return false;
  return opponentReport?.status === 'SUBMITTED';
}

export function canOpenDuelDispute({
  duel,
  playerId,
  isCaptain,
  hasOpenDispute,
}: {
  duel: LeagueDuel;
  playerId: string | undefined;
  isCaptain: boolean;
  hasOpenDispute: boolean;
}): boolean {
  if (hasOpenDispute) return false;
  if (duel.status !== 'STARTED' && duel.status !== 'AWAITING_RESULTS') return false;
  if (isCaptain) return true;
  return !!playerId && (duel.home_player_id === playerId || duel.away_player_id === playerId);
}

export function reportsMirror(
  first: Pick<LeagueDuelReport, 'score_for' | 'score_against' | 'decided_by'>,
  second: Pick<LeagueDuelReport, 'score_for' | 'score_against' | 'decided_by'>,
): boolean {
  return (
    first.score_for === second.score_against
    && first.score_against === second.score_for
    && first.decided_by === second.decided_by
  );
}

export function normalizedReportScore(
  report: Pick<LeagueDuelReport, 'side' | 'score_for' | 'score_against'>,
): { home_score: number; away_score: number } {
  return report.side === 'HOME'
    ? { home_score: report.score_for, away_score: report.score_against }
    : { home_score: report.score_against, away_score: report.score_for };
}

export function isOpenDisputeStatus(status: LeagueDisputeStatus): boolean {
  return OPEN_DISPUTE_STATUSES.includes(status);
}
