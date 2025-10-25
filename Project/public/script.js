// --- 初期リソースとUI要素 ---
let emeraldCount = 0;
let emeraldPerClick = 1;
let uploadedAvatar = null;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');
const countDup = document.getElementById('emerald-count-dup');
const shopItemsContainer = document.getElementById('shop-items');
const toggleShopBtn = document.getElementById('toggle-shop');
const shopPanel = document.getElementById('shop-panel');

const socket = io();
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messages = document.getElementById('messages');
const avatarUpload = document.getElementById('avatar-upload');
const usernameInput = document.getElementById('username');

// --- クリックで採取（画像を大きくした） ---
emerald.addEventListener('click', () => {
  emeraldCount += emeraldPerClick;
  updateCounts();
});

// 更新表示
function updateCounts(){
  countDisplay.textContent = emeraldCount;
  countDup.textContent = emeraldCount;
}

// --- ショップ：30アイテムを自動生成（価格表記は「nエメ」） ---
const items = [];
for(let i=1;i<=30;i++){
  // 基本価格を指数的に少し増やす（見た目用に大きめ）
  const base = 10;
  const cost = Math.floor(base * Math.pow(1.5, i-1));
  items.push({
    id: i,
    name: `モジュール ${i}`,
    cost,
    label: `${cost}エメ`,
    effect: () => { emeraldPerClick += Math.max(1, Math.floor(i/6)); }
  });
}

// ショップUI生成
function renderShop(){
  shopItemsContainer.innerHTML = '';
  items.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="label">${it.name}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="price">${it.label}</div>
        <button class="buy-btn" data-idx="${idx}">購入</button>
      </div>
    `;
    shopItemsContainer.appendChild(div);
  });
}
renderShop();

// 購入処理
shopItemsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.buy-btn');
  if(!btn) return;
  const idx = Number(btn.dataset.idx);
  const item = items[idx];
  if(emeraldCount >= item.cost){
    emeraldCount -= item.cost;
    item.effect();
    updateCounts();
    // 軽いUIフィードバック
    btn.textContent = '導入済';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    // 任意で通知をチャットに流す
    socket.emit('chat message', {
      name: 'システム',
      text: `${item.name} を導入しました（+${Math.max(1, Math.floor(item.id/6))} 採取）`,
      avatar: null
    });
  } else {
    // 足りないときの視覚フィードバック
    btn.animate([{transform:'translateY(0)'},{transform:'translateY(-6px)'},{transform:'translateY(0)'}],{duration:260});
  }
});

// --- モジュールボタン：折りたたみ（ボタン化）＋滑らかなモーション ---
toggleShopBtn.addEventListener('click', () => {
  shopPanel.classList.toggle('open');
});

// --- アイコンアップロード（base64で保持） ---
avatarUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => { uploadedAvatar = reader.result; };
  reader.readAsDataURL(file);
});

// --- チャット送信 ---
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim() || '研究者';
  const text = input.value.trim();
  if(!text) return;
  socket.emit('chat message', {
    name,
    text,
    avatar: uploadedAvatar || null
  });
  input.value = '';
});

// --- 受信してLINE風に追加 ---
socket.on('chat message', (msg) => {
  const li = document.createElement('li');
  li.className = 'message';

  // left: name over avatar
  const left = document.createElement('div');
  left.className = 'message-left';
  const nameDiv = document.createElement('div');
  nameDiv.className = 'nickname';
  nameDiv.textContent = msg.name;
  const avatar = document.createElement('img');
  avatar.className = 'avatar-img';
  avatar.src = msg.avatar || 'assets/images/default-avatar.png';
  left.appendChild(nameDiv);
  left.appendChild(avatar);

  // bubble
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = msg.text;

  li.appendChild(left);
  li.appendChild(bubble);
  messages.appendChild(li);

  // 自動スクロール（滑らか）
  const chatWindow = document.getElementById('chat-window');
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
});
