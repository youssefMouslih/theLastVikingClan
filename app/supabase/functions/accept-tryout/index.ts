// VIK Clan tryout provisioning: turn an accepted tryout into a real account
// and email the candidate a one-time link.
//
// Deploy: supabase functions deploy accept-tryout
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//          (set automatically on deploy)
//          RESEND_API_KEY  — Resend API key (email delivery)
//          RESEND_FROM     — verified sender, e.g. "VIK Clan <noreply@yourdomain.com>"
//          APP_URL         — app origin for the link redirect (falls back to Origin)
//          BREVO_API_KEY   — optional no-domain fallback (Brevo transactional API)
//          MAIL_FROM       — verified Brevo sender, e.g. "VIK Clan <you@gmail.com>"
//          MAIL_PROVIDER   — 'resend' | 'brevo' (default: brevo when BREVO_API_KEY is set)
//
// Two paths, one response shape:
//   • New email     → admin invite creates the auth user, profile is inserted
//                     with must_change_password=true, and the email asks the
//                     candidate to set a password.
//   • Existing user → no duplicate account. A magic login link is generated for
//                     the account's own profile/username and the email simply
//                     signs them in.
// No temporary password is ever created, stored, or relayed by an admin.
//
// The tryout is marked ACCEPTED with the caller's JWT (not the service role):
// guard_tryout_verdict (0034) only lets OWNER/ADMIN resolve requests, so a
// service-role update is rejected. If that update still fails the account and
// link are returned anyway with resolved=false, so nothing is lost.
//
// Caller must be OWNER/ADMIN (verified server-side). Flow:
// PENDING tryout (with email) → link + profile → email → tryout ACCEPTED.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS });
const fail = (error: string, status = 400) => json({ error }, status);

