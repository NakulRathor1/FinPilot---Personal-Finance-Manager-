'use strict';

/* Use common.js helpers: $, api, fmt, toast, modal — do NOT redeclare $ */

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const currency = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(Number(value || 0));

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

let dashboardData = null;

function dashModal(id, show = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('show', show);
  el.classList.toggle('open', show);
}

async function loadDashboard() {
  try {
    const filter = document.getElementById('chartFilter');
    const period = filter && filter.value === 'month' ? 'month' : 'all';
    const [data, user] = await Promise.all([
      api(`/api/dashboard?period=${period}`),
      api('/api/user')
    ]);
    dashboardData = data;
    const summary = data.summary || {};
    const name = (user.user && user.user.name) || 'User';
    const first = name.trim().split(/\s+/)[0] || 'User';

    const set = (id, text) => {
      const n = document.getElementById(id);
      if (n) n.textContent = text;
    };

    set('userName', first);
    set('profileName', name);
    set('profileAvatar', first.charAt(0).toUpperCase() || 'U');
    set('totalBalance', currency(summary.total_balance));
    set('totalIncome', currency(summary.total_income));
    set('totalExpenses', currency(summary.total_expenses));
    set('totalSavings', currency(summary.month_savings));
    set('savingsRate', `${Number(summary.savings_rate || 0).toFixed(1)}% monthly savings rate`);
    set('investmentValue', currency(data.investment_value || 0));
    const gain = Number(data.investment_gain || 0);
    set('investmentGain', `${gain >= 0 ? '+' : ''}${currency(gain)} unrealized`);
    set('healthScore', summary.financial_score ?? 0);
    set('healthLabel', summary.financial_label || 'Getting started');
    set('healthMessage', summary.financial_message || '');
    const bar = document.getElementById('healthBar');
    if (bar) bar.style.width = `${Number(summary.financial_score || 0)}%`;

    renderTransactions(data.transactions || []);
    renderGoals(data.goals || []);
    updateBudget(summary);
    try { renderCategoryChart(data.categories || []); } catch (e) { console.warn('chart', e); }
    renderInsight(summary);
  } catch (error) {
    console.error(error);
    if (typeof toast === 'function') toast(error.message || 'Could not load dashboard');
    else alert(error.message || 'Could not load dashboard');
  }
}

function renderTransactions(transactions) {
  const container = document.getElementById('transactionsList');
  if (!container) return;
  if (!transactions.length) {
    container.innerHTML = '<div class="empty-state">No transactions yet.<br>Add your first income or expense.</div>';
    return;
  }
  container.innerHTML = transactions.map(tx => {
    const income = tx.type === 'income';
    return `<div class="transaction-row"><div class="transaction-left"><div class="transaction-icon">${income ? '↗' : '↘'}</div><div><strong>${escapeHtml(tx.name)}</strong><small>${escapeHtml(tx.category)} · ${escapeHtml(tx.date)}</small></div></div><div class="transaction-right"><strong class="${income ? 'income-text' : 'expense-text'}">${income ? '+' : '−'}${currency(tx.amount)}</strong><button class="delete-transaction" data-delete-tx="${tx.id}" title="Delete" type="button">×</button></div></div>`;
  }).join('');
}

function renderGoals(goals) {
  const container = document.getElementById('goalsList');
  if (!container) return;
  if (!goals.length) {
    container.innerHTML = '<div class="empty-state">No savings goals yet.</div>';
    return;
  }
  container.innerHTML = goals.slice(0, 3).map(goal => {
    const percent = Math.min(100, Number(goal.target) > 0 ? Number(goal.saved) / Number(goal.target) * 100 : 0);
    return `<div class="goal-card"><div class="goal-top"><div class="goal-icon">🎯</div><div><strong>${escapeHtml(goal.name)}</strong><small>${goal.deadline ? `Target date: ${escapeHtml(goal.deadline)}` : 'No deadline set'}</small></div></div><div class="goal-progress"><span style="width:${percent}%"></span></div><div class="goal-bottom"><span>${currency(goal.saved)} saved of ${currency(goal.target)}</span><strong>${Math.round(percent)}%</strong></div></div>`;
  }).join('');
}

function updateBudget(summary) {
  const set = (id, t) => { const n = document.getElementById(id); if (n) n.textContent = t; };
  set('budgetSpent', currency(summary.budget_spent));
  const progress = document.getElementById('budgetProgress');
  const total = Number(summary.budget_total || 0);
  const spent = Number(summary.budget_spent || 0);
  if (progress) {
    progress.style.width = `${total > 0 ? Math.min(100, spent / total * 100) : 0}%`;
    progress.classList.toggle('over', total > 0 && spent > total);
  }
  set('budgetStatus', total > 0
    ? (spent <= total ? `${currency(total - spent)} remaining` : `${currency(spent - total)} over budget`)
    : 'Set category budgets on the Budget page');
}

