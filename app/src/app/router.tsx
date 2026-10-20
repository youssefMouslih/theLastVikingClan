import { createBrowserRouter, Navigate } from 'react-router';

// App URL structure: all pages implemented; every route except /login requires auth.
import AdminPage from '../pages/AdminPage';
import BattlesPage from '../pages/BattlesPage';
import SagaPage from '../pages/SagaPage';
import ClanPage from '../pages/ClanPage';
import CodePage from '../pages/CodePage';
import CompetitionDetailPage from '../pages/CompetitionDetailPage';
import CompetitionsPage from '../pages/CompetitionsPage';
import GalleryPage from '../pages/GalleryPage';
import HomePage from '../pages/HomePage';
import JoinPage from '../pages/JoinPage';
import League4v4HubPage from '../pages/League4v4HubPage';
import LeagueAdminPage from '../pages/LeagueAdminPage';
import LeagueCreateTeamPage from '../pages/LeagueCreateTeamPage';
import LeagueFixturesPage from '../pages/LeagueFixturesPage';
import LeagueMyTeamPage from '../pages/LeagueMyTeamPage';
import LeagueTeamDetailPage from '../pages/LeagueTeamDetailPage';
import LeagueTeamsPage from '../pages/LeagueTeamsPage';
import LoginPage from '../pages/LoginPage';
import ForcePasswordPage from '../pages/ForcePasswordPage';
import MatchPage from '../pages/MatchPage';
import NotificationsPage from '../pages/NotificationsPage';
import PlayerPage from '../pages/PlayerPage';
import ProfilePage from '../pages/ProfilePage';
import SettingsPage from '../pages/SettingsPage';
import SimPage from '../pages/SimPage';
import { useAuthStore } from '../stores/authStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { profile, loading, initialized } = useAuthStore();
  if (!initialized || loading) return <main className="p-4 text-sm">Loading standings…</main>;
  if (!profile) return <Navigate to="/login" replace />;
  // Forced password rotation comes before everything (except itself).
  if (profile.must_change_password && window.location.pathname !== '/password') {
    return <Navigate to="/password" replace />;
  }
  return <>{children}</>;
}

// Role gate: typing the URL is not enough — wrong roles bounce to /home
// even when signed in. (Pages keep their own checks too; RLS enforces data.)
function RequireRole({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const { profile, loading, initialized } = useAuthStore();
  if (!initialized || loading) return <main className="p-4 text-sm">Loading standings…</main>;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password && window.location.pathname !== '/password') {
    return <Navigate to="/password" replace />;
  }
  if (!roles.includes(profile.role)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

const guard = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>;
const staff = (el: React.ReactNode) => <RequireRole roles={['OWNER', 'ADMIN']}>{el}</RequireRole>;

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: guard(<ForcePasswordPage />) },
  { path: '/home', element: guard(<HomePage />) },
  { path: '/', element: guard(<HomePage />) },
  { path: '/competitions', element: guard(<CompetitionsPage />) },
  { path: '/competitions/:id', element: guard(<CompetitionDetailPage />) },
  { path: '/4vs4', element: guard(<League4v4HubPage />) },
  { path: '/4vs4/teams', element: guard(<LeagueTeamsPage />) },
  { path: '/4vs4/teams/create', element: guard(<LeagueCreateTeamPage />) },
  { path: '/4vs4/teams/:id', element: guard(<LeagueTeamDetailPage />) },
  { path: '/4vs4/my-team', element: guard(<LeagueMyTeamPage />) },
  { path: '/4vs4/fixtures', element: guard(<LeagueFixturesPage />) },
  { path: '/4vs4/admin', element: staff(<LeagueAdminPage />) },
  { path: '/matches/:id', element: guard(<MatchPage />) },
  { path: '/players/:id', element: guard(<PlayerPage />) },
  { path: '/clan', element: guard(<ClanPage />) },
  { path: '/gallery', element: guard(<GalleryPage />) },
  { path: '/code', element: guard(<CodePage />) },
  { path: '/notifications', element: guard(<NotificationsPage />) },
  { path: '/profile', element: guard(<ProfilePage />) },
  { path: '/settings', element: guard(<SettingsPage />) },
  { path: '/admin', element: staff(<AdminPage />) },
  { path: '/battles', element: guard(<BattlesPage />) },
  { path: '/saga', element: guard(<SagaPage />) },
  { path: '/admin/disputes', element: staff(<AdminPage />) },
  { path: '/admin/competitions', element: staff(<AdminPage />) },
  { path: '/join/:code', element: guard(<JoinPage />) },
  { path: '/sim', element: guard(<SimPage />) },
  // Unknown URLs fall back to Home (auth guard redirects to /login when signed out).
  { path: '*', element: guard(<HomePage />) },
]);
