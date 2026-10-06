import { supabase } from '../lib/supabase';
import { setHonourImage, type Honour } from './honourService';
import { uploadBadgeImage, getBadgeImageUrl } from './storageService';

// Badge forge: AI-assisted Viking badge generation for clan honours.
//
// What exists today: the `achievements` table holds every badge type the app
// awards (LEAGUE/CUP/TOURNAMENT_CHAMPION, SEASON_MVP, SPECIAL, FIRST_BLOOD,
// STREAK_5, STREAK_10) plus the 8 saga levels — as text rows with no artwork,
// shown in the Hall of Fame, notifications and the gallery. The forge renders
// one coherent CCLAN Viking badge PNG per honour and stores the path on
// `achievements.image_url` (migration 0024), files in `clan-assets/badges/`.
//
// Providers (free/local first):
// - `local-norse` (default): procedural canvas renderer. Zero dependencies,
//   runs on any CPU, deterministic per badge. Always available.
// - `diffusion` (optional): local open-source diffusion runtime behind an
//   A1111-compatible HTTP API (Stable Diffusion via AUTOMATIC1111/Forge).
//   Enable with VITE_BADGE_DIFFUSION_URL. Falls back to local on any error.
// Critical readable text (names, titles) is NEVER left to the image model:
// it is drawn programmatically on canvas after generation.
//
// Agent entry points: `generateOne`, `generateBatch`, `previewBadge`.

// ---- 1. Clan visual identity (references: /logo.png emblem, /coin.png Glory) ----
export const CLAN_IDENTITY = {
  name: 'The Last Viking',
  tag: 'VIK',
  gold: '#eab308',
  goldBright: '#fcd34d',
  steel: ['#9aa1b2', '#3a3f4d', '#d7dce6'],
  abyss: '#0f0f23',
  referenceAssets: ['/logo.png', '/coin.png'],
  motifs: [
    'round viking shield with iron boss',
    'norse knotwork border band',
    'elder futhark rune ring',
    'raven silhouette',
    'engraved steel medallion',
  ],
} as const;

export type BadgeMotif = 'shield' | 'cup' | 'axe' | 'stone' | 'raven' | 'swords' | 'crown' | 'flame';

export interface BadgeFamily {
  type: string;
  metal: [string, string, string];
  accent: string;
  cloth: string;
  motif: BadgeMotif;
  rune: string;
}

// One visual identity per badge type; same family language (engraved ring +
// knotwork + rune circle + Valhalla Gold) across all of them.
export const BADGE_FAMILIES: Record<string, BadgeFamily> = {
  LEAGUE_CHAMPION: { type: 'LEAGUE_CHAMPION', metal: ['#fcd34d', '#b45309', '#fde68a'], accent: '#eab308', cloth: '#241a05', motif: 'shield', rune: 'ᛟ' },
  CUP_CHAMPION: { type: 'CUP_CHAMPION', metal: ['#e6ebf4', '#6b7280', '#f8fafc'], accent: '#22d3ee', cloth: '#0b1520', motif: 'cup', rune: 'ᚷ' },
  TOURNAMENT_CHAMPION: { type: 'TOURNAMENT_CHAMPION', metal: ['#d08a4e', '#7c4a21', '#f0c08a'], accent: '#f43f5e', cloth: '#200f0a', motif: 'axe', rune: 'ᚦ' },
  SEASON_MVP: { type: 'SEASON_MVP', metal: ['#c4b5fd', '#6d28d9', '#ede9fe'], accent: '#a78bfa', cloth: '#150f26', motif: 'crown', rune: 'ᚨ' },
  SPECIAL: { type: 'SPECIAL', metal: ['#9aa1b2', '#23262e', '#d7dce6'], accent: '#e2e8f0', cloth: '#101318', motif: 'raven', rune: 'ᚺ' },
  FIRST_BLOOD: { type: 'FIRST_BLOOD', metal: ['#f87171', '#7f1d1d', '#fecaca'], accent: '#ef4444', cloth: '#200a0a', motif: 'swords', rune: 'ᛏ' },
  STREAK_5: { type: 'STREAK_5', metal: ['#fdba74', '#9a3412', '#ffedd5'], accent: '#fb923c', cloth: '#201105', motif: 'flame', rune: 'ᚲ' },
  STREAK_10: { type: 'STREAK_10', metal: ['#fcd34d', '#92400e', '#fef3c7'], accent: '#f59e0b', cloth: '#221503', motif: 'flame', rune: 'ᛊ' },
};

