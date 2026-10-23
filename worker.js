/* ============================================================================
 * 🛡️  ربات ضد خیانت کانال  —  نسخه ۲.۹ (همه چیز تعاملی: انتخاب ساعت با دکمه + پریست + تأیید؛ بازنویسی کامل متن ها با سبک جدید)
 * ----------------------------------------------------------------------------
 * اجرا روی: Cloudflare Workers (پلن رایگان) + Cloudflare KV
 * نویسنده: ساخته شده برای مدیریت چنل های تلگرام با دقت حذف لحظه ای
 *
 * ── چه کاری میکند؟ ─────────────────────────────────────────────────────────
 *  • وقتی ربات را ادمین چنل میکنید (با دسترسی « حذف پیام »)، چنل خودکار
 *    ثبت میشود و از پنل فارسی در پیوی ربات قابل مدیریت است.
 *  • ۱۹ قفل مستقل: ادیت متن/مدیا/لینک، ارسال متن/عکس/ویدیو/گیف/استیکر/
 *    ویس/ویدیو نوت/موزیک/فایل/نظرسنجی/مخاطب/لوکیشن/دیس، فوروارد، لینک
 *    و « قفل کامل » (هیچ پیامی ارسال یا ادیت نشود).
 *  • قفل زمان دار (ساعت تهران): مثلاً هر روز ۰۴:۰۰ تا ۲۰:۰۰ کل چنل بسته
 *    شود؛ با حالت های « ارسال و ادیت / فقط ارسال / فقط ادیت ».
 *  • « قفل آنی »: با یک دکمه در پنل، کل چنل کامل بسته میشود و تا وقتی
 *    مالک « باز کردن » نزند، هر پیام یا ادیتی از هر نوعی فوراً حذف میشود.
 *  • چندچنله (v2.0): ربات همزمان در هر تعداد چنل اجرا میشود؛ هر چنل جداگانه
 *    توسط مالک فعال میشود و همه چنل های فعال همزمان تحت پوشش میمانند.
 *  • 📡 دسترسی چنلی ادمین ها (v2.0): مالک برای هر ادمین/ناظر تعیین میکند که « فقط و فقط »
 *    به کدام چنل ها دسترسی داشته باشد — ادمین نمیتواند تنظیمات ربات یا چنل های دیگر
 *    را ببیند یا تغییر دهد؛ گزارش های هر چنل فقط برای گیرنده های همان چنل میرود.
 *  • گزارش حذف ها به پیوی مالک « و همه ادمین های تعریف شده » ارسال میشود.
 *  • شفاف سازی محدودیت تلگرام: حذف پیام های قدیمی تر از ۴۸ ساعت از سوی تلگرام
 *    ممکن نیست؛ لاگ دقیقاً همین را توضیح میدهد (نه اشکال دسترسی) و لینک پیام را
 *    میدهد تا ادمینِ انسانی — که این محدودیت را ندارد — با یک کلیک بازش کند و دستی حذف کند.
 *  • گزارش تخلف با منشن کلیک پذیر و شناسه عددی متخلف (وقتی تلگرام فرستنده را بفرستد).
 *  • لینک مستقیم t.me پیام متخلف در گزارش پیوی و « آخرین تخلف ها » — چنل عمومی
 *    با یوزرنیم، چنل خصوصی به شکل t.me/c/<شناسه داخلی>/<آیدی> (فقط برای اعضا باز میشود).
 *  • نقش « ناظر »: فقط مشاهده تخلف ها (گزارش پیوی + 📜 آخرین تخلف ها + آمار) بدون حق تغییر.
 *  • « 📜 آخرین تخلف ها »: ۱۵ مورد اخیر هر چنل با ساعت شمسی، متخلف، متن و نتیجه حذف.
 *  • 📳 بیدارکننده یوزربات (v1.6.1): اگر متغیر USERBOT_URL ست شده باشد، بعد از صف کردن
 *    هر کار حذف، یک درخواست به /health یوزربات میرود تا اگر سرویسِ رایگان Railway
 *    خوابیده بود، همان لحظه بیدار شود و صف را بکشد — بدون این، صف تا بازشدن پنل صبر میکند.
 *  • 🟡🔴 نردبان وضعیت (v1.8): سه حالت برای ادیتِ پستِ مدیادار (عکس/فیلم/گیف/…):
 *    خاموش ⇒ فقط طبق قفل ها؛ 🟡 زرد ⇒ پاک + عزل متخلف (بدون بن)؛ 🔴 قرمز ⇒ پاک + عزل + بن
 *    (گزارش فوری با دکمه لغو بن و ↩️ بازگردانی دسترسی ها). ادیتِ فقط-متنی در زرد/قرمز پاک میشود.
 *    شناسایی متخلف: از فیلد فرستنده؛ اگر تلگرام نداد، با تطبیق امضای پست با ادمین های چنل.
 *    محافظت: خودِ ربات و « مالک چنل » (creator) هرگز عزل/بن نمیشوند.
 *  • ↩️ بازگردانی دسترسی ها (v1.8): قبل از عزل، snapshot دسترسی های ادمین در KV (۲۴h)
 *    ذخیره میشود؛ در گزارش، دکمه « بازگردانی » دسترسی های قبلی را یک ضربه ای برمی گرداند
 *    (جبران سریع در تطبیق اشتباه امضا).
 *  • ⚡️ ادمین سازی سریع (v1.8): پریست های یک ضربه ای (معمولی/کامل/ناشناس) روی همان
 *    کیبورد دسترسی ها + دکمه « ➕ ادمین بعدی » برای زنجیره کردن افزودن چند ادمین.
 *  • 🔒 قفل پست ناشناس (v1.9): هر پستی که « بدون امضای ادمین » (از طرف خودِ چنل) ارسال یا
 *    ادیت شود فوراً حذف میشود — هیچ کس نمیتواند بدون هویت واقعی خودش پست بدهد؛
 *    ادمین ها باید با « Sign messages » پست بدهند تا امضایشان زیر پست بیاید.
 *  • ⏱ مدت بن خودکار (v1.9): در وضعیت قرمز، متخلف به جای بن همیشگی میتواند مدت دار بن شود
 *    (۱ ساعت / ۲۴ ساعت / ۷ روز / همیشگی) — از منوی چنل؛ بعد از مدت، تلگرام خودش بازش میکند.
 *  • 💾 بکاپ و بازگردانی تنظیمات (v1.9): کل تنظیمات (قفل ها/وضعیت/زمان دار/بن) در یک متن
 *    قابل ذخیره و بازگردانی یک ضربه ای — برای انتقال تنظیمات یا بازیابی سریع.
 *  • 📅 آمار امروز + 📣 گزارش آزمایشی (v1.9): شمارنده جداگانه تخلف های امروز به وقت تهران؛
 *    دکمه آزمایشی در « ادمین های ربات » برای اطمینان از رسیدن گزارش ها به مالک/ادمین ها/ناظرها.
 *  • 📡 دسترسی چنلی + جداسازی کامل (v2.0): ویرایشگر « چنل ها » کنار هر ادمین/ناظر؛
 *    فلو افزودن ادمین با انتخاب چنل کامل میشود؛ ادمینِ بدون چنل چیزی نمیبیند.
 *  • 🌐 دوزبانه (v2.3): کل پنل، گزارش ها و دکمه ها به فارسی و انگلیسی — هر کاربر زبان خودش را
 *    با دکمه 🌐 عوض میکند (به ازای هر کاربر) و مالک با /setlang زبان پیش فرض ربات را تعیین میکند.
 *  • 🆕 هم گام با آخرین تلگرام (v2.4 — Bot API 9.x/10.x):
 *    – 🧩 آلبوم/اسلایدشو: تخلف در هر قسمت آلبوم ⇒ « کل آلبوم » حذف میشود (بدون KV — درون حافظه ایزوله)
 *    – پوشش تایپ های جدید: پیام ریچ (Rich Message)، چک لیست، عکس زنده (Live Photo)، مدیای پولی
 *    – 👑 هشدار فوری « تغییر/ترک مالکیت چنل » به مالک ربات
 *    – ✨ استایل رنگی دکمه ها (danger/success/primary) + افکت پیام در /start + پیام های سیستمی جدید بی خطر
 *  • 📣 اعلان قفل ها در خودِ چنل (v2.5): وقتی « قفل آنی » روشن/خاموش میشود و هنگام شروع/پایانِ
 *    بازه قفل زمان دار، ربات یک اعلان شفاف در خودِ چنل میفرستد (کرون هر دقیقه؛ وضعیت شروع/پایان
 *    در KV نگه داری میشود تا فقط « یک بار » اعلان شود — بدون اسپم و با کمترین مصرف سهمیه نوشتن KV).
 *  • ✍️ بازنویسی اعلان ها (v2.6): متن اعلان ها بولد و انسانی شد و زیر هر اعلان شناسه چنل (t.me/…)
 *    میآید + کلید « اعلان قفل » برای هر چنل — اگه نخوای متنی تو چنلت ارسال شه، خاموشش کن.
 *  • 📣 ارسال پیام + پیام همگانی (v2.7): مالک از پنل چنل « ارسال پیام به چنل » میزند یا از منوی
 *    اصلی « پیام همگانی » — پیام بعدی (هر نوعی: متن/عکس/ویدیو/آلبوم) با پیش نمایش و تأیید، بدون هدر
 *    فوروارد با صدای خود ربات در مقصد کپی میشود (copyMessage).
 *  • 🧭 v2.8: فلوهای « افزودن ادمین / ادمین سازی چنل / ارسال پیام / همگانی / حذف پیام های اخیر »
 *    راهنمای گام به گام با دکمه لغو گرفتند (به جای پیام خشک) + منوی دستورات /start مثل BotFather.
 *  • 🤝 v2.8: عزل/بن/لغوبن اگر با ربات اصلی ممکن نشود، خودکار با « ربات قبلی » تلاش میشود
 *    (Secret با نام LEGACY_BOT_TOKEN) — ادمین هایی که ربات قبلی ساخته بود فقط با خودش قابل عزل اند.
 *  • 🕐 v2.9: قفل زمان دار کاملاً تعاملی شد — انتخاب ساعت شروع/پایان با دکمه های ۰ تا ۲۳ (بدون تایپ)،
 *    پریست های آماده (هر شب 4 تا 8 / هر شب 22 تا 6 / ۲۴ ساعته) و کارت تأیید قبل از ثبت؛
 *    «حذف پیام های اخیر» با دکمه های سریع (۵/۱۰/۲۰/۴۰ + عدد دلخواه)؛ افزودن ناظر و بازگردانی بکاپ
 *    هم با پیام راهنمای گام به گام؛ بازنویسی کل متن های فارسی با سبک نوشتاری جدید.
 *  • 🧹 حذف پیام های اخیر (v2.7): هر پست جدید چنل در حلقه ۱۰۰تایی « msgs:<cid> » ثبت میشود
 *    (فلاش تایمردار ⇒ کمترین نوشتن KV)؛ مالک عدد ۱ تا ۴۰ میفرستد و همان تعداد پیام آخر پاک میشود.
 *  • ⚡️ بهینه سازی v1.8: حذف پیام و شناسایی متخلف به صورت « موازی » (Promise.all) —
 *    گزارش قرمز سریع تر میرسد؛ پیام های سیستمی قبل از هر خواندن KV فیلتر میشوند.
 *  • 👑 ادمین سازی در چنل (v1.7): از پنل، هر کسی را با شناسه عددی (یا @یوزرنیم) ادمین چنل کن؛
 *    دسترسی ها تک تک تنظیم میشوند (ارسال/ادیت/حذف/بن/ارتقا/ناشناس/استوری/…)، فهرست ادمین های فعلی
 *    با دکمه عزل، و اگر ربات « Add New Admins » نداشته باشد راهنمای دقیق میدهد.
 *  • ⚡️ بهینه سازی مصرف (v1.5) — برای اینکه پلن رایگان لیمیت نخورد:
 *      − آمار و « آخرین تخلف ها » در « یک » کلید KV ذخیره میشوند (یک نوشتن به جای دوتا)
 *      − فلاش آمار حداقل ۲۵ ثانیه فاصله دارد (سقف مصرف سهمیه نوشتن KV حتی در حمله موجی)
 *      − در موج تخلف، گزارش های پیوی تا ۵ ثانیه در یک خلاصه ادغام میشوند (لیمیت تلگرام)
 *      − برای پیام های قطعاً قدیمی تر از ۴۸ ساعت، درخواست حذفِ محکوم به شکست اصلاً ارسال نمیشود
 *      − edited_message از allowed_updates حذف شد (وب هوک سبک تر؛ جایی استفاده ندارد)
 *  • 🤖 حذف پیام های قدیمی با اکانت (v1.6): پیام های >۴۸h که ربات نمیتواند حذف کند،
 *    در صف « ub:jobs » در KV میروند؛ یوزرباتِ همراه (Telethon روی هر دستگاه روشنی —
 *    VPS/کامپیوتر/Termux) صف را poll میکند و با اکانت انسانی — که محدودیت ۴۸ ساعت
 *    ندارد — حذفشان میکند و نتیجه را برمی گرداند (گزارش در پیوی + علامت در « آخرین تخلف ها »).
 *  • هر تخلف فوراً حذف میشود — حتی اگر پیام چند روز پیش باشد و همین حالا
 *    ادیت شده باشد (چون آپدیت ادیت همان لحظه میرسد و پیام حذف میشود).
 *  • گزارش هر حذف در پیوی مالک + آمار کامل + بررسی سلامت دسترسی ها.
 *  • مالک میتواند به دیگران دسترسی ادمین پنل بدهد — محدود به چنل های انتخابی (v2.0).
 *
 * ── متغیرهای محیطی (Variables in Cloudflare Dashboard) ─────────────────────
 *  BOT_TOKEN       (الزامی، Secret) توکن ربات از @BotFather
 *  WEBHOOK_SECRET  (الزامی، Secret) رمز وب هوک — فقط حروف/عدد/ـ
 *  OWNER_ID        (اختیاری) شناسه عددی مالک؛ اگر خالی باشد اولین کسی که
 *                  /start بزند مالک میشود.
 *  FLUSH_MS        (اختیاری) فاصله ذخیره آمار (پیش فرض ۱۵۰۰۰ میلی ثانیه)
 *  MIN_FLUSH_GAP_MS (اختیاری) حداقل فاصله بین دو فلاش آمار (پیش فرض ۲۵۰۰۰) — صرفه جویی سهمیه نوشتن KV
 *  REPORT_WINDOW_MS (اختیاری) پنجره ادغام گزارش های پیوی در موج تخلف (پیش فرض ۵۰۰۰؛ ۰ = غیرفعال)
 *  USERBOT_URL     (اختیاری) آدرس پنل یوزربات (مثلاً https://userbot-panel-production.up.railway.app)
 *                  — فقط برای « بیدارکردن » سرویس خواب بعد از صف کردن کار حذف
 *  KV              (Binding) یک فضای KV با نام متغیر KV وصل کنید.
 *
 * ── ست کردن وب هوک (بعد از دیپلوی) ─────────────────────────────────────────
 *  راه آسان: بعد از ست کردن BOT_TOKEN، فقط این آدرس را در مرورگر باز کنید
 *  (ربات خودش setWebhook را با همه تنظیمات درست انجام میدهد):
 *    https://<WORKER_URL>/?setup=<WEBHOOK_SECRET>
 *  راه دستی (معادل همان):
 *  https://api.telegram.org/bot<TOKEN>/setWebhook
 *    ?url=https%3A%2F%2F<WORKER_URL>%2Fwebhook
 *    &secret_token=<WEBHOOK_SECRET>
 *    &max_connections=40&drop_pending_updates=true
 *    &allowed_updates=%5B%22message%22%2C%22callback_query%22%2C%22channel_post%22%2C%22edited_channel_post%22%2C%22my_chat_member%22%5D
 * ==========================================================================*/

/* ---------------------------- ثابت ها ---------------------------- */

const TZ_OFFSET_MIN = 210;        // تهران = UTC+3:30 (ایران از ۱۴۰۱ ساعت تابستانی ندارد)
const CACHE_TTL_MS  = 10 * 1000;  // عمر کش تنظیمات — کوتاه تا قفل ها (مخصوصاً قفل آنی) سریع همه جا اعمال شود
const STATE_TTL_S   = 660;        // مهلت پاسخ به سؤال های پنل (ثانیه)
const DEFAULT_FLUSH_MS      = 15000;                      // فاصله پیش فرض فلاش آمار
const DEFAULT_FLUSH_GAP_MS  = 25000;                      // حداقل فاصله بین دو فلاش — سقف مصرف سهمیه نوشتن KV
const DEFAULT_REPORT_WIN_MS = 5000;                       // پنجره ادغام گزارش های پیوی در موج تخلف
const REPORT_MAX_LINES      = 8;                          // حداکثر خطوط داخل گزارش ادغام شده
const AGE_SKIP_MS           = (48 * 60 + 10) * 60 * 1000; // ۴۸ ساعت + ۱۰ دقیقه حاشیه — حذف قطعاً ناممکن است
const VLOG_MAX              = 15;                         // حداکثر « آخرین تخلف ها » نگه داری شده برای هر چنل

/** تعریف ۱۹ قفل — label همان چیزی است که در پنل دیده میشود */
const LOCKS = {
  master:       { label: 'قفل کامل',        hint: 'هیچ پیامی ارسال یا ادیت نشود' },
  edit_text:    { label: 'ادیت متن',        hint: 'هر ادیت متنی فوراً حذف میشود' },
  edit_media:   { label: 'ادیت مدیا',       hint: 'هر ادیتِ کپشن/مدیا فوراً حذف میشود' },
  edit_link:    { label: 'لینک در ادیت',    hint: 'ادیت های حاوی لینک حذف میشوند' },
  send_text:    { label: 'ارسال متن',       hint: 'پست متنی جدید حذف میشود' },
  send_photo:   { label: 'ارسال عکس',       hint: 'پست عکس حذف میشود' },
  send_video:   { label: 'ارسال ویدیو',     hint: 'پست ویدیو حذف میشود' },
  send_gif:     { label: 'ارسال گیف',       hint: 'پست گیف/انیمیشن حذف میشود' },
  send_sticker: { label: 'ارسال استیکر',    hint: 'پست استیکر حذف میشود' },
  send_voice:   { label: 'ارسال ویس',       hint: 'پست پیام صوتی حذف میشود' },
  send_vnote:   { label: 'ارسال ویدیو نوت', hint: 'پست ویدیو نوت (round) حذف میشود' },
  send_audio:   { label: 'ارسال موزیک',     hint: 'پست فایل صوتی/موزیک حذف میشود' },
  send_file:    { label: 'ارسال فایل',      hint: 'پست فایل/داکیومنت حذف میشود' },
  send_poll:    { label: 'ارسال نظرسنجی',   hint: 'پست نظرسنجی/کوییز حذف میشود' },
  send_contact: { label: 'ارسال مخاطب',     hint: 'پست شماره تماس حذف میشود' },
  send_location:{ label: 'ارسال لوکیشن',    hint: 'پست موقعیت/لوکیشن حذف میشود' },
  send_dice:    { label: 'ارسال بازی',      hint: 'پست قرعه کشی/دیس (🎲) حذف میشود' },
  send_forward: { label: 'فوروارد',         hint: 'هر پستِ فورواردی حذف میشود' },
  send_link:    { label: 'لینک',            hint: 'هر پست حاوی لینک حذف میشود' },
  lock_anon:    { label: 'پست ناشناس',      hint: 'پست بدون امضای ادمین (ناشناس) حذف میشود' },
};
const LOCK_ORDER = Object.keys(LOCKS);

/** اقدام های مجاز برای ناظرها (فقط مشاهده) */
const VIEWER_ACTS = new Set(['noop', 'home', 'help', 'myid', 'chats', 'chat', 'refresh', 'stats', 'vlog', 'health', 'lang']);

/** 📡 v2.0 — اقدام های وابسته به چنل که برای ادمین/ناظرِ غیرمالک باید با دسترسی چنلی چک شوند
 *  (enb/rej و منوهای مالک عمداً اینجا نیستند — چک « فقط مالک » خودشان را دارند) */
const CH_ACTS = new Set(['chat', 'refresh', 'locks', 'tgl', 'all', 'instT', 'annT', 'sched', 'schT', 'schS', 'schE',
  'schM', 'schQ', 'schGo', 'schX', 'stats', 'vlog', 'rstS', 'health', 'redT', 'banH', 'bakE', 'bakI', 'admC', 'camA', 'camP',
  'camT', 'camAll', 'camG', 'camX', 'camD', 'camD2', 'camE', 'ubn', 'admU', 'dlN', 'dlC']);

/** ترتیب نمایش منوی قفل ها: دو دکمه در هر ردیف */
const SCHED_MODES = {
  all:  { label: 'ارسال و ادیت' },
  send: { label: 'فقط ارسال' },
  edit: { label: 'فقط ادیت' },
};
const MODE_CYCLE = ['all', 'send', 'edit'];

/** ⏱ v1.9 — مدت بن خودکار در وضعیت قرمز (ساعت؛ ۰ = همیشگی) */
const BAN_HOURS = [0, 1, 24, 168];
const BAN_LABEL = { 0: 'همیشگی', 1: '۱ ساعت', 24: '۲۴ ساعت', 168: '۷ روز' };

/* ---------------------------- ابزارهای کوچک ---------------------------- */

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const pad2 = (n) => String(n).padStart(2, '0');

function toEnDigits(s) {
  const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
  return String(s).replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = fa.indexOf(ch);
    return i > -1 ? String(i) : String(ar.indexOf(ch));
  });
}

/* ---------------------------- زمان تهران ---------------------------- */

/** دقیقِ فعلی به وقت تهران (۰..۱۴۳۹) */
function tehranMinutes() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** ساعت فعلی تهران به شکل HH:MM */
function tehranHM() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

