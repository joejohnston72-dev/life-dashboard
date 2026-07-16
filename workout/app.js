import { supabase }                     from '../shared/supabase.js';
import db                               from '../shared/db.js';
import { EXERCISES, CATEGORIES, CATEGORY_COLORS } from './exercises.js';
import { resolveCues } from './cues.js';
import { ROUTINE_LIBRARY } from './routineLibrary.js';
import { MY_ROUTINES } from './myRoutines.js';
import { buildRecords, detectPBs, absorbSet, e1RM,
         getStreakSettings, saveStreakSettings, computeStreak, computeMilestones } from './achievements.js';
import { lifetimeTotals, weeklyVolumeHTML, muscleBalanceHTML,
         exerciseFrequency, progressionHTML, monthlyViewHTML } from './stats.js';
import { assembleContext, callCoach, validateRoutine } from './coach.js';
import { resolveRepRange, fetchAIRepRange } from './repRanges.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

// ── Constants & helpers ───────────────────────────────────────────────────────
const STORE = 'workout';
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
// Deterministic ID for Hevy imports — same workout always gets same key
function stableId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return 'hevy-' + Math.abs(h).toString(36);
}
// Escapes quotes too, not just <>& — names are user-typed free text and get
// interpolated into HTML attributes (data-cue="...", data-name="...") in
// several places, so an unescaped " would break out of the attribute.
const esc   = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const fmtKg = v => String(v || 0);
const fmtTime = secs => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m + ':' + String(s).padStart(2,'0');
};
const fmtRest = secs => (secs <= 0 ? 'Off' : fmtTime(secs));   // rest timer can be disabled

// ── Exercise tracking types ───────────────────────────────────────────────────
// Which fields a set records. 'time' is stored in set.duration (seconds),
// 'distance' in set.distance (km). weight/reps as before.
const LOGTYPES = {
  weighted:   { cols: ['weight', 'reps'],     head: ['kg', 'Reps'],  label: 'Weight & reps' },
  bodyweight: { cols: ['reps'],               head: ['Reps'],        label: 'Reps only (bodyweight)' },
  duration:   { cols: ['time'],               head: ['Time'],        label: 'Time / hold' },
  cardio:     { cols: ['distance', 'time'],   head: ['km', 'Time'],  label: 'Distance & time (cardio)' },
};
// NB: bare "hang" was removed — it false-matched "Leg Raise (Hanging)" (a
// rep-based exercise) and forced it into time-tracking. "dead hang" alone
// covers the actual isometric hold.
const DURATION_NAMES = /plank|hold|wall sit|dead hang|l-sit|hollow/i;
// Infer a tracking type for a built-in / legacy exercise that has none stored.
// Cardio defaults to time (matches "25min stairs/cycle"); distance+time ('cardio')
// is only used when the user explicitly picks it for a new exercise.
function exLogType(name, category) {
  if (category === 'Cardio') return 'duration';
  if (DURATION_NAMES.test(name || '')) return 'duration';
  return 'weighted';
}
const resolveLogType = ex => LOGTYPES[ex?.logType] ? ex.logType : exLogType(ex?.name, ex?.category);
const fmtDuration = secs => { if (!secs) return ''; const m = Math.floor(secs/60), s = secs%60; return m + ':' + String(s).padStart(2,'0'); };
function parseTime(str) {
  if (str == null || str === '') return 0;
  str = String(str).trim();
  if (str.includes(':')) { const [m, s] = str.split(':'); return (parseInt(m)||0)*60 + (parseInt(s)||0); }
  return parseInt(str) || 0;   // bare number = seconds
}
const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

function parseToDate(str) {
  if (!str) return null;
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str))
    return new Date(str + 'T12:00:00');
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(str))
    return new Date(str.replace(' ', 'T'));
  // Hevy format: "4 Jun 2026, 17:14"
  const hm = str.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (hm) {
    const mon = MONTHS[hm[2].toLowerCase()];
    if (mon !== undefined)
      return new Date(+hm[3], mon, +hm[1], +hm[4], +hm[5]);
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function extractDateStr(str) {
  const d = parseToDate(str);
  return d ? d.toISOString().slice(0, 10) : '';
}
const fmtDate = iso => {
  const d = parseToDate(iso);
  if (!d || isNaN(d)) return 'Unknown date';
  return d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
};

// Load all saved sessions, newest first. Single source used everywhere.
async function loadSessions() {
  const all = await db.getAll(STORE);
  return all
    .filter(r => r.key.startsWith('session-') && r.value?.exercises)
    .map(r => r.value)
    .sort((a,b) => (parseToDate(b.date||b.startTime||'')?.getTime()||0) - (parseToDate(a.date||a.startTime||'')?.getTime()||0));
}

// ── Screen wake lock ──────────────────────────────────────────────────────────
let wakeLock = null;
async function acquireWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(_) {}
}
function releaseWakeLock() { wakeLock?.release(); wakeLock = null; }

// ── Active session state ──────────────────────────────────────────────────────
let activeSession   = null;   // { id, title, startTime, exercises: [...], pbs: [...] }
let sessionStartMs  = 0;      // duration derives from this — no on-screen countup (deliberately
                              // not displayed: a running total invites "how long left" anxiety
                              // instead of focus on the workout itself). Still recorded for stats.
let sessionRecords  = {};     // per-exercise all-time bests, for PB detection + typo guard
let routineMode     = false;

const sessionSecsNow = () => Math.max(0, Math.floor((Date.now() - sessionStartMs) / 1000));

// ── Rest timer state (timestamp-based — survives backgrounding) ───────────────
let restTimer      = null;
let restEndsAt     = null;   // epoch ms
let restTotalSecs  = 0;      // for the progress fill
let restFiredChime = false;

// ── In-progress autosave ──────────────────────────────────────────────────────
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActiveSession, 1000);
}
function saveActiveSession() {
  clearTimeout(saveTimer);
  if (!activeSession) return;
  db.set(STORE, 'active-session', {
    session: activeSession,
    routineMode,
    title: document.getElementById('awTitle').value,
    savedAt: Date.now(),
  });
}
async function clearActiveSessionStore() {
  await db.set(STORE, 'active-session', null);
  await db.set(STORE, 'active-rest', null);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
let activeTab = 'Dashboard';
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec' + activeTab).classList.add('active');
    document.getElementById('mainTitle').textContent =
      activeTab === 'Dashboard' ? 'Gym App' : activeTab;
    document.getElementById('miniBar').classList.toggle('visible', !!activeSession);
    if (activeTab === 'Dashboard') { renderDashboard(); }
    if (activeTab === 'Library')   { renderLibrary();   }
    if (activeTab === 'Stats')     { renderStats(); renderHistory(); }
    if (activeTab === 'Coach')     { renderCoach();     }
  };
});

// ── Workout start / open ──────────────────────────────────────────────────────
document.getElementById('startEmptyBtn').onclick = () => startEmptyWorkout();
document.getElementById('newRoutineBtn').onclick = () => startNewRoutine();

// Ghost targets: what the inputs *suggest* (placeholder), never pre-filled values.
function ghostsFor(prevSets, templateSet, si) {
  const prev = prevSets?.[si] ?? prevSets?.at(-1) ?? null;
  return {
    tW: prev?.weight || templateSet?.weight || null,
    tR: prev?.reps   || templateSet?.reps   || null,
  };
}

function freshSet(tpl, prevSets, si) {
  const { tW, tR } = ghostsFor(prevSets, tpl, si);
  return {
    id: uid(),
    type: tpl?.type === 'warmup' || tpl?.type === 'dropset' ? tpl.type : 'normal',
    weight: 0, reps: 0, done: false,
    touched: { weight: false, reps: false },
    tW, tR,
  };
}

async function startEmptyWorkout(prefill = null) {
  routineMode = false;
  document.getElementById('awFinishBtn').textContent = 'Finish';
  document.getElementById('awTitle').placeholder = 'Workout name…';

  // One history load powers previous-performance ghosts AND PB records.
  const past = await loadSessions();
  sessionRecords = buildRecords(past);

  const allEx = await getAllExercises();
  const exercises = (prefill?.exercises || []).map(e => {
    const prev = prevPerfFrom(past, e.name);
    const def = allEx.find(x => x.name === e.name);
    const logType = e.logType || prev?.logType || def?.logType || exLogType(e.name, e.category);
    return {
      id: uid(), name: e.name, category: e.category, logType,
      restTime: e.restTime ?? prev?.restTime ?? 60,
      notes: prev?.notes || '',
      repRange: e.repRange || def?.repRange || null,
      prevPerf: prev ? prev.sets.slice(0,3).map(s => `${fmtKg(s.weight)}×${s.reps}`).join(', ') : null,
      prevSets: prev?.sets || null,
      sets: (e.sets?.length ? e.sets : [{}]).map((tpl, si) => freshSet(tpl, prev?.sets || null, si)),
    };
  });

  activeSession = {
    id: uid(),
    title: prefill?.title || prefill?.name || '',
    startTime: new Date().toISOString(),
    exercises,
    pbs: [],
  };
  sessionStartMs = Date.now();
  acquireWakeLock();
  openActiveWorkout();
  renderActiveSession();
  saveSoon();
}

// Build a routine from scratch — reuses the workout editor, but Finish saves a template.
function startNewRoutine(prefill = null) {
  routineMode = true;
  activeSession = {
    id: uid(),
    title: prefill?.name || '',
    startTime: new Date().toISOString(),
    exercises: (prefill?.exercises || []).map(e => ({
      ...e, id: uid(),
      sets: (e.sets || [{}]).map(s => ({ ...s, id: uid(), done: false, touched: { weight:false, reps:false } })),
    })),
    pbs: [],
  };
  document.getElementById('awFinishBtn').textContent = 'Save';
  openActiveWorkout();
  document.getElementById('awTitle').placeholder = 'Routine name…';
  renderActiveSession();
}

function openActiveWorkout() {
  document.getElementById('miniBar').classList.remove('visible');
  document.getElementById('activeWorkout').classList.add('visible');
  document.getElementById('awTitle').value = activeSession?.title || '';
  document.body.classList.add('workout-open');   // lock background scroll (tabs can't peek)
  fitActiveWorkout();
}

// Size the overlay to the *visible* viewport so, when the keyboard opens, the
// footer/rest-bar sit just above it and only .aw-body scrolls — never the page
// behind. Without this iOS lets the background (incl. the tab bar) scroll into view.
function fitActiveWorkout() {
  const aw = document.getElementById('activeWorkout');
  if (!aw.classList.contains('visible')) return;
  const vv = window.visualViewport;
  if (!vv) return;
  const keyboardOpen = (window.innerHeight - vv.height) > 100 || vv.offsetTop > 0;
  if (keyboardOpen) {
    aw.style.transition = 'none';                 // track the keyboard instantly, no lag
    aw.style.height = vv.height + 'px';
    aw.style.bottom = 'auto';
    aw.style.transform = `translateY(${vv.offsetTop}px)`;
  } else {
    // no keyboard — clear overrides so the CSS entrance animation / layout applies
    aw.style.transition = ''; aw.style.height = ''; aw.style.bottom = ''; aw.style.transform = '';
  }
}
function unfitActiveWorkout() {
  const aw = document.getElementById('activeWorkout');
  aw.style.transition = ''; aw.style.height = ''; aw.style.bottom = ''; aw.style.transform = '';
  document.body.classList.remove('workout-open');
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitActiveWorkout);
  window.visualViewport.addEventListener('scroll', fitActiveWorkout);
}

