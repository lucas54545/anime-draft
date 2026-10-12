'use strict';
// Anime Draft Battle — multiplayer server. No external dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const ROSTER = require('./characters.json');
const CHAR = Object.fromEntries(ROSTER.map(c => [c.id, c]));
const ATTRS = ['Força', 'Resistência', 'QI', 'Habilidade', 'Velocidade'];
const users = new Map();    // token -> {token,name,conn,roomId}
const rooms = new Map();    // id -> active room
const invites = new Map();  // id -> invitation
const clients = new Set();
const id = () => crypto.randomBytes(10).toString('hex');
const publicFighter = c => ({id: c.id, name: c.name, anime: c.anime, emoji: c.emoji});
// Os poderes aparecem apenas depois que o personagem é atribuído ao jogador.
const acquiredFighter = c => ({...publicFighter(c), stats: c.stats, power: c.stats.reduce((sum, n) => sum + n, 0)});

function send(ws, data) {
  if (!ws || ws.closed) return;
  try { sendFrame(ws.socket, JSON.stringify(data)); } catch { closeWS(ws); }
}
function issue(user, data) { if (user && user.conn) send(user.conn, data); }
function error(ws, message) { send(ws, {type: 'error', message}); }
function userFor(ws) { return ws.user && users.get(ws.user.token) === ws.user ? ws.user : null; }
function whoOnline() {
  return [...users.values()].filter(u => u.conn).map(u => ({name:u.name, busy:!!u.roomId}));
}
function presence() { const payload={type:'presence',players:whoOnline()}; for (const u of users.values()) issue(u,payload); }
function syncRoom(room) { for (let i=0;i<2;i++) issue(room.players[i], roomView(room,i)); }
function roomView(room, idx) {
  return {
    type:'room', roomId:room.id, mode:room.mode, phase:room.phase, round:room.round,
    attribute: ATTRS[room.round] || '',
    names:room.players.map((u,i)=>u?.name || (i===1?'BOT':'Jogador')),
    you:idx, budgets:room.budgets,
    teams:room.teams.map(t=>t.map(c=>c?acquiredFighter(CHAR[c]):null)),
    offered:room.offer.map(c=>publicFighter(CHAR[c])),
    submitted:room.bids.map(b=>b!==null),
    result:room.result || null
  };
}
function chooseOffer(room) {
  const used=new Set(room.teams.flat().filter(Boolean));
  const available=ROSTER.filter(x=>!used.has(x.id));
  const random=arr=>arr[Math.floor(Math.random()*arr.length)];
  // Vary power level, including underdogs. The two choices are never identical.
  const all=[...available].sort(()=>Math.random()-.5);
  let primary=random(available);
  if (Math.random()<.27) {const weak=available.filter(x=>x.stats.reduce((a,b)=>a+b,0)<290); if(weak.length)primary=random(weak);}
  const other=all.find(x=>x.id!==primary.id) || available.find(x=>x.id!==primary.id);
  room.offer=[primary.id,other.id];
  room.bids=[null,null]; room.result=null; room.phase='auction';
}
function makeRoom(p1,p2,mode) {
  const room={id:id(), players:[p1,p2], mode, round:0, phase:'auction', budgets:[20,20], teams:[[],[]], offer:[], bids:[null,null],result:null, timer:null};
  rooms.set(room.id,room);
  p1.roomId=room.id; if(p2)p2.roomId=room.id;
  chooseOffer(room); syncRoom(room); presence();
  if(mode==='bot') scheduleBot(room);
  return room;
}
function scheduleBot(room) {
  if(room.mode!=='bot' || room.phase!=='auction')return;
  room.timer=setTimeout(()=>{
    if(!rooms.has(room.id)||room.phase!=='auction'||room.bids[1]!==null)return;
    const strength=CHAR[room.offer[0]].stats[room.round];
    const bid = Math.min(room.budgets[1],Math.max(0,Math.floor(strength/26+Math.random()*3-1)));
    room.bids[1]=bid;
    if(room.bids[0]!==null)resolveRound(room);else syncRoom(room);
  }, 1100+Math.floor(Math.random()*1300));
}
function resolveRound(room) {
  if(room.phase!=='auction'||room.bids.some(b=>b===null))return;
  room.phase='reveal';
  const [a,b]=room.bids;
  const winner=a===b ? (room.round%2) : a>b?0:1;
  const loser=1-winner;
  room.budgets[winner]-=room.bids[winner];
  room.teams[winner].push(room.offer[0]);
  room.teams[loser].push(room.offer[1]);
  room.result={winner, price:room.bids[winner], offers:room.offer.map(x=>acquiredFighter(CHAR[x])), bids:[a,b]};
  syncRoom(room);
  room.timer=setTimeout(()=>{
    if(!rooms.has(room.id))return;
    room.round++;
    if(room.round<5) { chooseOffer(room);syncRoom(room);scheduleBot(room); }
    else finishBattle(room);
  }, Number(process.env.ROUND_DELAY_MS || 3300));
}
function finishBattle(room) {
  room.phase='battle';
  const scores=[0,0], details=[];
  for(let i=0;i<5;i++){
    const p0=CHAR[room.teams[0][i]],p1=CHAR[room.teams[1][i]];
    let s0=p0.stats[i],s1=p1.stats[i];
    const winner=s0===s1?-1:s0>s1?0:1;
    if(winner>=0)scores[winner]++;
    details.push({attribute:ATTRS[i],fighters:[{...publicFighter(p0),value:s0},{...publicFighter(p1),value:s1}],winner});
  }
  const totals=[0,1].map(side=>room.teams[side].reduce((sum,c,i)=>sum+CHAR[c].stats[i],0));
  const winner=scores[0]===scores[1]?(totals[0]===totals[1]?-1:totals[0]>totals[1]?0:1):scores[0]>scores[1]?0:1;
  const payload={type:'battle',names:[room.players[0]?.name||'Jogador 1',room.players[1]?.name||'BOT'],scores,totals,winner,details,budgets:room.budgets,roomId:room.id, startAt:Date.now()+1400};
  for (const u of room.players) issue(u,payload);
  room.battle=payload;
  presence();
}
function cleanRoom(room) {
  if (!room) return;
  clearTimeout(room.timer);
  rooms.delete(room.id);
  for (const u of room.players) if(u&&u.roomId===room.id){u.roomId=null;issue(u,{type:'left_room'});}
  presence();
}
function findByName(name) {return [...users.values()].find(u=>u.name.toLowerCase()===String(name).trim().toLowerCase()&&u.conn);}
function clearPending(user) { for(const [key,inv] of invites)if(inv.to===user.token||inv.from===user.token)invites.delete(key); }
function message(ws, data) {
  if(!data || typeof data!=='object'||Array.isArray(data))return;
  const kind=data.type;
  if(kind==='login') {
    const name=String(data.name||'').trim().replace(/\s+/g,' ');
    const token=String(data.token||'');
    if(name.length<2||name.length>20||! /^[\p{L}\p{N} _.-]+$/u.test(name))return error(ws,'Escolha um nome com 2 a 20 letras/números.');
    if(!/^[a-f0-9]{32}$/.test(token))return error(ws,'Token de sessão inválido. Atualize a página.');
    const existing=findByName(name);
    if(existing && existing.token!==token)return error(ws,'Esse nome já está sendo usado. Escolha outro.');
    let user=users.get(token);
    if(user&&user.conn&&user.conn!==ws){send(user.conn,{type:'replaced'});closeWS(user.conn);}
    if(user && user.roomId && user.name!==name)return error(ws,'Termine sua partida antes de mudar seu nome.');
    if(user){user.name=name;user.conn=ws;}
    else {user={token,name,conn:ws,roomId:null}; users.set(token,user);}
    ws.user=user;
    send(ws,{type:'welcome',name,online:whoOnline()});
    if(user.roomId){const r=rooms.get(user.roomId); if(r){ const side=r.players.findIndex(p=>p?.token===token);if(side>=0){if(r.phase==='battle')send(ws,r.battle);else send(ws,roomView(r,side));} }else user.roomId=null;}
    presence();return;
  }
  const user=userFor(ws);if(!user)return error(ws,'Digite seu nome para entrar.');
  if(kind==='invite'){
    if(user.roomId)return error(ws,'Você já está em uma batalha.');
    const recipient=findByName(data.to);
    if(!recipient)return error(ws,'Amigo não encontrado. Ele precisa estar online com esse nome.');
    if(recipient.token===user.token)return error(ws,'Você não pode desafiar a si mesmo.');
    if(recipient.roomId)return error(ws,'Esse amigo já está em uma batalha.');
    const inv={id:id(),from:user.token,to:recipient.token,expires:Date.now()+120000};
    invites.set(inv.id,inv);issue(recipient,{type:'invite_received',id:inv.id,from:user.name});
    issue(user,{type:'invite_sent',to:recipient.name});return;
  }
  if(kind==='respond'){
    const inv=invites.get(String(data.id||''));
    if(!inv||inv.to!==user.token||inv.expires<Date.now())return error(ws,'Convite não encontrado ou expirado.');
    invites.delete(inv.id);
    const challenger=users.get(inv.from);
    if(data.accept!==true){issue(challenger,{type:'invite_declined',from:user.name});return;}
    if(!challenger?.conn||challenger.roomId||user.roomId)return error(ws,'Um dos jogadores não está disponível.');
    clearPending(user);clearPending(challenger);
    makeRoom(challenger,user,'online');return;
  }
  if(kind==='bot'){
    if(user.roomId)return error(ws,'Saia da partida atual antes de começar outra.');
    makeRoom(user,null,'bot');return;
  }
  if(kind==='bid'){
    const room=rooms.get(user.roomId);
    if(!room||room.phase!=='auction')return error(ws,'Não há leilão ativo neste momento.');
    const idx=room.players.findIndex(p=>p?.token===user.token);
    if(idx<0||room.bids[idx]!==null)return error(ws,'Você já deu seu lance nesta rodada.');
    const amount=Number(data.amount);
    if(!Number.isInteger(amount)||amount<0||amount>room.budgets[idx])return error(ws,'Lance inválido. Seu saldo é '+room.budgets[idx]+'.');
    room.bids[idx]=amount;
    if(room.bids.every(x=>x!==null))resolveRound(room);else syncRoom(room);
    return;
  }
  if(kind==='leave'){
    const room=rooms.get(user.roomId);if(room)cleanRoom(room);
    return;
  }
}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/characters') {res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public,max-age=3600'});res.end(JSON.stringify(ROSTER.map(publicFighter)));return;}
  if(pathname==='/health') {res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
  const file=pathname==='/'?'index.html':pathname.slice(1);
  const resolved=path.resolve(ROOT,file);
  if(!resolved.startsWith(ROOT+path.sep) && resolved!==path.join(ROOT,'index.html')){res.writeHead(403);res.end();return;}
  fs.readFile(resolved,(err,buffer)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain'});res.end('404 - Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(buffer);
  });
});

