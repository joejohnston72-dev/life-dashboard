import { supabase } from '../shared/supabase.js';
import db from '../shared/db.js';

const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

const logView     = document.getElementById('logView');
const historyView = document.getElementById('historyView');
const tabLog      = document.getElementById('tabLog');
const tabHistory  = document.getElementById('tabHistory');
const saveBtn     = document.getElementById('saveBtn');

// ── Tab switching ─────────────────────────────────────────────────────────────
tabLog.onclick = () => {
  tabLog.classList.add('active'); tabHistory.classList.remove('active');
  logView.style.display = ''; historyView.style.display = 'none';
  saveBtn.style.display = '';
};
tabHistory.onclick = () => {
  tabHistory.classList.add('active'); tabLog.classList.remove('active');
  historyView.style.display = ''; logView.style.display = 'none';
  saveBtn.style.display = 'none';
  renderHistory();
};

// ── Logger state ──────────────────────────────────────────────────────────────
let session = newSession();

function newSession() {
  return { name: '', exercises: [newExercise()] };
}
function newExercise() {
  return { name: '', sets: [{ reps: '', weight: '' }] };
}

function renderLog() {
  logView.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'logger-card';

  const header = document.createElement('div');
  header.className = 'logger-header';
  const nameInput = document.createElement('input');
  nameInput.className = 'session-name-input';
  nameInput.placeholder = 'Workout name (e.g. Push Day)';
  nameInput.value = session.name;
  nameInput.oninput = e => session.name = e.target.value;
  header.appendChild(nameInput);
  card.appendChild(header);

  session.exercises.forEach((ex, ei) => {
    const block = document.createElement('div');
    block.className = 'exercise-block';

    const exHeader = document.createElement('div');
    exHeader.className = 'exercise-block-header';
    const exInput = document.createElement('input');
    exInput.className = 'exercise-name-input';
    exInput.placeholder = 'Exercise name';
    exInput.value = ex.name;
    exInput.oninput = e => ex.name = e.target.value;
    const delExBtn = document.createElement('button');
    delExBtn.className = 'del-btn';
    delExBtn.textContent = '✕';
    delExBtn.onclick = () => {
      if (session.exercises.length === 1) return;
      session.exercises.splice(ei, 1);
      renderLog();
    };
    exHeader.append(exInput, delExBtn);
    block.appendChild(exHeader);

    const table = document.createElement('table');
    table.className = 'sets-table';
    table.innerHTML = '<thead><tr><th>#</th><th>Reps</th><th>Weight (kg)</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');

    ex.sets.forEach((set, si) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="set-num">${si + 1}</td>
        <td><input class="set-input" type="number" min="0" placeholder="0" value="${set.reps}"></td>
        <td><input class="set-input" type="number" min="0" step="0.5" placeholder="0" value="${set.weight}"></td>
        <td><button class="set-del">✕</button></td>
      `;
      tr.querySelectorAll('.set-input')[0].oninput = e => set.reps   = e.target.value;
      tr.querySelectorAll('.set-input')[1].oninput = e => set.weight = e.target.value;
      tr.querySelector('.set-del').onclick = () => {
        if (ex.sets.length === 1) return;
        ex.sets.splice(si, 1);
        renderLog();
      };
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);

    const addSetBtn = document.createElement('button');
    addSetBtn.className = 'add-set-btn';
    addSetBtn.textContent = '+ Add set';
    addSetBtn.onclick = () => { ex.sets.push({ reps: '', weight: '' }); renderLog(); };
    block.append(table, addSetBtn);
    card.appendChild(block);
  });

  const addExBtn = document.createElement('button');
  addExBtn.className = 'add-exercise-btn';
  addExBtn.textContent = '+ Add exercise';
  addExBtn.onclick = () => { session.exercises.push(newExercise()); renderLog(); };
  card.appendChild(addExBtn);

  logView.appendChild(card);
}

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.onclick = async () => {
  const hasData = session.exercises.some(ex => ex.name.trim());
  if (!hasData) { alert('Add at least one exercise name.'); return; }

  const record = {
    id:   Date.now().toString(),
    date: new Date().toISOString().slice(0, 10),
    name: session.name.trim() || 'Workout',
    exercises: session.exercises
      .filter(ex => ex.name.trim())
      .map(ex => ({
        name: ex.name.trim(),
        sets: ex.sets.filter(s => s.reps || s.weight),
      })),
  };

  await db.set('workout', record.id, record);
  session = newSession();
  renderLog();
  alert('Workout saved!');
};

// ── History ───────────────────────────────────────────────────────────────────
async function renderHistory() {
  historyView.innerHTML = '';
  const all = await db.getAll('workout');
  all.sort((a, b) => b.key.localeCompare(a.key));

  if (all.length === 0) {
    historyView.innerHTML = `<div class="empty-state">No workouts logged yet.<br>Switch to Log to add one.</div>`;
    return;
  }

  for (const { value: s } of all) {
    const card = document.createElement('div');
    card.className = 'session-card';
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.innerHTML = `<span class="session-name">${esc(s.name)}</span><span class="session-date">${formatDate(s.date)}</span>`;
    card.appendChild(meta);

    for (const ex of s.exercises) {
      const row = document.createElement('div');
      row.className = 'exercise-row';
      const setsSummary = ex.sets.length
        ? ex.sets.map(s => `${s.reps||'?'}×${s.weight||'?'}kg`).join(' · ')
        : '—';
      row.innerHTML = `<span class="exercise-name">${esc(ex.name)}</span><span class="sets-summary">${setsSummary}</span>`;
      card.appendChild(row);
    }
    historyView.appendChild(card);
  }
}

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

renderLog();
