import { supabase } from '../shared/supabase.js';
import db from '../shared/db.js';

const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Gift', 'Other'],
  expense: ['Food', 'Transport', 'Housing', 'Health', 'Entertainment', 'Shopping', 'Other'],
};

const ICONS = {
  Salary:'💼', Freelance:'💻', Investment:'📈', Gift:'🎁',
  Food:'🍔', Transport:'🚗', Housing:'🏠', Health:'💊',
  Entertainment:'🎬', Shopping:'🛍️', Other:'💸',
};

let txType = 'income';

const btnIncome   = document.getElementById('btnIncome');
const btnExpense  = document.getElementById('btnExpense');
const txAmount    = document.getElementById('txAmount');
const txCategory  = document.getElementById('txCategory');
const txNote      = document.getElementById('txNote');
const addTxBtn    = document.getElementById('addTxBtn');
const txList      = document.getElementById('txList');
const balanceAmt  = document.getElementById('balanceAmt');
const totalIncome = document.getElementById('totalIncome');
const totalExpenses = document.getElementById('totalExpenses');

function setType(t) {
  txType = t;
  btnIncome.classList.toggle('active', t === 'income');
  btnExpense.classList.toggle('active', t === 'expense');
  populateCategories();
}

function populateCategories() {
  txCategory.innerHTML = CATEGORIES[txType].map(c => `<option value="${c}">${c}</option>`).join('');
}

btnIncome.onclick  = () => setType('income');
btnExpense.onclick = () => setType('expense');
populateCategories();

// ── Add transaction ───────────────────────────────────────────────────────────
addTxBtn.onclick = async () => {
  const amount = parseFloat(txAmount.value);
  if (!amount || amount <= 0) { txAmount.focus(); return; }

  const record = {
    id:       Date.now().toString(),
    date:     new Date().toISOString().slice(0, 10),
    type:     txType,
    amount,
    category: txCategory.value,
    note:     txNote.value.trim(),
  };

  await db.set('finance', record.id, record);
  txAmount.value = '';
  txNote.value   = '';
  render();
};

// ── Render ────────────────────────────────────────────────────────────────────
async function render() {
  const all = await db.getAll('finance');
  all.sort((a, b) => b.key.localeCompare(a.key));

  let income = 0, expenses = 0;
  all.forEach(({ value: t }) => {
    if (t.type === 'income') income += t.amount;
    else expenses += t.amount;
  });

  const balance = income - expenses;
  balanceAmt.textContent = fmt(balance);
  balanceAmt.className = 'balance-amount ' + (balance < 0 ? 'negative' : 'positive');
  totalIncome.textContent   = fmt(income);
  totalExpenses.textContent = fmt(expenses);

  txList.innerHTML = '';
  if (all.length === 0) {
    txList.innerHTML = `<div class="empty-state">No transactions yet.</div>`;
    return;
  }

  for (const { value: t } of all) {
    const row = document.createElement('div');
    row.className = 'tx-row';
    row.innerHTML = `
      <div class="tx-icon ${t.type}">${ICONS[t.category] || '💸'}</div>
      <div class="tx-info">
        <div class="tx-cat">${esc(t.category)}</div>
        <div class="tx-note">${t.note ? esc(t.note) : formatDate(t.date)}</div>
        ${t.note ? `<div class="tx-date">${formatDate(t.date)}</div>` : ''}
      </div>
      <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</div>
      <button class="tx-del" data-id="${t.id}">✕</button>
    `;
    row.querySelector('.tx-del').onclick = async () => {
      await db.delete('finance', t.id);
      render();
    };
    txList.appendChild(row);
  }
}

function fmt(n) {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

render();
