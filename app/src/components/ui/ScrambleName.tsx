import { useEffect, useRef, useState } from 'react';

// Text scramble (decode) effect for the VIK warrior name: each character
// cycles random glyphs then locks into the real one left to right
// (rAF loop with a per-character settle deadline). Monospace/tabular glyphs
// keep the width from jittering. The final string is exposed via aria-label
// with the churning span aria-hidden; prefers-reduced-motion renders
// the text instantly.
const GLYPHS = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖ#*+<>01';

function scrambleFrame(target: string, settledUntil: number): string {
  let out = '';
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    if (i < settledUntil) out += ch;
    else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }
  return out;
}

export default function ScrambleName({
  text,
  className = '',
  durationMs = 900,
}: {
  text: string;
  className?: string;
  durationMs?: number;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const raf = useRef(0);
  const done = frame === null;

  useEffect(() => {
    // Reduced motion: leave the initial (final) text untouched.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const settledUntil = Math.floor(p * (text.length + 1));
      if (p >= 1) {
        setFrame(null);
        return;
      }
      setFrame(scrambleFrame(text, settledUntil));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, durationMs]);

  return (
    <span aria-label={text} className={`font-mono tabular-nums ${className}`}>
      <span aria-hidden>{done ? text : (frame ?? text)}</span>
    </span>
  );
}
