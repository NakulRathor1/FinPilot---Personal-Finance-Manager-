'use strict';

let investments = [];
let activeInvestmentId = null;
let searchTimer = null;
let latestSearchToken = 0;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('addInvestmentBtn')?.addEventListener('click', () => openInvestmentModal());
  document.getElementById('investmentForm')?.addEventListener('submit', submitInvestmentForm);
  document.getElementById('assetName')?.addEventListener('input', onAssetSearchInput);
  document.getElementById('fetchQuoteBtn')?.addEventListener('click', fetchQuoteForForm);
  document.getElementById('refreshPricesBtn')?.addEventListener('click', refreshAllPrices);
  document.getElementById('portfolioRefreshBtn')?.addEventListener('click', loadInvestments);
  document.getElementById('tradeForm')?.addEventListener('submit', submitTradeForm);
  document.getElementById('analyzePortfolioBtn')?.addEventListener('click', analyzePortfolio);

  document.querySelectorAll('[data-close-modal]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal))
  );
  document.querySelectorAll('.modal').forEach(node =>
    node.addEventListener('click', e => { if (e.target === node) closeModal(node.id); })
  );
  document.addEventListener('click', e => {
    const results = document.getElementById('marketSearchResults');
    if (results && !e.target.closest('.search-field')) results.classList.remove('open');
  });

  setDefaultInvestmentDate();
  loadInvestments();
});

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function setDefaultInvestmentDate() {
  const el = document.getElementById('purchaseDate');
  if (el) el.value = todayLocal();
}
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('show','open');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden','false');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('show','open');
  modal.style.display = '';
  modal.setAttribute('aria-hidden','true');
  document.getElementById('marketSearchResults')?.classList.remove('open');
}
function openInvestmentModal(editItem = null) {
  const form = document.getElementById('investmentForm');
  form.reset();
  setDefaultInvestmentDate();
  document.getElementById('investmentId').value = '';
  document.getElementById('quoteSource').value = 'manual';
  document.getElementById('assetCurrency').value = 'INR';
  document.getElementById('modalTitle').textContent = editItem ? 'Edit Investment' : 'Add Investment';
  document.getElementById('submitInvestmentBtn').textContent = editItem ? 'Save changes' : 'Add Investment';

  ['quantityField','buyPriceField','purchaseDateField'].forEach(id => {
    document.getElementById(id).style.display = editItem ? 'none' : '';
  });
  ['assetQuantity','buyPrice','purchaseDate'].forEach(id => {
    document.getElementById(id).required = !editItem;
  });

  if (editItem) {
    document.getElementById('investmentId').value = editItem.id;
    document.getElementById('assetType').value = editItem.asset_type;
    document.getElementById('assetName').value = editItem.asset_name;
    document.getElementById('assetSymbol').value = editItem.symbol || '';
    document.getElementById('currentPrice').value = editItem.current_price;
    document.getElementById('quoteSource').value = editItem.quote_source || 'manual';
  }
  openModal('investmentModal');
  setTimeout(() => document.getElementById('assetName')?.focus(), 80);
}

async function onAssetSearchInput(event) {
  const q = event.target.value.trim();
  const box = document.getElementById('marketSearchResults');
  if (!box) return;
  clearTimeout(searchTimer);
  const token = ++latestSearchToken;
  if (q.length < 2) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<div class="search-item muted">Searching supported markets…</div>';
  box.classList.add('open');

  searchTimer = setTimeout(async () => {
    try {
      const data = await api(`/api/investments/catalog?q=${encodeURIComponent(q)}`);
      if (token !== latestSearchToken) return;
      const results = Array.isArray(data.results) ? data.results : [];
      if (!data.success) throw new Error(data.message || 'Search is temporarily unavailable.');
      if (!results.length) {
        box.innerHTML = '<div class="search-item muted">No matching listing returned. Try a ticker symbol or enter the asset manually.</div>';
        return;
      }
      box.innerHTML = results.map((r, i) => `
        <button type="button" class="search-item" data-result-index="${i}">
          <strong>${escapeInvestment(r.asset_name || r.longname || r.symbol)}</strong>
          <span class="muted">${escapeInvestment(r.asset_type || 'Asset')} · ${escapeInvestment(r.symbol || '')}${r.exchange ? ' · ' + escapeInvestment(r.exchange) : ''}${r.currency ? ' · ' + escapeInvestment(r.currency) : ''}</span>
        </button>`).join('');
      box.querySelectorAll('[data-result-index]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = results[Number(btn.dataset.resultIndex)];
          document.getElementById('assetName').value = r.asset_name || r.symbol;
          document.getElementById('assetType').value = r.asset_type || 'Stocks';
          document.getElementById('assetSymbol').value = r.symbol || '';
          document.getElementById('quoteSource').value = r.quote_source || 'yahoo';
          document.getElementById('assetCurrency').value = r.currency || 'INR';
          box.classList.remove('open');
          if (r.symbol) fetchQuoteForForm();
        });
      });
    } catch (err) {
      if (token !== latestSearchToken) return;
      box.innerHTML = `<div class="search-item muted">${escapeInvestment(err.message || 'Search failed. You can enter the asset manually.')}</div>`;
    }
  }, 300);
}

