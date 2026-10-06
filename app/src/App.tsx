import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { Providers } from './app/providers';
import OfflineBanner from './components/ui/OfflineBanner';
import UpdateBanner from './components/ui/UpdateBanner';
import { ToastProvider } from './components/ui/Toast';
import OnboardingGate from './components/onboarding/OnboardingGate';
import { LocaleProvider } from './i18n/LocaleContext';
import { ThemeProvider } from './theme';
import './index.css';

function skipToContent(e: React.MouseEvent) {
  e.preventDefault();
  const main = document.querySelector('main');
  if (main) {
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    (main as HTMLElement).focus({ preventScroll: true });
    main.scrollIntoView();
  }
}

export default function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
        <Providers>
          <a
            href="#main-content"
            onClick={skipToContent}
            className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-[9999] focus:rounded-lg focus:bg-brand-500 focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
          >
            Skip to content
          </a>
          <UpdateBanner />
          <OfflineBanner />
          <ToastProvider>
            <OnboardingGate />
            <RouterProvider router={router} />
          </ToastProvider>
        </Providers>
      </ThemeProvider>
    </LocaleProvider>
  );
}
