import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import StandingsTable from '../components/competition/StandingsTable';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import WhatsAppIcon from '../components/ui/WhatsAppIcon';
import { generateRoundRobin } from '../competition/leagueEngine';
import { calculateStandings } from '../competition/standingsEngine';
import { generateKnockout, roundNameForSize } from '../competition/knockoutEngine';

// Fake-data competition simulation (nothing touches the database).
// LEAGUE: 16 players round-robin (table + matchmaking tabs).
// CUP: 16-player single-elimination bracket (bracket + matches tabs).
// Toggle PLAYER view (table/fixtures, submit your own result) vs MODERATOR
// view (review queue: confirm/reject submitted with comment, zoom evidence)
// vs ADMIN view (moderator powers + DM either player, simulate, draw,
// reset, PNG shareables). Every submitted result carries a simulated
// screenshot the reviewer can zoom.
const TAGS = [
  'Pride', 'Shadow', 'Ryu', 'Ace', 'Ghost', 'Fenrir', 'Odin', 'Thor',
  'Loki', 'Freyja', 'Sigurd', 'Ragnar', 'Bjorn', 'Ivar', 'Astrid', 'Eirik',
];
const IDS = TAGS.map((_, i) => `sim-p${String(i + 1).padStart(2, '0')}`);
const NAMES: Record<string, string> = Object.fromEntries(TAGS.map((t, i) => [IDS[i], `VIK ${t}`]));
const ME = IDS[0]; // you play as VIK Pride

type Status = 'CONFIRMED' | 'RESULT_SUBMITTED' | 'SCHEDULED' | 'REJECTED';
// Point of view: player submits, moderator reviews, admin runs the room.
type Pov = 'player' | 'moderator' | 'admin';
interface Override { status: Status; sa: number; sb: number; comment?: string; shot?: string; forfeit?: boolean }

// Deterministic RNG so reloads show the same simulation.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimFixture {
  round: number;
  a: string;
  b: string;
  sa: number;
  sb: number;
}

function buildSeason(): { fixtures: SimFixture[]; rounds: number; preSubmitted: Map<number, Set<string>> } {
  const rand = mulberry32(20261012);
  const strength = Object.fromEntries(IDS.map((id) => [id, 0.55 + rand() * 0.45]));
  const fixtures: SimFixture[] = generateRoundRobin(IDS).map((f) => {
    const goals = (id: string, home: boolean) =>
      Math.max(0, Math.min(6, Math.round(strength[id] * 2.6 + (rand() * 2.4 - 1.2) + (home ? 0.3 : 0))));
    return { round: f.round_number, a: f.player_a_id, b: f.player_b_id, sa: goals(f.player_a_id, true), sb: goals(f.player_b_id, false) };
  });
  // First 2 fixtures of every round arrive pre-submitted once the round is current.
  const preSubmitted = new Map<number, Set<string>>();
  for (const f of fixtures) {
    if (!preSubmitted.has(f.round)) preSubmitted.set(f.round, new Set());
    if (preSubmitted.get(f.round)!.size < 2) preSubmitted.get(f.round)!.add(`${f.a}-${f.b}`);
  }
  return { fixtures, rounds: Math.max(...fixtures.map((f) => f.round)), preSubmitted };
}

interface CupMatch {
  id: string;
  round: number;
  slot: number;
  sa: number;
  sb: number;
}

function buildCup(): { matches: CupMatch[]; rounds: number } {
  const bracket = generateKnockout(IDS); // structure only — pairings come from the draw
  const rand = mulberry32(20261016);
  const slotStrength = (round: number, slot: number) => {
    const r = mulberry32(20261016 + round * 131 + slot * 17);
    return 0.55 + r() * 0.45;
  };
  const perRound = new Map<number, number>();
  const matches: CupMatch[] = bracket.map((b) => {
    const slot = perRound.get(b.round_number) ?? 0;
    perRound.set(b.round_number, slot + 1);
    // Knockout can't draw — redraw until decisive. Slot-based so scores
    // don't depend on who the draw puts there.
    let sa = 0, sb = 0;
    do {
      const g = (s: number, home: boolean) =>
        Math.max(0, Math.min(5, Math.round(s * 2.6 + (rand() * 2.4 - 1.2) + (home ? 0.3 : 0))));
      sa = g(slotStrength(b.round_number, slot), true); sb = g(slotStrength(b.round_number, slot + 40), false);
    } while (sa === sb);
    return { id: `c-r${b.round_number}s${slot}`, round: b.round_number, slot, sa, sb };
  });
  return { matches, rounds: Math.max(...matches.map((m) => m.round)) };
}

// Fisher–Yates with real randomness — a draw ceremony should feel live.
function shuffled(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Simulated match screenshot (stand-in for the uploaded photo evidence).
const evCache = new Map<string, string>();
function evidence(a: string, b: string, sa: number, sb: number, label: string): string {
  const k = `${a}|${b}|${sa}|${sb}|${label}`;
  const hit = evCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 480; c.height = 270;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 270);
  bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#1a2a4a');
  g.fillStyle = bg; g.fillRect(0, 0, 480, 270);
  g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3;
  g.strokeRect(14, 14, 452, 242);
  g.beginPath(); g.moveTo(240, 14); g.lineTo(240, 256); g.stroke();
  g.beginPath(); g.arc(240, 135, 42, 0, Math.PI * 2); g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#fbbf24'; g.font = 'bold 24px sans-serif';
  g.fillText(`VIK CUP · ${label}`, 240, 52);
  g.fillStyle = '#e2e8f0'; g.font = 'bold 27px sans-serif';
  g.fillText(a, 130, 108); g.fillText(b, 350, 108);
  g.fillStyle = '#fbbf24'; g.font = '900 92px sans-serif';
  g.fillText(`${sa} - ${sb}`, 240, 208);
  g.fillStyle = '#94a3b8'; g.font = '15px sans-serif';
  g.fillText('FULL TIME · eFootball (simulated capture)', 240, 240);
  const url = c.toDataURL('image/png');
  evCache.set(k, url);
  return url;
}

const STATUS_STYLE: Record<Status, string> = {
  CONFIRMED: 'bg-green-500/15 text-green-400',
  RESULT_SUBMITTED: 'bg-amber-500/15 text-amber-400',
  SCHEDULED: 'bg-zinc-500/15 text-zinc-300',
  REJECTED: 'bg-red-500/15 text-red-400',
};

interface RowHandlers {
  role: Pov;
  mine: boolean;
  meSide: 'a' | 'b' | null;
  openDm: (id: string) => void;
  confirmOne: () => void;
  startReject: () => void;
  rejecting: boolean;
  rejectText: string;
  setRejectText: (s: string) => void;
  sendRejection: () => void;
  cancelReject: () => void;
  zoom: (url: string) => void;
}