// ── Restore an in-progress workout after a kill/reload ────────────────────────
async function checkForAbandonedSession() {
  const saved = await db.get(STORE, 'active-session');
  if (!saved?.session?.exercises?.length) return;
  const ageMin = Math.round((Date.now() - (saved.savedAt || 0)) / 60000);
  const ageTxt = ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin/60)}h ago`;
  const label  = saved.title || saved.session.title || 'Workout';
  if (ageMin > 720) { await clearActiveSessionStore(); return; } // stale >12h — silently drop
  if (!confirm(`Resume "${label}" in progress? (last active ${ageTxt})`)) {
    await clearActiveSessionStore();
    return;
  }
  routineMode = !!saved.routineMode;
  activeSession = saved.session;
  activeSession.pbs ||= [];
  sessionStartMs = Date.parse(activeSession.startTime) || (Date.now() - 60000);
  const past = await loadSessions();
  sessionRecords = buildRecords(past, activeSession.id);
  document.getElementById('awFinishBtn').textContent = routineMode ? 'Save' : 'Finish';
  acquireWakeLock();
  openActiveWorkout();
  document.getElementById('awTitle').value = saved.title || activeSession.title || '';
  renderActiveSession();
  const rest = await db.get(STORE, 'active-rest');
  if (rest?.endsAt) resumeRestFromDb(rest);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ACTIVE SESSION RENDERING — full render only on structure change;
//  everything else patches the DOM in place (no keyboard loss, no jumps).
// ═══════════════════════════════════════════════════════════════════════════════
const awBody = document.getElementById('awBody');

function findSet(ei, setId) {
  const ex = activeSession?.exercises[ei];
  if (!ex) return {};
  const si = ex.sets.findIndex(s => s.id === setId);
  return { ex, set: ex.sets[si], si };
}

function setPrevText(lt, prev) {
  if (!prev) return '—';
  switch (lt) {
    case 'bodyweight': return `${prev.reps || 0} reps`;
    case 'duration':   return fmtDuration(prev.duration) || '—';
    case 'cardio':     return `${prev.distance || 0}km ${fmtDuration(prev.duration) || ''}`.trim();
    default:           return `${fmtKg(prev.weight)}×${prev.reps}`;
  }
}
function setInputCell(col, set, ex, ei, prev) {
  const common = `data-ei="${ei}" data-set-id="${set.id}"`;
  if (col === 'weight')
    return `<td><input class="set-input" type="number" min="0" step="0.5" value="${set.weight || ''}" placeholder="${set.tW ?? 0}" inputmode="decimal" ${common} data-field="weight"></td>`;
  if (col === 'reps')
    return `<td><input class="set-input" type="number" min="0" step="1" value="${set.reps || ''}" placeholder="${set.tR ?? 0}" inputmode="numeric" ${common} data-field="reps"></td>`;
  if (col === 'distance')
    return `<td><input class="set-input" type="number" min="0" step="0.01" value="${set.distance || ''}" placeholder="${prev?.distance ?? 0}" inputmode="decimal" ${common} data-field="distance"></td>`;
  if (col === 'time')
    return `<td><input class="set-input" type="text" value="${set.duration ? fmtDuration(set.duration) : ''}" placeholder="${prev?.duration ? fmtDuration(prev.duration) : 'm:ss'}" inputmode="numeric" ${common} data-field="time"></td>`;
  return '<td></td>';
}
function buildSetRow(ex, ei, set) {
  const si = ex.sets.indexOf(set);
  const lt = resolveLogType(ex);
  const cfg = LOGTYPES[lt];
  const prev = ex.prevSets?.[si] ?? null;
  const tr = document.createElement('tr');
  tr.className = 'set-row'
    + (set.done ? ' done' : '')
    + (set.type === 'warmup' ? ' set-warmup' : '')
    + (set.type === 'dropset' ? ' set-dropset' : '');
  tr.dataset.ei = ei;
  tr.dataset.setId = set.id;
  tr.innerHTML = `
    <td class="set-num">${si + 1}</td>
    ${cfg.cols.map(c => setInputCell(c, set, ex, ei, prev)).join('')}
    <td class="set-check-cell"><button class="set-check" data-ei="${ei}" data-set-id="${set.id}">${set.done ? '✓' : ''}</button></td>
  `;
  return tr;
}

function buildExerciseBlock(ex, ei) {
  const block = document.createElement('div');
  block.className = 'ex-block';
  block.dataset.ei = ei;
  const color = CATEGORY_COLORS[ex.category] || '#888';
  const lt = resolveLogType(ex);
  const cfg = LOGTYPES[lt];
  const headCols = cfg.head.map(h => `<th>${h}</th>`).join('');
  const colspan = cfg.cols.length + 2;
  const range = resolveRepRange({ name: ex.name, category: ex.category, logType: lt, repRange: ex.repRange });

  block.innerHTML = `
    <div class="ex-block-header" data-ei="${ei}">
      <div class="ex-cat-dot" style="background:${color}"></div>
      <div class="ex-name">${esc(ex.name)}</div>
      <button class="ex-cue-btn" data-cue="${esc(ex.name)}" aria-label="Form cues">ⓘ</button>
      <button class="ex-menu-btn" data-ei="${ei}">⋯</button>
    </div>
    <div class="ex-rep-range" data-ex-name="${esc(ex.name)}">${range ? `🎯 Target: ${range.min}–${range.max} reps` : ''}</div>
    <div class="ex-rest-control">
      <span class="ex-rest-icon">⏱</span>
      <span class="ex-rest-label">Rest timer</span>
      <button class="ex-rest-step" data-ei="${ei}" data-delta="-15">−</button>
      <button class="ex-rest-value" data-ei="${ei}" id="restval-${ei}">${fmtRest(ex.restTime ?? 60)}</button>
      <button class="ex-rest-step" data-ei="${ei}" data-delta="15">+</button>
    </div>
    <input class="ex-notes-input" placeholder="Notes…" value="${esc(ex.notes||'')}" data-ei="${ei}" data-field="notes">
    <table class="sets-table">
      <thead><tr><th>#</th>${headCols}<th></th></tr></thead>
      <tbody class="sets-body" data-ei="${ei}"></tbody>
    </table>
    <table class="sets-table"><tbody>
      <tr class="add-set-row"><td colspan="${colspan}">
        <button class="add-set-mini" data-ei="${ei}">+ Add Set</button>
      </td></tr>
    </tbody></table>
  `;
  const tbody = block.querySelector('.sets-body');
  ex.sets.forEach(set => tbody.appendChild(buildSetRow(ex, ei, set)));
  return block;
}

function renderActiveSession() {
  awBody.innerHTML = '';
  if (!activeSession) return;
  if (activeSession.exercises.length === 0) {
    awBody.innerHTML = `<div class="empty-state" style="padding-top:60px">
      Tap <strong>Add Exercise</strong> below to get started.
    </div>`;
    return;
  }
  activeSession.exercises.forEach((ex, ei) => awBody.appendChild(buildExerciseBlock(ex, ei)));
}

function renumberSetRows(tbody) {
  [...tbody.querySelectorAll('.set-row')].forEach((row, i) => {
    row.querySelector('.set-num').textContent = i + 1;
  });
}

// ── Delegated listeners (bound ONCE — never rebound on render) ────────────────
awBody.addEventListener('input', e => {
  const t = e.target;
  if (t.classList.contains('set-input')) {
    const { ei, setId, field } = t.dataset;
    const { ex, set } = findSet(ei, setId);
    if (!set) return;
    if (field === 'reps')          set.reps = parseInt(t.value) || 0;
    else if (field === 'distance') set.distance = parseFloat(t.value) || 0;
    else if (field === 'time')     set.duration = parseTime(t.value);
    else                           set[field] = parseFloat(t.value) || 0;   // weight
    (set.touched ||= {})[field] = true;
    if (field === 'weight') queueSanityCheck(ex, set, t.closest('.set-row'));
    saveSoon();
  } else if (t.classList.contains('ex-notes-input')) {
    const ex = activeSession?.exercises[t.dataset.ei];
    if (ex) { ex.notes = t.value; saveSoon(); }
  }
});

awBody.addEventListener('click', e => {
  const check = e.target.closest('.set-check');
  if (check) {
    // If a swipe revealed the delete button, this cell hosts it instead
    if (check.classList.contains('as-delete')) {
      deleteSet(check.dataset.ei, check.dataset.setId);
      return;
    }
    toggleSetDone(check.dataset.ei, check.dataset.setId, check.closest('.set-row'));
    return;
  }
  const addSet = e.target.closest('.add-set-mini');
  if (addSet) {
    const ei = parseInt(addSet.dataset.ei);
    const ex = activeSession.exercises[ei];
    const last = ex.sets.at(-1);
    const set = {
      id: uid(), type: 'normal', weight: 0, reps: 0, done: false,
      touched: { weight: false, reps: false },
      tW: last?.weight || last?.tW || null,
      tR: last?.reps   || last?.tR || null,
    };
    ex.sets.push(set);
    const tbody = awBody.querySelector(`.sets-body[data-ei="${ei}"]`);
    tbody.appendChild(buildSetRow(ex, ei, set));
    saveSoon();
    return;
  }
  const step = e.target.closest('.ex-rest-step');
  if (step) {
    const ei = parseInt(step.dataset.ei);
    const ex = activeSession.exercises[ei];
    ex.restTime = Math.max(0, (ex.restTime ?? 60) + parseInt(step.dataset.delta));
    document.getElementById('restval-' + ei).textContent = fmtRest(ex.restTime);
    saveSoon();
    return;
  }
  const restVal = e.target.closest('.ex-rest-value');
  if (restVal) { openRestSheet(parseInt(restVal.dataset.ei)); return; }
  const cueBtn = e.target.closest('.ex-cue-btn');
  if (cueBtn) { showCues(cueBtn.dataset.cue); return; }
  const menuBtn = e.target.closest('.ex-menu-btn');
  if (menuBtn) { openExMenuSheet(parseInt(menuBtn.dataset.ei)); return; }
});

// ── Rest-timer preset sheet (tap the value; includes Off) ─────────────────────
let restSheetEi = null;
function openRestSheet(ei) {
  restSheetEi = ei;
  const cur = activeSession.exercises[ei]?.restTime ?? 60;
  document.querySelectorAll('#restPresetGrid .rest-preset').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.secs) === cur));
  document.getElementById('restSheet').classList.add('open');
}
document.getElementById('restSheetCancel').onclick = () => document.getElementById('restSheet').classList.remove('open');
document.getElementById('restSheet').addEventListener('click', e => {
  if (e.target === document.getElementById('restSheet')) document.getElementById('restSheet').classList.remove('open');
});
document.querySelectorAll('#restPresetGrid .rest-preset').forEach(btn => {
  btn.onclick = () => {
    if (restSheetEi == null || !activeSession) return;
    const secs = parseInt(btn.dataset.secs);
    activeSession.exercises[restSheetEi].restTime = secs;
    const el = document.getElementById('restval-' + restSheetEi);
    if (el) el.textContent = fmtRest(secs);
    document.getElementById('restSheet').classList.remove('open');
    saveSoon();
  };
});

function toggleSetDone(ei, setId, rowEl) {
  const { ex, set, si } = findSet(ei, setId);
  if (!set) return;
  set.done = !set.done;

  const lt = resolveLogType(ex);
  set.touched ||= {};
  if (set.done) {
    // Commit ghosts: an empty checked set means "did the target"
    const commit = (field, ghost) => {
      if (ghost == null || ghost === 0 || ghost === '') return;
      if (field === 'time') {
        if (!set.duration && !set.touched.time) { set.duration = ghost; const i = rowEl.querySelector('[data-field="time"]'); if (i) i.value = fmtDuration(ghost); }
      } else if (!set[field] && !set.touched[field]) {
        set[field] = ghost; const i = rowEl.querySelector(`[data-field="${field}"]`); if (i) i.value = ghost;
      }
    };
    const prev = ex.prevSets?.[si] ?? null;
    if (lt === 'weighted')   { commit('weight', set.tW); commit('reps', set.tR); }
    else if (lt === 'bodyweight') commit('reps', set.tR ?? prev?.reps);
    else if (lt === 'duration')   commit('time', prev?.duration);
    else if (lt === 'cardio')   { commit('distance', prev?.distance); commit('time', prev?.duration); }

    // Auto-fill the next set + jump focus so the keyboard stays up (weighted flow).
    const next = ex.sets[si + 1];
    if (next && !next.done) {
      const nextRow = rowEl.parentElement.querySelector(`.set-row[data-set-id="${next.id}"]`);
      if (lt === 'weighted') {
        const nWeight = nextRow?.querySelector('[data-field="weight"]');
        if (nWeight && !next.touched?.weight && set.weight) { next.weight = set.weight; nWeight.value = set.weight; }
        const target = nextRow?.querySelector('[data-field="reps"]') || nWeight;
        if (target) { target.focus({ preventScroll: true }); try { target.select(); } catch(_) {} }
      } else {
        const target = nextRow?.querySelector('.set-input');
        if (target) { target.focus({ preventScroll: true }); try { target.select(); } catch(_) {} }
      }
    }

    // PB detection
    if (!routineMode) {
      const pbs = detectPBs(ex.name, set, sessionRecords);
      if (pbs.length) {
        activeSession.pbs.push(...pbs);
        rowEl.classList.add('pb');
        showPbToast(pbs[0]);
      }
      absorbSet(ex.name, set, sessionRecords);
    }

    unlockAudio();
    if (!routineMode) startRest(ex.restTime ?? 60, ex.name);
  }

  rowEl.classList.toggle('done', set.done);
  rowEl.querySelector('.set-check').textContent = set.done ? '✓' : '';
  saveSoon();
}

function deleteSet(ei, setId) {
  const { ex, si } = findSet(ei, setId);
  if (!ex || si < 0) return;
  ex.sets.splice(si, 1);
  const tbody = awBody.querySelector(`.sets-body[data-ei="${ei}"]`);
  tbody.querySelector(`.set-row[data-set-id="${setId}"]`)?.remove();
  renumberSetRows(tbody);
  saveSoon();
}

function toggleDropSet(ei, setId) {
  const { set } = findSet(ei, setId);
  if (!set || set.type === 'warmup') return;
  set.type = set.type === 'dropset' ? 'normal' : 'dropset';
  const row = awBody.querySelector(`.set-row[data-set-id="${setId}"]`);
  row?.classList.toggle('set-dropset', set.type === 'dropset');
  saveSoon();
}

// ── PB toast ──────────────────────────────────────────────────────────────────
let pbToastTimer = null;
function showPbToast(pb) {
  const el = document.getElementById('pbToast');
  el.innerHTML = `🏆 <strong>PB!</strong> ${esc(pb.exercise)} — ${esc(pb.label)}`;
  el.classList.add('visible');
  clearTimeout(pbToastTimer);
  pbToastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

// ── Typo guard ────────────────────────────────────────────────────────────────
let sanityTimer = null;
function queueSanityCheck(ex, set, rowEl) {
  clearTimeout(sanityTimer);
  sanityTimer = setTimeout(() => checkWeightSanity(ex, set, rowEl), 400);
}
function checkWeightSanity(ex, set, rowEl) {
  if (!rowEl) return;
  const tbody = rowEl.parentElement;
  const existing = tbody?.querySelector(`.set-warn-row[data-for="${set.id}"]`);
  const best = sessionRecords[ex.name]?.maxWeight || set.tW || 0;
  const suspect = best > 0 && set.weight > 0 && (set.weight > best * 2 || set.weight < best * 0.4);
  rowEl.classList.toggle('warn', suspect);
  if (!suspect) { existing?.remove(); return; }
  if (existing) return;
  const tr = document.createElement('tr');
  tr.className = 'set-warn-row';
  tr.dataset.for = set.id;
  tr.innerHTML = `<td colspan="5">⚠️ Unusual weight — best previous is ${fmtKg(best)} kg. Typo?</td>`;
  rowEl.after(tr);
}

// ── Exercise "…" action sheet ─────────────────────────────────────────────────
let menuEi = null;
function openExMenuSheet(ei) {
  menuEi = ei;
  const ex = activeSession.exercises[ei];
  document.getElementById('exMenuTitle').textContent = ex.name;
  document.getElementById('exMenuSheet').classList.add('open');
}
const exMenuSheet = document.getElementById('exMenuSheet');
exMenuSheet.addEventListener('click', e => { if (e.target === exMenuSheet) exMenuSheet.classList.remove('open'); });
document.getElementById('exMenuCancel').onclick  = () => exMenuSheet.classList.remove('open');
document.getElementById('exMenuReplace').onclick = () => {
  exMenuSheet.classList.remove('open');
  openExPicker({ replaceEi: menuEi });
};
document.getElementById('exMenuReorder').onclick = () => {
  exMenuSheet.classList.remove('open');
  enterReorderMode();
};
document.getElementById('exMenuRemove').onclick = () => {
  const ex = activeSession.exercises[menuEi];
  exMenuSheet.classList.remove('open');
  if (confirm(`Remove "${ex.name}" from this workout?`)) {
    activeSession.exercises.splice(menuEi, 1);
    renderActiveSession();
    saveSoon();
  }
};

// ── Replace exercise ("often picked" learned per original exercise) ──────────
async function replaceExercise(ei, newName, newCat) {
  const past = await loadSessions();
  const old = activeSession.exercises[ei];
  const prev = prevPerfFrom(past, newName);

  // Remember this replacement so it ranks first next time
  const prefs = (await db.get(STORE, 'replacement-prefs')) || {};
  const m = (prefs[old.name] ||= {});
  m[newName] = (m[newName] || 0) + 1;
  await db.set(STORE, 'replacement-prefs', prefs);

  // Re-derive logType/repRange for the NEW exercise — carrying over the old
  // exercise's was a bug: e.g. replacing a weighted lift with a duration-based
  // one (a plank, cardio) kept showing weight×reps columns.
  const allEx = await getAllExercises();
  const def = allEx.find(x => x.name === newName);
  const logType = prev?.logType || def?.logType || exLogType(newName, newCat);

  activeSession.exercises[ei] = {
    ...old,
    name: newName, category: newCat, logType,
    notes: prev?.notes || '',
    repRange: def?.repRange || null,
    prevPerf: prev ? prev.sets.slice(0,3).map(s => `${fmtKg(s.weight)}×${s.reps}`).join(', ') : null,
    prevSets: prev?.sets || null,
    restTime: old.restTime ?? prev?.restTime ?? 60,
    // Completed sets keep their logged numbers; pending sets get re-ghosted
    sets: old.sets.map((s, si) => {
      if (s.done) return s;
      const g = ghostsFor(prev?.sets || null, null, si);
      return {
        ...s, tW: g.tW, tR: g.tR,
        weight: s.touched?.weight ? s.weight : 0,
        reps:   s.touched?.reps   ? s.reps   : 0,
      };
    }),
  };
  renderActiveSession();
  saveSoon();
}

// ── Reorder mode (long-press or menu) ─────────────────────────────────────────
let reordering = false;
function enterReorderMode() {
  if (!activeSession?.exercises.length) return;
  reordering = true;
  try { navigator.vibrate?.(10); } catch(_) {}
  awBody.innerHTML = `
    <div class="reorder-hint">Drag to reorder, then tap Done.</div>
    <div id="reorderList">
      ${activeSession.exercises.map((ex, ei) => `
        <div class="reorder-card" data-ei="${ei}">
          <span class="ex-cat-dot" style="background:${CATEGORY_COLORS[ex.category]||'#888'}"></span>
          <span class="reorder-name">${esc(ex.name)}</span>
          <span class="reorder-grip">☰</span>
        </div>`).join('')}
    </div>
    <button class="reorder-done" id="reorderDone">Done</button>
  `;
  document.getElementById('reorderDone').onclick = exitReorderMode;
}
function exitReorderMode() {
  const order = [...awBody.querySelectorAll('.reorder-card')].map(c => parseInt(c.dataset.ei));
  activeSession.exercises = order.map(i => activeSession.exercises[i]);
  reordering = false;
  renderActiveSession();
  saveSoon();
}

// ── Touch gestures: swipe on set rows, long-press on exercise headers,
//    drag in reorder mode. Pointer events only; touch-action does the rest. ────
// ── Set-row swipe gestures (work anywhere on the row, including the inputs) ────
// Taps still focus inputs; a clear horizontal drag becomes a swipe. Swipe left
// past threshold deletes the set (slide-out); swipe right toggles a drop set.
const gesture = { active: false };
let longPressTimer = null;
const SWIPE = { DECIDE: 10, DELETE: 72, DROP: 58, HINT: 22, MAX: 130 };

awBody.addEventListener('pointerdown', e => {
  if (reordering) {
    const card = e.target.closest('.reorder-card');
    if (card) startReorderDrag(e, card);
    return;
  }
  const header = e.target.closest('.ex-block-header');
  if (header && !e.target.closest('button')) {
    longPressTimer = setTimeout(() => { longPressTimer = null; enterReorderMode(); }, 400);
  }
  const row = e.target.closest('.set-row');
  // Allow swipe to begin on inputs too — only the check button is excluded so
  // its completion tap is never hijacked.
  if (!row || e.target.closest('.set-check') || row.classList.contains('removing')) return;
  Object.assign(gesture, {
    active: true, row, startX: e.clientX, startY: e.clientY,
    pointerId: e.pointerId, decided: false, horizontal: false, dx: 0,
    onInput: !!e.target.closest('.set-input'),
  });
});

awBody.addEventListener('pointermove', e => {
  if (longPressTimer !== null) {
    if (Math.abs(e.movementX || 0) > 8 || Math.abs(e.movementY || 0) > 8) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  if (!gesture.active) return;
  const dx = e.clientX - gesture.startX;
  const dy = e.clientY - gesture.startY;
  if (!gesture.decided && (Math.abs(dx) > SWIPE.DECIDE || Math.abs(dy) > SWIPE.DECIDE)) {
    gesture.decided = true;
    gesture.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (gesture.horizontal) {
      try { gesture.row.setPointerCapture?.(gesture.pointerId); } catch(_) {}
      if (gesture.onInput) document.activeElement?.blur?.();   // drop the caret when a swipe wins
      gesture.row.classList.add('snapping');                    // ensure no transition lag mid-drag
      gesture.row.classList.remove('snapping');
    } else {
      gesture.active = false;                                   // vertical → let the list scroll
      return;
    }
  }
  if (gesture.decided && gesture.horizontal) {
    // light resistance past MAX so it never flies off
    let d = dx;
    if (Math.abs(d) > SWIPE.MAX) d = Math.sign(d) * (SWIPE.MAX + (Math.abs(d) - SWIPE.MAX) * 0.25);
    gesture.dx = d;
    gesture.row.style.transform = `translateX(${d}px)`;
    gesture.row.classList.toggle('swipe-del',  d <= -SWIPE.HINT);
    gesture.row.classList.toggle('swipe-drop', d >=  SWIPE.HINT);
    if (e.cancelable) e.preventDefault();
  }
});

function endSwipe(e) {
  clearTimeout(longPressTimer); longPressTimer = null;
  if (!gesture.active) return;
  const { row, dx, horizontal } = gesture;
  gesture.active = false;
  if (!horizontal) return;
  row.classList.remove('swipe-del', 'swipe-drop');
  const ei = row.dataset.ei, setId = row.dataset.setId;

  if (e.type !== 'pointercancel' && dx <= -SWIPE.DELETE) {
    slideOutDelete(row, ei, setId);
    return;
  }
  if (e.type !== 'pointercancel' && dx >= SWIPE.DROP) {
    toggleDropSet(ei, setId);
  }
  snapBack(row);
}
awBody.addEventListener('pointerup', endSwipe);
awBody.addEventListener('pointercancel', endSwipe);

function snapBack(row) {
  row.classList.add('snapping');
  row.style.transform = '';
  setTimeout(() => row.classList.remove('snapping'), 200);
}

function slideOutDelete(row, ei, setId) {
  row.classList.add('removing');
  row.style.transform = 'translateX(-110%)';
  setTimeout(() => deleteSet(ei, setId), 210);
}

// Reorder-mode dragging
function startReorderDrag(e, card) {
  const list = document.getElementById('reorderList');
  card.setPointerCapture?.(e.pointerId);
  card.classList.add('dragging');
  // anchorY maps the finger position to transform:0 (card at its DOM slot). When
  // we reorder in the DOM, the card's natural slot shifts by a row height, so we
  // adjust anchorY by that amount to keep the card glued to the finger — this is
  // what prevents the jump/overlap glitch.
  let anchorY = e.clientY;

  const move = ev => {
    if (ev.cancelable) ev.preventDefault();
    card.style.transform = `translateY(${ev.clientY - anchorY}px)`;
    const rect = card.getBoundingClientRect();
    const cardMid = rect.top + rect.height / 2;
    for (const other of [...list.querySelectorAll('.reorder-card')]) {
      if (other === card) continue;
      const r = other.getBoundingClientRect();
      const otherMid = r.top + r.height / 2;
      const pos = card.compareDocumentPosition(other);
      // dragged above a preceding neighbour → move card up before it
      if (pos & Node.DOCUMENT_POSITION_PRECEDING && cardMid < otherMid) {
        list.insertBefore(card, other);
        anchorY -= r.height;
        card.style.transform = `translateY(${ev.clientY - anchorY}px)`;
        break;
      }
      // dragged below a following neighbour → move card down after it
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING && cardMid > otherMid) {
        other.after(card);
        anchorY += r.height;
        card.style.transform = `translateY(${ev.clientY - anchorY}px)`;
        break;
      }
    }
  };
  const up = () => {
    card.classList.add('snapback');
    card.style.transform = '';
    card.classList.remove('dragging');
    setTimeout(() => card.classList.remove('snapback'), 150);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', up);
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}

// ── Finish workout ────────────────────────────────────────────────────────────
document.getElementById('awFinishBtn').onclick = () => {
  if (!activeSession) return;
  if (routineMode) {
    if (activeSession.exercises.length === 0) { cancelWorkout(); return; }
    openSaveTemplateModal();
    return;
  }
  if (activeSession.exercises.length === 0) { cancelWorkout(); return; }
  showWorkoutSummary();
};

function finishWarnings() {
  const warnings = [];
  let incomplete = 0, empty = 0, suspect = 0;
  for (const ex of activeSession.exercises) {
    const done = ex.sets.filter(s => s.done);
    if (!done.length) { empty++; continue; }
    incomplete += ex.sets.length - done.length;
    const best = sessionRecords[ex.name]?.maxWeight || 0;
    for (const s of done) {
      if (best > 0 && s.weight > best * 2) suspect++;
    }
  }
  if (empty)      warnings.push(`${empty} exercise${empty>1?'s':''} with no completed sets`);
  if (incomplete) warnings.push(`${incomplete} set${incomplete>1?'s':''} not checked off`);
  if (suspect)    warnings.push(`${suspect} set${suspect>1?'s':''} with an unusually heavy weight — typo?`);
  return warnings;
}

function showWorkoutSummary() {
  skipRest();
  const title = document.getElementById('awTitle').value.trim() || 'Workout';
  activeSession.title = title;

  const doneSets = activeSession.exercises.flatMap(e => e.sets.filter(s => s.done));
  const volume   = doneSets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 1), 0);
  const exCount  = activeSession.exercises.length;
  const pbCount  = activeSession.pbs?.length || 0;

  document.getElementById('summaryTitle').textContent = title;
  document.getElementById('summaryDate').textContent  = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('summaryStats').innerHTML = `
    <div class="stat-box"><div class="stat-val">${fmtTime(sessionSecsNow())}</div><div class="stat-label">Duration</div></div>
    <div class="stat-box"><div class="stat-val">${doneSets.length}</div><div class="stat-label">Sets</div></div>
    <div class="stat-box"><div class="stat-val">${Math.round(volume).toLocaleString()}</div><div class="stat-label">Volume kg</div></div>
    <div class="stat-box"><div class="stat-val">${pbCount ? '🏆 ' + pbCount : '—'}</div><div class="stat-label">PBs</div></div>
  `;

  const warnings = finishWarnings();
  document.getElementById('summaryWarnings').innerHTML = warnings.length
    ? `<div class="summary-warn-box">⚠️ ${warnings.map(esc).join('<br>⚠️ ')}<br><span>Check before saving, or save anyway.</span></div>`
    : '';

  document.getElementById('summaryExercises').innerHTML =
    activeSession.exercises.map(e =>
      `${esc(e.name)} — ${e.sets.filter(s=>s.done).length} sets`
    ).join('<br>');

  document.getElementById('workoutSummary').classList.add('visible');
}

function handleSummaryBgClick(e) {
  if (e.target === document.getElementById('workoutSummary')) {
    // Tap outside = go back to the workout, not lose it
    document.getElementById('workoutSummary').classList.remove('visible');
  }
}

document.getElementById('saveBtn').onclick    = saveWorkout;
document.getElementById('discardBtn').onclick = () => { if (confirm('Discard this workout? All logged sets will be lost.')) cancelWorkout(); };

async function saveWorkout() {
  releaseWakeLock();
  const session = {
    ...activeSession,
    title:    document.getElementById('awTitle').value.trim() || 'Workout',
    endTime:  new Date().toISOString(),
    duration: sessionSecsNow(),
    date:     new Date().toISOString().slice(0,10),
    // Strip transient/derived fields — prevPerf/prevSets were only ghosting aids
    // for the live editor and would otherwise bloat every saved session forever.
    exercises: activeSession.exercises.map(({ prevPerf, prevSets, ...e }) => ({
      ...e,
      sets: e.sets.map(({ touched, tW, tR, ...s }) => s), // strip transient fields
    })),
  };
  await db.set(STORE, 'session-' + session.id, session);
  await clearActiveSessionStore();
  document.getElementById('workoutSummary').classList.remove('visible');
  document.getElementById('activeWorkout').classList.remove('visible');
  unfitActiveWorkout();
  activeSession = null;
  document.getElementById('miniBar').classList.remove('visible');
  renderDashboard();
}

function cancelWorkout() {
  releaseWakeLock();
  skipRest();
  routineMode = false;
  activeSession = null;
  clearActiveSessionStore();
  document.getElementById('workoutSummary').classList.remove('visible');
  document.getElementById('activeWorkout').classList.remove('visible');
  unfitActiveWorkout();
  document.getElementById('miniBar').classList.remove('visible');
}

// ── Rest-end chime (Web Audio — no asset needed) ─────────────────────────────
// NOTE: iOS mutes Web Audio when the ringer switch is on silent, and there is
// no way to play sound while the PWA is backgrounded — the chime fires on
// return if rest elapsed while hidden. Vibration is Android-only.
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') audioCtx.resume();
    // Warm the hardware with a silent tick so the first real chime isn't eaten
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
  } catch (_) {}
}
function playChime() {
  if (!audioCtx) return;
  const play = () => {
    try {
      // Loud, attention-grabbing alarm: two urgent triads through a limiter so
      // it's as loud as possible without clipping. (iOS still respects the
      // physical mute switch — nothing JS can do about that.)
      const comp = audioCtx.createDynamicsCompressor();
      comp.threshold.value = -8; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.1;
      comp.connect(audioCtx.destination);
      const master = audioCtx.createGain();
      master.gain.value = 1.0;
      master.connect(comp);

      const now = audioCtx.currentTime;
      const beeps = [0, 0.16, 0.32, 0.62, 0.78, 0.94]; // two triads
      const freqs = [988, 1319, 1568, 988, 1319, 1568];
      beeps.forEach((offset, i) => {
        const t = now + offset;
        // layer a sine + square for a fuller, louder tone
        ['sine', 'square'].forEach((type, j) => {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = type;
          osc.frequency.value = freqs[i];
          const peak = type === 'square' ? 0.28 : 0.6;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(peak, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(g).connect(master);
          osc.start(t);
          osc.stop(t + 0.16);
        });
      });
    } catch (_) {}
  };
  try {
    if (audioCtx.state !== 'running') audioCtx.resume().then(play).catch(() => {});
    else play();
  } catch (_) {}
}

// ── Rest timer (timestamp-based; survives backgrounding & reload) ────────────
function startRest(secs = 60, exName = '') {
  if (secs <= 0) { skipRest(); return; }
  clearInterval(restTimer);
  restEndsAt = Date.now() + secs * 1000;
  restTotalSecs = secs;
  restFiredChime = false;
  db.set(STORE, 'active-rest', { endsAt: restEndsAt, totalSecs: secs, exName });
  const bar = document.getElementById('restBar');
  bar.classList.add('visible');
  bar.classList.remove('flash', 'done-state');
  document.getElementById('restBarName').textContent = exName ? `Rest — ${exName}` : 'Rest';
  tickRest();
  restTimer = setInterval(tickRest, 250);
}

function tickRest() {
  if (!restEndsAt) return;
  const remaining = Math.ceil((restEndsAt - Date.now()) / 1000);
  updateRestDisplay(remaining);
  if (remaining <= 0) finishRest();
}

function finishRest() {
  if (restFiredChime) return;
  restFiredChime = true;
  clearInterval(restTimer);
  updateRestDisplay(0);
  const bar = document.getElementById('restBar');
  if (bar) {
    bar.classList.add('flash', 'done-state');            // pulses until dismissed
    document.getElementById('restBarName').textContent = '✅ Rest done — next set!';
  }
  playChime();
  try { navigator.vibrate?.([300,120,300,120,300]); } catch(_) {}
  // NB: intentionally NOT auto-dismissed — the bar stays visible/pulsing until
  // the user hits Skip or checks off the next set (which restarts the timer).
}

function updateRestDisplay(remaining) {
  const el = document.getElementById('restBarCount');
  if (!el) return;
  const r = Math.max(0, remaining);
  el.textContent = fmtTime(r);
  el.className = 'rest-bar-count' + (r <= 0 ? ' done' : r <= 10 ? ' low' : '');
  const fill = document.getElementById('restBarFill');
  if (fill && restTotalSecs > 0) {
    fill.style.width = `${Math.max(0, Math.min(100, (r / restTotalSecs) * 100))}%`;
  }
}

function skipRest() {
  clearInterval(restTimer);
  restEndsAt = null;
  const bar = document.getElementById('restBar');
  bar?.classList.remove('visible', 'flash', 'done-state');
  db.set(STORE, 'active-rest', null);
}

function bumpRest(delta) {
  if (!restEndsAt) return;
  restEndsAt = Math.max(Date.now() + 1000, restEndsAt + delta * 1000);
  restTotalSecs = Math.max(restTotalSecs + delta, 1);
  restFiredChime = false;
  db.set(STORE, 'active-rest', { endsAt: restEndsAt, totalSecs: restTotalSecs });
  tickRest();
}

function resumeRestFromDb(saved) {
  if (!saved?.endsAt) return;
  restTotalSecs = saved.totalSecs || 60;
  if (saved.endsAt > Date.now()) {
    restEndsAt = saved.endsAt;
    restFiredChime = false;
    const bar = document.getElementById('restBar');
    bar.classList.add('visible');
    document.getElementById('restBarName').textContent = saved.exName ? `Rest — ${saved.exName}` : 'Rest';
    clearInterval(restTimer);
    tickRest();
    restTimer = setInterval(tickRest, 250);
  } else if (Date.now() - saved.endsAt < 60_000) {
    // Expired very recently (probably while backgrounded) — signal once
    restEndsAt = saved.endsAt;
    document.getElementById('restBar').classList.add('visible');
    finishRest();
  } else {
    db.set(STORE, 'active-rest', null);
  }
}

// ── Visibility: the app coming back from background ───────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (activeSession) saveActiveSession(); // flush — beforeunload is unreliable on iOS
    return;
  }
  // visible again
  if (activeSession) {
    acquireWakeLock(); // iOS silently releases it on hide
  }
  if (restEndsAt) {
    if (Date.now() >= restEndsAt) finishRest();
    else tickRest();
  }
});

// expose to HTML
window.skipRest = skipRest;
window.bumpRest = bumpRest;
window.handleSummaryBgClick = handleSummaryBgClick;
window.openActiveWorkout = openActiveWorkout;

// ── Exercise picker (also handles replace mode) ───────────────────────────────
let epFilter = 'All';
let epReplaceEi = null; // when set, picking replaces instead of appends

async function getAllExercises() {
  const custom = (await db.get(STORE, 'exercises-custom')) || [];
  return [...EXERCISES, ...custom.map(e => ({ ...e, custom: true }))];
}

document.getElementById('awAddExBtn').onclick   = () => openExPicker();
document.getElementById('epCancel').onclick     = closeExPicker;

function openExPicker(opts = {}) {
  epFilter = 'All';
  epReplaceEi = opts.replaceEi ?? null;
  document.getElementById('epSearch').value = '';
  document.getElementById('epSearch').placeholder = epReplaceEi !== null
    ? `Replace ${activeSession.exercises[epReplaceEi].name}…`
    : 'Search exercises…';
  document.getElementById('exercisePicker').classList.add('visible');
  renderExPicker();
  setTimeout(() => document.getElementById('epSearch').focus(), 150);
}

function closeExPicker() {
  epReplaceEi = null;
  document.getElementById('exercisePicker').classList.remove('visible');
}

document.getElementById('epSearch').oninput = renderExPicker;

async function renderExPicker() {
  const q    = document.getElementById('epSearch').value.toLowerCase();
  const all  = await getAllExercises();
  const cats = ['All', ...CATEGORIES];

  const filtersEl = document.getElementById('epFilters');
  filtersEl.innerHTML = cats.map(c =>
    `<button class="ep-filter ${c === epFilter ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  filtersEl.querySelectorAll('.ep-filter').forEach(btn => {
    btn.onclick = () => { epFilter = btn.dataset.cat; renderExPicker(); };
  });

  const filtered = all.filter(e =>
    (epFilter === 'All' || e.category === epFilter) &&
    (!q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  );

  // "Often picked" replacements for the exercise being swapped out
  let oftenHTML = '';
  if (epReplaceEi !== null && !q && epFilter === 'All') {
    const prefs = (await db.get(STORE, 'replacement-prefs')) || {};
    const orig = activeSession.exercises[epReplaceEi]?.name;
    const ranked = Object.entries(prefs[orig] || {}).sort((a,b) => b[1] - a[1]).slice(0, 5);
    // Sensible fallback: same-category alternatives
    const cat = activeSession.exercises[epReplaceEi]?.category;
    const sameCat = ranked.length ? [] :
      all.filter(e => e.category === cat && e.name !== orig).slice(0, 4).map(e => [e.name, 0]);
    const picks = ranked.length ? ranked : sameCat;
    if (picks.length) {
      const lookup = Object.fromEntries(all.map(e => [e.name, e.category]));
      oftenHTML = `
        <div class="ep-often-head">${ranked.length ? 'Often picked instead' : 'Same muscle group'}</div>
        ${picks.map(([name]) => `
          <div class="ep-item ep-often" data-name="${esc(name)}" data-cat="${esc(lookup[name] || cat)}">
            <span class="ep-cat-pill" style="background:${CATEGORY_COLORS[lookup[name] || cat]||'#888'}">${esc(lookup[name] || cat)}</span>
            <span class="ep-ex-name">${esc(name)}</span>
          </div>`).join('')}
        <div class="ep-often-sep"></div>`;
    }
  }

  const listEl = document.getElementById('epList');
  listEl.innerHTML = oftenHTML + filtered.map(e => `
    <div class="ep-item" data-name="${esc(e.name)}" data-cat="${esc(e.category)}">
      <span class="ep-cat-pill" style="background:${CATEGORY_COLORS[e.category]||'#888'}">${esc(e.category)}</span>
      <span class="ep-ex-name">${esc(e.name)}</span>
      ${e.custom ? '<span style="font-size:0.65rem;color:var(--text-muted)">Custom</span>' : ''}
    </div>
  `).join('') + `
    <div class="ep-custom-row">
      <button class="ep-custom-btn" id="epAddCustom">+ Create custom exercise</button>
    </div>
  `;

  listEl.querySelectorAll('.ep-item').forEach(item => {
    item.onclick = async () => {
      if (epReplaceEi !== null) {
        const ei = epReplaceEi;
        closeExPicker();
        await replaceExercise(ei, item.dataset.name, item.dataset.cat);
      } else {
        await addExerciseToSession(item.dataset.name, item.dataset.cat);
        closeExPicker();
        renderActiveSession();
        saveSoon();
      }
    };
  });

  document.getElementById('epAddCustom').onclick = () => {
    closeExPicker();
    openCustomExModal();
  };
}

