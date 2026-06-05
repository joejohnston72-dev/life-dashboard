import { supabase }                     from '../shared/supabase.js';
import db                               from '../shared/db.js';
import { EXERCISES, CATEGORIES, CATEGORY_COLORS } from './exercises.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

// ── Constants & helpers ───────────────────────────────────────────────────────
const STORE = 'workout';
const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc   = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtKg = v => (v || 0) % 1 === 0 ? String(v || 0) : String(v || 0);
const fmtTime = secs => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m + ':' + String(s).padStart(2,'0');
};
const fmtDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});

// ── Screen wake lock ──────────────────────────────────────────────────────────
let wakeLock = null;
async function acquireWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(_) {}
}
function releaseWakeLock() { wakeLock?.release(); wakeLock = null; }

// ── Active session state ──────────────────────────────────────────────────────
let activeSession = null;   // { id, title, startTime, exercises: [...] }
let sessionTimer  = null;   // setInterval handle
let sessionSecs   = 0;

// ── Rest timer state ──────────────────────────────────────────────────────────
let restTimer     = null;
let restSecs      = 0;
let defaultRest   = 90;

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
      activeTab === 'Dashboard' ? 'Workout' : activeTab;
    // show mini bar if workout in progress and not on active screen
    document.getElementById('miniBar').classList.toggle('visible', !!activeSession);
    if (activeTab === 'Dashboard') { renderDashboard(); }
    if (activeTab === 'History')   { renderHistory();   }
    if (activeTab === 'Library')   { renderLibrary();   }
  };
});

// ── Workout start / open ──────────────────────────────────────────────────────
document.getElementById('startEmptyBtn').onclick = startEmptyWorkout;

function startEmptyWorkout(prefill = null) {
  activeSession = {
    id: uid(),
    title: prefill?.title || '',
    startTime: new Date().toISOString(),
    exercises: prefill?.exercises
      ? prefill.exercises.map(e => ({
          ...e, id: uid(),
          sets: e.sets.map(s => ({ ...s, id: uid(), done: false })),
        }))
      : [],
  };
  sessionSecs = 0;
  acquireWakeLock();
  sessionTimer = setInterval(() => {
    sessionSecs++;
    document.getElementById('awTimer').textContent  = fmtTime(sessionSecs);
    document.getElementById('miniTimer').textContent = fmtTime(sessionSecs);
  }, 1000);
  openActiveWorkout();
  renderActiveSession();
}

function openActiveWorkout() {
  document.getElementById('miniBar').classList.remove('visible');
  document.getElementById('activeWorkout').classList.add('visible');
  document.getElementById('awTitle').value = activeSession?.title || '';
}

