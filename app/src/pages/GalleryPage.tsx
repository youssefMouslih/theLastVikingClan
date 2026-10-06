import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import Avatar from '../components/ui/Avatar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { SkeletonList } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveMembers } from '../services/playerService';

const PAGE_SIZE = 9;

// Clan Member Wall: every warrior as a photo card — photo above,
// VIK name below. Tap a card to open the player's profile.
export default function GalleryPage() {
  const { t } = useLocale();
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [bookmarks, setBookmarks] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('vik-bookmarks') ?? '[]');
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  const members = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === 'ACTIVE'),
    [membersQuery.data],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? members.filter((m) => {
          const name = (m.known_name ?? m.display_name ?? m.username).toLowerCase();
          return name.includes(q) || m.username.toLowerCase().includes(q) || (m.efootball_name ?? '').toLowerCase().includes(q);
        })
      : members;
    return [...list].sort((a, b) => {
      const ab = bookmarks.includes(a.id) ? 0 : 1;
      const bb = bookmarks.includes(b.id) ? 0 : 1;
      return ab - bb;
    });
  }, [members, query, bookmarks]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const cards = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function toggleBookmark(id: string) {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id];
      try {
        localStorage.setItem('vik-bookmarks', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }

  function onSearch(v: string) {
    setQuery(v);
    setPage(0);
  }

  return (
    <main className="page">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/clan" aria-label={t('nav.clan')} className="btn-ghost h-10 w-10 !px-0">‹</Link>
        <h1 className="font-display flex-1 text-xl tracking-wide">{t('gallery.title')}</h1>
        <span className="font-mono text-xs tabular-nums opacity-60" aria-live="polite">
          {t('gallery.pageOf', { n: safePage + 1, total: pageCount })}
        </span>
      </div>

      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('gallery.search')}
          aria-label={t('gallery.search')}
          className="input ps-9 text-sm"
        />
      </div>

      {membersQuery.isLoading ? (
        <div className="mt-3"><SkeletonList rows={9} /></div>
      ) : visible.length === 0 ? (
        <p className="card mt-3 text-sm opacity-70">{t('gallery.empty')}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2" role="list">
            {cards.map((m) => {
              const name = m.known_name ?? m.display_name ?? m.username;
              const marked = bookmarks.includes(m.id);
              return (
                <div key={m.id} role="listitem" className="card relative p-2 text-center">
                  <button
                    type="button"
                    onClick={() => toggleBookmark(m.id)}
                    aria-label={marked ? t('gallery.bookmarkRemove') : t('gallery.bookmarkAdd')}
                    aria-pressed={marked}
                    className="absolute end-1 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40"
                  >
                    <Icon name="bookmark" className={`h-4 w-4 ${marked ? 'fill-brand-400 text-brand-400' : 'opacity-70'}`} />
                  </button>
                  <Link to={`/players/${m.id}`} className="flex flex-col items-center gap-1.5" aria-label={name}>
                    <Avatar path={m.avatar_url} name={name} className="h-16 w-16 text-xl" />
                    <span className="font-display w-full truncate text-xs tracking-wide">{name}</span>
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="btn-ghost h-11 flex-1 text-sm"
            >
              ‹ {t('gallery.prev')}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="btn-ghost h-11 flex-1 text-sm"
            >
              {t('gallery.next')} ›
            </button>
          </div>
        </>
      )}
      <BottomNav />
    </main>
  );
}
