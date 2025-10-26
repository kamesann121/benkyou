// server.js (ギフト対応)
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
persistent.users = persistent.users || {};
persistent.bans = persistent.bans || { ids: [], names: [] };

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const socketsById = new Map(); // socket.id -> playerId
const connected = new Map();   // playerId -> { socketId, lastSeen }

// helper functions
function isBannedId(id){ return persistent.bans.ids.includes(id); }
function isBannedName(name){ return persistent.bans.names.includes(name); }
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
    list.push({ id: pid, name: u.name, icon: u.icon, total: u.total, spent: u.spent, isAdmin: !!u.isAdmin || u.name === 'admin' });
  }
  io.emit('presenceUpdate', list);
}
function broadcastRanking(){
  const arr = Object.values(persistent.users).map(u => ({ id: u.id, name: u.name, total:u.total, spent:u.spent }));
  arr.sort((a,b)=> (b.total - b.spent) - (a.total - a.spent));
  io.emit('rankingUpdate', arr.slice(0, 50));
}

setInterval(()=> saveData(persistent), 10000);

// find user id by name
function findUserIdByName(name){
  if (!name) return null;
  for (const pid in persistent.users){
    if (persistent.users[pid].name === name) return pid;
  }
  return null;
}

// gift helper: apply gift to target (by playerId or name fallback)
function applyGift({ fromId, fromName, to, type, itemId, amount }){
  // resolve recipient: first try treat 'to' as playerId
  let targetId = to && persistent.users[to] ? to : null;
  // else try find by name
  if (!targetId) {
    targetId = findUserIdByName(to);
  }
  // if still not found, create a placeholder user entry (offline delivery) keyed by generated id? We'll store by name mapping in pendingGifts
  if (!targetId) {
    // store pending gift by name: persistent.pendingGifts[name] = [...]
    persistent.pendingGifts = persistent.pendingGifts || {};
    persistent.pendingGifts[to] = persistent.pendingGifts[to] || [];
    persistent.pendingGifts[to].push({ fromName, type, itemId, amount, ts: Date.now() });
    saveData(persistent);
    return { ok:true, delivered:false, reason:'stored_offline' };
  }

  // ensure recipient exists
  const user = persistent.users[targetId] || (persistent.users[targetId] = { id: targetId, name: to, icon:'assets/images/mineral.png', total:0, spent:0, isAdmin:false });
  // apply gift
  if (type === 'gold') {
    // gold is represented as increasing total directly (alternative designs possible)
    user.total = (user.total || 0) + Number(amount || 0);
    saveData(persistent);
    // notify if connected
    const info = connected.get(targetId);
    if (info && info.socketId) {
      io.to(info.socketId).emit('giftReceived', { fromName, type:'gold', amount });
    }
    return { ok:true, delivered:true, targetId };
  } else if (type === 'item') {
    user.ownedItems = user.ownedItems || {};
    if (user.ownedItems[itemId]) {
      // already owns; store as pending instead
      persistent.pendingGifts = persistent.pendingGifts || {};
      persistent.pendingGifts[user.name] = persistent.pendingGifts[user.name] || [];
      persistent.pendingGifts[user.name].push({ fromName, type, itemId, amount:0, ts: Date.now() });
      saveData(persistent);
      return { ok:true, delivered:false, reason:'already_owned_stored' };
    }
    user.ownedItems[itemId] = true;
    saveData(persistent);
    const info = connected.get(targetId);
    if (info && info.socketId) {
      io.to(info.socketId).emit('giftReceived', { fromName, type:'item', itemId, itemTitle: itemId });
    }
    return { ok:true, delivered:true, targetId };
  }
  return { ok:false, reason:'unknown_type' };
}

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

    if (!persistent.users[id]) {
      persistent.users[id] = { id, name, icon: icon || 'assets/images/mineral.png', total: Number(total)||0, spent: Number(spent)||0, isAdmin:false };
    } else {
      persistent.users[id].total = Math.max(persistent.users[id].total || 0, Number(total) || persistent.users[id].total || 0);
      persistent.users[id].spent = Math.max(persistent.users[id].spent || 0, Number(spent) || persistent.users[id].spent || 0);
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

    if (nameInUse(persistent.users[id].name, id)) {
      socket.emit('nameTaken', { suggested: suggestName(persistent.users[id].name) });
      return;
    }

    socketsById.set(socket.id, id);
    connected.set(id, { socketId: socket.id, lastSeen: Date.now() });
    socket.join('players');

    // deliver pending gifts by name if exist
    if (persistent.pendingGifts && persistent.pendingGifts[persistent.users[id].name]) {
      const list = persistent.pendingGifts[persistent.users[id].name];
      list.forEach(g => {
        // apply pending gift items to user record
        if (g.type === 'gold') {
          persistent.users[id].total = (persistent.users[id].total || 0) + Number(g.amount || 0);
          socket.emit('giftReceived', { fromName: g.fromName, type:'gold', amount: g.amount });
        } else if (g.type === 'item') {
          persistent.users[id].ownedItems = persistent.users[id].ownedItems || {};
          persistent.users[id].ownedItems[g.itemId] = true;
          socket.emit('giftReceived', { fromName: g.fromName, type:'item', itemId: g.itemId, itemTitle: g.itemId });
        }
      });
      delete persistent.pendingGifts[persistent.users[id].name];
      saveData(persistent);
    }

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

    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(' ').trim();
      const isAdminNow = !!user.isAdmin || user.name === 'admin';

      if (cmd === 'ban') {
        if (!isAdminNow) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /ban ニックネームかplayerId' }); return; }
        let targetId = findUserIdByName(arg);
        if (!targetId && persistent.bans.ids.includes(arg)) {
          socket.emit('systemMsg', { text: `${arg} は既にバンされています` });
          return;
        }
        if (!targetId) targetId = arg;
        // ban
        persistent.bans.ids.push(targetId);
        if (persistent.users[targetId] && persistent.users[targetId].name) {
          persistent.bans.names.push(persistent.users[targetId].name);
        }
        const info = connected.get(targetId);
        if (info && info.socketId) {
          io.to(info.socketId).emit('banned', { reason: `Banned by ${user.name}` });
          io.sockets.sockets.get(info.socketId)?.disconnect(true);
        }
        io.emit('systemMsg', { text: `${arg} was banned by ${user.name}` });
        saveData(persistent);
        broadcastPresence();
        broadcastRanking();
        return;
      }

      if (cmd === 'bro') {
        if (!isAdminNow) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /bro ニックネームかplayerId' }); return; }
        // remove name ban
        persistent.bans.names = persistent.bans.names.filter(n => n !== arg);
        // remove ids that match name
        for (const pid in persistent.users) {
          if (persistent.users[pid].name === arg) {
            persistent.bans.ids = persistent.bans.ids.filter(x => x !== pid);
          }
        }
        saveData(persistent);
        io.emit('systemMsg', { text: `${arg} has been unbanned by ${user.name}` });
        broadcastPresence();
        broadcastRanking();
        return;
      }

      socket.emit('systemMsg', { text: `Unknown command: /${cmd}` });
      return;
    }

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

  // GIFT: payload { to, type: 'gold'|'item', amount?, itemId? }
  socket.on('gift', (payload) => {
    const pid = socketsById.get(socket.id);
    if (!pid) return socket.emit('systemMsg', { text:'送信者が不明です' });
    const sender = persistent.users[pid];
    if (!sender) return socket.emit('systemMsg', { text:'送信者が見つかりません' });

    const { to, type } = payload || {};
    if (!to || !type) return socket.emit('systemMsg', { text:'不正なリクエスト' });

    // server-side validation: sender must have enough gold (total - spent)
    const senderGold = (sender.total || 0) - (sender.spent || 0);
    if (type === 'gold') {
      const amount = Number(payload.amount || 0);
      if (!amount || amount <= 0) return socket.emit('systemMsg', { text:'無効な金額' });
      if (senderGold < amount) return socket.emit('systemMsg', { text:'所持金が足りません' });

      // deduct from sender as spent (represents transfer)
      sender.spent = (sender.spent || 0) + amount;
      // apply gift
      const res = applyGift({ fromId: pid, fromName: sender.name, to, type:'gold', amount });
      saveData(persistent);
      broadcastPresence();
      broadcastRanking();
      if (res.delivered) {
        io.emit('systemMsg', { text: `${sender.name} gifted ${amount} Gold to ${to}` });
        socket.emit('systemMsg', { text: 'ギフトを送信しました' });
      } else {
        socket.emit('systemMsg', { text: '相手が見つからないためオフラインとして保存しました' });
      }
      return;
    }

    if (type === 'item') {
      const itemId = payload.itemId;
      if (!itemId) return socket.emit('systemMsg', { text:'アイテムを指定してください' });
      // validate sender has item (if buy gives ownership). For simplicity assume sender can gift even without owning (or require spending price)
      // Here we treat item gift as costing price if given (but client already deducted sender spent). Server will not check ownership, but will record item in recipient ownership.
      // If you want to require sender to own item, implement check here.
      const res = applyGift({ fromId: pid, fromName: sender.name, to, type:'item', itemId });
      saveData(persistent);
      broadcastPresence();
      broadcastRanking();
      if (res.delivered) {
        io.emit('systemMsg', { text: `${sender.name} gifted ${itemId} to ${to}` });
        socket.emit('systemMsg', { text: 'ギフトを送信しました' });
      } else {
        socket.emit('systemMsg', { text: '相手が見つからないためオフラインとして保存しました' });
      }
      return;
    }

    socket.emit('systemMsg', { text: 'Unknown gift type' });
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
