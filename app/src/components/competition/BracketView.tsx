import { Link } from 'react-router';
import type { Match } from '../../types/database';
import type { Round } from '../../services/matchService';
import { statusLabel, useLocale } from '../../i18n/LocaleContext';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';

const FINAL_STATUSES = new Set(['CONFIRMED', 'FORFEIT']);

function winnerOf(match: Match): string | null {
  if (!FINAL_STATUSES.has(match.status)) return null;
  if (match.winner_id) return match.winner_id;
  if (match.score_a == null || match.score_b == null) return null;
  if (match.score_a === match.score_b) return null;
  return match.score_a > match.score_b ? match.player_a_id : match.player_b_id;
}

function Merger({ decided }: { decided: boolean }) {
  const color = decided ? 'border-brand-500/70' : 'border-black/15 dark:border-white/15';
  return (
    <div aria-hidden className="relative w-full flex-1">
      <span className={`absolute border-l-2 ${color}`} style={{ left: '50%', top: '25%', height: '50%' }} />
      <span className={`absolute border-t-2 ${color}`} style={{ left: 0, width: '50%', top: '25%' }} />
      <span className={`absolute border-t-2 ${color}`} style={{ left: 0, width: '50%', top: '75%' }} />
      <span className={`absolute border-t-2 ${color}`} style={{ left: '50%', right: 0, top: '50%' }} />
    </div>
  );
}

function BracketMatchCard({
  match,
  names,
  avatars,
  meId,
}: {
  match: Match;
  names: Record<string, string>;
  avatars: Record<string, string | null>;
  meId: string | null;
}) {
  const { t } = useLocale();
  const aId = match.player_a_id as string | null;
  const bId = match.player_b_id as string | null;
  const a = aId ? names[aId] ?? aId.slice(0, 8) : t('detail.tbd');
  const b = bId ? names[bId] ?? bId.slice(0, 8) : t('detail.tbd');
  const winner = winnerOf(match);
  const decided = FINAL_STATUSES.has(match.status);
  const hasScore = match.score_a != null && match.score_b != null;
  const mine = !!meId && (match.player_a_id === meId || match.player_b_id === meId);
  const pending = match.status === 'RESULT_SUBMITTED' || match.status === 'DISPUTED' || match.status === 'OVERDUE';
  const border = mine
    ? 'border-brand-500/70'
    : pending
      ? 'border-amber-500/60'
      : 'border-black/10 dark:border-white/10';

  const row = (id: string | null, name: string, score: number | null) => {
    const isWinner = decided && !!winner && id === winner;
    const isLoser = decided && !!winner && !!id && id !== winner;
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        {id ? (
          <Avatar path={avatars[id]} name={name} className="h-5 w-5 text-[9px]" />
        ) : (
          <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-current opacity-30" aria-hidden />
        )}
        <span className={`min-w-0 flex-1 truncate text-[11px] ${isWinner ? 'font-bold text-green-400' : isLoser ? 'opacity-55' : id ? 'font-medium' : 'opacity-40'}`}>
          {name}
        </span>
        <span className={`w-4 shrink-0 text-right font-mono text-[11px] tabular-nums ${isWinner ? 'font-black text-green-400' : 'opacity-70'}`}>
          {hasScore ? score : '–'}
        </span>
      </div>
    );
  };

  return (
    <Link
      to={`/matches/${match.id}`}
      title={statusLabel(t, match.status)}
      aria-label={`${a} vs ${b}${hasScore ? `, ${match.score_a}–${match.score_b}` : ''}`}
      className={`flex w-[190px] shrink-0 flex-col justify-center gap-1 rounded-xl border bg-[var(--surface-2)]/60 px-2.5 py-2 transition hover:border-brand-500/60 hover:bg-[var(--surface-2)] ${border} ${mine ? 'ring-1 ring-brand-500/30' : ''}`}
      style={{ height: 76 }}
    >
      {row(aId, a, match.score_a)}
      {row(bId, b, match.score_b)}
    </Link>
  );
}

