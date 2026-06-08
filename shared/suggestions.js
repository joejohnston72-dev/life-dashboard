// Cross-module insight engine. Reads data from every module and returns a
// prioritised list of warnings + improvement tips for the home dashboard.
import db from './db.js';
import { supabase } from './supabase.js';
import { isPushEnabled, pushSupported } from './push.js';

const DAY = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = iso => {
  if (!iso) return Infinity;
  const d = new Date((iso.length === 10 ? iso + 'T12:00:00' : iso));
  return isNaN(d) ? Infinity : Math.floor((Date.now() - d.getTime()) / DAY);
};
const gbp = n => '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// severity weight for sorting: warn first, then tip, then good
const RANK = { warn: 0, tip: 1, good: 2 };

export async function generateSuggestions() {
  const out = [];
  const add = (severity, module, icon, text, href) => out.push({ severity, module, icon, text, href });

  await Promise.allSettled([
    financeSuggestions(add),
    workoutSuggestions(add),
    habitSuggestions(add),
  ]);

  out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  if (out.length === 0) add('good', 'All', '✅', "You're all caught up — nothing needs attention.", null);
  return out;
}

// ── Finance ───────────────────────────────────────────────────────────────────
async function financeSuggestions(add) {
  const [config, bills, accounts, all] = await Promise.all([
    db.get('finance', 'config'),
    db.get('finance', 'bills'),
    db.get('finance', 'accounts'),
    db.getAll('finance'),
  ]);
  if (!config) return;

  const txs = all.filter(r => r.key.startsWith('tx-')).map(r => r.value);
  const billsList = bills || [];
  const billsTotal = billsList.reduce((s, b) => s + (b.amount || 0), 0);
  const spendTotal = config.spendTotal || 0;
  const income = config.income || 0;

  // Over-allocated budget
  const unallocated = income - billsTotal - spendTotal;
  if (unallocated < 0) {
    add('warn', 'Finance', '💰', `Budget over-allocated by ${gbp(unallocated)} — income doesn't cover bills + spend.`, 'finance/');
  }

  // Spend budget usage
  const spent = txs.reduce((s, t) => s + (t.amount || 0), 0);
  if (spendTotal > 0) {
    const pct = Math.round((spent / spendTotal) * 100);
    if (pct >= 100)      add('warn', 'Finance', '💸', `You've spent ${gbp(spent)} — over your ${gbp(spendTotal)} spend budget.`, 'finance/');
    else if (pct >= 85)  add('warn', 'Finance', '💸', `${pct}% of your spend budget used (${gbp(spent)} of ${gbp(spendTotal)}).`, 'finance/');
  }

  // Unpaid bills
  const unpaid = billsList.filter(b => !b.paid);
  if (unpaid.length) {
    const owed = unpaid.reduce((s, b) => s + (b.amount || 0), 0);
    add('tip', 'Finance', '📋', `${unpaid.length} bill${unpaid.length > 1 ? 's' : ''} still unpaid (${gbp(owed)}).`, 'finance/');
  }

  // No recent activity
  if (txs.length) {
    const last = txs.reduce((m, t) => Math.min(m, daysSince(t.date)), Infinity);
    if (last >= 7) add('tip', 'Finance', '🧾', `No spending logged in ${last} days — keep it current for accuracy.`, 'finance/');
  }

  // Debt present
  const debt = (accounts || []).filter(a => a.type === 'debt').reduce((s, a) => s + (a.balance || 0), 0);
  if (debt > 0) add('tip', 'Finance', '📉', `Outstanding debt of ${gbp(debt)} across your accounts.`, 'finance/');
}

// ── Workout ───────────────────────────────────────────────────────────────────
async function workoutSuggestions(add) {
  const all = await db.getAll('workout');
  const sessions = all
    .filter(r => r.key.startsWith('session-') && r.value?.exercises)
    .map(r => r.value);

  if (!sessions.length) {
    add('tip', 'Workout', '💪', 'No workouts yet — log one or import your Hevy history.', 'workout/');
    return;
  }

  const lastDays = sessions.reduce((m, s) => Math.min(m, daysSince(s.date || s.startTime)), Infinity);
  if (lastDays >= 7)      add('warn', 'Workout', '🏋️', `No workout in ${lastDays} days — time to get back in.`, 'workout/');
  else if (lastDays >= 4) add('tip',  'Workout', '🏋️', `${lastDays} days since your last workout.`, 'workout/');

  // Muscle group neglect — categories not trained in 14 days
  const recent = sessions.filter(s => daysSince(s.date || s.startTime) <= 14);
  const trained = new Set();
  recent.forEach(s => s.exercises.forEach(e => e.category && trained.add(e.category)));
  const MAIN = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings'];
  const skipped = MAIN.filter(c => !trained.has(c));
  if (recent.length >= 3 && skipped.length && skipped.length <= 2) {
    add('tip', 'Workout', '⚖️', `Haven't trained ${skipped.join(' or ')} in 2 weeks — balance it out.`, 'workout/');
  }

  // Consistency win
  const last7 = sessions.filter(s => daysSince(s.date || s.startTime) <= 7).length;
  if (last7 >= 4) add('good', 'Workout', '🔥', `${last7} workouts in the last 7 days — great consistency!`, 'workout/');
}

// ── Habits + reminders ────────────────────────────────────────────────────────
async function habitSuggestions(add) {
  const [habits, doneToday] = await Promise.all([
    db.get('habits', 'habits-list'),
    db.get('habits', `done-${today()}`),
  ]);
  const list = habits || [];
  const done = doneToday || [];

  if (list.length) {
    const remaining = list.filter(h => !done.includes(h.id));
    const hour = new Date().getHours();
    if (remaining.length && hour >= 18) {
      add('warn', 'Habits', '✅', `${remaining.length} habit${remaining.length > 1 ? 's' : ''} still not done today.`, 'habits/');
    } else if (remaining.length === 0) {
      add('good', 'Habits', '🎯', 'All habits done today — nice work!', 'habits/');
    }
  }

  // Reminders without notifications enabled
  try {
    const { data: reminders } = await supabase.from('reminders').select('id').eq('active', true).limit(1);
    if (reminders && reminders.length && pushSupported() && !(await isPushEnabled())) {
      add('warn', 'Habits', '🔔', "Notifications are off — your reminders won't fire. Enable them.", 'habits/');
    }
  } catch (_) {}
}