async function addExerciseToSession(name, category) {
  const past = await loadSessions();
  const prev = prevPerfFrom(past, name);
  const prevSets = prev?.sets || null;
  // logType: prefer the previous session's / custom exercise's stored type, else infer.
  const all = await getAllExercises();
  const def = all.find(e => e.name === name);
  const logType = prev?.logType || def?.logType || exLogType(name, category);
  activeSession.exercises.push({
    id: uid(), name, category, logType,
    notes: prev?.notes || '',
    restTime: prev?.restTime ?? 60,
    repRange: def?.repRange || null,
    prevPerf: prev ? prev.sets.slice(0,3).map(s => `${fmtKg(s.weight)}×${s.reps}`).join(', ') : null,
    prevSets,
    sets: [freshSet(null, prevSets, 0)],
  });
}

// Most recent past performance of an exercise, from a preloaded session list.
function prevPerfFrom(sessions, exerciseName) {
  for (const s of sessions) {
    if (s.id === activeSession?.id) continue;
    const ex = s.exercises.find(e => e.name === exerciseName);
    if (ex?.sets?.length) return ex;
  }
  return null;
}

// ── Custom exercise modal ─────────────────────────────────────────────────────
function openCustomExModal() {
  const sel = document.getElementById('customExCat');
  sel.innerHTML = CATEGORIES.map(c => `<option>${c}</option>`).join('');
  const typeSel = document.getElementById('customExType');
  typeSel.innerHTML = Object.entries(LOGTYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  document.getElementById('customExName').value = '';
  document.getElementById('customExModal').classList.add('open');
}
document.getElementById('customExCancel').onclick = () => document.getElementById('customExModal').classList.remove('open');
document.getElementById('customExSave').onclick = async () => {
  const name = document.getElementById('customExName').value.trim();
  if (!name) return;
  const cat     = document.getElementById('customExCat').value;
  const logType = document.getElementById('customExType').value || 'weighted';
  const custom = (await db.get(STORE, 'exercises-custom')) || [];
  const entry = { id: uid(), name, category: cat, logType, custom: true };
  custom.push(entry);
  await db.set(STORE, 'exercises-custom', custom);
  document.getElementById('customExModal').classList.remove('open');
  await addExerciseToSession(name, cat);
  openActiveWorkout();
  renderActiveSession();
  saveSoon();
  lookupRepRangeForCustom(entry); // background AI lookup — updates in place when it resolves
};

// ── Ideal rep range for custom exercises: AI lookup + cache ───────────────────
// Patches any already-rendered rep-range badges for this exercise name in place.
function patchRepRangeBadge(name, range) {
  if (!range) return;
  document.querySelectorAll('.ex-rep-range').forEach(el => {
    if (el.dataset.exName === name) el.textContent = `🎯 Target: ${range.min}–${range.max} reps`;
  });
  if (activeSession) {
    for (const ex of activeSession.exercises) if (ex.name === name) ex.repRange = range;
  }
}

async function lookupRepRangeForCustom(entry) {
  if (entry.logType === 'duration' || entry.logType === 'cardio') return;
  const range = await fetchAIRepRange({ name: entry.name, category: entry.category, getKey: coachGetKey });
  if (!range) return;
  const list = (await db.get(STORE, 'exercises-custom')) || [];
  const idx = list.findIndex(e => e.id === entry.id);
  if (idx === -1) return;
  list[idx].repRange = range;
  await db.set(STORE, 'exercises-custom', list);
  patchRepRangeBadge(entry.name, range);
  saveSoon();
}

// One-time-per-load backfill: any saved custom exercise still missing a rep
// range (created before this feature, or before an API key was set) gets an
// AI lookup so "add to all existing" also covers exercises added earlier.
async function backfillCustomRepRanges() {
  const custom = (await db.get(STORE, 'exercises-custom')) || [];
  const pending = custom.filter(e => !e.repRange && e.logType !== 'duration' && e.logType !== 'cardio');
  if (!pending.length) return;
  const key = await coachGetKey();
  if (!key) return;
  let changed = false;
  for (const entry of pending) {
    const range = await fetchAIRepRange({ name: entry.name, category: entry.category, getKey: coachGetKey });
    if (range) {
      const idx = custom.findIndex(e => e.id === entry.id);
      if (idx !== -1) { custom[idx].repRange = range; changed = true; patchRepRangeBadge(entry.name, range); }
    }
  }
  if (changed) await db.set(STORE, 'exercises-custom', custom);
}

// ── Templates ─────────────────────────────────────────────────────────────────
async function getTemplates() { return (await db.get(STORE, 'templates')) || []; }

async function seedMyRoutinesOnce() {
  const done = await db.get(STORE, 'my-routines-seeded');
  if (done) return;
  const templates = await getTemplates();
  const existingNames = new Set(templates.map(t => t.name));
  for (const day of MY_ROUTINES) {
    if (existingNames.has(day.name)) continue;
    templates.push({ id: uid(), name: day.name, exercises: day.exercises });
  }
  await db.set(STORE, 'templates', templates);
  await db.set(STORE, 'my-routines-seeded', true);
}

async function fixIncompletePushDayOnce() {
  const done = await db.get(STORE, 'push-day-fixed');
  if (done) return;
  const OLD_NAME = 'Push Hypertrophy (Delts) [INCOMPLETE — add missing exercises]';
  const templates = await getTemplates();
  const idx = templates.findIndex(t => t.name === OLD_NAME);
  const complete = MY_ROUTINES.find(d => d.name === 'Push Hypertrophy (Delts)');
  if (idx !== -1 && complete) {
    templates[idx] = { ...templates[idx], name: complete.name, exercises: complete.exercises };
    await db.set(STORE, 'templates', templates);
  }
  await db.set(STORE, 'push-day-fixed', true);
}

document.getElementById('templateNameCancel').onclick = () => document.getElementById('templateNameModal').classList.remove('open');
document.getElementById('awFinishBtn').addEventListener('contextmenu', e => { e.preventDefault(); openSaveTemplateModal(); });

function openSaveTemplateModal() {
  const typed = document.getElementById('awTitle').value.trim();
  document.getElementById('templateNameInput').value = typed || activeSession?.title || '';
  document.getElementById('templateNameModal').classList.add('open');
}

document.getElementById('templateNameSave').onclick = async () => {
  const name = document.getElementById('templateNameInput').value.trim();
  if (!name) return;
  const templates = await getTemplates();
  templates.push({
    id: uid(), name,
    exercises: activeSession.exercises.map(e => ({
      name: e.name, category: e.category, restTime: e.restTime ?? 60, logType: resolveLogType(e),
      sets: e.sets.map(s => ({ weight: s.weight || s.tW || 0, reps: s.reps || s.tR || 0, distance: s.distance || 0, duration: s.duration || 0, type: s.type })),
    })),
  });
  await db.set(STORE, 'templates', templates);
  document.getElementById('templateNameModal').classList.remove('open');

  if (routineMode) {
    routineMode = false;
    activeSession = null;
    clearActiveSessionStore();
    document.getElementById('activeWorkout').classList.remove('visible');
    unfitActiveWorkout();
    renderDashboard();
  } else {
    alert('Saved as routine!');
  }
};

// ── Routine library (pre-built, science-backed splits) ────────────────────────
const libraryEl       = document.getElementById('routineLibrary');
const libraryDetailEl = document.getElementById('libraryDetail');
let openSplitId = null;

document.getElementById('libraryBtn').onclick = () => {
  renderLibraryList();
  libraryEl.classList.add('visible');
};
document.getElementById('libraryClose').onclick = () => libraryEl.classList.remove('visible');
document.getElementById('libraryDetailBack').onclick = () => libraryDetailEl.classList.remove('visible');

function renderLibraryList() {
  document.getElementById('libraryList').innerHTML = ROUTINE_LIBRARY.map(split => `
    <div class="split-card" data-split="${split.id}">
      <div class="split-name">${esc(split.name)}</div>
      <div class="split-tagline">${esc(split.tagline)}</div>
      <div class="split-meta">${esc(split.meta)}</div>
    </div>
  `).join('');
  document.querySelectorAll('.split-card').forEach(card => {
    card.onclick = () => openSplitDetail(card.dataset.split);
  });
}

function openSplitDetail(splitId) {
  const split = ROUTINE_LIBRARY.find(s => s.id === splitId);
  if (!split) return;
  openSplitId = splitId;
  document.getElementById('libraryDetailTitle').textContent = split.name;
  document.getElementById('libraryDetailTagline').textContent = `${split.meta} — ${split.tagline}`;
  document.getElementById('libraryDetailDays').innerHTML = split.days.map(day => `
    <div class="lib-day-card">
      <div class="lib-day-name">${esc(day.name)}</div>
      ${day.exercises.map(e => `
        <div class="lib-day-ex">
          <span class="lib-day-ex-name">${esc(e.name)}</span>
          <span>${e.sets.length}×${e.sets[0].reps}</span>
        </div>
      `).join('')}
    </div>
  `).join('');
  libraryDetailEl.classList.add('visible');
}

document.getElementById('libraryAddBtn').onclick = async () => {
  const split = ROUTINE_LIBRARY.find(s => s.id === openSplitId);
  if (!split) return;
  const templates = await getTemplates();
  const existingNames = new Set(templates.map(t => t.name));
  let added = 0;
  for (const day of split.days) {
    if (existingNames.has(day.name)) continue;
    templates.push({
      id: uid(), name: day.name,
      exercises: day.exercises.map(e => ({
        name: e.name, category: e.category, restTime: e.restTime,
        sets: e.sets.map(s => ({ weight: s.weight, reps: s.reps, type: s.type })),
      })),
    });
    added++;
  }
  await db.set(STORE, 'templates', templates);
  libraryDetailEl.classList.remove('visible');
  libraryEl.classList.remove('visible');
  renderDashboard();
  alert(added > 0
    ? `Added ${added} routine${added > 1 ? 's' : ''} from "${split.name}" — find them on your dashboard.`
    : `"${split.name}" is already in your routines.`);
};

// ── Streak (weekly, Hevy-style, with an editable seed) ────────────────────────
async function renderStreakChip(sessions) {
  const settings = await getStreakSettings();
  const { weeks, thisWeekCount, target } = computeStreak(sessions, settings);
  const el = document.getElementById('streakChip');
  if (!el) return;
  el.innerHTML = weeks > 0
    ? `🔥 <strong>${weeks}-week streak</strong> · ${thisWeekCount}/${target} this week`
    : `${thisWeekCount}/${target} workouts this week`;
}

document.getElementById('streakChip').onclick = async () => {
  const s = await getStreakSettings();
  document.getElementById('streakSeedInput').value   = s.seed || '';
  document.getElementById('streakTargetInput').value = s.target || 3;
  document.getElementById('streakModal').classList.add('open');
};
document.getElementById('streakCancel').onclick = () => document.getElementById('streakModal').classList.remove('open');
document.getElementById('streakModal').addEventListener('click', e => {
  if (e.target === document.getElementById('streakModal')) document.getElementById('streakModal').classList.remove('open');
});
document.getElementById('streakSave').onclick = async () => {
  const seed   = parseInt(document.getElementById('streakSeedInput').value) || 0;
  const target = Math.max(1, parseInt(document.getElementById('streakTargetInput').value) || 3);
  const prev = await getStreakSettings();
  await saveStreakSettings({
    seed, target,
    seedDate: seed !== prev.seed ? new Date().toISOString().slice(0,10) : (prev.seedDate || new Date().toISOString().slice(0,10)),
  });
  document.getElementById('streakModal').classList.remove('open');
  renderStreakChip(await loadSessions());
};

// ── Dashboard render ──────────────────────────────────────────────────────────
async function renderDashboard() {
  const templates = await getTemplates();
  const tmplEl = document.getElementById('templatesList');
  document.getElementById('routinesEmpty').style.display = templates.length ? 'none' : '';
  tmplEl.innerHTML = templates.map(t => `
    <div class="template-card" data-tid="${t.id}">
      <div>
        <div class="tc-name">${esc(t.name)}</div>
        <div class="tc-ex">${t.exercises.map(e=>esc(e.name)).join(' · ')}</div>
      </div>
      <button class="tc-del" data-del="${t.id}">✕</button>
    </div>
  `).join('');
  tmplEl.querySelectorAll('.template-card').forEach(card => {
    card.onclick = async e => {
      if (e.target.closest('[data-del]')) return;
      const t = templates.find(x => x.id === card.dataset.tid);
      startEmptyWorkout(t);
    };
  });
  tmplEl.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this routine?')) return;
      const ts = (await getTemplates()).filter(t => t.id !== btn.dataset.del);
      await db.set(STORE, 'templates', ts);
      renderDashboard();
    };
  });

  const sessions = await loadSessions();
  renderStreakChip(sessions);

  const recentEl = document.getElementById('recentList');
  if (!sessions.length) {
    recentEl.innerHTML = `<div class="empty-state">No workouts yet.<br>Tap Start Empty Workout or import from Hevy.</div>`;
    return;
  }
  recentEl.innerHTML = sessions.slice(0,5).map(s => workoutCard(s)).join('');
  recentEl.querySelectorAll('.workout-card').forEach(card => {
    card.onclick = () => openHistoryDetail(card.dataset.sid);
  });
}

