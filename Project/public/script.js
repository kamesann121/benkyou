// client-side script.js （修正版）
(() => {
  // helpers
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

  // icons (built-in)
  const iconCandidates = [
    'assets/images/mineral.png',
    'assets/images/icon1.png',
    'assets/images/icon2.png'
  ];

  // shop items
  const shopItems = [
    { id:'autoTap', title:'オートタップ', price:50, desc:'1/s の自動タップ', owned:false },
    { id:'clickBoost', title:'クリック倍率', price:120, desc:'タップごとの獲得増加', owned:false },
    { id:'decor', title:'建材', price:30, desc:'見た目の建材（spent に計上）', owned:false }
  ];

  // runtime
  let combo = 0;
  let lastClick = 0;
  let cpsCount = 0;
  let cpsInterval = null;
  let socket = null;
  let connectedUsers = [];

  // icon select populate
  function populateIconSelect(){
    iconSelect.innerHTML = '';
    iconCandidates.forEach(src=>{
      const opt = document.createElement('option');
      opt.value = src;
      opt.textContent = src.split('/').pop();
      iconSelect.appendChild(opt);
    });
    // user-uploaded icon (if any)
    if (playerIcon && playerIcon.startsWith('data:')) {
      const opt = document.createElement('option');
      opt.value = playerIcon;
      opt.textContent = 'local-image';
      iconSelect.appendChild(opt);
      iconSelect.value = playerIcon;
    } else {
      iconSelect.value = playerIcon;
    }
  }
  populateIconSelect();

  // render shop
  function renderShop(){
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
        <div>
          <button class="buy" data-id="${it.id}" data-price="${it.price}" ${it.owned ? 'disabled' : ''}>
            ${it.owned ? 'Owned' : 'Buy'}
          </button>
        </div>
      `;
      shopList.appendChild(el);
    });
  }
  renderShop();

  // UI updates
  function updateDisplays(){
    totalEl.textContent = totalTaps;
    spentEl.textContent = spentTaps;
    const gold = Math.max(0, totalTaps - spentTaps);
    goldEl.textContent = gold;
    goldTopEl.textContent = gold;
    comboEl.textContent = combo;
  }
  updateDisplays();

  // toast helper (temporary notifications for clicks etc.)
  function showToast(text, ms = 900){
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    toastContainer.appendChild(t);
    // trigger show
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=> {
      t.classList.remove('show');
      setTimeout(()=> t.remove(), 260);
    }, ms);
  }

  // add chat message (server authoritative)
  function appendMessage({ name, icon, text, me=false, sys=false }){
    const row = document.createElement('div'); row.className = 'msg-row';
    const img = document.createElement('img'); img.className = 'msg-icon'; img.src = icon || 'assets/images/mineral.png';
    const cont = document.createElement('div'); cont.className = 'msg-content';
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = sys ? `SYSTEM • ${new Date().toLocaleTimeString()}` : `${name} • ${new Date().toLocaleTimeString()}`;
    const body = document.createElement('div'); body.className = 'body'; body.textContent = text;
    cont.appendChild(meta); cont.appendChild(body);
    row.appendChild(img); row.appendChild(cont);
    if (me) row.querySelector('.msg-content').style.background = 'linear-gradient(90deg, rgba(124,58,237,0.06), rgba(76,201,240,0.03))';
    if (sys) { img.src = ''; img.style.width='8px'; img.style.height='8px'; }
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  // presence / ranking render
  function renderPresence(list){
    if (list) connectedUsers = list;
    presenceList.innerHTML = '';
    (list || []).forEach(u=>{
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      const im = document.createElement('img'); im.src = u.icon || 'assets/images/mineral.png'; im.style.width='28px'; im.style.height='28px'; im.style.borderRadius='6px';
      const span = document.createElement('span'); span.textContent = `${u.name} • ${Math.max(0, (u.total||0) - (u.spent||0))}`;
      li.appendChild(im); li.appendChild(span);
      presenceList.appendChild(li);
    });
  }
  function renderRanking(list){
    rankList.innerHTML = '';
    (list || []).forEach(u=>{
      const li = document.createElement('li');
      li.textContent = `${u.name} — Total:${u.total} Spent:${u.spent}`;
      rankList.appendChild(li);
    });
  }

  // connect to server
  function connect(){
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
      savePlayer();
      populateIconSelect();
      updateDisplays();
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
    socket.on('rankingUpdate', (list) => { renderRanking(list); });
    socket.on('chat', (m) => { appendMessage({ name: m.name, icon: m.icon, text: m.text, me: m.name === playerName }); });
    socket.on('systemMsg', (m) => { appendMessage({ name:'System', text: m.text || m, sys:true }); });
    socket.on('clickEvent', (ev) => {
      // show transient toast notification instead of chat flood
      if (ev && ev.name) showToast(`${ev.name} +${ev.delta}`);
    });
    socket.on('buyResult', (res) => {
      if (!res.ok) appendMessage({ name:'Shop', text:'購入に失敗しました', sys:true });
      else {
        totalTaps = res.user.total; spentTaps = res.user.spent;
        // mark item owned if server returned item? For now server doesn't track owned: we keep local ownership for UI only
        savePlayer(); updateDisplays();
      }
    });
    socket.on('disconnect', ()=> {
      appendMessage({ name:'System', text:'サーバー切断', sys:true });
    });
  }

  // tap handling (do not log clicks into chat, only transient toast and server event)
  tapBtn.addEventListener('mousedown', doTap);
  tapBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); doTap(); });

  function doTap(){
    const now = Date.now();
    if (now - lastClick <= 800) combo++; else combo = 1;
    lastClick = now;
    let gain = 1 + Math.floor(combo/10);
    const boostItem = shopItems.find(s=>s.id==='clickBoost');
    const boost = boostItem && boostItem.owned ? 1 : 0;
    if (boost) gain += boost;
    totalTaps += gain;
    cpsCount++;
    if (!cpsInterval) cpsInterval = setInterval(()=>{ cpsEl.textContent = cpsCount; cpsCount=0; }, 1000);
    updateDisplays();
    animateMineral();
    // show transient toast instead of chat
    showToast(`+${gain}`);
    savePlayer();
    // emit to server once
    if (socket && socket.connected) socket.emit('click', { delta: gain });
  }

  function animateMineral(){ mineralImg.style.transform = 'scale(0.92) rotate(-6deg)'; setTimeout(()=> mineralImg.style.transform = '', 120); }

  // chat submit (send once; do not locally append to avoid duplicates)
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

  // set name
  setNameBtn.addEventListener('click', ()=>{
    const v = nameInput.value.trim();
    if (!v) return;
    playerName = v;
    playerIcon = iconSelect.value || playerIcon;
    savePlayer();
    populateIconSelect();
    if (socket && socket.connected) socket.emit('changeName', { name: playerName });
    renderPresence(connectedUsers);
    nameInput.value = '';
  });

  // upload local icon (data URL stored locally)
  iconUpload.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      playerIcon = fr.result; // data URL
      localStorage.setItem('playerIcon', playerIcon);
      // ensure select has this option
      populateIconSelect();
      iconSelect.value = playerIcon;
      // inform server of icon change (changeName endpoint also accepts icon on join)
      if (socket && socket.connected) socket.emit('changeName', { name: playerName });
    };
    fr.readAsDataURL(f);
  });

  // set name/or icon via select change preview
  iconSelect.addEventListener('change', () => {
    playerIcon = iconSelect.value;
    localStorage.setItem('playerIcon', playerIcon);
  });

  // buy handling (single-purchase enforced locally)
  shopList.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.buy');
    if (!btn) return;
    const itemId = btn.dataset.id;
    const price = Number(btn.dataset.price || 0);
    // find item
    const item = shopItems.find(s => s.id === itemId);
    const gold = Math.max(0, totalTaps - spentTaps);
    if (!item) return;
    if (item.owned) { showToast('既に購入済みです'); return; }
    if (gold < price) { appendMessage({ name:'Shop', text:'金が足りません', sys:true }); return; }
    // mark owned locally and disable button
    item.owned = true;
    spentTaps += price;
    savePlayer(); updateDisplays();
    renderShop();
    showToast(`${item.title} を購入しました`);
    // notify server (authoritative spent update)
    if (socket && socket.connected) socket.emit('buy', { itemId, price });
  });

  // shop toggle
  shopToggle.addEventListener('click', ()=> {
    shopPanel.classList.toggle('collapsed');
    const opened = !shopPanel.classList.contains('collapsed');
    shopToggle.textContent = opened ? 'SHOP' : 'SHOP';
  });

  // custom cursor cat install (overlay method). disable on touch devices
  (function installCatCursor(){
    if ('ontouchstart' in window) return; // disable overlay cursor on touch devices
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