/** تاریخ امروز به وقت تهران به شکل YYYY-MM-DD (برای شمارنده « امروز » در آمار) */
function tehranDateStr(ts) {
  return new Date(ts + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** تبدیل تاریخ میلادی به شمسی (الگوریتم استاندارد jalaali) */
function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
           + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461);   days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** تاریخ شمسی + ساعت تهران از یک timestamp */
function jalaliStamp(ts) {
  const d = new Date(ts + TZ_OFFSET_MIN * 60000);
  const [jy, jm, jd] = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return `${jy}/${pad2(jm)}/${pad2(jd)} — ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** پارس ورودی ساعت؛ « ۴:۳۰ »، « 4.30 »، « 23 » و… → دقیقه شبانه روز یا null */
function parseHM(raw) {
  let s = toEnDigits(raw).trim().replace(/\s+/g, '')
    .replace(/[.:٫،,hH]/g, ':').replace(/:+/g, ':').replace(/:$/, '');
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = +m[1], mm = m[2] ? +m[2] : 0;
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

const fmtHM = (mins) => pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60);

/** آیا الان داخل بازه قفل زمان دار هستیم؟ (شروع=پایان ⇒ قفل ۲۴ ساعته) */
function isScheduleActive(s) {
  const sc = s.schedule;
  if (!sc || !sc.enabled) return false;
  const now = tehranMinutes();
  if (sc.start === sc.end) return true;
  return sc.start < sc.end
    ? (now >= sc.start && now < sc.end)
    : (now >= sc.start || now < sc.end);
}

/* ── 📣 v2.5: اعلان خودکار وضعیت قفل ها در خودِ چنل ─────────────────────────
 *  • قفل آنی: با هر روشن/خاموش شدن از پنل، اعلان همان لحظه در چنل ارسال میشود.
 *  • قفل زمان دار: هندلر scheduled (کرون هر دقیقه) شروع/پایان بازه را تشخیص میدهد
 *    و فقط « یک بار » اعلان میدهد — وضعیت داخل-بازه بودن در کلید « sched:<cid> » ذخیره
 *    میشود تا هیچ وقت اسپم نشود (نوشتن KV فقط لحظه تغییر؛ حداکثر ~۲ نوشتن در روز). */

const SCHED_STATE = 'sched:'; // وضعیت « الان داخل بازه قفل زمان دار هستیم؟ »

/** آیا دقیقه now داخل بازه [start,end) است؟ (شروع=پایان ⇒ قفل ۲۴ ساعته) */
function winActive(start, end, now) {
  if (start === end) return true;
  return start < end ? (now >= start && now < end) : (now >= start || now < end);
}

async function getSchedState(env, cid) {
  try {
    const raw = await env.KV.get(SCHED_STATE + cid);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch (e) { return null; }
}

async function putSchedState(env, cid, inWin) {
  try { await env.KV.put(SCHED_STATE + cid, JSON.stringify({ in: inWin ? 1 : 0, at: Date.now() })); }
  catch (e) { /* بی اهمیت — در بدترین حالت اعلان بعدی تکرار میشود */ }
}

/** خط شناسه چنل زیر هر اعلان — « 🗣 t.me/username » و برای چنل خصوصی « 🗣 <شناسه> » (v2.6) */
function chanLine(s, cid) {
  const un = String((s && s.username) || '').replace(/^@/, '').trim();
  return '🗣 ' + (un ? 't.me/' + un : String(cid || ''));
}

/** متن اعلان شروع بازه — بولد + خط شناسه چنل (v2.6، متن دقیق کاربر) */
function schedStartText(s, cid) {
  const sc = s.schedule || {};
  return L(
    `<b>چنل از این لحظه ( ساعت ${tehranHM()} ) تا پایان قفل ( ساعت ${fmtHM(sc.end)} ) قفل میمونه .\n\nتا پایان این بازه ؛ فعالیت ممنوع است .</b>\n${chanLine(s, cid)}`,
    `<b>The channel is locked from this moment ( ${tehranHM()} ) until the lock ends ( ${fmtHM(sc.end)} ).\n\nNo activity is allowed during this window .</b>\n${chanLine(s, cid)}`);
}

/** متن اعلان پایان بازه — بولد + خط شناسه چنل (v2.6، متن دقیق کاربر) */
function schedEndText(s, cid) {
  return L(`<b>- چنل بازه !! تایم قفل زماندار تموم شد .</b>\n${chanLine(s, cid)}`,
           `<b>- Scheduled lock time is over. The channel is open again .</b>\n${chanLine(s, cid)}`);
}

/** متن اعلان قفل آنی (روشن/خاموش) — بولد + خط شناسه چنل (v2.6، متن دقیق کاربر) */
function instantAnnounceText(on, s, cid) {
  return on
    ? L(`<b>قفل آنی به دستور اونر فعال شد !! تا باز شدن صبور باشید .</b>\n${chanLine(s, cid)}`,
        `<b>Instant lock is ON by the owner !! Please wait until it is opened .</b>\n${chanLine(s, cid)}`)
    : L(`<b>- قفل آنی خاموش شد !! میتونید استارت بزنید .</b>\n${chanLine(s, cid)}`,
        `<b>- Instant lock is OFF !! You can start posting again .</b>\n${chanLine(s, cid)}`);
}

/** اعلان در خودِ چنل — true یعنی موفق؛ شناسه اعلان هم در حلقه پیام های اخیر ثبت میشود (v2.7) */
async function announceChannel(env, cid, text) {
  const r = await tg(env, 'sendMessage', {
    chat_id: cid, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
  }).catch(() => null);
  if (r && r.ok && r.result && r.result.message_id) trackMsg(env, null, cid, r.result.message_id);
  return !!(r && r.ok);
}

/* ── 🧹 v2.7: حلقه پیام های اخیر هر چنل + پاک سازی دسته ای N پیام آخر ─────────
 *  • هر channel_post جدید شناسه اش در بافر حافظه ثبت میشود؛ فلاش به KV تایمردار است
 *    (DEFAULT_FLUSH_MS) یا وقتی بافر ۲۰تایی پر شود ⇒ کمترین مصرف سهمیه نوشتن KV.
 *  • اعلان های خود بات و پیام های « 📣 ارسال پیام/همگانی » هم در حلقه ثبت میشوند.
 *  • محدودیت: تلگرام به بات اجازه دیدن تاریخچه نمیدهد ⇒ فقط پست های بعد از نصب v2.7
 *    ثبت میشوند؛ « حذف پیام های اخیر » روی همین حلقه کار میکند. */
const MSGS = 'msgs:';
const MSG_KEEP = 100;       // حداکثر شناسه نگه داشته شده برای هر چنل
const MSG_FLUSH_N = 20;     // با پُر شدن بافر حافظه تا این تعداد ⇒ فلاش فوری
const MAX_DEL = 40;         // سقف حذف دسته ای در هر اجرا (سقف ساب ریکوئست پلن رایگان)
const MAX_BC = 40;          // سقف چنل برای پیام همگانی (سقف ساب ریکوئست)
const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]); // ارقام فارسی برای متن های فارسی
const pendMsgs = new Map();        // cid -> [message_id, ...] (جدید در انتها)
const pendMsgsTimer = new Map();   // cid -> bool (تایمر فلاش فعال است؟)

async function readMsgsRaw(env, cid) {
  try { const raw = await env.KV.get(MSGS + cid); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}

/** حلقه کامل پیام های اخیر: KV + بافر حافظه (بدون تکرار، آخرین MSG_KEEP تا) */
async function readMsgs(env, cid) {
  const pendArr = pendMsgs.get(cid) || [];
  return [...new Set((await readMsgsRaw(env, cid)).concat(pendArr))].slice(-MSG_KEEP);
}

/** ادغام و نوشتن بافر در KV */
async function flushMsgs(env, cid) {
  const fresh = pendMsgs.get(cid);
  if (!fresh || !fresh.length) return;
  pendMsgs.delete(cid); pendMsgsTimer.delete(cid);
  try {
    const old = await readMsgsRaw(env, cid);
    const merged = [...new Set(old.concat(fresh))].slice(-MSG_KEEP);
    await env.KV.put(MSGS + cid, JSON.stringify(merged));
  } catch (e) { console.error('flushMsgs', e); }
}

/** ثبت شناسه یک پیام در حلقه چنل (env میتواند null باشد وقتی فلاش بعدی نیاز نیست) */
function trackMsg(env, ctx, cid, mid) {
  if (!cid || !mid) return;
  let arr = pendMsgs.get(cid);
  if (!arr) { arr = []; pendMsgs.set(cid, arr); }
  if (!arr.includes(mid)) arr.push(mid);
  if (!ctx || !env) return;
  if (arr.length >= MSG_FLUSH_N) { ctx.waitUntil(flushMsgs(env, cid)); return; }
  if (!pendMsgsTimer.get(cid)) {
    pendMsgsTimer.set(cid, true);
    ctx.waitUntil(
      new Promise((r) => setTimeout(r, Number(env.FLUSH_MS || DEFAULT_FLUSH_MS)))
        .then(() => flushMsgs(env, cid)).catch(() => {})
    );
  }
}

/** حذف شناسه های پاک شده از حلقه (بافر حافظه + KV) */
async function removeMsgs(env, cid, ids) {
  pendMsgs.delete(cid); pendMsgsTimer.delete(cid);
  try {
    const keep = (await readMsgsRaw(env, cid)).filter((x) => !ids.includes(x));
    await env.KV.put(MSGS + cid, JSON.stringify(keep));
  } catch (e) { console.error('removeMsgs', e); }
}

/* ---------------------------- تلگرام ---------------------------- */

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* بی اهمیت */ }
  if (!data || !data.ok) {
    const desc = data && data.description ? data.description : `HTTP ${res.status}`;
    console.error(`TG ${method} -> ${desc}`);
    return { ok: false, description: desc };
  }
  return data;
}

/* 🤝 v2.8 — « ربات قبلی »: اگر عملیات با ربات اصلی ممکن نبود (مثلاً عزل ادمینی که ربات قبلی
 * ساخته بود — تلگرام اجازه تغییر ادمین های ساخته شده توسط دیگران را نمیدهد)، یک تلاش هم
 * با توکن ربات قبلی (Secret با نام LEGACY_BOT_TOKEN) زده میشود؛ نتیجه موفق → r.legacy=true */
async function tgSmart(env, method, payload) {
  const r = await tg(env, method, payload);
  if (r.ok || !env.LEGACY_BOT_TOKEN) return r;
  const r2 = await tg({ ...env, BOT_TOKEN: env.LEGACY_BOT_TOKEN }, method, payload);
  if (r2.ok) r2.legacy = true;
  return r2;
}

const kb = (rows) => ({ inline_keyboard: rows });
/* ✨ v2.4 — style دکمه: 'danger' (قرمز) | 'success' (سبز) | 'primary' (آبی) — Bot API 9.4+ */
const BTN = (text, data, style) => ({ text: tr(text), callback_data: data, ...(style ? { style } : {}) });

/* ── 🌐 v2.3: دوزبانه فارسی/انگلیسی ─────────────────────────────────────────
 * CUR_LANG زبانِ جاری « همین آپدیت » است:
 *   • پیام خصوصی/دکمه ها ⇒ زبان خودِ کاربر (کلید « ulang:<id> »؛ پیش فرض = زبان ربات)
 *   • پست چنل/گزارش ها/my_chat_member ⇒ زبان پیش فرض ربات (کلید « lang »؛ پیش فرض fa)
 * L(fa, en) برای متن های پویا (بدنه پیام ها) و tr() برای برچسب های ثابت (دکمه ها/لیبل ها).
 * داده های ذخیره شده (دلایل تخلف، آمار، نام ها) همیشه فارسی میمانند و فقط هنگام نمایش ترجمه میشوند. */
let CUR_LANG = 'fa';
const L = (fa, en) => (CUR_LANG === 'en' && en != null && en !== '') ? en : fa;
const EN_MAP = new Map([['قفل کامل', 'Full lock'],
  ['ادیت متن', 'Text edit'],
  ['ادیت مدیا', 'Media edit'],
  ['لینک در ادیت', 'Link in edit'],
  ['ارسال متن', 'Text posts'],
  ['ارسال عکس', 'Photos'],
  ['ارسال ویدیو', 'Videos'],
  ['ارسال گیف', 'GIFs'],
  ['ارسال استیکر', 'Stickers'],
  ['ارسال ویس', 'Voice'],
  ['ارسال ویدیو نوت', 'Video notes'],
  ['ارسال موزیک', 'Music'],
  ['ارسال فایل', 'Files'],
  ['ارسال نظرسنجی', 'Polls'],
  ['ارسال مخاطب', 'Contacts'],
  ['ارسال لوکیشن', 'Locations'],
  ['ارسال بازی', 'Dice games'],
  ['فوروارد', 'Forwards'],
  ['لینک', 'Links'],
  ['پست ناشناس', 'Anonymous posts'],
  ['🔴 ادیت مدیا (وضعیت قرمز)', '🔴 Media edit (red mode)'],
  ['🟡 ادیت مدیا (وضعیت زرد)', '🟡 Media edit (yellow mode)'],
  ['ادیت متن (وضعیت قرمز)', 'Text edit (red mode)'],
  ['ادیت متن (وضعیت زرد)', 'Text edit (yellow mode)'],
  ['قفل آنی (دستی)', 'Instant lock (manual)'],
  ['قفل پست ناشناس', 'Anonymous-post lock'],
  ['قفل زمان دار (ارسال و ادیت)', 'Scheduled lock (send & edit)'],
  ['قفل زمان دار (فقط ادیت)', 'Scheduled lock (edit only)'],
  ['قفل زمان دار (فقط ارسال)', 'Scheduled lock (send only)'],
  ['قفل لینک در ادیت', 'Link-in-edit lock'],
  ['قفل ادیت متن', 'Text-edit lock'],
  ['قفل ادیت مدیا', 'Media-edit lock'],
  ['قفل فوروارد', 'Forward lock'],
  ['قفل لینک', 'Link lock'],
  ['قفل ارسال متن', 'Text-post lock'],
  ['قفل ارسال عکس', 'Photo-post lock'],
  ['قفل ارسال ویدیو', 'Video-post lock'],
  ['قفل ارسال گیف', 'GIF-post lock'],
  ['قفل ارسال استیکر', 'Sticker-post lock'],
  ['قفل ارسال ویس', 'Voice-post lock'],
  ['قفل ارسال ویدیو نوت', 'Video-note-post lock'],
  ['قفل ارسال موزیک', 'Music-post lock'],
  ['قفل ارسال فایل', 'File-post lock'],
  ['قفل ارسال نظرسنجی', 'Poll-post lock'],
  ['قفل ارسال مخاطب', 'Contact-post lock'],
  ['قفل ارسال لوکیشن', 'Location-post lock'],
  ['قفل ارسال بازی', 'Dice-post lock'],
  ['🚫 ارسال و ادیت', '🚫 Send & edit'],
  ['📤 فقط ارسال', '📤 Send only'],
  ['✏️ فقط ادیت', '✏️ Edit only'],
  ['همیشگی', 'Permanent'],
  ['۱ ساعت', '1 hour'],
  ['۲۴ ساعت', '24 hours'],
  ['۷ روز', '7 days'],
  ['ناشناس', 'Anonymous'],
  ['ارسال پست', 'Post messages'],
  ['ادیت پست ها', 'Edit messages'],
  ['حذف پیام ها', 'Delete messages'],
  ['بن/محدود کاربران', 'Ban/restrict users'],
  ['ارتقای ادمین ها', 'Promote admins'],
  ['تغییر اطلاعات کانال', 'Change channel info'],
  ['لینک دعوت', 'Invite links'],
  ['پست استوری', 'Post stories'],
  ['⚡️ ادمین معمولی', '⚡️ Basic admin'],
  ['📣 ناشناس', '📣 Anonymous'],
  ['👑 ادمین کامل', '👑 Full admin'],
  ['🌐 همه چنل ها', '🌐 All channels'],
  ['⛔️ هیچ چنلی', '⛔️ No channels'],
  ['🎯 محدود به انتخاب ها', '🎯 Limit to selection'],
  ['🌐 همه چنل ها فعال شد', '🌐 All channels enabled'],
  ['🎯 محدود به چنل های انتخابی شد', '🎯 Limited to selected channels'],
  ['✅ دسترسی داده شد', '✅ Access granted'],
  ['❌ دسترسی گرفته شد', '❌ Access revoked'],
  ['مالک چنله ( قابل ارتقا نیست )', 'Channel owner (cannot be promoted)'],
  ['ربات دسترسی Add New Admins نداره', 'Bot lacks "Add New Admins" permission'],
  ['کاربر شناخته نشد ؛ باید حداقل یکبار ربات رو استارت کنه یا عضو چنل باشه', 'User not recognized — they must start the bot once or be a channel member'],
  ['مخاطب مشترک نیست', 'Not a mutual contact'],
  ['از قبل ادمینه یا قابل تغییر نیست', 'Already an admin or cannot be changed'],
  ['نامشخص', 'Unknown'],
  ['کاربر', 'User'],
  ['ناشناس', 'Anonymous'],
  ['چنل', 'Channel'],
  ['هیچ', 'None'],
  ['مالک چنل', 'Channel owner'],
  ['ادمین', 'Admin'],
  ['🗑 حذف', '🗑 Remove'],
  ['⬇️ عزل', '⬇️ Demote'],
  ['⛔️ شما دسترسی ندارید!', '⛔️ You do not have access!'],
  ['👁 ناظر فقط اجازه مشاهده دارد!', '👁 Viewers have view-only access!'],
  ['⛔️ این چنل به شما اختصاص داده نشده — فقط مالک می تواند دسترسی ها را تعیین کند!', '⛔️ This channel is not assigned to you — only the owner manages access!'],
  ['👑 فقط مالک ربات!', '👑 Owner only!'],
  ['✅ حذف شد', '✅ Removed'],
  ['⚠️ این چنل دیگه ثبت نیست.', '⚠️ This channel is no longer registered.'],
  ['⚠️ قفل نامعتبر!', '⚠️ Invalid lock!'],
  ['⚠️ دکمه ناشناخته!', '⚠️ Unknown button!'],
  ['⚠️ خطایی پیش اومد؛ دوباره تلاش کن.', '⚠️ Something went wrong — please try again.'],
  ['🔄 بروزرسانی شد', '🔄 Updated'],
  ['⚠️ پریست نامعتبر!', '⚠️ Invalid preset!'],
  ['⚠️ دسترسی نامعتبر!', '⚠️ Invalid permission!'],
  ['✅ ادمین شد', '✅ Promoted'],
  ['❌ ارتقا ناموفق بود', '❌ Promotion failed'],
  ['❌ لغو شد', '❌ Cancelled'],
  ['✅ آمار ریست شد', '✅ Stats reset'],
  ['🗑 چنل رد شد و از لیست حذف شد', '🗑 Channel rejected and removed'],
  ['💾 بکاپ در پیام بالا آمد', '💾 Backup posted above'],
  ['📋 چنل های من', '📋 My channels'],
  ['❓ راهنمای کامل', '❓ Full guide'],
  ['👥 ادمین های ربات', '👥 Bot admins'],
  ['👁 ناظرها', '👁 Viewers'],
  ['🆔 شناسه من', '🆔 My ID'],
  ['➕ افزودن ادمین', '➕ Add admin'],
  ['➕ افزودن ناظر', '➕ Add viewer'],
  ['📣 گزارش آزمایشی', '📣 Test report'],
  ['📡 چنل ها', '📡 Channels'],
  ['➕ افزودن ادمین جدید', '➕ Add new admin'],
  ['🔙 بازگشت', '🔙 Back'],
  ['🔄 بروزرسانی', '🔄 Refresh'],
  ['🔙 چنل ها', '🔙 Channels'],
  ['✅ همه', '✅ All'],
  ['⛔ هیچ کدام', '⛔ None'],
  ['✅ تأیید و ارتقا', '✅ Apply & promote'],
  ['❌ انصراف', '❌ Cancel'],
  ['✅ فعال سازی این چنل', '✅ Activate this channel'],
  ['🗑 رد کردن', '🗑 Reject'],
  ['🔓 قفل آنی روشن — باز کن', '🔓 Instant lock is ON — open it'],
  ['🚨 قفل آنی (بستن کامل)', '🚨 Instant lock (close all)'],
  ['🟡 وضعیت زرد (فقط عزل) — روشن کن', '🟡 Yellow mode (demote only) — turn on'],
  ['🟡 زرد روشن (فقط عزل) — برو 🔴 قرمز', '🟡 Yellow ON (demote only) — go 🔴 red'],
  ['🔴 قرمز روشن (عزل+بن) — خاموش کن', '🔴 Red ON (demote+ban) — turn off'],
  ['🔒 قفل ها', '🔒 Locks'],
  ['⏰ قفل زمان دار', '⏰ Scheduled lock'],
  ['👑 ادمین های چنل', '👑 Channel admins'],
  ['💾 بکاپ تنظیمات', '💾 Backup settings'],
  ['📥 بازگردانی', '📥 Restore'],
  ['📊 آمار تخلفات', '📊 Violation stats'],
  ['🩺 سلامت', '🩺 Health'],
  ['⛔️ قفل همه', '⛔️ Lock all'],
  ['✅ آزاد کردن همه', '✅ Unlock all'],
  ['🔔 فعال سازی', '🔔 Enable'],
  ['🔕 غیرفعال سازی', '🔕 Disable'],
  ['🔕 قفل زمان دار غیرفعال شد', '🔕 Scheduled lock disabled'],
  ['🗑 ریست آمار', '🗑 Reset stats'],
  ['🔄 بررسی مجدد', '🔄 Re-check'],
  ['➕ ادمین بعدی', '➕ Next admin'],
  ['➕ افزودن گروهی بعدی', '➕ Add next batch'],
  ['🔙 بازگشت به ادمین های چنل', '🔙 Back to channel admins'],
  ['✅ بله، عزلش کن', '✅ Yes, demote'],
  ['♻️ لغو بن (بخشیدن)', '♻️ Unban (forgive)'],
  ['↩️ بازگردانی دسترسی های قبلی متخلف', "↩️ Restore the offender's previous access"],
  ['✅ عزل شد — دسترسی های ادمینی گرفته شد', '✅ Demoted — admin rights revoked'],
  ['♻️ بن لغو شد — این فرد می تواند دوباره عضو چنل شود', '♻️ Unbanned — this person can join the channel again'],
  ['🆔 شناسه یا لیست شناسه ها را بفرست (با کاما/خط جدید جدا کن، حداکثر ۵۰). /start = لغو', '🆔 Send one ID or a list of IDs (comma/newline separated, max 50). /start = cancel'],
  ['🆔 شناسه یا لیست شناسه های ناظر را بفرست (با کاما/خط جدید، حداکثر ۵۰). /start = لغو', '🆔 Send the viewer ID or a list of IDs (comma/newline separated, max 50). /start = cancel'],
  ['🆔 شناسه فرد یا لیست شناسه ها را بفرست (با کاما/خط جدید، حداکثر ۵۰) — یا @یوزرنیم. /start = لغو', "🆔 Send the person's ID or a list of IDs (comma/newline, max 50) — or a @username. /start = cancel"],
  ['📥 متن بکاپ را بفرست (همان متنی که « 💾 بکاپ » داده). /start = لغو', '📥 Send the backup text (the exact text "💾 Backup" produced). /start = cancel'],
  ['🔓 قفل آنی باز شد — ارسال و ادیت آزاد شد', '🔓 Instant lock opened — sending and editing are free again'],
  ['🚨 قفل آنی فعال شد! تا باز کردن، هر پیامی فوراً حذف می شود', '🚨 Instant lock is ON! Until you open it, every message is deleted instantly'],
  ['✅ این چنل فعال شد — بقیه چنل های فعال هم فعال می مانند (چندچنله)', '✅ Channel activated — other active channels stay active (multi-channel)'],
  ['🟡 وضعیت زرد روشن شد! ادیتِ پستِ مدیادار ⇒ پاک + عزل متخلف (بدون بن)', '🟡 Yellow mode ON! Editing a media post ⇒ delete + demote the offender (no ban)'],
  ['🚨🔴 وضعیت قرمز روشن شد! ادیتِ پستِ مدیادار ⇒ پاک + عزل + بن متخلف', '🚨🔴 Red mode ON! Editing a media post ⇒ delete + demote + ban the offender'],
  ['وضعیت خاموش شد — ادیت مدیا فقط طبق قفل ها پاک می شود', 'Punish mode is off — media edits are deleted only according to locks'],
  ['⛔️ همه قفل ها فعال شد', '⛔️ All locks enabled'],
  ['✅ همه قفل ها آزاد شد', '✅ All locks released'],
  ['✅ همه دسترسی ها انتخاب شد', '✅ All permissions selected'],
  ['⛔ همه دسترسی ها برداشته شد', '⛔ All permissions cleared'],
  ['⚙️ دسترسی ها را تغییر بده و « ✅ تأیید و ارتقا » را بزن', '⚙️ Adjust the permissions, then hit "✅ Apply & promote"'],
  ['⚠️ ربات دسترسی « Add New Admins » نداره !\nاول تو تنظیمات ادمینی ربات در تلگرام این دسترسی رو روشن کن ، بعد دوباره تلاش کن .', '⚠️ The bot lacks the "Add New Admins" permission!\nFirst enable it in the bot\'s admin rights in Telegram, then try again.'],
  ['⚠️ جلسه تنظیم منقضی شد ؛ دوباره از « ادمین های چنل » شروع کن .', '⚠️ The setup session expired — start again from "👑 Channel admins".'],
  ['⚠️ جلسه تنظیم منقضی شد ؛ دوباره شروع کن .', '⚠️ The setup session expired — please start again.'],
  ['⚠️ گرفتن وضعیت فعلی فرد ناموفق بود — دوباره تلاش کن.', "⚠️ Could not fetch the person's current status — please try again."],
  ['👑 مالک چنل قابل ویرایش نیست!', '👑 The channel owner cannot be edited!'],
  ['⚠️ اطلاعات بازگردانی پیدا نشد (منقضی شده یا قبلاً اعمال شده).', '⚠️ Restore data not found (expired or already applied).'],
  ['👑 این شخص خودِ مالکه و از قبل دسترسی کامل داره.', '👑 This person is the owner and already has full access.'],
  ['ℹ️ این شناسه قبلاً ادمین شده ؛ دسترسی چنلیش رو تنظیم کن :', 'ℹ️ This ID is already an admin — set their channel access:'],
  ['ℹ️ این شناسه ادمین است و دسترسی بیشتری از ناظر داره.', 'ℹ️ This ID is an admin — more access than a viewer.'],
  ['🤖 این شناسه خودِ ربات است!', '🤖 This ID is the bot itself!'],
  ['👑 این شخص « مالک چنل » است — قابل تغییر و عزل نیست.', '👑 This person is the "channel owner" — cannot be changed or demoted.'],
  ['قفل', 'locks'], ['ناظر', 'Viewer'], ['📡 دسترسی چنلی', '📡 Channel access'],
  ['دسترسی فعلی', 'Current access'], ['👑 دسترسی ها', '👑 Permissions'], ['📺 چنل', '📺 Channel'],
  ['ارسال پیام به چنل', 'Post to channel'],
  ['حذف پیام های اخیر', 'Delete recent messages'],
  ['پیام همگانی', 'Broadcast'],
  ['ارسال ✅', 'Send ✅'],
  ['لغو', 'Cancel'],
  ['⚠️ شناسه عددی پیدا نشد!', '⚠️ No numeric ID found!'], ['🔔 قفل زمان دار فعال شد', '🔔 Scheduled lock enabled'],
  ['✅ ثبت شد!', '✅ Saved!'], ['⚠️ این چنل دیگه ثبت نیست.', '⚠️ This channel is no longer registered.'],
  ['روشن کردن', 'Turn ON'], ['خاموش کردن', 'Turn OFF'], ['۲۴ ساعته', '24-hour'],
  ['هر شب 4 تا 8', 'Nightly 4 to 8'], ['هر شب 22 تا 6', 'Nightly 22 to 6'],
  ['انصراف', 'Cancel'], ['ثبت کن ✅', 'Save ✅'], ['از اول', 'Restart'], ['❌ لغو', '❌ Cancel'],
  ['↓ ساعت رو از دکمه های پایین انتخاب کن', '↓ Pick the hour below'], ['لغو شد', 'Cancelled'],
  ['عدد دلخواه', 'Custom number'], ['۵ پیام', '5 msgs'], ['۱۰ پیام', '10 msgs'],
  ['۲۰ پیام', '20 msgs'], ['۴۰ پیام', '40 msgs']]);
const tr = (s) => (CUR_LANG === 'en' ? (EN_MAP.get(String(s)) || s) : s);

const lcache = { g: null, gExp: 0, u: new Map() }; // کش زبان: سراسری + هر کاربر (۶۰ ثانیه)

/** زبان پیش فرض ربات (مالک با /setlang عوض میکند) */
async function langGlobal(env) {
  if (lcache.g && lcache.gExp > Date.now()) return lcache.g;
  let v = 'fa';
  try { v = (await env.KV.get('lang')) || 'fa'; } catch (e) { v = 'fa'; }
  lcache.g = (v === 'en') ? 'en' : 'fa';
  lcache.gExp = Date.now() + 60000;
  return lcache.g;
}

/** زبان یک کاربر: تنظیم شخصی خودش، وگرنه زبان پیش فرض ربات */
async function langOfUser(env, uid) {
  if (!uid) return langGlobal(env);
  const S = String(uid), now = Date.now();
  const c = lcache.u.get(S);
  if (c && c.exp > now) return c.v;
  let v = null;
  try { v = await env.KV.get('ulang:' + S); } catch (e) { v = null; }
  v = (v === 'en') ? 'en' : (v === 'fa' ? 'fa' : null);
  if (!v) v = await langGlobal(env);
  lcache.u.set(S, { v, exp: now + 60000 });
  return v;
}

/** ذخیره زبان شخصی کاربر */
async function setUserLang(env, uid, v) {
  const S = String(uid);
  try { await env.KV.put('ulang:' + S, v); } catch (e) { /* بی اهمیت */ }
  lcache.u.set(S, { v, exp: Date.now() + 60000 });
}


async function send(env, chatId, text, markup, opts) {
  const base = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(markup ? { reply_markup: markup } : {}),
  };
  // ✨ v2.4 — افکت پیام (فقط چت خصوصی)؛ اگر افکت پذیرفته نشد، بدون افکت دوباره تلاش میشود
  if (opts && opts.effect) {
    const r = await tg(env, 'sendMessage', { ...base, message_effect_id: opts.effect });
    if (r.ok || !/effect/i.test(r.description || '')) return r;
  }
  return tg(env, 'sendMessage', base);
}

/** ویرایش پیام پنل؛ اگر ویرایش ممکن نبود، پیام جدید میفرستد */
async function edit(env, chatId, mid, text, markup) {
  const r = await tg(env, 'editMessageText', {
    chat_id: chatId, message_id: mid, text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(markup ? { reply_markup: markup } : {}),
  });
  if (!r.ok && !/not modified/i.test(r.description || '')) {
    return send(env, chatId, text, markup);
  }
  return r;
}

async function answerCb(env, id, text = '', alert = false) {
  return tg(env, 'answerCallbackQuery', {
    callback_query_id: id,
    ...(text ? { text: tr(text), show_alert: alert } : {}),
  });
}

let ME = null; // کش اطلاعات خود ربات در هر ایزوله
async function botInfo(env) {
  if (ME) return ME;
  const r = await tg(env, 'getMe', {});
  if (r.ok) { ME = r.result; return ME; }
  return { id: 0, username: 'bot', first_name: 'Bot' };
}

/* ---------------------------- KV: مالک و ادمین ها ---------------------------- */

const acache = { owner: null, ownerExp: 0, admins: null, adminsExp: 0 };

async function getOwnerId(env) {
  if (env.OWNER_ID) return String(env.OWNER_ID);
  if (acache.owner && acache.ownerExp > Date.now()) return acache.owner;
  const v = await env.KV.get('owner');
  if (v) { acache.owner = v; acache.ownerExp = Date.now() + CACHE_TTL_MS; }
  return v;
}

async function setOwner(env, uid) {
  await env.KV.put('owner', String(uid));
  acache.owner = String(uid); acache.ownerExp = Date.now() + CACHE_TTL_MS;
}

async function getAdmins(env) {
  if (acache.admins && acache.adminsExp > Date.now()) return acache.admins;
  let v = [];
  try { v = JSON.parse((await env.KV.get('admins')) || '[]'); } catch (e) { v = []; }
  acache.admins = v; acache.adminsExp = Date.now() + CACHE_TTL_MS;
  return v;
}

async function setAdmins(env, arr) {
  await env.KV.put('admins', JSON.stringify(arr));
  acache.admins = arr; acache.adminsExp = Date.now() + CACHE_TTL_MS;
}

/* ---------------------------- KV: ناظرها (فقط مشاهده) ---------------------------- */

const vcache = { v: null, exp: 0 };

async function getViewers(env) {
  if (vcache.v && vcache.exp > Date.now()) return vcache.v;
  let v = [];
  try { v = JSON.parse((await env.KV.get('viewers')) || '[]'); } catch (e) { v = []; }
  vcache.v = v; vcache.exp = Date.now() + CACHE_TTL_MS;
  return v;
}

async function setViewers(env, arr) {
  await env.KV.put('viewers', JSON.stringify(arr));
  vcache.v = arr; vcache.exp = Date.now() + CACHE_TTL_MS;
}

/* ---------------------------- 📡 v2.0: دسترسی چنلی ادمین ها/ناظرها ----------------------------
 * کلید « scopes » در KV: {"a": {"<uid>": {"ch": "*"|[cid,...]}}, "v": {…}}
 *  • مالک (OWNER_ID) همیشه به همه جا دسترسی دارد و خارج از این ساختار است.
 *  • ادمین/ناظرِ بدون سابقه scope (قدیمی ها) ⇒ به صورت نرم به « چنل های ثبت شده فعلی » مهاجرت
 *    میشود (اگر هیچ چنلی ثبت نباشد ⇒ همه). ادمینِ تازه با scope خالی [] ثبت میشود
 *    (بدون چنل) تا مالک از ویرایشگری که خودکار باز میشود دسترسی اش را تعیین کند.
 *  • ادمین هرگز: افزودن/حذف ادمین، فعال سازی/رد چنل و منوهای مالک را ندارد؛
 *    و فقط چنل های داخل دسترسی اش را میبیند/مدیریت میکند/گزارش هایش را میگیرد. */

const pcache = { v: null, exp: 0 };

/** شناسه همه چنل های ثبت شده (خواندن سبک — فقط list، بدون خواندن تنظیمات) */
async function registeredCids(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'chat:' });
    for (const k of page.keys) out.push(k.name.slice(5));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

/** دامنه پیش فرض مهاجرت: چنل های ثبت شده؛ اگر هیچ ⇒ همه ('*') */
async function defaultChs(env) {
  const cids = await registeredCids(env);
  return cids.length ? cids : '*';
}

async function getScopes(env) {
  if (pcache.v && pcache.exp > Date.now()) return pcache.v;
  let acc = null;
  try { const raw = await env.KV.get('scopes'); acc = raw ? JSON.parse(raw) : null; } catch (e) { acc = null; }
  if (!acc || typeof acc !== 'object') acc = { a: {}, v: {} };
  if (!acc.a || typeof acc.a !== 'object') acc.a = {};
  if (!acc.v || typeof acc.v !== 'object') acc.v = {};
  pcache.v = acc; pcache.exp = Date.now() + CACHE_TTL_MS;
  return acc;
}

async function setScopes(env, acc) {
  await env.KV.put('scopes', JSON.stringify(acc));
  pcache.v = acc; pcache.exp = Date.now() + CACHE_TTL_MS;
}

const chHas = (chs, cid) => chs === '*' || (Array.isArray(chs) && chs.includes(String(cid)));
const canCh = (scope, cid) => !!scope && chHas(scope.chs, cid);

/** نقش + دامنه دسترسی کاربر: {role:'owner'|'admin'|'viewer', chs:'*'|[cid,...]} یا null */
async function accessOf(env, uid) {
  const S = String(uid);
  const owner = await getOwnerId(env);
  if (owner && owner === S) return { role: 'owner', chs: '*' };
  const acc = await getScopes(env);
  if (acc.a[S]) return { role: 'admin', chs: acc.a[S].ch };
  if (acc.v[S]) return { role: 'viewer', chs: acc.v[S].ch };
  // مهاجرت نرم v2.0: عضو لیست های قدیمی بدون سابقه scope ⇒ چنل های ثبت شده (یا همه)
  if ((await getAdmins(env)).includes(S)) return { role: 'admin', chs: await defaultChs(env) };
  if ((await getViewers(env)).includes(S)) return { role: 'viewer', chs: await defaultChs(env) };
  return null;
}

/** برچسب فارسی یک دامنه برای نمایش در پنل */
function chsLabel(chs, titles) {
  if (chs === '*') return '🌐 همه چنل ها';
  if (!Array.isArray(chs) || !chs.length) return '⛔️ هیچ چنلی';
  return chs.map((c) => (titles && titles[c]) ? titles[c] : c).join('، ');
}

/* ---------------------------- KV: تنظیمات چنل ها ---------------------------- */

const scache = new Map(); // « chat:{cid} » -> {v, exp}

function defaultSettings(chat) {
  const locks = {};
  for (const k of LOCK_ORDER) locks[k] = false;
  return {
    title: chat.title || 'چنل',
    username: chat.username || '',
    reg_at: new Date().toISOString(),
    locks,
    active: false, // هر چنل جداگانه توسط مالک فعال میشود (چندچنله)
    instant: { on: false, at: 0 }, // قفل آنی دستی — تا وقتی « باز کردن » نزنی روشن میماند
    schedule: { enabled: false, start: 4 * 60, end: 20 * 60, mode: 'all' },
    log_pm: true, // گزارش حذف ها در پیوی مالک
    ann: true, // 📣 v2.6: اعلان قفل ها در خودِ چنل — با کلید « اعلان قفل » تو پنل قفل ها خاموش/روشن میشه
    punishMode: 'off', // 🟡🔴 v1.8: 'off' | 'yellow' (عزل) | 'red' (عزل+بن)
    banHours: 0, // ⏱ v1.9: مدت بن خودکار در وضعیت قرمز (۰ = همیشگی)
  };
}

async function getSettings(env, cid, fresh = false) {
  const k = 'chat:' + cid;
  if (!fresh) {
    const c = scache.get(k);
    if (c && c.exp > Date.now()) return c.v;
  }
  const raw = await env.KV.get(k);
  if (!raw) return null;
  let v = null;
  try { v = JSON.parse(raw); } catch (e) { return null; }
  // نرمال سازی داده های قدیمی/ناقص تا هیچ وقت پنل با خطا مواجه نشود
  if (v && typeof v === 'object') {
    if (!v.locks || typeof v.locks !== 'object') v.locks = {};
    if (!v.schedule || typeof v.schedule !== 'object')
      v.schedule = { enabled: false, start: 4 * 60, end: 20 * 60, mode: 'all' };
    if (!v.instant || typeof v.instant !== 'object') v.instant = { on: false, at: 0 };
    if (typeof v.active !== 'boolean') v.active = true; // مهاجرت نسخه های قبل: چنل های قبلی فعال اند
    // مهاجرت v1.8: redMedia بولین قدیمی → punishMode سه حالته
    if (!['off', 'yellow', 'red'].includes(v.punishMode))
      v.punishMode = v.redMedia === true ? 'red' : 'off';
    delete v.redMedia;
    // ⏱ v1.9: مدت بن خودکار — مقدار نامعتبر ⇒ همیشگی
    if (!BAN_HOURS.includes(v.banHours)) v.banHours = 0;
    // 📣 v2.6: کلید اعلان قفل ها — چنل های قدیمی (بدون این فیلد) اعلان روشن دارند
    if (typeof v.ann !== 'boolean') v.ann = true;
  }
  scache.set(k, { v, exp: Date.now() + CACHE_TTL_MS });
  return v;
}

async function saveSettings(env, cid, s) {
  const k = 'chat:' + cid;
  await env.KV.put(k, JSON.stringify(s));
  scache.set(k, { v: s, exp: Date.now() + CACHE_TTL_MS });
}

async function listChats(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'chat:' });
    for (const k of page.keys) {
      const cid = k.name.slice(5);
      const s = await getSettings(env, cid, true);
      if (s) {
        out.push({
          cid,
          title: s.title || tr('چنل'),
          active: Object.values(s.locks || {}).filter(Boolean).length,
          sched: !!(s.schedule && s.schedule.enabled),
          inst: !!(s.instant && s.instant.on),
          on: s.active !== false, // فعال از نظر مالک (تک چنله)
        });
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

/* ── 📣 v3.0 — مخاطبین ( گروه ها و پیوی های شناخته شده ) برای مقصد « پیام همگانی » ──
 *  هر چتی که با ربات حرف بزند ( پیوی ) یا ربات به آن اضافه شود ( گروه ) یک بار در کلید
 *  « aud:index » ثبت میشود — فقط روی تغییر ( چت تازه یا عوض شدن نام ) نوشتن داریم تا
 *  سهمیه نوشتن KV هدر نرود. سقف ۳۰۰ مخاطب ( قدیمی ترین ها حذف میشوند ). */
const AUD_KEY = 'aud:index';
const audCache = { v: null, exp: 0 };
const audSeen = new Set(); // چت هایی که این ایزوله مطمئن است ثبت شده اند

async function audIndex(env) {
  if (audCache.v && audCache.exp > Date.now()) return audCache.v;
  let v = null;
  try { const raw = await env.KV.get(AUD_KEY); v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
  audCache.v = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  audCache.exp = Date.now() + 60000;
  return audCache.v;
}

async function recordAud(env, chat) {
  if (!chat || !chat.id) return;
  const t = chat.type;
  if (t !== 'private' && t !== 'group' && t !== 'supergroup') return;
  const id = String(chat.id);
  const idx = await audIndex(env);
  const cur = idx[id];
  const title = t === 'private'
    ? ([chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? '@' + chat.username : ('پیوی ' + id)))
    : (chat.title || ('گروه ' + id));
  if (cur && cur.t === t && cur.title === title) { audSeen.add(id); return; }
  if (!cur && audSeen.has(id)) return; // همین ایزوله تازه ثبتش کرده
  idx[id] = { t, title, at: Date.now() };
  const ids = Object.keys(idx);
  if (ids.length > 300) {
    ids.sort((a, b) => (idx[a].at || 0) - (idx[b].at || 0));
    for (const k of ids.slice(0, ids.length - 300)) delete idx[k];
  }
  try {
    await env.KV.put(AUD_KEY, JSON.stringify(idx));
    audCache.v = idx; audCache.exp = Date.now() + 60000;
    audSeen.add(id);
  } catch (e) { /* بی اهمیت — دفعه بعد دوباره تلاش میشود */ }
}

/* ---------------------------- KV: آمار و لاگ تخلفات (یک کلید ادغام شده) ---------------------------- */

/**
 * ⚡️ v1.5: آمار (stat:) و « آخرین تخلف ها » (vlog:) قبلاً دو کلید جدا بودند و هر فلاش دو نوشتن
 * مصرف میکرد. حالا هر دو داخل « stat:{cid} » ذخیره میشوند ⇒ هر فلاش فقط « یک » نوشتن.
 * داده قدیمی vlog:{cid} هنگام اولین خواندن خودکار مهاجرت داده میشود (بدون از دست رفتن).
 *
 * بافر آمار در حافظه + حداقل فاصله فلاش (DEFAULT_FLUSH_GAP_MS) ⇒ حتی در حمله موجی،
 * سهمیه نوشتن KV پلن رایگان (۱هزار/روز) پر نمیشود.
 */
const pend = new Map();      // cid -> {n, edits, posts, by{}, timer}
const pendVlog = new Map();  // cid -> [{t,r,e,ok,mid,id,nm,sn}]
const lastFlush = new Map(); // cid -> زمان آخرین فلاش واقعی (برای حداقل فاصله)

function flushGapMs(env) {
  return Math.max(0, Number(env.MIN_FLUSH_GAP_MS ?? DEFAULT_FLUSH_GAP_MS) || 0);
}

function bumpStats(env, ctx, cid, isEdit, reason) {
  let b = pend.get(cid);
  if (!b) { b = { n: 0, edits: 0, posts: 0, by: {}, timer: false }; pend.set(cid, b); }
  b.n++; if (isEdit) b.edits++; else b.posts++;
  b.by[reason] = (b.by[reason] || 0) + 1;
  // ⚠️ مهم: حتماً waitUntil — وگرنه ورکر ممکن است قبل از اتمام flush خاموش شود و آمار گم شود
  const gap = flushGapMs(env);
  const since = Date.now() - (lastFlush.get(cid) || 0);
  if (b.n >= 5 && since >= gap) { ctx.waitUntil(flushStats(env, cid)); return; }
  if (!b.timer) {
    b.timer = true;
    // اگر به خاطر حداقل فاصله فلاش فوری ممکن نیست، تایمر تا پایان فاصله عقب میافتد — نه زودتر، نه دیرتر
    const ms = Math.max(Number(env.FLUSH_MS || DEFAULT_FLUSH_MS), gap - Math.max(0, since));
    ctx.waitUntil(
      new Promise((r) => setTimeout(r, ms)).then(() => flushStats(env, cid)).catch(() => {})
    );
  }
}

/** ثبت یک تخلف در لاگ « آخرین تخلف ها » — همراه با فلاش آمار ذخیره میشود */
function addVlog(env, cid, msg, a, reason, isEdit, okDel) {
  let arr = pendVlog.get(cid);
  if (!arr) { arr = []; pendVlog.set(cid, arr); }
  const w = whoInfo(msg);
  arr.push({
    t: Date.now(), r: reason, e: isEdit ? 1 : 0, ok: okDel ? 1 : 0,
    mid: msg.message_id, id: w.id, nm: w.nm,
    sn: String(msg.text || msg.caption || (a && a.media ? '[' + a.media + ']' : '')).slice(0, 100),
  });
}

/** خواندن رکورد ادغام شده آمار+لاگ با مهاجرت خودکار از کلید قدیمی vlog:{cid} */
async function readStatLog(env, cid) {
  let st = null;
  try { const raw = await env.KV.get('stat:' + cid); st = raw ? JSON.parse(raw) : null; } catch (e) { st = null; }
  if (!st || typeof st !== 'object' || !Array.isArray(st.vlog)) {
    const base = st && typeof st === 'object' ? st : {};
    let old = [];
    if (!Array.isArray(base.vlog)) {
      try {
        const raw = await env.KV.get('vlog:' + cid);
        old = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(old)) old = [];
      } catch (e) { old = []; }
    }
    st = {
      total: base.total || 0, edits: base.edits || 0, posts: base.posts || 0,
      by: base.by || {}, last: base.last || 0,
      vlog: Array.isArray(base.vlog) ? base.vlog : old,
    };
  }
  return st;
}

/** 📅 v1.9 — به روزرسانی شمارنده « امروز » با چرخش خودکار روز (به وقت تهران) */
function addToday(st, n, e, p) {
  const d = tehranDateStr(Date.now());
  if (!st.today || st.today.d !== d) st.today = { d, n: 0, e: 0, p: 0 };
  st.today.n += n; st.today.e += e; st.today.p += p;
}

async function flushStats(env, cid) {
  const b = pend.get(cid);
  const vl = pendVlog.get(cid);
  if ((!b || !b.n) && (!vl || !vl.length)) return;
  pend.delete(cid); pendVlog.delete(cid);
  try {
    // ⚡️ یک خواندن + یک نوشتن به جای دوتا (آمار و « آخرین تخلف ها » یک کلید مشترک دارند)
    const st = await readStatLog(env, cid);
    if (b && b.n) {
      st.total += b.n; st.edits += b.edits; st.posts += b.posts;
      for (const [r, n] of Object.entries(b.by)) st.by[r] = (st.by[r] || 0) + n;
      st.last = Date.now();
      addToday(st, b.n, b.edits, b.posts); // 📅 v1.9
    }
    if (vl && vl.length) st.vlog = (st.vlog || []).concat(vl).slice(-VLOG_MAX);
    await env.KV.put('stat:' + cid, JSON.stringify(st));
    lastFlush.set(cid, Date.now());
  } catch (e) {
    console.error('flushStats', e);
  }
}

async function readVlog(env, cid) {
  const st = await readStatLog(env, cid);
  const p = pendVlog.get(cid);
  const list = st.vlog || [];
  return p && p.length ? list.concat(p).slice(-VLOG_MAX) : list;
}

async function readStats(env, cid) {
  const st = await readStatLog(env, cid);
  const b = pend.get(cid);
  if (b) {
    st.total += b.n; st.edits += b.edits; st.posts += b.posts;
    for (const [r, n] of Object.entries(b.by)) st.by[r] = (st.by[r] || 0) + n;
    addToday(st, b.n, b.edits, b.posts); // 📅 v1.9
  }
  return { total: st.total, edits: st.edits, posts: st.posts, by: st.by, last: st.last,
    today: st.today || { d: tehranDateStr(Date.now()), n: 0, e: 0, p: 0 } };
}

async function resetStats(env, cid) {
  pend.delete(cid); pendVlog.delete(cid);
  await env.KV.put('stat:' + cid, JSON.stringify({ total: 0, edits: 0, posts: 0, by: {}, last: 0, vlog: [],
    today: { d: tehranDateStr(Date.now()), n: 0, e: 0, p: 0 } }));
  await env.KV.delete('vlog:' + cid); // پاک سازی کلید قدیمی (اگر از نسخه های قبل مانده باشد)
}

/* ---------------------------- تحلیل پیام ---------------------------- */

const MEDIA_KEYS = ['live_photo', 'photo', 'animation', 'sticker', 'video', 'video_note',
  'voice', 'audio', 'document', 'poll', 'contact', 'location', 'dice',
  /* 🆕 v2.4 — تایپ های جدید تلگرام (Bot API 9.x/10.x) */
  'paid_media', 'checklist', 'rich_message'];

/**
 * تحلیل دقیق پیام چنل:
 *  isService → پیام سیستمی (هرگز حذف نشود)
 *  media     → نوع مدیا در صورت وجود
 *  isText    → پیام متنی خالص
 *  isForward → فوروارد شده
 *  hasLink   → حاوی لینک (entities یا regex)
 */
function analyze(msg) {
  const a = { isService: false, media: null, isText: false, isForward: false, hasLink: false,
              album: null, ownerAlert: null };
  // 🔔 v2.4 — هشدار امنیتی: تغییر/ترک مالکیت چنل (سیستمی است + به مالک گزارش میشود)
  if (msg.chat_owner_changed || msg.chat_owner_left) {
    a.isService = true;
    a.ownerAlert = msg.chat_owner_changed ? 'changed' : 'left';
    return a;
  }
  if (msg.pinned_message || msg.new_chat_title || msg.new_chat_photo ||
      msg.delete_chat_photo || msg.new_chat_members || msg.left_chat_member ||
      msg.group_chat_created || msg.migrate_to_chat_id || msg.video_chat_started ||
      /* 🆕 v2.4 — پیام های سیستمی تایپ های جدید (Communities، نظرسنجی، ربات مدیریتی) */
      msg.community_chat_added || msg.community_chat_removed || msg.community_chat_joined ||
      msg.poll_option_added || msg.poll_option_deleted || msg.managed_bot_created) {
    a.isService = true;
    return a;
  }
  for (const k of MEDIA_KEYS) { if (msg[k]) { a.media = k; break; } }
  a.isText = !a.media && typeof msg.text === 'string';
  a.isForward = !!(msg.forward_origin || msg.forward_from || msg.forward_from_chat ||
                   msg.forward_sender_name || msg.forward_date);
  const ents = [...(msg.entities || []), ...(msg.caption_entities || [])];
  a.hasLink = ents.some((e) => e.type === 'url' || e.type === 'text_link');
  const body = msg.text || msg.caption || '';
  if (!a.hasLink && body) a.hasLink = /(https?:\/\/|www\.|t\.me\/)/i.test(body);
  // 🧩 v2.4 — شناسه آلبوم/اسلایدشو (چند عکس/ویدیو با هم)
  a.album = msg.media_group_id ? String(msg.media_group_id) : null;
  return a;
}

const KIND_REASON = {
  live_photo: 'قفل ارسال عکس زنده', photo: 'قفل ارسال عکس', video: 'قفل ارسال ویدیو', animation: 'قفل ارسال گیف',
  sticker: 'قفل ارسال استیکر', voice: 'قفل ارسال ویس', video_note: 'قفل ارسال ویدیو نوت',
  audio: 'قفل ارسال موزیک', document: 'قفل ارسال فایل', poll: 'قفل ارسال نظرسنجی',
  contact: 'قفل ارسال مخاطب', location: 'قفل ارسال لوکیشن', dice: 'قفل ارسال بازی',
};

/** نگاشت کلید پیام تلگرام → کلید قفل مربوطه (نام ها یکی نیستن!) */
const KIND_LOCK = {
  live_photo: 'send_photo', photo: 'send_photo', video: 'send_video', animation: 'send_gif',
  sticker: 'send_sticker', voice: 'send_voice', video_note: 'send_vnote',
  audio: 'send_audio', document: 'send_file', poll: 'send_poll',
  contact: 'send_contact', location: 'send_location', dice: 'send_dice',
};

/**
 * تصمیم نهایی حذف؛ خروجی: دلیل فارسی یا null
 * ترتیب اولویت: قفل آنی → قفل کامل → قفل زمان دار → لینکِ ادیت → ادیت متن/مدیا → فوروارد → لینک → نوع ارسال
 */
function matchViolation(s, msg, a, isEdit) {
  const L = s.locks || {};
  if (a.isService) return null;

  // 🟡🔴 v1.8 — نردبان وضعیت برای ادیت ها (بالاترین اولویت):
  const pm = s.punishMode || 'off';
  if (isEdit && a.media && pm !== 'off') return pm === 'red' ? '🔴 ادیت مدیا (وضعیت قرمز)' : '🟡 ادیت مدیا (وضعیت زرد)';
  if (pm !== 'off' && isEdit && a.isText) return pm === 'red' ? 'ادیت متن (وضعیت قرمز)' : 'ادیت متن (وضعیت زرد)';

  // قفل آنی: دستی و کامل — تا وقتی « باز کردن » نزنی، هر پیام/ادیتِ هر نوعی فوراً حذف میشود
  if (s.instant && s.instant.on) return 'قفل آنی (دستی)';

  if (L.master) return 'قفل کامل';

  // 🔒 v1.9 — قفل پست ناشناس: هر پست/ادیتِ « بدون امضای ادمین » حذف میشود
  // (هدف: هیچ کس نتواند بدون هویت واقعی خودش پست بدهد — ادمین باید با Sign messages پست بدهد)
  if (L.lock_anon && !msg.author_signature) return 'قفل پست ناشناس';

  if (isScheduleActive(s)) {
    const mode = (s.schedule && s.schedule.mode) || 'all';
    if (mode === 'all') return 'قفل زمان دار (ارسال و ادیت)';
    if (isEdit && mode === 'edit') return 'قفل زمان دار (فقط ادیت)';
    if (!isEdit && mode === 'send') return 'قفل زمان دار (فقط ارسال)';
  }

  if (isEdit) {
    if (L.edit_link && a.hasLink) return 'قفل لینک در ادیت';
    if (a.isText && L.edit_text) return 'قفل ادیت متن';
    if (a.media && L.edit_media) return 'قفل ادیت مدیا';
    return null;
  }

  if (a.isForward && L.send_forward) return 'قفل فوروارد';
  if (a.hasLink && L.send_link) return 'قفل لینک';
  if (a.isText && L.send_text) return 'قفل ارسال متن';
  if (a.media) {
    const lk = KIND_LOCK[a.media];
    if (lk && L[lk]) return KIND_REASON[a.media] || ('قفل ' + LOCKS[lk].label);
  }
  return null;
}

/* ---------------------------- حذف تخلف + لاگ ---------------------------- */

/**
 * ⚡️ گزارش دسته بندی شده پیوی (v1.5):
 * اولین گزارشِ هر گیرنده فوری میرود؛ گزارش های بعدی که داخل پنجره کوتاه (۵ ثانیه)
 * برسند در « یک پیام خلاصه » ادغام میشوند. نتیجه: در موج تخلف، به جای ده ها پیام پشت سرهم
 * (که لیمیت ارسال تلگرام را فعال میکند و بقیه گزارش ها گم میشوند) فقط ۱ فوری + ۱ خلاصه میرود.
 */
const rptQ = new Map(); // target -> { items: [], until: ts }

function queueReport(env, ctx, target, text, line) {
  const win = Math.max(0, Number(env.REPORT_WINDOW_MS ?? DEFAULT_REPORT_WIN_MS) || 0);
  if (!win || !ctx) return send(env, target, text).catch(() => {});
  const now = Date.now();
  let q = rptQ.get(target);
  if (!q || now >= q.until) {
    // پنجره تازه: گزارش اول فوری، آستانه جمع کردن بقیه باز میشود
    rptQ.set(target, { items: [], until: now + win });
    ctx.waitUntil(
      new Promise((r) => setTimeout(r, win)).then(() => flushReport(env, target)).catch(() => {})
    );
    return send(env, target, text).catch(() => {});
  }
  q.items.push(line || text);
  return Promise.resolve({ ok: true });
}

async function flushReport(env, target) {
  const q = rptQ.get(target);
  if (!q) return;
  rptQ.delete(target);
  if (!q.items.length) return; // تخلف دیگری در پنجره نبود ⇒ پیام اضافه ای نمیرود
  const shown = q.items.slice(0, REPORT_MAX_LINES);
  const rest = q.items.length - shown.length;
  const t =
    L(`<b>${q.items.length} تخلف دیگر تو همین چند ثانیه :</b>\n\n` +
    shown.join('\n') +
    (rest > 0 ? `\n\n… و ${rest} مورد دیگر` : '') +
    `\n\nجزئیات کامل : « آخرین تخلف ها » تو پنل چنل .`,
    `<b>${q.items.length} more violations within these few seconds:</b>\n\n` +
    shown.join('\n') +
    (rest > 0 ? `\n\n… and ${rest} more` : '') +
    `\n\nFull details: "Latest violations" in the channel panel.`);
  await send(env, target, t).catch(() => {});
}

/** 📡 v2.0 — گیرنده های گزارش برای یک چنل: مالک + ادمین ها/ناظرهای دارای دسترسی به همان چنل */
async function reportTargets(env, cid) {
  const targets = new Set();
  const owner = await getOwnerId(env);
  if (owner) targets.add(String(owner));
  const acc = await getScopes(env);
  const admins = await getAdmins(env);
  const viewers = await getViewers(env);
  // دامنه پیش فرض فقط وقتی محاسبه میشود که عضوی بدون سابقه scope باشد (صرفه جویی)
  const missing = admins.some((a) => !acc.a[String(a)]) || viewers.some((v) => !acc.v[String(v)]);
  const dflt = missing ? await defaultChs(env) : null;
  const chsOf = (e) => (e ? e.ch : dflt);
  for (const a of admins) if (chHas(chsOf(acc.a[String(a)]), cid)) targets.add(String(a));
  for (const v of viewers) if (chHas(chsOf(acc.v[String(v)]), cid)) targets.add(String(v));
  return targets;
}

/** گزارش حذف ها: پیوی مالک + ادمین ها/ناظرهای همان چنل (موازی و دسته بندی شده) */
async function sendOwnerLog(env, ctx, cid, text, line) {
  const targets = await reportTargets(env, cid);
  await Promise.all([...targets].map((t) => queueReport(env, ctx, t, text, line)));
}

function snippet(msg, a) {
  const body = msg.text || msg.caption || '';
  if (body) return '« ' + esc(body.slice(0, 80)) + (body.length > 80 ? '…' : '') + ' »';
  if (a.media) {
    // 🆕 v2.4 — برچسب دو زبانه برای تایپ های جدید؛ بقیه مثل قبل
    const mf = MEDIA_FA[a.media];
    if (mf) return 'نوع: ' + L(mf[0], mf[1]) + ' — <code>' + esc(a.media) + '</code>';
    return L('نوع: <code>', 'Type: <code>') + esc(a.media) + '</code>';
  }
  return '';
}

/** اطلاعات فرستنده: در پست های چنل معمولاً تلگرام from را نمیفرستد؛ امضای ادمین ممکن است باشد */
function whoInfo(msg) {
  const f = msg.from;
  if (f && f.id) {
    const nm = [f.first_name, f.last_name].filter(Boolean).join(' ') || f.username || 'کاربر';
    return { id: f.id, nm: String(nm).slice(0, 60) };
  }
  if (msg.author_signature) return { id: null, nm: 'امضا: ' + String(msg.author_signature).slice(0, 40) };
  return { id: null, nm: 'ناشناس' };
}

/* ─────────────── 🧩 v2.4: آلبوم/اسلایدشو — حذف کل آلبوم هنگام تخلف ─────────────── */

/**
 * عکس/ویدیوهای هم گروه (media_group_id مشترک) در همین ایزوله ثبت میشوند؛
 * اگر یکی از آن ها تخلف بود، « کل آلبوم » هم حذف میشود. کاملاً درون حافظه — صفر KV.
 * نکته: اگر آلبوم بین ایزوله های مختلف پخش شود، هر قسمت جدا هم همیشه مستقل چک/حذف میشود.
 */
const albumQ = new Map(); // `${cid}|${mgid}` -> { ids: [], ts }
const ALBUM_TTL_MS = 15 * 60 * 1000;
const ALBUM_WIPE_MAX = 10; // سقف حذف اضافه در هر تخلف (بودجه subrequest)

function albumRemember(cid, mgid, mid) {
  const k = cid + '|' + mgid;
  const now = Date.now();
  let e = albumQ.get(k);
  if (!e || now - e.ts > ALBUM_TTL_MS) { e = { ids: [], ts: now }; albumQ.set(k, e); }
  if (!e.ids.includes(mid)) { e.ids.push(mid); if (e.ids.length > 20) e.ids.shift(); }
  if (albumQ.size > 200) { for (const [kk, vv] of albumQ) if (now - vv.ts > ALBUM_TTL_MS) albumQ.delete(kk); }
}

async function albumWipe(env, cid, mgid, keepMid) {
  if (!mgid) return 0;
  const e = albumQ.get(cid + '|' + mgid);
  if (!e) return 0;
  const ids = e.ids.filter((x) => x !== keepMid).slice(-ALBUM_WIPE_MAX);
  let n = 0;
  for (const mid of ids) {
    const r = await tg(env, 'deleteMessage', { chat_id: cid, message_id: mid });
    if (r.ok) n++;
  }
  return n;
}

const MEDIA_FA = { live_photo: ['عکس زنده', 'Live photo'], checklist: ['چک لیست', 'Checklist'],
                   rich_message: ['پیام ریچ', 'Rich message'], paid_media: ['مدیای پولی', 'Paid media'] };

/**
 * لینک عمومی t.me یک پیام:
 *  • چنل/گروه عمومی (با یوزرنیم) → https://t.me/<username>/<mid>
 *  • چنل/سوپرگروه خصوصی (-100…) → https://t.me/c/<شناسه داخلی>/<mid>  (فقط برای اعضا)
 *  • بقیه حالت ها (گروه ساده بدون یوزرنیم) → null (لینکی وجود ندارد)
 */
function tgMsgLink(username, cid, mid) {
  if (!mid) return null;
  if (username) return 'https://t.me/' + String(username).replace(/^@/, '') + '/' + mid;
  cid = String(cid || '');
  if (cid.startsWith('-100')) return 'https://t.me/c/' + cid.slice(4) + '/' + mid;
  return null;
}

/** خط « چه کسی » در گزارش پیوی: منشن کلیک پذیر + شناسه عددی */
function whoHTML(msg) {
  const f = msg.from;
  if (f && f.id) {
    const name = esc([f.first_name, f.last_name].filter(Boolean).join(' ') || f.username || 'کاربر');
    const uname = f.username ? ' (@' + esc(f.username) + ')' : '';
    return `<a href="tg://user?id=${f.id}">${name}</a>${uname}\nشناسه : <code>${f.id}</code>`;
  }
  const w = whoInfo(msg);
  return L(`${esc(w.nm)}\nتلگرام شناسه عددی فرستنده پست چنل رو نمیفرسته`,
           `${esc(w.nm)}\nTelegram does not send the numeric ID of channel-post senders`);
}

async function enforce(env, ctx, cid, s, msg, a, reason, isEdit) {
  // ⚡️ بهینه سازی: اگر پیام قطعاً قدیمی تر از ۴۸ ساعت است، تلگرام حتماً رد میکند؛
  // پس درخواستِ حذفِ محکوم به شکست اصلاً ارسال نمیشود (۱۰ دقیقه حاشیه برای اطمینان)
  const sentAt = Number(msg.date || 0) * 1000;
  const tooOld = !!(sentAt && Date.now() - sentAt > AGE_SKIP_MS);
  const del = tooOld
    ? { ok: false, description: "Bad Request: message can't be deleted" }
    : await tg(env, 'deleteMessage', { chat_id: cid, message_id: msg.message_id });
  // 🧩 v2.4 — اگر پیام بخشی از آلبوم/اسلایدشو بود، بقیه آلبوم هم حذف میشود
  const albumWiped = del.ok && a.album ? await albumWipe(env, cid, a.album, msg.message_id) : 0;
  addVlog(env, cid, msg, a, reason, isEdit, del.ok);
  bumpStats(env, ctx, cid, isEdit, reason);

  if (s.log_pm !== false) {
    // دسته بندی دقیق دلیل شکست حذف — مهم: تلگرام اجازه حذف پیام های >۴۸ ساعت را به هیچ رباتی نمیدهد
    const d = (del.description || '').toLowerCase();
    let head;
    const isTooOldMsg = /can'?t be deleted|cannot be deleted|cant be deleted/.test(d);
    if (del.ok) {
      head = L('<b>تخلف حذف شد</b>', '<b>Violation deleted</b>');
    } else if (isTooOldMsg) {
      head = L(
        '<b>حذف نشد — پیام قدیمیه !</b>\n' +
        'این محدودیت خود تلگرامه : هیچ رباتی نمیتونه پیام های قدیمی تر از <b>۴۸ ساعت</b> رو حذف کنه ( ربات دسترسی کامل داره ) .\n' +
        'ادیت این پیام شناسایی و گزارش شد ؛ پست های تازه متخلف بلافاصله حذف میشن .\n' +
        'خودت به عنوان ادمین انسانی این محدودیت رو نداری ؛ با لینک پایین پیام رو باز کن و دستی حذفش کن .',
        '<b>Not deleted — the message is too old!</b>\n' +
        'This is a Telegram limitation: no bot can delete messages older than <b>48 hours</b> (the bot has full permissions).\n' +
        'The edit of this message was detected and reported; fresh violating posts are deleted instantly.\n' +
        'As a human admin you are not subject to this limit — open the message with the link below and delete it manually.');
    } else if (/not found|message_id_invalid/.test(d)) {
      head = L('<b>حذف ناموفق — پیام پیدا نشد .</b>\nاحتمالاً همین پیام قبلاً حذف شده .',
               '<b>Deletion failed — message not found.</b>\nIt was probably already deleted.');
    } else {
      head = L(
        '<b>حذف ناموفق بود !</b>\n' +
        'احتمالاً دسترسی « حذف پیام » به ربات داده نشده .\n' +
        `جزئیات تلگرام: <code>${esc(del.description || 'نامشخص')}</code>`,
        '<b>Deletion failed!</b>\n' +
        'The "Delete messages" permission is probably not granted to the bot.\n' +
        `Telegram details: <code>${esc(del.description || 'نامشخص')}</code>`);
    }
    // لینک پیام: اولویت با یوزرنیمِ خود آپدیت، بعد تنظیمات، در نهایت فرم خصوصی t.me/c/
    const link = tgMsgLink((msg.chat && msg.chat.username) || s.username || '', cid, msg.message_id);
    const txt =
      L(`${head}\n\n` +
      `چنل : <b>${esc(s.title)}</b>\n` +
      `${L('دلیل', 'Reason')} : <b>${esc(tr(reason))}</b>\n` +
      `${isEdit ? 'نوع : ادیت' : 'نوع : ارسال'}\n` +
      `${whoHTML(msg)}\n` +
      `${snippet(msg, a)}\n` +
      (albumWiped ? L(`کل آلبوم/اسلایدشو حذف شد — ${albumWiped} پست دیگر\n`, `Entire album/slideshow deleted — ${albumWiped} more post(s)\n`) : '') +
      `پیام : <code>${msg.message_id}</code>\n` +
      (link ? `لینک پیام : ${link}\n` : '') +
      (reason === 'قفل پست ناشناس' ? `برای پست دادن با هویت واقعی ، گزینه « Sign messages » ( امضا ) تو تنظیمات چنل/ادمین باید روشن باشه .\n` : '') +
      (isTooOldMsg ? `این پیام برای « حذف خودکار با اکانت » هم به صف رفت ؛ اگه یوزربات همراه وصل باشه خودش حذفش میکنه .\n` : '') +
      `ساعت تهران : <code>${tehranHM()}</code>`,
      `${head}\n\n` +
      `📺 Channel: <b>${esc(s.title)}</b>\n` +
      `⚠️ Reason: <b>${esc(tr(reason))}</b>\n` +
      `${isEdit ? 'Type: edit' : 'Type: post'}\n` +
      `${whoHTML(msg)}\n` +
      `${snippet(msg, a)}\n` +
      (albumWiped ? `Entire album/slideshow deleted — ${albumWiped} more post(s)\n` : '') +
      `Message: <code>${msg.message_id}</code>\n` +
      (link ? `Message link: ${link}\n` : '') +
      (reason === 'قفل پست ناشناس' ? `💡 To post with a real identity, the "Sign messages" option must be enabled in the channel/admin settings.\n` : '') +
      (isTooOldMsg ? `This message was also queued for "deletion via user account" — if the companion userbot is connected, it will delete it.\n` : '') +
      `Tehran time: <code>${tehranHM()}</code>`);
    // خط کوتاه برای حالت موجی (وقتی چند گزارش در یک خلاصه ادغام میشوند)
    const w = whoInfo(msg);
    const line = `${del.ok ? '' : '(حذف نشد) '}<b>${esc(tr(reason))}</b> — ${esc(tr(w.nm))} — پیام <code>${msg.message_id}</code>`;
    // 🤖 پیام های قطعاً قدیمی تر از ۴۸ ساعت ⇒ صف حذف با اکانت (یوزرباتِ همراه)
    if (isTooOldMsg && ctx) ctx.waitUntil(enqueueUserbotJob(env, cid, msg.message_id));
    await sendOwnerLog(env, ctx, cid, txt, line);
  }
}

/* ============================================================================
 *  🔴 v1.7 — وضعیت قرمز مدیا + 👑 ادمین سازی در چنل
 * ==========================================================================*/

/** گرفتن همه دسترسی های ادمینی یک کاربر (عزل ادمین — بن نمیشود) */
async function demoteAdmin(env, cid, uid) {
  return tgSmart(env, 'promoteChatMember', {
    chat_id: cid, user_id: uid,
    is_anonymous: false, can_manage_chat: false, can_manage_video_chats: false,
    can_post_messages: false, can_edit_messages: false, can_delete_messages: false,
    can_restrict_members: false, can_promote_members: false, can_change_info: false,
    can_invite_users: false, can_pin_messages: false, can_manage_topics: false,
    can_post_stories: false, can_edit_stories: false, can_delete_stories: false,
  });
}

/** گزارش فوری وضعیت قرمز — بدون ادغام موجی؛ مالک + ادمین ها/ناظرهای همان چنل (v2.0) */
async function sendRedAlert(env, cid, text, markup) {
  const targets = await reportTargets(env, cid);
  await Promise.all([...targets].map((t) => send(env, t, text, markup).catch(() => {})));
}

/**
 * ⏱ v1.9 — ساخت payload بن: با مدت (until_date) وقتی « مدت بن خودکار » غیر از همیشگی است
 * (بعد از گذر مدت، تلگرام خودش بن را باز میکند؛ دکمه « ♻️ لغو بن » همیشه هم کار میکند)
 */
function banPay(env, cid, uid, s) {
  const p = { chat_id: cid, user_id: uid };
  if (s && Number(s.banHours) > 0) p.until_date = Math.floor(Date.now() / 1000) + Number(s.banHours) * 3600;
  return p;
}

/**
 * 🟡🔴 v1.8: ادیتِ پستی که مدیا دارد، وقتی وضعیت زرد/قرمز فعال است ⇒
 * حذف فوری + شناسایی متخلف (موازی با حذف) + عزل ادمینی؛ بن فقط در وضعیت قرمز.
 * گزارش فوری (قرمز/زرد) با دکمه لغو بن و ↩️ بازگردانی دسترسی های قبلی (snapshot در KV).
 * شناسایی متخلف: اگر تلگرام from داد ⇒ همان؛ وگرنه تطبیق امضای پست با ادمین های چنل
 * (امضا معمولاً عنوان/نام ادمین است) — فقط اگر تطبیق « قطعی » (دقیقاً یک نفر) باشد.
 * محافظت: خودِ ربات و مالکِ چنل (creator) هرگز هدف نمیگیرند.
 */
async function redEnforce(env, ctx, cid, s, msg, a, reason) {
  const pm = s.punishMode === 'red' ? 'red' : 'yellow';
  const sentAt = Number(msg.date || 0) * 1000;
  const tooOld = !!(sentAt && Date.now() - sentAt > AGE_SKIP_MS);
  bumpStats(env, ctx, cid, true, reason);
  if (tooOld && ctx) ctx.waitUntil(enqueueUserbotJob(env, cid, msg.message_id));

  // ── شناسایی متخلف (خودِ ربات هرگز هدف نیست) + حذف پیام — به صورت موازی (v1.8) ──
  const me = await botInfo(env);
  const f = msg.from || {};
  const identify = (async () => {
    if (f && f.id && String(f.id) !== String(cid) && String(f.id) !== String(me.id)) {
      return { id: f.id,
        name: [f.first_name, f.last_name].filter(Boolean).join(' ') || f.username || L('کاربر', 'User'),
        how: L('از تلگرام', 'from Telegram') };
    }
    const sig = String(msg.author_signature || '').trim();
    if (sig) {
      const r = await tg(env, 'getChatAdministrators', { chat_id: cid });
      if (r.ok && Array.isArray(r.result)) {
        const cands = r.result.filter((m) => m && m.status === 'administrator' && m.user &&
          String(m.user.id) !== String(me.id) && (
          String(m.custom_title || '') === sig ||
          [m.user.first_name, m.user.last_name].filter(Boolean).join(' ') === sig ||
          (m.user.username && (sig === m.user.username || sig === '@' + m.user.username))));
        if (cands.length === 1) {
          return { id: cands[0].user.id,
            name: [cands[0].user.first_name, cands[0].user.last_name].filter(Boolean).join(' ') || cands[0].user.username || L('ادمین', 'Admin'),
            how: L('تطبیق امضای پست با ادمین ها', 'signature matched against channel admins') };
        }
      }
    }
    return null;
  })();
  const [del, ident] = await Promise.all([
    tooOld
      ? Promise.resolve({ ok: false, description: "Bad Request: message can't be deleted" })
      : tg(env, 'deleteMessage', { chat_id: cid, message_id: msg.message_id }),
    identify,
  ]);
  // 🧩 v2.4 — حذف کل آلبوم/اسلایدشو در نردبان زرد/قرمز هم
  const albumWiped = del.ok && a.album ? await albumWipe(env, cid, a.album, msg.message_id) : 0;
  const target = ident ? ident.id : null, tname = ident ? ident.name : '', how = ident ? ident.how : '';
  addVlog(env, cid, msg, a, reason, true, del.ok);

  // ── مجازات: زرد ⇒ فقط عزل / قرمز ⇒ عزل + بن (v1.8) + snapshot برای بازگردانی ──
  let pun = null, ownerSkip = false, prev = null;
  if (target) {
    const st = await tg(env, 'getChatMember', { chat_id: cid, user_id: target });
    const status = st.ok && st.result ? st.result.status : null;
    if (status === 'creator') {
      ownerSkip = true; // مالک چنل قابل عزل/بن نیست
    } else if (status === 'administrator') {
      prev = {}; // snapshot دسترسی های فعلی برای « ↩️ بازگردانی »
      for (const k of CAM_ORDER) prev[k] = !!st.result[CAM_OPTS[k].param];
      await env.KV.put(`undo:${cid}:${target}`, JSON.stringify(prev), { expirationTtl: 86400 }).catch(() => {});
      const demote = await demoteAdmin(env, cid, target);
      const ban = pm === 'red' ? await tgSmart(env, 'banChatMember', banPay(env, cid, target, s)) : null;
      pun = { demote, ban };
    } else {
      const ban = pm === 'red' ? await tgSmart(env, 'banChatMember', banPay(env, cid, target, s)) : null;
      pun = { demote: null, ban };
    }
  }

  // ── گزارش فوری (قرمز = عزل+بن / زرد = فقط عزل) ──
  const link = tgMsgLink((msg.chat && msg.chat.username) || s.username || '', cid, msg.message_id);
  const dem = pun && pun.demote, ban = pun && pun.ban;
  const bh = Number(s.banHours) > 0 ? Number(s.banHours) : 0; // ⏱ v1.9
  const txt =
    L((pm === 'red' ? `<b>وضعیت قرمز — تخلف سنگین !!</b>\n\n` : `<b>وضعیت زرد — ادیت مدیا ( عزل خودکار )</b>\n\n`) +
    `چنل : <b>${esc(s.title)}</b>\n` +
    `${esc(tr(reason))}\n` +
    `${snippet(msg, a)}\n` +
    `پیام : <code>${msg.message_id}</code>${link ? ` — <a href="${link}">باز کردن</a>` : ''}\n` +
    `حذف پیام : ${del.ok ? 'انجام شد ✅' : '❌ ' + esc(del.description || 'ناموفق')}\n` +
    (albumWiped ? `کل آلبوم/اسلایدشو حذف شد — ${albumWiped} پست دیگر\n` : '') +
    (target
      ? `متخلف : <a href="tg://user?id=${target}">${esc(tname)}</a> — شناسه : <code>${target}</code> ( ${esc(how)} )\n` +
        (ownerSkip
          ? `این فرد « مالک چنل » هست ؛ قابل عزل/بن نیست.\n`
          : (dem
              ? `عزل ادمینی : ${dem.ok ? 'انجام شد ✅' : '❌ ' + esc(dem.description || 'ناموفق')}\n`
              : `این فرد ادمین چنل نیست ؛ چیزی برای عزل نبود.\n`)) +
        (!ownerSkip
          ? (pm === 'red'
              ? `بن از چنل${bh ? ' ( ' + BAN_LABEL[bh] + ' )' : ''} : ${ban ? (ban.ok ? 'انجام شد ✅' : '❌ ' + esc(ban.description || 'ناموفق')) : '—'}\n`
              : `بن : خاموش ( وضعیت زرد ؛ فقط عزل )\n`)
          : '')
      : `متخلف : ${msg.author_signature ? 'امضا : ' + esc(msg.author_signature) : 'ناشناس'}\n` +
        `تلگرام شناسه عددی نداد و امضا هم با هیچ ادمینی قطعی تطبیق نکرد ؛ عزل خودکار ممکن نشد.\n` +
        `عزل دستی : « ادمین های چنل » تو منوی چنل.\n`) +
    `ساعت تهران : <code>${tehranHM()}</code>`,
    (pm === 'red' ? `<b>RED MODE — serious violation!</b>\n\n` : `<b>YELLOW MODE — media edit (auto-demote)</b>\n\n`) +
    `Channel: <b>${esc(s.title)}</b>\n` +
    `${esc(tr(reason))}\n` +
    `${snippet(msg, a)}\n` +
    `Message: <code>${msg.message_id}</code>${link ? ` — <a href="${link}">open</a>` : ''}\n` +
    `Message deleted: ${del.ok ? 'done ✅' : '❌ ' + esc(del.description || 'ناموفق')}\n` +
    (albumWiped ? `Entire album/slideshow deleted — ${albumWiped} more post(s)\n` : '') +
    (target
      ? `Offender: <a href="tg://user?id=${target}">${esc(tname)}</a> — ID: <code>${target}</code> (${esc(how)})\n` +
        (ownerSkip
          ? `This person is the "channel owner" — cannot be demoted/banned.\n`
          : (dem
              ? `Admin demotion: ${dem.ok ? 'done ✅' : '❌ ' + esc(dem.description || 'ناموفق')}\n`
              : `This person is not a channel admin — nothing to demote.\n`)) +
        (!ownerSkip
          ? (pm === 'red'
              ? `Banned from channel${bh ? ' (' + tr(BAN_LABEL[bh]) + ')' : ''}: ${ban ? (ban.ok ? 'done ✅' : '❌ ' + esc(ban.description || 'ناموفق')) : '—'}\n`
              : `Ban: off (yellow mode — demote only)\n`)
          : '')
      : `Offender: ${msg.author_signature ? L('امضا: ', 'signature: ') + esc(msg.author_signature) : L('ناشناس', 'Anonymous')}\n` +
        `Telegram provided no numeric ID and the signature did not conclusively match any admin — automatic demotion was not possible.\n` +
        `Manual demotion: "Channel admins" in the channel menu.\n`) +
    `Tehran time: <code>${tehranHM()}</code>`);
  const rows = [];
  if (target && pm === 'red' && ban && ban.ok) rows.push([BTN('لغو بن (بخشیدن)', `ubn:${cid}:${target}`, 'success')]);
  if (target && prev && !ownerSkip) rows.push([BTN('بازگردانی دسترسی های قبلی متخلف', `admU:${cid}:${target}`, 'primary')]);
  await sendRedAlert(env, cid, txt, rows.length ? kb(rows) : null);
}

/* ── 👑 ادمین سازی در چنل ── */

/** دسترسی های قابل دادن به ادمین چنل — کلید کوتاه → برچسب فارسی → پارامتر Bot API */
const CAM_OPTS = {
  an:    { label: 'ناشناس',              param: 'is_anonymous' },
  post:  { label: 'ارسال پست',           param: 'can_post_messages' },
  edit:  { label: 'ادیت پست ها',         param: 'can_edit_messages' },
  del:   { label: 'حذف پیام ها',         param: 'can_delete_messages' },
  rest:  { label: 'بن/محدود کاربران',    param: 'can_restrict_members' },
  prom:  { label: 'ارتقای ادمین ها',     param: 'can_promote_members' },
  info:  { label: 'تغییر اطلاعات کانال', param: 'can_change_info' },
  inv:   { label: 'لینک دعوت',           param: 'can_invite_users' },
  story: { label: 'پست استوری',          param: 'can_post_stories' },
};
const CAM_ORDER = Object.keys(CAM_OPTS);

function camDefaults() {
  const r = {};
  for (const k of CAM_ORDER) r[k] = false;
  r.post = true; r.del = true; // پیش فرض منطقی برای ادمین چنل
  return r;
}

function camRText(st) {
  const who = st.ids
    ? L(`👥 <b>${st.ids.length} نفر — گروهی</b>\n🆔 <code>${st.ids.join('</code>، <code>')}</code> — چنل: <code>${st.cid}</code>`,
        `👥 <b>${st.ids.length} people — batch</b>\n🆔 <code>${st.ids.join('</code>, <code>')}</code> — channel: <code>${st.cid}</code>`)
    : L(`👤 ${st.nm || `<code>${st.target}</code>`} — چنل: <code>${st.cid}</code>`,
        `👤 ${st.nm || `<code>${st.target}</code>`} — channel: <code>${st.cid}</code>`);
  return L((
    (st.edit ? `⚙️ <b>ویرایش دسترسی ادمین</b>\n` : `⚙️ <b>ادمین سازی — دسترسی ها</b>\n`) + who + `\n\n` +
    (st.edit
      ? `دسترسی های فعلی لود شده ؛ تغییرشون بده و « ✅ تأیید و ارتقا » رو بزن تا ثبت بشه :\n`
      : `⚡️ یه پریست بزن تا فوراً ارتقا بگیره ؛ یا دسترسی ها رو دستی تنظیم کن :\n`) +
    `✅ = داده میشه   |   ❌ = داده نمیشه`
  ), (
    (st.edit ? `⚙️ <b>Edit admin permissions</b>\n` : `⚙️ <b>Promote to admin — permissions</b>\n`) + who + `\n\n` +
    (st.edit
      ? `Current permissions are loaded — adjust them and hit "✅ Apply & promote" to save:\n`
      : `⚡️ Pick a preset to promote them instantly — or set the permissions manually:\n`) +
    `✅ = granted   |   ❌ = not granted`
  ));
}

/** پریست های آماده ادمین سازی (v1.8) — یک ضربه = تنظیم + ارتقا */
const CAM_PRESETS = {
  basic: { label: '⚡️ ادمین معمولی', r: { post: true, del: true } },
  anon:  { label: '📣 ناشناس',       r: { an: true, post: true, del: true } },
  full:  { label: '👑 ادمین کامل',    r: { post: true, edit: true, del: true, rest: true, prom: true, info: true, inv: true, story: true } },
};

/* ── 📋 v2.1: افزودن گروهی — پارس لیست شناسه ها ── */

/** سقف تعداد شناسه در هر ورودی گروهی (لیمیت و حوصله تلگرام) */
const BATCH_MAX = 50;

/** لیست شناسه از متن: جداکننده ها = کاما، کامای فارسی، سمی کالن، فاصله، خط جدید؛ ارقام فارسی/عربی هم اوکی */
function parseIdList(text, min = 4) {
  const toks = toEnDigits(String(text || '')).split(/[,،;؛\s]+/).map((s) => s.trim()).filter(Boolean);
  const re = new RegExp('^\\d{' + min + ',}$');
  const ids = []; const seen = new Set(); let bad = 0; let hadUname = false;
  for (const t of toks) {
    const d = t.replace(/\D/g, '');
    if (t.startsWith('@')) hadUname = true;
    if (d && re.test(d)) {
      if (!seen.has(d)) { seen.add(d); ids.push(d); }
    } else bad++;
  }
  return { ids, bad, hadUname, tooMany: ids.length > BATCH_MAX };
}

/** ترجمه خطاهای رایج promote به فارسی برای گزارش گروهی */
function faPromoteErr(d) {
  const s = String(d || '');
  if (/USER_IS_OWNER|creator/i.test(s)) return 'مالک چنله ( قابل ارتقا نیست )';
  if (/CHAT_ADMIN_INVITE_REQUIRED|invite/i.test(s)) return 'ربات دسترسی Add New Admins نداره';
  if (/USER_ID_INVALID|PEER_ID_INVALID|PARTICIPANT_ID_INVALID|not found/i.test(s))
    return 'کاربر شناخته نشد ؛ باید حداقل یکبار ربات رو استارت کنه یا عضو چنل باشه';
  if (/USER_NOT_MUTUAL_CONTACT/i.test(s)) return 'مخاطب مشترک نیست';
  if (/administrator of the chat|USER_ADMIN_INVALID/i.test(s)) return 'از قبل ادمینه یا قابل تغییر نیست';
  return s || 'نامشخص';
}

/* ── 👤 v2.2: نام/منشن کنار هر شناسه — شناخت افراد در لیست ها ── */

const UINFO_OK_TTL = 12 * 3600; // کش نام/یوزرنیم معتبر: ۱۲ ساعت
const UINFO_MISS_TTL = 600;     // کش منفی (کاربر ناشناخته): ۱۰ دقیقه
const ucache = new Map();       // کش درون-ایزوله (۵ دقیقه) برای صرفه جویی در خواندن KV

/** پروفایل کاربر ({n: نام کامل, u: یوزرنیم}) — getChat + کش دولایه (حافظه → KV) */
async function getUserInfo(env, id) {
  const S = String(id);
  const now = Date.now();
  const c = ucache.get(S);
  if (c && c.exp > now) return c.v;
  let hit = null;
  try { hit = await env.KV.get('uinfo:' + S); } catch (e) { hit = null; }
  if (hit) {
    try {
      const v = JSON.parse(hit);
      if (v && typeof v === 'object') { ucache.set(S, { v, exp: now + 5 * 60 * 1000 }); return v; }
    } catch (e) { /* کش خراب = بی اهمیت */ }
  }
  let info = { n: '', u: '' };
  try {
    const r = await tg(env, 'getChat', { chat_id: S });
    if (r.ok && r.result && r.result.id) {
      info = {
        n: [r.result.first_name, r.result.last_name].filter(Boolean).join(' ').slice(0, 64),
        u: r.result.username || '',
      };
    }
  } catch (e) { /* خطای شبکه = ناشناخته */ }
  try {
    await env.KV.put('uinfo:' + S, JSON.stringify(info),
      { expirationTtl: (info.n || info.u) ? UINFO_OK_TTL : UINFO_MISS_TTL });
  } catch (e) { /* نوشتن کش اختیاری است */ }
  ucache.set(S, { v: info, exp: now + 5 * 60 * 1000 });
  return info;
}

/** برچسب HTML یک شناسه: « منشن/نام (آیدی) » — ناشناخته ⇒ فقط آیدی */
async function userLabel(env, id) {
  const i = await getUserInfo(env, id);
  const idTag = `<code>${esc(id)}</code>`;
  const nm = String(i.n || '');
  const un = String(i.u || '');
  if (!nm && !un) return idTag;
  return (un ? '@' + esc(un) : `<a href="tg://user?id=${id}">${esc(nm)}</a>`) + ` (${idTag})`;
}

/** برچسب گروهی — همزمان، سقف BATCH_MAX */
async function userLabels(env, ids) {
  const out = {};
  await Promise.all((ids || []).slice(0, BATCH_MAX).map(async (id) => { out[String(id)] = await userLabel(env, id); }));
  return out;
}

function camRKB(cid, r) {
  const rows = [
    [BTN('⚡️ ادمین معمولی', `camP:${cid}:basic`), BTN('👑 ادمین کامل', `camP:${cid}:full`)],
    [BTN('📣 ناشناس (پست با نام چنل)', `camP:${cid}:anon`)],
  ];
  for (let i = 0; i < CAM_ORDER.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < CAM_ORDER.length; j++) {
      const k = CAM_ORDER[j];
      row.push(BTN(`${r[k] ? '✅' : '❌'} ${tr(CAM_OPTS[k].label)}`, `camT:${cid}:${k}`));
    }
    rows.push(row);
  }
  rows.push([BTN('✅ همه', `camAll:${cid}:1`), BTN('⛔ هیچ کدام', `camAll:${cid}:0`)]);
  rows.push([BTN('✅ تأیید و ارتقا', `camG:${cid}`), BTN('❌ انصراف', `camX:${cid}`)]);
  return kb(rows);
}

/** نمای کامل « 👑 ادمین های چنل »: متن (فهرست + دسترسی های خود ربات) + کیبورد عزل/افزودن */
async function camView(env, cid) {
  const s = await getSettings(env, cid, true);
  if (!s) return null;
  const me = await botInfo(env);
  const br = await tg(env, 'getChatMember', { chat_id: cid, user_id: me.id });
  const botM = (br.ok && br.result && br.result.status === 'administrator') ? br.result : null;
  const adminsR = await tg(env, 'getChatAdministrators', { chat_id: cid });
  const admins = (adminsR.ok && Array.isArray(adminsR.result)) ? adminsR.result : null;
  const yes = (b) => (b ? '✅' : '❌');
  let t =
    L(`👑 <b>ادمین های چنل — ${esc(s.title)}</b>\n\n` +
    `دسترسی های خود ربات : ` +
    (botM
      ? `${yes(botM.can_promote_members)} ارتقای ادمین | ${yes(botM.can_restrict_members)} بن | ${yes(botM.can_delete_messages)} حذف پیام\n`
      : `❌ ربات ادمین این چنل نیست !\n`) +
    (!botM || !botM.can_promote_members
      ? `\n⚠️ برای ادمین کردن یا عزل از داخل ربات ، تو تنظیمات ادمینی ربات در تلگرام دسترسی « <b>Add New Admins</b> » رو روشن کن .\n`
      : '') +
    `\n`,
    `👑 <b>Channel admins — ${esc(s.title)}</b>\n\n` +
    `🤖 The bot's own permissions: ` +
    (botM
      ? `${yes(botM.can_promote_members)} promote admins | ${yes(botM.can_restrict_members)} ban | ${yes(botM.can_delete_messages)} delete messages\n`
      : `❌ The bot is not an admin of this channel!\n`) +
    (!botM || !botM.can_promote_members
      ? `\n⚠️ To promote/demote from inside the bot, enable "<b>Add New Admins</b>" in the bot's admin settings in Telegram.\n`
      : '') +
    `\n`);
  if (admins) {
    for (const m of admins) {
      if (!m || !m.user) continue;
      if (m.status === 'creator') {
        const nm = [m.user.first_name, m.user.last_name].filter(Boolean).join(' ') || L('مالک چنل', 'Channel owner');
        t += L(`👑 <b>${esc(nm)}</b>${m.user.username ? ' @' + esc(m.user.username) : ''} — مالک چنل (قابل عزل نیست)\n   🆔 <code>${m.user.id}</code>\n`,
               `👑 <b>${esc(nm)}</b>${m.user.username ? ' @' + esc(m.user.username) : ''} — channel owner (cannot be demoted)\n   🆔 <code>${m.user.id}</code>\n`);
      } else if (m.user.id === me.id) {
        t += L(`🤖 خود ربات — 🆔 <code>${m.user.id}</code>\n`, `🤖 The bot itself — 🆔 <code>${m.user.id}</code>\n`);
      } else if (m.status === 'administrator') {
        const nm = [m.user.first_name, m.user.last_name].filter(Boolean).join(' ') || m.user.username || L('ادمین', 'Admin');
        t += `🛡 <a href="tg://user?id=${m.user.id}">${esc(nm)}</a>${m.user.username ? ' @' + esc(m.user.username) : ''}` +
             (m.custom_title ? ` (${esc(m.custom_title)})` : '') + `\n   🆔 <code>${m.user.id}</code>\n`;
      }
    }
  } else {
    t += L(`⚠️ گرفتن فهرست ادمین ها ناموفق بود: ${esc(adminsR.description || 'نامشخص')}\n`,
           `⚠️ Failed to fetch the admin list: ${esc(adminsR.description || 'نامشخص')}\n`);
  }
  t += L(`\n💡 « عزل » یعنی گرفتن همه دسترسی های ادمینی ( بن نمیشه ) . برای مجازات ادیت کننده مدیا ، وضعیت 🟡 زرد ( عزل ) یا 🔴 قرمز ( عزل + بن ) رو از منوی چنل روشن کن .`,
         `\n💡 "Demote" means revoking all admin rights (no ban). To punish someone who edits media posts, turn on 🟡 yellow (demote) or 🔴 red (demote+ban) from the channel menu.`);
  const rows = [];
  if (admins) {
    for (const m of admins) {
      if (!m || m.status !== 'administrator' || !m.user || m.user.id === me.id) continue;
      const nm = [m.user.first_name, m.user.last_name].filter(Boolean).join(' ') || m.user.username || String(m.user.id);
      // 🛠 v2.2 — کنار « عزل »، دکمه « ویرایش دسترسی » (لود دسترسی های فعلی + ویرایشگر)
      rows.push([BTN(`${tr('⬇️ عزل')} ${nm.slice(0, 20)}`, `camD:${cid}:${m.user.id}`, 'danger'),
        BTN('⚙️ ویرایش دسترسی', `camE:${cid}:${m.user.id}`, 'primary')]);
    }
  }
  rows.push([BTN('➕ افزودن ادمین جدید', `camA:${cid}`)]);
  rows.push([BTN('🔙 بازگشت', `chat:${cid}`)]);
  return { text: t, markup: kb(rows) };
}

