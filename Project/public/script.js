// 統合された client-side script.js

// --- 永続/表示用の値 ---
let heldEm = 0;       // 現在の所持エメ（手持ち）
let totalEm = 0;      // 総合エメ（サーバー永続／累計）
let uploadedAvatar = null;
let clientId = null;  // 永続ID（localStorageで保持）

const socket = io();

// --- DOM 要素 ---
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

// --- localStorage から clientId を読み出し（あれば） ---
if (localStorage.getItem('lab_client_id')) {
  clientId = localStorage.getItem('lab_client_id');
}

// --- ユーティリティ ---
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function updateDisplays() {
  if (heldDisplay) heldDisplay.textContent = heldEm;
  if (totalDisplay) totalDisplay.textContent = totalEm;
  if (totalDup) totalDup.textContent = totalEm;
}

// --- 初期表示 ---
updateDisplays();

// --- 初期化ハンドシェイク ---
function sendInit() {
  socket.emit('init', {
    id: clientId,
    name: usernameInput && usernameInput.value.trim() ? usernameInput.value.trim() : (previewName ? previewName.textContent : '研究者'),
    avatar: uploadedAvatar || null
  });
}
sendInit();

// サーバー応答：初期 ack（確定 id と保存総合値を受け取る）
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

// サーバーからの総合値更新（自分の id に対する更新）
socket.on('total:updated', (data) => {
  if (!data || !data.id) return;
  if (data.id === clientId) {
    totalEm = data.total;
    updateDisplays();
  }
});

// ランキング更新（接続中ユーザーのみ）
socket.on('ranking:update', (list) => {
  renderRanking(list);
});

// --- クリック（採取）: 手持ちに加算しサーバーに held:update を通知 ---
emerald && emerald.addEventListener('click', () => {
  heldEm += 1;
  updateDisplays();
  // サーバーに現在の held を伝えてライブランキングに反映
  socket.emit('held:update', heldEm);
  // 簡易エフェクト
  emerald.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 180 });
});

// --- 自動コミット：ページ離脱時に手持ちをサーバーへコミット（可能なら sendBeacon） ---
function commitHeldToServer() {
  if (heldEm <= 0) return;
  // サーバー側は 'commit:held' を受けて totals に加算し永続化する想定
  socket.emit('commit:held', heldEm);
  // optimistic: クリア
  heldEm = 0;
  updateDisplays();
  socket.emit('held:update', 0);
}
window.addEventListener('beforeunload', () => {
  try {
    // 可能なら sendBeacon 経由で確実に送る（サーバー側に /__commit を実装している場合）
    const payload = JSON.stringify({ id: clientId, commit: heldEm });
    if (heldEm > 0 && navigator.sendBeacon) {
      navigator.sendBeacon('/__commit', payload);
      // also emit socket as fallback
      socket.emit('commit:held', heldEm);
    } else if (heldEm > 0) {
      socket.emit('commit:held', heldEm);
    }
  } catch (e) {}
});

// --- アイテム一覧（30個：具体名＋高め価格スケール） ---
const predefinedNames = [
  "基礎ドリルI","基礎ドリルII","センサーA","センサーB","自動旋盤",
  "採取アーム","冷却ユニット","精製モジュール","フィルター","安定化器",
  "容量拡張I","容量拡張II","加速ユニット","伸縮アダプタ","防振プレート",
  "電力コア小","電力コア中","電力コア大","解析モジュール","採取AI",
  "レーザー強化","エネルギー収束器","超伝導配線","高精度センサー","再生ユニット",
  "遠隔制御モジュール","保護シールド","ナビゲーションPX","レア検出器","最適化プロファイル"
];

// 価格を高めにスケール
const items = predefinedNames.map((name, i) => {
  const base = 500; // 大きめに設定（以前より高い）
  const cost = Math.floor(base * Math.pow(1.65, i)); // 急速に高くなる
  return {
    id: i+1,
    name,
    cost,
    label: `${cost}エメ`,
    effect: () => { /* 効果：採取効率を適度に上げる */ emeraldPerClickIncrease(i); }
  };
});

// 補助: 採取効率の増加ロジック
function emeraldPerClickIncrease(index) {
  // 簡易的に、アイテムごとに段階的に増加
  const inc = Math.max(1, Math.floor((index + 1) / 5));
  // ここでは totalEm に直接影響させず、held の増加量を増やすためのフラグとして使う
  // 実装上は、今は held の増加はクリックごとに +1 固定だが、必要なら仕組みを拡張してください
  // イベントを出すことで他クライアントに通知
  socket.emit('chat message', { name: 'システム', text: `導入効果: 採取効率 +${inc}（処理中）`, avatar: null });
  // 将来的に emeraldPerClick（クリックあたりの取得）を持たせる場合、その変数を増やします
}

