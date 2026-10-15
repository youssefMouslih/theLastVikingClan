import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import { Lightbox } from '../ui/Motion';
import { parseCountry } from '../../utils/countries';
import { statusLabel, useLocale } from '../../i18n/LocaleContext';
import { getClanSettings } from '../../services/clanService';
import { getAvatarUrl, getBannerUrl } from '../../services/storageService';
import HonourBadge from '../emblem/HonourBadge';
import { getRecentMatches, type CareerStats } from '../../services/statisticsService';
import { listHonoursFor, type Honour } from '../../services/honourService';
import { getCurrentReign } from '../../services/throneService';
import { profilePoster, shareFile } from '../../utils/shareBattle';
import type { Profile } from '../../types/database';

// eFootball-style player card: custom banner, avatar, game-name bar,
// W/D/L record, Highest PvP division, honors, last-5 vs player avatars.
export default function PlayerCard({
  member,
  career,
  action,
  onAvatarClick,
}: {
  member: Profile;
  career?: CareerStats | null;
  action?: React.ReactNode;
  onAvatarClick?: () => void;
}) {
  const { t } = useLocale();
  const [shared, setShared] = useState(false);
  const [zoom, setZoom] = useState(false);
  const mainName = member.known_name ?? member.efootball_name ?? member.display_name ?? member.username;
  const avatarQuery = useQuery({
    queryKey: ['avatar', member.id, member.avatar_url],
    queryFn: () => getAvatarUrl(member.avatar_url),
    enabled: !!member.avatar_url,
    staleTime: 1000 * 60 * 60,
  });
  const bannerQuery = useQuery({
    queryKey: ['banner', member.id, member.banner_image],
    queryFn: () => getBannerUrl(member.banner_image),
    enabled: !!member.banner_image,
    staleTime: 1000 * 60 * 60,
  });
  const recentQuery = useQuery({
    queryKey: ['recent', member.id],
    queryFn: () => getRecentMatches(member.id, 5),
    staleTime: 30_000,
  });
  const honoursQuery = useQuery({
    queryKey: ['honours', member.id],
    queryFn: () => listHonoursFor(member.id, 100).catch(() => []),
    staleTime: 60_000,
  });
  const throneQuery = useQuery({
    queryKey: ['throne'],
    queryFn: () => getCurrentReign().catch(() => null),
    staleTime: 60_000,
  });
  const honours = honoursQuery.data ?? [];
  // Repeat wins of the same award collapse into one tile with a ×N count
  // (latest award shown; full history stays in the DB + admin list).
  const grouped = useMemo(() => {
    const map = new Map<string, { honour: Honour; count: number }>();
    for (const h of honours) {
      const key = `${h.type}::${h.name}`;
      const g = map.get(key);
      if (g) g.count += 1;
      else map.set(key, { honour: h, count: 1 });
    }
    return [...map.values()];
  }, [honours]);
  const isHolder = throneQuery.data?.holder_id === member.id;
  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const avatar = avatarQuery.data ?? null;
  const bannerImg = bannerQuery.data ?? null;
  const recent = recentQuery.data ?? [];
  const ig = socialLink('instagram', member.instagram);
  const tk = socialLink('tiktok', member.tiktok);
  const kk = socialLink('kick', member.kick);

  async function share() {
    const name = member.display_name ?? member.username;
    try {
      const file = await profilePoster({
        name,
        wins: career?.wins ?? 0,
        draws: career?.draws ?? 0,
        losses: career?.losses ?? 0,
        winRate: career?.winRate ?? 0,
        division: member.division_pvp,
        titles: career?.titles ?? 0,
        avatarUrl: avatar,
      });
      await shareFile(file, `${name} — VIK Clan`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Fallback: share the profile link as text.
      const url = `${window.location.origin}/players/${member.id}`;
      try {
        if (navigator.share) {
          await navigator.share({ title: name, text: `${name} — VIK Clan`, url });
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setShared(true);
          setTimeout(() => setShared(false), 2000);
        }
      } catch { /* dismissed */ }
    }
  }

  return (
    <section className="rune-frame overflow-hidden text-[#e2e8f0] shadow-xl">
      <p aria-hidden className="rune-strip px-4 pb-1 pt-2 text-center">ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲᚷᚹ</p>
      {/* Custom banner: uploaded image, chosen color, or Konami stripes */}
      <div
        className={`relative h-24 ${!bannerImg && !member.banner_color ? 'efoot-banner' : ''}`}
        style={bannerImg ? { backgroundImage: `url(${bannerImg})`, backgroundSize: 'cover', backgroundPosition: 'center' } : member.banner_color ? { background: member.banner_color } : undefined}
      >
        <img src={clanQuery.data?.logo_url ?? '/logo.png'} alt="" aria-hidden className="absolute left-1/2 top-2 h-11 w-11 -translate-x-1/2 rounded-full border-2 border-brand-500/60 object-cover shadow-lg shadow-black/60" />
        <div className="absolute -bottom-7 start-4">
          {onAvatarClick ? (
            <button type="button" onClick={onAvatarClick} aria-label={t('profile.avatar')} className="group relative block rounded-full">
              {avatar ? (
                <img src={avatar} alt="" className="h-16 w-16 rounded-full border-2 border-white/70 object-cover" />
              ) : (
                <div aria-hidden className="font-display flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/70 bg-zinc-800 text-2xl">
                  {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
                <Icon name="camera" className="h-6 w-6 text-white" />
              </span>
            </button>
          ) : avatar ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setZoom(true);
              }}
              aria-label={t('common.viewPhoto', { name: mainName })}
              className="relative block rounded-full"
            >
              <img src={avatar} alt="" className="h-16 w-16 rounded-full border-2 border-white/70 object-cover" />
            </button>
          ) : (
            <span className="relative block rounded-full">
              <div aria-hidden className="font-display flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/70 bg-zinc-800 text-2xl">
                {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
              </div>
            </span>
          )}
          {zoom && avatar && <Lightbox src={avatar} onClose={() => setZoom(false)} />}
        </div>
        {action && <div className="absolute bottom-2 end-3">{action}</div>}
      </div>

      <div className="p-4 pt-9">
        {/* Game-name bar: warrior name, game name, real name */}
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2.5">
          <span className="font-display truncate text-lg tracking-wide">{mainName}</span>
          <button type="button" onClick={share} className="flex items-center gap-1 text-xs opacity-70 underline">
            {shared ? t('common.copied') : t('profile.share')}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-80">
          {member.display_name && member.display_name !== (member.known_name ?? member.efootball_name) && (
            <span>{member.display_name}</span>
          )}
          {member.efootball_name && member.efootball_name !== member.known_name && (
            <span className="inline-flex items-center gap-1">• <img src="/efootball.svg" alt="eFootball" className="h-4 w-4 rounded-[4px]" /> {member.efootball_name}</span>
          )}
          {(() => {
            const c = parseCountry(member.country);
            return c && c.flag ? <span>• {c.flag} {c.name}</span> : member.country ? <span>• {member.country}</span> : null;
          })()}
        </div>
        {member.bio && (
          <section aria-label={t('profile.about')} className="mt-2 rounded-xl bg-white/5 p-3">
            <h3 className="card-title">{t('profile.about')}</h3>
            <p className="mt-1 whitespace-pre-line text-sm">{member.bio}</p>
          </section>
        )}
        {(ig || tk || kk) && (
          <div className="mt-2 flex gap-2">
            {ig && (
              <a href={ig} target="_blank" rel="noreferrer" aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Icon name="instagram" className="h-5 w-5" />
              </a>
            )}
            {tk && (
              <a href={tk} target="_blank" rel="noreferrer" aria-label="TikTok" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Icon name="tiktok" className="h-5 w-5" />
              </a>
            )}
            {kk && (
              <a href={kk} target="_blank" rel="noreferrer" aria-label="Kick" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Icon name="kick" className="h-5 w-5" />
              </a>
            )}
          </div>
        )}

        {/* Clan rewards & throne crown */}
        {(isHolder || grouped.length > 0) && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            {isHolder && (
              <span className="flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold text-brand-300">
                <Icon name="crown" className="h-4 w-4" /> {t('throne.holder')}
              </span>
            )}
            {grouped.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3">
                {grouped.map(({ honour: h, count }) => (
                  <span key={`${h.type}::${h.name}`} className="flex w-24 flex-col items-center gap-1 text-center">
                    <span className="relative">
                      <HonourBadge honour={h} zoomable />
                      {count > 1 && (
                        <span className="absolute -bottom-1 -end-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                          ×{count}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-semibold leading-tight">{h.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats summary panel */}
        <div className="mt-2 rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-3 gap-1 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="shield" className="h-3.5 w-3.5" />{t('player.cleanSheets')}</div>
                <div className="font-display text-lg leading-tight">{career?.clean_sheets ?? '—'}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="swords" className="h-3.5 w-3.5" />{t('player.goals')}</div>
                <div className="font-display text-lg leading-tight">{career?.goals_for ?? '—'}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="chart" className="h-3.5 w-3.5" />{t('player.winRate')}</div>
                <div className="font-display text-lg leading-tight text-accent-400">{career ? `${career.winRate}%` : '—'}</div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex h-7 overflow-hidden rounded-md text-center text-xs font-bold leading-7" role="img" aria-label={`${career?.wins ?? 0}W ${career?.draws ?? 0}D ${career?.losses ?? 0}L`}>
            <div className="min-w-0 flex-1 bg-green-500 text-zinc-950">{t('player.wins')}</div>
            <div className="min-w-0 flex-1 bg-zinc-500 text-white">{t('player.draws')}</div>
            <div className="min-w-0 flex-1 bg-red-500 text-white">{t('player.losses')}</div>
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
            <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
              {recent.map((m) => {
                const label = m.kind === 'match'
                  ? (m.compType ? statusLabel(t, m.compType) : '')
                  : (m.battleType ? t(`battle.t${m.battleType}` as 'battle.tHEAD').split('—')[0].trim() : '');
                const to = m.kind === 'match' ? `/matches/${m.id}` : '/battles';
                const color = m.result === 'W' ? 'text-green-400' : m.result === 'L' ? 'text-red-400' : 'text-zinc-300';
                return (
                  <div
                    key={m.id}
                    className={`flex w-[92px] shrink-0 flex-col items-center gap-0.5 rounded-xl border border-white/20 px-1 py-2 text-center ${
                      m.result === 'W' ? 'bg-green-500/10' : m.result === 'L' ? 'bg-red-500/10' : 'bg-zinc-500/10'
                    }`}
                  >
                    <Link to={`/players/${m.opponent.id}`} className="flex flex-col items-center gap-0.5">
                      <Avatar path={m.opponent.avatar_url} name={m.opponent.display_name ?? m.opponent.username} className="h-11 w-11 text-sm" />
                      <span className="w-full truncate text-[10px] opacity-80 underline-offset-2 hover:underline">{m.opponent.display_name ?? m.opponent.username}</span>
                    </Link>
                    <Link to={to} className={`font-mono text-sm font-bold ${color}`}>{m.mine}–{m.theirs}</Link>
                    <span className="text-[10px] leading-tight opacity-60">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <p aria-hidden className="rune-strip px-4 pb-2 pt-3 text-center">ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟᚠᚢᚦᚨᚱᚲᚷᚹ</p>
    </section>
  );
}

export function socialLink(kind: 'instagram' | 'tiktok' | 'kick', value: string | null): string | null {
  if (!value?.trim()) return null;
  const v = value.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'instagram') return `https://instagram.com/${v}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${v}`;
  return `https://kick.com/${v}`;
}