/* ── 🤖 صف حذف با اکانت (یوزربات) — v1.6 ──
 * پیام های >۴۸ ساعت که ربات نمیتواند حذف کند اینجا صف میشوند؛
 * یوزرباتِ همراه با « ?ub=poll » برمی دارد، با اکانت حذف میکند و با « ?ub=result » نتیجه میدهد.
 * اگر یوزربات هیچ جا اجرا نشود، صف فقط تا سقف پر میشود و آیتم های قدیمی منقضی میشوند — بی ضرر. */
const UB_JOBS_KEY = 'ub:jobs';
const UB_JOBS_MAX = 50;
const UB_JOB_TTL_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت — بعد از آن کل صفحه دور ریخته میشود

async function readJobs(env) {
  let jobs = [];
  try {
    const raw = await env.KV.get(UB_JOBS_KEY);
    jobs = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(jobs)) jobs = [];
  } catch (e) { jobs = []; }
  return jobs;
}

/** ثبت درخواست حذف با اکانت (دوباره پیچ شده در waitUntil توسط enforce) */
async function enqueueUserbotJob(env, cid, mid) {
  try {
    const now = Date.now();
    let jobs = (await readJobs(env)).filter((j) => now - j.t < UB_JOB_TTL_MS);
    if (jobs.some((j) => j.c === String(cid) && j.m === mid)) return; // ضد تکرار
    jobs.push({ i: now.toString(36) + Math.floor(Math.random() * 1e6).toString(36), c: String(cid), m: mid, t: now });
    if (jobs.length > UB_JOBS_MAX) jobs = jobs.slice(-UB_JOBS_MAX);
    await env.KV.put(UB_JOBS_KEY, JSON.stringify(jobs));
    // 📳 v1.6.1 — بیدارکردن یوزرباتِ خواب (پلن رایگان Railway سرویسِ بی ترافیک را میخواباند؛
    // یک GET به /health بیدارش میکند تا poller سریع صف را بکشد). اگر ست نبود/خطا خورد ⇒ بی ضرر.
    if (env.USERBOT_URL) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        await fetch(env.USERBOT_URL.replace(/\/+$/, '') + '/health', { signal: ac.signal });
        clearTimeout(t);
      } catch (e) { /* خواب یا در دسترس نبودن ⇒ poll بعدی خودش برمی دارد */ }
    }
  } catch (e) { console.error('ub enqueue', e); }
}