// Small RFC6455 WebSocket server — single-frame JSON messages, masking required.
function sendFrame(socket,str,opcode=1){
  if(socket.destroyed)return;
  const buf=Buffer.from(str);let header;
  if(buf.length<126){header=Buffer.from([0x80|opcode,buf.length]);}
  else if(buf.length<65536){header=Buffer.alloc(4);header[0]=0x80|opcode;header[1]=126;header.writeUInt16BE(buf.length,2);}
  else{header=Buffer.alloc(10);header[0]=0x80|opcode;header[1]=127;header.writeBigUInt64BE(BigInt(buf.length),2);}
  socket.write(Buffer.concat([header,buf]));
}
function closeWS(ws){
  if(!ws||ws.closed)return;ws.closed=true;clients.delete(ws);
  if(ws.user && ws.user.conn===ws){ws.user.conn=null;presence();}
  try{ws.socket.end();}catch{}
}
function parseFrames(ws,chunk){
  ws.buffer=Buffer.concat([ws.buffer,chunk]);
  while(ws.buffer.length>=2){
    const b0=ws.buffer[0],b1=ws.buffer[1], opcode=b0&15, fin=!!(b0&0x80);
    let offset=2,len=b1&127;
    if(len===126){if(ws.buffer.length<4)return;len=ws.buffer.readUInt16BE(2);offset=4;}
    else if(len===127){if(ws.buffer.length<10)return;const n=ws.buffer.readBigUInt64BE(2);if(n>BigInt(8192)){closeWS(ws);return;}len=Number(n);offset=10;}
    if(!fin||!(b1&0x80)||len>8192){closeWS(ws);return;}
    if(ws.buffer.length<offset+4+len)return;
    const mask=ws.buffer.subarray(offset,offset+4),payload=Buffer.from(ws.buffer.subarray(offset+4,offset+4+len));
    ws.buffer=ws.buffer.subarray(offset+4+len);
    for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
    if(opcode===8){closeWS(ws);return;}
    if(opcode===9){sendFrame(ws.socket,payload.toString('utf8'),10);continue;}
    if(opcode!==1){closeWS(ws);return;}
    try{message(ws,JSON.parse(payload.toString('utf8')));}catch{error(ws,'Mensagem inválida.');}
    if(ws.closed)return;
  }
  if(ws.buffer.length>9000)closeWS(ws);
}
server.on('upgrade',(req,socket,head)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/ws'){socket.destroy();return;}
  const key=req.headers['sec-websocket-key'];
  if(typeof key!=='string'||!/^[a-zA-Z0-9+/]{22}==$/.test(key)){socket.destroy();return;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const ws={socket,buffer:Buffer.alloc(0),user:null,closed:false};clients.add(ws);
  socket.on('data',c=>parseFrames(ws,c));socket.on('error',()=>closeWS(ws));socket.on('end',()=>closeWS(ws));socket.on('close',()=>closeWS(ws));
  if(head.length)parseFrames(ws,head);
  send(ws,{type:'connected'});
});
setInterval(()=>{
  for(const [key,inv] of invites)if(inv.expires<Date.now())invites.delete(key);
  for(const [token,u] of users)if(!u.conn && !u.roomId)users.delete(token);
},30000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`Anime Draft Battle pronto: http://localhost:${PORT}`));
