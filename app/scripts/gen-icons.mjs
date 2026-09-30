// Generates PWA icons (§121) from public/logo.png (clan emblem).
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(root, { recursive: true });
const logo = join(root, 'logo.png');

await sharp(logo).resize(192, 192).png().toFile(join(root, 'pwa-192x192.png'));
console.log('wrote pwa-192x192.png');
await sharp(logo).resize(512, 512).png().toFile(join(root, 'pwa-512x512.png'));
console.log('wrote pwa-512x512.png');
await sharp(logo)
  .resize(400, 400)
  .extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#0a0a0a' })
  .png()
  .toFile(join(root, 'maskable-512x512.png'));
console.log('wrote maskable-512x512.png');
await sharp(logo).resize(180, 180).png().toFile(join(root, 'apple-touch-icon.png'));
console.log('wrote apple-touch-icon.png');
