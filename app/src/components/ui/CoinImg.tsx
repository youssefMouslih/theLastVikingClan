import { useState } from 'react';
import Icon from './Icon';

// Clan coin (/coin.png). Falls back to a medal glyph until the file exists.
export default function CoinImg({ className = 'h-5 w-5' }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <Icon name="medal" className={className} />;
  return <img src="/coin.png" alt="" aria-hidden onError={() => setMissing(true)} className={`${className} rounded-full object-cover`} />;
}
