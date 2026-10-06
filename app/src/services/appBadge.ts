import { supabase } from '../lib/supabase';

// PWA app badge (web equivalent of NSApp.dockTile.badgeLabel): shows the
// unread notification count on the installed app icon (Badging API).
// Clearing when zero is the equivalent of clearing badgeLabel. No-ops
// where the API is unsupported (desktop Chrome/Edge + Android support it;
// iOS Safari currently does not — the in-app raven bell stays the fallback).
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function badgeSupported(): boolean {
  const nav = navigator as BadgeNavigator;
  return typeof nav.setAppBadge === 'function';
}

export async function syncAppBadge(userId: string | null | undefined): Promise<number> {
  let unread = 0;
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: false })
        .eq('user_id', userId)
        .is('read_at', null)
        .limit(99);
      if (!error) unread = (data ?? []).length;
    } catch {
      // Badge never breaks the UI; in-app bell is the fallback.
    }
  }
  try {
    const nav = navigator as BadgeNavigator;
    if (unread > 0) await nav.setAppBadge?.(unread);
    else await nav.clearAppBadge?.();
  } catch {
    // Unsupported or denied — ignore.
  }
  return unread;
}

export async function clearAppBadge(): Promise<void> {
  try {
    await (navigator as BadgeNavigator).clearAppBadge?.();
  } catch { /* ignore */ }
}

export const appBadgeService = { badgeSupported, syncAppBadge, clearAppBadge };
