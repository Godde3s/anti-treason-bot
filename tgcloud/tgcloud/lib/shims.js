// شیم‌های ران‌تایم tgcloud — ایزوله نه تایمر دارد، نه AbortController.
// این فایل فقط کمبودهای سراسری را پر می‌کند؛ منطق ربات را عوض نمی‌کند.
if (typeof globalThis.setTimeout === 'undefined') {
  globalThis.setTimeout = (fn, ms) => {
    const delay = Number(ms) || 0;
    if (delay > 0 && delay <= 1000) {
      // تاخیرهای کوتاه (مثلاً ۱۵۰ میلی‌ثانیه بین مقصدهای برادکست) با چرخش
      // کوتاه روی Date.now حفظ می‌شوند — همان فاصله زمانی، بدون تایمر.
      const end = Date.now() + delay;
      while (Date.now() < end) { /* spin */ }
    }
    // تاخیرهای بلند (تایمرهای فلاش ۳ دقیقه‌ای) فوراً اجرا می‌شوند: آداپتور
    // همه کارهای پس‌زمینه را تا پایان همین فراخوانی await می‌کند، پس فلاش
    // همان‌جا روی دیسک می‌نشیند و بافر درون‌حافظه‌ای گم نمی‌شود.
    try { fn(); } catch (e) { /* خطا از مسیر promise پخش می‌شود */ }
    return 0;
  };
}
if (typeof globalThis.clearTimeout === 'undefined') {
  globalThis.clearTimeout = () => {};
}
if (typeof globalThis.AbortController === 'undefined') {
  // فقط برای اینکه کد بیدارکردن یوزربات (signal/ac.abort) نترکد؛
  // تایم‌اوت واقعی ندارد و fetch بدون signal اجرا می‌شود.
  globalThis.AbortController = class {
    constructor() { this.signal = undefined; }
    abort() {}
  };
}