function workoutCard(s) {
  const exList = (s.exercises||[]).slice(0,4).map(e => `<span class="wc-ex-tag">${esc(e.name)}</span>`).join('');
  const more   = (s.exercises||[]).length > 4 ? `<span class="wc-ex-tag">+${s.exercises.length - 4} more</span>` : '';
  const doneSets = (s.exercises||[]).flatMap(e => (e.sets||[]).filter(st => st.done));
  const vol = doneSets.reduce((a,st) => a + (st.weight||0)*(st.reps||1), 0);
  const pbCount = s.pbs?.length || 0;
  return `
    <div class="workout-card" data-sid="${s.id}">
      <div class="wc-header">
        <span class="wc-title">${esc(s.title||'Workout')}${pbCount ? ` <span class="wc-pb">🏆 ${pbCount}</span>` : ''}</span>
        <span class="wc-date">${fmtDate(s.date||s.startTime||'')}</span>
      </div>
      <div class="wc-meta">${fmtTime(s.duration||0)} · ${(s.exercises||[]).length} exercises · ${Math.round(vol).toLocaleString()} kg</div>
      <div class="wc-exercises">${exList}${more}</div>
    </div>`;
}

// ── Stats tab ─────────────────────────────────────────────────────────────────
let statsExercise = null;
let statsMonth = null; // { y, m } — defaults to current month
async function renderStats() {
  const el = document.getElementById('statsBody');
  const sessions = await loadSessions();
  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state">No workouts yet — stats appear after your first logged session.</div>`;
    return;
  }
  const chrono = [...sessions].reverse(); // oldest → newest for charts

  const totals = lifetimeTotals(sessions);
  const settings = await getStreakSettings();
  const streak = computeStreak(sessions, settings);
  const miles = computeMilestones(sessions, streak.weeks);
  const pbTotal = sessions.reduce((a, s) => a + (s.pbs?.length || 0), 0);
  const trophies = miles.earned.length + pbTotal;

  const freq = exerciseFrequency(sessions);
  if (!statsExercise && freq.length) statsExercise = freq[0].name;

  const now = new Date();
  if (!statsMonth) statsMonth = { y: now.getFullYear(), m: now.getMonth() };

  el.innerHTML = `
    ${monthlyViewHTML(sessions, statsMonth.y, statsMonth.m)}

    <div class="stats-totals">
      <div class="stat-box"><div class="stat-val">${totals.workouts}</div><div class="stat-label">Workouts</div></div>
      <div class="stat-box"><div class="stat-val">${totals.hours.toFixed(0)}h</div><div class="stat-label">Trained</div></div>
      <div class="stat-box"><div class="stat-val">${(totals.volume/1000).toFixed(1)}t</div><div class="stat-label">Lifted</div></div>
      <div class="stat-box"><div class="stat-val">🔥 ${streak.weeks}</div><div class="stat-label">Wk streak</div></div>
      <div class="stat-box"><div class="stat-val">🏆 ${trophies}</div><div class="stat-label">Trophies</div></div>
    </div>

    ${miles.earned.length ? `
      <div class="stats-card">
        <div class="stats-card-title">Milestones</div>
        <div class="milestone-wrap">${miles.earned.map(m => `<span class="milestone-chip">${m.icon} ${esc(m.label)}</span>`).join('')}</div>
      </div>` : ''}

    ${weeklyVolumeHTML(chrono)}
    ${muscleBalanceHTML(chrono)}

    <div class="stats-card">
      <div class="stats-card-title">Exercise progression</div>
      <select class="form-input" id="statsExSelect" style="margin-bottom:10px">
        ${freq.slice(0, 40).map(f => `<option ${f.name === statsExercise ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
      </select>
      <div id="statsProgression"></div>
    </div>
  `;

  // Month navigation
  const shiftMonth = delta => {
    let { y, m } = statsMonth;
    m += delta;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    statsMonth = { y, m };
    renderStats();
  };
  document.getElementById('monthPrev').onclick = () => shiftMonth(-1);
  const nextBtn = document.getElementById('monthNext');
  if (nextBtn && !nextBtn.disabled) nextBtn.onclick = () => shiftMonth(1);

  const renderProg = () => {
    document.getElementById('statsProgression').innerHTML =
      statsExercise ? progressionHTML(chrono, statsExercise) : '';
  };
  document.getElementById('statsExSelect').onchange = e => { statsExercise = e.target.value; renderProg(); };
  renderProg();
}

// ── History render ────────────────────────────────────────────────────────────
async function renderHistory() {
  const sessions = await loadSessions();
  const el = document.getElementById('historyList');
  document.getElementById('buildRoutinesBtn').style.display = sessions.length ? '' : 'none';
  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state">No history yet.<br>Import your Hevy CSV to load past workouts.</div>`;
    return;
  }

  const groups = {};
  sessions.forEach(s => {
    const d = s.date || s.startTime?.slice(0,10) || '';
    const key = d.slice(0,7);
    (groups[key] = groups[key] || []).push(s);
  });

  el.innerHTML = Object.entries(groups)
    .sort((a,b) => b[0].localeCompare(a[0]))
    .map(([key, ss]) => `
      <div class="month-heading">${new Date(key+'-15').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
      ${ss.map(s => workoutCard(s)).join('')}
    `).join('');

  el.querySelectorAll('.workout-card').forEach(card => {
    card.onclick = () => openHistoryDetail(card.dataset.sid);
  });
}

