# Life Dashboard — Project Context

## What it is
A personal life-management **PWA** (Progressive Web App) that unifies several life-tracking tools behind one home screen, installable on iPhone. Replaces a scattered set of apps and a manual Google Sheet budget.

- **Live URL:** https://joejohnston72-dev.github.io/life-dashboard/
- **Repo:** https://github.com/joejohnston72-dev/life-dashboard (public)
- **Local path:** `/Users/joejohnston/life-dashboard`
- **User:** UK-based, GBP throughout. GitHub account `joejohnston72-dev`.

## Tech stack
- **Vanilla JS ES modules, no build step** — plain HTML/CSS/JS served statically
- **Hosting:** GitHub Pages (legacy build, `main` branch, root). Deploy by `git push`. `.nojekyll` present (a Pages 404 incident was fixed by adding it). `gh` CLI installed at `~/bin/gh`.
- **Storage:** IndexedDB local-first (`shared/db.js`) + **Supabase** for cross-device sync and auth. Project: `https://xjcnkivlkfzdycbyxxlx.supabase.co`
- **Auth:** Supabase email **OTP code** (6–8 digit), NOT magic links (links bounced the user out of the installed PWA to Safari). Email confirmation is OFF; both "Magic Link" and "Confirm signup" email templates use `{{ .Token }}`.
- **Backend logic:** Supabase **Edge Functions** (Deno) + **pg_cron** for scheduled jobs.
- **Service worker** (`sw.js`): **network-first + `cache:'no-cache'`** to defeat GitHub Pages' ~10-min HTTP cache. Auto-registers with `updateViaCache:'none'`, polls `update()` every 60s, reloads on `controllerchange`. **Always bump `CACHE` version on any change** (currently ~v13). If updates won't land: delete PWA from home screen and re-add (data re-syncs from Supabase).

## Repo structure
```
index.html          # Home dashboard: tiles + Suggestions panel + auth overlay
styles.css          # Shared design tokens (dark theme, accent colors)
sw.js               # Service worker (cache version, push handlers)
manifest.json       # PWA manifest
icon.png            # 512x512 app icon (2x2 tile grid in module colors)
shared/
  db.js             # IndexedDB wrapper + Supabase sync (stores: calories, workout, finance, habits)
  supabase.js       # Supabase client (anon key inline)
  push.js           # Web Push subscription helper (VAPID public key)
  suggestions.js    # Cross-module insight engine
habits/             # Habit tracker + natural-language reminders
workout/            # Full workout app (index.html, app.js, exercises.js)
finance/            # Envelope budget + Bank tab
supabase/
  schema-reminders.sql
  schema-bank.sql
  schedule-cron.sql
  functions/send-reminders/index.ts
  functions/bank/index.ts
```

## Modules — status

**Home dashboard** ✅ — 4 tiles (Calories/Workout/Finance/Habits) + **Suggestions panel**: reads all modules, shows prioritised warn/tip/good cards (over-budget, unpaid bills, days since workout, neglected muscle groups, habits not done, reminders-but-push-off, streaks). Cards are **dismissible via X** (persisted by content-hash key in db).

**Calories** ✅ — links out to the user's separate CalorieAI app (`joejohnston72-dev.github.io/calorieAI/`).

**Workout** ✅ — Full Hevy replacement. Live set check-off, **per-exercise editable rest timer** (default 60s, inline non-blocking bar, NOT a popup), **rest-end Web Audio chime + vibrate**, previous-performance per set, screen wake lock, exercise notes. Searchable exercise picker (95 exercises in `exercises.js`, custom exercises). Templates/routines. History grouped by month + detail view. **Hevy CSV import** (tab-separated; date format `"4 Jun 2026, 17:14"`; `stableId` hashing dedupes re-imports). "Build Routines from History". Clear-all-history button.

**Habits** ✅ — Tabbed: "Today" (habit tracker with streaks) + "Reminders". **Natural-language reminders**: type plain English → Claude (`claude-haiku-4-5-20251001`, via the user's Anthropic key entered with the 🔑 button, stored in db) parses to a structured schedule → stored in Supabase `reminders` table. **Push notifications VERIFIED WORKING end-to-end** (parse → save → cron → delivery). Edge function `send-reminders` runs every minute via pg_cron, matches due reminders to **Europe/London** local time (DST-safe), sends Web Push via `npm:web-push`. Reminders are editable, toggleable, and have a quick **X to clear**. iOS push only works as installed PWA (16.4+).

**Finance** ⚠️ functional but **numbers need tuning** — Per-paycheck envelope budget modeled on the user's Google Sheet: Bills / Spend (weekly) / Extras envelopes + Net Worth panel (manual balances). Pre-populated with the user's real bills and accounts. Tabs: Overview/Spend/Bills/Worth. **Bank tab just added** (GoCardless integration — see below).

## In-flight work: Bank integration (just shipped, NOT yet activated)
The user wants **automatic bank-transaction import, entirely free**. Plaid is NOT free for real data, so we switched to **GoCardless Bank Account Data** (formerly Nordigen) — free UK/EU Open Banking data API.

- Single edge function `bank` routes by action: `institutions` (list GB banks), `connect` (create requisition, return bank-login link), `sync` (pull transactions).
- Tables `bank_connections` + `bank_transactions` (RLS: users read own; service role writes).
- Finance gets a **Bank tab**: connect flow (institution picker → bank's hosted login → redirect back with `?bankreturn=1` → sync), connected-accounts list, "Sync now", and a read-only bank transactions list.
- **Activation still required (user must do):** create free GoCardless Bank Account Data account, set `GC_SECRET_ID` + `GC_SECRET_KEY` as edge-function secrets, run `schema-bank.sql`, deploy the `bank` edge function. Until then the Bank tab errors gracefully when tapped.

## Key secrets / config
- VAPID public key is in `shared/push.js`; private key is set as the `send-reminders` edge-function secret (`VAPID_PRIVATE`), plus `VAPID_PUBLIC`, `VAPID_SUBJECT`.
- Supabase anon key is inline in `shared/supabase.js`.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` auto-injected into edge functions.
- pg_cron calls `send-reminders` every minute using the service-role key.

## Conventions / gotchas
- **No build step** — edit files directly, commit, push; Pages auto-deploys (~40s).
- **Bump `sw.js` CACHE version** every change or updates won't reach devices.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify deploys by polling `gh api repos/.../pages/builds/latest` for the commit SHA.
- All financial display in GBP; reminder scheduling in Europe/London.

## What's next (priority order)
1. **Activate + test Bank integration** (GoCardless account, secrets, deploy, run schema; verify connect→sync on a real bank).
2. **Finance tuning** — fix the numbers to match the user's budget sheet exactly.
3. Optional: **Resend SMTP** to remove Supabase's free-tier email rate limit.
4. Future ideas: Sleep module (Apple Health), wiring bank transactions into the spend envelope automatically.

---

_Last deploy to verify next session: commit `5032a76` (reminders X + Bank scaffolding) — confirm it built and is live. Note: `/remote-control` mentioned earlier is not a recognized command/skill._
