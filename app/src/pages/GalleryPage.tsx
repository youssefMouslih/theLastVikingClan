import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Emblem, { CLAN_EMBLEM } from '../components/emblem/Emblem';
import Icon from '../components/ui/Icon';
import { FadeIn, LoadingRegion } from '../components/ui/Motion';
import PresenceDot, { presenceFor } from '../components/ui/PresenceDot';
import ScrambleName from '../components/ui/ScrambleName';
import { socialLink } from '../components/player/PlayerCard';
import { useLocale } from '../i18n/LocaleContext';
import { parseCountry } from '../utils/countries';
import { listActiveMembers } from '../services/playerService';
import { getTotalXP, levelFor } from '../services/sagaService';
import { getReignHistory } from '../services/throneService';
import { getRatingSummary } from '../services/ratingService';
import { listHonoursFor, type Honour } from '../services/honourService';
import { getAvatarUrl, getBadgeImageUrl } from '../services/storageService';
import type { Profile } from '../types/database';

// The Clan Member Book: a real paged book. Sheets run
// [cover, (achieve, photo, info) × N, laws, back] and every turn flips ONE
// page hinged exactly at the center spine (desktop) or pad edge (mobile).
// The leaf is segmented — its outer half curls extra mid-turn — with travelling
// light, crease shadow, edge thickness and a rune-parchment back, driven by
// heavy-paper spring physics through refs (zero React renders mid-gesture).
// All content (achievements, rating, socials, laws) is real app data.
type Sheet =
  | { kind: 'cover' }
  | { kind: 'laws' }
  | { kind: 'back' }
  | { kind: 'photo'; member: Profile }
  | { kind: 'info'; member: Profile };

interface Turn {
  dir: 'next' | 'prev';
  from: number;
}

function toRoman(n: number): string {
  if (n <= 0) return '–';
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = Math.min(39, n);
  for (const [v, s] of table) while (rest >= v) { out += s; rest -= v; }
  return out + (n > 39 ? '+' : '');
}

const COVER_YEAR = new Date().getFullYear();

