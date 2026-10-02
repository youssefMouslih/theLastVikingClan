import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../ui/Avatar';
import Icon from '../ui/Icon';
import { parseCountry } from '../../utils/countries';
import { statusLabel, useLocale } from '../../i18n/LocaleContext';
import { getClanSettings } from '../../services/clanService';
import { getAvatarUrl, getBannerUrl } from '../../services/storageService';
import { getRecentMatches, type CareerStats } from '../../services/statisticsService';
import { getTotalXP, levelFor } from '../../services/sagaService';
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
  const xpQuery = useQuery({
    queryKey: ['xp', member.id],
    queryFn: () => getTotalXP(member.id),
    staleTime: 60_000,
  });
  const levelName = t(levelFor(xpQuery.data ?? 0).level.nameKey);
  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const avatar = avatarQuery.data ?? null;
  const bannerImg = bannerQuery.data ?? null;
  const recent = recentQuery.data ?? [];
  const total = (career?.wins ?? 0) + (career?.draws ?? 0) + (career?.losses ?? 0);
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
            <img src={avatar} alt="" className="h-16 w-16 rounded-full border-2 border-white/70 object-cover" />
          ) : (
            <div aria-hidden className="font-display flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/70 bg-zinc-800 text-2xl">
              {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        {action && <div className="absolute bottom-2 end-3">{action}</div>}
      </div>

      <div className="p-4 pt-9">
        {/* Game-name bar */}
        <div className="flex items-center justify-between rounded-xl bg-white/10 px-4 py-2.5">
          <span className="font-display truncate text-lg tracking-wide">{member.efootball_name ?? member.display_name ?? member.username}</span>
          <button type="button" onClick={share} className="flex items-center gap-1 text-xs opacity-70 underline">
            {shared ? t('common.copied') : t('profile.share')}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs opacity-80">
          <span>@{member.username}</span>
          {(() => {
            const c = parseCountry(member.country);
            return c && c.flag ? <span>{c.flag} {c.name}</span> : member.country ? <span>• {member.country}</span> : null;
          })()}
        </div>
        {member.bio && <p className="mt-2 text-sm opacity-85">{member.bio}</p>}
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

        {/* Badge showcase */}
        <div className="mt-3 flex flex-col items-center gap-1">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-500/50 bg-gradient-to-b from-brand-400 to-brand-700 shadow-lg shadow-brand-500/40">
            <Icon name="trophy" className="h-7 w-7 text-white" />
          </span>
          <span className="font-display text-xs uppercase tracking-[0.2em] text-brand-300">{levelName}</span>
        </div>

        {/* Stats summary panel */}
        <div className="mt-2 rounded-xl bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-3 gap-1 text-center">
              <div>
                <div className="font-display text-lg leading-tight">{career?.clean_sheets ?? '—'}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="shield" className="h-3.5 w-3.5" />{t('player.cleanSheets')}</div>
              </div>
              <div>
                <div className="font-display text-lg leading-tight">{career?.goals_for ?? '—'}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="swords" className="h-3.5 w-3.5" />{t('player.goals')}</div>
              </div>
              <div>
                <div className="font-display text-lg leading-tight text-accent-400">{career ? `${career.winRate}%` : '—'}</div>
                <div className="flex items-center justify-center gap-1 text-[11px] opacity-60"><Icon name="chart" className="h-3.5 w-3.5" />{t('player.winRate')}</div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex h-7 overflow-hidden rounded-md text-center text-xs font-bold leading-7" role="img" aria-label={`${career?.wins ?? 0}W ${career?.draws ?? 0}D ${career?.losses ?? 0}L`}>
            <div className="min-w-[64px] bg-green-500 text-zinc-950" style={{ width: `${total ? ((career?.wins ?? 0) / total) * 100 : 0}%` }}>{t('player.wins')}</div>
            <div className="min-w-[64px] bg-zinc-500 text-white" style={{ width: `${total ? ((career?.draws ?? 0) / total) * 100 : 0}%` }}>{t('player.draws')}</div>
            <div className="min-w-[64px] flex-1 bg-red-500 text-white">{t('player.losses')}</div>
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
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-60">{label}</span>
                    <Link to={to} className={`font-mono text-sm font-bold ${color}`}>{m.mine}–{m.theirs}</Link>
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

function socialLink(kind: 'instagram' | 'tiktok' | 'kick', value: string | null): string | null {
  if (!value?.trim()) return null;
  const v = value.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'instagram') return `https://instagram.com/${v}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${v}`;
  return `https://kick.com/${v}`;
}
