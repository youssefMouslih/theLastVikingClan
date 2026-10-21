export function notificationPath(
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (entityType === 'match') return entityId ? `/matches/${entityId}` : null;
  if (entityType === 'competition') return entityId ? `/competitions/${entityId}` : null;
  if (entityType === 'battle') return '/battles';
  if (entityType === 'tryout') return '/admin';

  if (entityType === 'league_fixture') return entityId ? `/4vs4/match/${entityId}` : '/4vs4';
  if (entityType === 'league_duel') return entityId ? `/4vs4/duel/${entityId}` : '/4vs4';
  if (entityType === 'league_team') return entityId ? `/4vs4/teams/${entityId}` : '/4vs4/teams';
  if (entityType === 'league_matchday') return '/4vs4/fixtures';
  if (entityType === 'league_season') return '/4vs4';

  return null;
}
