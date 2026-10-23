/* ============================================================================
 *  تست خودکار ربات ضد خیانت — شبیه‌سازی کامل تلگرام + KV در حافظه
 *  اجرا:  node scripts/test-bot.mjs
 * ==========================================================================*/

let workerMod;
try { workerMod = await import('../download/anti-treason-bot/worker.js'); }
catch { workerMod = await import('../worker.js'); } // وقتی تست داخل پکیج کپی می‌شود
const worker = workerMod.default;

/* ---------------------------- Mock ها ---------------------------- */

class MockKV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
    return { keys, list_complete: true, cursor: '' };
  }
  dump() { return Object.fromEntries(this.m); }
}

let tgCalls = [];
const realFetch = globalThis.fetch;
/* v1.7 — رفتار قابل‌تنظیم mock برای تست وضعیت قرمز + ادمین‌سازی کانال */
const BOTID = 424242;
const mockB = {
  botCanPromote: true, botCanRestrict: true, botCanDelete: true,
  admins: null,            // آرایهٔ result برای getChatAdministrators (null ⇒ [])
  memberOf: {},            // user_id → ChatMember (برای getChatMember غیر-بات)
  chatInfo: {},            // v2.2: chat_id عددی → پروفایل کاربر (برای نام/منشن getUserInfo)
  failPromoteFor: [], failBanFor: [],
};
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/bot')) {
    const method = u.split('/').pop();
    let payload = {};
    try { payload = JSON.parse(init.body); } catch (e) { /* ignore */ }
    const mTok = u.match(/^https:\/\/api\.telegram\.org\/bot([^\/]+)\//);
    tgCalls.push({ method, payload, tok: mTok ? mTok[1] : '' });
    const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
    // v1.7: getMe واقعی (برای botInfo/me.id)
    if (method === 'getMe') {
      return J({ ok: true, result: { id: BOTID, is_bot: true, first_name: 'TestBot', username: 'test_bot' } });
    }
    // شبیه‌سازی خطای تلگرام برای کاربرِ حذف‌شده در تست سلامت
    if (method === 'getChatMember' && payload.chat_id === '-1009999') {
      return J({ ok: false, description: 'bot is not a member' }, 400);
    }
    // v1.7: عضویت خودِ ربات — با دسترسی‌های قابل‌تنظیم
    if (method === 'getChatMember' && payload.user_id === BOTID) {
      return J({
        ok: true,
        result: {
          status: 'administrator', user: { id: BOTID, is_bot: true, first_name: 'TestBot' },
          can_delete_messages: mockB.botCanDelete, can_post_messages: true,
          can_edit_messages: false, can_change_information: false,
          can_promote_members: mockB.botCanPromote, can_restrict_members: mockB.botCanRestrict,
          is_anonymous: false,
        },
      });
    }
    // v1.7: عضویت سایر کاربران
    if (method === 'getChatMember') {
      const ov = mockB.memberOf[payload.user_id];
      return J({ ok: true, result: ov || { status: 'member', user: { id: payload.user_id, first_name: 'U' + payload.user_id } } });
    }
    // v1.7: فهرست ادمین‌های کانال
    if (method === 'getChatAdministrators') {
      return J({ ok: true, result: mockB.admins || [] });
    }
    // v1.7: رزولوشن @یوزرنیم برای افزودن ادمین کانال
    if (method === 'getChat' && typeof payload.chat_id === 'string' && payload.chat_id.startsWith('@')) {
      return J({ ok: true, result: { id: 777888, type: 'private', first_name: 'Resolved', username: payload.chat_id.slice(1) } });
    }
    // v2.2: getChat عددی — پروفایل کاربر شناخته‌شده (نام/منشن)؛ نامعلوم ⇒ همان پاسخ عمومی قبلی
    if (method === 'getChat' && !String(payload.chat_id).startsWith('@')) {
      const ci = (mockB.chatInfo || {})[String(payload.chat_id)];
      if (ci) return J({ ok: true, result: ci });
    }
    // v1.7: خطاهای ارتقا/بن برای کاربران خاص (مثلاً مالک کانال)
    if (method === 'promoteChatMember' && mTok && mTok[1] === 'TESTTOKEN' && mockB.failPromoteFor.includes(Number(payload.user_id))) {
      return J({ ok: false, description: 'Bad Request: user is an administrator of the chat' }, 400);
    }
    if (method === 'banChatMember' && mockB.failBanFor.includes(Number(payload.user_id))) {
      return J({ ok: false, description: 'Bad Request: user is an administrator of the chat' }, 400);
    }
    // شبیه‌سازی محدودیت ۴۸ ساعتهٔ تلگرام برای حذف پیام خیلی قدیمی
    if (method === 'deleteMessage' && payload.message_id === 777777) {
      return J({ ok: false, description: "Bad Request: message can't be deleted" }, 400);
    }
    return J({
      ok: true,
      result: {
        message_id: 5000 + tgCalls.length,
        status: 'administrator',
        can_delete_messages: true,
        can_post_messages: true,
        can_edit_messages: false,
        can_change_information: false,
      },
    });
  }
  return realFetch(url, init);
};

/* ---------------------------- زیرساخت تست ---------------------------- */

const SECRET = 'S3CRET_test';
const OWNER = 111, ADMIN = 22222, STRANGER = 999;
const CID = '-1001001';
const env = { BOT_TOKEN: 'TESTTOKEN', WEBHOOK_SECRET: SECRET, KV: new MockKV(), FLUSH_MS: '30',
  MIN_FLUSH_GAP_MS: '0', REPORT_WINDOW_MS: '0' }; // در بیشتر تست‌ها: فلاش/گزارش بی‌تاخیر (رفتار v1.4)
const wu = [];
const ctx = { waitUntil(p) { wu.push(Promise.resolve(p).catch(() => {})); } };
async function drain() { let guard = 0; while (wu.length && guard++ < 50) await Promise.all(wu.splice(0)); }

let updId = 1;
function upd(update) { return { update_id: updId++, ...update }; }

async function post(update, secret = SECRET) {
  const res = await worker.fetch(new Request('https://w.example/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify(update),
  }), env, ctx);
  await drain();
  return res;
}
/** بدون drain — برای تست‌های هم‌زمانی (موج تخلف) */
const rawPost = (update, secret = SECRET) => worker.fetch(new Request('https://w.example/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
  body: JSON.stringify(update),
}), env, ctx);

/** تضمین وضعیت قفل بدون toggle کورکورانه (در برابر وضعیت به‌جامانده مقاوم است) */
async function setLock(key, on, user = OWNER) {
  const s = JSON.parse(await env.KV.get('chat:' + CID));
  if (!!s.locks[key] !== on) await post(cbQuery(`tgl:${key}:${CID}`, user));
}
/** تضمین وضعیت قفل زمان‌دار */
async function setSched(on, user = OWNER) {
  const s = JSON.parse(await env.KV.get('chat:' + CID));
  if (!!s.schedule.enabled !== on) await post(cbQuery(`schT:${CID}`, user));
}

const cbQuery = (data, user) => upd({
  callback_query: {
    id: 'cb' + updId, from: { id: user, first_name: 'U' + user }, data,
    message: { message_id: 77, chat: { id: user, type: 'private' } },
  },
});
const priv = (text, user) => upd({
  message: { message_id: 88 + updId, chat: { id: user, type: 'private' }, from: { id: user, first_name: 'U' + user }, text },
});
const chan = (extra, cid = CID) => upd({
  channel_post: { message_id: 200 + updId, chat: { id: Number(cid), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), ...extra },
});
const chanEdit = (extra, cid = CID) => upd({
  edited_channel_post: { message_id: 300 + updId, chat: { id: Number(cid), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), edit_date: Math.floor(realNow() / 1000), ...extra },
});

const calls = (m) => tgCalls.filter((c) => c.method === m);
const delCalls = () => calls('deleteMessage');
const clearCalls = () => { tgCalls = []; };
const lastText = () => { const s = calls('sendMessage'); return s.length ? s[s.length - 1].payload.text : ''; };
const lastEdited = () => { const e = calls('editMessageText'); return e.length ? e[e.length - 1].payload.text : ''; };
const lastEditedKB = () => { const e = calls('editMessageText'); return (e.length && e[e.length - 1].payload.reply_markup) || {}; };
const lastAnswer = () => { const a = calls('answerCallbackQuery'); return a.length ? a[a.length - 1].payload.text || '' : ''; };

/* ---- کنترل زمان تهران ---- */
const realNow = Date.now;
function freezeTehran(h, m) {
  // تهران = UTC+3:30 → Date.UTC خودش مقادیر سرریزشده رو نرمال می‌کنه
  const t = Date.UTC(2025, 0, 15, h - 3, m - 30);
  Date.now = () => t;
  return t;
}
function unfreeze() { Date.now = realNow; }

/* ---- شمارنده نتایج ---- */
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('   ✅ ' + name); }
  else { fail++; console.log('   ❌ ' + name); }
}
async function section(title, fn) {
  console.log('\n🧪 ' + title);
  clearCalls();
  try { await fn(); } catch (e) { fail++; console.log('   💥 EXCEPTION: ' + (e && e.stack || e)); }
}

/* ==========================================================================*/

console.log('🛡️  تست ربات ضد خیانت\n');

await section('امنیت وب‌هوک', async () => {
  const r1 = await post(upd({ message: null }), 'WRONG_SECRET');
  ok(r1.status === 403, 'سکرت اشتباه → 403');
  const r2 = await worker.fetch(new Request('https://w.example/', { method: 'GET' }), env, ctx);
  ok(r2.status === 200, 'GET → پیام وضعیت 200');
});

await section('شروع و مالک‌شدن (/start)', async () => {
  await post(priv('/start', OWNER));
  ok(lastText().includes('مالک'), 'اولین کاربر مالک شد');
  ok((await env.KV.get('owner')) === String(OWNER), 'مالک در KV ذخیره شد');
  await post(priv('/start', STRANGER));
  ok(lastText().includes('دسترسی ندارید'), 'غریبه → دسترسی ندارید');
});

await section('ثبت خودکار کانال + تأیید مالک (چندکاناله)', async () => {
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID), type: 'channel', title: 'تست کانال', username: 'testchan' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  ok((await env.KV.get('chat:' + CID)) !== null, 'کانال در KV ثبت شد');
  ok(lastText().includes('ادمین شد'), 'به مالک اطلاع داده شد');
  ok(lastText().includes('فعال'), 'درخواست فعال‌سازی از مالک شد');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).active === false, 'کانال جدید = در انتظار تأیید مالک');
  // تا قبل از تأیید، حتی با قفل کامل هم هیچ اجرایی نباید داشته باشد:
  await post(cbQuery('all:1:' + CID, OWNER));
  await post(chan({ text: 'پست در کانال تأییدنشده' }));
  ok(delCalls().length === 0, 'کانال غیرفعال ⇒ هیچ حذفی حتی با قفل کامل');
  await post(cbQuery('all:0:' + CID, OWNER));
  // حالا مالک فعال می‌کند:
  await post(cbQuery('enb:' + CID, OWNER));
  ok(JSON.parse(await env.KV.get('chat:' + CID)).active === true, 'مالک کانال را فعال کرد');
});

await section('بدون قفل ⇒ هیچ حذفی', async () => {
  await post(chan({ text: 'پست عادی' }));
  ok(delCalls().length === 0, 'پست متنی حذف نشد');
  await post(chan({ photo: [{ file_id: 'x' }], caption: 'عکس' }));
  ok(delCalls().length === 0, 'پست عکس حذف نشد');
});

await section('قفل ادیت متن — تازه حذف می‌شود؛ قدیمیِ >۴۸h بدون درخواستِ بی‌فایده گزارش می‌شود', async () => {
  await post(cbQuery('tgl:edit_text:' + CID, OWNER));
  ok(lastAnswer().includes('فعال شد'), 'پاسخ فعال‌سازی قفل');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).locks.edit_text === true, 'قفل در KV روشن شد');
  // ادیتِ پیامِ تازه (همین الان) ⇒ درخواست حذف باید برود
  await post(upd({
    edited_channel_post: {
      message_id: 50, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      date: Math.floor(realNow() / 1000), edit_date: Math.floor(realNow() / 1000), text: 'متن ادیت‌شده',
    },
  }));
  const d = delCalls();
  ok(d.length === 1 && d[0].payload.message_id === 50, 'ادیت پیام تازه → فوراً حذف شد');
  ok(lastText().includes('تخلف حذف شد'), 'لاگ تخلف به پیوی مالک رفت');
  ok(lastText().includes('قفل ادیت متن'), 'دلیل درست لاگ شد');
  // ادیتِ پیام ۳ روز پیش ⇒ حذف قطعاً ناممکن است؛ ربات بدون درخواستِ بی‌فایده همان گزارش دقیق را می‌دهد (v1.5)
  const threeDaysAgo = Math.floor(realNow() / 1000) - 3 * 86400;
  await post(upd({
    edited_channel_post: {
      message_id: 51, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      date: threeDaysAgo, edit_date: Math.floor(realNow() / 1000), text: 'متن ادیت‌شدهٔ قدیمی',
    },
  }));
  ok(delCalls().length === 1, 'پیام قدیمی‌تر از ۴۸h → بدون درخواست حذفِ محکوم‌به‌شکست (بهینه‌سازی)');
  ok(lastText().includes('۴۸ ساعت'), 'گزارش دقیق محدودیت ۴۸ ساعتهٔ تلگرام');
  ok(lastText().includes('دستی حذفش کن'), 'راهنمای حذف دستی در گزارش');
  ok(lastText().includes('https://t.me/testchan/51'), 'لینک پیام قدیمی در گزارش');
});

await section('خاموش‌کردن قفل ادیت ⇒ بدون حذف', async () => {
  await post(cbQuery('tgl:edit_text:' + CID, OWNER));
  ok(lastAnswer().includes('آزاد شد'), 'پاسخ آزادسازی');
  await post(chanEdit({ text: 'ادیت آزاد' }));
  ok(delCalls().length === 0, 'ادیت حذف نشد');
});

await section('قفل ادیت مدیا (کپشن)', async () => {
  await post(cbQuery('tgl:edit_media:' + CID, OWNER));
  await post(chanEdit({ photo: [{ file_id: 'x' }], caption: 'کپشن جدید' }));
  ok(delCalls().some((c) => c.payload.message_id === delCalls()[delCalls().length - 1].payload.message_id) && delCalls().length === 1, 'ادیت کپشن عکس حذف شد');
  await post(chanEdit({ text: 'ادیت متنی' }));
  ok(delCalls().length === 1, 'ادیت متنی حذف نشد (ادیت متن خاموش)');
  await post(cbQuery('tgl:edit_media:' + CID, OWNER));
});

await section('قفل لینک در ادیت', async () => {
  await post(cbQuery('tgl:edit_link:' + CID, OWNER));
  await post(chanEdit({ text: 'تبلیغ تازه https://example.com/ad' }));
  ok(delCalls().length === 1, 'ادیت حاوی لینک حذف شد');
  await post(chanEdit({ text: 'ادیت بدون لینک' }));
  ok(delCalls().length === 1, 'ادیت بدون لینک حذف نشد');
  await post(cbQuery('tgl:edit_link:' + CID, OWNER));
});

await section('قفل‌های ارسال: گیف، استیکر، فوروارد، لینک', async () => {
  await post(cbQuery('tgl:send_gif:' + CID, OWNER));
  await post(chan({ animation: { file_id: 'g' } }));
  ok(delCalls().length === 1, 'گیف حذف شد');
  await post(chan({ sticker: { file_id: 's', is_animated: true } }));
  ok(delCalls().length === 1, 'استیکر (با قفل خاموش) حذف نشد');
  await post(cbQuery('tgl:send_sticker:' + CID, OWNER));
  await post(chan({ sticker: { file_id: 's2' } }));
  ok(delCalls().length === 2, 'استیکر حذف شد');
  await post(cbQuery('tgl:send_forward:' + CID, OWNER));
  await post(chan({ text: 'فوروارد', forward_origin: { type: 'user', sender_user: { id: 5 } } }));
  ok(delCalls().length === 3, 'فوروارد حذف شد');
  await post(cbQuery('tgl:send_link:' + CID, OWNER));
  await post(chan({ text: 'کانال ما', entities: [{ type: 'text_link', url: 'https://t.me/x', offset: 0, length: 8 }] }));
  ok(delCalls().length === 4, 'پست لینک‌دار (entity) حذف شد');
  await post(chan({ text: 'لینک خام: t.me/mychannel' }));
  ok(delCalls().length === 5, 'پست لینک‌دار (regex) حذف شد');
  await post(chan({ text: 'متن ساده بدون لینک' }));
  ok(delCalls().length === 5, 'متن ساده حذف نشد');
  await post(cbQuery('tgl:send_vnote:' + CID, OWNER));
  await post(chan({ video_note: { file_id: 'vn' } }));
  ok(delCalls().length === 6, 'ویدیو نوت حذف شد (نگاشت video_note→send_vnote)');
});