function FixtureRow({ aName, bName, score, showScore, img, st, comment, forfeit, winner, h }: {
  aName: string; bName: string; score: string; showScore: boolean;
  img: string | null; st: Status; comment?: string; forfeit?: boolean; winner: 'a' | 'b' | null; h: RowHandlers;
}) {
  const colorA = winner ? (winner === 'a' ? 'font-bold text-green-400' : 'text-red-400') : '';
  const colorB = winner ? (winner === 'b' ? 'font-bold text-green-400' : 'text-red-400') : '';
  // Reviewers (moderator + admin) confirm/reject submitted results and zoom
  // evidence. DM-either-player stays admin-only; opponent-DM stays player-only.
  const reviewer = h.role !== 'player';
  return (
    <li className="flex flex-col gap-1.5 rounded-xl bg-white/5 p-2.5 text-sm">
      <div className="flex items-center gap-1.5">
        {h.role === 'admin' && (
          <button onClick={() => h.openDm('a')} aria-label={`Message ${aName} on WhatsApp`} title={`Message ${aName} on WhatsApp`} className="btn-ghost h-9 w-9 shrink-0 !px-0">
            <WhatsAppIcon className="h-5 w-5" />
          </button>
        )}
        {h.role === 'player' && h.meSide === 'b' && (
          <OppMsgButton onOpen={() => h.openDm('opp')} />
        )}
        <span
          className={`flex-1 truncate text-right font-semibold ${colorA} ${h.role === 'admin' ? 'cursor-pointer' : ''}`}
          onClick={h.role === 'admin' ? () => h.openDm('a') : undefined}
          title={h.role === 'admin' ? `Message ${aName} on WhatsApp` : undefined}
        >{aName}</span>
        <span className={`shrink-0 font-mono font-bold ${showScore ? '' : 'opacity-30'}`}>{score}</span>
        <span
          className={`flex-1 truncate font-semibold ${colorB} ${h.role === 'admin' ? 'cursor-pointer' : ''}`}
          onClick={h.role === 'admin' ? () => h.openDm('b') : undefined}
          title={h.role === 'admin' ? `Message ${bName} on WhatsApp` : undefined}
        >{bName}</span>
        {h.role === 'admin' && (
          <button onClick={() => h.openDm('b')} aria-label={`Message ${bName} on WhatsApp`} title={`Message ${bName} on WhatsApp`} className="btn-ghost h-9 w-9 shrink-0 !px-0">
            <WhatsAppIcon className="h-5 w-5" />
          </button>
        )}
        {h.role === 'player' && h.meSide === 'a' && (
          <OppMsgButton onOpen={() => h.openDm('opp')} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {img && (
          <button onClick={() => h.zoom(img)} aria-label="Zoom screenshot evidence" className="shrink-0">
            <img src={img} alt="Match screenshot evidence" className="h-12 w-20 rounded-lg border border-white/20 object-cover" />
          </button>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[st]}`}>
          {st === 'CONFIRMED' ? 'CONFIRMED' : st === 'RESULT_SUBMITTED' ? 'SUBMITTED' : st === 'REJECTED' ? 'REJECTED' : 'SCHEDULED'}
        </span>
        {forfeit && (
          <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400">FORFEIT</span>
        )}
        {reviewer && (st === 'RESULT_SUBMITTED' || st === 'REJECTED') && (
          <button onClick={h.confirmOne} className="btn-primary h-8 px-2 text-[11px]">{forfeit && st === 'RESULT_SUBMITTED' ? 'Accept forfeit' : 'Confirm'}</button>
        )}
        {reviewer && st === 'RESULT_SUBMITTED' && (
          <button onClick={h.startReject} className="btn-danger h-8 px-2 text-[11px]">Reject</button>
        )}
      </div>
      {st === 'REJECTED' && comment && (
        <p className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400">Rejected: {comment}</p>
      )}
      {reviewer && h.rejecting && (
        <div className="flex flex-col gap-1.5">
          <textarea
            value={h.rejectText} onChange={(ev) => h.setRejectText(ev.target.value)} rows={2} maxLength={240}
            placeholder="Rejection motive, e.g. screenshot unreadable…"
            aria-label="Rejection comment" className="input h-auto py-2 text-sm"
          />
          <div className="flex gap-1.5">
            <button onClick={h.sendRejection} className="btn-danger h-9 flex-1 text-xs">Send rejection</button>
            <button onClick={h.cancelReject} className="btn-ghost h-9 px-3 text-xs">Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

function OppMsgButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label="Message your opponent on WhatsApp" title="Message your opponent about this match" className="btn-ghost h-9 w-9 shrink-0 !px-0">
      <WhatsAppIcon className="h-5 w-5" />
    </button>
  );
}

// Draw-ceremony video: the same reveal, painted on canvas (720x1280,
// WhatsApp-Story friendly) and captured with MediaRecorder — all on-device.
const TIE_MS = 1100;
const END_HOLD = 1600;
const TOTAL_MS = 8 * TIE_MS + END_HOLD;

function drawAvatar(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, r: number) {
  const h = hueFor(id);
  const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, `hsl(${h},60%,42%)`);
  grad.addColorStop(1, `hsl(${(h + 40) % 360},55%,30%)`);
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = '700 24px Arial, sans-serif'; g.textAlign = 'center';
  g.fillText(shortTag(id).slice(0, 1), cx, cy + 8);
}

// PWA logo watermark, top-right of every video.
const logoImg = typeof Image !== 'undefined' ? new Image() : null;
if (logoImg) logoImg.src = '/logo.png';
function drawLogo(g: CanvasRenderingContext2D, W = 720) {
  if (!logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
  const s = 92, x = W - 32 - s, y = 32;
  g.save();
  g.beginPath(); g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); g.clip();
  g.drawImage(logoImg, x, y, s, s);
  g.restore();
}

// ---------- PNG export (admin shareables): gameweek preview / results with
// crowns, league table, cup bracket. Portrait cards, PWA theme, logo mark.
const PX_FONT = '"Chakra Petch", Arial, sans-serif';
const PX_DISPLAY = '"Cinzel", Georgia, serif';

function pngCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function pngBg(g: CanvasRenderingContext2D, W: number, H: number) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#1a2a4a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
}
function pngHead(g: CanvasRenderingContext2D, W: number, title: string, subtitle: string) {
  drawLogo(g, W);
  g.textAlign = 'center';
  g.fillStyle = '#fbbf24'; g.font = `800 54px ${PX_DISPLAY}`;
  g.fillText(title, W / 2, 140);
  g.fillStyle = '#94a3b8'; g.font = `600 28px ${PX_FONT}`;
  g.fillText(subtitle, W / 2, 190);
}
function pngFoot(g: CanvasRenderingContext2D, W: number, H: number) {
  g.textAlign = 'center';
  g.fillStyle = '#94a3b8'; g.font = `600 24px ${PX_FONT}`;
  g.fillText(`${new Date().toLocaleDateString()} · VIK Championship`, W / 2, H - 48);
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}
const short15 = (s: string) => (s.length > 15 ? s.slice(0, 14) + '…' : s);

export interface ExportTie { a: string; b: string; sa: number; sb: number; decided: boolean; winner: 'a' | 'b' | null }

// Gameweek card: preview (no scores) or results (scores + crown by winner).
function matchImage(title: string, subtitle: string, ties: ExportTie[], withScores: boolean): string | null {
  const W = 1080, rowH = 130, top = 300;
  const H = top + ties.length * rowH + 130;
  const [c, g] = pngCanvas(W, H);
  if (!g) return null;
  pngBg(g, W, H);
  pngHead(g, W, title, subtitle);
  ties.forEach((t, i) => {
    const ry = top + i * rowH;
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(64, ry); g.lineTo(W - 64, ry); g.stroke();
    const cy = ry + 82;
    g.font = `700 40px ${PX_FONT}`;
    const aN = short15(t.a), bN = short15(t.b);
    const wA = g.measureText(aN).width;
    // A (left, right-aligned) · score · B (left-aligned), crown hugging the winner.
    g.textAlign = 'right';
    g.fillStyle = withScores && t.decided && t.winner === 'a' ? '#4ade80' : '#e2e8f0';
    g.fillText(aN, 450, cy);
    g.textAlign = 'center';
    if (withScores && t.decided) {
      g.fillStyle = '#fbbf24'; g.font = `800 44px ${PX_FONT}`;
      g.fillText(`${t.sa} - ${t.sb}`, 540, cy + 2);
    } else {
      g.fillStyle = 'rgba(148,163,184,.6)'; g.font = `600 32px ${PX_FONT}`;
      g.fillText('vs', 540, cy);
    }
    g.textAlign = 'left';
    g.fillStyle = withScores && t.decided && t.winner === 'b' ? '#4ade80' : '#e2e8f0';
    g.font = `700 40px ${PX_FONT}`;
    g.fillText(bN, 630, cy);
    if (withScores && t.decided && t.winner) {
      g.font = '40px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff';
      if (t.winner === 'a') g.fillText('👑', 450 - wA - 52, cy);
      else g.fillText('👑', 630 + g.measureText(bN).width + 52, cy);
    }
  });
  pngFoot(g, W, H);
  return c.toDataURL('image/png');
}

export interface ExportRow { pos: number; name: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }

// League table card.
function tableImage(title: string, subtitle: string, rows: ExportRow[]): string | null {
  const W = 1080, rowH = 72, top = 300;
  const H = top + rows.length * rowH + 130;
  const [c, g] = pngCanvas(W, H);
  if (!g) return null;
  pngBg(g, W, H);
  pngHead(g, W, title, subtitle);
  const cols = [100, 620, 680, 740, 800, 865, 920, 972, 1022];
  const heads = ['#', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'PTS'];
  g.font = `700 26px ${PX_FONT}`;
  heads.forEach((h, i) => {
    g.fillStyle = '#94a3b8'; g.textAlign = i === 0 ? 'center' : 'center';
    g.fillText(h, cols[i], top - 16);
  });
  g.textAlign = 'left';
  g.fillStyle = '#94a3b8';
  g.fillText('Player', 150, top - 16);
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    if (i < 4) {
      g.fillStyle = i === 0 ? 'rgba(234,179,8,.10)' : 'rgba(255,255,255,.03)';
      rrect(g, 48, y + 6, W - 96, rowH - 8, 12); g.fill();
    }
    const vals = [String(r.pos), String(r.p), String(r.w), String(r.d), String(r.l), String(r.gf), String(r.ga), `${r.gd > 0 ? '+' : ''}${r.gd}`];
    g.font = `700 30px ${PX_FONT}`;
    vals.forEach((v, j) => {
      g.fillStyle = j === 0 ? '#94a3b8' : '#e2e8f0';
      g.textAlign = 'center';
      g.fillText(v, cols[j], y + 48);
    });
    g.textAlign = 'left';
    g.fillStyle = '#e2e8f0';
    const nm = r.name.length > 17 ? r.name.slice(0, 16) + '…' : r.name;
    g.fillText(nm, 150, y + 48);
    g.fillStyle = '#fbbf24'; g.font = `800 32px ${PX_FONT}`; g.textAlign = 'center';
    g.fillText(String(r.pts), cols[8], y + 48);
    if (i === 0) {
      g.font = '30px sans-serif'; g.textAlign = 'center';
      g.fillText('👑', 150 + g.measureText(nm).width + 90, y + 48);
    }
  });
  pngFoot(g, W, H);
  return c.toDataURL('image/png');
}

// Cup bracket card (landscape): computed columns, winners crowned, links drawn.
function bracketImage(
  title: string, subtitle: string,
  rounds: { name: string; ties: { a: string | null; b: string | null; sa: number; sb: number; decided: boolean; winner: 'a' | 'b' | null }[] }[],
  champion: string | null,
): string | null {
  const W = 1600, H = 1000, mX = 80, colW = 300, gapX = 80;
  const top = 240, cardH = 64;
  const n0 = rounds[0]?.ties.length || 8;
  const avail = H - top - 120;
  const gap0 = n0 > 1 ? (avail - n0 * cardH) / (n0 - 1) : 0;
  // Tops: round 0 evenly spaced; later rounds centered on their feeders.
  const yPos = (r: number, s: number): number => {
    if (r === 0) return top + s * (cardH + gap0);
    return (yPos(r - 1, s * 2) + yPos(r - 1, s * 2 + 1)) / 2;
  };
  const [c, g] = pngCanvas(W, H);
  if (!g) return null;
  pngBg(g, W, H);
  drawLogo(g, W);
  g.textAlign = 'center';
  g.fillStyle = '#fbbf24'; g.font = `800 52px ${PX_DISPLAY}`;
  g.fillText(title, W / 2, 120);
  g.fillStyle = '#94a3b8'; g.font = `600 28px ${PX_FONT}`;
  g.fillText(subtitle, W / 2, 168);
  const colX = (r: number) => mX + r * (colW + gapX);
  rounds.forEach((rd, r) => {
    g.fillStyle = '#94a3b8'; g.font = `700 24px ${PX_FONT}`; g.textAlign = 'center';
    g.fillText(rd.name, colX(r) + colW / 2, top - 24);
    rd.ties.forEach((t, s) => {
      const y = yPos(r, s);
      g.fillStyle = 'rgba(255,255,255,.06)';
      rrect(g, colX(r), y, colW, cardH, 10); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
      rrect(g, colX(r), y, colW, cardH, 10); g.stroke();
      g.font = `700 24px ${PX_FONT}`;
      const rows = [
        { n: t.a, sc: t.decided && t.a ? String(t.sa) : '–', win: t.winner === 'a' },
        { n: t.b, sc: t.decided && t.b ? String(t.sb) : '–', win: t.winner === 'b' },
      ];
      rows.forEach((row, k) => {
        const ry = y + 26 + k * 26;
        g.textAlign = 'left';
        g.fillStyle = row.win ? '#4ade80' : row.n ? '#e2e8f0' : 'rgba(148,163,184,.5)';
        const nm = row.n && row.n.length > 14 ? row.n.slice(0, 13) + '…' : (row.n ?? 'TBD');
        g.fillText(nm, colX(r) + 14, ry);
        g.textAlign = 'right'; g.fillStyle = '#e2e8f0';
        g.fillText(row.sc, colX(r) + colW - 14, ry);
      });
      if (t.winner) {
        const wn = t.winner === 'a' ? t.a! : t.b!;
        const ww = g.measureText(wn && wn.length > 14 ? wn.slice(0, 13) + '…' : (wn ?? '')).width;
        g.font = '22px sans-serif'; g.textAlign = 'left';
        g.fillText('👑', colX(r) + 14 + ww + 10, y + (t.winner === 'a' ? 26 : 52));
      }
      // Full elbow from both feeders into this match.
      if (r > 0) {
        const c1 = yPos(r - 1, s * 2) + cardH / 2;
        const c2 = yPos(r - 1, s * 2 + 1) + cardH / 2;
        const ct = y + cardH / 2;
        const x1 = colX(r - 1) + colW, x2 = colX(r), mx = (x1 + x2) / 2;
        g.strokeStyle = t.decided ? 'rgba(234,179,8,.7)' : 'rgba(255,255,255,.15)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x1, c1); g.lineTo(mx, c1);
        g.moveTo(x1, c2); g.lineTo(mx, c2);
        g.moveTo(mx, c1); g.lineTo(mx, c2);
        g.moveTo(mx, ct); g.lineTo(x2, ct);
        g.stroke();
      }
    });
  });
  g.textAlign = 'center';
  if (champion) {
    g.fillStyle = '#fbbf24'; g.font = `800 40px ${PX_DISPLAY}`;
    g.fillText(`🏆 CHAMPION · ${champion}`, W / 2, H - 52);
  } else {
    g.fillStyle = '#94a3b8'; g.font = `600 28px ${PX_FONT}`;
    g.fillText('Champion decided at the final', W / 2, H - 52);
  }
  return c.toDataURL('image/png');
}

interface RecapTie { round: number; a: string | null; b: string | null; sa: number; sb: number }

// Timeline (ms): intro → R16 two halves → QF → SF → Final → champion.
const RECAP_SEGS = [
  { at: 0, dur: 1600, kind: 'intro' },
  { at: 1600, dur: 2400, kind: 'round', round: 1, from: 0, to: 4 },
  { at: 4000, dur: 2400, kind: 'round', round: 1, from: 4, to: 8 },
  { at: 6400, dur: 2200, kind: 'round', round: 2, from: 0, to: 4 },
  { at: 8600, dur: 2000, kind: 'round', round: 3, from: 0, to: 2 },
  { at: 10600, dur: 2000, kind: 'round', round: 4, from: 0, to: 1 },
  { at: 12600, dur: 2800, kind: 'champion' },
] as const;
const RECAP_MS = 15400;

function drawRecapFrame(g: CanvasRenderingContext2D, ties: RecapTie[], champ: string | null, elapsed: number) {
  const W = 720, H = 1280;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#1a2a4a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  drawLogo(g);
  g.textAlign = 'center';
  const seg = [...RECAP_SEGS].reverse().find((s) => elapsed >= s.at) ?? RECAP_SEGS[0];

  const tieRow = (t: RecapTie, y: number) => {
    const w = t.a && t.b ? (t.sa > t.sb ? t.a : t.b) : null;
    if (t.a) drawAvatar(g, t.a, 110, y + 6, 22);
    if (t.b) drawAvatar(g, t.b, 610, y + 6, 22);
    g.font = '700 28px Arial, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = w === t.a ? '#4ade80' : '#e2e8f0';
    g.fillText(t.a ? shortTag(t.a) : 'TBD', 300, y);
    g.textAlign = 'center'; g.fillStyle = '#fbbf24'; g.font = '700 30px Arial, sans-serif';
    g.fillText(t.a && t.b ? `${t.sa} - ${t.sb}` : '–', W / 2, y);
    g.textAlign = 'left';
    g.fillStyle = w === t.b ? '#4ade80' : '#e2e8f0';
    g.font = '700 28px Arial, sans-serif';
    g.fillText(t.b ? shortTag(t.b) : 'TBD', 420, y);
  };

  if (seg.kind === 'intro') {
    const p = Math.min(1, elapsed / 800);
    g.globalAlpha = p;
    g.fillStyle = '#fbbf24'; g.font = '800 60px Arial, sans-serif';
    g.fillText('VIK CUP', W / 2, 560);
    g.fillStyle = '#e2e8f0'; g.font = '700 40px Arial, sans-serif';
    g.fillText('FULL RESULTS', W / 2, 630);
    g.fillStyle = '#94a3b8'; g.font = '600 28px Arial, sans-serif';
    g.fillText('Round of 16 → Champion', W / 2, 690);
    g.globalAlpha = 1;
  } else if (seg.kind === 'round') {
    const list = ties.filter((t) => t.round === seg.round).slice(seg.from, seg.to);
    g.fillStyle = '#fbbf24'; g.font = '800 44px Arial, sans-serif';
    g.fillText(roundNameForSize(16, seg.round), W / 2, 170);
    const rowH = 150;
    const top = 640 - (list.length * rowH) / 2;
    list.forEach((t, i) => tieRow(t, top + i * rowH + 44));
  } else {
    // Champion finale with falling gold particles.
    g.fillStyle = '#fbbf24'; g.font = '800 56px Arial, sans-serif';
    g.fillText('CHAMPION', W / 2, 420);
    if (champ) {
      drawAvatar(g, champ, W / 2, 620, 90);
      g.fillStyle = '#fff'; g.font = '800 52px Arial, sans-serif';
      g.fillText(NAMES[champ] ?? champ, W / 2, 800);
    }
    for (let i = 0; i < 46; i++) {
      const x = (i * 173) % W;
      const y = (i * 97 + elapsed * (0.15 + (i % 4) * 0.08)) % (H + 40) - 20;
      g.globalAlpha = 0.35 + 0.3 * Math.sin(elapsed / 300 + i);
      g.fillStyle = i % 3 === 0 ? '#fbbf24' : '#e2e8f0';
      const r = 3 + (i % 4);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  // Progress bar.
  const pct = Math.min(1, elapsed / RECAP_MS);
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.fillRect(80, H - 100, W - 160, 10);
  g.fillStyle = '#fbbf24';
  g.fillRect(80, H - 100, (W - 160) * pct, 10);
  g.fillStyle = '#94a3b8'; g.font = '600 26px Arial, sans-serif';
  g.fillText('VIK Championship · Simulation', W / 2, H - 50);
}

function drawDrawFrame(g: CanvasRenderingContext2D, order: string[], elapsed: number) {
  const W = 720, H = 1280;
  const revealed = Math.min(8, Math.floor(elapsed / TIE_MS));
  const done = elapsed >= 8 * TIE_MS;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1220'); bg.addColorStop(1, '#1a2a4a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  drawLogo(g);
  g.textAlign = 'center';
  g.fillStyle = '#fbbf24'; g.font = '800 54px Arial, sans-serif';
  g.fillText('VIK CUP DRAW', W / 2, 150);
  g.fillStyle = '#94a3b8'; g.font = '600 30px Arial, sans-serif';
  g.fillText('Round of 16', W / 2, 200);
  const top = 300, rowH = 100;
  for (let i = 0; i < 8; i++) {
    const y = top + i * rowH + 38;
    if (i < revealed) {
      const aId = order[i * 2], bId = order[i * 2 + 1];
      drawAvatar(g, aId, 110, y + 6, 22);
      drawAvatar(g, bId, 610, y + 6, 22);
      g.font = '700 28px Arial, sans-serif';
      g.textAlign = 'right'; g.fillStyle = '#e2e8f0';
      g.fillText(shortTag(aId), 300, y);
      g.textAlign = 'center'; g.fillStyle = '#64748b'; g.font = '600 24px Arial, sans-serif';
      g.fillText('vs', W / 2, y);
      g.textAlign = 'left'; g.fillStyle = '#e2e8f0'; g.font = '700 28px Arial, sans-serif';
      g.fillText(shortTag(bId), 420, y);
    } else if (i === revealed && !done) {
      const pool = order.slice(revealed * 2);
      const idx = Math.floor(elapsed / 100);
      const s1 = pool[(idx * 5) % pool.length], s2 = pool[(idx * 5 + 3) % pool.length];
      drawAvatar(g, s1, 110, y + 6, 22);
      drawAvatar(g, s2, 610, y + 6, 22);
      g.globalAlpha = 0.6 + 0.4 * Math.sin(elapsed / 120);
      g.fillStyle = '#fbbf24'; g.font = '700 28px Arial, sans-serif';
      g.textAlign = 'right'; g.fillText(shortTag(s1), 300, y);
      g.textAlign = 'left'; g.fillText(shortTag(s2), 420, y);
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.fillStyle = '#64748b'; g.font = '600 24px Arial, sans-serif';
      g.fillText('vs', W / 2, y);
    } else {
      g.fillStyle = 'rgba(148,163,184,.35)'; g.font = '600 28px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText(`TIE ${i + 1}`, W / 2, y);
    }
  }
  const pct = Math.min(1, elapsed / TOTAL_MS);
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.fillRect(80, H - 140, W - 160, 10);
  g.fillStyle = '#fbbf24';
  g.fillRect(80, H - 140, (W - 160) * pct, 10);
  g.fillStyle = '#94a3b8'; g.font = '600 26px Arial, sans-serif'; g.textAlign = 'center';
  g.fillText(done ? 'DRAW COMPLETE' : `TIE ${Math.min(revealed + 1, 8)} / 8`, W / 2, H - 90);
  g.fillText('VIK Championship · Simulation', W / 2, H - 50);
}

// Draw ceremony: ties lock in one by one while the remaining names spin.
function DrawCeremony({ draw, revealed, spin, recording, onCancel }: {
  draw: string[]; revealed: number; spin: number; recording: boolean; onCancel: () => void;
}) {
  const pool = draw.slice(Math.min(revealed, 8) * 2);
  const spinIdA = pool.length > 0 ? pool[(spin * 5) % pool.length] : null;
  const spinIdB = pool.length > 1 ? pool[(spin * 5 + 3) % pool.length] : null;
  return (
    <div role="dialog" aria-label="Cup draw" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="card w-full max-w-sm">
        <h3 className="font-display text-center text-lg">Round of 16 draw</h3>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs opacity-60">
          {recording && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" aria-label="Recording" />}
          {Math.min(revealed, 8)} / 8 ties revealed{recording ? ' · recording video' : ''}
        </p>
        <ul className="mt-2 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
          {Array.from({ length: 8 }, (_, i) => {
            if (i < revealed) {
              return (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                    <SimAvatar id={draw[i * 2]} />
                    <span className="truncate font-semibold">{NAMES[draw[i * 2]]}</span>
                  </span>
                  <span className="font-mono text-xs opacity-60">vs</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate font-semibold">{NAMES[draw[i * 2 + 1]]}</span>
                    <SimAvatar id={draw[i * 2 + 1]} />
                  </span>
                </li>
              );
            }
            if (i === revealed && revealed < 8) {
              return (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-brand-500/50 bg-brand-500/10 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                    {spinIdA && <SimAvatar id={spinIdA} />}
                    <span className="animate-pulse truncate font-semibold text-brand-300">{spinIdA ? NAMES[spinIdA] : '…'}</span>
                  </span>
                  <span className="font-mono text-xs opacity-60">vs</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="animate-pulse truncate font-semibold text-brand-300">{spinIdB ? NAMES[spinIdB] : '…'}</span>
                    {spinIdB && <SimAvatar id={spinIdB} />}
                  </span>
                </li>
              );
            }
            return (
              <li key={i} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm opacity-40">
                <span className="flex-1 truncate text-right">TBD</span>
                <span className="font-mono text-xs">vs</span>
                <span className="flex-1 truncate">TBD</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex gap-2">
          <button onClick={onCancel} className="btn-ghost h-11 flex-1 text-sm">Cancel draw</button>
        </div>
      </div>
    </div>
  );
}

// Deterministic avatar color per player (mirrors the profile initial-avatar).
function hueFor(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const shortTag = (id: string) => (NAMES[id] ?? '?').replace('VIK ', '');

function SimAvatar({ id, className = 'h-7 w-7 text-xs' }: { id: string; className?: string }) {
  const h = hueFor(id);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 60% 42%), hsl(${(h + 40) % 360} 55% 30%))` }}
    >
      {shortTag(id).slice(0, 1)}
    </span>
  );
}
// Pure-CSS bracket (gist technique): flex columns with space-around center
// every match between its feeders automatically — no JS geometry. Connector
// columns carry CSS elbows (merger spine + stubs) into the next round.
const BW = 168;
const CW = 30;
const MH = 68;
const COL_H = 640;
const CHAMP_W = 124;

function Merger({ decided }: { decided: boolean }) {
  const c = decided ? 'border-brand-500/70' : 'border-white/15';
  return (
    <div aria-hidden className="relative w-full flex-1">
      <span className={`absolute border-l-2 ${c}`} style={{ left: '50%', top: '25%', height: '50%' }} />
      <span className={`absolute border-t-2 ${c}`} style={{ left: 0, width: '50%', top: '25%' }} />
      <span className={`absolute border-t-2 ${c}`} style={{ left: 0, width: '50%', top: '75%' }} />
      <span className={`absolute border-t-2 ${c}`} style={{ left: '50%', right: 0, top: '50%' }} />
    </div>
  );
}

function CupBracket({ cupMatches, cupRounds, cupCurrent, cupWinners, cupEff, champion, drawn, onOpenMatches }: {
  cupMatches: CupMatch[];
  cupRounds: number;
  cupCurrent: number;
  cupWinners: Map<string, string>;
  cupEff: (m: CupMatch, w: Map<string, string>) => { st: Status; sa: number; sb: number; a: string | null; b: string | null };
  champion: string | null;
  drawn: boolean;
  onOpenMatches: () => void;
}) {
  const byRound = (r: number) => cupMatches.filter((m) => m.round === r).sort((x, y) => x.slot - y.slot);
  const decidedOf = (m: CupMatch) => cupEff(m, cupWinners).st === 'CONFIRMED';

  const mini = (id: string | null, score: string, won: boolean) => (
    <div className="flex items-center gap-1">
      <span className={`min-w-0 flex-1 truncate ${won ? 'font-bold text-green-400' : id ? '' : 'opacity-40'}`}>
        {id ? NAMES[id] : 'TBD'}
      </span>
      <span className="shrink-0 font-mono font-bold">{score}</span>
    </div>
  );

  const matchup = (m: CupMatch) => {
    const e = cupEff(m, cupWinners);
    const w = e.st === 'CONFIRMED' && e.a && e.b ? (e.sa > e.sb ? e.a : e.b) : null;
    const decided = e.st !== 'SCHEDULED' && !!e.a && !!e.b;
    return (
      <button
        key={m.id} onClick={onOpenMatches} title="Open match details"
        style={{ height: MH }}
        className={`w-full shrink-0 rounded-xl bg-white/5 px-2 py-1.5 text-left text-xs ${m.round === cupCurrent ? 'border border-brand-500/40' : 'border border-transparent'}`}
      >
        {mini(e.a, decided ? String(e.sa) : '–', w === e.a)}
        {mini(e.b, decided ? String(e.sb) : '–', w === e.b)}
      </button>
    );
  };

  const columns: React.ReactNode[] = [];
  for (let r = 1; r <= cupRounds; r++) {
    columns.push(
      <div key={`r${r}`} className="flex shrink-0 flex-col" style={{ width: BW }}>
        <p className={`h-6 text-center text-[11px] font-bold uppercase tracking-wider ${r === cupCurrent ? 'text-brand-300' : 'opacity-60'}`}>
          {roundNameForSize(16, r)}
        </p>
        <div className="flex flex-col justify-around" style={{ height: COL_H }}>
          {byRound(r).map(matchup)}
        </div>
      </div>,
    );
    if (r < cupRounds) {
      const targets = byRound(r + 1);
      columns.push(
        <div key={`c${r}`} aria-hidden className="flex shrink-0 flex-col" style={{ width: CW }}>
          <div className="h-6" />
          <div className="flex flex-col" style={{ height: COL_H }}>
            {targets.map((m) => <Merger key={m.id} decided={decidedOf(m)} />)}
          </div>
        </div>,
      );
    }
  }
  columns.push(
    <div key="champ-link" aria-hidden className="flex shrink-0 flex-col" style={{ width: CW }}>
      <div className="h-6" />
      <div className="flex items-center" style={{ height: COL_H }}>
        <span className={`w-full border-t-2 ${champion ? 'border-brand-500/70' : 'border-white/15'}`} />
      </div>
    </div>,
    <div key="champ" className="flex shrink-0 flex-col" style={{ width: CHAMP_W }}>
      <div className="h-6" />
      <div className="flex items-center" style={{ height: COL_H }}>
        <div className="flex w-full items-center gap-1.5 rounded-xl border border-brand-500/50 bg-brand-500/10 px-2 py-2">
          <Icon name="trophy" className="h-6 w-6 shrink-0 text-brand-300" />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-300">Champion</div>
            <div className="truncate text-xs font-bold">{champion ? NAMES[champion] : 'TBD'}</div>
          </div>
        </div>
      </div>
    </div>,
  );

  return (
    <section className="card mt-3" aria-label="Bracket">
          <h2 className="card-title">Knockout bracket · random draw · tap a match for details</h2>
          {!drawn && <p className="mt-1 text-xs opacity-60">Awaiting the draw — the admin runs it from above.</p>}
      <div className="mt-2 overflow-x-auto pb-1">
        <div className="flex w-max gap-0">{columns}</div>
      </div>
    </section>
  );
}

export default function SimPage() {
  const { fixtures, rounds, preSubmitted } = useMemo(() => buildSeason(), []);
  const { matches: cupMatches, rounds: cupRounds } = useMemo(() => buildCup(), []);
  const [draw, setDraw] = useState<string[] | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [spin, setSpin] = useState(0);
  const [comp, setComp] = useState<'league' | 'cup'>('league');
  const [role, setRole] = useState<Pov>('player');
  const [tab, setTab] = useState<'table' | 'fixtures' | 'bracket' | 'matches'>('table');
  const [played, setPlayed] = useState(5);
  const [round, setRound] = useState(6);
  const [cupPlayed, setCupPlayed] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [myA, setMyA] = useState('');
  const [myB, setMyB] = useState('');
  const [myShot, setMyShot] = useState<string | null>(null);
  const [myForfeit, setMyForfeit] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const onShotFile = (f: File | undefined) => {
    if (!f) { setMyShot(null); return; }
    const r = new FileReader();
    r.onload = () => setMyShot(typeof r.result === 'string' ? r.result : null);
    r.readAsDataURL(f);
  };
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [dmTo, setDmTo] = useState<{ id: string; prefill: string } | null>(null);
  const [dmText, setDmText] = useState('');
  const [dmSent, setDmSent] = useState<string | null>(null);
  const [imgModal, setImgModal] = useState<{ url: string; name: string } | null>(null);
  const current = Math.min(played + 1, rounds);
  const shown = Math.min(Math.max(round, 1), rounds);
  const cupCurrent = Math.min(cupPlayed + 1, cupRounds);
  const keyOf = (f: SimFixture) => `${f.a}-${f.b}`;

  // ---- league state ----
  const eff = useCallback((f: SimFixture): { st: Status; sa: number; sb: number; comment?: string; shot?: string; forfeit?: boolean } => {
    const k = keyOf(f);
    if (f.round <= played) {
      const o = overrides[k];
      return o ? { st: 'CONFIRMED', sa: o.sa, sb: o.sb, shot: o.shot, forfeit: o.forfeit } : { st: 'CONFIRMED', sa: f.sa, sb: f.sb };
    }
    if (overrides[k]) {
      const o = overrides[k];
      return { st: o.status, sa: o.sa, sb: o.sb, comment: o.comment, shot: o.shot, forfeit: o.forfeit };
    }
    if (f.round === current && preSubmitted.get(f.round)?.has(k)) return { st: 'RESULT_SUBMITTED', sa: f.sa, sb: f.sb };
    return { st: 'SCHEDULED', sa: f.sa, sb: f.sb };
  }, [played, overrides, preSubmitted, current]);

  const standings = useMemo(
    () => calculateStandings(
      fixtures
        .map((f) => ({ f, e: eff(f) }))
        .filter(({ e }) => e.st === 'CONFIRMED')
        .map(({ f, e }) => ({ player_a_id: f.a, player_b_id: f.b, score_a: e.sa, score_b: e.sb, status: 'CONFIRMED' as const })),
    ),
    [fixtures, eff],
  );

  // ---- cup state ----
  const cupSides = useCallback((m: CupMatch, winners: Map<string, string>): [string | null, string | null] => {
    if (m.round === 1) return draw ? [draw[m.slot * 2] ?? null, draw[m.slot * 2 + 1] ?? null] : [null, null];
    return [winners.get(`c-r${m.round - 1}s${m.slot * 2}`) ?? null, winners.get(`c-r${m.round - 1}s${m.slot * 2 + 1}`) ?? null];
  }, [draw]);

  // Draw ceremony: one tie revealed at a time, auto-closes when complete.
  // Generic on-device capture: paint frames on a 720x1280 canvas, record via
  // MediaRecorder. Returns a cancel fn, or null where unsupported.
  const recCancel = useRef<(() => void) | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoExt, setVideoExt] = useState('webm');
  const [videoOpen, setVideoOpen] = useState(false);

  const canRecord = () => {
    try {
      const c = document.createElement('canvas') as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream };
      return typeof MediaRecorder !== 'undefined' && typeof c.captureStream === 'function';
    } catch {
      return false;
    }
  };

  const captureVideo = (
    paint: (g: CanvasRenderingContext2D, elapsed: number) => void,
    durationMs: number,
    onDone: (url: string, ext: string) => void,
  ): (() => void) | null => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 1280;
      const g = canvas.getContext('2d');
      const cap = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream;
      if (!g || !cap) return null;
      const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => {
        try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
      }) ?? '';
      const stream = cap.call(canvas, 30);
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
      let raf = 0;
      let alive = true;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        if (!alive || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        if (blob.size === 0) return;
        onDone(URL.createObjectURL(blob), blob.type.includes('mp4') ? 'mp4' : 'webm');
      };
      rec.start(250);
      const t0 = performance.now();
      const frame = () => {
        paint(g, performance.now() - t0);
        if (performance.now() - t0 < durationMs) {
          raf = requestAnimationFrame(frame);
        } else if (rec.state !== 'inactive') {
          rec.stop();
        }
      };
      raf = requestAnimationFrame(frame);
      return () => {
        alive = false;
        cancelAnimationFrame(raf);
        try { if (rec.state !== 'inactive') rec.stop(); } catch { /* noop */ }
        stream.getTracks().forEach((t) => t.stop());
      };
    } catch {
      return null;
    }
  };

  const cancelRec = () => {
    recCancel.current?.();
    recCancel.current = null;
    setIsRecording(false);
  };

  const startRecording = (order: string[]) => {
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    cancelRec();
    const cancel = captureVideo((g, el) => drawDrawFrame(g, order, el), TOTAL_MS, (url, ext) => {
      setVideoExt(ext);
      setVideoUrl(url);
      setVideoOpen(true);
      setIsRecording(false);
    });
    if (!cancel) return false;
    recCancel.current = cancel;
    setIsRecording(true);
    return true;
  };

  const startDraw = () => {
    const order = shuffled(IDS);
    // Every draw is recorded (obligation, not an option) so members can
    // rewatch it. Falls back to a plain ceremony where unsupported.
    if (canRecord()) startRecording(order);
    setDraw(order);
    setRevealed(0);
    setDrawing(true);
  };

  const cancelDraw = () => {
    cancelRec();
    setDrawing(false);
    setDraw(null);
  };

  useEffect(() => () => { // unmount: never leave a recorder running
    recCancel.current?.();
    recCancel.current = null;
    recapCancel.current?.();
    recapCancel.current = null;
  }, []);
  useEffect(() => {
    if (!drawing) return;
    if (revealed >= 8) {
      const t = setTimeout(() => setDrawing(false), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((r) => r + 1), 1100);
    return () => clearTimeout(t);
  }, [drawing, revealed]);
  useEffect(() => {
    if (!drawing) return;
    const t = setInterval(() => setSpin((s) => s + 1), 100);
    return () => clearInterval(t);
  }, [drawing]);
  const cupStarted = cupPlayed > 0 || Object.keys(overrides).some((k) => k.startsWith('cup-'));

  const cupEff = useCallback((m: CupMatch, winners: Map<string, string>): { st: Status; sa: number; sb: number; comment?: string; shot?: string; forfeit?: boolean; a: string | null; b: string | null } => {
    const [a, b] = cupSides(m, winners);
    const k = `cup-${m.id}`;
    if (!a || !b) return { st: 'SCHEDULED', sa: m.sa, sb: m.sb, a, b };
    if (m.round <= cupPlayed) {
      const o = overrides[k];
      return o ? { st: 'CONFIRMED', sa: o.sa, sb: o.sb, shot: o.shot, forfeit: o.forfeit, a, b } : { st: 'CONFIRMED', sa: m.sa, sb: m.sb, a, b };
    }
    if (overrides[k]) {
      const o = overrides[k];
      return { st: o.status, sa: o.sa, sb: o.sb, comment: o.comment, shot: o.shot, forfeit: o.forfeit, a, b };
    }
    if (m.round === cupCurrent && m.slot === 0) return { st: 'RESULT_SUBMITTED', sa: m.sa, sb: m.sb, a, b };
    return { st: 'SCHEDULED', sa: m.sa, sb: m.sb, a, b };
  }, [cupPlayed, overrides, cupSides, cupCurrent]);

  // Winners fill in round order so later rounds resolve from confirmed feeders.
  const cupWinners = useMemo(() => {
    const w = new Map<string, string>();
    for (const m of [...cupMatches].sort((x, y) => x.round - y.round || x.slot - y.slot)) {
      const e = cupEff(m, w);
      if (e.st === 'CONFIRMED' && e.a && e.b) w.set(m.id, e.sa > e.sb ? e.a : e.sb > e.sa ? e.b : e.a);
    }
    return w;
  }, [cupMatches, cupEff]);

  const cupFinal = cupMatches.find((m) => m.round === cupRounds);
  const champion = cupFinal ? cupWinners.get(cupFinal.id) ?? null : null;
  const cupConfirmed = cupMatches.filter((m) => cupEff(m, cupWinners).st === 'CONFIRMED').length;
  const cupPending = cupMatches.filter((m) => cupEff(m, cupWinners).st === 'RESULT_SUBMITTED').length;

  // Recap video: rendered once per champion, showing every round to the final.
  const [recapUrl, setRecapUrl] = useState<string | null>(null);
  const [recapExt, setRecapExt] = useState('webm');
  const [recapRendering, setRecapRendering] = useState(false);
  const recapCancel = useRef<(() => void) | null>(null);
  const celebratedRef = useRef<string | null>(null);
  const snapshot = useMemo<RecapTie[]>(() => cupMatches
    .slice()
    .sort((x, y) => x.round - y.round || x.slot - y.slot)
    .map((m) => {
      const e = cupEff(m, cupWinners);
      return { round: m.round, a: e.a, b: e.b, sa: e.sa, sb: e.sb };
    }), [cupMatches, cupEff, cupWinners]);

  const renderRecap = useCallback(() => {
    if (!champion || !canRecord()) return;
    if (recapUrl) { URL.revokeObjectURL(recapUrl); setRecapUrl(null); }
    recapCancel.current?.();
    setRecapRendering(true);
    const snap = snapshot;
    const champ = champion;
    const cancel = captureVideo((g, el) => drawRecapFrame(g, snap, champ, el), RECAP_MS, (url, ext) => {
      setRecapExt(ext);
      setRecapUrl(url);
      setRecapRendering(false);
    });
    if (!cancel) {
      setRecapRendering(false);
      return;
    }
    recapCancel.current = cancel;
  }, [champion, snapshot]);

  useEffect(() => {
    if (champion && celebratedRef.current !== champion) {
      celebratedRef.current = champion;
      renderRecap();
    }
    if (!champion) celebratedRef.current = null;
  }, [champion, renderRecap]);

  const roundFixtures = fixtures.filter((f) => f.round === shown);
  const confirmedCount = fixtures.filter((f) => eff(f).st === 'CONFIRMED').length;
  const pendingCount = fixtures.filter((f) => eff(f).st === 'RESULT_SUBMITTED').length;
  const myNext = fixtures.find((f) => (f.a === ME || f.b === ME) && eff(f).st !== 'CONFIRMED');
  const myNextEff = myNext ? eff(myNext) : null;
  const myNextCup = cupMatches
    .slice()
    .sort((x, y) => x.round - y.round || x.slot - y.slot)
    .find((m) => {
      const e = cupEff(m, cupWinners);
      return (e.a === ME || e.b === ME) && e.st !== 'CONFIRMED';
    });
  const myNextCupEff = myNextCup ? cupEff(myNextCup, cupWinners) : null;

  const submitMine = (target: SimFixture | CupMatch, isCup: boolean) => {
    // Screenshot is obligatory — score or forfeit, no proof means no submit.
    if (!myShot) {
      setSubmitMsg('Screenshot required — attach match evidence first.');
      return;
    }
    setSubmitMsg(null);
    // Forfeit claim = walkover 3–0 for the claimant; a reviewer must accept it.
    let sa = Math.max(0, Math.min(9, parseInt(myA, 10) || 0));
    let sb = Math.max(0, Math.min(9, parseInt(myB, 10) || 0));
    if (myForfeit) { sa = 3; sb = 0; }
    const k = isCup ? `cup-${(target as CupMatch).id}` : keyOf(target as SimFixture);
    let mineIsA: boolean;
    if (isCup) {
      const e = cupEff(target as CupMatch, cupWinners);
      mineIsA = e.a === ME;
    } else {
      mineIsA = (target as SimFixture).a === ME;
    }
    setOverrides((o) => ({ ...o, [k]: { status: 'RESULT_SUBMITTED', sa: mineIsA ? sa : sb, sb: mineIsA ? sb : sa, shot: myShot ?? undefined, forfeit: myForfeit || undefined } }));
    setMyA(''); setMyB(''); setMyShot(null); setMyForfeit(false);
  };

  const confirmKey = (k: string, sa: number, sb: number, shot?: string, forfeit?: boolean) => {
    setOverrides((o) => ({ ...o, [k]: { status: 'CONFIRMED', sa, sb, shot, forfeit } }));
  };

  const sendRejection = (k: string, sa: number, sb: number, shot?: string) => {
    const comment = rejectText.trim() || 'No reason given.';
    setOverrides((o) => ({ ...o, [k]: { status: 'REJECTED', sa, sb, comment, shot } }));
    setRejecting(null); setRejectText('');
  };

  const openDm = (id: string, label: string, comment?: string) => {
    const prefill = comment
      ? `Hi ${NAMES[id]}, rejected: ${comment} (${label})`
      : `Hi ${NAMES[id]}, about ${label}…`;
    setDmTo({ id, prefill });
    setDmText(prefill);
    setDmSent(null);
  };

  const simulate = () => {
    if (played >= rounds) return;
    setPlayed(played + 1);
    setRound(Math.min(played + 2, rounds));
  };

  const simulateCup = () => {
    if (cupPlayed >= cupRounds) return;
    // Confirm every decided-eligible match of the current round.
    setOverrides((o) => {
      const next = { ...o };
      for (const m of cupMatches.filter((x) => x.round === cupCurrent)) {
        const e = cupEff(m, cupWinners);
        if (e.a && e.b && e.st !== 'CONFIRMED') next[`cup-${m.id}`] = { status: 'CONFIRMED', sa: e.sa, sb: e.sb, shot: e.shot };
      }
      return next;
    });
    setCupPlayed(cupPlayed + 1);
  };

  const reset = () => {
    cancelRec();
    if (recapCancel.current) { recapCancel.current(); recapCancel.current = null; }
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    if (recapUrl) { URL.revokeObjectURL(recapUrl); setRecapUrl(null); }
    setVideoOpen(false);
    setRecapRendering(false);
    celebratedRef.current = null;
    setPlayed(5); setRound(6); setCupPlayed(0); setOverrides({}); setMyA(''); setMyB(''); setMyShot(null); setMyForfeit(false); setSubmitMsg(null);
    setRejecting(null); setRejectText(''); setLightbox(null); setProfileId(null); setDmTo(null);
    setDraw(null); setDrawing(false); setRevealed(0);
  };

  const shareFile = async (url: string, ext: string, filename: string, title: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${filename}.${ext}`, { type: blob.type || 'video/webm' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch { /* dismissed — fall through to download */ }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    a.click();
  };

  const closeRecap = () => {
    if (recapUrl) URL.revokeObjectURL(recapUrl);
    setRecapUrl(null);
  };

  const shareVideo = () => {
    if (videoUrl) void shareFile(videoUrl, videoExt, 'vik-cup-draw', 'VIK Cup Draw');
  };

  const shareRecap = () => {
    if (recapUrl) void shareFile(recapUrl, recapExt, 'vik-cup-recap', 'VIK Cup Recap');
  };

  const exportPng = (make: () => string | null, filename: string) => {
    try {
      const url = make();
      if (url) setImgModal({ url, name: `${filename}.png` });
    } catch { /* canvas unavailable — no-op */ }
  };

  const shareImage = () => {
    if (imgModal) void shareFile(imgModal.url, 'png', imgModal.name.replace(/\.png$/, ''), 'VIK Competition');
  };
  const switchComp = (c: 'league' | 'cup') => {
    setComp(c);
    setTab(c === 'league' ? 'table' : 'bracket');
  };

  const profile = profileId ? {
    id: profileId,
    row: standings.find((r) => r.player_id === profileId) ?? null,
    pos: standings.findIndex((r) => r.player_id === profileId) + 1,
    form: fixtures
      .filter((f) => (f.a === profileId || f.b === profileId) && eff(f).st === 'CONFIRMED')
      .sort((x, y) => x.round - y.round)
      .slice(-5)
      .map((f) => {
        const e = eff(f);
        const mine = f.a === profileId ? e.sa : e.sb;
        const theirs = f.a === profileId ? e.sb : e.sa;
        return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
      }),
  } : null;

  const myMatchCard = (target: SimFixture | CupMatch | undefined, effRes: { st: Status; sa: number; sb: number; comment?: string; forfeit?: boolean } | null, label: string, aId: string, bId: string, isCup: boolean) => {
    if (!target || !effRes) return <p className="mt-1 text-sm opacity-70">Season complete — no fixtures left.</p>;
    const scoreForm = (
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className={`text-xs opacity-60 ${myForfeit ? 'pointer-events-none opacity-30' : ''}`}>You
            <input value={myA} disabled={myForfeit} onChange={(e) => setMyA(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={1} aria-label="Your score" className="input ml-1 h-11 w-12 text-center text-lg font-bold" />
          </label>
          <span className="font-mono opacity-60">–</span>
          <label className={`text-xs opacity-60 ${myForfeit ? 'pointer-events-none opacity-30' : ''}`}>Opp
            <input value={myB} disabled={myForfeit} onChange={(e) => setMyB(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={1} aria-label="Opponent score" className="input ml-1 h-11 w-12 text-center text-lg font-bold" />
          </label>
          <button onClick={() => submitMine(target, isCup)} className="btn-primary h-11 flex-1 text-sm">
            {effRes.st === 'REJECTED' ? 'Resubmit' : 'Submit result'}
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={myForfeit} onChange={(e) => setMyForfeit(e.target.checked)} className="h-4 w-4 accent-orange-500" />
          Opponent forfeited (no-show — walkover 3–0, needs reviewer accept)
        </label>
        <label className="file-upload text-xs">
          <span>{myShot ? 'Screenshot attached ✓ (required)' : 'Upload match screenshot (required)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Match screenshot" onChange={(e) => onShotFile(e.target.files?.[0])} />
          {myShot && <span className="file-name">attached</span>}
        </label>
        {myShot && <img src={myShot} alt="Your screenshot preview" className="h-24 w-40 rounded-lg border border-white/20 object-cover" />}
        {submitMsg && <p className="rounded-lg bg-red-500/10 px-2 py-1 text-xs font-bold text-red-400">{submitMsg}</p>}
      </div>
    );
    return (
      <div className="mt-2">
        <p className="text-sm">
          <span className="font-bold">{label}</span>
          {' · '}{NAMES[aId]} <span className="font-mono font-bold">{effRes.st === 'SCHEDULED' ? 'vs' : `${effRes.sa}–${effRes.sb}`}</span> {NAMES[bId]}
        </p>
        {effRes.st === 'SCHEDULED' && scoreForm}
        {effRes.st === 'REJECTED' && (
          <div className="mt-2">
            <p className="rounded-xl bg-red-500/10 p-2 text-sm text-red-400">
              Rejected by reviewer: {effRes.comment} — fix the score and resubmit below.
            </p>
            {scoreForm}
          </div>
        )}
        {effRes.st === 'RESULT_SUBMITTED' && (
          <p className="mt-2 rounded-xl bg-amber-500/10 p-2 text-sm text-amber-400">
            {effRes.forfeit
              ? 'Forfeit claimed (3–0 walkover) — waiting for moderator/admin accept. It won\'t count until CONFIRMED.'
              : `Result submitted (${effRes.sa}–${effRes.sb}) — waiting for opponent / reviewer confirmation. It won't count until CONFIRMED.`}
          </p>
        )}
      </div>
    );
  };

  const rowHandlers = (
    k: string, e: { st: Status; sa: number; sb: number; comment?: string; shot?: string; forfeit?: boolean },
    aId: string | null, bId: string | null, label: string, mine: boolean,
  ): RowHandlers => ({
    role,
    mine,
    meSide: aId === ME ? 'a' : bId === ME ? 'b' : null,
    openDm: (which: string) => {
      const id = which === 'opp' ? (aId === ME ? bId : aId) : which === 'a' ? aId : bId;
      if (id) openDm(id, label, e.comment);
    },
    confirmOne: () => confirmKey(k, e.sa, e.sb, e.shot, e.forfeit),
    startReject: () => { setRejecting(k); setRejectText(e.comment ?? ''); },
    rejecting: rejecting === k,
    rejectText,
    setRejectText,
    sendRejection: () => sendRejection(k, e.sa, e.sb, e.shot),
    cancelReject: () => setRejecting(null),
    zoom: setLightbox,
  });

  return (
    <main className="page">
      <AppBar title="Competition Sim · 16 players" />
      <div className="card mt-3">
        <h2 className="font-display text-lg">VIK Championship <span className="text-xs opacity-60">(SIMULATION — fake data)</span></h2>
        <div className="mt-2 flex gap-1 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Competition type">
          {(['league', 'cup'] as const).map((c) => (
            <button
              key={c} role="tab" aria-selected={comp === c} onClick={() => switchComp(c)}
              className={`h-10 flex-1 rounded-lg text-sm font-bold uppercase tracking-wider ${comp === c ? 'bg-brand-500/25 text-brand-300' : 'opacity-60'}`}
            >
              {c === 'league' ? 'League · 15 rounds' : 'Cup · knockout'}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Point of view">
          {(['player', 'moderator', 'admin'] as const).map((r) => (
            <button
              key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}
              className={`h-10 flex-1 rounded-lg text-xs font-bold uppercase tracking-wider sm:text-sm ${role === r ? 'bg-brand-500/25 text-brand-300' : 'opacity-60'}`}
            >
              {r === 'player' ? 'Player view' : r === 'moderator' ? 'Moderator view' : 'Admin view'}
            </button>
          ))}
        </div>
        {comp === 'league' ? (
          <>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-2 py-1">Matchday {current} of {rounds}</span>
              <span className="rounded-full bg-white/10 px-2 py-1">{confirmedCount} / {fixtures.length} confirmed</span>
              {role !== 'player' && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-400">{pendingCount} awaiting confirmation</span>}
            </div>
            {role === 'admin' && (
              <div className="mt-3 flex gap-2">
                <button disabled={played >= rounds} onClick={simulate} className="btn-primary h-11 flex-1 text-sm disabled:opacity-40">
                  <Icon name="swords" className="h-5 w-5" /> Simulate matchday {current}
                </button>
                <button onClick={reset} className="btn-ghost h-11 px-4 text-sm">Reset</button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm opacity-70">
              Single elimination · {cupMatches.length} matches · random draw.
              Winners advance automatically in this sim (an admin does it by hand in the real app).
            </p>
            {champion && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-brand-500/50 bg-brand-500/10 p-3">
                <Icon name="trophy" className="h-7 w-7 text-brand-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-widest opacity-60">Champion</div>
                  <div className="font-display text-lg text-brand-300">{NAMES[champion]}</div>
                </div>
                {recapRendering ? (
                  <span className="shrink-0 animate-pulse text-xs font-bold text-brand-300">Rendering recap…</span>
                ) : !recapUrl ? (
                  <button onClick={renderRecap} className="btn-primary h-10 shrink-0 px-3 text-xs">🎬 Recap video</button>
                ) : null}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-2 py-1">{roundNameForSize(16, cupCurrent)} · round {cupCurrent} of {cupRounds}</span>
              <span className="rounded-full bg-white/10 px-2 py-1">{cupConfirmed} / {cupMatches.length} confirmed</span>
              {role !== 'player' && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-400">{cupPending} awaiting confirmation</span>}
              {videoUrl && !drawing && (
                <button onClick={() => setVideoOpen(true)} className="rounded-full bg-brand-500/15 px-2 py-1 font-bold text-brand-300">🎬 Draw video</button>
              )}
            </div>
            {role === 'admin' && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  {!draw ? (
                    <button onClick={startDraw} className="btn-primary h-11 flex-1 text-sm">
                      <Icon name="trophy" className="h-5 w-5" /> Run the draw
                    </button>
                  ) : (
                    <button disabled={cupPlayed >= cupRounds} onClick={simulateCup} className="btn-primary h-11 flex-1 text-sm disabled:opacity-40">
                      <Icon name="swords" className="h-5 w-5" /> Simulate {roundNameForSize(16, cupCurrent)}
                    </button>
                  )}
                  <button onClick={reset} className="btn-ghost h-11 flex-1 text-sm">Reset</button>
                </div>
                {!cupStarted && draw && (
                  <button onClick={startDraw} className="btn-ghost h-11 w-full text-sm">Re-draw</button>
                )}
                <p className="text-xs opacity-60">Every draw is recorded automatically — members can rewatch and share the video.</p>
              </div>
            )}
            {role === 'player' && !draw && (
              <p className="mt-2 rounded-xl bg-white/5 p-2 text-sm opacity-70">The draw hasn't been held yet — check back once the admin runs it.</p>
            )}
          </>
        )}
      </div>

      {role === 'player' && comp === 'league' && (
        <section className="card mt-3" aria-label="My next match">
          <h2 className="card-title">My next match · {NAMES[ME]}</h2>
          {myNext && myNextEff
            ? myMatchCard(myNext, myNextEff, `Matchday ${myNext.round}`, myNext.a, myNext.b, false)
            : <p className="mt-1 text-sm opacity-70">Season complete — no fixtures left.</p>}
        </section>
      )}
      {role === 'player' && comp === 'cup' && (
        <section className="card mt-3" aria-label="My next cup match">
          <h2 className="card-title">My next cup match · {NAMES[ME]}</h2>
          {myNextCup && myNextCupEff && myNextCupEff.a && myNextCupEff.b
            ? myMatchCard(myNextCup, myNextCupEff, roundNameForSize(16, myNextCup.round), myNextCupEff.a, myNextCupEff.b, true)
            : <p className="mt-1 text-sm opacity-70">
              {champion === ME ? 'You won the cup!' : champion ? 'Knocked out or waiting — season over for you.' : 'Waiting for your opponent to be decided…'}
            </p>}
        </section>
      )}

      <div className="mt-3 flex gap-1 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Sections">
        {(comp === 'league' ? (['table', 'fixtures'] as const) : (['bracket', 'matches'] as const)).map((tb) => (
          <button
            key={tb} role="tab" aria-selected={tab === tb} onClick={() => setTab(tb)}
            className={`h-11 flex-1 rounded-lg text-sm font-bold uppercase tracking-wider ${tab === tb ? 'bg-brand-500/25 text-brand-300' : 'opacity-60'}`}
          >
            {tb === 'table' ? 'League table' : tb === 'fixtures' ? 'Matchmaking' : tb === 'bracket' ? 'Bracket' : 'Matches'}
          </button>
        ))}
      </div>

      {comp === 'league' && tab === 'table' && (
        <section className="card mt-3" aria-label="Standings">
          <h2 className="card-title">League table · {confirmedCount} matches confirmed · tap a player for profile</h2>
          {role !== 'player' && (
            <button
              onClick={() => exportPng(() => tableImage('VIK LEAGUE', `Standings · after ${played} matchdays`, standings.map((r, i) => ({
                pos: i + 1, name: NAMES[r.player_id] ?? r.player_id, p: r.played, w: r.wins, d: r.draws, l: r.losses,
                gf: r.goals_for, ga: r.goals_against, gd: r.goal_difference, pts: r.points,
              }))), 'vik-league-table')}
              className="btn-ghost mt-2 h-10 px-3 text-xs"
            >📷 Table image (PNG)</button>
          )}
          <div className="mt-2"><StandingsTable rows={standings} names={NAMES} onPlayerClick={setProfileId} /></div>
        </section>
      )}

      {comp === 'league' && tab === 'fixtures' && (
        <section className="card mt-3" aria-label="Fixtures">
          <h2 className="card-title">Matchmaking · fixtures by matchday</h2>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                onClick={() => setRound(r)}
                aria-label={`Matchday ${r}`}
                className={`h-9 min-w-9 shrink-0 rounded-lg px-2 text-xs font-bold ${r === shown ? 'bg-brand-500/25 text-brand-300' : 'bg-white/5 opacity-70'} ${r === current ? 'border border-brand-500/50' : ''}`}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs opacity-60">
            Matchday {shown}{shown === current && played < rounds ? ' · playing now (deadline in 2 days)' : shown <= played ? ' · finished' : ' · upcoming'}
          </p>
          {role !== 'player' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => exportPng(() => matchImage('VIK LEAGUE', `Matchday ${shown} · fixtures`, roundFixtures.map((f) => (
                  { a: NAMES[f.a], b: NAMES[f.b], sa: 0, sb: 0, decided: false, winner: null }
                )), false), `vik-league-md${shown}-preview`)}
                className="btn-ghost h-10 flex-1 px-3 text-xs"
              >📷 Preview image</button>
              <button
                onClick={() => exportPng(() => matchImage('VIK LEAGUE', `Matchday ${shown} · results`, roundFixtures.map((f) => {
                  const e = eff(f);
                  const decided = e.st !== 'SCHEDULED';
                  return {
                    a: NAMES[f.a], b: NAMES[f.b], sa: e.sa, sb: e.sb, decided,
                    winner: decided ? (e.sa > e.sb ? 'a' as const : e.sb > e.sa ? 'b' as const : null) : null,
                  };
                }), true), `vik-league-md${shown}-results`)}
                className="btn-ghost h-10 flex-1 px-3 text-xs"
              >📷 Results image</button>
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-2">
            {roundFixtures.map((f) => {
              const e = eff(f);
              const k = keyOf(f);
              const showScore = e.st !== 'SCHEDULED';
              const mine = f.a === ME || f.b === ME;
              const img = showScore ? evidence(NAMES[f.a], NAMES[f.b], e.sa, e.sb, `MD ${f.round}`) : null;
              const h = rowHandlers(k, e, f.a, f.b, `matchday ${f.round}`, mine);
              return (
                <FixtureRow key={k} aName={NAMES[f.a]} bName={NAMES[f.b]}
                  score={showScore ? `${e.sa}–${e.sb}` : 'vs'} showScore={showScore}
                  img={e.shot ?? img} st={e.st} comment={e.comment} forfeit={e.forfeit}
                  winner={showScore ? (e.sa > e.sb ? 'a' : e.sb > e.sa ? 'b' : null) : null} h={h} />
              );
            })}
          </ul>
        </section>
      )}

      {comp === 'cup' && tab === 'bracket' && (
        <>
          <CupBracket
            cupMatches={cupMatches} cupRounds={cupRounds} cupCurrent={cupCurrent} cupWinners={cupWinners}
            cupEff={cupEff} champion={champion} drawn={!!draw} onOpenMatches={() => setTab('matches')}
          />
          {role !== 'player' && (
            <button
              onClick={() => exportPng(() => bracketImage('VIK CUP', 'Knockout bracket', Array.from({ length: cupRounds }, (_, i) => i + 1).map((r) => ({
                name: roundNameForSize(16, r),
                ties: cupMatches.filter((m) => m.round === r).sort((x, y) => x.slot - y.slot).map((m) => {
                  const e = cupEff(m, cupWinners);
                  const decided = e.st !== 'SCHEDULED' && !!e.a && !!e.b;
                  return {
                    a: e.a ? NAMES[e.a] : null, b: e.b ? NAMES[e.b] : null, sa: e.sa, sb: e.sb, decided,
                    winner: decided ? (e.sa > e.sb ? 'a' : 'b') as 'a' | 'b' : null,
                  };
                }),
              })), champion ? NAMES[champion] : null), 'vik-cup-bracket')}
              className="btn-ghost mt-2 h-10 w-full px-3 text-xs"
            >📷 Bracket image (PNG)</button>
          )}
        </>
      )}

      {comp === 'cup' && tab === 'matches' && (
        <section className="card mt-3" aria-label="Cup matches">
          <h2 className="card-title">Matches · evidence, confirm & message</h2>
          {role !== 'player' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => exportPng(() => matchImage('VIK CUP', `${roundNameForSize(16, cupCurrent)} · fixtures`, cupMatches.filter((m) => m.round === cupCurrent).sort((x, y) => x.slot - y.slot).map((m) => {
                  const e = cupEff(m, cupWinners);
                  return { a: e.a ? NAMES[e.a] : 'TBD', b: e.b ? NAMES[e.b] : 'TBD', sa: 0, sb: 0, decided: false, winner: null };
                }), false), `vik-cup-${roundNameForSize(16, cupCurrent).toLowerCase().replace(/ /g, '-')}-preview`)}
                className="btn-ghost h-10 flex-1 px-3 text-xs"
              >📷 Round preview</button>
              <button
                onClick={() => exportPng(() => matchImage('VIK CUP', `${roundNameForSize(16, cupCurrent)} · results`, cupMatches.filter((m) => m.round === cupCurrent).sort((x, y) => x.slot - y.slot).map((m) => {
                  const e = cupEff(m, cupWinners);
                  const decided = e.st !== 'SCHEDULED' && !!e.a && !!e.b;
                  return {
                    a: e.a ? NAMES[e.a] : 'TBD', b: e.b ? NAMES[e.b] : 'TBD', sa: e.sa, sb: e.sb, decided,
                    winner: decided ? (e.sa > e.sb ? 'a' : 'b') as 'a' | 'b' : null,
                  };
                }), true), `vik-cup-${roundNameForSize(16, cupCurrent).toLowerCase().replace(/ /g, '-')}-results`)}
                className="btn-ghost h-10 flex-1 px-3 text-xs"
              >📷 Round results</button>
            </div>
          )}
          {Array.from({ length: cupRounds }, (_, i) => i + 1).map((r) => (
            <div key={r} className="mt-3 first:mt-2">
              <p className={`text-xs font-bold uppercase tracking-wider ${r === cupCurrent ? 'text-brand-300' : 'opacity-60'}`}>
                {roundNameForSize(16, r)}{r === cupCurrent && cupPlayed < cupRounds ? ' · playing now' : ''}
              </p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {cupMatches.filter((m) => m.round === r).sort((x, y) => x.slot - y.slot).map((m) => {
                  const e = cupEff(m, cupWinners);
                  const k = `cup-${m.id}`;
                  const showScore = e.st !== 'SCHEDULED' && !!e.a && !!e.b;
                  const mine = e.a === ME || e.b === ME;
                  const img = showScore && e.a && e.b ? evidence(NAMES[e.a], NAMES[e.b], e.sa, e.sb, roundNameForSize(16, r)) : null;
                  const h = rowHandlers(k, e, e.a, e.b, `${roundNameForSize(16, r).toLowerCase()} match`, mine);
                  return (
                    <FixtureRow key={k}
                      aName={e.a ? NAMES[e.a] : 'TBD'} bName={e.b ? NAMES[e.b] : 'TBD'}
                      score={showScore ? `${e.sa}–${e.sb}` : 'vs'} showScore={showScore}
                      img={e.shot ?? img} st={e.st} comment={e.comment} forfeit={e.forfeit}
                      winner={showScore ? (e.sa > e.sb ? 'a' : e.sb > e.sa ? 'b' : null) : null} h={h} />
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      <Link to="/competitions" className="btn-ghost mt-3 flex w-full items-center justify-center gap-2">
        <Icon name="back" className="h-5 w-5" /> Back to competitions
      </Link>
      <BottomNav />

      {drawing && draw && (
        <DrawCeremony draw={draw} revealed={revealed} spin={spin} recording={isRecording}
          onCancel={cancelDraw} />
      )}

      {videoOpen && videoUrl && !drawing && (
        <div role="dialog" aria-label="Draw video" onClick={() => setVideoOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm">
            <h3 className="font-bold">Draw video ready 🎬</h3>
            <p className="mt-0.5 text-xs opacity-60">Portrait 720×1280 — made for WhatsApp Status & stories.</p>
            <video src={videoUrl} controls playsInline preload="metadata" className="mt-2 max-h-[50vh] w-full rounded-xl border border-white/20 bg-black" />
            <div className="mt-2 flex gap-2">
              <a href={videoUrl} download={`vik-cup-draw.${videoExt}`} className="btn-primary flex h-11 flex-1 items-center justify-center text-sm">Download</a>
              <button onClick={shareVideo} className="btn-ghost h-11 flex-1 text-sm">Share</button>
              <button onClick={() => setVideoOpen(false)} className="btn-ghost h-11 px-4 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {recapUrl && !drawing && (
        <div role="dialog" aria-label="Cup recap video" onClick={closeRecap} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm">
            <h3 className="font-bold">Cup recap — road to the final 🏆</h3>
            <p className="mt-0.5 text-xs opacity-60">Every round, every result, then the champion — ready to share.</p>
            <video src={recapUrl} controls playsInline preload="metadata" className="mt-2 max-h-[50vh] w-full rounded-xl border border-white/20 bg-black" />
            <div className="mt-2 flex gap-2">
              <a href={recapUrl} download={`vik-cup-recap.${recapExt}`} className="btn-primary flex h-11 flex-1 items-center justify-center text-sm">Download</a>
              <button onClick={shareRecap} className="btn-ghost h-11 flex-1 text-sm">Share</button>
              <button onClick={closeRecap} className="btn-ghost h-11 px-4 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {imgModal && (
        <div role="dialog" aria-label="Generated image" onClick={() => setImgModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm">
            <h3 className="font-bold">Shareable image 🖼️</h3>
            <img src={imgModal.url} alt="Generated shareable" className="mt-2 max-h-[50vh] w-full rounded-xl border border-white/20 bg-black object-contain" />
            <div className="mt-2 flex gap-2">
              <a href={imgModal.url} download={imgModal.name} className="btn-primary flex h-11 flex-1 items-center justify-center text-sm">Download PNG</a>
              <button onClick={shareImage} className="btn-ghost h-11 flex-1 text-sm">Share</button>
              <button onClick={() => setImgModal(null)} className="btn-ghost h-11 px-4 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div role="dialog" aria-label="Screenshot evidence enlarged" onClick={() => setLightbox(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <img src={lightbox} alt="Match screenshot evidence enlarged" className="max-h-full max-w-full rounded-xl border border-white/25 object-contain" />
        </div>
      )}

      {profile && (
        <div role="dialog" aria-label="Player profile" onClick={() => setProfileId(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm">
            <div className="flex items-center gap-3">
              <span className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-2xl text-brand-300">
                {(NAMES[profile.id] ?? '?').replace('VIK ', '').slice(0, 1)}
              </span>
              <div className="min-w-0">
                <h3 className="font-display truncate text-lg">{NAMES[profile.id]}</h3>
                <p className="text-xs opacity-60">
                  {profile.row ? `Rank #${profile.pos} · ${profile.row.points} pts · ${profile.row.played} played` : 'No confirmed matches yet'}
                </p>
              </div>
            </div>
            {profile.row && (
              <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                <div className="rounded-lg bg-white/5 p-2"><div className="text-[11px] opacity-60">W–D–L</div><div className="font-mono font-bold">{profile.row.wins}–{profile.row.draws}–{profile.row.losses}</div></div>
                <div className="rounded-lg bg-white/5 p-2"><div className="text-[11px] opacity-60">GF–GA</div><div className="font-mono font-bold">{profile.row.goals_for}–{profile.row.goals_against}</div></div>
                <div className="rounded-lg bg-white/5 p-2"><div className="text-[11px] opacity-60">GD</div><div className="font-mono font-bold">{profile.row.goal_difference > 0 ? `+${profile.row.goal_difference}` : profile.row.goal_difference}</div></div>
              </div>
            )}
            <div className="mt-2">
              <p className="text-xs opacity-60">Form (last 5)</p>
              <div className="mt-1 flex gap-1.5">
                {profile.form.length === 0 && <span className="text-xs opacity-60">—</span>}
                {profile.form.map((r, i) => (
                  <span key={i} aria-label={r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'} className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${r === 'W' ? 'bg-green-500/20 text-green-400' : r === 'D' ? 'bg-zinc-500/20 text-zinc-300' : 'bg-red-500/20 text-red-400'}`}>{r}</span>
                ))}
              </div>
            </div>
            <button onClick={() => setProfileId(null)} className="btn-ghost mt-3 h-11 w-full text-sm">Close</button>
          </div>
        </div>
      )}

      {dmTo && (
        <div role="dialog" aria-label="Direct message" onClick={() => setDmTo(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm">
            <h3 className="font-bold">Message {NAMES[dmTo.id]}</h3>
            <p className="mt-0.5 text-xs opacity-60">Simulated DM — in the real app this notifies the player.</p>
            <textarea
              value={dmText} onChange={(e) => setDmText(e.target.value)} rows={3} maxLength={280}
              aria-label="Message text" className="input mt-2 h-auto py-2 text-sm"
            />
            {dmSent && <p className="mt-1 text-xs text-green-400">{dmSent}</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => { setDmSent(`Sent to ${NAMES[dmTo.id]} (simulated).`); }}
                className="btn-primary h-11 flex-1 text-sm"
              >
                Send
              </button>
              <button onClick={() => setDmTo(null)} className="btn-ghost h-11 px-4 text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
