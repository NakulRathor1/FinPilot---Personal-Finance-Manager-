let goals=[];const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function load(){let d=await api('/api/goals');goals=d.goals;let total=goals.reduce((a,g)=>a+g.saved,0),target=goals.reduce((a,g)=>a+g.target,0);$('#goalStats').innerHTML=`<article class="card"><div class="stat-label">Total saved</div><div class="stat-value">${fmt(total)}</div></article><article class="card"><div class="stat-label">Combined targets</div><div class="stat-value">${fmt(target)}</div></article><article class="card"><div class="stat-label">Goals completed</div><div class="stat-value">${goals.filter(g=>g.saved>=g.target).length} / ${goals.length}</div></article><article class="card"><div class="stat-label">Remaining to target</div><div class="stat-value">${fmt(Math.max(0,target-total))}</div></article>`;$('#goalsGrid').innerHTML=goals.length?goals.map(g=>{let p=Math.min(100,g.saved/g.target*100);return `<article class="card goal-card"><div class="goal-top"><div><div class="goal-name">${esc(g.name)}</div><div class="small muted">${g.deadline?'Target date '+g.deadline:'No deadline set'}</div></div><span class="pill">${p.toFixed(0)}%</span></div><div class="progress"><span style="width:${p}%"></span></div><div><b>${fmt(g.saved)}</b><span class="muted"> saved of ${fmt(g.target)}</span></div><div class="actions"><button data-add="${g.id}">+ Add money</button><button class="secondary" data-edit="${g.id}">Edit</button><button class="secondary" data-delete="${g.id}">Delete</button></div></article>`}).join(''):'<div class="card empty span2">No savings goals yet. Create one for a purchase, emergency fund, trip, or tuition.</div>'}$('#newGoal').onclick=()=>{let f=$('#goalForm');f.reset();f.elements.namedItem('id').value='';f.elements.namedItem('saved').value=0;$('#goalFormTitle').textContent='Create savings goal';modal('goalModal')};$$('[data-close]').forEach(b=>b.onclick=()=>modal(b.dataset.close,false));$('#goalForm').onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.target)),id=d.id;try{if(id)await api('/api/goals/'+id,{method:'PATCH',body:JSON.stringify(d)});else await api('/api/goals',{method:'POST',body:JSON.stringify(d)});modal('goalModal',false);toast('Goal saved');load()}catch(x){toast(x.message)}};$('#contribForm').onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(e.target));try{await api(`/api/goals/${d.id}/contributions`,{method:'POST',body:JSON.stringify(d)});modal('contribModal',false);toast('Savings contribution added');load()}catch(x){toast(x.message)}};$('#goalsGrid').onclick=async e=>{let b=e.target.closest('button');if(!b)return;let g=goals.find(x=>x.id===(+(b.dataset.add||b.dataset.edit||b.dataset.delete)));if(b.dataset.add){$('#contribForm').reset();$('#contribForm').elements.namedItem('id').value=g.id;modal('contribModal')}else if(b.dataset.edit){let f=$('#goalForm');f.elements.namedItem('id').value=g.id;f.elements.namedItem('name').value=g.name;f.elements.namedItem('target').value=g.target;f.elements.namedItem('saved').value=g.saved;f.elements.namedItem('deadline').value=g.deadline||'';$('#goalFormTitle').textContent='Edit savings goal';modal('goalModal')}else if(b.dataset.delete&&confirm('Delete this goal and its contribution history?')){await api('/api/goals/'+g.id,{method:'DELETE'});load()}};load();


/* ===== My money locations (added; does not change goals logic above) ===== */
let pots = [];

async function loadPots() {
  try {
    let d = await api('/api/savings-pots');
    pots = d.pots || [];
    let total = Number(d.total != null ? d.total : pots.reduce((a, p) => a + Number(p.amount || 0), 0));
    let el = document.getElementById('potsTotal');
    if (el) el.textContent = fmt(total);
    let list = document.getElementById('potsList');
    if (!list) return;
    if (!pots.length) {
      list.innerHTML = '<p class="muted">No locations yet. Add Cash, wallets, lends, gift cards — total updates automatically.</p>';
      return;
    }
    list.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Location</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>' +
      pots.map(p => '<tr><td><b>' + esc(p.name) + '</b></td><td class="muted">' + esc(p.notes || '—') + '</td><td>' + fmt(p.amount) + '</td><td class="actions"><button type="button" class="secondary" data-pot-edit="' + p.id + '">Edit</button> <button type="button" class="secondary" data-pot-del="' + p.id + '">Delete</button></td></tr>').join('') +
      '</tbody></table></div><p class="small muted" style="margin-top:10px">Update amounts when money moves. Total is the sum of all rows.</p>';
  } catch (x) {
    console.error(x);
  }
}

(function setupPots() {
  let newPot = document.getElementById('newPot');
  if (newPot) newPot.onclick = () => {
    let f = document.getElementById('potForm');
    if (!f) return;
    f.reset();
    f.elements.namedItem('id').value = '';
    let t = document.getElementById('potFormTitle');
    if (t) t.textContent = 'Add money location';
    modal('potModal');
  };
  let potForm = document.getElementById('potForm');
  if (potForm) potForm.onsubmit = async e => {
    e.preventDefault();
    let d = Object.fromEntries(new FormData(e.target));
    try {
      if (d.id) await api('/api/savings-pots/' + d.id, { method: 'PATCH', body: JSON.stringify(d) });
      else await api('/api/savings-pots', { method: 'POST', body: JSON.stringify(d) });
      modal('potModal', false);
      toast('Location saved');
      loadPots();
    } catch (x) { toast(x.message); }
  };
  let potsList = document.getElementById('potsList');
  if (potsList) potsList.onclick = async e => {
    let b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.potEdit) {
      let p = pots.find(x => x.id === +b.dataset.potEdit);
      if (!p) return;
      let f = document.getElementById('potForm');
      f.elements.namedItem('id').value = p.id;
      f.elements.namedItem('name').value = p.name;
      f.elements.namedItem('amount').value = p.amount;
      f.elements.namedItem('notes').value = p.notes || '';
      document.getElementById('potFormTitle').textContent = 'Edit money location';
      modal('potModal');
    } else if (b.dataset.potDel) {
      if (!confirm('Remove this location?')) return;
      await api('/api/savings-pots/' + b.dataset.potDel, { method: 'DELETE' });
      toast('Removed');
      loadPots();
    }
  };
  // close buttons already bound by goals code for data-close; pot modal uses same
  loadPots();
})();