function renderCategoryChart(categories) {
  const canvas = document.getElementById('spendingChart');
  const empty = document.getElementById('chartEmpty');
  if (!canvas) return;
  const rows = (categories || []).filter(item => Number(item.amount) > 0).slice(0, 6);
  if (!rows.length) {
    if (empty) empty.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  canvas.style.display = 'block';
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(280, rect.width || 520);
  const height = 260;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const styles = getComputedStyle(document.body);
  const text = styles.getPropertyValue('--text').trim() || '#f2f8f5';
  const muted = styles.getPropertyValue('--muted-text').trim() || styles.getPropertyValue('--muted').trim() || '#91a69e';
  const green = styles.getPropertyValue('--green').trim() || '#37d39b';
  const max = Math.max(...rows.map(r => Number(r.amount)), 1);
  const labelWidth = Math.min(125, width * 0.34);
  const valueWidth = 82;
  const barWidth = Math.max(40, width - labelWidth - valueWidth - 28);
  const rowH = Math.min(38, (height - 18) / rows.length);
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  rows.forEach((row, index) => {
    const y = 16 + index * rowH;
    const label = String(row.category || 'Other');
    ctx.fillStyle = muted;
    ctx.textAlign = 'left';
    ctx.fillText(label.length > 18 ? label.slice(0, 17) + '…' : label, 0, y + 8);
    const x = labelWidth;
    const w = Math.max(3, barWidth * Number(row.amount) / max);
    ctx.fillStyle = 'rgba(145,166,158,.14)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, barWidth, 16, 8); ctx.fill(); }
    else { ctx.fillRect(x, y, barWidth, 16); }
    ctx.fillStyle = green;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, 16, 8); ctx.fill(); }
    else { ctx.fillRect(x, y, w, 16); }
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(currency(row.amount), width, y + 8);
  });
}

function renderInsight(summary) {
  const title = document.getElementById('insightTitle');
  const text = document.getElementById('insightText');
  if (!title || !text) return;
  if (summary.month_income <= 0 && summary.month_expenses <= 0) {
    title.textContent = 'Your financial journey starts here.';
    text.textContent = 'Add income and expenses to start seeing your monthly cash flow and spending patterns.';
  } else if (summary.budget_total > 0 && summary.budget_spent > summary.budget_total) {
    title.textContent = 'Your spending is above the planned budget.';
    text.textContent = `${currency(summary.budget_spent - summary.budget_total)} over your combined category budgets this month.`;
  } else if (summary.month_savings > 0) {
    title.textContent = 'You are keeping money after this month’s expenses.';
    text.textContent = `Your recorded monthly net is ${currency(summary.month_savings)} (${Number(summary.savings_rate || 0).toFixed(1)}% of income).`;
  } else {
    title.textContent = 'Your recorded expenses are meeting or exceeding income.';
    text.textContent = 'Check recent transactions and upcoming bills, then review category budgets.';
  }
}

function bindPage() {
  const theme = document.getElementById('themeToggle');
  if (localStorage.getItem('finpilot-theme') === 'light') document.body.classList.add('light');
  theme?.addEventListener('click', () => {
    document.body.classList.toggle('light');
    localStorage.setItem('finpilot-theme', document.body.classList.contains('light') ? 'light' : 'dark');
    if (dashboardData) try { renderCategoryChart(dashboardData.categories || []); } catch (e) {}
  });

  const dateEl = document.getElementById('transactionDate');
  if (dateEl) dateEl.value = localDate();

  document.getElementById('openTransactionModal')?.addEventListener('click', () => {
    document.getElementById('transactionForm')?.reset();
    if (dateEl) dateEl.value = localDate();
    dashModal('transactionModal');
  });
  document.getElementById('openGoalModal')?.addEventListener('click', () => {
    document.getElementById('goalForm')?.reset();
    const gs = document.getElementById('goalSaved');
    if (gs) gs.value = '0';
    dashModal('goalModal');
  });
  document.querySelectorAll('[data-close]').forEach(button =>
    button.addEventListener('click', () => dashModal(button.dataset.close, false))
  );
  document.querySelectorAll('.modal').forEach(node =>
    node.addEventListener('click', event => { if (event.target === node) dashModal(node.id, false); })
  );
  document.getElementById('chartFilter')?.addEventListener('change', loadDashboard);

  document.getElementById('transactionForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      type: document.getElementById('transactionType').value,
      name: document.getElementById('transactionName').value.trim(),
      category: document.getElementById('transactionCategory').value,
      amount: document.getElementById('transactionAmount').value,
      date: document.getElementById('transactionDate').value
    };
    try {
      await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });
      dashModal('transactionModal', false);
      toast('Transaction saved');
      await loadDashboard();
    } catch (error) { toast(error.message); }
  });

  document.getElementById('goalForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      name: document.getElementById('goalName').value.trim(),
      target: document.getElementById('goalTarget').value,
      saved: document.getElementById('goalSaved').value || 0,
      deadline: document.getElementById('goalDeadline').value || null
    };
    try {
      await api('/api/goals', { method: 'POST', body: JSON.stringify(payload) });
      dashModal('goalModal', false);
      toast('Savings goal created');
      await loadDashboard();
    } catch (error) { toast(error.message); }
  });

  document.getElementById('transactionsList')?.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-tx]');
    if (!button) return;
    if (!confirm('Delete this transaction?')) return;
    try {
      await api(`/api/transactions/${button.dataset.deleteTx}`, { method: 'DELETE' });
      toast('Transaction deleted');
      await loadDashboard();
    } catch (error) { toast(error.message); }
  });

  window.addEventListener('resize', () => {
    if (dashboardData) try { renderCategoryChart(dashboardData.categories || []); } catch (e) {}
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindPage();
  loadDashboard();
});