// ── Render active session ─────────────────────────────────────────────────────
function renderActiveSession() {
  const body = document.getElementById('awBody');
  body.innerHTML = '';
  if (!activeSession) return;

  activeSession.exercises.forEach((ex, ei) => {
    const block = document.createElement('div');
    block.className = 'ex-block';
    block.dataset.ei = ei;

    const color = CATEGORY_COLORS[ex.category] || '#888';

    block.innerHTML = `
      <div class="ex-block-header">
        <div class="ex-cat-dot" style="background:${color}"></div>
        <div class="ex-name">${esc(ex.name)}</div>
        <button class="ex-menu-btn" data-ei="${ei}">⋯</button>
      </div>
      ${ex.prevPerf ? `<div class="ex-prev-note">Previous: ${esc(ex.prevPerf)}</div>` : ''}
      <input class="ex-notes-input" placeholder="Notes…" value="${esc(ex.notes||'')}"
             data-ei="${ei}" data-field="notes">
      <table class="sets-table">
        <thead><tr>
          <th>#</th><th>Previous</th><th>kg</th><th>Reps</th><th></th>
        </tr></thead>
        <tbody id="sets-${ei}"></tbody>
      </table>
      <table class="sets-table"><tbody>
        <tr class="add-set-row"><td colspan="5">
          <button class="add-set-mini" data-ei="${ei}">+ Add Set</button>
        </td></tr>
      </tbody></table>
    `;

    // render sets
    const tbody = block.querySelector(`#sets-${ei}`);
    ex.sets.forEach((set, si) => {
      const prev = ex.prevSets?.[si] ?? null;
      const prevText = prev ? `${fmtKg(prev.weight)}×${prev.reps}` : '—';
      const tr = document.createElement('tr');
      tr.className = 'set-row' + (set.done ? ' done' : '') + (set.type === 'warmup' ? ' set-warmup' : '');
      tr.dataset.ei = ei; tr.dataset.si = si;
      tr.innerHTML = `
        <td class="set-num">${si + 1}</td>
        <td class="set-prev">${prevText}</td>
        <td><input class="set-input" type="number" min="0" step="0.5"
              value="${set.weight||''}" placeholder="0" inputmode="decimal"
              data-ei="${ei}" data-si="${si}" data-field="weight"></td>
        <td><input class="set-input" type="number" min="0" step="1"
              value="${set.reps||''}" placeholder="0" inputmode="numeric"
              data-ei="${ei}" data-si="${si}" data-field="reps"></td>
        <td><button class="set-check" data-ei="${ei}" data-si="${si}">${set.done ? '✓' : ''}</button></td>
      `;
      tbody.appendChild(tr);
    });

    body.appendChild(block);
  });

  if (activeSession.exercises.length === 0) {
    body.innerHTML = `<div class="empty-state" style="padding-top:60px">
      Tap <strong>Add Exercise</strong> below to get started.
    </div>`;
  }

  // ── event delegation ──
  body.querySelectorAll('.set-input').forEach(inp => {
    inp.oninput = e => {
      const { ei, si, field } = e.target.dataset;
      activeSession.exercises[ei].sets[si][field] =
        field === 'reps' ? parseInt(e.target.value)||0 : parseFloat(e.target.value)||0;
    };
  });

  body.querySelectorAll('.set-check').forEach(btn => {
    btn.onclick = () => {
      const { ei, si } = btn.dataset;
      const set = activeSession.exercises[ei].sets[si];
      set.done = !set.done;
      if (set.done) startRest();
      renderActiveSession();
    };
  });

  body.querySelectorAll('[data-field="notes"]').forEach(inp => {
    inp.oninput = e => { activeSession.exercises[e.target.dataset.ei].notes = e.target.value; };
  });

  body.querySelectorAll('.add-set-mini').forEach(btn => {
    btn.onclick = () => {
      const ei = parseInt(btn.dataset.ei);
      const lastSet = activeSession.exercises[ei].sets.at(-1);
      activeSession.exercises[ei].sets.push({
        id: uid(), type:'normal', done:false,
        weight: lastSet?.weight || 0, reps: lastSet?.reps || 0,
      });
      renderActiveSession();
    };
  });

  body.querySelectorAll('.ex-menu-btn').forEach(btn => {
    btn.onclick = () => showExMenu(parseInt(btn.dataset.ei));
  });
}

// ── Exercise menu (delete / save as template / add superset) ─────────────────
function showExMenu(ei) {
  const ex = activeSession.exercises[ei];
  const name = ex.name;
  if (confirm(`Remove "${name}" from this workout?`)) {
    activeSession.exercises.splice(ei, 1);
    renderActiveSession();
  }
}

// ── Finish workout ────────────────────────────────────────────────────────────
document.getElementById('awFinishBtn').onclick = () => {
  if (activeSession.exercises.length === 0) { cancelWorkout(); return; }
  showWorkoutSummary();
};

function showWorkoutSummary() {
  skipRest();
  const title = document.getElementById('awTitle').value.trim() || 'Workout';
  activeSession.title = title;

  const doneSets = activeSession.exercises.flatMap(e => e.sets.filter(s => s.done));
  const volume   = doneSets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 1), 0);
  const exCount  = activeSession.exercises.length;

  document.getElementById('summaryTitle').textContent = title;
  document.getElementById('summaryDate').textContent  = new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('summaryStats').innerHTML = `
    <div class="stat-box"><div class="stat-val">${fmtTime(sessionSecs)}</div><div class="stat-label">Duration</div></div>
    <div class="stat-box"><div class="stat-val">${exCount}</div><div class="stat-label">Exercises</div></div>
    <div class="stat-box"><div class="stat-val">${doneSets.length}</div><div class="stat-label">Sets</div></div>
    <div class="stat-box"><div class="stat-val">${Math.round(volume).toLocaleString()}</div><div class="stat-label">Volume kg</div></div>
  `;
  document.getElementById('summaryExercises').innerHTML =
    activeSession.exercises.map(e =>
      `${esc(e.name)} — ${e.sets.filter(s=>s.done).length} sets`
    ).join('<br>');

  document.getElementById('workoutSummary').classList.add('visible');
}

function handleSummaryBgClick(e) {
  if (e.target === document.getElementById('workoutSummary')) return; // keep open
}

document.getElementById('saveBtn').onclick    = saveWorkout;
document.getElementById('discardBtn').onclick = () => { if (confirm('Discard this workout?')) cancelWorkout(); };

