# Gym and Calorie App — Project Context (source of truth)

Personal PWA. Read this first to avoid re-reading the whole codebase. (Displayed
app name is "Gym and Calorie App"; the repo/folder/deploy path stays
`life-dashboard` — renaming those is a separate, much bigger operation and
wasn't asked for.)

- **Live:** https://joejohnston72-dev.github.io/life-dashboard/
- **Repo:** github.com/joejohnston72-dev/life-dashboard (public) · **Local:** `/Users/joejohnston/life-dashboard`
- **Deploy:** `git push` to `main` → GitHub Pages. `gh` at `~/bin/gh`. `.nojekyll` present.
  Pages builds are sometimes **stuck in "building"** for hours — retrigger with
  `gh api -X POST repos/joejohnston72-dev/life-dashboard/pages/builds` and poll
  `curl -s .../sw.js | head -1` until the CACHE version matches. **Bump `sw.js` CACHE every change.** Currently **v30**.
- **Stack:** vanilla JS ES modules, **no build step**. IndexedDB local-first (`shared/db.js`) + Supabase sync + auth.
- **Auth:** Supabase email **OTP code** (not magic link). Session faked in preview via `localStorage['sb-xjcnkivlkfzdycbyxxlx-auth-token']`.
- **Service worker:** network-first + `cache:'no-cache'`; auto-updates (polls every 60s, reloads on controllerchange). If updates won't land: delete PWA + re-add.

## Verifying in preview (how I test)
`preview_start` name `life-dashboard` (port 3457, in `~/.claude/launch.json`). Then `preview_eval` to set a fake Supabase token in localStorage and navigate to `/workout/`. Drive the UI via dispatched events; assert via IndexedDB reads. Screenshot for visual checks.

## Modules
- **Home** (`index.html`) — the root PWA, displayed name **"Gym and Calorie App"** (title, manifest, apple-mobile-web-app-title, header, auth-screen title). 2 tiles (Calories→external CalorieAI app, Gym App/`workout/`) + Suggestions panel (`shared/suggestions.js`, workout only) + auth overlay. Note the two-tier naming: the root app is "Gym and Calorie App", the workout tile/module within it is separately branded "Gym App" — that's intentional, per how each rename was requested.
- **Habits — REMOVED** (never adopted). Deleted the `habits/` module, `shared/push.js`, and the reminders backend (`supabase/functions/send-reminders`, schema/cron SQL). The `'habits'` IndexedDB store is intentionally KEPT in `db.js` STORES so the user's saved Anthropic key (`db.get('habits','anthropic-key')`) still resolves for the coach. Note: any deployed Supabase `send-reminders` pg_cron job / `reminders` table still exist server-side until torn down (`select cron.unschedule('send-reminders-every-minute');`), but harmless with no UI to create reminders.
- **Gym App** (`workout/`, folder/route unchanged — only the branding is "Gym App" now: tab title, PWA install name, in-app header, home-tile label) — the big one; see below.
- Removed: Finance module + GoCardless (deleted; user uses external budget tracker).

## Gym App (workout/) — files
- `index.html` — all markup + inline `<style>`. Tabs: **Home · Stats · Coach · Library** (History folded into Stats). Active-workout is a fixed overlay `#activeWorkout`. **No total elapsed-time countup is shown on screen** (removed deliberately — it read as "how long left" instead of focusing on the workout); duration is still tracked internally (`sessionStartMs`/`sessionSecsNow()`) and shown once, after the fact, on the finish summary. The per-exercise **rest timer** between sets is unaffected.
- `app.js` (~2300 lines) — everything. Key functions:
  - `loadSessions()` → sessions newest-first. `getTemplates()`, `getAllExercises()` (EXERCISES + custom), `guessCategory(name)`.
  - Active workout: `startEmptyWorkout(prefill)`, `startNewRoutine()`, `openActiveWorkout()`, `renderActiveSession()` (full render only on structure change), `buildExerciseBlock(ex,ei)`, `buildSetRow(ex,ei,set)`. **Surgical DOM updates** via delegated listeners on `#awBody` — do NOT reintroduce per-render onclick rebinding.
  - Set actions: `toggleSetDone(ei,setId,rowEl)` (commit ghosts, auto-fill next, PB detect, start rest, **auto-advance focus to next reps**), `deleteSet`, `toggleDropSet`, `slideOutDelete`.
  - Gestures: pointer-event swipes on set rows (incl. inputs — tap to type, drag to act; left=delete slide-out, right=drop set); long-press header → reorder mode.
  - Timers (timestamp-based, survive backgrounding): `startRest(secs,exName)`, `tickRest`, `finishRest` (persistent pulsing green, **no auto-dismiss**), `skipRest`, `bumpRest(delta)`, `resumeRestFromDb`. Per-exercise `restTime` via `.ex-rest-step` +/− buttons. This is the only on-screen timer now — the session-total clock was removed.
  - Chime: `unlockAudio()` (on set check), `playChime()` (loud: 2 triads sine+square through compressor). iOS mute switch still silences it.
  - Keyboard-safe layout: `fitActiveWorkout()`/`unfitActiveWorkout()` resize overlay to `visualViewport`; `body.workout-open` scroll-lock.
  - Crash recovery: `saveSoon()` debounced autosave to `active-session`; `checkForAbandonedSession()` resume prompt.
  - Rendering: `renderDashboard`, `renderStats` (calls `renderHistory`), `renderHistory`, `openHistoryDetail(sessionId)`, `renderLibrary`, `renderCoach`.
  - Exercise picker: `openExPicker({replaceEi?})`, `addExerciseToSession(name,cat)`, `replaceExercise` (now re-derives `logType`/`repRange` for the new exercise instead of carrying the old one's over). Custom exercise modal → `exercises-custom`.
  - Rep ranges: `buildExerciseBlock` shows a `🎯 Target: X–Y reps` badge per exercise (`.ex-rep-range`, see `repRanges.js`). `lookupRepRangeForCustom(entry)` fires an AI lookup in the background right after a custom exercise is created; `backfillCustomRepRanges()` runs at load (and again right after an API key is saved) to fill in a range for any existing custom exercise that doesn't have one yet. `patchRepRangeBadge(name, range)` updates the DOM + in-memory session in place once a lookup resolves — no re-render needed.
  - Hevy CSV import: `parseHevyCSV` (TSV, date "4 Jun 2026, 17:14", stableId dedup).
- `exercises.js` — `EXERCISES` (array `{name,category}`, ~112), `CATEGORIES` (Chest,Back,Shoulders,Biceps,Triceps,Quads,Hamstrings,Glutes,Calves,Core,Cardio), `CATEGORY_COLORS`.
- `repRanges.js` — `REP_RANGES` (name → `[min,max]` for all ~112 built-ins, aligned with the bands the AI coach already uses: compounds 5–8, most accessories 8–12/8–15, small-muscle/calves/core higher-rep 12–20+), `resolveRepRange(ex)` (custom-stored range → name lookup → category default → null for duration/cardio), `fetchAIRepRange({name,category,getKey})` (single forced-tool Anthropic call, same key/model as the coach; returns `null` on any failure so callers always have the category fallback to show instead).
- `cues.js` — `CUES` (name→coaching points), `resolveCues(name)` (alias + fuzzy `normName`), exported. `normName` NOT exported (ported into coach.js).
- `routineLibrary.js` — `ROUTINE_LIBRARY` (6 science-backed splits).
- `myRoutines.js` — `MY_ROUTINES` (user's 5 real Hevy days, one-time seeded).
- `stats.js` — inline-SVG charts: `lifetimeTotals`, `weeklyVolumeHTML`, `muscleBalanceHTML`, `exerciseFrequency`, `progressionHTML`, `monthlyViewHTML`, `e1RM` (via achievements). No chart libs.
- `achievements.js` — `buildRecords`, `detectPBs`, `absorbSet`, `e1RM`, `getStreakSettings`/`saveStreakSettings`, `computeStreak`, `computeMilestones`.
- `coach.js` — AI coach. `DRAFT_ROUTINE_TOOL` (schema = template contract), `normName`, `buildCoachContext(sessions,templates,records,streak,allExercises)` → system string (**workout data only**), `assembleContext({...})`, `validateRoutine(routine,{getAllExercises,guessCategory})` (exact-normalise match → containment ≥6 chars → else custom), `callCoach({apiMessages,system,forceTool,getKey})`. Model **`claude-sonnet-5`**. Key: `db.get('workout','anthropic-key')` with a `habits`-store fallback (preserves the key entered before Habits was removed). Thread persisted `db 'coach-thread'`. **Never replay tool_use blocks** (persist assistant turns as plain text + routine object) — avoids the pairing 400.

## Workout data model (IndexedDB store `'workout'`)
- `session-<id>` → `{id, title, date:'YYYY-MM-DD', startTime:ISO, endTime, duration:secs, exercises:[...], pbs:[{exercise,type,label}]}`. `prevPerf`/`prevSets` are stripped before saving — they're transient ghosting aids for the live editor, not part of the historical record.
- exercise (in session): `{id, name, category, logType, repRange:{min,max}|null, restTime, notes, sets:[...]}` (`prevPerf`/`prevSets` present only while a workout is in progress)
- set: `{id, type:'normal'|'warmup'|'dropset', weight, reps, done, rpe?, touched:{weight,reps}, tW, tR}` (tW/tR = ghost targets, stripped on save)
- `templates` → array `{id, name, exercises:[{name, category, restTime, sets:[{weight,reps,type}]}]}`
- `exercises-custom` → array `{id, name, category, custom:true, logType, repRange?:{min,max}}` — `repRange` is filled in asynchronously by the AI lookup (see `repRanges.js` above) and absent until that resolves.
- Other keys: `streak-settings {seed,seedDate,target}`, `active-session`, `active-rest`, `coach-thread`, `anthropic-key`, `replacement-prefs`, `my-routines-seeded`, `push-day-fixed`.
- **Cardio today:** `category:'Cardio'` sets reuse `reps` as minutes; volume calc skips them. No dedicated per-exercise tracking-type field yet (planned).

## Conventions / gotchas
- No build — edit, commit, push. Bump `sw.js` CACHE. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Inputs must be ≥16px (iOS zoom). Viewport has `maximum-scale=1,user-scalable=no`. `touch-action:manipulation`. Set rows/inputs `touch-action:pan-y` (swipes).
- Sections need bottom padding for the fixed 56px tab bar: `.section { padding: 0 var(--gap) calc(env(safe-area-inset-bottom)+72px); }`.
- Dynamic Island / native home-screen widgets / live audio while backgrounded: **impossible in a PWA** (communicated + declined).
- `esc()` (in both `app.js` and `stats.js`) escapes quotes as well as `<>&` — exercise names are free-typed user input and get interpolated into HTML attributes (`data-cue="..."`, `data-name="..."`) in several places, so don't regress this back to an `<>&`-only escaper.
- The `DURATION_NAMES` regex (app.js) intentionally does **not** match bare `hang` — only `dead hang` — because bare `hang` false-matched "Leg Raise (Hanging)" and forced a rep-based exercise into time-tracking.

## History (why the app is shaped this way)
Built across many sessions: workout is a full Hevy replacement (live logging, rest timer, PBs, streaks, stats, gestures, monthly view, Hevy CSV import) + AI coach. v25 shipped active-workout polish (swipeable inputs, green done rows, persistent timer, louder chime, auto-advance focus, keyboard-safe layout). v28: renamed the workout module to **Gym App**; removed the on-screen total-workout countup timer; added per-exercise ideal rep-range badges (static science-based table + AI auto-lookup for new/custom exercises); fixed a stored-XSS gap in `esc()`, a `logType`/`repRange` carryover bug on exercise replace, a `prevPerf`/`prevSets` storage leak into saved sessions, and the `Leg Raise (Hanging)` duration-type misclassification. v29: renamed the root project to **Gym and Calorie App** (title, manifest, apple-mobile-web-app-title, header, auth-screen title) — repo/folder/deploy path unchanged. v30: hanging leg raise now explicitly weight/reps (logType on the EXERCISES entry, plus the earlier regex fix); workout **duration editable** in history (the date/time modal gained a minutes field, and the Duration stat box is tappable); **editable sets in history detail** (an ✎ Edit sets toggle swaps logged values for inputs → `saveHistoryEdits` writes back and re-flags `done`); **clickable monthly calendar** (`.cal-cell[data-date]` → `openDayFromCalendar`: trained day opens that day's workout, multiple shows a chooser, empty day offers a backfill) with `backfillDate` threaded through `startEmptyWorkout`/`saveWorkout` so a past-dated workout saves to that day at noon with 0 duration (both editable after).

## Possible next steps (not yet requested)
1. Exercise tracking **types** (cardio/distance/time/reps-only/weighted), rest-timer editing (incl. Off), history date/time editing, and richer AI-coach context are all already implemented — see `LOGTYPES`, `.ex-rest-value`/`openRestSheet`, `openDateEditor`, and `coach.js` respectively.
