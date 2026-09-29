import { supabase } from '../lib/supabase';
import type { ClanSettings } from '../types/database';

// Single-row clan settings (§14). Timezone Africa/Casablanca default.
export async function getClanSettings(): Promise<ClanSettings | null> {
  const { data, error } = await supabase.from('clan_settings').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClanSettings | null) ?? null;
}

export async function updateClanSettings(patch: Partial<Pick<ClanSettings, 'name' | 'tag' | 'description' | 'rules' | 'country' | 'timezone' | 'logo_url' | 'banner_url'>>) {
  const current = await getClanSettings();
  if (!current) {
    const { error } = await supabase.from('clan_settings').insert({ ...patch });
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from('clan_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', current.id);
  if (error) throw new Error(error.message);
}

export const clanService = { getClanSettings, updateClanSettings, client: supabase };
