import { useLocale } from '../../i18n/LocaleContext';
import type { LeagueSeason } from '../../types/league4v4';
import StatusBadge from '../ui/StatusBadge';
import Icon from '../ui/Icon';

export default function LeagueDraftList({
  drafts,
  onResume,
}: {
  drafts: LeagueSeason[];
  onResume: (seasonId: string) => void;
}) {
  const { t, fmtDate } = useLocale();
  if (drafts.length === 0) return null;

  return (
    <div>
      <h2 className="card-title flex items-center gap-1.5">
        <Icon name="scroll" className="h-4 w-4 text-brand-400" />
        {t('league4.existingDrafts')}
      </h2>
      <p className="mt-1 text-xs opacity-70">{t('league4.existingDraftsHint')}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => onResume(draft.id)}
              className="flex w-full items-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/5 p-3 text-left transition hover:border-brand-500/70 hover:bg-brand-500/10"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-400">
                <Icon name="trophy" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{draft.name}</span>
                  <StatusBadge value={draft.status} />
                </span>
                <span className="mt-0.5 block text-xs opacity-60">{t('league4.draftCreated', { date: fmtDate(draft.created_at) })}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand-400">{t('league4.resumeDraft')}</span>
              <Icon name="back" className="h-4 w-4 shrink-0 rotate-180 text-brand-400" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