// ── History detail ────────────────────────────────────────────────────────────
function hdSetVal(ex, st) {
  const lt = resolveLogType(ex);
  if (lt === 'bodyweight') return `${st.reps || 0} reps`;
  if (lt === 'duration')   return st.duration ? fmtDuration(st.duration) : (st.reps ? `${st.reps} min` : '—');
  if (lt === 'cardio')     return `${st.distance || 0} km · ${st.duration ? fmtDuration(st.duration) : (st.reps ? st.reps + ' min' : '0:00')}`;
  return `${fmtKg(st.weight)} kg × ${st.reps} reps`;
}
async function openHistoryDetail(sessionId) {
  const s = await db.get(STORE, 'session-' + sessionId);
  if (!s) return;

  document.getElementById('hdTitle').textContent = s.title || 'Workout';
  document.getElementById('hdDelete').dataset.sid = sessionId;

  const body = document.getElementById('hdBody');
  const doneSets = (s.exercises||[]).flatMap(e => (e.sets||[]).filter(st => st.done));
  const vol = doneSets.reduce((a,st) => a + (st.weight||0)*(st.reps||1), 0);
  const pbCount = s.pbs?.length || 0;

  body.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div class="stat-box" id="hdDateBox" style="background:var(--surface);border-radius:10px;padding:10px 14px;min-width:80px;text-align:center;cursor:pointer">
        <div class="stat-val">${fmtDate(s.date||s.startTime||'')}</div>
        <div class="stat-label">Date ✎</div>
      </div>
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;text-align:center">
        <div class="stat-val">${fmtTime(s.duration||0)}</div>
        <div class="stat-label">Duration</div>
      </div>
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;text-align:center">
        <div class="stat-val">${Math.round(vol).toLocaleString()}</div>
        <div class="stat-label">Volume kg</div>
      </div>
      ${pbCount ? `
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;text-align:center">
        <div class="stat-val">🏆 ${pbCount}</div>
        <div class="stat-label">PBs</div>
      </div>` : ''}
    </div>
    ${pbCount ? `<div class="hd-pb-list">${s.pbs.map(p => `<div>🏆 ${esc(p.exercise)} — ${esc(p.label)}</div>`).join('')}</div>` : ''}
    ${(s.exercises||[]).map(ex => `
      <div style="background:var(--surface);border-radius:12px;padding:14px;margin-bottom:10px;border-left:4px solid ${CATEGORY_COLORS[ex.category]||'#4fc3f7'}">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:10px">${esc(ex.name)}</div>
        ${ex.notes ? `<div style="font-size:0.75rem;color:var(--text-muted);margin:-6px 0 8px">📝 ${esc(ex.notes)}</div>` : ''}
        ${(ex.sets||[]).filter(st => st.done || st.weight || st.reps || st.duration || st.distance).map((st,i) => `
          <div class="hd-set-row">
            <span class="hd-set-num">${i+1}${st.type === 'dropset' ? '<span style="color:#ce93d8"> D</span>' : st.type === 'warmup' ? '<span style="color:#fbbf24"> W</span>' : ''}</span>
            <span class="hd-set-val">${hdSetVal(ex, st)}</span>
            ${st.rpe ? `<span style="color:var(--text-muted);margin-left:auto;font-size:0.75rem">RPE ${st.rpe}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('')}
    <div style="margin-bottom:20px"></div>
  `;

  const tplBtn = document.createElement('button');
  tplBtn.className = 'header-btn';
  tplBtn.textContent = 'Save as Routine';
  tplBtn.style.cssText = 'display:block;width:100%;margin-bottom:12px;padding:12px;border-radius:10px;background:var(--surface);border:1px solid rgba(255,255,255,0.12);color:var(--text);font-size:0.9rem;cursor:pointer;';
  tplBtn.onclick = () => {
    const name = prompt('Routine name:', s.title || 'My Routine');
    if (!name) return;
    saveTemplate(name, s.exercises);
  };
  body.appendChild(tplBtn);

  // Tap the Date box to edit the workout's date & time
  document.getElementById('hdDateBox').onclick = () => openDateEditor(sessionId, s);

  document.getElementById('historyDetail').classList.add('visible');
}

// ── Edit a past workout's date & time ─────────────────────────────────────────
let hdEditSid = null;
function openDateEditor(sessionId, s) {
  hdEditSid = sessionId;
  const d = parseToDate(s.startTime || s.date || '') || new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('hdDateInput').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  document.getElementById('hdTimeInput').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById('hdDateModal').classList.add('open');
}
document.getElementById('hdDateCancel').onclick = () => document.getElementById('hdDateModal').classList.remove('open');
document.getElementById('hdDateModal').addEventListener('click', e => {
  if (e.target === document.getElementById('hdDateModal')) document.getElementById('hdDateModal').classList.remove('open');
});
document.getElementById('hdDateSave').onclick = async () => {
  const dateVal = document.getElementById('hdDateInput').value;   // YYYY-MM-DD
  const timeVal = document.getElementById('hdTimeInput').value || '12:00';
  if (!dateVal || !hdEditSid) return;
  const s = await db.get(STORE, 'session-' + hdEditSid);
  if (!s) return;
  s.date = dateVal;
  s.startTime = `${dateVal}T${timeVal}:00`;
  if (s.duration) {
    const end = new Date(`${dateVal}T${timeVal}:00`);
    end.setSeconds(end.getSeconds() + s.duration);
    s.endTime = end.toISOString();
  }
  await db.set(STORE, 'session-' + hdEditSid, s);
  document.getElementById('hdDateModal').classList.remove('open');
  await openHistoryDetail(hdEditSid);   // refresh the detail
  renderHistory();
  renderDashboard();
};

async function saveTemplate(name, exercises) {
  const templates = await getTemplates();
  templates.push({
    id: uid(), name,
    exercises: exercises.map(e => ({
      name: e.name, category: e.category, restTime: e.restTime ?? 60, logType: resolveLogType(e),
      sets: e.sets.filter(s => s.done||s.weight||s.reps||s.duration||s.distance).map(s => ({ weight: s.weight, reps: s.reps, distance: s.distance || 0, duration: s.duration || 0, type: s.type })),
    })),
  });
  await db.set(STORE, 'templates', templates);
  alert('Saved as routine!');
}

document.getElementById('hdBack').onclick   = () => document.getElementById('historyDetail').classList.remove('visible');
document.getElementById('hdDelete').onclick = async () => {
  const sid = document.getElementById('hdDelete').dataset.sid;
  if (!confirm('Delete this workout?')) return;
  await db.delete(STORE, 'session-' + sid);
  document.getElementById('historyDetail').classList.remove('visible');
  renderHistory();
  renderDashboard();
};

// ── Build routines from history ───────────────────────────────────────────────
document.getElementById('buildRoutinesBtn').onclick = async () => {
  const panel = document.getElementById('routineBuilder');
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

  const sessions = await loadSessions();
  const byTitle = {};
  sessions.forEach(s => {
    const key = (s.title||'Workout').trim();
    if (!byTitle[key]) byTitle[key] = s;
  });

  const existing  = await getTemplates();
  const existingNames = new Set(existing.map(t => t.name.trim()));

  const container = document.getElementById('routineCandidates');
  const candidates = Object.entries(byTitle);

  container.innerHTML = candidates.map(([title, s]) => {
    const saved = existingNames.has(title);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)" data-title="${esc(title)}" data-sid="${s.id}">
        <div style="flex:1">
          <div style="font-size:0.9rem;font-weight:600">${esc(title)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${s.exercises.map(e=>esc(e.name)).join(' · ')}</div>
        </div>
        <button class="routine-save-btn" data-title="${esc(title)}" data-sid="${s.id}"
          style="background:${saved?'rgba(52,211,153,0.15)':'var(--surface2)'};border:none;border-radius:8px;
                 color:${saved?'#34d399':'var(--text-muted)'};font-size:0.8rem;padding:6px 12px;cursor:pointer;white-space:nowrap">
          ${saved ? '✓ Saved' : 'Save'}
        </button>
      </div>`;
  }).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px">No workouts in history yet.</div>';

  container.querySelectorAll('.routine-save-btn').forEach(btn => {
    btn.onclick = async () => {
      if (btn.textContent.trim().startsWith('✓')) return;
      const s = await db.get(STORE, 'session-' + btn.dataset.sid);
      if (!s) return;
      await saveTemplate(btn.dataset.title, s.exercises);
      btn.textContent = '✓ Saved';
      btn.style.background = 'rgba(52,211,153,0.15)';
      btn.style.color = '#34d399';
    };
  });

  panel.style.display = '';
};

document.getElementById('routineBuilderDone').onclick = () => {
  document.getElementById('routineBuilder').style.display = 'none';
};

// ── Library render ────────────────────────────────────────────────────────────
async function renderLibrary() {
  const q      = document.getElementById('libSearch').value.toLowerCase();
  const all    = await getAllExercises();
  const filtered = all.filter(e => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));

  const el = document.getElementById('libraryList2');
  const groups = {};
  filtered.forEach(e => (groups[e.category] = groups[e.category] || []).push(e));

  el.innerHTML = Object.entries(groups).map(([cat, exs]) => `
    <div class="section-heading" style="margin-top:12px">${cat}</div>
    ${exs.map(e => `
      <div class="lib-item" data-cue="${esc(e.name)}">
        <span class="ex-cat-dot" style="background:${CATEGORY_COLORS[cat]||'#888'}"></span>
        <span class="lib-name">${esc(e.name)}</span>
        ${resolveCues(e.name) ? '<span class="lib-cue-hint">ⓘ form</span>' : ''}
        ${e.custom ? '<span class="lib-custom-badge">Custom</span>' : ''}
      </div>
    `).join('')}
  `).join('');

  el.querySelectorAll('.lib-item').forEach(item => {
    item.onclick = () => showCues(item.dataset.cue);
  });
}

// ── Form cues sheet ───────────────────────────────────────────────────────────
function showCues(name) {
  const cues = resolveCues(name);
  document.getElementById('cuesTitle').textContent = name;
  const body = document.getElementById('cuesBody');
  if (cues && cues.length) {
    body.innerHTML = cues.map(c => `<li>${esc(c)}</li>`).join('');
  } else {
    body.innerHTML = `<li style="list-style:none;color:var(--text-muted);margin-left:-20px">No form cues for this exercise yet.</li>`;
  }
  document.getElementById('cuesModal').classList.add('open');
}
document.getElementById('cuesClose').onclick = () => document.getElementById('cuesModal').classList.remove('open');
document.getElementById('cuesModal').addEventListener('click', e => {
  if (e.target === document.getElementById('cuesModal')) document.getElementById('cuesModal').classList.remove('open');
});
document.getElementById('libSearch').oninput = renderLibrary;

// ── Clear history ─────────────────────────────────────────────────────────────
document.getElementById('clearHistoryBtn').onclick = async () => {
  if (!confirm('Delete ALL workout sessions? This cannot be undone.\n\nTemplates and custom exercises will be kept.')) return;
  const all = await db.getAll(STORE);
  for (const { key } of all) {
    // Hevy imports are also stored under 'session-<hevy-id>' — always this prefix.
    if (key.startsWith('session-')) {
      await db.delete(STORE, key);
    }
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('entries').delete()
        .eq('user_id', user.id).eq('store', STORE).like('key', 'session-%');
    }
  } catch (_) {}
  renderHistory();
  renderDashboard();
};

// ── Hevy CSV import ───────────────────────────────────────────────────────────
document.getElementById('importBtn').onclick = () => document.getElementById('csvInput').click();

document.getElementById('csvInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const progress = document.getElementById('importProgress');
  progress.style.display = 'block';
  progress.textContent = 'Reading file…';

  try {
    const text = await file.text();
    const sessions = parseHevyCSV(text);
    progress.textContent = `Importing ${sessions.length} workouts…`;

    for (const s of sessions) {
      const existing = await db.get(STORE, 'session-' + s.id);
      if (!existing || !existing.date || existing.date === 'Invalid Date') {
        await db.set(STORE, 'session-' + s.id, s);
      }
    }

    progress.textContent = `✅ Imported ${sessions.length} workouts from Hevy`;
    setTimeout(() => { progress.style.display = 'none'; }, 3000);
    renderHistory();
    renderDashboard();
  } catch (err) {
    progress.textContent = '❌ Import failed: ' + err.message;
  }
  e.target.value = '';
};

function parseHevyCSV(text) {
  const rows   = parseCSV(text);
  if (rows.length < 2) throw new Error('Empty or invalid CSV');
  const header = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  const data   = rows.slice(1).map(row => {
    const obj = {};
    header.forEach((h,i) => obj[h] = (row[i]||'').trim());
    return obj;
  }).filter(r => r.title || r.exercise_title);

  const workouts = {};
  data.forEach(row => {
    const wKey = (row.title||'Workout') + '|||' + (row.start_time||'');
    if (!workouts[wKey]) {
      const start = row.start_time || '';
      const end   = row.end_time   || '';
      let duration = 0;
      if (start && end) {
        try { duration = Math.round((new Date(end) - new Date(start)) / 1000); } catch(_) {}
      }
      workouts[wKey] = {
        id:        stableId(wKey),
        title:     row.title || 'Workout',
        date:      extractDateStr(start) || new Date().toISOString().slice(0,10),
        startTime: start,
        endTime:   end,
        duration,
        exercises: {},
      };
    }

    const exName = row.exercise_title || 'Unknown';
    if (!workouts[wKey].exercises[exName]) {
      workouts[wKey].exercises[exName] = {
        id: uid(), name: exName,
        category: guessCategory(exName),
        notes: row.exercise_notes || '',
        sets: [],
      };
    }

    workouts[wKey].exercises[exName].sets.push({
      id:     uid(),
      type:   row.set_type || 'normal',
      weight: parseFloat(row.weight_kg)       || 0,
      reps:   parseInt(row.reps)              || 0,
      rpe:    row.rpe ? parseFloat(row.rpe)   : null,
      done:   true,
    });
  });

  return Object.values(workouts).map(w => ({
    ...w,
    exercises: Object.values(w.exercises),
  }));
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/bench|chest|fly|pec|push.?up|dip/.test(n))                      return 'Chest';
  if (/deadlift|row|pull.?up|chin|lat|pulldown|face.?pull/.test(n))    return 'Back';
  if (/shoulder|press.*over|overhead|lateral|delt|arnold/.test(n))     return 'Shoulders';
  if (/curl|bicep/.test(n))                                             return 'Biceps';
  if (/tricep|pushdown|skull|close.?grip|extension/.test(n))           return 'Triceps';
  if (/squat|leg.?press|hack|lunge|split|sissy/.test(n))               return 'Quads';
  if (/leg.?curl|hamstring|romanian|rdl|good.?morning/.test(n))        return 'Hamstrings';
  if (/hip.?thrust|glute|kickback|abduct/.test(n))                     return 'Glutes';
  if (/calf|calves/.test(n))                                            return 'Calves';
  if (/plank|crunch|ab|core|oblique|dragon|pallof|leg.?raise/.test(n)) return 'Core';
  if (/run|cardio|bike|cycle|row.*machine|stair|rope/.test(n))         return 'Cardio';
  return 'Back'; // fallback
}

// Delimiter-detecting parser — handles TSV (Hevy) and CSV
function parseCSV(text) {
  const firstLine = text.split('\n')[0];
  const tabs   = (firstLine.match(/\t/g)  || []).length;
  const commas = (firstLine.match(/,/g)   || []).length;
  return tabs > commas ? parseTSV(text) : parseCommaCSV(text);
}

function parseTSV(text) {
  return text
    .split('\n')
    .map(line => line.replace(/\r$/, '').split('\t'))
    .filter(row => row.some(f => f.trim() !== ''));
}

function parseCommaCSV(text) {
  const rows = [];
  let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuote = false;
      else field += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || (c === '\r' && text[i+1] === '\n')) {
        if (c === '\r') i++;
        row.push(field); field = '';
        if (row.some(f => f !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row); }
  return rows;
}

// ── Standalone-app chrome: no browser history to go "back" to ─────────────────
(function fixChrome() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const homeBtn = document.getElementById('homeBtn');
  if (!homeBtn) return;
  if (standalone) {
    homeBtn.textContent = '⌂';
    homeBtn.onclick = () => { location.href = '../'; };
    homeBtn.title = 'Dashboard hub';
  } else {
    homeBtn.onclick = () => history.back();
  }
})();

// Track workout title edits for autosave
document.getElementById('awTitle').addEventListener('input', e => {
  if (activeSession) { activeSession.title = e.target.value; saveSoon(); }
});

// ════════════════════════════════════════════════════════════════════════════
//  AI COACH
// ════════════════════════════════════════════════════════════════════════════
let coachThread = null;   // [{role, text, routine?}]
let coachBusy = false;

// Coach API key: workout-store key, falling back to any key previously saved
// under the (now-removed) habits store so it carries over seamlessly.
async function coachGetKey() {
  return (await db.get('workout', 'anthropic-key')) || (await db.get('habits', 'anthropic-key')) || '';
}

async function loadCoachThread() {
  if (!coachThread) coachThread = (await db.get('workout', 'coach-thread')) || [];
  return coachThread;
}
function persistCoachThread() { db.set('workout', 'coach-thread', coachThread); }

async function renderCoach() {
  await loadCoachThread();
  const thread = document.getElementById('coachThread');
  thread.innerHTML = '';
  if (!coachThread.length) {
    thread.innerHTML = `<div class="coach-empty">👋 I'm your training coach.<br>Ask me to draft a routine, plan today's session, review your progress, or answer any form/technique question.</div>`;
  } else {
    coachThread.forEach(m => thread.appendChild(renderCoachMessage(m)));
  }
  scrollCoachDown();
}

function scrollCoachDown() {
  const t = document.getElementById('coachThread');
  requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; });
}

function renderCoachMessage(m) {
  const wrap = document.createElement('div');
  wrap.style.display = 'contents';
  if (m.text) {
    const b = document.createElement('div');
    b.className = 'coach-msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.error ? ' err' : '');
    b.textContent = m.text;
    wrap.appendChild(b);
  }
  if (m.routine) wrap.appendChild(renderRoutineCard(m.routine));
  return wrap;
}

function renderRoutineCard(routine) {
  const card = document.createElement('div');
  card.className = 'coach-routine';
  card.innerHTML = `
    <div class="coach-routine-name">${esc(routine.name)}</div>
    ${routine.exercises.map(e => `
      <div class="coach-routine-ex"><b>${esc(e.name)}</b><span>${e.sets.length}×${e.sets[0]?.reps ?? ''}${e.category === 'Cardio' ? ' min' : ''}</span></div>
    `).join('')}
    <div class="coach-routine-btns">
      <button class="cr-start">▶ Start workout</button>
      <button class="cr-save">＋ Save as routine</button>
    </div>`;
  card.querySelector('.cr-start').onclick = () => { startEmptyWorkout(routine); };
  card.querySelector('.cr-save').onclick  = () => saveTemplate(routine.name, routine.exercises);
  return card;
}

const COACH_ERRORS = {
  nokey:     'Add your Anthropic API key to use the coach — tap 🔑 below.',
  auth:      'That API key was rejected (401). Tap 🔑 to update it.',
  ratelimit: 'Rate limited — wait a moment and try again.',
  network:   'Network error — check your connection and try again.',
  toolarge:  'That request was too large. Try a shorter message.',
  api:       'The AI service returned an error. Try again shortly.',
};

async function sendCoach(text, forceTool = false) {
  if (coachBusy) return;
  text = text.trim();
  if (!text) return;
  await loadCoachThread();

  const key = await coachGetKey();
  const thread = document.getElementById('coachThread');
  if (thread.querySelector('.coach-empty')) thread.innerHTML = '';

  // user bubble
  const userMsg = { role: 'user', text };
  coachThread.push(userMsg);
  thread.appendChild(renderCoachMessage(userMsg));
  persistCoachThread();
  document.getElementById('coachInput').value = '';
  scrollCoachDown();

  if (!key) {
    pushCoachError('nokey');
    return;
  }

  // typing indicator
  coachBusy = true;
  const typing = document.createElement('div');
  typing.className = 'coach-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  thread.appendChild(typing);
  scrollCoachDown();

  try {
    const system = await assembleContext({
      loadSessions, getTemplates, getAllExercises, getStreakSettings,
    });
    const apiMessages = coachThread.map(m =>
      m.role === 'assistant'
        ? { role: 'assistant', content: m.text || (m.routine ? `[Drafted routine: ${m.routine.name}]` : '…') }
        : { role: 'user', content: m.text }
    );
    const result = await callCoach({ apiMessages, system, forceTool, getKey: coachGetKey });
    typing.remove();

    if (result.error) { pushCoachError(result.error); coachBusy = false; return; }

    const botMsg = { role: 'assistant', text: result.text || '' };
    if (result.routine) {
      try {
        botMsg.routine = await validateRoutine(result.routine, { getAllExercises, guessCategory });
        if (!botMsg.text) botMsg.text = `Here's a routine — “${botMsg.routine.name}”:`;
      } catch (_) {
        if (!botMsg.text) botMsg.text = "I drafted something but couldn't structure it — try rephrasing.";
      }
    }
    if (!botMsg.text && !botMsg.routine) botMsg.text = '(no response)';
    coachThread.push(botMsg);
    thread.appendChild(renderCoachMessage(botMsg));
    persistCoachThread();
    scrollCoachDown();
  } catch (_) {
    typing.remove();
    pushCoachError('network');
  }
  coachBusy = false;
}

function pushCoachError(code) {
  const msg = { role: 'assistant', text: COACH_ERRORS[code] || COACH_ERRORS.api, error: true };
  coachThread.push(msg);
  document.getElementById('coachThread').appendChild(renderCoachMessage(msg));
  persistCoachThread();
  scrollCoachDown();
}

// ── Coach wiring ──────────────────────────────────────────────────────────────
document.getElementById('coachSend').onclick = () => sendCoach(document.getElementById('coachInput').value);
document.getElementById('coachInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendCoach(e.target.value); }
});
document.querySelectorAll('.coach-chip[data-prompt]').forEach(chip => {
  chip.onclick = () => sendCoach(chip.dataset.prompt, chip.dataset.force === '1');
});
document.getElementById('coachClearBtn').onclick = async () => {
  if (!confirm('Clear the coach chat?')) return;
  coachThread = [];
  await db.set('workout', 'coach-thread', []);
  renderCoach();
};
document.getElementById('coachKeyBtn').onclick = async () => {
  document.getElementById('coachKeyInput').value = await coachGetKey();
  document.getElementById('coachKeyModal').classList.add('open');
};
document.getElementById('coachKeyCancel').onclick = () => document.getElementById('coachKeyModal').classList.remove('open');
document.getElementById('coachKeyModal').addEventListener('click', e => {
  if (e.target === document.getElementById('coachKeyModal')) document.getElementById('coachKeyModal').classList.remove('open');
});
document.getElementById('coachKeySave').onclick = async () => {
  await db.set('workout', 'anthropic-key', document.getElementById('coachKeyInput').value.trim());
  document.getElementById('coachKeyModal').classList.remove('open');
  backfillCustomRepRanges(); // key just added — retry any exercises that had no range yet
};

// ── Init ──────────────────────────────────────────────────────────────────────
await seedMyRoutinesOnce();
await fixIncompletePushDayOnce();
await checkForAbandonedSession();
renderDashboard();
renderHistory();
backfillCustomRepRanges(); // background — fills in AI rep ranges for any custom exercise missing one
