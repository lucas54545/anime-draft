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
const squadLobbies = new Map(); // six-character code -> waiting four-player room
const clients = new Set();
const id = () => crypto.randomBytes(10).toString('hex');
const publicFighter = c => ({id: c.id, name: c.name, anime: c.anime, emoji: c.emoji});
// Os poderes aparecem apenas depois que o personagem é atribuído ao jogador.
const acquiredFighter = c => ({...publicFighter(c), stats: c.stats, power: c.stats.reduce((sum, n) => sum + n, 0), rarity:c.rarity, rating:c.rating});

function send(ws, data) {
  if (!ws || ws.closed) return;
  try { sendFrame(ws.socket, JSON.stringify(data)); } catch { closeWS(ws); }
}
function issue(user, data) { if (user && user.conn) send(user.conn, data); }
function error(ws, message) { send(ws, {type: 'error', message}); }
function userFor(ws) { return ws.user && users.get(ws.user.token) === ws.user ? ws.user : null; }
function whoOnline() {
  return [...users.values()].filter(u => u.conn).map(u => ({name:u.name, busy:!!(u.roomId||u.squadCode)}));
}
function presence() { const payload={type:'presence',players:whoOnline()}; for (const u of users.values()) issue(u,payload); }
function teamNames(room){
  if(room.mode!=='squad')return [room.players[0]?.name||'Jogador 1',room.players[1]?.name||'BOT'];
  return [0,1].map(side=>[room.players[side]?.name,room.players[side+2]?.name].filter(Boolean).join(' + '));
}
function syncRoom(room){
  for(let i=0;i<room.players.length;i++){
    const p=room.players[i];
    if(p)issue(p,roomView(room,room.mode==='squad'?i%2:i));
  }
}
function roomView(room, idx) {
  return {
    type:'room',roomId:room.id,mode:room.mode,phase:room.phase,round:room.round,
    names:teamNames(room),
    members:room.mode==='squad'?room.players.map(p=>p?.name||'Jogador'):null,
    you:idx,budgets:room.budgets,
    teams:room.teams.map(t=>t.map(c=>c?acquiredFighter(CHAR[c]):null)),
    offered:room.offer.map(c=>publicFighter(CHAR[c])),
    currentBid:room.currentBid,leader:room.leader,turn:room.turn,deadline:room.deadline,
    minimum:room.bidMode==='avoid'?room.currentBid-1:room.currentBid+1,
    bidMode:room.bidMode||'neutral',canAvoid:canBuy(room,0)&&canBuy(room,1),placer:room.placer,
    pending:room.pending?publicFighter(CHAR[room.pending]):null,
    history:room.history||[],
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
  // Sorteio por raridade: mistura personagens fracos, intermediários e raríssimos.
  // Nada é revelado sobre a força ou raridade durante o leilão.
  const weights=[['Comum',18],['Raro',30],['Épico',31],['Lendário',15],['Mítico',6]];
  const choices=weights.map(([tier,weight])=>({tier,weight,pool:available.filter(x=>x.rarity===tier)})).filter(x=>x.pool.length);
  const total=choices.reduce((sum,x)=>sum+x.weight,0);
  let roll=Math.random()*total,chosen=choices[choices.length-1];
  for(const tier of choices){roll-=tier.weight;if(roll<0){chosen=tier;break;}}
  const primary=chosen.pool[Math.floor(Math.random()*chosen.pool.length)];
  room.offer=[primary.id];
  room.currentBid=0;room.bidMode=null;room.leader=-1;
  room.turn=canBuy(room,room.round%2)?room.round%2:1-room.round%2;
  room.deadline=Date.now()+10000;
  room.phase='auction';room.result=null;room.pending=null;room.placer=-1;
  scheduleTurn(room);
}
function makeRoom(p1,p2,mode,extraPlayers=[]){
  const room={id:id(),players:mode==='squad'?[p1,p2,...extraPlayers]:[p1,p2],mode,round:0,phase:'auction',budgets:[20,20],
    teams:[Array(5).fill(null),Array(5).fill(null)],offer:[],currentBid:0,bidMode:null,leader:-1,turn:0,deadline:0,
    result:null,timer:null,botTimer:null,placer:-1,pending:null,pendingPrice:0,pendingAvoider:-1,pendingReason:'',history:[],rematchVotes:new Set()};
  rooms.set(room.id,room);
  for(const p of room.players)if(p){p.roomId=room.id;p.squadCode=null;}
  chooseOffer(room);syncRoom(room);presence();return room;
}
// Sem lance inicial não existe "pegar grátis": o cronômetro apenas passa a vez.
function expireAuctionTurn(room){
  if(!rooms.has(room.id)||room.phase!=='auction')return;
  if(room.bidMode!==null){concludeAuction(room,'tempo esgotado');return;}
  const other=1-room.turn;
  if(canBuy(room,other)&&room.budgets[other]>=1)room.turn=other;
  else if(!(canBuy(room,room.turn)&&room.budgets[room.turn]>=1)){
    // Exceção necessária: ninguém tem moedas ou vaga para iniciar o leilão.
    concludeAuction(room,'nenhum lance possível');return;
  }
  room.deadline=Date.now()+10000;
  scheduleTurn(room);syncRoom(room);
}
function scheduleTurn(room){
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  if(room.phase!=='auction')return;
  const expectedRound=room.round,expectedBid=room.currentBid;
  room.timer=setTimeout(()=>{
    if(!rooms.has(room.id)||room.phase!=='auction'||room.round!==expectedRound||room.currentBid!==expectedBid)return;
    expireAuctionTurn(room);
  },Math.max(1,room.deadline-Date.now())+30);
  if(room.mode==='bot'&&room.turn===1){
    room.botTimer=setTimeout(()=>{
      if(!rooms.has(room.id)||room.phase!=='auction'||room.turn!==1)return;
      const desired=1+Math.floor(Math.random()*6);
      const next=room.bidMode==='avoid'?room.currentBid-1:room.currentBid+1;
      const firstAvoid=room.bidMode===null&&canBuy(room,0)&&Math.random()<.23;
      if(firstAvoid&&room.budgets[1]>=1)raiseBid(room,1,-1);
      else if(room.bidMode===null&&room.budgets[1]>=1)raiseBid(room,1,1);
      else if(room.bidMode==='avoid'&&-next<=room.budgets[1]&&-next<=desired&&Math.random()<.65)raiseBid(room,1,next);
      else if(room.bidMode!=='avoid'&&next<=room.budgets[1]&&next<=desired&&Math.random()<.78)raiseBid(room,1,next);
      else if(room.bidMode===null)expireAuctionTurn(room);
      else concludeAuction(room,'bot aceitou o lance');
    },650+Math.floor(Math.random()*1400));
  }
}
function raiseBid(room,side,amount){
  if(room.phase!=='auction'||room.turn!==side||!canBuy(room,side)||Date.now()>room.deadline)return false;
  if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>room.budgets[side])return false;
  if(room.bidMode===null){
    if(amount!==1&&amount!==-1)return false;
    if(amount<0&&(!canBuy(room,0)||!canBuy(room,1)))return false;
    room.bidMode=amount<0?'avoid':'buy';
  }else if(amount!==room.currentBid+(room.bidMode==='avoid'?-1:1))return false;
  room.currentBid=amount;room.leader=side;room.turn=1-side;room.deadline=Date.now()+10000;
  if(!canBuy(room,room.turn)||room.budgets[room.turn]<Math.abs(room.currentBid)+1){
    concludeAuction(room,'adversário não pode cobrir');return true;
  }
  scheduleTurn(room);syncRoom(room);return true;
}
function concludeAuction(room,reason){
  if(room.phase!=='auction')return;
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  let winner,avoider=-1,price=0;
  if(room.bidMode==='avoid'&&room.leader>=0){
    avoider=room.leader;winner=1-avoider;price=room.currentBid;
    room.budgets[avoider]+=price; // moedas negativas desaparecem do jogo
  }else if(room.bidMode==='buy'&&room.leader>=0){
    winner=room.leader;price=room.currentBid;room.budgets[winner]-=price;
  }else winner=room.turn;
  if(!canBuy(room,winner))winner=1-winner;
  room.phase='place';room.deadline=0;room.placer=winner;
  room.pending=room.offer[0];room.pendingPrice=price;room.pendingAvoider=avoider;room.pendingReason=reason;
  syncRoom(room);
  if(room.mode==='bot'&&winner===1){
    room.botTimer=setTimeout(()=>{
      if(!rooms.has(room.id)||room.phase!=='place'||room.placer!==1)return;
      const slots=freeSlots(room,1);if(slots.length)placeCharacter(room,1,slots[Math.floor(Math.random()*slots.length)]);
    },900);
  }
}
function placeCharacter(room,side,slot){
  if(room.phase!=='place'||side!==room.placer||!Number.isInteger(slot)||slot<0||slot>=5||room.teams[side][slot]!==null)return false;
  room.teams[side][slot]=room.pending;
  room.history.push({round:room.round+1,character:publicFighter(CHAR[room.pending]),winner:side,price:room.pendingPrice,avoider:room.pendingAvoider,slot,rarity:CHAR[room.pending].rarity});
  room.phase='reveal';room.result={winner:side,price:room.pendingPrice,avoider:room.pendingAvoider,bidMode:room.bidMode||'neutral',reason:room.pendingReason,
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
  const payload={type:'battle',mode:room.mode,victoryRule:'total',names:teamNames(room),members:room.mode==='squad'?room.players.map(p=>p?.name):null,
    scores,totals,winner,details,budgets:room.budgets,history:room.history,roomId:room.id,startAt:Date.now()+1400};
  for(const u of room.players)issue(u,payload);
  room.battle=payload;presence();
}
function restartRoom(room){
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  room.round=0;room.phase='auction';room.budgets=[20,20];
  room.teams=[Array(5).fill(null),Array(5).fill(null)];
  room.offer=[];room.leader=-1;room.turn=0;room.currentBid=0;room.bidMode=null;
  room.deadline=0;room.placer=-1;room.pending=null;room.pendingPrice=0;
  room.pendingAvoider=-1;room.pendingReason='';room.result=null;room.battle=null;
  room.history=[];room.rematchVotes=new Set();
  chooseOffer(room);syncRoom(room);
}
function cleanRoom(room) {
  if (!room) return;
  clearTimeout(room.timer);clearTimeout(room.botTimer);
  rooms.delete(room.id);
  for (const u of room.players) if(u&&u.roomId===room.id){u.roomId=null;issue(u,{type:'left_room'});}
  presence();
}
const SQUAD_CODE_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function generateSquadCode(){
  for(let n=0;n<30;n++){
    const bytes=crypto.randomBytes(6);
    const code=[...bytes].map(b=>SQUAD_CODE_ALPHABET[b%SQUAD_CODE_ALPHABET.length]).join('');
    if(!squadLobbies.has(code))return code;
  }
  throw new Error('Não foi possível gerar código da sala.');
}
function lobbyPayload(lobby){
  return {type:'squad_lobby',code:lobby.code,owner:lobby.host,
    members:lobby.members.map(m=>({name:users.get(m.token)?.name||'Jogador',side:m.side})),
    count:lobby.members.length,required:4};
}
function syncSquadLobby(lobby){
  const payload=lobbyPayload(lobby);
  for(const m of lobby.members)issue(users.get(m.token),payload);
}
function removeSquadLobbyMember(user){
  if(!user?.squadCode)return;
  const lobby=squadLobbies.get(user.squadCode),code=user.squadCode;
  user.squadCode=null;
  if(!lobby)return;
  const isHost=lobby.host===user.token;
  if(isHost){
    squadLobbies.delete(code);
    for(const member of lobby.members){
      const u=users.get(member.token);
      if(u){u.squadCode=null;issue(u,{type:'squad_left',reason:'O criador encerrou a sala 2v2.'});}
    }
  }else{
    lobby.members=lobby.members.filter(m=>m.token!==user.token);
    syncSquadLobby(lobby);
  }
  presence();
}
function addSquadMember(user,lobby,side){
  const count=lobby.members.filter(m=>m.side===side).length;
  if(count>=2)return false;
  lobby.members.push({token:user.token,side});
  user.squadCode=lobby.code;
  syncSquadLobby(lobby);presence();
  if(lobby.members.length===4){
    const ordered=[0,1].flatMap(team=>lobby.members.filter(m=>m.side===team).map(m=>users.get(m.token)));
    // Formato interno: [dupla A integrante 1, dupla B integrante 1, dupla A integrante 2, dupla B integrante 2].
    const players=[ordered[0],ordered[2],ordered[1],ordered[3]];
    squadLobbies.delete(lobby.code);
    for(const p of players)p.squadCode=null;
    makeRoom(players[0],players[1],'squad',[players[2],players[3]]);
  }
  return true;
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
    if(user.roomId){const r=rooms.get(user.roomId); if(r){ const side=r.players.findIndex(p=>p?.token===token);if(side>=0){if(r.phase==='battle')send(ws,r.battle);else send(ws,roomView(r,r.mode==='squad'?side%2:side));} }else user.roomId=null;}
    if(user.squadCode){const waiting=squadLobbies.get(user.squadCode);if(waiting)send(ws,lobbyPayload(waiting));else user.squadCode=null;}
    presence();return;
  }
  const user=userFor(ws);if(!user)return error(ws,'Digite seu nome para entrar.');
  if(kind==='invite'){
    if(user.roomId||user.squadCode)return error(ws,'Você já está em uma sala ou batalha.');
    const recipient=findByName(data.to);
    if(!recipient)return error(ws,'Amigo não encontrado. Ele precisa estar online com esse nome.');
    if(recipient.token===user.token)return error(ws,'Você não pode desafiar a si mesmo.');
    if(recipient.roomId||recipient.squadCode)return error(ws,'Esse amigo já está em uma sala ou batalha.');
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
    if(!challenger?.conn||challenger.roomId||user.roomId||challenger.squadCode||user.squadCode)return error(ws,'Um dos jogadores não está disponível.');
    clearPending(user);clearPending(challenger);
    makeRoom(challenger,user,'online');return;
  }
  if(kind==='bot'){
    if(user.roomId||user.squadCode)return error(ws,'Saia da sala atual antes de começar outra.');
    makeRoom(user,null,'bot');return;
  }
  if(kind==='squad_create'){
    if(user.roomId||user.squadCode)return error(ws,'Saia da sala atual antes de criar outra.');
    const code=generateSquadCode();
    const lobby={code,host:user.token,members:[{token:user.token,side:0}],created:Date.now()};
    squadLobbies.set(code,lobby);user.squadCode=code;
    syncSquadLobby(lobby);presence();return;
  }
  if(kind==='squad_join'){
    if(user.roomId||user.squadCode)return error(ws,'Saia da sala atual antes de entrar em outra.');
    const code=String(data.code||'').trim().toUpperCase();
    if(!/^[A-Z2-9]{6}$/.test(code))return error(ws,'Código 2v2 inválido. Digite os 6 caracteres da sala.');
    const lobby=squadLobbies.get(code);
    if(!lobby)return error(ws,'Sala 2v2 não encontrada. Confira o código.');
    if(lobby.members.length>=4)return error(ws,'A sala 2v2 já está cheia.');
    const side=Number(data.side);
    if(![0,1].includes(side))return error(ws,'Escolha a dupla A ou B.');
    if(!addSquadMember(user,lobby,side))return error(ws,'Essa dupla já está cheia. Escolha a outra.');
    return;
  }
  if(kind==='squad_leave'){
    if(user.squadCode){removeSquadLobbyMember(user);issue(user,{type:'squad_left',reason:'Você saiu da sala 2v2.'});}
    return;
  }
  if(kind==='bid'){
    const room=rooms.get(user.roomId);
    if(!room||room.phase!=='auction')return error(ws,'Não existe um leilão ativo.');
    const playerIdx=room.players.findIndex(p=>p?.token===user.token);
    const idx=room.mode==='squad'?playerIdx%2:playerIdx;
    if(playerIdx<0||idx!==room.turn)return error(ws,'Espere a vez da sua dupla para dar o lance.');
    if(Date.now()>room.deadline){expireAuctionTurn(room);return error(ws,'Os 10 segundos acabaram.');}
    const amount=Number(data.amount);
    if(!raiseBid(room,idx,amount))return error(ws,'Lance inválido. Confira a modalidade e seu saldo.');
    return;
  }
  if(kind==='pass'){
    const room=rooms.get(user.roomId);
    if(!room||room.phase!=='auction')return error(ws,'Não existe um leilão ativo.');
    const playerIdx=room.players.findIndex(p=>p?.token===user.token);
    const idx=room.mode==='squad'?playerIdx%2:playerIdx;
    if(playerIdx<0||idx!==room.turn)return error(ws,'Ainda não é a vez da sua dupla.');
    // Não é possível pegar grátis/desistir antes de o primeiro lance ser dado.
    if(room.bidMode===null||room.leader<0)return error(ws,'O leilão precisa de pelo menos um lance antes de aceitar ou desistir.');
    if(Date.now()>room.deadline){expireAuctionTurn(room);return;}
    concludeAuction(room,room.bidMode==='avoid'?'jogador aceitou o personagem gratuitamente':'jogador desistiu de cobrir');return;
  }
  if(kind==='place'){
    const room=rooms.get(user.roomId);
    const playerIdx=room?.players.findIndex(p=>p?.token===user.token);
    const idx=room?.mode==='squad'?playerIdx%2:playerIdx;
    if(!room||playerIdx<0||!placeCharacter(room,idx,Number(data.slot)))return error(ws,'Escolha uma posição livre do seu time.');
    return;
  }
  if(kind==='rematch'){
    const room=rooms.get(user.roomId);
    if(!room||room.phase!=='battle'||!room.battle)return error(ws,'A revanche só pode começar após a batalha.');
    const side=room.players.findIndex(p=>p?.token===user.token);
    if(side<0)return error(ws,'Você não faz parte dessa partida.');
    if(!room.rematchVotes)room.rematchVotes=new Set();
    room.rematchVotes.add(side);
    const needed=room.mode==='squad'?4:2;
    const ready=room.mode==='bot'||room.rematchVotes.size===needed;
    if(ready){restartRoom(room);}
    else for(const u of room.players)issue(u,{type:'rematch_status',voted:room.rematchVotes.size,needed});
    return;
  }
  if(kind==='leave'){
    if(user.squadCode)removeSquadLobbyMember(user);
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
// O Mister Satan tem o ID 9377 no MyAnimeList; buscar por 'Satan' pode trazer outro personagem.
const FIXED_PORTRAIT_IDS={satan:9377};
const PICTURE_ALIASES={satan:['Hercule','Mr. Satan','Mister Satan'],
  okarun:['Ken Takakura','Okarun'],cc:['C.C.'],mob:['Shigeo Kageyama','Mob'],
  jinwoo:['Sung Jinwoo','Jin-Woo Sung'],frierenstark:['Stark'],lawliet:['L Lawliet','L'],
  deku:['Izuku Midoriya'],goku:['Son Goku'],light:['Light Yagami'],ash:['Satoshi','Ash Ketchum']};
// Cache de elencos por anime: uma consulta atende vários personagens do jogo.
const JIKAN_ANIME_IDS={
 'Naruto':20,'Dragon Ball':223,'One Piece':21,'Bleach':269,'Demon Slayer':38000,
 'Jujutsu Kaisen':40748,'My Hero Academia':31964,'Attack on Titan':16498,
 'Black Clover':34572,'Chainsaw Man':44511,'One Punch Man':30276,
 'Tensei Shitara Slime':37430,'Maou Gakuin':40496,'Madoka Magica':9756,
 'Hunter x Hunter':11061,'Fullmetal Alchemist: Brotherhood':5114,'Death Note':1535,
 'Tokyo Ghoul':22319,'Sword Art Online':11757,'Fairy Tail':6702,
 "JoJo's Bizarre Adventure":14719,'Mob Psycho 100':32182,
 'Solo Leveling':52299,"Frieren: Beyond Journey's End":52991,
 'Spy x Family':50265,'Blue Lock':49596,'Haikyuu!!':20583,'Dr. Stone':38691,
 'Fire Force':38671,'Re:Zero':31240,'Overlord':29803,
 'The Seven Deadly Sins':23755,'Code Geass':1575,'Pokémon':527,
 'Yu Yu Hakusho':392,'Gintama':918,'Dandadan':57334,'Vinland Saga':37521
};
const castPortraitCache=new Map();
async function castPortrait(person,aliases){
  const malId=JIKAN_ANIME_IDS[person.anime];if(!malId)return null;
  let job=castPortraitCache.get(malId);
  if(!job){
    job=(async()=>{
      try{
        const res=await pacedPhotoRequest('https://api.jikan.moe/v4/anime/'+malId+'/characters');
        return res.ok?(await res.json()).data||[]:[];
      }catch(e){console.log('Elenco externo:',e.message);return [];}
    })();
    castPortraitCache.set(malId,job);
  }
  const chars=await job;
  const wordsList=aliases.map(pictureWords).filter(words=>words.length);
  for(const item of chars){
    const c=item.character||item,regular=pictureWords(c.name);
    const backwards=String(c.name||'').split(',').map(x=>x.trim()).reverse().join(' ');
    const norm=pictureWords(backwards);
    const matches=wordsList.some(words=>{
      const full=words.join(' ');
      return regular.join(' ')===full||norm.join(' ')===full;
    });
    if(matches){
      return c.images?.jpg?.image_url||c.images?.webp?.image_url||null;
    }
  }
  return null;
}
async function searchPortrait(person){
  const id=FIXED_PORTRAIT_IDS[person.id];
  if(id){
    try{
      const r=await pacedPhotoRequest('https://api.jikan.moe/v4/characters/'+id);
      if(r.ok){const data=(await r.json()).data;
        if(data?.mal_id===id || pictureMatch(data?.name,person.name)>=.66)
          return data?.images?.jpg?.image_url||data?.images?.webp?.image_url||null;
      }
    }catch(e){console.log('Retrato fixo:',e.message);}
    // Foto oficial do personagem; usada somente se a API de personagens falhar.
    if(person.id==='satan')return 'https://images.microcms-assets.io/assets/79a305090571443fb06a9260d669fe02/fc8a3dec2f03474cb5b0b1d81b9a1358/chara_satan.png';
  }
  const names=[person.name,...(PICTURE_ALIASES[person.id]||[])];
  try{const cast=await castPortrait(person,names);if(cast)return cast;}catch(e){console.log('Retrato no elenco:',e.message);}
  for(const name of [...new Set(names)]){
    try{
      const res=await pacedPhotoRequest('https://api.jikan.moe/v4/characters?q='+encodeURIComponent(name)+'&limit=20');
      if(res.ok){
        const json=await res.json(),items=json.data||[];
        const ranked=items.map(x=>({x,score:pictureMatch(x.name,name)})).sort((a,b)=>b.score-a.score);
        const best=ranked[0];
        const words=pictureWords(name);
        if(best?.score>=(words.length<=1?.95:.82)){
          const url=best.x.images?.jpg?.image_url||best.x.images?.webp?.image_url;
          if(url)return url;
        }
      }
    }catch(e){console.log('Jikan portrait:',e.message);}
  }
  for(const name of [...new Set(names)].slice(0,2)){
    try{
      const query='query ($search: String) { Character(search: $search) { name { full native } image { large } } }';
      const res=await pacedPhotoRequest('https://graphql.anilist.co',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query,variables:{search:name}})
      });
      if(res.ok){
        const json=await res.json(),c=json.data?.Character;
        if(c&&pictureMatch(c.name?.full,name)>=.8&&c.image?.large)return c.image.large;
      }
    }catch(e){console.log('AniList portrait:',e.message);}
  }
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
  if(cached&&Date.now()-cached.time<(cached.data?3600000:60000)){
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
