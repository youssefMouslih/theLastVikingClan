import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

// Auth flows (§11): invite-only, no public signup. Login / logout / reset / session.
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mapAuthError(error.message));
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(mapAuthError(error.message));
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw new Error(mapAuthError(error.message));
}

// Invitation-based account creation: admin creates invite, player sets password.
// V1: player follows invite link then uses signUp once with invited email.
// RLS + app logic must reject non-invited emails (enforced via profiles.status).
export async function signUpWithInvite(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(mapAuthError(error.message));
  if (data.user) {
    const { error: pErr } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      email,
      status: 'ACTIVE',
      role: 'PLAYER',
    });
    if (pErr) throw new Error(humanDbError(pErr.message));
  }
  return data;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}

function mapAuthError(msg: string): string {
  if (/invalid login/i.test(msg)) return 'Invalid email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email, then log in.';
  return msg;
}

function humanDbError(msg: string): string {
  if (msg.includes('duplicate key') && msg.includes('username')) return 'That username is already taken.';
  if (msg.includes('duplicate key')) return 'You already have an account for this competition.';
  return msg;
}

export const authService = { signIn, signOut, resetPassword, signUpWithInvite, fetchProfile, client: supabase };
