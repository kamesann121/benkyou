// script.js — Inventory equip sync + fusion preview + UI fixes
(() => {
  function generateId(){ return Math.random().toString(36).slice(2,9); }
  function savePlayer(){ localStorage.setItem('playerId', playerId); localStorage.setItem('playerName', playerName); localStorage.setItem('playerIcon', playerIcon); localStorage.setItem('totalTaps', totalTaps); localStorage.setItem('spentTaps', spentTaps); }

  // load local
  let playerId = localStorage.getItem('playerId') || generateId();
  let playerName = localStorage.getItem('playerName') || 'You';
  let playerIcon = localStorage.getItem('playerIcon') || 'assets/images/mineral.png';
  let totalTaps = Number(localStorage.getItem('totalTaps') || 0);
  let spentTaps = Number(localStorage.getItem('spentTaps') || 0);

  // UI refs
  const totalEl = document.getElementById('total');
  const spentEl = document.getElementById('spent');
  const goldEl = document.getElementById('gold');
  const goldTopEl = document.getElementById('goldTop');
  const invGoldEl = document.getElementById('invGold');
  const comboEl = document.getElementById('combo');
  const cpsEl = document.getElementById('cps');
  const tapBtn = document.getElementById('tapBtn');
  const mineralImg = document.getElementById('mineralImg');
  const messages = document.getElementById('messages');
  const nameInput = document.getElementById('name');
  const setNameBtn = document.getElementById('setName');
  const chatForm = document.getElementById('chatForm');
  const msgInput = document.getElementById('msg');
  const rankList = document.getElementById('rankList');
  const presenceList = document.getElementById('presenceList');
  const shopList = document.getElementById('shopList');
  const shopToggle = document.getElementById('shopToggle');
  const shopBody = document.getElementById('shopBody');
  const iconSelect = document.getElementById('iconSelect');
  const iconUpload = document.getElementById('iconUpload');
  const toastContainer = document.getElementById('toastContainer');

  // inventory UI refs
  const openInventoryBtn = document.getElementById('openInventoryBtn');
  const inventoryModal = document.getElementById('inventoryModal');
  const closeInventoryBtn = document.getElementById('closeInventoryBtn');
  const invItemsList = document.getElementById('invItemsList');
  const invItemDetail = document.getElementById('invItemDetail');
  const equipBtn = document.getElementById('equipBtn');
  const addToFuseBtn = document.getElementById('addToFuseBtn');
  const sellBtn = document.getElementById('sellBtn');
  const fuseSlots = document.getElementById('fuseSlots');
  const doFuseBtn = document.getElementById('doFuseBtn');
  const clearFuseBtn = document.getElementById('clearFuseBtn');
  const previewOutput = document.getElementById('previewOutput');
  const previewCost = document.getElementById('previewCost');

  // tab controls
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab');

  // defaults: removed icon1.png per request
  const iconCandidates = ['assets/images/mineral.png','assets/images/icon2.png'];
  const shopItems = Array.from({length:100}).map((_,i)=>{
    const idx = i+1;
    const base = Math.floor(Math.pow(1.18, idx) * 50);
    return { id: `item${String(idx).padStart(3,'0')}`, title:`Item #${idx}`, price: base, desc: `Item ${idx}`, owned:false };
  });

  // runtime
  let combo = 0;
  let lastClick = 0;
  let cpsCount = 0;
  let cpsInterval = null;
  let socket = null;
  let connectedUsers = [];
  let itemDefinitions = {}; // if server provides
  let selectedInvItemId = null;
  let fuseQueue = [null,null]; // two slots
  let localOwned = {}; // map of owned itemId -> true (mirror of server)
  let equippedSlots = {}; // server-synced equip slots

  // update displays
  function updateDisplays(){
    totalEl.textContent = totalTaps;
    spentEl.textContent = spentTaps;
    const gold = Math.max(0, totalTaps - spentTaps);
    goldEl.textContent = gold;
    goldTopEl.textContent = gold;
    invGoldEl.textContent = gold;
    comboEl.textContent = combo;
  }
  updateDisplays();

  // toast
  function showToast(text, ms=1000){
    const t = document.createElement('div'); t.className='toast'; t.textContent = text; toastContainer.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=> { t.classList.remove('show'); setTimeout(()=> t.remove(),260); }, ms);
  }

  // chat / system messages
  function appendMessage({ name, icon, text, me=false, sys=false }){
    if (sys) {
      const txt = (text||'').toLowerCase();
      if (txt.includes('サーバー切断') || txt.includes('server disconnected') || txt.includes('切断')) return;
    }
    const row = document.createElement('div'); row.className = 'msg-row' + (me ? ' me' : '');
    const img = document.createElement('img'); img.className='msg-icon'; img.src = icon || 'assets/images/mineral.png';
    const cont = document.createElement('div'); cont.className='msg-content';
    const meta = document.createElement('div'); meta.className='meta'; meta.textContent = sys ? `SYSTEM • ${new Date().toLocaleTimeString()}` : `${name} • ${new Date().toLocaleTimeString()}`;
    const body = document.createElement('div'); body.className='body'; body.textContent = text;
    cont.appendChild(meta); cont.appendChild(body); row.appendChild(img); row.appendChild(cont);
    messages.appendChild(row); messages.scrollTop = messages.scrollHeight;
  }

  // presence & ranking
  function renderPresence(list){
    if (list) connectedUsers = list;
    presenceList.innerHTML = '';
    (list||[]).forEach(u=>{
      const li = document.createElement('li');
      const im = document.createElement('img'); im.src = u.icon || 'assets/images/mineral.png'; im.style.width='32px'; im.style.height='32px'; im.style.borderRadius='6px';
      li.appendChild(im); li.appendChild(document.createTextNode(`${u.name} • ${Math.max(0,(u.total||0)-(u.spent||0))}`));
      presenceList.appendChild(li);
    });
    const arr = (list||[]).slice().sort((a,b)=> ((b.total||0)-(b.spent||0)) - ((a.total||0)-(a.spent||0)));
    rankList.innerHTML=''; arr.forEach(u=> { const li=document.createElement('li'); li.textContent = `${u.name} — Total:${u.total} Spent:${u.spent}`; rankList.appendChild(li); });
    populateGiftRecipients();
  }

  // populate icon select
  function populateIconSelect(){
    iconSelect.innerHTML='';
    iconCandidates.forEach(src => { const o=document.createElement('option'); o.value=src; o.textContent=src.split('/').pop(); iconSelect.appendChild(o); });
    if (playerIcon && playerIcon.startsWith('data:')) { const o=document.createElement('option'); o.value=playerIcon; o.textContent='Uploaded'; iconSelect.appendChild(o); iconSelect.value=playerIcon; }
    else { const exists = Array.from(iconSelect.options).some(o=>o.value===playerIcon); iconSelect.value = exists ? playerIcon : iconCandidates[0]; playerIcon = iconSelect.value; localStorage.setItem('playerIcon', playerIcon); }
  }
  populateIconSelect();

  // render shop
  function renderShop(){ shopList.innerHTML=''; shopItems.forEach(it=>{ const el=document.createElement('div'); el.className='shop-item'; el.innerHTML = `<div><strong>${it.title}</strong><div class="price">Cost: ${it.price}</div><div style="font-size:13px;color:var(--muted)">${it.desc}</div></div><div class="shop-actions"><button class="buy-btn" data-id="${it.id}" data-price="${it.price}" ${it.owned?'disabled':''}>${it.owned?'Owned':'Buy'}</button><button class="gift-btn" data-id="${it.id}" data-price="${it.price}">Gift</button></div>`; shopList.appendChild(el); }); }

  // socket connect
  function connect(){
    socket = io();
    socket.on('connect', ()=> socket.emit('join', { id: playerId, name: playerName, icon: playerIcon, total: totalTaps, spent: spentTaps }) );

    socket.on('joinAck', ({ id, user, itemDefs }) => {
      playerId = id; playerName = user.name; playerIcon = user.icon; totalTaps = Number(user.total || totalTaps); spentTaps = Number(user.spent || spentTaps);
      localOwned = user.ownedItems || {};
      equippedSlots = user.equipped || {};
      // if server provides itemDefinitions in joinAck, use them
      if (itemDefs) itemDefinitions = itemDefs;
      updateInventoryUI(); savePlayer(); updateDisplays(); renderShop();
    });

    // server may proactively send itemDefinitions
    socket.on('itemDefs', (defs) => { if (defs) itemDefinitions = defs; updateInventoryUI(); });

    socket.on('presenceUpdate', (list) => renderPresence(list));
    socket.on('chat', (m) => appendMessage({ name:m.name, icon:m.icon, text:m.text, me:m.name===playerName }));
    socket.on('systemMsg', (m) => appendMessage({ name:'System', text: m.text || m, sys:true }));
    socket.on('giftReceived', (payload) => { if (!payload) return; const from = payload.fromName||'Someone'; if (payload.type==='gold'){ appendMessage({ name:'System', text:`${from} さんがギフトしました: ${payload.amount} Gold`, sys:true }); } else { appendMessage({ name:'System', text:`${from} さんがギフトしました: ${payload.itemTitle||payload.itemId}`, sys:true }); } });

    socket.on('buyResult', (res) => {
      if (!res.ok) appendMessage({ name:'Shop', text: res.reason ? `購入に失敗しました: ${res.reason}` : '購入に失敗しました', sys:true });
      else {
        totalTaps = res.user.total; spentTaps = res.user.spent;
        localOwned = res.user.ownedItems || localOwned;
        equippedSlots = res.user.equipped || equippedSlots;
        savePlayer(); updateDisplays(); updateInventoryUI(); renderShop();
      }
    });

    // equip sync
    socket.on('equipAck', (ack) => {
      if (ack && ack.ok) {
        equippedSlots = ack.equipped || equippedSlots;
        appendMessage({ name:'System', text:`装備反映: ${JSON.stringify(equippedSlots)}`, sys:true });
        updateInventoryUI();
      } else {
        appendMessage({ name:'System', text:`装備に失敗しました`, sys:true });
      }
    });
    socket.on('equipUpdate', (data) => {
      if (data && data.playerId === playerId) {
        equippedSlots = data.equipped || equippedSlots;
        updateInventoryUI();
      }
    });

    // fusion
    socket.on('fusionPreview', (p) => {
      // server may send preview: { outputTitle, cost }
      if (p) {
        previewOutput.textContent = p.outputTitle || '—';
        previewCost.textContent = p.cost != null ? `${p.cost} Gold` : '—';
      }
    });
    socket.on('fusionAck', (ack) => {
      if (ack && ack.ok) {
        // update local-owned from server ack if provided
        localOwned = ack.user && ack.user.ownedItems ? ack.user.ownedItems : localOwned;
        totalTaps = ack.user ? ack.user.total : totalTaps;
        spentTaps = ack.user ? ack.user.spent : spentTaps;
        appendMessage({ name:'System', text:`合体成功: ${ack.output.title}`, sys:true });
        updateInventoryUI(); updateDisplays();
      } else {
        appendMessage({ name:'System', text:`合体に失敗しました: ${ack && ack.reason ? ack.reason : ''}`, sys:true });
      }
    });

    socket.on('fusionResult', (res) => {
      if (res && res.ok) { localOwned[res.output.id] = true; updateInventoryUI(); appendMessage({ name:'System', text:`合体で ${res.output.title} を入手しました`, sys:true }); updateDisplays(); }
    });

    socket.on('itemDefs', (defs) => { if (defs) { itemDefinitions = defs; updateInventoryUI(); } });

    socket.on('disconnect', ()=> { /* suppressed */ });
  }
  connect();

  // Inventory UI functions
  function getItemDef(id){
    // priority: server-provided itemDefinitions -> shopItems list -> fallback id
    if (itemDefinitions && itemDefinitions[id]) return itemDefinitions[id];
    const s = shopItems.find(x=>x.id===id);
    if (s) return s;
    return { id, title: id, desc: '' };
  }

  function updateInventoryUI(){
    invItemsList.innerHTML='';
    const keys = Object.keys(localOwned || {});
    if (keys.length === 0) {
      const li = document.createElement('li'); li.textContent = 'No items owned'; invItemsList.appendChild(li); return;
    }
    keys.forEach(id => {
      const def = getItemDef(id);
      const li = document.createElement('li');
      li.dataset.id = id;
      const eq = Object.values(equippedSlots || {}).includes(id) ? ' (Equipped)' : '';
      li.innerHTML = `<span><strong>${def.title || id}</strong><em style="color:var(--muted);font-size:12px">${eq}</em><div style="font-size:12px;color:var(--muted)">${def.desc||''}</div></span><span><button class="inv-select-btn" data-id="${id}">Select</button></span>`;
      invItemsList.appendChild(li);
    });
  }

  // select item in inventory
  invItemsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.inv-select-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    selectedInvItemId = id;
    const def = getItemDef(id);
    invItemDetail.innerHTML = `<strong>${def.title||id}</strong><div style="margin-top:6px;color:var(--muted)">${def.desc||''}</div><div style="margin-top:8px">ID: ${id}</div>`;
    invItemsList.querySelectorAll('li').forEach(li=> li.classList.toggle('selected', li.dataset.id===id));
  });

  // equip action (server-synced)
  equipBtn.addEventListener('click', () => {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    // choose slot 1 for simplicity; extendable to multiple slots
    const slot = 'slot1';
    if (!socket || !socket.connected) { showToast('サーバー接続が必要です'); return; }
    socket.emit('equip', { slot, itemId: selectedInvItemId });
  });

  // add to fuse queue
  addToFuseBtn.addEventListener('click', () => {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    const idx = fuseQueue.indexOf(null);
    if (idx === -1) { showToast('合体スロットが満杯です'); return; }
    fuseQueue[idx] = selectedInvItemId;
    renderFuseSlots();
    // request preview from server if available
    if (socket && socket.connected) socket.emit('fusionPreview', { itemAId: fuseQueue[0], itemBId: fuseQueue[1] });
    else computeLocalPreview();
  });

  // local preview fallback
  function computeLocalPreview(){
    const [a,b] = fuseQueue;
    if (!a || !b) { previewOutput.textContent='—'; previewCost.textContent='—'; return; }
    const da = getItemDef(a), db = getItemDef(b);
    const title = `${da.title.split(' ')[0]}-${db.title.split(' ')[0]} Fusion`;
    const cost = Math.ceil(((Number(da.price||0) + Number(db.price||0)) * 1.2) + 100);
    previewOutput.textContent = title;
    previewCost.textContent = `${cost} Gold (est.)`;
  }

  // sell
  sellBtn.addEventListener('click', () => {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    const def = getItemDef(selectedInvItemId);
    const sale = Math.floor((def.price||0) * 0.5);
    delete localOwned[selectedInvItemId];
    totalTaps += sale;
    savePlayer(); updateDisplays(); updateInventoryUI();
    appendMessage({ name:'System', text:`${def.title||selectedInvItemId} を売却して ${sale} Gold を獲得しました`, sys:true });
  });

  // fuse slots render and actions
  function renderFuseSlots(){
    const slots = fuseSlots.querySelectorAll('.fuse-slot');
    slots.forEach(s => {
      const idx = Number(s.dataset.slot);
      const id = fuseQueue[idx];
      if (!id) s.textContent = 'Empty'; else {
        const def = getItemDef(id);
        s.textContent = def.title || id;
      }
    });
    computeLocalPreview();
  }
  renderFuseSlots();

  doFuseBtn.addEventListener('click', () => {
    const [a,b] = fuseQueue;
    if (!a || !b) { showToast('2つのアイテムをセットしてください'); return; }
    if (!socket || !socket.connected) { showToast('サーバー接続が必要です'); return; }
    socket.emit('fuse', { itemAId: a, itemBId: b });
    // clear UI queue while waiting
    fuseQueue = [null,null]; renderFuseSlots();
    previewOutput.textContent='—'; previewCost.textContent='—';
  });

  clearFuseBtn.addEventListener('click', () => { fuseQueue = [null,null]; renderFuseSlots(); previewOutput.textContent='—'; previewCost.textContent='—'; });

  // tab switching
  tabBtns.forEach(b => b.addEventListener('click', ()=> {
    tabBtns.forEach(x=>x.classList.remove('active'));
    tabs.forEach(t=>t.classList.remove('active'));
    b.classList.add('active');
    const tab = document.getElementById(b.dataset.tab);
    if (tab) tab.classList.add('active');
  }));

  // inventory modal open/close
  openInventoryBtn.addEventListener('click', () => { inventoryModal.setAttribute('aria-hidden','false'); updateInventoryUI(); });
  closeInventoryBtn.addEventListener('click', () => { inventoryModal.setAttribute('aria-hidden','true'); selectedInvItemId=null; invItemDetail.innerHTML='選択してください'; });

  // tap handling (fixed image size)
  tapBtn.addEventListener('mousedown', doTap);
  tapBtn.addEventListener('touchstart', (e)=> { e.preventDefault(); doTap(); });
  function doTap(){
    const now = Date.now(); if (now - lastClick <= 800) combo++; else combo = 1; lastClick = now;
    let gain = 1 + Math.floor(combo/10);
    const boost = (localOwned['item010']) ? 1 : 0; if (boost) gain += boost;
    totalTaps += gain; cpsCount++; if (!cpsInterval) cpsInterval = setInterval(()=>{ cpsEl.textContent = cpsCount; cpsCount=0; }, 1000);
    updateDisplays(); animateMineral(); savePlayer();
    if (socket && socket.connected) socket.emit('click', { delta: gain });
  }
  function animateMineral(){ if (mineralImg) { mineralImg.style.transform='scale(0.92) rotate(-6deg)'; setTimeout(()=> mineralImg.style.transform='',120); } }

  // chat submit
  chatForm.addEventListener('submit', (e)=> { e.preventDefault(); const t = msgInput.value.trim(); if (!t) return; if (socket && socket.connected) socket.emit('chat', { text: t }); else appendMessage({ name:playerName, icon:playerIcon, text:t, me:true }); msgInput.value=''; });

  // set name (round button)
  setNameBtn.addEventListener('click', ()=> {
    const v = nameInput.value.trim();
    if (!v) return;
    playerName = v;
    playerIcon = iconSelect.value || playerIcon;
    savePlayer();
    populateIconSelect();
    if (socket && socket.connected) socket.emit('changeName', { name: playerName });
    nameInput.value = '';
  });

  // icon upload
  iconUpload.addEventListener('change', (e)=> {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const fr = new FileReader(); fr.onload = ()=> { playerIcon = fr.result; localStorage.setItem('playerIcon', playerIcon); populateIconSelect(); if (iconSelect) iconSelect.value = playerIcon; if (socket && socket.connected) socket.emit('changeName', { name: playerName }); }; fr.readAsDataURL(f);
  });

  if (iconSelect) iconSelect.addEventListener('change', ()=> { playerIcon = iconSelect.value; localStorage.setItem('playerIcon', playerIcon); });

  // shop buy/gift handlers (gift reverted to simple prompt flow)
  shopList.addEventListener('click', (e) => {
    const buyBtn = e.target.closest('button.buy-btn');
    const giftBtn = e.target.closest('button.gift-btn');
    if (buyBtn) {
      const itemId = buyBtn.dataset.id; const price = Number(buyBtn.dataset.price||0);
      const gold = Math.max(0, totalTaps - spentTaps);
      if (gold < price) { appendMessage({ name:'Shop', text:'金が足りません', sys:true }); return; }
      if (localOwned[itemId]) { showToast('既に所有しています'); return; }
      if (socket && socket.connected) socket.emit('buy', { itemId, price });
      else { localOwned[itemId] = true; spentTaps += price; savePlayer(); updateDisplays(); updateInventoryUI(); renderShop(); showToast('購入しました（ローカル）'); }
    }
    if (giftBtn) {
      const itemId = giftBtn.dataset.id;
      const recipient = prompt('ギフト送信先のニックネームまたはIDを入力してください');
      if (!recipient) return;
      if (socket && socket.connected) socket.emit('gift', { to: recipient, type:'item', itemId });
    }
  });

  // shop toggle (fix)
  if (shopToggle && shopBody) {
    shopToggle.addEventListener('click', ()=> {
      const hidden = shopBody.getAttribute('aria-hidden') === 'true';
      shopBody.setAttribute('aria-hidden', hidden ? 'false' : 'true');
      shopToggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
    });
  }

  // gift recipient select placeholder for presence updates (used elsewhere)
  function populateGiftRecipients(){
    // placeholder - kept for compatibility with other UI code
  }

  // initial UI prep
  updateInventoryUI();
  renderFuseSlots();
  renderShop();
  updateDisplays();
  setInterval(savePlayer, 5000);

  // expose for debug
  window._app = { localOwned, itemDefinitions, fuseQueue, updateInventoryUI, equippedSlots };
})();
