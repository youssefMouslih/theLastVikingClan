export function notificationPath(
  entityType: string | null,
  entityId: string | null,
  notificationType?: string | null,
  title?: string | null,
): string | null {
  if (entityType === 'tryout' || notificationType === 'TRYOUT_REQUEST') {
    if (title === 'Tester task' && entityId) return `/home#tester-task-${encodeURIComponent(entityId)}`;
    return `/admin?tab=tryouts${entityId ? `&request=${encodeURIComponent(entityId)}` : ''}`;
  }
  if (entityType === 'gift' || title === 'Glory requested') {
    return `/saga?tab=gifts${entityId ? `&gift=${encodeURIComponent(entityId)}` : ''}`;
  }
  if (entityType === 'squad' || title === 'Squad request' || title?.startsWith('War Council:')) {
    return `/battles?tab=commands${entityId ? `&squad=${encodeURIComponent(entityId)}` : ''}`;
  }
  if (entityType === 'match') return entityId ? `/matches/${entityId}` : null;
  if (entityType === 'competition') return entityId ? `/competitions/${entityId}` : null;
  if (entityType === 'battle') {
    const tab = notificationType === 'RESULT_CONFIRMED' || notificationType === 'COMPETITION_FINISHED'
      ? 'history'
      : 'incoming';
    return `/battles?tab=${tab}`;
  }

  if (entityType === 'league_fixture') return entityId ? `/4vs4/match/${entityId}` : '/4vs4';
  if (entityType === 'league_duel') return entityId ? `/4vs4/duel/${entityId}` : '/4vs4';
  if (entityType === 'league_team') return entityId ? `/4vs4/teams/${entityId}` : '/4vs4/teams';
  if (entityType === 'league_matchday') return '/4vs4/fixtures';
  if (entityType === 'league_season') return '/4vs4';

  if (notificationType === 'TRYOUT_REQUEST') return '/admin?tab=tryouts';
  if (notificationType?.startsWith('LEAGUE_')) return '/4vs4';
  if (notificationType === 'ANNOUNCEMENT') return '/home';
  if (notificationType === 'COMPETITION_INVITATION') {
    return title === 'Glory requested'
      ? '/saga?tab=gifts'
      : `/battles?tab=${title?.startsWith('War Council:') || title === 'Squad request' ? 'commands' : 'incoming'}`;
  }
  if (notificationType === 'RESULT_SUBMITTED' || notificationType === 'RESULT_DISPUTED') {
    return '/battles?tab=incoming';
  }
  if (notificationType === 'RESULT_CONFIRMED' || notificationType === 'COMPETITION_FINISHED') {
    return '/battles?tab=history';
  }
  if (notificationType === 'COMPETITION_STARTED') return '/battles?tab=incoming';

  return null;
}
