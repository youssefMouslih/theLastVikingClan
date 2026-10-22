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
async function rows(table, filter, select = '*') {
  let query = svc.from(table).select(select);
  for (const [key, value] of Object.entries(filter)) query = query.eq(key, value);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}
async function one(table, filter, select = '*') {
  const data = await rows(table, filter, select);
  return data[0] ?? null;
}

const suffix = Date.now().toString(36);
const now = Date.now();
const seasonName = `QA Dispute 4v4 ${suffix}`;
const opens = new Date(now - 3600_000).toISOString();
const closes = new Date(now + 3600_000).toISOString();
const starts = new Date(now + 2 * 3600_000).toISOString();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

let seasonId = null;
let fixtureId = null;
const uploadedPaths = [];

const admin = await clientFor('admin');
const captains = [['p01', await clientFor('p01')], ['p07', await clientFor('p07')], ['p13', await clientFor('p13')], ['p19', await clientFor('p19')]];
const rosters = {
  p01: ['p02', 'p03', 'p04', 'p05', 'p06'],
  p07: ['p08', 'p09', 'p10', 'p11', 'p12'],
  p13: ['p14', 'p15', 'p16', 'p17', 'p18'],
  p19: ['p20', 'p21', 'p22', 'p23', 'p24'],
};

function lineupFor(captainAlias) {
  const roster = rosters[captainAlias];
  return [
    { player_id: id(roster[0]), role: 'STARTER', slot: 1 },
    { player_id: id(roster[1]), role: 'STARTER', slot: 2 },
    { player_id: id(roster[2]), role: 'STARTER', slot: 3 },
    { player_id: id(roster[3]), role: 'STARTER', slot: 4 },
    { player_id: id(roster[4]), role: 'SUB', slot: 1 },
    { player_id: id(captainAlias), role: 'SUB', slot: 2 },
  ];
}

