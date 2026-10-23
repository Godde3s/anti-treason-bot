#!/usr/bin/env bash
# ============================================================================
# 🚀 دیپلوی خودکار «ربات ضد خیانت کانال» روی Cloudflare Workers (پلن رایگان)
# ----------------------------------------------------------------------------
# پیش‌نیاز: فقط curl و node  (نیازی به wrangler/npm نیست!)
#
# استفاده:
#   CLOUDFLARE_API_TOKEN=xxxx  bash scripts/deploy.sh
#
# اختیاری (وقتی توکن به چند اکانت دسترسی دارد):
#   CLOUDFLARE_ACCOUNT_ID=yyyy  CLOUDFLARE_API_TOKEN=xxxx  bash scripts/deploy.sh
#
# 📌 اعتبارنامه‌ها (اختیاری):
#    اگر فایل bot-credentials.txt کنار همین اسکریپت باشد (یا BOT_TOKEN/OWNER_ID
#    به‌عنوان متغیر محیطی بدهید)، خودکار به‌عنوان Secret روی ورکر ست می‌شوند و
#    وب‌هوک هم خودکار وصل می‌شود — یعنی هیچ قدم دستی باقی نمی‌ماند!
#    فایل باید این شکلی باشد:
#      BOT_TOKEN=123456:ABC...
#      OWNER_ID=123456789
#    ⚠️ اگر هیچ‌کدام داده نشود: بعد از دیپلوی خودتان در داشبورد از نوع Secret
#    اضافه کنید و بعد آدرس ?setup= را در مرورگر باز کنید.
#    (فایل bot-credentials.txt هرگز وارد zip نمی‌شود — آن را محرم نگه دارید.)
# ============================================================================
set -euo pipefail

API="https://api.cloudflare.com/client/v4"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="anti-treason-bot"

# ── ابزارهای کمکی ──
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
good() { echo "✅ $*"; }
die()  { printf '\n\033[1;31m❌ %s\033[0m\n' "$*" >&2; exit 1; }

TOKEN_CHECK="${CLOUDFLARE_API_TOKEN:-}"
[ -n "$TOKEN_CHECK" ] || die "متغیر CLOUDFLARE_API_TOKEN ست نشده. مثال:  CLOUDFLARE_API_TOKEN=xxxx bash scripts/deploy.sh"

