import { NavLink } from 'react-router';
import Icon, { type IconName } from './Icon';
import { useLocale } from '../../i18n/LocaleContext';

// Mobile bottom nav (§15): 4 tabs. Alerts live in the app-bar bell (Home).
const tabs: { to: string; labelKey: 'nav.home' | 'nav.cups' | 'nav.clan' | 'nav.you'; icon: IconName }[] = [
  { to: '/home', labelKey: 'nav.home', icon: 'home' },
  { to: '/competitions', labelKey: 'nav.cups', icon: 'trophy' },
  { to: '/clan', labelKey: 'nav.clan', icon: 'users' },
  { to: '/profile', labelKey: 'nav.you', icon: 'user' },
];

export default function BottomNav() {
  const { t } = useLocale();

  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-brand-400' : 'opacity-60'}`
            }
          >
            <Icon name={tab.icon} className="h-6 w-6" />
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