await section('قفل کامل (master)', async () => {
  await post(cbQuery('all:1:' + CID, OWNER));
  await post(chan({ photo: [{ file_id: 'p' }], caption: 'هرچی' }));
  ok(delCalls().length === 1, 'با قفل کامل، عکس حذف شد (send_photo خاموش بود)');
  await post(chanEdit({ text: 'ادیت در قفل کامل' }));
  ok(delCalls().length === 2, 'با قفل کامل، ادیت هم حذف شد');
  const st = JSON.parse(await env.KV.get('stat:' + CID));
  ok(st.total >= 2, 'آمار تخلفات ثبت شد (' + st.total + ')');
  await post(cbQuery('all:0:' + CID, OWNER));
  await post(chan({ text: 'پست بعد از آزادسازی' }));
  ok(delCalls().length === 2, 'بعد از آزادسازی همه، حذفی نیست');
});

await section('قفل آنی (دستی) — حذف فوری همه‌چیز تا باز کردن', async () => {
  await post(cbQuery('instT:' + CID, OWNER));
  ok(lastAnswer().includes('قفل آنی فعال شد'), 'فعال‌سازی قفل آنی');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).instant.on === true, 'instant.on در KV ذخیره شد');
  await post(chan({ text: 'پست متنی در قفل آنی' }));
  ok(delCalls().length === 1, 'پست متنی فوراً حذف شد');
  await post(chan({ photo: [{ file_id: 'p' }], caption: 'عکس در قفل آنی' }));
  ok(delCalls().length === 2, 'پست عکس فوراً حذف شد');
  await post(chanEdit({ text: 'ادیت در قفل آنی' }));
  ok(delCalls().length === 3, 'ادیت هم فوراً حذف شد');
  ok(lastText().includes('قفل آنی'), 'دلیل در لاگ مالک = قفل آنی');
  await post(chan({ new_chat_title: 'اسم تازه کانال' }));
  ok(delCalls().length === 3, 'پیام سیستمی (تغییر نام) حذف نشد');
  await post(cbQuery('chat:' + CID, OWNER));
  ok(lastEdited().includes('قفل آنی'), 'وضعیت قفل آنی در پنل کانال دیده می‌شود');
  await post(cbQuery('instT:' + CID, OWNER));
  ok(lastAnswer().includes('باز شد'), 'بازکردن قفل آنی');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).instant.on === false, 'instant.on خاموش شد');
  await post(chan({ text: 'پست بعد از باز کردن' }));
  ok(delCalls().length === 3, 'بعد از باز کردن، حذفی نیست');
});

await section('قفل زمان‌دار — بازه روزانه ۰۴:۰۰ تا ۲۰:۰۰', async () => {
  await post(cbQuery('schT:' + CID, OWNER));
  ok(lastAnswer().includes('فعال شد'), 'قفل زمان‌دار فعال شد');
  freezeTehran(10, 0); // ساعت ۱۰ صبح تهران → داخل بازه
  await post(chan({ text: 'پست در بازه' }));
  ok(delCalls().length === 1 && lastText().includes('قفل زمان‌دار'), 'داخل بازه → حذف + دلیل درست');
  freezeTehran(22, 0); // ۲۲ شب → بیرون بازه
  await post(chan({ text: 'پست بیرون بازه' }));
  ok(delCalls().length === 1, 'بیرون بازه → بدون حذف');
});

await section('قفل زمان‌دار — بازه شبانه ۲۲:۰۰ تا ۰۶:۰۰ + حالت‌ها', async () => {
  await post(cbQuery('schS:' + CID, OWNER));
  ok(lastAnswer().includes('شروع'), 'پرسش ساعت شروع');
  await post(priv('۲۲:۰۰', OWNER)); // ارقام فارسی!
  ok(lastEdited().includes('22:00') || lastText().includes('22:00'), 'ساعت شروع با رقم فارسی ثبت شد');
  await post(cbQuery('schE:' + CID, OWNER));
  await post(priv('6:00', OWNER));
  freezeTehran(23, 30);
  await post(chan({ text: '۱۱:۳۰ شب' }));
  ok(delCalls().length === 1, '۲۳:۳۰ → داخل بازه شبانه → حذف');
  freezeTehran(3, 0);
  await post(chan({ text: '۳ بامداد' }));
  ok(delCalls().length === 2, '۰۳:۰۰ → داخل بازه (عبور از نیمه‌شب) → حذف');
  freezeTehran(12, 0);
  await post(chan({ text: '۱۲ ظهر' }));
  ok(delCalls().length === 2, '۱۲ ظهر → بیرون بازه → آزاد');
  // حالت فقط ادیت
  await post(cbQuery('schM:' + CID, OWNER)); // all → send
  await post(cbQuery('schM:' + CID, OWNER)); // send → edit
  await post(chan({ text: 'ارسال با حالت فقط-ادیت' }));
  ok(delCalls().length === 2, 'حالت فقط-ادیت ⇒ ارسال آزاد');
  freezeTehran(23, 30); // برگشت به داخل بازه برای تست ادیت
  await post(chanEdit({ text: 'ادیت با حالت فقط-ادیت' }));
  ok(delCalls().length === 3, 'حالت فقط-ادیت ⇒ ادیت حذف شد');
  await post(cbQuery('schM:' + CID, OWNER)); // edit → all
  await post(cbQuery('schT:' + CID, OWNER)); // خاموش
  unfreeze();
});

await section('ورودی ساعت نامعتبر', async () => {
  await post(cbQuery('schS:' + CID, OWNER));
  await post(priv('سلام فردا', OWNER));
  ok(lastText().includes('فرمت ساعت اشتباهه'), 'پیام خطای فرمت');
  await post(priv('25:00', OWNER));
  ok(lastText().includes('فرمت ساعت اشتباهه'), 'ساعت ۲۵ رد شد');
  await post(priv('8:15', OWNER));
  ok((lastText() + lastEdited()).includes('08:15'), 'ساعت درست ثبت شد');
  await setSched(false); // خاموش تضمینی (قبلاً toggle کورکورانه بود و اگر خاموش بود روشنش می‌کرد!)
});

await section('مدیریت ادمین‌ها (فقط مالک)', async () => {
  await post(cbQuery('tgl:send_text:' + CID, STRANGER));
  ok(lastAnswer().includes('دسترسی ندارید'), 'غریبه روی دکمه → رد شد');
  await post(cbQuery('admins', STRANGER));
  ok(lastAnswer().includes('دسترسی ندارید'), 'منوی ادمین‌ها برای غیرمالک بسته است');
  await post(cbQuery('admins', OWNER));
  ok(lastEdited().includes('ادمین‌های ربات'), 'منوی ادمین‌ها باز شد');
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  ok(lastText().includes('ادمین اضافه شد'), 'ادمین ۲۲۲ اضافه شد');
  ok(JSON.parse(await env.KV.get('admins')).includes(String(ADMIN)), 'ادمین در KV');
  // 📡 v2.0: ادمین تازه بدون هیچ کانالی ثبت می‌شود و ویرایشگر دسترسی خودکار باز می‌شود
  ok(lastText().includes('هیچ کانالی'), 'ویرایشگر دسترسی با دامنهٔ خالی باز شد (امن پیش‌فرض)');
  ok(JSON.parse(await env.KV.get('scopes')).a[String(ADMIN)].ch.length === 0, 'scope خالی در KV ثبت شد');
  await post(cbQuery('ascT:' + ADMIN + ':' + CID, OWNER));
  ok(lastAnswer().includes('داده شد'), 'مالک کانال را به ادمین داد');
  await post(cbQuery('tgl:send_text:' + CID, ADMIN));
  ok(lastAnswer().includes('فعال شد'), 'ادمین تازه توانست قفل بزند');
  await post(cbQuery('admD:' + ADMIN, OWNER));
  ok(JSON.parse((await env.KV.get('admins')) || '[]').length === 0, 'ادمین حذف شد');
  await post(cbQuery('tgl:send_text:' + CID, ADMIN));
  ok(lastAnswer().includes('دسترسی ندارید'), 'بعد از حذف، دسترسی قطع شد');
  await post(cbQuery('tgl:send_text:' + CID, OWNER)); // برگردون
});

await section('گزارش تخلف به پیوی ادمین‌ها + محدودیت ۴۸ ساعتهٔ تلگرام', async () => {
  // ادمین را دوباره اضافه کن (بخش قبل حذفش کرده بود) + 📡 کانالش را تعیین کن
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  ok(lastText().includes('ادمین اضافه شد'), 'ادمین دوباره اضافه شد');
  await post(cbQuery('ascT:' + ADMIN + ':' + CID, OWNER));
  ok(lastAnswer().includes('داده شد'), 'کانال به ادمین داده شد (گزارش باید برسد)');
  // send_text تضمینی روشن می‌شود ⇒ تخلف، باید به مالک و ادمین هر دو برسد
  await setLock('send_text', true);
  await post(chan({ text: 'پست متنی برای تست لاگ ادمین' }));
  ok(calls('sendMessage').some((c) => String(c.payload.chat_id) === String(ADMIN)), 'گزارش تخلف به پیوی ادمین هم ارسال شد');
  // محدودیت ۴۸ ساعت: ادیت پیام خیلی قدیمی (id=777777) ⇒ حذف ممکن نیست ولی پیام باید دقیق باشد
  await setLock('send_text', false); // خاموش تا تداخل نکند
  await setLock('edit_text', true);
  const fiveDaysAgo = Math.floor(realNow() / 1000) - 5 * 86400;
  await post(upd({
    edited_channel_post: {
      message_id: 777777, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      date: fiveDaysAgo, edit_date: Math.floor(realNow() / 1000), text: 'ادیت پیام خیلی قدیمی',
    },
  }));
  ok(delCalls().length === 1, 'پیام قدیمی‌تر از ۴۸h → بدون درخواست حذفِ تازه (قبلاً ۱ حذف از پست send_text)');
  ok(lastText().includes('۴۸ ساعت'), 'دلیل درست: محدودیت ۴۸ ساعتهٔ تلگرام');
  ok(!lastText().includes('حذف ناموفق بود'), 'پیام گمراه‌کنندهٔ «دسترسی نداری» نمایش داده نشد');
  ok(lastText().includes('https://t.me/testchan/777777'), 'لینک پیام حذف‌نشده در گزارش ۴۸ ساعته (t.me/testchan/777777)');
  ok(lastText().includes('دستی حذفش کن'), 'راهنمای حذف دستی توسط ادمینِ انسانی در گزارش');
  const st48 = JSON.parse(await env.KV.get('stat:' + CID));
  ok(st48.total > 0, 'ادیت پیام قدیمی در آمار هم ثبت شد');
  await setLock('edit_text', false);
  await post(cbQuery('admD:' + ADMIN, OWNER)); // پاک‌سازی ادمین
});

await section('یوزربات — صف حذف با اکانت (ثبت، ضدتکرار، poll، نتیجه)', async () => {
  // الف) بعد از ادیتِ پیامِ خیلی قدیمیِ بخش قبل، صف باید پر باشد
  let jobs = JSON.parse((await env.KV.get('ub:jobs')) || '[]');
  ok(Array.isArray(jobs) && jobs.some((j) => j.c === CID && j.m === 777777), 'پیام >۴۸h در صف حذف با اکانت ثبت شد');
  // ب) ضدتکرار: همان پیام دوباره ⇒ صف همچنان یک ورودی
  const fiveDaysAgo2 = Math.floor(realNow() / 1000) - 5 * 86400;
  await post(upd({
    edited_channel_post: {
      message_id: 777777, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      date: fiveDaysAgo2, edit_date: Math.floor(realNow() / 1000), text: 'ادیت دوبارهٔ خیلی قدیمی',
    },
  }));
  jobs = JSON.parse((await env.KV.get('ub:jobs')) || '[]');
  ok(jobs.filter((j) => j.c === CID && j.m === 777777).length === 1, 'ضدتکرار: همان پیام دوباره در صف نمی‌رود');
  // ج) پستِ تازه (حذف موفق) نباید در صف برود
  await setLock('send_text', true);
  await post(chan({ text: 'پست تازه برای تست صف' })); // حذف موفق ⇒ بدون صف
  jobs = JSON.parse((await env.KV.get('ub:jobs')) || '[]');
  // ۵۱ = ادیتِ ۳ روز پیش از بخش قفل ادیت متن — آن هم درست و حساب‌شده در صف است
  ok(jobs.length === 2 && jobs.every((j) => j.m === 51 || j.m === 777777), 'پست تازهٔ حذف‌شدنی در صف نمی‌رود (فقط قدیمی‌ها: ۵۱ و ۷۷۷۷)');
  await setLock('send_text', false);
  // د) poll با سکرت اشتباه → 403
  const rBad = await worker.fetch(new Request('https://w.example/?ub=poll&secret=WRONG'), env, ctx);
  ok(rBad.status === 403, 'poll با سکرت اشتباه → 403');
  // ه) poll درست ⇒ صف تحویل و خالی می‌شود
  const rPoll = await worker.fetch(new Request('https://w.example/?ub=poll&secret=' + encodeURIComponent(SECRET)), env, ctx);
  const pj = await rPoll.json();
  ok(rPoll.status === 200 && Array.isArray(pj.jobs) && pj.jobs.length === 2 && pj.jobs.some((j) => j.m === 777777), 'poll درست → کل صف (۲ مورد) تحویل شد');
  ok((await env.KV.get('ub:jobs')) === null, 'بعد از poll، صف خالی شد');
  // و) نتیجهٔ یوزربات ⇒ گزارش به مالک + علامت در لاگ تخلف‌ها
  clearCalls();
  const rRes = await worker.fetch(new Request('https://w.example/?ub=result&secret=' + encodeURIComponent(SECRET), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, results: [{ i: pj.jobs[0].i, c: CID, m: 777777, ok: true, err: '' }] }),
  }), env, ctx);
  await drain();
  ok(rRes.status === 200, 'نتیجهٔ یوزربات پذیرفته شد');
  ok(lastText().includes('حذف با اکانت'), 'گزارش «حذف با اکانت: موفق» به مالک رفت');
  const statNow = JSON.parse(await env.KV.get('stat:' + CID));
  const entry = (statNow.vlog || []).find((v) => v.mid === 777777);
  ok(entry && entry.ok === 1 && entry.ub === 1, 'ورودی «آخرین تخلف‌ها» به «حذف‌شده با اکانت» تغییر کرد');
  // ز) نتیجهٔ ناموفق هم با جزئیات گزارش می‌شود
  clearCalls();
  await worker.fetch(new Request('https://w.example/?ub=result&secret=' + encodeURIComponent(SECRET), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, results: [{ i: 'z2', c: CID, m: 424242, ok: false, err: 'test error' }] }),
  }), env, ctx);
  await drain();
  ok(lastText().includes('ناموفق') && lastText().includes('test error'), 'نتیجهٔ ناموفق یوزربات هم با جزئیات گزارش شد');
});

await section('v2.0 — چندکاناله: فعال‌سازی کانال دوم، اجرای همزمان، رد کردن', async () => {
  const CID2 = '-1002002';
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID2), type: 'channel', title: 'کانال دوم' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  ok(JSON.parse(await env.KV.get('chat:' + CID2)).active === false, 'کانال دوم منتظر تأیید');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).active === true, 'کانال اول همچنان فعال');
  await post(cbQuery('enb:' + CID2, OWNER));
  ok(JSON.parse(await env.KV.get('chat:' + CID2)).active === true, 'کانال دوم فعال شد');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).active === true, 'کانال اول هم فعال ماند (چندکاناله — دیگر غیرفعال نمی‌شود)');
  // هر دو کانال همزمان تحت پوشش‌اند:
  await post(cbQuery('tgl:send_text:' + CID2, OWNER));
  await post(chan({ text: 'پست متنی در کانال اول (بدون قفل)' }));
  ok(delCalls().length === 0, 'کانال اول: بدون قفل، هیچ حذفی');
  await post(chan({ text: 'پست متنی در کانال دوم (با قفل)' }, CID2));
  ok(delCalls().length === 1 && String(delCalls()[0].payload.chat_id) === CID2, 'کانال دوم همزمان: قفلش اجرا شد');
  await post(cbQuery('tgl:send_text:' + CID2, OWNER)); // خاموش برای ادامه
  // رد کردن کانال دوم ⇒ حذف کامل از KV
  await post(cbQuery('rej:' + CID2, OWNER));
  ok(await env.KV.get('chat:' + CID2) === null, 'کانال ردشده از KV پاک شد');
});

