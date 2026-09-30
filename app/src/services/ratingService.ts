import { supabase } from '../lib/supabase';

// Peer ratings ("Shield Respect"): tactical skill, fair play, connection
// stability 1–5 each, plus a community title tag. One vote per rater.
export interface RatingInput {
  tactical: number;
  fairplay: number;
  connection: number;
  title_tag?: string | null;
}

export const TITLE_TAGS = ['Ruthless Attacker', 'Rock Wall', 'Midfield Engine', 'Loyal Raven', 'Master Tactician', 'Giant Slayer'];

function checkDims(r: RatingInput) {
  for (const [k, v] of Object.entries({ tactical: r.tactical, fairplay: r.fairplay, connection: r.connection })) {
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${k} must be 1–5.`);
  }
}

export async function ratePlayer(ratedId: string, raterId: string, input: RatingInput): Promise<void> {
  if (ratedId === raterId) throw new Error('You cannot rate yourself.');
  checkDims(input);
  const overall = Math.round(((input.tactical + input.fairplay + input.connection) / 3) * 10) / 10;
  const { error } = await supabase.from('ratings').upsert(
    {
      rater_id: raterId,
      rated_id: ratedId,
      score: Math.round(overall),
      tactical: input.tactical,
      fairplay: input.fairplay,
      connection: input.connection,
      title_tag: input.title_tag?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'rater_id,rated_id' },
  );
  if (error) throw new Error(error.message);
}

export interface RatingSummary {
  tactical: number | null;
  fairplay: number | null;
  connection: number | null;
  overall: number | null;
  count: number;
  mine: RatingInput | null;
  topTitles: { tag: string; count: number }[];
}

export async function getRatingSummary(ratedId: string, raterId?: string): Promise<RatingSummary> {
  const { data, error } = await supabase.from('ratings').select('score,tactical,fairplay,connection,title_tag,rater_id').eq('rated_id', ratedId);
  if (error) return { tactical: null, fairplay: null, connection: null, overall: null, count: 0, mine: null, topTitles: [] };
  const rows = (data ?? []) as { score: number; tactical: number | null; fairplay: number | null; connection: number | null; title_tag: string | null; rater_id: string }[];
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  };
  const mineRow = raterId ? rows.find((r) => r.rater_id === raterId) : undefined;
  const titleCounts = new Map<string, number>();
  for (const r of rows) if (r.title_tag) titleCounts.set(r.title_tag, (titleCounts.get(r.title_tag) ?? 0) + 1);
  return {
    tactical: avg(rows.map((r) => r.tactical)),
    fairplay: avg(rows.map((r) => r.fairplay)),
    connection: avg(rows.map((r) => r.connection)),
    overall: avg(rows.map((r) => r.score)),
    count: rows.length,
    mine: mineRow ? { tactical: mineRow.tactical ?? 3, fairplay: mineRow.fairplay ?? 5, connection: mineRow.connection ?? 4, title_tag: mineRow.title_tag } : null,
    topTitles: [...titleCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 3),
  };
}

export const ratingService = { ratePlayer, getRatingSummary, TITLE_TAGS, client: supabase };
