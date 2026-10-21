import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(QA_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const DESK = path.resolve(QA_DIR, '..', 'app');
const readEnv = (p) => Object.fromEntries(
  fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()]; }),
);
const env = readEnv(path.join(DESK, '.env'));
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const state = JSON.parse(fs.readFileSync(`${TMP}/vik_qa_accounts.json`, 'utf8'));
const byAlias = Object.fromEntries(state.accounts.map((a) => [a.alias, a]));
const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

async function request(path, opts = {}, token = null) {
  const headers = { apikey: anon, 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${url}${path}`, { ...opts, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.msg || body.error_description || body.code || JSON.stringify(body)) : text;
    throw new Error(`${opts.method || 'GET'} ${path} -> HTTP ${res.status}: ${detail}`);
  }
  return body;
}

async function serviceRequest(path, opts = {}) {
  const res = await fetch(`${url}${path}`, { ...opts, headers: { ...serviceHeaders, ...(opts.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = body && typeof body === 'object' ? (body.message || body.msg || body.code || JSON.stringify(body)) : text;
    throw new Error(`${opts.method || 'GET'} ${path} -> HTTP ${res.status}: ${detail}`);
  }
  return body;
}

const tokens = new Map();
async function signIn(alias) {
  if (tokens.has(alias)) return tokens.get(alias);
  const account = byAlias[alias];
  const body = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: state.password }),
  });
  tokens.set(alias, body.access_token);
  return body.access_token;
}

async function rpc(alias, fn, args) {
  const token = await signIn(alias);
  return request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }, token);
}

const admin = 'admin';
const now = Date.now();
const seasonName = `QA League ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')}`;
const seasonId = await rpc(admin, 'league_create_season', {
  p_name: seasonName,
  p_description: 'Disposable QA season for the 4vs4 league test run.',
  p_registration_opens_at: new Date(now - 5 * 60_000).toISOString(),
  p_registration_closes_at: null,
  p_starts_at: new Date(now - 60 * 60_000).toISOString(),
  p_matchday_days: 1,
  p_min_teams: 4,
  p_max_teams: 4,
  p_roster_min: 6,
  p_roster_max: 6,
});
console.log('season created', seasonId);

await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'REGISTRATION', p_reason: 'QA seed' });
console.log('season opened for registration');

const teams = [];
const captains = ['p01', 'p02', 'p03', 'p04'];
for (let i = 0; i < captains.length; i++) {
  const teamId = await rpc(captains[i], 'league_create_team', { p_season_id: seasonId, p_name: `QA Squad ${i + 1}` });
  teams.push({ id: teamId, captain: captains[i] });
  console.log('team created', i + 1, teams[i].id);
}

const invites = [];
for (let t = 0; t < teams.length; t++) {
  const players = captains.slice(0, 0);
  for (let n = 0; n < 5; n++) {
    const playerIndex = 5 + t * 5 + n;
    const alias = `p${String(playerIndex).padStart(2, '0')}`;
    players.push(alias);
    const inviteId = await rpc(teams[t].captain, 'league_invite_member', {
      p_team_id: teams[t].id,
      p_player_id: byAlias[alias].id,
      p_message: 'QA invite',
    });
    invites.push({ teamId: teams[t].id, alias, inviteId });
  }
}
console.log('invites sent', invites.length);

for (const invite of invites) {
  await rpc(invite.alias, 'league_answer_invite', { p_invite_id: invite.inviteId, p_accept: true });
}
console.log('invites accepted', invites.length);

for (const team of teams) {
  await rpc(admin, 'league_approve_team', { p_team_id: team.id, p_approve: true, p_note: 'QA approved' });
}
console.log('teams approved');

await rpc(admin, 'league_generate_fixtures', { p_season_id: seasonId, p_reset: false });
await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'ACTIVE', p_reason: 'QA active' });
console.log('fixtures generated; season ACTIVE');

const matchdays = await serviceRequest(`/rest/v1/league_matchdays?season_id=eq.${seasonId}&select=*&order=number.asc`);
const fixtures = await serviceRequest(`/rest/v1/league_fixtures?season_id=eq.${seasonId}&select=*&order=created_at.asc`);
const members = await serviceRequest(`/rest/v1/league_team_members?season_id=eq.${seasonId}&status=eq.ACTIVE&select=team_id,player_id,role`);
fs.writeFileSync(`${TMP}/vik_qa_season.json`, JSON.stringify({
  seasonId, seasonName, teams, matchdays, fixtures, members,
}, null, 2), { mode: 0o600 });
console.log(JSON.stringify({
  seasonId,
  teams: teams.map((t) => ({ id: t.id, captain: t.captain })),
  matchdays: matchdays.map((m) => ({ id: m.id, number: m.number, status: m.status, opens_at: m.opens_at, deadline: m.deadline })),
  fixtures: fixtures.map((f) => ({ id: f.id, matchday_id: f.matchday_id, home: f.home_team_id, away: f.away_team_id, status: f.status })),
}, null, 2));
