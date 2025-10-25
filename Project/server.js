// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const DATA_FILE = path.join(__dirname, 'data.json');
app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

// --- persistent totals load/save ---
let totals = {};
try {
  if (fs.existsSync(DATA_FILE)) {
    totals = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
  }
} catch (e) {
  console.error('Failed reading data file, starting with empty totals', e);
  totals = {};
}
function saveTotals() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(totals, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed writing totals to disk', e);
  }
}

// --- simple sanitize on server (final defense) ---
const BANNED = ['game', 'ゲーム', '該当カテゴリ:ゲーム'];
function sanitizeServer(text) {
  if (!text && text !== 0) return '';
  let t = String(text);
  BANNED.forEach(w => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'ig');
    t = t.replace(re, '［非表示語］');
  });
  t = t.replace(/<[^>]*>/g, '').trim();
  return t;
}

// --- connected users store ---
const connected = {}; // socket.id -> { id, name, avatar, held }

// helper ranking for connected users only
function connectedRanking() {
  return Object.values(connected)
    .map(u => ({ id: u.id, name: u.name, avatar: u.avatar, held: u.held || 0, total: totals[u.id] || 0 }))
    .sort((a, b) => (b.held + b.total) - (a.held + a.total));
}

// optional endpoint for sendBeacon commit
app.post('/__commit', (req, res) => {
  try {
    const body = req.body;
    let id = body && body.id;
    let commit = Number(body && body.commit);
    if (!id && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        id = parsed.id;
        commit = Number(parsed.commit);
      } catch (e) {}
    }
    if (id && !isNaN(commit) && commit > 0) {
      totals[id] = (totals[id] || 0) + commit;
      saveTotals();
    }
  } catch (e) {}
  res.sendStatus(200);
});

// --- socket handlers ---
io.on('connection', (socket) => {
  socket.on('init', (data) => {
    const clientId = data && data.id ? data.id : socket.id;
    const name = data && data.name ? sanitizeServer(data.name).slice(0, 32) : '研究者';
    const avatar = data && data.avatar ? data.avatar : null;
    if (!totals[clientId]) totals[clientId] = 0;
    connected[socket.id] = { id: clientId, name, avatar, held: 0 };
    socket.emit('init:ack', { id: clientId, total: totals[clientId] });
    io.emit('ranking:update', connectedRanking());
  });

  socket.on('held:update', (value) => {
    const u = connected[socket.id];
    if (!u) return;
    u.held = Number(value) || 0;
    io.emit('ranking:update', connectedRanking());
  });

  socket.on('commit:held', (value) => {
    const u = connected[socket.id];
    if (!u) return;
    const commit = Number(value) || 0;
    const id = u.id;
    if (commit > 0) {
      totals[id] = (totals[id] || 0) + commit;
      saveTotals();
      u.held = 0;
      io.emit('ranking:update', connectedRanking());
      io.emit('total:updated', { id, total: totals[id] });
    }
  });

  // purchase deduction event (client requests to deduct from total)
  socket.on('purchase:deduct', (data) => {
    try {
      const id = data && data.id ? data.id : (connected[socket.id] && connected[socket.id].id);
      const amount = Number(data && data.amount) || 0;
      if (id && amount > 0) {
        totals[id] = (totals[id] || 0) - amount;
        if (totals[id] < 0) totals[id] = 0;
        saveTotals();
        io.emit('total:updated', { id, total: totals[id] });
        io.emit('ranking:update', connectedRanking());
      }
    } catch (e) {}
  });

  socket.on('chat message', (msg) => {
    const safeName = sanitizeServer(msg && msg.name ? msg.name : '研究者');
    const safeText = sanitizeServer(msg && msg.text ? msg.text : '');
    io.emit('chat message', { name: safeName, text: safeText, avatar: msg && msg.avatar ? msg.avatar : null });
  });

  socket.on('disconnect', () => {
    delete connected[socket.id];
    io.emit('ranking:update', connectedRanking());
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
