import { QueryClient, QueryClientProvider, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { useRealtime } from '../hooks/useRealtime';
import { useAuthStore } from '../stores/authStore';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    },
  },
});

function LiveBinder() {
  const userId = useAuthStore((s) => s.profile?.id);
  const qc = useQueryClient();
  useRealtime(userId);
  // Realtime can drop (sleeping phones, flaky networks): refetch stale
  // queries when the app regains focus. Throttled to 60s and scoped to
  // stale queries only — a bare invalidateQueries() on every focus
  // refetches the whole cache and hammers Supabase on tab switches.
  useEffect(() => {
    let lastRefresh = 0;
    let hiddenAt = 0;
    const refresh = () => {
      if (document.visibilityState !== 'visible') {
        hiddenAt = Date.now();
        return;
      }
      const now = Date.now();
      // Skip quick tab switches (<60s) and brief backgrounding (<30s):
      // realtime already covers those; only refetch after real absence.
      if (now - lastRefresh < 60_000) return;
      if (hiddenAt > 0 && now - hiddenAt < 30_000) return;
      lastRefresh = now;
      hiddenAt = 0;
      void qc.invalidateQueries({ refetchType: 'active' });
      navigator.serviceWorker?.getRegistration().then((r) => r?.update().catch(() => {})).catch(() => {});
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [qc]);
  return null;
}

export function Providers({ children }: { children?: ReactNode }) {
  const init = useAuthStore((s) => s.init);
  useEffect(() => {
    init();
    // Ask the OS to keep our cached shell (iOS evicts idle data).
    try {
      navigator.storage?.persist?.();
    } catch { /* ignore */ }
    // Check for a new app version when returning + hourly.
    const poll = () => {
      navigator.serviceWorker?.getRegistration().then((r) => r?.update().catch(() => {})).catch(() => {});
    };
    const hourly = setInterval(poll, 3600_000);
    return () => clearInterval(hourly);
  }, [init]);
  return (
    <QueryClientProvider client={queryClient}>
      <LiveBinder />
      {children ?? <RouterProvider router={router} />}
    </QueryClientProvider>
  );
}
