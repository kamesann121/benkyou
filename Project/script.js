// script.js
let emeraldCount = 0;

const emerald = document.getElementById('emerald');
const countDisplay = document.getElementById('emerald-count');

emerald.addEventListener('click', () => {
  emeraldCount++;
  countDisplay.textContent = emeraldCount;
});
