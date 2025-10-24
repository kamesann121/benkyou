let resourceCount = 0;
let extractionRate = 1;
let autoExtractionRate = 0;
let efficiencyMultiplier = 1;

const resource = document.getElementById('resource');
const countDisplay = document.getElementById('resource-count');
const moduleItemsContainer = document.getElementById('module-items');

// 折りたたみ機能
function toggleModule() {
  moduleItemsContainer.style.display =
    moduleItemsContainer.style.display === 'none' ? 'block' : 'none';
}

// モジュール一覧（教育風）
const modules = [
  { name: "初期採取装置", cost: 5, function: () => extractionRate += 1 },
  { name: "照度調整ランプ", cost: 10, function: () => efficiencyMultiplier += 0.1 },
  { name: "振動センサー", cost: 15, function: () => extractionRate += 2 },
  { name: "苔除去ツール", cost: 20, function: () => autoExtractionRate += 0.2 },
  { name: "地層マッピング装置", cost: 25, function: () => extractionRate += 1 },
  { name: "鉱物識別ブレスレット", cost: 30, function: () => efficiencyMultiplier += 0.2 },
  { name: "空気流量測定器", cost: 35, function: () => autoExtractionRate += 0.3 },
  { name: "岩盤掘削補助具", cost: 40, function: () => extractionRate += 3 },
  { name: "鉱石分析キット", cost: 45, function: () => efficiencyMultiplier += 0.3 },
  { name: "耐熱手袋", cost: 50, function: () => autoExtractionRate += 0.5 },
  // ...続きも教育風に命名可能！
];

// 採取処理
resource.addEventListener('click', () => {
  resourceCount += Math.floor(extractionRate * efficiencyMultiplier);
  countDisplay.textContent = resourceCount;
});

// 導入処理
function introduceModule(index) {
  const module = modules[index];
  if (resourceCount >= module.cost) {
    resourceCount -= module.cost;
    countDisplay.textContent = resourceCount;
    module.function();
    alert(`${module.name} を導入しました！`);
  } else {
    alert("資源が不足しています！");
  }
}

// モジュールUI生成
modules.forEach((module, index) => {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <p>${module.name} - ${module.cost}単位</p>
    <button onclick="introduceModule(${index})">導入</button>
  `;
  moduleItemsContainer.appendChild(div);
});

// 自動採取処理
setInterval(() => {
  resourceCount += Math.floor(autoExtractionRate);
  countDisplay.textContent = resourceCount;
}, 1000);

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
  li.textContent = `${msg.icon} ${msg.name}: ${msg.text}`;
  messages.appendChild(li);
});
