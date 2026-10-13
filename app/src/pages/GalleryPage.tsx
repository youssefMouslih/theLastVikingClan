import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveMembers } from '../services/playerService';
import { getTotalXP } from '../services/sagaService';
import { getAvatarUrl } from '../services/storageService';
import { playBookOpen, playPageTurn } from '../utils/sfx';
import type { Profile } from '../types/database';

// The Clan Member Book. Page-turn animation is parked for now: navigation
// swaps spread content instantly (buttons, swipe, keys, index) until the
// leaf animation is reworked.
type Sheet =
  | { kind: 'cover' }
  | { kind: 'back' }
  | { kind: 'grid'; members: Profile[] };

function toRoman(n: number): string {
  if (n <= 0) return '–';
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = Math.min(39, n);
  for (const [v, s] of table) while (rest >= v) { out += s; rest -= v; }
  return out + (n > 39 ? '+' : '');
}

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
    ...groups.map((g): Sheet => ({ kind: 'grid', members: g })),
    ...(groups.length > 0 ? [{ kind: 'back' } as Sheet] : []),
  ], [groups]);
  // Desktop spreads pair grid halves so facing pages always belong together.
  // No open-book cover spread: opening the closed cover lands on members.
  const spreads: [Sheet | undefined, Sheet | undefined][] = useMemo(() => {
    const arr: [Sheet | undefined, Sheet | undefined][] = [];
    for (const g of groups) {
      arr.push([
        { kind: 'grid', members: g.slice(0, 5) } as Sheet,
        { kind: 'grid', members: g.slice(5) } as Sheet,
      ]);
    }
    if (groups.length > 0) arr.push([{ kind: 'back' } as Sheet, undefined]);
    return arr;
  }, [groups]);
  const [spread, setSpread] = useState(-1);
  const [indexOpen, setIndexOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('vik-bookmarks') ?? '[]');
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const spreadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number } | null>(null);
  const wide = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 768px)').matches;
  const maxSpread = Math.max(0, (wide ? spreads.length : flatPages.length) - 1);

  // Spread -1 = closed book (front cover only). Opening goes to spread 0,
  // going back past the cover closes it again.
  const shown = Math.max(-1, Math.min(spread, maxSpread));
  const canNext = shown < maxSpread;
  const canPrev = shown > -1;
  const queryClient = useQueryClient();

  // Warm the neighbors: prefetch adjacent spreads' avatars + levels so the
  // destination spread is already loaded when navigation lands.
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
  const goTo = useCallback((to: number) => {
    setSpread(Math.max(-1, Math.min(maxSpread, to)));
  }, [maxSpread]);

  const startTurn = useCallback((dir: 'next' | 'prev') => {
    const ok = dir === 'next' ? canNext : canPrev;
    if (!ok) return;
    // Opening the closed book unsheathes swords; page moves flick paper.
    if (shown < 0 && dir === 'next') playBookOpen();
    else playPageTurn();
    goTo(shown + (dir === 'next' ? 1 : -1));
  }, [canNext, canPrev, goTo, shown]);

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

  // Swipe swaps content instantly past a small threshold (no animation for now).
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return;
    drag.current = { startX: e.clientX };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) < 60) return;
    drag.current = null;
    startTurn(dx < 0 ? 'next' : 'prev');
  }
  function endDrag() {
    drag.current = null;
  }

  const clampIdx = (i: number) => Math.max(0, Math.min(maxSpread, i));
  let leftSheet: Sheet | undefined;
  let rightSheet: Sheet | undefined;
  if (wide) {
    const cur = spreads[clampIdx(shown)];
    leftSheet = cur?.[0];
    rightSheet = cur?.[1];
  } else {
    leftSheet = flatPages[shown];
    rightSheet = undefined;
  }

  function toggleBookmark(id: string) {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id];
      writeBookmarks(next);
      return next;
    });
  }

  function jumpToMember(id: string) {
    const gi = groups.findIndex((g) => g.some((m) => m.id === id));
    if (gi < 0) return;
    playPageTurn();
    setSpread(gi);
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
        {members.length > 0 && shown >= 0 && (
          <span className="font-mono text-xs tabular-nums opacity-60" aria-live="polite">
            {t('gallery.pageOf', { n: shown + 1, total: maxSpread + 1 })}
          </span>
        )}
      </div>

      <LoadingRegion loading={membersQuery.isLoading} label={t('common.loading')} skeleton="card">
        {members.length === 0 ? (
          <p className="card mt-3 text-sm opacity-70">{t('gallery.empty')}</p>
        ) : shown < 0 ? (
          <div className="book-wrap">
            <button type="button" onClick={() => startTurn('next')} className="book-closed" aria-label={`${t('gallery.title')} — ${t('gallery.next')}`}>
              <img src="/book-cover.jpg" alt="" aria-hidden className="book-closed-img" />
            </button>
            <button type="button" onClick={() => startTurn('next')} className="btn-ghost mt-3 flex h-11 w-full items-center justify-center text-sm">
              {t('gallery.next')} ›
            </button>
          </div>
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
              onPointerCancel={endDrag}
            >
              <div className="book-spread">
                <div className="book-half cell-a"><PageView sheet={leftSheet} /></div>
                <div className="book-spine" aria-hidden />
                <div className="book-half cell-b"><PageView sheet={wide ? rightSheet : undefined} /></div>
              </div>
              <div className="book-foreedge" aria-hidden />
              <p className="book-folio" aria-hidden>{shown + 1} · {maxSpread + 1}</p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => startTurn('prev')} disabled={!canPrev} className="btn-ghost h-11 flex-1 text-sm">
                ‹ {t('gallery.prev')}
              </button>
              <button type="button" onClick={() => setIndexOpen(true)} className="btn-ghost h-11 px-4 text-sm" aria-label={t('gallery.index')} aria-haspopup="dialog">
                <Icon name="scroll" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => startTurn('next')} disabled={!canNext} className="btn-ghost h-11 flex-1 text-sm">
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

function writeBookmarks(ids: string[]) {
  try {
    localStorage.setItem('vik-bookmarks', JSON.stringify(ids));
  } catch { /* ignore */ }
}
function PageView({ sheet }: {
  sheet: Sheet | undefined;
}) {
  if (!sheet) return <div className="book-page parchment book-blank" aria-hidden />;
  if (sheet.kind === 'cover') return <CoverPage />;
  if (sheet.kind === 'back') return <BackPage />;
  return <GridCards members={sheet.members} />;
}

function GridCards({ members }: {
  members: Profile[];
}) {
  const { t } = useLocale();
  if (members.length === 0) return <div className="book-page parchment book-blank" aria-hidden />;
  return (
    <section className="book-page parchment" aria-label={t('gallery.title')}>
      <div className="grid flex-1 grid-cols-3 content-start gap-2.5" role="list">
        {members.map((m) => {
          const name = m.known_name ?? m.display_name ?? m.username;
          return (
              <div key={m.id} role="listitem" className="war-card group relative rounded-xl p-2 text-center">
                <span aria-hidden className="absolute start-1.5 top-1 text-[10px] text-[#6b5320]/70 transition group-hover:text-[#6b5320]">ᚱᚢᚾ</span>
                <Link to={`/players/${m.id}`} className="flex h-full flex-col items-center gap-1.5" aria-label={name}>
                  <Avatar path={m.avatar_url} name={name} className="h-16 w-16 text-xl" />
                  <span className="font-display w-full truncate text-xs tracking-wide">{name}</span>
                </Link>
              </div>
          );
        })}
      </div>
    </section>
  );
}

function CoverPage() {
  const { t } = useLocale();
  return (
    <section className="book-cover-art" aria-label={t('dir.title')}>
      <img src="/book-cover.jpg" alt="The Last Vikings — clan book cover" className="book-cover-img" />
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
