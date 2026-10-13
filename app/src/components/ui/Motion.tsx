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

// Fullscreen evidence viewer (tap photo to enlarge, tap anywhere to close).
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="anim-rise fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <img src={src} alt="Evidence enlarged" className="max-h-full max-w-full rounded-xl object-contain" />
    </div>
  );
}

// Skeleton rows while lists load. Wrap in LoadingRegion so the region
// carries aria-busy while the geometry-preserving skeleton shows.
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-16" />
      ))}
    </div>
  );
}

// Geometry-preserving card skeleton: same footprint as the final card
// (avatar row + title bar + stats block) so layout never jumps.
export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="skeleton h-24" />
      <div className="flex items-center gap-2">
        <div className="skeleton h-16 w-16 !rounded-full" />
        <div className="skeleton h-10 flex-1" />
      </div>
      <div className="skeleton h-28" />
    </div>
  );
}

// Spinner for waits with no meaningful content shape.
export function Spinner({ label }: { label: string }) {
  return (
    <p role="status" className="py-6 text-center text-sm opacity-70">
      <span aria-hidden className="me-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-400 border-t-transparent align-middle" />
      {label}
    </p>
  );
}

// Loading region: aria-busy while loading; swaps skeleton/spinner for
// content the moment loading completes.
export function LoadingRegion({
  loading,
  label,
  skeleton = 'list',
  children,
}: {
  loading: boolean;
  label: string;
  skeleton?: 'list' | 'card' | 'spinner';
  children: ReactNode;
}) {
  if (!loading) return <>{children}</>;
  return (
    <div aria-busy="true" aria-label={label}>
      {skeleton === 'card' ? <SkeletonCard /> : skeleton === 'spinner' ? <Spinner label={label} /> : <SkeletonList rows={4} />}
    </div>
  );
}
