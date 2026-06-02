import { supabase } from '../shared/supabase.js';
import db from '../shared/db.js';

const { data: { session } } = await supabase.auth.getSession();
if (!session) { window.location.href = '../'; throw new Error('unauthenticated'); }

// ── Constants ─────────────────────────────────────────────────────────────────
const STORE = 'finance';
const CAT_ICONS = {
  'Food':'🍔','Transport':'🚗','Drinks / Eating out':'🍻','Shopping':'🛍️',
  'Health':'💊','Entertainment':'🎬','Personal care':'💈','Other':'💸',
};
const BILL_ORDER = ['Debt Repayment','Savings','Investment','Fixed Bill'];

const DEFAULT_BILLS = [
  { category:'Debt Repayment', payee:'AMEX',                  amount:266.84 },
  { category:'Savings',        payee:'House Deposit',          amount:1021.08 },
  { category:'Savings',        payee:'T212 Emergency Fund',    amount:500.00 },
  { category:'Savings',        payee:'Tattoo Fund',            amount:150.00 },
  { category:'Savings',        payee:'Holiday Fund',           amount:750.00 },
  { category:'Investment',     payee:'Hargreaves Lansdown',    amount:50.00 },
  { category:'Investment',     payee:'Kraken (Monthly)',       amount:50.00 },
  { category:'Fixed Bill',     payee:'Rent',                   amount:400.00 },
  { category:'Fixed Bill',     payee:'Gym Membership',         amount:77.10 },
  { category:'Fixed Bill',     payee:'Spotify',                amount:12.99 },
  { category:'Fixed Bill',     payee:'Apple iCloud',           amount:2.99 },
  { category:'Fixed Bill',     payee:'TalkMobile',             amount:12.00 },
  { category:'Fixed Bill',     payee:'Pet Insurance',          amount:18.00 },
  { category:'Fixed Bill',     payee:'Hevy',                   amount:2.99 },
  { category:'Fixed Bill',     payee:'ChatGPT',                amount:19.99 },
];

const DEFAULT_ACCOUNTS = [
  { name:'House Deposit',          type:'savings',    balance:18216.08 },
  { name:'T212 Emergency Fund',    type:'savings',    balance:2520.21 },
  { name:'Hargreaves Lansdown',    type:'investment', balance:54.83 },
  { name:'Fidelity Planviewer',    type:'investment', balance:23539.07 },
  { name:'Kraken',                 type:'investment', balance:188.41 },
  { name:'Crowdcube',              type:'investment', balance:337.58 },
  { name:'AMEX',                   type:'debt',       balance:266.84 },
];

// ── State ─────────────────────────────────────────────────────────────────────
let config   = { label:'', income:0, spendTotal:800, spendWeeks:4 };
let bills    = [];
let accounts = [];
let currentWeek = 1;
let activeTab   = 'Overview';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 });
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const weekBudget = () => config.spendTotal / (config.spendWeeks || 4);

function closeAll() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  const [storedConfig, storedBills, storedAccounts] = await Promise.all([
    db.get(STORE, 'config'),
    db.get(STORE, 'bills'),
    db.get(STORE, 'accounts'),
  ]);

  config   = storedConfig   || { label:'Current Period', income:4133.98, spendTotal:800, spendWeeks:4 };
  bills    = storedBills    || DEFAULT_BILLS.map(b => ({ ...b, id: uid(), paid: false }));
  accounts = storedAccounts || DEFAULT_ACCOUNTS.map(a => ({ ...a, id: uid() }));

  if (!storedBills)    await db.set(STORE, 'bills', bills);
  if (!storedAccounts) await db.set(STORE, 'accounts', accounts);
  if (!storedConfig)   await db.set(STORE, 'config', config);

  renderAll();
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec' + activeTab).classList.add('active');
    document.getElementById('fab').className = 'fab' + (['Spend','Bills','Worth'].includes(activeTab) ? '' : ' hidden');
    if (activeTab === 'Spend') renderSpend();
    if (activeTab === 'Bills') renderBills();
    if (activeTab === 'Worth') renderWorth();
    if (activeTab === 'Overview') renderOverview();
  };
});
document.getElementById('fab').className = 'fab hidden'; // hidden on overview by default