cfget()  { curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$@"; }
cfpost() { curl -sS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" "$@"; }

# jget 'path.to.field'  — فیلد JSON را از stdin استخراج می‌کند؛ مثال:  echo "$X" | jget result.id
jget() { node -e '
let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
  let j;try{j=JSON.parse(d)}catch(e){console.error("BADJSON:"+d.slice(0,300));process.exit(2)}
  const v=process.argv[1].split(".").reduce((o,k)=>o==null?undefined:o[k],j);
  console.log(v===undefined||v===null?"":(typeof v==="object"?JSON.stringify(v):String(v)));
})' "$1"; }

[ -f "$DIR/worker.js" ] || die "worker.js کنار همین اسکریپت پیدا نشد."

step "۱/۶ — بررسی اعتبار توکن Cloudflare"
V=$(cfget "$API/user/tokens/verify")
[ "$(echo "$V" | jget success)" = "true" ] || die "توکن نامعتبر است یا دسترسی ندارد: $V"
good "توکن معتبر است."

step "۲/۶ — پیدا کردن اکانت"
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ACC="$CLOUDFLARE_ACCOUNT_ID"
else
  ACC=$(cfget "$API/accounts" | jget result.0.id) || die "لیست اکانت‌ها گرفته نشد (توکن باید حداقل Account Settings:Read داشته باشد)."
  [ -n "$ACC" ] || die "هیچ اکانتی برای این توکن پیدا نشد."
  N=$(cfget "$API/accounts" | jget result.length 2>/dev/null || echo 1)
  if [ "${N:-1}" != "1" ]; then
    echo "⚠️  این توکن به $N اکانت دسترسی دارد؛ از اولی استفاده می‌شود ($ACC)."
    echo "    برای انتخاب دقیق:  CLOUDFLARE_ACCOUNT_ID=... bash scripts/deploy.sh"
  fi
fi
good "Account ID: $ACC"

step "۳/۶ — ساخت/پیدا کردن فضای KV (anti-treason-kv)"
NSLIST=$(cfget "$API/accounts/$ACC/storage/kv/namespaces")
NS=$(node -e '
let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{
  try{const a=JSON.parse(d).result||[];const n=a.find(x=>x.title==="anti-treason-kv");console.log(n?n.id:"")}
  catch(e){console.log("")}
})' <<<"$NSLIST")
if [ -z "$NS" ]; then
  NS=$(cfpost -d '{"title":"anti-treason-kv"}' "$API/accounts/$ACC/storage/kv/namespaces" | jget result.id) || true
  [ -n "$NS" ] || die "ساخت فضای KV ناموفق بود (دسترسی Workers KV Storage:Edit لازم است)."
  good "فضای KV ساخته شد: $NS"
else
  good "فضای KV از قبل وجود داشت: $NS"
fi

step "۴/۶ — آماده‌سازی wrangler.toml + ساخت WEBHOOK_SECRET"
SECRET=$(node "$DIR/scripts/patch-wrangler.mjs" "$ACC" "$NS")
good "WEBHOOK_SECRET: $SECRET"
echo "   (در فایل webhook-secret.txt هم ذخیره شد — نگهش دارید)"

step "۵/۶ — آپلود ورکر (مستقیم با REST API)"
# ── اعتبارنامه‌ها: اولویت متغیر محیطی > فایل bot-credentials.txt ──
CRED_FILE="$DIR/bot-credentials.txt"
if [ -z "${BOT_TOKEN:-}" ] && [ -f "$CRED_FILE" ]; then
  BOT_TOKEN=$(sed -n 's/^\s*BOT_TOKEN=//p' "$CRED_FILE" | head -1 | tr -d '[:space:]')
  OWNER_ID=$(sed -n 's/^\s*OWNER_ID=//p' "$CRED_FILE" | head -1 | tr -d '[:space:]')
  [ -n "$BOT_TOKEN" ] && echo "ℹ️  BOT_TOKEN/OWNER_ID از bot-credentials.txt خوانده شد و به‌عنوان Secret ست می‌شود."
fi
# 🤝 v2.8 — توکن «ربات قبلی» (اختیاری): برای عزل/بن ادمین‌هایی که همان ربات ساخته بود
if [ -z "${LEGACY_BOT_TOKEN:-}" ] && [ -f "$CRED_FILE" ]; then
  LEGACY_BOT_TOKEN=$(sed -n 's/^\s*LEGACY_BOT_TOKEN=//p' "$CRED_FILE" | head -1 | tr -d '[:space:]')
  [ -n "$LEGACY_BOT_TOKEN" ] && echo "ℹ️  LEGACY_BOT_TOKEN (ربات قبلی) هم به‌عنوان Secret ست می‌شود."
fi
# 🛡 v3.0 — گارد حفظ Secret ها: PUT متادیتا همهٔ binding ها را جایگزین میکند؛
# اگر Secret ای روی ورکر فعلی هست ولی مقدارش الان در دسترس نیست، میترکد و حذف میشود.
# پس قبل از آپلود چک میکنیم: هر Secret موجود باید مقدار تازه داشته باشد (یا رفع قفل صریح).
PREV_BIND=$(cfget "$API/accounts/$ACC/workers/scripts/$NAME/settings" 2>/dev/null || echo '')
for SNAME in BOT_TOKEN OWNER_ID LEGACY_BOT_TOKEN; do
  if echo "$PREV_BIND" | grep -q "\"name\":\"$SNAME\""; then
    case "$SNAME" in
      BOT_TOKEN) CURVAL="${BOT_TOKEN:-}" ;;
      OWNER_ID)  CURVAL="${OWNER_ID:-}" ;;
      LEGACY_BOT_TOKEN) CURVAL="${LEGACY_BOT_TOKEN:-}" ;;
    esac
    if [ -z "$CURVAL" ] && [ "${DROP_MISSING_SECRETS:-}" != "1" ]; then
      die "Secret « $SNAME » روی ورکر فعلی هست ولی مقدار جدیدش داده نشده — با این دیپلوی حذف میشد .
        مقدارش را در bot-credentials.txt ( خط $SNAME=... ) بگذار و دوباره اجرا کن .
        ( توکن ربات قبلی برای عزل ادمین هایی که خودش ساخته بود لازم است ؛ از @BotFather قابل بازیابی است )
        اگر واقعا میخواهی حذف شود:  DROP_MISSING_SECRETS=1  به دستور اضافه کن ."
    fi
  fi
done

