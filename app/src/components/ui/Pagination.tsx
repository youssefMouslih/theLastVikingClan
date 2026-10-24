import { useLocale } from '../../i18n/LocaleContext';
import Icon from './Icon';

// Members lists page at this size client-side (no server paging yet).
export const PAGE_SIZE = 5;

type PageItem = number | '…';

function pageItems(current: number, total: number, siblings: number): PageItem[] {
  const pages = new Set<number>([1, total, current - siblings, current, current + siblings]);
  const nums = [...pages].filter((p) => Number.isInteger(p) && p >= 1 && p <= total).sort((a, b) => a - b);
  const out: PageItem[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev > 0 && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

// Prev / numbered pages / next. Renders nothing when there is a single page.
export default function Pagination({
  page,
  pageCount,
  onChange,
  siblings = 1,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  siblings?: number;
}) {
  const { t } = useLocale();
  const total = Math.max(1, Math.floor(pageCount));
  const safe = Math.min(Math.max(1, Math.floor(page)), total);
  if (total <= 1) return null;
  const items = pageItems(safe, total, siblings);
  return (
    <nav aria-label={t('common.pagination')} className="mt-2 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        aria-label={t('common.prev')}
        disabled={safe <= 1}
        onClick={() => onChange(safe - 1)}
        className="btn-ghost h-9 w-11 px-0 text-sm disabled:opacity-40"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-1">
        {items.map((item, i) =>
          item === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm opacity-60">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              disabled={item === safe}
              aria-current={item === safe ? 'page' : undefined}
              className={`h-9 min-w-9 px-1 text-sm font-semibold rounded-lg border ${item === safe ? 'bg-brand-500/15 text-brand-300 border-brand-500/40' : 'btn-ghost border-transparent'}`}
            >
              {item}
            </button>
          ),
        )}
      </div>
      <button
        type="button"
        aria-label={t('common.next')}
        disabled={safe >= total}
        onClick={() => onChange(safe + 1)}
        className="btn-ghost h-9 w-11 px-0 text-sm disabled:opacity-40"
      >
        <Icon name="chevronRight" className="h-4 w-4" />
      </button>
    </nav>
  );
}
