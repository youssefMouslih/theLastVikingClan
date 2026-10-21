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
const parse=(f)=>Object.fromEntries((fs.existsSync(ROOT+'/'+f) ? fs.readFileSync(ROOT+'/'+f,'utf8') : '').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const env={...parse('.env.test.local'),...parse('.env')};
const svc=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const SEASON='32b21e09-ee23-453f-8e17-2fddf3a02c94';
const log=(l,r)=>{if(r?.error)console.log('ERR',l,r.error.message);else console.log('OK',l,r?.count??(Array.isArray(r?.data)?r.data.length:''));};
const q=async(t)=>{const r=await svc.from(t).select('*');if(r.error)throw new Error(t+': '+r.error.message);return r.data??[]};
const ids=new Set([SEASON]);
const teams=await q('league_teams'); for(const x of teams)if(x.season_id===SEASON)ids.add(x.id);
const matchdays=await q('league_matchdays'); for(const x of matchdays)if(x.season_id===SEASON)ids.add(x.id);
const fixtures=await q('league_fixtures'); for(const x of fixtures)if(x.season_id===SEASON)ids.add(x.id);
const duels=await q('league_duels'); for(const x of duels)if(x.matchday_id&&ids.has(x.matchday_id))ids.add(x.id);
const reports=await q('league_duel_reports'); const reportIds=reports.filter(x=>ids.has(x.duel_id)).map(x=>x.id);
const disputes=await q('league_disputes'); const disputeIds=disputes.filter(x=>ids.has(x.duel_id)).map(x=>x.id);
const subs=await q('league_substitutions'); const subIds=subs.filter(x=>ids.has(x.duel_id)).map(x=>x.id);
const lineups=await q('league_lineups'); const lineupIds=lineups.filter(x=>ids.has(x.fixture_id)).map(x=>x.id);
const lps=await q('league_lineup_players'); const lpIds=lps.filter(x=>lineupIds.includes(x.lineup_id)).map(x=>x.id);
const byes=await q('league_byes'); const byeIds=byes.filter(x=>ids.has(x.matchday_id)||ids.has(x.team_id)).map(x=>x.id);
const penalties=await q('league_penalties'); const penIds=penalties.filter(x=>x.season_id===SEASON).map(x=>x.id);
const tiebreaks=await q('league_tiebreak_orders'); const tbIds=tiebreaks.filter(x=>x.season_id===SEASON).map(x=>x.id);
const reminders=await q('league_deadline_reminders'); const remIds=reminders.filter(x=>ids.has(x.matchday_id)||ids.has(x.team_id)).map(x=>x.id);
const members=await q('league_team_members'); const memIds=members.filter(x=>ids.has(x.team_id)).map(x=>x.id);
const invites=await q('league_team_invites'); const invIds=invites.filter(x=>ids.has(x.team_id)).map(x=>x.id);
const audit=await q('league_audit_logs'); const audIds=audit.filter(x=>x.season_id===SEASON).map(x=>x.id);
const seasonNotifs=await svc.from('notifications').select('id').in('entity_id',[...ids]);
const notifIds=(seasonNotifs.data??[]).map(x=>x.id);
console.log({reports:reportIds.length,disputes:disputeIds.length,subs:subIds.length,lineups:lineupIds.length,lps:lpIds.length,byes:byeIds.length,penalties:penIds.length,tiebreaks:tbIds.length,reminders:remIds.length,members:memIds.length,invites:invIds.length,audit:audIds.length,notifs:notifIds.length});
for(const [t,list] of [['league_duel_reports',reportIds],['league_disputes',disputeIds],['league_substitutions',subIds],['league_lineup_players',lpIds],['league_lineups',lineupIds],['league_duels',[...ids].filter(x=>duels.some(d=>d.id===x))],['league_fixtures',[...ids].filter(x=>fixtures.some(f=>f.id===x))],['league_byes',byeIds],['league_deadline_reminders',remIds],['league_penalties',penIds],['league_tiebreak_orders',tbIds],['league_team_invites',invIds],['league_team_members',memIds],['league_teams',[...ids].filter(x=>teams.some(t=>t.id===x))],['league_audit_logs',audIds],['notifications',notifIds]]){if(!list.length)continue;const r=await svc.from(t).delete().in('id',list);log(t,r);}
log('league_matchdays',await svc.from('league_matchdays').delete().in('id',[...ids].filter(x=>matchdays.some(m=>m.id===x))));
const seasonDel=await svc.from('league_seasons').delete().eq('id',SEASON);log('league_seasons',seasonDel);
// storage
const paths=[];
async function walk(prefix){const r=await svc.storage.from('match-evidence').list(prefix,{limit:1000});if(r.error){console.log('storage list err',r.error.message);return;}for(const o of r.data??[]){const p=prefix?prefix+'/'+o.name:o.name;if(o.id)paths.push(p);else await walk(p);}}
await walk('league/'+SEASON);
if(paths.length){const rm=await svc.storage.from('match-evidence').remove(paths);console.log('storage removed',rm.error?.message??paths.length);}else console.log('storage removed 0');
for(const t of ['league_seasons','league_teams','league_fixtures','league_duels','league_duel_reports','league_disputes','league_penalties','league_audit_logs']){const r=await svc.from(t).select('*',{count:'exact',head:true});console.log('LEFT',t,r.error?.message??r.count);}
