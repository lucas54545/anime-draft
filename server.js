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
    type:'room',roomId:room.id,mode:room.mode,phase:room.phase,round:room.round,
    names:room.players.map((u,i)=>u?.name||(i===1?'BOT':'Jogador')),
    you:idx,budgets:room.budgets,
    teams:room.teams.map(t=>t.map(c=>c?acquiredFighter(CHAR[c]):null)),
    offered:room.offer.map(c=>publicFighter(CHAR[c])),
    currentBid:room.currentBid,leader:room.leader,turn:room.turn,deadline:room.deadline,
    minimum:room.currentBid+1,placer:room.placer,
    pending:room.pending?publicFighter(CHAR[room.pending]):null,
    result:room.result||null
  };
}
const countTeam=(room,side)=>room.teams[side].filter(Boolean).length;
const canBuy=(room,side)=>countTeam(room,side)<5;
const freeSlots=(room,side)=>room.teams[side].map((id,i)=>id===null?i:-1).filter(i=>i>=0);
function chooseOffer(room){
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  const used=new Set(room.teams.flat().filter(Boolean));
  const available=ROSTER.filter(x=>!used.has(x.id));
  if(!available.length){finishBattle(room);return;}
  const random=arr=>arr[Math.floor(Math.random()*arr.length)];
  let primary=random(available);
  if(Math.random()<.27){
    const weak=available.filter(x=>x.stats.reduce((a,b)=>a+b,0)<290);
    if(weak.length)primary=random(weak);
  }
  room.offer=[primary.id];
  room.currentBid=0;room.leader=-1;
  room.turn=canBuy(room,room.round%2)?room.round%2:1-room.round%2;
  room.deadline=Date.now()+10000;
  room.phase='auction';room.result=null;room.pending=null;room.placer=-1;
  scheduleTurn(room);
}
function makeRoom(p1,p2,mode){
  const room={id:id(),players:[p1,p2],mode,round:0,phase:'auction',budgets:[20,20],
    teams:[Array(5).fill(null),Array(5).fill(null)],offer:[],currentBid:0,leader:-1,turn:0,deadline:0,
    result:null,timer:null,botTimer:null,placer:-1,pending:null,pendingPrice:0,pendingReason:''};
  rooms.set(room.id,room);p1.roomId=room.id;if(p2)p2.roomId=room.id;
  chooseOffer(room);syncRoom(room);presence();return room;
}
function scheduleTurn(room){
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  if(room.phase!=='auction')return;
  const expectedRound=room.round,expectedBid=room.currentBid;
  room.timer=setTimeout(()=>{
    if(!rooms.has(room.id)||room.phase!=='auction'||room.round!==expectedRound||room.currentBid!==expectedBid)return;
    concludeAuction(room,'tempo esgotado');
  },Math.max(1,room.deadline-Date.now())+30);
  if(room.mode==='bot'&&room.turn===1){
    room.botTimer=setTimeout(()=>{
      if(!rooms.has(room.id)||room.phase!=='auction'||room.turn!==1)return;
      const desired=1+Math.floor(Math.random()*6);
      if(room.currentBid+1<=room.budgets[1]&&room.currentBid+1<=desired&&Math.random()<.80)raiseBid(room,1,room.currentBid+1);
      else concludeAuction(room,'bot desistiu');
    },650+Math.floor(Math.random()*1400));
  }
}
function raiseBid(room,side,amount){
  if(room.phase!=='auction'||room.turn!==side||!canBuy(room,side))return false;
  const needed=room.currentBid+1;
  if(!Number.isInteger(amount)||amount!==needed||needed>room.budgets[side]||Date.now()>room.deadline)return false;
  room.currentBid=amount;room.leader=side;room.turn=1-side;room.deadline=Date.now()+10000;
  if(!canBuy(room,room.turn)||room.budgets[room.turn]<room.currentBid+1){concludeAuction(room,'adversário não pode cobrir');return true;}
  scheduleTurn(room);syncRoom(room);return true;
}
function concludeAuction(room,reason){
  if(room.phase!=='auction')return;
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  let winner;
  if(room.leader>=0)winner=room.leader;
  else if(!canBuy(room,room.turn))winner=1-room.turn;
  else if(reason==='jogador desistiu'||reason==='bot desistiu')winner=canBuy(room,1-room.turn)?1-room.turn:room.turn;
  else winner=room.turn;
  if(!canBuy(room,winner))winner=1-winner;
  room.phase='place';room.deadline=0;room.placer=winner;
  room.pending=room.offer[0];room.pendingPrice=room.leader<0?0:room.currentBid;room.pendingReason=reason;
  room.budgets[winner]-=room.pendingPrice;syncRoom(room);
  if(room.mode==='bot'&&winner===1){
    room.botTimer=setTimeout(()=>{
      if(!rooms.has(room.id)||room.phase!=='place'||room.placer!==1)return;
      const slots=freeSlots(room,1);
      if(slots.length)placeCharacter(room,1,slots[Math.floor(Math.random()*slots.length)]);
    },900);
  }
}
function placeCharacter(room,side,slot){
  if(room.phase!=='place'||side!==room.placer||!Number.isInteger(slot)||slot<0||slot>=5||room.teams[side][slot]!==null)return false;
  room.teams[side][slot]=room.pending;
  room.phase='reveal';room.result={winner:side,price:room.pendingPrice,reason:room.pendingReason,
    fighter:acquiredFighter(CHAR[room.pending]),slot};
  room.pending=null;room.placer=-1;syncRoom(room);
  room.timer=setTimeout(()=>{
    if(!rooms.has(room.id)||room.phase!=='reveal')return;
    room.round++;
    if(room.round<10){chooseOffer(room);syncRoom(room);}
    else finishBattle(room);
  },Number(process.env.ROUND_DELAY_MS||3500));
  return true;
}
function finishBattle(room){
  room.phase='battle';
  const scores=[0,0],details=[];
  for(let i=0;i<5;i++){
    const p0=CHAR[room.teams[0][i]],p1=CHAR[room.teams[1][i]];
    if(!p0||!p1)throw new Error('Time incompleto após 10 leilões.');
    const s0=p0.stats[i],s1=p1.stats[i];
    const winner=s0===s1?-1:s0>s1?0:1;
    if(winner>=0)scores[winner]++;
    details.push({attribute:ATTRS[i],fighters:[{...publicFighter(p0),value:s0},{...publicFighter(p1),value:s1}],winner});
  }
  const totals=[0,1].map(side=>room.teams[side].reduce((sum,c,i)=>sum+CHAR[c].stats[i],0));
  const winner=totals[0]===totals[1]?-1:totals[0]>totals[1]?0:1;
  const payload={type:'battle',victoryRule:'total',names:[room.players[0]?.name||'Jogador 1',room.players[1]?.name||'BOT'],
    scores,totals,winner,details,budgets:room.budgets,roomId:room.id,startAt:Date.now()+1400};
  for(const u of room.players)issue(u,payload);
  room.battle=payload;presence();
}
function cleanRoom(room) {
  if (!room) return;
  clearTimeout(room.timer);clearTimeout(room.botTimer);
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
    if(!room||room.phase!=='auction')return error(ws,'Não existe um leilão ativo.');
    const idx=room.players.findIndex(p=>p?.token===user.token);
    if(idx<0||idx!==room.turn)return error(ws,'Espere a sua vez de dar o lance.');
    if(Date.now()>room.deadline){concludeAuction(room,'tempo esgotado');return error(ws,'Os 10 segundos acabaram.');}
    const amount=Number(data.amount);
    if(!raiseBid(room,idx,amount))return error(ws,'Lance inválido. A próxima oferta é '+(room.currentBid+1)+' moeda(s).');
    return;
  }
  if(kind==='pass'){
    const room=rooms.get(user.roomId);
    if(!room||room.phase!=='auction')return error(ws,'Não existe um leilão ativo.');
    const idx=room.players.findIndex(p=>p?.token===user.token);
    if(idx!==room.turn)return error(ws,'Ainda não é sua vez.');
    concludeAuction(room,'jogador desistiu');return;
  }
  if(kind==='place'){
    const room=rooms.get(user.roomId);
    const idx=room?.players.findIndex(p=>p?.token===user.token);
    if(!room||idx<0||!placeCharacter(room,idx,Number(data.slot)))return error(ws,'Escolha uma posição livre do seu time.');
    return;
  }
  if(kind==='leave'){
    const room=rooms.get(user.roomId);if(room)cleanRoom(room);
    return;
  }
}