META=$(node -e '
const [,ns,sec,bt,oid,lt]=process.argv;
const bindings=[
  {type:"kv_namespace",name:"KV",namespace_id:ns},
  {type:"plain_text",name:"WEBHOOK_SECRET",text:sec}
];
if (bt) bindings.push({type:"secret_text",name:"BOT_TOKEN",text:bt});
if (oid) bindings.push({type:"secret_text",name:"OWNER_ID",text:oid});
if (lt) bindings.push({type:"secret_text",name:"LEGACY_BOT_TOKEN",text:lt});
console.log(JSON.stringify({main_module:"worker.js",compatibility_date:"2025-01-01",bindings}))
' "$NS" "$SECRET" "${BOT_TOKEN:-}" "${OWNER_ID:-}" "${LEGACY_BOT_TOKEN:-}")
UP=$(curl -sS -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "metadata=${META};type=application/json" \
  -F "worker.js=@${DIR}/worker.js;type=application/javascript+module" \
  "$API/accounts/$ACC/workers/scripts/$NAME")
[ "$(echo "$UP" | jget success)" = "true" ] || die "آپلود ورکر ناموفق بود: $UP"
good "ورکر آپلود شد (کد + اتصال KV + WEBHOOK_SECRET)."

step "۶/۷ — فعال‌سازی آدرس workers.dev"
SUB=$(cfget "$API/accounts/$ACC/workers/subdomain" | jget result.subdomain || true)
if [ -z "$SUB" ]; then
  RSUB="atb-$(node -e 'console.log(require("crypto").randomBytes(4).toString("hex"))')"
  SUB=$(cfpost -d "{\"subdomain\":\"$RSUB\"}" "$API/accounts/$ACC/workers/subdomain" | jget result.subdomain || true)
fi
[ -n "$SUB" ] || die "ساب‌دامین workers.dev پیدا/ساخته نشد."
cfpost -d '{"enabled":true,"previews_enabled":false}' "$API/accounts/$ACC/workers/scripts/$NAME/subdomain" > /dev/null 2>&1 || true
URL="https://$NAME.$SUB.workers.dev"
good "آدرس ورکر: $URL"

step "۷/۷ — ثبت زمان‌بندی دقیقه‌ای کرون (اعلان شروع/پایان قفل زمان‌دار — v2.5)"
CRON_R=$(curl -sS -X PUT -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"cron":"* * * * *"}]' \
  "$API/accounts/$ACC/workers/scripts/$NAME/schedules")
if [ "$(echo "$CRON_R" | jget success)" = "true" ]; then
  good "کرون هر دقیقه ثبت شد — اعلان شروع/پایان قفل زمان‌دار فعال است."
else
  echo "⚠️  ثبت کرون ناموفق بود (غیربحرانی — اعلان‌های دستی قفل آنی کار می‌کنند): $CRON_R"
fi

# ── اگر BOT_TOKEN داشتیم: ذخیره در فایل (برای ردیپلوی‌های بعدی) + وصل‌کردن خودکار وب‌هوک ──
if [ -n "${BOT_TOKEN:-}" ]; then
  mkdir -p "$DIR"
  {
    printf 'BOT_TOKEN=%s\n' "$BOT_TOKEN"
    [ -n "${OWNER_ID:-}" ] && printf 'OWNER_ID=%s\n' "$OWNER_ID"
    [ -n "${LEGACY_BOT_TOKEN:-}" ] && printf 'LEGACY_BOT_TOKEN=%s\n' "$LEGACY_BOT_TOKEN"
  } > "$CRED_FILE"
  chmod 600 "$CRED_FILE"
  SETUP_R=$(curl -sS "$URL/?setup=$SECRET" || true)
  case "$SETUP_R" in
    *\xe2\x9c\x85*|*"وب هوک وصل شد"*) good "وب‌هوک خودکار وصل شد ✓" ;;
    *) echo "⚠️  وصل‌کردن خودکار وب‌هوک ناموفق بود — بعداً این آدرس را باز کنید: $URL/?setup=$SECRET" ;;
  esac
fi

cat <<EOF

🎉━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🎉

   دیپلوی کامل شد!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🌐 آدرس ورکر:      $URL
 🔑 WEBHOOK_SECRET: $SECRET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

if [ -n "${BOT_TOKEN:-}" ]; then
cat <<EOF
 🎯 همه‌چیز خودکار انجام شد! فقط ربات را ادمین کانال کنید (دسترسی «حذف پیام»).
EOF
else
cat <<EOF
 📌 فقط ۲ قدم مانده (خودتان انجام دهید):

 ۱) داشبورد Cloudflare → Workers & Pages → $NAME →
    Settings → Variables and Secrets → Add
    (هر دو را از نوع «Secret» بسازید تا در دیپلوی‌های بعدی پاک نشوند):
       BOT_TOKEN = توکن ربات از @BotFather
       OWNER_ID  = شناسه عددی خودتان (اختیاری ولی توصیه‌شده)

 ۲) بعد از ست‌کردن توکن، این آدرس را در مرورگر باز کنید تا
    وب‌هوک خودکار وصل شود:
       $URL/?setup=$SECRET
EOF
fi

cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 🔒 امنیت: بعد از اتمام کار می‌توانید توکن Cloudflare را از
    My Profile → API Tokens حذف یا Roll کنید.
🎉━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━🎉
EOF