function cleanUsername(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'viking';
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function inviteEmail(input: {
  name: string;
  username: string;
  link: string;
  existing: boolean;
}) {
  const { existing } = input;
  const safeUser = esc(input.username);
  const safeLink = esc(input.link);
  const subject = existing
    ? 'Welcome back — set your VIK Clan password'
    : 'You’ve been invited — VIK Clan';
  const action = existing
    ? 'Open this single-use link to sign in and choose a new password (it expires soon):'
    : 'Set your password to enter the clan (this single-use link expires soon):';
  const text = [
    `Salam ${input.name},`,
    '',
    existing
      ? `Your tryout is accepted. Sign in to your VIK Clan account (@${input.username}) with the link below, then choose a new password.`
      : `Your tryout is accepted. Your warrior name is @${input.username}.`,
    '',
    action,
    input.link,
    '',
    existing
      ? "If you didn't ask to join VIK Clan, ignore this email."
      : "Didn't ask to join VIK Clan? Ignore this email.",
  ].join('\n');
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#0b1120;">
    <div style="margin:0;padding:40px 12px;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;color:#f8fafc;">
      <div style="max-width:520px;margin:0 auto;background-color:#111c30;border:1px solid #263650;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <div style="padding:32px 24px;text-align:center;background-color:#162743;border-bottom:1px solid #263650;">
          <img
            src="https://qbgquikpywdmujwtchyx.supabase.co/storage/v1/object/public/logo/avatar.jpeg"
            alt="VIK Clan"
            width="96"
            height="96"
            style="display:block;width:96px;height:96px;margin:0 auto 18px;border:2px solid #d5ad62;border-radius:14px;"
          />
          <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:4px;">
            VIK CLAN
          </h1>
          <p style="margin:12px 0 0;color:#d5ad62;font-size:12px;letter-spacing:3px;">
            ONE CLAN. ONE LEGACY.
          </p>
        </div>

        <!-- Invitation -->
        <div style="padding:36px 30px;text-align:center;">
          <div style="font-size:42px;margin-bottom:16px;">⚔️</div>

          <h2 style="margin:0 0 18px;color:#ffffff;font-size:26px;">
            ${existing ? 'Welcome Back, Warrior' : "You've Been Invited"}
          </h2>

          <p style="margin:0 0 14px;color:#c0cadb;font-size:15px;line-height:1.8;">
            ${existing
              ? `Your tryout is accepted. Sign in as <strong style="color:#d5ad62">@${safeUser}</strong>, then choose a new password to secure your account.`
              : `A place awaits you among the warriors of VIK Clan. Your warrior name is <strong style="color:#d5ad62">@${safeUser}</strong>.`}
          </p>

          <p style="margin:0 0 28px;color:#c0cadb;font-size:15px;line-height:1.8;">
            ${existing
              ? 'This single-use link signs you in and asks for a new password — it expires soon.'
              : "Accept your invitation and join us as we build our legacy together. This single-use link expires soon."}
          </p>

          <a
            href="${safeLink}"
            style="display:inline-block;padding:16px 34px;background-color:#d5ad62;color:#0b1120;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;border-radius:8px;"
          >
            ${existing ? 'SIGN IN & SET PASSWORD' : 'ACCEPT INVITATION'}
          </a>

          <p style="margin:28px 0 10px;color:#9aa9c0;font-size:12px;line-height:1.6;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>

          <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;">
            <a href="${safeLink}" style="color:#d5ad62;text-decoration:underline;">
              ${existing ? 'Sign in to VIK Clan' : 'Accept your VIK Clan invitation'}
            </a>
          </p>
        </div>

        <!-- Footer -->
        <div style="padding:22px 24px;text-align:center;background-color:#0d1728;border-top:1px solid #263650;">
          <p style="margin:0 0 8px;color:#d5ad62;font-size:12px;font-weight:bold;letter-spacing:2px;">
            ONE CLAN. ONE LEGACY.
          </p>
          <p style="margin:0;color:#8796ad;font-size:11px;line-height:1.7;">
            ${existing
              ? "If you weren't expecting this e-mail, you can safely ignore it."
              : "If you weren't expecting this invitation, you can safely ignore this email."}
          </p>
          <p style="margin:14px 0 0;color:#64748b;font-size:10px;">
            © VIK Clan. All rights reserved.
          </p>
        </div>

      </div>
    </div>
  </body>
</html>`;
  return { subject, html, text };
}

type MailDelivery = { sent: boolean; error?: string; quota?: boolean };

// Accepts both "Name <email>" and a bare address.
function parseSender(raw: string): { name: string; email: string } {
  const match = raw.trim().match(/^(.*?)\s*<([^<>]+)>\s*$/);
  if (match) return { name: match[1].trim() || 'VIK Clan', email: match[2].trim() };
  return { name: 'VIK Clan', email: raw.trim() };
}

async function postEmail(
  provider: 'Resend' | 'Brevo',
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<MailDelivery> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Never leave the admin waiting on the email provider's connection.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      // A spent daily allowance / rate limit is recoverable: the caller can
      // still hand the one-time link over manually (copy / WhatsApp).
      const quota = res.status === 402 || res.status === 429 ||
        /not_enough_credits|daily limit|limit reached|quota|too many requests/i.test(detail);
      return { sent: false, error: `${provider} ${res.status}: ${detail}`, quota };
    }
    return { sent: true };
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    return {
      sent: false,
      error: timedOut
        ? 'Email service timed out after 10s'
        : err instanceof Error ? err.message : 'Email request failed',
    };
  }
}

async function sendInviteEmail(input: {
  to: string;
  name: string;
  username: string;
  link: string;
  existing: boolean;
}): Promise<MailDelivery> {
  const { subject, html, text } = inviteEmail(input);
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const provider = (Deno.env.get('MAIL_PROVIDER') ?? (brevoKey ? 'brevo' : 'resend')).toLowerCase();

  // Brevo lets a single verified sender address work without owning a domain
  // (useful before a Resend domain is verified). Free-mail senders may be
  // rewritten by Brevo to @brevosend.com.
  if (provider === 'brevo') {
    if (!brevoKey) return { sent: false, error: 'BREVO_API_KEY not configured' };
    const from = Deno.env.get('MAIL_FROM') ?? '';
    if (!from) {
      return { sent: false, error: 'MAIL_FROM not configured (verified Brevo sender)' };
    }
    return postEmail('Brevo', 'https://api.brevo.com/v3/smtp/email', {
      'api-key': brevoKey,
      'Content-Type': 'application/json',
    }, {
      sender: parseSender(from),
      to: [{ email: input.to }],
      subject,
      htmlContent: html,
      textContent: text,
    });
  }

  if (provider !== 'resend') {
    return { sent: false, error: `Unknown MAIL_PROVIDER "${provider}"` };
  }
  const key = Deno.env.get('RESEND_API_KEY') ?? '';
  if (!key) return { sent: false, error: 'RESEND_API_KEY not configured' };
  const from = Deno.env.get('RESEND_FROM') ?? 'VIK Clan <onboarding@resend.dev>';
  return postEmail('Resend', 'https://api.resend.com/emails', {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }, { from, to: [input.to], subject, html, text });
}

type SupabaseAdmin = SupabaseClient;

async function pickUsername(supabase: SupabaseAdmin, raw: string): Promise<string | null> {
  let base = cleanUsername(raw);
  if (base.length < 3) base = `viking_${base}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = attempt === 0 ? '' : String(Math.floor(10 + Math.random() * 90));
    const candidate = attempt === 0 ? base : `${base.slice(0, 24 - suffix.length)}${suffix}`;
    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .limit(1);
    if (!taken || (taken as unknown[]).length === 0) return candidate;
  }
  return null;
}

