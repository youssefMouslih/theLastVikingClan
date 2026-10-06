import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Emblem, { CLAN_EMBLEM } from '../components/emblem/Emblem';
import Icon from '../components/ui/Icon';
import { FadeIn, LoadingRegion } from '../components/ui/Motion';
import PresenceDot, { presenceFor } from '../components/ui/PresenceDot';
import ScrambleName from '../components/ui/ScrambleName';
import { useLocale } from '../i18n/LocaleContext';
import { parseCountry } from '../utils/countries';
import { listActiveMembers } from '../services/playerService';
import { getPlayerCareer } from '../services/statisticsService';
import { getTotalXP, levelFor } from '../services/sagaService';
import { getReignHistory } from '../services/throneService';
import { listHonoursFor, type Honour } from '../services/honourService';
import { getBadgeImageUrl } from '../services/storageService';
import type { Profile } from '../types/database';

// The Saga Book: a Viking gallery of the clan. Every warrior gets a spread —
// left page the portrait, right page the saga (name, tags, glories, thrones,
// trophies, achievements). Drag/swipe (or tap, arrows, index) turns the leaf;
// prefers-reduced-motion settles turns without animation.
export default function GalleryPage() {
  const { t } = useLocale();
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const members = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE');
  const [page, setPage] = useState(-1); // -1 = cover + index
  const [turning, setTurning] = useState<'next' | 'prev' | null>(null);
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const go = useCallback((dir: 'next' | 'prev' | number) => {
    setPage((p) => {
      const target = typeof dir === 'number' ? dir : dir === 'next' ? p + 1 : p - 1;
      const clamped = Math.max(-1, Math.min(members.length - 1, target));
      if (clamped === p) return p;
      if (!reduced) {
        setTurning(typeof dir === 'number' ? (target > p ? 'next' : 'prev') : dir);
        setTimeout(() => setTurning(null), 320);
      }
      return clamped;
    });
  }, [members.length, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go('next');
      if (e.key === 'ArrowLeft') go('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientX;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current == null) return;
    const dx = e.clientX - dragStart.current;
    setDragX(Math.max(-180, Math.min(180, dx)));
  }
  function endDrag() {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (dragX < -80) go('next');
    else if (dragX > 80) go('prev');
    setDragX(0);
  }

  const turnClass = turning === 'next' ? 'book-turn-next' : turning === 'prev' ? 'book-turn-prev' : '';

  return (
    <main className="page">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/clan" aria-label={t('nav.clan')} className="btn-ghost h-10 w-10 !px-0">‹</Link>
        <h1 className="font-display flex-1 text-xl tracking-wide">{t('gallery.title')}</h1>
        {members.length > 0 && page >= 0 && (
          <span className="text-xs opacity-60" aria-live="polite">{t('gallery.pageOf', { n: page + 1, total: members.length })}</span>
        )}
      </div>

      <LoadingRegion loading={membersQuery.isLoading} label={t('common.loading')} skeleton="card">
        {members.length === 0 ? (
          <p className="card mt-3 text-sm opacity-70">{t('gallery.empty')}</p>
        ) : (
          <div className="book-wrap">
            <div
              role="region"
              aria-label={t('gallery.title')}
              aria-roledescription="book"
              className={`book ${turnClass}`}
              style={dragX !== 0 ? { transform: `perspective(2000px) rotateY(${dragX * 0.06}deg)` } : undefined}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {page === -1 ? (
                <CoverPage members={members} onOpen={(i) => go(i)} />
              ) : (
                <WarriorSpread key={members[page].id} member={members[page]} />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => go('prev')} disabled={page <= -1} className="btn-ghost h-11 flex-1 text-sm">
                ‹ {t('gallery.prev')}
              </button>
              <button type="button" onClick={() => setPage(-1)} className="btn-ghost h-11 px-4 text-sm" aria-label={t('gallery.index')}>
                <Icon name="scroll" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => go('next')} disabled={page >= members.length - 1} className="btn-ghost h-11 flex-1 text-sm">
                {t('gallery.next')} ›
              </button>
            </div>
            <p className="mt-1 text-center text-xs opacity-50">{t('gallery.turnHint')}</p>
          </div>
        )}
      </LoadingRegion>
      <BottomNav />
    </main>
  );
}

function CoverPage({ members, onOpen }: { members: Profile[]; onOpen: (i: number) => void }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-0 md:grid-cols-2">
      <section className="book-page book-cover" aria-label={t('gallery.title')}>
        <p aria-hidden className="rune-strip text-center">ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ</p>
        <img src={CLAN_EMBLEM} alt="VIK Clan vintage emblem" className="mx-auto mt-4 w-full max-w-[280px] rounded-xl shadow-xl shadow-black/60" />
        <h2 className="font-display mt-4 text-center text-3xl tracking-wide text-brand-300">{t('gallery.title')}</h2>
        <div aria-hidden className="knot-divider mx-auto mt-3" />
        <p className="mt-3 text-center text-sm opacity-70">{t('gallery.subtitle', { n: members.length })}</p>
        <p aria-hidden className="rune-strip mt-6 text-center">ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ</p>
      </section>
      <nav className="book-page" aria-label={t('gallery.index')}>
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-brand-300">{t('gallery.index')}</h3>
        <ol className="mt-2 flex max-h-96 flex-col gap-1 overflow-y-auto">
          {members.map((m, i) => (
            <li key={m.id}>
              <button type="button" onClick={() => onOpen(i)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-sm hover:bg-white/5">
                <Avatar path={m.avatar_url} name={m.display_name ?? m.username} className="h-8 w-8 text-xs" />
                <span className="flex-1 truncate font-semibold">{m.known_name ?? m.display_name ?? m.username}</span>
                <span className="font-mono text-xs opacity-50">{String(i + 1).padStart(2, '0')}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

function WarriorSpread({ member }: { member: Profile }) {
  const { t, fmtDate } = useLocale();
  const careerQuery = useQuery({ queryKey: ['career', member.id], queryFn: () => getPlayerCareer(member.id), staleTime: 30_000 });
  const xpQuery = useQuery({ queryKey: ['xp', member.id], queryFn: () => getTotalXP(member.id), staleTime: 60_000 });
  const honoursQuery = useQuery({ queryKey: ['honours-for', member.id], queryFn: () => listHonoursFor(member.id) });
  const reignsQuery = useQuery({ queryKey: ['reigns'], queryFn: () => getReignHistory(50), staleTime: 60_000 });
  const mainName = member.known_name ?? member.efootball_name ?? member.display_name ?? member.username;
  const presence = presenceFor(member.last_login_at);
  const levelName = t(levelFor(xpQuery.data ?? 0).level.nameKey);
  const career = careerQuery.data;
  const total = (career?.wins ?? 0) + (career?.draws ?? 0) + (career?.losses ?? 0);
  const myReigns = (reignsQuery.data ?? []).filter((r) => r.holder_id === member.id);
  const defenses = myReigns.reduce((s, r) => s + (r.defenses ?? 0), 0);
  const isHolder = (reignsQuery.data ?? []).some((r) => r.holder_id === member.id && !r.ended_at);
  const country = parseCountry(member.country);

  return (
    <div className="grid gap-0 md:grid-cols-2">
      {/* Left page: the portrait */}
      <section className="book-page items-center text-center" aria-label={t('gallery.portraitOf', { name: mainName })}>
        <div className="relative mx-auto w-fit">
          <Avatar path={member.avatar_url} name={member.display_name ?? member.username} className="h-44 w-44 border-4 border-brand-500/60 text-5xl shadow-xl shadow-black/60" />
          <span className="absolute bottom-1 end-1"><PresenceDot status={presence} /></span>
        </div>
        {/vik/i.test(mainName) ? (
          <ScrambleName text={mainName} className="font-display mt-3 block truncate text-2xl tracking-wide text-brand-200" />
        ) : (
          <span className="font-display mt-3 block truncate text-2xl tracking-wide text-brand-200">{mainName}</span>
        )}
        <div aria-hidden className="knot-divider mx-auto mt-2" />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs opacity-80">
          <PresenceDot status={presence} showLabel />
          <span>• {member.role}</span>
          {country?.flag && <span>• {country.flag} {country.name}</span>}
        </div>
        {member.bio && <p className="mx-auto mt-3 max-w-xs whitespace-pre-line text-sm italic opacity-80">“{member.bio}”</p>}
        <p aria-hidden className="rune-strip mt-4 text-center">ᛟᛞᚨᛚ • ᚷᛖᛒᛟ • ᚺᚨᚷᚨᛚᚨᛉ</p>
      </section>

      {/* Right page: the saga */}
      <section className="book-page" aria-label={t('gallery.sagaOf', { name: mainName })}>
        <FadeIn>
          <h3 className="font-display text-sm uppercase tracking-[0.2em] text-brand-300">{t('gallery.saga')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[11px] uppercase opacity-60">{t('gallery.glory')}</p>
              <p className="font-display text-xl text-accent-400">{xpQuery.data ?? '—'}</p>
              <p className="text-[11px] opacity-70">{levelName}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-[11px] uppercase opacity-60">{t('gallery.record')}</p>
              <p className="font-display text-xl">{career ? `${career.wins}–${career.draws}–${career.losses}` : '—'}</p>
              <p className="text-[11px] opacity-70">{career ? `${career.winRate}%` : t('gallery.noBattles')}</p>
            </div>
          </div>
          {total > 0 && (
            <div className="mt-2 flex h-2 overflow-hidden rounded-full" role="img" aria-label={`${career?.wins ?? 0}W ${career?.draws ?? 0}D ${career?.losses ?? 0}L`}>
              <div className="bg-green-500" style={{ width: `${((career?.wins ?? 0) / total) * 100}%` }} />
              <div className="bg-zinc-500" style={{ width: `${((career?.draws ?? 0) / total) * 100}%` }} />
              <div className="flex-1 bg-red-500" />
            </div>
          )}

          <h4 className="font-display mt-3 text-xs uppercase tracking-[0.2em] text-brand-300">
            {t('gallery.thrones')} • {myReigns.length} {isHolder && `• 👑 ${t('throne.title')}`}
          </h4>
          <p className="text-xs opacity-70">
            {myReigns.length === 0 ? t('gallery.noThrones') : t('throne.defenses', { n: defenses })}
          </p>

          <h4 className="font-display mt-3 text-xs uppercase tracking-[0.2em] text-brand-300">
            {t('gallery.trophies')} • {(honoursQuery.data ?? []).length}
          </h4>
          {(honoursQuery.data ?? []).length === 0 ? (
            <p className="text-xs opacity-60">{t('gallery.noHonours')}</p>
          ) : (
            <ul className="mt-1 flex max-h-44 flex-col gap-1.5 overflow-y-auto">
              {(honoursQuery.data ?? []).map((h) => (
                <HonourRow key={h.id} honour={h} />
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] opacity-50">{t('profile.lastSeen', { when: member.last_login_at ? fmtDate(member.last_login_at) : t('profile.neverSeen') })}</p>
        </FadeIn>
      </section>
    </div>
  );
}

function HonourRow({ honour }: { honour: Honour }) {
  const { t, fmtDate } = useLocale();
  const imgQuery = useQuery({
    queryKey: ['badge-url', honour.id, honour.image_url],
    queryFn: () => getBadgeImageUrl(honour.image_url),
    enabled: !!honour.image_url,
    staleTime: 1000 * 60 * 60,
  });
  const img = imgQuery.data ?? null;
  return (
    <li className="flex items-center gap-2 rounded-xl bg-white/5 p-1.5 text-xs">
      {img ? (
        <img src={img} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <Emblem type={honour.type} className="h-10 w-12" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{honour.name}</span>
        <span className="opacity-60">{honour.type.replace(/_/g, ' ')} • {fmtDate(honour.awarded_at, false) ?? t('profile.neverSeen')}</span>
      </span>
    </li>
  );
}
