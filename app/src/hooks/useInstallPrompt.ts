import { useEffect, useState } from 'react';

// Shared PWA install state: the browser fires beforeinstallprompt at most
// once per session, so the deferred event lives in a module singleton that
// every install entry point (Home card, Settings) reads from.
export interface DeferredPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: DeferredPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as DeferredPrompt;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Mac/i.test(ua) && navigator.maxTouchPoints > 1; // iPadOS desktop mode
}

export function useInstallPrompt() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((x) => x + 1);
    listeners.add(fn);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', fn);
    return () => {
      listeners.delete(fn);
      mq?.removeEventListener?.('change', fn);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === 'accepted';
  };

  return { canInstall: !!deferred && !isInstalled(), installed: isInstalled(), ios: isIOSDevice(), install };
}
