import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveMembers } from '../services/playerService';
import { getTotalXP } from '../services/sagaService';
import { getAvatarUrl } from '../services/storageService';
import { playBookOpen } from '../utils/sfx';
import type { Profile } from '../types/database';

function toRoman(n: number): string {
  if (n <= 0) return '–';
  const table: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = Math.min(39, n);
  for (const [v, s] of table) while (rest >= v) { out += s; rest -= v; }
  return out + (n > 39 ? '+' : '');
}

function useWideBook() {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 768px)');
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export default function GalleryPage() {
  const { t } = useLocale();
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const members = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE');
  const wide = useWideBook();
  const half = Math.ceil(members.length / 2);
  const leftMembers = wide ? members.slice(0, half) : members;
  const rightMembers = members.slice(half);
  const [opened, setOpened] = useState(false);
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
  const queryClient = useQueryClient();

  useEffect(() => {
    const active = (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE');
    for (const m of active) {
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
  }, [membersQuery.data, queryClient]);

  useEffect(() => {
    if (!indexOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndexOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [indexOpen]);

  function openBook() {
    playBookOpen();
    setOpened(true);
  }

  function toggleBookmark(id: string) {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id];
      writeBookmarks(next);
      return next;
    });
  }

  function jumpToMember(id: string) {
    setIndexOpen(false);
    setQuery('');
    window.setTimeout(() => {
      const el = document.getElementById(`book-member-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
    }, 50);
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
      </div>

      <LoadingRegion loading={membersQuery.isLoading} label={t('common.loading')} skeleton="card">
        {members.length === 0 ? (
          <p className="card mt-3 text-sm opacity-70">{t('gallery.empty')}</p>
        ) : !opened ? (
          <div className="book-wrap">
            <button type="button" onClick={openBook} className="book-closed" aria-label={`${t('gallery.title')} — ${t('gallery.next')}`}>
              <img src="/book-cover.jpg" alt="" aria-hidden className="book-closed-img" />
            </button>
            <button type="button" onClick={openBook} className="btn-ghost mt-3 flex h-11 w-full items-center justify-center text-sm">
              {t('gallery.next')} ›
            </button>
          </div>
        ) : (
          <div className="book-wrap">
            <div
              role="region"
              aria-label={t('gallery.title')}
              aria-roledescription="book"
              className="book"
            >
              <div className="book-spread">
                <div className="book-half cell-a"><GridCards members={leftMembers} /></div>
                <div className="book-spine" aria-hidden />
                {wide && <div className="book-half cell-b"><GridCards members={rightMembers} /></div>}
              </div>
              <div className="book-foreedge" aria-hidden />
            </div>

            <button type="button" onClick={() => setIndexOpen(true)} className="btn-ghost mt-3 flex h-11 w-full items-center justify-center gap-2 text-sm" aria-label={t('gallery.index')} aria-haspopup="dialog">
              <Icon name="scroll" className="h-5 w-5" />
              {t('gallery.index')}
            </button>
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

function GridCards({ members }: {
  members: Profile[];
}) {
  const { t } = useLocale();
  if (members.length === 0) return <div className="book-page parchment book-blank" aria-hidden />;
  return (
    <section className="book-page parchment" aria-label={t('gallery.title')}>
      <div className="book-cards grid flex-1 grid-cols-3 content-start gap-2.5" role="list">
        {members.map((m) => {
          const name = m.known_name ?? m.display_name ?? m.username;
          return (
            <div key={m.id} id={`book-member-${m.id}`} role="listitem" className="war-card group relative rounded-xl p-2 text-center">
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
