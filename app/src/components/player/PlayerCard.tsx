import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import Icon from '../ui/Icon';
import StatusBadge from '../ui/StatusBadge';
import { useLocale } from '../../i18n/LocaleContext';
import { getAvatarUrl } from '../../services/storageService';
import type { CareerStats } from '../../services/statisticsService';
import type { Profile } from '../../types/database';

// eFootball "User Information" style card: banner, avatar, game-name bar,
// achievement tiles, Highest VS AI / PvP divisions, favourite player card.
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
  const avatar = avatarQuery.data ?? null;

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

        {/* Achievement tiles */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-white/5 p-3 text-center">
          <div>
            <Icon name="swords" className="mx-auto h-7 w-7 text-brand-300" />
            <div className="font-display mt-1 text-lg">{career?.played ?? '—'}</div>
            <div className="text-[11px] opacity-60">{t('player.matches')}</div>
          </div>
          <div>
            <Icon name="shield" className="mx-auto h-7 w-7 text-brand-300" />
            <div className="font-display mt-1 text-lg">{career ? `${career.winRate}%` : '—'}</div>
            <div className="text-[11px] opacity-60">{t('player.winRate')}</div>
          </div>
          <div>
            <Icon name="trophy" className="mx-auto h-7 w-7 text-brand-300" />
            <div className="font-display mt-1 text-lg">{career?.titles ?? '—'}</div>
            <div className="text-[11px] opacity-60">{t('player.titles')}</div>
          </div>
        </div>

        <div className="mt-3 flex gap-3">
          {/* Divisions */}
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div>
              <p className="text-xs opacity-60">{t('profile.highestAi')}</p>
              <DivisionBadge value={member.division_ai} na={t('profile.divisionNA')} />
            </div>
            <div>
              <p className="text-xs opacity-60">{t('profile.highestPvp')}</p>
              <DivisionBadge value={member.division_pvp} na={t('profile.divisionNA')} />
            </div>
            {/* Clan record strip */}
            <div className="col-span-2 mt-1 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-center text-xs">
              <div><div className="font-display text-base">{career?.wins ?? '—'}</div><div className="opacity-60">{t('player.wins')}</div></div>
              <div><div className="font-display text-base">{career?.goals_for ?? '—'}</div><div className="opacity-60">{t('player.goals')}</div></div>
              <div><div className="font-display text-base">{career && career.form.length ? career.form.map((f) => (f === 'W' ? '🟢' : f === 'L' ? '🔴' : '⚪')).join('') : '—'}</div><div className="opacity-60">{t('player.form')}</div></div>
            </div>
          </div>
          {/* Favourite player mini-card */}
          <div className="w-28 shrink-0">
            <p className="mb-1 text-xs opacity-60">{t('profile.favourite')}</p>
            <div className="fav-card flex min-h-[132px] flex-col justify-between rounded-lg p-2">
              <div>
                <div className="font-display text-xl leading-none">{member.fav_player_rating ?? '–'}</div>
                <div className="text-[11px] font-bold opacity-80">{member.fav_player_position ?? ''}</div>
              </div>
              <div className="text-xs font-bold leading-tight">{member.fav_player_name ?? '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DivisionBadge({ value, na }: { value: string | null; na: string }) {
  if (!value) {
    return (
      <div className="mt-1 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-white/20" />
        <span className="font-display text-lg opacity-60">{na}</span>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="font-display flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-brand-400 to-brand-700 text-sm">★</span>
      <span className="font-display text-base">{value}</span>
    </div>
  );
}
