import { useLocale } from '../../i18n/LocaleContext';

export default function QueryError({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { t, tError } = useLocale();
  return (
    <section role="alert" className={`card ${compact ? 'mt-2 p-3' : 'mt-3'}`}>
      <p className="text-sm font-semibold text-red-400">{t('errors.loadTitle')}</p>
      <p className="mt-1 text-xs opacity-70">{tError(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-ghost mt-2 h-9 px-3 text-xs">
          {t('common.retry')}
        </button>
      )}
    </section>
  );
}
