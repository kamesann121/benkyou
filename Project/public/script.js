// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  // --- state ---
  let heldEm = 0;
  let totalEm = 0;
  let uploadedAvatar = null;
  let clientId = null;

  const socket = io();

  // --- DOM ---
  const emerald = document.getElementById('emerald');
  const heldDisplay = document.getElementById('held-em') || document.getElementById('emerald-count');
  const totalDisplay = document.getElementById('total-em');
  const totalDup = document.getElementById('total-em-dup') || document.getElementById('emerald-count-dup');
  const avatarUpload = document.getElementById('avatar-upload');
  const avatarPreview = document.getElementById('avatar-preview');
  const usernameInput = document.getElementById('username');
  const previewName = document.getElementById('preview-name');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const messages = document.getElementById('messages');
  const rankingList = document.getElementById('ranking-list');
  const shopItemsContainer = document.getElementById('shop-items');
  const toggleShopBtn = document.getElementById('toggle-shop');
  const shopPanel = document.getElementById('shop-panel');

  if (localStorage.getItem('lab_client_id')) {
    clientId = localStorage.getItem('lab_client_id');
  }

  // --- client-side sanitize (pre-send) ---
  const BANNED = ['game', 'ゲーム', '該当カテゴリ:ゲーム'];
  function sanitizeOutgoing(text) {
    if (!text && text !== 0) return '';
    let t = String(text);
    BANNED.forEach(w => {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(esc, 'ig');
      t = t.replace(re, '［非表示語］');
    });
    t = t.replace(/<[^>]*>/g, '').trim();
    return t;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  }

  function updateDisplays() {
    if (heldDisplay) heldDisplay.textContent = heldEm;
    if (totalDisplay) totalDisplay.textContent = totalEm;
    if (totalDup) totalDup.textContent = totalEm;
  }
  updateDisplays();

  function sendInit() {
    socket.emit('init', {
      id: clientId,
      name: usernameInput && usernameInput.value.trim() ? usernameInput.value.trim() : (previewName ? previewName.textContent : '研究者'),
      avatar: uploadedAvatar || null
    });
  }
  sendInit();

  socket.on('init:ack', (data) => {
    if (data && data.id) {
      clientId = data.id;
      localStorage.setItem('lab_client_id', clientId);
    }
    if (data && typeof data.total === 'number') {
      totalEm = data.total;
      updateDisplays();
    }
  });

  socket.on('total:updated', (data) => {
    if (!data || !data.id) return;
    if (data.id === clientId) {
      totalEm = data.total;
      updateDisplays();
    }
  });

  socket.on('ranking:update', (list) => {
    renderRanking(list);
  });

  // --- click to collect (held) ---
  if (emerald) {
    emerald.addEventListener('click', () => {
      heldEm += 1;
      updateDisplays();
      socket.emit('held:update', heldEm);
      emerald.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 160 });
    });
  }

  // --- auto commit on unload ---
  window.addEventListener('beforeunload', () => {
    try {
      if (heldEm > 0 && navigator.sendBeacon) {
        const payload = JSON.stringify({ id: clientId, commit: heldEm });
        navigator.sendBeacon('/__commit', payload);
        socket.emit('commit:held', heldEm);
      } else if (heldEm > 0) {
        socket.emit('commit:held', heldEm);
      }
    } catch (e) {}
  });

  // --- shop items ---
  const predefinedNames = [
    "基礎ドリルI","基礎ドリルII","センサーA","センサーB","自動旋盤",
    "採取アーム","冷却ユニット","精製モジュール","フィルター","安定化器",
    "容量拡張I","容量拡張II","加速ユニット","伸縮アダプタ","防振プレート",
    "電力コア小","電力コア中","電力コア大","解析モジュール","採取AI",
    "レーザー強化","エネルギー収束器","超伝導配線","高精度センサー","再生ユニット",
    "遠隔制御モジュール","保護シールド","ナビゲーションPX","レア検出器","最適化プロファイル"
  ];
  const items = predefinedNames.map((name, i) => {
    const base = 500;
    const cost = Math.floor(base * Math.pow(1.65, i));
    return { id: i+1, name, cost, label: `${cost}エメ`, effect: () => { const inc = Math.max(1, Math.floor((i+1)/5)); socket.emit('chat message', { name: 'システム', text: sanitizeOutgoing(`導入効果: 効率 +${inc}`), avatar: null }); } };
  });

  function renderShop() {
    if (!shopItemsContainer) return;
    shopItemsContainer.innerHTML = '';
    items.forEach((it, idx) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div class="label">${escapeHtml(it.name)}</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="price">${escapeHtml(it.label)}</div>
          <button class="buy-btn" data-idx="${idx}">購入</button>
        </div>
      `;
      shopItemsContainer.appendChild(div);
    });
  }
  renderShop();

  // --- purchase handling (uses totalEm) ---
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.buy-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const item = items[idx];
    if (!item) return;
    if (totalEm >= item.cost) {
      totalEm -= item.cost;
      updateDisplays();
      item.effect();
      btn.textContent = '導入済';
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.animate([{ transform:'scale(1)' }, { transform:'scale(1.06)' }, { transform:'scale(1)' }], { duration:200 });
      socket.emit('purchase:deduct', { id: clientId, amount: item.cost });
      socket.emit('chat message', { name: 'システム', text: sanitizeOutgoing(`${item.name} を購入しました`), avatar: null });
    } else {
      btn.animate([{ transform:'translateY(0)' }, { transform:'translateY(-6px)' }, { transform:'translateY(0)' }], { duration:240 });
    }
  });

  // --- toggle shop ---
  if (toggleShopBtn && shopPanel) {
    toggleShopBtn.addEventListener('click', () => {
      const open = shopPanel.classList.toggle('open');
      shopPanel.setAttribute('aria-hidden', String(!open));
      toggleShopBtn.animate([{ transform:'scale(1)' }, { transform:'scale(0.98)' }, { transform:'scale(1)' }], { duration:140 });
    });
  }

  // --- avatar upload & preview ---
  if (avatarUpload) {
    avatarUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        uploadedAvatar = reader.result;
        if (avatarPreview) avatarPreview.src = uploadedAvatar;
        sendInit();
      };
      reader.readAsDataURL(file);
    });
  }

  // --- nickname preview ---
  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      const v = usernameInput.value.trim() || '研究者';
      if (previewName) previewName.textContent = v.length > 16 ? v.slice(0,16) : v;
      sendInit();
    });
  }

  // --- chat send (sanitize before sending) ---
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (usernameInput && usernameInput.value.trim() ? usernameInput.value.trim() : (previewName ? previewName.textContent : '研究者')).slice(0,16);
      const raw = input && input.value;
      const safe = sanitizeOutgoing(raw);
      if (!safe) return;
      socket.emit('chat message', { name: sanitizeOutgoing(name), text: safe, avatar: uploadedAvatar || null });
      if (input) input.value = '';
    });
  }

  // --- chat receive ---
  socket.on('chat message', (msg) => {
    if (!messages) return;
    const li = document.createElement('li');
    li.className = 'message';
    const left = document.createElement('div');
    left.className = 'message-left';
    const nameDiv = document.createElement('div');
    nameDiv.className = 'nickname';
    nameDiv.textContent = msg.name || '研究者';
    const avatar = document.createElement('img');
    avatar.className = 'avatar-img';
    avatar.src = msg.avatar || 'assets/images/default-avatar.png';
    left.appendChild(nameDiv);
    left.appendChild(avatar);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text;
    li.appendChild(left);
    li.appendChild(bubble);
    messages.appendChild(li);
    const chatWindow = document.getElementById('chat-window');
    chatWindow && chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
  });

  // --- ranking render ---
  function renderRanking(list) {
    if (!rankingList) return;
    rankingList.innerHTML = '';
    (list || []).forEach(u => {
      const li = document.createElement('li');
      li.className = 'ranking-item';
      li.innerHTML = `
        <img class="r-avatar" src="${u.avatar || 'assets/images/default-avatar.png'}" />
        <div class="r-name">${escapeHtml(u.name)}</div>
        <div class="r-stats">所持 ${u.held} | 累計 ${u.total}</div>
      `;
      rankingList.appendChild(li);
    });
  }
});
```
