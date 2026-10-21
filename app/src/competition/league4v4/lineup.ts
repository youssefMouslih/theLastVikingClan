import type {
  LeagueDuel,
  LeagueFixtureStatus,
  LeagueLineupEntry,
  LeagueLineupStatus,
  LeagueLineupWithPlayers,
  LeagueSeasonStatus,
  LeagueSubstitution,
} from '../../types/league4v4';

export const STARTER_COUNT = 4;
export const MIN_SUBSTITUTES = 2;
export const MAX_SUBSTITUTES = 4;

export type LineupValidationError =
  | 'players'
  | 'starters'
  | 'subs'
  | 'duplicate-player'
  | 'duplicate-slot'
  | 'not-member';

export type LineupLockReason = 'SEASON' | 'FIXTURE' | 'DEADLINE' | 'REVEALED';

const OPEN_FIXTURE_STATUSES: LeagueFixtureStatus[] = ['SCHEDULED', 'LINEUPS_PENDING'];
const REVEALED_FIXTURE_STATUSES: LeagueFixtureStatus[] = [
  'LINEUPS_REVEALED',
  'IN_PROGRESS',
  'COMPLETED',
  'FORFEITED',
];

export function validateLineup(entries: LeagueLineupEntry[], rosterIds: string[]): LineupValidationError | null {
  if (entries.length < STARTER_COUNT + MIN_SUBSTITUTES || entries.length > STARTER_COUNT + MAX_SUBSTITUTES) {
    return 'players';
  }

  const players = new Set(entries.map((entry) => entry.player_id));
  if (players.size !== entries.length) return 'duplicate-player';

  const starters = entries.filter((entry) => entry.role === 'STARTER');
  if (starters.length !== STARTER_COUNT) return 'starters';
  const starterSlots = new Set(starters.map((entry) => entry.slot));
  if (starterSlots.size !== STARTER_COUNT) return 'duplicate-slot';

  const subs = entries.filter((entry) => entry.role === 'SUB');
  if (subs.length < MIN_SUBSTITUTES || subs.length > MAX_SUBSTITUTES) return 'subs';
  if (new Set(subs.map((entry) => entry.slot)).size !== subs.length) return 'duplicate-slot';

  const roster = new Set(rosterIds);
  if (entries.some((entry) => !roster.has(entry.player_id))) return 'not-member';

  return null;
}

export function buildLineupEntries(
  starters: (string | null)[],
  subs: (string | null)[],
): LeagueLineupEntry[] {
  const entries: LeagueLineupEntry[] = [];
  starters.forEach((playerId, index) => {
    if (playerId) {
      entries.push({ player_id: playerId, role: 'STARTER', slot: (index + 1) as 1 | 2 | 3 | 4 });
    }
  });
  subs.forEach((playerId, index) => {
    if (playerId) {
      entries.push({ player_id: playerId, role: 'SUB', slot: (index + 1) as 1 | 2 | 3 | 4 });
    }
  });
  return entries;
}

export function initialLineupSelections(
  rosterIds: string[],
  lineup?: LeagueLineupWithPlayers | null,
): { starters: (string | null)[]; subs: (string | null)[] } {
  if (lineup) {
    const starters: (string | null)[] = Array.from({ length: STARTER_COUNT }, () => null);
    const subs: (string | null)[] = [];
    for (const entry of lineup.players) {
      if (entry.role === 'STARTER' && entry.slot >= 1 && entry.slot <= STARTER_COUNT) {
        starters[entry.slot - 1] = entry.player_id;
      } else if (entry.role === 'SUB') {
        subs[entry.slot - 1] = entry.player_id;
      }
    }
    while (subs.length < MIN_SUBSTITUTES) subs.push(null);
    return { starters, subs: subs.slice(0, MAX_SUBSTITUTES) };
  }

  const starters = Array.from({ length: STARTER_COUNT }, (_, index) => rosterIds[index] ?? null);
  const subs = Array.from({ length: MIN_SUBSTITUTES }, (_, index) => rosterIds[STARTER_COUNT + index] ?? null);
  return { starters, subs };
}

export function opponentLineupVisible(status: LeagueFixtureStatus): boolean {
  return REVEALED_FIXTURE_STATUSES.includes(status);
}

export function lineupLockReason({
  seasonStatus,
  fixtureStatus,
  deadline,
  lineupStatus,
  now = Date.now(),
}: {
  seasonStatus: LeagueSeasonStatus | null | undefined;
  fixtureStatus: LeagueFixtureStatus;
  deadline: string | null | undefined;
  lineupStatus?: LeagueLineupStatus | null;
  now?: number;
}): LineupLockReason | null {
  if (lineupStatus === 'REVEALED' || lineupStatus === 'LOCKED') return 'REVEALED';
  if (seasonStatus !== 'ACTIVE') return 'SEASON';
  if (!OPEN_FIXTURE_STATUSES.includes(fixtureStatus)) return 'FIXTURE';
  if (!deadline || new Date(deadline).getTime() < now) return 'DEADLINE';
  return null;
}

export function canStartDuel(duel: LeagueDuel, playerId: string | undefined, now = Date.now()): boolean {
  if (!playerId || duel.status !== 'SCHEDULED') return false;
  if (new Date(duel.deadline).getTime() < now) return false;
  return duel.home_player_id === playerId || duel.away_player_id === playerId;
}

export function canRequestSubstitution({
  duel,
  teamId,
  isCaptain,
  now = Date.now(),
}: {
  duel: LeagueDuel;
  teamId: string | undefined;
  isCaptain: boolean;
  now?: number;
}): boolean {
  if (!isCaptain || !teamId) return false;
  if (duel.status !== 'SCHEDULED' || duel.started_at) return false;
  if (new Date(duel.deadline).getTime() < now) return false;
  return duel.home_team_id === teamId || duel.away_team_id === teamId;
}

export function eligibleSubstitutes({
  benchPlayerIds,
  duels,
  substitutions,
  teamId,
  outPlayerId,
}: {
  benchPlayerIds: string[];
  duels: LeagueDuel[];
  substitutions: LeagueSubstitution[];
  teamId: string;
  outPlayerId: string;
}): string[] {
  const assigned = new Set(duels.flatMap((duel) => [duel.home_player_id, duel.away_player_id]));
  const used = new Set(
    substitutions
      .filter((substitution) => substitution.team_id === teamId)
      .map((substitution) => substitution.in_player_id),
  );
  return [...new Set(benchPlayerIds)].filter(
    (playerId) => playerId !== outPlayerId && !assigned.has(playerId) && !used.has(playerId),
  );
}
