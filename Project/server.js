// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const DATA_FILE = path.join(__dirname, 'data.json');
const ITEM_DEF_FILE = path.join(__dirname, 'data', 'item-definitions.json');
const FUSION_RECIPES_FILE = path.join(__dirname, 'data', 'fusion-recipes.json');
const PORT = process.env.PORT || 3000;

function loadJson(filePath){
  try{
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}
function loadData(){
  try{
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  }catch(e){
    return { users: {}, bans: { ids: [], names: [] }, pendingGifts: {} };
  }
}
function saveData(data){
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }catch(e){
    console.error('Failed to save data', e);
  }
}

// load item definitions and fusion recipes (optional)
const itemDefsRaw = loadJson(ITEM_DEF_FILE);
const fusionRecipesRaw = loadJson(FUSION_RECIPES_FILE);
const ITEM_DEFS = (itemDefsRaw && itemDefsRaw.items) ? itemDefsRaw.items : {};
const FUSION_RECIPES = (fusionRecipesRaw && fusionRecipesRaw.recipes) ? fusionRecipesRaw.recipes : [];

// build price map from item defs (used for fusion cost calc)
const SHOP_PRICES = {};
for (const k in ITEM_DEFS) {
  SHOP_PRICES[k] = Number(ITEM_DEFS[k].price || 0);
}

const persistent = loadData();
persistent.users = persistent.users || {};
persistent.bans = persistent.bans || { ids: [], names: [] };
persistent.pendingGifts = persistent.pendingGifts || {};
// ensure persistent.itemDefinitions exists (optional cache)
persistent.itemDefinitions = persistent.itemDefinitions || ITEM_DEFS;

// helper: normalized pair key (order independent)
function pairKey(a,b){
  return [a,b].slice().sort().join('::');
}

// build recipe map for fast lookup
const recipeMap = new Map();
FUSION_RECIPES.forEach(r => {
  if (!r || !r.pair || !r.out) return;
  const key = pairKey(r.pair[0], r.pair[1]);
  recipeMap.set(key, r.out);
});

// auto-generate fused id sequence helper
function genFusedId(){
  const id = 'fused_' + Math.random().toString(36).slice(2,9);
  return id;
}

// basic auto fusion algorithm (returns itemDefinition object)
function autoFuseDefinition(aDef, bDef){
  const aPower = Number(aDef.basePower || 0);
  const bPower = Number(bDef.basePower || 0);
  const newPower = Math.floor(aPower * 0.6 + bPower * 0.6);
  const newId = genFusedId();
  const newTitle = `${aDef.title.split(' ')[0]}-${bDef.title.split(' ')[0]} Fusion`;
  const newDesc = `Auto-fused from ${aDef.title} + ${bDef.title}`;
  const tags = Array.from(new Set([...(aDef.tags||[]), ...(bDef.tags||[]), 'fusion']));
  return {
    id: newId,
    title: newTitle,
    type: aDef.type || bDef.type || 'hybrid',
    desc: newDesc,
    basePower: newPower,
    price: Math.ceil(((Number(aDef.price||0) + Number(bDef.price||0)) * 1.2) + 100),
    tags
  };
}

