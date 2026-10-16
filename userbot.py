#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🤖 یوزرباتِ همراه «ربات ضد خیانت کانال» — نسخه ۱.۰
================================================================
این اسکریپت با **اکانت تلگرام خودت** (که محدودیت ۴۸ ساعتهٔ حذف ندارد)
پیام‌هایی را که ربات روی Cloudflare نمی‌تواند حذف کند، حذف می‌کند.

جریان کار:
  ۱) ربات، پیام‌های قدیمی‌تر از ۴۸ ساعت را در صف (KV کلادفلر) می‌گذارد
  ۲) این اسکریپت هر چند ثانیه صف را از ورکر می‌کشد (?ub=poll)
  ۳) با اکانت تو (باید ادمین کانال باشد) حذفشان می‌کند
  ۴) نتیجه را به ورکر برمی‌گرداند (?ub=result) → گزارش به پیوی مالک

نصب و اجرا (خلاصه):
  pip install telethon
  # فایل userbot.env را کنار همین اسکریپت بساز:
  #   WORKER_URL=https://anti-treason-bot.<YOUR-SUBDOMAIN>.workers.dev
  #   SECRET=<همان WEBHOOK_SECRET ورکر>
  #   API_ID=1234567          ← از my.telegram.org (API development tools)
  #   API_HASH=abcd...        ← از همان‌جا
  #   POLL_SECS=10            ← اختیاری
  python3 userbot.py
  # اولین بار: شماره‌ات (+98...)، کدی که تلگرام می‌فرستد، و رمز دوم (اگر داری) می‌پرسد
  # بعد از اولین ورود، نشست در فایل anti-treason-ub.session ذخیره می‌شود و دیگر سؤال نمی‌کند

⚠️ ریسک: تلگرام با اکانت‌های خودکار سخت‌گیرتر است. این اسکریپت فقط درخواستِ
   حذفِ تخلف اجرا می‌کند (حجم خیلی کم) و شماره‌ای جز خودت را لمس نمی‌کند،
   ولی مسئولیت استفاده با خودت است. اکانت باید ادمین کانال بماند.
