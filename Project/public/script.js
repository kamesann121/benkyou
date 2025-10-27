// script.js — 統合版: タップ / チャット / インベントリ反映 & UI修正
(() => {
  function generateId(){ return Math.random().toString(36).slice(2,9); }
  function savePlayer(){ localStorage.setItem('playerId', playerId); localStorage.setItem('playerName', playerName); localStorage.setItem('playerIcon', playerIcon); localStorage.setItem('totalTaps', totalTaps); localStorage.setItem('spentTaps', spentTaps); }

  // local state
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
  const chatSend = document.getElementById('chatSend');
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

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabs = document.querySelectorAll('.tab');

  // defaults
  const iconCandidates = ['assets/images/mineral.png','assets/images/icon2.png'];

  // client-side itemDefinitions (100 items)
  const itemDefinitions = {
    item001: { id:'item001', title:'Ember Shard', desc:'+1 per click', price:58 },
    item002: { id:'item002', title:'Crystal Nib', desc:'+2 per click', price:66 },
    item003: { id:'item003', title:'Iron Spike', desc:'+3 per click', price:75 },
    item004: { id:'item004', title:'Copper Band', desc:'Decorative; small bonus', price:86 },
    item005: { id:'item005', title:'Silver Flake', desc:'+1% click multiplier', price:98 },
    item006: { id:'item006', title:'Mercury Drop', desc:'+2% click multiplier', price:111 },
    item007: { id:'item007', title:'Stone Core', desc:'+0.2 auto/s', price:125 },
    item008: { id:'item008', title:'Fossil Chip', desc:'+0.5 auto/s', price:140 },
    item009: { id:'item009', title:'Quartz Lens', desc:'+1 auto/s', price:156 },
    item010: { id:'item010', title:'Sapphire Lens', desc:'+1 click flat', price:174 },
    item011: { id:'item011', title:'Amber Bead', desc:'+2 click flat', price:193 },
    item012: { id:'item012', title:'Garnet Core', desc:'+3 click flat', price:214 },
    item013: { id:'item013', title:'Radiant Pebble', desc:'Gold cap +50', price:237 },
    item014: { id:'item014', title:'Wind Feather', desc:'Cooldowns -5%', price:262 },
    item015: { id:'item015', title:'Echo Stone', desc:'Combo window +50ms', price:289 },
    item016: { id:'item016', title:'Magnet Nucleus', desc:'+5% auto yield', price:318 },
    item017: { id:'item017', title:'Polished Slate', desc:'Prestige +0.01', price:349 },
    item018: { id:'item018', title:'Luminous Pearl', desc:'+10 total on buy', price:383 },
    item019: { id:'item019', title:'Tiny Drill', desc:'+2 auto/s', price:420 },
    item020: { id:'item020', title:'Micro Engine', desc:'+5 auto/s', price:460 },
    item021: { id:'item021', title:'Solar Cell', desc:'Active +50% clicks 10s', price:504 },
    item022: { id:'item022', title:'Lunar Fragment', desc:'Active x2 multiplier 5s', price:552 },
    item023: { id:'item023', title:'Bronze Key', desc:'Next buy -2%', price:604 },
    item024: { id:'item024', title:'Golden Tooth', desc:'Prestige +0.02', price:660 },
    item025: { id:'item025', title:'Arc Capacitor', desc:'Charge for burst click', price:720 },
    item026: { id:'item026', title:'Core Stabilizer', desc:'Reduces failure penalty', price:784 },
    item027: { id:'item027', title:'Whisper Gem', desc:'Small gifting bonus', price:854 },
    item028: { id:'item028', title:'Storm Chip', desc:'+10% auto rate', price:930 },
    item029: { id:'item029', title:'Coil Spring', desc:'+1 CPS', price:1012 },
    item030: { id:'item030', title:'Velvet Ribbon', desc:'Cosmetic', price:1100 },
    item031: { id:'item031', title:'Seeker\'s Lens', desc:'Occasionally reveals bonus', price:1194 },
    item032: { id:'item032', title:'Frost Crystal', desc:'Flavor utility', price:1294 },
    item033: { id:'item033', title:'Ember Coil', desc:'+4 click flat', price:1400 },
    item034: { id:'item034', title:'Silver Fuse', desc:'+1 click +0.2 auto', price:1512 },
    item035: { id:'item035', title:'Neon Rod', desc:'+5% click multiplier', price:1629 },
    item036: { id:'item036', title:'Void Shard', desc:'1% double drop chance', price:1752 },
    item037: { id:'item037', title:'Titan Plate', desc:'+20 total on buy', price:1881 },
    item038: { id:'item038', title:'Phantom Thread', desc:'Chance to refund on buy', price:2016 },
    item039: { id:'item039', title:'Bloom Seed', desc:'Passive compounding', price:2156 },
    item040: { id:'item040', title:'Rune Chip', desc:'Unlocks special action slot', price:2303 },
    item041: { id:'item041', title:'Prism Slice', desc:'+8 click flat', price:2456 },
    item042: { id:'item042', title:'Copper Cog', desc:'+3 auto/s', price:2616 },
    item043: { id:'item043', title:'Silver Cog', desc:'+6 auto/s', price:2782 },
    item044: { id:'item044', title:'Gold Cog', desc:'+12 auto/s', price:2955 },
    item045: { id:'item045', title:'Echo Lamp', desc:'+1 click', price:3135 },
    item046: { id:'item046', title:'Tide Pearl', desc:'+2% gold gain', price:3322 },
    item047: { id:'item047', title:'Ember Gem', desc:'+15 click (rare)', price:3516 },
    item048: { id:'item048', title:'Sky Shard', desc:'+3 click', price:3718 },
    item049: { id:'item049', title:'Dusk Feather', desc:'Night-bonus', price:3927 },
    item050: { id:'item050', title:'Dawn Relic', desc:'Morning flavor', price:4144 },
    item051: { id:'item051', title:'Mercury Rod', desc:'+2 click +1 auto', price:4368 },
    item052: { id:'item052', title:'Crystal Band', desc:'+7 total on buy', price:4601 },
    item053: { id:'item053', title:'Rift Stone', desc:'CPS ×1.05', price:4841 },
    item054: { id:'item054', title:'Grav Plate', desc:'+200 gold cap', price:5089 },
    item055: { id:'item055', title:'Ember Heart', desc:'+25 click (very rare)', price:5346 },
    item056: { id:'item056', title:'Azure Chip', desc:'+3% click multiplier', price:5609 },
    item057: { id:'item057', title:'Obsidian Edge', desc:'One-click huge burst', price:5881 },
    item058: { id:'item058', title:'Dream Seed', desc:'Passive compounding', price:6160 },
    item059: { id:'item059', title:'Mirror Glass', desc:'Reflect small portion of gifts', price:6448 },
    item060: { id:'item060', title:'Rune Crystal', desc:'+0.5 click', price:6744 },
    item061: { id:'item061', title:'Flux Shard', desc:'+2 click +3 auto', price:7049 },
    item062: { id:'item062', title:'Bronze Medal', desc:'Cosmetic', price:7363 },
    item063: { id:'item063', title:'Silver Medal', desc:'Cosmetic', price:7686 },
    item064: { id:'item064', title:'Gold Medal', desc:'Cosmetic', price:8018 },
    item065: { id:'item065', title:'Whisper Coin', desc:'Small gift bonus', price:8359 },
    item066: { id:'item066', title:'Thunder Spindle', desc:'+20 auto/s', price:8710 },
    item067: { id:'item067', title:'Solar Pearl', desc:'+4 click', price:9071 },
    item068: { id:'item068', title:'Ice Shard', desc:'+6 click', price:9442 },
    item069: { id:'item069', title:'Flame Core', desc:'Increases crit chance', price:9825 },
    item070: { id:'item070', title:'Wind Turbine', desc:'+8 auto/s', price:10219 },
    item071: { id:'item071', title:'Echo Crystal', desc:'Combo stability', price:10626 },
    item072: { id:'item072', title:'Dreamcatcher', desc:'Blocks negatives', price:11046 },
    item073: { id:'item073', title:'Iron Anchor', desc:'Reduces decay', price:11480 },
    item074: { id:'item074', title:'Sapphire Crown', desc:'+0.05 prestige', price:11929 },
    item075: { id:'item075', title:'Ruby Heart', desc:'+40 click', price:12393 },
    item076: { id:'item076', title:'Velvet Bag', desc:'Increases stack cap', price:12873 },
    item077: { id:'item077', title:'Alloy Chip', desc:'+5 auto +2 click', price:13369 },
    item078: { id:'item078', title:'Pulse Coil', desc:'Triggers auto burst', price:13881 },
    item079: { id:'item079', title:'Beacon Stone', desc:'Increases visibility', price:14410 },
    item080: { id:'item080', title:'Nightglass', desc:'Night bonus', price:14957 },
    item081: { id:'item081', title:'Dawnlight', desc:'Morning bonus', price:15522 },
    item082: { id:'item082', title:'Gravity Well', desc:'+20% auto efficiency', price:16106 },
    item083: { id:'item083', title:'Phantom Core', desc:'Ghost buff', price:16709 },
    item084: { id:'item084', title:'Time Sand', desc:'Rewinds spent amount', price:17331 },
    item085: { id:'item085', title:'Starlit Gem', desc:'+12 click', price:17973 },
    item086: { id:'item086', title:'Echo Plate', desc:'Small CPS boost', price:18636 },
    item087: { id:'item087', title:'Quartz Crown', desc:'+10 click +2 auto', price:19321 },
    item088: { id:'item088', title:'Nebula Shard', desc:'Random tap effects', price:20028 },
    item089: { id:'item089', title:'Alloy Shield', desc:'Reduces penalties', price:20758 },
    item090: { id:'item090', title:'Mercury Crown', desc:'Unlocks cosmetic border', price:21511 },
    item091: { id:'item091', title:'Warp Chip', desc:'Teleport gift utility', price:22288 },
    item092: { id:'item092', title:'Lode Marker', desc:'Increases bonus ore spawn', price:23090 },
    item093: { id:'item093', title:'Crystal Horn', desc:'Announce special to all', price:23918 },
    item094: { id:'item094', title:'Ethereal Thread', desc:'Increases fusion success', price:24772 },
    item095: { id:'item095', title:'Verdant Seed', desc:'Long-term incremental bonus', price:25654 },
    item096: { id:'item096', title:'Bronze Locket', desc:'Cosmetic', price:26564 },
    item097: { id:'item097', title:'Silver Locket', desc:'Cosmetic', price:27503 },
    item098: { id:'item098', title:'Golden Locket', desc:'Cosmetic', price:28473 },
    item099: { id:'item099', title:'Infinity Shard', desc:'Gains ×1.1 (cap)', price:29474 },
    item100: { id:'item100', title:'Creator\'s Sigil', desc:'Enables special fusions', price:30507 }
  };

  // runtime
  let combo = 0;
  let lastClick = 0;
  let cpsCount = 0;
  let cpsInterval = null;
  let socket = null;
  let connectedUsers = [];
  let localOwned = {};
  let equippedSlots = {};
  let selectedInvItemId = null;
  let fuseQueue = [null,null];

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

  // messages
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
    connectedUsers = list || [];
    presenceList.innerHTML = '';
    connectedUsers.forEach(u=>{
      const hand = Math.max(0, (u.total||0)-(u.spent||0));
      const li = document.createElement('li');
      const im = document.createElement('img'); im.src = u.icon || 'assets/images/mineral.png'; im.style.width='32px'; im.style.height='32px'; im.style.borderRadius='6px';
      li.appendChild(im); li.appendChild(document.createTextNode(`${u.name} • Gold: ${hand}`));
      presenceList.appendChild(li);
    });

    const arr = connectedUsers.slice().sort((a,b)=> ((b.total||0)-(b.spent||0)) - ((a.total||0)-(a.spent||0)));
    rankList.innerHTML='';
    arr.forEach(u=> {
      const hand = Math.max(0, (u.total||0)-(u.spent||0));
      const li = document.createElement('li');
      li.textContent = `${u.name} — Gold:${hand} Total:${u.total} Spent:${u.spent}`;
      rankList.appendChild(li);
    });
  }

  // icon select
  function populateIconSelect(){
    iconSelect.innerHTML='';
    iconCandidates.forEach(src => { const o=document.createElement('option'); o.value=src; o.textContent=src.split('/').pop(); iconSelect.appendChild(o); });
    if (playerIcon && playerIcon.startsWith('data:')) { const o=document.createElement('option'); o.value=playerIcon; o.textContent='Uploaded'; iconSelect.appendChild(o); iconSelect.value=playerIcon; }
    else { const exists = Array.from(iconSelect.options).some(o=>o.value===playerIcon); iconSelect.value = exists ? playerIcon : iconCandidates[0]; playerIcon = iconSelect.value; localStorage.setItem('playerIcon', playerIcon); }
  }
  populateIconSelect();

  // render shop
  function renderShop(){
    shopList.innerHTML = '';
    Object.keys(itemDefinitions).forEach(id => {
      const it = itemDefinitions[id];
      const owned = !!localOwned[id];
      const div = document.createElement('div'); div.className = 'shop-item';
      const left = document.createElement('div');
      left.innerHTML = `<strong>${it.title}</strong><div class="price">Cost: ${it.price}</div><div style="font-size:13px;color:var(--muted)">${it.desc}</div>`;
      const actions = document.createElement('div'); actions.className='shop-actions';
      const buy = document.createElement('button'); buy.className='buy-btn'; buy.dataset.id = id; buy.dataset.price = it.price; buy.type = 'button';
      if (owned) { buy.textContent = 'Owned'; buy.disabled = true; buy.style.opacity = '0.6'; }
      else { buy.textContent = 'Buy'; buy.disabled = false; }
      const gift = document.createElement('button'); gift.className='gift-btn'; gift.dataset.id = id; gift.textContent='Gift'; gift.type = 'button';
      actions.appendChild(buy); actions.appendChild(gift);
      div.appendChild(left); div.appendChild(actions);
      shopList.appendChild(div);
    });
  }
  renderShop();

  // socket
  function connect(){
    socket = io();
    socket.on('connect', ()=> socket.emit('join', { id: playerId, name: playerName, icon: playerIcon, total: totalTaps, spent: spentTaps }) );

    socket.on('joinAck', ({ id, user, itemDefs }) => {
      playerId = id; playerName = user.name; playerIcon = user.icon; totalTaps = Number(user.total || totalTaps); spentTaps = Number(user.spent || spentTaps);
      localOwned = user.ownedItems || {};
      equippedSlots = user.equipped || {};
      if (itemDefs) Object.assign(itemDefinitions, itemDefs);
      updateAfterServerSync();
    });

    socket.on('presenceUpdate', (list) => renderPresence(list));
    socket.on('chat', (m) => appendMessage({ name:m.name, icon:m.icon, text:m.text, me:m.name===playerName }));
    socket.on('systemMsg', (m) => appendMessage({ name:'System', text: m.text || m, sys:true }));

    socket.on('buyResult', (res) => {
      if (!res.ok) appendMessage({ name:'Shop', text: res.reason ? `購入に失敗しました: ${res.reason}` : '購入に失敗しました', sys:true });
      else {
        totalTaps = res.user.total; spentTaps = res.user.spent; localOwned = res.user.ownedItems || localOwned; updateAfterServerSync();
      }
    });

    socket.on('fusionAck', (ack) => {
      if (ack && ack.ok) { localOwned = ack.user && ack.user.ownedItems ? ack.user.ownedItems : localOwned; totalTaps = ack.user ? ack.user.total : totalTaps; spentTaps = ack.user ? ack.user.spent : spentTaps; updateAfterServerSync(); appendMessage({ name:'System', text:`合体成功: ${ack.output.title}`, sys:true }); }
      else if (ack && !ack.ok) appendMessage({ name:'System', text:`合体に失敗しました: ${ack.reason||''}`, sys:true });
    });

    socket.on('fusionPreview', (p) => { if (p) { previewOutput.textContent = p.outputTitle || '—'; previewCost.textContent = p.cost != null ? `${p.cost} Gold` : '—'; }});
    socket.on('equipAck', (ack) => { if (ack && ack.ok) { equippedSlots = ack.equipped || equippedSlots; updateAfterServerSync(); }});
    socket.on('equipUpdate', (data) => { if (data && data.playerId === playerId) { equippedSlots = data.equipped || equippedSlots; updateAfterServerSync(); }});

    socket.on('disconnect', ()=>{ /* suppressed */ });
  }
  connect();

  function updateAfterServerSync(){
    updateDisplays();
    renderShop();
    updateInventoryUI();
    savePlayer();
  }

  // tab switching
  tabBtns.forEach(b => b.addEventListener('click', ()=> {
    tabBtns.forEach(x=>x.classList.remove('active'));
    tabs.forEach(t=>t.classList.remove('active'));
    b.classList.add('active');
    const tab = document.getElementById(b.dataset.tab);
    if (tab) tab.classList.add('active');
  }));

  // shop interactions
  shopList.addEventListener('click', (e) => {
    const buyBtn = e.target.closest('button.buy-btn');
    const giftBtn = e.target.closest('button.gift-btn');
    if (buyBtn) {
      const itemId = buyBtn.dataset.id; const price = Number(buyBtn.dataset.price||0);
      const gold = Math.max(0, totalTaps - spentTaps);
      if (localOwned[itemId]) { showToast('既に所有しています'); return; }
      if (gold < price) { appendMessage({ name:'Shop', text:'金が足りません', sys:true }); return; }
      if (socket && socket.connected) socket.emit('buy', { itemId, price });
      else { localOwned[itemId] = true; spentTaps += price; updateAfterServerSync(); showToast('購入しました（ローカル）'); }
    }
    if (giftBtn) {
      const itemId = giftBtn.dataset.id;
      const recipient = prompt('ギフト送信先のニックネームまたはIDを入力してください');
      if (!recipient) return;
      if (socket && socket.connected) socket.emit('gift', { to: recipient, type:'item', itemId });
    }
  });

  // Inventory: open/close and rendering
  document.getElementById('openInventoryBtn').addEventListener('click', ()=> { inventoryModal.setAttribute('aria-hidden','false'); updateInventoryUI(); });
  closeInventoryBtn.addEventListener('click', ()=> { inventoryModal.setAttribute('aria-hidden','true'); selectedInvItemId = null; invItemDetail.innerHTML = '選択してください'; });

  function updateInventoryUI(){
    invItemsList.innerHTML = '';
    const keys = Object.keys(localOwned || {});
    if (keys.length === 0){ const li = document.createElement('li'); li.textContent = 'No items owned'; invItemsList.appendChild(li); return; }
    keys.forEach(id => {
      const def = itemDefinitions[id] || { title:id, desc:'' };
      const li = document.createElement('li'); li.dataset.id = id;
      const eq = Object.values(equippedSlots || {}).includes(id) ? ' (Equipped)' : '';
      li.innerHTML = `<span><strong>${def.title||id}</strong><em style="color:var(--muted);font-size:12px">${eq}</em><div style="font-size:12px;color:var(--muted)">${def.desc||''}</div></span><span><button class="inv-select-btn" data-id="${id}" type="button">Select</button></span>`;
      invItemsList.appendChild(li);
    });
  }

  invItemsList.addEventListener('click', (e)=> {
    const btn = e.target.closest('.inv-select-btn'); if (!btn) return;
    const id = btn.dataset.id; selectedInvItemId = id;
    const def = itemDefinitions[id] || { title:id, desc:'' };
    invItemDetail.innerHTML = `<strong>${def.title||id}</strong><div style="margin-top:6px;color:var(--muted)">${def.desc||''}</div><div style="margin-top:8px">ID: ${id}</div>`;
    invItemsList.querySelectorAll('li').forEach(li=> li.classList.toggle('selected', li.dataset.id===id));
  });

  // equip (server-synced)
  equipBtn.addEventListener('click', ()=> {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    if (!socket || !socket.connected) { showToast('サーバー接続が必要です'); return; }
    socket.emit('equip', { slot:'slot1', itemId: selectedInvItemId });
  });

  // add to fuse
  addToFuseBtn.addEventListener('click', ()=> {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    const idx = fuseQueue.indexOf(null);
    if (idx === -1) { showToast('合体スロットが満杯です'); return; }
    fuseQueue[idx] = selectedInvItemId; renderFuseSlots();
    if (socket && socket.connected) socket.emit('fusionPreview', { itemAId: fuseQueue[0], itemBId: fuseQueue[1] });
    else computeLocalPreview();
  });

  function computeLocalPreview(){
    const [a,b] = fuseQueue;
    if (!a || !b) { previewOutput.textContent='—'; previewCost.textContent='—'; return; }
    const da = itemDefinitions[a], db = itemDefinitions[b];
    const title = `${(da&&da.title?da.title.split(' ')[0]:a)}-${(db&&db.title?db.title.split(' ')[0]:b)} Fusion`;
    const cost = Math.ceil(((Number(da.price||0) + Number(db.price||0)) * 1.2) + 100);
    previewOutput.textContent = title;
    previewCost.textContent = `${cost} Gold (est.)`;
  }

  // sell
  sellBtn.addEventListener('click', ()=> {
    if (!selectedInvItemId) { showToast('アイテムを選んでください'); return; }
    const def = itemDefinitions[selectedInvItemId] || { price:0, title:selectedInvItemId };
    const sale = Math.floor((def.price||0) * 0.5);
    delete localOwned[selectedInvItemId];
    totalTaps += sale; savePlayer(); updateAfterServerSync();
    appendMessage({ name:'System', text:`${def.title||selectedInvItemId} を売却して ${sale} Gold を獲得しました`, sys:true });
  });

  // fuse slots
  function renderFuseSlots(){
    const slots = fuseSlots.querySelectorAll('.fuse-slot');
    slots.forEach(s => {
      const idx = Number(s.dataset.slot);
      const id = fuseQueue[idx];
      if (!id) s.textContent = 'Empty'; else s.textContent = (itemDefinitions[id] && itemDefinitions[id].title) ? itemDefinitions[id].title : id;
    });
    computeLocalPreview();
  }
  renderFuseSlots();

  doFuseBtn.addEventListener('click', ()=> {
    const [a,b] = fuseQueue;
    if (!a || !b) { showToast('2つのアイテムをセットしてください'); return; }
    if (!socket || !socket.connected) { showToast('サーバー接続が必要です'); return; }
    socket.emit('fuse', { itemAId: a, itemBId: b });
    fuseQueue = [null,null]; renderFuseSlots(); previewOutput.textContent='—'; previewCost.textContent='—';
  });

  clearFuseBtn.addEventListener('click', ()=> { fuseQueue = [null,null]; renderFuseSlots(); previewOutput.textContent='—'; previewCost.textContent='—'; });

  // tap handling (ensure works)
  function doTap(){
    const now = Date.now(); if (now - lastClick <= 800) combo++; else combo = 1; lastClick = now;
    let gain = 1 + Math.floor(combo/10);
    if (localOwned['item010']) gain += 1;
    totalTaps += gain; cpsCount++; if (!cpsInterval) cpsInterval = setInterval(()=>{ cpsEl.textContent = cpsCount; cpsCount=0; }, 1000);
    updateDisplays(); animateMineral(); savePlayer();
    if (socket && socket.connected) socket.emit('click', { delta: gain });
  }
  tapBtn.addEventListener('click', doTap);
  tapBtn.addEventListener('touchstart', (e)=> { e.preventDefault(); doTap(); });

  function animateMineral(){ if (mineralImg) { mineralImg.style.transform='scale(0.92) rotate(-6deg)'; setTimeout(()=> mineralImg.style.transform='',120); } }

  // chat: prevent reload and send via socket
  chatSend.addEventListener('click', ()=> {
    const t = msgInput.value.trim(); if (!t) return;
    if (socket && socket.connected) socket.emit('chat', { text: t });
    else appendMessage({ name: playerName, icon: playerIcon, text: t, me:true });
    msgInput.value = '';
  });
  chatForm.addEventListener('submit', (e) => { e.preventDefault(); chatSend.click(); });

  // set name
  setNameBtn.addEventListener('click', ()=> {
    const v = nameInput.value.trim(); if (!v) return;
    playerName = v; playerIcon = iconSelect.value || playerIcon; savePlayer(); populateIconSelect();
    if (socket && socket.connected) socket.emit('changeName', { name: playerName });
    nameInput.value = '';
  });

  // icon upload
  iconUpload.addEventListener('change', (e)=> {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const fr = new FileReader(); fr.onload = ()=> { playerIcon = fr.result; localStorage.setItem('playerIcon', playerIcon); populateIconSelect(); if (iconSelect) iconSelect.value = playerIcon; if (socket && socket.connected) socket.emit('changeName', { name: playerName }); }; fr.readAsDataURL(f);
  });

  if (iconSelect) iconSelect.addEventListener('change', ()=> { playerIcon = iconSelect.value; localStorage.setItem('playerIcon', playerIcon); });

  // shop toggle
  if (shopToggle && shopBody) {
    shopToggle.addEventListener('click', ()=> {
      const hidden = shopBody.getAttribute('aria-hidden') === 'true';
      shopBody.setAttribute('aria-hidden', hidden ? 'false' : 'true');
      shopToggle.setAttribute('aria-expanded', hidden ? 'true' : 'false');
    });
  }

  // initial render and save loop
  updateDisplays();
  renderShop();
  updateInventoryUI();
  setInterval(savePlayer, 5000);

  window._app = { localOwned, itemDefinitions, renderShop, updateInventoryUI, doTap };
})();
