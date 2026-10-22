import { useLocale } from '../../i18n/LocaleContext';

export type FormResult = 'W' | 'D' | 'L';

const STYLES: Record<FormResult, string> = {
  W: 'bg-green-500',
  D: 'bg-zinc-400',
  L: 'bg-red-500',
};

export default function FormDots({ results }: { results: FormResult[] }) {
  const { t } = useLocale();
  const labels: Record<FormResult, string> = {
    W: t('stand.formWin'),
    D: t('stand.formDraw'),
    L: t('stand.formLoss'),
  };
  return (
    <span className="mt-0.5 flex gap-0.5" aria-label={t('stand.form')}>
      {results.slice(-5).map((result, index) => (
        <span key={index} title={labels[result]} className={`h-1.5 w-2.5 rounded-sm ${STYLES[result]}`} />
      ))}
    </span>
  );
}
