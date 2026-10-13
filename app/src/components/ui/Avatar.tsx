import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getAvatarUrl } from '../../services/storageService';
import { useLocale } from '../../i18n/LocaleContext';
import { Lightbox } from './Motion';

// Shared avatar: storage photo when available, initial-letter fallback.
// Signed URLs are cached per path, so lists stay cheap.
// Tap a photo to see it full-size (zoomable, on by default). The tap stops
// propagation so avatars nested inside links/cards open the viewer instead
// of navigating. Pass zoomable={false} to keep a plain image.
export default function Avatar({
  path,
  name,
  className = 'h-10 w-10 text-lg',
  zoomable = true,
}: {
  path?: string | null;
  name: string;
  className?: string;
  zoomable?: boolean;
}) {
  const { t } = useLocale();
  const [zoom, setZoom] = useState(false);
  const query = useQuery({
    queryKey: ['avatar-path', path],
    queryFn: () => getAvatarUrl(path!),
    enabled: !!path,
    staleTime: 1000 * 60 * 60,
  });
  const url = query.data ?? null;
  if (!url) {
    return (
      <div aria-hidden className={`font-display flex shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 ${className}`}>
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  if (!zoomable) {
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setZoom(true);
        }}
        aria-label={t('common.viewPhoto', { name })}
        className="shrink-0 rounded-full"
      >
        <img src={url} alt="" className={`${className} block rounded-full object-cover`} />
      </button>
      {zoom && <Lightbox src={url} onClose={() => setZoom(false)} />}
    </>
  );
}
