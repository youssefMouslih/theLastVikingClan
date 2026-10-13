import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Toast (Snackbar): role="status" live region, consistent bottom corner,
// auto-dismiss nonessential messages after a short delay. The timer pauses
// while the toast is hovered or holds keyboard focus.
interface ToastItem {
  id: number;
  message: string;
  sticky?: boolean;
}

const ToastCtx = createContext<{ toast: (message: string, opts?: { sticky?: boolean }) => void }>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback((message: string, opts?: { sticky?: boolean }) => {
    const id = nextId++;
    setItems((prev) => [...prev.slice(-2), { id, message, sticky: opts?.sticky }]);
    if (!opts?.sticky) {
      timers.current.set(id, setTimeout(() => dismiss(id), 4000));
    }
  }, [dismiss]);

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const resume = useCallback((id: number) => {
    if (timers.current.has(id)) return;
    timers.current.set(id, setTimeout(() => dismiss(id), 4000));
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div aria-live="off" className="pointer-events-none fixed inset-x-0 bottom-20 z-[9998] mx-auto flex w-full max-w-sm flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            onMouseEnter={() => pause(item.id)}
            onMouseLeave={() => { if (!item.sticky) resume(item.id); }}
            onFocus={() => pause(item.id)}
            onBlur={() => { if (!item.sticky) resume(item.id); }}
            className="anim-rise pointer-events-auto flex w-full items-center gap-2 rounded-xl border border-brand-500/40 bg-[var(--surface-2)] px-3 py-2.5 text-sm font-semibold shadow-xl shadow-black/50"
          >
            <span className="flex-1">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
