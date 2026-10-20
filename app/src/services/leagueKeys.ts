export const leagueKeys = {
  seasons: ['league', 'seasons'] as const,
  season: (seasonId: string) => ['league', 'season', seasonId] as const,
  standings: (seasonId: string) => ['league', 'standings', seasonId] as const,
  teams: (seasonId: string) => ['league', 'teams', seasonId] as const,
  team: (teamId: string) => ['league', 'team', teamId] as const,
  myTeam: (seasonId: string, playerId: string) => ['league', 'my-team', seasonId, playerId] as const,
  incomingInvites: (playerId: string) => ['league', 'invites', 'incoming', playerId] as const,
  teamInvites: (teamId: string) => ['league', 'invites', 'team', teamId] as const,
  invitablePlayers: (seasonId: string, teamId: string) => ['league', 'invitable', seasonId, teamId] as const,
  schedule: (seasonId: string) => ['league', 'schedule', seasonId] as const,
};
