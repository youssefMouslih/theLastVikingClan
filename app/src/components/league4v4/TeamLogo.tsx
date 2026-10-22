import { useQuery } from '@tanstack/react-query';
import { getLeagueTeamLogoUrl } from '../../services/storageService';

export default function TeamLogo({
  path,
  name,
  className = 'h-10 w-10 text-lg',
  rounded = 'rounded-xl',
}: {
  path?: string | null;
  name: string;
  className?: string;
  rounded?: string;
}) {
  const query = useQuery({
    queryKey: ['league-team-logo', path],
    queryFn: () => getLeagueTeamLogoUrl(path!),
    enabled: !!path,
    staleTime: 1000 * 60 * 60,
  });
  const url = query.data ?? null;
  if (!url) {
    return (
      <span
        aria-hidden
        className={`font-display flex shrink-0 items-center justify-center bg-brand-500/20 font-bold text-brand-300 ${rounded} ${className}`}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={url} alt="" className={`${className} shrink-0 ${rounded} object-cover`} />;
}