async function generateLink(
  supabase: SupabaseAdmin,
  type: 'invite' | 'magiclink',
  email: string,
  redirectTo?: string,
) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type,
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });
  return {
    link: data?.properties?.action_link ?? '',
    userId: data?.user?.id ?? '',
    createdAt: data?.user?.created_at ?? '',
    error: error?.message ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Caller must be an active OWNER/ADMIN — testers and players are refused.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const { data: caller, error: authErr } = await supabase.auth.getUser(jwt);
  if (!caller?.user) {
    // Diagnostic only — never log the token itself.
    console.error('accept-tryout unauthorized', {
      hasHeader: !!authHeader,
      tokenSegments: jwt ? jwt.split('.').length : 0,
      reason: authErr?.message ?? 'no user',
    });
    return fail('Unauthorized', 401);
  }
  const { data: actor } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', caller.user.id)
    .single();
  if (!actor || (actor as { status: string }).status !== 'ACTIVE' ||
      !['OWNER', 'ADMIN'].includes((actor as { role: string }).role)) {
    return fail('Forbidden', 403);
  }

  let tryoutId = '';
  try {
    const body = await req.json();
    tryoutId = typeof body?.tryout_id === 'string' ? body.tryout_id : '';
  } catch {
    return fail('Bad request', 400);
  }
  if (!tryoutId) return fail('Missing tryout_id', 400);

  const { data: row, error: tErr } = await supabase
    .from('tryout_requests')
    .select('id,name,email,status')
    .eq('id', tryoutId)
    .maybeSingle();
  if (tErr) return fail(tErr.message, 500);
  const tryout = row as {
    id: string;
    name: string;
    email: string | null;
    status: string;
  } | null;
  if (!tryout) return fail('Not found', 404);
  if (tryout.status === 'DECLINED') return fail('Already resolved', 409);
  // A retry after a dropped response re-issues the link instead of dead-ending.
  const alreadyAccepted = tryout.status === 'ACCEPTED';
  if (!tryout.email || !/.+@.+\..+/.test(tryout.email)) {
    return fail('Tryout has no valid email — ask the candidate first.', 400);
  }
  // Auth normalizes emails to lowercase; compare and store the same way.
  const email = tryout.email.trim().toLowerCase();

  // Existing account? Link it instead of creating a duplicate.
  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select('id,username,status,role')
    .eq('email', email)
    .order('created_at', { ascending: true })
    .limit(1);
  if (profileErr) return fail(profileErr.message, 500);
  let profile = (profileRows?.[0] ?? null) as {
    id: string;
    username: string;
    status: string;
    role: string;
  } | null;
  // Decides whether the email says "sign in" (account already exists) or
  // "set your password" (fresh profile).
  let accountExisting = !!profile;

  if (profile && ['SUSPENDED', 'REMOVED'].includes(profile.status)) {
    return fail('This account is suspended or removed — restore it before accepting the tryout.', 409);
  }

  // Existing player accounts sign in with a magic link; the flag below then
  // forces a fresh password. Owners/admins are left alone.

  const appUrl = (Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? '').replace(/\/+$/, '');
  const redirectTo = appUrl ? `${appUrl}/home` : undefined;

  // Existing profile → magic login link for that account.
  // No profile → try an admin invite, but fall back to a magic link if the auth
  // user already exists without a profile (a previously interrupted accept).
  let link = profile
    ? await generateLink(supabase, 'magiclink', email, redirectTo)
    : await generateLink(supabase, 'invite', email, redirectTo);

  if (!profile && (link.error || !link.link || !link.userId)) {
    const magic = await generateLink(supabase, 'magiclink', email, redirectTo);
    if (magic.link && magic.userId) {
      link = magic;
    } else {
      return fail(link.error ?? magic.error ?? 'Could not create the invite link.', 500);
    }
  }

  if (link.error || !link.link || !link.userId) {
    return fail(link.error ?? 'Could not create the login link.', 500);
  }

  if (profile && profile.id !== link.userId) {
    return fail('This email is linked to a different login account — repair the profile first.', 409);
  }

  if (!profile) {
    // Create the profile for the auth user returned by the invite/magic link.
    const username = await pickUsername(supabase, tryout.name);
    if (!username) return fail('Could not pick a username.', 500);

    const { error: pErr } = await supabase.from('profiles').insert({
      id: link.userId,
      username,
      display_name: tryout.name.trim().slice(0, 40),
      email,
      role: 'PLAYER',
      status: 'ACTIVE',
      // No password exists yet — the app blocks entry until one is set.
      must_change_password: true,
    });
    if (pErr) {
      // Another profile may already own this auth id; reuse it rather than
      // destroying a possibly pre-existing account.
      if (pErr.code === '23505') {
        const { data: byId } = await supabase
          .from('profiles')
          .select('id,username,status,role')
          .eq('id', link.userId)
          .maybeSingle();
        if (byId) {
          profile = byId as { id: string; username: string; status: string; role: string };
          accountExisting = true;
        }
      }
      if (!profile) {
        // Roll back only a user this request just created. An orphan auth user
        // from an earlier attempt must survive so an admin can retry.
        const created = Date.parse(link.createdAt);
        const createdNow = Number.isFinite(created) && Date.now() - created < 120_000;
        if (createdNow) await supabase.auth.admin.deleteUser(link.userId);
        return fail(pErr.message, 500);
      }
    } else {
      profile = { id: link.userId, username, status: 'ACTIVE', role: 'PLAYER' };
    }
  }
  if (!profile) return fail('Could not create the profile.', 500);

  // Every accepted tryout sets its own password: a fresh row already carries
  // the flag, and an existing player account gets it here before the magic
  // link signs them in. Owners/admins are left alone.
  if (profile.role === 'PLAYER') {
    const { error: flagErr } = await supabase
      .from('profiles')
      .update({ must_change_password: true, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (flagErr) return fail(flagErr.message, 500);
  }

  // Email is best-effort: the link still reaches the admin if delivery fails.
  const delivery = await sendInviteEmail({
    to: email,
    name: tryout.name.trim().slice(0, 40),
    username: profile.username,
    link: link.link,
    existing: accountExisting,
  });

  // Resolve with the caller's JWT: the 0034 trigger permits OWNER/ADMIN and
  // rejects the service role, so this is the only path that reliably writes.
  let statusError: string | null = null;
  if (!alreadyAccepted) {
    const update = { status: 'ACCEPTED', updated_at: new Date().toISOString() };
    if (anonKey) {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data: updated, error } = await callerClient
        .from('tryout_requests')
        .update(update)
        .eq('id', tryoutId)
        .select('id')
        .maybeSingle();
      statusError = error?.message ?? (updated ? null : 'No row updated');
    } else {
      const { data: updated, error } = await supabase
        .from('tryout_requests')
        .update(update)
        .eq('id', tryoutId)
        .select('id')
        .maybeSingle();
      statusError = error?.message ?? (updated ? null : 'No row updated');
    }
    if (statusError) {
      console.error('accept-tryout: tryout status update failed', { tryoutId, statusError });
    }
  }

  return json({
    user_id: profile.id,
    username: profile.username,
    email,
    existing: accountExisting,
    email_sent: delivery.sent,
    email_error: delivery.error ?? null,
    email_quota_reached: delivery.quota === true,
    invite_link: link.link,
    resolved: alreadyAccepted || statusError === null,
    status_error: statusError,
    already_accepted: alreadyAccepted,
  });
});