export default function GalleryPage() {
  const { t } = useLocale();
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const members = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE');
  const sheets: Sheet[] = useMemo(() => [
    { kind: 'cover' },
    ...members.flatMap((member) => [
      { kind: 'photo' as const, member },
      { kind: 'info' as const, member },
    ]),
    ...(members.length > 0 ? [{ kind: 'laws' as const }, { kind: 'back' as const }] : []),
  ], [members]);
  const maxSpread = Math.max(0, sheets.length - 2);
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const spreadRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const creaseRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; lastX: number; lastT: number; dir: 'next' | 'prev'; target: number } | null>(null);
  const phys = useRef({ angle: 0, vel: 0, springTo: null as null | 0 | 1 });
  const raf = useRef(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wide = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 768px)').matches;

  const shown = Math.min(spread, maxSpread);
  const canNext = shown < maxSpread;
  const canPrev = shown > 0;
  // Base always shows the destination; the leaf covers it mid-turn.
  const face = turn ? turn.from + (turn.dir === 'next' ? 1 : -1) : shown;
  // Desktop pairs two pages; mobile reads one page at a time (cell-b hidden).

  const finalize = useCallback((committed: boolean, to: number) => {
    cancelAnimationFrame(raf.current);
    phys.current.springTo = null;
    phys.current.vel = 0;
    phys.current.angle = 0;
    drag.current = null;
    if (committed) setSpread(Math.max(0, Math.min(maxSpread, to)));
    setTurn(null);
  }, [maxSpread]);

  // Paint leaf angle + curl + travelling light straight to the DOM.
  const paint = useCallback((turnDir: 'next' | 'prev', deg: number) => {
    const sign = turnDir === 'next' ? -1 : 1;
    const leaf = leafRef.current;
    if (leaf) {
      const p = Math.min(1, Math.max(0, deg / 180));
      const lift = 14 * Math.sin(p * Math.PI);
      leaf.style.transform = `rotateY(${sign * deg}deg) translateZ(${lift}px)`;
    }
    const bend = 26 * Math.sin(Math.min(1, Math.max(0, deg / 180)) * Math.PI);
    const seg = segRef.current;
    if (seg) seg.style.transform = `rotateY(${sign * bend}deg)`;
    const crease = creaseRef.current;
    if (crease) crease.style.opacity = String((bend / 26) * 0.55);
    const shade = shadeRef.current;
    if (shade) {
      const p = Math.min(1, Math.max(0, deg / 180));
      const glow = Math.sin(p * Math.PI);
      const at = turnDir === 'next' ? (1 - p) * 100 : p * 100;
      shade.style.opacity = String(0.08 + glow * 0.3);
      shade.style.background =
        `linear-gradient(90deg, rgba(0,0,0,${0.45 * glow}), rgba(255,244,220,${0.12 * glow}) ${at}%,` +
        ` rgba(0,0,0,${0.45 * glow}))`;
    }
  }, []);

  // Heavy-paper physics: slow, deliberate, velocity-scaled (buttons ~800ms,
  // normal swipe ~600-750ms, hard throw ~450-600ms). Zero setState inside.
  const turnActive = turn !== null;
  useEffect(() => {
    if (!turnActive || reduced) return;
    const dir = turn!.dir;
    const from = turn!.from;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const d = drag.current;
      const p = phys.current;
      if (d) {
        p.angle += (d.target - p.angle) * Math.min(1, dt * 30);
        p.vel = 0;
        paint(dir, p.angle);
      } else if (p.springTo !== null) {
        const accel = 55 * (p.springTo * 180 - p.angle) - 13.5 * p.vel;
        p.vel += accel * dt;
        p.angle += p.vel * dt;
        paint(dir, p.angle);
        if (Math.abs(p.vel) < 6 && Math.abs(p.springTo * 180 - p.angle) < 1) {
          const done = p.springTo === 1;
          const dest = from + (dir === 'next' ? 1 : -1);
          requestAnimationFrame(() => finalize(done, dest));
          return;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnActive, reduced]);

  const startTurn = useCallback((dir: 'next' | 'prev') => {
    if (turn) return;
    const ok = dir === 'next' ? canNext : canPrev;
    if (!ok) return;
    const to = shown + (dir === 'next' ? 1 : -1);
    if (reduced) {
      setSpread(to);
      return;
    }
    phys.current.angle = 0;
    phys.current.vel = 0;
    phys.current.springTo = 1;
    setTurn({ dir, from: shown });
  }, [turn, canNext, canPrev, reduced, shown]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (indexOpen) {
        if (e.key === 'Escape') setIndexOpen(false);
        return;
      }
      if (e.key === 'ArrowRight') startTurn('next');
      if (e.key === 'ArrowLeft') startTurn('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startTurn, indexOpen]);

  function leafWidth(): number {
    const w = spreadRef.current?.clientWidth ?? 320;
    return wide ? w / 2 : w;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (turn) return;
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, lastX: e.clientX, lastT: performance.now(), dir: 'next', target: 0 };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || turn) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) < 8) return;
    const dir = dx < 0 ? 'next' : 'prev';
    const ok = dir === 'next' ? canNext : canPrev;
    const raw = Math.min(180, Math.abs(dx) / (leafWidth() * 0.65) * 180);
    d.dir = dir;
    d.lastX = e.clientX;
    d.lastT = performance.now();
    d.target = ok ? raw : raw * 0.15;
    setTurn({ dir, from: shown });
  }
  function endDrag(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !turn) {
      drag.current = null;
      return;
    }
    const dt = Math.max(1, performance.now() - d.lastT);
    const velocity = Math.min(900, (Math.abs(e.clientX - d.lastX) / dt) * 1000 * (180 / (leafWidth() * 0.65)));
    const ok = turn.dir === 'next' ? canNext : canPrev;
    const progress = d.target / 180;
    drag.current = null;
    if (reduced) {
      finalize(ok && d.target > 45, shown + (turn.dir === 'next' ? 1 : -1));
      return;
    }
    const snap = ok && (progress > 0.32 || velocity > 500) ? 1 : 0;
    phys.current.vel = snap === 1 ? velocity * 0.5 : 0;
    phys.current.springTo = snap as 0 | 1;
  }

  // Base pages during a turn: the half under the leaf keeps the OUTGOING page
  // (spine side stays put on desktop); the other half already shows incoming.
  // The leaf itself always carries the outgoing page — nothing ever pops.
  const baseL = !turn ? face : turn.dir === 'next' ? turn.from : face;
  const baseR = !turn ? face + 1 : turn.dir === 'next' ? turn.from + 2 : turn.from + 1;
  const leafSheetIdx = turn ? (turn.dir === 'next' ? (wide ? turn.from + 1 : turn.from) : turn.from) : -1;

  return (
    <main className="page page-book">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/clan" aria-label={t('nav.clan')} className="btn-ghost h-10 w-10 !px-0">‹</Link>
        <h1 className="font-display flex-1 text-xl tracking-wide">{t('gallery.title')}</h1>
        {members.length > 0 && (
          <span className="font-mono text-xs tabular-nums opacity-60" aria-live="polite">
            {t('gallery.pageOf', { n: face + 1, total: maxSpread + 1 })}
          </span>
        )}
      </div>

      <LoadingRegion loading={membersQuery.isLoading} label={t('common.loading')} skeleton="card">
        {members.length === 0 ? (
          <p className="card mt-3 text-sm opacity-70">{t('gallery.empty')}</p>
        ) : (
          <div className="book-wrap">
            <div
              ref={spreadRef}
              role="region"
              aria-label={t('gallery.title')}
              aria-roledescription="book"
              className="book"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={() => { drag.current = null; if (turn) finalize(false, shown); }}
            >
              <div className="book-spread">
                <div className="book-half cell-a"><PageView sheet={sheets[baseL]} /></div>
                <div className="book-spine" aria-hidden />
                <div className="book-half cell-b"><PageView sheet={wide ? sheets[baseR] : undefined} /></div>
                {turn && (
                  <Leaf dir={turn.dir} full={!wide} leafRef={leafRef} segRef={segRef} shadeRef={shadeRef} creaseRef={creaseRef}>
                    <PageView sheet={sheets[leafSheetIdx]} />
                  </Leaf>
                )}
              </div>
              <div className="book-foreedge" aria-hidden />
              <p className="book-folio" aria-hidden>{face + 1} · {maxSpread + 1}</p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => startTurn('prev')} disabled={!canPrev || !!turn} className="btn-ghost h-11 flex-1 text-sm">
                ‹ {t('gallery.prev')}
              </button>
              <button type="button" onClick={() => setIndexOpen(true)} disabled={!!turn} className="btn-ghost h-11 px-4 text-sm" aria-label={t('gallery.index')} aria-haspopup="dialog">
                <Icon name="scroll" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => startTurn('next')} disabled={!canNext || !!turn} className="btn-ghost h-11 flex-1 text-sm">
                {t('gallery.next')} ›
              </button>
            </div>
            <p className="mt-1 text-center text-xs opacity-50">{t('gallery.turnHint')}</p>
          </div>
        )}
      </LoadingRegion>

      {indexOpen && (
        <div role="dialog" aria-modal="true" aria-label={t('gallery.index')} className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 md:items-center" onClick={() => setIndexOpen(false)}>
          <nav aria-label={t('gallery.index')} className="toc-panel max-h-[70vh] w-full max-w-sm overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm uppercase tracking-[0.2em]">{t('gallery.index')}</h2>
              <button type="button" onClick={() => setIndexOpen(false)} aria-label={t('common.close')} className="btn-ghost h-10 w-10 !px-0">✕</button>
            </div>
            <ol className="mt-2 flex flex-col gap-1">
              {members.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { setSpread(1 + i * 2); setIndexOpen(false); }}
                    className="toc-row"
                  >
                    <Avatar path={m.avatar_url} name={m.display_name ?? m.username} className="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1 text-start">
                      <span className="block truncate font-semibold">{m.known_name ?? m.display_name ?? m.username}</span>
                      <span className="block text-[11px] opacity-60">{m.role}</span>
                    </span>
                    <span className="font-display text-sm opacity-60">{toRoman(i + 1)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      )}
      <BottomNav />
    </main>
  );
}