async function saveWorkout() {
  clearInterval(sessionTimer);
  releaseWakeLock();
  const session = {
    ...activeSession,
    title:    document.getElementById('awTitle').value.trim() || 'Workout',
    endTime:  new Date().toISOString(),
    duration: sessionSecs,
    date:     new Date().toISOString().slice(0,10),
  };
  await db.set(STORE, 'session-' + session.id, session);
  document.getElementById('workoutSummary').classList.remove('visible');
  document.getElementById('activeWorkout').classList.remove('visible');
  activeSession = null;
  sessionSecs   = 0;
  document.getElementById('miniBar').classList.remove('visible');
  renderDashboard();
}

function cancelWorkout() {
  clearInterval(sessionTimer);
  releaseWakeLock();
  skipRest();
  activeSession = null;
  sessionSecs = 0;
  document.getElementById('workoutSummary').classList.remove('visible');
  document.getElementById('activeWorkout').classList.remove('visible');
  document.getElementById('miniBar').classList.remove('visible');
}

// ── Rest timer ────────────────────────────────────────────────────────────────
function startRest(secs = defaultRest) {
  clearInterval(restTimer);
  restSecs = secs;
  updateRestDisplay();
  document.getElementById('restTimer').classList.add('visible');
  restTimer = setInterval(() => {
    restSecs--;
    if (restSecs <= 0) {
      clearInterval(restTimer);
      restSecs = 0;
      updateRestDisplay();
      try { navigator.vibrate?.([200,100,200]); } catch(_) {}
    } else {
      updateRestDisplay();
    }
  }, 1000);
}

function updateRestDisplay() {
  const el = document.getElementById('restCount');
  const m = Math.floor(restSecs / 60), s = restSecs % 60;
  el.textContent = m + ':' + String(s).padStart(2,'0');
  el.className = 'rest-count' + (restSecs <= 0 ? ' done' : restSecs <= 10 ? ' low' : '');
  document.getElementById('restTotal').textContent = defaultRest + 's';
}

function skipRest() {
  clearInterval(restTimer);
  document.getElementById('restTimer').classList.remove('visible');
}

function adjustRest(delta) {
  defaultRest = Math.max(10, defaultRest + delta);
  restSecs    = Math.max(0, restSecs + delta);
  updateRestDisplay();
}

function handleRestBgClick(e) {
  if (e.target === document.getElementById('restTimer')) skipRest();
}

// expose to HTML
window.skipRest = skipRest;
window.adjustRest = adjustRest;
window.handleRestBgClick = handleRestBgClick;
window.handleSummaryBgClick = handleSummaryBgClick;
window.openActiveWorkout = openActiveWorkout;

// ── Exercise picker ───────────────────────────────────────────────────────────
let epFilter = 'All';

async function getAllExercises() {
  const custom = (await db.get(STORE, 'exercises-custom')) || [];
  return [...EXERCISES, ...custom.map(e => ({ ...e, custom: true }))];
}

document.getElementById('awAddExBtn').onclick   = () => openExPicker();
document.getElementById('epCancel').onclick     = closeExPicker;

function openExPicker() {
  epFilter = 'All';
  document.getElementById('epSearch').value = '';
  document.getElementById('exercisePicker').classList.add('visible');
  renderExPicker();
  setTimeout(() => document.getElementById('epSearch').focus(), 150);
}

function closeExPicker() {
  document.getElementById('exercisePicker').classList.remove('visible');
}

document.getElementById('epSearch').oninput = renderExPicker;

async function renderExPicker() {
  const q    = document.getElementById('epSearch').value.toLowerCase();
  const all  = await getAllExercises();
  const cats = ['All', ...CATEGORIES];

  // Filters
  const filtersEl = document.getElementById('epFilters');
  filtersEl.innerHTML = cats.map(c =>
    `<button class="ep-filter ${c === epFilter ? 'active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');
  filtersEl.querySelectorAll('.ep-filter').forEach(btn => {
    btn.onclick = () => { epFilter = btn.dataset.cat; renderExPicker(); };
  });

  // List
  const filtered = all.filter(e =>
    (epFilter === 'All' || e.category === epFilter) &&
    (!q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  );

  const listEl = document.getElementById('epList');
  listEl.innerHTML = filtered.map(e => `
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
      await addExerciseToSession(item.dataset.name, item.dataset.cat);
      closeExPicker();
      renderActiveSession();
    };
  });

  document.getElementById('epAddCustom').onclick = () => {
    closeExPicker();
    openCustomExModal();
  };
}

