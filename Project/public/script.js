// client-side script.js 更新版
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
  const shopPanel = document.getElementById('shopPanel');
  const iconSelect = document.getElementById('iconSelect');
  const iconUpload = document.getElementById('iconUpload');
  const toastContainer = document.getElementById('toastContainer');

  // gift modal refs (may not be present if HTML unchanged)
  const giftModal = document.getElementById('giftModal');
  const giftRecipientSelect = document.getElementById('giftRecipientSelect');
  const giftRecipientName = document.getElementById('giftRecipientName');
  const giftType = document.getElementById('giftType');
  const giftItemSelect = document.getElementById('giftItemSelect');
  const giftGoldAmount = document.getElementById('giftGoldAmount');
  const giftCancel = document.getElementById('giftCancel');
  const giftSend = document.getElementById('giftSend');

  // defaults
  const iconCandidates = [
    'assets/images/mineral.png',
    'assets/images/icon1.png',
    'assets/images/icon2.png'
  ];

  // generate 100 shop items
  const shopItems = Array.from({length:100}).map((_,i)=>{
    const idx = i+1;
    const base = Math.floor(Math.pow(1.18, idx) * 50);
    return {
      id: `item${String(idx).padStart(3,'0')}`,
      title: `Item #${idx}`,
      price: base,
      desc: idx <= 10 ? `Starter item ${idx}` : (idx <= 30 ? `Advanced item ${idx}` : `Rare item ${idx}`),
      owned:false
    };
  });

  // runtime
  let combo = 0;
  let lastClick = 0;
  let cpsCount = 0;
  let cpsInterval = null;
  let socket = null;
  let connectedUsers = [];

  // populate icon select, avoid ambiguous labels
  function populateIconSelect(){
    if (!iconSelect) return;
    iconSelect.innerHTML = '';
    iconCandidates.forEach(src=>{
      const opt = document.createElement('option');
      opt.value = src;
      opt.textContent = src.split('/').pop();
      iconSelect.appendChild(opt);
    });
    if (playerIcon && playerIcon.startsWith('data:')) {
      const opt = document.createElement('option');
      opt.value = playerIcon;
      opt.textContent = 'Uploaded';
      iconSelect.appendChild(opt);
      iconSelect.value = playerIcon;
    } else {
      const exists = Array.from(iconSelect.options).some(o => o.value === playerIcon);
      iconSelect.value = exists ? playerIcon : iconCandidates[0];
      playerIcon = iconSelect.value;
      localStorage.setItem('playerIcon', playerIcon);
    }
  }
  populateIconSelect();

  // render shop
  function renderShop(){
    if (!shopList) return;
    shopList.innerHTML = '';
    shopItems.forEach(it=>{
      const el = document.createElement('div');
      el.className = 'shop-item';
      el.innerHTML = `
        <div>
          <strong>${it.title}</strong>
          <div class="price">Cost: ${it.price}</div>
          <div style="font-size:13px;color:var(--muted)">${it.desc}</div>
        </div>
        <div class="shop-actions">
          <button class="buy-btn" data-id="${it.id}" data-price="${it.price}" ${it.owned ? 'disabled' : ''}>${it.owned ? 'Owned' : 'Buy'}</button>
          <button class="gift-btn" data-id="${it.id}" data-price="${it.price}">Gift</button>
        </div>
      `;
      shopList.appendChild(el);
    });
  }
  renderShop();

  // update UI numbers
  function updateDisplays(){
    if (totalEl) totalEl.textContent = totalTaps;
    if (spentEl) spentEl.textContent = spentTaps;
    const gold = Math.max(0, totalTaps - spentTaps);
    if (goldEl) goldEl.textContent = gold;
    if (goldTopEl) goldTopEl.textContent = gold;
    if (comboEl) comboEl.textContent = combo;
  }
  updateDisplays();

  // toast helper (kept for other uses, click toasts removed)
  function showToast(text, ms = 1000){
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    toastContainer.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=> {
      t.classList.remove('show');
      setTimeout(()=> t.remove(), 260);
    }, ms);
  }

  // append chat/system messages but filter out server disconnect logs
  function appendMessage({ name, icon, text, me=false, sys=false }){
    // filter unwanted system messages
    if (sys) {
      const txt = (text || '').toLowerCase();
      // ignore plain "サーバー切断" or "server disconnected" messages
      if (txt.includes('サーバー切断') || txt.includes('server disconnected') || txt.includes('切断')) {
        return;
      }
    }

    const row = document.createElement('div'); row.className = 'msg-row' + (me ? ' me' : '');
    const img = document.createElement('img'); img.className = 'msg-icon'; img.src = icon || 'assets/images/mineral.png';
    const cont = document.createElement('div'); cont.className = 'msg-content';
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = sys ? `SYSTEM • ${new Date().toLocaleTimeString()}` : `${name} • ${new Date().toLocaleTimeString()}`;
    const body = document.createElement('div'); body.className = 'body'; body.textContent = text;
    cont.appendChild(meta); cont.appendChild(body);
    row.appendChild(img); row.appendChild(cont);
    if (messages) {
      messages.appendChild(row);
      messages.scrollTop = messages.scrollHeight;
    }
  }

  // presence / ranking
  function renderPresence(list){
    if (!presenceList || !rankList) return;
    if (list) connectedUsers = list;
    presenceList.innerHTML = '';
    (list || []).forEach(u=>{
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      const im = document.createElement('img'); im.src = u.icon || 'assets/images/mineral.png'; im.style.width='32px'; im.style.height='32px'; im.style.borderRadius='6px';
      const span = document.createElement('span'); span.textContent = `${u.name} • ${Math.max(0, (u.total||0) - (u.spent||0))}`;
      li.appendChild(im); li.appendChild(span);
      presenceList.appendChild(li);
    });

    const arr = (list || []).slice().sort((a,b)=> ((b.total||0)-(b.spent||0)) - ((a.total||0)-(a.spent||0)));
    rankList.innerHTML = '';
    arr.forEach(u=> {
      const li = document.createElement('li');
      li.textContent = `${u.name} — Total:${u.total} Spent:${u.spent}`;
      rankList.appendChild(li);
    });

    // update gift recipient select if modal exists
    if (typeof populateGiftRecipients === 'function') populateGiftRecipients();
  }

  // connect to server
  function connect(){
    if (!io) return;
    socket = io();

    socket.on('connect', () => {
      socket.emit('join', { id: playerId, name: playerName, icon: playerIcon, total: totalTaps, spent: spentTaps });
    });

    socket.on('joinAck', ({ id, user }) => {
      playerId = id;
      playerName = user.name;
      playerIcon = user.icon;
      totalTaps = Number(user.total || totalTaps);
      spentTaps = Number(user.spent || spentTaps);
      // sync owned items
      if (user.ownedItems) {
        Object.keys(user.ownedItems).forEach(k => {
          const it = shopItems.find(s => s.id === k);
          if (it) it.owned = true;
        });
      }
      savePlayer();
      populateIconSelect();
      updateDisplays();
      renderShop();
    });

    socket.on('nameTaken', ({ suggested }) => {
      appendMessage({ name:'System', text:`名前が重複しています。提案: ${suggested}`, sys:true });
      playerName = suggested;
      savePlayer();
      socket.emit('changeName', { name: playerName });
    });

    socket.on('banned', ({ reason }) => {
      appendMessage({ name:'System', text:`あなたはバンされています: ${reason}`, sys:true });
      socket.disconnect();
    });

    socket.on('presenceUpdate', (list) => { renderPresence(list); });
    socket.on('chat', (m) => { appendMessage({ name: m.name, icon: m.icon, text: m.text, me: m.name === playerName }); });
    socket.on('systemMsg', (m) => {
      // filter server disconnect messages on client side
      const txt = (m && m.text) ? String(m.text) : String(m || '');
      const lc = txt.toLowerCase();
      if (lc.includes('サーバー切断') || lc.includes('server disconnected') || lc.includes('切断')) {
        return;
      }
      appendMessage({ name:'System', text: txt, sys:true });
    });

    // remove clickEvent toast handling completely per request
    socket.on('clickEvent', () => { /* intentionally ignored */ });

    socket.on('giftReceived', (payload) => {
      if (!payload) return;
      const from = payload.fromName || 'Someone';
      if (payload.type === 'gold') {
        appendMessage({ name:'System', text: `${from} さんがギフトしました: ${payload.amount} Gold`, sys:true });
        // optional toast left out to reduce noise
      } else if (payload.type === 'item') {
        const itemTitle = payload.itemTitle || payload.itemId || 'Item';
        appendMessage({ name:'System', text: `${from} さんがギフトしました: ${itemTitle}`, sys:true });
      }
    });

    socket.on('buyResult', (res) => {
      if (!res.ok) {
        // avoid noisy buy failures unless reason provided
        appendMessage({ name:'Shop', text: res.reason ? `購入に失敗しました: ${res.reason}` : '購入に失敗しました', sys:true });
      } else {
        totalTaps = res.user.total; spentTaps = res.user.spent;
        if (res.user.ownedItems) {
          Object.keys(res.user.ownedItems).forEach(k => {
            const it = shopItems.find(s => s.id === k);
            if (it) it.owned = true;
          });
        }
        savePlayer(); updateDisplays(); renderShop();
      }
    });

    socket.on('disconnect', ()=> {
      // previously displayed 'サーバー切断' message; now suppressed
      // no UI noise on disconnect
    });
  }

  // tap handling without toast
  if (tapBtn) {
    tapBtn.addEventListener('mousedown', doTap);
    tapBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); doTap(); });
  }

  function doTap(){
    const now = Date.now();
    if (now - lastClick <= 800) combo++; else combo = 1;
    lastClick = now;
    let gain = 1 + Math.floor(combo/10);
    // boost example mapping
    const boostItem = shopItems.find(s => s.id === 'item010');
    const boost = (boostItem && boostItem.owned) ? 1 : 0;
    if (boost) gain += boost;
    totalTaps += gain;
    cpsCount++;
    if (!cpsInterval) cpsInterval = setInterval(()=>{ if (cpsEl) cpsEl.textContent = cpsCount; cpsCount=0; }, 1000);
    updateDisplays();
    animateMineral();
    savePlayer();
    if (socket && socket.connected) socket.emit('click', { delta: gain });
  }

  function animateMineral(){ if (mineralImg) { mineralImg.style.transform = 'scale(0.92) rotate(-6deg)'; setTimeout(()=> mineralImg.style.transform = '', 120); } }

  // chat submit - send once
  if (chatForm) {
    chatForm.addEventListener('submit', (e)=> {
      e.preventDefault();
      const t = msgInput.value.trim();
      if (!t) return;
      if (socket && socket.connected) {
        socket.emit('chat', { text: t });
      } else {
        appendMessage({ name: playerName, icon: playerIcon, text: t, me:true });
      }
      msgInput.value = '';
    });
  }

  // set name
  if (setNameBtn) {
    setNameBtn.addEventListener('click', ()=>{
      const v = nameInput.value.trim();
      if (!v) return;
      playerName = v;
      playerIcon = iconSelect ? iconSelect.value || playerIcon : playerIcon;
      savePlayer();
      populateIconSelect();
      if (socket && socket.connected) socket.emit('changeName', { name: playerName });
      renderPresence(connectedUsers);
      nameInput.value = '';
    });
  }

  // upload icon
  if (iconUpload) {
    iconUpload.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        playerIcon = fr.result;
        localStorage.setItem('playerIcon', playerIcon);
        populateIconSelect();
        if (iconSelect) iconSelect.value = playerIcon;
        if (socket && socket.connected) socket.emit('changeName', { name: playerName });
      };
      fr.readAsDataURL(f);
    });
  }

  if (iconSelect) {
    iconSelect.addEventListener('change', () => {
      playerIcon = iconSelect.value;
      localStorage.setItem('playerIcon', playerIcon);
    });
  }

  // buy/gift handlers
  if (shopList) {
    shopList.addEventListener('click', (e)=>{
      const buyBtn = e.target.closest('button.buy-btn');
      const giftBtn = e.target.closest('button.gift-btn');
      if (buyBtn) {
        const itemId = buyBtn.dataset.id;
        const price = Number(buyBtn.dataset.price || 0);
        handleBuy(itemId, price);
        return;
      }
      if (giftBtn) {
        const itemId = giftBtn.dataset.id;
        openGiftModalForItem(itemId);
        return;
      }
    });
  }

  function handleBuy(itemId, price){
    const item = shopItems.find(s => s.id === itemId);
    const gold = Math.max(0, totalTaps - spentTaps);
    if (!item) return;
    if (item.owned) { showToast('既に購入済みです'); return; }
    if (gold < price) { appendMessage({ name:'Shop', text:'金が足りません', sys:true }); return; }
    item.owned = true;
    spentTaps += price;
    savePlayer(); updateDisplays(); renderShop();
    showToast(`${item.title} を購入しました`);
    if (socket && socket.connected) socket.emit('buy', { itemId, price });
  }

  // gift modal functionality (only if modal exists)
  function populateGiftRecipients(){
    if (!giftRecipientSelect) return;
    giftRecipientSelect.innerHTML = '';
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'オンラインから選ぶ';
    giftRecipientSelect.appendChild(ph);
    (connectedUsers || []).forEach(u=>{
      const opt = document.createElement('option');
      opt.value = u.id || u.name;
      opt.textContent = `${u.name} (online)`;
      giftRecipientSelect.appendChild(opt);
    });
  }

  function openGiftModalForItem(itemId){
    if (!giftModal) return;
    if (giftRecipientName) giftRecipientName.value = '';
    populateGiftRecipients();
    if (giftType) giftType.value = 'item';
    if (giftItemSelect) {
      giftItemSelect.innerHTML = '';
      shopItems.forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.id;
        opt.textContent = `${it.title} (${it.price})`;
        giftItemSelect.appendChild(opt);
      });
      if (itemId) giftItemSelect.value = itemId;
    }
    if (giftGoldAmount) giftGoldAmount.style.display = 'none';
    if (giftItemSelect) giftItemSelect.style.display = '';
    giftModal.setAttribute('aria-hidden', 'false');
  }

  if (giftCancel) giftCancel.addEventListener('click', ()=> giftModal && giftModal.setAttribute('aria-hidden','true'));
  if (giftType) giftType.addEventListener('change', ()=> {
    if (!giftType) return;
    if (giftType.value === 'gold') {
      if (giftGoldAmount) giftGoldAmount.style.display = '';
      if (giftItemSelect) giftItemSelect.style.display = 'none';
    } else {
      if (giftGoldAmount) giftGoldAmount.style.display = 'none';
      if (giftItemSelect) giftItemSelect.style.display = '';
    }
  });

  if (giftSend) giftSend.addEventListener('click', ()=> {
    if (!giftModal) return;
    const selectedRecipientId = giftRecipientSelect ? giftRecipientSelect.value || '' : '';
    const typedName = giftRecipientName ? giftRecipientName.value.trim() : '';
    const recipient = selectedRecipientId || typedName;
    if (!recipient) { showToast('送る相手を選んでください'); return; }
    const type = giftType ? giftType.value : 'item';
    if (type === 'gold') {
      const amt = Number(giftGoldAmount ? giftGoldAmount.value || 0 : 0);
      if (!amt || amt <= 0) { showToast('金額を指定してください'); return; }
      if ((totalTaps - spentTaps) < amt) { showToast('所持金が足りません'); return; }
      if (socket && socket.connected) {
        socket.emit('gift', { to: recipient, type:'gold', amount: amt });
      }
      spentTaps += amt;
      savePlayer(); updateDisplays(); renderShop();
      giftModal.setAttribute('aria-hidden','true');
      showToast('ギフトを送信しました');
      return;
    } else {
      const itemId = giftItemSelect ? giftItemSelect.value : null;
      if (!itemId) { showToast('ギフトするアイテムを選んでください'); return; }
      const item = shopItems.find(s => s.id === itemId);
      if (!item) return;
      // client optimistic deduction is handled previously; for gifting we do not mark recipient locally
      // the server will enforce cost rules
      if (!socket || !socket.connected) { showToast('サーバー接続が必要です'); return; }
      socket.emit('gift', { to: recipient, type:'item', itemId });
      giftModal.setAttribute('aria-hidden','true');
      showToast('ギフトを送信しました');
      return;
    }
  });

  // shop toggle
  if (shopToggle) shopToggle.addEventListener('click', ()=> shopPanel.classList.toggle('collapsed'));

  // custom cursor overlay (unchanged)
  (function installCatCursor(){
    if ('ontouchstart' in window) return;
    const catSrc = 'assets/images/cursor-cat.png';
    const img = new Image();
    img.src = catSrc;
    img.onload = () => {
      document.body.classList.add('hide-cursor');
      const el = document.createElement('img');
      el.src = catSrc;
      el.alt = 'cat-cursor';
      el.id = 'catCursor';
      Object.assign(el.style, {
        position: 'fixed',
        pointerEvents: 'none',
        width: '56px',
        height: '56px',
        transform: 'translate(-50%,-50%)',
        zIndex: '9999',
        transition: 'transform 80ms linear, left 80ms linear, top 80ms linear'
      });
      document.body.appendChild(el);
      window.addEventListener('pointermove', (e) => {
        el.style.left = e.clientX + 'px';
        el.style.top = e.clientY + 'px';
        el.style.opacity = '1';
      });
      window.addEventListener('pointerdown', () => {
        el.style.transform = 'translate(-50%,-50%) scale(0.92) rotate(-6deg)';
        setTimeout(()=> el.style.transform = 'translate(-50%,-50%)', 120);
      });
      window.addEventListener('pointerleave', () => el.style.opacity = '0');
      window.addEventListener('pointerenter', () => el.style.opacity = '1');
    };
    img.onerror = () => { console.warn('cat cursor image failed to load:', catSrc); };
  })();

  // init
  updateDisplays();
  renderShop();
  connect();
  setInterval(savePlayer, 5000);
})();
