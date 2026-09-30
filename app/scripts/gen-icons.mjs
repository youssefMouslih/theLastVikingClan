// Generates PWA icons + screenshots + iOS splash from public/logo.png.
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(root, { recursive: true });
const logo = join(root, 'logo.png');

const out = async (name, pipeline) => {
  await pipeline.toFile(join(root, name));
  console.log('wrote', name);
};

await out('pwa-192x192.png', sharp(logo).resize(192, 192).png());
await out('pwa-512x512.png', sharp(logo).resize(512, 512).png());
await out(
  'maskable-512x512.png',
  sharp(logo).resize(400, 400).extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#0a0a0a' }).png(),
);
await out('apple-touch-icon.png', sharp(logo).resize(180, 180).png());

// Emblem centered on Void Black for store/install UI + iOS splash.
const framed = async (w, h, logoSize) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: '#08090a' },
  })
    .composite([{ input: await sharp(logo).resize(logoSize, logoSize).png().toBuffer(), gravity: 'center' }])
    .png();

await out('screenshot-wide.png', await framed(1280, 720, 420));
await out('screenshot-narrow.png', await framed(750, 1334, 420));
await out('apple-splash-1170.png', await framed(1170, 2532, 560));
await out('apple-splash-2048.png', await framed(2048, 2732, 760));
