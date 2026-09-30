// VIK Clan Raven sender: delivers a stored in-app notification as a Web Push.
// Deploy: supabase functions deploy send-push --no-verify-jwt=false (keep JWT!)
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@…),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically on deploy).
//
// The app calls this with { notification_id } right after inserting the row.
// The function only pushes to subscriptions belonging to that row's user,
// so callers can't spam arbitrary targets.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:vik@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const URLS: Record<string, string> = {
  match: '/matches/',
  competition: '/competitions/',
  battle: '/battles',
};

function targetUrl(n: { entity_type: string | null; entity_id: string | null }): string {
  if (n.entity_type === 'match' && n.entity_id) return `/matches/${n.entity_id}`;
  if (n.entity_type === 'competition' && n.entity_id) return `/competitions/${n.entity_id}`;
  if (n.entity_type === 'battle') return '/battles';
  void URLS;
  return '/home';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Caller must be authenticated (any clan member may trigger their own flows).
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: caller } = await supabase.auth.getUser(jwt);
  if (!caller?.user) return new Response('Unauthorized', { status: 401 });

  let notification_id = '';
  try {
    notification_id = (await req.json()).notification_id ?? '';
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!notification_id) return new Response('Missing notification_id', { status: 400 });

  const { data: notif } = await supabase
    .from('notifications')
    .select('id,user_id,type,title,message,entity_type,entity_id')
    .eq('id', notification_id)
    .single();
  if (!notif) return new Response('Not found', { status: 404 });

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('user_id', (notif as { user_id: string }).user_id);
  if (!subs?.length) return Response.json({ delivered: 0, reason: 'no subscriptions' });

  const payload = JSON.stringify({
    title: (notif as { title: string }).title,
    body: (notif as { message: string }).message.slice(0, 140),
    url: targetUrl(notif as { entity_type: string | null; entity_id: string | null }),
    tag: (notif as { id: string }).id,
  });

  let delivered = 0;
  for (const s of subs as { endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as never,
        payload,
      );
      delivered++;
    } catch (e) {
      // 410 Gone = uninstalled; prune it.
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('410')) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }
  return Response.json({ delivered });
});