export default function BracketView({
  rounds,
  matches,
  names,
  avatars,
  meId,
}: {
  rounds: Round[];
  matches: Match[];
  names: Record<string, string>;
  avatars: Record<string, string | null>;
  meId: string | null;
}) {
  const { t } = useLocale();
  const ordered = [...rounds].sort((a, b) => a.round_number - b.round_number);
  const matchesFor = (roundId: string) => matches.filter((match) => match.round_id === roundId);
  const maxMatches = Math.max(1, ...ordered.map((round) => matchesFor(round.id).length));
  const columnHeight = Math.max(280, maxMatches * 88);
  const lastRound = ordered[ordered.length - 1];
  const lastMatches = lastRound ? matchesFor(lastRound.id) : [];
  const finalMatch = lastMatches.length === 1 ? lastMatches[0] : null;
  const champion = finalMatch ? winnerOf(finalMatch) : null;
  const totalRounds = ordered.length;

  return (
    <section className="card mt-3" aria-label={t('detail.tabBracket')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="card-title flex items-center gap-1.5">
            <Icon name="trophy" className="h-4 w-4 text-brand-400" />
            {t('detail.tabBracket')}
          </h2>
          <p className="mt-0.5 text-xs opacity-60">{t('detail.bracketHint')}</p>
        </div>
      </div>

      <div
        className="mt-3 overflow-x-auto pb-2"
        role="region"
        aria-label={t('detail.tabBracket')}
        tabIndex={0}
      >
        <div className="flex w-max items-stretch">
          {ordered.map((round, roundIndex) => {
            const roundMatches = matchesFor(round.id);
            const nextRound = ordered[roundIndex + 1];
            return (
              <div key={round.id} className="flex shrink-0 items-stretch">
                <div className="flex w-[190px] flex-col">
                  <div className="flex h-9 items-center justify-between gap-1 px-1">
                    <span className={`truncate text-[10px] font-bold uppercase tracking-wider ${round.status === 'ACTIVE' ? 'text-brand-300' : 'opacity-60'}`}>
                      {round.name}
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      round.status === 'COMPLETED'
                        ? 'bg-zinc-500/15 text-zinc-400'
                        : round.status === 'ACTIVE'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-amber-500/15 text-amber-400'
                    }`}>
                      {round.status === 'COMPLETED' ? t('round.done') : round.status === 'ACTIVE' ? t('round.live') : t('round.locked')}
                    </span>
                  </div>
                  <div className="flex flex-col justify-around" style={{ height: columnHeight }}>
                    {roundMatches.length === 0 ? (
                      <div className="mx-auto flex h-[76px] w-[190px] items-center justify-center rounded-xl border border-dashed border-black/15 text-xs opacity-40 dark:border-white/15">
                        {t('detail.tbd')}
                      </div>
                    ) : (
                      roundMatches.map((match) => (
                        <BracketMatchCard
                          key={match.id}
                          match={match}
                          names={names}
                          avatars={avatars}
                          meId={meId}
                        />
                      ))
                    )}
                  </div>
                </div>

                {nextRound && (
                  <div aria-hidden className="flex w-7 shrink-0 flex-col">
                    <div className="h-9" />
                    <div className="flex flex-col" style={{ height: columnHeight }}>
                      {(matchesFor(nextRound.id).length > 0 ? matchesFor(nextRound.id) : [null]).map((match, index) => (
                        <Merger key={match?.id ?? `empty-${index}`} decided={!!match && winnerOf(match) !== null} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div aria-hidden className="flex w-7 shrink-0 flex-col">
            <div className="h-9" />
            <div className="flex items-center" style={{ height: columnHeight }}>
              <span className={`w-full border-t-2 ${champion ? 'border-brand-500/70' : 'border-black/15 dark:border-white/15'}`} />
            </div>
          </div>

          <div className="flex w-[150px] shrink-0 flex-col">
            <div className="h-9" />
            <div className="flex items-center" style={{ height: columnHeight }}>
              <div className={`flex w-full items-center gap-1.5 rounded-xl border px-2 py-2 ${
                champion
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-black/10 bg-[var(--surface-2)]/40 dark:border-white/10'
              }`}>
                <Icon name="trophy" className={`h-6 w-6 shrink-0 ${champion ? 'text-amber-400' : 'opacity-40'}`} />
                <div className="min-w-0">
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${champion ? 'text-amber-400' : 'opacity-50'}`}>
                    {t('detail.champion')}
                  </div>
                  <div className={`truncate text-xs font-bold ${champion ? '' : 'opacity-50'}`}>
                    {champion ? names[champion] ?? champion.slice(0, 8) : t('detail.tbd')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {totalRounds === 0 && <span className="sr-only">{t('detail.noBracket')}</span>}
        </div>
      </div>
    </section>
  );
}