export const FALLBACK_FAMILY: BadgeFamily = {
  type: 'SPECIAL', metal: ['#9aa1b2', '#23262e', '#d7dce6'], accent: '#e2e8f0', cloth: '#101318', motif: 'stone', rune: '᛭',
};

// Saga rank motifs (Outsider→Legend) for level badges.
export const LEVEL_MOTIFS: { motif: BadgeMotif; rune: string }[] = [
  { motif: 'stone', rune: 'ᚠ' },
  { motif: 'stone', rune: 'ᚢ' },
  { motif: 'shield', rune: 'ᚦ' },
  { motif: 'swords', rune: 'ᚨ' },
  { motif: 'axe', rune: 'ᚱ' },
  { motif: 'cup', rune: 'ᚷ' },
  { motif: 'crown', rune: 'ᚺ' },
  { motif: 'shield', rune: 'ᛟ' },
];

export function badgeFamilyFor(type: string): BadgeFamily {
  return BADGE_FAMILIES[type] ?? { ...FALLBACK_FAMILY, type };
}

export function levelFamily(rank: number): BadgeFamily {
  const clamped = Math.max(0, Math.min(LEVEL_MOTIFS.length - 1, rank));
  const slot = LEVEL_MOTIFS[clamped];
  return { type: `SAGA_LVL${clamped}`, metal: ['#fcd34d', '#8a6d1c', '#fef3c7'], accent: '#eab308', cloth: '#1c1611', motif: slot.motif, rune: slot.rune };
}

// ---- 2. Prompt builder (diffusion provider) ----
export interface BadgePrompt {
  prompt: string;
  negative: string;
}

export function buildBadgePrompt(family: BadgeFamily): BadgePrompt {
  const prompt = [
    'viking clan badge medallion, circular engraved steel coin',
    `${family.motif} emblem in the center`,
    'norse knotwork border band, elder futhark rune ring',
    `antique ${family.metal[0]} metal with ${CLAN_IDENTITY.gold} gold accents`,
    'dark abyssal background, heroic warrior atmosphere',
    'clan heraldry style, symmetrical, centered, high detail engraving',
    'in the style of the clan emblem reference: gold and steel, runic, no cartoon',
  ].join(', ');
  // Critical text is overlaid programmatically later — ban it from the model.
  const negative = 'text, letters, words, watermark, signature, blurry, deformed, extra limbs, cartoon, photorealistic face';
  return { prompt, negative };
}

// ---- 3. Pure helpers (deterministic, unit-tested) ----
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RAND6 = '0123456789abcdefghijklmnopqrstuvwxyz';
export function badgeFileName(type: string, playerId: string, now = Date.now(), rand = Math.random): string {
  const slug = type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'badge';
  const short = playerId.replace(/-/g, '').slice(0, 8);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += RAND6[Math.floor(rand() * RAND6.length)];
  return `${slug}-${short}-${now.toString(36)}-${suffix}.png`;
}

export function defaultConcurrency(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return Math.max(1, Math.min(4, Math.ceil(n / 2)));
}

// ---- 4. Providers ----
export interface BadgeSpec {
  type: string;
  title: string;
  subtitle: string;
  seed: string;
  size?: number;
}

export interface BadgeImageProvider {
  readonly id: 'local-norse' | 'diffusion';
  generate(spec: BadgeSpec): Promise<Blob>;
}

const FUTHARK = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

