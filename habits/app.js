import { supabase } from '../shared/supabase.js';
import db from '../shared/db.js';
import { enablePush, isPushEnabled, pushSupported, notificationPermission } from '../shared/push.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

const REMINDER_MODEL = 'claude-haiku-4-5-20251001';
const COLORS = ['#e94560','#4fc3f7','#81c784','#ce93d8','#fbbf24','#f97316','#34d399','#60a5fa'];
const today  = new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

document.getElementById('dateLabel').textContent =
  new Date().toLocaleDateString('en-GB', { weekday:'long', month:'long', day:'numeric' });

// ── Tabs ──────────────────────────────────────────────────────────────────────
let activeTab = 'Today';
document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec' + activeTab).classList.add('active');
    document.getElementById('addBtn').className = 'fab' + (activeTab === 'Today' ? '' : ' hidden');
    if (activeTab === 'Reminders') { renderPushBanner(); renderReminders(); }
  };
});

// ════════════════════════════════════════════════════════════════════════════
//  HABIT TRACKER
// ════════════════════════════════════════════════════════════════════════════
const listEl      = document.getElementById('habitsList');
const modal       = document.getElementById('modal');
const nameInput   = document.getElementById('habitName');
const colorPicker = document.getElementById('colorPicker');

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

const getHabits = () => db.get('habits', 'habits-list').then(v => v || []);
const getDone   = (date) => db.get('habits', `done-${date}`).then(v => v || []);
const saveDone  = (date, ids) => db.set('habits', `done-${date}`, ids);

async function getStreak(habitId) {
  let streak = 0, d = new Date();
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    const done = await getDone(key);
    if (!done.includes(habitId)) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function renderHabits() {
  const [habits, doneToday] = await Promise.all([getHabits(), getDone(today)]);
  listEl.innerHTML = '';
  if (habits.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No habits yet.<br>Tap + to add your first one.</div>`;
    return;
  }
  for (const h of habits) {
    const isDone = doneToday.includes(h.id);
    const streak = await getStreak(h.id);
    const row = document.createElement('div');
    row.className = 'habit-row' + (isDone ? ' done' : '');
    row.style.setProperty('--habit-color', h.color);
    row.innerHTML = `
      <div class="habit-check">${isDone ? '✓' : ''}</div>
      <div class="habit-info">
        <div class="habit-name">${esc(h.name)}</div>
        <div class="habit-streak">${streak > 0 ? `<span>🔥 ${streak} day streak</span>` : 'Start your streak today!'}</div>
      </div>
      <button class="habit-delete" data-id="${h.id}" aria-label="Delete">✕</button>`;
    row.addEventListener('click', async e => {
      if (e.target.closest('.habit-delete')) return;
      const done = await getDone(today);
      const updated = done.includes(h.id) ? done.filter(x => x !== h.id) : [...done, h.id];
      await saveDone(today, updated);
      renderHabits();
    });
    row.querySelector('.habit-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${h.name}"?`)) return;
      const habits = await getHabits();
      await db.set('habits', 'habits-list', habits.filter(x => x.id !== h.id));
      renderHabits();
    });
    listEl.appendChild(row);
  }
}

document.getElementById('saveBtn').onclick = async () => {
  const name = nameInput.value.trim();
  if (!name) { nameInput.focus(); return; }
  const habits = await getHabits();
  habits.push({ id: Date.now().toString(), name, color: pickedColor });
  await db.set('habits', 'habits-list', habits);
  modal.classList.remove('open');
  renderHabits();
};

// ════════════════════════════════════════════════════════════════════════════
//  API KEY
// ════════════════════════════════════════════════════════════════════════════
const getKey = () => db.get('habits', 'anthropic-key');
document.getElementById('keyBtn').onclick = async () => {
  document.getElementById('keyInput').value = (await getKey()) || '';
  document.getElementById('keyModal').classList.add('open');
};
document.getElementById('keyCancel').onclick = () => document.getElementById('keyModal').classList.remove('open');
document.getElementById('keySave').onclick = async () => {
  const k = document.getElementById('keyInput').value.trim();
  await db.set('habits', 'anthropic-key', k);
  document.getElementById('keyModal').classList.remove('open');
};

// ════════════════════════════════════════════════════════════════════════════
//  PUSH
// ════════════════════════════════════════════════════════════════════════════
async function renderPushBanner() {
  const banner = document.getElementById('pushBanner');
  const text   = document.getElementById('pushBannerText');
  const btn    = document.getElementById('pushBannerBtn');

  if (!pushSupported()) {
    banner.classList.remove('ok');
    text.textContent = 'Notifications need this app installed to your Home Screen (iOS 16.4+).';
    btn.style.display = 'none';
    return;
  }
  if (await isPushEnabled()) {
    banner.classList.add('ok');
    text.textContent = '✓ Notifications are on for this device.';
    btn.style.display = 'none';
  } else {
    banner.classList.remove('ok');
    text.textContent = 'Enable notifications to receive your reminders.';
    btn.style.display = '';
  }
}

document.getElementById('pushBannerBtn').onclick = async () => {
  try { await enablePush(); }
  catch (e) { alert(e.message); }
  renderPushBanner();
};

