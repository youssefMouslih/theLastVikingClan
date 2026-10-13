// Official WhatsApp glyph (public/whatsapp.svg) for every WhatsApp button.
// Kept as an <img> so the brand mark renders identically everywhere.
export default function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <img src="/whatsapp.svg" alt="" aria-hidden draggable={false} className={`shrink-0 ${className}`} />;
}
