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
// ensure structure
persistent.users = persistent.users || {};
persistent.bans = persistent.bans || { ids: [], names: [] };

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const socketsById = new Map(); // socket.id -> playerId
const connected = new Map();   // playerId -> { socketId, lastSeen }

// helper checks
function isBannedId(id){ return persistent.bans.ids.includes(id); }
function isBannedName(name){ return persistent.bans.names.includes(name); }

// name in use excluding optional exceptId
function nameInUse(name, exceptId){
  if (!name) return false;
  for (const pid in persistent.users){
    if (persistent.users[pid].name === name && pid !== exceptId) return true;
  }
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

// persist periodically
setInterval(()=> saveData(persistent), 10000);

// Utility: find userId by name (exact match)
function findUserIdByName(name){
  if (!name) return null;
  for (const pid in persistent.users){
    if (persistent.users[pid].name === name) return pid;
  }
  return null;
}

// Utility: ban by id (adds to bans.ids and bans.names if name known)
function banById(targetId, byUser){
  if (!targetId) return false;
  if (!persistent.users[targetId]) {
    // still record id ban
    if (!persistent.bans.ids.includes(targetId)) persistent.bans.ids.push(targetId);
    return true;
  }
  const tgt = persistent.users[targetId];
  if (!persistent.bans.ids.includes(targetId)) persistent.bans.ids.push(targetId);
  if (tgt.name && !persistent.bans.names.includes(tgt.name)) persistent.bans.names.push(tgt.name);
  // kick if connected
  const info = connected.get(targetId);
  if (info && info.socketId) {
    io.to(info.socketId).emit('banned', { reason: `Banned by ${byUser || 'admin'}` });
    const sock = io.sockets.sockets.get(info.socketId);
    if (sock) sock.disconnect(true);
  }
  return true;
}

// Utility: unban by id or name (removes from bans lists)
function unbanByIdentifier(ident){
  if (!ident) return false;
  // if matches id
  if (persistent.bans.ids.includes(ident)) {
    persistent.bans.ids = persistent.bans.ids.filter(x => x !== ident);
    // also remove corresponding name if exists
    if (persistent.users[ident] && persistent.users[ident].name) {
      persistent.bans.names = persistent.bans.names.filter(n => n !== persistent.users[ident].name);
    }
    return true;
  }
  // treat ident as name
  if (persistent.bans.names.includes(ident)) {
    persistent.bans.names = persistent.bans.names.filter(n => n !== ident);
    // also remove any ids whose user name equals ident
    for (const pid in persistent.users) {
      if (persistent.users[pid].name === ident) {
        persistent.bans.ids = persistent.bans.ids.filter(x => x !== pid);
      }
    }
    return true;
  }
  // also support receiving a playerId that matches a user record (clean up names)
  // if ident equals a user id, remove that id from bans
  if (persistent.bans.ids.includes(ident)) {
    persistent.bans.ids = persistent.bans.ids.filter(x => x !== ident);
    return true;
  }
  return false;
}

// socket handlers
io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    const { id, name, icon, total = 0, spent = 0 } = payload || {};
    if (!id) {
      socket.emit('joinError', { reason: 'missing id' });
      return;
    }

    // immediate ban checks by id or name
    if (isBannedId(id) || isBannedName(name)) {
      socket.emit('banned', { reason: 'You are banned' });
      socket.disconnect(true);
      return;
    }

    // ensure persistent user record exists
    if (!persistent.users[id]) {
      persistent.users[id] = { id, name, icon: icon || 'assets/images/mineral.png', total: Number(total)||0, spent: Number(spent)||0, isAdmin:false };
    } else {
      // merge totals conservatively
      persistent.users[id].total = Math.max(persistent.users[id].total || 0, Number(total) || persistent.users[id].total || 0);
      persistent.users[id].spent = Math.max(persistent.users[id].spent || 0, Number(spent) || persistent.users[id].spent || 0);
      // name change request
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

    // final name collision check
    if (nameInUse(persistent.users[id].name, id)) {
      socket.emit('nameTaken', { suggested: suggestName(persistent.users[id].name) });
      return;
    }

    // record connection
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

    // command handling
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(' ').trim();
      // /ban <identifier>  -> identifier can be name or id
      if (cmd === 'ban') {
        if (!user.isAdmin) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /ban ニックネームかplayerId' }); return; }

        // try find by name first
        let targetId = findUserIdByName(arg);
        if (!targetId && persistent.bans.ids.includes(arg)) {
          // arg is already a banned id
          socket.emit('systemMsg', { text: `${arg} は既にバンされています` });
          return;
        }
        // if no user found by name, treat arg as id
        if (!targetId) targetId = arg;

        const ok = banById(targetId, user.name);
        if (ok) {
          io.emit('systemMsg', { text: `${arg} was banned by ${user.name}` });
          saveData(persistent);
          broadcastPresence();
          broadcastRanking();
        } else {
          socket.emit('systemMsg', { text: `バンに失敗しました: ${arg}` });
        }
        return;
      }

      // /bro <identifier> -> unban by name or id
      if (cmd === 'bro') {
        if (!user.isAdmin) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /bro ニックネームかplayerId' }); return; }

        const unbanned = unbanByIdentifier(arg);
        if (unbanned) {
          io.emit('systemMsg', { text: `${arg} has been unbanned by ${user.name}` });
          saveData(persistent);
          broadcastPresence();
          broadcastRanking();
        } else {
          socket.emit('systemMsg', { text: `指定が見つかりませんでした: ${arg}` });
        }
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
    if (delta > 1000) return;
    user.total = (user.total || 0) + delta;
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
    const gold = (user.total || 0) - (user.spent || 0);
    if (gold < price) {
      socket.emit('buyResult', { ok:false, reason:'not_enough' });
      return;
    }
    // server-side single-purchase enforcement: store ownedItems within user
    user.ownedItems = user.ownedItems || {};
    if (user.ownedItems[itemId]) {
      socket.emit('buyResult', { ok:false, reason:'already_owned' });
      return;
    }
    user.spent = (user.spent || 0) + price;
    user.ownedItems[itemId] = true;
    io.emit('systemMsg', { text: `${user.name} bought ${itemId}` });
    saveData(persistent);
    broadcastPresence();
    broadcastRanking();
    socket.emit('buyResult', { ok:true, user });
  });

  socket.on('changeName', ({ name }) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return;
    if (!name) return;
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
