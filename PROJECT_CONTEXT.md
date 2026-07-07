# Life Dashboard — Project Context (source of truth)

Personal PWA. Read this first to avoid re-reading the whole codebase.

- **Live:** https://joejohnston72-dev.github.io/life-dashboard/
- **Repo:** github.com/joejohnston72-dev/life-dashboard (public) · **Local:** `/Users/joejohnston/life-dashboard`
- **Deploy:** `git push` to `main` → GitHub Pages. `gh` at `~/bin/gh`. `.nojekyll` present.
  Pages builds are sometimes **stuck in "building"** for hours — retrigger with
  `gh api -X POST repos/joejohnston72-dev/life-dashboard/pages/builds` and poll
  `curl -s .../sw.js | head -1` until the CACHE version matches. **Bump `sw.js` CACHE every change.** Currently **v25**.
- **Stack:** vanilla JS ES modules, **no build step**. IndexedDB local-first (`shared/db.js`) + Supabase sync + auth.
- **Auth:** Supabase email **OTP code** (not magic link). Session faked in preview via `localStorage['sb-xjcnkivlkfzdycbyxxlx-auth-token']`.
- **Service worker:** network-first + `cache:'no-cache'`; auto-updates (polls every 60s, reloads on controllerchange). If updates won't land: delete PWA + re-add.

## Verifying in preview (how I test)
`preview_start` name `life-dashboard` (port 3457, in `~/.claude/launch.json`). Then `preview_eval` to set a fake Supabase token in localStorage and navigate to `/workout/`. Drive the UI via dispatched events; assert via IndexedDB reads. Screenshot for visual checks.

## Modules
- **Home** (`index.html`) — 3 tiles (Calories→external CalorieAI app, Workout, Habits) + Suggestions panel (`shared/suggestions.js`, reads workout+habits) + auth overlay.
- **Habits** (`habits/`) — tabbed Today (habit tracker, streaks) + Reminders (natural-language → Claude parse → Supabase `reminders` → Edge Function `send-reminders` via pg_cron → Web Push). Anthropic key stored `db.get('habits','anthropic-key')`. Model `claude-haiku-4-5-20251001`.
- **Workout** (`workout/`) — the big one; see below.
- Removed: Finance module + GoCardless (deleted; user uses external budget tracker).

## Workout app — files
- `index.html` — all markup + inline `<style>`. Tabs: **Home · Stats · Coach · Library** (History folded into Stats). Active-workout is a fixed overlay `#activeWorkout`.
- `app.js` (~1900 lines) — everything. Key functions:
  - `loadSessions()` → sessions newest-first. `getTemplates()`, `getAllExercises()` (EXERCISES + custom), `guessCategory(name)`.
  - Active workout: `startEmptyWorkout(prefill)`, `startNewRoutine()`, `openActiveWorkout()`, `renderActiveSession()` (full render only on structure change), `buildExerciseBlock(ex,ei)`, `buildSetRow(ex,ei,set)`. **Surgical DOM updates** via delegated listeners on `#awBody` — do NOT reintroduce per-render onclick rebinding.
  - Set actions: `toggleSetDone(ei,setId,rowEl)` (commit ghosts, auto-fill next, PB detect, start rest, **auto-advance focus to next reps**), `deleteSet`, `toggleDropSet`, `slideOutDelete`.
  - Gestures: pointer-event swipes on set rows (incl. inputs — tap to type, drag to act; left=delete slide-out, right=drop set); long-press header → reorder mode.
  - Timers (timestamp-based, survive backgrounding): `startRest(secs,exName)`, `tickRest`, `finishRest` (persistent pulsing green, **no auto-dismiss**), `skipRest`, `bumpRest(delta)`, `resumeRestFromDb`. Per-exercise `restTime` via `.ex-rest-step` +/− buttons.
  - Chime: `unlockAudio()` (on set check), `playChime()` (loud: 2 triads sine+square through compressor). iOS mute switch still silences it.
  - Keyboard-safe layout: `fitActiveWorkout()`/`unfitActiveWorkout()` resize overlay to `visualViewport`; `body.workout-open` scroll-lock.
  - Crash recovery: `saveSoon()` debounced autosave to `active-session`; `checkForAbandonedSession()` resume prompt.
  - Rendering: `renderDashboard`, `renderStats` (calls `renderHistory`), `renderHistory`, `openHistoryDetail(sessionId)`, `renderLibrary`, `renderCoach`.
  - Exercise picker: `openExPicker({replaceEi?})`, `addExerciseToSession(name,cat)`, `replaceExercise`. Custom exercise modal → `exercises-custom`.
  - Hevy CSV import: `parseHevyCSV` (TSV, date "4 Jun 2026, 17:14", stableId dedup).