await section('ناظرها (فقط مشاهده) + منشن متخلف + آخرین تخلف‌ها', async () => {
  const VIEWER = 33333;
  // افزودن ناظر توسط مالک
  await post(cbQuery('vwA', OWNER));
  await post(priv(String(VIEWER), OWNER));
  ok(lastText().includes('ناظر اضافه شد'), 'ناظر اضافه شد');
  ok(JSON.parse(await env.KV.get('viewers')).includes(String(VIEWER)), 'ناظر در KV ذخیره شد');
  // 📡 v2.0: ناظر تازه هم بدون کانال است — مالک کانالش را تعیین می‌کند
  await post(cbQuery('vscT:' + VIEWER + ':' + CID, OWNER));
  ok(lastAnswer().includes('داده شد'), 'کانال به ناظر داده شد');
  // تخلف با فرستندهٔ شناخته‌شده ⇒ منشن + آیدی در گزارش مالک + گزارش به ناظر
  await setLock('send_text', true);
  await post(upd({
    channel_post: {
      message_id: 610, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000),
      text: 'پست با هویت متخلف', from: { id: 5, first_name: 'علی', username: 'ali5' },
    },
  }));
  ok(lastText().includes('tg://user?id=5'), 'منشن کلیک‌پذیر متخلف در گزارش مالک');
  ok(lastText().includes('@ali5'), 'یوزرنیم متخلف در گزارش');
  ok(lastText().includes('<code>5</code>'), 'شناسه عددی متخلف در گزارش');
  ok(calls('sendMessage').some((c) => String(c.payload.chat_id) === String(VIEWER)), 'گزارش تخلف به ناظر هم رسید');
  // پست ناشناس (بدون from) ⇒ توضیح شفاف
  await post(chan({ text: 'پست ناشناس کانال' }));
  ok(lastText().includes('ناشناس'), 'بدون هویت ⇒ «ناشناس» با توضیح محدودیت تلگرام');
  // ناظر: آمار را می‌بیند
  await post(cbQuery('stats:' + CID, VIEWER));
  ok(lastEdited().includes('مجموع حذفیات'), 'ناظر آمار را دید');
  // ناظر: «آخرین تخلف‌ها» را می‌بیند
  await post(cbQuery('vlog:' + CID, VIEWER));
  ok(lastEdited().includes('آخرین تخلف‌ها'), 'نمای آخرین تخلف‌ها برای ناظر');
  ok(lastEdited().includes('علی'), 'متخلف با نام در لاگ');
  ok(lastEdited().includes('610'), 'شناسه پیام در لاگ');
  // ناظر: تغییر قفل ⇒ رد
  await post(cbQuery('tgl:send_text:' + CID, VIEWER));
  ok(lastAnswer().includes('مشاهده'), 'ناظر نمی‌تواند قفل تغییر دهد');
  // ناظر: ریست آمار ⇒ رد
  await post(cbQuery('rstS:' + CID, VIEWER));
  ok(lastAnswer().includes('مشاهده'), 'ناظر نمی‌تواند آمار ریست کند');
  // ادمین: فعال‌سازی کانال ⇒ رد (فقط مالک)
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  await post(cbQuery('enb:' + CID, ADMIN));
  ok(lastAnswer().includes('فقط مالک'), 'فعال‌سازی کانال فقط با مالک');
  await post(cbQuery('rej:' + CID, ADMIN));
  ok(lastAnswer().includes('فقط مالک'), 'رد کردن کانال فقط با مالک');
  await post(cbQuery('admD:' + ADMIN, OWNER));
  // حذف ناظر ⇒ قطع دسترسی
  await post(cbQuery('vwD:' + VIEWER, OWNER));
  ok(JSON.parse(await env.KV.get('viewers')).length === 0, 'ناظر حذف شد');
  await post(cbQuery('stats:' + CID, VIEWER));
  ok(lastAnswer().includes('دسترسی ندارید'), 'بعد از حذف، ناظر رد شد');
  await setLock('send_text', false); // خاموش برای ادامهٔ تمیز تست‌ها
});

await section('آمار و ریست', async () => {
  const st = await env.KV.get('stat:' + CID);
  ok(st !== null && JSON.parse(st).total > 0, 'آمار ذخیره‌شده > ۰');
  await post(cbQuery('stats:' + CID, OWNER));
  ok(lastEdited().includes('مجموع حذفیات'), 'نمای آمار رندر شد');
  await post(cbQuery('rstS:' + CID, OWNER));
  ok(JSON.parse(await env.KV.get('stat:' + CID)).total === 0, 'ریست آمار');
});

await section('لینک t.me پیام متخلف: عمومی / خصوصی / یوزرنیم آپدیت / لاگ', async () => {
  await post(cbQuery('tgl:send_text:' + CID, OWNER)); // روشن ⇒ هر پست متنی تخلف است
  // الف) یوزرنیم ذخیره‌شده در تنظیمات (هنگام ثبت کانال) → لینک عمومی t.me/testchan
  await post(chan({ text: 'پست برای لینک عمومی' }));
  ok(lastText().includes('لینک پیام: https://t.me/testchan/'), 'لینک عمومی با یوزرنیم کانال در گزارش حذف موفق');
  // ب) کانال بدون یوزرنیم (خصوصی) → فرم t.me/c/<داخلی>
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  ok(JSON.parse(await env.KV.get('chat:' + CID)).username === '', 'یوزرنیم از تنظیمات پاک شد (شبیه‌سازی کانال خصوصی)');
  await post(chan({ text: 'پست برای لینک خصوصی' }));
  ok(lastText().includes('لینک پیام: https://t.me/c/1001/'), 'لینک خصوصی t.me/c/1001/ در گزارش');
  // پ) یوزرنیمِ داخل خود آپدیت مقدم است → لینک عمومی با همان
  await post(upd({
    channel_post: {
      message_id: 861, chat: { id: Number(CID), type: 'channel', title: 'تست کانال', username: 'freshuname' },
      date: 1700000000, text: 'پست با یوزرنیم در خود آپدیت',
    },
  }));
  ok(lastText().includes('لینک پیام: https://t.me/freshuname/861'), 'یوزرنیم آپدیت مقدم بر تنظیمات است');
  // ت) برگرداندن یوزرنیم + لینک «باز کردن» در «آخرین تخلف‌ها»
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID), type: 'channel', title: 'تست کانال', username: 'testchan' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('vlog:' + CID, OWNER));
  ok(lastEdited().includes('باز کردن</a>'), 'لینک «باز کردن» در آخرین تخلف‌ها');
  ok(lastEdited().includes('t.me/testchan/'), 'لینک t.me در لاگ تخلف‌ها');
  await setLock('send_text', false); // خاموش برای ادامهٔ تمیز
});

await section('مهاجرت دادهٔ قدیمی (کلید جدا vlog) به ساختار ادغام‌شدهٔ v1.5', async () => {
  await setSched(false); // اطمینان: قفل زمان‌دار خاموش باشد تا دلیل تخلف حتمی باشد
  // شبیه‌سازی دادهٔ نسخهٔ ۱.۴: آمار بدون vlog + کلید جدا vlog:{cid}
  await env.KV.put('stat:' + CID, JSON.stringify({ total: 7, edits: 3, posts: 4, by: { 'دلیل قدیمی': 7 }, last: 123456 }));
  await env.KV.put('vlog:' + CID, JSON.stringify([{ t: 123456, r: 'دلیل قدیمی', e: 1, ok: 1, mid: 4242, id: null, nm: 'قدیمی', sn: '' }]));
  await post(cbQuery('vlog:' + CID, OWNER));
  ok(lastEdited().includes('4242'), 'ورودی vlogِ قدیمی از کلید جدا خوانده و نمایش داده شد (مهاجرت)');
  await post(cbQuery('stats:' + CID, OWNER));
  ok(lastEdited().includes('مجموع حذفیات'), 'آمار قدیمی هم سالم خوانده شد');
  // یک تخلف تازه ⇒ فلاش باید vlog قدیمی را داخل کلید ادغام‌شده بنویسد
  await setLock('send_text', true);
  await post(chan({ text: 'تخلف بعد از مهاجرت' }));
  const merged = JSON.parse(await env.KV.get('stat:' + CID));
  ok(Array.isArray(merged.vlog) && merged.vlog.some((v) => v.r === 'دلیل قدیمی'), 'vlog قدیمی داخل کلید ادغام‌شده حفظ شد');
  ok(Array.isArray(merged.vlog) && merged.vlog.some((v) => v.r === 'قفل ارسال متن'), 'تخلف تازه هم در همان کلید ثبت شد');
  ok(merged.total >= 8, 'آمار قدیمی دست‌نخورده ماند (' + merged.total + ')');
  await env.KV.delete('vlog:' + CID); // شبیه‌سازی پاک‌سازی کلید قدیمی
  await setLock('send_text', false); // خاموش برای ادامهٔ تمیز
});

await section('موج تخلف: ادغام گزارش‌های پیوی (صرفه‌جویی لیمیت تلگرام)', async () => {
  await setSched(false); // اطمینان
  await setLock('send_text', true); // روشن ⇒ هر پست متنی تخلف است
  env.REPORT_WINDOW_MS = '2500';
  clearCalls();
  const mk = (mid, text) => upd({ channel_post: { message_id: mid, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), text } });
  // هر سه تقریباً هم‌زمان — اولی فوری، دو مورد بعدی داخل پنجرهٔ ۲.۵ ثانیه‌ای ادغام می‌شوند
  await Promise.all([rawPost(mk(700, 'موج یک')), rawPost(mk(701, 'موج دو')), rawPost(mk(702, 'موج سه'))]);
  await drain(); // صبر برای فلاش گزارش ادغام‌شده
  const ownerSends = calls('sendMessage').filter((c) => String(c.payload.chat_id) === String(OWNER));
  ok(ownerSends.length === 2, 'سه تخلفِ پشت‌سرهم → فقط ۲ پیام به مالک (۱ فوری + ۱ خلاصه)');
  const dig = ownerSends.length > 1 ? ownerSends[ownerSends.length - 1].payload.text : '';
  ok(dig.includes('2 تخلف دیگر'), 'خلاصه با شمارش درست ساخته شد');
  ok(dig.includes('قفل ارسال متن'), 'دلیل تخلف داخل خلاصه هست');
  ok(delCalls().length === 3, 'هر سه پستِ متخلف همچنان تک‌تک حذف شده‌اند (حذف هرگز دسته‌بندی نمی‌شود)');
  env.REPORT_WINDOW_MS = '0';
  await setLock('send_text', false); // خاموش
});

await section('فلاش آمار با حداقل فاصله (صرفه‌جویی سهمیهٔ نوشتن KV)', async () => {
  await setLock('send_text', true); // روشن
  env.MIN_FLUSH_GAP_MS = '2500';
  clearCalls();
  await post(chan({ text: 'فلاش اول' }));
  const st1 = JSON.parse(await env.KV.get('stat:' + CID));
  ok(st1 && st1.total >= 1, 'تخلف اول فلاش شد');
  const t1 = Date.now();
  await post(chan({ text: 'فلاش دوم' })); // بلافاصله بعد از فلاش اول ⇒ تایمر تا پایان حداقل‌فاصله عقب می‌افتد
  const elapsed = Date.now() - t1;
  ok(elapsed >= 1200, 'فلاش دوم تا پایان حداقل‌فاصله به تعویق افتاد (' + elapsed + 'ms)');
  const st2 = JSON.parse(await env.KV.get('stat:' + CID));
  ok(st2.total === st1.total + 1, 'بعد از حداقل‌فاصله فلاش انجام شد و هیچ آماری گم نشد');
  env.MIN_FLUSH_GAP_MS = '0';
  await setLock('send_text', false); // خاموش
});

await section('سلامت ربات + کانال ثبت‌نشده', async () => {
  await post(cbQuery('health:' + CID, OWNER));
  ok(lastEdited().includes('سلامت ربات'), 'نمای سلامت رندر شد');
  await post(cbQuery('health:' + CID, OWNER));
  ok(calls('getChatMember').length >= 2, 'getChatMember صدا زده شد');
  const before = delCalls().length;
  await post(chan({ text: 'کانال ثبیت‌نشده' }, '-1007777'));
  ok(delCalls().length === before, 'کانال ثبت‌نشده → هیچ اقدامی');
});

await section('آپدیت تکراری (dedupe)', async () => {
  const body = upd({ channel_post: { message_id: 601, chat: { id: -1001001, type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), text: 'x' } });
  // قفل کامل را موقتاً روشن کن
  await post(cbQuery('all:1:' + CID, OWNER));
  clearCalls();
  const s = SECRET;
  await worker.fetch(new Request('https://w.example/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': s },
    body: JSON.stringify(body),
  }), env, ctx);
  await worker.fetch(new Request('https://w.example/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': s },
    body: JSON.stringify(body), // همان update_id
  }), env, ctx);
  await drain();
  ok(delCalls().length === 1, 'آپدیت تکراری فقط یک‌بار پردازش شد');
  await post(cbQuery('all:0:' + CID, OWNER));
});

await section('راه‌اندازی خودکار وب‌هوک (?setup=)', async () => {
  const r1 = await worker.fetch(new Request('https://w.example/?setup=WRONG'), env, ctx);
  ok(r1.status === 403, 'کلید اشتباه → 403');
  const r2 = await worker.fetch(new Request('https://w.example/?setup=' + encodeURIComponent(SECRET)), env, ctx);
  ok(r2.status === 200, 'کلید درست → 200');
  const sw = calls('setWebhook');
  ok(sw.length === 1, 'setWebhook صدا زده شد');
  ok(sw.length && sw[0].payload.url === 'https://w.example/webhook', 'آدرس وب‌هوک درست است');
  ok(sw.length && Array.isArray(sw[0].payload.allowed_updates) && sw[0].payload.allowed_updates.includes('channel_post'), 'allowed_updates شامل channel_post است');
  ok(sw.length && !sw[0].payload.allowed_updates.includes('edited_message'), 'edited_message حذف شده از allowed_updates (وب‌هوک سبک‌تر v1.5)');
  const r3 = await worker.fetch(new Request('https://w.example/'), env, ctx);
  ok(r3.status === 200, 'GET ساده → 200 وضعیت');
});

await section('دستور /id و کانال حذف‌شده', async () => {
  await post(priv('/id', OWNER));
  ok(lastText().includes('شناسه'), '/id کار کرد');
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      new_chat_member: { status: 'kicked' },
    },
  }));
  ok(await env.KV.get('chat:' + CID) === null, 'کانال حذف‌شده از KV پاک شد');
  ok(lastText().includes('حذف شد'), 'به مالک اطلاع حذف داده شد');
});

/* ==========================================================================
 *  v1.8 — 🟡🔴 وضعیت زرد/قرمز + ⚡️ پریست ادمین‌سازی + ↩️ بازگردانی دسترسی‌ها
 * ==========================================================================*/

/** تنظیم وضعیت مجازات با چرخاندن دکمهٔ redT (خاموش → زرد → قرمز) */
async function setMode(mode) {
  const order = ['off', 'yellow', 'red'];
  let s = JSON.parse(await env.KV.get('chat:' + CID));
  const cur = order.indexOf(s.punishMode || 'off');
  const want = order.indexOf(mode);
  const steps = ((want - cur) % 3 + 3) % 3;
  for (let i = 0; i < steps; i++) await post(cbQuery('redT:' + CID, OWNER));
}

await section('v1.8 — ثبت مجدد کانال + مهاجرت punishMode', async () => {
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID), type: 'channel', title: 'تست کانال' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('enb:' + CID, OWNER));
  const s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s && s.punishMode === 'off', 'مهاجرت: punishMode پیش‌فرض خاموش');
  ok(s && s.active === true, 'کانال دوباره فعال شد');
});

await section('v1.8 — مهاجرت دادهٔ قدیمی redMedia=true ⇒ punishMode=red در پنل', async () => {
  await env.KV.put('chat:' + CID, JSON.stringify({ title: 'قدیمی', locks: {}, redMedia: true, active: true }));
  await post(cbQuery('chat:' + CID, OWNER));
  ok(lastEdited().includes('قدیمی'), 'پنل کانال با دادهٔ قدیمی بدون خطا باز شد');
  ok(lastEdited().includes('🔴 وضعیت قرمز') || lastEdited().includes('وضعیت قرمز'), 'redMedia=true قدیمی به قرمز ترجمه شد');
  // بازگرداندن وضعیت نرمال برای بخش‌های بعدی (dane قدیمی از KV پاک می‌شود)
  await env.KV.put('chat:' + CID, JSON.stringify({ title: 'تست کانال', locks: {}, punishMode: 'off', active: true, instant: { on: false, at: 0 }, schedule: { enabled: false, start: 240, end: 480, mode: 'all' } }));
});

await section('v1.8 — دکمهٔ وضعیت: چرخهٔ خاموش → زرد → قرمز → خاموش', async () => {
  await setMode('off');
  await post(cbQuery('redT:' + CID, OWNER)); // off → yellow
  let s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.punishMode === 'yellow', 'چرخه: خاموش → زرد');
  ok(lastAnswer().includes('زرد روشن'), 'پیام تأیید زرد آمد');
  ok(lastEdited().includes('وضعیت زرد'), 'نمای کانال حالت زرد را نشان داد');
  await post(cbQuery('redT:' + CID, OWNER)); // yellow → red
  s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.punishMode === 'red', 'چرخه: زرد → قرمز');
  ok(lastAnswer().includes('قرمز روشن'), 'پیام تأیید قرمز آمد');
  ok(lastEdited().includes('وضعیت قرمز'), 'نمای کانال حالت قرمز را نشان داد');
  await post(cbQuery('redT:' + CID, OWNER)); // red → off
  s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.punishMode === 'off', 'چرخه: قرمز → خاموش');
  await setMode('red');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).punishMode === 'red', 'برای تست‌های بعدی: قرمز');
});

