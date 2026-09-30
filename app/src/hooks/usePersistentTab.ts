import { useState } from 'react';

// SPA tab persistence: returning to a page restores the last open tab
// instead of resetting position (critical on mobile back-gestures).
export function usePersistentTab<T extends string>(key: string, initial: T, valid: readonly T[]): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && (valid as readonly string[]).includes(saved)) return saved as T;
    } catch { /* ignore */ }
    return initial;
  });
  const setTab = (t: T) => {
    setTabState(t);
    try {
      localStorage.setItem(key, t);
    } catch { /* ignore */ }
  };
  return [tab, setTab];
}