async function fetchQuoteForForm() {
  const symbol = document.getElementById('assetSymbol').value.trim();
  const status = document.getElementById('quoteStatus');
  if (!symbol) {
    if (status) status.textContent = 'Enter a ticker symbol or choose a search result.';
    return;
  }
  if (status) status.textContent = 'Fetching market quote…';
  try {
    const response = await fetch(`/api/investments/quote?symbol=${encodeURIComponent(symbol)}`);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { location.href = '/login'; return; }
    if (!response.ok || !data.success || data.price == null) {
      throw new Error(data.message || 'Quote unavailable');
    }
    document.getElementById('currentPrice').value = data.price;
    const buy = document.getElementById('buyPrice');
    if (buy && !buy.value) buy.value = data.price;
    document.getElementById('quoteSource').value = data.source || 'yahoo';
    if (data.currency) document.getElementById('assetCurrency').value = data.currency;
    const currency = data.currency || document.getElementById('assetCurrency').value || 'unknown currency';
    if (status) status.textContent = `Quote: ${data.price} ${currency} · ${data.source || 'market data'} · ${data.fetched_at || 'time unavailable'}. Convert foreign-currency prices to INR before saving.`;
  } catch (err) {
    if (status) status.textContent = `${err.message || 'Quote fetch failed'} — enter the price manually.`;
  }
}

async function submitInvestmentForm(event) {
  event.preventDefault();
  const id = document.getElementById('investmentId').value;
  const btn = document.getElementById('submitInvestmentBtn');
  btn.disabled = true;
  try {
    const payload = {
      asset_type: document.getElementById('assetType').value,
      asset_name: document.getElementById('assetName').value.trim(),
      symbol: document.getElementById('assetSymbol').value.trim(),
      current_price: Number(document.getElementById('currentPrice').value),
      quote_source: document.getElementById('quoteSource').value || 'manual'
    };
    if (!id) {
      payload.quantity = Number(document.getElementById('assetQuantity').value);
      payload.buy_price = Number(document.getElementById('buyPrice').value);
      payload.purchase_date = document.getElementById('purchaseDate').value;
    }
    await api(id ? `/api/investments/${id}` : '/api/investments', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload)
    });
    showInvestmentToast(id ? 'Investment updated.' : 'Investment added.');
    closeModal('investmentModal');
    await loadInvestments();
  } catch (error) {
    showInvestmentToast(error.message || 'Could not save investment.', true);
  } finally {
    btn.disabled = false;
  }
}

