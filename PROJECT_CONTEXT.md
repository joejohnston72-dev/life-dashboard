# Life Dashboard — Project Context

## What it is
A personal life-management **PWA** (Progressive Web App) that unifies several life-tracking tools, installable on iPhone either as one dashboard or as separate standalone apps per module.

- **Live URL:** https://joejohnston72-dev.github.io/life-dashboard/
- **Repo:** https://github.com/joejohnston72-dev/life-dashboard (public)
- **Local path:** `/Users/joejohnston/life-dashboard`
- **User:** UK-based. GitHub account `joejohnston72-dev`.

## Tech stack
- **Vanilla JS ES modules, no build step** — plain HTML/CSS/JS served statically
- **Hosting:** GitHub Pages (legacy build, `main` branch, root). Deploy by `git push`. `.nojekyll` present (a Pages 404 incident was fixed by adding it). `gh` CLI installed at `~/bin/gh`.
- **Storage:** IndexedDB local-first (`shared/db.js`) + **Supabase** for cross-device sync and auth. Project: `https://xjcnkivlkfzdycbyxxlx.supabase.co`
- **Auth:** Supabase email **OTP code** (6–8 digit), NOT magic links (links bounced the user out of the installed PWA to Safari). Email confirmation is OFF; both "Magic Link" and "Confirm signup" email templates use `{{ .Token }}`.
- **Backend logic:** Supabase **Edge Functions** (Deno) + **pg_cron** for scheduled jobs.
- **Service worker** (`sw.js`): **network-first + `cache:'no-cache'`** to defeat GitHub Pages' ~10-min HTTP cache. Auto-registers with `updateViaCache:'none'`, polls `update()` every 60s, reloads on `controllerchange`. **Always bump `CACHE` version on any change** (currently v17). If updates won't land: delete PWA from home screen and re-add (data re-syncs from Supabase).
- **Each module is independently installable** — `workout/` and `habits/` each have their own `manifest.json`, distinct icon, and Apple web-app meta tags, so "Add to Home Screen" from within a module installs it standalone (own icon, opens straight into that module). The root dashboard remains an optional hub/launcher.

## Repo structure
```
index.html          # Home dashboard: tiles + Suggestions panel + auth overlay
styles.css           # Shared design tokens (dark theme, accent colors)
sw.js                # Service worker (cache version, push handlers)
manifest.json        # Root PWA manifest (the hub)
icon.png             # 512x512 hub app icon (2x2 tile grid in module colors)
shared/
  db.js              # IndexedDB wrapper + Supabase sync (stores: calories, workout, habits)
  supabase.js        # Supabase client (anon key inline)
  push.js            # Web Push subscription helper (VAPID public key)
  suggestions.js     # Cross-module insight engine
habits/              # Habit tracker + natural-language reminders (own manifest/icon)
workout/             # Full workout app — index.html, app.js, exercises.js, cues.js (own manifest/icon)
supabase/
  schema-reminders.sql
  schedule-cron.sql
  functions/send-reminders/index.ts
```

## Modules — status

**Home dashboard** ✅ — 3 tiles (Calories/Workout/Habits) + **Suggestions panel**: reads Workout + Habits data, shows prioritised warn/tip/good cards (days since workout, neglected muscle groups, habits not done, reminders-but-push-off, streaks). Cards are **dismissible via X** (persisted by content-hash key in db).

**Calories** ✅ — links out to the user's separate CalorieAI app (`joejohnston72-dev.github.io/calorieAI/`).

**Workout** ✅ — Full Hevy replacement. Live set check-off, **per-exercise editable rest timer** (default 60s, inline non-blocking bar, NOT a popup), **rest-end Web Audio chime + vibrate**, previous-performance per set, screen wake lock, exercise notes. Searchable exercise picker (95 exercises in `exercises.js`, custom exercises). **Form cues** (`cues.js`) — every exercise has setup/execution/common-mistake coaching points, shown via an ⓘ button during a workout or by tapping an exercise in the Library tab. Templates/routines, including an explicit **"+ New Routine"** builder on the dashboard (separate from logging a real workout — Finish becomes Save and stores a template instead of a session). History grouped by month + detail view. **Hevy CSV import** (tab-separated; date format `"4 Jun 2026, 17:14"`; `stableId` hashing dedupes re-imports). "Build Routines from History". Clear-all-history button.

**Habits** ✅ — Tabbed: "Today" (habit tracker with streaks) + "Reminders". **Natural-language reminders**: type plain English → Claude (`claude-haiku-4-5-20251001`, via the user's Anthropic key entered with the 🔑 button, stored in db) parses to a structured schedule → stored in Supabase `reminders` table. **Push notifications VERIFIED WORKING end-to-end** (parse → save → cron → delivery). Edge function `send-reminders` runs every minute via pg_cron, matches due reminders to **Europe/London** local time (DST-safe), sends Web Push via `npm:web-push`. Reminders are editable, toggleable, and have a quick **X to clear** (top-right corner of each card). iOS push only works as installed PWA (16.4+).

**Finance — REMOVED.** A Finance module (envelope budget) and a GoCardless Bank Account Data integration (free Open Banking transaction sync, replacing an earlier Plaid attempt that turned out not to be free) were both built. The user decided to keep using their existing external budget tracker instead, so as of commit `5935a73` on `main`:
- `finance/` directory deleted (UI, manifest, icon)
- `supabase/functions/bank/` and `supabase/schema-bank.sql` deleted (GoCardless never went live — no GC secrets were ever set, nothing to tear down externally)
- Finance tile removed from the home dashboard
- `financeSuggestions` removed from `shared/suggestions.js`
- `finance` store dropped from `shared/db.js`'s `STORES` list
- All finance references scrubbed from `manifest.json` / `styles.css`
- Service worker precache updated, cache bumped to v17

There is no finance/budget functionality in this app going forward unless explicitly requested again.

## Key secrets / config
- VAPID public key is in `shared/push.js`; private key is set as the `send-reminders` edge-function secret (`VAPID_PRIVATE`), plus `VAPID_PUBLIC`, `VAPID_SUBJECT`.
- Supabase anon key is inline in `shared/supabase.js`.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` auto-injected into edge functions.
- pg_cron calls `send-reminders` every minute using the service-role key.

## Conventions / gotchas
- **No build step** — edit files directly, commit, push; Pages auto-deploys (~40s).
- **Bump `sw.js` CACHE version** every change or updates won't reach devices.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify deploys by polling `gh api repos/.../pages/builds/latest` for the commit SHA (this can lag — also spot-check the actual file URLs return 200/404 as expected).
- Reminder scheduling is in Europe/London; the rest of the app has no currency/locale-specific logic now that Finance is gone.

## What's next
No committed roadmap right now — Finance/Bank work is closed out and the last explicit feature request (Workout form cues, per-module installable apps, New Routine builder) is shipped. Revisit with the user for next priorities. Ideas floated earlier but not committed to: a Sleep module pulling from Apple Health, Resend SMTP to remove Supabase's free-tier email rate limit, custom-exercise cues.

---

_Last verified deploy: commit `5935a73` (Finance/GoCardless removal) — confirmed `finance/` returns 404 and the home page no longer shows the Finance tile._