async function uploadEvidence(playerAlias, duelId, client) {
  const playerId = id(playerAlias);
  const filePath = `league/${seasonId}/${fixtureId}/${duelId}/${playerId}-qa-${suffix}-${Date.now()}.png`;
  const up = await client.storage.from('match-evidence').upload(filePath, png, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(`evidence upload (${playerAlias}): ${up.error.message}`);
  uploadedPaths.push(filePath);
  return filePath;
}

async function report(client, playerAlias, duelId, scoreFor, scoreAgainst) {
  const evidence = await uploadEvidence(playerAlias, duelId, client);
  await rpc(client, 'league_submit_duel_result', {
    p_duel_id: duelId,
    p_score_for: scoreFor,
    p_score_against: scoreAgainst,
    p_decided_by: 'REGULATION',
    p_evidence_path: evidence,
    p_note: `QA report ${suffix}`,
  });
}

const teamIds = {};
try {
  await check('create active season with four approved squads', async () => {
    seasonId = await rpc(admin, 'league_create_season', {
      p_name: seasonName,
      p_description: 'Dispute flow QA season.',
      p_registration_opens_at: opens,
      p_registration_closes_at: closes,
      p_starts_at: starts,
      p_matchday_days: 1,
      p_min_teams: 4,
      p_max_teams: 4,
      p_roster_min: 6,
      p_roster_max: 6,
    });
    assert(typeof seasonId === 'string' && seasonId.length > 0, 'no season id returned');
    await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'REGISTRATION' });
    for (const [alias, client] of captains) {
      teamIds[alias] = await rpc(client, 'league_create_team', { p_season_id: seasonId, p_name: `QA Dispute ${alias} ${suffix}` });
      for (const member of rosters[alias]) {
        const memberClient = await clientFor(member);
        await rpc(client, 'league_invite_member', { p_team_id: teamIds[alias], p_player_id: id(member) });
        const invite = await one('league_team_invites', { team_id: teamIds[alias], player_id: id(member), status: 'PENDING' }, 'id');
        if (!invite) throw new Error(`missing invite for ${member}`);
        await rpc(memberClient, 'league_answer_invite', { p_invite_id: invite.id, p_accept: true });
      }
      await rpc(admin, 'league_approve_team', { p_team_id: teamIds[alias], p_approve: true, p_note: 'Dispute QA approval' });
    }
    await rpc(admin, 'league_generate_fixtures', { p_season_id: seasonId, p_reset: false });
    await rpc(admin, 'league_set_season_status', { p_season_id: seasonId, p_status: 'ACTIVE' });
  });

  await check('two squads submit lineups and reveal four duels', async () => {
    const fixtures = await rows('league_fixtures', { season_id: seasonId });
    const teamToCaptain = Object.fromEntries(Object.entries(teamIds).map(([alias, teamId]) => [teamId, alias]));
    const fixture = fixtures.find((f) => teamToCaptain[f.home_team_id] && teamToCaptain[f.away_team_id]);
    if (!fixture) throw new Error('no fixture with two QA squads');
    fixtureId = fixture.id;
    const homeAlias = teamToCaptain[fixture.home_team_id];
    const awayAlias = teamToCaptain[fixture.away_team_id];
    await rpc(captains.find(([alias]) => alias === homeAlias)[1], 'league_submit_lineup', { p_fixture_id: fixtureId, p_players: lineupFor(homeAlias) });
    const pending = await one('league_fixtures', { id: fixtureId }, 'status');
    assert(pending.status === 'SCHEDULED' || pending.status === 'LINEUPS_PENDING', `unexpected pre-reveal status ${pending.status}`);
    await rpc(captains.find(([alias]) => alias === awayAlias)[1], 'league_submit_lineup', { p_fixture_id: fixtureId, p_players: lineupFor(awayAlias) });
    const revealed = await one('league_fixtures', { id: fixtureId }, 'status');
    assert(revealed.status === 'LINEUPS_REVEALED', `fixture status ${revealed.status}`);
    const duels = await rows('league_duels', { fixture_id: fixtureId });
    assert(duels.length === 4, `expected 4 duels, got ${duels.length}`);
  });

  await check('participant opens a manual dispute, captain sees it, outsider cannot', async () => {
    const duels = (await rows('league_duels', { fixture_id: fixtureId })).sort((a, b) => a.slot - b.slot);
    const duel = duels[0];
    await rpc(await clientFor(aliasForPlayer(duel.home_player_id)), 'league_start_duel', { p_duel_id: duel.id });
    await report(await clientFor(aliasForPlayer(duel.home_player_id)), aliasForPlayer(duel.home_player_id), duel.id, 3, 1);
    const awayAlias = aliasForPlayer(duel.away_player_id);
    const disputeId = await rpc(await clientFor(awayAlias), 'league_dispute_duel', {
      p_duel_id: duel.id,
      p_reason: 'QA participant dispute: reported score is wrong.',
      p_evidence_path: await uploadEvidence(awayAlias, duel.id, await clientFor(awayAlias)),
    });
    assert(typeof disputeId === 'string', 'no dispute id');
    const stateRow = await one('league_duels', { id: duel.id }, 'status');
    assert(stateRow.status === 'DISPUTED', `duel status ${stateRow.status}`);
    const dispute = await one('league_disputes', { id: disputeId });
    assert(dispute.status === 'OPEN' && dispute.opened_by === id(awayAlias), JSON.stringify(dispute));
    const homeReport = await one('league_duel_reports', { duel_id: duel.id, player_id: id(aliasForPlayer(duel.home_player_id)) }, 'status');
    assert(homeReport.status === 'DISPUTED', `home report ${homeReport.status}`);
    const captainClient = await clientFor(aliasForHomeCaptain(duel));
    const visible = await captainClient.from('league_disputes').select('id').eq('id', disputeId);
    if (visible.error) throw new Error(`captain read: ${visible.error.message}`);
    assert((visible.data ?? []).length === 1, 'captain cannot read the dispute');
    const outsider = await clientFor(aliasForOutsider(duel));
    const hidden = await outsider.from('league_disputes').select('id').eq('id', disputeId);
    if (hidden.error) throw new Error(`outsider read: ${hidden.error.message}`);
    assert((hidden.data ?? []).length === 0, 'unrelated player can read the dispute');
    const duplicateClient = await clientFor(aliasForPlayer(duel.home_player_id));
    await expectError('second dispute on the same duel is refused', () => rpc(duplicateClient, 'league_dispute_duel', {
      p_duel_id: duel.id,
      p_reason: 'QA duplicate dispute.',
    }), /cannot be disputed|already has an open dispute/i);
    await rpc(admin, 'league_resolve_dispute', {
      p_dispute_id: disputeId,
      p_winner_team_id: duel.home_team_id,
      p_home_score: 3,
      p_away_score: 1,
      p_resolution: 'QA staff confirmed the reported 3-1 result.',
      p_forfeit: false,
    });
    const resolvedDuel = await one('league_duels', { id: duel.id });
    assert(resolvedDuel.status === 'CONFIRMED' && resolvedDuel.home_score === 3 && resolvedDuel.away_score === 1, JSON.stringify(resolvedDuel));
    const resolvedDispute = await one('league_disputes', { id: disputeId });
    assert(resolvedDispute.status === 'RESOLVED', `dispute ${resolvedDispute.status}`);
    const confirmedReport = await one('league_duel_reports', { duel_id: duel.id, player_id: id(aliasForPlayer(duel.home_player_id)) }, 'status');
    assert(confirmedReport.status === 'CONFIRMED', `report ${confirmedReport.status}`);
  });

  await check('squad captain can open a dispute before a result is reported', async () => {
    const duels = (await rows('league_duels', { fixture_id: fixtureId })).sort((a, b) => a.slot - b.slot);
    const duel = duels[1];
    await rpc(await clientFor(aliasForPlayer(duel.home_player_id)), 'league_start_duel', { p_duel_id: duel.id });
    const captainAlias = aliasForHomeCaptain(duel);
    const disputeId = await rpc(await clientFor(captainAlias), 'league_dispute_duel', {
      p_duel_id: duel.id,
      p_reason: 'QA captain dispute: duel result is missing.',
    });
    const dispute = await one('league_disputes', { id: disputeId });
    assert(dispute.status === 'OPEN' && dispute.opened_by === id(captainAlias), JSON.stringify(dispute));
    const duelState = await one('league_duels', { id: duel.id }, 'status');
    assert(duelState.status === 'DISPUTED', `duel status ${duelState.status}`);
    await rpc(admin, 'league_resolve_dispute', {
      p_dispute_id: disputeId,
      p_winner_team_id: duel.away_team_id,
      p_home_score: 1,
      p_away_score: 2,
      p_resolution: 'QA staff awarded the duel to the away squad.',
      p_forfeit: false,
    });
    const resolved = await one('league_duels', { id: duel.id });
    assert(resolved.status === 'CONFIRMED' && resolved.winner_team_id === duel.away_team_id, JSON.stringify(resolved));
  });

  await check('mismatched reports auto-open exactly one dispute', async () => {
    const duels = (await rows('league_duels', { fixture_id: fixtureId })).sort((a, b) => a.slot - b.slot);
    const duel = duels[2];
    const homeAlias = aliasForPlayer(duel.home_player_id);
    const awayAlias = aliasForPlayer(duel.away_player_id);
    await rpc(await clientFor(homeAlias), 'league_start_duel', { p_duel_id: duel.id });
    await report(await clientFor(homeAlias), homeAlias, duel.id, 2, 0);
    await report(await clientFor(awayAlias), awayAlias, duel.id, 1, 0);
    const disputes = await rows('league_disputes', { duel_id: duel.id });
    assert(disputes.length === 1, `expected one dispute, got ${disputes.length}`);
    assert(disputes[0].status === 'OPEN', `dispute status ${disputes[0].status}`);
    assert(/mismatch/i.test(disputes[0].reason), `unexpected reason: ${disputes[0].reason}`);
    const duelState = await one('league_duels', { id: duel.id }, 'status');
    assert(duelState.status === 'DISPUTED', `duel status ${duelState.status}`);
    const reports = await rows('league_duel_reports', { duel_id: duel.id }, 'player_id,status');
    assert(reports.length === 2 && reports.every((r) => r.status === 'DISPUTED'), JSON.stringify(reports));
    await rpc(admin, 'league_resolve_dispute', {
      p_dispute_id: disputes[0].id,
      p_winner_team_id: duel.home_team_id,
      p_home_score: 2,
      p_away_score: 0,
      p_resolution: 'QA staff confirmed the 2-0 result.',
      p_forfeit: false,
    });
    const finalReports = await rows('league_duel_reports', { duel_id: duel.id }, 'player_id,status');
    const statuses = Object.fromEntries(finalReports.map((r) => [r.player_id, r.status]));
    assert(statuses[id(homeAlias)] === 'CONFIRMED', JSON.stringify(statuses));
    assert(statuses[id(awayAlias)] === 'REJECTED', JSON.stringify(statuses));
    const resolved = await one('league_duels', { id: duel.id });
    assert(resolved.status === 'CONFIRMED' && resolved.home_score === 2 && resolved.away_score === 0, JSON.stringify(resolved));
  });
} catch (error) {
  console.log(`Dispute QA aborted: ${error instanceof Error ? error.message : error}`);
} finally {
  try {
    if (seasonId) {
      const fixtures = await rows('league_fixtures', { season_id: seasonId }, 'id');
      const fixtureIds = fixtures.map((f) => f.id);
      const duels = fixtureIds.length ? await svc.from('league_duels').select('id').in('fixture_id', fixtureIds) : { data: [] };
      const duelIds = (duels.data ?? []).map((d) => d.id);
      const teamIdsForCleanup = (await rows('league_teams', { season_id: seasonId }, 'id')).map((t) => t.id);
      const matchdays = (await rows('league_matchdays', { season_id: seasonId }, 'id')).map((m) => m.id);
      const lineupIds = fixtureIds.length
        ? ((await svc.from('league_lineups').select('id').in('fixture_id', fixtureIds)).data ?? []).map((l) => l.id)
        : [];
      const ids = [seasonId, ...fixtureIds, ...duelIds, ...teamIdsForCleanup, ...matchdays];
      if (duelIds.length) {
        await svc.from('league_disputes').delete().in('duel_id', duelIds);
        await svc.from('league_duel_reports').delete().in('duel_id', duelIds);
        await svc.from('league_substitutions').delete().in('duel_id', duelIds);
      }
      if (lineupIds.length) {
        await svc.from('league_lineup_players').delete().in('lineup_id', lineupIds);
        await svc.from('league_lineups').delete().in('id', lineupIds);
      }
      if (duelIds.length) await svc.from('league_duels').delete().in('id', duelIds);
      if (fixtureIds.length) await svc.from('league_fixtures').delete().in('id', fixtureIds);
      if (matchdays.length) {
        await svc.from('league_byes').delete().in('matchday_id', matchdays);
        await svc.from('league_deadline_reminders').delete().in('matchday_id', matchdays);
        await svc.from('league_matchdays').delete().in('id', matchdays);
      }
      if (teamIdsForCleanup.length) {
        await svc.from('league_penalties').delete().in('team_id', teamIdsForCleanup);
        await svc.from('league_tiebreak_orders').delete().in('team_id', teamIdsForCleanup);
        await svc.from('league_team_invites').delete().in('team_id', teamIdsForCleanup);
        await svc.from('league_team_members').delete().in('team_id', teamIdsForCleanup);
        await svc.from('league_teams').delete().in('id', teamIdsForCleanup);
      }
      await svc.from('league_audit_logs').delete().eq('season_id', seasonId);
      if (ids.length) await svc.from('notifications').delete().in('entity_id', ids);
      await svc.from('league_seasons').delete().eq('id', seasonId);
    }
  } catch (error) {
    console.log(`Cleanup warning: ${error instanceof Error ? error.message : error}`);
  }
  if (uploadedPaths.length) {
    const removed = await svc.storage.from('match-evidence').remove(uploadedPaths);
    if (removed.error) console.log(`Storage cleanup warning: ${removed.error.message}`);
  }
  const leftover = await svc.from('league_seasons').select('id').eq('name', seasonName);
  if ((leftover.data ?? []).length > 0) {
    console.log('WARN leftover dispute QA season', leftover.data);
    failures += 1;
  }
}

function aliasForPlayer(playerId) {
  const entry = Object.entries(accounts).find(([, account]) => account.id === playerId);
  if (!entry) throw new Error(`no QA alias for player ${playerId}`);
  return entry[0];
}
function aliasForHomeCaptain(duel) {
  const entry = Object.entries(teamIds).find(([, teamId]) => teamId === duel.home_team_id);
  if (!entry) throw new Error('no captain for home team');
  return entry[0];
}
function aliasForOutsider(duel) {
  const involvedTeams = new Set([duel.home_team_id, duel.away_team_id]);
  const outsiderCaptain = Object.entries(teamIds).find(([, teamId]) => !involvedTeams.has(teamId));
  if (!outsiderCaptain) throw new Error('no outsider team');
  return rosters[outsiderCaptain[0]][0];
}

console.log(failures === 0 ? '\n4vs4 dispute QA: all checks passed' : `\n4vs4 dispute QA: ${failures} failure(s)`);
if (failures > 0) process.exitCode = 1;