// --- ショップ描画 ---
function renderShop(){
  if (!shopItemsContainer) return;
  shopItemsContainer.innerHTML = '';
  items.forEach((it, idx) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="label">${escapeHtml(it.name)}</div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="price">${it.label}</div>
        <button class="buy-btn" data-idx="${idx}">購入</button>
      </div>
    `;
    shopItemsContainer.appendChild(div);
  });
}
renderShop();

// --- 購入処理 ---
// 購入は「総合エメ（totalEm）」を消費する仕様に変更
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.buy-btn');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const item = items[idx];
  if (!item) return;
  if (totalEm >= item.cost) {
    // 総合エメを消費
    totalEm -= item.cost;
    updateDisplays();
    // 効果を適用（現在は通知のみ、必要なら持続効果を管理）
    item.effect();
    // UIフィードバック
    btn.textContent = '導入済';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.animate([{ transform:'scale(1)' }, { transform:'scale(1.06)' }, { transform:'scale(1)' }], { duration:220 });
    // 永続化：サーバーへ「commit:held」ではないが、ここは totals を更新するために
    // commit の代わりにサーバー側で受け取る専用イベントがあると良い（今回は commit:held を利用して差分を送る）
    // ここは「購入分をサーバーの累計から差し引く」処理を行う形で簡易に sendBeacon で伝える
    try {
      // optimistic emit for server persistence; server should handle this event if implemented
      socket.emit('purchase:deduct', { id: clientId, amount: item.cost });
    } catch (e) {}
    // 通知をチャットに流す
    socket.emit('chat message', {
      name: 'システム',
      text: `${item.name} を ${item.label} で購入しました`,
      avatar: null
    });
  } else {
    // 足りないときの視覚フィードバック
    btn.animate([{ transform:'translateY(0)' }, { transform:'translateY(-6px)' }, { transform:'translateY(0)' }], { duration:260 });
  }
});

// --- モジュールボタン（開閉） ---
toggleShopBtn && toggleShopBtn.addEventListener('click', () => {
  const open = shopPanel.classList.toggle('open');
  shopPanel.setAttribute('aria-hidden', String(!open));
  // 大きく押された感の演出
  toggleShopBtn.animate([{ transform:'scale(1)' }, { transform:'scale(0.98)' }, { transform:'scale(1)' }], { duration:140 });
});

// --- アバターアップロード＆プレビュー ---
avatarUpload && avatarUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadedAvatar = reader.result;
    if (avatarPreview) avatarPreview.src = uploadedAvatar;
    // 名前やアバターが変わったらサーバーに再初期化通知
    sendInit();
  };
  reader.readAsDataURL(file);
});

// --- ニックネームプレビュー ---
usernameInput && usernameInput.addEventListener('input', () => {
  const v = usernameInput.value.trim() || '研究者';
  if (previewName) previewName.textContent = v.length > 16 ? v.slice(0,16) : v;
  // 変更をサーバーへ
  sendInit();
});

// --- チャット送信 ---
form && form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = (usernameInput && usernameInput.value.trim() ? usernameInput.value.trim() : (previewName ? previewName.textContent : '研究者')).slice(0,16);
  const text = input && input.value.trim();
  if (!text) return;
  socket.emit('chat message', { name, text, avatar: uploadedAvatar || null });
  if (input) input.value = '';
});

// --- チャット受信表示（LINE風） ---
socket.on('chat message', (msg) => {
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
  messages && messages.appendChild(li);

  // 自動スクロール（滑らか）
  const chatWindow = document.getElementById('chat-window');
  chatWindow && chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
});

// --- ランキング描画（接続中ユーザーのみ） ---
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

// --- 余剰変数互換（旧スクリプトとの結合で使われていた変数） ---
let emeraldCount = totalEm; // 互換保持（必要に応じて同期）
let emeraldPerClick = 1;

// 更新同期関数（外部処理から呼ばれる可能性を想定）
function syncTotalsFromServer(newTotal) {
  totalEm = newTotal;
  emeraldCount = totalEm;
  updateDisplays();
}

// --- ソケットからの外部通知（互換的に受ける） ---
socket.on('total:sync', (data) => {
  if (data && typeof data.total === 'number') {
    syncTotalsFromServer(data.total);
  }
});

// 初期ディスプレイ更新
updateDisplays();
```
