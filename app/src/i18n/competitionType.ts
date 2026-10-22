import type { Dict } from './dictionaries';

const KEYS: Record<string, keyof Dict> = {
  LEAGUE: 'comps.typeLeague',
  CUP: 'comps.typeCup',
  TOURNAMENT: 'comps.typeTournament',
  SPECIAL_EVENT: 'comps.typeSpecial',
};

export function competitionTypeLabel(t: (key: keyof Dict) => string, value: string): string {
  return KEYS[value] ? t(KEYS[value]) : value.replace(/_/g, ' ');
}