- `exercises.js` — `EXERCISES` (array `{name,category}`, ~112), `CATEGORIES` (Chest,Back,Shoulders,Biceps,Triceps,Quads,Hamstrings,Glutes,Calves,Core,Cardio), `CATEGORY_COLORS`.
- `cues.js` — `CUES` (name→coaching points), `resolveCues(name)` (alias + fuzzy `normName`), exported. `normName` NOT exported (ported into coach.js).
- `routineLibrary.js` — `ROUTINE_LIBRARY` (6 science-backed splits).
- `myRoutines.js` — `MY_ROUTINES` (user's 5 real Hevy days, one-time seeded).
- `stats.js` — inline-SVG charts: `lifetimeTotals`, `weeklyVolumeHTML`, `muscleBalanceHTML`, `exerciseFrequency`, `progressionHTML`, `monthlyViewHTML`, `e1RM` (via achievements). No chart libs.
- `achievements.js` — `buildRecords`, `detectPBs`, `absorbSet`, `e1RM`, `getStreakSettings`/`saveStreakSettings`, `computeStreak`, `computeMilestones`.
- `coach.js` — AI coach. `DRAFT_ROUTINE_TOOL` (schema = template contract), `normName`, `buildCoachContext(sessions,templates,records,streak,allExercises)` → system string (**workout data only**), `assembleContext({...})`, `validateRoutine(routine,{getAllExercises,guessCategory})` (exact-normalise match → containment ≥6 chars → else custom), `callCoach({apiMessages,system,forceTool,getKey})`. Model **`claude-sonnet-5`**. Reuses habits key (`db.get('habits','anthropic-key')`) with `workout` fallback. Thread persisted `db 'coach-thread'`. **Never replay tool_use blocks** (persist assistant turns as plain text + routine object) — avoids the pairing 400.

## Workout data model (IndexedDB store `'workout'`)
- `session-<id>` → `{id, title, date:'YYYY-MM-DD', startTime:ISO, endTime, duration:secs, exercises:[...], pbs:[{exercise,type,label}]}`
- exercise (in session): `{id, name, category, restTime, notes, prevPerf, prevSets, sets:[...]}`
- set: `{id, type:'normal'|'warmup'|'dropset', weight, reps, done, rpe?, touched:{weight,reps}, tW, tR}` (tW/tR = ghost targets, stripped on save)
- `templates` → array `{id, name, exercises:[{name, category, restTime, sets:[{weight,reps,type}]}]}`
- `exercises-custom` → array `{id, name, category, custom:true}`
- Other keys: `streak-settings {seed,seedDate,target}`, `active-session`, `active-rest`, `coach-thread`, `anthropic-key`, `replacement-prefs`, `my-routines-seeded`, `push-day-fixed`.
- **Cardio today:** `category:'Cardio'` sets reuse `reps` as minutes; volume calc skips them. No dedicated per-exercise tracking-type field yet (planned).

## Conventions / gotchas
- No build — edit, commit, push. Bump `sw.js` CACHE. Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Inputs must be ≥16px (iOS zoom). Viewport has `maximum-scale=1,user-scalable=no`. `touch-action:manipulation`. Set rows/inputs `touch-action:pan-y` (swipes).
- Sections need bottom padding for the fixed 56px tab bar: `.section { padding: 0 var(--gap) calc(env(safe-area-inset-bottom)+72px); }`.
- Dynamic Island / native home-screen widgets / live audio while backgrounded: **impossible in a PWA** (communicated + declined).

## History (why the app is shaped this way)
Built across many sessions: workout is a full Hevy replacement (live logging, rest timer, PBs, streaks, stats, gestures, monthly view, Hevy CSV import) + AI coach. v25 shipped active-workout polish (swipeable inputs, green done rows, persistent timer, louder chime, auto-advance focus, keyboard-safe layout).

## In-flight (this session's asks)
1. Exercise tracking **types** (cardio/distance/time/reps-only/weighted) — chosen when creating a new exercise; set-input fields vary by type.
2. Edit the **rest timer** easily (incl. turn Off) — "sometimes accidentally leave it on".
3. Edit **date/time of previous workouts** (in history detail).
4. **AI coach**: fix custom prompts; give it access to more app content (currently workout-only context).
