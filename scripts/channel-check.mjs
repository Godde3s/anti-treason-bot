/* v2.8 — چک دسترسی ربات جدید/قبلی در کانال‌های ثبت‌شده + گزارش به مالک (پیام تکمیلی پس از post-swap) */
import { readFileSync } from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const cred = {};
for (const line of readFileSync(HERE + '../bot-credentials.txt', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) cred[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const NEW = cred.BOT_TOKEN, OLD = cred.LEGACY_BOT_TOKEN, OWNER = cred.OWNER_ID;
const CF = process.env.CLOUDFLARE_API_TOKEN || '';
// شناسهٔ اکانت کلادفلر — اگر داده نشود خودکار از توکن کشف می‌شود
let CF_ACC = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const api = async (tok, method, params) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params || {}),
    });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e && e.message || e) }; }
};
const jget = async (url) => { try { return await (await fetch(url, { headers: { Authorization: 'Bearer ' + CF } })).json(); } catch (e) { return null; } };

const meR = await api(NEW, 'getMe', {});
if (!meR.ok) { console.error('getMe ربات جدید ناموفق: ' + (meR.description || JSON.stringify(meR))); process.exit(1); }
const me = meR.result;
const oldMeR = await api(OLD, 'getMe', {});
const oldMe = oldMeR.ok ? oldMeR.result : null;

const chs = [];
if (CF && !CF_ACC) {
  const al = await jget('https://api.cloudflare.com/client/v4/accounts');
  CF_ACC = al && al.success && al.result && al.result[0] ? al.result[0].id : '';
}
const nsl = CF && CF_ACC ? await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces`) : null;
const ns = nsl && nsl.success ? (nsl.result || []).find((n) => n.title === 'anti-treason-kv') : null;
if (ns) {
  const kl = await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${ns.id}/keys?limit=1000&prefix=chat:`);
  for (const k of (kl && kl.result) || []) {
    const v = await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${ns.id}/values/${encodeURIComponent(k.name)}`);
    if (v) chs.push({ cid: k.name.slice('chat:'.length), ...v });
  }
}
const member = async (tok, botId, cid) => {
  const r = await api(tok, 'getChatMember', { chat_id: cid, user_id: botId });
  return r.ok ? r.result : { status: 'err' };
};
const lines = [];
const need = [];
for (const c of chs) {
  const nM = await member(NEW, me.id, c.cid);
  const oM = oldMe ? await member(OLD, oldMe.id, c.cid) : { status: '—' };
  const t = esc(c.title || c.username || c.cid);
  let l;
  if (nM.status === 'administrator') {
    l = `✅ ${t} — ادمینه (حذف:${nM.can_delete_messages ? '✅' : '❌'} ارسال:${nM.can_post_messages ? '✅' : '❌'} بن:${nM.can_restrict_members ? '✅' : '❌'} ادمین‌سازی:${nM.can_promote_members ? '✅' : '❌'})`;
  } else { l = `⚠️ ${t} — ربات جدید هنوز ادمین نیست`; need.push(t); }
  const o = oM.status === 'administrator' ? ' | ربات قبلی: هنوز ادمینه (برای عزل‌ها)' : '';
  lines.push(l + o);
}
const txt =
  `📺 <b>گزارش دسترسی کانال‌ها (پس از تعویض ربات):</b>\n\n` +
  (lines.length ? lines.join('\n') : 'هیچ کانالی پیدا نشد') +
  (need.length
    ? `\n\n⚠️ ربات جدید (@${me.username}) رو تو کانال‌های بالا <b>ادمین</b> کن (حداقل «حذف پیام») تا قفل‌ها و گزارش‌ها مثل قبل کار کنن.`
    : `\n\n✅ هیچ کاری لازم نیست — ربات جدید همه‌جا ادمینه.`);
const sn = await api(NEW, 'sendMessage', { chat_id: OWNER, text: txt, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
console.log(sn.ok ? 'SENT' : 'FAIL: ' + sn.description);
console.log(txt.replace(/<[^>]+>/g, ''));
