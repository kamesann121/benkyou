let emeraldCount = 0;
let emeraldPerClick = 1;
let uploadedAvatar = null;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');
const shopItemsContainer = document.getElementById('shop-items');
const socket = io();
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messages = document.getElementById('messages');

// 採取処理
emerald.addEventListener('click', () => {
  emeraldCount += emeraldPerClick;
  countDisplay.textContent = emeraldCount;
});

// モジュール一覧
const items = [
  { name: "初期採取装置", cost: 10, effect: () => emeraldPerClick += 1 },
  { name: "振動センサー", cost: 20, effect: () => emeraldPerClick += 2 },
];

// 導入処理
function buyItem(index) {
  const item = items[index];
  if (emeraldCount >= item.cost) {
    emeraldCount -= item.cost;
    countDisplay.textContent = emeraldCount;
    item.effect();
    alert(`${item.name} を導入しました！`);
  } else {
    alert("資源が不足しています！");
  }
}

// UI生成
items.forEach((item, index) => {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <span>${item.name} - ${item.cost}単位</span>
    <button onclick="buyItem(${index})">導入</button>
  `;
  shopItemsContainer.appendChild(div);
});

// 折りたたみ機能
function toggleShop() {
  shopItemsContainer.style.display =
    shopItemsContainer.style.display === 'none' ? 'block' : 'none';
}

// アイコン画像アップロード
document.getElementById('avatar-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      uploadedAvatar = reader.result;
    };
    reader.readAsDataURL(file);
  }
});

// チャット送信
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('username').value || '研究者';
  const text = input.value;
  if (text) {
    socket.emit('chat message', {
      name,
      text,
      avatar: uploadedAvatar || null
    });
    input.value = '';
  }
});

// チャット受信
socket.on('chat message', (msg) => {
  const li = document.createElement('li');
  li.className = 'message';

  const left = document.createElement('div');
  left.className = 'message-left';

  const name = document.createElement('div');
  name.className = 'nickname';
  name.textContent = msg.name;

  const avatar = document.createElement('img');
  avatar.className = 'avatar-img';
  avatar.src = msg.avatar || 'assets/images/default-avatar.png';

  left.appendChild(name);
  left.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = msg.text;

  li.appendChild(left);
  li.appendChild(bubble);
  messages.appendChild(li);
});
