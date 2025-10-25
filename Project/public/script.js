// 初期状態
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
const avatarPreview = document.getElementById('avatar-preview');
const previewName = document.getElementById('preview-name');

// 更新表示
function updateCounts(){
  countDisplay.textContent = emeraldCount;
  countDup.textContent = emeraldCount;
}
updateCounts();

// クリックで採取
emerald.addEventListener('click', () => {
  emeraldCount += emeraldPerClick;
  updateCounts();
  // 小さなエフェクト
  emerald.animate([{transform:'scale(1)'},{transform:'scale(1.04)'},{transform:'scale(1)'}],{duration:220});
});

// アイテム一覧（30個：具体名＋高め価格スケール）
const predefinedNames = [
  "基礎ドリルI","基礎ドリルII","センサーA","センサーB","自動旋盤",
  "採取アーム","冷却ユニット","精製モジュール","フィルター","安定化器",
  "容量拡張I","容量拡張II","加速ユニット","伸縮アダプタ","防振プレート",
  "電力コア小","電力コア中","電力コア大","解析モジュール","採取AI",
  "レーザー強化","エネルギー収束器","超伝導配線","高精度センサー","再生ユニット",
  "遠隔制御モジュール","保護シールド","ナビゲーションPX","レア検出器","最適化プロファイル"
];

const items = predefinedNames.map((name, i) => {
  const base = 50;
  const cost = Math.floor(base * Math.pow(1.6, i)); // 急速に高くなる
  return {
    id: i+1,
    name,
    cost,
    label: `${cost}エメ`,
    effect: () => { emeraldPerClick += Math.max(1, Math.floor((i+1)/5)); }
  };
});

// ショップ描画
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
    btn.textContent = '導入済';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.animate([{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:220});
    socket.emit('chat message', {
      name: 'システム',
      text: `${item.name} を導入しました（+${Math.max(1, Math.floor((item.id)/5))} 採取）`,
      avatar: null
    });
  } else {
    // 足りないときの視覚フィードバック
    btn.animate([{transform:'translateY(0)'},{transform:'translateY(-6px)'},{transform:'translateY(0)'}],{duration:260});
  }
});

// モジュールボタン（開閉）
toggleShopBtn.addEventListener('click', () => {
  const open = shopPanel.classList.toggle('open');
  shopPanel.setAttribute('aria-hidden', String(!open));
});

// アバターアップロード＆プレビュー
avatarUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadedAvatar = reader.result;
    avatarPreview.src = uploadedAvatar;
  };
  reader.readAsDataURL(file);
});

// ニックネームプレビュー
usernameInput.addEventListener('input', () => {
  const v = usernameInput.value.trim() || '研究者';
  previewName.textContent = v.length > 16 ? v.slice(0,16) : v;
});

// チャット送信
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (usernameInput.value.trim() || '研究者').slice(0,16);
  const text = input.value.trim();
  if(!text) return;
  socket.emit('chat message', { name, text, avatar: uploadedAvatar || null });
  input.value = '';
});

// チャット受信
socket.on('chat message', (msg) => {
  const li = document.createElement('li');
  li.className = 'message';

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
