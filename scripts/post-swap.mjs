/* ============================================================================
 * v2.8 — تعویض توکن ربات ضد خیانت (orchestrator)
 * ----------------------------------------------------------------------------
 *  ۱) وب‌هوک «ربات قبلی» بسته می‌شود (drop_pending) → از خدمت خارج؛ ولی ادمین کانال‌ها می‌ماند
 *  ۲) ربات جدید: getMe + منوی دستورات (فقط /start، مثل BotFather) + منوی ☰ + توضیحات پروفایل
 *  ۳) وضعیت وب‌هوک ربات جدید
 *  ۴) کانال‌های ثبت‌شده از KV کلادفلر + دسترسی هر دو ربات در هر کانال
 *  ۵) گزارش کامل برای مالک از طریق ربات جدید
 *
 * اجرا:
 *   CLOUDFLARE_API_TOKEN=...  node scripts/post-swap.mjs
 * (توکن‌های بات از bot-credentials.txt کنار همین پوشه خوانده می‌شوند)
 * ==========================================================================*/
import { readFileSync } from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const cred = {};
for (const line of readFileSync(HERE + '../bot-credentials.txt', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) cred[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const NEW = process.env.BOT_TOKEN || cred.BOT_TOKEN;
const OLD = process.env.LEGACY_BOT_TOKEN || cred.LEGACY_BOT_TOKEN;
const OWNER = process.env.OWNER_ID || cred.OWNER_ID;
const CF = process.env.CLOUDFLARE_API_TOKEN || '';
// شناسهٔ اکانت کلادفلر — اگر داده نشود خودکار از توکن کشف می‌شود
let CF_ACC = process.env.CLOUDFLARE_ACCOUNT_ID || '';

if (!NEW || !OLD) { console.error('BOT_TOKEN/LEGACY_BOT_TOKEN در bot-credentials.txt پیدا نشد'); process.exit(1); }

const api = async (tok, method, params) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params || {}),
    });
    return await r.json();
  } catch (e) { return { ok: false, description: String(e && e.message || e) }; }
};
const jget = async (url) => { try { return await (await fetch(url, { headers: { Authorization: 'Bearer ' + CF } })).json(); } catch (e) { return null; } };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  const out = [];

  /* ── ۱) ربات قبلی: بستن وب‌هوک ── */
  const oldMeR = await api(OLD, 'getMe', {});
  const oldMe = oldMeR.ok ? oldMeR.result : null;
  const dw = await api(OLD, 'deleteWebhook', { drop_pending_updates: true });
  out.push(`۱) وب‌هوک ربات قبلی (@${oldMe ? oldMe.username : '؟'}): ${dw.ok ? 'بسته شد ✅ — از خدمت خارج شد (ادمین کانال‌ها می‌ماند)' : '❌ ' + (dw.description || 'نامشخص')}`);

  /* ── ۲) ربات جدید: هویت + منوی دستورات + پروفایل ── */
  const meR = await api(NEW, 'getMe', {});
  if (!meR.ok) { console.error('getMe ربات جدید ناموفق: ' + meR.description); process.exit(1); }
  const me = meR.result;
  out.push(`۲) ربات جدید فعال شد: @${me.username} (id=${me.id})`);

  const CMD = [{ command: 'start', description: 'شروع ربات و نمایش پنل مدیریت' }];
  const rDefault = await api(NEW, 'setMyCommands', { commands: CMD });
  const rFa = await api(NEW, 'setMyCommands', { commands: CMD, language_code: 'fa' });
  out.push(`   منوی دستورات (/start): ${rDefault.ok && rFa.ok ? 'ثبت شد ✅' : '❌ ' + ((rDefault.description || '') + ' ' + (rFa.description || ''))}`);
  const mb = await api(NEW, 'setChatMenuButton', { menu_button: { type: 'default' } });
  out.push(`   دکمهٔ منوی ☰: ${mb.ok ? 'پیش‌فرض (باز کردن لیست دستورات) ✅' : '❌ ' + mb.description}`);
  const prof = [
    await api(NEW, 'setMyShortDescription', { short_description: 'مدیریت امنیت و قفل کانال‌های تلگرام', language_code: 'fa' }),
    await api(NEW, 'setMyShortDescription', { short_description: 'Telegram channel guard: locks, auto-moderation & admin tools' }),
    await api(NEW, 'setMyDescription', { description: 'ربات ضد خیانت: قفل آنی و زمان‌دار، حذف خودکار تخلف‌ها، گزارش به ادمین‌ها، ارسال پیام و همگانی و مدیریت ادمین‌ها — همه از یک پنل ساده.', language_code: 'fa' }),
    await api(NEW, 'setMyDescription', { description: 'Anti-Treason Bot: instant & scheduled locks, violation auto-deletion, reports to admins, broadcasts and channel-admin management — all from one simple panel.' }),
  ];
  out.push(`   توضیحات پروفایل (fa/en): ${prof.every((r) => r.ok) ? 'ثبت شد ✅' : '⚠️ بخشی ناموفق'}`);

  /* ── ۳) وضعیت وب‌هوک ربات جدید ── */
  const wh = (await api(NEW, 'getWebhookInfo', {})).result || {};
  out.push(`۳) وب‌هوک ربات جدید: ${wh.url ? 'وصل ✅' : '❌ وصل نیست!'} (pending=${wh.pending_update_count ?? 0}${wh.last_error_message ? '، last_error=' + wh.last_error_message : ''})`);

  /* ── ۴) کانال‌های ثبت‌شده + دسترسی هر دو ربات ── */
  const chs = [];
  if (CF) {
    if (!CF_ACC) {
      const al = await jget('https://api.cloudflare.com/client/v4/accounts');
      CF_ACC = al && al.success && al.result && al.result[0] ? al.result[0].id : '';
    }
    if (CF_ACC) {
      const nsl = await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces`);
      const ns = nsl && nsl.success ? (nsl.result || []).find((n) => n.title === 'anti-treason-kv') : null;
      if (ns) {
        const kl = await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${ns.id}/keys?limit=1000&prefix=chat:`);
        for (const k of (kl && kl.result) || []) {
          const v = await jget(`https://api.cloudflare.com/client/v4/accounts/${CF_ACC}/storage/kv/namespaces/${ns.id}/values/${encodeURIComponent(k.name)}`);
          if (v) chs.push({ cid: k.name.slice('chat:'.length), ...v });
        }
      } else out.push('⚠️ فضای KV «anti-treason-kv» پیدا نشد');
    } else out.push('⚠️ شناسهٔ اکانت کلادفلر کشف نشد — CLOUDFLARE_ACCOUNT_ID را بده');
  } else out.push('⚠️ CLOUDFLARE_API_TOKEN داده نشد — چک دسترسی کانال‌ها رد شد');

  const member = async (tok, botId, cid) => {
    const r = await api(tok, 'getChatMember', { chat_id: cid, user_id: botId });
    return r.ok ? r.result : { status: 'error: ' + (r.description || 'نامشخص') };
  };
  const rows = [];
  for (const c of chs) {
    const nM = await member(NEW, me.id, c.cid);
    const oM = oldMe ? await member(OLD, oldMe.id, c.cid) : { status: '—' };
    rows.push({ c, nM, oM });
  }
  for (const { c, nM, oM } of rows) {
    const t = c.title || c.username || c.cid;
    let line = `   📺 ${t}\n      ربات جدید: `;
    if (nM.status === 'administrator') {
      line += `ادمین ✅ (حذف:${nM.can_delete_messages ? '✅' : '❌'} ارسال:${nM.can_post_messages ? '✅' : '❌'} بن:${nM.can_restrict_members ? '✅' : '❌'} ادمین‌سازی:${nM.can_promote_members ? '✅' : '❌'})`;
    } else if (nM.status === 'member' || nM.status === 'restricted' || nM.status === 'left' || nM.status === 'kicked') {
      line += `ادمین نیست ⚠️ (${nM.status})`;
    } else line += nM.status;
    line += `\n      ربات قبلی: ${oM.status === 'administrator' ? 'هنوز ادمین ✅ (برای عزل‌ها نگه داشته شد)' : oM.status}`;
    out.push('۴) دسترسی کانال‌ها:\n' + line);
  }
  if (!rows.length) out.push('۴) هیچ کانالی از KV خوانده نشد');

  /* ── ۵) اعلان به مالک از ربات جدید ── */
  const need = rows.filter(({ nM }) => nM.status !== 'administrator');
  const needTxt = need.length
    ? `\n\n⚠️ <b>یک کار مونده با خودت:</b>\nربات جدید رو تو این کانال‌ها <b>ادمین</b> کن (حداقل با دسترسی «حذف پیام»؛ برای بن: «مسدود کردن کاربران»؛ برای ادمین‌سازی: «افزودن مدیرهای جدید»):\n` +
      need.map(({ c }) => `• ${esc(c.title || c.username || c.cid)}`).join('\n') +
      `\n\nتا وقتی ادمینش نکنی، قفل‌ها و گزارش‌ها تو اون کانال‌ها کار نمی‌کنن.`
    : `\n\n✅ ربات جدید تو همهٔ کانال‌ها ادمینه — هیچ کاری لازم نیست.`;
  const txt =
    `✅ <b>ربات جدید فعال شد</b> — از این به بعد بات اصلی همینه: @${me.username}\n\n` +
    `<b>چیزایی که دست نخورد:</b>\n• اونر، ادمین‌ها، ناظرها، تنظیمات و آمار — عین قبلیه (دیتابیس عوض نشد)\n• اعلان قفل‌ها و برنامهٔ زمان‌دار همهٔ کانال‌ها سر جاشه\n\n` +
    `<b>چیزای جدید:</b>\n• دکمهٔ ☰ کنار کیبورد حالا مثل BotFather لیست دستورات رو باز می‌کنه (فقط /start)\n` +
    `• فلوهای «افزودن ادمین»، «ادمین‌سازی کانال»، «ارسال پیام/همگانی» و «حذف پیام‌های اخیر» راهنمای گام‌به‌گام با دکمهٔ لغو گرفتن\n` +
    `• بعد از ثبت هر ادمین، اسم و منشنش هم نشون داده می‌شه\n\n` +
    `<b>دربارهٔ ربات قبلی (${oldMe ? '@' + oldMe.username : 'بات قبلی'}):</b>\n` +
    `• خاموشش کردم ولی توکنش داخل ورکر نگه داشته شده (Secret با نام LEGACY_BOT_TOKEN)\n` +
    `• ادمین‌هایی که اون تو کانال ساخته بود فقط با خودش قابل عزل‌اند — پس دکمهٔ «عزل» اگه با ربات جدید ممکن نشه، خودکار با ربات قبلی انجام می‌شه\n` +
    `• خود ربات قبلی هم هنوز ادمین کانال‌هاست — عزلش نکن` +
    needTxt;
  const sn = await api(NEW, 'sendMessage', { chat_id: OWNER, text: txt, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  out.push(`۵) اعلان به مالک از ربات جدید: ${sn.ok ? 'ارسال شد ✅' : '❌ ' + sn.description}`);

  console.log(out.join('\n'));
})();