/** تحویل صف به یوزربات + پاک سازی (هر poll فقط یک بار تحویل میدهد) */
async function takeUserbotJobs(env) {
  try {
    const now = Date.now();
    const jobs = (await readJobs(env)).filter((j) => now - j.t < UB_JOB_TTL_MS);
    await env.KV.delete(UB_JOBS_KEY);
    return jobs;
  } catch (e) { console.error('ub take', e); return []; }
}

/** نتیجه حذف های یوزربات: گزارش به مالک/ادمین ها + علامت زدن ورودی در « آخرین تخلف ها » */
async function processUserbotResults(env, ctx, results) {
  const touched = new Set();
  for (const r of results) {
    if (!r || typeof r.c === 'undefined' || typeof r.m === 'undefined') continue;
    const ok = !!r.ok;
    const txt =
      L((ok ? '<b>حذف با اکانت: موفق شد ✅</b>' : '<b>حذف با اکانت: ناموفق ❌</b>') + '\n\n' +
      `چنل: <code>${esc(r.c)}</code>\n` +
      `پیام: <code>${esc(r.m)}</code>` +
      (!ok && r.err ? `\n🔧 ${esc(String(r.err).slice(0, 160))}` : ''),
      (ok ? '<b>Deletion via user account: succeeded ✅</b>' : '<b>Deletion via user account: failed ❌</b>') + '\n\n' +
      `Channel: <code>${esc(r.c)}</code>\n` +
      `Message: <code>${esc(r.m)}</code>` +
      (!ok && r.err ? `\n🔧 ${esc(String(r.err).slice(0, 160))}` : ''));
    const line = L(`${ok ? '✅' : '❌'} حذف با اکانت — پیام <code>${esc(r.m)}</code>`,
                  `${ok ? '✅' : '❌'} Deleted via account — message <code>${esc(r.m)}</code>`);
    await sendOwnerLog(env, ctx, r.c, txt, line);
    if (ok) touched.add(String(r.c));
  }
  // علامت زدن « حذف شده با اکانت » در لاگ تخلف ها (فقط موفق ها)
  for (const cid of touched) {
    try {
      const st = await readStatLog(env, cid);
      const mids = new Set(results.filter((r) => r && String(r.c) === cid && r.ok).map((r) => Number(r.m)));
      let changed = false;
      for (const v of st.vlog || []) {
        if (mids.has(Number(v.mid)) && !v.ok) { v.ok = 1; v.ub = 1; changed = true; }
      }
      if (changed) await env.KV.put('stat:' + cid, JSON.stringify(st));
    } catch (e) { /* بی اهمیت */ }
  }
}

/* ---------------------------- ضد تکرار آپدیت ---------------------------- */

const seen = new Set();
function isDup(updateId) {
  if (seen.has(updateId)) return true;
  seen.add(updateId);
  if (seen.size > 500) {
    let i = 0;
    for (const v of seen) { seen.delete(v); if (++i >= 100) break; }
  }
  return false;
}

/* ============================================================================
 *  پنل فارسی — متن ها و کیبوردها
 * ==========================================================================*/

function mainText(from, scope = null) {
  const viewer = !!(scope && scope.role === 'viewer');
  const admin = !!(scope && scope.role === 'admin');
  const role = admin
    ? L(`دسترسی تو : مدیریت ${scope.chs === '*' ? L('همه چنل ها', 'all channels') : L('چنل های اختصاصی خودت', 'your assigned channels')}\n`,
        `Your access: managing ${scope.chs === '*' ? 'all channels' : 'your assigned channels'}\n`)
    : viewer
      ? L(`دسترسی تو : فقط مشاهده و نظارت ؛ بدون تغییر تنظیمات\n`,
          `Your access: view and monitor only — no settings changes\n`)
      : '';
  return L((
    `<b>ضد خیانت کانال</b>\n\n` +
    `سلام <b>${esc(from.first_name || '')}</b> خوش اومدی .\n` +
    role +
    `من نگهبان چنلتم هر ادیت یا ارسالِ غیرمجاز رو همون لحظه پیدا میکنم و پاک میکنم ؛ حتی اگه پیام چند روز پیش باشه و همین حالا ادیت شده باشه .\n\n` +
    `<b>چه کارایی از دستم برمیاد ؟</b>\n` +
    `<blockquote expandable>` +
    `+20 قفل مستقل برای ادیت و هر نوع ارسال : از متن و عکس تا لینک و پست ناشناس توی همه ی چنلات !!\n` +
    `هر ادمین فقط چنل هایی رو میبینه که مالک براش تعیین کرده\n` +
    `قفل زمان دار و قفل آنی ( مثلاً هر شب 4 تا 8 کل چنل بسته بمونه ، یا با یه دکمه همین حالا ببندیش )\n` +
    `وضعیت زرد یعنی عزل متخلف ، وضعیت قرمز یعنی عزل + بن با مدت دلخواه\n` +
    `اعلان قفل تو خود چنل با شروع / پایان قفل ها ؛ اگه نخوای از پنل خاموشش کن و گزارش و آمار کامل هر حذف ، همینجا تو پیوی\n` +
    `انتخاب ساعت قفل زمان دار با دکمه ( ۰ تا ۲۳ ) ؛ پیام همگانی و حذف پیام های اخیر هم همه با دکمه و تأیید\n` +
    `</blockquote>\n\n` +
    `<b>شروع :</b>\n` +
    `1 ) ربات رو ادمین هر چنل کن ( دسترسی « حذف پیام » لازمه )\n` +
    `2 ) پیام فعال سازی میاد ؛ تأییدش کن : هر چنل جداگانه\n` +
    `3 ) قفل ها رو تنظیم کن ؛ بقیش با من .\n\n` +
    `<i>ضد خیانت v3.0</i>`
  ), (
    `🛡️ <b>Anti-Treason Channel Guard</b>\n\n` +
    `Hi <b>${esc(from.first_name || '')}</b>, welcome!\n` +
    role +
    `I guard your channels: any unauthorized edit or post is detected and deleted the moment it happens — even if the message is days old and was just edited.\n\n` +
    `<b>What can I do?</b>\n` +
    `<blockquote expandable>` +
    `• 20 independent locks for edits and every post type — from text and photos to links and anonymous posts\n` +
    `• Multi-channel — activate as many channels as you like; all are guarded at once\n` +
    `• Scoped access — each admin only sees the channels the owner assigned to them\n` +
    `• Scheduled & instant lock — e.g. keep the channel closed 4–8 every night, or close it right now with one button\n` +
    `• Anti-treason ladder — yellow means demote the offender, red means demote + ban for a duration of your choice\n` +
    `• Lock announcements in the channel — on lock start/end; turn them off from the panel if you don't want them\n` +
    `• Full report and stats for every deletion, right here in DM\n` +
    `• Albums/slideshows — a violation in any part deletes the entire album\n` +
    `• Up to date with the latest Telegram — rich messages, checklists, live photos and paid media are covered too\n` +
    `• Instant ownership-change alert — straight to you\n` +
    `</blockquote>\n\n` +
    `<b>Getting started:</b>\n` +
    `1) Make the bot an admin of any channel (the "Delete messages" permission is required)\n` +
    `2) An activation message arrives; approve it — each channel separately\n` +
    `3) Set the locks; I'll handle the rest.\n\n` +
    `<i>Anti-Treason v2.9</i>`
  ));
}

function mainKB(isOwner) {
  const rows = [
    [BTN('چنل های من', 'chats'), BTN('راهنمای کامل', 'help')],
  ];
  if (isOwner) rows.push([BTN('ادمین های ربات', 'admins'), BTN('ناظرها', 'viewers')]);
  if (isOwner) rows.push([BTN('پیام همگانی', 'bcAll', 'primary')]);
  rows.push([BTN('شناسه من', 'myid'), BTN(CUR_LANG === 'en' ? 'فارسی' : 'English', 'lang')]);
  return kb(rows);
}

function chatsText(list, isOwner = true) {
  if (!list.length) {
    if (!isOwner) {
      return L((
        `<b>چنل های من</b>\n\n` +
        `<b>هیچ چنلی به تو اختصاص داده نشده .</b>\n\n` +
        `فقط چنل هایی رو میبینی و مدیریت میکنی که مالک ربات برات تعیین کرده .\n` +
        `برای دسترسی با مالک صحبت کن .`
      ), (
        `<b>My channels</b>\n\n` +
        `<b>No channel has been assigned to you.</b>\n\n` +
        `You only see and manage the channels the bot owner has assigned to you.\n` +
        `Talk to the owner to get access.`
      ));
    }
    return L((
      `<b>چنل های من</b>\n\n` +
      `هنوز چنلی ثبت نشده .\n\n` +
      `ربات رو به عنوان <b>ادمین</b> به چنل اضافه کن ( حداقل با دسترسی « حذف پیام » ) ؛ خودکار همینجا ثبت میشه و منوی مدیریتش میاد .`
    ), (
      `<b>My channels</b>\n\n` +
      `No channel is registered yet.\n\n` +
      `Add the bot to a channel as an <b>admin</b> (at least with the "Delete messages" permission) — it registers automatically and its management menu appears here.`
    ));
  }
  let t = L(`<b>چنل های من</b> ( ${list.length} )\n\nبرای مدیریت روی هر چنل بزن :\n`,
            `<b>My channels</b> (${list.length})\n\nTap a channel to manage it:\n`);
  for (const c of list) {
    t += L(`\n<b>${esc(c.title)}</b>${c.inst ? ' — قفل آنی روشن' : ''}\n` +
         `   ${c.on ? 'فعال' : 'در انتظار فعال سازی'} | قفل ها : ${c.active} | زمان دار : ${c.sched ? 'روشن' : 'خاموش'}`,
      `\n<b>${esc(c.title)}</b>${c.inst ? ' — Instant lock ON' : ''}\n` +
         `   ${c.on ? 'Active' : 'Awaiting activation'} | Locks: ${c.active} | Scheduled: ${c.sched ? 'ON' : 'OFF'}`);
  }
  return t;
}

function chatsKB(list) {
  const rows = list.map((c) => [BTN(`${c.title.slice(0, 40)} ( ${c.active} قفل )`, `chat:${c.cid}`)]);
  rows.push([BTN('بروزرسانی', 'chats'), BTN('بازگشت', 'home')]);
  return kb(rows);
}

function chatText(s, st, isOwner = true) {
  const sc = s.schedule || { enabled: false, start: 240, end: 1200, mode: 'all' };
  const active = Object.values(s.locks || {}).filter(Boolean).length;
  const schedLine = sc.enabled
    ? L(`روشن از <code>${fmtHM(sc.start)}</code> تا <code>${fmtHM(sc.end)}</code> ( ${SCHED_MODES[sc.mode].label} )`,
        `Active from <code>${fmtHM(sc.start)}</code> to <code>${fmtHM(sc.end)}</code> (${SCHED_MODES[sc.mode].label})`)
    : L('خاموش', 'OFF');
  const bar = '▰'.repeat(Math.min(active, LOCK_ORDER.length)) + '▱'.repeat(Math.max(0, LOCK_ORDER.length - active));
  const instOn = !!(s.instant && s.instant.on);
  const instLine = instOn
    ? L(`قفل آنی : <b>روشن</b>${s.instant.at ? ` — از <code>${jalaliStamp(s.instant.at)}</code>` : ''}\n` +
      `تا « باز کردن » هر پیام یا ادیتی از هر نوعی فوراً حذف میشه !!\n`,
      `Instant lock: <b>ON</b>${s.instant.at ? ` — since <code>${jalaliStamp(s.instant.at)}</code>` : ''}\n` +
      `Until you press "Open", every message or edit of any type is deleted instantly!\n`)
    : L(`قفل آنی : خاموش\n`, `Instant lock: OFF\n`);
  const pm = s.punishMode || 'off';
  const redLine = pm === 'off'
    ? L(`عزل خودکار : خاموش — ادیت پست مدیادار فقط طبق قفل ها پاک میشه\n`,
        `Auto-demotion: off — media-post edits are deleted only according to locks\n`)
    : pm === 'yellow'
      ? L(`وضعیت زرد : روشن — ادیت پست مدیادار ⇒ پاک + عزل متخلف ( بدون بن )\n`,
          `Yellow mode: ON — editing a media post ⇒ delete + demote the offender (no ban)\n`)
      : L(`وضعیت قرمز : روشن — ادیت پست مدیادار ⇒ پاک + عزل + بن متخلف !!\n`,
          `Red mode: ON — editing a media post ⇒ delete + demote + ban the offender!\n`);
  const banLine = L(`مدت بن خودکار ( در وضعیت قرمز ) : <b>${BAN_LABEL[s.banHours || 0] || 'همیشگی'}</b>\n`,
                    `Auto-ban duration (in red mode): <b>${tr(BAN_LABEL[s.banHours || 0] || 'همیشگی')}</b>\n`);
  return L((
    `<b>${esc(s.title)}</b>\n` +
    `شناسه : <code>${s.cid}</code>${s.username ? `\n@${s.username}` : ''}\n` +
    (s.active === false
      ? `وضعیت : <b>در انتظار فعال سازی ${isOwner ? 'تو' : 'مالک'}</b> ؛ تا تأیید هیچ قفلی اینجا اجرا نمیشه !!\n\n`
      : `وضعیت : فعال — تحت پوشش ربات ( همراه بقیه چنل های فعال )\n\n`) +
    `قفل های فعال : <b>${active}</b> از ${LOCK_ORDER.length}  <code>${bar}</code>\n` +
    `قفل زمان دار : ${schedLine}\n` +
    instLine +
    redLine +
    banLine +
    `اعلان قفل در چنل : ${s.ann === false ? 'خاموش' : 'روشن'}\n` +
    `حذفیات ثبت شده : <b>${st.total}</b>\n` +
    `لاگ پیوی مالک : ${s.log_pm === false ? 'خاموش' : 'روشن'}\n\n` +
    `اگه قفل ها کار نمیکنن ، « سلامت » رو چک کن .`
  ), (
    `<b>${esc(s.title)}</b>\n` +
    `ID: <code>${s.cid}</code>${s.username ? `\n@${s.username}` : ''}\n` +
    (s.active === false
      ? `Status: <b>awaiting activation by ${isOwner ? 'you' : 'the owner'}</b> — until approved, no lock is enforced here!\n\n`
      : `Status: active — under the bot's protection (alongside other active channels)\n\n`) +
    `Active locks: <b>${active}</b> of ${LOCK_ORDER.length}  <code>${bar}</code>\n` +
    `Scheduled lock: ${schedLine}\n` +
    instLine +
    redLine +
    banLine +
    `Lock announcements: ${s.ann === false ? 'OFF' : 'ON'}\n` +
    `Recorded deletions: <b>${st.total}</b>\n` +
    `DM log: ${s.log_pm === false ? 'OFF' : 'ON'}\n\n` +
    `If the locks don't seem to work, check "Health".`
  ));
}

function chatKB(cid, s = null, viewer = false, isOwner = true) {
  if (viewer) {
    // ناظر: فقط مشاهده
    return kb([
      [BTN('آمار تخلفات', `stats:${cid}`), BTN('آخرین تخلف ها', `vlog:${cid}`)],
      [BTN('سلامت', `health:${cid}`), BTN('بروزرسانی', `refresh:${cid}`)],
      [BTN('چنل ها', 'chats')],
    ]);
  }
  const instOn = !!(s && s.instant && s.instant.on);
  const rows = [];
  if (isOwner && s && s.active === false) rows.push([BTN('فعال سازی این چنل', `enb:${cid}`, 'success')]);
  rows.push([BTN(instOn ? 'قفل آنی روشن — باز کن' : 'قفل آنی (بستن کامل)', `instT:${cid}`, instOn ? 'success' : 'danger')]);
  const pm = !!(s && s.punishMode) ? s.punishMode : 'off';
  const bhv = (s && Number(s.banHours)) || 0;
  rows.push([BTN(pm === 'off' ? 'وضعیت زرد (فقط عزل) — روشن کن'
    : pm === 'yellow' ? 'زرد روشن (فقط عزل) — برو سراغ قرمز'
    : 'قرمز روشن (عزل+بن) — خاموش کن', `redT:${cid}`, pm === 'red' ? 'success' : 'danger')]);
  rows.push([BTN(`${L('مدت بن خودکار (قرمز): ', 'Auto-ban duration (red): ')}${tr(BAN_LABEL[bhv] || 'همیشگی')}`, `banH:${cid}`)]);
  rows.push([BTN('قفل ها', `locks:${cid}`), BTN('قفل زمان دار', `sched:${cid}`)]);
  rows.push([BTN('ادمین های چنل', `admC:${cid}`)]);
  rows.push([BTN('بکاپ تنظیمات', `bakE:${cid}`), BTN('بازگردانی', `bakI:${cid}`)]);
  if (isOwner) rows.push([BTN('ارسال پیام به چنل', `bc1:${cid}`), BTN('حذف پیام های اخیر', `dLM:${cid}`)]);
  rows.push([BTN('آمار تخلفات', `stats:${cid}`), BTN('سلامت', `health:${cid}`)]);
  rows.push([BTN('بروزرسانی', `refresh:${cid}`), BTN('چنل ها', 'chats')]);
  return kb(rows);
}

function locksText(s) {
  return L((
    `<b>قفل های ${esc(s.title)}</b>\n\n` +
    `🔴 = قفل فعال   |   🟢 = آزاد\n` +
    `برای قفل یا باز کردن روی هر مورد بزن :\n\n` +
    `برای بستن کامل و موقت کل چنل ، از دکمه « قفل آنی » تو منوی چنل استفاده کن .\n` +
    `اعلان قفل : ${s.ann === false ? 'خاموش — با روشن/خاموش شدن قفل ها هیچ پیامی تو چنل ارسال نمیشه' : 'روشن — با روشن/خاموش شدن قفل ها و شروع/پایان قفل زمان دار ، اعلان تو خود چنل ارسال میشه'}\n` +
    `برای اجرای قفل ها ربات باید تو چنل دسترسی <b>« حذف پیام »</b> رو داشته باشه .`
  ), (
    `<b>Locks of ${esc(s.title)}</b>\n\n` +
    `🔴 = locked   |   🟢 = free\n` +
    `Tap any item to lock/unlock it:\n\n` +
    `To close the entire channel completely and temporarily, use the "Instant lock" button in the channel menu.\n` +
    `Lock announcements: ${s.ann === false ? 'off — nothing is posted in the channel when locks change' : 'on — an announcement is posted in the channel when locks change or the scheduled window starts/ends'}\n` +
    `For locks to work, the bot needs the <b>"Delete messages"</b> permission in the channel.`
  ));
}

function locksKB(s, cid) {
  const rows = [];
  for (let i = 0; i < LOCK_ORDER.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < LOCK_ORDER.length; j++) {
      const k = LOCK_ORDER[j];
      const on = !!(s.locks && s.locks[k]);
      row.push(BTN(`${on ? '🔴' : '🟢'} ${tr(LOCKS[k].label)}`, `tgl:${k}:${cid}`));
    }
    rows.push(row);
  }
  rows.push([BTN('قفل همه', `all:1:${cid}`, 'danger'), BTN('آزاد کردن همه', `all:0:${cid}`, 'success')]);
  rows.push([BTN(`${L('اعلان قفل در چنل: ', 'Channel lock announcements: ')}${s.ann === false ? L('خاموش ❌', 'OFF ❌') : L('روشن ✅', 'ON ✅')}`, `annT:${cid}`)]);
  rows.push([BTN('🔙 بازگشت', `chat:${cid}`)]);
  return kb(rows);
}

function schedText(s) {
  const sc = s.schedule || { enabled: false, start: 240, end: 1200, mode: 'all' };
  return L((
    `<b>قفل زمان دار — ${esc(s.title)}</b>\n\n` +
    `وضعیت : ${sc.enabled ? 'روشن' : 'خاموش'}\n` +
    `بازه : از <code>${fmtHM(sc.start)}</code> تا <code>${fmtHM(sc.end)}</code>\n` +
    `حالت : ${SCHED_MODES[sc.mode] ? SCHED_MODES[sc.mode].label : sc.mode}\n` +
    `ساعت الان تهران : <code>${tehranHM()}</code>\n\n` +
    `برای عوض کردن بازه روی « شروع » یا « پایان » بزن و ساعت و دقیقه رو با دکمه ها انتخاب کن ؛ تایپ هم جواب میده ( مثلاً 4:30 ) .\n` +
    `اگه شروع و پایان رو یکی بذاری قفل ۲۴ ساعته اعمال میشه . بازه های عبوری از نیمه شب هم اوکیه ( مثلاً 22 تا 6 ) .\n` +
    (s.ann === false
      ? `اعلان قفل خاموشه — با شروع و پایان بازه هیچ پیامی تو چنل ارسال نمیشه .`
      : `با شروع و پایان هر بازه اعلان خودکار تو خود چنل ارسال میشه ( از پنل « قفل ها » میتونی خاموشش کنی ) .`)
  ), (
    `<b>Scheduled lock — ${esc(s.title)}</b>\n\n` +
    `Status: ${sc.enabled ? 'Enabled' : 'Disabled'}\n` +
    `Lock window: from <code>${fmtHM(sc.start)}</code> to <code>${fmtHM(sc.end)}</code>\n` +
    `Mode: ${SCHED_MODES[sc.mode] ? SCHED_MODES[sc.mode].label : sc.mode}\n` +
    `Current time in Tehran: <code>${tehranHM()}</code>\n\n` +
    `Anything sent or edited inside this window, according to the selected mode, is deleted instantly.\n` +
    `If "start" and "end" are equal, a 24-hour lock applies.\n` +
    `Overnight windows are supported too (e.g. 22:00 to 06:00).\n` +
    (s.ann === false
      ? `Lock announcements are OFF — nothing is posted in the channel when the window starts/ends.`
      : `An announcement is posted in the channel automatically when the window starts and ends (you can turn it off in the "Locks" panel).`)
  ));
}

function schedKB(s, cid) {
  const sc = s.schedule || { enabled: false, start: 240, end: 1200, mode: 'all' };
  return kb([
    [BTN(sc.enabled ? L('خاموش کردن', 'Turn OFF') : L('روشن کردن', 'Turn ON'), `schT:${cid}`, sc.enabled ? 'danger' : 'success')],
    [BTN(`${L('شروع : ', 'Start: ')}${fmtHM(sc.start)}`, `schS:${cid}`), BTN(`${L('پایان : ', 'End: ')}${fmtHM(sc.end)}`, `schE:${cid}`)],
    [BTN(L('هر شب 4 تا 8', 'Nightly 4 to 8'), `schQ:${cid}:240:480`), BTN(L('هر شب 22 تا 6', 'Nightly 22 to 6'), `schQ:${cid}:1320:360`), BTN(L('۲۴ ساعته', '24-hour'), `schQ:${cid}:same:same`)],
    [BTN(`${L('حالت : ', 'Mode: ')}${SCHED_MODES[sc.mode] ? SCHED_MODES[sc.mode].label : sc.mode}`, `schM:${cid}`)],
    [BTN('بازگشت', `chat:${cid}`)],
  ]);
}

/* ── 🕐 v2.9/v3.0: انتخاب ساعت و دقیقه با دکمه (گرید ۰ تا ۲۳ + ۰۰ تا ۵۵) + کارت تأیید ── */
function hourGridText(which, S = null) {
  return which === 'S'
    ? L(`<b>ساعت شروع قفل زمان دار</b>\n\nیک ساعت از دکمه های پایین انتخاب کن ( به وقت تهران ) ؛ بعدش دقیقه اش رو هم انتخاب میکنی .\nتایپ هم جواب میده ( مثلاً 4:30 یا 23 ) .`,
        `<b>Scheduled lock — start hour</b>\n\nPick an hour below (Tehran time); then you'll pick the end hour. Typing works too (e.g. 4:30 or 23).`)
    : L(`<b>ساعت پایان قفل زمان دار</b>\n\n${S === null ? '' : `شروع ثبت شد : <code>${fmtHM(S)}</code>\n`}حالا ساعت پایان رو از دکمه های پایین انتخاب کن ؛ بعدش دقیقه اش رو .\nاگه پایان از شروع کمتر باشه ، بازه از نیمه شب عبور میکنه ( مثلاً 22 تا 6 ) .`,
        `<b>Scheduled lock — end hour</b>\n\n${S === null ? '' : `Start saved: <code>${fmtHM(S)}</code>\n`}Pick the end hour below. If the end is smaller than the start, the window crosses midnight (e.g. 22 to 6).`);
}

function hourGridKB(cid, which) {
  const rows = [];
  for (let i = 0; i < 24; i += 8) {
    const row = [];
    for (let j = i; j < i + 8 && j < 24; j++) row.push(BTN(faNum(j), `schH:${cid}:${which}:${j}`));
    rows.push(row);
  }
  rows.push([BTN('انصراف', `schX:${cid}`, 'danger')]);
  return kb(rows);
}

/* ── ⏱ v3.0: گرید دقیقه ( ۰۰ تا ۵۵ با گام ۵ ) — مرحله بعد از انتخاب ساعت ── */
function minGridText(which, hm, S = null) {
  return which === 'S'
    ? L(`<b>دقیقه شروع قفل زمان دار</b>\n\nساعت انتخاب شده : <code>${pad2(Math.floor(hm / 60))}</code>\nحالا دقیقه رو از دکمه های پایین انتخاب کن ؛ بعدش ساعت پایان رو هم میگیرم .\nتایپ کامل هم جواب میده ( مثلاً 4:30 ) .`,
        `<b>Scheduled lock — start minutes</b>\n\nHour picked: <code>${pad2(Math.floor(hm / 60))}</code>\nNow pick the minutes below; then you'll pick the end time.\nTyping the full time works too (e.g. 4:30).`)
    : L(`<b>دقیقه پایان قفل زمان دار</b>\n\n${S === null ? '' : `شروع ثبت شد : <code>${fmtHM(S)}</code>\n`}ساعت انتخاب شده : <code>${pad2(Math.floor(hm / 60))}</code>\nحالا دقیقه پایان رو از دکمه های پایین انتخاب کن .`,
        `<b>Scheduled lock — end minutes</b>\n\n${S === null ? '' : `Start saved: <code>${fmtHM(S)}</code>\n`}Hour picked: <code>${pad2(Math.floor(hm / 60))}</code>\nNow pick the end minutes below.`);
}

function minGridKB(cid, which) {
  const rows = [];
  for (let i = 0; i < 60; i += 20) {
    const row = [];
    for (let j = i; j < i + 20 && j < 60; j += 5) row.push(BTN(faNum(pad2(j)), `schMn:${cid}:${which}:${j}`));
    rows.push(row);
  }
  rows.push([BTN('انصراف', `schX:${cid}`, 'danger')]);
  return kb(rows);
}

function schedConfirmText(S, E, s) {
  const sc = s.schedule || { enabled: false, mode: 'all' };
  const mode = SCHED_MODES[sc.mode] ? SCHED_MODES[sc.mode].label : String(sc.mode);
  const same = S === E, overnight = E < S;
  return L(
    `<b>ثبت قفل زمان دار</b>\n\n` +
    `بازه : ${same ? '۲۴ ساعته' : `از ساعت <code>${fmtHM(S)}</code> تا <code>${fmtHM(E)}</code>`}${overnight ? ' ( عبور از نیمه شب )' : ''}\n` +
    `حالت : ${mode}\n` +
    `وضعیت : ${sc.enabled ? 'روشن — بعد از ثبت از بازه جدید اجرا میشه' : 'خاموش — بعد از ثبت با دکمه « روشن کردن » فعالش کن'}\n\n` +
    `ثبت کنم ؟`,
    `<b>Save scheduled lock</b>\n\n` +
    `Window: ${same ? '24-hour' : `from <code>${fmtHM(S)}</code> to <code>${fmtHM(E)}</code>`}${overnight ? ' (crosses midnight)' : ''}\n` +
    `Mode: ${mode}\n` +
    `Status: ${sc.enabled ? 'ON — applies from the new window once saved' : 'OFF — after saving, tap "Turn ON" to enable'}\n\n` +
    `Save it?`);
}

function schedConfirmKB(cid) {
  return kb([
    [BTN(L('ثبت کن ✅', 'Save ✅'), `schGo:${cid}`, 'success'), BTN(L('از اول', 'Restart'), `schS:${cid}`)],
    [BTN('انصراف', `schX:${cid}`, 'danger')],
  ]);
}

