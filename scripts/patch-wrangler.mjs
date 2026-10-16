/*
 * patch-wrangler.mjs — پر کردن خودکار wrangler.toml
 * استفاده:  node patch-wrangler.mjs <ACCOUNT_ID> <KV_NAMESPACE_ID>
 * کاری که می‌کند:
 *   ۱) account_id را در wrangler.toml می‌نویسد (اگر نبود اضافه می‌کند)
 *   ۲) id فضای KV را جایگزین REPLACE_WITH_YOUR_KV_NAMESPACE_ID می‌کند
 *   ۳) WEBHOOK_SECRET تصادفی می‌سازد (یا موجود را نگه می‌دارد) و در [vars] می‌گذارد
 *   ۴) مقدار WEBHOOK_SECRET را در webhook-secret.txt ذخیره و چاپ می‌کند
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const pkg = join(dir, '..');
const tomlPath = join(pkg, 'wrangler.toml');
const [accId, nsId] = process.argv.slice(2);

let t = readFileSync(tomlPath, 'utf8');

/* ── account_id ── */
if (accId) {
  if (/^account_id\s*=/m.test(t)) {
    t = t.replace(/^account_id\s*=\s*".*"/m, `account_id = "${accId}"`);
  } else {
    t = t.replace(/^name = /m, `account_id = "${accId}"\nname = `);
  }
}

/* ── id فضای KV ── */
if (nsId) {
  t = t.replace(/id\s*=\s*"REPLACE_WITH_YOUR_KV_NAMESPACE_ID"/, `id = "${nsId}"`);
}

/* ── WEBHOOK_SECRET ── */
let secret = '';
const secretFile = join(pkg, 'webhook-secret.txt');
if (existsSync(secretFile)) secret = readFileSync(secretFile, 'utf8').trim();
const m = t.match(/^WEBHOOK_SECRET\s*=\s*"([A-Za-z0-9_-]+)"/m);
if (m && m[1]) secret = m[1];
if (!secret) secret = randomBytes(18).toString('hex');
if (!m) t = t.replace(/^\[vars\]\s*$/m, `[vars]\nWEBHOOK_SECRET = "${secret}"`);

writeFileSync(tomlPath, t);
writeFileSync(secretFile, secret + '\n');
console.log(secret);
