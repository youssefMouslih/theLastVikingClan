import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale } from '../../i18n/LocaleContext';
import { getEvidenceSignedUrl } from '../../services/storageService';
import { Lightbox } from '../ui/Motion';

export default function LeagueEvidence({
  path,
  label,
  className = 'max-h-64',
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const [zoom, setZoom] = useState(false);
  const query = useQuery({
    queryKey: ['league-evidence', path],
    queryFn: () => getEvidenceSignedUrl(path),
    staleTime: 1000 * 60 * 50,
  });

  if (query.isLoading) {
    return <p className="mt-1 text-[11px] opacity-50">{t('common.loading')}</p>;
  }
  if (!query.data) {
    return <p className="mt-1 text-[11px] text-amber-500">{t('league4.evidenceUnavailable')}</p>;
  }
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className="mt-1 block w-full" aria-label={label ?? t('league4.evidence')}>
        <img
          src={query.data}
          alt={label ?? t('league4.evidence')}
          className={`${className} w-full rounded-xl border border-white/10 object-contain`}
          loading="lazy"
        />
      </button>
      {zoom && <Lightbox src={query.data} onClose={() => setZoom(false)} />}
    </>
  );
}
