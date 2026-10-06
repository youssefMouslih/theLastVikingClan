import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { vapidKey } from './pushService';

// Automated setup health check: previously manual steps (env, buckets,
// OWNER bootstrap, VAPID) now have one button in Admin. Fire-and-forget
// safe: every probe fails closed with a hint, never throws.
export const REQUIRED_BUCKETS = ['avatars', 'clan-assets', 'match-evidence'] as const;

export interface SetupCheckResult {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
}

export async function checkSetup(): Promise<SetupCheckResult[]> {
  const results: SetupCheckResult[] = [];

  // 1. Env / client
  const envOk = isSupabaseConfigured;
  results.push({
    key: 'env',
    label: 'Supabase env (.env)',
    ok: envOk,
    hint: envOk ? 'VITE_SUPABASE_URL + ANON_KEY present.' : 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.',
  });
  if (!envOk) {
    // Without a client the probes below cannot run; report them as pending.
    results.push(
      { key: 'buckets', label: 'Storage buckets', ok: false, hint: 'Configure .env first, then check for: avatars, clan-assets, match-evidence (private).' },
      { key: 'owner', label: 'OWNER bootstrap', ok: false, hint: 'Create first user via Auth, then set profiles row to OWNER / ACTIVE.' },
      { key: 'vapid', label: 'VAPID public key', ok: false, hint: 'Set VITE_VAPID_PUBLIC_KEY for Raven Messages push.' },
    );
    return results;
  }

  // 2. Buckets
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    const names = new Set((data ?? []).map((b) => b.name));
    const missing = REQUIRED_BUCKETS.filter((b) => !names.has(b));
    results.push({
      key: 'buckets',
      label: 'Storage buckets',
      ok: missing.length === 0,
      hint: missing.length === 0
        ? `Private buckets present: ${REQUIRED_BUCKETS.join(', ')}.`
        : `Missing private buckets: ${missing.join(', ')}. Create them in Supabase Storage.`,
    });
  } catch (e) {
    results.push({
      key: 'buckets',
      label: 'Storage buckets',
      ok: false,
      hint: `Could not list buckets: ${e instanceof Error ? e.message : 'unknown error'}.`,
    });
  }

  // 3. OWNER bootstrap
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'OWNER')
      .eq('status', 'ACTIVE')
      .limit(1);
    if (error) throw error;
    const hasOwner = (data ?? []).length > 0;
    results.push({
      key: 'owner',
      label: 'OWNER bootstrap',
      ok: hasOwner,
      hint: hasOwner
        ? 'At least one ACTIVE OWNER exists.'
        : 'No ACTIVE OWNER found — set the first profiles row to OWNER / ACTIVE.',
    });
  } catch (e) {
    results.push({
      key: 'owner',
      label: 'OWNER bootstrap',
      ok: false,
      hint: `Could not query profiles: ${e instanceof Error ? e.message : 'unknown error'}.`,
    });
  }

  // 4. VAPID (push)
  const vk = vapidKey();
  results.push({
    key: 'vapid',
    label: 'VAPID public key',
    ok: !!vk,
    hint: vk
      ? 'VITE_VAPID_PUBLIC_KEY present — push subscribe enabled.'
      : 'Missing VITE_VAPID_PUBLIC_KEY — push stays disabled until set (private key stays in Edge Function secrets).',
  });

  return results;
}

export const setupCheckService = { checkSetup, REQUIRED_BUCKETS };
