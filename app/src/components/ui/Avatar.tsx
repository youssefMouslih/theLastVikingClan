import { useQuery } from '@tanstack/react-query';
import { getAvatarUrl } from '../../services/storageService';

// Shared avatar: storage photo when available, initial-letter fallback.
// Signed URLs are cached per path, so lists stay cheap.
export default function Avatar({
  path,
  name,
  className = 'h-10 w-10 text-lg',
}: {
  path?: string | null;
  name: string;
  className?: string;
}) {
  const query = useQuery({
    queryKey: ['avatar-path', path],
    queryFn: () => getAvatarUrl(path!),
    enabled: !!path,
    staleTime: 1000 * 60 * 60,
  });
  const url = query.data ?? null;
  if (url) {
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div aria-hidden className={`font-display flex shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
