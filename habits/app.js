import db from '../shared/db.js';

const COLORS = ['#e94560','#4fc3f7','#81c784','#ce93d8','#fbbf24','#f97316','#34d399','#60a5fa'];
const today  = new Date().toISOString().slice(0, 10);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const listEl      = document.getElementById('habitsList');
const modal       = document.getElementById('modal');
const nameInput   = document.getElementById('habitName');
const colorPicker = document.getElementById('colorPicker');
const dateLabel   = document.getElementById('dateLabel');

document.getElementById('dateLabel').textContent =
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

// ── Color picker ──────────────────────────────────────────────────────────────
let pickedColor = COLORS[0];
COLORS.forEach(c => {
  const sw = document.createElement('button');
  sw.className = 'color-swatch' + (c === pickedColor ? ' selected' : '');
  sw.style.background = c;
  sw.onclick = () => {
    pickedColor = c;
    colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  };
  colorPicker.appendChild(sw);
});

document.getElementById('addBtn').onclick    = () => { nameInput.value = ''; modal.classList.add('open'); nameInput.focus(); };
document.getElementById('cancelBtn').onclick = () => modal.classList.remove('open');
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

// ── Persistence helpers ───────────────────────────────────────────────────────
const getHabits  = () => db.get('habits', 'habits-list').then(v => v || []);
const getDone    = (date) => db.get('habits', `done-${date}`).then(v => v || []);
const saveDone   = (date, ids) => db.set('habits', `done-${date}`, ids);

async function getStreak(habitId) {
  let streak = 0;
  let d = new Date();
  d.setDate(d.getDate() - 1); // start from yesterday
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    const done = await getDone(key);
    if (!done.includes(habitId)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Render ────────────────────────────────────────────────────────────────────
async function render() {
  const [habits, doneToday] = await Promise.all([getHabits(), getDone(today)]);
  listEl.innerHTML = '';

  if (habits.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No habits yet.<br>Tap + to add your first one.</div>`;
    return;
  }

  for (const h of habits) {
    const isDone  = doneToday.includes(h.id);
    const streak  = await getStreak(h.id);

    const row = document.createElement('div');
    row.className = 'habit-row' + (isDone ? ' done' : '');
    row.style.setProperty('--habit-color', h.color);
    row.innerHTML = `
      <div class="habit-check">${isDone ? '✓' : ''}</div>
      <div class="habit-info">
        <div class="habit-name">${esc(h.name)}</div>
        <div class="habit-streak">${streak > 0 ? `<span>🔥 ${streak} day streak</span>` : 'Start your streak today!'}</div>
      </div>
      <button class="habit-delete" data-id="${h.id}" aria-label="Delete">✕</button>
    `;

    row.addEventListener('click', async e => {
      if (e.target.closest('.habit-delete')) return;
      const done = await getDone(today);
      const updated = done.includes(h.id) ? done.filter(x => x !== h.id) : [...done, h.id];
      await saveDone(today, updated);
      render();
    });

    row.querySelector('.habit-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${h.name}"?`)) return;
      const habits = await getHabits();
      await db.set('habits', 'habits-list', habits.filter(x => x.id !== h.id));
      render();
    });

    listEl.appendChild(row);
  }
}

// ── Save new habit ────────────────────────────────────────────────────────────
document.getElementById('saveBtn').onclick = async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const habits = await getHabits();
  habits.push({ id: Date.now().toString(), name, color: pickedColor });
  await db.set('habits', 'habits-list', habits);
  modal.classList.remove('open');
  render();
};

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

render();
