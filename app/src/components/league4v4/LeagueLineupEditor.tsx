import { useState } from 'react';
import {
  buildLineupEntries,
  initialLineupSelections,
  MAX_SUBSTITUTES,
  MIN_SUBSTITUTES,
  validateLineup,
  type LineupValidationError,
} from '../../competition/league4v4/lineup';
import { useLocale } from '../../i18n/LocaleContext';
import type { Dict } from '../../i18n/dictionaries';
import type { LeagueLineupEntry, LeagueLineupWithPlayers, LeagueMemberWithProfile } from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';

const ERROR_KEYS: Record<LineupValidationError, keyof Dict> = {
  players: 'league4.lineupErrPlayers',
  starters: 'league4.lineupErrStarters',
  subs: 'league4.lineupErrSubs',
  'duplicate-player': 'league4.lineupErrDuplicatePlayer',
  'duplicate-slot': 'league4.lineupErrDuplicateSlot',
  'not-member': 'league4.lineupErrNotMember',
};

export default function LeagueLineupEditor({
  roster,
  lineup,
  busy = false,
  onSubmit,
}: {
  roster: LeagueMemberWithProfile[];
  lineup?: LeagueLineupWithPlayers | null;
  busy?: boolean;
  onSubmit: (entries: LeagueLineupEntry[]) => void;
}) {
  const { t } = useLocale();
  const rosterIds = roster.map((member) => member.player_id);
  const [selections, setSelections] = useState(() => initialLineupSelections(rosterIds, lineup));
  const entries = buildLineupEntries(selections.starters, selections.subs);
  const hasEmptySlot =
    selections.starters.some((playerId) => !playerId) || selections.subs.some((playerId) => !playerId);
  const error = hasEmptySlot ? 'players' : entries.length === 0 ? null : validateLineup(entries, rosterIds);
  const used = new Set([...selections.starters, ...selections.subs].filter((id): id is string => !!id));

  function setSlot(kind: 'starter' | 'sub', index: number, playerId: string) {
    setSelections((prev) => {
      const next = [...prev[kind === 'starter' ? 'starters' : 'subs']];
      next[index] = playerId || null;
      return { ...prev, [kind === 'starter' ? 'starters' : 'subs']: next };
    });
  }

  function addSub() {
    setSelections((prev) => {
      if (prev.subs.length >= MAX_SUBSTITUTES) return prev;
      return { ...prev, subs: [...prev.subs, null] };
    });
  }

  function removeSub(index: number) {
    setSelections((prev) => {
      if (prev.subs.length <= MIN_SUBSTITUTES) return prev;
      return { ...prev, subs: prev.subs.filter((_, i) => i !== index) };
    });
  }

  function playerOption(member: LeagueMemberWithProfile, selectedInSlot?: string | null) {
    const name = member.player?.display_name ?? member.player?.username ?? member.player_id.slice(0, 8);
    const taken = used.has(member.player_id) && member.player_id !== selectedInSlot;
    return (
      <option key={member.player_id} value={member.player_id} disabled={taken}>
        {name}
      </option>
    );
  }

  return (
    <form
      className="card mt-3 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!error) onSubmit(entries);
      }}
    >
      <div>
        <h2 className="card-title flex items-center gap-1">
          <Icon name="swords" className="h-4 w-4 text-brand-400" /> {t('league4.submitLineup')}
        </h2>
        <p className="mt-1 text-xs opacity-60">{t('league4.lineupHint')}</p>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide opacity-60">{t('league4.starters')}</h3>
        <div className="mt-2 flex flex-col gap-2">
          {selections.starters.map((playerId, index) => {
            const member = roster.find((entry) => entry.player_id === playerId);
            return (
              <label key={`starter-${index}`} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2">
                <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-sm font-bold text-brand-400">
                  {index + 1}
                </span>
                {member && <Avatar path={member.player?.avatar_url} name={member.player?.display_name ?? member.player?.username ?? '?'} className="h-8 w-8 text-xs" zoomable={false} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide opacity-60">{t('league4.starter')}</span>
                  <select
                    required
                    value={playerId ?? ''}
                    onChange={(event) => setSlot('starter', index, event.target.value)}
                    className="input mt-0.5 h-9 w-full text-sm"
                    aria-label={`${t('league4.starter')} ${index + 1}`}
                  >
                    <option value="">{t('league4.selectPlayer')}</option>
                    {roster.map((entry) => playerOption(entry, playerId))}
                  </select>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-xs font-bold uppercase tracking-wide opacity-60">{t('league4.substitutes')}</h3>
          {selections.subs.length < MAX_SUBSTITUTES && (
            <button type="button" onClick={addSub} className="btn-ghost h-9 px-3 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" /> {t('league4.addSubstitute')}
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {selections.subs.map((playerId, index) => {
            const member = roster.find((entry) => entry.player_id === playerId);
            return (
              <div key={`sub-${index}`} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2">
                <span className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-sm font-bold opacity-70">
                  {index + 1}
                </span>
                {member && <Avatar path={member.player?.avatar_url} name={member.player?.display_name ?? member.player?.username ?? '?'} className="h-8 w-8 text-xs" zoomable={false} />}
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide opacity-60">{t('league4.substitute')}</span>
                  <select
                    required
                    value={playerId ?? ''}
                    onChange={(event) => setSlot('sub', index, event.target.value)}
                    className="input mt-0.5 h-9 w-full text-sm"
                    aria-label={`${t('league4.substitute')} ${index + 1}`}
                  >
                    <option value="">{t('league4.selectPlayer')}</option>
                    {roster.map((entry) => playerOption(entry, playerId))}
                  </select>
                </span>
                {selections.subs.length > MIN_SUBSTITUTES && (
                  <button
                    type="button"
                    onClick={() => removeSub(index)}
                    className="btn-ghost h-9 px-2 text-xs"
                    title={t('league4.removeSubstitute')}
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{t(ERROR_KEYS[error])}</p>}
      <button type="submit" disabled={!!error || busy} className="btn-primary h-11 w-full text-sm">
        {busy ? t('league4.submittingLineup') : lineup ? t('league4.updateLineup') : t('league4.submitLineup')}
      </button>
    </form>
  );
}