function statsText(s, st) {
  const tops = Object.entries(st.by || {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
  let t =
    L(`<b>آمار تخلفات — ${esc(s.title)}</b>\n\n` +
    `مجموع حذفیات : <b>${st.total}</b>\n` +
    (st.today ? `امروز ( تهران ) : <b>${st.today.n || 0}</b> — ادیت ${st.today.e || 0} | ارسال ${st.today.p || 0}\n` : '') +
    `ادیت های حذف شده : <b>${st.edits}</b>\n` +
    `ارسال های حذف شده : <b>${st.posts}</b>\n` +
    (st.last ? `آخرین تخلف : <code>${jalaliStamp(st.last)}</code>\n` : '') +
    `\n<b>پرتکرارترین دلایل :</b>\n`,
    `<b>Violation stats — ${esc(s.title)}</b>\n\n` +
    `Total deletions: <b>${st.total}</b>\n` +
    (st.today ? `Today (Tehran): <b>${st.today.n || 0}</b> — edits ${st.today.e || 0} | posts ${st.today.p || 0}\n` : '') +
    `Deleted edits: <b>${st.edits}</b>\n` +
    `Deleted posts: <b>${st.posts}</b>\n` +
    (st.last ? `Last violation: <code>${jalaliStamp(st.last)}</code>\n` : '') +
    `\n<b>Most frequent reasons:</b>\n`);
  if (tops.length) {
    tops.forEach(([r, n], i) => { t += `${i + 1}. ${esc(tr(r))} — <b>${n}</b>\n`; });
  } else {
    t += L(`هنوز تخلفی ثبت نشده`, `No violations recorded yet`);
  }
  return t;
}

function statsKB(cid, viewer = false) {
  const rows = [[BTN('آخرین تخلف ها', `vlog:${cid}`)]];
  if (!viewer) rows.push([BTN('ریست آمار', `rstS:${cid}`, 'danger')]);
  rows.push([BTN('بازگشت', `chat:${cid}`)]);
  return kb(rows);
}

function vlogText(s, list) {
  if (!list || !list.length) {
    return L(`<b>آخرین تخلف ها — ${esc(s.title)}</b>\n\nهنوز چیزی ثبت نشده`,
             `<b>Latest violations — ${esc(s.title)}</b>\n\nNothing recorded yet`);
  }
  let t = L(`<b>آخرین تخلف ها — ${esc(s.title)}</b> ( ${list.length} مورد اخیر )\n\n`,
            `<b>Latest violations — ${esc(s.title)}</b> (last ${list.length})\n\n`);
  for (const v of [...list].reverse()) {
    const link = tgMsgLink(s.username, s.cid, v.mid);
    const outcome = v.ub ? L('حذف شد (با اکانت)', 'Deleted (via user account)')
      : v.ok ? L('حذف شد', 'Deleted')
      : L('حذف نشد (محدودیت تلگرام)', 'Not deleted (Telegram limitation)');
    t += `${outcome} — <b>${esc(tr(v.r))}</b>${v.e ? L(' | ادیت', ' | edit') : ''}\n` +
         `   ${jalaliStamp(v.t)}\n` +
         (v.id ? `   <a href="tg://user?id=${v.id}">${esc(v.nm)}</a> — شناسه : <code>${v.id}</code>\n`
               : `   ${esc(v.nm)}\n`) +
         (v.sn ? `   ${esc(v.sn)}\n` : '') +
         `   پیام : <code>${v.mid}</code>${link ? ` — <a href="${link}">باز کردن</a>` : ''}\n\n`;
  }
  t += L(`برای « جبران » متن و آیدی متخلف رو از همینجا برمیدارید .`, `To make amends, grab the offender's text and ID right from here.`);
  return t;
}

function vlogKB(cid) {
  return kb([[BTN('بازگشت', `stats:${cid}`)]]);
}

async function healthText(env, s) {
  const me = await botInfo(env);
  const r = await tg(env, 'getChatMember', { chat_id: s.cid, user_id: me.id });
  let lines;
  if (!r.ok) {
    lines = L(`❌ عضویت : ربات عضو این چنل نیست یا دسترسی ندارم .\n( ${esc(r.description || '')} )`,
              `❌ Membership: the bot is not in this channel or has no access.\n(${esc(r.description || '')})`);
  } else {
    const m = r.result;
    const yes = (b) => (b ? '✅' : '❌');
    if (m.status !== 'administrator') {
      lines = L(`❌ عضویت : ربات <b>ادمین نیست</b> ( ${esc(m.status)} )\n\nربات رو ادمین کن با دسترسی « حذف پیام » .`,
                `❌ Membership: the bot is <b>not an admin</b> (${esc(m.status)})\n\nMake the bot an admin with the "Delete messages" permission.`);
    } else {
      lines = L(
        `${yes(true)} عضویت : ادمین\n` +
        `${yes(m.can_delete_messages)} حذف پیام ← <b>مهم ترین دسترسی</b>\n` +
        `${yes(m.can_post_messages)} ارسال پیام\n` +
        `${yes(m.can_edit_messages)} ادیت پیام\n` +
        `${yes(m.can_change_information)} تغییر اطلاعات کانال`,
        `${yes(true)} Membership: admin\n` +
        `${yes(m.can_delete_messages)} Delete messages ← <b>the most important permission</b>\n` +
        `${yes(m.can_post_messages)} Post messages\n` +
        `${yes(m.can_edit_messages)} Edit messages\n` +
        `${yes(m.can_change_information)} Change channel info`);
    }
  }
  return L((
    `<b>سلامت ربات در ${esc(s.title)}</b>\n\n${lines}\n\n` +
    `اگه « حذف پیام » ❌ باشه ربات نمیتونه هیچ قفلی رو اجرا کنه . از تنظیمات ادمین چنل دسترسی « Delete messages » رو فعال کن .`
  ), (
    `<b>Bot health in ${esc(s.title)}</b>\n\n${lines}\n\n` +
    `If "Delete messages" is ❌, the bot cannot enforce any lock. Enable the "Delete messages" permission in the channel's admin settings.`
  ));
}

function healthKB(cid) {
  return kb([[BTN('بررسی مجدد', `health:${cid}`)], [BTN('بازگشت', `chat:${cid}`)]]);
}

function helpText() {
  return L((
    `<b>راهنمای ربات ضد خیانت</b>\n\n` +
    `━━━ راه اندازی ━━━\n` +
    `۱) ربات رو ادمین چنل کن (دسترسی « حذف پیام » الزامیه، بقیه اختیاری).\n` +
    `۲) چنل ثبت میشه و پیام تأیید میاد — فعالش کن. ربات چندچنله: هر تعداد چنل رو جداگانه فعال کن؛ همه همزمان میمونن.\n` +
    `۳) قفل ها رو روشن کن؛ از همون لحظه هر تخلف فوراً پاک میشه.\n\n` +
    `━━━ قفل ها ━━━\n` +
    `ادیت متن و ادیت مدیا — هر ادیتی پیام رو فوراً پاک میکنه، حتی پیام های چند روز پیش.\n` +
    `لینک تو ادیت — فقط ادیت هایی که لینک دارن پاک میشن (ضد تبلیغ پنهان).\n` +
    `ارسال ها — هر نوع پست جداگانه بسته میشه: متن، عکس، ویدیو، گیف، استیکر، ویس، ویدیو نوت، موزیک، فایل، نظرسنجی، مخاطب، لوکیشن، بازی.\n` +
    `فوروارد — هر پست فورواردی پاک میشه. لینک — هر پست دارای لینک (entity یا متن) پاک میشه.\n` +
    `قفل کامل — هیچ چیز ارسال یا ادیت نمیشه.\n\n` +
    `━━━ اعلان قفل ها (v2.6) ━━━\n` +
    `با روشن/خاموش شدن « قفل آنی » و شروع/پایانِ قفل زمان دار، ربات یه اعلان بولد تو خودِ چنل میفرسته و شناسه چنل (t.me/…) رو زیرش مینویسه.\n` +
    `اگه نمیخوای متنی تو چنلت ارسال شه، تو پنل « قفل ها » دکمه « اعلان قفل در چنل » رو خاموش کن؛ قفل ها بدون اعلان به کارشون ادامه میدن.\n\n` +
    `━━━ قفل زمان دار ━━━\n` +
    `بازه دلخواه ، همه به وقت تهران . ساعت شروع و پایان رو با دکمه های ۰ تا ۲۳ انتخاب کن یا تایپ کن ( مثلاً 4:30 ) ؛ پریست های آماده ( هر شب 4 تا 8 / هر شب 22 تا 6 / ۲۴ ساعته ) هم تو پنل هست . مثلاً شروع 4 و پایان 20 با حالت « ارسال و ادیت » یعنی تو این بازه هر پست یا ادیتی فوراً پاک میشه و بیرونِ بازه همه چیز آزاده . بازه های عبوری از نیمه شب هم پشتیبانی میشه .\n\n` +
    `━━━ قفل آنی ━━━\n` +
    `با یه دکمه کل چنل کامل بسته میشه: هر پیام یا ادیتی، از هر نوعی، فوراً پاک میشه — تا وقتی خودت « باز کن » بزنی. این قفل مستقله و بعد از باز شدن همه چیز برمی گرده به حالت قبل.\n\n` +
    `━━━ گزارش و آمار ━━━\n` +
    `گزارش هر حذف (چنل، دلیل، ساعت، متخلف با شناسه) به پیوی مالک و ادمین ها و ناظرهای همون چنل میاد. « آخرین تخلف ها » و آمار کامل — با شمارنده « امروز » به وقت تهران — تو بخش آمار هر چنله.\n\n` +
    `━━━ چندچنله و دسترسی چنلی (v2.0) ━━━\n` +
    `ربات همزمان تو هر تعداد چنل اجرا میشه؛ آمار، قفل ها و لاگ هر چنل جداست.\n` +
    `مالک کنار هر ادمین/ناظر دکمه « چنل ها » رو داره و دقیقاً تعیین میکنه اون نفر فقط به کدوم چنل ها دسترسی داشته باشه.\n` +
    `ادمین فقط چنل های خودش رو میبینه و مدیریت میکنه؛ تنظیمات ربات و بقیه چنل ها براش در دسترس نیست.\n` +
    `گزارش تخلف هر چنل فقط برای مالک و ادمین ها/ناظرهای همون چنل میره. ادمینی که هنوز چنلی براش تعیین نشده چیزی نمیبینه.\n\n` +
    `━━━ ادمین ها ━━━\n` +
    `مالک از « ادمین های ربات » به دیگران دسترسی میده: شناسه عددی رو بفرست (با <code>/id</code> یا @userinfobot) و تو ویرایشگری که باز میشه چنل هاش رو انتخاب کن.\n` +
    `افزودن گروهی (v2.1) — به جای یه شناسه، لیست بفرست: با کاما یا خط جدید جدا کن (مثال: <code>111, 222, 333</code>؛ حداکثر ۵۰). برای ادمین، ناظر و ادمین سازی داخل چنل کار میکنه.\n` +
    `نام و منشن (v2.2) — تو همه لیست ها و گزارش های گروهی، نام و منشن هر نفر کنار شناسه ش نمایش داده میشه تا دیگه لازم نباشه شناسه ها رو تک تک چک کنی.\n\n` +
    `━━━ ناظرها (فقط مشاهده) ━━━\n` +
    `ناظر فقط تخلف های چنل های تعیین شده ش رو میبینه — گزارش پیوی، آخرین تخلف ها و آمار. هیچ تنظیمی نمیتونه تغییر بده؛ مناسب نظارت و جبران سریع اگه ربات اشتباهی چیزی رو پاک کرده باشه.\n\n` +
    `━━━ نردبان وضعیت (v1.8) ━━━\n` +
    `دکمه وضعیت سه حالته ست و با هر زدن میچرخه: خاموش، زرد، قرمز.\n` +
    `زرد — هرکی پست مدیادار رو ادیت کنه: پیام فوراً پاک میشه، متخلف عزل میشه و گزارش میاد (بدون بن).\n` +
    `قرمز — همون + بن از چنل؛ گزارش قرمز دکمه « لغو بن » و « بازگردانی دسترسی های قبلی » رو داره.\n` +
    `تو زرد و قرمز، ادیت پست فقط-متنی هم پاک میشه؛ تو حالت خاموش فقط قفل ها اجرا میشن.\n` +
    `بازگردانی — قبل از عزل، دسترسی های متخلف ۲۴ ساعت نگه داشته میشه؛ اگه تطبیق امضا اشتباه بود با یه دکمه برمی گرده.\n` +
    `شناسایی از فرستنده ست؛ تو چنل های ناشناس با تطبیق امضا (فقط وقتی قطعی باشه). خود ربات و مالک چنل هیچ وقت عزل یا بن نمیشن.\n\n` +
    `━━━ ادمین سازی تو چنل (v1.8 + گروهی v2.1) ━━━\n` +
    `از « ادمین های چنل » تو منوی هر چنل: « افزودن ادمین جدید » ← شناسه عددی یا لیست شناسه ها (یا @یوزرنیم تکی) ← پریست یک ضربه ای: « ادمین معمولی » (ارسال + حذف)، « ادمین کامل » (همه به جز ناشناس)، « ناشناس » (پست با نام چنل) — یا دسترسی ها رو دستی تنظیم کن و « تأیید و ارتقا » رو بزن.\n` +
    `تو حالت گروهی یه پریست به همه اعمال میشه و آخرش گزارش نفر به نفر میاد: هر ✅ ادمین شده و هر ❌ با دلیل فارسی (مثل « کاربر شناخته نشد » یا « مالک چنل است »). شناسه های تکراری و نامعتبر خودکار نادیده گرفته میشن.\n` +
    `بعد از هر ارتقا دکمه « ادمین بعدی » هست؛ فهرست ادمین های فعلی برای هر نفر دو دکمه داره: « عزل » و « ویرایش دسترسی » (v2.2) — ویرایش، دسترسی های فعلی رو لود میکنه؛ عوضشون کن و « تأیید و ارتقا » رو بزن. ربات باید دسترسی « Add New Admins » رو داشته باشه.\n\n` +
    `━━━ هم گام با آخرین تلگرام (v2.4) ━━━\n` +
    `آلبوم/اسلایدشو: تخلف تو هر قسمت آلبوم (عکس/ویدیوی چندتایی) ⇒ « کل آلبوم » حذف میشه. ` +
    `تایپ های جدید تلگرام (پیام ریچ، چک لیست، عکس زنده، مدیای پولی) هم مثل بقیه زیر قفل ها و نردبان زرد/قرمز هستن. ` +
    `تغییر یا ترک مالکیت چنل، هشدار فوری به مالک ربات میره. ` +
    `دکمه های خطرناک قرمز، تأییدی ها سبز و اطلاعاتی ها آبی هستن و خوش آمدگویی با افکت همراهه.\n\n` +
    `━━━ قفل پست ناشناس (v1.9) ━━━\n` +
    `اگه روشن باشه، هر پست « بدون امضا » — یعنی از طرف خودِ چنل — فوراً پاک میشه؛ هیچ کس نمیتونه بدون هویت واقعی خودش پست بده.\n` +
    `برای اینکه امضا زیر پست بیاد، تو دسترسی هر ادمین « Sign messages » رو روشن کن (و برای پست های خودت « امضای چنل »). قفل « ارسال متن » رو هم میتونی همراهش روشن کنی تا پست فقط-متنی اصلاً ارسال نشه.\n\n` +
    `━━━ مدت بن خودکار (v1.9) ━━━\n` +
    `چهار حالت داره: همیشگی، ۱ ساعت، ۲۴ ساعت، ۷ روز. تو وضعیت قرمز، متخلف علاوه بر عزل به همین مدت بن میشه و تلگرام بعد از مدت خودش بازش میکنه؛ دکمه « لغو بن » تو گزارش همیشه هست.\n\n` +
    `━━━ بکاپ تنظیمات (v1.9) ━━━\n` +
    `« بکاپ » کل تنظیمات (قفل ها، وضعیت زرد/قرمز، مدت بن، قفل زمان دار، اعلان قفل و…) رو تو یه متن میده و « بازگردانی » همون متن رو میگیره و دقیقاً همون وضعیت رو برمی گردونه — مناسب انتقال تنظیمات بین چنل ها و بازیابی سریع.\n\n` +
    `━━━ آمار امروز و گزارش آزمایشی (v1.9) ━━━\n` +
    `تو « آمار تخلفات » شمارنده « امروز » به وقت تهران جدا نمایش داده میشه. تو « ادمین های ربات » دکمه « گزارش آزمایشی » به مالک و همه ادمین ها و ناظرها پیام تستی میفرسته تا مطمئن شی گزارش ها به همه میرسه.\n\n` +
    `━━━ نکته ها ━━━\n` +
    `اگه قفل ها کار نمیکنن، « سلامت » رو چک کن (دسترسی حذف پیام).\n` +
    `محدودیت تلگرام — هیچ رباتی نمیتونه پیام های قدیمی تر از ۴۸ ساعت رو پاک کنه؛ ادیتِ چنین پیام هایی گزارش میشه ولی حذفش با توئه. پست های تازه همیشه فوراً پاک میشن.\n` +
    `تغییر تنظیمات حداکثر چند ثانیه بعد همه جا اعمال میشه. ربات روی پلن رایگان Cloudflare اجرا میشه و برای چنل های عادی کاملاً کافیه.`
  ), (
    `<b>Anti-Treason Bot Guide</b>\n\n` +
    `━━━ Setup ━━━\n` +
    `1) Make the bot an admin of your channel (the "Delete messages" permission is required; the rest are optional).\n` +
    `2) The channel registers and an activation message arrives — approve it. The bot is multi-channel: activate as many channels as you like, one by one; they all stay active together.\n` +
    `3) Turn on the locks; from that moment every violation is deleted instantly.\n\n` +
    `━━━ Locks ━━━\n` +
    `Text edit & media edit — any edit deletes the message instantly, even messages from days ago.\n` +
    `Link in edit — only edits containing links are deleted (anti-hidden-ads).\n` +
    `Posts — every post type can be locked separately: text, photo, video, GIF, sticker, voice, video note, music, file, poll, contact, location, dice.\n` +
    `Forwards — every forwarded post is deleted. Links — any post containing a link (entity or text) is deleted.\n` +
    `Full lock — nothing can be sent or edited.\n\n` +
    `━━━ Lock announcements (v2.6) ━━━\n` +
    `When the instant lock turns on/off or the scheduled window starts/ends, the bot posts a bold announcement in the channel itself, with the channel's t.me handle under it.\n` +
    `If you don't want any text posted in your channel, turn off "Channel lock announcements" in the Locks panel; the locks keep working silently.\n\n` +
    `━━━ Scheduled lock ━━━\n` +
    `Any window you like, all in Tehran time. Example: start 4:00 and end 20:00 in "send & edit" mode means every post or edit inside the window is deleted instantly, and everything is free outside it. Windows crossing midnight are supported too.\n\n` +
    `━━━ Instant lock ━━━\n` +
    `One button closes the entire channel completely: every message or edit, of any type, is deleted instantly — until you press "Open". This lock is independent; after opening, everything returns to how it was.\n\n` +
    `━━━ Reports & stats ━━━\n` +
    `Every deletion report (channel, reason, time, offender with ID) arrives in the DM of the owner and that channel's admins and viewers. "Latest violations" and full stats — with a "today" counter in Tehran time — live in each channel's stats section.\n\n` +
    `━━━ Multi-channel & scoped access (v2.0) ━━━\n` +
    `The bot runs in any number of channels at once; stats, locks and logs are separate per channel.\n` +
    `Next to each admin/viewer the owner has a "Channels" button defining exactly which channels that person can access.\n` +
    `An admin only sees and manages their own channels; bot settings and other channels are out of their reach.\n` +
    `A channel's violation report goes only to the owner and that channel's admins/viewers. An admin with no channels assigned sees nothing.\n\n` +
    `━━━ Admins ━━━\n` +
    `The owner grants access from "Bot admins": send the numeric ID (via <code>/id</code> or @userinfobot) and pick their channels in the editor that opens.\n` +
    `Batch add (v2.1) — send a list instead of one ID: separate with commas or new lines (e.g. <code>111, 222, 333</code>; max 50). Works for admins, viewers and in-channel promotion.\n` +
    `Names & mentions (v2.2) — in every list and batch report, each person's name and mention appear next to their ID, so you no longer need to check IDs one by one.\n\n` +
    `━━━ Viewers (view-only) ━━━\n` +
    `A viewer only sees violations of their assigned channels — DM reports, latest violations and stats. They cannot change any setting; ideal for oversight and quick fixes if the bot deletes something by mistake.\n\n` +
    `━━━ Punish ladder (v1.8) ━━━\n` +
    `The mode button has three states and cycles on each tap: off, yellow, red.\n` +
    `Yellow — anyone editing a media post: the message is deleted instantly, the offender is demoted and a report arrives (no ban).\n` +
    `Red — same + ban from the channel; the red report has "Unban" and "Restore previous access" buttons.\n` +
    `In yellow and red, text-only edits are deleted as well; when off, only the locks apply.\n` +
    `Restore — before demotion, the offender's permissions are kept for 24 hours; if the signature match was wrong, one button brings them back.\n` +
    `Identification uses the sender; in anonymous channels it matches signatures (only when conclusive). The bot itself and the channel owner are never demoted or banned.\n\n` +
    `━━━ In-channel promotion (v1.8 + batch v2.1) ━━━\n` +
    `From "Channel admins" in each channel's menu: "Add new admin" ← a numeric ID or a list (or a single @username) ← one-tap presets: "Basic admin" (post + delete), "Full admin" (everything except anonymous), "Anonymous" (posts as the channel) — or set permissions manually and hit "Apply & promote".\n` +
    `In batch mode one preset applies to everyone and a per-person report arrives at the end: each ✅ was promoted and each ❌ failed with a reason (like "user not recognized" or "channel owner"). Duplicate and invalid IDs are ignored automatically.\n` +
    `After each promotion there is a "Next admin" button; the current admin list shows two buttons per person: "Demote" and "Edit permissions" (v2.2) — editing loads their current permissions; adjust them and hit "Apply & promote". The bot needs the "Add New Admins" permission.\n\n` +
    `━━━ In sync with the latest Telegram (v2.4) ━━━\n` +
    `Albums/slideshows: a violation in any part of a multi-photo/video album ⇒ the whole album is deleted. ` +
    `New Telegram types (rich messages, checklists, live photos, paid media) are covered by the locks and the yellow/red ladder too. ` +
    `Channel ownership change/left triggers an instant alert to the bot owner. ` +
    `Dangerous buttons are red (danger), confirmations green (success), informational blue (primary); the welcome message comes with an effect.\n\n` +
    `━━━ Anonymous-post lock (v1.9) ━━━\n` +
    `When enabled, any "unsigned" post — i.e. from the channel itself — is deleted instantly; nobody can post without their real identity.\n` +
    `For signatures to appear under posts, enable "Sign messages" for each admin (and "channel signature" for your own posts). You can also enable the "Text posts" lock so text-only posts are never sent at all.\n\n` +
    `━━━ Auto-ban duration (v1.9) ━━━\n` +
    `Four options: permanent, 1 hour, 24 hours, 7 days. In red mode the offender is banned for that duration in addition to being demoted, and Telegram lifts the ban automatically; an "Unban" button is always in the report.\n\n` +
    `━━━ Settings backup (v1.9) ━━━\n` +
    `"Backup" produces all settings (locks, yellow/red mode, ban duration, scheduled lock, …) as one text, and "Restore" takes that text back and returns exactly that state — great for moving settings between channels and quick recovery.\n\n` +
    `━━━ Today's stats & test report (v1.9) ━━━\n` +
    `The stats section shows a separate "today" counter in Tehran time. "Bot admins" has a "Test report" button that sends a test message to the owner, all admins and viewers so you can confirm reports reach everyone.\n\n` +
    `━━━ Notes ━━━\n` +
    `If locks don't work, check "Health" (the delete-messages permission).\n` +
    `Telegram limitation — no bot can delete messages older than 48 hours; edits of such messages are reported but deletion is up to Telegram. Fresh posts are always deleted instantly.\n` +
    `Setting changes apply everywhere within a few seconds. The bot runs on Cloudflare's free plan — fully sufficient for normal channels.`
  ));
}

const helpKB = () => kb([[BTN('🔙 بازگشت', 'home')]]);

function deniedText() {
  return L(`<b>دسترسی ندارید !</b>\n\nاین پنل فقط برای مالک ربات و افرادیه که مالک براشون دسترسی تعیین کرده ؛ و هر نفر هم فقط تو محدوده چنل های خودش .`,
           `<b>You do not have access!</b>\n\nThis panel is only for the bot owner and people the owner has granted access to — and each person only within their assigned channels.`);
}

/* ============================================================================
 *  هندلر پیام های خصوصی (پنل)
 * ==========================================================================*/

async function setPanelState(env, uid, obj) {
  obj.exp = Date.now() + STATE_TTL_S * 1000;
  await env.KV.put('state:' + uid, JSON.stringify(obj), { expirationTtl: STATE_TTL_S });
}

async function clearPanelState(env, uid) {
  await env.KV.delete('state:' + uid);
}

const EFFECT_FIRE = '5104841245755180586'; // ✨ 🔥 افکت موفقیت (فقط چت خصوصی)

async function cmdStart(msg, env) {
  const from = msg.from || {};
  const owner = await getOwnerId(env);
  if (!owner) {
    await setOwner(env, from.id);
    // اگر چنل ها قبل از /start ثبت شده باشند، همین جا به مالک معرفی میشوند
    const chats = await listChats(env);
    let known = '';
    if (chats.length) {
      known = L(`<b>${chats.length} چنل از قبل ثبت شده :</b>\n` +
        chats.map((c) => `• ${esc(c.title)}`).join('\n') +
        `\nاز « چنل های من » مدیریتشون کن ؛ همه میتونن همزمان فعال باشن .\n\n`,
        `<b>${chats.length} channels were already registered:</b>\n` +
        chats.map((c) => `• ${esc(c.title)}`).join('\n') +
        `\nManage them from "My channels" — all can be active at once.\n\n`);
    }
    await send(env, msg.chat.id,
      L(`تو به عنوان <b>مالک</b> ربات ثبت شدی ؛ همه تنظیمات از اینجا دست توئه .\n\n`,
        `You are registered as the bot's <b>owner</b> — every setting is in your hands from here.\n\n`) + known + mainText(from, { role: 'owner', chs: '*' }), mainKB(true), { effect: EFFECT_FIRE });
    return;
  }
  const scope = await accessOf(env, from.id);
  if (!scope) {
    await send(env, msg.chat.id, deniedText());
    return;
  }
  await clearPanelState(env, from.id);
  await send(env, msg.chat.id, mainText(from, scope), mainKB(scope.role === 'owner'), { effect: EFFECT_FIRE });
}

async function handlePrivate(msg, env, ctx) {
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from) return;

  if (msg.text && msg.text.startsWith('/')) {
    const cmd = msg.text.split(/\s+/)[0].split('@')[0];
    if (cmd === '/start') return cmdStart(msg, env);
    if (cmd === '/id') {
      const me = await botInfo(env);
      const sc0 = await accessOf(env, msg.from.id);
      return send(env, msg.chat.id,
        L(`<b>شناسه تو :</b> <code>${msg.from.id}</code>\n` +
        `<b>شناسه این چت :</b> <code>${msg.chat.id}</code>\n` +
        `ربات : @${esc(me.username || 'bot')}\n\n` +
        `این عدد رو برای افزودن ادمین به مالک بده .`,
        `<b>Your ID:</b> <code>${msg.from.id}</code>\n` +
        `<b>This chat's ID:</b> <code>${msg.chat.id}</code>\n` +
        `Bot: @${esc(me.username || 'bot')}\n\n` +
        `Give this number to the owner to be added as an admin.`), mainKB(!!(sc0 && sc0.role === 'owner')));
    }
    if (cmd === '/setlang') {
      // 🌐 v2.3 — فقط مالک: زبان پیش فرض ربات (برای گزارش های چنل و کاربران جدید)
      const scopeL = await accessOf(env, msg.from.id);
      if (!scopeL || scopeL.role !== 'owner') return send(env, msg.chat.id, deniedText());
      const arg = (msg.text.split(/\s+/)[1] || '').toLowerCase();
      if (arg !== 'fa' && arg !== 'en')
        return send(env, msg.chat.id, L('استفاده: <code>/setlang fa</code> یا <code>/setlang en</code>',
                                        'Usage: <code>/setlang fa</code> or <code>/setlang en</code>'));
      try { await env.KV.put('lang', arg); } catch (e) { /* بی اهمیت */ }
      lcache.g = arg; lcache.gExp = Date.now() + 60000;
      return send(env, msg.chat.id, arg === 'en'
        ? '🌐 <b>Default bot language: English</b>\nReports and new users will use English. (Your own language is unchanged — toggle it with 🌐 in the menu.)'
        : '<b>زبان پیش فرض ربات : فارسی</b>\nگزارش ها و کاربران جدید فارسی میبینن . ( زبان خودت عوض نشده ؛ از منو عوضش کن )', mainKB(true));
    }
    if (cmd === '/panel' || cmd === '/help') {
      const scope = await accessOf(env, msg.from.id);
      if (!scope) return send(env, msg.chat.id, deniedText());
      return cmd === '/help'
        ? send(env, msg.chat.id, helpText(), helpKB())
        : send(env, msg.chat.id, mainText(msg.from, scope), mainKB(scope.role === 'owner'));
    }
    // دستور ناشناخته ⇒ لغو حالت انتظار
    await clearPanelState(env, msg.from.id);
    return;
  }

  // ورودی متنی: اول چک کن در انتظار پاسخی هستیم یا نه
  const stateRaw = await env.KV.get('state:' + msg.from.id);
  if (stateRaw) {
    let st = null;
    try { st = JSON.parse(stateRaw); } catch (e) { st = null; }
    // 📣 v2.7 — « ارسال پیام/همگانی »: هر نوع پیامی (متن/عکس/ویدیو/آلبوم) منبع کپی میشود
    if (st && st.exp && st.exp > Date.now() && (st.t === 'bcPick' || st.t === 'bcAllPick')) {
      const scopeB = await accessOf(env, msg.from.id);
      if (!scopeB || scopeB.role !== 'owner') {
        await clearPanelState(env, msg.from.id);
        return send(env, msg.chat.id, deniedText());
      }
      // 📣 v3.0 — پیام همگانی بدون انتخاب مقصد ⇒ یادآوری ( پیام همگانی منتشر نمیشود )
      if (st.t === 'bcAllPick' && !st.tgt) {
        const cntB = await bcCounts(env);
        return send(env, msg.chat.id,
          L(`اول مقصد رو از پنل « پیام همگانی » انتخاب کن ( فقط چنل ها ، گروه ها ، پیوی ها یا همه ) .`,
            `First pick a destination from the "Broadcast" panel (channels only, groups, DMs or all).`),
          bcTargetKB(cntB));
      }
      const fwR = await tg(env, 'forwardMessage', { chat_id: msg.chat.id, from_chat_id: msg.chat.id, message_id: msg.message_id }).catch(() => null);
      const fw = fwR && fwR.ok && fwR.result && fwR.result.message_id ? fwR.result.message_id : 0;
      await setPanelState(env, msg.from.id, { t: 'bcGo', cid: st.cid || '', sc: msg.chat.id, sm: msg.message_id, gm: st.gm || 0, fw, tgt: st.tgt || 'ch' });
      let dst;
      if (st.t === 'bcPick') {
        const sB = await getSettings(env, st.cid);
        dst = L(`مقصد: <b>${esc(sB ? sB.title : st.cid)}</b>`, `Destination: <b>${esc(sB ? sB.title : st.cid)}</b>`);
      } else {
        const cntB = await bcCounts(env);
        dst = L(`مقصد : <b>${bcDstLabel(st.tgt || 'ch')}</b> ( ${faNum(bcDstN(st.tgt || 'ch', cntB))} مقصد )`,
                `Destination: <b>${bcDstLabelEn(st.tgt || 'ch')}</b> (${bcDstN(st.tgt || 'ch', cntB)} targets)`);
      }
      return send(env, msg.chat.id,
        L(`<b>📣 این پیام ارسال بشه؟</b>
${dst}

` +
          `پیام بالا پیش نمایشه — با « ارسال ✅ » کپی میشه (بدون هدر فوروارد و با اسم ربات)، با « لغو » بی اثر میشه.`,
          `<b>📣 Send this message?</b>
${dst}

` +
          `The message above is the preview — "Send ✅" copies it as the bot (no forward header), "Cancel" does nothing.`),
        kb([[BTN('ارسال ✅', 'bcGo', 'success'), BTN('لغو', 'bcX', 'danger')]]));
    }
    if (st && st.exp && st.exp > Date.now() && typeof msg.text === 'string' && msg.text.trim()) {
      const handled = await handleStateInput(msg, env, st);
      if (handled) return;
      await clearPanelState(env, msg.from.id); // state خراب/ناشناس ⇒ پاک و ادامه
    }
  }

  const scope = await accessOf(env, msg.from.id);
  if (!scope) return send(env, msg.chat.id, deniedText());
  await send(env, msg.chat.id,
    L(`از منوی زیر استفاده کن :`, `Use the menu below:`), mainKB(scope.role === 'owner'));
}

/** 💾 v1.9 — خروجی بکاپ تنظیمات (بدون داده های وابسته به چنل مثل عنوان) */
function backupOf(s) {
  return {
    v: 1,
    locks: s.locks || {},
    punishMode: s.punishMode || 'off',
    banHours: Number(s.banHours) || 0,
    instant: s.instant || { on: false, at: 0 },
    schedule: s.schedule || { enabled: false, start: 240, end: 1200, mode: 'all' },
    log_pm: s.log_pm !== false,
    ann: s.ann !== false,
    active: s.active !== false,
  };
}

/** 🧹 v2.9 — کارت تأیید حذف N پیام آخر (مشترک بین دکمه سریع و ورودی عددی) */
async function dlConfirm(env, uid, chatId, cid, n) {
  const sD = await getSettings(env, cid);
  if (!sD) { await clearPanelState(env, uid); await send(env, chatId, L(`⚠️ این چنل دیگه ثبت نیست.`, `⚠️ This channel is no longer registered.`)); return; }
  const list = await readMsgs(env, cid);
  if (!list.length) {
    await clearPanelState(env, uid);
    await send(env, chatId,
      L(`ℹ️ هنوز پیامی برای این چنل ثبت نشده .\nاز این به بعد هر پست جدید چنل ثبت میشه و میتونی پاک سازی دسته ای بزنی .`,
        `ℹ️ No tracked messages for this channel yet.\nFrom now on every new channel post is tracked, so batch cleanup will be available.`));
    return;
  }
  const take = list.slice(-n);
  await setPanelState(env, uid, { t: 'dLGo', cid, ids: take });
  await send(env, chatId,
    L(`<b>پاک سازی ${faNum(take.length)} پیام آخر</b>\n` +
      `چنل : <b>${esc(sD.title || cid)}</b>\n` +
      `قدیمی ترین : <code>${take[0]}</code> — جدیدترین : <code>${take[take.length - 1]}</code>\n\n` +
      `اگه بعضی از این پیام ها قبلاً حذف شده باشن ، فقط بی اثر میشن و بقیه پاک میشن .`,
      `<b>Batch-delete the last ${take.length} messages</b>\n` +
      `Channel: <b>${esc(sD.title || cid)}</b>\n` +
      `Oldest: <code>${take[0]}</code> — Newest: <code>${take[take.length - 1]}</code>\n\n` +
      `If some of them are already gone, those calls are just no-ops; the rest get deleted.`),
    kb([[BTN(`پاک کن ✅ (${faNum(take.length)})`, `dlGo:${cid}`, 'danger'), BTN('لغو', `dlX:${cid}`)]]));
}

async function handleStateInput(msg, env, st) {
  const text = (msg.text || '').trim();
  const uid = msg.from.id;

  // 📡 v2.0 — گارد در برابر state قدیمی/لغوشده: نقش و دسترسی چنلی دوباره چک میشود
  const scopeNow = await accessOf(env, uid);
  if (!scopeNow) return send(env, msg.chat.id, deniedText());
  if (st.t === 'admA' || st.t === 'vwA') {
    if (scopeNow.role !== 'owner') {
      await clearPanelState(env, uid);
      return send(env, msg.chat.id, deniedText());
    }
  } else if (st.cid && !canCh(scopeNow, st.cid)) {
    await clearPanelState(env, uid);
    return send(env, msg.chat.id, `⛔️ دسترسی شما به این چنل وجود ندارد (یا گرفته شده).`);
  }

  // 🧹 v2.7 — حذف N پیام آخر چنل: دریافت عدد (فقط مالک)
  if (st.t === 'dLM') {
    const scopeD = await accessOf(env, uid);
    if (!scopeD || scopeD.role !== 'owner') {
      await clearPanelState(env, uid);
      return send(env, msg.chat.id, deniedText());
    }
    const n = parseInt(toEnDigits(text).replace(/[^\d]/g, ''), 10);
    if (!n || n < 1 || n > MAX_DEL) {
      return send(env, msg.chat.id,
        L(`⚠️ یه عدد بین ۱ تا ${faNum(MAX_DEL)} بفرست .

دوباره بفرست یا /start بزن تا لغو بشه .`,
          `⚠️ Send a number between 1 and ${MAX_DEL}.

Send it again, or press /start to cancel.`));
    }
    await dlConfirm(env, uid, msg.chat.id, st.cid, n);
    return true;
  }

  /* ── 🕐 v2.9: ورودی متنی ساعت (کنار گرید دکمه ای) + کارت تأیید ── */
  if (st.t === 'schS' || st.t === 'schE' || st.t === 'schG' || st.t === 'schMn' || st.t === 'schC') {
    if (st.t === 'schC') {
      return send(env, msg.chat.id,
        L(`از دکمه های پیام بالا استفاده کن : « ثبت کن ✅ » یا « از اول » یا « انصراف » . /start = لغو`,
          `Use the buttons above: "Save ✅", "Restart" or "Cancel". /start = cancel`));
    }
    const which = st.which || (st.t === 'schE' ? 'E' : 'S');
    const mins = parseHM(text);
    if (mins === null) {
      return send(env, msg.chat.id,
        L(`⚠️ فرمت ساعت اشتباهه !\nاز دکمه های ۰ تا ۲۳ استفاده کن یا ساعت رو تایپ کن ( مثلاً 4:30 یا 23 ) .\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
          `⚠️ Invalid time format!\nUse the 0 to 23 buttons or type the hour (e.g. 4:30 or 23).\n\nSend it again, or press /start to cancel.`));
    }
    const s = await getSettings(env, st.cid, true);
    if (!s) { await clearPanelState(env, uid); return send(env, msg.chat.id, L(`⚠️ این چنل دیگه ثبت نیست.`, `⚠️ This channel is no longer registered.`)); }
    if (which === 'S') {
      await setPanelState(env, uid, { t: 'schG', cid: st.cid, which: 'E', S: mins });
      return send(env, msg.chat.id, hourGridText('E', mins), hourGridKB(st.cid, 'E'));
    }
    const S = Number(st.S != null ? st.S : s.schedule.start);
    await setPanelState(env, uid, { t: 'schC', cid: st.cid, S, E: mins });
    return send(env, msg.chat.id, schedConfirmText(S, mins, s), schedConfirmKB(st.cid));
  }

  if (st.t === 'admA') {
    // 📡 v2.0: فقط مالک — در ورودی FSM هم دوباره چک میشود (در برابر state قدیمی)
    const scope0 = await accessOf(env, uid);
    if (!scope0 || scope0.role !== 'owner') {
      await clearPanelState(env, uid);
      return send(env, msg.chat.id, deniedText());
    }
    // 📋 v2.1 — تک شناسه یا لیست (کاما/خط جدید) — حداکثر ۵۰
    const PL = parseIdList(text, 4);
    if (PL.tooMany) {
      return send(env, msg.chat.id, L(`⚠️ لیست طولانیه ! حداکثر ${BATCH_MAX} شناسه در هر بار بفرست .\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
                                      `⚠️ The list is too long! Send at most ${BATCH_MAX} IDs per message.\n\nSend it again, or press /start to cancel.`));
    }
    if (!PL.ids.length) {
      return send(env, msg.chat.id,
        L(`⚠️ شناسه عددی پیدا نشد !\nمثلاً <code>123456789</code> یا لیست : <code>111, 222, 333</code>\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
          `⚠️ No numeric ID found!\nExample: <code>123456789</code> or a list: <code>111, 222, 333</code>\n\nSend it again, or press /start to cancel.`));
    }
    const owner = await getOwnerId(env);
    const arr = await getAdmins(env);
    if (PL.ids.length === 1) { // تک شناسه: همان رفتار همیشگی
      const idStr = PL.ids[0];
      if (owner === idStr) {
        await clearPanelState(env, uid);
        return send(env, msg.chat.id, L(`👑 این شخص خودِ مالکه و از قبل دسترسی کامل داره.`, `👑 This person is the owner and already has full access.`));
      }
      if (arr.includes(idStr)) {
        await clearPanelState(env, uid);
        await send(env, msg.chat.id, L(`ℹ️ این شناسه قبلاً ادمین شده ؛ دسترسی چنلیش رو تنظیم کن :`, `ℹ️ This ID is already an admin — set their channel access:`));
        const v = await scopeView(env, 'a', idStr);
        return send(env, msg.chat.id, v.text, v.markup);
      }
      arr.push(idStr);
      await setAdmins(env, arr);
      // 📡 v2.0: ادمین تازه بدون هیچ چنلی ثبت میشود؛ ویرایشگر دسترسی بلافاصله باز میشود
      const acc = await getScopes(env);
      acc.a[idStr] = { ch: [] };
      await setScopes(env, acc);
      await clearPanelState(env, uid);
      const v = await scopeView(env, 'a', idStr);
      return send(env, msg.chat.id, L(`✅ <b>ادمین اضافه شد !</b>\n👤 ${await userLabel(env, idStr)}\n\n`, `✅ <b>Admin added!</b>\n👤 ${await userLabel(env, idStr)}\n\n`) + v.text, v.markup);
    }
    // 📋 v2.1 — افزودن گروهی: همگی بدون هیچ چنلی (امن پیش فرض)؛ مالک/تکراری نادیده
    const acc = await getScopes(env);
    const added = [], skipped = [];
    for (const id of PL.ids) {
      if (id === owner) { skipped.push([id, L('خودِ مالک', 'the owner themselves')]); continue; }
      if (arr.includes(id)) { skipped.push([id, L('از قبل ادمین بود', 'already an admin')]); continue; }
      arr.push(id); acc.a[id] = { ch: [] }; added.push(id);
    }
    await clearPanelState(env, uid);
    const labels = await userLabels(env, PL.ids); // 📋 v2.2 — نام/منشن کنار شناسه
    const lab = (i) => labels[i] || `<code>${i}</code>`;
    if (!added.length) {
      const bt = L(`ℹ️ هیچ ادمین جدیدی اضافه نشد :\n`, `ℹ️ No new admin was added:\n`) + skipped.map(([i, w]) => `• ${lab(i)} — ${w}`).join('\n');
      return send(env, msg.chat.id, bt, adminsKB(await getAdmins(env)));
    }
    await setAdmins(env, arr);
    await setScopes(env, acc);
    let bt = L(`✅ <b>ادمین سازی گروهی ؛ ${added.length} نفر ثبت شد !</b>\n\n` +
      added.map((i) => `• 🛡 ${lab(i)}`).join('\n'),
      `✅ <b>Batch admin add — ${added.length} registered!</b>\n\n` +
      added.map((i) => `• 🛡 ${lab(i)}`).join('\n'));
    if (skipped.length) bt += L(`\n\nنادیده شده :\n`, `\n\n⏭ Skipped:\n`) + skipped.map(([i, w]) => `• ${lab(i)} — ${w}`).join('\n');
    if (PL.bad) bt += L(`\n⚠️ ${PL.bad} مورد نامعتبر نادیده گرفته شد .`, `\n⚠️ ${PL.bad} invalid entries were ignored.`);
    bt += L(`\n\n⛔️ همه بدون هیچ چنلی ثبت شدن ( امن پیش فرض ) .\n📡 حالا برای هر نفر « چنل ها » رو بزن و چنلش رو تعیین کن .`,
            `\n\n⛔️ Everyone was registered with no channels (secure default).\n📡 Now tap "📡 Channels" for each person and assign their channels.`);
    return send(env, msg.chat.id, bt, adminsKB(arr));
  }

  if (st.t === 'vwA') {
    // 📡 v2.0: فقط مالک — در ورودی FSM هم دوباره چک میشود
    const scope0 = await accessOf(env, uid);
    if (!scope0 || scope0.role !== 'owner') {
      await clearPanelState(env, uid);
      return send(env, msg.chat.id, deniedText());
    }
    // 📋 v2.1 — تک شناسه یا لیست ناظرها
    const PL = parseIdList(text, 4);
    if (PL.tooMany) {
      return send(env, msg.chat.id, L(`⚠️ لیست طولانیه ! حداکثر ${BATCH_MAX} شناسه در هر بار بفرست .\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
                                      `⚠️ The list is too long! Send at most ${BATCH_MAX} IDs per message.\n\nSend it again, or press /start to cancel.`));
    }
    if (!PL.ids.length) {
      return send(env, msg.chat.id,
        L(`⚠️ شناسه عددی پیدا نشد !\nمثلاً <code>123456789</code> یا لیست : <code>111, 222, 333</code>\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
          `⚠️ No numeric ID found!\nExample: <code>123456789</code> or a list: <code>111, 222, 333</code>\n\nSend it again, or press /start to cancel.`));
    }
    const owner = await getOwnerId(env);
    const admins = await getAdmins(env);
    const arr = await getViewers(env);
    if (PL.ids.length === 1) { // تک شناسه: همان رفتار همیشگی
      const idStr = PL.ids[0];
      if (owner === idStr) {
        await clearPanelState(env, uid);
        return send(env, msg.chat.id, L(`👑 این شخص خودِ مالکه و از قبل دسترسی کامل داره.`, `👑 This person is the owner and already has full access.`));
      }
      if (admins.includes(idStr)) {
        await clearPanelState(env, uid);
        return send(env, msg.chat.id, L(`ℹ️ این شناسه ادمینه و دسترسی بیشتری از ناظر داره .`, `ℹ️ This ID is an admin — more access than a viewer.`));
      }
      if (arr.includes(idStr)) {
        await clearPanelState(env, uid);
        const v = await scopeView(env, 'v', idStr);
        return send(env, msg.chat.id, L(`ℹ️ این شناسه قبلاً ناظر شده ؛ دسترسی چنلیش رو تنظیم کن :`, `ℹ️ This ID is already a viewer — set their channel access:`), v.markup);
      }
      arr.push(idStr);
      await setViewers(env, arr);
      // 📡 v2.0: ناظر تازه بدون هیچ چنلی؛ ویرایشگر بلافاصله باز میشود
      const acc = await getScopes(env);
      acc.v[idStr] = { ch: [] };
      await setScopes(env, acc);
      await clearPanelState(env, uid);
      const v = await scopeView(env, 'v', idStr);
      return send(env, msg.chat.id, L(`✅ <b>ناظر اضافه شد !</b>\n\n`, `✅ <b>Viewer added!</b>\n\n`) + v.text, v.markup);
    }
    // 📋 v2.1 — افزودن گروهی ناظرها: همگی بدون هیچ چنلی؛ مالک/ادمین/تکراری نادیده
    const acc = await getScopes(env);
    const added = [], skipped = [];
    for (const id of PL.ids) {
      if (id === owner) { skipped.push([id, L('خودِ مالک', 'the owner themselves')]); continue; }
      if (admins.includes(id)) { skipped.push([id, L('ادمینه ( دسترسی بیشتر از ناظر )', 'an admin (more access than a viewer)')]); continue; }
      if (arr.includes(id)) { skipped.push([id, L('از قبل ناظر بود', 'already a viewer')]); continue; }
      arr.push(id); acc.v[id] = { ch: [] }; added.push(id);
    }
    await clearPanelState(env, uid);
    const labels = await userLabels(env, PL.ids); // 📋 v2.2 — نام/منشن کنار شناسه
    const lab = (i) => labels[i] || `<code>${i}</code>`;
    if (!added.length) {
      const bt = L(`ℹ️ هیچ ناظر جدیدی اضافه نشد :\n`, `ℹ️ No new viewer was added:\n`) + skipped.map(([i, w]) => `• ${lab(i)} — ${w}`).join('\n');
      return send(env, msg.chat.id, bt, viewersKB(await getViewers(env)));
    }
    await setViewers(env, arr);
    await setScopes(env, acc);
    let bt = L(`✅ <b>ناظرهای گروهی ؛ ${added.length} نفر ثبت شد !</b>\n\n` +
      added.map((i) => `• 👁 ${lab(i)}`).join('\n'),
      `✅ <b>Batch viewers — ${added.length} registered!</b>\n\n` +
      added.map((i) => `• 👁 ${lab(i)}`).join('\n'));
    if (skipped.length) bt += L(`\n\nنادیده شده :\n`, `\n\n⏭ Skipped:\n`) + skipped.map(([i, w]) => `• ${lab(i)} — ${w}`).join('\n');
    if (PL.bad) bt += L(`\n⚠️ ${PL.bad} مورد نامعتبر نادیده گرفته شد .`, `\n⚠️ ${PL.bad} invalid entries were ignored.`);
    bt += L(`\n\n⛔️ همه بدون هیچ چنلی ثبت شدن ؛ برای هر نفر « چنل ها » رو بزن و چنلش رو تعیین کن .`,
            `\n\n⛔️ Everyone was registered with no channels — tap "📡 Channels" for each person and assign their channels.`);
    return send(env, msg.chat.id, bt, viewersKB(arr));
  }

  /* ── 💾 v1.9: بازگردانی بکاپ تنظیمات ── */
  if (st.t === 'bakI') {
    let raw = text.trim();
    const mm = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (mm) raw = mm[1].trim();
    let b = null;
    try { b = JSON.parse(raw); } catch (e) { b = null; }
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      return send(env, msg.chat.id,
        L(`⚠️ متن بکاپ نامعتبره !\nدقیقاً همون متنی رو بفرست که « بکاپ » داده ( با { شروع میشه ) .\n\n/start = لغو`,
          `⚠️ Invalid backup text!\nSend exactly the text "💾 Backup" produced (it starts with {).\n\n/start = cancel`));
    }
    const cur = await getSettings(env, st.cid, true);
    if (!cur) { await clearPanelState(env, uid); return send(env, msg.chat.id, L(`⚠️ این چنل دیگه ثبت نیست.`, `⚠️ This channel is no longer registered.`)); }
    const s = { ...cur };
    if (b.locks && typeof b.locks === 'object') {
      s.locks = {};
      for (const k of LOCK_ORDER) s.locks[k] = b.locks[k] === true;
    }
    if (['off', 'yellow', 'red'].includes(b.punishMode)) s.punishMode = b.punishMode;
    if (BAN_HOURS.includes(b.banHours)) s.banHours = b.banHours;
    if (b.instant && typeof b.instant === 'object')
      s.instant = { on: b.instant.on === true, at: Number(b.instant.at) || 0 };
    if (b.schedule && typeof b.schedule === 'object')
      s.schedule = {
        enabled: b.schedule.enabled === true,
        start: Math.min(1439, Math.max(0, Math.floor(Number(b.schedule.start) || 240))),
        end: Math.min(1439, Math.max(0, Math.floor(Number(b.schedule.end) || 1200))),
        mode: ['all', 'send', 'edit'].includes(b.schedule.mode) ? b.schedule.mode : 'all',
      };
    if (typeof b.log_pm === 'boolean') s.log_pm = b.log_pm;
    if (typeof b.ann === 'boolean') s.ann = b.ann;
    s.active = typeof b.active === 'boolean' ? b.active : true;
    await saveSettings(env, st.cid, s);
    await clearPanelState(env, uid);
    const stt = await readStats(env, st.cid);
    return send(env, msg.chat.id,
      L(`✅ <b>بکاپ بازگردانی شد !</b> همه تنظیمات دقیقاً برگشت .\n\n`,
        `✅ <b>Backup restored!</b> All settings are exactly back in place.\n\n`) +
      chatText({ ...s, cid: st.cid }, stt, true), chatKB(st.cid, s, false, true));
  }

  /* ── 👑 v1.7: افزودن ادمین چنل — دریافت شناسه ── */
  if (st.t === 'camA') {
    const raw = toEnDigits(text).trim();
    let target = null, uname = '';
    if (/^@[\w]{4,}$/.test(raw)) {
      const r = await tg(env, 'getChat', { chat_id: raw });
      if (!r.ok || !r.result || !r.result.id) {
        return send(env, msg.chat.id,
          L(`⚠️ یوزرنیم پیدا نشد ( ${esc((r && r.description) || 'نامشخص')} ) .\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
            `⚠️ Username not found (${esc((r && r.description) || 'نامشخص')}).\n\nSend it again, or press /start to cancel.`));
      }
      target = r.result.id;
      uname = raw;
    } else {
      // 📋 v2.1 — تک شناسه یا لیست (کاما/کامای فارسی/سمی کالن/فاصله/خط جدید)
      const PL = parseIdList(text, 3);
      if (PL.tooMany) {
        return send(env, msg.chat.id,
          L(`⚠️ لیست طولانیه ! حداکثر ${BATCH_MAX} شناسه در هر بار بفرست .\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
            `⚠️ The list is too long! Send at most ${BATCH_MAX} IDs per message.\n\nSend it again, or press /start to cancel.`));
      }
      if (!PL.ids.length) {
        return send(env, msg.chat.id,
          L(`⚠️ شناسه عددی پیدا نشد !\nیه شناسه یا لیست شناسه ها بفرست ؛ مثلاً <code>123456789</code> یا <code>111, 222, 333</code>\n\nدوباره بفرست یا /start بزن تا لغو بشه .`,
            `⚠️ No numeric ID found!\nSend one ID or a list of IDs — e.g. <code>123456789</code> or <code>111, 222, 333</code>\n\nSend it again, or press /start to cancel.`));
      }
      if (PL.ids.length === 1) {
        target = Number(PL.ids[0]);
      } else {
        const labels = await userLabels(env, PL.ids); // 📋 v2.2 — نام/منشن کنار شناسه
        await setPanelState(env, uid, { t: 'camB', cid: st.cid, ids: PL.ids, r: camDefaults() });
        let bt =
          L(`⚙️ <b>ادمین سازی گروهی — ${PL.ids.length} نفر</b>\n` +
          `📺 چنل: <code>${esc(st.cid)}</code>\n` +
          PL.ids.map((i) => `👤 ${labels[i] || `<code>${i}</code>`}`).join('\n') + `\n`,
          `⚙️ <b>Batch promotion — ${PL.ids.length} people</b>\n` +
          `📺 Channel: <code>${esc(st.cid)}</code>\n` +
          PL.ids.map((i) => `👤 ${labels[i] || `<code>${i}</code>`}`).join('\n') + `\n`);
        if (PL.bad) bt += L(`\n⚠️ ${PL.bad} مورد نامعتبر نادیده گرفته شد .`, `\n⚠️ ${PL.bad} invalid entries were ignored.`);
        if (PL.hadUname) bt += L(`\n💡 یوزرنیم در حالت گروهی قبول نیست — برای @یوزرنیم تک تک اضافه کن.`,
                                 `\n💡 Usernames are not accepted in batch mode — add @usernames one by one.`);
        bt += L(`\n\n⚡️ یه پریست بزن تا <b>همه با هم</b> با همون دسترسی ادمین بشن ؛ یا دسترسی ها رو دستی تنظیم کن و « ✅ تأیید و ارتقا » بزن .`,
                `\n\n⚡️ Pick a preset so <b>everyone at once</b> becomes admin with the same permissions — or set the permissions manually and hit "✅ Apply & promote".`);
        return send(env, msg.chat.id, bt, camRKB(st.cid, camDefaults()));
      }
    }
    const me = await botInfo(env);
    if (me.id === target) {
      await clearPanelState(env, uid);
      return send(env, msg.chat.id, L(`🤖 این شناسه خودِ ربات است!`, `🤖 This ID is the bot itself!`));
    }
    // وضعیت فعلی فرد در چنل + اگر ادمین باشد، دسترسی های فعلی اش لود میشود
    const m = await tg(env, 'getChatMember', { chat_id: st.cid, user_id: target });
    let r0 = camDefaults();
    let pre = '';
    if (m.ok && m.result && m.result.status) {
      if (m.result.status === 'creator') {
        await clearPanelState(env, uid);
        return send(env, msg.chat.id, L(`👑 این شخص « مالک چنل » است — قابل تغییر و عزل نیست.`, `👑 This person is the "channel owner" — cannot be changed or demoted.`));
      }
      if (m.result.status === 'administrator') {
        const rr = m.result;
        r0 = {};
        for (const k of CAM_ORDER) r0[k] = !!rr[CAM_OPTS[k].param];
        pre = L(`ℹ️ این فرد همین حالا <b>ادمین چنل هست</b> ؛ دسترسی های فعلی اش لود شد ؛ تغییرشون بده و دوباره ارتقا بده .\n\n`,
                `ℹ️ This person is <b>already a channel admin</b> — their current permissions are loaded; adjust them and promote again.\n\n`);
      }
    } else if (!m.ok && /not found|participant/i.test(m.description || '')) {
      pre = L(`ℹ️ این فرد هنوز عضو چنل نیست ؛ بعد از ارتقا میتونه از لینک بیاد .\n\n`,
              `ℹ️ This person is not a channel member yet — after promotion they can join via the channel link.\n\n`);
    }
    const lab = await userLabel(env, target); // 📋 v2.2 — نام/منشن فرد
    await setPanelState(env, uid, { t: 'camR', cid: st.cid, target, r: r0, nm: lab });
    return send(env, msg.chat.id,
      L(`⚙️ <b>ادمین سازی سریع</b>\n👤 ${lab}${uname ? ' ' + esc(uname) : ''}\n\n` + pre +
      `⚡️ یه پریست بزن تا فوراً ارتقا بگیره ؛ یا دسترسی ها رو دستی تنظیم کن :\n\n` +
      `💡 ضد خیانت : پیشنهاد ما پریست « ادمین معمولی » هست ( ارسال + حذف ، بدون ادیت پست ها ).`,
      `⚙️ <b>Quick promotion</b>\n👤 ${lab}${uname ? ' ' + esc(uname) : ''}\n\n` + pre +
      `⚡️ Pick a preset to promote them instantly — or set the permissions manually:\n\n` +
      `💡 Anti-treason tip: we recommend the "⚡️ Basic admin" preset (post + delete, no message editing).`),
      camRKB(st.cid, r0));
  }

  return false;
}

/* ============================================================================
 *  هندلر دکمه های پنل (callback)
 * ==========================================================================*/

async function adminsText(env, arr) {
  const acc = await getScopes(env);
  const chats = await listChats(env);
  const titles = {};
  for (const c of chats) titles[c.cid] = c.title;
  const labels = await userLabels(env, arr); // 📋 v2.2 — نام/منشن کنار شناسه
  const lab = (i) => labels[String(i)] || `<code>${esc(i)}</code>`;
  let t =
    L(`ادمین های ربات\n\n` +
    `هر ادمین فقط چنل هایی رو میبینه و مدیریت میکنه که مالک براش تعیین کرده ؛ تنظیمات ربات و بقیه چنل ها براش در دسترس نیست :\n\n`,
    `👥 <b>Bot admins</b>\n\n` +
    `Each admin only sees and manages the channels the owner assigned to them — bot settings and other channels are out of their reach:\n\n`);
  if (!arr.length) t += L(`• فعلاً هیچ ادمینی تعریف نشده.\n`, `• No admin is defined yet.\n`);
  else for (const id of arr) {
    const e = acc.a[String(id)];
    t += `• ${lab(id)} — 📡 ${chsLabel(e ? e.ch : await defaultChs(env), titles)}\n`;
  }
  t += L(`\n👤 نام و منشن هر نفر کنار شناسه اش میاد ؛ اگه فقط شناسه میبینی یعنی اون فرد هنوز ربات رو استارت نکرده .` +
       `\n✅ گزارش هر تخلف فقط برای ادمین هایی میره که به اون چنل دسترسی دارن ( مالک همیشه همه رو میبینه ) .` +
       `\n📡 با دکمه « چنل ها » کنار هر ادمین دسترسی اش رو تعیین کن .` +
       `\n📣 با دکمه « گزارش آزمایشی » مطمئن شو گزارش ها به همه میرسه .` +
       `\n➕ برای افزودن دکمه پایین رو بزن و شناسه عددی فرد رو بفرست ( با /id یا @userinfobot میگیره ) ؛ بعد چنل هایش رو انتخاب میکنی .`,
       `\n👤 Each person's name and mention appear next to their ID; if you only see an ID, that person hasn't started the bot yet.` +
       `\n✅ Each violation report goes only to admins who have access to that channel (the owner always sees everything).` +
       `\n📡 Use the "Channels" button next to each admin to set their access.` +
       `\n📣 Use "Test report" to confirm reports reach everyone.` +
       `\n➕ To add someone, tap the button below and send their numeric ID (they can get it via /id or @userinfobot) — then pick their channels.`);
  return t;
}

function adminsKB(arr) {
  const rows = arr.map((id) => [BTN(`${tr('🗑 حذف')} ${id}`, `admD:${id}`), BTN(`📡 چنل ها`, `asc:${id}`)]);
  rows.push([BTN('📣 گزارش آزمایشی', 'admT')]);
  rows.push([BTN('➕ افزودن ادمین', 'admA')]);
  rows.push([BTN('🔙 بازگشت', 'home')]);
  return kb(rows);
}

async function viewersText(env, arr) {
  const acc = await getScopes(env);
  const chats = await listChats(env);
  const titles = {};
  for (const c of chats) titles[c.cid] = c.title;
  const labels = await userLabels(env, arr); // 📋 v2.2 — نام/منشن کنار شناسه
  const lab = (i) => labels[String(i)] || `<code>${esc(i)}</code>`;
  let t =
    L(`ناظرها ( فقط مشاهده )\n\n` +
    `ناظرها فقط تخلف های چنل های تعیین شده رو میبینن : گزارش پیوی ، « آخرین تخلف ها » و آمار .\n` +
    `هیچ تنظیمی نمیتونن عوض کنن ؛ مناسب نظارت و جبران سریع اگه ربات اشتباهی چیزی پاک کرده باشه .\n\n`,
    `👁 <b>Viewers (view-only)</b>\n\n` +
    `Viewers only see violations of their assigned channels: DM reports, "📜 Latest violations" and stats.\n` +
    `They cannot change any setting — ideal for oversight and quick fixes if the bot makes a mistake.\n\n`);
  if (!arr.length) t += L(`• فعلاً هیچ ناظری تعریف نشده.\n`, `• No viewer is defined yet.\n`);
  else for (const id of arr) {
    const e = acc.v[String(id)];
    t += `• ${lab(id)} — 📡 ${chsLabel(e ? e.ch : await defaultChs(env), titles)}\n`;
  }
  t += L(`\n📡 با دکمه « چنل ها » کنار هر ناظر دسترسی اش رو تعیین کن .` +
       `\n➕ برای افزودن دکمه پایین رو بزن و شناسه عددی فرد رو بفرست ( با /id یا @userinfobot ) .`,
       `\n📡 Use the "Channels" button next to each viewer to set their access.` +
       `\n➕ To add someone, tap the button below and send their numeric ID (via /id or @userinfobot).`);
  return t;
}

function viewersKB(arr) {
  const rows = arr.map((id) => [BTN(`${tr('🗑 حذف')} ${id}`, `vwD:${id}`), BTN(`📡 چنل ها`, `vsc:${id}`)]);
  rows.push([BTN('➕ افزودن ناظر', 'vwA')]);
  rows.push([BTN('🔙 بازگشت', 'home')]);
  return kb(rows);
}

/** 📡 v2.0 — ویرایشگر دسترسی چنلی یک ادمین/ناظر (فقط مالک) */
async function scopeView(env, kind, target) {
  const acc = await getScopes(env);
  const map = kind === 'a' ? acc.a : acc.v;
  const S = String(target);
  // ماده سازی scope برای اعضای قدیمیِ بدون سابقه — با دامنه مؤثر فعلی شان (چنل های ثبت شده)
  if (!map[S]) { map[S] = { ch: await defaultChs(env) }; await setScopes(env, acc); }
  const chs = map[S].ch;
  const chats = await listChats(env);
  const titles = {};
  for (const c of chats) titles[c.cid] = c.title;
  const who = kind === 'a' ? L('ادمین', 'admin') : L('ناظر', 'viewer');
  const actPre = (kind === 'a' ? 'ascT' : 'vscT') + ':' + S + ':';
  const allPre = (kind === 'a' ? 'ascW' : 'vscW') + ':' + S;
  const backTo = kind === 'a' ? 'admins' : 'viewers';
  const whoLab = await userLabel(env, S); // 📋 v2.2 — نام/منشن کنار شناسه
  let t =
    L(`📡 <b>دسترسی چنلی — ${who} ${whoLab}</b>\n\n` +
    `دسترسی فعلی : <b>${chsLabel(chs, titles)}</b>\n\n` +
    (kind === 'a'
      ? `این ادمین فقط چنل های انتخاب شده رو میبینه و مدیریت میکنه ؛ تنظیمات ربات و بقیه چنل ها براش در دسترس نیست و گزارش ها فقط از چنل های همین لیست بهش میرسه .\n\n`
      : `این ناظر فقط تخلف های چنل های انتخاب شده رو میبینه .\n\n`) +
    `برای افزودن یا گرفتن دسترسی روی نام هر چنل بزن :\n` +
    `✅ = دسترسی داره   |   ❌ = دسترسی نداره`,
    `📡 <b>Channel access — ${who} ${whoLab}</b>\n\n` +
    `Current access: <b>${chsLabel(chs, titles)}</b>\n\n` +
    (kind === 'a'
      ? `This admin only sees and manages the selected channels — bot settings and other channels are out of their reach, and reports only arrive from the channels in this list.\n\n`
      : `This viewer only sees violations of the selected channels.\n\n`) +
    `Tap a channel's name to grant/revoke access:\n` +
    `✅ = has access   |   ❌ = no access`);
  const rows = chats.map((c) => [BTN(`${chHas(chs, c.cid) ? '✅' : '❌'} ${c.title.slice(0, 36)}`, actPre + c.cid)]);
  if (!rows.length) t += L(`\n\n⚠️ هنوز هیچ چنلی ثبت نشده ؛ اول یه چنل اضافه و فعال کن .`, `\n\n⚠️ No channel is registered yet — add and activate one first.`);
  rows.push([BTN(chs === '*' ? '🎯 محدود به انتخاب ها' : '🌐 همه چنل ها', allPre)]);
  rows.push([BTN('🔙 بازگشت', backTo)]);
  return { text: t, markup: kb(rows) };
}

/* ── 📣 v3.0 — پنل « پیام همگانی »: انتخاب مقصد ( چنل ها / گروه ها / پیوی ها ) ── */
async function bcCounts(env) {
  const chats = await listChats(env);
  let ch = 0;
  for (const c of chats) if (c.on) ch++;
  const aud = await audIndex(env);
  let gr = 0, pv = 0;
  for (const v of Object.values(aud)) { if (v.t === 'private') pv++; else gr++; }
  return { ch, gr, pv };
}

const BC_DST = {
  ch: { fa: 'فقط چنل ها', en: 'channels only' },
  gr: { fa: 'چنل ها + گروه ها', en: 'channels + groups' },
  pv: { fa: 'چنل ها + پیوی ها', en: 'channels + DMs' },
  all: { fa: 'همه : چنل ها + گروه ها + پیوی ها', en: 'everything: channels + groups + DMs' },
};
const bcTgt = (t) => (BC_DST[t] ? t : 'ch');
const bcDstLabel = (t) => BC_DST[bcTgt(t)].fa;
const bcDstLabelEn = (t) => BC_DST[bcTgt(t)].en;
function bcDstN(t, cnt) {
  t = bcTgt(t);
  if (t === 'ch') return cnt.ch;
  if (t === 'gr') return cnt.ch + cnt.gr;
  if (t === 'pv') return cnt.ch + cnt.pv;
  return cnt.ch + cnt.gr + cnt.pv;
}

function bcTargetText(cnt) {
  return L(
    `<b>پیام همگانی</b>\n\n` +
    `هر پیامی که بفرستی عیناً کپی میشه تو مقصدی که همینجا انتخاب میکنی ( الان ${faNum(cnt.ch)} چنل فعال ثبت شده ) .\n` +
    `اول مقصد رو انتخاب کن ؛ بعدش پیامت رو بفرست تا پیش نمایشش رو نشونت بدم و تأیید بگیرم .`,
    `<b>Broadcast</b>\n\n` +
    `Whatever you send gets copied exactly as-is to the destination you pick here (${cnt.ch} active channels registered).\n` +
    `Pick a destination first; then send your message — you'll get a preview and confirm before it goes out.`);
}

function bcTargetKB(cnt) {
  return kb([
    [BTN(`فقط چنل ها ( ${faNum(cnt.ch)} )`, 'bcT:ch')],
    [BTN(`چنل ها + گروه ها ( ${faNum(cnt.ch + cnt.gr)} )`, 'bcT:gr'), BTN(`چنل ها + پیوی ها ( ${faNum(cnt.ch + cnt.pv)} )`, 'bcT:pv')],
    [BTN(`همه : چنل + گروه + پیوی ( ${faNum(cnt.ch + cnt.gr + cnt.pv)} )`, 'bcT:all')],
    [BTN('مخاطبین ثبت شده', 'audV')],
    [BTN('❌ لغو', 'bcX', 'danger')],
  ]);
}

function bcGuideText(sel, cnt) {
  const d = BC_DST[bcTgt(sel)];
  return L(
    `<b>پیام همگانی</b>\n\n` +
    `هر پیامی که بفرستی عیناً کپی میشه ( الان ${faNum(cnt.ch)} چنل فعال ثبت شده ) .\n` +
    `مقصد : <b>${d.fa}</b> ( ${faNum(bcDstN(sel, cnt))} مقصد ) .\n` +
    `قبل از ارسال ، پیش نمایشش رو نشونت میدم و تأیید میگیری .\n\n` +
    `هر لحظه پشیمون شدی « لغو » رو بزن .`,
    `<b>Broadcast</b>\n\n` +
    `Whatever you send gets copied exactly as-is (${cnt.ch} active channels registered).\n` +
    `Destination: <b>${d.en}</b> (${bcDstN(sel, cnt)} targets).\n` +
    `You'll get a preview and confirm before it goes out.\n\n` +
    `Tap "Cancel" anytime to abort.`);
}

/** 📣 v3.0 — پنل « مخاطبین ثبت شده » ( گروه ها با نام ، پیوی ها با تعداد ) */
async function audText(env) {
  const aud = await audIndex(env);
  const grs = Object.entries(aud).filter(([, v]) => v.t !== 'private');
  const pvs = Object.entries(aud).filter(([, v]) => v.t === 'private');
  return L(
    `<b>مخاطبین ثبت شده</b>\n\n` +
    `گروه ها ( ${faNum(grs.length)} ) :\n` +
    (grs.length ? grs.map(([id, v], i) => `${faNum(i + 1)} ) ${esc(String(v.title || id).slice(0, 40))} — <code>${id}</code>`).join('\n') : '• هنوز گروهی ثبت نشده') +
    `\n\nپیوی ها ( ${faNum(pvs.length)} نفر ) ثبت شدن .\n` +
    `هر چتی که با ربات حرف بزنه ( گروه یا پیوی ) خودکار همینجا ثبت میشه و میتونه مقصد « پیام همگانی » باشه .`,
    `<b>Registered audience</b>\n\n` +
    `Groups (${grs.length}):\n` +
    (grs.length ? grs.map(([id, v], i) => `${i + 1}) ${esc(String(v.title || id).slice(0, 40))} — <code>${id}</code>`).join('\n') : '• No groups yet') +
    `\n\nDMs: ${pvs.length} registered.\n` +
    `Any chat that talks to the bot (group or DM) is auto-registered here and can receive broadcasts.`);
}

async function handleCallback(cb, env, ctx) {
  const uid = cb.from && cb.from.id;
  const data = cb.data || '';
  const msg = cb.message; // پیام پنل در پیوی
  if (!uid || !msg) return answerCb(env, cb.id);

  try {
    const parts = data.split(':');
    const act = parts[0];
    // 📡 v2.0 — نقش + دامنه دسترسی چنلی کاربر
    const scope = await accessOf(env, uid);
    if (!scope) return answerCb(env, cb.id, '⛔️ شما دسترسی ندارید!', true);
    const viewer = scope.role === 'viewer';
    const isOwner = scope.role === 'owner';
    // ناظر: فقط اقدام های مشاهده ای
    if (viewer && !VIEWER_ACTS.has(act)) return answerCb(env, cb.id, '👁 ناظر فقط اجازه مشاهده دارد!', true);
    // 📡 v2.0 — گیت دسترسی چنلی: ادمین/ناظر فقط چنل های اختصاص یافته
    // (قالب دکمه ها: « act:cid » یا « act:x:cid » — فقط tgl و all کلید در بخش ۱ دارند)
    if (CH_ACTS.has(act)) {
      const tCid = (act === 'tgl' || act === 'all') ? (parts[2] || '') : (parts[1] || '');
      if (!canCh(scope, tCid))
        return answerCb(env, cb.id, '⛔️ این چنل به شما اختصاص داده نشده — فقط مالک میتواند دسترسی ها را تعیین کند!', true);
    }

    // ── اقدام های عمومی ──
    if (act === 'noop') return answerCb(env, cb.id);

    if (act === 'home') {
      await clearPanelState(env, uid);
      return (await edit(env, msg.chat.id, msg.message_id, mainText(cb.from, scope), mainKB(isOwner)))
        && answerCb(env, cb.id);
    }
    if (act === 'help') {
      return (await edit(env, msg.chat.id, msg.message_id, helpText(), helpKB())) && answerCb(env, cb.id);
    }
    if (act === 'myid') {
      return (await edit(env, msg.chat.id, msg.message_id,
        L(`<b>شناسه تو :</b> <code>${uid}</code>\nاین عدد رو برای افزودن ادمین به مالک بده .`,
          `<b>Your ID:</b> <code>${uid}</code>\nGive this number to the owner to be added as an admin.`),
        kb([[BTN('🔙 بازگشت', 'home')]]))) && answerCb(env, cb.id);
    }
    if (act === 'chats') {
      let list = await listChats(env);
      if (!isOwner) list = list.filter((c) => canCh(scope, c.cid)); // 📡 v2.0: فقط چنل های خودش
      return (await edit(env, msg.chat.id, msg.message_id, chatsText(list, isOwner), chatsKB(list)))
        && answerCb(env, cb.id);
    }

    if (act === 'admins') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const arr = await getAdmins(env);
      return (await edit(env, msg.chat.id, msg.message_id, await adminsText(env, arr), adminsKB(arr)))
        && answerCb(env, cb.id);
    }
    if (act === 'admA') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await setPanelState(env, uid, { t: 'admA' });
      await send(env, msg.chat.id,
        L(`<b>افزودن ادمین ربات</b>

۱ ) از فرد بخواه ربات رو استارت کنه .
۲ ) شناسه عددیش رو بفرست : با دستور /myid ( همینجا تو ربات ) یا ربات @userinfobot میتونه بگیره .
چند نفر رو با کاما جدا کن ؛ همه باهم اضافه میشن ( حداکثر ۵۰ ) .

بعد از ثبت ، همینجا چنل های مجازش رو انتخاب میکنی .`,
          `<b>➕ Add a bot admin</b>

1) Ask them to start this bot first.
2) Send their numeric ID — they can get it via /myid (right here) or the @userinfobot bot.
   Separate several IDs with commas; all of them get added at once (max 50).

After saving, you'll pick their allowed channels right here.`),
        kb([[BTN('❌ لغو', 'bcX')]]));
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    if (act === 'admD') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const target = parts[1] || '';
      const arr = (await getAdmins(env)).filter((x) => x !== target);
      await setAdmins(env, arr);
      const acc = await getScopes(env); // 📡 v2.0: سابقه دسترسی هم پاک میشود
      delete acc.a[String(target)];
      await setScopes(env, acc);
      await edit(env, msg.chat.id, msg.message_id, await adminsText(env, arr), adminsKB(arr));
      return answerCb(env, cb.id, `✅ حذف شد`);
    }

    /* ── 📣 v1.9: گزارش آزمایشی — بررسی رسیدن گزارش ها به همه گیرنده ها ── */
    if (act === 'admT') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const targets = new Set();
      const ow = await getOwnerId(env);
      if (ow) targets.add(String(ow));
      try { for (const a of await getAdmins(env)) targets.add(String(a)); } catch (e) { /* بی اهمیت */ }
      try { for (const v of await getViewers(env)) targets.add(String(v)); } catch (e) { /* بی اهمیت */ }
      await Promise.all([...targets].map((t) => send(env, t,
        L(`<b>گزارش آزمایشی</b>\n\n` +
        `اگه این پیام رو میبینی یعنی ارسال گزارش ها برای تو فعاله ✅\n` +
        `از این بعد گزارش همه تخلف ها ( حذف ها ، وضعیت زرد/قرمز ، حذف با اکانت ) به تو هم میرسه .\n` +
        `ساعت تهران : <code>${tehranHM()}</code>`,
        `🧪 <b>Test report</b>\n\n` +
        `If you can read this, violation reporting is enabled for you ✅\n` +
        `From now on, reports of all violations (deletions, yellow/red mode, account deletion) will reach you too.\n` +
        `🕘 Tehran time: <code>${tehranHM()}</code>`)).catch(() => {})));
      return answerCb(env, cb.id, L(`✅ به ${targets.size} نفر ارسال شد ( مالک + ادمین ها + ناظرها )`,
                                   `✅ Sent to ${targets.size} people (owner + admins + viewers)`));
    }

    // ── 🌐 v2.3: تغییر زبان شخصی کاربر ──
    if (act === 'lang') {
      const nl = CUR_LANG === 'en' ? 'fa' : 'en';
      await setUserLang(env, uid, nl);
      CUR_LANG = nl;
      await clearPanelState(env, uid);
      return (await edit(env, msg.chat.id, msg.message_id, mainText(cb.from, scope), mainKB(isOwner)))
        && answerCb(env, cb.id, nl === 'en' ? 'Language: English ✅' : 'زبان: فارسی ✅');
    }

    // ── اقدام های مربوط به یک چنل ──
    // قالب دکمه ها: یا « act:cid » (مثل chat) یا « act:x:cid » (مثل tgl:key:cid)
    const a1 = parts[1] || '';

    if (act === 'chat') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const st = await readStats(env, a1);
      return (await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, st, isOwner), chatKB(a1, s, viewer, isOwner)))
        && answerCb(env, cb.id);
    }
    if (act === 'refresh') {
      const info = await tg(env, 'getChat', { chat_id: a1 });
      if (info.ok && info.result && info.result.title) {
        const s = await getSettings(env, a1, true);
        if (s) {
          s.title = info.result.title;
          s.username = info.result.username || '';
          await saveSettings(env, a1, s);
        }
      }
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const st = await readStats(env, a1);
      return (await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, st, isOwner), chatKB(a1, s, viewer, isOwner)))
        && answerCb(env, cb.id, '🔄 بروزرسانی شد');
    }
    if (act === 'locks') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      return (await edit(env, msg.chat.id, msg.message_id, locksText(s), locksKB(s, a1)))
        && answerCb(env, cb.id);
    }
    if (act === 'tgl') {
      const key = a1;
      const target = parts[2] || '';
      if (!LOCKS[key]) return answerCb(env, cb.id, '⚠️ قفل نامعتبر!', true);
      const s = await getSettings(env, target, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      s.locks[key] = !s.locks[key];
      await saveSettings(env, target, s);
      await edit(env, msg.chat.id, msg.message_id, locksText(s), locksKB(s, target));
      return answerCb(env, cb.id, s.locks[key]
        ? L(`🔴 قفل « ${tr(LOCKS[key].label)} » فعال شد` + (key === 'lock_anon'
            ? '\n💡 ادمین ها باید با « Sign messages » پست بدن تا امضاشون زیر پست بیاد'
            : ''),
            `🔴 Lock "${tr(LOCKS[key].label)}" is now ON` + (key === 'lock_anon'
            ? '\n💡 Admins must post with "Sign messages" so their signature appears under posts'
            : ''))
        : L(`🟢 « ${tr(LOCKS[key].label)} » آزاد شد`, `🟢 "${tr(LOCKS[key].label)}" unlocked`));
    }
    if (act === 'all') {
      const mode = a1 === '1';
      const target = parts[2] || '';
      const s = await getSettings(env, target, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      for (const k of LOCK_ORDER) s.locks[k] = mode;
      await saveSettings(env, target, s);
      await edit(env, msg.chat.id, msg.message_id, locksText(s), locksKB(s, target));
      return answerCb(env, cb.id, mode ? '⛔️ همه قفل ها فعال شد' : '✅ همه قفل ها آزاد شد');
    }
    /* ── 📣 v2.6: کلید اعلان قفل ها در خودِ چنل ── */
    if (act === 'annT') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      s.ann = s.ann === false; // undefined/true ⇒ خاموش ، false ⇒ روشن
      await saveSettings(env, a1, s);
      await edit(env, msg.chat.id, msg.message_id, locksText(s), locksKB(s, a1));
      return answerCb(env, cb.id, s.ann
        ? L('اعلان قفل در چنل روشن شد ✅ — با شروع/پایان قفل ها اعلان تو چنل ارسال میشه',
            'Channel lock announcements: ON ✅ — announcements are posted in the channel on lock start/end')
        : L('اعلان قفل در چنل خاموش شد ❌ — با شروع/پایان قفل ها دیگه هیچ پیامی تو چنل ارسال نمیشه',
            'Channel lock announcements: OFF ❌ — nothing is posted in the channel on lock start/end'));
    }
    /* ── 📣 v2.7: ارسال پیام به چنل / پیام همگانی — فقط مالک ── */
    if (act === 'bc1') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await setPanelState(env, uid, { t: 'bcPick', cid: a1 });
      const sentG = await send(env, msg.chat.id,
        L(`<b>ارسال پیام به چنل</b>

هر پیامی که همین الان بفرستی عیناً تو این چنل منتشر میشه : متن ، عکس ، ویدیو ، آلبوم ؛ بدون هدر فوروارد شده از .

قبل از انتشار ، پیش نمایشش رو نشونت میدم و تأیید میگیری .`,
          `<b>📣 Post to channel</b>

Whatever you send right now gets posted to this channel exactly as-is — text, photo, video, album; no "Forwarded from" header.

You'll get a preview and confirm before it goes live.`),
        kb([[BTN('❌ لغو', 'bcX')]]));
      const gm1 = sentG && sentG.ok && sentG.result && sentG.result.message_id ? sentG.result.message_id : 0;
      await setPanelState(env, uid, { t: 'bcPick', cid: a1, gm: gm1 });
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    if (act === 'bcAll') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      // 🧹 راهنمای قبلی ( اگر باز مانده ) پاک میشود
      const stPrev = await env.KV.get('state:' + uid);
      let stP = null; try { stP = stPrev ? JSON.parse(stPrev) : null; } catch (e) { stP = null; }
      if (stP && stP.gm) await tg(env, 'deleteMessage', { chat_id: msg.chat.id, message_id: stP.gm }).catch(() => null);
      await setPanelState(env, uid, { t: 'bcAllPick' });
      const cntT = await bcCounts(env);
      await send(env, msg.chat.id, bcTargetText(cntT), bcTargetKB(cntT));
      return answerCb(env, cb.id, L('↓ مقصد رو انتخاب کن', '↓ Pick the destination'));
    }
    /* ── 📣 v3.0: انتخاب مقصد پیام همگانی ( چنل / گروه / پیوی / همه ) ── */
    if (act === 'bcT') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const sel = ['ch', 'gr', 'pv', 'all'].includes(parts[1]) ? parts[1] : 'ch';
      // 🧹 راهنمای قبلی با مقصد قدیمی پاک میشود
      const stPrevT = await env.KV.get('state:' + uid);
      let stPT = null; try { stPT = stPrevT ? JSON.parse(stPrevT) : null; } catch (e) { stPT = null; }
      if (stPT && stPT.t === 'bcAllPick' && stPT.gm) await tg(env, 'deleteMessage', { chat_id: msg.chat.id, message_id: stPT.gm }).catch(() => null);
      const cntT = await bcCounts(env);
      const sentG = await send(env, msg.chat.id, bcGuideText(sel, cntT), kb([[BTN('❌ لغو', 'bcX')]]));
      const gm = sentG && sentG.ok && sentG.result && sentG.result.message_id ? sentG.result.message_id : 0;
      await setPanelState(env, uid, { t: 'bcAllPick', tgt: sel, gm });
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    /* ── 📣 v3.0: مخاطبین ثبت شده + بازگشت به پنل مقصد ── */
    if (act === 'audV') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await edit(env, msg.chat.id, msg.message_id, await audText(env), kb([[BTN('بازگشت', 'bcBack')]]));
      return answerCb(env, cb.id, '');
    }
    if (act === 'bcBack') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const cntB = await bcCounts(env);
      await edit(env, msg.chat.id, msg.message_id, bcTargetText(cntB), bcTargetKB(cntB));
      return answerCb(env, cb.id, '');
    }
    if (act === 'bcGo') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const stRaw = await env.KV.get('state:' + uid);
      let stO = null;
      try { stO = stRaw ? JSON.parse(stRaw) : null; } catch (e) { stO = null; }
      if (!stO || stO.t !== 'bcGo' || !stO.sc) return answerCb(env, cb.id, L('⚠️ اول پیام رو بفرست ( دکمه « ارسال پیام به چنل » ) .', '⚠️ Send the message first.'), true);
      await clearPanelState(env, uid);
      // 🧹 v3.0 — پاکسازی پیام های اضافه ( راهنما + پیش نمایش )؛ کارت تأیید جای خودش نتیجه میشود
      const cleanIds = [...new Set([stO.gm, stO.fw].filter(Boolean))];
      if (stO.cid) { // تک چنل
        const r = await tg(env, 'copyMessage', { chat_id: stO.cid, from_chat_id: stO.sc, message_id: stO.sm }).catch(() => null);
        if (r && r.ok && r.result && r.result.message_id) trackMsg(env, ctx, stO.cid, r.result.message_id);
        const sT = await getSettings(env, stO.cid);
        for (const mid of cleanIds) await tg(env, 'deleteMessage', { chat_id: msg.chat.id, message_id: mid }).catch(() => null);
        await edit(env, msg.chat.id, msg.message_id,
          r && r.ok
            ? L(`<b>پیام ارسال شد</b>\nچنل : <b>${esc((sT && sT.title) || stO.cid)}</b>`,
                `<b>Message posted</b>\nChannel: <b>${esc((sT && sT.title) || stO.cid)}</b>`)
            : L(`<b>ارسال نشد !</b>\nدلیل : ${esc((r && r.description) || 'نامشخص')}\nدسترسی « ارسال پیام » ربات رو تو این چنل چک کن .`,
                `<b>Failed!</b>\nReason: ${esc((r && r.description) || 'unknown')}\nCheck the bot's "Post Messages" permission in this channel.`),
          kb([[BTN('بازگشت به چنل', `chat:${stO.cid}`)]]));
        return answerCb(env, cb.id, r && r.ok
          ? L('✅ پیام تو چنل ارسال شد', '✅ Message posted to the channel')
          : L(`❌ ارسال نشد : ${esc((r && r.description) || 'نامشخص')}`, `❌ Failed: ${esc((r && r.description) || 'unknown')}`), !!(r && r.ok));
      }
      /* ── 📣 v3.0 — پیام همگانی با مقصد انتخابی ( چنل ها / گروه ها / پیوی ها ) ── */
      const tgt = bcTgt(stO.tgt);
      const chats = await listChats(env);
      const targets = [];
      for (const c of chats) {
        const sb = await getSettings(env, c.cid);
        if (sb && sb.active !== false) targets.push({ id: c.cid, k: 'ch', title: c.title || c.cid });
      }
      if (tgt === 'gr' || tgt === 'all') {
        const aud = await audIndex(env);
        for (const [id, v] of Object.entries(aud)) if (v.t !== 'private') targets.push({ id, k: 'gr', title: v.title || id });
      }
      if (tgt === 'pv' || tgt === 'all') {
        const aud = await audIndex(env);
        for (const [id, v] of Object.entries(aud)) if (v.t === 'private') targets.push({ id, k: 'pv', title: v.title || id });
      }
      if (!targets.length) return answerCb(env, cb.id, L('⚠️ هیچ مقصدی پیدا نشد .', '⚠️ No destinations found.'), true);
      const cut = Math.max(0, targets.length - MAX_BC);
      const list = targets.slice(0, MAX_BC);
      const okBy = { ch: 0, gr: 0, pv: 0 }, totBy = { ch: 0, gr: 0, pv: 0 };
      const errs = [];
      for (const t of list) {
        totBy[t.k]++;
        const r = await tg(env, 'copyMessage', { chat_id: t.id, from_chat_id: stO.sc, message_id: stO.sm }).catch(() => null);
        if (r && r.ok && r.result && r.result.message_id) {
          okBy[t.k]++;
          if (t.k === 'ch') trackMsg(env, ctx, t.id, r.result.message_id);
        } else {
          const tag = t.k === 'gr' ? '[ گروه ] ' : t.k === 'pv' ? '[ پیوی ] ' : '';
          errs.push(tag + esc(String(t.title || t.id).slice(0, 24)) + ' — ' + esc(String((r && r.description) || 'نامشخص').slice(0, 60)));
        }
      }
      // 🧹 پاکسازی: راهنما + پیش نمایش + کارت تأیید ⇒ فقط کارت نتیجه می ماند
      cleanIds.push(msg.message_id);
      for (const mid of cleanIds) await tg(env, 'deleteMessage', { chat_id: msg.chat.id, message_id: mid }).catch(() => null);
      let res = L('<b>پیام همگانی ارسال شد</b>\n\n', '<b>Broadcast sent</b>\n\n');
      if (totBy.ch) res += L(`چنل ها : ${faNum(okBy.ch)} از ${faNum(totBy.ch)}\n`, `Channels: ${okBy.ch}/${totBy.ch}\n`);
      if (totBy.gr) res += L(`گروه ها : ${faNum(okBy.gr)} از ${faNum(totBy.gr)}\n`, `Groups: ${okBy.gr}/${totBy.gr}\n`);
      if (totBy.pv) res += L(`پیوی ها : ${faNum(okBy.pv)} از ${faNum(totBy.pv)}\n`, `DMs: ${okBy.pv}/${totBy.pv}\n`);
      if (cut > 0) res += L(`\n⚠️ ${faNum(cut)} مقصد دیگه جا موند ؛ سقف هر بار ${faNum(MAX_BC)} مقصده .`, `\n⚠️ ${cut} more targets skipped — per-run cap is ${MAX_BC}.`);
      if (errs.length) res += L(`\n❌ خطاها :\n`, `\n❌ Errors:\n`) + errs.slice(0, 8).join('\n');
      await send(env, msg.chat.id, res);
      return answerCb(env, cb.id, L(`✅ به ${faNum(okBy.ch + okBy.gr + okBy.pv)} مقصد ارسال شد`, `✅ Sent to ${okBy.ch + okBy.gr + okBy.pv} targets`));
    }
    if (act === 'bcX') {
      // 🧹 v3.0 — لغو = پاکسازی پیام های راهنما/پیش نمایش/پنل هم
      const stRawX = await env.KV.get('state:' + uid);
      let stX = null;
      try { stX = stRawX ? JSON.parse(stRawX) : null; } catch (e) { stX = null; }
      await clearPanelState(env, uid);
      const cxIds = [...new Set([stX && stX.gm, stX && stX.fw, msg.message_id].filter(Boolean))];
      for (const mid of cxIds) await tg(env, 'deleteMessage', { chat_id: msg.chat.id, message_id: mid }).catch(() => null);
      return answerCb(env, cb.id, L('لغو شد', 'Cancelled'));
    }

    /* ── 🧹 v2.7: حذف N پیام آخر چنل — فقط مالک ── */
    if (act === 'dLM') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await setPanelState(env, uid, { t: 'dLM', cid: a1 });
      await send(env, msg.chat.id,
        L(`<b>حذف پیام های اخیر</b>

چند پیام آخر این چنل پاک بشه ؟ یکی از دکمه های پایین رو بزن یا عدد دلخواه رو بفرست ( بین ۱ تا ${faNum(MAX_DEL)} ) .
مثلاً 10 یعنی ۱۰ پیام آخر پاک بشه .

نکته : فقط پست های بعد از نصب نسخه ۲.۷ ثبت شدن ؛ پیام های قدیمی تر به هیچ رباتی داده نمیشه .`,
          `<b>Delete recent messages</b>

How many of the latest messages should go? Tap a button below or send a custom number — between 1 and ${MAX_DEL}.
E.g. "10" deletes the last 10 messages.

Note: only posts made after v2.7 are tracked; older ones are out of reach for any bot.`),
        kb([
          [BTN(L('۵ پیام', '5 msgs'), `dlN:${a1}:5`), BTN(L('۱۰ پیام', '10 msgs'), `dlN:${a1}:10`)],
          [BTN(L('۲۰ پیام', '20 msgs'), `dlN:${a1}:20`), BTN(L('۴۰ پیام', '40 msgs'), `dlN:${a1}:40`)],
          [BTN(L('عدد دلخواه', 'Custom number'), `dlC:${a1}`)],
          [BTN('❌ لغو', 'bcX')],
        ]));
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    if (act === 'dlC') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await setPanelState(env, uid, { t: 'dLM', cid: a1 });
      return answerCb(env, cb.id, L(`عدد بین ۱ تا ${faNum(MAX_DEL)} رو بفرست . /start = لغو`, `Send a number between 1 and ${MAX_DEL}. /start = cancel`), true);
    }
    if (act === 'dlN') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const nQ = parseInt(parts[2], 10);
      if (!nQ || nQ < 1 || nQ > MAX_DEL) return answerCb(env, cb.id, L('⚠️ عدد نامعتبر!', '⚠️ Invalid number!'), true);
      await clearPanelState(env, uid);
      await dlConfirm(env, uid, msg.chat.id, a1, nQ);
      return answerCb(env, cb.id, '');
    }
    if (act === 'dlGo') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const stRawD = await env.KV.get('state:' + uid);
      let stO = null;
      try { stO = stRawD ? JSON.parse(stRawD) : null; } catch (e) { stO = null; }
      if (!stO || stO.t !== 'dLGo' || stO.cid !== a1 || !Array.isArray(stO.ids) || !stO.ids.length)
        return answerCb(env, cb.id, L('⚠️ اول تعداد رو بفرست ( دکمه « حذف پیام های اخیر » ) .', '⚠️ Send the count first ("Delete recent messages").'), true);
      await clearPanelState(env, uid);
      let okD = 0; const failD = [];
      for (const mid of stO.ids) {
        const r = await tg(env, 'deleteMessage', { chat_id: a1, message_id: mid }).catch(() => null);
        if (r && r.ok) okD++; else failD.push(mid);
      }
      await removeMsgs(env, a1, stO.ids);
      // 🧹 v3.0 — کارت تأیید به کارت نتیجه تبدیل میشود ( با دکمه های ادامه حذف )
      const sDR = await getSettings(env, a1);
      await edit(env, msg.chat.id, msg.message_id,
        L(`<b>نتیجه پاک سازی</b>\nچنل : <b>${esc((sDR && sDR.title) || a1)}</b>\n\n` +
          `✅ ${faNum(okD)} پیام پاک شد .` +
          (failD.length ? `\n⚠️ ${faNum(failD.length)} تا پاک نشد ( قبلاً حذف شده بودن یا قدیمی تر از ۴۸ ساعت بودن ) .` : '') +
          `\n\nچیز دیگه ای هم پاک کنم ؟`,
          `<b>Cleanup result</b>\nChannel: <b>${esc((sDR && sDR.title) || a1)}</b>\n\n` +
          `✅ ${okD} messages deleted.` +
          (failD.length ? `\n⚠️ ${failD.length} failed (already gone or older than 48h).` : '') +
          `\n\nDelete more?`),
        kb([
          [BTN('۵ پیام دیگه', `dlN:${a1}:5`), BTN('۱۰ پیام دیگه', `dlN:${a1}:10`)],
          [BTN('۲۰ پیام دیگه', `dlN:${a1}:20`), BTN('عدد دلخواه', `dlC:${a1}`)],
          [BTN('بازگشت به چنل', `chat:${a1}`)],
        ]));
      return answerCb(env, cb.id,
        L(`🧹 ${faNum(okD)} پیام پاک شد` + (failD.length ? ` — ${faNum(failD.length)} تا پاک نشد ( قبلاً حذف شده یا قدیمی تر از ۴۸ ساعت )` : ''),
          `🧹 ${okD} messages deleted` + (failD.length ? ` — ${failD.length} failed (already deleted or older than 48h)` : '')), true);
    }
    if (act === 'dlX') {
      await clearPanelState(env, uid);
      return answerCb(env, cb.id, L('لغو شد', 'Cancelled'));
    }

    if (act === 'instT') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const wasOn = !!(s.instant && s.instant.on);
      s.instant = { on: !wasOn, at: wasOn ? 0 : Date.now() };
      await saveSettings(env, a1, s);
      // 📣 v2.5/v2.6: اعلان روشن/خاموش شدن قفل آنی در خودِ چنل (اگه کلید « اعلان قفل » خاموش باشه، ارسال نمیشه)
      const annOk = s.ann === false ? true : await announceChannel(env, a1, instantAnnounceText(!wasOn, s, a1));
      const st = await readStats(env, a1);
      await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, st, isOwner), chatKB(a1, s, viewer, isOwner));
      return answerCb(env, cb.id, (wasOn
        ? '🔓 قفل آنی باز شد — ارسال و ادیت آزاد شد'
        : '🚨 قفل آنی فعال شد! تا باز کردن، هر پیامی فوراً حذف میشود')
        + (annOk ? '' : L('\n⚠️ اعلان در خود چنل ارسال نشد (دسترسی « ارسال پیام » ربات را چک کنید).',
            '\n⚠️ Channel announcement failed (check the bot\'s "Post Messages" permission).')), !wasOn);
    }
    if (act === 'enb') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      // 📡 v2.0 چندچنله: فعال کردن این چنل، بقیه را غیرفعال « نمیکند »
      s.active = true;
      await saveSettings(env, a1, s);
      const st = await readStats(env, a1);
      await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, st, isOwner), chatKB(a1, s, viewer, isOwner));
      return answerCb(env, cb.id, '✅ این چنل فعال شد — بقیه چنل های فعال هم فعال میمانند (چندچنله)', true);
    }
    if (act === 'rej') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await env.KV.delete('chat:' + a1);
      await env.KV.delete('stat:' + a1);
      await env.KV.delete('vlog:' + a1);
      await env.KV.delete('msgs:' + a1);
      scache.delete('chat:' + a1);
      pend.delete(a1); pendVlog.delete(a1);
      pendMsgs.delete(a1); pendMsgsTimer.delete(a1);
      return answerCb(env, cb.id, '🗑 چنل رد شد و از لیست حذف شد');
    }
    if (act === 'sched') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      return (await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1)))
        && answerCb(env, cb.id);
    }
    if (act === 'schT') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      // 📣 v2.5: اگر همین لحظه داخل بازه باشیم، فعال/غیرفعال کردن = شروع/پایانِ واقعی قفل
      const nowWin = winActive(s.schedule.start | 0, s.schedule.end | 0, tehranMinutes());
      s.schedule.enabled = !s.schedule.enabled;
      await saveSettings(env, a1, s);
      await putSchedState(env, a1, s.schedule.enabled && nowWin);
      let annOk = true;
      if (nowWin && s.ann !== false) annOk = await announceChannel(env, a1, s.schedule.enabled ? schedStartText(s, a1) : schedEndText(s, a1));
      await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1));
      return answerCb(env, cb.id, (s.schedule.enabled
        ? L(`🔔 قفل زمان دار فعال شد ( ${fmtHM(s.schedule.start)} تا ${fmtHM(s.schedule.end)} )`,
            `🔔 Scheduled lock enabled (${fmtHM(s.schedule.start)} to ${fmtHM(s.schedule.end)})`)
        : L('🔕 قفل زمان دار غیرفعال شد', '🔕 Scheduled lock disabled'))
        + (annOk ? '' : L('\n⚠️ اعلان در خود چنل ارسال نشد.', '\n⚠️ Channel announcement failed.')));
    }
    /* ── 🕐 v2.9: انتخاب ساعت با گرید ۰ تا ۲۳ + پریست + کارت تأیید ── */
    if (act === 'schS' || act === 'schE') {
      const s = await getSettings(env, a1);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const which = act === 'schS' ? 'S' : 'E';
      await setPanelState(env, uid, { t: 'schG', cid: a1, which });
      await edit(env, msg.chat.id, msg.message_id, hourGridText(which), hourGridKB(a1, which));
      return answerCb(env, cb.id, L('↓ ساعت رو از دکمه های پایین انتخاب کن', '↓ Pick the hour below'));
    }
    if (act === 'schH') {
      const which = parts[2] === 'E' ? 'E' : 'S';
      const h = parseInt(parts[3], 10);
      if (isNaN(h) || h < 0 || h > 23) return answerCb(env, cb.id, '⚠️ ساعت نامعتبر!', true);
      const stG = await env.KV.get('state:' + uid);
      let stO = null; try { stO = stG ? JSON.parse(stG) : null; } catch (e) { stO = null; }
      if (!stO || (stO.t !== 'schG' && stO.t !== 'schS' && stO.t !== 'schE') || String(stO.cid) !== String(a1))
        return answerCb(env, cb.id, L('⚠️ جلسه انتخاب ساعت منقضی شد — دوباره روی « شروع » یا « پایان » بزن.', '⚠️ Session expired — tap Start or End again.'), true);
      await setPanelState(env, uid, { t: 'schMn', cid: a1, which, hm: h * 60, S: stO.S != null ? stO.S : null });
      await edit(env, msg.chat.id, msg.message_id, minGridText(which, h * 60, stO.S), minGridKB(a1, which));
      return answerCb(env, cb.id, L(`ساعت : ${pad2(h)} — حالا دقیقه رو انتخاب کن`, `Hour: ${pad2(h)} — now pick the minutes`));
    }
    /* ── ⏱ v3.0: انتخاب دقیقه ( مرحله دوم بعد از ساعت ) ── */
    if (act === 'schMn') {
      const which = parts[2] === 'E' ? 'E' : 'S';
      const mm = parseInt(parts[3], 10);
      if (isNaN(mm) || mm < 0 || mm > 59) return answerCb(env, cb.id, '⚠️ دقیقه نامعتبر!', true);
      const stG = await env.KV.get('state:' + uid);
      let stO = null; try { stO = stG ? JSON.parse(stG) : null; } catch (e) { stO = null; }
      if (!stO || stO.t !== 'schMn' || String(stO.cid) !== String(a1) || (stO.which || 'S') !== which || !Number.isFinite(stO.hm))
        return answerCb(env, cb.id, L('⚠️ جلسه انتخاب زمان منقضی شد — دوباره روی « شروع » یا « پایان » بزن.', '⚠️ Session expired — tap Start or End again.'), true);
      const total = Math.max(0, Math.min(1439, Number(stO.hm) + mm));
      if (which === 'S') {
        await setPanelState(env, uid, { t: 'schG', cid: a1, which: 'E', S: total });
        await edit(env, msg.chat.id, msg.message_id, hourGridText('E', total), hourGridKB(a1, 'E'));
        return answerCb(env, cb.id, L(`شروع : ${fmtHM(total)} — حالا ساعت پایان رو انتخاب کن`, `Start: ${fmtHM(total)} — now pick the end hour`));
      }
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const S = Number(stO.S != null ? stO.S : s.schedule.start);
      await setPanelState(env, uid, { t: 'schC', cid: a1, S, E: total });
      await edit(env, msg.chat.id, msg.message_id, schedConfirmText(S, total, s), schedConfirmKB(a1));
      return answerCb(env, cb.id, L('بازه انتخاب شد — تأیید کن', 'Window picked — confirm'));
    }
    if (act === 'schQ') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      if (parts[2] === 'same') s.schedule.end = s.schedule.start;
      else {
        s.schedule.start = Math.max(0, Math.min(1439, parseInt(parts[2], 10) || 0));
        s.schedule.end = Math.max(0, Math.min(1439, parseInt(parts[3], 10) || 0));
      }
      await saveSettings(env, a1, s);
      await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1));
      return answerCb(env, cb.id, L(s.schedule.enabled
        ? `بازه ثبت شد : ${fmtHM(s.schedule.start)} تا ${fmtHM(s.schedule.end)} — قفل زمان دار روشنه`
        : `بازه ثبت شد : ${fmtHM(s.schedule.start)} تا ${fmtHM(s.schedule.end)} — با « روشن کردن » فعالش کن`,
        s.schedule.enabled
        ? `Window saved: ${fmtHM(s.schedule.start)} to ${fmtHM(s.schedule.end)} — scheduled lock is ON`
        : `Window saved: ${fmtHM(s.schedule.start)} to ${fmtHM(s.schedule.end)} — tap "Turn ON" to enable`), true);
    }
    if (act === 'schGo') {
      const stR = await env.KV.get('state:' + uid);
      let stC = null; try { stC = stR ? JSON.parse(stR) : null; } catch (e) { stC = null; }
      if (!stC || stC.t !== 'schC' || String(stC.cid) !== String(a1) || !Number.isFinite(stC.S) || !Number.isFinite(stC.E))
        return answerCb(env, cb.id, L('⚠️ اول بازه رو انتخاب کن.', '⚠️ Pick the window first.'), true);
      const s = await getSettings(env, a1, true);
      if (!s) { await clearPanelState(env, uid); return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true); }
      s.schedule.start = stC.S; s.schedule.end = stC.E;
      await saveSettings(env, a1, s);
      await clearPanelState(env, uid);
      await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1));
      return answerCb(env, cb.id, L(`✅ ثبت شد : ${fmtHM(stC.S)} تا ${fmtHM(stC.E)}${s.schedule.enabled ? '' : ' — با « روشن کردن » فعالش کن'}`,
        `✅ Saved: ${fmtHM(stC.S)} to ${fmtHM(stC.E)}${s.schedule.enabled ? '' : ' — tap "Turn ON" to enable'}`), true);
    }
    if (act === 'schX') {
      await clearPanelState(env, uid);
      const s = await getSettings(env, a1, true);
      if (s) await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1));
      return answerCb(env, cb.id, L('لغو شد', 'Cancelled'));
    }
    if (act === 'schM') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const cur = MODE_CYCLE.indexOf(s.schedule.mode || 'all');
      s.schedule.mode = MODE_CYCLE[(cur + 1) % MODE_CYCLE.length];
      await saveSettings(env, a1, s);
      await edit(env, msg.chat.id, msg.message_id, schedText(s), schedKB(s, a1));
      return answerCb(env, cb.id, `${L('🎛 حالت: ', '🎛 Mode: ')}${tr(SCHED_MODES[s.schedule.mode].label)}`);
    }
    if (act === 'stats') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const st = await readStats(env, a1);
      return (await edit(env, msg.chat.id, msg.message_id, statsText(s, st), statsKB(a1, viewer)))
        && answerCb(env, cb.id);
    }
    if (act === 'vlog') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const list = await readVlog(env, a1);
      return (await edit(env, msg.chat.id, msg.message_id, vlogText({ ...s, cid: a1 }, list), vlogKB(a1)))
        && answerCb(env, cb.id);
    }
    if (act === 'viewers') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const arr = await getViewers(env);
      return (await edit(env, msg.chat.id, msg.message_id, await viewersText(env, arr), viewersKB(arr)))
        && answerCb(env, cb.id);
    }
    if (act === 'vwA') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      await setPanelState(env, uid, { t: 'vwA' });
      await send(env, msg.chat.id,
        L(`<b>افزودن ناظر</b>

ناظر فقط گزارش ها و آمار رو میبینه و هیچ تنظیمی نمیتونه عوض کنه .

۱ ) از فرد بخواه ربات رو استارت کنه .
۲ ) شناسه عددیش رو بفرست : با دستور /myid ( همینجا تو ربات ) یا ربات @userinfobot میتونه بگیره .
چند نفر رو با کاما جدا کن ؛ همه باهم اضافه میشن ( حداکثر ۵۰ ) .

بعد از ثبت ، برای هر نفر دکمه « چنل ها » رو میبینی و مشخص میکنی کدوم چنل ها رو ببینه .`,
          `<b>Add a viewer</b>

A viewer only sees reports and stats — they cannot change any setting.

1) Ask them to start this bot first.
2) Send their numeric ID — via /myid (right here) or the @userinfobot bot.
Separate several IDs with commas; all get added at once (max 50).

After saving, tap "Channels" for each person and pick which channels they can see.`),
        kb([[BTN('❌ لغو', 'bcX')]]));
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    if (act === 'vwD') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const target = parts[1] || '';
      const arr = (await getViewers(env)).filter((x) => x !== target);
      await setViewers(env, arr);
      const acc = await getScopes(env); // 📡 v2.0: سابقه دسترسی هم پاک میشود
      delete acc.v[String(target)];
      await setScopes(env, acc);
      await edit(env, msg.chat.id, msg.message_id, await viewersText(env, arr), viewersKB(arr));
      return answerCb(env, cb.id, `✅ حذف شد`);
    }

    /* ── 📡 v2.0: ویرایشگر دسترسی چنلی ادمین/ناظر — فقط مالک ── */
    if (act === 'asc' || act === 'vsc') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const v = await scopeView(env, act === 'asc' ? 'a' : 'v', parts[1]);
      return (await edit(env, msg.chat.id, msg.message_id, v.text, v.markup)) && answerCb(env, cb.id);
    }
    if (act === 'ascT' || act === 'vscT') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const kind = act === 'ascT' ? 'a' : 'v';
      const who = parts[1] || '';
      const tCid = String(parts[2] || '');
      const acc = await getScopes(env);
      const map = kind === 'a' ? acc.a : acc.v;
      const entry = map[who] || { ch: await defaultChs(env) };
      let chs = entry.ch === '*' ? (await listChats(env)).map((c) => c.cid) : [...(Array.isArray(entry.ch) ? entry.ch : [])];
      if (chs.includes(tCid)) chs = chs.filter((x) => x !== tCid); else chs.push(tCid);
      map[who] = { ch: chs };
      await setScopes(env, acc);
      const v = await scopeView(env, kind, who);
      await edit(env, msg.chat.id, msg.message_id, v.text, v.markup);
      return answerCb(env, cb.id, chs.includes(tCid) ? '✅ دسترسی داده شد' : '❌ دسترسی گرفته شد');
    }
    if (act === 'ascW' || act === 'vscW') {
      if (!isOwner) return answerCb(env, cb.id, '👑 فقط مالک ربات!', true);
      const kind = act === 'ascW' ? 'a' : 'v';
      const who = parts[1] || '';
      const acc = await getScopes(env);
      const map = kind === 'a' ? acc.a : acc.v;
      const entry = map[who] || { ch: await defaultChs(env) };
      map[who] = { ch: entry.ch === '*' ? (await listChats(env)).map((c) => c.cid) : '*' };
      await setScopes(env, acc);
      const v = await scopeView(env, kind, who);
      await edit(env, msg.chat.id, msg.message_id, v.text, v.markup);
      return answerCb(env, cb.id, map[who].ch === '*' ? '🌐 همه چنل ها فعال شد' : '🎯 محدود به چنل های انتخابی شد');
    }
    if (act === 'rstS') {
      await resetStats(env, a1);
      const s = await getSettings(env, a1, true);
      const st = await readStats(env, a1);
      return (await edit(env, msg.chat.id, msg.message_id, statsText(s, st), statsKB(a1)))
        && answerCb(env, cb.id, '✅ آمار ریست شد');
    }
    if (act === 'health') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const txt = await healthText(env, { ...s, cid: a1 });
      return (await edit(env, msg.chat.id, msg.message_id, txt, healthKB(a1))) && answerCb(env, cb.id);
    }

    /* ── 🟡🔴 v1.8: نردبان وضعیت — چرخه خاموش → زرد → قرمز → خاموش ── */
    if (act === 'redT') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      s.punishMode = s.punishMode === 'off' ? 'yellow' : (s.punishMode === 'yellow' ? 'red' : 'off');
      await saveSettings(env, a1, s);
      const stt = await readStats(env, a1);
      await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, stt, isOwner), chatKB(a1, s, viewer, isOwner));
      return answerCb(env, cb.id, s.punishMode === 'yellow'
        ? '🟡 وضعیت زرد روشن شد! ادیتِ پستِ مدیادار ⇒ پاک + عزل متخلف (بدون بن)'
        : s.punishMode === 'red'
          ? '🚨🔴 وضعیت قرمز روشن شد! ادیتِ پستِ مدیادار ⇒ پاک + عزل + بن متخلف'
          : 'وضعیت خاموش شد — ادیت مدیا فقط طبق قفل ها پاک میشود', s.punishMode !== 'off');
    }
    /* ── ⏱ v1.9: مدت بن خودکار در وضعیت قرمز — چرخه همیشگی → ۱ ساعت → ۲۴ ساعت → ۷ روز ── */
    if (act === 'banH') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      s.banHours = BAN_HOURS[(BAN_HOURS.indexOf(Number(s.banHours) || 0) + 1) % BAN_HOURS.length];
      await saveSettings(env, a1, s);
      const stt = await readStats(env, a1);
      await edit(env, msg.chat.id, msg.message_id, chatText({ ...s, cid: a1 }, stt, isOwner), chatKB(a1, s, viewer, isOwner));
      return answerCb(env, cb.id, `${L('⏱ مدت بن خودکار: ', '⏱ Auto-ban duration: ')}${tr(BAN_LABEL[s.banHours])}`);
    }
    /* ── 💾 v1.9: بکاپ تنظیمات (خروجی متن) ── */
    if (act === 'bakE') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const bak = backupOf(s);
      await send(env, msg.chat.id,
        L(`<b>بکاپ تنظیمات — ${esc(s.title)}</b>\n\n` +
        `<code>${esc(JSON.stringify(bak))}</code>\n\n` +
        `برای بازگردانی دکمه « بازگردانی » رو تو پنل چنل بزن و همین متن رو بفرست .\n` +
        `این متن رو جایی نگه دار ؛ اگه تنظیمات اشتباهی عوض شد با همین برمیگردی .`,
        `💾 <b>Settings backup — ${esc(s.title)}</b>\n\n` +
        `<code>${esc(JSON.stringify(bak))}</code>\n\n` +
        `📥 To restore: tap "📥 Restore" in the channel panel and send this exact text.\n` +
        `💡 Keep this text somewhere safe — if settings get messed up, this brings them back.`));
      return answerCb(env, cb.id, '💾 بکاپ در پیام بالا آمد');
    }
    if (act === 'bakI') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      await setPanelState(env, uid, { t: 'bakI', cid: a1 });
      await send(env, msg.chat.id,
        L(`<b>بازگردانی بکاپ</b>

متن بکاپی که دکمه « بکاپ » داده رو عیناً بفرست ( با { شروع میشه ) .
همه تنظیمات چنل همون لحظه برمیگرده به همون وضعیت : قفل ها ، وضعیت زرد/قرمز ، مدت بن ، قفل زمان دار و اعلان .`,
          `<b>Restore backup</b>

Send the exact backup text the "Backup" button produced (it starts with {).
All channel settings return to that state instantly: locks, yellow/red mode, ban duration, scheduled lock and announcements.`),
        kb([[BTN('❌ لغو', 'bcX')]]));
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    /* ── ♻️ لغو بن متخلف (دکمه گزارش قرمز) ── */
    if (act === 'ubn') {
      const cu = parts[2] || '';
      const r = await tgSmart(env, 'unbanChatMember', { chat_id: a1, user_id: cu });
      return answerCb(env, cb.id,
        r.ok ? '♻️ بن لغو شد ؛ این فرد میتونه دوباره عضو چنل بشه'
             : '❌ ' + (r.description || L('لغو بن ناموفق بود', 'Unban failed')), r.ok ? false : true);
    }
    /* ── ↩️ v1.8: بازگردانی دسترسی های قبلی ادمینِ عزل شده ── */
    if (act === 'admU') {
      const cu = parts[2] || '';
      let prev = null;
      try { prev = JSON.parse((await env.KV.get(`undo:${a1}:${cu}`)) || 'null'); } catch (e) { prev = null; }
      if (!prev || typeof prev !== 'object')
        return answerCb(env, cb.id, '⚠️ اطلاعات بازگردانی پیدا نشد (منقضی شده یا قبلاً اعمال شده).', true);
      const p = { chat_id: a1, user_id: cu };
      for (const k of CAM_ORDER) p[CAM_OPTS[k].param] = !!prev[k];
      const r = await tgSmart(env, 'promoteChatMember', p);
      if (r.ok) await env.KV.delete(`undo:${a1}:${cu}`).catch(() => {});
      if (r.ok && msg && msg.text) {
        await edit(env, msg.chat.id, msg.message_id, msg.text + L('\n\n↩️ <b>دسترسی های قبلی متخلف بازگردانی شد ✅</b>', "\n\n↩️ <b>The offender's previous access was restored ✅</b>")).catch(() => {});
      }
      return answerCb(env, cb.id, r.ok
        ? L('↩️ بازگردانی شد ✅ — دسترسی ها: ', '↩️ Restored ✅ — permissions: ') + (CAM_ORDER.filter((k) => prev[k]).map((k) => tr(CAM_OPTS[k].label)).join('، ') || tr('هیچ'))
        : '❌ ' + (r.description || L('بازگردانی ناموفق بود', 'Restore failed')), true);
    }

    /* ── 👑 v1.7: ادمین سازی در چنل ── */
    if (act === 'admC') {
      const v = await camView(env, a1);
      if (!v) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      return (await edit(env, msg.chat.id, msg.message_id, v.text, v.markup)) && answerCb(env, cb.id);
    }
    if (act === 'camA') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      await setPanelState(env, uid, { t: 'camA', cid: a1 });
      await send(env, msg.chat.id,
        L(`<b>ادمین سازی در چنل</b> — ${esc(s.title)}

۱ ) شناسه عددی فرد رو بفرست یا @یوزرنیمش ( یوزرنیم فقط تک نفره ) .
برای چند نفر شناسه ها رو با کاما یا خط جدید بفرست ( حداکثر ۵۰ ) .
۲ ) بعد یه پریست انتخاب میکنی : پیشنهاد ما « ادمین معمولی » هست ؛ و تأیید میزنی .

نکته : لازم نیست فرد عضو چنل باشه ؛ بعد از ارتقا میتونه با لینک بیاد .`,
          `<b>👑 Promote a channel admin</b> — ${esc(s.title)}

1) Send the person's numeric ID, or their @username (username works for one person only).
   For several people, send IDs separated by commas or newlines (max 50).
2) Then pick a preset — we recommend "⚡️ Basic admin" — and confirm.

Note: they don't have to be a member yet; they can join via the link after promotion.`),
        kb([[BTN('❌ لغو', 'bcX')]]));
      return answerCb(env, cb.id, L('↓ راهنما رو فرستادم', '↓ Guide sent'));
    }
    /* ── ⚡️ v1.8: پریست ادمین سازی — یک ضربه = تنظیم + ارتقا ── */
    if (act === 'camP') {
      const raw = await env.KV.get('state:' + uid);
      let stt = null; try { stt = raw ? JSON.parse(raw) : null; } catch (e) { stt = null; }
      if (!stt || (stt.t !== 'camR' && stt.t !== 'camB') || String(stt.cid) !== String(a1))
        return answerCb(env, cb.id, '⚠️ جلسه تنظیم منقضی شد ؛ دوباره از « ادمین های چنل » شروع کن .', true);
      const pre = CAM_PRESETS[parts[2]];
      if (!pre) return answerCb(env, cb.id, '⚠️ پریست نامعتبر!', true);
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const me = await botInfo(env);
      const br = await tg(env, 'getChatMember', { chat_id: a1, user_id: me.id });
      if (!br.ok || !br.result || br.result.status !== 'administrator' || !br.result.can_promote_members) {
        return answerCb(env, cb.id,
          '⚠️ ربات دسترسی « Add New Admins » نداره !\nاول تو تنظیمات ادمینی ربات در تلگرام این دسترسی رو روشن کن ، بعد دوباره تلاش کن .', true);
      }
      stt.r = {};
      for (const k of CAM_ORDER) stt.r[k] = !!pre.r[k];
      // 📋 v2.1 — تک نفره (camR) یا گروهی (camB)
      const targets = stt.t === 'camB' ? stt.ids : [String(stt.target)];
      const res = [];
      for (const t0 of targets) {
        const p = { chat_id: a1, user_id: Number(t0) };
        for (const k of CAM_ORDER) p[CAM_OPTS[k].param] = !!stt.r[k];
        const r = await tg(env, 'promoteChatMember', p);
        res.push({ id: String(t0), ok: !!r.ok, desc: r.ok ? '' : (r.description || 'نامشخص') });
        if (targets.length > 1) await new Promise((z) => setTimeout(z, 150)); // احترام به لیمیت تلگرام
      }
      await clearPanelState(env, uid);
      const granted = CAM_ORDER.filter((k) => stt.r[k]).map((k) => tr(CAM_OPTS[k].label)).join('، ') || tr('هیچ');
      if (res.length === 1) {
        if (res[0].ok) {
          await edit(env, msg.chat.id, msg.message_id,
            L(`✅ <b>ارتقا با پریست ${esc(tr(pre.label))} انجام شد !</b>\n👤 ${await userLabel(env, res[0].id)}\n👑 دسترسی ها : ${esc(granted)}\n\n📺 ${esc(s.title)}`,
              `✅ <b>Promoted with the ${esc(tr(pre.label))} preset!</b>\n👤 ${await userLabel(env, res[0].id)}\n👑 Permissions: ${esc(granted)}\n\n📺 ${esc(s.title)}`),
            kb([[BTN('➕ ادمین بعدی', `camA:${a1}`)], [BTN('👑 ادمین های چنل', `admC:${a1}`)]]));
          return answerCb(env, cb.id, '✅ ادمین شد');
        }
        await edit(env, msg.chat.id, msg.message_id,
          L(`❌ <b>ارتقا ناموفق بود :</b>\n<code>${esc(res[0].desc)}</code>`,
            `❌ <b>Promotion failed:</b>\n<code>${esc(res[0].desc)}</code>`),
          kb([[BTN('👑 ادمین های چنل', `admC:${a1}`)]]));
        return answerCb(env, cb.id, '❌ ارتقا ناموفق بود', true);
      }
      const okN = res.filter((x) => x.ok).length;
      const labels = await userLabels(env, res.map((x) => x.id)); // 📋 v2.2 — نام/منشن
      let bt = L(`📋 <b>ادمین سازی گروهی — پریست ${esc(tr(pre.label))}</b>\n📺 ${esc(s.title)}\n👑 دسترسی ها : ${esc(granted)}\n\n✅ موفق : <b>${okN}</b> از ${res.length}\n\n`,
                 `📋 <b>Batch promotion — ${esc(tr(pre.label))} preset</b>\n📺 ${esc(s.title)}\n👑 Permissions: ${esc(granted)}\n\n✅ Succeeded: <b>${okN}</b> of ${res.length}\n\n`);
      bt += res.map((x) => (x.ok ? '✅' : '❌') + ` ${labels[x.id] || `<code>${x.id}</code>`}` + (x.ok ? '' : ` — ${esc(tr(faPromoteErr(x.desc)))}`)).join('\n');
      await edit(env, msg.chat.id, msg.message_id, bt,
        kb([[BTN('➕ افزودن گروهی بعدی', `camA:${a1}`)], [BTN('👑 ادمین های چنل', `admC:${a1}`)]]));
      return answerCb(env, cb.id, okN === res.length ? L(`✅ ${okN} نفر ادمین شدند`, `✅ ${okN} people became admins`) : L(`⚠️ ${okN} موفق ، ${res.length - okN} ناموفق`, `⚠️ ${okN} succeeded, ${res.length - okN} failed`));
    }
    if (act === 'camT' || act === 'camAll') {
      const raw = await env.KV.get('state:' + uid);
      let stt = null; try { stt = raw ? JSON.parse(raw) : null; } catch (e) { stt = null; }
      if (!stt || (stt.t !== 'camR' && stt.t !== 'camB') || String(stt.cid) !== String(a1))
        return answerCb(env, cb.id, '⚠️ جلسه تنظیم منقضی شد ؛ دوباره از « ادمین های چنل » شروع کن .', true);
      if (act === 'camAll') { for (const k of CAM_ORDER) stt.r[k] = parts[2] === '1'; }
      else {
        const kk = parts[2];
        if (!CAM_OPTS[kk]) return answerCb(env, cb.id, '⚠️ دسترسی نامعتبر!', true);
        stt.r[kk] = !stt.r[kk];
      }
      await setPanelState(env, uid, stt); // ذخیره + تمدید مهلت
      await edit(env, msg.chat.id, msg.message_id, camRText(stt), camRKB(a1, stt.r));
      return answerCb(env, cb.id, act === 'camAll'
        ? (parts[2] === '1' ? '✅ همه دسترسی ها انتخاب شد' : '⛔ همه دسترسی ها برداشته شد') : '');
    }
    if (act === 'camG') {
      const raw = await env.KV.get('state:' + uid);
      let stt = null; try { stt = raw ? JSON.parse(raw) : null; } catch (e) { stt = null; }
      if (!stt || (stt.t !== 'camR' && stt.t !== 'camB') || String(stt.cid) !== String(a1))
        return answerCb(env, cb.id, '⚠️ جلسه تنظیم منقضی شد ؛ دوباره شروع کن .', true);
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const me = await botInfo(env);
      const br = await tg(env, 'getChatMember', { chat_id: a1, user_id: me.id });
      if (!br.ok || !br.result || br.result.status !== 'administrator' || !br.result.can_promote_members) {
        return answerCb(env, cb.id,
          '⚠️ ربات دسترسی « Add New Admins » نداره !\nاول تو تنظیمات ادمینی ربات در تلگرام این دسترسی رو روشن کن ، بعد دوباره تلاش کن .', true);
      }
      // 📋 v2.1 — تک نفره یا گروهی
      const targets = stt.t === 'camB' ? stt.ids : [String(stt.target)];
      const res = [];
      for (const t0 of targets) {
        const p = { chat_id: a1, user_id: Number(t0) };
        for (const k of CAM_ORDER) p[CAM_OPTS[k].param] = !!stt.r[k];
        const r = await tg(env, 'promoteChatMember', p);
        res.push({ id: String(t0), ok: !!r.ok, desc: r.ok ? '' : (r.description || 'نامشخص') });
        if (targets.length > 1) await new Promise((z) => setTimeout(z, 150));
      }
      await clearPanelState(env, uid);
      const granted = CAM_ORDER.filter((k) => stt.r[k]).map((k) => tr(CAM_OPTS[k].label)).join('، ') || tr('هیچ');
      if (res.length === 1) {
        if (res[0].ok) {
          await edit(env, msg.chat.id, msg.message_id,
            L((stt.edit ? `✅ <b>دسترسی ها بروز شد !</b>` : `✅ <b>ارتقا انجام شد !</b>`) +
            `\n👤 ${await userLabel(env, res[0].id)}\n👑 دسترسی ها : ${esc(granted)}\n\n📺 ${esc(s.title)}`,
            (stt.edit ? `✅ <b>Permissions updated!</b>` : `✅ <b>Promotion done!</b>`) +
            `\n👤 ${await userLabel(env, res[0].id)}\n👑 Permissions: ${esc(granted)}\n\n📺 ${esc(s.title)}`),
            kb([[BTN('➕ ادمین بعدی', `camA:${a1}`)], [BTN('👑 ادمین های چنل', `admC:${a1}`)]]));
          return answerCb(env, cb.id, stt.edit ? L('✅ دسترسی ها بروز شد', '✅ Permissions updated') : '✅ ادمین شد');
        }
        await edit(env, msg.chat.id, msg.message_id,
          L(`❌ <b>ارتقا ناموفق بود :</b>\n<code>${esc(res[0].desc)}</code>`,
            `❌ <b>Promotion failed:</b>\n<code>${esc(res[0].desc)}</code>`),
          kb([[BTN('🔙 بازگشت به ادمین های چنل', `admC:${a1}`)]]));
        return answerCb(env, cb.id, '❌ ارتقا ناموفق بود', true);
      }
      const okN = res.filter((x) => x.ok).length;
      const labels = await userLabels(env, res.map((x) => x.id)); // 📋 v2.2 — نام/منشن
      let bt = L(`📋 <b>ارتقای گروهی انجام شد !</b>\n📺 ${esc(s.title)}\n👑 دسترسی ها : ${esc(granted)}\n\n✅ موفق : <b>${okN}</b> از ${res.length}\n\n`,
                 `📋 <b>Batch promotion completed!</b>\n📺 ${esc(s.title)}\n👑 Permissions: ${esc(granted)}\n\n✅ Succeeded: <b>${okN}</b> of ${res.length}\n\n`);
      bt += res.map((x) => (x.ok ? '✅' : '❌') + ` ${labels[x.id] || `<code>${x.id}</code>`}` + (x.ok ? '' : ` — ${esc(tr(faPromoteErr(x.desc)))}`)).join('\n');
      await edit(env, msg.chat.id, msg.message_id, bt,
        kb([[BTN('➕ افزودن گروهی بعدی', `camA:${a1}`)], [BTN('👑 ادمین های چنل', `admC:${a1}`)]]));
      return answerCb(env, cb.id, okN === res.length ? L(`✅ ${okN} نفر ادمین شدند`, `✅ ${okN} people became admins`) : L(`⚠️ ${okN} موفق ، ${res.length - okN} ناموفق`, `⚠️ ${okN} succeeded, ${res.length - okN} failed`));
    }
    if (act === 'camX') {
      await clearPanelState(env, uid);
      const v = await camView(env, a1);
      if (v) await edit(env, msg.chat.id, msg.message_id, v.text, v.markup);
      return answerCb(env, cb.id, '❌ لغو شد');
    }
    if (act === 'camD') {
      const cu = parts[2] || '';
      await edit(env, msg.chat.id, msg.message_id,
        L(`<b>عزل ادمین چنل</b>\n👤 ${await userLabel(env, cu)}\n\nهمه دسترسی های ادمینی اش گرفته میشه ( بن نمیشه ) . مطمئنی ؟`,
          `⬇️ <b>Demote channel admin</b>\n👤 ${await userLabel(env, cu)}\n\nAll their admin rights will be revoked (no ban). Are you sure?`),
        kb([[BTN('✅ بله، عزلش کن', `camD2:${a1}:${cu}`, 'danger'), BTN('❌ انصراف', `admC:${a1}`)]]));
      return answerCb(env, cb.id);
    }
    if (act === 'camD2') {
      const cu = parts[2] || '';
      const r = await demoteAdmin(env, a1, cu);
      const v = await camView(env, a1);
      if (v) await edit(env, msg.chat.id, msg.message_id, v.text, v.markup);
      return answerCb(env, cb.id,
        r.ok ? L('✅ عزل شد — دسترسی های ادمینی گرفته شد' + (r.legacy ? ' (با ربات قبلی)' : ''),
                 '✅ Demoted — admin rights revoked' + (r.legacy ? ' (via the previous bot)' : ''))
             : '❌ ' + (r.description || L('عزل ناموفق بود', 'Demotion failed')),
        r.ok ? false : true);
    }

    /* ── 🛠 v2.2: ویرایش دسترسی یک ادمین چنل — لود وضعیت فعلی + ویرایشگر ── */
    if (act === 'camE') {
      const s = await getSettings(env, a1, true);
      if (!s) return answerCb(env, cb.id, '⚠️ این چنل دیگه ثبت نیست.', true);
      const cu = parts[2] || '';
      const m = await tg(env, 'getChatMember', { chat_id: a1, user_id: Number(cu) });
      if (!m.ok || !m.result || !m.result.status)
        return answerCb(env, cb.id, '⚠️ گرفتن وضعیت فعلی فرد ناموفق بود — دوباره تلاش کن.', true);
      if (m.result.status === 'creator') return answerCb(env, cb.id, '👑 مالک چنل قابل ویرایش نیست!', true);
      let r0 = camDefaults();
      if (m.result.status === 'administrator') {
        const rr = m.result;
        r0 = {};
        for (const k of CAM_ORDER) r0[k] = !!rr[CAM_OPTS[k].param];
      }
      const lab = await userLabel(env, cu);
      await setPanelState(env, uid, { t: 'camR', cid: a1, target: Number(cu), r: r0, edit: 1, nm: lab });
      await edit(env, msg.chat.id, msg.message_id,
        camRText({ target: Number(cu), cid: a1, edit: 1, nm: lab }), camRKB(a1, r0));
      return answerCb(env, cb.id, '⚙️ دسترسی ها را تغییر بده و « ✅ تأیید و ارتقا » را بزن', true);
    }

    return answerCb(env, cb.id, '⚠️ دکمه ناشناخته!');
  } catch (e) {
    console.error('callback', e && e.stack || e);
    return answerCb(env, cb.id, '⚠️ خطایی پیش اومد؛ دوباره تلاش کن.');
  }
}

