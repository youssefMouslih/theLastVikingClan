// Vintage emblem art (illustration-vintage-emblem skill): hand-built SVG badge
// cards — seven-colour screen-print, thick ink outlines, terracotta sun disc,
// splash band, condensed path wordmark. One hero per honour type, generated
// with the skill's emblem-kit + wordmark tooling (see README credit).
// Used as instant badge art wherever a forged PNG is not yet available.
const MAP: Record<string, string> = {
  LEAGUE_CHAMPION: 'emblem-league.svg',
  CUP_CHAMPION: 'emblem-cup.svg',
  TOURNAMENT_CHAMPION: 'emblem-tournament.svg',
  SEASON_MVP: 'emblem-mvp.svg',
  SPECIAL: 'emblem-special.svg',
  FIRST_BLOOD: 'emblem-firstblood.svg',
  STREAK_5: 'emblem-streak5.svg',
  STREAK_10: 'emblem-streak10.svg',
};

export function emblemFor(type: string): string {
  return `/emblems/${MAP[type] ?? 'emblem-clan.svg'}`;
}

export const CLAN_EMBLEM = '/emblems/emblem-clan.svg';

export default function Emblem({
  type,
  className = 'h-10 w-10',
  alt = '',
}: {
  type: string;
  className?: string;
  alt?: string;
}) {
  return <img src={emblemFor(type)} alt={alt} aria-hidden={alt === ''} className={`${className} shrink-0 rounded-lg object-cover`} loading="lazy" />;
}
