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
const state=JSON.parse(fs.readFileSync(TMP+'/vik_full_qa_accounts.json','utf8'));const qa=state.accounts.map(a=>a.id);const base='bb4a6374-2a1b-48e9-990a-9b8fb39e8ce5';
const c=async(t,f)=>{let r=svc.from(t).select('*',{count:'exact',head:true});if(f)r=f(r);r=await r;return r.error?'ERR '+r.error.message:r.count};
console.log('QA accounts',state.accounts.length,'base?',(await svc.from('profiles').select('id,role,status').eq('id',base).single()).data);
const qaProfiles=await svc.from('profiles').select('id,alias:username,role,status,known_name,phone,warrior_tag,oath_accepted_at,onboarding_rewarded_at').in('id',qa);console.log('qa profiles',qaProfiles.data?.filter(x=>x.role!=='PLAYER'||x.status!=='ACTIVE'||x.oath_accepted_at).length, JSON.stringify(qaProfiles.data?.slice(0,3)));
console.log('throne',await svc.from('throne_reigns').select('id,holder_id,ended_at').order('started_at'));
for(const t of ['competitions','competition_participants','competition_waitlist','rounds','matches','match_evidence','disputes','challenges','throne_reigns','xp_ledger','quest_claims','ratings','squads','squad_members','gp_requests','tryout_requests','announcements','honours','notifications','achievements','audit_logs','league_seasons','league_teams','league_fixtures','league_duels','league_duel_reports','league_disputes','league_penalties','league_audit_logs']){
 const n=await c(t);console.log(t,n);
}
const notifs=await svc.from('notifications').select('id,user_id,type,title,entity_id,created_at').order('created_at',{ascending:false}).limit(40);console.log('notifs recent',JSON.stringify(notifs.data,null,1));
const ach=await svc.from('achievements').select('*');console.log('achievements',JSON.stringify(ach.data,null,1));
const audits=await svc.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(30);console.log('audits recent',JSON.stringify(audits.data,null,1).slice(0,4000));
const xp=await svc.from('xp_ledger').select('*').in('player_id',qa);console.log('qa xp',JSON.stringify(xp.data,null,1));
const qc=await svc.from('quest_claims').select('*').in('player_id',qa);console.log('qa quests',JSON.stringify(qc.data,null,1));
const clan=await svc.from('clan_settings').select('*');console.log('clan',JSON.stringify(clan.data,null,1));
const list=await svc.auth.admin.listUsers({page:1,perPage:200});const aliases=(list.data?.users??[]).filter(u=>/^youssef\.mouslih96\+(p\d{2}|admin|staff)@gmail\.com$/i.test(u.email||''));console.log('auth QA aliases',aliases.length,'base?',(list.data?.users??[]).some(u=>(u.email||'').toLowerCase()==='youssef.mouslih96@gmail.com'));
const objects=await svc.storage.from('match-evidence').list('',{limit:1000});console.log('storage root',JSON.stringify(objects.data));