async function addExerciseToSession(name, category) {
  const prev = await getPreviousPerformance(name);
  activeSession.exercises.push({
    id: uid(), name, category, notes: '',
    prevPerf: prev ? prev.sets.slice(0,3).map(s => `${fmtKg(s.weight)}×${s.reps}`).join(', ') : null,
    prevSets: prev?.sets || null,
    sets: [{ id: uid(), type: 'normal', done: false,
      weight: prev?.sets[0]?.weight || 0,
      reps:   prev?.sets[0]?.reps   || 0,
    }],
  });
}

async function getPreviousPerformance(exerciseName) {
  const all = await db.getAll(STORE);
  const sessions = all
    .filter(r => r.key.startsWith('session-') && r.value?.exercises)
    .map(r => r.value)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));
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
  document.getElementById('customExName').value = '';
  document.getElementById('customExModal').classList.add('open');
}
document.getElementById('customExCancel').onclick = () => document.getElementById('customExModal').classList.remove('open');
document.getElementById('customExSave').onclick = async () => {
  const name = document.getElementById('customExName').value.trim();
  if (!name) return;
  const cat  = document.getElementById('customExCat').value;
  const custom = (await db.get(STORE, 'exercises-custom')) || [];
  custom.push({ id: uid(), name, category: cat, custom: true });
  await db.set(STORE, 'exercises-custom', custom);
  document.getElementById('customExModal').classList.remove('open');
  await addExerciseToSession(name, cat);
  openActiveWorkout();
  renderActiveSession();
};

// ── Templates ─────────────────────────────────────────────────────────────────
async function getTemplates() { return (await db.get(STORE, 'templates')) || []; }

document.getElementById('templateNameCancel').onclick = () => document.getElementById('templateNameModal').classList.remove('open');
document.getElementById('awFinishBtn').addEventListener('contextmenu', e => { e.preventDefault(); openSaveTemplateModal(); });

function openSaveTemplateModal() {
  document.getElementById('templateNameInput').value = activeSession?.title || '';
  document.getElementById('templateNameModal').classList.add('open');
}

document.getElementById('templateNameSave').onclick = async () => {
  const name = document.getElementById('templateNameInput').value.trim();
  if (!name) return;
  const templates = await getTemplates();
  templates.push({
    id: uid(), name,
    exercises: activeSession.exercises.map(e => ({
      name: e.name, category: e.category,
      sets: e.sets.map(s => ({ weight: s.weight, reps: s.reps, type: s.type })),
    })),
  });
  await db.set(STORE, 'templates', templates);
  document.getElementById('templateNameModal').classList.remove('open');
  alert('Saved as routine!');
};

// ── Dashboard render ──────────────────────────────────────────────────────────
async function renderDashboard() {
  // Templates
  const templates = await getTemplates();
  const tmplEl = document.getElementById('templatesList');
  document.getElementById('templatesHeading').style.display = templates.length ? '' : 'none';
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
      const ts = (await getTemplates()).filter(t => t.id !== btn.dataset.del);
      await db.set(STORE, 'templates', ts);
      renderDashboard();
    };
  });

  // Recent workouts (last 5)
  const all = await db.getAll(STORE);
  const sessions = all
    .filter(r => r.key.startsWith('session-') && r.value?.exercises)
    .map(r => r.value)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''))
    .slice(0,5);

  const recentEl = document.getElementById('recentList');
  if (!sessions.length) {
    recentEl.innerHTML = `<div class="empty-state">No workouts yet.<br>Tap Start Empty Workout or import from Hevy.</div>`;
    return;
  }
  recentEl.innerHTML = sessions.map(s => workoutCard(s)).join('');
  recentEl.querySelectorAll('.workout-card').forEach(card => {
    card.onclick = () => openHistoryDetail(card.dataset.sid);
  });
}

function workoutCard(s) {
  const exList = (s.exercises||[]).slice(0,4).map(e => `<span class="wc-ex-tag">${esc(e.name)}</span>`).join('');
  const more   = (s.exercises||[]).length > 4 ? `<span class="wc-ex-tag">+${s.exercises.length - 4} more</span>` : '';
  const doneSets = (s.exercises||[]).flatMap(e => (e.sets||[]).filter(st => st.done));
  const vol = doneSets.reduce((a,st) => a + (st.weight||0)*(st.reps||1), 0);
  return `
    <div class="workout-card" data-sid="${s.id}">
      <div class="wc-header">
        <span class="wc-title">${esc(s.title||'Workout')}</span>
        <span class="wc-date">${fmtDate(s.date||s.startTime?.slice(0,10)||'')}</span>
      </div>
      <div class="wc-meta">${fmtTime(s.duration||0)} · ${(s.exercises||[]).length} exercises · ${Math.round(vol).toLocaleString()} kg</div>
      <div class="wc-exercises">${exList}${more}</div>
    </div>`;
}