// Turning leaf: ONE page hinged exactly at the spine (desktop halves) or the
// pad edge (mobile full page). Inner segment turns with the leaf; the outer
// segment curls extra mid-turn for paper bend. Back = rune parchment.
function Leaf({ dir, full, leafRef, segRef, shadeRef, creaseRef, children }: {
  dir: 'next' | 'prev';
  full: boolean;
  leafRef: React.RefObject<HTMLDivElement | null>;
  segRef: React.RefObject<HTMLDivElement | null>;
  shadeRef: React.RefObject<HTMLDivElement | null>;
  creaseRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const flip = dir === 'prev' ? ' flip' : '';
  const span = full ? 'leaf-full' : dir === 'next' ? 'leaf-half-r' : 'leaf-half-l';
  const hinge = dir === 'next' ? 'hinge-l' : 'hinge-r';
  const edge = dir === 'next' ? 'edge-r' : 'edge-l';
  return (
    <div aria-hidden ref={leafRef} className={`book-leaf ${span} ${hinge}${flip}`}>
      <div className="seg seg-in"><div className="cut">{children}</div></div>
      <div ref={segRef} className="seg seg-out"><div className="cut cut-r">{children}</div></div>
      <div className="book-leaf-face book-leaf-back">
        <section className="book-page parchment items-center justify-center text-center">
          <img src={CLAN_EMBLEM} alt="" className="mx-auto w-full max-w-[220px] rounded-xl opacity-90" />
          <p className="rune-strip mt-4 text-center">ᛟ ᛞ ᚨ ᛚ</p>
        </section>
      </div>
      <div ref={creaseRef} className="seg-crease" style={{ opacity: 0 }} />
      <div className={`leaf-edge ${edge}`} aria-hidden />
      <div ref={shadeRef} className="book-leaf-shade" style={{ opacity: 0.08 }} />
    </div>
  );
}

function PageView({ sheet }: { sheet: Sheet | undefined }) {
  if (!sheet) return <div className="book-page parchment book-blank" aria-hidden />;
  if (sheet.kind === 'cover') return <CoverPage />;
  if (sheet.kind === 'laws') return <LawsPage />;
  if (sheet.kind === 'back') return <BackPage />;
  if (sheet.kind === 'photo') return <MemberPhotoPage member={sheet.member} />;
  return <MemberInfoPage member={sheet.member} />;
}

function CoverPage() {
  const { t } = useLocale();
  const year = COVER_YEAR;
  return (
    <section className="book-page leather items-center justify-center text-center" aria-label={t('dir.title')}>
      <div aria-hidden className="leather-frame" />
      <img src={CLAN_EMBLEM} alt="VIK Clan vintage emblem" className="mx-auto w-full max-w-[240px] rounded-xl shadow-2xl shadow-black/70" />
      <p className="doc-eyebrow mt-5 text-[#e8d9b0]">{t('dir.org')}</p>
      <h2 className="font-display mt-2 text-3xl tracking-wide text-[#f3e6c2]">{t('dir.coverMembers')}</h2>
      <p className="font-display mt-1 text-base opacity-70">{year}</p>
      <div aria-hidden className="mx-auto mt-4 h-px w-28 bg-[#e8d9b0]/50" />
      <p className="mt-4 text-[11px] uppercase tracking-[0.25em] text-[#e8d9b0]/80">{t('dir.coverMotto')}</p>
    </section>
  );
}

function BackPage() {
  const { t } = useLocale();
  return (
    <section className="book-page leather items-center justify-center text-center" aria-label={t('dir.title')}>
      <div aria-hidden className="leather-frame" />
      <p className="doc-eyebrow text-[#e8d9b0]">{t('dir.org')}</p>
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[#e8d9b0]/75">{t('dir.taglineA')}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#e8d9b0]/75">{t('dir.taglineB')}</p>
    </section>
  );
}

function LawsPage() {
  const { t } = useLocale();
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  return (
    <section className="book-page parchment laws-page" aria-label={t('code.lawsTitle')}>
      <p className="doc-eyebrow">{t('dir.org')}</p>
      <h3 className="font-display mt-1 text-xl tracking-wide">{t('code.lawsTitle')}</h3>
      <div aria-hidden className="doc-rule mt-2" />
      <ol className="mt-2 flex flex-col gap-2 overflow-y-auto">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <li key={n} className="flex gap-2.5">
            <span className="font-display w-8 shrink-0 text-lg text-[#6b5320]">{numerals[n - 1]}</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{t(`code.l${n}t` as 'code.l1t')}</span>
              <span className="block text-xs opacity-75">{t(`code.l${n}x` as 'code.l1x')}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MemberPhotoPage({ member }: { member: Profile }) {
  const { t } = useLocale();
  const avatarQuery = useQuery({
    queryKey: ['avatar', member.id, member.avatar_url],
    queryFn: () => getAvatarUrl(member.avatar_url),
    enabled: !!member.avatar_url,
    staleTime: 1000 * 60 * 60,
  });
  const avatar = avatarQuery.data ?? null;
  const name = member.known_name ?? member.display_name ?? member.username;
  const sub = member.display_name && member.display_name !== member.known_name
    ? member.display_name
    : (member.efootball_name ?? member.role);
  const presence = presenceFor(member.last_login_at);
  return (
    <section className="book-page parchment photo-page" aria-label={t('gallery.portraitOf', { name })}>
      <div className="photo-frame">
        <div className="photo-hero">
          {avatar ? (
            <img src={avatar} alt="" className="photo-hero-img aged-photo" />
          ) : (
            <div aria-hidden className="photo-hero-fallback">
              {(member.display_name ?? member.username).slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="absolute bottom-3 end-3"><PresenceDot status={presence} /></span>
        </div>
      </div>
      <div className="photo-caption">
        {/vik/i.test(name) ? (
          <ScrambleName text={name} className="font-display block truncate text-2xl tracking-wide" />
        ) : (
          <span className="font-display block truncate text-2xl tracking-wide">{name}</span>
        )}
        <span className="mt-0.5 block truncate text-sm opacity-70">{sub}</span>
      </div>
    </section>
  );
}

function MemberInfoPage({ member }: { member: Profile }) {
  const { t, fmtDate } = useLocale();
  const ratingQuery = useQuery({ queryKey: ['rating-book', member.id], queryFn: () => getRatingSummary(member.id), staleTime: 60_000 });
  const xpQuery = useQuery({ queryKey: ['xp', member.id], queryFn: () => getTotalXP(member.id), staleTime: 60_000 });
  const honoursQuery = useQuery({ queryKey: ['honours-for', member.id], queryFn: () => listHonoursFor(member.id) });
  const reignsQuery = useQuery({ queryKey: ['reigns'], queryFn: () => getReignHistory(50), staleTime: 60_000 });
  const name = member.known_name ?? member.display_name ?? member.username;
  const levelName = t(levelFor(xpQuery.data ?? 0).level.nameKey);
  const country = parseCountry(member.country);
  const phone = (member.whatsapp ?? '').replace(/[^\d+]/g, '');
  const socials: { key: string; label: string; href: string; icon: 'chat' | 'instagram' | 'tiktok' | 'kick' }[] = [];
  if (phone) socials.push({ key: 'wa', label: 'WhatsApp', href: `https://wa.me/${phone.replace(/\D/g, '')}`, icon: 'chat' });
  const ig = socialLink('instagram', member.instagram);
  const tk = socialLink('tiktok', member.tiktok);
  const kk = socialLink('kick', member.kick);
  if (ig) socials.push({ key: 'ig', label: 'Instagram', href: ig, icon: 'instagram' });
  if (tk) socials.push({ key: 'tk', label: 'TikTok', href: tk, icon: 'tiktok' });
  if (kk) socials.push({ key: 'kk', label: 'Kick', href: kk, icon: 'kick' });
  const honours = honoursQuery.data ?? [];
  const myReigns = (reignsQuery.data ?? []).filter((r) => r.holder_id === member.id);
  const defenses = myReigns.reduce((s, r) => s + (r.defenses ?? 0), 0);
  const isHolder = (reignsQuery.data ?? []).some((r) => r.holder_id === member.id && !r.ended_at);
  const distinctions: string[] = [];
  if (isHolder) distinctions.push(`${t('throne.title')} • ${t('throne.defenses', { n: defenses })}`);
  for (const h of honours.filter((h) => /CHAMPION|MVP/.test(h.type))) distinctions.push(h.name);

  return (
    <section className="book-page parchment info-scroll" aria-label={name}>
      <FadeIn>
        <p className="doc-eyebrow">{t('dir.profile')}</p>
        <h3 className="font-display mt-1 truncate text-2xl tracking-wide">{name}</h3>
        <p className="mt-0.5 text-sm opacity-70">{member.role}{country ? ` • ${country.name}` : ''} • {xpQuery.data ?? 0} XP • {levelName}</p>
        <div aria-hidden className="doc-rule mt-3" />

        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="doc-row">
            <dt>{t('dir.location')}</dt>
            <dd>{country ? `${country.flag} ${country.name}` : '—'}</dd>
          </div>
          {phone && (
            <div className="doc-row">
              <dt>{t('dir.contact')}</dt>
              <dd dir="ltr"><a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="doc-link">{phone}</a></dd>
            </div>
          )}
          <div className="doc-row">
            <dt>{t('dir.thrones')}</dt>
            <dd className="font-display tracking-widest">{toRoman(myReigns.length)}{myReigns.length > 0 ? ` • ${t('throne.defenses', { n: defenses })}${isHolder ? ' • 👑' : ''}` : ''}</dd>
          </div>
        </dl>

        {member.bio && (
          <>
            <h4 className="doc-h">{t('dir.about')}</h4>
            <p className="mt-1 whitespace-pre-line font-serif text-[15px] leading-relaxed opacity-90">{member.bio}</p>
          </>
        )}

        <h4 className="doc-h">{t('dir.rating')}</h4>
        <ClanStars rating={ratingQuery.data} />

        {socials.length > 0 && (
          <>
            <h4 className="doc-h">{t('dir.social')}</h4>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {socials.map((s) => (
                <a key={s.key} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="social-btn">
                  <Icon name={s.icon} className="h-5 w-5" /> {s.label}
                </a>
              ))}
            </div>
          </>
        )}

        {honours.length > 0 && (
          <>
            <h4 className="doc-h">{t('dir.honours')} • {honours.length}</h4>
            <ul className="mt-1.5 grid grid-cols-4 gap-1.5">
              {honours.slice(0, 8).map((h) => (
                <HonourThumb key={h.id} honour={h} />
              ))}
            </ul>
          </>
        )}

        {distinctions.length > 0 && (
          <>
            <h4 className="doc-h">{t('dir.distinctions')}</h4>
            <ul className="mt-1 flex flex-col gap-1">
              {distinctions.map((d) => (
                <li key={d} className="flex items-center gap-2 text-xs font-semibold">
                  <Icon name="medal" className="h-4 w-4 shrink-0 text-[#6b5320]" /> {d}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-[11px] opacity-50">{t('profile.lastSeen', { when: member.last_login_at ? fmtDate(member.last_login_at) : t('profile.neverSeen') })}</p>
      </FadeIn>
    </section>
  );
}

function ClanStars({ rating }: { rating?: { overall: number | null; count: number } }) {
  const { t } = useLocale();
  const value = rating?.overall ?? null;
  const count = rating?.count ?? 0;
  if (value == null || count === 0) return <p className="mt-1 text-sm opacity-60">{t('profile.rateNone')}</p>;
  return (
    <div className="mt-1">
      <div className="stars" role="img" aria-label={`${value} / 5`}>
        <span aria-hidden>★★★★★</span>
        <span aria-hidden className="stars-fill" style={{ width: `${(value / 5) * 100}%` }}>★★★★★</span>
      </div>
      <p className="mt-0.5 text-sm font-bold">{value} / 5 <span className="font-normal opacity-60">• {t('dir.ratedBy', { n: count })}</span></p>
    </div>
  );
}

function HonourThumb({ honour }: { honour: Honour }) {
  const imgQuery = useQuery({
    queryKey: ['badge-url', honour.id, honour.image_url],
    queryFn: () => getBadgeImageUrl(honour.image_url),
    enabled: !!honour.image_url,
    staleTime: 1000 * 60 * 60,
  });
  const img = imgQuery.data ?? null;
  return (
    <li title={honour.name}>
      {img ? (
        <img src={img} alt="" className="h-12 w-12 rounded-lg object-cover" />
      ) : (
        <Emblem type={honour.type} className="h-12 w-14" />
      )}
    </li>
  );
}
