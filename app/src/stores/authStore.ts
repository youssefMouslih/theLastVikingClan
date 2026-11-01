import { create } from 'zustand';
import { fetchProfile } from '../services/authService';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  setProfile: (p: Profile | null) => void;
  init: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  loading: true,
  initialized: false,
  setProfile: (profile) => set({ profile }),
  init: async () => {
    set({ loading: true });
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      if (!user) {
        set({ profile: null, loading: false, initialized: true });
        return;
      }

      let profile: Profile | null;
      try {
        profile = await fetchProfile(user.id);
      } catch (err) {
        // Transient DB/network failure: keep the session and any profile we
        // already have. Signing out here wiped valid sessions on a hiccup.
        console.warn('Profile fetch failed; keeping session.', err);
        const current = get().profile;
        if (current && current.id !== user.id) set({ profile: null });
        set({ loading: false, initialized: true });
        return;
      }

      // Rule 1: only clan members access app. Suspended/removed -> treat as logged out.
      // BANNED keeps the session so the app can show the ban screen + appeal box.
      if (!profile || profile.status === 'SUSPENDED' || profile.status === 'REMOVED') {
        try {
          await supabase.auth.signOut();
        } catch (err) {
          console.warn('Sign-out after denied profile failed.', err);
        }
        set({ profile: null, loading: false, initialized: true });
        return;
      }
      set({ profile, loading: false, initialized: true });
      // Last-seen heartbeat (fire-and-forget): powers presence dot + "last seen".
      void supabase
        .from('profiles')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
    } catch (err) {
      console.warn('Auth init failed; keeping session.', err);
      set({ loading: false, initialized: true });
    }
  },
  logout: async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // A dead session makes signOut throw "Auth session missing!". Clear the
      // local copy too so the app doesn't keep a half-authenticated state.
      console.warn('Sign-out failed; clearing local session.', err);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch { /* already gone */ }
    } finally {
      // Clear the UI even if the server sign-out fails (dead/revoked session).
      set({ profile: null });
    }
  },
}));

// Keep profile in sync across tabs / refresh (§Definition of Done: survives refresh)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') return; // same user, same profile
  const { profile } = useAuthStore.getState();
  if (!session?.user) {
    if (profile) useAuthStore.getState().setProfile(null);
    return;
  }
  if (!profile || profile.id !== session.user.id) {
    // Defer the REST call: Supabase holds its auth lock while notifying
    // subscribers, and calling the client synchronously can deadlock.
    window.setTimeout(() => {
      fetchProfile(session.user.id)
        .then((p) => {
          if (p) useAuthStore.getState().setProfile(p);
        })
        .catch((err) => console.warn('Profile sync failed; keeping state.', err));
    }, 0);
  }
});