// ── History render ────────────────────────────────────────────────────────────
async function renderHistory() {
  const all = await db.getAll(STORE);
  const sessions = all
    .filter(r => r.key.startsWith('session-') && r.value?.exercises)
    .map(r => r.value)
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const el = document.getElementById('historyList');
  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state">No history yet.<br>Import your Hevy CSV to load past workouts.</div>`;
    return;
  }

  // Group by month
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
async function openHistoryDetail(sessionId) {
  const s = await db.get(STORE, 'session-' + sessionId);
  if (!s) return;

  document.getElementById('hdTitle').textContent = s.title || 'Workout';
  document.getElementById('hdDelete').dataset.sid = sessionId;

  const body = document.getElementById('hdBody');
  const doneSets = (s.exercises||[]).flatMap(e => (e.sets||[]).filter(st => st.done));
  const vol = doneSets.reduce((a,st) => a + (st.weight||0)*(st.reps||1), 0);

  body.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;min-width:80px;text-align:center">
        <div class="stat-val">${fmtDate(s.date||'')}</div>
        <div class="stat-label">Date</div>
      </div>
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;text-align:center">
        <div class="stat-val">${fmtTime(s.duration||0)}</div>
        <div class="stat-label">Duration</div>
      </div>
      <div class="stat-box" style="background:var(--surface);border-radius:10px;padding:10px 14px;text-align:center">
        <div class="stat-val">${Math.round(vol).toLocaleString()}</div>
        <div class="stat-label">Volume kg</div>
      </div>
    </div>
    ${(s.exercises||[]).map(ex => `
      <div style="background:var(--surface);border-radius:12px;padding:14px;margin-bottom:10px;border-left:4px solid ${CATEGORY_COLORS[ex.category]||'#4fc3f7'}">
        <div style="font-size:0.95rem;font-weight:700;margin-bottom:10px">${esc(ex.name)}</div>
        ${(ex.sets||[]).filter(st => st.done || st.weight || st.reps).map((st,i) => `
          <div class="hd-set-row">
            <span class="hd-set-num">${i+1}</span>
            <span class="hd-set-val">${fmtKg(st.weight)} kg × ${st.reps} reps</span>
            ${st.rpe ? `<span style="color:var(--text-muted);margin-left:auto;font-size:0.75rem">RPE ${st.rpe}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('')}
    <div style="margin-bottom:20px"></div>
  `;

  // save as template button
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

  document.getElementById('historyDetail').classList.add('visible');
}

async function saveTemplate(name, exercises) {
  const templates = await getTemplates();
  templates.push({
    id: uid(), name,
    exercises: exercises.map(e => ({
      name: e.name, category: e.category,
      sets: e.sets.filter(s => s.done||s.weight||s.reps).map(s => ({ weight: s.weight, reps: s.reps, type: s.type })),
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

// ── Library render ────────────────────────────────────────────────────────────
async function renderLibrary() {
  const q      = document.getElementById('libSearch').value.toLowerCase();
  const all    = await getAllExercises();
  const filtered = all.filter(e => !q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));

  const el = document.getElementById('libraryList');
  const groups = {};
  filtered.forEach(e => (groups[e.category] = groups[e.category] || []).push(e));

  el.innerHTML = Object.entries(groups).map(([cat, exs]) => `
    <div class="section-heading" style="margin-top:12px">${cat}</div>
    ${exs.map(e => `
      <div class="lib-item">
        <span class="ex-cat-dot" style="background:${CATEGORY_COLORS[cat]||'#888'}"></span>
        <span class="lib-name">${esc(e.name)}</span>
        ${e.custom ? '<span class="lib-custom-badge">Custom</span>' : ''}
      </div>
    `).join('')}
  `).join('');
}
document.getElementById('libSearch').oninput = renderLibrary;

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
      if (!existing) await db.set(STORE, 'session-' + s.id, s);
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
        id:        uid(),
        title:     row.title || 'Workout',
        date:      start ? start.slice(0,10) : new Date().toISOString().slice(0,10),
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

// Minimal CSV parser (handles quoted fields with commas/newlines)
function parseCSV(text) {
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

// ── Init ──────────────────────────────────────────────────────────────────────
renderDashboard();
