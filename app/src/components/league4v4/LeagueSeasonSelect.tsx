import { statusLabel, useLocale } from '../../i18n/LocaleContext';
import type { LeagueSeason } from '../../types/league4v4';

export default function LeagueSeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: LeagueSeason[];
  value: string;
  onChange: (seasonId: string) => void;
}) {
  const { t } = useLocale();
  return (
    <label className="label mt-3">
      {t('league4.seasonLabel')}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input text-sm">
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name} · {statusLabel(t, season.status)}
          </option>
        ))}
      </select>
    </label>
  );
}