/* ============================================================================
 *  اجرای قفل ها در چنل
 * ==========================================================================*/

/* ── 🔔 v2.4: هشدار فوری تغییر/ترک مالکیت چنل به مالک ربات ── */
async function alertOwnership(env, msg) {
  const owner = await getOwnerId(env);
  if (!owner) return;
  const ch = msg.chat || {};
  const nu = msg.chat_owner_changed && msg.chat_owner_changed.new_owner_user;
  const t = nu
    ? L(
        `<b>هشدار امنیتی — مالکیت چنل تغییر کرد !!</b>\n\n` +
        `چنل : <b>${esc(ch.title || '')}</b>\n` +
        `شناسه : <code>${ch.id || ''}</code>\n` +
        `مالک جدید : ${nu.username ? '@' + esc(nu.username) : esc([nu.first_name, nu.last_name].filter(Boolean).join(' ') || 'ناشناس')}\n` +
        `شناسه مالک جدید : <code>${nu.id || 'نامشخص'}</code>\n\n` +
        `اگه این تغییر کار خودت نبوده ، فوراً دسترسی ادمین های چنل رو بازبینی کن و موارد مشکوک رو عزل کن .`,
        `👑🚨 <b>Security alert — channel ownership changed!</b>\n\n` +
        `📺 Channel: <b>${esc(ch.title || '')}</b>\n` +
        `🆔 ID: <code>${ch.id || ''}</code>\n` +
        `👤 New owner: ${nu.username ? '@' + esc(nu.username) : esc([nu.first_name, nu.last_name].filter(Boolean).join(' ') || 'unknown')}\n` +
        `🆔 New owner ID: <code>${nu.id || 'unknown'}</code>\n\n` +
        `💡 If this wasn't you, review the channel's admin permissions immediately and remove anything suspicious.`)
    : L(
        `<b>هشدار امنیتی — مالک قبلی چنل رو ترک کرد !!</b>\n\n` +
        `چنل : <b>${esc(ch.title || '')}</b>\n` +
        `شناسه : <code>${ch.id || ''}</code>\n\n` +
        `مالکیت باید به فرد دیگری برسه ؛ وگرنه مدیریت چنل بی سرپرست میمونه .`,
        `👑🚨 <b>Security alert — the channel owner left!</b>\n\n` +
        `📺 Channel: <b>${esc(ch.title || '')}</b>\n` +
        `🆔 ID: <code>${ch.id || ''}</code>\n\n` +
        `💡 Ownership must be transferred to someone else; otherwise the channel is left without an owner.`);
  await send(env, owner, t).catch(() => {});
}