await section('v1.8 — وضعیت قرمز: ادیت پست مدیادار ⇒ پاک + عزل + بن + snapshot بازگردانی', async () => {
  mockB.memberOf[4455] = { status: 'administrator', user: { id: 4455, first_name: 'خائن', username: 'traitor' }, can_post_messages: true, can_delete_messages: true, can_promote_members: true };
  await setMode('red');
  clearCalls();
  await post(chanEdit({
    message_id: 9100, from: { id: 4455, first_name: 'خائن', username: 'traitor' },
    photo: [{ file_id: 'ph' }], caption: 'کپشن ادیت‌شده',
  }));
  ok(delCalls().length === 1 && delCalls()[0].payload.message_id === 9100, 'پیام فوراً حذف شد');
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '4455', 'عزل ادمینی متخلف انجام شد');
  ok(pr.length === 1 && pr[0].payload.can_post_messages === false && pr[0].payload.can_promote_members === false && pr[0].payload.can_delete_messages === false, 'همهٔ دسترسی‌ها false بود');
  const undoRaw = await env.KV.get(`undo:${CID}:4455`);
  const undo = undoRaw ? JSON.parse(undoRaw) : null;
  ok(!!undo && undo.post === true && undo.del === true && undo.prom === true, 'snapshot دسترسی‌های قبلی برای بازگردانی ذخیره شد');
  const bn = calls('banChatMember');
  ok(bn.length === 1 && String(bn[0].payload.user_id) === '4455', 'متخلف از کانال بن شد');
  const rep = calls('sendMessage').filter((c) => String(c.payload.chat_id) === String(OWNER));
  ok(rep.length >= 1 && rep.some((c) => c.payload.text.includes('وضعیت قرمز')), 'گزارش قرمز فوری به مالک رسید');
  const withBtn = rep.find((c) => c.payload.reply_markup && JSON.stringify(c.payload.reply_markup).includes(`ubn:${CID}:4455`));
  ok(!!withBtn, 'دکمهٔ لغو بن در گزارش هست');
  ok(!lastText().includes('تخلف دیگر در همین چند ثانیه'), 'گزارش قرمز از ادغام موجی مستثنی است');
  await drain();
  const stt = JSON.parse(await env.KV.get('stat:' + CID));
  ok(stt && stt.vlog && stt.vlog.length && stt.vlog[stt.vlog.length - 1].r.includes('وضعیت قرمز'), 'در «آخرین تخلف‌ها» با وضعیت قرمز ثبت شد');
  await post(cbQuery(`ubn:${CID}:4455`, OWNER));
  ok(calls('unbanChatMember').length === 1 && String(calls('unbanChatMember')[0].payload.user_id) === '4455', 'لغو بن کار کرد');
});

await section('v1.7 — وضعیت قرمز: ادیت فقط-متنی ⇒ فقط پاک (بدون بن)', async () => {
  clearCalls();
  await post(chanEdit({ message_id: 9101, from: { id: 4455 }, text: 'متن ادیت‌شده' }));
  ok(delCalls().length === 1 && delCalls()[0].payload.message_id === 9101, 'پست متنیِ ادیت‌شده پاک شد');
  ok(calls('promoteChatMember').length === 0 && calls('banChatMember').length === 0, 'هیچ عزل/بنی انجام نشد');
  ok(lastText().includes('ادیت متن (وضعیت قرمز)'), 'گزارش عادی با دلیل وضعیت قرمز');
});

await section('v1.8 — وضعیت زرد: ادیت مدیادار ⇒ پاک + عزل (بدون بن) + دکمهٔ بازگردانی', async () => {
  await setMode('yellow');
  mockB.memberOf[4456] = { status: 'administrator', user: { id: 4456, first_name: 'ادیتور' }, can_post_messages: true, can_delete_messages: true };
  clearCalls();
  await post(chanEdit({ message_id: 9102, from: { id: 4456 }, photo: [{ file_id: 'y' }] }));
  ok(delCalls().length === 1, 'با وضعیت زرد پیام پاک شد');
  const pr6 = calls('promoteChatMember');
  ok(pr6.length === 1 && String(pr6[0].payload.user_id) === '4456', 'متخلف عزل شد (وضعیت زرد)');
  ok(calls('banChatMember').length === 0, 'بن انجام نشد — وضعیت زرد فقط عزل');
  ok(lastText().includes('وضعیت زرد'), 'گزارش زرد آمد');
  ok(lastText().includes('فقط عزل'), 'وضعیت بن خاموش در گزارش ذکر شد');
  ok(!JSON.stringify(calls('sendMessage').map((c) => c.payload.reply_markup)).includes('ubn:'), 'دکمهٔ لغو بن نیست');
  const mks = JSON.stringify(calls('sendMessage').map((c) => c.payload.reply_markup));
  ok(mks.includes(`admU:${CID}:4456`), 'دکمهٔ ↩️ بازگردانی در گزارش هست');
  clearCalls();
  await post(cbQuery(`admU:${CID}:4456`, OWNER));
  const rp = calls('promoteChatMember');
  ok(rp.length === 1 && String(rp[0].payload.user_id) === '4456' && rp[0].payload.can_post_messages === true && rp[0].payload.can_delete_messages === true, 'بازگردانی: دسترسی‌های قبلی دقیق برمی‌گردند');
  ok(await env.KV.get(`undo:${CID}:4456`) === null, 'بعد از بازگردانی، snapshot پاک شد');
  ok(lastAnswer().includes('بازگردانی شد'), 'تأیید بازگردانی آمد');
  delete mockB.memberOf[4456];
});

await section('v1.8 — وضعیت خاموش: فقط قفل‌ها (بدون عزل خودکار)', async () => {
  await setMode('off');
  clearCalls();
  await post(chanEdit({ message_id: 9107, from: { id: 4457 }, photo: [{ file_id: 'z' }] }));
  ok(delCalls().length === 0, 'خاموش + بدون قفل ⇒ هیچ حذفی');
  ok(calls('promoteChatMember').length === 0 && calls('banChatMember').length === 0, 'خاموش ⇒ هیچ عزل/بنی');
  await setLock('edit_media', true);
  clearCalls();
  await post(chanEdit({ message_id: 9108, from: { id: 4457 }, photo: [{ file_id: 'z' }] }));
  ok(delCalls().length === 1, 'با قفل «ادیت مدیا» پاک شد');
  ok(calls('promoteChatMember').length === 0, 'قفل‌ها عزل نمی‌دهند — فقط وضعیت زرد/قرمز');
  await setLock('edit_media', false);
});

await section('v1.7 — متخلف ناشناس با امضا ⇒ تطبیق با ادمین‌های کانال', async () => {
  await setMode('red');
  mockB.memberOf[2000002] = { status: 'administrator', user: { id: 2000002, first_name: 'علی' } };
  mockB.admins = [
    { status: 'creator', user: { id: 1000001, first_name: 'مالک' } },
    { status: 'administrator', user: { id: 2000002, first_name: 'علی' }, custom_title: 'ادارلات' },
  ];
  clearCalls();
  await post(chanEdit({ message_id: 9103, video: [{ file_id: 'v' }], author_signature: 'ادارلات' }));
  ok(calls('promoteChatMember').some((c) => String(c.payload.user_id) === '2000002'), 'با تطبیق امضا، ادمین عزل شد');
  ok(calls('banChatMember').some((c) => String(c.payload.user_id) === '2000002'), 'ادمین متخلف بن شد');
  ok(lastText().includes('تطبیق امضا'), 'روش شناسایی در گزارش ذکر شد');
  mockB.admins = null;
});

await section('v1.7 — ناشناس بدون امضا ⇒ پاک + گزارش بدون عزل', async () => {
  await setMode('red');
  clearCalls();
  await post(chanEdit({ message_id: 9104, animation: [{ file_id: 'g' }] }));
  ok(delCalls().length === 1, 'پیام پاک شد');
  ok(calls('promoteChatMember').length === 0 && calls('banChatMember').length === 0, 'عزل/بن خودکار انجام نشد');
  ok(lastText().includes('ناشناس'), 'گزارش ناشناس‌بودن داد');
});

await section('v1.7.1 — مالک کانال ادیت‌کننده باشد ⇒ پاک + گزارش، بدون عزل/بن', async () => {
  await setMode('red');
  mockB.memberOf[1000001] = { status: 'creator', user: { id: 1000001, first_name: 'مالک' } };
  mockB.admins = [{ status: 'creator', user: { id: 1000001, first_name: 'مالک' } }];
  clearCalls();
  await post(chanEdit({ message_id: 9105, from: { id: 1000001, first_name: 'مالک' }, photo: [{ file_id: 'p' }] }));
  ok(delCalls().length === 1, 'پیام پاک شد');
  ok(calls('promoteChatMember').length === 0 && calls('banChatMember').length === 0, 'هیچ عزل/بنی روی مالک انجام نشد');
  ok(lastText().includes('مالک کانال'), 'گزارش توضیح مالک‌بودن داد');
  mockB.admins = null;
  delete mockB.memberOf[1000001];
});

await section('v1.7.1 — امضای مطابق خود ربات ⇒ ربات هدف نمی‌گیرد (محافظت از خود)', async () => {
  await setMode('red');
  mockB.admins = [{ status: 'administrator', user: { id: BOTID, first_name: 'TestBot', username: 'test_bot' } }];
  clearCalls();
  await post(chanEdit({ message_id: 9106, video: [{ file_id: 'v' }], author_signature: 'TestBot' }));
  ok(delCalls().length === 1, 'پیام پاک شد');
  ok(calls('promoteChatMember').length === 0, 'ربات هرگز خودش را عزل نمی‌کند');
  ok(lastText().includes('تطبیق نکرد'), 'هدف‌گیری رد شد و گزارش داد');
  mockB.admins = null;
});

await section('v1.7 — نمای «👑 ادمین‌های کانال»', async () => {
  mockB.admins = [
    { status: 'creator', user: { id: 1000001, first_name: 'مالک' } },
    { status: 'administrator', user: { id: BOTID, first_name: 'TestBot', username: 'test_bot' } },
    { status: 'administrator', user: { id: 2000002, first_name: 'علی' }, custom_title: 'ادارلات' },
  ];
  clearCalls();
  await post(cbQuery('admC:' + CID, OWNER));
  const ed = calls('editMessageText');
  ok(ed.length >= 1 && ed[ed.length - 1].payload.text.includes('ادمین‌های کانال'), 'نمای ادمین‌ها باز شد');
  ok(ed[ed.length - 1].payload.text.includes('مالک کانال (قابل عزل نیست)'), 'مالک کانال مشخص شد');
  ok(ed[ed.length - 1].payload.text.includes('ارتقای ادمین'), 'دسترسی‌های خود ربات نمایش داده شد');
  const mk = JSON.stringify(ed[ed.length - 1].payload.reply_markup);
  ok(mk.includes(`camD:${CID}:2000002`), 'دکمهٔ عزل برای ادمین هست');
  ok(!mk.includes(`camD:${CID}:${BOTID}`), 'دکمهٔ عزل برای خود ربات نیست');
});

