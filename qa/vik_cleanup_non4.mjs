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
const parse=(f)=>Object.fromEntries((fs.existsSync(ROOT+'/'+f) ? fs.readFileSync(ROOT+'/'+f,'utf8') : '').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const env={...parse('.env.test.local'),...parse('.env')};
const svc=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const err=(l,r)=>{if(r.error)console.log('ERR',l,r.error.message)};const ok=(l,d)=>console.log('OK',l,Array.isArray(d)?d.length:d??'');
const accounts=JSON.parse(fs.readFileSync(TMP+'/vik_full_qa_accounts.json','utf8')).accounts;
const qaIds=accounts.map(a=>a.id);
const state=fs.existsSync(TMP+'/vik_non4_qa_state.json')?JSON.parse(fs.readFileSync(TMP+'/vik_non4_qa_state.json','utf8')):{};
// restore throne first: keep base user's reigns, delete any QA-held reign
const BASE_OPEN='79674a53-f721-4e4a-ad80-2dec534cc3c3';
const BASE_HOLDER='bb4a6374-2a1b-48e9-990a-9b8fb39e8ce5';
const {data:reigns}=await svc.from('throne_reigns').select('id,holder_id');
for(const r of reigns??[]){if(r.id!==BASE_OPEN&&r.holder_id!==BASE_HOLDER)err('qa throne delete '+r.id,await svc.from('throne_reigns').delete().eq('id',r.id));}
err('base throne reopen',await svc.from('throne_reigns').update({ended_at:null,defenses:0,won_from:null,competition_id:null}).eq('id',BASE_OPEN));
// challenges QA
err('challenges',await svc.from('challenges').delete().or(`challenger_id.in.(${qaIds.join(',')}),opponent_id.in.(${qaIds.join(',')})`));
// competitions QA
const {data:comps}=await svc.from('competitions').select('id').ilike('name','QA %');
const compIds=(comps??[]).map(x=>x.id);
if(compIds.length){
  const {data:qaMatches}=await svc.from('matches').select('id').in('competition_id',compIds);
  const matchIds=(qaMatches??[]).map(x=>x.id);
  if(matchIds.length) err('audit logs',await svc.from('audit_logs').delete().in('entity_id',matchIds));
  err('disputes',await svc.from('disputes').delete().in('match_id',matchIds));
  err('evidence',await svc.from('match_evidence').delete().in('match_id',matchIds));
  err('matches',await svc.from('matches').delete().in('competition_id',compIds));
  err('rounds',await svc.from('rounds').delete().in('competition_id',compIds));
  err('participants',await svc.from('competition_participants').delete().in('competition_id',compIds));
  err('waitlist',await svc.from('competition_waitlist').delete().in('competition_id',compIds));
  err('comps',await svc.from('competitions').delete().in('id',compIds));
}
// squads
const {data:squads}=await svc.from('squads').select('id').ilike('name','QA Squad%');
const squadIds=(squads??[]).map(x=>x.id);
if(squadIds.length){
  err('squad_members',await svc.from('squad_members').delete().in('squad_id',squadIds));
  err('squads',await svc.from('squads').delete().in('id',squadIds));
}
// gifts, tryout QA, announcements/honours QA
err('gifts',await svc.from('gp_requests').delete().or(`requester_id.in.(${qaIds.join(',')}),giver_id.in.(${qaIds.join(',')})`));
const {data:tr}=await svc.from('tryout_requests').select('id').ilike('name','QA %');
if(tr?.length) err('tryouts',await svc.from('tryout_requests').delete().in('id',tr.map(x=>x.id)));
const {data:ann}=await svc.from('announcements').select('id').ilike('title','QA announcement%');
if(ann?.length) err('announcements',await svc.from('announcements').delete().in('id',ann.map(x=>x.id)));
const {data:hon}=await svc.from('achievements').select('id').ilike('name','QA honour%');
if(hon?.length) err('honours',await svc.from('achievements').delete().in('id',hon.map(x=>x.id)));
const {data:rat}=await svc.from('ratings').select('id').in('rater_id',qaIds);
if(rat?.length) err('ratings',await svc.from('ratings').delete().in('id',rat.map(x=>x.id)));
// quest/xp reset for QA except onboarding; remove test notifications
const {data:xp}=await svc.from('xp_ledger').select('id,reason').in('player_id',qaIds);
const delXp=(xp??[]).filter(x=>x.reason!=='onboarding-profile').map(x=>x.id);
if(delXp.length) err('xp',await svc.from('xp_ledger').delete().in('id',delXp));
const {data:qc}=await svc.from('quest_claims').select('id').in('player_id',qaIds);
if(qc?.length) err('quest_claims',await svc.from('quest_claims').delete().in('id',qc.map(x=>x.id)));
const {data:notif}=await svc.from('notifications').select('id').in('user_id',qaIds).eq('type','QA');
if(notif?.length) err('notifications',await svc.from('notifications').delete().in('id',notif.map(x=>x.id)));
// reset p01 onboarding gate & avatar, p17 oath; names can stay
const a=Object.fromEntries(accounts.map(x=>[x.alias,x]));
err('p01 reset',await svc.from('profiles').update({known_name:null,whatsapp:null,avatar_url:null,banner_color:null,bio:null,efootball_name:null,efootball_id:null,country:null,instagram:null,tiktok:null,kick:null,display_name:'QA Player One'}).eq('id',a.p01.id));
err('p17 oath',await svc.from('profiles').update({oath_accepted_at:null}).eq('id',a.p17.id));
// ensure QA roles/statuses except admin/staff
for(const x of accounts){if(['admin','staff'].includes(x.alias))continue;err('role '+x.alias,await svc.from('profiles').update({role:'PLAYER',status:'ACTIVE'}).eq('id',x.id));}
// remove test storage objects
const paths=(state.avatarPaths??[]).concat(state.evidencePaths??[]);
if(paths.length){err('avatars rm',await svc.storage.from('avatars').remove((state.avatarPaths??[])));err('evidence rm',await svc.storage.from('match-evidence').remove((state.evidencePaths??[])));}
await svc.from('clan_settings').update({description:null}).eq('id','a722d2d8-3c79-4232-ac79-cbe09b3482e3');
console.log('done');
