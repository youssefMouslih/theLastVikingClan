// Generates PWA icons (§121) from an inline SVG. Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(root, { recursive: true });

const icon = (size, pad = 0) => {
  const s = size - pad * 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0a0a0a"/>
  <g transform="translate(${pad},${pad})">
    <text x="${s / 2}" y="${s * 0.72}" font-family="system-ui,sans-serif" font-weight="900" font-size="${s * 0.62}" fill="#aa3bff" text-anchor="middle">V</text>
  </g>
</svg>`);
};

const jobs = [
  ['pwa-192x192.png', 192, 0],
  ['pwa-512x512.png', 512, 0],
  ['maskable-512x512.png', 512, 64],
  ['apple-touch-icon.png', 180, 0],
];

for (const [name, size, pad] of jobs) {
  await sharp(icon(size, pad)).png().toFile(join(root, name));
  console.log('wrote', name);
}
