import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Lightbox } from '../ui/Motion';
import { getBadgeImageUrl, getBadgeTemplateUrl } from '../../services/storageService';
import type { Honour } from '../../services/honourService';
import Emblem, { emblemFor } from './Emblem';

// Honour badge art, resolved in order:
// 1. type template (Admin → Honours → Badge templates — latest upload wins
//    for every award of that type, past and future),
// 2. the award's own forged PNG,
// 3. vintage emblem art for the type.
export default function HonourBadge({
  honour,
  className = 'h-24 w-24 !rounded-2xl',
  zoomable = false,
}: {
  honour: Pick<Honour, 'id' | 'type' | 'image_url'>;
  className?: string;
  zoomable?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const tplQuery = useQuery({
    queryKey: ['badge-tpl', honour.type],
    queryFn: () => getBadgeTemplateUrl(honour.type),
    staleTime: 1000 * 60 * 60,
  });
  const tpl = tplQuery.data ?? null;
  const imgQuery = useQuery({
    queryKey: ['badge-url', honour.id, honour.image_url],
    queryFn: () => getBadgeImageUrl(honour.image_url),
    enabled: tplQuery.isFetched && !tpl && !!honour.image_url,
    staleTime: 1000 * 60 * 60,
  });
  const src = tpl ?? imgQuery.data ?? null;
  const zoomSrc = src ?? emblemFor(honour.type);
  const img = src ? (
    <img src={src} alt="" className={`${className} shrink-0 rounded-lg object-cover`} loading="lazy" />
  ) : (
    <Emblem type={honour.type} className={className} />
  );
  if (!zoomable) return img;
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={honour.type}
        className="block rounded-2xl transition active:scale-95"
      >
        {img}
      </button>
      {zoom && <Lightbox src={zoomSrc} onClose={() => setZoom(false)} />}
    </>
  );
}
