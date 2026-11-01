import { supabase } from '../lib/supabase';
import type { TryoutRequest, TryoutStatus } from '../types/database';

// Tryout requests: anyone (even logged out) may ask to join the clan.
// Admins resolve them from the Admin → Tryouts tab.
export async function submitTryout(input: { name: string; known_name: string; contact: string; email: string; note?: string | null; website?: string | null }): Promise<void> {
  const { error } = await supabase.from('tryout_requests').insert({
    name: input.name.trim().slice(0, 40),
    known_name: input.known_name.trim().slice(0, 24),
    contact: input.contact.replace(/[^\d+]/g, '').slice(0, 20),
    email: input.email.trim().slice(0, 80),
    note: input.note?.trim().slice(0, 280) || null,
    website_url: input.website?.slice(0, 100) || null,
    status: 'PENDING',
  });
  if (error) throw new Error(error.message);
}

export async function listTryouts(): Promise<TryoutRequest[]> {
  const { data, error } = await supabase
    .from('tryout_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as TryoutRequest[];
}

export async function resolveTryout(id: string, status: TryoutStatus): Promise<void> {
  const { error } = await supabase
    .from('tryout_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function assignTester(id: string, testerId: string | null): Promise<void> {
  const { error } = await supabase
    .from('tryout_requests')
    .update({ assigned_tester_id: testerId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Verdict scores: score_a = tester, score_b = candidate.
export async function submitVerdict(
  id: string,
  input: { verdict: 'PASS' | 'FAIL'; sa: number; sb: number; note?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('tryout_requests')
    .update({
      verdict: input.verdict,
      verdict_score_a: input.sa,
      verdict_score_b: input.sb,
      verdict_note: input.note?.trim().slice(0, 280) || null,
      verdict_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listMyTesterTasks(userId: string): Promise<TryoutRequest[]> {
  const { data, error } = await supabase
    .from('tryout_requests')
    .select('*')
    .eq('assigned_tester_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TryoutRequest[];
}

export interface AcceptedTryout {
  user_id: string;
  username: string;
  email: string;
  // True when the email already had a VIK Clan account and got a login link.
  existing?: boolean;
  email_sent: boolean;
  email_error?: string | null;
  // True when the provider's daily allowance / rate limit blocked delivery.
  // The one-time link is still valid — the admin copies or sends it manually.
  email_quota_reached?: boolean;
  invite_link: string;
  // False when the account/link worked but the tryout row could not be marked
  // accepted (e.g. the admin's session lacks the role at update time).
  resolved?: boolean;
  status_error?: string | null;
  already_accepted?: boolean;
}

// Thrown when the browser has no usable Supabase session (expired/cleared).
// The admin UI logs out and redirects to /login when this surfaces.
export class AuthSessionError extends Error {
  constructor() {
    super('Auth session missing!');
    this.name = 'AuthSessionError';
  }
}

// Provisions a new account (set-password invite) or links the existing account
// (magic login link), then emails the one-time link. No temp password exists.
export async function acceptWithAccount(tryoutId: string): Promise<AcceptedTryout> {
  // Attach the user JWT explicitly: if the client session was stale/lost, the
  // SDK would omit Authorization and the function would answer 401 Unauthorized.
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? (await refreshedToken());
  if (!token) {
    console.warn('accept-tryout: no Supabase session at accept time.', {
      hadStoredSession: !!session,
      storageKeys: typeof localStorage === 'undefined'
        ? []
        : Object.keys(localStorage).filter((k) => k.startsWith('sb-')),
    });
    throw new AuthSessionError();
  }

  let result = await invokeAccept(token, tryoutId);
  let status = errorStatus(result.error);
  if (status === 401) {
    // One silent retry with a refreshed token covers expired access tokens.
    console.warn('accept-tryout: function rejected the access token; refreshing once.');
    const fresh = await refreshedToken();
    if (fresh && fresh !== token) {
      token = fresh;
      result = await invokeAccept(token, tryoutId);
      status = errorStatus(result.error);
    }
  }

  if (result.error) {
    if (status === 401) throw new AuthSessionError();
    throw new Error((await errorDetail(result.error)) ?? result.error.message);
  }
  const err = (result.data as { error?: string } | null)?.error;
  if (err) throw new Error(err);
  const created = result.data as Partial<AcceptedTryout> | null;
  if (!created?.invite_link) {
    // The deployed function is still the old temp-password build.
    throw new Error('The accept-tryout function is out of date — deploy the latest version and try again.');
  }
  return created as AcceptedTryout;
}

function invokeAccept(token: string, tryoutId: string) {
  return supabase.functions.invoke('accept-tryout', {
    body: { tryout_id: tryoutId },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function refreshedToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('accept-tryout: session refresh failed.', error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (err) {
    console.warn('accept-tryout: session refresh threw.', err);
    return null;
  }
}

function errorStatus(error: unknown): number | null {
  const ctx = (error as { context?: unknown } | null)?.context;
  return ctx instanceof Response ? ctx.status : null;
}

async function errorDetail(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!(ctx instanceof Response)) return null;
  try {
    const body = (await ctx.clone().json()) as { error?: string };
    return body?.error ?? null;
  } catch {
    return null;
  }
}

export const tryoutService = { submitTryout, listTryouts, resolveTryout, assignTester, submitVerdict, listMyTesterTasks, acceptWithAccount, client: supabase };
