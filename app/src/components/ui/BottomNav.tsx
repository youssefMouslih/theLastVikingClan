import { NavLink } from 'react-router';
import Icon, { type IconName } from './Icon';
import { useLocale } from '../../i18n/LocaleContext';

// Hall | Arena | League | Code | Profile
const tabs: { to: string; labelKey: 'nav.hall' | 'nav.arena' | 'nav.league' | 'nav.code' | 'nav.profile'; icon: IconName }[] = [
  { to: '/home', labelKey: 'nav.hall', icon: 'shield' },
  { to: '/battles', labelKey: 'nav.arena', icon: 'swords' },
  { to: '/competitions', labelKey: 'nav.league', icon: 'trophy' },
  { to: '/code', labelKey: 'nav.code', icon: 'scroll' },
  { to: '/profile', labelKey: 'nav.profile', icon: 'user' },
];

export default function BottomNav() {
  const { t } = useLocale();

  return (
    <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
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