async function handleChannelPost(u, env, ctx) {
  const isEdit = !!u.edited_channel_post;
  const msg = isEdit ? u.edited_channel_post : u.channel_post;
  if (!msg || !msg.chat || msg.chat.type !== 'channel') return;
  const cid = String(msg.chat.id);

  // ⚡️ v1.8: پیام های سیستمی قبل از هر خواندن KV فیلتر میشوند (صرفه جویی در خواندن)
  const a = analyze(msg);
  // 🔔 v2.4 — تغییر/ترک مالکیت چنل: هشدار فوری به مالک ربات (قبل از خواندن KV چنل)
  if (a.ownerAlert) return alertOwnership(env, msg);
  if (a.isService) return;

  const s = await getSettings(env, cid);
  if (!s) return; // چنل ثبت نشده ⇒ هیچ کاری نکن
  if (s.active === false) return; // چنل هنوز از سوی مالک فعال نشده ⇒ هیچ اجرایی

  // 🧹 v2.7: هر پست جدید در حلقه « پیام های اخیر » ثبت میشود (برای حذف دسته ای)
  if (!isEdit) trackMsg(env, ctx, cid, msg.message_id);

  // 🧩 v2.4 — پست های آلبوم/اسلایدشو برای « حذف کل آلبوم » ثبت میشوند (قبل از تصمیم گیری)
  if (a.album && !isEdit) albumRemember(cid, a.album, msg.message_id);

  const reason = matchViolation(s, msg, a, isEdit);
  if (!reason) return;

  // 🟡🔴 v1.8: ادیتِ پستِ مدیادار با وضعیت زرد/قرمز ⇒ پاک + عزل (+بن در قرمز)
  if (isEdit && a.media && (s.punishMode === 'yellow' || s.punishMode === 'red')) {
    await redEnforce(env, ctx, cid, s, msg, a, reason);
    return;
  }

  await enforce(env, ctx, cid, s, msg, a, reason, isEdit);
}

