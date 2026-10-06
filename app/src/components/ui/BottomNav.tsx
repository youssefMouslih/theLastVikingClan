import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
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

export default function BottomNav() {
  const { t } = useLocale();
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
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
        {tabs.map((tab) => {
          const n = badgeFor(tab);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }: { isActive: boolean }) =>
                `relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-brand-400' : 'opacity-60'}`
              }
            >
              <Icon name={tab.icon} className="h-6 w-6" />
              {t(tab.labelKey)}
              {n > 0 && (
                <span className="absolute right-1/2 top-1 translate-x-4 rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white">
                  {n > 9 ? '9+' : n}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
