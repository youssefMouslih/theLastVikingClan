import { supabase } from '../lib/supabase';

// Peer ratings: every warrior rates others 1–5 from their own POV.
// One vote per rater (updatable); averages are public.
export async function ratePlayer(ratedId: string, raterId: string, score: number): Promise<void> {
  if (ratedId === raterId) throw new Error('You cannot rate yourself.');
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Rating must be 1–5.');
  const { error } = await supabase.from('ratings').upsert(
    { rater_id: raterId, rated_id: ratedId, score, updated_at: new Date().toISOString() },
    { onConflict: 'rater_id,rated_id' },
  );
  if (error) throw new Error(error.message);
}

export async function getRatingSummary(ratedId: string, raterId?: string): Promise<{ avg: number | null; count: number; mine: number | null }> {
  const { data, error } = await supabase.from('ratings').select('score,rater_id').eq('rated_id', ratedId);
  if (error) return { avg: null, count: 0, mine: null };
  const rows = (data ?? []) as { score: number; rater_id: string }[];
  const mine = raterId ? (rows.find((r) => r.rater_id === raterId)?.score ?? null) : null;
  if (rows.length === 0) return { avg: null, count: 0, mine };
  const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
  return { avg: Math.round(avg * 10) / 10, count: rows.length, mine };
}

export const ratingService = { ratePlayer, getRatingSummary, client: supabase };
