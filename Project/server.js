// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

function loadData(){
  try{
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    return { users: {}, bans: { ids: [], names: [] } };
  }
}
function saveData(data){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }catch(e){
    console.error('Failed to save data', e);
  }
}

const persistent = loadData();
// persistent.users: playerId -> { id,name,icon,total,spent,isAdmin }
// persistent.bans: { ids: [], names: [] }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// runtime maps
const socketsById = new Map(); // socketId -> playerId
const connected = new Map(); // playerId -> { socketId, lastSeen }

// helpers
function isBannedId(id){ return persistent.bans.ids.includes(id); }
function isBannedName(name){ return persistent.bans.names.includes(name); }
function nameInUse(name, exceptId){
  for (const pid in persistent.users){
    if (persistent.users[pid].name === name && pid !== exceptId) return true;
  }
  // also check currently connected for immediate collisions
  for (const [pid, info] of connected.entries()){
    const u = persistent.users[pid];
    if (u && u.name === name && pid !== exceptId) return true;
  }
  return false;
}
function suggestName(base){
  let i = 1;
  let nm = base + i;
  while(nameInUse(nm)) { i++; nm = base + i; }
  return nm;
}
function broadcastPresence(){
  const list = [];
  for (const [pid, info] of connected.entries()){
    const u = persistent.users[pid];
    if (!u) continue;
    list.push({ id: pid, name: u.name, icon: u.icon, total: u.total, spent: u.spent, isAdmin: !!u.isAdmin });
  }
  io.emit('presenceUpdate', list);
}
function broadcastRanking(){
  const arr = Object.values(persistent.users).map(u => ({ id: u.id, name: u.name, total:u.total, spent:u.spent }));
  arr.sort((a,b)=> (b.total - b.spent) - (a.total - a.spent));
  io.emit('rankingUpdate', arr.slice(0, 50));
}

// periodic save
setInterval(()=> saveData(persistent), 10000);

// socket handling
io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    const { id, name, icon, total = 0, spent = 0 } = payload || {};
    if (!id) {
      socket.emit('joinError', { reason: 'missing id' });
      return;
    }
    if (isBannedId(id) || isBannedName(name)) {
      socket.emit('banned', { reason: 'You are banned' });
      socket.disconnect(true);
      return;
    }
    // ensure persistent record exists
    if (!persistent.users[id]) {
      persistent.users[id] = { id, name, icon: icon || 'assets/images/mineral.png', total: Number(total)||0, spent: Number(spent)||0, isAdmin:false };
    } else {
      // merge totals carefully: treat client-sent total/spent as candidate
      persistent.users[id].total = Math.max(persistent.users[id].total || 0, Number(total) || persistent.users[id].total || 0);
      persistent.users[id].spent = Math.max(persistent.users[id].spent || 0, Number(spent) || persistent.users[id].spent || 0);
      // update name/icon if changed but check uniqueness
      if (name && name !== persistent.users[id].name) {
        if (nameInUse(name, id)) {
          socket.emit('nameTaken', { suggested: suggestName(name) });
          return;
        } else {
          persistent.users[id].name = name;
        }
      }
      if (icon) persistent.users[id].icon = icon;
    }

    // name collision check for new name
    if (nameInUse(persistent.users[id].name, id)) {
      socket.emit('nameTaken', { suggested: suggestName(persistent.users[id].name) });
      return;
    }

    // mark connected
    socketsById.set(socket.id, id);
    connected.set(id, { socketId: socket.id, lastSeen: Date.now() });

    socket.join('players');

    socket.emit('joinAck', { id, user: persistent.users[id] });
    broadcastPresence();
    broadcastRanking();
  });

  socket.on('chat', (msg) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return;
    const user = persistent.users[pid];
    if (!user) return;
    const text = String(msg.text || '').trim();
    if (!text) return;

    // commands
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(' ');
      if (cmd === 'ban') {
        if (!user.isAdmin) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        // find target by name or id
        let targetId = null;
        for (const pid in persistent.users){
          if (persistent.users[pid].name === arg) { targetId = pid; break; }
        }
        if (targetId) {
          persistent.bans.ids.push(targetId);
          persistent.bans.names.push(persistent.users[targetId].name);
          // if connected, kick
          const info = connected.get(targetId);
          if (info && info.socketId) {
            io.to(info.socketId).emit('banned', { reason: 'Banned by admin' });
            io.sockets.sockets.get(info.socketId)?.disconnect(true);
          }
          io.emit('systemMsg', { text: `${arg} was banned by admin` });
          saveData(persistent);
          broadcastPresence();
          broadcastRanking();
        } else {
          socket.emit('systemMsg', { text: `ユーザーが見つかりません: ${arg}` });
        }
        return;
      }
      if (cmd === 'bro') {
        if (!user.isAdmin) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        // remove by name
        persistent.bans.names = persistent.bans.names.filter(n => n !== arg);
        // also ids cleanup (optional)
        saveData(persistent);
        io.emit('systemMsg', { text: `${arg} has been unbanned` });
        broadcastPresence();
        broadcastRanking();
        return;
      }
      socket.emit('systemMsg', { text: `Unknown command: /${cmd}` });
      return;
    }

    // normal chat broadcast
    io.emit('chat', { name: user.name, icon: user.icon, text, ts: Date.now() });
  });

  socket.on('click', (payload) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return;
    const user = persistent.users[pid];
    if (!user) return;
    const delta = Number(payload.delta || 0);
    if (!delta) return;
    // simple anti-cheat: limit per event and cap
    if (delta > 1000) return;
    user.total = (user.total || 0) + delta;
    // broadcast update
    io.emit('clickEvent', { id: pid, name: user.name, delta, total: user.total });
    broadcastRanking();
    saveData(persistent);
  });

  socket.on('buy', (payload) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return;
    const user = persistent.users[pid];
    if (!user) return;
    const itemId = payload && payload.itemId;
    const price = Number(payload && payload.price) || 0;
    // verify balance
    const gold = (user.total || 0) - (user.spent || 0);
    if (gold < price) {
      socket.emit('buyResult', { ok:false, reason:'not_enough' });
      return;
    }
    user.spent = (user.spent || 0) + price;
    // item effects could be applied here (for simplicity, just save)
    io.emit('systemMsg', { text: `${user.name} bought ${itemId}` });
    saveData(persistent);
    broadcastPresence();
    broadcastRanking();
    socket.emit('buyResult', { ok:true, user });
  });

  socket.on('changeName', ({ name }) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return;
    if (isBannedName(name)) { socket.emit('nameRejected', { reason:'banned' }); return; }
    if (nameInUse(name, pid)) { socket.emit('nameTaken', { suggested: suggestName(name) }); return; }
    persistent.users[pid].name = name;
    saveData(persistent);
    broadcastPresence();
    broadcastRanking();
    io.emit('systemMsg', { text: `${name} changed their name` });
  });

  socket.on('disconnect', () => {
    const pid = socketsById.get(socket.id);
    if (pid) {
      connected.delete(pid);
      socketsById.delete(socket.id);
      broadcastPresence();
    }
  });
});

server.listen(PORT, () => console.log(`Listening on ${PORT}`));
