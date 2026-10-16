# 🛡️ Anti-Treason Bot — Telegram Channel Guard

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Godde3s/anti-treason-bot"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" /></a>
  <a href="README-FA.md"><img src="https://img.shields.io/badge/مستندات-فارسی-0ea5e9?style=for-the-badge" alt="Persian docs" /></a>
  <img src="https://img.shields.io/badge/tests-352%2F352_passing-22c55e?style=for-the-badge" alt="tests" />
  <img src="https://img.shields.io/badge/runtime-Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="runtime" />
</p>

A self-hosted **anti-cheat guard for Telegram channels**, built as a single-file Cloudflare Worker with zero external dependencies. It catches edits and unauthorized posts within milliseconds — even if the message was sent days ago and edited *right now* (Telegram bots normally cannot touch anything older than 48 hours; this bot pairs with an optional userbot helper to close that gap).

Everything is managed from a clean Persian panel in the bot's private chat. No commands to memorize, no database to babysit — just a KV namespace.

> 🌐 Documentation is bilingual: **English (this file)** · [فارسی (README-FA.md)](README-FA.md)

---

## ✨ Highlights

| Feature | What it does |
|---|---|
| **Instant edit detection** | Any text/media caption edit is deleted in milliseconds — retro-editing spam does not survive |
| **20 independent locks** | Block edits, any post type (text, photo, video, GIF, sticker, voice, audio, file, poll, contact, location, dice…), forwards, links, and anonymous channel posts |
| **Yellow / Red escalation** | Yellow = delete + demote the offender. Red = delete + demote **+ ban** (with optional duration: 1h / 24h / 7d / permanent) |
| **Multi-channel (v2.0)** | Guard any number of channels at once — each channel keeps its own locks, stats, schedule and logs |
| **Scoped admin ACL (v2.0)** | The owner assigns each panel-admin/viewer the *exact* channels they may manage. Other channels and global settings are invisible to them. Reports go only to that channel's audience |
| **Batch admin add (v2.1)** | Paste a **list of numeric IDs** (comma/newline separated, Persian digits welcome, up to 50) and promote them all at once with a single preset — per-user ✅/❌ report with Persian error reasons |
| **One-tap presets** | "Basic admin" (post + delete), "Full admin", "Anonymous poster" — or fine-tune all 9 Telegram admin rights manually |
| **Anonymous-post lock** | Deletes any unsigned channel post, so nobody posts without their real identity (admins must enable *Sign messages*) |
| **Time-window lock** | e.g. block everything nightly 04:00–20:00 (Tehran timezone), midnight-crossing ranges supported |
| **Instant lockdown** | One button freezes the entire channel until you press "open" again |
| **24h undo** | Offenders' admin rights are snapshotted before demotion — one tap restores them if the signature match was wrong |
| **Settings backup** | Export/import the full channel config as a single JSON text |
| **Live stats** | Per-channel counters + "today" (Tehran calendar) + violation log + health check |
| **48h gap helper** | An optional Telethon userbot (`userbot.py`) deletes violations older than 48h, which the Bot API forbids |

## 🚀 Deploy (one click)

1. Press the **Deploy to Cloudflare** button above and sign in — the KV namespace and webhook secret are provisioned automatically.
2. Add two Worker **Secrets** (Dashboard → your Worker → Settings → Variables):
   - `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `OWNER_ID` — your numeric Telegram ID (send `/id` to [@userinfobot](https://t.me/userinfobot))
3. Open `https://<your-worker>.workers.dev/?setup=<WEBHOOK_SECRET>` once to connect the webhook.
4. Add the bot to your channel as **admin** (Delete messages permission required) and press **Activate** in its private chat.

Prefer the terminal? `CLOUDFLARE_API_TOKEN=xxx bash scripts/deploy.sh` does everything (upload, KV binding, secrets, webhook) — see the Persian README for details.

## 🧪 Tests

A full Telegram + KV simulator runs **352 assertions** (`node scripts/test-bot.mjs`): locks, escalation ladder, ACL scoping, batch promotion, anonymous-post lock, backups, schedules, stats rotation and more.

## 🔐 Security notes

- No tokens, credentials or personal IDs are committed. `BOT_TOKEN` / `OWNER_ID` live as Worker secrets; `WEBHOOK_SECRET` is generated at deploy time.
- Every bot action is permission-checked server-side (owner / scoped admin / viewer), not just hidden in the UI.
- `wrangler.toml` in the repo ships with placeholders — the deploy flow fills them in.

## 📄 License

MIT — see [LICENSE](LICENSE).
