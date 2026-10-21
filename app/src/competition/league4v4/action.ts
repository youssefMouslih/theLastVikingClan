import { isPastDeadline } from '../deadlineEngine';

export type LeagueActionKind = 'SUBMIT_LINEUP' | 'START_DUEL' | 'SUBMIT_RESULT' | 'CONFIRM_RESULT';

interface ActionLineup {
  team_id: string;
  status: string;
}

interface ActionDuel {
  id: string;
  status: string;
  home_player_id: string;
  away_player_id: string;
}

interface ActionReport {
  duel_id: string;
  player_id: string;
  status: string;
}

export interface LeagueActionInput {
  fixtureStatus: string;
  matchdayStatus: string;
  deadline: string;
  myTeamId: string;
  myPlayerId: string;
  isCaptain: boolean;
  lineups: ActionLineup[];
  duels: ActionDuel[];
  reports: ActionReport[];
  nowMs?: number;
}

const FINAL_FIXTURES = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);
const REPORT_STATUSES = new Set(['SUBMITTED', 'CONFIRMED', 'DISPUTED', 'REJECTED']);

export function leagueNextAction(input: LeagueActionInput): LeagueActionKind | null {
  const {
    fixtureStatus,
    matchdayStatus,
    deadline,
    myTeamId,
    myPlayerId,
    isCaptain,
    lineups,
    duels,
    reports,
    nowMs = Date.now(),
  } = input;

  if (FINAL_FIXTURES.has(fixtureStatus)) return null;

  const lineup = lineups.find((entry) => entry.team_id === myTeamId);
  const lineupOpen = fixtureStatus === 'SCHEDULED' || fixtureStatus === 'LINEUPS_PENDING';
  if (
    isCaptain
    && lineupOpen
    && matchdayStatus === 'OPEN'
    && !isPastDeadline(deadline, nowMs)
    && (!lineup || lineup.status === 'DRAFT')
  ) {
    return 'SUBMIT_LINEUP';
  }

  if (fixtureStatus !== 'LINEUPS_REVEALED' && fixtureStatus !== 'IN_PROGRESS') return null;

  const myDuels = duels.filter(
    (duel) => duel.home_player_id === myPlayerId || duel.away_player_id === myPlayerId,
  );

  for (const duel of myDuels) {
    const myReport = reports.find(
      (report) => report.duel_id === duel.id
        && report.player_id === myPlayerId
        && REPORT_STATUSES.has(report.status),
    );
    if (duel.status === 'SCHEDULED' && !isPastDeadline(deadline, nowMs)) return 'START_DUEL';
    if (duel.status === 'STARTED' && !myReport) return 'SUBMIT_RESULT';
    if (duel.status === 'AWAITING_RESULTS' && !myReport) return 'CONFIRM_RESULT';
  }

  return null;
}
