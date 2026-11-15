// نقطه ورود مشترک همه هندلرها: ساخت env، اجرای کرون تنبل،
// فراخوانی routeUpdate کد اصلی، و await کردن کارهای پس‌زمینه.
import { routeUpdate, schedTick } from './core.js';
import { makeEnv } from './env.js';

// کرون هر دقیقه ورکر در tgcloud معادلی ندارد؛ به‌جاش کل کرون حداکثر
// هر ۶۰ ثانیه یک بار — با اولین آپدیتی که بعد از آن برسد — اجرا می‌شود
// (زمان آخرین اجرا در KV نگه داشته می‌شود). چنل بی‌ترافیک اعلان شروع/پایان
// قفل و پایان سکوت را با تاخیر می‌گیرد، ولی هیچ سکوتی برای همیشه نمی‌ماند.
async function maybeSchedTick(env) {
  try {
    const last = await env.KV.get('sched:last');
    const now = Date.now();
    if (last && now - Number(last) < 60000) return;
    await env.KV.put('sched:last', String(now));
    await schedTick(env);
  } catch (e) { /* کرون هیچ‌وقت نباید جلوی پاسخ به آپدیت را بگیرد */ }
}

export async function dispatch(update) {
  const env = await makeEnv();
  const bg = [];
  const ctx = { waitUntil(p) { bg.push(Promise.resolve(p).catch(() => {})); } };
  try {
    await maybeSchedTick(env);
    await routeUpdate(update, env, ctx);
  } finally {
    // در ورکر، waitUntil یعنی «بعد از جواب هم ادامه بده»؛ در tgcloud
    // ایزوله بعد از هندلر می‌میرد، پس همه فلاش‌ها همین‌جا await می‌شوند.
    await Promise.all(bg);
  }
}