await section('v1.7 — افزودن ادمین کانال: فلو کامل (شناسه → دسترسی → ارتقا)', async () => {
  clearCalls();
  await post(cbQuery('camA:' + CID, OWNER));
  ok(calls('sendMessage').some((c) => /شناسهٔ عددی فرد رو بفرست/.test(c.payload.text || '')), 'درخواست شناسهٔ عددی شد (راهنمای گام‌به‌گام)');
  mockB.memberOf[3003003] = { status: 'member', user: { id: 3003003, first_name: 'رضا' } };
  await post(priv('3003003', OWNER));
  const sm = calls('sendMessage');
  ok(sm.length >= 1 && sm[sm.length - 1].payload.text.includes('ادمین‌سازی سریع'), 'پیام ادمین‌سازی سریع آمد');
  ok(JSON.stringify(sm[sm.length - 1].payload.reply_markup).includes(`camP:${CID}:basic`), 'دکمهٔ پریست ⚡️ در کیبورد هست');
  ok(JSON.stringify(sm[sm.length - 1].payload.reply_markup).includes(`camT:${CID}:edit`), 'دکمهٔ ادیت (تنظیم دستی) هم هست');
  await post(cbQuery('camT:' + CID + ':edit', OWNER));
  ok(lastAnswer() === '', 'toggle بی‌صدا اعمال شد');
  clearCalls();
  await post(cbQuery('camG:' + CID, OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '3003003', 'promoteChatMember صدا زده شد');
  ok(pr.length === 1 && pr[0].payload.can_post_messages === true && pr[0].payload.can_delete_messages === true && pr[0].payload.can_edit_messages === true, 'دسترسی‌های انتخابی درست بود');
  ok(pr.length === 1 && pr[0].payload.can_restrict_members === false && pr[0].payload.can_promote_members === false, 'دسترسی انتخاب‌نشده false ماند');
  ok(lastEdited().includes('ارتقا انجام شد'), 'پیام موفقیت با فهرست دسترسی‌ها');
  ok(await env.KV.get('state:' + OWNER) === null, 'state بعد از ارتقا پاک شد');
  delete mockB.memberOf[3003003];
});

await section('v1.8 — پریست ⚡️ معمولی: یک ضربه = تنظیم + ارتقا + دکمهٔ ادمین بعدی', async () => {
  mockB.memberOf[3003005] = { status: 'member', user: { id: 3003005, first_name: 'مجید' } };
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3003005', OWNER));
  clearCalls();
  await post(cbQuery('camP:' + CID + ':basic', OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '3003005', 'پریست فوراً ارتقا داد');
  ok(pr.length === 1 && pr[0].payload.can_post_messages === true && pr[0].payload.can_delete_messages === true, 'پریست معمولی: ارسال+حذف');
  ok(pr.length === 1 && pr[0].payload.can_edit_messages === false && pr[0].payload.can_promote_members === false, 'پریست معمولی: بدون ادیت و ارتقا');
  ok(lastEdited().includes('ارتقا با پریست'), 'پیام موفقیت پریست آمد');
  ok(JSON.stringify(lastEditedKB()).includes(`camA:${CID}`), 'دکمهٔ «➕ ادمین بعدی» هست');
  ok(await env.KV.get('state:' + OWNER) === null, 'state پاک شد');
  delete mockB.memberOf[3003005];
});

await section('v1.8 — پریست 👑 کامل: همهٔ دسترسی‌ها به‌جز ناشناس', async () => {
  mockB.memberOf[3003006] = { status: 'member', user: { id: 3003006, first_name: 'سینا' } };
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3003006', OWNER));
  clearCalls();
  await post(cbQuery('camP:' + CID + ':full', OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '3003006', 'پریست کامل ارتقا داد');
  ok(pr.length === 1 && pr[0].payload.can_post_messages === true && pr[0].payload.can_edit_messages === true && pr[0].payload.can_promote_members === true, 'پریست کامل: همهٔ دسترسی‌ها روشن');
  ok(pr.length === 1 && pr[0].payload.is_anonymous === false, 'پریست کامل: ناشناس خاموش');
  await post(cbQuery('camX:' + CID, OWNER));
  delete mockB.memberOf[3003006];
});

await section('v1.7 — ارتقا بدون دسترسی Add New Admins ⇒ خطای راهنما', async () => {
  mockB.memberOf[3003004] = { status: 'member', user: { id: 3003004, first_name: 'سعید' } };
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3003004', OWNER));
  clearCalls();
  mockB.botCanPromote = false;
  await post(cbQuery('camG:' + CID, OWNER));
  ok(calls('promoteChatMember').length === 0, 'ارتقایی انجام نشد');
  ok(lastAnswer().includes('Add New Admins'), 'راهنمای دقیق در alert آمد');
  mockB.botCanPromote = true;
  await post(cbQuery('camX:' + CID, OWNER));
  ok(await env.KV.get('state:' + OWNER) === null, 'state لغو شد');
  delete mockB.memberOf[3003004];
});

await section('v1.7 — ارتقای مالک کانال ⇒ رد', async () => {
  mockB.memberOf[1000001] = { status: 'creator', user: { id: 1000001, first_name: 'مالک' } };
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('1000001', OWNER));
  ok(lastText().includes('مالک کانال'), 'با پیام مناسب رد شد');
  ok(await env.KV.get('state:' + OWNER) === null, 'state پاک شد');
  delete mockB.memberOf[1000001];
});

await section('v1.7 — عزل ادمین کانال (بدون بن) با تأیید دومرحله‌ای', async () => {
  mockB.admins = [{ status: 'administrator', user: { id: 2000002, first_name: 'علی' } }];
  clearCalls();
  await post(cbQuery('camD:' + CID + ':2000002', OWNER));
  ok(lastEdited().includes('عزل ادمین کانال'), 'ابتدا تأیید گرفت');
  await post(cbQuery('camD2:' + CID + ':2000002', OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '2000002', 'عزل انجام شد');
  ok(pr.length === 1 && pr[0].payload.can_post_messages === false && pr[0].payload.can_promote_members === false, 'همهٔ دسترسی‌ها false');
  ok(calls('banChatMember').length === 0, 'بن نشد — فقط عزل');
  mockB.admins = null;
});

await section('v1.7 — ناظر به وضعیت قرمز/ادمین‌سازی دسترسی ندارد', async () => {
  await post(cbQuery('vwA', OWNER));
  await post(priv(String(33333), OWNER));
  clearCalls();
  await post(cbQuery('admC:' + CID, 33333));
  ok(lastAnswer().includes('ناظر'), 'ناظر از ادمین‌های کانال رد شد');
  await post(cbQuery('redT:' + CID, 33333));
  ok(lastAnswer().includes('ناظر'), 'ناظر وضعیت زرد/قرمز را نمی‌تواند تغییر دهد');
  await post(cbQuery('vwD:' + 33333, OWNER));
  ok(JSON.parse(await env.KV.get('viewers')).length === 0, 'ناظر تستی پاک شد');
});

/* ==========================================================================
 *  v1.9 — 🔒 قفل پست ناشناس + ⏱ بن موقت + 💾 بکاپ + 📅 آمار امروز + 📣 گزارش آزمایشی
 * ==========================================================================*/

await section('v1.9 — قفل جدید «پست ناشناس» در پنل + دکمه‌های تازهٔ منوی کانال', async () => {
  await post(cbQuery('locks:' + CID, OWNER));
  ok(JSON.stringify(lastEditedKB()).includes('پست ناشناس'), 'قفل پست ناشناس در پنل قفل‌ها دیده می‌شود');
  ok(JSON.stringify(lastEditedKB()).includes(`tgl:lock_anon:${CID}`), 'دکمهٔ toggle قفل ناشناس هست');
  await post(cbQuery('chat:' + CID, OWNER));
  ok(lastEdited().includes('مدت بن خودکار'), 'خط مدت بن خودکار در نمای کانال هست');
  const kb9 = JSON.stringify(lastEditedKB());
  ok(kb9.includes(`banH:${CID}`), 'دکمهٔ ⏱ مدت بن در منوی کانال هست');
  ok(kb9.includes(`bakE:${CID}`) && kb9.includes(`bakI:${CID}`), 'دکمه‌های 💾 بکاپ و 📥 بازگردانی در منوی کانال هست');
});

await section('v1.9 — قفل پست ناشناس: پست/ادیتِ بی‌امضا حذف، امضادار آزاد', async () => {
  await setLock('lock_anon', true);
  ok(lastAnswer().includes('Sign messages'), 'راهنمای امضا در پاسخ فعال‌سازی قفل');
  clearCalls();
  await post(chan({ message_id: 9200, text: 'پست ناشناس از کانال' }));
  ok(delCalls().length === 1 && delCalls()[0].payload.message_id === 9200, 'پست ناشناس (بدون امضا) فوراً حذف شد');
  ok(lastText().includes('قفل پست ناشناس'), 'دلیل در گزارش = قفل پست ناشناس');
  ok(lastText().includes('Sign messages'), 'راهنمای «Sign messages» در گزارش حذف هست');
  clearCalls();
  await post(chan({ message_id: 9201, text: 'پست با امضا', author_signature: 'ادارلات' }));
  ok(delCalls().length === 0, 'پست امضادار (با هویت ادمین) حذف نشد');
  clearCalls();
  await post(chanEdit({ message_id: 9202, text: 'ادیتِ پست ناشناس' }));
  ok(delCalls().length === 1 && delCalls()[0].payload.message_id === 9202, 'ادیتِ پستِ بی‌امضا هم حذف شد');
  await setLock('lock_anon', false);
});

await section('v1.9 — قفل ناشناس + وضعیت قرمز: ادیت مدیای ناشناس اولویت با نردبان وضعیت', async () => {
  await setLock('lock_anon', true);
  await setMode('red');
  clearCalls();
  await post(chanEdit({ message_id: 9203, photo: [{ file_id: 'p' }] }));
  ok(delCalls().length === 1, 'ادیت مدیای ناشناس در وضعیت قرمز پاک شد');
  ok(lastText().includes('وضعیت قرمز'), 'اولویت با نردبان وضعیت بود (گزارش قرمز)');
  await setMode('off');
  await setLock('lock_anon', false);
});

await section('v1.9 — مدت بن خودکار: چرخهٔ دکمه + بن ۲۴ ساعته با until_date + لغو', async () => {
  await post(cbQuery('banH:' + CID, OWNER)); // 0 → 1
  let s9 = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s9.banHours === 1, 'چرخه: همیشگی → ۱ ساعت');
  await post(cbQuery('banH:' + CID, OWNER)); // 1 → 24
  s9 = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s9.banHours === 24, 'چرخه: ۱ ساعت → ۲۴ ساعت');
  ok(lastAnswer().includes('۲۴ ساعت'), 'تأیید مدت ۲۴ ساعت آمد');
  await setMode('red');
  mockB.memberOf[4460] = { status: 'administrator', user: { id: 4460, first_name: 'موقت' }, can_post_messages: true };
  clearCalls();
  await post(chanEdit({ message_id: 9210, from: { id: 4460 }, photo: [{ file_id: 'q' }] }));
  const bn9 = calls('banChatMember');
  ok(bn9.length === 1 && String(bn9[0].payload.user_id) === '4460', 'متخلف بن شد (وضعیت قرمز)');
  ok(bn9.length === 1 && Number(bn9[0].payload.until_date) > Math.floor(realNow() / 1000) + 23 * 3600, 'بن با until_date ≈ ۲۴ ساعت آینده اجرا شد');
  ok(lastText().includes('۲۴ ساعت'), 'مدت بن در گزارش قرمز ذکر شد');
  clearCalls();
  await post(cbQuery(`ubn:${CID}:4460`, OWNER));
  ok(calls('unbanChatMember').length === 1, 'لغو بن موقت هم کار می‌کند');
  delete mockB.memberOf[4460];
  await setMode('off');
  await post(cbQuery('banH:' + CID, OWNER)); // 24 → 168
  await post(cbQuery('banH:' + CID, OWNER)); // 168 → 0
  ok(JSON.parse(await env.KV.get('chat:' + CID)).banHours === 0, 'چرخه: ۷ روز → همیشگی (بازگشت)');
});

await section('v1.9 — آمار امروز: شمارش + چرخش روز به وقت تهران', async () => {
  await setLock('send_text', true);
  clearCalls();
  await post(chan({ message_id: 9220, text: 'امروز یکی' }));
  await post(cbQuery('stats:' + CID, OWNER));
  ok(lastEdited().includes('امروز'), 'خط «📅 امروز» در نمای آمار هست');
  const cur9 = JSON.parse(await env.KV.get('stat:' + CID));
  ok(cur9.today && cur9.today.n >= 1, 'شمارندهٔ امروز در KV ثبت شد');
  cur9.today = { d: '2020-01-01', n: 9, e: 9, p: 9 }; // شبیه‌سازی باقی‌ماندهٔ روز قبل
  await env.KV.put('stat:' + CID, JSON.stringify(cur9));
  clearCalls();
  await post(chan({ message_id: 9221, text: 'امروز دومی' }));
  const st29 = JSON.parse(await env.KV.get('stat:' + CID));
  ok(st29.today && st29.today.n === 1 && st29.today.d !== '2020-01-01', 'چرخش روز: شمارندهٔ دیروز دور ریخته و امروز از صفر شروع شد');
  await setLock('send_text', false);
});

await section('v1.9 — بکاپ تنظیمات: خروجی + بازگردانی دقیق + کدبلاک + ورودی نامعتبر', async () => {
  await setLock('send_gif', true);
  await setMode('yellow');
  clearCalls();
  await post(cbQuery('bakE:' + CID, OWNER));
  const baks = calls('sendMessage').filter((c) => String(c.payload.chat_id) === String(OWNER));
  const bakText = baks.length ? baks[baks.length - 1].payload.text : '';
  ok(bakText.includes('بکاپ تنظیمات') && bakText.includes('"punishMode":"yellow"'), 'بکاپ با وضعیت زرد در متن آمد');
  ok(bakText.includes('"send_gif":true'), 'قفل‌ها داخل بکاپ هست');
  // همه را صفر کن و از روی بکاپ برگردان
  await post(cbQuery('all:0:' + CID, OWNER));
  await setMode('off');
  await post(cbQuery('bakI:' + CID, OWNER));
  ok(lastAnswer().includes('بکاپ'), 'درخواست متن بکاپ آمد');
  const json9 = bakText.match(/<code>([\s\S]*?)<\/code>/)[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  await post(priv(json9, OWNER));
  ok(lastText().includes('بکاپ بازگردانی شد'), 'بازگردانی تأیید شد');
  let s9 = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s9.punishMode === 'yellow' && s9.locks.send_gif === true, 'وضعیت زرد + قفل گیف دقیقاً برگشت');
  ok(await env.KV.get('state:' + OWNER) === null, 'state بعد از بازگردانی پاک شد');
  // بازگردانی با متن داخل کدبلاک ```
  await post(cbQuery('all:0:' + CID, OWNER));
  await setMode('off');
  await post(cbQuery('bakI:' + CID, OWNER));
  await post(priv('```json\n' + json9 + '\n```', OWNER));
  s9 = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s9.punishMode === 'yellow' && s9.locks.send_gif === true, 'بازگردانی با متن داخل کدبلاک هم کار کرد');
  // ورودی نامعتبر ⇒ خطا + state برای تلاش دوباره می‌ماند
  await post(cbQuery('bakI:' + CID, OWNER));
  await post(priv('این یک متن نامعتبر است', OWNER));
  ok(lastText().includes('نامعتبر'), 'بکاپ نامعتبر ⇒ پیام خطا');
  ok(await env.KV.get('state:' + OWNER) !== null, 'state برای تلاش دوباره باقی ماند');
  await post(priv('/start', OWNER)); // لغو state
  await setMode('off');
  await setLock('send_gif', false);
});

await section('v1.9 — گزارش آزمایشی: رسیدن به مالک + ادمین + ناظر (و رد غیرمالک)', async () => {
  await post(cbQuery('admins', OWNER));
  ok(lastEdited().includes('گزارش آزمایشی'), 'دکمهٔ گزارش آزمایشی در منوی ادمین‌ها هست');
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  await post(cbQuery('vwA', OWNER));
  await post(priv('33333', OWNER));
  clearCalls();
  await post(cbQuery('admT', OWNER));
  const sent9 = calls('sendMessage').map((c) => String(c.payload.chat_id));
  ok(sent9.includes(String(OWNER)) && sent9.includes(String(ADMIN)) && sent9.includes('33333'), 'پیام آزمایشی به مالک، ادمین و ناظر رسید');
  ok(lastAnswer().includes('به 3 نفر'), 'تأیید شمارش ۳ گیرنده');
  await post(cbQuery('admD:' + ADMIN, OWNER));
  await post(cbQuery('vwD:33333', OWNER));
  ok(JSON.parse((await env.KV.get('admins')) || '[]').length === 0, 'ادمین تستی پاک شد');
  ok(JSON.parse((await env.KV.get('viewers')) || '[]').length === 0, 'ناظر تستی پاک شد');
  // غیرمالک: رد کامل بدون هیچ ارسالی
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  clearCalls();
  await post(cbQuery('admT', ADMIN));
  ok(lastAnswer().includes('فقط مالک'), 'غیرمالک نمی‌تواند گزارش آزمایشی بزند');
  ok(calls('sendMessage').length === 0, 'با رد غیرمالک، هیچ پیام آزمایشی ارسال نشد');
  await post(cbQuery('admD:' + ADMIN, OWNER));
});

/* ==========================================================================
 *  v2.0 — 📡 چندکاناله + دسترسی کانالی ادمین‌ها (RBAC)
 * ==========================================================================*/

await section('v2.0 — مهاجرت نرم: ادمینِ قدیمیِ بدون scope ⇒ کانال‌های ثبت‌شده', async () => {
  const legacy = 55555;
  const CID2 = '-1002002';
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID2), type: 'channel', title: 'کانال دوم' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('enb:' + CID2, OWNER));
  // ادمین legacy مستقیم در KV نوشته می‌شود (بدون سابقهٔ scope) — مثل ادمین‌های قبل از آپدیت
  await env.KV.put('admins', JSON.stringify([String(legacy)]));
  // صبر تا انقضای کش‌های ۱۰ثانیه‌ای worker (شبیه‌سازی ایزولهٔ جدید)
  await new Promise((r) => setTimeout(r, 10500));
  // ادمین legacy پنل کانال اول را می‌بیند (دامنهٔ پیش‌فرض مهاجرت = کانال‌های ثبت‌شده)
  await post(cbQuery('chat:' + CID, legacy));
  ok(lastEdited().includes('تست کانال'), 'ادمین legacy به کانال ثبت‌شده دسترسی دارد (مهاجرت نرم)');
  // بازکردن ویرایشگر دسترسی توسط مالک ⇒ مهاجرت در KV ماده‌سازی می‌شود (هر دو کانال پیش‌تیک)
  await post(cbQuery('asc:' + legacy, OWNER));
  ok(lastEdited().includes('تست کانال') && lastEdited().includes('کانال دوم'), 'ویرایشگر: هر دو کانال ثبت‌شده پیش‌تیک‌خورده');
  const accM = JSON.parse(await env.KV.get('scopes'));
  ok(Array.isArray(accM.a[String(legacy)]?.ch) && accM.a[String(legacy)].ch.includes(CID) && accM.a[String(legacy)].ch.includes(CID2),
    'scope مهاجرت در KV ثبت شد (هر دو کانال)');
  // محدودکردن ادمین legacy به فقط کانال اول:
  await post(cbQuery('ascT:' + legacy + ':' + CID2, OWNER));
  ok(lastAnswer().includes('گرفته شد'), 'کانال دوم از دسترسی ادمین گرفته شد');
  await post(cbQuery('chat:' + CID2, legacy));
  ok(lastAnswer().includes('اختصاص داده نشده'), 'ادمینِ تک‌کاناله به کانال دیگر راه ندارد');
  await post(cbQuery('chat:' + CID, legacy));
  ok(lastEdited().includes('تست کانال'), 'همچنان به کانال خودش دسترسی دارد');
  // حتی تغییر قفل در کانال دیگر هم رد می‌شود:
  await post(cbQuery('tgl:send_text:' + CID2, legacy));
  ok(lastAnswer().includes('اختصاص داده نشده'), 'تغییر قفل کانال دیگر هم رد شد');
  // منوهای مالک برای ادمین بسته است:
  await post(cbQuery('admins', legacy));
  ok(lastAnswer().includes('فقط مالک'), 'ادمین منوی ادمین‌ها را ندارد');
  await post(cbQuery('enb:' + CID, legacy));
  ok(lastAnswer().includes('فقط مالک'), 'ادمین نمی‌تواند کانال فعال/رد کند');
  // پاک‌سازی
  await post(cbQuery('admD:' + legacy, OWNER));
  await post(cbQuery('rej:' + CID2, OWNER));
  ok(await env.KV.get('chat:' + CID2) === null, 'کانال دوم پاک‌سازی شد');
});

await section('v2.0 — گزارش هر کانال فقط برای ادمین همان کانال', async () => {
  const CID2 = '-1002002';
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID2), type: 'channel', title: 'کانال دوم' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('enb:' + CID2, OWNER));
  // ادمین ۱: فقط کانال اول — ادمین ۲: فقط کانال دوم (از مسیر پنل تا کش‌ها همگام بمانند)
  await post(cbQuery('admA', OWNER));
  await post(priv('61001', OWNER));
  await post(cbQuery('ascT:61001:' + CID, OWNER));
  await post(cbQuery('admA', OWNER));
  await post(priv('61002', OWNER));
  await post(cbQuery('ascT:61002:' + CID2, OWNER));
  // تخلف در کانال اول ⇒ فقط ادمین ۱ + مالک
  clearCalls();
  await post(cbQuery('tgl:send_text:' + CID, OWNER));
  await post(chan({ text: 'تخلف کانال اول برای تست گزارش' }));
  let sents = calls('sendMessage').map((c) => String(c.payload.chat_id));
  ok(sents.includes('61001') && !sents.includes('61002'), 'گزارش کانال اول فقط به ادمینِ همان کانال رسید');
  // تخلف در کانال دوم ⇒ فقط ادمین ۲ + مالک
  clearCalls();
  await post(cbQuery('tgl:send_text:' + CID2, OWNER));
  await post(chan({ text: 'تخلف کانال دوم برای تست گزارش' }, CID2));
  sents = calls('sendMessage').map((c) => String(c.payload.chat_id));
  ok(sents.includes('61002') && !sents.includes('61001'), 'گزارش کانال دوم فقط به ادمینِ همان کانال رسید');
  ok(sents.includes(String(OWNER)), 'مالک گزارش هر دو کانال را گرفت');
  // پاک‌سازی
  await post(cbQuery('tgl:send_text:' + CID, OWNER));
  await post(cbQuery('tgl:send_text:' + CID2, OWNER));
  await post(cbQuery('admD:61001', OWNER));
  await post(cbQuery('admD:61002', OWNER));
  await post(cbQuery('rej:' + CID2, OWNER));
});

