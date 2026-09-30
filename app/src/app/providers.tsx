import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { useRealtime } from '../hooks/useRealtime';
import { useAuthStore } from '../stores/authStore';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function LiveBinder() {
  const userId = useAuthStore((s) => s.profile?.id);
  const qc = useQueryClient();
  useRealtime(userId);
  // Realtime can drop (sleeping phones, flaky networks): refetch
  // everything whenever the app regains focus. Cheap, bulletproof.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void qc.invalidateQueries();
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
  }, [init]);
  return (
    <QueryClientProvider client={queryClient}>
      <LiveBinder />
      {children ?? <RouterProvider router={router} />}
    </QueryClientProvider>
  );
}
