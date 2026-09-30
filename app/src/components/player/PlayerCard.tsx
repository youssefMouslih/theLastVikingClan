import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';
import { useLocale } from '../../i18n/LocaleContext';
import { getAvatarUrl } from '../../services/storageService';
import { getRecentMatches, type CareerStats } from '../../services/statisticsService';
import type { Profile } from '../../types/database';

// eFootball-style player card: banner, avatar, game-name bar, W/D/L record
// bar, Highest PvP division, and last-5 match history vs player avatars.
export default function PlayerCard({
  member,
  career,
  action,
}: {
  member: Profile;
  career?: CareerStats | null;
  action?: ReactNode;
}) {
  const { t } = useLocale();
  const avatarQuery = useQuery({
    queryKey: ['avatar', member.id, member.avatar_url],
    queryFn: () => getAvatarUrl(member.avatar_url),
    enabled: !!member.avatar_url,
    staleTime: 1000 * 60 * 60,
  });
  const recentQuery = useQuery({
    queryKey: ['recent', member.id],
    queryFn: () => getRecentMatches(member.id, 5),
    staleTime: 30_000,
  });
  const avatar = avatarQuery.data ?? null;
  const recent = recentQuery.data ?? [];
  const total = (career?.wins ?? 0) + (career?.draws ?? 0) + (career?.losses ?? 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#12121f] shadow-xl">
      {/* Banner with Konami-style diagonal stripes */}
      <div className="efoot-banner relative h-24">
        <div className="absolute -bottom-7 start-4">
          {avatar ? (
            <img src={avatar} alt="" className="h-16 w-16 rounded-full border-2 border-white/70 object-cover" />
          ) : (
            <div aria-hidden className="font-display flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/70 bg-zinc-800 text-2xl">
              {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        {action && <div className="absolute end-3 top-3">{action}</div>}
      </div>

      <div className="p-4 pt-9">
        {/* Game-name bar */}
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2.5">
          <span className="font-display truncate text-lg tracking-wide">{member.efootball_name ?? member.display_name ?? member.username}</span>
          <Icon name="back" className="h-5 w-5 rotate-180 opacity-50" />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-80">
          <span>@{member.username}</span>
          <StatusBadge value={member.role} />
          <StatusBadge value={member.status} />
          {member.country && <span>• {member.country}</span>}
        </div>
        {member.bio && <p className="mt-2 text-sm opacity-85">{member.bio}</p>}

        {/* Highest PvP division */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 p-3">
          <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-700 text-base">★</span>
          <div>
            <p className="text-xs opacity-60">{t('profile.highestPvp')}</p>
            <p className="font-display text-lg leading-tight">{member.division_pvp ?? t('profile.divisionNA')}</p>
          </div>
          <div className="ms-auto text-right text-xs opacity-70">
            <div className="font-display text-lg text-accent-400">{career ? `${career.winRate}%` : '—'}</div>
            <div>{t('player.winRate')}</div>
          </div>
        </div>

        {/* Wins / Draws / Losses record bar */}
        <div className="mt-3">
          <div className="flex h-7 overflow-hidden rounded-md text-center text-xs font-bold leading-7" role="img" aria-label={`${career?.wins ?? 0}W ${career?.draws ?? 0}D ${career?.losses ?? 0}L`}>
            <div className="bg-green-500 text-zinc-950" style={{ width: `${total ? ((career?.wins ?? 0) / total) * 100 : 0}%` }}>{t('player.wins')}</div>
            <div className="bg-zinc-500 text-white" style={{ width: `${total ? ((career?.draws ?? 0) / total) * 100 : 0}%` }}>{t('player.draws')}</div>
            <div className="bg-red-500 text-white" style={{ width: `${total ? ((career?.losses ?? 0) / total) * 100 : 0}%` }}>{t('player.losses')}</div>
          </div>
          <div className="mt-1 grid grid-cols-3 text-center text-sm">
            <div className="font-display text-lg">{career?.wins ?? '—'}</div>
            <div className="font-display text-lg">{career?.draws ?? '—'}</div>
            <div className="font-display text-lg">{career?.losses ?? '—'}</div>
          </div>
        </div>

        {/* Last 5: opponent avatar + name + score */}
        <div className="mt-3 border-t border-white/10 pt-2">
          <p className="mb-2 text-xs opacity-60">{t('profile.lastMatches')}</p>
          {recent.length === 0 ? (
            <p className="text-sm opacity-60">{t('player.noMatches')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/matches/${m.id}`}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      m.result === 'W' ? 'bg-green-500/10' : m.result === 'L' ? 'bg-red-500/10' : 'bg-zinc-500/10'
                    }`}
                  >
                    <Avatar path={m.opponent.avatar_url} name={m.opponent.display_name ?? m.opponent.username} className="h-8 w-8 text-xs" />
                    <span className="flex-1 truncate font-semibold">{m.opponent.display_name ?? m.opponent.username}</span>
                    <span className={`font-mono font-bold ${m.result === 'W' ? 'text-green-400' : m.result === 'L' ? 'text-red-400' : 'text-zinc-300'}`}>
                      {m.mine}–{m.theirs}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