// Retratos carregados pelo servidor; fontes externas sujeitas à disponibilidade.
const portraitCache=new Map(),portraitPending=new Map();
let lastPhotoLookup=0;
const pictureWords=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
function pictureMatch(name,target){
  const a=pictureWords(name),b=pictureWords(target);
  return b.length?b.filter(x=>a.includes(x)).length/b.length:0;
}
async function pacedPhotoRequest(url,options){
  const delay=Math.max(0,520-(Date.now()-lastPhotoLookup));lastPhotoLookup=Date.now()+delay;
  if(delay)await new Promise(done=>setTimeout(done,delay));
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9500);
  try{return await fetch(url,{...options,signal:controller.signal,headers:{'User-Agent':'AnimeDraftBattle/6.0 (fan game)',...(options?.headers||{})}});}
  finally{clearTimeout(timeout);}
}
async function searchPortrait(person){
  const q=encodeURIComponent(person.name);
  try{
    const res=await pacedPhotoRequest('https://api.jikan.moe/v4/characters?q='+q+'&limit=20');
    if(res.ok){
      const json=await res.json(),items=json.data||[];
      const ranked=items.map(x=>({x,score:pictureMatch(x.name,person.name)})).sort((a,b)=>b.score-a.score);
      const best=ranked[0];
      if(best?.score>=.50){const link=best.x.images?.jpg?.image_url||best.x.images?.webp?.image_url;if(link)return link;}
    }
  }catch(e){console.log('Jikan portrait:',e.message);}
  try{
    const res=await pacedPhotoRequest('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query ($search: String) { Character(search: $search) { name { full native } image { large } } }',variables:{search:person.name}})});
    if(res.ok){const json=await res.json(),c=json.data?.Character;if(c&&pictureMatch(c.name?.full,person.name)>=.5)return c.image?.large;}
  }catch(e){console.log('AniList portrait:',e.message);}
  return null;
}
async function portraitBytes(character){
  const url=await searchPortrait(character);
  if(!url||!/^https:\/\//.test(url))return null;
  try{
    const response=await pacedPhotoRequest(url);
    if(!response.ok)return null;
    const mime=response.headers.get('content-type')||'';
    if(!mime.startsWith('image/'))return null;
    const buffer=Buffer.from(await response.arrayBuffer());
    if(buffer.length>2500000||!buffer.length)return null;
    return {buffer,mime};
  }catch(e){console.log('Photo load:',e.message);return null;}
}
function servePortrait(req,res,person){
  if(!person){res.writeHead(404);res.end();return;}
  const cached=portraitCache.get(person.id);
  if(cached&&Date.now()-cached.time<3600000){
    if(cached.data){res.writeHead(200,{'Content-Type':cached.data.mime,'Cache-Control':'public,max-age=86400'});res.end(cached.data.buffer);}
    else{res.writeHead(404,{'Cache-Control':'public,max-age=90'});res.end();}
    return;
  }
  let work=portraitPending.get(person.id);
  if(!work){work=portraitBytes(person).then(data=>{portraitCache.set(person.id,{data,time:Date.now()});return data;}).finally(()=>portraitPending.delete(person.id));portraitPending.set(person.id,work);}
  work.then(data=>{
    if(res.destroyed)return;
    if(data){res.writeHead(200,{'Content-Type':data.mime,'Cache-Control':'public,max-age=86400'});res.end(data.buffer);}
    else{res.writeHead(404,{'Cache-Control':'public,max-age=90'});res.end();}
  }).catch(()=>{if(!res.destroyed){res.writeHead(502);res.end();}});
}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/portrait/')) {servePortrait(req,res,CHAR[pathname.slice('/api/portrait/'.length)]);return;}
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
