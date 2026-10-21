import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const readEnv = (p) => Object.fromEntries(
  fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()]; }),
);
const DESK = path.resolve(TMP, '..', '..', 'app');
const env = readEnv(path.join(DESK, '.env'));
const local = fs.existsSync(path.join(DESK, '.env.test.local'))
  ? readEnv(path.join(DESK, '.env.test.local'))
  : {};
const url = env.VITE_SUPABASE_URL;
const service = local.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
const password = `VikQA-${crypto.randomBytes(12).toString('base64url')}!`;

async function api(path, opts = {}) {
  const res = await fetch(`${url}${path}`, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const aliases = [];
for (let i = 1; i <= 24; i++) aliases.push(`p${String(i).padStart(2, '0')}`);
aliases.push('admin', 'staff');
const users = [];
let page = 1;
while (true) {
  const body = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
  const rows = body.users || [];
  users.push(...rows);
  if (rows.length < 200) break;
  page++;
}
const byEmail = new Map(users.map((u) => [(u.email || '').toLowerCase(), u]));
const accounts = [];

for (const alias of aliases) {
  const email = `youssef.mouslih96+${alias}@gmail.com`;
  const role = alias === 'admin' ? 'ADMIN' : alias === 'staff' ? 'MODERATOR' : 'PLAYER';
  const username = `qa_${alias}`;
  const displayName = alias === 'admin' ? 'QA Admin' : alias === 'staff' ? 'QA Staff' : `QA Player ${alias.slice(1)}`;
  let user = byEmail.get(email.toLowerCase());
  if (!user) {
    user = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } }),
    });
    console.log('created', alias);
  } else {
    await api(`/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true, user_metadata: { ...(user.user_metadata || {}), display_name: displayName } }),
    });
    console.log('reset', alias);
  }
  await api('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: user.id, username, display_name: displayName, email, role, status: 'ACTIVE' }),
  });
  accounts.push({ alias, email, username, display_name: displayName, role, id: user.id });
}

fs.writeFileSync(`${TMP}/vik_full_qa_accounts.json`, JSON.stringify({ password, accounts, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
console.log('saved', accounts.length, 'accounts');

const profiles = await api(`/rest/v1/profiles?select=id,username,role,status,name,viking_tag,phone,oath_sworn_at,avatar_url&id=in.(${accounts.map((a) => a.id).join(',')})`);
console.log('profile fields sample:', JSON.stringify((profiles || []).slice(0, 3)));
