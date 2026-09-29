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

export const useAuthStore = create<AuthState>((set) => ({
  profile: null,
  loading: true,
  initialized: false,
  setProfile: (profile) => set({ profile }),
  init: async () => {
    set({ loading: true });
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      set({ profile: null, loading: false, initialized: true });
      return;
    }
    const profile = await fetchProfile(user.id);
    // Rule 1: only clan members access app. Suspended/removed -> treat as logged out.
    if (!profile || profile.status === 'SUSPENDED' || profile.status === 'REMOVED') {
      await supabase.auth.signOut();
      set({ profile: null, loading: false, initialized: true });
      return;
    }
    set({ profile, loading: false, initialized: true });
  },
  logout: async () => {
    await supabase.auth.signOut();
    set({ profile: null });
  },
}));

// Keep profile in sync across tabs / refresh (§Definition of Done: survives refresh)
supabase.auth.onAuthStateChange(async (_event, session) => {
  const { profile, initialized } = useAuthStore.getState();
  if (!initialized) return;
  if (!session?.user) {
    if (profile) useAuthStore.getState().setProfile(null);
    return;
  }
  if (!profile || profile.id !== session.user.id) {
    const p = await fetchProfile(session.user.id);
    useAuthStore.getState().setProfile(p);
  }
});
