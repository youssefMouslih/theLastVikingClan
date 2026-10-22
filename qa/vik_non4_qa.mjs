import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(QA_DIR, '..', 'app');
const TMP = path.join(QA_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const { createClient } = await import(
  pathToFileURL(path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'index.mjs')).href
);
const STATE_PATH = path.join(TMP, 'vik_full_qa_accounts.json');
const OUT_PATH = path.join(TMP, 'vik_non4_qa_state.json');
const RESULT_PATH = path.join(TMP, 'vik_non4_qa_results.json');
const parse = (f) => Object.fromEntries(
  (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const env = { ...parse('.env.test.local'), ...parse('.env') };
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error('Missing Supabase env');

const accountsState = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const PASSWORD = accountsState.password;
const accounts = Object.fromEntries(accountsState.accounts.map((a) => [a.alias, a]));
const aliasByUserId = new Map(accountsState.accounts.map((a) => [a.id, a.alias]));
const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = new Map();

const results = [];
let failures = 0;
const created = {
  competitions: [], rounds: [], matches: [], challenges: [], gifts: [], squads: [], squadMembers: [],
  tryouts: [], announcements: [], honours: [], ratings: [], throneReigns: [], audit: [],
  evidencePaths: [], avatarPaths: [], notifications: [],
};
const save = () => fs.writeFileSync(OUT_PATH, JSON.stringify(created, null, 2));

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    failures++;
    results.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    console.log('FAIL', name, '—', e instanceof Error ? e.message : String(e));
  }
}
async function run(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
async function expectError(label, fn, pattern) {
  try {
    const res = await fn();
    if (res && typeof res === 'object' && 'error' in res) {
      if (!res.error) throw new Error(`${label}: expected an error but call succeeded`);
      if (pattern && !pattern.test(res.error.message)) throw new Error(`${label}: unexpected error: ${res.error.message}`);
      return res.error;
    }
    throw new Error(`${label}: expected an error but call succeeded`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith(`${label}:`)) throw e;
    if (pattern && !pattern.test(msg)) throw new Error(`${label}: unexpected error: ${msg}`);
    return e;
  }
}
async function as(alias) {
  if (clients.has(alias)) return clients.get(alias);
  const a = accounts[alias];
  if (!a) throw new Error(`No account ${alias}`);
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: a.email, password: PASSWORD });
  if (error) throw new Error(`Login ${alias}: ${error.message}`);
  clients.set(alias, c);
  return c;
}
const id = (alias) => accounts[alias].id;
const clientFor = (userId) => {
  const alias = aliasByUserId.get(userId);
  const c = alias ? clients.get(alias) : null;
  if (!c) throw new Error(`No client for ${userId}`);
  return c;
};
const now = () => new Date().toISOString();
const plusHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64');
const pngFile = (name = 'qa.png') => new File([PNG], name, { type: 'image/png' });

function roundRobin(playerIds) {
  const players = [...playerIds];
  if (players.length < 2) return [];
  const list = players.length % 2 === 1 ? [...players, null] : [...players];
  const n = list.length;
  const out = [];
  const arr = [...list];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a && b) out.push({ round_number: round + 1, player_a_id: a, player_b_id: b });
    }
    arr.splice(1, 0, arr.pop());
  }
  return out;
}

await as('admin'); await as('staff');
for (let n = 1; n <= 17; n++) await as(`p${String(n).padStart(2, '0')}`);
const admin = clients.get('admin');
const staff = clients.get('staff');
const p01 = clients.get('p01');
const p02 = clients.get('p02');
const p03 = clients.get('p03');
const p04 = clients.get('p04');
const p05 = clients.get('p05');
const p06 = clients.get('p06');
const p07 = clients.get('p07');
const p08 = clients.get('p08');
const p09 = clients.get('p09');
const p10 = clients.get('p10');
const p11 = clients.get('p11');
const p12 = clients.get('p12');
const p13 = clients.get('p13');
const p16 = clients.get('p16');
const p17 = clients.get('p17');

// ============ A. AUTH + ONBOARDING + PROFILE ============
await test('A1 onboarding reward is gated before name/tag/phone', async () => {
  await expectError('A1', () => p01.rpc('claim_onboarding_reward'), /Complete your name/);
});
await test('A2 own profile gate fields save and onboarding pays +80 once', async () => {
  await run(p01.from('profiles').update({ known_name: `VIK QA01 ${suffix}`, whatsapp: '+21260000001' }).eq('id', id('p01')));
  await run(p01.rpc('claim_onboarding_reward'));
  await run(p01.rpc('claim_onboarding_reward'));
  const xp = await run(svc.from('xp_ledger').select('amount,reason').eq('player_id', id('p01')).eq('reason', 'onboarding-profile'));
  assert(xp.length === 1 && xp[0].amount === 80, `expected one +80 row, got ${JSON.stringify(xp)}`);
});
await test('A3 duplicate warrior tag is rejected', async () => {
  await expectError('A3', () => p02.from('profiles').update({ known_name: `VIK QA01 ${suffix}` }).eq('id', id('p02')), /duplicate|unique|known_name/i);
});
await test('A4 player cannot escalate their own role via direct profile update', async () => {
  await expectError('A4', () => p03.from('profiles').update({ role: 'ADMIN' }).eq('id', id('p03')), /cannot change your own role|Only staff/i);
});
await test('A5 onboard remaining QA players', async () => {
  for (let n = 2; n <= 17; n++) {
    const alias = `p${String(n).padStart(2, '0')}`;
    const c = clients.get(alias);
    const tag = `VIK QA${String(n).padStart(2, '0')} ${suffix}`;
    await run(c.from('profiles').update({ known_name: tag, whatsapp: `+212600001${String(n).padStart(2, '0')}` }).eq('id', id(alias)));
    await run(c.rpc('claim_onboarding_reward'));
  }
  for (let n = 2; n <= 16; n++) {
    const alias = `p${String(n).padStart(2, '0')}`;
    await run(clients.get(alias).from('profiles').update({ oath_accepted_at: now() }).eq('id', id(alias)));
  }
});
await test('A6 oath is required before joining a competition', async () => {
  await expectError('A6', () => p17.rpc('join_competition', { p_code: 'NOSUCH' }), /Oath/i);
  await run(p17.from('profiles').update({ oath_accepted_at: now() }).eq('id', id('p17')));
});
await test('A7 oath timestamp saves on own profile', async () => {
  await run(p01.from('profiles').update({ oath_accepted_at: now() }).eq('id', id('p01')));
  const row = await run(svc.from('profiles').select('oath_accepted_at').eq('id', id('p01')).single());
  assert(!!row.oath_accepted_at, 'oath not saved');
});
await test('A8 profile details (efootball, bio, socials, banner colour) persist', async () => {
  await run(p01.from('profiles').update({
    efootball_name: 'QA eFootball', efootball_id: 'QA-123', bio: 'QA bio', country: 'MA',
    instagram: '@qa', tiktok: '@qa', kick: 'qa', banner_color: '#123456', display_name: 'QA Player One',
  }).eq('id', id('p01')));
  const row = await run(p01.from('profiles').select('efootball_name,efootball_id,bio,country,instagram,tiktok,kick,banner_color,display_name').eq('id', id('p01')).single());
  assert(row.efootball_name === 'QA eFootball' && row.banner_color === '#123456' && row.display_name === 'QA Player One', JSON.stringify(row));
});
await test('A9 avatar upload, signed URL, and cross-user write guard', async () => {
  const avatarPath = `${id('p01')}/avatar-qa.png`;
  await run(p01.storage.from('avatars').upload(avatarPath, pngFile('avatar.png'), { contentType: 'image/png', upsert: true }));
  created.avatarPaths.push(avatarPath);
  const signed = await run(p01.storage.from('avatars').createSignedUrl(avatarPath, 60));
  assert(!!signed.signedUrl, 'no signed URL');
  await expectError('A9-cross', () => p02.storage.from('avatars').upload(avatarPath, pngFile('avatar2.png'), { contentType: 'image/png', upsert: true }), /row-level security|policy|denied|Unauthorized|violates/i);
  await run(p01.from('profiles').update({ avatar_url: avatarPath }).eq('id', id('p01')));
});
await test('A10 unknown direct profile status updates stay server-controlled', async () => {
  await expectError('A10', () => p04.from('profiles').update({ status: 'SUSPENDED' }).eq('id', id('p04')), /cannot change your own role|Only staff/i);
});