await section('v2.0 — ادمین بدون کانال: نمای خالی + تعیین دسترسی + دکمهٔ همهٔ کانال‌ها', async () => {
  await post(cbQuery('admA', OWNER));
  await post(priv('62001', OWNER));
  ok(lastText().includes('ادمین اضافه شد'), 'ادمین تازه اضافه شد');
  ok(lastText().includes('هیچ کانالی'), 'ویرایشگر با دامنهٔ خالی باز شد');
  // ادمینِ بدون کانال: لیست کانال‌ها خالی با پیام راهنما
  await post(cbQuery('chats', 62001));
  ok(lastEdited().includes('هیچ کانالی به تو اختصاص داده نشده'), 'ادمینِ بدون کانال چیزی نمی‌بیند');
  await post(cbQuery('chat:' + CID, 62001));
  ok(lastAnswer().includes('اختصاص داده نشده'), 'نمای کانال بدون دسترسی رد شد');
  // مالک کانالش را تعیین می‌کند:
  await post(cbQuery('ascT:62001:' + CID, OWNER));
  ok(lastAnswer().includes('داده شد'), 'مالک کانال را به ادمین داد');
  await post(cbQuery('chats', 62001));
  ok(lastEdited().includes('تست کانال'), 'حالا ادمین کانال خودش را می‌بیند');
  // دکمهٔ 🌐 همهٔ کانال‌ها:
  await post(cbQuery('ascW:62001', OWNER));
  ok(lastAnswer().includes('همهٔ کانال‌ها'), 'دامنهٔ «همهٔ کانال‌ها» فعال شد');
  ok(JSON.parse(await env.KV.get('scopes')).a['62001'].ch === '*', 'دامنهٔ * در KV ثبت شد');
  await post(cbQuery('chat:' + CID, 62001));
  ok(lastEdited().includes('تست کانال'), 'با دامنهٔ * هم دسترسی برقرار است');
  await post(cbQuery('ascW:62001', OWNER)); // برگشت به محدود
  ok(lastAnswer().includes('محدود'), 'برگشت به دامنهٔ محدود');
  ok(Array.isArray(JSON.parse(await env.KV.get('scopes')).a['62001'].ch), 'دامنهٔ محدود = آرایهٔ کانال‌ها');
  await post(cbQuery('admD:62001', OWNER));
});

await section('v2.0 — لغو دسترسی وسط کار: FSM و کال‌بک معلق رد می‌شود', async () => {
  await post(cbQuery('admA', OWNER));
  await post(priv('63001', OWNER));
  await post(cbQuery('ascT:63001:' + CID, OWNER));
  // ادمین ساعت زمان‌دار را باز می‌کند (state ثبت می‌شود)
  await post(cbQuery('schS:' + CID, 63001));
  ok(lastAnswer().includes('ساعت شروع'), 'ادمین وارد فرم ساعت شد');
  // مالک دسترسی را می‌گیرد:
  await post(cbQuery('ascT:63001:' + CID, OWNER));
  ok(lastAnswer().includes('گرفته شد'), 'دسترسی وسط کار گرفته شد');
  // حالا ورودی FSM باید رد شود:
  await post(priv('5:30', 63001));
  ok(lastText().includes('دسترسی شما به این کانال وجود ندارد'), 'ورودی FSM بعد از لغو دسترسی رد شد');
  ok(await env.KV.get('state:63001') === null, 'state لغوشده پاک شد');
  // کال‌بک هم رد می‌شود:
  await post(cbQuery('stats:' + CID, 63001));
  ok(lastAnswer().includes('اختصاص داده نشده'), 'کال‌بک بعد از لغو دسترسی رد شد');
  await post(cbQuery('admD:63001', OWNER));
});

await section('v2.0 — ناظر کانالی: فقط تخلف‌های کانال خودش + ویرایشگر فقط مالک', async () => {
  const V2 = '64001';
  const CID2 = '-1002002';
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID2), type: 'channel', title: 'کانال دوم' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('enb:' + CID2, OWNER));
  await post(cbQuery('vwA', OWNER));
  await post(priv(V2, OWNER));
  await post(cbQuery('vscT:' + V2 + ':' + CID2, OWNER)); // ناظر فقط کانال دوم
  // ناظر آمار کانال دوم را می‌بیند:
  await post(cbQuery('stats:' + CID2, Number(V2)));
  ok(lastEdited().includes('آمار تخلفات'), 'ناظرِ کانالی آمار کانال خودش را دید');
  // ولی آمار کانال اول را نه:
  await post(cbQuery('stats:' + CID, Number(V2)));
  ok(lastAnswer().includes('اختصاص داده نشده'), 'ناظر به کانال دیگر راه ندارد');
  // ناظر نمی‌تواند ویرایشگر دسترسی را باز کند (اول گیت ناظر، بعد فقط مالک):
  await post(cbQuery('vsc:' + V2, Number(V2)));
  ok(lastAnswer().includes('مشاهده') || lastAnswer().includes('فقط مالک'), 'ویرایشگر دسترسی برای ناظر بسته است');
  // ناظر نمی‌تواند قفل هم بزند:
  await post(cbQuery('tgl:send_text:' + CID2, Number(V2)));
  ok(lastAnswer().includes('مشاهده'), 'ناظر کانالی هم همچنان فقط مشاهده است');
  await post(cbQuery('vwD:' + V2, OWNER));
  await post(cbQuery('rej:' + CID2, OWNER));
});

await section('v2.0 — مالک: همیشه همهٔ کانال‌ها و همهٔ منوها', async () => {
  const CID2 = '-1002002';
  await post(upd({
    my_chat_member: {
      chat: { id: Number(CID2), type: 'channel', title: 'کانال دوم' },
      new_chat_member: { status: 'administrator' },
    },
  }));
  await post(cbQuery('enb:' + CID2, OWNER));
  await post(cbQuery('chats', OWNER));
  ok(lastEdited().includes('تست کانال') && lastEdited().includes('کانال دوم'), 'مالک هر دو کانال را می‌بیند');
  await post(cbQuery('tgl:send_gif:' + CID2, OWNER));
  ok(lastAnswer().includes('فعال شد'), 'مالک در کانال دوم هم قفل می‌زند');
  await post(cbQuery('tgl:send_gif:' + CID2, OWNER));
  await post(cbQuery('rej:' + CID2, OWNER));
  ok(await env.KV.get('chat:' + CID2) === null, 'کانال دوم پاک‌سازی شد');
});

await section('v2.1 — افزودن گروهی ادمین کانال: لیست → پریست → ارتقای همه', async () => {
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3004001, 3004002، 3004003', OWNER)); // کاما انگلیسی + کامای فارسی
  const sm = calls('sendMessage');
  ok(sm.length >= 1 && sm[sm.length - 1].payload.text.includes('ادمین‌سازی گروهی — 3 نفر'), 'پیام گروهی با شمارش ۳ نفر');
  ok(JSON.stringify(sm[sm.length - 1].payload.reply_markup).includes(`camP:${CID}:basic`), 'پریست‌ها برای گروه هم هستند');
  ok(await env.KV.get('state:' + OWNER) !== null, 'state camB ثبت شد');
  clearCalls();
  await post(cbQuery('camP:' + CID + ':basic', OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 3, 'سه promoteChatMember زده شد');
  ok(pr.every((x) => x.payload.can_post_messages === true && x.payload.can_delete_messages === true && x.payload.can_edit_messages === false), 'پریست معمولی برای هر سه');
  const ids = pr.map((x) => String(x.payload.user_id)).sort();
  ok(JSON.stringify(ids) === JSON.stringify(['3004001', '3004002', '3004003']), 'هر سه شناسه ارتقا یافتند');
  ok(lastEdited().includes('ادمین‌سازی گروهی') && lastEdited().includes('3</b> از 3'), 'گزارش گروهی: ۳ از ۳ موفق');
  ok(JSON.stringify(lastEditedKB()).includes(`camA:${CID}`), 'دکمهٔ «افزودن گروهی بعدی» هست');
  ok(await env.KV.get('state:' + OWNER) === null, 'state بعد از ارتقا پاک شد');
});

await section('v2.1 — گروهی با ورودی کثیف: ارقام فارسی + نامعتبر + یوزرنیم + تکراری', async () => {
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('۵۵۵۰۰۱, abc، @ali, ۵۵۵۰۰۲، ۵۵۵۰۰۱', OWNER));
  const sm = calls('sendMessage');
  ok(sm.length >= 1 && sm[sm.length - 1].payload.text.includes('ادمین‌سازی گروهی — 2 نفر'), 'فقط ۲ شناسهٔ معتبر (تکراری هم حذف شد)');
  ok(sm[sm.length - 1].payload.text.includes('نامعتبر'), 'موارد نامعتبر اعلام شد');
  ok(sm[sm.length - 1].payload.text.includes('یوزرنیم'), 'نکتهٔ یوزرنیم در حالت گروهی آمد');
  await post(cbQuery('camX:' + CID, OWNER));
  ok(await env.KV.get('state:' + OWNER) === null, 'لغو شد');
});

