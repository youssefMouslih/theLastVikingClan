import { createBrowserRouter, Navigate } from 'react-router';

// URL structure (§124). Pages are stubs in Phase 0; implemented in later phases.
import AdminPage from '../pages/AdminPage';
import BattlesPage from '../pages/BattlesPage';
import SagaPage from '../pages/SagaPage';
import ClanPage from '../pages/ClanPage';
import CodePage from '../pages/CodePage';
import CompetitionDetailPage from '../pages/CompetitionDetailPage';
import CompetitionsPage from '../pages/CompetitionsPage';
import HomePage from '../pages/HomePage';
import JoinPage from '../pages/JoinPage';
import LoginPage from '../pages/LoginPage';
import MatchPage from '../pages/MatchPage';
import NotificationsPage from '../pages/NotificationsPage';
import PlayerPage from '../pages/PlayerPage';
import ProfilePage from '../pages/ProfilePage';
import SettingsPage from '../pages/SettingsPage';
import { useAuthStore } from '../stores/authStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { profile, loading, initialized } = useAuthStore();
  if (!initialized || loading) return <main className="p-4 text-sm">Loading standings…</main>;
  if (!profile) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const guard = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/home', element: guard(<HomePage />) },
  { path: '/', element: guard(<HomePage />) },
  { path: '/competitions', element: guard(<CompetitionsPage />) },
  { path: '/competitions/:id', element: guard(<CompetitionDetailPage />) },
  { path: '/matches/:id', element: guard(<MatchPage />) },
  { path: '/players/:id', element: guard(<PlayerPage />) },
  { path: '/clan', element: guard(<ClanPage />) },
  { path: '/code', element: guard(<CodePage />) },
  { path: '/notifications', element: guard(<NotificationsPage />) },
  { path: '/profile', element: guard(<ProfilePage />) },
  { path: '/settings', element: guard(<SettingsPage />) },
  { path: '/admin', element: guard(<AdminPage />) },
  { path: '/battles', element: guard(<BattlesPage />) },
  { path: '/saga', element: guard(<SagaPage />) },
  { path: '/admin/disputes', element: guard(<AdminPage />) },
  { path: '/admin/competitions', element: guard(<AdminPage />) },
  { path: '/join/:code', element: guard(<JoinPage />) },
]);
