import { useEffect, useRef, useState, type ReactNode } from 'react';

// Staggered entrance wrapper.
export function FadeIn({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`anim-rise ${className}`} style={{ '--rise-delay': `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}

// Animated number that counts up to target on mount.
export function CountUp({ value, duration = 800, className = '' }: { value: number; duration?: number; className?: string }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * value));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className={className}>{n.toLocaleString()}</span>;
}

// Live ticking countdown to an ISO deadline.
export function Countdown({ deadline, urgentHours = 3 }: { deadline: string; urgentHours?: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const urgent = h < urgentHours;
  const pad = (x: number) => String(x).padStart(2, '0');
  return (
    <span className={`font-mono font-bold tabular-nums ${urgent ? 'text-red-400' : ''}`}>
      {urgent && <span className="live-dot-red me-1" aria-hidden />}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

// Friendly empty state with icon.
export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 p-6 text-center">
      <span className="text-brand-400">{icon}</span>
      <p className="font-bold">{title}</p>
      {hint && <p className="text-xs opacity-60">{hint}</p>}
    </div>
  );
}

// Skeleton rows while lists load.
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-16" />
      ))}
    </div>
  );
}
