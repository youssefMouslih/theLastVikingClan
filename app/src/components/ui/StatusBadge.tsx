// Colored status badges. Text label always shown — never color-only (§120).
import { statusLabel, useLocale } from '../../i18n/LocaleContext';
const STYLES: Record<string, string> = {
  // competitions
  DRAFT: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  REGISTRATION_OPEN: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  REGISTRATION_CLOSED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  READY: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  ACTIVE: 'bg-brand-500/15 text-brand-700 dark:text-brand-500',
  FINISHED: 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900',
  ARCHIVED: 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  // matches
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  PLAYED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  RESULT_SUBMITTED: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  CONFIRMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  DISPUTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  FORFEIT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  CANCELLED: 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  // roles / misc
  OWNER: 'bg-brand-500/15 text-brand-700 dark:text-brand-500',
  ADMIN: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
  MODERATOR: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  PLAYER: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
  OPEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  FULL: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  CLOSED: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
};

export default function StatusBadge({ value, className = '' }: { value: string; className?: string }) {
  const { t } = useLocale();
  const style = STYLES[value] ?? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300';
  return (
    <span className={`status-badge inline-block rounded-full px-2 py-0.5 text-[11px] ${style} ${className}`}>
      {statusLabel(t, value)}
    </span>
  );
}
