import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import { CLAN_EMBLEM } from '../components/emblem/Emblem';
import Icon from '../components/ui/Icon';
import { LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveMembers } from '../services/playerService';
import { getTotalXP, levelFor } from '../services/sagaService';
import { getAvatarUrl } from '../services/storageService';
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
  | { kind: 'back' }
  | { kind: 'grid'; members: Profile[] };

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
  // Card grids: 9 warriors per spread (5 left + 4 right on desktop,
  // all 9 stacked on mobile). Search filters the directory, not the book.
  const groups: Profile[][] = useMemo(() => {
    const out: Profile[][] = [];
    for (let i = 0; i < members.length; i += 9) out.push(members.slice(i, i + 9));
    return out;
  }, [members]);
  const flatPages: Sheet[] = useMemo(() => [
    { kind: 'cover' },
    ...groups.map((g): Sheet => ({ kind: 'grid', members: g })),
    ...(groups.length > 0 ? [{ kind: 'back' } as Sheet] : []),
  ], [groups]);
  // Desktop spreads pair grid halves so facing pages always belong together.
  const spreads: [Sheet | undefined, Sheet | undefined][] = useMemo(() => {
    const arr: [Sheet | undefined, Sheet | undefined][] = [[undefined, { kind: 'cover' } as Sheet]];
    for (const g of groups) {
      arr.push([
        { kind: 'grid', members: g.slice(0, 5) } as Sheet,
        { kind: 'grid', members: g.slice(5) } as Sheet,
      ]);
    }
    if (groups.length > 0) arr.push([{ kind: 'back' } as Sheet, undefined]);
    return arr;
  }, [groups]);
  const [spread, setSpread] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('vik-sound') !== '0';
    } catch {
      return true;
    }
  });
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('vik-bookmarks') ?? '[]');
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
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
  const maxSpread = Math.max(0, (wide ? spreads.length : flatPages.length) - 1);

  const shown = Math.min(spread, maxSpread);
  const canNext = shown < maxSpread;
  const canPrev = shown > 0;
  const queryClient = useQueryClient();

  // Warm the neighbors: prefetch adjacent spreads' avatars + levels so the
  // destination spread is already loaded when the turn animation lands.
  useEffect(() => {
    const near = [spreads[shown - 1], spreads[shown], spreads[shown + 1]].filter(Boolean);
    const ids = new Set<string>();
    for (const [l, r] of near) {
      for (const s of [l, r]) {
        if (s?.kind === 'grid') for (const m of s.members) ids.add(m.id);
      }
    }
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const id of ids) {
      const m = byId.get(id);
      if (!m) continue;
      if (m.avatar_url) {
        void queryClient.prefetchQuery({
          queryKey: ['avatar-path', m.avatar_url],
          queryFn: () => getAvatarUrl(m.avatar_url),
          staleTime: 1000 * 60 * 60,
        });
      }
      void queryClient.prefetchQuery({
        queryKey: ['xp', m.id],
        queryFn: () => getTotalXP(m.id),
        staleTime: 300_000,
      });
    }
  }, [shown, spreads, members, queryClient]);
  // Base always shows the destination; the leaf covers it mid-turn.
  const face = turn ? turn.from + (turn.dir === 'next' ? 1 : -1) : shown;
  // Desktop pairs two pages; mobile reads one page at a time (cell-b hidden).

  const finalize = useCallback((committed: boolean, to: number) => {
    cancelAnimationFrame(raf.current);
    phys.current.springTo = null;
    phys.current.vel = 0;
    phys.current.angle = 0;
    drag.current = null;
    if (committed) {
      playPageTurn();
      setSpread(Math.max(0, Math.min(maxSpread, to)));
    }
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
  const clampIdx = (i: number) => Math.max(0, Math.min(maxSpread, i));
  let leftSheet: Sheet | undefined;
  let rightSheet: Sheet | undefined;
  let leafSheet: Sheet | undefined;
  if (wide) {
    const cur = spreads[clampIdx(face)];
    if (!turn) {
      leftSheet = cur[0];
      rightSheet = cur[1];
    } else if (turn.dir === 'next') {
      leftSheet = spreads[turn.from][0];
      rightSheet = spreads[clampIdx(turn.from + 1)][1];
      leafSheet = spreads[turn.from][1];
    } else {
      leftSheet = spreads[clampIdx(turn.from - 1)][0];
      rightSheet = spreads[turn.from][1];
      leafSheet = spreads[turn.from][0];
    }
  } else {
    const baseL = !turn ? face : turn.dir === 'next' ? turn.from : face;
    leftSheet = flatPages[baseL];
    rightSheet = undefined;
    leafSheet = turn ? flatPages[turn.from] : undefined;
  }

  function toggleBookmark(id: string) {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id];
      writeBookmarks(next);
      return next;
    });
  }

  const isMarked = (id: string) => bookmarks.includes(id);

  function jumpToMember(id: string) {
    const gi = groups.findIndex((g) => g.some((m) => m.id === id));
    if (gi < 0) return;
    setSpread(1 + gi);
    setIndexOpen(false);
    setQuery('');
  }

  const visibleMembers = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const name = (m.known_name ?? m.display_name ?? m.username).toLowerCase();
    return name.includes(q) || m.username.toLowerCase().includes(q) || (m.efootball_name ?? '').toLowerCase().includes(q);
  });

  return (
    <main className="page page-book">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/clan" aria-label={t('nav.clan')} className="btn-ghost h-10 w-10 !px-0">‹</Link>
        <h1 className="font-display flex-1 text-xl tracking-wide">{t('gallery.title')}</h1>
        <button
          type="button"
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            toggleSoundSetting(next);
          }}
          aria-label={soundOn ? t('gallery.soundOn') : t('gallery.soundOff')}
          aria-pressed={soundOn}
          className="btn-ghost h-10 w-10 !px-0"
        >
          <Icon name={soundOn ? 'volume' : 'volumeX'} className="h-5 w-5" />
        </button>
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
                <div className="book-half cell-a"><PageView sheet={leftSheet} marked={isMarked} onToggle={toggleBookmark} /></div>
                <div className="book-spine" aria-hidden />
                <div className="book-half cell-b"><PageView sheet={wide ? rightSheet : undefined} marked={isMarked} onToggle={toggleBookmark} /></div>
                {turn && (
                  <Leaf dir={turn.dir} full={!wide} leafRef={leafRef} segRef={segRef} shadeRef={shadeRef} creaseRef={creaseRef}>
                    <PageView sheet={leafSheet} marked={isMarked} onToggle={toggleBookmark} />
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
            <div className="relative mt-2">
              <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('gallery.search')}
                aria-label={t('gallery.search')}
                className="input ps-9 text-sm"
              />
            </div>
            <ol className="mt-2 flex flex-col gap-1">
              {visibleMembers.map((m) => (
                <li key={m.id}>
                  <div className="toc-row">
                    <button
                      type="button"
                      onClick={() => jumpToMember(m.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    >
                      <Avatar path={m.avatar_url} name={m.display_name ?? m.username} className="h-9 w-9 text-xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{m.known_name ?? m.display_name ?? m.username}</span>
                        <span className="block text-[11px] opacity-60">{m.role}</span>
                      </span>
                      <span className="font-display text-sm opacity-60">{toRoman(members.findIndex((x) => x.id === m.id) + 1)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBookmark(m.id)}
                      aria-label={bookmarks.includes(m.id) ? t('gallery.bookmarkRemove') : t('gallery.bookmarkAdd')}
                      aria-pressed={bookmarks.includes(m.id)}
                      className="btn-ghost h-9 w-9 shrink-0 !px-0"
                    >
                      <Icon
                        name="bookmark"
                        className={`h-4 w-4 ${bookmarks.includes(m.id) ? 'fill-brand-400 text-brand-400' : 'opacity-60'}`}
                      />
                    </button>
                  </div>
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

// Page-turn whisper: tiny synthesized paper flick (WebAudio, no assets).
function playPageTurn() {
  try {
    if (localStorage.getItem('vik-sound') === '0') return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => void ctx.close().catch(() => {});
  } catch {
    /* silent */
  }
}

function toggleSoundSetting(next: boolean) {
  try {
    localStorage.setItem('vik-sound', next ? '1' : '0');
  } catch { /* ignore */ }
}

function writeBookmarks(ids: string[]) {
  try {
    localStorage.setItem('vik-bookmarks', JSON.stringify(ids));
  } catch { /* ignore */ }
}
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

function PageView({ sheet, marked, onToggle }: {
  sheet: Sheet | undefined;
  marked: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  if (!sheet) return <div className="book-page parchment book-blank" aria-hidden />;
  if (sheet.kind === 'cover') return <CoverPage />;
  if (sheet.kind === 'back') return <BackPage />;
  return <GridCards members={sheet.members} marked={marked} onToggle={onToggle} />;
}

function GridCards({ members, marked, onToggle }: {
  members: Profile[];
  marked: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useLocale();
  if (members.length === 0) return <div className="book-page parchment book-blank" aria-hidden />;
  return (
    <section className="book-page parchment" aria-label={t('gallery.title')}>
      <div className="grid grid-cols-3 gap-2" role="list">
        {members.map((m) => {
          const name = m.known_name ?? m.display_name ?? m.username;
          const isMarked = marked(m.id);
          return (
            <div key={m.id} role="listitem" className="war-card group relative rounded-xl border border-[#6b5320]/50 bg-[#14100b]/90 p-2 text-center">
              <span aria-hidden className="absolute start-1.5 top-1 text-[10px] text-brand-500/60 transition group-hover:text-brand-400">ᚱᚢᚾ</span>
              <button
                type="button"
                onClick={() => onToggle(m.id)}
                aria-label={isMarked ? t('gallery.bookmarkRemove') : t('gallery.bookmarkAdd')}
                aria-pressed={isMarked}
                className="absolute end-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40"
              >
                <Icon name="bookmark" className={`h-4 w-4 ${isMarked ? 'fill-brand-400 text-brand-400' : 'opacity-70'}`} />
              </button>
              <Link to={`/players/${m.id}`} className="flex flex-col items-center gap-1.5" aria-label={name}>
                <span className="relative">
                  <Avatar path={m.avatar_url} name={name} className="h-16 w-16 text-xl" />
                  <MemberLevelBadge memberId={m.id} />
                </span>
                <span className="font-display w-full truncate text-xs tracking-wide text-[#f3e6c2]">{name}</span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemberLevelBadge({ memberId }: { memberId: string }) {
  const { data } = useQuery({ queryKey: ['xp', memberId], queryFn: () => getTotalXP(memberId), staleTime: 300_000 });
  if (data == null) return null;
  const { level } = levelFor(data);
  return (
    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-brand-500/60 bg-[#12121f] px-1.5 py-px font-mono text-[10px] font-bold text-brand-300">
      Lvl {level.rank}
    </span>
  );
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