async function loadInvestments() {
  try {
    const data = await api('/api/investments');
    investments = data.investments || [];
    renderSummary();
    renderInvestments();
    renderCategoryPerformance();
    renderDistribution();
  } catch (error) {
    showInvestmentToast(error.message || 'Unable to load investments.', true);
  }
}
function renderSummary() {
  const invested = investments.reduce((s,x) => s + Number(x.invested_value || 0), 0);
  const current = investments.reduce((s,x) => s + Number(x.current_value || 0), 0);
  const profit = current - invested;
  const pct = invested ? profit / invested * 100 : 0;
  document.getElementById('totalInvested').textContent = formatINR(invested);
  document.getElementById('currentValue').textContent = formatINR(current);
  document.getElementById('totalProfit').textContent = formatINR(profit);
  document.getElementById('overallReturn').textContent = `${pct.toFixed(2)}%`;
  setProfitClass(document.getElementById('totalProfit'), profit);
  setProfitClass(document.getElementById('overallReturn'), pct);
}
function renderInvestments() {
  const container = document.getElementById('investmentList');
  if (!investments.length) {
    container.innerHTML = '<div class="empty-investments"><h3>No investments yet</h3><p>Add your first investment to start tracking your portfolio.</p></div>';
    return;
  }
  container.innerHTML = investments.map(item => {
    const profit = Number(item.current_value) - Number(item.invested_value);
    const pct = Number(item.invested_value) ? profit / Number(item.invested_value) * 100 : 0;
    const updated = item.price_updated_at ? ` · ${escapeInvestment(item.quote_source || 'manual')} · ${escapeInvestment(String(item.price_updated_at).slice(0,16))}` : '';
    return `<div class="investment-row">
      <div class="investment-info"><div class="asset-icon">${getAssetIcon(item.asset_type)}</div><div><h3>${escapeInvestment(item.asset_name)}</h3><p>${escapeInvestment(item.asset_type)}${item.symbol ? ' · '+escapeInvestment(item.symbol) : ''}${updated}</p></div></div>
      <div class="investment-data"><small>Quantity</small><strong>${Number(item.quantity)}</strong></div>
      <div class="investment-data"><small>Avg cost</small><strong>${formatINR(item.buy_price)}</strong></div>
      <div class="investment-data"><small>Current</small><strong>${formatINR(item.current_price)}</strong></div>
      <div class="investment-data"><small>Invested</small><strong>${formatINR(item.invested_value)}</strong></div>
      <div class="investment-data"><small>Value</small><strong>${formatINR(item.current_value)}</strong></div>
      <div class="investment-performance ${profit >= 0 ? 'profit' : 'loss'}"><strong>${profit >= 0 ? '+' : '−'}${formatINR(Math.abs(profit))}</strong><span>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div>
      <div class="investment-actions">
        <button type="button" class="secondary inv-action" data-action="edit" data-id="${item.id}" title="Edit">✎</button>
        <button type="button" class="secondary inv-action" data-action="buy" data-id="${item.id}" title="Buy more">+</button>
        <button type="button" class="secondary inv-action" data-action="sell" data-id="${item.id}" title="Sell">−</button>
        <button type="button" class="secondary inv-action" data-action="history" data-id="${item.id}" title="History">☰</button>
        <button type="button" class="delete-investment inv-action" data-action="delete" data-id="${item.id}" title="Delete">×</button>
      </div></div>`;
  }).join('');
  container.querySelectorAll('.inv-action').forEach(btn =>
    btn.addEventListener('click', () => handleInvestmentAction(btn.dataset.action, Number(btn.dataset.id)))
  );
}
async function handleInvestmentAction(action, id) {
  const item = investments.find(x => Number(x.id) === id);
  if (!item) return;
  if (action === 'edit') openInvestmentModal(item);
  if (action === 'buy' || action === 'sell') openTradeModal(item, action);
  if (action === 'history') await openHistoryModal(item);
  if (action === 'delete' && confirm(`Delete ${item.asset_name} and its recorded history?`)) {
    try { await api(`/api/investments/${id}`, {method:'DELETE'}); showInvestmentToast('Investment deleted.'); await loadInvestments(); }
    catch (e) { showInvestmentToast(e.message, true); }
  }
}
function openTradeModal(item, action) {
  activeInvestmentId = item.id;
  document.getElementById('tradeAction').value = action;
  document.getElementById('tradeTitle').textContent = `${action === 'buy' ? 'Buy more' : 'Sell'} · ${item.asset_name}`;
  document.getElementById('tradeHint').textContent = action === 'buy'
    ? `Currently held: ${item.quantity}. Additional purchases update your average cost.`
    : `Currently held: ${item.quantity}. You cannot sell more than you hold.`;
  document.getElementById('tradeQuantity').value = '';
  document.getElementById('tradePrice').value = item.current_price;
  document.getElementById('tradeDate').value = todayLocal();
  document.getElementById('tradeNotes').value = '';
  openModal('tradeModal');
}
async function submitTradeForm(event) {
  event.preventDefault();
  const action = document.getElementById('tradeAction').value;
  const id = activeInvestmentId;
  const payload = {
    quantity: Number(document.getElementById('tradeQuantity').value),
    price: Number(document.getElementById('tradePrice').value),
    date: document.getElementById('tradeDate').value,
    notes: document.getElementById('tradeNotes').value.trim()
  };
  const btn = event.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await api(`/api/investments/${id}/${action}`, {method:'POST', body:JSON.stringify(payload)});
    showInvestmentToast(action === 'buy' ? 'Purchase recorded.' : 'Sale recorded.');
    closeModal('tradeModal');
    await loadInvestments();
  } catch (e) { showInvestmentToast(e.message, true); }
  finally { btn.disabled = false; }
}
async function openHistoryModal(item) {
  document.getElementById('historyTitle').textContent = `History · ${item.asset_name}`;
  document.getElementById('historyBody').innerHTML = '<p class="muted">Loading…</p>';
  openModal('historyModal');
  try {
    const data = await api(`/api/investments/${item.id}/history`);
    const rows = data.history || [];
    if (!rows.length) { document.getElementById('historyBody').innerHTML = '<p class="muted">No transactions recorded yet.</p>'; return; }
    document.getElementById('historyBody').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Qty</th><th>Price</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeInvestment(r.date)}</td><td>${escapeInvestment(r.action)}</td><td>${Number(r.quantity)}</td><td>${formatINR(r.price)}</td><td>${formatINR(r.amount)}</td><td>${escapeInvestment(r.notes || '')}</td></tr>`).join('')}</tbody></table></div>`;
  } catch (e) { document.getElementById('historyBody').innerHTML = `<p class="status-error">${escapeInvestment(e.message)}</p>`; }
}
async function refreshAllPrices() {
  const btn = document.getElementById('refreshPricesBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
  try {
    const data = await api('/api/investments/refresh-prices', {method:'POST', body:'{}'});
    showInvestmentToast(data.message || 'Price refresh completed.');
    await loadInvestments();
  } catch (e) { showInvestmentToast(e.message || 'Could not refresh prices.', true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh prices'; } }
}
function renderCategoryPerformance() {
  const el = document.getElementById('categoryPerformance');
  const groups = {};
  investments.forEach(x => {
    const k = x.asset_type || 'Other';
    groups[k] ||= {invested:0,current:0};
    groups[k].invested += Number(x.invested_value || 0);
    groups[k].current += Number(x.current_value || 0);
  });
  if (!Object.keys(groups).length) { el.innerHTML = '<p class="muted">No category data available.</p>'; return; }
  el.innerHTML = Object.entries(groups).map(([name,v]) => {
    const gain = v.current-v.invested, pct = v.invested ? gain/v.invested*100 : 0;
    return `<div class="category-row"><div><strong>${escapeInvestment(name)}</strong><small>Invested ${formatINR(v.invested)}</small></div><div class="${gain>=0?'profit':'loss'}"><strong>${gain>=0?'+':'−'}${formatINR(Math.abs(gain))}</strong><small>${pct>=0?'+':''}${pct.toFixed(2)}%</small></div></div>`;
  }).join('');
}
function renderDistribution() {
  const el = document.getElementById('portfolioDistribution');
  if (!investments.length) { el.innerHTML = '<p class="muted">No portfolio data available.</p>'; return; }
  const groups = {};
  investments.forEach(x => groups[x.asset_type || 'Other'] = (groups[x.asset_type || 'Other'] || 0) + Number(x.current_value || 0));
  const total = Object.values(groups).reduce((a,b)=>a+b,0);
  el.innerHTML = Object.entries(groups).map(([name,value]) => {
    const pct = total ? value/total*100 : 0;
    return `<div class="distribution-row"><div class="distribution-title"><span>${escapeInvestment(name)}</span><strong>${pct.toFixed(1)}%</strong></div><div class="distribution-bar"><div style="width:${pct}%"></div></div></div>`;
  }).join('');
}
async function analyzePortfolio() {
  const result = document.getElementById('aiResult');
  if (!investments.length) { result.textContent = 'Add investments first so FinPilot can analyze your portfolio.'; return; }
  result.innerHTML = '<p>Analyzing your recorded portfolio…</p>';
  try {
    const data = await api('/api/investments/ai-analysis');
    if (!data.success) throw new Error(data.message || 'Analysis unavailable');
    const a = data.analysis || {};
    result.innerHTML = `<div class="ai-insights">
      <div class="ai-insight"><strong>Portfolio Overview</strong><p>${escapeInvestment(a.overview || 'Not available')}</p></div>
      <div class="ai-insight"><strong>Diversification</strong><p>${escapeInvestment(a.diversification || 'Not available')}</p></div>
      <div class="ai-insight"><strong>Risk Signal</strong><p>${escapeInvestment(a.risk || 'Not available')}</p></div>
      <div class="ai-insight"><strong>Performance</strong><p>${escapeInvestment(a.performance || 'Not available')}</p></div>
      <div class="ai-insight"><strong>Suggested Review</strong><p>${escapeInvestment(a.suggestion || 'Not available')}</p></div>
      <div class="ai-disclaimer">Insights are calculated from recorded holdings; they are not a prediction or personalized investment recommendation.</div></div>`;
  } catch (e) { result.textContent = e.message || 'Unable to analyze portfolio.'; }
}
function formatINR(value) {
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0);
}
function setProfitClass(el, value) {
  if (!el) return;
  el.classList.remove('profit','loss');
  if (value > 0) el.classList.add('profit');
  else if (value < 0) el.classList.add('loss');
}
function getAssetIcon(type) {
  return ({Stocks:'📈',ETF:'📊',Gold:'🪙',Silver:'🥈','Mutual Funds':'📊',Bonds:'🏦',Crypto:'₿',Other:'💼'})[type] || '💼';
}
function escapeInvestment(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;");
}
function showInvestmentToast(message, error=false) {
  const toast = document.getElementById('investmentToast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'investment-toast toast show' + (error ? ' error' : '');
  setTimeout(() => toast.classList.remove('show'), 3200);
}
