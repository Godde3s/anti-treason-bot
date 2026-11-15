import { table, integer, text } from 'sdk/db';

// همان جدول kv که ربات Usf_Agent هم دارد، به‌علاوه ستون exp برای
// پشتیبانی از expirationTtl در KV.put (کلیدهای undo/state/کش).
export const kv = table('kv', {
  k: text('k').primaryKey(),
  v: text('v'),
  exp: integer('exp'),
});
