// client-side script.js
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

  // icons
  const iconCandidates = [
    'assets/images/mineral.png',
    'assets/images/icon1.png',
    'assets/images/icon2.png',
    'assets/images/cursor-cat.png'
  ];

  // shop items
  const shopItems = [
    { id:'autoTap', title:'オートタップ', price:50, desc:'1/s の自動タップ', owned:0 },
    { id:'clickBoost', title:'クリック倍率', price:120, desc:'タップごとの獲得増加', owned:0 },
    { id:'decor', title:'建材', price:30, desc:'見た目の建材（spent に計上）', owned:0 }
  ];

  // runtime
  let combo = 0;
  let lastClick = 0;
  let cpsCount = 0;
  let cpsInterval = null;
  let socket = null;
  let connectedUsers = [];

  // populate icon select
  iconCandidates.forEach(src=>{
    const opt = document.createElement('option');
    opt.value = src;
    opt.textContent = src.split('/').pop();
    iconSelect.appendChild(opt);
  });
  iconSelect.value = playerIcon;

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
        <div><button class="buy" data-id="${it.id}" data-price="${it.price}">Buy</button></div>
      `;
      shopList.appendChild(el);
    });
  }
  renderShop();

  // UI updates
  function updateDisplays(){
    totalEl.textContent = totalTaps;
    spentEl.textContent = spentTaps;
    goldEl.textContent = Math.max(0, totalTaps - spentTaps);
    comboEl.textContent = combo;
  }
  updateDisplays();

  // add message
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
    socket.on('chat', (m) => { appendMessage({ name: m.name, icon: m.icon, text: m.text, me:false }); });
    socket.on('systemMsg', (m) => { appendMessage({ name:'System', text: m.text || m, sys:true }); });
    socket.on('clickEvent', (ev) => {
      appendMessage({ name: ev.name, icon: ev.icon || 'assets/images/mineral.png', text: `+${ev.delta}`, me:false });
    });
    socket.on('buyResult', (res) => {
      if (!res.ok) appendMessage({ name:'Shop', text:'購入に失敗しました', sys:true });
      else {
        totalTaps = res.user.total; spentTaps = res.user.spent;
        savePlayer(); updateDisplays();
      }
    });
    socket.on('disconnect', ()=> {
      appendMessage({ name:'System', text:'サーバー切断', sys:true });
    });
  }

  // tap handling
  tapBtn.addEventListener('mousedown', doTap);
  tapBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); doTap(); });

  function doTap(){
    const now = Date.now();
    if (now - lastClick <= 800) combo++; else combo = 1;
    lastClick = now;
    let gain = 1 + Math.floor(combo/10);
    const boost = shopItems.find(s=>s.id==='clickBoost')?.owned || 0;
    if (boost) gain += boost;
    totalTaps += gain;
    cpsCount++;
    if (!cpsInterval) cpsInterval = setInterval(()=>{ cpsEl.textContent = cpsCount; cpsCount=0; }, 1000);
    updateDisplays();
    animateMineral();
    appendMessage({ name: playerName, icon: playerIcon, text: `clicked +${gain}`, me:true });
    savePlayer();
    if (socket && socket.connected) socket.emit('click', { delta: gain });
  }

  function animateMineral(){ mineralImg.style.transform = 'scale(0.92) rotate(-6deg)'; setTimeout(()=> mineralImg.style.transform = '', 120); }

  // chat submit
  chatForm.addEventListener('submit', (e)=> {
    e.preventDefault();
    const t = msgInput.value.trim();
    if (!t) return;
    if (socket && socket.connected) socket.emit('chat', { text: t });
    appendMessage({ name: playerName, icon: playerIcon, text: t, me:true });
    msgInput.value = '';
  });

  // set name
  setNameBtn.addEventListener('click', ()=>{
    const v = nameInput.value.trim();
    if (!v) return;
    playerName = v;
    playerIcon = iconSelect.value || playerIcon;
    savePlayer();
    if (socket && socket.connected) socket.emit('changeName', { name: playerName });
    renderPresence(connectedUsers);
    nameInput.value = '';
  });

  // buy handling
  shopList.addEventListener('click', (e)=>{
    const btn = e.target.closest('button.buy');
    if (!btn) return;
    const itemId = btn.dataset.id;
    const price = Number(btn.dataset.price || 0);
    if ((totalTaps - spentTaps) < price) { appendMessage({ name:'Shop', text:'金が足りません', sys:true }); return; }
    spentTaps += price;
    savePlayer(); updateDisplays();
    if (socket && socket.connected) socket.emit('buy', { itemId, price });
  });

  // shop toggle
  shopToggle.addEventListener('click', ()=> {
    shopPanel.classList.toggle('collapsed');
    const opened = !shopPanel.classList.contains('collapsed');
    shopToggle.textContent = opened ? 'SHOP' : 'SHOP';
  });

  // custom cursor cat install (overlay method)
  (function installCatCursor(){
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
  connect();
  setInterval(savePlayer, 5000);
})();
