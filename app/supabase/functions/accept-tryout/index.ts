// VIK Clan tryout provisioning: turn an accepted tryout into a real account.
// Deploy: supabase functions deploy accept-tryout
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically on deploy).
// No email provider needed: the account is created with a one-time temporary
// password (email pre-confirmed) that the admin forwards over WhatsApp; the
// candidate changes it after first login in their Profile. No password is
// ever collected or stored beforehand.
//
// Caller must be OWNER/ADMIN (verified server-side). Flow:
// tryout (PENDING + email) → user + profile created → tryout ACCEPTED.
//
// The app calls this with { tryout_id } from Admin → Tryouts → Accept.

import { createClient } from 'npm:@supabase/supabase-js@2';

function cleanUsername(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'viking';
}

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => chars[n % chars.length]).join('');
}

Deno.serve(async (req: Request) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Caller must be an active OWNER/ADMIN — testers and players are refused.
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: caller } = await supabase.auth.getUser(jwt);
  if (!caller?.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  const { data: actor } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', caller.user.id)
    .single();
  if (!actor || (actor as { status: string }).status !== 'ACTIVE' ||
      !['OWNER', 'ADMIN'].includes((actor as { role: string }).role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
  }

  let tryout_id = '';
  try {
    tryout_id = (await req.json()).tryout_id ?? '';
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400, headers: CORS });
  }
  if (!tryout_id) return Response.json({ error: 'Missing tryout_id' }, { status: 400, headers: CORS });

  const { data: t } = await supabase.from('tryout_requests').select('*').eq('id', tryout_id).single();
  const tryout = t as {
    id: string; name: string; email: string | null; status: string;
  } | null;
  if (!tryout) return Response.json({ error: 'Not found' }, { status: 404, headers: CORS });
  if (tryout.status !== 'PENDING') return Response.json({ error: 'Already resolved' }, { status: 409, headers: CORS });
  if (!tryout.email || !/.+@.+\..+/.test(tryout.email)) {
    return Response.json({ error: 'Tryout has no valid email — ask the candidate first.' }, { status: 400, headers: CORS });
  }

  const { data: existing } = await supabase.from('profiles').select('id').eq('email', tryout.email).limit(1);
  if (existing && (existing as unknown[]).length > 0) {
    return Response.json({ error: 'An account with this email already exists.' }, { status: 409, headers: CORS });
  }

  // Unique warrior username derived from the tryout name.
  let username = cleanUsername(tryout.name);
  if (username.length < 3) username = `viking_${username}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? username : `${username}${Math.floor(10 + Math.random() * 90)}`;
    const { data: taken } = await supabase.from('profiles').select('id').eq('username', candidate).limit(1);
    if (!taken || (taken as unknown[]).length === 0) {
      username = candidate;
      break;
    }
    if (attempt === 4) return Response.json({ error: 'Could not pick a username.' }, { status: 500, headers: CORS });
  }

  const temp = tempPassword();
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email: tryout.email,
    password: temp,
    email_confirm: true,
    user_metadata: { username },
  });
  if (cErr || !created?.user) {
    return Response.json({ error: cErr?.message ?? 'Account creation failed.' }, { status: 500, headers: CORS });
  }

  const { error: pErr } = await supabase.from('profiles').insert({
    id: created.user.id,
    username,
    display_name: tryout.name.trim().slice(0, 40),
    email: tryout.email,
    role: 'PLAYER',
    status: 'ACTIVE',
  });
  if (pErr) {
    // Roll back the orphaned auth user so a retry starts clean.
    await supabase.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: pErr.message }, { status: 500, headers: CORS });
  }

  await supabase.from('tryout_requests').update({ status: 'ACCEPTED', updated_at: new Date().toISOString() }).eq('id', tryout_id);
  return Response.json({ user_id: created.user.id, username, temp_password: temp }, { headers: CORS });
});
