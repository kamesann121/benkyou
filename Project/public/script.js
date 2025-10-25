let emeraldCount = 0;
let emeraldPerClick = 1;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');
const shopItemsContainer = document.getElementById('shop-items');

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

// チャット機能
const socket = io();

const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messages = document.getElementById('messages');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('username').value || '研究者';
  const icon = document.getElementById('avatar').value || '💧';
  const text = input.value;
  if (text) {
    socket.emit('chat message', { name, icon, text });
    input.value = '';
  }
});

socket.on('chat message', (msg) => {
  const li = document.createElement('li');
  li.className = 'message';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = msg.icon;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const nickname = document.createElement('div');
  nickname.className = 'nickname';
  nickname.textContent = msg.name;

  const text = document.createElement('div');
  text.textContent = msg.text;

  bubble.appendChild(nickname);
  bubble.appendChild(text);

  li.appendChild(avatar);
  li.appendChild(bubble);
  messages.appendChild(li);
});