// apply fusion: verifies owner, cost, consumes inputs, creates output, persists and notifies
function applyFusion({ userId, itemAId, itemBId }){
  if (!userId || !itemAId || !itemBId) return { ok:false, reason:'invalid' };
  const user = persistent.users[userId];
  if (!user) return { ok:false, reason:'no_user' };

  user.ownedItems = user.ownedItems || {};
  const hasA = !!user.ownedItems[itemAId];
  const hasB = !!user.ownedItems[itemBId];

  if (!hasA || !hasB) return { ok:false, reason:'not_owned' };

  // determine recipe: check defined recipes first
  const key = pairKey(itemAId, itemBId);
  let outDef = null;
  if (recipeMap.has(key)) {
    outDef = recipeMap.get(key);
    // ensure price present
    outDef.price = outDef.price || SHOP_PRICES[outDef.id] || 0;
  } else {
    // auto fuse using item definitions if available
    const aDef = persistent.itemDefinitions[itemAId] || ITEM_DEFS[itemAId] || { id:itemAId, title:itemAId, price: SHOP_PRICES[itemAId]||0, basePower:0, tags:[] };
    const bDef = persistent.itemDefinitions[itemBId] || ITEM_DEFS[itemBId] || { id:itemBId, title:itemBId, price: SHOP_PRICES[itemBId]||0, basePower:0, tags:[] };
    outDef = autoFuseDefinition(aDef, bDef);
  }

  // calculate fusion cost: default = ceil((priceA + priceB) * 1.2) + 100
  const priceA = Number(SHOP_PRICES[itemAId] || (persistent.itemDefinitions[itemAId] && persistent.itemDefinitions[itemAId].price) || 0);
  const priceB = Number(SHOP_PRICES[itemBId] || (persistent.itemDefinitions[itemBId] && persistent.itemDefinitions[itemBId].price) || 0);
  const fusionCost = Math.ceil((priceA + priceB) * 1.2) + 100;

  // verify user has enough gold (gold = total - spent)
  const userGold = (user.total || 0) - (user.spent || 0);
  if (userGold < fusionCost) return { ok:false, reason:'not_enough_gold', required: fusionCost };

  // deduct cost
  user.spent = (user.spent || 0) + fusionCost;

  // consume items (remove ownedItems entries)
  delete user.ownedItems[itemAId];
  delete user.ownedItems[itemBId];

  // determine outId and ensure persistent.itemDefinitions knows about it
  let outId = outDef.id || genFusedId();
  // if outDef came from recipe and used a static id (like fused001), keep it; otherwise ensure unique generated id
  if (!outDef.id || outDef.id.startsWith('fused_')) {
    outId = outDef.id || genFusedId();
    outDef.id = outId;
  }

  // add to item definitions store if not exists
  persistent.itemDefinitions = persistent.itemDefinitions || {};
  if (!persistent.itemDefinitions[outId]) {
    persistent.itemDefinitions[outId] = Object.assign({}, outDef);
  }

  // give output to user
  user.ownedItems[outId] = true;

  // record fusion history (optional)
  persistent.fusionLog = persistent.fusionLog || [];
  persistent.fusionLog.push({ ts: Date.now(), userId, inputs: [itemAId, itemBId], output: outId, cost: fusionCost });

  saveData(persistent);

  // notify user and others
  const info = connected.get(userId);
  if (info && info.socketId) {
    io.to(info.socketId).emit('fusionResult', { ok:true, output: persistent.itemDefinitions[outId], newGold: (user.total || 0) - (user.spent || 0) });
  }
  io.emit('systemMsg', { text: `${user.name} fused items and obtained ${persistent.itemDefinitions[outId].title}` });

  // return result
  return { ok:true, output: persistent.itemDefinitions[outId], cost: fusionCost };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const socketsById = new Map(); // socket.id -> playerId
const connected = new Map();   // playerId -> { socketId, lastSeen }

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

// helper find user id by name
function findUserIdByName(name){
  if (!name) return null;
  for (const pid in persistent.users){
    if (persistent.users[pid].name === name) return pid;
  }
  return null;
}

// gift apply (reuses earlier logic but kept concise)
function applyGift({ fromId, fromName, to, type, itemId, amount }){
  let targetId = to && persistent.users[to] ? to : null;
  if (!targetId) targetId = findUserIdByName(to);
  if (!targetId) {
    persistent.pendingGifts = persistent.pendingGifts || {};
    persistent.pendingGifts[to] = persistent.pendingGifts[to] || [];
    persistent.pendingGifts[to].push({ fromName, type, itemId, amount, ts: Date.now() });
    saveData(persistent);
    return { ok:true, delivered:false, reason:'stored_offline' };
  }
  const user = persistent.users[targetId] || (persistent.users[targetId] = { id: targetId, name: to, icon:'assets/images/mineral.png', total:0, spent:0, isAdmin:false });
  if (type === 'gold') {
    user.total = (user.total || 0) + Number(amount || 0);
    saveData(persistent);
    const info = connected.get(targetId);
    if (info && info.socketId) io.to(info.socketId).emit('giftReceived', { fromName, type:'gold', amount });
    return { ok:true, delivered:true, targetId };
  } else if (type === 'item') {
    user.ownedItems = user.ownedItems || {};
    if (user.ownedItems[itemId]) {
      persistent.pendingGifts = persistent.pendingGifts || {};
      persistent.pendingGifts[user.name] = persistent.pendingGifts[user.name] || [];
      persistent.pendingGifts[user.name].push({ fromName, type, itemId, amount:0, ts: Date.now() });
      saveData(persistent);
      return { ok:true, delivered:false, reason:'already_owned_stored' };
    }
    user.ownedItems[itemId] = true;
    saveData(persistent);
    const info = connected.get(targetId);
    if (info && info.socketId) io.to(info.socketId).emit('giftReceived', { fromName, type:'item', itemId, itemTitle: itemId });
    return { ok:true, delivered:true, targetId };
  }
  return { ok:false, reason:'unknown_type' };
}

io.on('connection', (socket) => {
  socket.on('join', (payload) => {
    const { id, name, icon, total = 0, spent = 0 } = payload || {};
    if (!id) { socket.emit('joinError', { reason: 'missing id' }); return; }

    if (isBannedId(id) || isBannedName(name)) {
      socket.emit('banned', { reason: 'You are banned' });
      socket.disconnect(true);
      return;
    }

    if (!persistent.users[id]) {
      persistent.users[id] = { id, name, icon: icon || 'assets/images/mineral.png', total: Number(total)||0, spent: Number(spent)||0, isAdmin:false, ownedItems: {} };
    } else {
      persistent.users[id].total = Math.max(persistent.users[id].total || 0, Number(total) || persistent.users[id].total || 0);
      persistent.users[id].spent = Math.max(persistent.users[id].spent || 0, Number(spent) || persistent.users[id].spent || 0);
      if (name && name !== persistent.users[id].name) {
        if (nameInUse(name, id)) { socket.emit('nameTaken', { suggested: suggestName(name) }); return; }
        else persistent.users[id].name = name;
      }
      if (icon) persistent.users[id].icon = icon;
      persistent.users[id].ownedItems = persistent.users[id].ownedItems || {};
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
    const pid = socketsById.get(socket.id); if (!pid) return;
    const user = persistent.users[pid]; if (!user) return;
    const text = String(msg.text || '').trim(); if (!text) return;

    if (text.startsWith('/')) {
      const parts = text.slice(1).split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(' ').trim();
      const isAdminNow = !!user.isAdmin || user.name === 'admin';

      if (cmd === 'ban') {
        if (!isAdminNow) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /ban ニックネームかplayerId' }); return; }
        let targetId = findUserIdByName(arg);
        if (!targetId && persistent.bans.ids.includes(arg)) { socket.emit('systemMsg', { text: `${arg} は既にバンされています` }); return; }
        if (!targetId) targetId = arg;
        persistent.bans.ids.push(targetId);
        if (persistent.users[targetId] && persistent.users[targetId].name) persistent.bans.names.push(persistent.users[targetId].name);
        const info = connected.get(targetId);
        if (info && info.socketId) { io.to(info.socketId).emit('banned', { reason: `Banned by ${user.name}` }); io.sockets.sockets.get(info.socketId)?.disconnect(true); }
        io.emit('systemMsg', { text: `${arg} was banned by ${user.name}` });
        saveData(persistent); broadcastPresence(); broadcastRanking();
        return;
      }

      if (cmd === 'bro') {
        if (!isAdminNow) { socket.emit('systemMsg', { text:'権限がありません' }); return; }
        if (!arg) { socket.emit('systemMsg', { text:'対象を指定してください: /bro ニックネームかplayerId' }); return; }
        persistent.bans.names = persistent.bans.names.filter(n => n !== arg);
        for (const pid in persistent.users) if (persistent.users[pid].name === arg) persistent.bans.ids = persistent.bans.ids.filter(x => x !== pid);
        saveData(persistent);
        io.emit('systemMsg', { text: `${arg} has been unbanned by ${user.name}` });
        broadcastPresence(); broadcastRanking();
        return;
      }

      socket.emit('systemMsg', { text: `Unknown command: /${cmd}` });
      return;
    }

    io.emit('chat', { name: user.name, icon: user.icon, text, ts: Date.now() });
  });

  socket.on('click', (payload) => {
    const pid = socketsById.get(socket.id); if (!pid) return;
    const user = persistent.users[pid]; if (!user) return;
    const delta = Number(payload.delta || 0); if (!delta) return;
    if (delta > 1000) return;
    user.total = (user.total || 0) + delta;
    io.emit('clickEvent', { id: pid, name: user.name, delta, total: user.total });
    broadcastRanking(); saveData(persistent);
  });

  socket.on('buy', (payload) => {
    const pid = socketsById.get(socket.id); if (!pid) return;
    const user = persistent.users[pid]; if (!user) return;
    const itemId = payload && payload.itemId;
    const price = Number(payload && payload.price) || 0;
    const gold = (user.total || 0) - (user.spent || 0);
    if (gold < price) { socket.emit('buyResult', { ok:false, reason:'not_enough' }); return; }
    user.ownedItems = user.ownedItems || {};
    if (user.ownedItems[itemId]) { socket.emit('buyResult', { ok:false, reason:'already_owned' }); return; }
    user.spent = (user.spent || 0) + price;
    user.ownedItems[itemId] = true;
    io.emit('systemMsg', { text: `${user.name} bought ${itemId}` });
    saveData(persistent); broadcastPresence(); broadcastRanking(); socket.emit('buyResult', { ok:true, user });
  });

  // gift: existing handler
  socket.on('gift', (payload) => {
    const pid = socketsById.get(socket.id); if (!pid) return socket.emit('systemMsg', { text:'送信者が不明です' });
    const sender = persistent.users[pid]; if (!sender) return socket.emit('systemMsg', { text:'送信者が見つかりません' });

    const { to, type } = payload || {};
    if (!to || !type) return socket.emit('systemMsg', { text:'不正なリクエスト' });

    const senderGold = (sender.total || 0) - (sender.spent || 0);

    if (type === 'gold') {
      const amount = Number(payload.amount || 0);
      if (!amount || amount <= 0) return socket.emit('systemMsg', { text:'無効な金額' });
      if (senderGold < amount) return socket.emit('systemMsg', { text:'所持金が足りません' });
      sender.spent = (sender.spent || 0) + amount;
      const res = applyGift({ fromId: pid, fromName: sender.name, to, type:'gold', amount });
      saveData(persistent); broadcastPresence(); broadcastRanking();
      if (res.delivered) { io.emit('systemMsg', { text: `${sender.name} gifted ${amount} Gold to ${to}` }); socket.emit('systemMsg', { text: 'ギフトを送信しました' }); }
      else { socket.emit('systemMsg', { text: '相手が見つからないためオフラインとして保存しました' }); }
      return;
    }

    if (type === 'item') {
      const itemId = payload.itemId;
      if (!itemId) return socket.emit('systemMsg', { text:'アイテムを指定してください' });
      // cost for gifting items: double the original price
      const itemPrice = SHOP_PRICES[itemId] || (persistent.itemDefinitions[itemId] && persistent.itemDefinitions[itemId].price) || 0;
      if (typeof itemPrice === 'undefined') return socket.emit('systemMsg', { text:'指定アイテムの価格が見つかりません' });
      const cost = itemPrice * 2;
      if (senderGold < cost) return socket.emit('systemMsg', { text: `ギフト送信には ${cost} Gold が必要です（所持金不足）` });
      sender.spent = (sender.spent || 0) + cost;
      const res = applyGift({ fromId: pid, fromName: sender.name, to, type:'item', itemId });
      saveData(persistent); broadcastPresence(); broadcastRanking();
      if (res.delivered) { io.emit('systemMsg', { text: `${sender.name} gifted ${itemId} to ${to} (cost ${cost})` }); socket.emit('systemMsg', { text: 'ギフトを送信しました' }); }
      else { socket.emit('systemMsg', { text: '相手が見つからないためオフラインとして保存しました' }); }
      return;
    }
    socket.emit('systemMsg', { text: 'Unknown gift type' });
  });

  // FUSE: payload { itemAId, itemBId }
  socket.on('fuse', (payload) => {
    const pid = socketsById.get(socket.id); if (!pid) return socket.emit('systemMsg', { text:'送信者が不明です' });
    const user = persistent.users[pid]; if (!user) return socket.emit('systemMsg', { text:'ユーザーが見つかりません' });
    const itemAId = payload && payload.itemAId;
    const itemBId = payload && payload.itemBId;
    if (!itemAId || !itemBId) return socket.emit('systemMsg', { text:'合体する2つのアイテムを指定してください' });

    const result = applyFusion({ userId: pid, itemAId, itemBId });
    if (!result.ok) {
      if (result.reason === 'not_owned') return socket.emit('systemMsg', { text:'指定したアイテムを所持していません' });
      if (result.reason === 'not_enough_gold') return socket.emit('systemMsg', { text:`合体には ${result.required} Gold が必要です` });
      return socket.emit('systemMsg', { text:'合体に失敗しました' });
    }
    // success already notified inside applyFusion; send direct ack too
    socket.emit('fusionAck', { ok:true, output: result.output, cost: result.cost });
  });

  socket.on('changeName', ({ name }) => {
    const pid = socketsById.get(socket.id); if (!pid) return;
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