// ============ B. CLAN / ANNOUNCEMENTS / ADMIN ============
const clanBefore = await run(svc.from('clan_settings').select('*').limit(1).single());
await test('B1 admin can edit clan settings; player cannot', async () => {
  await run(admin.from('clan_settings').update({ description: `QA clan ${suffix}` }).eq('id', clanBefore.id));
  const seen = await run(p01.from('clan_settings').select('description').eq('id', clanBefore.id).single());
  assert(seen.description === `QA clan ${suffix}`, 'admin edit not visible');
  const attempted = await p01.from('clan_settings').update({ description: 'hacked' }).eq('id', clanBefore.id).select('id');
  assert((attempted.data ?? []).length === 0 && !attempted.error, `player clan update: ${attempted.error?.message ?? 'row changed'}`);
  const after = await run(svc.from('clan_settings').select('description').eq('id', clanBefore.id).single());
  assert(after.description === `QA clan ${suffix}`, 'player changed clan description');
  await run(admin.from('clan_settings').update({ description: clanBefore.description }).eq('id', clanBefore.id));
});
await test('B2 announcement create/read/delete with player write denial', async () => {
  const a = await run(admin.from('announcements').insert({ title: `QA announcement ${suffix}`, content: 'QA content', priority: 'NORMAL', created_by: id('admin') }).select('*').single());
  created.announcements.push(a.id);
  const seen = await run(p01.from('announcements').select('id').eq('id', a.id).maybeSingle());
  assert(seen?.id === a.id, 'player cannot read announcement');
  await expectError('B2-player', () => p01.from('announcements').insert({ title: 'nope', content: 'nope', created_by: id('p01') }), /row-level security|policy|permission|denied/i);
  await run(admin.from('announcements').delete().eq('id', a.id));
});
await test('B3 honour award/read/delete and player denial', async () => {
  const h = await run(admin.from('achievements').insert({ player_id: id('p01'), type: 'SPECIAL', name: `QA honour ${suffix}`, description: 'QA' }).select('*').single());
  created.honours.push(h.id);
  const seen = await run(p01.from('achievements').select('id').eq('id', h.id).maybeSingle());
  assert(seen?.id === h.id, 'honour not visible');
  await expectError('B3-player', () => p01.from('achievements').insert({ player_id: id('p01'), type: 'SPECIAL', name: 'fake' }), /row-level security|policy|permission|denied/i);
  await run(admin.from('achievements').delete().eq('id', h.id));
});
await test('B4 admin member role management and direct OWNER escalation guard', async () => {
  const before = await run(svc.from('profiles').select('role,status').eq('id', id('p24')).single());
  await run(admin.from('profiles').update({ role: 'MODERATOR' }).eq('id', id('p24')));
  let after = await run(svc.from('profiles').select('role').eq('id', id('p24')).single());
  assert(after.role === 'MODERATOR', 'admin could not set moderator');
  const escalation = await admin.from('profiles').update({ role: 'OWNER' }).eq('id', id('p24')).select('id');
  const escalated = !escalation.error && (escalation.data ?? []).length > 0;
  await run(admin.from('profiles').update({ role: before.role, status: before.status }).eq('id', id('p24')));
  const restored = await run(svc.from('profiles').select('role,status').eq('id', id('p24')).single());
  assert(restored.role === before.role && restored.status === before.status, 'could not restore p24');
  assert(escalated === false, 'SECURITY: ADMIN can grant OWNER directly (client guard only)');
});
await test('B5 admin can suspend/restore a member', async () => {
  await run(admin.from('profiles').update({ status: 'SUSPENDED' }).eq('id', id('p24')));
  let row = await run(svc.from('profiles').select('status').eq('id', id('p24')).single());
  assert(row.status === 'SUSPENDED', 'suspend failed');
  await run(admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', id('p24')));
  row = await run(svc.from('profiles').select('status').eq('id', id('p24')).single());
  assert(row.status === 'ACTIVE', 'restore failed');
});

// ============ C. COMPETITION LIFECYCLE ============
let comp;
await test('C1 admin creates competition; player cannot create', async () => {
  comp = await run(admin.from('competitions').insert({
    name: `QA League ${suffix}`, description: 'QA lifecycle', type: 'LEAGUE', status: 'REGISTRATION_OPEN',
    min_players: 2, max_players: 4, registration_start: now(), registration_deadline: plusHours(2),
    start_date: now(), match_deadline_hours: 48, join_code: `QA${suffix.slice(0, 5)}`, join_enabled: true,
    format: 'Round Robin', created_by: id('admin'),
  }).select('*').single());
  created.competitions.push(comp.id);
  await expectError('C1-player', () => p01.from('competitions').insert({ name: 'nope', type: 'LEAGUE', min_players: 2, max_players: 2, registration_deadline: plusHours(1), match_deadline_hours: 24, join_code: `NO${suffix.slice(0, 5)}`, created_by: id('p01') }), /row-level security|policy|permission|denied/i);
});
await test('C2 four players join; full competition returns COMPETITION_FULL; waitlist positions server-assigned', async () => {
  for (const c of [p01, p02, p03, p04]) {
    const r = await run(c.rpc('join_competition', { p_code: comp.join_code }));
    assert(r?.ok === true, JSON.stringify(r));
  }
  const full = await run(p05.rpc('join_competition', { p_code: comp.join_code }));
  assert(full?.ok === false && full?.code === 'COMPETITION_FULL', `expected full, got ${JSON.stringify(full)}`);
  await expectError('C2-direct', () => p05.from('competition_participants').insert({ competition_id: comp.id, player_id: id('p05') }), /row-level security|policy|permission|denied/i);
  await run(p05.from('competition_waitlist').insert({ competition_id: comp.id, player_id: id('p05') }));
  await run(p06.from('competition_waitlist').insert({ competition_id: comp.id, player_id: id('p06') }));
  const wl = await run(svc.from('competition_waitlist').select('player_id,position,status').eq('competition_id', comp.id).order('position'));
  assert(wl.length === 2 && wl[0].position === 1 && wl[1].position === 2, JSON.stringify(wl));
});
await test('C3 member can leave before start; freed slot can be joined', async () => {
  await run(p04.rpc('leave_competition', { p_competition_id: comp.id }));
  await run(p05.rpc('join_competition', { p_code: comp.join_code }));
  const parts = await run(svc.from('competition_participants').select('player_id').eq('competition_id', comp.id));
  assert(parts.length === 4 && parts.some((p) => p.player_id === id('p05')), JSON.stringify(parts));
});
await test('C4 league fixture generation creates 3 rounds / 6 matches and activates competition', async () => {
  const parts = await run(svc.from('competition_participants').select('player_id').eq('competition_id', comp.id));
  const fixtures = roundRobin(parts.map((p) => p.player_id));
  const rounds = [...new Set(fixtures.map((f) => f.round_number))].sort((a, b) => a - b);
  for (const rn of rounds) {
    const round = await run(admin.from('rounds').insert({ competition_id: comp.id, round_number: rn, name: `Matchday ${rn}`, deadline: plusHours(48 * rn), status: rn === rounds[0] ? 'ACTIVE' : 'SCHEDULED' }).select('id').single());
    created.rounds.push(round.id);
    const rows = fixtures.filter((f) => f.round_number === rn).map((f) => ({ competition_id: comp.id, round_id: round.id, player_a_id: f.player_a_id, player_b_id: f.player_b_id, status: 'SCHEDULED', scheduled_at: now(), deadline: plusHours(48 * rn) }));
    const ins = await run(admin.from('matches').insert(rows).select('id'));
    created.matches.push(...ins.map((m) => m.id));
  }
  await run(admin.from('competitions').update({ status: 'ACTIVE' }).eq('id', comp.id));
  const ms = await run(svc.from('matches').select('id,round_id').eq('competition_id', comp.id));
  const rs = await run(svc.from('rounds').select('id,status').eq('competition_id', comp.id));
  assert(ms.length === 6 && rs.length === 3 && rs.filter((r) => r.status === 'ACTIVE').length === 1, `${ms.length}/${rs.length}`);
});
await test('C5 player replacement transfers only future scheduled fixtures', async () => {
  const nowTs = now();
  await run(admin.from('competition_participants').update({ status: 'REPLACED', left_at: nowTs, updated_at: nowTs }).eq('competition_id', comp.id).eq('player_id', id('p03')));
  await run(admin.from('competition_participants').insert({ competition_id: comp.id, player_id: id('p06'), status: 'REGISTERED', replacement_for: id('p03'), replacement_date: nowTs, replacement_reason: 'QA replacement' }));
  const future = await run(admin.from('matches').select('id,player_a_id,player_b_id').eq('competition_id', comp.id).eq('status', 'SCHEDULED').or(`player_a_id.eq.${id('p03')},player_b_id.eq.${id('p03')}`));
  for (const m of future) {
    await run(admin.from('matches').update(m.player_a_id === id('p03') ? { player_a_id: id('p06'), updated_at: nowTs } : { player_b_id: id('p06'), updated_at: nowTs }).eq('id', m.id));
  }
  const left = await run(svc.from('matches').select('id').eq('competition_id', comp.id).eq('status', 'SCHEDULED').or(`player_a_id.eq.${id('p03')},player_b_id.eq.${id('p03')}`));
  const rep = await run(svc.from('competition_participants').select('status,replacement_for').eq('competition_id', comp.id).eq('player_id', id('p06')).single());
  assert(future.length === 3 && left.length === 0 && rep.replacement_for === id('p03'), `future=${future.length} left=${left.length}`);
});

async function submitMatch(client, userId, match, a, b, compId) {
  const p = `${compId}/${match.id}/${Date.now()}_${userId}.png`;
  await run(client.storage.from('match-evidence').upload(p, pngFile(), { contentType: 'image/png', upsert: false }));
  created.evidencePaths.push(p);
  await run(client.from('match_evidence').insert({ match_id: match.id, file_path: p, file_type: 'image/png', file_size: PNG.length, uploaded_by: userId }));
  await run(client.from('matches').update({ score_a: a, score_b: b, status: 'RESULT_SUBMITTED', submitted_by: userId, submitted_at: now(), updated_at: now() }).eq('id', match.id));
  return p;
}
const matchesByRound = async (rn) => {
  const rounds = await run(svc.from('rounds').select('id,round_number,status').eq('competition_id', comp.id).order('round_number'));
  return { rounds, round: rounds.find((r) => r.round_number === rn) };
};
let round1Matches, round2Matches, round3Matches;
await test('C6 result submit + opponent confirm + XP', async () => {
  const { round } = await matchesByRound(1);
  round1Matches = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const m = round1Matches.find((x) => x.player_a_id === id('p01') || x.player_b_id === id('p01'));
  const opponent = m.player_a_id === id('p01') ? m.player_b_id : m.player_a_id;
  await expectError('C6-self-confirm', () => p01.rpc('confirm_match', { p_match_id: m.id }), /Nothing|submitter|opponent/i);
  await submitMatch(p01, id('p01'), m, 2, 1, comp.id);
  const sub = await run(svc.from('matches').select('status,submitted_by,score_a,score_b').eq('id', m.id).single());
  assert(sub.status === 'RESULT_SUBMITTED' && sub.score_a === 2, JSON.stringify(sub));
  const ev = await run(svc.from('match_evidence').select('id').eq('match_id', m.id));
  assert(ev.length === 1, 'evidence row missing');
  await run(clientFor(opponent).rpc('confirm_match', { p_match_id: m.id }));
  const fin = await run(svc.from('matches').select('status,winner_id,confirmed_by').eq('id', m.id).single());
  assert(fin.status === 'CONFIRMED' && fin.winner_id === m.player_a_id && fin.confirmed_by === opponent, JSON.stringify(fin));
  const xp = await run(svc.from('xp_ledger').select('player_id,amount,reason').eq('ref_id', m.id).eq('ref_type', 'match'));
  assert(xp.length === 2, `expected 2 XP rows, got ${xp.length}`);
});
await test('C7 round 1 completion auto-opens round 2', async () => {
  const { round } = await matchesByRound(1);
  const ms = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const doneRows = await run(svc.from('matches').select('id').eq('round_id', round.id).eq('status', 'CONFIRMED'));
  const doneIds = new Set(doneRows.map((x) => x.id));
  const m = ms.find((x) => !doneIds.has(x.id));
  const aClient = clientFor(m.player_a_id);
  const bClient = clientFor(m.player_b_id);
  await submitMatch(aClient, m.player_a_id, m, 1, 1, comp.id);
  await run(bClient.rpc('confirm_match', { p_match_id: m.id }));
  const rounds = await run(svc.from('rounds').select('round_number,status').eq('competition_id', comp.id).order('round_number'));
  assert(rounds[0].status === 'COMPLETED' && rounds[1].status === 'ACTIVE', JSON.stringify(rounds));
});
await test('C8 dispute → staff resolution with corrected score', async () => {
  const { round } = await matchesByRound(2);
  round2Matches = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const m = round2Matches[0];
  const aClient = clientFor(m.player_a_id);
  const bClient = clientFor(m.player_b_id);
  await submitMatch(aClient, m.player_a_id, m, 1, 0, comp.id);
  const disputeRpc = await bClient.rpc('dispute_match', {
    p_match_id: m.id,
    p_reason: 'QA dispute',
    p_description: 'QA dispute body',
  });
  if (disputeRpc.error) {
    if (disputeRpc.error.code !== 'PGRST202') throw new Error(disputeRpc.error.message);
    // Pre-0053 fallback.
    await run(bClient.from('disputes').insert({ match_id: m.id, created_by: m.player_b_id, reason: 'QA dispute', description: 'QA dispute body', status: 'OPEN' }));
    await run(bClient.from('matches').update({ status: 'DISPUTED', updated_at: now() }).eq('id', m.id));
  }
  const d = await run(staff.from('disputes').select('*').eq('match_id', m.id).single());
  assert(d.status === 'OPEN', 'dispute not open');
  await run(staff.rpc('admin_set_result', { p_match_id: m.id, p_score_a: 2, p_score_b: 2, p_reason: 'QA resolved' }));
  await run(staff.from('disputes').update({ status: 'RESOLVED', resolved_by: id('staff'), resolution: 'QA resolved', resolved_at: now() }).eq('id', d.id));
  const fin = await run(svc.from('matches').select('status,score_a,score_b').eq('id', m.id).single());
  assert(fin.status === 'CONFIRMED' && fin.score_a === 2 && fin.score_b === 2, JSON.stringify(fin));
});
await test('C9 forfeit claim → staff 3–0 walkover', async () => {
  const { round } = await matchesByRound(2);
  const ms = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const done = new Set((await run(svc.from('matches').select('id').eq('round_id', round.id).eq('status', 'CONFIRMED'))).map((x) => x.id));
  const m = ms.find((x) => !done.has(x.id));
  const aClient = clientFor(m.player_a_id);
  const bClient = clientFor(m.player_b_id);
  await submitMatch(aClient, m.player_a_id, m, 3, 1, comp.id);
  await run(bClient.from('matches').update({ forfeit_claimed_by: m.player_b_id, updated_at: now() }).eq('id', m.id));
  await expectError('C9-claim-pending', () => aClient.rpc('confirm_match', { p_match_id: m.id }), /Nothing|forfeit/i);
  await run(staff.rpc('award_match_forfeit', { p_match_id: m.id, p_winner_id: m.player_a_id, p_reason: 'QA forfeit' }));
  const fin = await run(svc.from('matches').select('status,score_a,score_b,forfeit_player_id').eq('id', m.id).single());
  assert(fin.status === 'FORFEIT' && fin.score_a === 3 && fin.score_b === 0 && fin.forfeit_player_id === m.player_b_id, JSON.stringify(fin));
});
await test('C10 staff sends a submitted result back, then resubmission + confirm works', async () => {
  const { round, rounds } = await matchesByRound(3);
  assert(rounds[1].status === 'COMPLETED' && round.status === 'ACTIVE', JSON.stringify(rounds));
  round3Matches = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const m = round3Matches[0];
  const aClient = clientFor(m.player_a_id);
  const bClient = clientFor(m.player_b_id);
  await submitMatch(aClient, m.player_a_id, m, 1, 1, comp.id);
  await run(staff.from('matches').update({ status: 'SCHEDULED', submitted_by: null, submitted_at: null, forfeit_claimed_by: null, moderation_comment: `QA send back ${suffix}`, updated_at: now() }).eq('id', m.id));
  let row = await run(svc.from('matches').select('status,moderation_comment').eq('id', m.id).single());
  assert(row.status === 'SCHEDULED' && row.moderation_comment.includes(suffix), JSON.stringify(row));
  await submitMatch(aClient, m.player_a_id, m, 2, 2, comp.id);
  await run(bClient.rpc('confirm_match', { p_match_id: m.id }));
  row = await run(svc.from('matches').select('status,score_a,score_b').eq('id', m.id).single());
  assert(row.status === 'CONFIRMED' && row.score_a === 2, JSON.stringify(row));
});
await test('C11 final fixture, all rounds complete, competition FINISHED', async () => {
  const { round } = await matchesByRound(3);
  const ms = await run(svc.from('matches').select('*').eq('round_id', round.id).order('created_at'));
  const done = new Set((await run(svc.from('matches').select('id').eq('round_id', round.id).eq('status', 'CONFIRMED'))).map((x) => x.id));
  const m = ms.find((x) => !done.has(x.id));
  await run(staff.rpc('admin_set_result', { p_match_id: m.id, p_score_a: 0, p_score_b: 4, p_reason: 'QA final' }));
  const rounds = await run(svc.from('rounds').select('status').eq('competition_id', comp.id));
  assert(rounds.every((r) => r.status === 'COMPLETED'), JSON.stringify(rounds));
  await run(admin.from('competitions').update({ status: 'FINISHED' }).eq('id', comp.id));
  const fin = await run(svc.from('competitions').select('status,name').eq('id', comp.id).single());
  assert(fin.status === 'FINISHED' && fin.name.includes('QA League'), JSON.stringify(fin));
});
await test('C12 knockout 4-player bracket generation', async () => {
  const cup = await run(admin.from('competitions').insert({
    name: `QA Cup ${suffix}`, type: 'CUP', status: 'REGISTRATION_OPEN', min_players: 2, max_players: 4,
    registration_start: now(), registration_deadline: plusHours(2), start_date: now(), match_deadline_hours: 24,
    join_code: `QC${suffix.slice(0, 5)}`, join_enabled: true, format: 'Knockout', created_by: id('admin'),
  }).select('*').single());
  created.competitions.push(cup.id);
  for (const c of [p01, p02, p05, p06]) {
    const r = await run(c.rpc('join_competition', { p_code: cup.join_code }));
    assert(r?.ok === true, JSON.stringify(r));
  }
  const parts = await run(svc.from('competition_participants').select('player_id').eq('competition_id', cup.id).order('joined_at'));
  assert(parts.length === 4, 'expected 4 players');
  const r = await run(admin.from('rounds').insert({ competition_id: cup.id, round_number: 1, name: 'Round 1', deadline: plusHours(24), status: 'ACTIVE' }).select('id').single());
  created.rounds.push(r.id);
  const rows = [];
  for (let i = 0; i < 4; i += 2) rows.push({ competition_id: cup.id, round_id: r.id, player_a_id: parts[i].player_id, player_b_id: parts[i + 1].player_id, status: 'SCHEDULED', scheduled_at: now(), deadline: plusHours(24) });
  const ins = await run(admin.from('matches').insert(rows).select('id'));
  created.matches.push(...ins.map((m) => m.id));
  assert(ins.length === 2, 'expected 2 bracket matches');
});
await test('C13 soft delete hides from players, restore brings it back', async () => {
  const temp = await run(admin.from('competitions').insert({
    name: `QA Delete ${suffix}`, type: 'LEAGUE', status: 'REGISTRATION_OPEN', min_players: 2, max_players: 2,
    registration_start: now(), registration_deadline: plusHours(2), match_deadline_hours: 24,
    join_code: `QD${suffix.slice(0, 5)}`, join_enabled: true, created_by: id('admin'),
  }).select('*').single());
  created.competitions.push(temp.id);
  await run(admin.from('competitions').update({ is_deleted: true, delete_requested_by: id('admin'), delete_requested_at: now(), delete_approved_by: id('admin') }).eq('id', temp.id));
  const hidden = await run(p01.from('competitions').select('id').eq('id', temp.id).maybeSingle());
  assert(hidden === null, 'deleted competition still visible');
  await run(admin.from('competitions').update({ is_deleted: false, delete_requested_by: null, delete_requested_at: null, delete_approved_by: null }).eq('id', temp.id));
  const shown = await run(p01.from('competitions').select('id').eq('id', temp.id).maybeSingle());
  assert(shown?.id === temp.id, 'restore failed');
});
await test('C14 two-person deletion request flag can be set and rejected', async () => {
  await run(admin.from('competitions').update({ delete_requested_by: id('admin'), delete_requested_at: now(), delete_approved_by: null }).eq('id', comp.id));
  let row = await run(svc.from('competitions').select('delete_requested_by,is_deleted').eq('id', comp.id).single());
  assert(row.delete_requested_by === id('admin') && row.is_deleted === false, JSON.stringify(row));
  await run(admin.from('competitions').update({ delete_requested_by: null, delete_requested_at: null, delete_approved_by: null }).eq('id', comp.id));
  row = await run(svc.from('competitions').select('delete_requested_by').eq('id', comp.id).single());
  assert(row.delete_requested_by === null, 'reject failed');
});

// ============ D. BATTLES / OPEN MAT / GIFTS / QUESTS ============
async function issueChallenge(client, challengerId, opponentId, type, opts = {}) {
  return run(client.from('challenges').insert({
    challenger_id: challengerId, opponent_id: opponentId, type,
    conditions: opts.conditions ?? 'QA conditions', stakes: opts.stakes ?? 'QA stakes',
    for_throne: opts.for_throne ?? false, forced: opts.forced ?? false,
    is_open: opts.is_open ?? false, opponent_label: opts.opponent_label ?? null,
  }).select('*').single());
}
async function finishBattle(submitterClient, submitterId, confirmerClient, ch, a, b) {
  const p = `battles/${ch.id}/${Date.now()}_${submitterId}.png`;
  await run(submitterClient.storage.from('match-evidence').upload(p, pngFile(), { contentType: 'image/png', upsert: false }));
  created.evidencePaths.push(p);
  await run(submitterClient.from('challenges').update({ score_a: a, score_b: b, status: 'RESULT_SUBMITTED', submitted_by: submitterId, evidence_path: p, updated_at: now() }).eq('id', ch.id));
  await run(confirmerClient.from('challenges').update({ status: 'COMPLETED', updated_at: now() }).eq('id', ch.id));
  await run(confirmerClient.rpc('grant_battle_rewards', { p_challenge_id: ch.id }));
}
let battle1, battleForced;
await test('D1 friendly battle full flow + XP rewards + self-confirm denied', async () => {
  battle1 = await issueChallenge(p07, id('p07'), id('p08'), 'FRIENDLY');
  created.challenges.push(battle1.id);
  await run(p08.from('challenges').update({ status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', battle1.id));
  const p = `battles/${battle1.id}/${Date.now()}_${id('p07')}.png`;
  await run(p07.storage.from('match-evidence').upload(p, pngFile(), { contentType: 'image/png', upsert: false }));
  created.evidencePaths.push(p);
  await run(p07.from('challenges').update({ score_a: 3, score_b: 0, status: 'RESULT_SUBMITTED', submitted_by: id('p07'), evidence_path: p, updated_at: now() }).eq('id', battle1.id));
  await expectError('D1-self', () => p07.from('challenges').update({ status: 'COMPLETED', updated_at: now() }).eq('id', battle1.id), /not allowed/i);
  await run(p08.from('challenges').update({ status: 'COMPLETED', updated_at: now() }).eq('id', battle1.id));
  await run(p08.rpc('grant_battle_rewards', { p_challenge_id: battle1.id }));
  const xp = await run(svc.from('xp_ledger').select('player_id,amount,reason').eq('ref_id', battle1.id).eq('ref_type', 'battle'));
  assert(xp.length >= 2, `expected battle XP, got ${xp.length}`);
});
await test('D2 decline path records DECLINED', async () => {
  const d = await issueChallenge(p09, id('p09'), id('p10'), 'HEAD');
  created.challenges.push(d.id);
  await run(p10.from('challenges').update({ status: 'DECLINED', responded_at: now(), updated_at: now() }).eq('id', d.id));
  const row = await run(svc.from('challenges').select('status').eq('id', d.id).single());
  assert(row.status === 'DECLINED', 'not declined');
});
await test('D3 open mat: create, list, accept by first taker, finish', async () => {
  const o = await issueChallenge(p09, id('p09'), null, 'FRIENDLY', { is_open: true });
  created.challenges.push(o.id);
  const row = await run(svc.from('challenges').select('status,is_open,opponent_id,expires_at').eq('id', o.id).single());
  assert(row.is_open && row.opponent_id === null && !!row.expires_at, JSON.stringify(row));
  const open = await run(p10.from('challenges').select('id').eq('is_open', true).eq('status', 'PENDING'));
  assert(open.some((x) => x.id === o.id), 'open mat not listed');
  const accepted = await p10.from('challenges').update({ opponent_id: id('p10'), is_open: false, status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', o.id).eq('status', 'PENDING').select('id');
  const playerAcceptError = accepted.error?.message ?? ((accepted.data ?? []).length === 0 ? 'RLS blocked the update (0 rows)' : null);
  if (playerAcceptError) {
    await run(admin.from('challenges').update({ opponent_id: id('p10'), is_open: false, status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', o.id));
  }
  await finishBattle(p10, id('p10'), p09, o, 2, 1);
  const fin = await run(svc.from('challenges').select('status,score_a,score_b').eq('id', o.id).single());
  assert(fin.status === 'COMPLETED' && fin.score_a === 2, JSON.stringify(fin));
  assert(!playerAcceptError, `BUG: first taker cannot accept an open mat: ${playerAcceptError}`);
});
await test('D4 expired open call is swept to CANCELLED by any viewer', async () => {
  const o = await issueChallenge(p11, id('p11'), null, 'FRIENDLY', { is_open: true });
  created.challenges.push(o.id);
  await run(admin.from('challenges').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', o.id));
  const swept = await p12.from('challenges').update({ status: 'CANCELLED', updated_at: now() }).eq('id', o.id).select('id');
  const row = await run(svc.from('challenges').select('status').eq('id', o.id).single());
  assert(row.status === 'CANCELLED', `not cancelled: ${swept.error?.message ?? '0 rows'}`);
});
await test('D5 forced HEAD call requires 100 GP, cannot be declined, transfers bounty', async () => {
  const balRows = await run(svc.from('xp_ledger').select('amount').eq('player_id', id('p07')));
  const bal = balRows.reduce((s, r) => s + r.amount, 0);
  if (bal < 100) {
    const g = await run(p07.from('gp_requests').insert({ requester_id: id('p07'), giver_id: id('p02'), amount: 20, message: 'QA top-up' }).select('*').single());
    created.gifts.push(g.id);
    await run(p02.rpc('answer_gift', { p_request_id: g.id, p_accept: true }));
  }
  battleForced = await issueChallenge(p07, id('p07'), id('p08'), 'HEAD', { forced: true });
  created.challenges.push(battleForced.id);
  await run(p08.from('challenges').update({ status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', battleForced.id));
  await expectError('D5-decline', () => p08.from('challenges').update({ status: 'DECLINED', responded_at: now(), updated_at: now() }).eq('id', battleForced.id), /not allowed/i);
  await finishBattle(p07, id('p07'), p08, battleForced, 0, 3);
  const rows = await run(svc.from('xp_ledger').select('player_id,amount,reason').eq('ref_id', battleForced.id));
  assert(rows.some((r) => r.reason === 'bounty'), `no bounty row: ${JSON.stringify(rows)}`);
});
await test('D6 peer rating requires a shared completed match/battle and upserts', async () => {
  await run(p08.from('ratings').upsert({ rater_id: id('p08'), rated_id: id('p07'), score: 4, tactical: 4, fairplay: 4, connection: 4, title_tag: 'Loyal Raven', updated_at: now() }, { onConflict: 'rater_id,rated_id' }));
  const r = await run(svc.from('ratings').select('*').eq('rater_id', id('p08')).eq('rated_id', id('p07')).single());
  assert(r.score === 4 && r.title_tag === 'Loyal Raven', JSON.stringify(r));
  await expectError('D6-stranger', () => p13.from('ratings').insert({ rater_id: id('p13'), rated_id: id('p07'), score: 5, tactical: 5, fairplay: 5, connection: 5 }), /row-level security|policy|permission|denied/i);
});
await test('D7 gifts move Glory, enforce balance and decline path', async () => {
  const before = await run(svc.from('xp_ledger').select('amount').eq('player_id', id('p02')));
  const beforeSum = before.reduce((s, r) => s + r.amount, 0);
  const g = await run(p01.from('gp_requests').insert({ requester_id: id('p01'), giver_id: id('p02'), amount: 5, message: 'QA gift' }).select('*').single());
  created.gifts.push(g.id);
  await run(p02.rpc('answer_gift', { p_request_id: g.id, p_accept: true }));
  const after = await run(svc.from('xp_ledger').select('amount').eq('player_id', id('p02')));
  const afterSum = after.reduce((s, r) => s + r.amount, 0);
  assert(afterSum === beforeSum - 5, `balance ${beforeSum} -> ${afterSum}`);
  const g2 = await run(p03.from('gp_requests').insert({ requester_id: id('p03'), giver_id: id('p04'), amount: 500, message: 'too much' }).select('*').single());
  created.gifts.push(g2.id);
  await expectError('D7-insufficient', () => p04.rpc('answer_gift', { p_request_id: g2.id, p_accept: true }), /Not enough Glory/i);
  const g3 = await run(p05.from('gp_requests').insert({ requester_id: id('p05'), giver_id: id('p06'), amount: 10 }).select('*').single());
  created.gifts.push(g3.id);
  await run(p06.rpc('answer_gift', { p_request_id: g3.id, p_accept: false }));
  const dec = await run(svc.from('gp_requests').select('status').eq('id', g3.id).single());
  assert(dec.status === 'DECLINED', 'decline failed');
});
await test('D8 quest progress + claim (first-blood, squire, caller) is idempotent', async () => {
  await run(p01.rpc('claim_quest', { p_quest_key: 'first-blood' }));
  await expectError('D8-again', () => p01.rpc('claim_quest', { p_quest_key: 'first-blood' }), /Already claimed/i);
  await run(p05.rpc('claim_quest', { p_quest_key: 'squire' }));
  await run(p07.rpc('claim_quest', { p_quest_key: 'caller' }));
  const claims = await run(svc.from('quest_claims').select('quest_key').eq('player_id', id('p01')));
  assert(claims.filter((c) => c.quest_key === 'first-blood').length === 1, JSON.stringify(claims));
});
await test('D9 season board includes QA players and total XP reads', async () => {
  const rows = await run(p01.from('xp_ledger').select('amount').eq('player_id', id('p01')));
  assert(rows.reduce((s, r) => s + r.amount, 0) >= 80, 'XP total missing');
  const board = await run(p01.from('xp_ledger').select('player_id,amount').eq('season', `S${new Date().getFullYear()}`));
  assert(board.length > 0, 'empty season board');
});

const throneSnapshot = await run(svc.from('throne_reigns').select('*').order('started_at'));
const openReign = throneSnapshot.find((r) => r.ended_at === null);
await test('D10 throne crown → challenge → transfer → defense → pledge redirect, then restore', async () => {
  try {
    await run(admin.from('throne_reigns').update({ ended_at: now() }).eq('id', openReign.id));
    const reign1 = await run(admin.from('throne_reigns').insert({ holder_id: id('p10'), won_from: openReign.holder_id, created_by: id('admin') }).select('*').single());
    created.throneReigns.push(reign1.id);
    let current = await run(svc.from('throne_reigns').select('*').is('ended_at', null).single());
    assert(current.holder_id === id('p10'), 'crown failed');
    const ch = await issueChallenge(p07, id('p07'), id('p10'), 'HONOR', { for_throne: true });
    created.challenges.push(ch.id);
    await run(p10.from('challenges').update({ status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', ch.id));
    await finishBattle(p07, id('p07'), p10, ch, 2, 0);
    const outcome = await run(p10.rpc('settle_throne_battle', { p_challenge_id: ch.id }));
    assert(outcome === 'transfer', `expected transfer, got ${outcome}`);
    current = await run(svc.from('throne_reigns').select('*').is('ended_at', null).single());
    assert(current.holder_id === id('p07'), 'transfer failed');
    const defense = await issueChallenge(p08, id('p08'), id('p07'), 'HONOR', { for_throne: true });
    created.challenges.push(defense.id);
    await run(p07.from('challenges').update({ status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', defense.id));
    await finishBattle(p08, id('p08'), p07, defense, 0, 1);
    const defended = await run(p07.rpc('settle_throne_battle', { p_challenge_id: defense.id }));
    assert(defended === 'defended', `expected defended, got ${defended}`);
    current = await run(svc.from('throne_reigns').select('*').is('ended_at', null).single());
    assert(current.defenses === 1, 'defense count not incremented');
    const pledge = await issueChallenge(p09, id('p09'), id('p07'), 'HONOR', { for_throne: true });
    created.challenges.push(pledge.id);
    const ch2 = await issueChallenge(p10, id('p10'), id('p07'), 'HONOR', { for_throne: true });
    created.challenges.push(ch2.id);
    await run(p07.from('challenges').update({ status: 'ACCEPTED', responded_at: now(), updated_at: now() }).eq('id', ch2.id));
    await finishBattle(p10, id('p10'), p07, ch2, 3, 0);
    const settle2 = await p07.rpc('settle_throne_battle', { p_challenge_id: ch2.id });
    if (settle2.error) {
      throw new Error(`BUG: throne settlement cannot redirect pending pledges: ${settle2.error.message}`);
    }
    assert(settle2.data === 'transfer', `expected second transfer, got ${settle2.data}`);
    const redirected = await run(svc.from('challenges').select('opponent_id,status').eq('id', pledge.id).single());
    assert(redirected.opponent_id === id('p10') && redirected.status === 'PENDING', JSON.stringify(redirected));
  } finally {
    for (const cid of created.challenges) await svc.from('challenges').delete().eq('id', cid);
    const qaReigns = await svc.from('throne_reigns').select('id').neq('holder_id', openReign.holder_id);
    for (const r of qaReigns.data ?? []) await svc.from('throne_reigns').delete().eq('id', r.id);
    await svc.from('throne_reigns').update({ ended_at: openReign.ended_at, defenses: openReign.defenses, won_from: openReign.won_from, competition_id: openReign.competition_id }).eq('id', openReign.id);
  }
});

// ============ E. SQUADS ============
let squad;
await test('E1 squad create without invites works (leader auto-member)', async () => {
  squad = await run(p11.from('squads').insert({ name: `QA Squad ${suffix}`, size: 4, leader_id: id('p11') }).select('*').single());
  created.squads.push(squad.id);
  const m = await run(p11.from('squad_members').insert({ squad_id: squad.id, player_id: id('p11'), role: 'LEADER', status: 'ACCEPTED' }).select('*').single());
  created.squadMembers.push(m.id);
  assert(m.role === 'LEADER', JSON.stringify(m));
});
await test('E2 leader invite another member', async () => {
  const res = await p11.from('squad_members').insert({ squad_id: squad.id, player_id: id('p12'), role: 'MEMBER', status: 'PENDING' }).select('*');
  assert(!res.error && (res.data ?? []).length === 1, `BUG: squad leader cannot invite members (RLS): ${res.error?.message ?? '0 rows'}`);
});
await test('E3 request-to-join works and leader can accept it', async () => {
  const r = await run(p13.from('squad_members').insert({ squad_id: squad.id, player_id: id('p13'), role: 'MEMBER', status: 'PENDING' }).select('*').single());
  created.squadMembers.push(r.id);
  assert(r.status === 'PENDING', JSON.stringify(r));
  const res = await p11.from('squad_members').update({ status: 'ACCEPTED' }).eq('id', r.id).select('id');
  assert(!res.error && (res.data ?? []).length === 1, `BUG: squad leader cannot answer a join request (RLS trigger): ${res.error?.message ?? '0 rows'}`);
});
await test('E4 leader disbands squad', async () => {
  await run(p11.from('squads').update({ status: 'DISBANDED' }).eq('id', squad.id));
  const row = await run(svc.from('squads').select('status').eq('id', squad.id).single());
  assert(row.status === 'DISBANDED', 'disband failed');
});

// ============ F. TRYOUTS ============
let tryout;
await test('F1 public tryout submission, admin listing, honeypot/duplicate guards', async () => {
  const email = `qa_tryout_${suffix.toLowerCase()}@example.com`;
  const contact = '+2126999' + suffix.slice(-5).replace(/[^0-9]/g, '0');
  const pub = await anon.from('tryout_requests').insert({ name: `QA Tryout ${suffix}`, contact, email, note: 'QA tryout', status: 'PENDING' });
  assert(!pub.error, `BUG: public tryout insert denied for anon: ${pub.error?.message}`);
  tryout = await run(admin.from('tryout_requests').select('*').eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle());
  assert(tryout?.id, 'admin cannot list the public tryout');
  created.tryouts.push(tryout.id);
  await expectError('F1-honeypot', () => anon.from('tryout_requests').insert({ name: 'bot', contact: '+21260000009', website_url: 'https://spam.example', status: 'PENDING' }), /blocked|policy|row-level|violates/i);
  await expectError('F1-dupe', () => admin.from('tryout_requests').insert({ name: 'dupe', contact, email, status: 'PENDING' }), /pending|already/i);
});
await test('F2 tester assignment, tester verdict, tester cannot resolve, admin resolves', async () => {
  await run(admin.from('tryout_requests').update({ assigned_tester_id: id('p10') }).eq('id', tryout.id));
  const tasks = await run(p10.from('tryout_requests').select('id').eq('assigned_tester_id', id('p10')).eq('status', 'PENDING'));
  assert(tasks.some((t) => t.id === tryout.id), 'tester task missing');
  await run(p10.from('tryout_requests').update({ verdict: 'PASS', verdict_score_a: 3, verdict_score_b: 2, verdict_note: 'QA verdict', verdict_at: now(), updated_at: now() }).eq('id', tryout.id));
  await expectError('F2-resolve', () => p10.from('tryout_requests').update({ status: 'ACCEPTED' }).eq('id', tryout.id), /verdict|resolve|Only staff/i);
  const adminNote = await run(svc.from('notifications').select('id').eq('user_id', id('admin')).eq('entity_id', tryout.id));
  assert(adminNote.length >= 1, 'admin verdict notification missing');
  await run(admin.from('tryout_requests').update({ status: 'ACCEPTED', updated_at: now() }).eq('id', tryout.id));
  const fin = await run(svc.from('tryout_requests').select('status,verdict').eq('id', tryout.id).single());
  assert(fin.status === 'ACCEPTED' && fin.verdict === 'PASS', JSON.stringify(fin));
});

// ============ G. NOTIFICATIONS / STATS / READ-ONLY ============
await test('G1 notifications are private, mark-one and mark-all work', async () => {
  const n = await run(svc.from('notifications').insert({ user_id: id('p08'), type: 'QA', title: 'QA probe', message: 'QA notification' }).select('*').single());
  created.notifications.push(n.id);
  const nOther = await run(svc.from('notifications').insert({ user_id: id('p09'), type: 'QA', title: 'QA probe 2', message: 'QA notification' }).select('*').single());
  created.notifications.push(nOther.id);
  const mine = await run(p08.from('notifications').select('*').eq('id', n.id).maybeSingle());
  assert(mine?.id === n.id, 'own notification not readable');
  const cross = await run(p08.from('notifications').select('*').eq('id', nOther.id));
  assert(cross.length === 0, `BUG: p08 can read p09 notification (${cross.length})`);
  await run(p08.from('notifications').update({ read_at: now() }).eq('id', n.id));
  const one = await run(svc.from('notifications').select('read_at').eq('id', n.id).single());
  assert(!!one.read_at, 'mark one failed');
  await run(p08.from('notifications').update({ read_at: now() }).eq('user_id', id('p08')).is('read_at', null));
  const unread = await p08.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', id('p08')).is('read_at', null);
  assert(!unread.error && (unread.count ?? 0) === 0, `mark all left ${unread.count ?? unread.error?.message} unread`);
});
await test('G2 career, head-to-head, recent matches and clan totals aggregate QA data', async () => {
  const p1 = await run(p01.from('matches').select('player_a_id,player_b_id,score_a,score_b,status').or(`player_a_id.eq.${id('p01')},player_b_id.eq.${id('p01')}`).in('status', ['CONFIRMED', 'FORFEIT']));
  assert(p1.length >= 3, `expected p01 matches, got ${p1.length}`);
  const h2h = await run(p01.from('matches').select('player_a_id,player_b_id,score_a,score_b').or(`and(player_a_id.eq.${id('p01')},player_b_id.eq.${id('p05')}),and(player_a_id.eq.${id('p05')},player_b_id.eq.${id('p01')})`));
  assert(h2h.length >= 1, 'no head-to-head');
  const active = await run(p01.from('profiles').select('id').eq('status', 'ACTIVE'));
  assert(active.length >= 26, `active members ${active.length}`);
});
await test('G3 read-only pages data: throne, announcements, members, competitions, XP board', async () => {
  const [th, anns, members, comps, xp, squads] = await Promise.all([
    run(p01.from('throne_reigns').select('*').is('ended_at', null).maybeSingle()),
    run(p01.from('announcements').select('*').limit(5)),
    run(p01.from('profiles').select('id,username,display_name').eq('status', 'ACTIVE').limit(50)),
    run(p01.from('competitions').select('*').eq('is_deleted', false).limit(20)),
    run(p01.from('xp_ledger').select('player_id,amount').limit(50)),
    run(p01.from('squads').select('*').neq('status', 'DISBANDED').limit(20)),
  ]);
  assert(th === null || th.id, 'throne read failed');
  assert(Array.isArray(anns) && members.length >= 26 && Array.isArray(comps) && xp.length > 0 && Array.isArray(squads), 'read-only query failed');
});

fs.writeFileSync(RESULT_PATH, JSON.stringify({ at: now(), failures, total: results.length, results }, null, 2));
save();
console.log(`\n${results.length - failures}/${results.length} passed, ${failures} failed`);
console.log('state:', OUT_PATH);
console.log('results:', RESULT_PATH);
if (failures > 0) process.exitCode = 1;