// ════════════════════════════════════════════════════════════════════════════
//  REMINDERS
// ════════════════════════════════════════════════════════════════════════════
async function parseReminder(input) {
  const key = await getKey();
  if (!key) { document.getElementById('keyModal').classList.add('open'); throw new Error('Add your Anthropic API key first (🔑 top-right).'); }

  const now = new Date();
  const system = `You convert a person's plain-language reminder into a strict JSON schedule.
Today is ${now.toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}. Timezone is Europe/London.
Output ONLY a JSON object, no prose, with exactly these fields:
{
  "text": string,          // the thing to be reminded of, e.g. "take vitamin D"
  "title": string,         // 2-4 word notification title, e.g. "Vitamin D"
  "type": "once"|"daily"|"weekly"|"monthly",
  "time": "HH:MM",         // 24-hour local time
  "daysOfWeek": number[],  // for weekly only; 0=Sunday..6=Saturday; [] otherwise
  "dayOfMonth": number,    // for monthly only (1-31); 0 otherwise
  "date": "YYYY-MM-DD",    // for once only; "" otherwise
  "summary": string        // short human-readable schedule, e.g. "Every Thursday at 3:00 PM"
}
If no time is given, default to 09:00. Interpret natural phrasing sensibly.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: REMINDER_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: input }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Parsing failed: ' + (res.status === 401 ? 'invalid API key' : err.slice(0,120)));
  }
  const data = await res.json();
  let txt = (data.content?.[0]?.text || '').trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Couldn't understand that — try rephrasing.");
  return JSON.parse(m[0]);
}

async function addReminderFromText(input) {
  const p = await parseReminder(input);
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('reminders').insert({
    user_id:      user.id,
    text:         p.text || input,
    title:        p.title || 'Reminder',
    type:         p.type || 'daily',
    time:         p.time || '09:00',
    days_of_week: Array.isArray(p.daysOfWeek) ? p.daysOfWeek : [],
    day_of_month: p.dayOfMonth || 0,
    on_date:      p.date || null,
    summary:      p.summary || '',
    original:     input,
    active:       true,
  });
  if (error) throw new Error(error.message);
}

document.getElementById('nlSubmit').onclick = async () => {
  const input = document.getElementById('nlInput').value.trim();
  if (!input) return;
  const btn = document.getElementById('nlSubmit');
  btn.disabled = true; btn.textContent = 'Understanding…';
  try {
    await addReminderFromText(input);
    document.getElementById('nlInput').value = '';
    if (!(await isPushEnabled()) && pushSupported()) {
      try { await enablePush(); } catch (_) {}
    }
    await renderReminders();
    renderPushBanner();
  } catch (e) {
    alert(e.message);
  }
  btn.disabled = false; btn.textContent = 'Add reminder';
};

async function getReminders() {
  const { data } = await supabase.from('reminders').select('*').order('created_at', { ascending: false });
  return data || [];
}

async function renderReminders() {
  const list = document.getElementById('remindersList');
  const rems = await getReminders();
  if (!rems.length) {
    list.innerHTML = `<div class="empty-state" style="padding-top:30px">No reminders yet.<br>Describe one above to get started.</div>`;
    return;
  }
  list.innerHTML = rems.map(r => `
    <div class="rem-card ${r.active ? '' : 'off'}" data-id="${r.id}">
      <div class="rem-top">
        <div class="rem-body">
          <div class="rem-text">${esc(r.text)}</div>
          <div class="rem-sched">⏰ ${esc(r.summary || scheduleSummary(r))}</div>
        </div>
        <button class="rem-toggle ${r.active ? 'on' : ''}" data-toggle="${r.id}"></button>
      </div>
      <div class="rem-actions">
        <button class="rem-act" data-edit="${r.id}">Edit</button>
        <button class="rem-act del" data-del="${r.id}">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = async () => {
      const r = rems.find(x => x.id === btn.dataset.toggle);
      await supabase.from('reminders').update({ active: !r.active }).eq('id', r.id);
      renderReminders();
    };
  });
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this reminder?')) return;
      await supabase.from('reminders').delete().eq('id', btn.dataset.del);
      renderReminders();
    };
  });
  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => openEditReminder(rems.find(x => x.id === btn.dataset.edit));
  });
}

function scheduleSummary(r) {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const t = r.time;
  if (r.type === 'daily')   return `Every day at ${t}`;
  if (r.type === 'weekly')  return `Every ${(r.days_of_week||[]).map(d => DAYS[d]).join(', ')} at ${t}`;
  if (r.type === 'monthly') return `Day ${r.day_of_month} of each month at ${t}`;
  if (r.type === 'once')    return `${r.on_date} at ${t}`;
  return t;
}

// ── Edit reminder ─────────────────────────────────────────────────────────────
let editingReminder = null;
function openEditReminder(r) {
  editingReminder = r;
  document.getElementById('remEditText').value = r.text;
  document.getElementById('remEditSchedule').value = '';
  document.getElementById('remEditModal').classList.add('open');
}
document.getElementById('remEditCancel').onclick = () => document.getElementById('remEditModal').classList.remove('open');
document.getElementById('remEditModal').addEventListener('click', e => {
  if (e.target === document.getElementById('remEditModal')) document.getElementById('remEditModal').classList.remove('open');
});
document.getElementById('remEditSave').onclick = async () => {
  const text = document.getElementById('remEditText').value.trim();
  const reSchedule = document.getElementById('remEditSchedule').value.trim();
  const update = { text };
  try {
    if (reSchedule) {
      const p = await parseReminder(reSchedule);
      Object.assign(update, {
        type: p.type, time: p.time,
        days_of_week: Array.isArray(p.daysOfWeek) ? p.daysOfWeek : [],
        day_of_month: p.dayOfMonth || 0,
        on_date: p.date || null,
        summary: p.summary || '',
      });
    }
    await supabase.from('reminders').update(update).eq('id', editingReminder.id);
    document.getElementById('remEditModal').classList.remove('open');
    renderReminders();
  } catch (e) { alert(e.message); }
};

// ── Init ──────────────────────────────────────────────────────────────────────
renderHabits();
