/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown };

// App shell precache (injected at build time).
precacheAndRoute(self.__WB_MANIFEST as never);
cleanupOutdatedCaches();

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

// Raven Messages: render the push even when the app is closed.
self.addEventListener('push', (event: PushEvent) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() ?? {}) as PushPayload;
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  const title = data.title || 'VIK Clan';
  const options = {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'vik',
    vibrate: [120, 60, 120],
    data: { url: data.url || '/' },
  } as NotificationOptions & { vibrate?: number[] };
  (options as Record<string, unknown>).renotify = true;
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping the notification opens/focuses the right screen.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/';
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) {
          try {
            await (w as WindowClient).navigate(url);
            return (w as WindowClient).focus();
          } catch { /* fall through to open */ }
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