function drawMotif(ctx: CanvasRenderingContext2D, motif: BadgeMotif, cx: number, cy: number, r: number, metal: string[], accent: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = metal[1];
  ctx.strokeStyle = accent;
  ctx.lineWidth = r * 0.045;
  if (motif === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.85, -r * 0.55);
    ctx.lineTo(r * 0.85, r * 0.25);
    ctx.quadraticCurveTo(r * 0.85, r * 0.85, 0, r);
    ctx.quadraticCurveTo(-r * 0.85, r * 0.85, -r * 0.85, r * 0.25);
    ctx.lineTo(-r * 0.85, -r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // quadrant paint (clan stripes) + boss
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ffe500';
    ctx.fillRect(-r, -r, r * 0.5, r * 2);
    ctx.fillStyle = '#2540ff';
    ctx.fillRect(0, -r, r * 0.5, r * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-r, 0, r * 2, r);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = metal[0];
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = metal[2];
    ctx.fill();
  } else if (motif === 'cup') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.7);
    ctx.lineTo(r * 0.6, -r * 0.7);
    ctx.quadraticCurveTo(r * 0.55, r * 0.1, 0, r * 0.25);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.1, -r * 0.6, -r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-r * 0.12, r * 0.25, r * 0.24, r * 0.45);
    ctx.fillRect(-r * 0.4, r * 0.7, r * 0.8, r * 0.12);
  } else if (motif === 'axe') {
    ctx.rotate(-0.5);
    ctx.fillRect(-r * 0.1, -r, r * 0.2, r * 2);
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.95);
    ctx.quadraticCurveTo(r * 1.05, -r * 0.9, r * 0.95, -r * 0.1);
    ctx.quadraticCurveTo(r * 0.9, r * 0.5, r * 0.1, r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (motif === 'crown') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, r * 0.6);
    ctx.lineTo(-r * 0.8, -r * 0.2);
    ctx.lineTo(-r * 0.4, r * 0.1);
    ctx.lineTo(0, -r * 0.6);
    ctx.lineTo(r * 0.4, r * 0.1);
    ctx.lineTo(r * 0.8, -r * 0.2);
    ctx.lineTo(r * 0.8, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (motif === 'raven') {
    // stylised wings: two chevrons + diamond body
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.1);
      ctx.lineTo(s * r * 0.95, -r * 0.55);
      ctx.lineTo(s * r * 0.7, r * 0.25);
      ctx.lineTo(s * r * 0.95, r * 0.45);
      ctx.lineTo(0, r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.36);
    ctx.restore();
  } else if (motif === 'swords') {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * 0.6);
      ctx.fillRect(-r * 0.07, -r * 0.95, r * 0.14, r * 1.7);
      ctx.fillRect(-r * 0.3, r * 0.6, r * 0.6, r * 0.12);
      ctx.restore();
    }
  } else if (motif === 'flame') {
    for (const [k, c] of [[1, accent], [0.65, metal[0]], [0.35, metal[2]]] as const) {
      ctx.beginPath();
      ctx.moveTo(0, -r * k);
      ctx.quadraticCurveTo(r * 0.7 * k, -r * 0.3 * k, r * 0.45 * k, r * 0.2 * k);
      ctx.quadraticCurveTo(r * 0.3 * k, r * 0.75 * k, 0, r * 0.8 * k);
      ctx.quadraticCurveTo(-r * 0.3 * k, r * 0.75 * k, -r * 0.45 * k, r * 0.2 * k);
      ctx.quadraticCurveTo(-r * 0.7 * k, -r * 0.3 * k, 0, -r * k);
      ctx.fillStyle = c;
      ctx.fill();
    }
  } else {
    // rune stone
    ctx.beginPath();
    const w = r * 1.1;
    ctx.roundRect(-w / 2, -r * 0.85, w, r * 1.7, r * 0.3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function renderNorseBackground(spec: BadgeSpec, family: BadgeFamily, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(hashSeed(`${family.type}:${spec.seed}`));
  const c = size / 2;

  // Abyssal cloth background
  const bg = ctx.createRadialGradient(c, c * 0.85, size * 0.05, c, c, size * 0.72);
  bg.addColorStop(0, family.cloth);
  bg.addColorStop(1, CLAN_IDENTITY.abyss);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Star-dust scatter (deterministic)
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * size * 0.48;
    ctx.fillStyle = `rgba(252,211,77,${0.05 + rng() * 0.16})`;
    ctx.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2, 2);
  }

  // Engraved outer rings
  const ring = (rad: number, w: number, style: string | CanvasGradient) => {
    ctx.beginPath();
    ctx.arc(c, c, rad, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  const steel = ctx.createLinearGradient(0, 0, size, size);
  steel.addColorStop(0, family.metal[0]);
  steel.addColorStop(0.5, family.metal[1]);
  steel.addColorStop(1, family.metal[2]);
  ring(size * 0.47, size * 0.022, steel);
  ring(size * 0.435, size * 0.006, family.accent);
  ring(size * 0.30, size * 0.006, 'rgba(252,211,77,0.5)');

  // Rune circle (decorative Elder Futhark)
  ctx.fillStyle = 'rgba(252,211,77,0.75)';
  ctx.font = `${Math.round(size * 0.038)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = c + Math.cos(a) * size * 0.382;
    const y = c + Math.sin(a) * size * 0.382;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(FUTHARK[(hashSeed(spec.seed) + i * 7) % FUTHARK.length], 0, 0);
    ctx.restore();
  }

  // Knotwork band: interlaced diamonds + rivets
  const band = size * 0.335;
  ctx.strokeStyle = family.accent;
  ctx.lineWidth = size * 0.005;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = c + Math.cos(a) * band;
    const y = c + Math.sin(a) * band;
    const d = size * 0.012;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeRect(-d / 2, -d / 2, d, d);
    ctx.restore();
    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.arc(c + Math.cos(a + Math.PI / 32) * band, c + Math.sin(a + Math.PI / 32) * band, size * 0.004, 0, Math.PI * 2);
      ctx.fillStyle = family.metal[0];
      ctx.fill();
    }
  }

  // Center medallion + motif
  const med = ctx.createRadialGradient(c, c * 0.9, size * 0.02, c, c, size * 0.28);
  med.addColorStop(0, 'rgba(255,255,255,0.10)');
  med.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.beginPath();
  ctx.arc(c, c, size * 0.27, 0, Math.PI * 2);
  ctx.fillStyle = med;
  ctx.fill();
  drawMotif(ctx, family.motif, c, c * 0.98, size * 0.155, family.metal, family.accent);

  // Vignette
  const vig = ctx.createRadialGradient(c, c, size * 0.3, c, c, size * 0.55);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

async function composeBadgeText(bg: HTMLCanvasElement, title: string, subtitle: string): Promise<Blob> {
  const ctx = bg.getContext('2d')!;
  const size = bg.width;
  try {
    await document.fonts.ready;
  } catch { /* system fonts fallback */ }
  // Contrast plate for guaranteed legibility
  const plate = ctx.createLinearGradient(0, size * 0.62, 0, size);
  plate.addColorStop(0, 'rgba(5,6,7,0)');
  plate.addColorStop(0.35, 'rgba(5,6,7,0.78)');
  plate.addColorStop(1, 'rgba(5,6,7,0.92)');
  ctx.fillStyle = plate;
  ctx.fillRect(0, size * 0.62, size, size * 0.38);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fcd34d';
  ctx.font = `700 ${Math.round(size * 0.052)}px Cinzel, Georgia, serif`;
  const top = title.toUpperCase().slice(0, 26);
  // Shrink-to-fit so exact names never clip
  let tw = ctx.measureText(top).width;
  if (tw > size * 0.86) {
    ctx.font = `700 ${Math.round(size * 0.052 * (size * 0.86) / tw)}px Cinzel, Georgia, serif`;
  }
  ctx.fillText(top, size / 2, size * 0.82);
  ctx.fillStyle = 'rgba(226,232,240,0.85)';
  ctx.font = `600 ${Math.round(size * 0.034)}px "Chakra Petch", system-ui, sans-serif`;
  ctx.fillText(subtitle.toUpperCase().slice(0, 34), size / 2, size * 0.885);
  ctx.fillStyle = 'rgba(252,211,77,0.7)';
  ctx.font = `700 ${Math.round(size * 0.026)}px "Chakra Petch", system-ui, sans-serif`;
  ctx.fillText('ᚠ ᚢ ᚦ • VIK CLAN • ᚨ ᚱ ᚲ', size / 2, size * 0.935);

  const blob = await new Promise<Blob | null>((res) => bg.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Badge render failed.');
  return blob;
}

export class LocalNorseProvider implements BadgeImageProvider {
  readonly id = 'local-norse' as const;
  async generate(spec: BadgeSpec): Promise<Blob> {
    const size = spec.size ?? 1024;
    const family = badgeFamilyFor(spec.type);
    const bg = renderNorseBackground(spec, family, size);
    return composeBadgeText(bg, spec.title, spec.subtitle);
  }
}

// Local diffusion runtime (AUTOMATIC1111/Forge-compatible HTTP API).
// Prompt carries clan identity + family; negative bans text because exact
// names/titles are drawn programmatically afterwards.
export class DiffusionProvider implements BadgeImageProvider {
  readonly id = 'diffusion' as const;
  private baseUrl: string;
  private timeoutMs: number;
  constructor(baseUrl: string, timeoutMs = 120_000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }
  async generate(spec: BadgeSpec): Promise<Blob> {
    const family = badgeFamilyFor(spec.type);
    const { prompt, negative } = buildBadgePrompt(family);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negative_prompt: negative,
          steps: 28,
          cfg_scale: 7,
          width: 1024,
          height: 1024,
          sampler_name: 'DPM++ 2M Karras',
          seed: (hashSeed(spec.seed) % 4294967295) - 2147483648,
        }),
      });
      if (!res.ok) throw new Error(`Diffusion HTTP ${res.status}.`);
      const json = (await res.json()) as { images?: string[] };
      const b64 = json.images?.[0];
      if (!b64) throw new Error('Diffusion returned no image.');
      const bg = await blobToCanvas(await (await fetch(`data:image/png;base64,${b64}`)).blob(), 1024);
      return composeBadgeText(bg, spec.title, spec.subtitle);
    } finally {
      clearTimeout(timer);
    }
  }
}

function blobToCanvas(blob: Blob, size: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        // cover-fit square
        const s = Math.max(size / img.width, size / img.height);
        const w = img.width * s;
        const h = img.height * s;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode diffusion image.'));
    };
    img.src = url;
  });
}

export function resolveProviders(): BadgeImageProvider[] {
  const url = (import.meta.env.VITE_BADGE_DIFFUSION_URL as string | undefined)?.trim();
  const local = new LocalNorseProvider();
  if (url) return [new DiffusionProvider(url), local]; // diffusion first, local fallback
  return [local];
}

// ---- 5. Throttled queue (safe batch generation) ----
export interface BatchProgress {
  done: number;
  total: number;
  current: string | null;
  failed: number;
}

export class BadgeQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  concurrency: number;
  constructor(concurrency: number = defaultConcurrency()) {
    this.concurrency = concurrency;
  }

  private acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((res) => this.waiting.push(() => {
      this.active++;
      res();
    }));
  }

  private release(): void {
    this.active--;
    const next = this.waiting.shift();
    if (next) next();
  }

  async run<T>(task: () => Promise<T>, retries = 2): Promise<T> {
    await this.acquire();
    try {
      let attempt = 0;
      for (;;) {
        try {
          return await task();
        } catch (e) {
          if (attempt >= retries) throw e;
          attempt++;
          await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
        }
      }
    } finally {
      this.release();
    }
  }
}

// ---- 6. Agent API ----
export interface ForgeResult {
  honourId: string;
  path: string;
  url: string | null;
}

async function renderWithFallback(spec: BadgeSpec, providers: BadgeImageProvider[]): Promise<Blob> {
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      return await p.generate(spec);
    } catch (e) {
      lastErr = e;
      console.warn(`badge provider ${p.id} failed, trying next:`, e instanceof Error ? e.message : e);
    }
  }
  throw new Error(lastErr instanceof Error ? lastErr.message : 'All badge providers failed.');
}

async function tagFor(playerId: string): Promise<string> {
  try {
    const { data } = await supabase.from('profiles').select('known_name,username').eq('id', playerId).maybeSingle();
    const row = data as { known_name: string | null; username: string } | null;
    return row?.known_name ?? row?.username ?? 'VIK';
  } catch {
    return 'VIK';
  }
}

// Generate (or regenerate) the badge for one honour row.
export async function generateOne(
  honour: Pick<Honour, 'id' | 'player_id' | 'type' | 'name'>,
  opts?: { providers?: BadgeImageProvider[] },
): Promise<ForgeResult> {
  const providers = opts?.providers ?? resolveProviders();
  const tag = await tagFor(honour.player_id);
  const spec: BadgeSpec = {
    type: honour.type,
    title: honour.name,
    subtitle: `${tag} • ${honour.type.replace(/_/g, ' ')}`,
    seed: `${honour.id}:${honour.player_id}:${honour.type}`,
  };
  const blob = await renderWithFallback(spec, providers);
  const path = await uploadBadgeImage(blob, badgeFileName(honour.type, honour.player_id));
  await setHonourImage(honour.id, path);
  const url = await getBadgeImageUrl(path).catch(() => null);
  return { honourId: honour.id, path, url };
}

export interface BatchReport {
  ok: ForgeResult[];
  failed: { honourId: string; error: string }[];
}

// Batch-generate badges. Default target: every honour still missing artwork.
// Concurrency defaults to hardware-based throttling; each item retries twice.
export async function generateBatch(opts?: {
  honourIds?: string[];
  playerId?: string;
  missingOnly?: boolean;
  providers?: BadgeImageProvider[];
  concurrency?: number;
  onProgress?: (p: BatchProgress) => void;
}): Promise<BatchReport> {
  const providers = opts?.providers ?? resolveProviders();
  const missingOnly = opts?.missingOnly ?? true;
  let rows: Honour[];
  if (opts?.honourIds?.length) {
    const { data, error } = await supabase.from('achievements').select('*').in('id', opts.honourIds);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Honour[];
  } else {
    let q = supabase.from('achievements').select('*').order('awarded_at', { ascending: false }).limit(500);
    if (opts?.playerId) q = q.eq('player_id', opts.playerId);
    const { data, error } = await q;
    if (error) {
      // Pre-migration DBs lack image_url: report cleanly instead of crashing.
      if (/image_url/i.test(error.message)) return { ok: [], failed: [] };
      throw new Error(error.message);
    }
    rows = (data ?? []) as Honour[];
  }
  const targets = missingOnly ? rows.filter((r) => !r.image_url) : rows;
  const queue = new BadgeQueue(opts?.concurrency ?? defaultConcurrency());
  const report: BatchReport = { ok: [], failed: [] };
  let done = 0;
  const tick = (current: string | null) => opts?.onProgress?.({ done, total: targets.length, current, failed: report.failed.length });
  tick(null);
  await Promise.all(targets.map((h) => queue.run(async () => {
    tick(h.name);
    try {
      const r = await generateOne(h, { providers });
      report.ok.push(r);
    } catch (e) {
      report.failed.push({ honourId: h.id, error: e instanceof Error ? e.message : 'Failed.' });
    } finally {
      done++;
      tick(null);
    }
  })));
  return report;
}

// Instant data-URL preview (local renderer only, no upload) for UI previews.
export async function previewBadge(type: string, title: string, subtitle: string): Promise<string> {
  const blob = await new LocalNorseProvider().generate({ type, title, subtitle, seed: `preview:${type}:${title}`, size: 512 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Preview failed.'));
    reader.readAsDataURL(blob);
  });
}

export const badgeForge = {
  CLAN_IDENTITY,
  BADGE_FAMILIES,
  LEVEL_MOTIFS,
  badgeFamilyFor,
  levelFamily,
  buildBadgePrompt,
  hashSeed,
  mulberry32,
  badgeFileName,
  defaultConcurrency,
  BadgeQueue,
  LocalNorseProvider,
  DiffusionProvider,
  resolveProviders,
  generateOne,
  generateBatch,
  previewBadge,
};