await section('v2.1 — گروهی دستی (خط جدید جداکننده + camG): دسترسی دستی برای همه', async () => {
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3005001\n3005002', OWNER));
  clearCalls();
  await post(cbQuery('camT:' + CID + ':edit', OWNER));
  ok(lastEdited().includes('گروهی'), 'نمای دسترسی حالت گروهی را نشان می‌دهد');
  await post(cbQuery('camG:' + CID, OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 2, 'دو نفر ارتقا یافتند');
  ok(pr.every((x) => x.payload.can_edit_messages === true && x.payload.can_post_messages === true), 'دسترسی دستی برای هر دو');
  ok(lastEdited().includes('ارتقای گروهی انجام شد'), 'گزارش ارتقای گروهی آمد');
});

await section('v2.1 — گروهی با شکست تلگرام: گزارش per-ID با ❌ و دلیل', async () => {
  await post(cbQuery('camA:' + CID, OWNER));
  await post(priv('3006001, 3006002', OWNER));
  clearCalls();
  mockB.failPromoteFor.push(3006002);
  await post(cbQuery('camP:' + CID + ':anon', OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 2, 'هر دو تلاش شد (شکست وسط کار متوقف نمی‌کند)');
  ok(pr.every((x) => x.payload.is_anonymous === true), 'پریست ناشناس برای هر دو اعمال شد');
  const rep = lastEdited();
  ok(rep.includes('1</b> از 2'), 'شمارش موفق/کل درست است');
  ok(rep.includes('❌ <code>3006002</code>'), 'نفر ناموفق با ❌ مشخص شد');
  ok(rep.includes('از قبل ادمین است'), 'دلیل فارسی خطا در گزارش آمد');
  mockB.failPromoteFor = mockB.failPromoteFor.filter((x) => x !== 3006002);
  await post(cbQuery('camX:' + CID, OWNER));
});

await section('v2.1 — افزودن گروهی ادمین‌های ربات: لیست → همه با scope خالی + رد تکراری', async () => {
  await post(cbQuery('admA', OWNER));
  await post(priv('70001, 70002, 70003', OWNER));
  ok(lastText().includes('ادمین‌سازی گروهی — 3 نفر ثبت شد'), 'سه ادمین با هم ثبت شدند');
  const acc1 = JSON.parse(await env.KV.get('scopes'));
  ok(acc1.a['70001'] && acc1.a['70001'].ch.length === 0 && acc1.a['70002'].ch.length === 0 && acc1.a['70003'].ch.length === 0, 'هر سه با scope خالی (امن پیش‌فرض)');
  // تکراری + نامعتبر: فقط جدید اضافه می‌شود
  clearCalls();
  await post(cbQuery('admA', OWNER));
  await post(priv('70001, 70004, abc', OWNER));
  ok(lastText().includes('1 نفر ثبت شد'), 'فقط ادمین جدید اضافه شد');
  ok(lastText().includes('از قبل ادمین بود'), 'تکراری نادیده گرفته شد');
  ok(lastText().includes('نامعتبر'), 'ورودی بد اعلام شد');
  ok(JSON.parse(await env.KV.get('admins')).includes('70004'), '70004 اضافه شد');
  await post(cbQuery('admD:70001', OWNER));
  await post(cbQuery('admD:70002', OWNER));
  await post(cbQuery('admD:70003', OWNER));
  await post(cbQuery('admD:70004', OWNER));
});

await section('v2.1 — افزودن گروهی ناظرها + سقف ۵۰ شناسه', async () => {
  await post(cbQuery('vwA', OWNER));
  await post(priv('80001 80002', OWNER));
  ok(lastText().includes('ناظرهای گروهی — 2 نفر ثبت شد'), 'دو ناظر با هم ثبت شدند');
  ok(JSON.parse(await env.KV.get('viewers')).includes('80001'), 'در لیست ناظرها');
  ok(JSON.parse(await env.KV.get('scopes')).v['80002'].ch.length === 0, 'scope خالی ناظر');
  await post(cbQuery('vwD:80001', OWNER));
  await post(cbQuery('vwD:80002', OWNER));
  // سقف ۵۰ در camA:
  await post(cbQuery('camA:' + CID, OWNER));
  const bigList = Array.from({ length: 51 }, (_, i) => String(90000 + i)).join(', ');
  await post(priv(bigList, OWNER));
  ok(lastText().includes('حداکثر'), 'لیست بلندتر از ۵۰ رد شد');
  ok(await env.KV.get('state:' + OWNER) !== null, 'state برای تلاش دوباره ماند');
  await post(cbQuery('camX:' + CID, OWNER)); // لغو
});

/* ─────────── v2.2 — نام/منشن در لیست‌ها + ویرایش دسترسی ادمین کانال ─────────── */

await section('v2.2 — نام/منشن در لیست ادمین‌ها + کش uinfo', async () => {
  mockB.chatInfo = { '71001': { id: 71001, type: 'private', first_name: 'علی', last_name: 'رضایی', username: 'ali_rezaei' } };
  await post(cbQuery('admA', OWNER));
  await post(priv('71001, 71002', OWNER));
  ok(lastText().includes('ادمین‌سازی گروهی — 2 نفر ثبت شد'), 'دو ادمین از لیست ثبت شدند');
  ok(lastText().includes('@ali_rezaei'), 'نام/منشن شناخته‌شده در گزارش گروهی آمد');
  // نمای لیست ادمین‌ها: 71001 با منشن، 71002 ناشناخته فقط شناسه
  clearCalls();
  await post(cbQuery('admins', OWNER));
  const t1 = lastEdited();
  ok(t1.includes('@ali_rezaei'), 'منشن در لیست ادمین‌ها');
  ok(t1.includes('(<code>71001</code>)'), 'شناسه کنار منشن حفظ شد');
  ok(t1.includes('<code>71002</code>'), 'ادمین ناشناخته فقط با شناسه');
  ok(t1.includes('نام و منشن هر نفر'), 'راهنمای نام/منشن در فوتر لیست');
  const gcAgain = calls('getChat').filter((c) => String(c.payload.chat_id) === '71001').length;
  ok(gcAgain === 0, 'بار دوم از کش uinfo خواند (بدون getChat تازه)');
  // ویرایشگر دسترسی هم نام دارد
  await post(cbQuery('asc:71001', OWNER));
  ok(lastEdited().includes('دسترسی کانالی — ادمین @ali_rezaei'), 'ویرایشگر دسترسی با نام/منشن');
  await post(cbQuery('admD:71001', OWNER));
  await post(cbQuery('admD:71002', OWNER));
});

await section('v2.2 — ویرایش دسترسی ادمین کانال (camE): لود فعلی + اعمال تغییر', async () => {
  mockB.admins = [
    { status: 'creator', user: { id: 555000, first_name: 'صاحب', last_name: 'کانال', username: 'chanowner' } },
    { status: 'administrator', user: { id: 3006005, first_name: 'کامبیز', username: 'kambiz_oz' },
      can_post_messages: true, can_delete_messages: true, can_edit_messages: false, is_anonymous: false,
      can_promote_members: false, can_restrict_members: false, can_change_info: false,
      can_invite_users: false, can_post_stories: false },
  ];
  mockB.memberOf[3006005] = { status: 'administrator', user: { id: 3006005, first_name: 'کامبیز', username: 'kambiz_oz' },
    can_post_messages: true, can_delete_messages: true, can_edit_messages: false, is_anonymous: false,
    can_promote_members: false, can_restrict_members: false, can_change_info: false,
    can_invite_users: false, can_post_stories: false };
  mockB.chatInfo['3006005'] = { id: 3006005, type: 'private', first_name: 'کامبیز', username: 'kambiz_oz' };
  await post(cbQuery('admC:' + CID, OWNER));
  ok(lastEdited().includes('کامبیز'), 'نام ادمین کانال در فهرست آمد');
  const kbEd = lastEditedKB();
  const camEBtn = (kbEd.inline_keyboard || []).flat().find((b) => b.callback_data === 'camE:' + CID + ':3006005');
  ok(!!camEBtn && camEBtn.text.includes('ویرایش'), 'دکمهٔ «ویرایش دسترسی» کنار عزل هست');
  // باز کردن ویرایشگر: دسترسی‌های فعلی لود می‌شود
  await post(cbQuery('camE:' + CID + ':3006005', OWNER));
  const vt = lastEdited();
  ok(vt.includes('ویرایش دسترسی ادمین'), 'عنوان ویرایشگر: ویرایش دسترسی');
  ok(vt.includes('@kambiz_oz'), 'نام/منشن فرد در ویرایشگر آمد');
  // دسترسی‌های فعلی در «دکمه‌ها» لود شده‌اند (نه متن پیام)
  const btnsE = (lastEditedKB().inline_keyboard || []).flat();
  ok(btnsE.some((b) => b.text === '❌ ارتقای ادمین‌ها' && b.callback_data === 'camT:' + CID + ':prom'), 'دسترسی فعلی (prom=false) درست لود شد');
  ok(btnsE.some((b) => b.text === '✅ ارسال پست' && b.callback_data === 'camT:' + CID + ':post'), 'دسترسی فعلی (post=true) درست لود شد');
  // toggle «ارتقای ادمین‌ها» و تأیید
  await post(cbQuery('camT:' + CID + ':prom', OWNER));
  await post(cbQuery('camG:' + CID, OWNER));
  const pr = calls('promoteChatMember');
  ok(pr.length === 1 && String(pr[0].payload.user_id) === '3006005', 'ارتقا برای همان فرد رفت');
  ok(pr[0].payload.can_promote_members === true, 'تغییر دسترسی اعمال شد (prom=true)');
  ok(pr[0].payload.can_post_messages === true, 'دسترسی‌های قبلی حفظ شد (post=true)');
  ok(lastEdited().includes('دسترسی‌ها بروز شد'), 'پیام موفقیت حالت ویرایش');
  ok(lastAnswer().includes('دسترسی‌ها بروز شد'), 'toast موفقیت ویرایش');
  // مالک کانال قابل ویرایش نیست
  mockB.memberOf[555000] = { status: 'creator', user: { id: 555000, first_name: 'صاحب', username: 'chanowner' } };
  await post(cbQuery('camE:' + CID + ':555000', OWNER));
  ok(lastAnswer().includes('مالک کانال قابل ویرایش نیست'), 'گارد مالک کانال');
  // پاک‌سازی
  mockB.admins = null;
  delete mockB.memberOf[3006005];
  delete mockB.memberOf[555000];
  mockB.chatInfo = {};
});

await section('v2.2 — گیت‌ها: ناظر روی «ویرایش دسترسی» رد می‌شود', async () => {
  await post(cbQuery('vwA', OWNER));
  await post(priv('80010, 80011', OWNER));
  ok(lastText().includes('ناظرهای گروهی — 2 نفر ثبت شد'), 'ناظرهای تستی ثبت شدند');
  await post(cbQuery('camE:' + CID + ':3006005', 80010));
  ok(lastAnswer().includes('ناظر فقط اجازهٔ مشاهده دارد'), 'ناظر روی camE رد شد');
  await post(cbQuery('vwD:80010', OWNER));
  await post(cbQuery('vwD:80011', OWNER));
});

/* ============================ 🌐 v2.3 — دوزبانه (FA/EN) ============================ */

await section('v2.3 — تغییر زبان شخصی با دکمهٔ 🌐', async () => {
  await post(cbQuery('lang', OWNER));
  ok(lastAnswer().includes('Language: English'), 'پاسخ toggle انگلیسی شد');
  ok((await env.KV.get('ulang:' + OWNER)) === 'en', 'زبان شخصی مالک در KV ذخیره شد (en)');
  await post(cbQuery('home', OWNER));
  ok(lastEdited().includes('Anti-Treason Channel Guard'), 'منوی اصلی حالا انگلیسی است');
  const kbH = lastEditedKB();
  ok(JSON.stringify(kbH).includes('فارسی'), 'دکمهٔ زبان حالا برچسب فارسی دارد (برای بازگشت)');
});

await section('v2.3 — جریان‌های پنل به انگلیسی', async () => {
  await post(priv('/start', OWNER));
  ok(lastText().includes('Anti-Treason Channel Guard'), '/start انگلیسی');
  await post(cbQuery('help', OWNER));
  ok(lastEdited().includes('Anti-Treason Bot Guide'), 'help انگلیسی');
  await post(cbQuery('chats', OWNER));
  ok(lastEdited().includes('My channels'), 'کانال‌های من → My channels');
  await post(cbQuery('chat:' + CID, OWNER));
  ok(lastEdited().includes('Active locks'), 'نمای کانال انگلیسی (Active locks)');
  await post(cbQuery('locks:' + CID, OWNER));
  const kbL = lastEditedKB();
  ok(JSON.stringify(kbL).includes('Full lock'), 'لیبل قفل‌ها ترجمه شد (Full lock)');
  await post(cbQuery('tgl:badkey:' + CID, OWNER));
  ok(lastAnswer().includes('Invalid lock'), 'پاسخ callback ترجمه شد (Invalid lock)');
  await post(cbQuery('myid', OWNER));
  ok(lastEdited().includes('Your ID'), 'myid انگلیسی');
});

await section('v2.3 — جداسازی زبان کاربران (هر نفر زبان خودش)', async () => {
  // از فلو خود ربات استفاده می‌کنیم تا کش درون-ایزوله (acache/pcache) هم به‌روز شود
  const adm0 = JSON.parse((await env.KV.get('admins')) || '[]');
  if (adm0.includes(String(ADMIN))) await post(cbQuery('admD:' + ADMIN, OWNER));
  await post(cbQuery('admA', OWNER));
  await post(priv(String(ADMIN), OWNER));
  await post(priv('/start', ADMIN));
  ok(lastText().includes('دسترسی تو'), 'ادمینِ دیگر هنوز فارسی می‌بیند (زبان شخصی جداست)');
  const kbAdm = (calls('sendMessage').slice(-1)[0].payload.reply_markup) || {};
  ok(JSON.stringify(kbAdm).includes('English'), 'دکمهٔ زبان برای کاربر فارسی‌زبان English نشان می‌دهد');
});

await section('v2.3 — /setlang مالک + گاردها', async () => {
  await post(priv('/setlang', ADMIN));
  ok(lastText().includes('دسترسی ندارید'), '/setlang برای غیرمالک رد شد');
  await post(priv('/setlang', OWNER));
  ok(lastText().includes('Usage'), 'بدون آرگومان → راهنما (انگلیسی چون مالک en است)');
  await post(priv('/setlang en', OWNER));
  ok(lastText().includes('Default bot language: English'), 'زبان پیش‌فرض → انگلیسی');
  ok((await env.KV.get('lang')) === 'en', 'کلید lang در KV = en');
});

await section('v2.3 — گزارش‌ها از زبان پیش‌فرض ربات پیروی می‌کنند', async () => {
  await setLock('send_text', true);
  await post(chan({ text: 'پست ممنوع' }));
  ok(delCalls().length >= 1, 'تخلف حذف شد');
  ok(lastText().includes('Violation deleted'), 'گزارش حذف به انگلیسی رسید (زبان پیش‌فرض ربات)');
  await post(priv('/setlang fa', OWNER));
  ok(lastText().includes('زبان پیش‌فرض ربات: فارسی'), 'زبان پیش‌فرض برگشت به فارسی');
  await post(chan({ text: 'پست ممنوع ۲' }));
  ok(lastText().includes('تخلف حذف شد'), 'گزارش دوباره فارسی شد');
  await post(cbQuery('tgl:send_text:' + CID, OWNER)); // خاموش برای پاک‌سازی
  await post(cbQuery('lang', OWNER)); // برگشت زبان شخصی مالک به فارسی برای تمیزی
  ok(lastAnswer().includes('زبان: فارسی'), 'زبان شخصی مالک برگشت فارسی');
});

await section('v1.8 — پاک‌سازی: وضعیت خاموش + undoهای باقی‌مانده در پایان', async () => {
  await setMode('off');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).punishMode === 'off', 'punishMode خاموش شد');
  const undoLeft = await env.KV.get(`undo:${CID}:4455`);
  ok(undoLeft !== null, 'undo تستی 4455 هنوز در KV است (انقضای ۲۴h خودکار)');
});

/* ───────────────────────── v2.4: آخرین تلگرام — آلبوم، تایپ‌های جدید، مالکیت، استایل ───────────────────────── */

await section('v2.4 — هشدار تغییر مالکیت کانال', async () => {
  clearCalls();
  await post(upd({ channel_post: { message_id: 910, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), chat_owner_changed: { new_owner_user: { id: 555, first_name: 'نوآر', username: 'newowner' } } } }));
  const sends = calls('sendMessage');
  ok(sends.some((c) => String(c.payload.chat_id) === String(OWNER) && /مالکیت کانال تغییر کرد/.test(c.payload.text || '')), 'هشدار تغییر مالکیت به مالک رفت');
  const own = sends.find((c) => /مالکیت کانال تغییر کرد/.test(c.payload.text || ''));
  ok(own && /@newowner/.test(own.payload.text) && /555/.test(own.payload.text), 'یوزرنیم و شناسهٔ مالک جدید در هشدار هست');
  ok(delCalls().length === 0, 'پیام سیستمی حذف نشد');
  await post(upd({ channel_post: { message_id: 911, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), chat_owner_left: {} } }));
  ok(calls('sendMessage').some((c) => /مالک قبلی کانال رو ترک کرد/.test(c.payload.text || '')), 'هشدار ترک مالکیت هم کار می‌کند');
});

await section('v2.4 — پیام‌های سیستمی تایپ‌های جدید + آپدیت ناشناخته', async () => {
  clearCalls();
  await post(upd({ channel_post: { message_id: 912, chat: { id: Number(CID), type: 'channel', title: 'تست کانال' }, date: Math.floor(realNow() / 1000), poll_option_added: {} } }));
  ok(delCalls().length === 0 && calls('sendMessage').length === 0, 'poll_option_added بی‌صدا نادیده شد');
  const r = await post(upd({ subscription: { star_count: 5 } }));
  ok(r.status === 200, 'آپدیت subscription → 200 بدون کرش');
  ok(calls('sendMessage').length === 0 && calls('editMessageText').length === 0, 'آپدیت ناشناخته هیچ کاری نکرد (fast-path)');
  const r2 = await post(upd({ stopped_message_generation: {} }));
  ok(r2.status === 200, 'stopped_message_generation → 200');
});

await section('v2.4 — چک‌لیست/پیام ریچ زیر قفل ناشناس + عکس زنده زیر قفل عکس', async () => {
  await setLock('lock_anon', true);
  clearCalls();
  await post(chan({ message_id: 913, checklist: { title: 'کارهای هفته' } }));
  ok(delCalls().some((c) => c.payload.message_id === 913), 'چک‌لیست ناشناس حذف شد');
  await post(chan({ message_id: 914, rich_message: { blocks: [] } }));
  ok(delCalls().some((c) => c.payload.message_id === 914), 'پیام ریچ ناشناس حذف شد');
  const lastDel = calls('sendMessage').filter((c) => /تخلف حذف شد/.test(c.payload.text || ''));
  ok(lastDel.length && /چک\u200cلیست|Rich|rich/.test(lastDel[lastDel.length - 1].payload.text), 'گزارش شامل برچسب تایپ جدید است');
  await setLock('lock_anon', false);
  await setLock('send_photo', true);
  clearCalls();
  await post(chan({ message_id: 915, live_photo: { file_id: 'lp1' } }));
  ok(delCalls().some((c) => c.payload.message_id === 915), 'عکس زنده با قفل ارسال عکس حذف شد');
  await setLock('send_photo', false);
});

await section('v2.4 — آلبوم/اسلایدشو: حذف کل آلبوم', async () => {
  await setLock('send_photo', true);
  clearCalls();
  await post(chan({ message_id: 921, media_group_id: 'albumX', photo: [{ file_id: 'p1' }] }));
  await post(chan({ message_id: 922, media_group_id: 'albumX', photo: [{ file_id: 'p2' }] }));
  await post(chan({ message_id: 923, media_group_id: 'albumX', photo: [{ file_id: 'p3' }] }));
  const mids = new Set(delCalls().map((c) => c.payload.message_id));
  ok([921, 922, 923].every((m) => mids.has(m)), 'هر ۳ قسمت آلبوم حذف شد');
  clearCalls();
  await post(chan({ message_id: 930, media_group_id: 'albumY', photo: [{ file_id: 'q1' }] }));
  ok(delCalls().some((c) => c.payload.message_id === 930), 'آلبوم بعدی هم به‌درستی قفل خورد');
  await setLock('send_photo', false);
});

await section('v2.4 — استایل رنگی دکمه‌ها + افکت /start', async () => {
  clearCalls();
  await post(upd({ my_chat_member: { chat: { id: -1008888, type: 'channel', title: 'کانال نو' }, new_chat_member: { status: 'administrator' } } }));
  const mk = JSON.stringify(calls('sendMessage').slice(-1)[0].payload.reply_markup || {});
  ok(mk.includes('"style":"success"'), 'دکمهٔ فعال‌سازی سبز است (success)');
  ok(mk.includes('"style":"danger"'), 'دکمهٔ رد کردن قرمز است (danger)');
  await env.KV.delete('chat:-1008888');
  await env.KV.delete('stat:-1008888');
  await env.KV.delete('vlog:-1008888');
  clearCalls();
  await post(cbQuery(`chat:${CID}`, OWNER));
  const ck = JSON.stringify(lastEditedKB());
  ok(ck.includes('"style":"danger"'), 'دکمهٔ قفل آنی (بستن) در پنل کانال قرمز است');
  clearCalls();
  await post(priv('/start', OWNER));
  const st = calls('sendMessage').slice(-1)[0];
  ok(st && st.payload.message_effect_id === '5104841245755180586', 'پیام /start با افکت 🔥 ارسال شد');
});

/* ───────────────────────── v2.5: اعلان قفل‌ها در خودِ کانال ───────────────────────── */

