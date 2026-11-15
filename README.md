# 🛡️ Anti-Treason Bot — Telegram Channel Guard

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/Godde3s/anti-treason-bot"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare Workers" /></a>
  <a href="README-FA.md"><img src="https://img.shields.io/badge/مستندات-فارسی-0ea5e9?style=for-the-badge" alt="Persian docs" /></a>
  <img src="https://img.shields.io/badge/tests-641%2F641_passing-22c55e?style=for-the-badge" alt="tests" />
  <img src="https://img.shields.io/badge/runtime-Cloudflare_Workers_%2B_tgcloud-F38020?style=for-the-badge" alt="runtimes" />
</p>

A self-hosted **anti-cheat guard for Telegram channels**. It catches edits and unauthorized posts within milliseconds — even if the message was sent days ago and edited *right now* (Telegram bots normally cannot touch anything older than 48 hours; the Cloudflare version pairs with an optional userbot helper to close that gap).

Everything is managed from a clean Persian panel in the bot's private chat. No commands to memorize, no database to babysit.

> 🌐 Documentation is bilingual: **English (this file)** · [فارسی (README-FA.md)](README-FA.md)

> 🌍 **Live site:** [godde3s.github.io/anti-treason-bot](https://godde3s.github.io/anti-treason-bot/) — the full feature tour and deploy guide, in Persian and English.

## 🔀 Two versions, one bot

The same bot ships in **two runtimes**. The live bot runs on **tgcloud**; the Cloudflare Worker is kept as a backup.

|  | ☁️ Cloudflare Worker | ⚡ tgcloud Serverless |
|---|---|---|
| **Code** | `worker.js` + `wrangler.toml` (repo root) | [`tgcloud/`](tgcloud/) |
| **Status** | 🗄️ **Backup** — deployed, receives no traffic | ✅ **Live** — rev 12, since 2026-11-15 |
| **Runtime** | Cloudflare Workers (single file, zero deps) | Telegram tgcloud (V8 isolate, `sdk` + SQL + KV) |
| **Data** | Cloudflare KV namespace | tgcloud SQL database + KV |
| **Deploy** | One-click button / `scripts/deploy.sh` / wrangler | `npx tgcloud push` (see [`tgcloud/AGENTS.md`](tgcloud/AGENTS.md)) |
| **Version** | v5.2 | rev 12 |
| **Tests** | 641/641 (`node scripts/test-bot.mjs`) | Verified live via server-side probes |

> Pick **one** runtime per bot token — never run both against the same bot, or both will answer the same updates.

## ✨ Features

Most features are in **both** versions. A few are specific to one runtime.

| Feature | Version | What it does |
|---|---|---|
| **Instant edit detection** | ✅ Both | Any text/media caption edit is deleted in milliseconds — retro-editing spam does not survive |
| **20 independent locks** | ✅ Both | Block edits, any post type (text, photo, video, GIF, sticker, voice, audio, file, poll, contact, location, dice…), forwards, links, and anonymous channel posts |
| **Master lock** | ✅ Both | One switch blocks everything |
| **True-edit detection** | ✅ Both | A content fingerprint (text + media kind + poll question) skips enforcement when an edit didn't actually change the content — no false deletions from poll votes or checklist ticks |
| **Anonymous-post lock** | ✅ Both | Deletes any unsigned channel post, so nobody posts without their real identity (admins must enable *Sign messages*) |
| **Yellow / Red escalation** | ✅ Both | Yellow = delete + demote the offender. Red = delete + demote **+ ban** (duration: 1h / 24h / 7d / permanent) |
| **24h undo** | ✅ Both | Offenders' admin rights are snapshotted before demotion — one tap restores all 15 Bot API permissions |
| **Multi-channel** | ✅ Both | Guard any number of channels at once — each channel keeps its own locks, stats, schedule and logs |
| **Scoped admin ACL** | ✅ Both | The owner assigns each panel-admin/viewer the *exact* channels they may manage. Other channels and global settings are invisible to them. Reports go only to that channel's audience |
| **Batch admin add** | ✅ Both | Paste a **list of numeric IDs** (comma/newline separated, Persian digits welcome, up to 50) and promote them all at once with a single preset — per-user ✅/❌ report with Persian error reasons |
| **One-tap presets** | ✅ Both | "Basic admin" (post + delete), "Full admin", "Anonymous poster" — or fine-tune all 9 Telegram admin rights manually |
| **Per-channel bot access** | ✅ Both | Grant a user access to the bot's panel for one specific channel only |
| **Quick access by ID** | ✅ Both | Grant/remove panel access by pasting a numeric ID |
| **Onboarding + owner approval** | ✅ Both | A new channel is registered when the bot becomes admin, and only starts guarding after the owner taps "Activate" |
| **Per-channel disable** | ✅ Both | Pause the bot on any channel with one button — settings, stats and mutes are preserved |
| **Time-window lock** | ✅ Both | Block everything in a window (e.g. nightly 04:00–20:00 Tehran), minute-precise, midnight-crossing ranges supported |
| **Instant lockdown** | ✅ Both | One button freezes the entire channel until you press "open" again |
| **In-channel lock announcements** | ✅ Both | When the instant lock flips or a scheduled window starts/ends, the bot posts a notice inside the channel itself (per-channel toggle) |
| **Manual mute** | ✅ Both | Silence a specific person for a chosen duration (or permanently) — every post/edit of theirs is deleted instantly, expiry is automatic |
| **Settings backup** | ✅ Both | Export/import the full channel config as a single JSON text |
| **Live stats** | ✅ Both | Per-channel counters + "today" (Tehran calendar) + violation log + health check |
| **Dynamic reports** | ✅ Both | Signed posts resolve to the **signing admin** (mention + ID); edits show **old text vs new text**; anonymous posts get a short explanation with the fix |
| **Post to channel / broadcast** | ✅ Both | Send any message (text/photo/video/album) to one channel or all active channels, with preview, confirmation and a per-channel ✅/❌ report; destination picker (channels / +groups / +DMs / all) |
| **Delete recent messages** | ✅ Both | Delete the last 1–40 channel messages with a confirmation step and a success count |
| **Bilingual fa/en** | ✅ Both | Every user picks fa/en with one tap; the owner sets the reports default with `/setlang` |
| **Rich messages (Bot API 10.4)** | ✅ Both | Real premium tables, section headings, collapsible sections, highlights, checkbox rows, RTL layout, premium emoji, client-local timestamps |
| **Update dedup** | ✅ Both | A retried update cannot double-execute a mute/grant/activate (Worker: in-memory; tgcloud: KV-backed, survives isolates) |
| **Force-join** | ⚡ tgcloud | Members must join a required channel/group before they can use the bot (channel/group only, ships OFF) |
| **Exactly-once sched announcements** | ⚡ tgcloud | Scheduled-lock start/end announcements are claimed atomically in KV, so a lazy re-detection after midnight can never announce twice |
| **Per-muted-user announce toggle** | ⚡ tgcloud | Choose per muted person whether their mute is announced in the channel (default silent) |
| **Red-mode owner guard** | ⚡ tgcloud | Red escalation can never demote/ban the bot owner (in addition to the channel creator) |
| **Stale-schedule cleanup** | ⚡ tgcloud | The scheduled-lock state is deleted when the bot is kicked/left, so no phantom "lock ended" announcement fires on re-add |
| **48h gap helper (userbot)** | ☁️ Cloudflare | `userbot.py` (Telethon) deletes violations older than 48h, which the Bot API forbids — the tgcloud runtime has no userbot endpoints |
| **Previous-bot fallback** | ☁️ Cloudflare | `LEGACY_BOT_TOKEN`: demote/ban/unban automatically retry through the previous bot when Telegram refuses |
| **KV write-budget redesign** | ☁️ Cloudflare | v5.2: edit fingerprints merged into ring records (one KV put per flush), 3-minute flush spacing, quota-aware error toasts — the free 1,000 writes/day budget survives busy channels |
| **Quota-safe channel index** | ☁️ Cloudflare | The channel list lives in an `idx:chats` key (reads only), so the every-minute cron never burns the 1,000 list-ops/day budget |

## 🚀 Deploy — Cloudflare Worker

1. Press the **Deploy to Cloudflare** button above and sign in — the KV namespace and webhook secret are provisioned automatically.
2. Add two Worker **Secrets** (Dashboard → your Worker → Settings → Variables):
   - `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `OWNER_ID` — your numeric Telegram ID (send `/id` to [@userinfobot](https://t.me/userinfobot))
3. Open `https://<your-worker>.workers.dev/?setup=<WEBHOOK_SECRET>` once to connect the webhook.
4. Add the bot to your channel as **admin** (Delete messages permission required) and press **Activate** in its private chat.

Prefer the terminal? `CLOUDFLARE_API_TOKEN=xxx bash scripts/deploy.sh` does everything (upload, KV binding, secrets, webhook) — see the Persian README for details.

## 🚀 Deploy — tgcloud Serverless

```bash
cd tgcloud
npx tgcloud login        # link this project to your bot
npx tgcloud push         # deploy the modules to the cloud
npx tgcloud migrate      # apply tgcloud/schema.js changes to the database
npx tgcloud webhook      # show the webhook and whether it matches your handlers
```

Full project rules (module system, SDK, database, deploy workflow) are in [`tgcloud/AGENTS.md`](tgcloud/AGENTS.md) and the SDK reference in [`tgcloud/docs/tgcloud-sdk.md`](tgcloud/docs/tgcloud-sdk.md). Secrets (`BOT_TOKEN`, `OWNER_ID`) live in the platform, never in the code.

## 🧪 Tests

A full Telegram + KV simulator runs **641 assertions** for the Cloudflare Worker (`node scripts/test-bot.mjs`): locks, escalation ladder, ACL scoping, batch promotion, anonymous-post lock, backups, schedules, stats rotation and more. The tgcloud version is verified live via server-side probes (fake channel, race tests, dedup timing).

## 🔐 Security notes

- No tokens, credentials or personal IDs are committed. `BOT_TOKEN` / `OWNER_ID` live as Worker secrets / platform secrets; `WEBHOOK_SECRET` is generated at deploy time.
- Every bot action is permission-checked server-side (owner / scoped admin / viewer), not just hidden in the UI.
- `wrangler.toml` in the repo ships with placeholders — the deploy flow fills them in.
- The tgcloud `.tgcloud/` directory is CLI machine state and is gitignored — never commit it.

## 📄 License

MIT — see [LICENSE](LICENSE).
