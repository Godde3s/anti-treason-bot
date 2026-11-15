// شیم env برای کد ورکر: همان شکلی که Cloudflare به کد می‌داد
// (env.KV / env.OWNER_ID / ...) را روی دیتابیس tgcloud بازسازی می‌کند.
import db, { eq, like } from 'sdk/db';
import { kv } from '../schema.js';

function kvShim() {
  async function kvGet(key) {
    const row = await db.select().from(kv).where(eq(kv.k, key)).get();
    if (!row) return null;
    if (row.exp && row.exp * 1000 <= Date.now()) {
      await db.delete(kv).where(eq(kv.k, key)).run().catch(() => {});
      return null;
    }
    return row.v;
  }
  return {
    get: kvGet,
    async put(key, value, opts) {
      const exp = opts && opts.expirationTtl
        ? Math.floor(Date.now() / 1000) + Number(opts.expirationTtl)
        : null;
      const v = String(value);
      await db.insert(kv).values({ k: key, v, exp })
        .onConflictDoUpdate({ target: kv.k, set: { v, exp } })
        .run();
    },
    async delete(key) {
      await db.delete(kv).where(eq(kv.k, key)).run();
    },
    /** 🔒 درج اتمیِ «فقط اگر نبود»: برای ادعای انحصاری گذارها — true یعنی این فراخوانی برنده شد
     *  (درج روی کلید اصلی اتمی است؛ خواندنِ بعد از آن فقط برنده را مشخص می‌کند). */
    async putIfAbsent(key, value, opts) {
      const exp = opts && opts.expirationTtl
        ? Math.floor(Date.now() / 1000) + Number(opts.expirationTtl)
        : null;
      const v = String(value);
      await db.insert(kv).values({ k: key, v, exp }).onConflictDoNothing().run();
      const cur = await kvGet(key);
      return cur === v;
    },
    async list({ prefix }) {
      const rows = await db.select().from(kv)
        .where(like(kv.k, (prefix || '') + '%')).all();
      const now = Date.now();
      const keys = rows
        .filter((r) => !(r.exp && r.exp * 1000 <= now))
        .map((r) => ({ name: r.k }));
      return { keys, list_complete: true, cursor: undefined };
    },
  };
}

// سکرت‌های ورکر (OWNER_ID / USERBOT_URL / LEGACY_BOT_TOKEN) از کلادفلر
// قابل خواندن نبودند؛ آداپتور آن‌ها را از کلیدهای cfg:* در همین جدول
// می‌خواند — وقتی کاربر مقدارها را بدهد با seed پر می‌شوند، تا آن موقع
// رفتار پیش‌فرض کد (مالک = اولین /start، یوزربات = خاموش) برقرار است.
export async function makeEnv() {
  const KV = kvShim();
  const cfg = (name) => KV.get('cfg:' + name);
  return {
    KV,
    BOT_TOKEN: undefined,       // tgcloud: api از پیش احراز هویت شده است
    WEBHOOK_SECRET: undefined,  // tgcloud: وب‌هوک را پلتفرم مدیریت می‌کند
    LEGACY_BOT_TOKEN: await cfg('legacy_bot_token'),
    OWNER_ID: await cfg('owner_id'),
    USERBOT_URL: await cfg('userbot_url'),
    FLUSH_MS: undefined,        // پیش‌فرض‌های خود کد اعمال می‌شوند
    MIN_FLUSH_GAP_MS: undefined,
    REPORT_WINDOW_MS: undefined,
  };
}