"""

import asyncio
import json
import os
import sys
import urllib.request

try:
    from telethon import TelegramClient, errors
except ImportError:
    print('❌ اول Telethon را نصب کن:  pip install telethon')
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
SESSION_PATH = os.path.join(BASE, 'anti-treason-ub')

# ── خواندن تنظیمات: اول متغیر محیطی، بعد فایل userbot.env ──────────────────
def load_env_file():
    path = os.path.join(BASE, 'userbot.env')
    vals = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals

_FILE = load_env_file()
def cfg(key, default=''):
    return os.environ.get(key) or _FILE.get(key) or default

WORKER_URL = cfg('WORKER_URL').rstrip('/')
SECRET = cfg('SECRET')
API_ID = cfg('API_ID')
API_HASH = cfg('API_HASH')
try:
    POLL_SECS = max(5, int(cfg('POLL_SECS', '10')))
except ValueError:
    POLL_SECS = 10

missing = [k for k, v in [('WORKER_URL', WORKER_URL), ('SECRET', SECRET),
                          ('API_ID', API_ID), ('API_HASH', API_HASH)] if not v]
if missing:
    print('❌ این تنظیم‌ها را ست نکرده‌ای: ' + ', '.join(missing))
    print('   یا متغیر محیطی، یا فایل userbot.env کنار همین اسکریپت (نمونه داخل README).')
    sys.exit(1)

client = TelegramClient(SESSION_PATH, int(API_ID), API_HASH)

# ── HTTP (stdlib؛ بدون وابستگی اضافه) ────────────────────────────────────────
def http_get_json(url, timeout=30):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))

def http_post_json(url, payload, timeout=30):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data,
                                 headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        r.read()

def poll_jobs():
    return http_get_json(f'{WORKER_URL}/?ub=poll&secret={SECRET}', timeout=30).get('jobs', [])

def post_results(results):
    http_post_json(f'{WORKER_URL}/?ub=result&secret={SECRET}',
                   {'secret': SECRET, 'results': results}, timeout=30)

# ── حذف با اکانت ─────────────────────────────────────────────────────────────
_dialog_cache = {}

async def resolve_entity(cid: int):
    """از کش؛ اگر نبود، یک‌بار دیالوگ‌های اکانت را اسکن و کش می‌کند."""
    if cid in _dialog_cache:
        return _dialog_cache[cid]
    async for d in client.iter_dialogs():
        _dialog_cache[d.id] = d.input_entity
    ent = _dialog_cache.get(cid)
    if ent is None:
        try:
            ent = await client.get_input_entity(cid)  # آخرین تلاش از نشست
        except Exception:
            ent = None
    return ent

async def delete_one(job):
    cid = int(str(job.get('c', '')).strip())
    mid = int(str(job.get('m', '')).strip())
    try:
        entity = await resolve_entity(cid)
        if entity is None:
            return False, 'کانال در دیالوگ‌های اکانت پیدا نشد — اکانت باید عضو/ادمین کانال باشد (یک‌بار بعد از ورود، کانال را در لیست اکانت ببینید)'
        await client.delete_messages(entity, [mid])
        return True, ''
    except errors.MessageDeleteForbiddenError:
        return False, 'تلگرام اجازهٔ حذف نداد (دسترسی اکانت؟)'
    except errors.FloodWaitError as e:
        print(f'   ⏳ FloodWait: {e.seconds}s صبر می‌کنم…')
        await asyncio.sleep(min(e.seconds, 600) + 1)
        return False, f'flood-wait {e.seconds}s'
    except errors.RPCError as e:
        return False, str(e)[:140]
    except Exception as e:
        return False, str(e)[:140]

# ── حلقهٔ اصلی ────────────────────────────────────────────────────────────────
async def main():
    print('🔑 در حال ورود… (اولین بار: شماره +98…، کد تلگرام و در صورت داشتن، رمز دوم می‌پرسد)')
    await client.start()
    me = await client.get_me()
    print(f'✅ وارد شدم: {me.first_name or ""} (@{me.username}) — id={me.id}')
    print(f'🛡️ یوزربات ضد خیانت فعال شد — polling {WORKER_URL} هر {POLL_SECS} ثانیه (Ctrl+C = خروج)')
    # گرم‌کردن کش دیالوگ‌ها (برای رزولو سریع کانال‌های خصوصی)
    try:
        async for _ in client.iter_dialogs():
            pass
        print(f'📚 {_dialog_cache.__len__()} دیالوگ کش شد')
    except Exception as e:
        print('⚠️ کش دیالوگ‌ها ناموفق (ادامه می‌دهم):', str(e)[:120])

    while True:
        try:
            jobs = poll_jobs()
            if jobs:
                print(f'📥 {len(jobs)} درخواست حذف از صف برداشته شد')
                results = []
                for j in jobs:
                    ok, err = await delete_one(j)
                    mark = '🗑 حذف شد' if ok else f'⚠️ حذف نشد ({err})'
                    print(f"   • کانال {j.get('c')} پیام {j.get('m')} → {mark}")
                    results.append({'i': j.get('i'), 'c': j.get('c'),
                                    'm': j.get('m'), 'ok': ok, 'err': err})
                post_results(results)
                print(f'📤 نتیجهٔ {len(results)} مورد به ورکر برگشت')
        except Exception as e:
            print('⚠️ خطا در چرخه (ادامه می‌دهم):', str(e)[:160])
        await asyncio.sleep(POLL_SECS)

if __name__ == '__main__':
    with client:
        try:
            client.loop.run_until_complete(main())
        except (KeyboardInterrupt, SystemExit):
            print('\n👋 یوزربات خاموش شد. (ربات روی Cloudflare همچنان فعال است)')
