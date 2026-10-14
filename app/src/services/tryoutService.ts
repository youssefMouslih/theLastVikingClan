import { supabase } from '../lib/supabase';
import type { TryoutRequest, TryoutStatus } from '../types/database';

// Tryout requests: anyone (even logged out) may ask to join the clan.
// Admins resolve them from the Admin → Tryouts tab.
export async function submitTryout(input: { name: string; contact: string; email: string; note?: string | null }): Promise<void> {
  const { error } = await supabase.from('tryout_requests').insert({
    name: input.name.trim().slice(0, 40),
    contact: input.contact.replace(/[^\d+]/g, '').slice(0, 20),
    email: input.email.trim().slice(0, 80),
    note: input.note?.trim().slice(0, 280) || null,
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

export async function acceptWithAccount(tryoutId: string): Promise<{ user_id: string; username: string; temp_password: string }> {
  const { data, error } = await supabase.functions.invoke('accept-tryout', { body: { tryout_id: tryoutId } });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.clone().json()) as { error?: string };
        if (body?.error) throw new Error(body.error);
      } catch { /* fall through to generic message */ }
    }
    throw new Error(error.message);
  }
  const err = (data as { error?: string } | null)?.error;
  if (err) throw new Error(err);
  return data as { user_id: string; username: string; temp_password: string };
}

export const tryoutService = { submitTryout, listTryouts, resolveTryout, assignTester, submitVerdict, listMyTesterTasks, acceptWithAccount, client: supabase };