// ── Render: Overview ──────────────────────────────────────────────────────────
async function renderOverview() {
  const txs = await getAllTx();
  const billsTotal = bills.reduce((s, b) => s + b.amount, 0);
  const spare = config.income - billsTotal - config.spendTotal;
  const totalSpent = txs.reduce((s, t) => s + t.amount, 0);
  const spendRemaining = config.spendTotal - totalSpent;

  const card = document.getElementById('overviewCard');
  card.innerHTML = `
    <div class="period-row">
      <span class="period-label">${esc(config.label || 'Current Period')}</span>
    </div>
    <div class="income-row">
      <span class="income-label">Take-home</span>
      <span class="income-amount">${fmt(config.income)}</span>
    </div>
    ${allocationBar('Bills', billsTotal, config.income, '#4fc3f7')}
    ${allocationBar('Spend', config.spendTotal, config.income, '#81c784')}
    ${allocationBar('Spare', Math.max(0, spare), config.income, '#ce93d8')}
    <div class="spare-row">
      <span class="spare-label">Unallocated</span>
      <span class="spare-amount ${spare < 0 ? 'negative' : 'positive'}">${spare < 0 ? '-' : ''}${fmt(spare)}</span>
    </div>
    <div class="spare-row" style="border-top:none;padding-top:4px">
      <span class="spare-label">Spend remaining</span>
      <span class="spare-amount ${spendRemaining < 0 ? 'negative' : 'positive'}">${fmt(spendRemaining)}</span>
    </div>
  `;

  // Extras
  const extras = (await db.get(STORE, 'extras')) || [];
  const extrasCard = document.getElementById('extrasCard');
  if (extras.length === 0) { extrasCard.innerHTML = ''; return; }
  extrasCard.innerHTML = `
    <div class="card-title">Extras / Wishlist</div>
    ${extras.map(e => `
      <div class="bill-row ${e.done ? 'paid' : ''}" style="cursor:pointer" data-eid="${e.id}">
        <div class="bill-check">${e.done ? '✓' : ''}</div>
        <div class="bill-payee">${esc(e.name)}</div>
        <div class="bill-amount">${fmt(e.amount)}</div>
        <button class="bill-del" data-del-extra="${e.id}">✕</button>
      </div>
    `).join('')}
  `;
  extrasCard.querySelectorAll('[data-eid]').forEach(row => {
    row.onclick = async e => {
      if (e.target.closest('[data-del-extra]')) return;
      const extras = (await db.get(STORE, 'extras')) || [];
      const item = extras.find(x => x.id === row.dataset.eid);
      if (item) { item.done = !item.done; await db.set(STORE, 'extras', extras); renderOverview(); }
    };
  });
  extrasCard.querySelectorAll('[data-del-extra]').forEach(btn => {
    btn.onclick = async () => {
      const extras = ((await db.get(STORE, 'extras')) || []).filter(x => x.id !== btn.dataset.delExtra);
      await db.set(STORE, 'extras', extras);
      renderOverview();
    };
  });
}

function allocationBar(label, amount, total, color) {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0;
  return `
    <div class="allocation-row">
      <div class="allocation-header">
        <span class="allocation-name">${label}</span>
        <span class="allocation-amount" style="color:${color}">${fmt(amount)}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>
  `;
}

