import { supabase } from '../lib/supabase';
import type { ClanSettings } from '../types/database';
import { getClanAssetUrl } from './storageService';

// Single-row clan settings (§14). Timezone Africa/Casablanca default.
export async function getClanSettings(): Promise<ClanSettings | null> {
  const { data, error } = await supabase.from('clan_settings').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const clan = data as ClanSettings;
  // Uploaded banners live in the private clan-assets bucket (stored as a path);
  // legacy rows may already hold an absolute URL, which passes through.
  const banner = await getClanAssetUrl(clan.banner_url);
  return { ...clan, banner_url: banner };
}

export async function updateClanSettings(patch: Partial<Pick<ClanSettings, 'name' | 'tag' | 'description' | 'rules' | 'country' | 'timezone' | 'logo_url' | 'banner_url' | 'banner_color' | 'quest_names' | 'registration_open' | 'auto_jarl_enabled' | 'auto_confirm_hours' | 'overdue_grace_hours' | 'forfeit_mode'>>) {
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
