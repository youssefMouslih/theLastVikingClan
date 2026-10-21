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
const state=JSON.parse(fs.readFileSync(TMP+'/vik_full_qa_accounts.json','utf8'));const qa=new Set(state.accounts.map(a=>a.id));
const p=await svc.from('profiles').select('id,username,display_name,role,status').order('created_at');console.log(JSON.stringify(p.data?.filter(x=>!qa.has(x.id)),null,1));
const t=await svc.from('throne_reigns').select('id,holder_id,ended_at');console.log('throne',JSON.stringify(t.data,null,1));
const l=await svc.auth.admin.listUsers({page:1,perPage:200});console.log('base users',(l.data?.users??[]).filter(u=>!qa.has(u.id)).map(u=>({id:u.id,email:u.email,created:u.created_at})));
