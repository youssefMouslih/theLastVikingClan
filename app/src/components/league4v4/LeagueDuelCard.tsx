import { useState } from 'react';
import { Link } from 'react-router';
import {
  canRequestSubstitution,
  canStartDuel,
  eligibleSubstitutes,
} from '../../competition/league4v4/lineup';
import { useLocale } from '../../i18n/LocaleContext';
import type {
  LeagueDuelWithPlayers,
  LeagueMemberWithProfile,
  LeagueSubstitutionWithPlayers,
} from '../../types/league4v4';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';

export default function LeagueDuelCard({
  duel,
  homeName,
  awayName,
  myPlayerId,
  myTeamId,
  isCaptain,
  bench,
  duels,
  substitutions,
  busy = false,
  onStart,
  onSubstitute,
  children,
}: {
  duel: LeagueDuelWithPlayers;
  homeName: string;
  awayName: string;
  myPlayerId?: string;
  myTeamId?: string;
  isCaptain: boolean;
  bench: LeagueMemberWithProfile[];
  duels: LeagueDuelWithPlayers[];
  substitutions: LeagueSubstitutionWithPlayers[];
  busy?: boolean;
  onStart: (duelId: string) => void;
  onSubstitute: (duelId: string, outPlayerId: string, inPlayerId: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  const [picking, setPicking] = useState(false);
  const outPlayerId =
    myTeamId === duel.home_team_id
      ? duel.home_player_id
      : myTeamId === duel.away_team_id
        ? duel.away_player_id
        : null;
  const canSub = canRequestSubstitution({ duel, teamId: myTeamId, isCaptain });
  const eligibleIds = outPlayerId && myTeamId
    ? eligibleSubstitutes({
        benchPlayerIds: bench.map((member) => member.player_id),
        duels,
        substitutions,
        teamId: myTeamId,
        outPlayerId,
      })
    : [];
  const eligible = bench.filter((member) => eligibleIds.includes(member.player_id));
  const duelSubs = substitutions.filter((substitution) => substitution.duel_id === duel.id);
  const alreadySubbed = !!myTeamId && duelSubs.some((substitution) => substitution.team_id === myTeamId);
  const winnerName =
    duel.winner_team_id === duel.home_team_id ? homeName : duel.winner_team_id === duel.away_team_id ? awayName : null;
  const finished = duel.status === 'CONFIRMED' || duel.status === 'FORFEITED';

  function name(member: { display_name: string | null; username: string } | null, fallbackId: string) {
    return member?.display_name ?? member?.username ?? fallbackId.slice(0, 8);
  }

  function playerRow(playerId: string, profile: LeagueDuelWithPlayers['home_player'], teamName: string) {
    const playerName = name(profile, playerId);
    return (
      <Link to={`/players/${playerId}`} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1.5 ${playerId === myPlayerId ? 'bg-brand-500/10' : ''}`}>
        <Avatar path={profile?.avatar_url ?? null} name={playerName} className="h-9 w-9 text-sm" zoomable={false} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {playerName}
            {playerId === myPlayerId ? ` (${t('league4.you')})` : ''}
          </span>
          <span className="block truncate text-[11px] opacity-60">{teamName}</span>
        </span>
      </Link>
    );
  }

  return (
    <article className="rounded-xl border border-[var(--border)] p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-display flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/15 text-xs font-bold text-brand-400">
          {duel.slot}
        </span>
        <span className="min-w-0 flex-1 font-semibold opacity-70">{t('league4.duel')} {duel.slot}</span>
        <StatusBadge value={duel.status} />
      </div>

      <div className="mt-2 flex items-center gap-1">
        {playerRow(duel.home_player_id, duel.home_player, homeName)}
        <span className="shrink-0 px-1 font-display text-sm font-bold opacity-60">vs</span>
        {playerRow(duel.away_player_id, duel.away_player, awayName)}
      </div>

      {finished && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-brand-400">
          <Icon name="trophy" className="h-3.5 w-3.5" />
          {winnerName ? t('league4.winnerName', { name: winnerName }) : t('league4.winner')}
          {duel.home_score !== null && duel.away_score !== null && (
            <span className="tabular-nums opacity-80">· {duel.home_score}–{duel.away_score}</span>
          )}
        </p>
      )}

      {duelSubs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--border)] pt-2 text-[11px] opacity-70">
          {duelSubs.map((substitution) => (
            <li key={substitution.id} className="flex items-center gap-1">
              <Icon name="swords" className="h-3 w-3 shrink-0" />
              {t('league4.substitutedIn', {
                in: name(substitution.in_player, substitution.in_player_id),
                out: name(substitution.out_player, substitution.out_player_id),
              })}
            </li>
          ))}
        </ul>
      )}

      {canStartDuel(duel, myPlayerId) && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart(duel.id)}
          className="btn-primary mt-2 h-10 w-full text-sm"
        >
          {busy ? t('league4.startingDuel') : t('league4.startDuel')}
        </button>
      )}

      {canSub && !alreadySubbed && eligible.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking((value) => !value)}
            className="btn-ghost h-10 w-full text-sm"
          >
            <Icon name="swords" className="h-3.5 w-3.5" /> {t('league4.substituteAction')}
          </button>
          {picking && (
            <div className="mt-2 rounded-xl border border-[var(--border)] p-2">
              <p className="text-xs opacity-60">{t('league4.substituteHint')}</p>
              <div className="mt-1 flex flex-col gap-1">
                {eligible.map((member) => {
                  const playerName = member.player?.display_name ?? member.player?.username ?? member.player_id.slice(0, 8);
                  return (
                    <button
                      key={member.player_id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPicking(false);
                        onSubstitute(duel.id, outPlayerId!, member.player_id);
                      }}
                      className="flex items-center gap-2 rounded-lg p-1.5 text-start hover:bg-white/5"
                    >
                      <Avatar path={member.player?.avatar_url ?? null} name={playerName} className="h-8 w-8 text-xs" zoomable={false} />
                      <span className="min-w-0 flex-1 truncate text-sm">{playerName}</span>
                      <span className="text-[11px] text-brand-400">{t('league4.substituteAction')}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {canSub && !alreadySubbed && eligible.length === 0 && <p className="mt-2 text-[11px] opacity-50">{t('league4.noEligibleSubs')}</p>}
      {children}
    </article>
  );
}
