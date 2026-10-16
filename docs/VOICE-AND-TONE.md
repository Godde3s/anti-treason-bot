# Voice & Tone Guide — writing human bot copy (FA/EN)
# راهنمای لحن و نگارش — متن‌های انسانی ربات (دوزبانه)

This is the writing "skill" used across the Anti-Treason Bot's UI. Follow it whenever you add or edit bot messages, and it keeps the product feeling like a calm, competent human operator instead of a toy.

این «مهارت» نگارشی است که در تمام متن‌های ربات ضد خیانت استفاده شده است. هر وقت پیام جدیدی اضافه یا ویرایش می‌کنید آن را رعایت کنید تا ربات همیشه مثل یک اپراتور انسانیِ خونسرد و مسلط به‌نظر برسد.

---

## 1 · Human first — انسانی بنویس

- **Talk, don't announce.** Use natural spoken Persian that a real admin would use to a colleague: «پیام پاک شد، این هم دلیلش» — not «عملیات حذف با موفقیت انجام گردید».
  **گفتگو کن، نه اطلاعیه.** فارسیِ روان و محاوره‌ایِ معقول بنویس، نه اداری و خشک.
- **One idea per line.** Telegram messages are skimmed on a phone. Short lines, blank lines between blocks.
  **هر خط یک مطلب.** پیام‌های تلگرام رده‌خوانده می‌شوند؛ خط‌های کوتاه و فاصله بین بلوک‌ها.
- **Explain the "why" in one clause.** After an action, say what happened *and* what to do next — «قفل فعال شد؛ از این لحظه هر پست ناشناس حذف می‌شود».
  **بعد از هر اقدام، یکی دو جمله راهنمای بعدی بده.**
- **Concrete > abstract.** Show the actual button name in guillemets «فعال‌سازی این کانال», show real examples (`111, 222, 333`) instead of describing them.
  **مشخص بنویس، نه کلی.** نام دقیق دکمه و مثال واقعی بیاور.
- **Never blame, never shout.** Errors say what happened and the fix — no ALL CAPS, no «خطای شما».
  **خطاها آبرومند باشند:** بگو چه شد و چطور درست می‌شود؛ سرزنش و فریاد ممنوع.

## 2 · Emoji discipline — نظم ایموجی

- **Buttons may carry one small icon** for scanning speed (🚨 🔓 📋). **Prose stays emoji-free** except at most one icon in the header of a long message.
  **دکمه‌ها می‌توانند یک آیکون کوچک داشته باشند؛ متنِ پیام تقریباً بدون ایموجی است** — حداکثر یکی در تیتر پیام‌های بلند.
- Status emojis that *carry meaning* (✅ success / ❌ failure / 🟡🟡 escalation states) are part of the data, keep them.
  ایموجی‌های وضعیتی که «داده» هستند (✅/❌/🟡/🔴) نگه داشته می‌شوند.
- If a message needs more than ~3 emojis to look friendly, the wording is the problem — rewrite the words, not the icons.
  اگر پیام به بیش از سه ایموجی نیاز دارد برای «بامزه» شدن، مشکل از متن است؛ کلمات را بازنویسی کن نه آیکون بیشتر.

## 3 · Bilingual layering — لایه‌بندی دوزبانه

- **The bot's live UI speaks Persian** (its users are Persian channel admins). English lives in the repository layer.
  **رابط زندهٔ ربات فارسی است** (کاربرش ادمین‌های فارسی‌زبان هستند)؛ انگلیسی در لایهٔ مخزن و مستندات زندگی می‌کند.
- **README.md is English-first** with a Persian twin (README-FA.md) linked in the header badge — recruiters and the community read English, operators read Persian.
  **README.md انگلیسی‌محور** است با نسخهٔ فارسی لینک‌شده در هدر — جامعه و کارفرما انگلیسی می‌خوانند، اپراتور فارسی.
- If you ever add an English UI string, mirror the **structure** (same line breaks, same buttons), never machine-translate idioms — re-write them.
  اگر روزی رشتهٔ انگلیسی به UI اضافه شد، ساختار پیام یکی بماند و اصطلاح‌ها را ترجمهٔ ماشینی نکن؛ بازنویسی کن.
- Numbers, IDs and commands are language-neutral — never translate `camP:{cid}:preset`, `/id`, `Sign messages`, `Add New Admins`.
  اعداد، شناسه‌ها و نام دسترسی‌های تلگرام هرگز ترجمه نمی‌شوند.

## 4 · Checklist before shipping a message — چک‌لیست

1. Does it still read fine with every emoji removed? — اگر همهٔ ایموجی‌ها را حذف کنی، آیا متن هنوز خوب است؟
2. Can a tired admin understand the next action in 3 seconds? — آیا ادمینِ خسته در ۳ ثانیه قدم بعدی را می‌فهمد؟
3. Is the error message actionable (cause + fix)? — آیا پیام خطا «علت + راه‌حل» دارد؟
4. Is every assertion-critical keyword still intact for the test suite? — کلمات کلیدی که تست‌ها چک می‌کنند دست‌نخورده‌اند؟
