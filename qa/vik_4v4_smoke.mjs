import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(QA_DIR, '..', 'app');
const TMP = path.join(QA_DIR, 'tmp');
const { createClient } = await import(
  pathToFileURL(path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'index.mjs')).href
);

const parse = (f) => Object.fromEntries(
  (fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const env = { ...parse('.env.test.local'), ...parse('.env') };
const state = JSON.parse(fs.readFileSync(path.join(TMP, 'vik_full_qa_accounts.json'), 'utf8'));
const accounts = Object.fromEntries(state.accounts.map((a) => [a.alias, a]));
const PASSWORD = state.password;
const URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) throw new Error('Missing Supabase env');

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const clients = new Map();
let failures = 0;

async function clientFor(alias) {
  if (clients.has(alias)) return clients.get(alias);
  const account = accounts[alias];
  if (!account) throw new Error(`Unknown QA alias: ${alias}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: PASSWORD });
  if (error) throw new Error(`${alias} sign-in failed: ${error.message}`);
  clients.set(alias, client);
  return client;
}
const id = (alias) => accounts[alias].id;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const pass = (label) => console.log(`PASS ${label}`);
async function check(label, fn) {
  try { const value = await fn(); pass(label); return value; }
  catch (error) { failures += 1; console.log(`FAIL ${label} — ${error instanceof Error ? error.message : error}`); throw error; }
}
async function expectError(label, fn, pattern) {
  try { await fn(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `expected /${pattern.source}/, got: ${message}`);
    pass(label);
    return;
  }
  throw new Error(`${label}: expected an error but the call succeeded`);
}
async function rpc(client, fn, args, label) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${label ?? fn}: ${error.message}`);
  return data;
}
async function count(table, seasonId, column = 'season_id') {
  const { count: n, error } = await svc.from(table).select('*', { count: 'exact', head: true }).eq(column, seasonId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

const suffix = Date.now().toString(36);
const now = Date.now();
const seasonName = `QA Smoke 4v4 ${suffix}`;
const opens = new Date(now).toISOString();
const closes = new Date(now + 2 * 3600_000).toISOString();
const starts = new Date(now + 24 * 3600_000).toISOString();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

let seasonId = null;
let logoPath = null;
let badgePath = null;

const admin = await clientFor('admin');
const p01 = await clientFor('p01');
const p07 = await clientFor('p07');
const p13 = await clientFor('p13');
const p19 = await clientFor('p19');
const captains = [['p01', p01], ['p07', p07], ['p13', p13], ['p19', p19]];
const rosters = {
  p01: ['p02', 'p03', 'p04', 'p05', 'p06'],
  p07: ['p08', 'p09', 'p10', 'p11', 'p12'],
  p13: ['p14', 'p15', 'p16', 'p17', 'p18'],
  p19: ['p20', 'p21', 'p22', 'p23', 'p24'],
};

try {
  await check('create season', async () => {
    seasonId = await rpc(admin, 'league_create_season', {
      p_name: seasonName,
      p_description: 'Automated 4vs4 smoke season.',
      p_registration_opens_at: opens,
      p_registration_closes_at: closes,
      p_starts_at: starts,
      p_matchday_days: 7,
      p_min_teams: 4,
      p_max_teams: 4,
      p_roster_min: 6,
      p_roster_max: 6,
    });
    assert(typeof seasonId === 'string' && seasonId.length > 0, 'no season id returned');
  });

  await check('season opens for registration', async () => {
    await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'REGISTRATION' });
    const { data, error } = await admin.from('league_seasons').select('status').eq('id', seasonId).single();
    if (error) throw new Error(error.message);
    assert(data.status === 'REGISTRATION', `status ${data.status}`);
  });

  await check('admin writes and player reads season rules', async () => {
    const rules = `Smoke rules ${suffix}\n- 4v4\n- No mercenaries`;
    await rpc(admin, 'league_set_season_rules', { p_season_id: seasonId, p_rules: rules });
    const { data, error } = await p01.from('league_seasons').select('rules').eq('id', seasonId).single();
    if (error) throw new Error(error.message);
    assert(data.rules === rules, 'rules not visible to player');
  });

  const teamIds = {};
  await check('four captains create squads', async () => {
    for (const [alias, client] of captains) {
      const teamId = await rpc(client, 'league_create_team', {
        p_season_id: seasonId,
        p_name: `QA Smoke ${alias} ${suffix}`,
      });
      teamIds[alias] = teamId;
      assert(typeof teamId === 'string', `${alias} no team id`);
    }
  });

  await check('captain invite can be revoked', async () => {
    await rpc(p01, 'league_invite_member', {
      p_team_id: teamIds.p01,
      p_player_id: id('p02'),
      p_message: 'Smoke invite',
    });
    const { data, error } = await svc.from('league_team_invites')
      .select('id').eq('team_id', teamIds.p01).eq('player_id', id('p02')).eq('status', 'PENDING').single();
    if (error) throw new Error(error.message);
    await rpc(p01, 'league_revoke_invite', { p_invite_id: data.id });
    const pending = await svc.from('league_team_invites')
      .select('id').eq('team_id', teamIds.p01).eq('player_id', id('p02')).eq('status', 'PENDING');
    if (pending.error) throw new Error(pending.error.message);
    assert((pending.data ?? []).length === 0, 'invite still pending after revoke');
  });

  await check('captains invite and players join (6 per squad)', async () => {
    for (const [captainAlias, captainClient] of captains) {
      const teamId = teamIds[captainAlias];
      for (const alias of rosters[captainAlias]) {
        const player = await clientFor(alias);
        await rpc(captainClient, 'league_invite_member', { p_team_id: teamId, p_player_id: id(alias) });
        const { data, error } = await svc.from('league_team_invites')
          .select('id').eq('team_id', teamId).eq('player_id', id(alias)).eq('status', 'PENDING').single();
        if (error) throw new Error(error.message);
        await rpc(player, 'league_answer_invite', { p_invite_id: data.id, p_accept: true });
      }
    }
    for (const [captainAlias] of captains) {
      const { count: n, error } = await svc.from('league_team_members')
        .select('*', { count: 'exact', head: true }).eq('team_id', teamIds[captainAlias]).eq('status', 'ACTIVE');
      if (error) throw new Error(error.message);
      assert(n === 6, `${captainAlias} roster ${n}`);
    }
  });

  await check('captain sets squad bio', async () => {
    const bio = `Smoke bio ${suffix}`;
    await rpc(p01, 'league_set_team_bio', { p_team_id: teamIds.p01, p_bio: bio });
    const { data, error } = await svc.from('league_teams').select('bio').eq('id', teamIds.p01).single();
    if (error) throw new Error(error.message);
    assert(data.bio === bio, 'bio missing');
  });

  await check('captain uploads squad logo and player can sign it', async () => {
    logoPath = `league/${id('p01')}/${teamIds.p01}/logo-${suffix}.png`;
    const up = await p01.storage.from('league-assets').upload(logoPath, png, { contentType: 'image/png', upsert: false });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    await rpc(p01, 'league_set_team_logo', { p_team_id: teamIds.p01, p_logo_path: logoPath });
    const { data, error } = await svc.from('league_teams').select('logo_path').eq('id', teamIds.p01).single();
    if (error) throw new Error(error.message);
    assert(data.logo_path === logoPath, 'logo path not saved');
    const signed = await p07.storage.from('league-assets').createSignedUrl(logoPath, 60);
    if (signed.error) throw new Error(`signed url: ${signed.error.message}`);
    assert(!!signed.data?.signedUrl, 'no signed logo URL');
  });

  await check('another player cannot upload into the captain folder', async () => {
    const evilPath = `league/${id('p01')}/${teamIds.p01}/logo-evil-${suffix}.png`;
    const up = await p07.storage.from('league-assets').upload(evilPath, png, { contentType: 'image/png', upsert: false });
    assert(!!up.error, 'cross-player logo upload unexpectedly succeeded');
    assert(/row-level security|policy|denied|unauthorized/i.test(up.error.message), `unexpected error: ${up.error.message}`);
    await svc.storage.from('league-assets').remove([evilPath]);
  });

  await check('admin uploads winner badge and sets it on the season', async () => {
    badgePath = `badges/qa-winner-${suffix}.png`;
    const up = await admin.storage.from('clan-assets').upload(badgePath, png, { contentType: 'image/png', upsert: false });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    await rpc(admin, 'league_set_winner_badge', { p_season_id: seasonId, p_badge_path: badgePath });
    const { data, error } = await p01.from('league_seasons').select('winner_badge_path').eq('id', seasonId).single();
    if (error) throw new Error(error.message);
    assert(data.winner_badge_path === badgePath, 'winner badge path not saved');
  });

  await check('winner badge cannot be awarded before completion', async () => {
    await expectError('award guard', () => rpc(admin, 'league_award_winner_badge', { p_season_id: seasonId }), /Complete the season/i);
  });

  await check('admin approves all four squads', async () => {
    for (const [alias] of captains) {
      await rpc(admin, 'league_approve_team', { p_team_id: teamIds[alias], p_approve: true, p_note: 'Smoke approval' });
    }
    const { data, error } = await svc.from('league_teams').select('id,status').eq('season_id', seasonId);
    if (error) throw new Error(error.message);
    assert((data ?? []).length === 4 && data.every((t) => t.status === 'APPROVED'), JSON.stringify(data));
  });

  await check('fixture generation creates 6 matchdays / 12 fixtures', async () => {
    await rpc(admin, 'league_generate_fixtures', { p_season_id: seasonId, p_reset: false });
    assert(await count('league_matchdays', seasonId) === 6, 'expected 6 matchdays');
    assert(await count('league_fixtures', seasonId) === 12, 'expected 12 fixtures');
  });

  await check('fixture regeneration with reset does not hit a duplicate key', async () => {
    await rpc(admin, 'league_generate_fixtures', { p_season_id: seasonId, p_reset: true });
    assert(await count('league_matchdays', seasonId) === 6, 'matchdays changed after reset');
    assert(await count('league_fixtures', seasonId) === 12, 'fixtures changed after reset');
  });

  await check('second generation without reset is refused cleanly', async () => {
    await expectError('no-reset guard', () => rpc(admin, 'league_generate_fixtures', { p_season_id: seasonId, p_reset: false }), /already exist/i);
  });

  await check('standings expose four squads', async () => {
    const rows = await rpc(p01, 'league_standings', { p_season_id: seasonId });
    assert(Array.isArray(rows) && rows.length === 4, `standings ${Array.isArray(rows) ? rows.length : 'not an array'}`);
  });

  await check('season activates with approved rosters and fixtures', async () => {
    await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'ACTIVE' });
    const { data, error } = await admin.from('league_seasons').select('status').eq('id', seasonId).single();
    if (error) throw new Error(error.message);
    assert(data.status === 'ACTIVE', `status ${data.status}`);
  });

  await check('cancel season deletes it and all child rows', async () => {
    await rpc(admin, 'league_cancel_season', { p_season_id: seasonId, p_reason: 'Automated smoke cleanup' });
    const { data, error } = await svc.from('league_seasons').select('id').eq('id', seasonId).maybeSingle();
    if (error) throw new Error(error.message);
    assert(!data, 'season still exists after cancel');
    assert(await count('league_teams', seasonId) === 0, 'teams remain');
    assert(await count('league_fixtures', seasonId) === 0, 'fixtures remain');
  });
} catch (error) {
  console.log(`Smoke aborted: ${error instanceof Error ? error.message : error}`);
} finally {
  if (seasonId) {
    try { await svc.from('league_seasons').delete().eq('id', seasonId); } catch { /* best effort */ }
    try { await svc.from('notifications').delete().eq('entity_id', seasonId); } catch { /* best effort */ }
  }
  if (logoPath) await svc.storage.from('league-assets').remove([logoPath]);
  if (badgePath) await svc.storage.from('clan-assets').remove([badgePath]);
  const leftover = await svc.from('league_seasons').select('id').eq('name', seasonName);
  if ((leftover.data ?? []).length > 0) {
    console.log('WARN leftover smoke seasons', leftover.data);
    failures += 1;
  }
}

console.log(failures === 0 ? '\n4vs4 smoke: all checks passed' : `\n4vs4 smoke: ${failures} failure(s)`);
if (failures > 0) process.exitCode = 1;