// ── Render: Spend ─────────────────────────────────────────────────────────────
async function renderSpend() {
  const weeks = config.spendWeeks || 4;
  if (currentWeek < 1) currentWeek = 1;
  if (currentWeek > weeks) currentWeek = weeks;

  document.getElementById('weekLabel').textContent = `Week ${currentWeek} of ${weeks}`;
  document.getElementById('weekPrev').disabled = currentWeek <= 1;
  document.getElementById('weekNext').disabled = currentWeek >= weeks;

  const budget = weekBudget();
  const txs = await getWeekTx(currentWeek);
  const spent = txs.reduce((s, t) => s + t.amount, 0);
  const pct = Math.min(100, (spent / budget) * 100);

  document.getElementById('spendSpent').textContent = `${fmt(spent)} spent`;
  document.getElementById('spendBudgetLabel').textContent = `of ${fmt(budget)}`;
  const bar = document.getElementById('spendBar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 90 ? '#e94560' : pct > 70 ? '#fbbf24' : '#81c784';

  const listEl = document.getElementById('txList');
  if (txs.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No transactions yet this week.<br>Tap + to add one.</div>`;
    return;
  }

  // Group by date
  const groups = {};
  txs.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const sorted = Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));

  listEl.innerHTML = sorted.map(([date, items]) => `
    <div class="tx-group-date">${formatDate(date)}</div>
    ${items.map(t => `
      <div class="tx-row">
        <span class="tx-icon">${CAT_ICONS[t.category] || '💸'}</span>
        <div class="tx-info">
          <div class="tx-cat">${esc(t.category)}</div>
          ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}
        </div>
        <span class="tx-amount">-${fmt(t.amount)}</span>
        <button class="tx-del" data-txid="${t.id}">✕</button>
      </div>
    `).join('')}
  `).join('');

  listEl.querySelectorAll('[data-txid]').forEach(btn => {
    btn.onclick = async () => {
      await db.delete(STORE, 'tx-' + btn.dataset.txid);
      renderSpend();
      renderOverview();
    };
  });
}

// ── Render: Bills ─────────────────────────────────────────────────────────────
function renderBills() {
  const listEl = document.getElementById('billsList');
  const total = bills.reduce((s, b) => s + b.amount, 0);
  const paidTotal = bills.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);

  let html = '';
  BILL_ORDER.forEach(cat => {
    const group = bills.filter(b => b.category === cat);
    if (!group.length) return;
    html += `<div class="bill-group-title">${cat}s</div>`;
    group.forEach(b => {
      html += `
        <div class="bill-row ${b.paid ? 'paid' : ''}" data-bid="${b.id}">
          <div class="bill-check">${b.paid ? '✓' : ''}</div>
          <div class="bill-payee">${esc(b.payee)}</div>
          <div class="bill-amount">${fmt(b.amount)}</div>
          <button class="bill-del" data-del-bill="${b.id}">✕</button>
        </div>
      `;
    });
  });

  html += `
    <div class="bills-total">
      <span class="bills-total-label">Paid ${fmt(paidTotal)} of ${fmt(total)}</span>
      <span class="bills-total-amount">${fmt(total - paidTotal)} remaining</span>
    </div>
  `;

  listEl.innerHTML = html;

  listEl.querySelectorAll('[data-bid]').forEach(row => {
    row.onclick = async e => {
      if (e.target.closest('[data-del-bill]')) return;
      const b = bills.find(x => x.id === row.dataset.bid);
      if (b) { b.paid = !b.paid; await db.set(STORE, 'bills', bills); renderBills(); }
    };
  });
  listEl.querySelectorAll('[data-del-bill]').forEach(btn => {
    btn.onclick = async () => {
      bills = bills.filter(b => b.id !== btn.dataset.delBill);
      await db.set(STORE, 'bills', bills);
      renderBills();
    };
  });
}

// ── Render: Net Worth ─────────────────────────────────────────────────────────
function renderWorth() {
  const assets = accounts.filter(a => a.type !== 'debt').reduce((s, a) => s + a.balance, 0);
  const debts  = accounts.filter(a => a.type === 'debt').reduce((s, a) => s + a.balance, 0);
  const nw     = assets - debts;

  document.getElementById('nwAmount').textContent = fmt(nw);
  document.getElementById('nwAssets').textContent = fmt(assets);
  document.getElementById('nwDebts').textContent  = fmt(debts);

  const listEl = document.getElementById('accountsList');
  const groups = { savings:'Savings', investment:'Investments', current:'Current Accounts', debt:'Debts' };
  let html = '';

  Object.entries(groups).forEach(([type, label]) => {
    const group = accounts.filter(a => a.type === type);
    if (!group.length) return;
    html += `<div class="account-group-title">${label}</div>`;
    html += `<div class="card" style="padding:4px 16px">`;
    group.forEach(a => {
      html += `
        <div class="nw-row">
          <span class="nw-name">${esc(a.name)}</span>
          <span class="nw-bal ${a.type === 'debt' ? 'debt' : ''}">${a.type === 'debt' ? '-' : ''}${fmt(a.balance)}</span>
          <button class="nw-edit" data-edit-account="${a.id}">Edit</button>
        </div>
      `;
    });
    html += `</div>`;
  });

  listEl.innerHTML = html;

  listEl.querySelectorAll('[data-edit-account]').forEach(btn => {
    btn.onclick = () => openEditAccount(btn.dataset.editAccount);
  });
}

// ── Transactions ──────────────────────────────────────────────────────────────
async function getAllTx() {
  const all = await db.getAll(STORE);
  return all.filter(r => r.key.startsWith('tx-')).map(r => r.value);
}

async function getWeekTx(week) {
  const all = await getAllTx();
  return all.filter(t => t.week === week).sort((a,b) => b.date.localeCompare(a.date));
}

// ── Period modal ──────────────────────────────────────────────────────────────
document.getElementById('periodBtn').onclick = () => {
  document.getElementById('periodLabel').value  = config.label || '';
  document.getElementById('periodIncome').value = config.income || '';
  document.getElementById('periodSpend').value  = config.spendTotal || 800;
  document.getElementById('periodWeeks').value  = config.spendWeeks || 4;
  document.getElementById('periodModal').classList.add('open');
};
document.getElementById('periodCancel').onclick = closeAll;
document.getElementById('periodModal').addEventListener('click', e => { if (e.target === document.getElementById('periodModal')) closeAll(); });

document.getElementById('periodSave').onclick = async () => {
  config = {
    label:      document.getElementById('periodLabel').value.trim() || 'Current Period',
    income:     parseFloat(document.getElementById('periodIncome').value) || 0,
    spendTotal: parseFloat(document.getElementById('periodSpend').value) || 800,
    spendWeeks: parseInt(document.getElementById('periodWeeks').value)   || 4,
  };
  await db.set(STORE, 'config', config);
  closeAll();
  renderAll();
};

// ── Add transaction ───────────────────────────────────────────────────────────
document.getElementById('fab').onclick = () => {
  if (activeTab === 'Spend') {
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value   = '';
    document.getElementById('txModal').classList.add('open');
    setTimeout(() => document.getElementById('txAmount').focus(), 100);
  } else if (activeTab === 'Bills') {
    document.getElementById('billPayee').value  = '';
    document.getElementById('billAmount').value = '';
    document.getElementById('billModal').classList.add('open');
  } else if (activeTab === 'Worth') {
    document.getElementById('newAccountName').value    = '';
    document.getElementById('newAccountBalance').value = '';
    document.getElementById('addAccountModal').classList.add('open');
  }
};

document.getElementById('txCancel').onclick  = closeAll;
document.getElementById('billCancel').onclick = closeAll;
document.getElementById('txModal').addEventListener('click', e => { if (e.target === document.getElementById('txModal')) closeAll(); });
document.getElementById('billModal').addEventListener('click', e => { if (e.target === document.getElementById('billModal')) closeAll(); });

document.getElementById('txSave').onclick = async () => {
  const amount = parseFloat(document.getElementById('txAmount').value);
  if (!amount || amount <= 0) { document.getElementById('txAmount').focus(); return; }
  const tx = {
    id: uid(), date: new Date().toISOString().slice(0,10),
    week: currentWeek, amount,
    category: document.getElementById('txCategory').value,
    note: document.getElementById('txNote').value.trim(),
  };
  await db.set(STORE, 'tx-' + tx.id, tx);
  closeAll();
  renderSpend();
  renderOverview();
};

document.getElementById('billSave').onclick = async () => {
  const payee  = document.getElementById('billPayee').value.trim();
  const amount = parseFloat(document.getElementById('billAmount').value);
  if (!payee || !amount) return;
  bills.push({ id: uid(), category: document.getElementById('billCategory').value, payee, amount, paid: false });
  await db.set(STORE, 'bills', bills);
  closeAll();
  renderBills();
};

// ── Edit account balance ──────────────────────────────────────────────────────
let editingAccountId = null;
function openEditAccount(id) {
  editingAccountId = id;
  const a = accounts.find(x => x.id === id);
  if (!a) return;
  document.getElementById('accountModalTitle').textContent = `Edit — ${a.name}`;
  document.getElementById('accountBalance').value = a.balance;
  document.getElementById('accountModal').classList.add('open');
  setTimeout(() => document.getElementById('accountBalance').select(), 100);
}
document.getElementById('accountCancel').onclick = closeAll;
document.getElementById('accountModal').addEventListener('click', e => { if (e.target === document.getElementById('accountModal')) closeAll(); });
document.getElementById('accountSave').onclick = async () => {
  const a = accounts.find(x => x.id === editingAccountId);
  if (!a) return;
  a.balance = parseFloat(document.getElementById('accountBalance').value) || 0;
  await db.set(STORE, 'accounts', accounts);
  closeAll();
  renderWorth();
};

// ── Add account ───────────────────────────────────────────────────────────────
document.getElementById('addAccountCancel').onclick = closeAll;
document.getElementById('addAccountModal').addEventListener('click', e => { if (e.target === document.getElementById('addAccountModal')) closeAll(); });
document.getElementById('addAccountSave').onclick = async () => {
  const name = document.getElementById('newAccountName').value.trim();
  if (!name) return;
  accounts.push({
    id: uid(), name,
    type: document.getElementById('newAccountType').value,
    balance: parseFloat(document.getElementById('newAccountBalance').value) || 0,
  });
  await db.set(STORE, 'accounts', accounts);
  closeAll();
  renderWorth();
};

// ── Week nav ──────────────────────────────────────────────────────────────────
document.getElementById('weekPrev').onclick = () => { currentWeek--; renderSpend(); };
document.getElementById('weekNext').onclick = () => { currentWeek++; renderSpend(); };

// ── Utils ─────────────────────────────────────────────────────────────────────
function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
}

function renderAll() {
  renderOverview();
  if (activeTab === 'Spend')  renderSpend();
  if (activeTab === 'Bills')  renderBills();
  if (activeTab === 'Worth')  renderWorth();
}

boot();
