let emeraldCount = 0;
let emeraldPerClick = 1;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');
const shopItemsContainer = document.getElementById('shop-items');

// アイテム一覧（30個）
const items = Array.from({ length: 30 }, (_, i) => {
  return {
    name: `アイテム${i + 1}`,
    cost: (i + 1) * 5,
    effect: () => {
      emeraldPerClick += 1;
    }
  };
});

emerald.addEventListener('click', () => {
  emeraldCount += emeraldPerClick;
  countDisplay.textContent = emeraldCount;
});

function buyItem(index) {
  const item = items[index];
  if (emeraldCount >= item.cost) {
    emeraldCount -= item.cost;
    countDisplay.textContent = emeraldCount;
    item.effect();
    alert(`${item.name} を購入しました！採掘力がアップ！`);
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
