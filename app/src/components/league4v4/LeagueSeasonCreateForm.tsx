import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale } from '../../i18n/LocaleContext';
import { createLeagueSeason } from '../../services/leagueAdminService';
import { leagueKeys } from '../../services/leagueKeys';
import type { LeagueSeasonSettings } from '../../types/league4v4';

type SeasonForm = {
  name: string;
  description: string;
  registration_opens_at: string;
  registration_closes_at: string;
  starts_at: string;
  matchday_days: number;
  min_teams: number;
  max_teams: number;
  roster_min: number;
  roster_max: number;
};

const EMPTY_FORM: SeasonForm = {
  name: '',
  description: '',
  registration_opens_at: '',
  registration_closes_at: '',
  starts_at: '',
  matchday_days: 7,
  min_teams: 4,
  max_teams: 8,
  roster_min: 6,
  roster_max: 8,
};

function toISO(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function settingsFromForm(form: SeasonForm): LeagueSeasonSettings {
  return {
    name: form.name,
    description: form.description || null,
    registration_opens_at: toISO(form.registration_opens_at),
    registration_closes_at: toISO(form.registration_closes_at),
    starts_at: toISO(form.starts_at),
    matchday_days: form.matchday_days,
    min_teams: form.min_teams,
    max_teams: form.max_teams,
    roster_min: form.roster_min,
    roster_max: form.roster_max,
  };
}

export default function LeagueSeasonCreateForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { t , tError} = useLocale();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SeasonForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErr(null);
    try {
      const id = await createLeagueSeason(settingsFromForm(form));
      setForm(EMPTY_FORM);
      onCreated(id);
      await queryClient.invalidateQueries({ queryKey: leagueKeys.seasons });
    } catch (error) {
      setErr(tError(error));
      void queryClient.invalidateQueries({ queryKey: leagueKeys.seasons });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-2">
      <label className="label">{t('league4.seasonName')}
        <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input text-sm" />
      </label>
      <label className="label">{t('league4.description')}
        <textarea maxLength={2000} rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="input text-sm" />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="label">{t('league4.registrationOpens')}
          <input type="datetime-local" value={form.registration_opens_at} onChange={(event) => setForm({ ...form, registration_opens_at: event.target.value })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.registrationCloses')}
          <input type="datetime-local" value={form.registration_closes_at} onChange={(event) => setForm({ ...form, registration_closes_at: event.target.value })} className="input text-sm" />
        </label>
      </div>
      <label className="label">{t('league4.startsAt')}
        <input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} className="input text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="label">{t('league4.matchdayLength')} ({t('league4.daysShort')})
          <input type="number" min={1} max={14} value={form.matchday_days} onChange={(event) => setForm({ ...form, matchday_days: Number(event.target.value) })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.minTeams')}
          <input type="number" min={4} max={16} value={form.min_teams} onChange={(event) => setForm({ ...form, min_teams: Number(event.target.value) })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.maxTeams')}
          <input type="number" min={4} max={16} value={form.max_teams} onChange={(event) => setForm({ ...form, max_teams: Number(event.target.value) })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.rosterMin')}
          <input type="number" min={6} max={8} value={form.roster_min} onChange={(event) => setForm({ ...form, roster_min: Number(event.target.value) })} className="input text-sm" />
        </label>
        <label className="label">{t('league4.rosterMax')}
          <input type="number" min={6} max={8} value={form.roster_max} onChange={(event) => setForm({ ...form, roster_max: Number(event.target.value) })} className="input text-sm" />
        </label>
      </div>
      {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
      <button type="submit" disabled={busy || form.name.trim().length < 2} className="btn-primary h-11 text-sm">
        {busy ? t('league4.creatingSeason') : t('league4.createSeason')}
      </button>
    </form>
  );
}
