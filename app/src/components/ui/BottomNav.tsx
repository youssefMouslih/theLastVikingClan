import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import Icon, { type IconName } from './Icon';
import { useLocale } from '../../i18n/LocaleContext';
import { listIncoming } from '../../services/challengeService';
import { listIncomingGifts } from '../../services/sagaService';
import { useAuthStore } from '../../stores/authStore';

// Hall | Arena | League | Code | Profile — with live action badges.
const tabs: { to: string; labelKey: 'nav.hall' | 'nav.arena' | 'nav.league' | 'nav.code' | 'nav.profile'; icon: IconName; badge?: 'arena' | 'hall' }[] = [
  { to: '/home', labelKey: 'nav.hall', icon: 'medal', badge: 'hall' },
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
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--surface)]/95 shadow-[0_-12px_32px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1 px-2 py-1.5">
        {tabs.map((tab) => {
          const n = badgeFor(tab);
          const active = isTabActive(tab.to, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              aria-label={`${t(tab.labelKey)}${n > 0 ? `, ${n}` : ''}`}
              className={`group relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-tight transition-colors active:scale-[0.97] focus-visible:z-10 ${
                active
                  ? 'border-brand-400/30 bg-brand-500/10 text-brand-300'
                  : 'border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/5 hover:text-[var(--text)]'
              }`}
            >
              <span className={`relative flex h-7 w-10 items-center justify-center rounded-lg transition-colors ${active ? 'text-brand-300' : 'group-hover:text-brand-300'}`}>
                {active && <span aria-hidden className="absolute -top-1 h-0.5 w-5 rounded-full bg-brand-400" />}
                <Icon name={tab.icon} className="h-5 w-5" />
                {n > 0 && (
                  <span aria-hidden className="absolute -end-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-[var(--surface)] bg-accent-600 px-1 text-[9px] font-bold leading-none text-white">
                    {n > 9 ? '9+' : n}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
