import { supabase } from '../lib/supabase';

// Raven Messages groundwork: stores Web Push subscriptions per member.
// Delivery activates with the Phase 9 Edge Function (VAPID sender).
// VAPID public key comes from VITE_VAPID_PUBLIC_KEY (optional until then).

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Mac/i.test(ua) && navigator.maxTouchPoints > 1;
}

export function isStandalone(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iOS only allows push inside the home-screen app, never in Safari itself.
export function needsInstallFirst(): boolean {
  return isIOS() && !isStandalone();
}

export function vapidKey(): string | null {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;
}

export async function pushStatus(playerId: string): Promise<'on' | 'off' | 'unsupported' | 'no-key'> {
  if (!pushSupported()) return 'unsupported';
  if (!vapidKey()) return 'no-key';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return 'off';
    const { data } = await supabase.from('push_subscriptions').select('id').eq('player_id', playerId).eq('endpoint', sub.endpoint).maybeSingle();
    return data ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function subscribePush(playerId: string): Promise<void> {
  const key = vapidKey();
  if (!key) throw new Error('VAPID key missing.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications blocked.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { player_id: playerId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    { onConflict: 'player_id,endpoint' },
  );
  if (error) throw new Error(error.message);
}

export async function unsubscribePush(playerId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('player_id', playerId).eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Failed.');
  }
}

export const pushService = { pushSupported, isIOS, isStandalone, needsInstallFirst, vapidKey, pushStatus, subscribePush, unsubscribePush, client: supabase };
