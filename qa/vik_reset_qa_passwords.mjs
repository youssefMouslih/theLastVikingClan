import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const QA_DIR = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(QA_DIR, 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const ROOT = path.resolve(QA_DIR, '..', 'app');

const readEnv = (p) => Object.fromEntries(
  fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const env = readEnv(path.join(ROOT, '.env'));
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const url = env.VITE_SUPABASE_URL;
if (!service || !url) throw new Error('Missing service key in app/.env');

const password = process.env.VIK_QA_PASSWORD
  || `VikQA-${crypto.randomBytes(12).toString('base64url')}!A`;

const h = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
async function api(path, opts = {}) {
  const res = await fetch(`${url}${path}`, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const users = [];
for (let page = 1; ; page++) {
  const body = await api(`/auth/v1/admin/users?per_page=200&page=${page}`);
  const list = body.users ?? [];
  users.push(...list);
  if (list.length < 200) break;
}

const accounts = users
  .map((u) => ({ id: u.id, email: u.email }))
  .filter((u) => /^youssef\.mouslih96\+(p\d{2}|admin|staff)@gmail\.com$/.test(u.email))
  .map((u) => ({ ...u, alias: u.email.split('+')[1].split('@')[0] }))
  .sort((a, b) => a.alias.localeCompare(b.alias));

if (accounts.length === 0) throw new Error(`no QA users matched (total users: ${users.length})`);

for (const a of accounts) {
  await api(`/auth/v1/admin/users/${a.id}`, { method: 'PUT', body: JSON.stringify({ password }) });
}

const accountsPath = path.join(TMP, 'vik_full_qa_accounts.json');
fs.writeFileSync(accountsPath, JSON.stringify({ password, accounts }, null, 2));
console.log(`reset ${accounts.length} QA passwords; aliases: ${accounts.map((a) => a.alias).join(',')}`);
console.log(`accounts state written to ${accountsPath} (gitignored, never commit)`);
