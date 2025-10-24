let mineralCount = 0;
let yieldRate = 1;
let autoExtractionRate = 0;
let efficiencyFactor = 1;

const mineral = document.getElementById('mineral');
const countDisplay = document.getElementById('mineral-count');
const toolItemsContainer = document.getElementById('tool-items');

// 折りたたみ機能
function toggleToolbox() {
  toolItemsContainer.style.display =
    toolItemsContainer.style.display === 'none' ? 'block' : 'none';
}

// ツール一覧（名前＋機能）
const tools = [
  { name: "ひび割れた採掘器", cost: 5, function: () => yieldRate += 1 },
  { name: "湿った照明具", cost: 10, function: () => efficiencyFactor += 0.1 },
  { name: "羽根型センサー", cost: 15, function: () => yieldRate += 2 },
  { name: "苔除去ロープ", cost: 20, function: () => autoExtractionRate += 0.2 },
  // ...（残りのツールも同様にリネーム可能！）
];

// 採取処理
mineral.addEventListener('click', () => {
  mineralCount += Math.floor(yieldRate * efficiencyFactor);
  countDisplay.textContent = mineralCount;
});

// 導入処理
function introduceTool(index) {
  const tool = tools[index];
  if (mineralCount >= tool.cost) {
    mineralCount -= tool.cost;
    countDisplay.textContent = mineralCount;
    tool.function();
    alert(`${tool.name} を導入しました！`);
  } else {
    alert("採取量が不足しています！");
  }
}

// ツールUI生成
tools.forEach((tool, index) => {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `
    <p>${tool.name} - ${tool.cost}単位</p>
    <button onclick="introduceTool(${index})">導入</button>
  `;
  toolItemsContainer.appendChild(div);
});

// 自動採取処理
setInterval(() => {
  mineralCount += Math.floor(autoExtractionRate);
  countDisplay.textContent = mineralCount;
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
