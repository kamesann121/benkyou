let emeraldCount = 0;
let emeraldPerClick = 1;
let autoMineRate = 0;
let multiplier = 1;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');
const shopItemsContainer = document.getElementById('shop-items');

// 折りたたみ機能
function toggleShop() {
  shopItemsContainer.style.display =
    shopItemsContainer.style.display === 'none' ? 'block' : 'none';
}

// アイテム一覧（名前＋効果）
const items = [
  { name: "ひび割れたピッケル", cost: 5, effect: () => emeraldPerClick += 1 },
  { name: "湿ったたいまつ", cost: 10, effect: () => multiplier += 0.1 },
  { name: "コウモリの羽根", cost: 15, effect: () => emeraldPerClick += 2 },
  { name: "苔むしたロープ", cost: 20, effect: () => autoMineRate += 0.2 },
  { name: "古びた地図の切れ端", cost: 25, effect: () => emeraldPerClick += 1 },
  { name: "石ころのブレスレット", cost: 30, effect: () => multiplier += 0.2 },
  { name: "洞窟の風の瓶詰め", cost: 35, effect: () => autoMineRate += 0.3 },
  { name: "錆びたスコップ", cost: 40, effect: () => emeraldPerClick += 3 },
  { name: "小さな鉱石のかけら", cost: 45, effect: () => multiplier += 0.3 },
  { name: "探検家の手袋（片方）", cost: 50, effect: () => autoMineRate += 0.5 },
  { name: "光る石英のかけら", cost: 60, effect: () => emeraldPerClick += 4 },
  { name: "コウモリの羽根飾り", cost: 70, effect: () => multiplier += 0.4 },
  { name: "洞窟の音叉", cost: 80, effect: () => autoMineRate += 0.6 },
  { name: "青く光るランタン", cost: 90, effect: () => emeraldPerClick += 5 },
  { name: "岩の精霊の鈴", cost: 100, effect: () => multiplier += 0.5 },
  { name: "古代の釘", cost: 110, effect: () => autoMineRate += 0.7 },
  { name: "ひんやりする石板", cost: 120, effect: () => emeraldPerClick += 6 },
  { name: "地下水のしずく玉", cost: 130, effect: () => multiplier += 0.6 },
  { name: "鉱脈の羅針盤", cost: 140, effect: () => autoMineRate += 0.8 },
  { name: "結晶化した苔", cost: 150, effect: () => emeraldPerClick += 7 },
  { name: "エメラルドの心臓", cost: 160, effect: () => multiplier += 1 },
  { name: "洞窟竜のウロコ", cost: 170, effect: () => autoMineRate += 1 },
  { name: "光る鉱石の王冠", cost: 180, effect: () => emeraldPerClick += 10 },
  { name: "地底の魔導書", cost: 190, effect: () => multiplier += 1.5 },
  { name: "封印された鉱石の箱", cost: 200, effect: () => autoMineRate += 1.5 },
  { name: "岩の精霊の涙", cost: 210, effect: () => emeraldPerClick += 15 },
  { name: "深淵のかけら", cost: 220, effect: () => multiplier += 2 },
  { name: "時を刻む石", cost: 230, effect: () => autoMineRate += 2 },
  { name: "無音のランプ", cost: 240, effect: () => emeraldPerClick += 20 },
  { name: "洞窟の王の指輪", cost: 250, effect: () => multiplier += 3 },
];

// クリック処理
emerald.addEventListener('click', () => {
  emeraldCount += Math.floor(emeraldPerClick * multiplier);
  countDisplay.textContent = emeraldCount;
});

// 購入処理
function buyItem(index) {
  const item = items[index];
  if (emeraldCount >= item.cost) {
    emeraldCount -= item.cost;
    countDisplay.textContent = emeraldCount;
    item.effect();
    alert(`${item.name} を購入しました！`);
  } else {
    alert("エメラルドが足りません！");
  }
}

// ショップUI生成
items.forEach((item, index) => {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <p>${item.name} - ${item.cost}エメラルド</p>
    <button onclick="buyItem(${index})">購入</button>
  `;
  shopItemsContainer.appendChild(div);
});

// 自動採掘処理
setInterval(() => {
  emeraldCount += Math.floor(autoMineRate);
  countDisplay.textContent = emeraldCount;
}, 1000);

// チャット機能
const socket = io();

const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const messages = document.getElementById('messages');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('username').value || '名無し';
  const icon = document.getElementById('avatar').value || '💧';
  const text = input.value;
  if (text) {
    socket.emit('chat message', { name, icon, text });
    input.value = '';
  }
});

socket.on('chat message', (msg) => {
  const li = document.createElement('li');
  li.textContent =
