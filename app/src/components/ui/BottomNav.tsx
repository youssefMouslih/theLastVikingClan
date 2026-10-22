import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import Icon, { type IconName } from './Icon';
import { useLocale } from '../../i18n/LocaleContext';
import { listIncoming } from '../../services/challengeService';
import { listIncomingGifts } from '../../services/sagaService';
import { useAuthStore } from '../../stores/authStore';

// Hall | Arena | League | Code | Profile — with live action badges.
const tabs: { to: string; labelKey: 'nav.hall' | 'nav.arena' | 'nav.league' | 'nav.code' | 'nav.profile'; icon: IconName; badge?: 'arena' | 'hall' }[] = [
  { to: '/home', labelKey: 'nav.hall', icon: 'shield', badge: 'hall' },
  { to: '/battles', labelKey: 'nav.arena', icon: 'swords', badge: 'arena' },
  { to: '/competitions', labelKey: 'nav.league', icon: 'trophy' },
  { to: '/code', labelKey: 'nav.code', icon: 'scroll' },
  { to: '/profile', labelKey: 'nav.profile', icon: 'user' },
];

function isTabActive(to: string, pathname: string): boolean {
  if (to === '/home') return pathname === '/' || pathname === '/home';
  if (to === '/competitions') return pathname === '/competitions' || pathname.startsWith('/competitions/') || pathname === '/4vs4' || pathname.startsWith('/4vs4/');
  if (to === '/profile') return pathname === '/profile' || pathname.startsWith('/profile/') || pathname === '/settings';
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function BottomNav() {
  const { t } = useLocale();
  const { pathname } = useLocation();
  const me = useAuthStore((s) => s.profile);
  const incomingQuery = useQuery({
    queryKey: ['battles-in', me?.id],
    queryFn: () => listIncoming(me!.id),
    enabled: !!me,
    refetchInterval: 30_000,
  });
  const giftsQuery = useQuery({
    queryKey: ['gifts-in', me?.id],
    queryFn: () => listIncomingGifts(me!.id),
    enabled: !!me,
    refetchInterval: 30_000,
  });
  const arenaCount = (incomingQuery.data ?? []).filter((b) => b.status === 'PENDING' || b.status === 'RESULT_SUBMITTED').length;
  const hallCount = arenaCount + (giftsQuery.data ?? []).length;

  function badgeFor(tab: (typeof tabs)[number]): number {
    if (!me) return 0;
    if (tab.badge === 'arena') return arenaCount;
    if (tab.badge === 'hall') return hallCount;
    return 0;
  }

  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur md:mx-auto md:max-w-2xl md:border-x">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
        {tabs.map((tab) => {
          const n = badgeFor(tab);
          const active = isTabActive(tab.to, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active ? 'text-brand-400' : 'opacity-60'}`}
            >
              <Icon name={tab.icon} className="h-6 w-6" />
              {t(tab.labelKey)}
              {n > 0 && (
                <span className="absolute end-1 top-1 rounded-full bg-accent-600 px-1.5 text-[10px] font-bold text-white">
                  {n > 9 ? '9+' : n}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