async function handleMyChatMember(mcm, env) {
  const chat = mcm.chat;
  if (!chat || chat.type !== 'channel') return;
  const cid = String(chat.id);
  const st = mcm.new_chat_member && mcm.new_chat_member.status;
  const owner = await getOwnerId(env);

  if (st === 'administrator') {
    const existing = await getSettings(env, cid, true);
    if (existing) {
      existing.title = chat.title || existing.title;
      existing.username = chat.username || '';
      await saveSettings(env, cid, existing);
      if (existing.active === false) {
        if (owner) {
          // قبلاً ثبت شده اما هنوز فعال نشده (یا غیرفعال شده) ⇒ دوباره درخواست تأیید
          await send(env, owner,
            L(`<b>ربات تو چنل ادمین شد</b>\n\nچنل : <b>${esc(chat.title)}</b>\nشناسه : <code>${cid}</code>\n\nاین چنل هنوز فعال نیست ؛ تا فعال سازی هیچ قفلی تو چنل اجرا نمیشه :`,
              `<b>The bot became an admin in a channel</b>\n\nChannel: <b>${esc(chat.title)}</b>\nID: <code>${cid}</code>\n\nThis channel is not active yet — until activation, no lock is enforced:`),
            kb([[BTN('فعال سازی این چنل', `enb:${cid}`, 'success'), BTN('رد کردن', `rej:${cid}`, 'danger')]]));
        }
      } else if (owner) {
        await send(env, owner,
          L(`<b>ربات دوباره تو چنل ادمین شد</b>\n\nچنل : <b>${esc(chat.title)}</b>\nشناسه : <code>${cid}</code>\n\nاین چنل فعاله و قفل ها مثل قبل اجرا میشن .`,
            `<b>The bot became a channel admin again</b>\n\nChannel: <b>${esc(chat.title)}</b>\nID: <code>${cid}</code>\n\nThis channel is active and the locks keep working as before.`),
          kb([[BTN(`${L('مدیریت ', 'Manage ')}${(chat.title || '').slice(0, 24)}`, `chat:${cid}`)]]));
      }
    } else {
      await saveSettings(env, cid, defaultSettings(chat));
      if (owner) {
        await send(env, owner,
          L(`<b>ربات تو چنل ادمین شد</b>\n\nچنل : <b>${esc(chat.title)}</b>\nشناسه : <code>${cid}</code>\n\nتا وقتی خودت فعال سازی نکنی هیچ قفلی تو این چنل اجرا نمیشه . ربات چندچنله ست ؛ هر چنل جداگانه فعال میشه و همه همزمان میمونن :`,
            `<b>The bot became an admin in a channel</b>\n\nChannel: <b>${esc(chat.title)}</b>\nID: <code>${cid}</code>\n\nUntil you activate it yourself, no lock is enforced in this channel. The bot is multi-channel — each channel is activated separately and they all stay active together:`),
          kb([[BTN('فعال سازی این چنل', `enb:${cid}`, 'success'), BTN('رد کردن', `rej:${cid}`, 'danger')]]));
      }
    }
  } else if (st === 'kicked' || st === 'left') {
    await env.KV.delete('chat:' + cid);
    await env.KV.delete('stat:' + cid);
    await env.KV.delete('vlog:' + cid);
    await env.KV.delete('msgs:' + cid);
    pendVlog.delete(cid);
    pendMsgs.delete(cid); pendMsgsTimer.delete(cid);
    scache.delete('chat:' + cid);
    if (owner) {
      await send(env, owner,
        L(`<b>ربات از چنل حذف شد</b>\n\nچنل : <b>${esc(chat.title)}</b>\nشناسه : <code>${cid}</code>`,
          `<b>The bot was removed from a channel</b>\n\nChannel: <b>${esc(chat.title)}</b>\nID: <code>${cid}</code>`));
    }
  }
}

/* ============================================================================
 *  روتر اصلی + ورودی Worker
 * ==========================================================================*/

/* ── 📣 v2.5: تیکِ هر دقیقه کرون — تشخیص شروع/پایان بازه قفل زمان دار + اعلان یک باره ──
 * همه چنل های فعال را چک میکند؛ فقط در « لحظه تغییر » (ورود/خروج از بازه) اعلان
 * میدهد و KV مینویسد — یعنی در روز عادی حداکثر ۲ نوشتن برای هر چنل. */
async function schedTick(env) {
  let page;
  try { page = await env.KV.list({ prefix: 'chat:' }); } catch (e) { return; }
  for (const k of (page && page.keys) || []) {
    const cid = k.name.slice(5);
    if (!cid) continue;
    let s = null;
    try { s = await getSettings(env, cid, true); } catch (e) { continue; }
    if (!s || !s.active) continue;
    const st = await getSchedState(env, cid);
    const sc = s.schedule;
    if (!sc || !sc.enabled) {
      // اگر با تغییر تنظیمات (مثلاً بازگردانی بکاپ) قفلِ داخل-بازه خاموش شد، پایانش را اعلام کن
      if (st && st.in) {
        CUR_LANG = await langGlobal(env);
        await putSchedState(env, cid, false);
        if (s.ann !== false) await announceChannel(env, cid, schedEndText(s, cid));
      }
      continue;
    }
    const inWin = winActive(sc.start | 0, sc.end | 0, tehranMinutes());
    if (!st) { await putSchedState(env, cid, inWin); continue; } // اولین اجرا: فقط ثبت — بدون اعلان
    if (inWin && !st.in) {
      CUR_LANG = await langGlobal(env);
      await putSchedState(env, cid, true);
      if (s.ann !== false) await announceChannel(env, cid, schedStartText(s, cid));
    } else if (!inWin && st.in) {
      CUR_LANG = await langGlobal(env);
      await putSchedState(env, cid, false);
      if (s.ann !== false) await announceChannel(env, cid, schedEndText(s, cid));
    }
  }
}

async function routeUpdate(u, env, ctx) {
  // 🆕 v2.4 — تایپ های آپدیتِ جدید تلگرام (subscription, managed_bot, guest_message, stopped_message_generation, …)
  // بی صدا و صفر-هزینه رد میشوند (حتی خواندن KV زبان هم انجام نمیشود)
  if (!(u.message || u.channel_post || u.edited_channel_post || u.callback_query || u.my_chat_member)) return;
  // 📣 v3.0 — ثبت خودکار مخاطبین ( گروه/پیوی ) برای مقصد پیام همگانی
  const audChat = (u.message && u.message.chat) || (u.my_chat_member && u.my_chat_member.chat) || null;
  if (audChat) ctx.waitUntil(recordAud(env, audChat).catch(() => {}));
  // 🌐 v2.3 — زبان همین آپدیت: پیوی/دکمه ها = زبان خود کاربر؛ چنل/گزارش = زبان پیش فرض ربات
  if (u.callback_query && u.callback_query.from) CUR_LANG = await langOfUser(env, u.callback_query.from.id);
  else if (u.message && u.message.from) CUR_LANG = await langOfUser(env, u.message.from.id);
  else CUR_LANG = await langGlobal(env);
  if (u.callback_query) return handleCallback(u.callback_query, env, ctx);
  if (u.message) return handlePrivate(u.message, env, ctx);
  if (u.channel_post || u.edited_channel_post) return handleChannelPost(u, env, ctx);
  if (u.my_chat_member) return handleMyChatMember(u.my_chat_member, env);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      // ── 🤖 اندپوینت های یوزربات (v1.6) — محافظت شده با WEBHOOK_SECRET ──
      const ub = url.searchParams.get('ub');
      if (ub) {
        if (!env.WEBHOOK_SECRET || url.searchParams.get('secret') !== env.WEBHOOK_SECRET) {
          return new Response('forbidden', { status: 403 });
        }
        if (ub === 'poll') {
          // یوزربات صف را برمی دارد (هر job فقط یک بار تحویل داده میشود)
          const jobs = await takeUserbotJobs(env);
          return new Response(JSON.stringify({ jobs }), { headers: { 'content-type': 'application/json' } });
        }
        if (ub === 'result') {
          // یوزربات نتیجه حذف ها را برمی گرداند: {secret, results: [{i,c,m,ok,err}]}
          let body = null;
          try { body = await request.json(); } catch (e) { body = null; }
          const results = body && Array.isArray(body.results) ? body.results : [];
          ctx.waitUntil(processUserbotResults(env, ctx, results));
          return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ ok: false, error: 'unknown op' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      if (request.method !== 'POST') {
        const setupKey = url.searchParams.get('setup');
        // ── ?setup=<WEBHOOK_SECRET> → راه اندازی خودکار وب هوک ──
        if (setupKey !== null) {
          if (!env.WEBHOOK_SECRET || setupKey !== env.WEBHOOK_SECRET) {
            return new Response('کلید setup اشتباهه.', { status: 403 });
          }
          if (!env.BOT_TOKEN) {
            return new Response('اول BOT_TOKEN رو تو تنظیمات ورکر (Variables and Secrets) ست کن، بعد دوباره این آدرس رو باز کن.', { status: 400 });
          }
          const r = await tg(env, 'setWebhook', {
            url: url.origin + '/webhook',
            secret_token: env.WEBHOOK_SECRET,
            max_connections: 40,
            drop_pending_updates: true,
            // ⚡️ v1.5: edited_message هیچ جا استفاده نمیشود ⇒ از تلگرام درخواست نمیشود (وب هوک سبک تر)
            allowed_updates: ['message', 'callback_query',
              'channel_post', 'edited_channel_post', 'my_chat_member'],
          });
          return new Response(r.ok
            ? '✅ وب هوک وصل شد: ' + url.origin + '/webhook'
            : '❌ خطا در ست کردن وب هوک: ' + (r.description || 'نامشخص'),
            { status: r.ok ? 200 : 500 });
        }
        const status = !env.BOT_TOKEN
          ? 'ربات ضد خیانت کانال دیپلوی شده؛ اما BOT_TOKEN هنوز ست نشده.'
          : 'anti-treason bot v3.0 (fully interactive: hour+minute picker grids, presets and confirm cards for scheduled locks, destination picker for broadcast — channels/groups/DMs with auto-registered audience, auto-cleanup of setup messages and result cards everywhere, batch delete with follow-up buttons, guided flows + previous-bot fallback for demotions/bans + command menu + post-to-channel + bold lock announcements + Bot API 10.x + bilingual fa/en + multi-channel + scoped admins)';
        return new Response(status, { status: 200 });
      }
      const secret = env.WEBHOOK_SECRET;
      if (secret && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) {
        console.error('bad secret token');
        return new Response('forbidden', { status: 403 });
      }
      let u = null;
      try { u = await request.json(); } catch (e) { return new Response('ok'); }
      if (u && typeof u.update_id === 'number' && !isDup(u.update_id)) {
        await routeUpdate(u, env, ctx);
      }
      return new Response('ok');
    } catch (e) {
      console.error('FATAL', e && e.stack || e);
      return new Response('ok'); // همیشه ۲۰۰ تا تلگرام بی نهایت ریتری نکنه
    }
  },

  // 📣 v2.5 — کرونِ هر دقیقه: اعلان خودکار شروع/پایان قفل زمان دار در خودِ چنل
  async scheduled(controller, env, ctx) {
    try { await schedTick(env); } catch (e) { console.error('schedTick', e && e.stack || e); }
  },
};


