import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const configured = !!url && !!anonKey;
if (!configured) {
  console.warn('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See .env.example — running in offline UI mode.');
}

// Placeholder client keeps the UI renderable without credentials;
// backend calls fail gracefully until .env is configured.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
);

export const isSupabaseConfigured = configured;

// NEVER import service_role key in frontend (§89).