await section('v2.5 — اعلان قفل آنی در خودِ کانال (روشن/خاموش)', async () => {
  let s = JSON.parse(await env.KV.get('chat:' + CID));
  s.username = 'testchan'; // 📣 v2.6: برای تولید «🗣 t.me/testchan» در chanLine
  s.instant = { on: false, at: 0 };
  await env.KV.put('chat:' + CID, JSON.stringify(s));
  clearCalls();
  await post(cbQuery('instT:' + CID, OWNER));
  const on = calls('sendMessage').find((c) => String(c.payload.chat_id) === String(CID) && /قفل آنی به دستور اونر فعال شد !!/.test(c.payload.text || ''));
  ok(!!on && /تا باز شدن صبور باشید/.test(on.payload.text) && /<b>/.test(on.payload.text), 'روشن\u200cشدن قفل آنی → اعلان «قفل آنی به دستور اونر فعال شد !!» بولد در خودِ کانال');
  ok(/🗣 t\.me\//.test(on.payload.text), 'اعلان قفل آنی: خط کانال «🗣 t.me/...» زیر پیام');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).instant.on === true, 'قفل آنی در KV روشن شد');
  await post(chan({ text: 'پست در قفل آنی' }));
  ok(delCalls().length === 1, 'رفتار قفل آنی سر جایش است (حذف فوری)');
  clearCalls();
  await post(cbQuery('instT:' + CID, OWNER));
  const off = calls('sendMessage').find((c) => String(c.payload.chat_id) === String(CID) && /قفل آنی خاموش شد !!/.test(c.payload.text || ''));
  ok(!!off && /میتونید استارت بزنید/.test(off.payload.text) && /<b>/.test(off.payload.text), 'خاموش\u200cشدن → اعلان «قفل آنی خاموش شد !! ... میتونید استارت بزنید ...» بولد');
  ok(JSON.parse(await env.KV.get('chat:' + CID)).instant.on === false, 'قفل آنی خاموش شد');
  await post(chan({ text: 'پست بعد از خاموشی' }));
  ok(delCalls().length === 0, 'بعد از خاموش\u200cشدن، حذفی نیست');
});

await section('v2.5 — کرون هر دقیقه: اعلان شروع/پایان بازهٔ قفل زمان\u200cدار (بدون اسپم)', async () => {
  const st0 = JSON.parse(await env.KV.get('chat:' + CID));
  st0.username = 'testchan'; // 📣 v2.6: برای تولید «🗣 t.me/testchan» در chanLine
  st0.schedule = { enabled: true, start: 240, end: 480, mode: 'all' };
  await env.KV.put('chat:' + CID, JSON.stringify(st0));
  await env.KV.delete('sched:' + CID);
  freezeTehran(3, 59); // بیرون بازه
  clearCalls();
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  ok(calls('sendMessage').length === 0, 'اولین اجرا (بیرون بازه) → فقط ثبت وضعیت، بدون اعلان');
  ok(JSON.parse(await env.KV.get('sched:' + CID)).in === 0, 'وضعیت sched در KV ثبت شد (in=0)');
  freezeTehran(4, 0); // لحظهٔ شروع بازه
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  const st1 = calls('sendMessage').find((c) => String(c.payload.chat_id) === String(CID) && /قفل میمونه/.test(c.payload.text || ''));
  ok(!!st1 && /04:00/.test(st1.payload.text) && /08:00/.test(st1.payload.text) && /تا پایان این بازه ؛ فعالیت ممنوع است/.test(st1.payload.text) && /<b>/.test(st1.payload.text), 'شروع بازه → اعلان «چنل از این لحظه ( ساعت 04:00 ) تا پایان قفل ( ساعت 08:00 ) قفل میمونه» بولد');
  ok(/🗣 t\.me\//.test(st1.payload.text), 'اعلان شروع بازه: خط کانال زیر پیام');
  ok(JSON.parse(await env.KV.get('sched:' + CID)).in === 1, 'وضعیت داخل بازه ثبت شد (in=1)');
  clearCalls();
  freezeTehran(5, 30); // وسط بازه — تیک\u200cهای بعدی
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  ok(calls('sendMessage').length === 0, 'تیک\u200cهای وسط بازه → بدون اعلان تکراری (بدون اسپم)');
  freezeTehran(8, 0); // لحظهٔ پایان بازه (پایان انحصاری)
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  const st2 = calls('sendMessage').find((c) => String(c.payload.chat_id) === String(CID) && /چنل بازه !! تایم قفل\u200cزماندار تموم شد/.test(c.payload.text || ''));
  ok(!!st2 && /<b>/.test(st2.payload.text) && /🗣 t\.me\//.test(st2.payload.text), 'پایان بازه → اعلان «چنل بازه !! تایم قفل‌زماندار تموم شد» بولد + خط کانال');
  ok(JSON.parse(await env.KV.get('sched:' + CID)).in === 0, 'وضعیت بیرون بازه ثبت شد (in=0)');
  clearCalls();
  freezeTehran(9, 0);
  await worker.scheduled({ cron: '* * * * *' }, env, ctx);
  ok(calls('sendMessage').length === 0, 'تیک بعد از پایان → باز هم بدون اعلان');
});

await section('v2.5 — فعال/غیرفعال\u200cسازی دستی: داخل بازه = اعلان؛ بیرون بازه = بی\u200cاعلان', async () => {
  await env.KV.delete('sched:' + CID);
  freezeTehran(5, 0); // داخل بازهٔ 04:00–08:00
  const s3 = JSON.parse(await env.KV.get('chat:' + CID));
  s3.schedule = { enabled: false, start: 240, end: 480, mode: 'edit' };
  await env.KV.put('chat:' + CID, JSON.stringify(s3));
  clearCalls();
  await post(cbQuery('schT:' + CID, OWNER));
  const a1 = calls('sendMessage').find((c) => String(c.payload.chat_id) === String(CID) && /قفل میمونه/.test(c.payload.text || ''));
  ok(!!a1 && /فعالیت ممنوع است/.test(a1.payload.text) && /<b>/.test(a1.payload.text), 'فعال\u200cسازی داخل بازه → اعلان شروع فوری + خط «فعالیت ممنوع است» بولد');
  ok(JSON.parse(await env.KV.get('sched:' + CID)).in === 1, 'وضعیت در KV = داخل بازه');
  clearCalls();
  await post(cbQuery('schT:' + CID, OWNER));
  ok(calls('sendMessage').some((c) => String(c.payload.chat_id) === String(CID) && /چنل بازه !! تایم قفل\u200cزماندار تموم شد/.test(c.payload.text || '')), 'خاموش\u200cکردن داخل بازه → اعلان پایان «چنل بازه !!»');
  ok(JSON.parse(await env.KV.get('sched:' + CID)).in === 0, 'وضعیت در KV = بیرون بازه');
  freezeTehran(9, 0); // بیرون بازه
  clearCalls();
  await post(cbQuery('schT:' + CID, OWNER));
  ok(calls('sendMessage').length === 0, 'فعال\u200cسازی بیرون بازه → بدون اعلان (کرون سر وقتش اعلام می\u200cکند)');
  await post(cbQuery('schT:' + CID, OWNER)); // برگشت به وضعیت قبل: خاموش
  const fin = JSON.parse(await env.KV.get('chat:' + CID));
  ok(fin.schedule.enabled === false, 'وضعیت نهایی: قفل زمان\u200cدار خاموش (مثل قبل از تست)');
  await env.KV.delete('sched:' + CID);
  unfreeze();
});


/* ───────────────────────── v2.6: toggle اعلان قفل + عدم ارسال ───────────────────────── */

await section('v2.6 — کلید «اعلان قفل»: خاموش‌کردن = بدون اعلان در کانال', async () => {
  // ابتدا اعلان روشن است (پیش‌فرض)
  let s = JSON.parse(await env.KV.get('chat:' + CID));
  s.ann = true;
  s.instant = { on: false, at: 0 };
  await env.KV.put('chat:' + CID, JSON.stringify(s));
  clearCalls();
  await post(cbQuery('annT:' + CID, OWNER));
  ok(/اعلان قفل در کانال خاموش شد/.test(lastAnswer()), 'پاسخ دکمه: «اعلان قفل در کانال خاموش شد»');
  s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.ann === false, 'ann در KV = false (خاموش)');
  // حالا قفل آنی را روشن کنیم — نباید در کانال اعلان ارسال شود
  clearCalls();
  await post(cbQuery('instT:' + CID, OWNER));
  const leakOn = calls('sendMessage').some((c) => String(c.payload.chat_id) === String(CID) && /قفل آنی/.test(c.payload.text || ''));
  ok(!leakOn, 'با ann=false → قفل آنی روشن شد ولی در کانال اعلان نشد');
  // خاموش کردن قفل آنی هم نباید اعلان داشته باشد
  clearCalls();
  await post(cbQuery('instT:' + CID, OWNER));
  const leakOff = calls('sendMessage').some((c) => String(c.payload.chat_id) === String(CID) && /قفل آنی/.test(c.payload.text || ''));
  ok(!leakOff, 'با ann=false → قفل آنی خاموش شد ولی در کانال اعلان نشد');
  // روشن کردن دوبارهٔ اعلان
  await post(cbQuery('annT:' + CID, OWNER));
  s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.ann === true, 'ann دوباره روشن شد');
  // حالا قفل آنی روشن شود — باید اعلان برود
  s.instant = { on: false, at: 0 };
  await env.KV.put('chat:' + CID, JSON.stringify(s));
  clearCalls();
  await post(cbQuery('instT:' + CID, OWNER));
  const okAnn = calls('sendMessage').some((c) => String(c.payload.chat_id) === String(CID) && /قفل آنی به دستور اونر فعال شد/.test(c.payload.text || ''));
  ok(okAnn, 'با ann=true → اعلان قفل آنی در کانال ارسال شد');
  // برگرداندن به حالت اول
  await post(cbQuery('instT:' + CID, OWNER)); // خاموش
  s = JSON.parse(await env.KV.get('chat:' + CID));
  ok(s.instant.on === false, 'قفل آنی خاموش شد (بازگشت به حالت اول)');
});

/* ───────────────────────── v2.7: ارسال پیام/همگانی + حذف پیام‌های اخیر ───────────────────────── */

await section('v2.7 — ارسال پیام به کانال (فقط مالک): pick → تأیید → copyMessage', async () => {
  await post(cbQuery(`bc1:${CID}`, ADMIN));
  ok(lastAnswer().includes('فقط مالک'), 'غریبه روی «ارسال پیام به کانال» رد شد');
  await post(cbQuery(`bc1:${CID}`, OWNER));
  ok(calls('sendMessage').some((c) => /ارسال پیام به کانال/.test(c.payload.text || '')), 'راهنمای گام‌به‌گام «ارسال پیام به کانال» با دکمهٔ لغو فرستاده شد');
  ok(JSON.parse(await env.KV.get('state:' + OWNER)).t === 'bcPick', 'state bcPick ثبت شد');
  clearCalls();
  await post(upd({ message: { message_id: 9001, chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'O' }, photo: [{ file_id: 'ph1' }], caption: 'پست آزمایشی' } }));
  ok(calls('forwardMessage').length === 1, 'پیش‌نمایش با forwardMessage به مالک رفت');
  const st1 = JSON.parse(await env.KV.get('state:' + OWNER));
  ok(st1.t === 'bcGo' && String(st1.cid) === String(CID) && st1.sm === 9001, 'state bcGo با مقصد/منبع درست');
  clearCalls();
  await post(cbQuery('bcGo', OWNER));
  const cp = calls('copyMessage').find((c) => String(c.payload.chat_id) === String(CID));
  ok(!!cp && Number(cp.payload.from_chat_id) === OWNER && cp.payload.message_id === 9001, 'copyMessage به کانال با منبع درست (بدون هدر فوروارد)');
  ok(lastAnswer().includes('ارسال شد'), 'پاسخ موفقیت ارسال');
  const stAfter = await env.KV.get('state:' + OWNER);
  ok(stAfter === null || stAfter === undefined, 'state بعد از ارسال پاک شد');
});

await section('v2.7 — لغو ارسال پیام', async () => {
  await post(cbQuery(`bc1:${CID}`, OWNER));
  await post(upd({ message: { message_id: 9002, chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'O' }, text: 'متن لغوی' } }));
  clearCalls();
  await post(cbQuery('bcX', OWNER));
  const stx = await env.KV.get('state:' + OWNER);
  ok(stx === null || stx === undefined, 'state پاک شد');
  ok(calls('copyMessage').length === 0, 'هیچی کپی نشد');
});

await section('v2.7 — پیام همگانی به همهٔ کانال‌های فعال', async () => {
  const CID2 = '-1002002';
  await env.KV.put('chat:' + CID2, JSON.stringify({ title: 'کانال دوم', username: 'chan2', locks: {}, active: true, instant: { on: false, at: 0 }, schedule: { enabled: false, start: 240, end: 1200, mode: 'all' }, punishMode: 'off', banHours: 0, ann: true }));
  await post(cbQuery('bcAll', OWNER));
  ok(calls('sendMessage').some((c) => /پیام همگانی/.test(c.payload.text || '')), 'راهنمای گام‌به‌گام «پیام همگانی» با دکمهٔ لغو فرستاده شد');
  await post(upd({ message: { message_id: 9003, chat: { id: OWNER, type: 'private' }, from: { id: OWNER, first_name: 'O' }, text: 'اعلام عمومی' } }));
  clearCalls();
  await post(cbQuery('bcGo', OWNER));
  const cps = calls('copyMessage');
  ok(cps.some((c) => String(c.payload.chat_id) === String(CID)), 'همگانی → کانال ۱');
  ok(cps.some((c) => String(c.payload.chat_id) === String(CID2)), 'همگانی → کانال ۲');
  ok(calls('sendMessage').some((c) => /پیام همگانی ارسال شد/.test(c.payload.text || '')), 'گزارش همگانی با شمارنده ۲/۲');
  await env.KV.delete('chat:' + CID2);
});

await section('v2.7 — حذف N پیام آخر: عدد → تأیید → deleteMessage + پاکسازی حلقه', async () => {
  const ids = [];
  for (let i = 1; i <= 12; i++) ids.push(7000 + i);
  await env.KV.put('msgs:' + CID, JSON.stringify(ids));
  await post(cbQuery(`dLM:${CID}`, ADMIN));
  ok(lastAnswer().includes('فقط مالک'), 'غریبه روی «حذف پیام‌های اخیر» رد شد');
  await post(cbQuery(`dLM:${CID}`, OWNER));
  ok(calls('sendMessage').some((c) => /چند پیام آخر این کانال پاک بشه/.test(c.payload.text || '')), 'راهنمای گام‌به‌گام «حذف پیام‌های اخیر» با دکمهٔ لغو فرستاده شد');
  await post(priv('abc', OWNER));
  ok(lastText().includes('۱ تا ۴۰'), 'عدد نامعتبر → خطا و دوباره‌خوانی');
  clearCalls();
  await post(priv('۵', OWNER)); // ارقام فارسی هم قبول است
  const stD = JSON.parse(await env.KV.get('state:' + OWNER));
  ok(stD.t === 'dLGo' && JSON.stringify(stD.ids) === JSON.stringify([7008, 7009, 7010, 7011, 7012]), '۵ پیام آخر انتخاب شد (ارقام فارسی)');
  clearCalls();
  await post(cbQuery(`dlGo:${CID}`, OWNER));
  const dels = calls('deleteMessage').map((c) => c.payload.message_id);
  ok(JSON.stringify(dels) === JSON.stringify([7008, 7009, 7010, 7011, 7012]), 'دقیقاً ۵ پیام آخر deleteMessage شد');
  ok(lastAnswer().includes('۵ پیام پاک شد'), 'گزارش تعداد پاک‌شده');
  const left = JSON.parse(await env.KV.get('msgs:' + CID));
  ok(JSON.stringify(left) === JSON.stringify([7001, 7002, 7003, 7004, 7005, 7006, 7007]), 'حلقه بعد از حذف، فقط پیام‌های باقی را نگه داشت');
  await env.KV.delete('msgs:' + CID);
});

await section('v2.7 — ردیابی خودکار پست کانال در حلقه', async () => {
  await env.KV.delete('msgs:' + CID);
  await post(chan({ text: 'پست برای ردیابی' }));
  const tracked = JSON.parse(await env.KV.get('msgs:' + CID) || '[]');
  ok(Array.isArray(tracked) && tracked.length >= 1, 'پست جدید کانال خودکار ثبت شد (فلاش تایمردار)');
  await env.KV.delete('msgs:' + CID);
});

/* ───────────────────────── v2.8: راهنماهای تعاملی + fallback ربات قبلی ───────────────────────── */

await section('v2.8 — راهنمای تعاملی «افزودن ادمین ربات» + نمایش نام بعد از ثبت', async () => {
  await post(cbQuery('admA', OWNER));
  const g = calls('sendMessage').find((c) => /افزودن ادمین ربات/.test(c.payload.text || ''));
  ok(!!g && /myid|userinfobot/.test(g.payload.text || ''), 'راهنمای گام‌به‌گام با روش گرفتن شناسه فرستاده شد');
  ok(JSON.stringify((g && g.payload.reply_markup) || {}).includes('bcX'), 'دکمهٔ «لغو» کنار راهنما هست');
  ok(lastAnswer().includes('راهنما'), 'تُست کوتاه: راهنما فرستاده شد');
  clearCalls();
  await post(priv('515151', OWNER));
  const added = calls('sendMessage').find((c) => /ادمین اضافه شد/.test(c.payload.text || ''));
  ok(!!added && /👤/.test(added.payload.text || ''), 'بعد از ثبت، نام/منشن فرد هم کنار پیام موفقیت آمد');
  clearCalls();
  await post(cbQuery('admD:515151', OWNER));
  ok(lastAnswer().includes('حذف شد'), 'ادمین آزمایشی حذف شد (پاکسازی)');
});

await section('v2.8 — راهنمای تعاملی ادمین‌سازی کانال + حذف پیام‌های اخیر', async () => {
  await post(cbQuery(`camA:${CID}`, OWNER));
  const gC = calls('sendMessage').find((c) => /ادمین‌سازی در کانال/.test(c.payload.text || ''));
  ok(!!gC && JSON.stringify(gC.payload.reply_markup || {}).includes('bcX'), 'راهنمای ادمین‌سازی کانال + دکمهٔ لغو فرستاده شد');
  clearCalls();
  await post(cbQuery(`dLM:${CID}`, OWNER));
  const gD = calls('sendMessage').find((c) => /حذف پیام‌های اخیر/.test(c.payload.text || ''));
  ok(!!gD && JSON.stringify(gD.payload.reply_markup || {}).includes('bcX'), 'راهنمای حذف پیام‌های اخیر + دکمهٔ لغو فرستاده شد');
});

await section('v2.8 — عزل ادمینِ ساختهٔ ربات قبلی (fallback خودکار توکن)', async () => {
  env.LEGACY_BOT_TOKEN = 'LEGACYTOKEN';
  mockB.failPromoteFor = [555];
  clearCalls();
  await post(cbQuery(`camD2:${CID}:555`, OWNER));
  const prs = calls('promoteChatMember');
  ok(prs.length === 2, 'دو تلاش انجام شد: اول ربات اصلی، بعد ربات قبلی');
  ok(prs.length === 2 && prs[0].tok === 'TESTTOKEN' && prs[1].tok === 'LEGACYTOKEN', 'تلاش دوم با توکن ربات قبلی بود');
  ok(lastAnswer().includes('عزل شد') && lastAnswer().includes('ربات قبلی'), 'عزل موفق + یادداشت «با ربات قبلی» در پاسخ');
  mockB.failPromoteFor = [];
  delete env.LEGACY_BOT_TOKEN;
});

/* ---------------------------- جمع‌بندی ---------------------------- */

unfreeze();
console.log('\n────────────────────────────');
console.log(`✅ موفق: ${pass}   ❌ ناموفق: ${fail}`);
console.log('────────────────────────────');
process.exit(fail ? 1 : 0);
