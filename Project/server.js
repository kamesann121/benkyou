// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.static('public'));

// load or init persistent totals
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

// connected users: socketId -> { id, name, avatar, held, total }
const connected = {};

// helper to build ranking list (connected users only)
function connectedRanking() {
  return Object.values(connected)
    .map(u => ({ id: u.id, name: u.name, avatar: u.avatar, held: u.held || 0, total: totals[u.id] || 0 }))
    .sort((a,b) => (b.held + b.total) - (a.held + a.total)); // rank by combined as example
}

io.on('connection', (socket) => {
  // When a client connects, it should send 'init' with { id (optional), name, avatar }
  socket.on('init', (data) => {
    // choose stable id: if client provided id reuse, else use socket.id
    const clientId = data && data.id ? data.id : socket.id;
    const name = (data && data.name) ? data.name.slice(0, 32) : '研究者';
    const avatar = (data && data.avatar) ? data.avatar : null;

    // ensure totals entry exists
    if (!totals[clientId]) totals[clientId] = 0;
    connected[socket.id] = { id: clientId, name, avatar, held: 0 };

    // send back initial data: your id and your stored total
    socket.emit('init:ack', { id: clientId, total: totals[clientId] });

    // notify others user list changed
    io.emit('ranking:update', connectedRanking());
  });

  // receive when client increments held (local pick) and chooses to commit to total
  // We support two events:
  //  - 'held:update' => updates server's idea of current held (for live ranking)
  //  - 'commit:held' => commit held to total (persisted) and zero held
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
    totals[id] = (totals[id] || 0) + commit;
    u.held = 0;
    saveTotals();
    // broadcast updated totals and rankings
    io.emit('ranking:update', connectedRanking());
    io.emit('total:updated', { id, total: totals[id] });
  });

  // chat messages passthrough (unchanged)
  socket.on('chat message', (msg) => {
    // msg should include name, text, avatar
    io.emit('chat message', msg);
  });

  // disconnect
  socket.on('disconnect', () => {
    delete connected[socket.id];
    io.emit('ranking:update', connectedRanking());
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
