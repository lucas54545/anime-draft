'use strict';
const $=id=>document.getElementById(id);
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const SESSION_KEY='anime_draft_session_v2';
const saved=(()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY))||{}}catch{return {}}})();
const model={socket:null,connected:false,name:saved.name||'',token:saved.token||makeToken(),logged:false,room:null,battle:null,invitation:null,online:[],roster:[]};
const photoCache=(()=>{try{return JSON.parse(localStorage.getItem('anime_draft_photos_v2'))||{}}catch{return {}}})();
let photoQueue=[],photoBusy=false,toastTimer=null,gameTimers=[],auctionClock=null;

function makeToken(){
  const a=new Uint8Array(16);if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(a);
  else for(let i=0;i<a.length;i++)a[i]=Math.floor(Math.random()*256);
  return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
}
function saveSession(){localStorage.setItem(SESSION_KEY,JSON.stringify({name:model.name,token:model.token}));}
function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function send(type,extra={}){if(!model.socket||model.socket.readyState!==WebSocket.OPEN){toast('Sem conexão com a arena. Aguarde reconectar.');return false;}model.socket.send(JSON.stringify({type,...extra}));return true;}
function onlineState(isConnected){model.connected=isConnected;$('netLed').classList.toggle('ok',isConnected);$('netLabel').textContent=isConnected?'CONECTADO':'DESCONECTADO';$('loginBtn').disabled=!isConnected;$('inviteBtn').disabled=!isConnected;$('botBtn').disabled=!isConnected;}
function show(view){for(const id of ['lobby','offline','arena','battle'])$(id).hidden=id!==view;$('hero').hidden=view!=='lobby';if(view==='offline'){heading('LEILÃO DE ANIME','20 moedas, poderes ocultos e batalha de 5 atributos.','// MODO LOCAL');}else if(view==='lobby'){heading('ENTRE NA ARENA','Convide seu rival ou treine contra o bot.','// MULTIPLAYER ARENA');}else if(view==='arena')heading('LEILÃO DE PERSONAGENS','Poder oculto no leilão; revelado assim que o personagem entra no seu time.','// SALA DE BATALHA');else heading('BATALHA FINAL','Veja os cinco confrontos simultâneos e descubra quem venceu.','// RESULTADO DA PARTIDA');}
function heading(h,p,tag){$('panelHeading').textContent=h;$('panelDescription').textContent=p;$('panelEyebrow').textContent=tag;}
function connect(){
  let url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
  if(location.protocol==='file:'){onlineState(false);$('netLabel').textContent='MODO LOCAL';$('loginBox').hidden=true;return;}
  const ws=new WebSocket(url);model.socket=ws;
  ws.addEventListener('open',()=>{onlineState(true);if(model.name)send('login',{name:model.name,token:model.token});});
  ws.addEventListener('close',()=>{onlineState(false);model.logged=false;model.online=[];renderOnline();setTimeout(connect,2200);});
  ws.addEventListener('error',()=>onlineState(false));
  ws.addEventListener('message',ev=>{try{receive(JSON.parse(ev.data));}catch(e){console.warn('Mensagem não pôde ser lida:',e)}});
}
function receive(data){
  switch(data.type){
    case 'connected':break;
    case 'error':toast(data.message||'Erro desconhecido.');break;
    case 'replaced':toast('Sua sessão foi aberta em outra aba.');break;
    case 'welcome':model.logged=true;model.name=data.name;saveSession();renderLobby();if(!model.room)show('lobby');break;
    case 'presence':model.online=data.players||[];$('playerCount').textContent=model.online.length;renderOnline();break;
    case 'invite_received':model.invitation={id:data.id,from:data.from};renderInvitations();toast('⚔ '+data.from+' desafiou você!');if(!model.room)show('lobby');break;
    case 'invite_sent':$('inviteStatus').textContent='✓ Convite enviado para '+data.to+'. Aguarde a resposta.';toast('Convite enviado!');break;
    case 'invite_declined':$('inviteStatus').textContent='Seu convite foi recusado por '+data.from+'.';toast('Seu amigo recusou o convite.');break;
    case 'room':model.room=data;model.battle=null;renderArena();break;
    case 'battle':model.room=null;model.battle=data;renderBattle(data);break;
    case 'left_room':model.room=null;model.battle=null;renderLobby();show('lobby');break;
  }
}
function renderLobby(){
  $('loginBox').hidden=model.logged;$('signedBox').hidden=!model.logged;
  $('nickname').value=model.name||'';
  $('signedName').textContent=model.name;
  $('inviteStatus').textContent='';renderInvitations();
}
function renderInvitations(){
  $('inviteInbox').hidden=!model.invitation;
  if(model.invitation)$('inviteFrom').textContent=model.invitation.from+' desafiou você!';
}
function renderOnline(){
  const list=$('onlineList');
  if(!model.online.length){list.innerHTML='<span class="muted">Ninguém online no momento.</span>';return;}
  list.innerHTML=model.online.map(p=>`<div class="online-entry"><div class="initial">${safe((p.name[0]||'?').toUpperCase())}</div><b title="${safe(p.name)}">${safe(p.name)}</b><small>${p.busy?'EM JOGO':'LIVRE'}</small>${model.logged&&p.name!==model.name&&!p.busy?`<button class="select-user" data-name="${safe(p.name)}" type="button">DESAFIAR</button>`:''}</div>`).join('');
  list.querySelectorAll('[data-name]').forEach(b=>b.addEventListener('click',()=>{$('friendName').value=b.dataset.name;inviteFriend();}));
}
function login(){
  const name=$('nickname').value.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>20){toast('Digite um apelido entre 2 e 20 caracteres.');return;}
  if(send('login',{name,token:model.token})){model.name=name;saveSession();}
}
function inviteFriend(){
  const to=$('friendName').value.trim();
  if(to.length<2){toast('Digite o nome do amigo.');return;}
  send('invite',{to});
}
function respond(accept){
  if(!model.invitation)return;
  const invitation=model.invitation;
  if(send('respond',{id:invitation.id,accept})){model.invitation=null;renderInvitations();}
}
function photoURL(id){return typeof photoCache[id]==='string'?photoCache[id]:'';}
function imageMarkup(person,extraClass=''){
  const url=photoURL(person.id);
  return `<img class="character-img ${extraClass}" data-character="${safe(person.id)}" src="${safe(url)}" alt="Retrato de ${safe(person.name)}" loading="eager" referrerpolicy="no-referrer" ${url?'':'hidden'} onerror="this.hidden=true">`;
}
// Matching images from Jikan's anime cast first, with a character search as fallback.
// The queries are cached so the same photo doesn't require new requests every round.
const MAL_ANIME={
 'Naruto':20,'Dragon Ball':223,'One Piece':21,'Bleach':269,'Demon Slayer':38000,
 'Jujutsu Kaisen':40748,'My Hero Academia':31964,'Attack on Titan':16498,
 'Black Clover':34572,'Chainsaw Man':44511,'One Punch Man':30276,
 'Tensei Shitara Slime':37430,'Maou Gakuin':40496,'Madoka Magica':9756
};
const castJobs=new Map();
const pendingIDs=new Set();
function normName(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function setImage(person,url){
  if(!url || !/^https:\/\//i.test(url))return;
  photoCache[person.id]=url;
  pendingIDs.delete(person.id);
  document.querySelectorAll('img[data-character="'+CSS.escape(person.id)+'"]').forEach(img=>{img.src=url;img.hidden=false;});
  try{localStorage.setItem('anime_draft_photos_v2',JSON.stringify(photoCache));}catch{}
}
function matchImage(p,items){
  const target=normName(p.name);if(!target)return;
  const found=items.find(x=>{
    const n=normName(x.name);
    if(n===target)return true;
    const backwards=String(x.name||'').split(',').map(y=>y.trim()).reverse().join(' ');
    return normName(backwards)===target;
  });
  if(found) setImage(p, found.images?.jpg?.image_url||found.images?.webp?.image_url);
}
async function fetchJSON(url){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),9500);
  try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
  finally{clearTimeout(t);}
}
async function fetchAnimeCast(anime){
  if(!MAL_ANIME[anime])return;
  if(castJobs.has(anime))return castJobs.get(anime);
  const job=fetchJSON('https://api.jikan.moe/v4/anime/'+MAL_ANIME[anime]+'/characters').then(body=>{
    const items=(body.data||[]).map(x=>x.character).filter(Boolean);
    const roster=window.ANIME_ROSTER||model.roster||[];
    for(const p of roster.filter(x=>x.anime===anime))matchImage(p,items);
  }).catch(()=>{});
  castJobs.set(anime,job);return job;
}
function maybePhoto(person){
  if(!person || photoURL(person.id)||pendingIDs.has(person.id))return;
  pendingIDs.add(person.id);photoQueue.unshift(person);drainPhotos();
}
async function drainPhotos(){
  if(photoBusy)return; photoBusy=true;
  while(photoQueue.length){
    const p=photoQueue.pop();
    if(photoURL(p.id)){pendingIDs.delete(p.id);continue;}
    try{
      await fetchAnimeCast(p.anime);
      if(!photoURL(p.id)){
        const body=await fetchJSON('https://api.jikan.moe/v4/characters?q='+encodeURIComponent(p.name)+'&limit=12');
        matchImage(p,body.data||[]);
      }
    }catch(e){console.debug('Imagem indisponível:',p.name,e.message);}
    pendingIDs.delete(p.id);
    await new Promise(resolve=>setTimeout(resolve,1100));
  }
  photoBusy=false;
}
function characterCard(p,role){
  maybePhoto(p);
  return `<div class="character-card ${role==='highlight'?'featured':''}"><div class="character-art"><span class="emoji">${safe(p.emoji)}</span>${imageMarkup(p)}<span class="character-label">${role==='highlight'?'⭐ DESTAQUE NO LEILÃO':'🎲 PERSONAGEM RESERVA'}</span></div><div class="character-info"><small>${safe(p.anime)}</small><h4>${safe(p.name)}</h4><div class="secret">🔒 FORÇA / QI / VELOCIDADE: <b>???</b></div></div></div>`;
}
function powerSummary(p){
  if(!p || !Array.isArray(p.stats)) return '';
  return `<div class="power-summary" aria-label="Poder revelado de ${safe(p.name)}"><span>⚡ PODER TOTAL <strong>${p.power}</strong></span><div class="stat-row">${ATTR.map((a,i)=>`<span title="${safe(a)}">${safe(a.split(' ').slice(1).join(' '))} <b>${p.stats[i]}</b></span>`).join('')}</div></div>`;
}
function teamBoard(team,name){
  const partial=team.reduce((sum,p,i)=>sum+(p?.stats?.[i]||0),0);
  return `<div class="team-board"><h4>${safe(name)} <span class="team-running-total">⚡ ${partial} PTS</span></h4>${ATTR.map((attr,i)=>{const p=team[i];if(p)maybePhoto(p);return `<div class="team-slot"><div class="mini-avatar">${p?`${safe(p.emoji)}${imageMarkup(p)}`:'?'}</div><div class="team-slot-info"><small>${attr}</small><b>${p?safe(p.name):'Aguardando...'}</b>${p?`<span class="primary-stat">${safe(attr)}: <strong>${p.stats[i]}</strong> / 100</span>${powerSummary(p)}`:''}</div></div>`}).join('')}</div>`;
}
function updateAuctionTimer(){
  const r=model.room;
  if(!r||r.phase!=='auction'){clearInterval(auctionClock);auctionClock=null;return;}
  const remain=Math.max(0,(r.deadline-Date.now())/1000);
  $('secondsLeft').textContent=Math.ceil(remain);
  $('timerFill').style.width=(remain*10)+'%';
  $('timerFace').classList.toggle('urgent',remain<=3);
  const myTurn=r.turn===r.you;
  $('placeBid').disabled=!myTurn || r.minimum>r.budgets[r.you] || remain<=0;
  $('passBid').disabled=!myTurn||remain<=0;
}
function renderArena(){
  show('arena');const r=model.room;if(!r)return;
  const myBudget=r.budgets[r.you];
  $('roundLabel').textContent=`RODADA ${String(Math.min(r.round+1,5)).padStart(2,'0')} / 05`;
  $('steps').innerHTML=Array.from({length:5},(_,i)=>`<span class="${i<r.round?'done':i===r.round?'active':''}"></span>`).join('');
  $('matchName0').textContent=r.names[0];$('matchName1').textContent=r.names[1];
  $('budget0').textContent=r.budgets[0];$('budget1').textContent=r.budgets[1];
  $('arenaPhase').textContent=r.phase==='auction'?'LEILÃO DE 10 SEGUNDOS':'PODERES REVELADOS';
  $('auctionTitle').textContent=(r.phase==='auction'?'LEILÃO DE ':'RESULTADO DE ')+ATTR[r.round];
  $('auctionCaption').textContent=r.phase==='auction'?'Quem dá o maior lance leva o DESTAQUE. O rival tem 10 segundos para aumentar a oferta em 1 moeda ou desistir.':'O vencedor recebeu o destaque, e o outro jogador ficou com o reserva. Poderes revelados!';
  $('auctionPair').innerHTML=r.offered.map((c,i)=>characterCard(c,i===0?'highlight':'backup')).join('');
  $('teamBoards').innerHTML=r.teams.map((team,i)=>teamBoard(team,r.names[i])).join('');
  const isAuction=r.phase==='auction';
  $('liveBidBanner').hidden=!isAuction;
  $('biddingArea').hidden=!isAuction||r.turn!==r.you;
  $('awaitBid').hidden=!isAuction||r.turn===r.you;
  $('reveal').hidden=r.phase!=='reveal';
  $('currentBid').textContent=r.currentBid;
  $('bidLeader').textContent=r.leader<0?'Ninguém ofereceu ainda. '+r.names[r.turn]+' começa.':r.names[r.leader]+' está ganhando com '+r.currentBid+' moeda(s).';
  $('budgetHint').textContent=myBudget;
  $('bidValue').textContent=r.minimum;
  $('placeBid').textContent='⚡ OFERECER '+r.minimum+' MOEDA'+(r.minimum!==1?'S':'');
  $('waitingMessage').textContent=r.names[r.turn]+' tem 10 segundos para cobrir o lance ou desistir.';
  clearInterval(auctionClock);auctionClock=null;
  if(isAuction){updateAuctionTimer();auctionClock=setInterval(updateAuctionTimer,125);}
  if(r.phase==='reveal' && r.result){
    const win=r.result.winner,they=win===r.you;
    $('reveal').innerHTML=`<div class="section-eyebrow">RESULTADO DO LEILÃO</div><h3>${they?'🏆 VOCÊ GANHOU O DESTAQUE!':'⚔ '+safe(r.names[win]).toUpperCase()+' LEVOU O DESTAQUE'}</h3><p>${safe(r.names[win])} ganhou <b>${safe(r.result.offers[0].name)}</b> por 🪙 ${r.result.price}. ${safe(r.names[1-win])} recebeu <b>${safe(r.result.offers[1].name)}</b> gratuitamente.</p><div class="reveal-powers">${r.result.offers.map(p=>`<div class="reveal-fighter"><span>${safe(p.emoji)} ${safe(p.name)}</span>${powerSummary(p)}</div>`).join('')}</div><p>Próximo leilão em instantes…</p>`;
  }
}
function submitBid(){
  const r=model.room;if(!r||r.phase!=='auction'||r.turn!==r.you)return;
  if(send('bid',{amount:r.minimum})){$('placeBid').disabled=true;}
}
function giveUpBid(){
  const r=model.room;if(!r||r.phase!=='auction'||r.turn!==r.you)return;
  if(send('pass')){$('passBid').disabled=true;}
}
function cancelTimers(){clearInterval(auctionClock);auctionClock=null;gameTimers.forEach(t=>clearTimeout(t));gameTimers=[];}
function renderBattle(data){
  cancelTimers();show('battle');
  $('battleName0').textContent=data.names[0];$('battleName1').textContent=data.names[1];
  $('winnerTitle').textContent=data.winner<0?'EMPATE ÉPICO!':data.names[data.winner].toUpperCase()+' VENCEU!';
  $('winnerSubtitle').textContent='🏆 O maior TOTAL dos 5 atributos vence • Força + Resistência + QI + Habilidade + Velocidade';
  $('battleScore0').textContent=data.totals[0];$('battleScore1').textContent=data.totals[1];
  $('battleTotal0').textContent=data.scores[0]+' categorias vencidas';$('battleTotal1').textContent=data.scores[1]+' categorias vencidas';
  $('battleRows').replaceChildren();
  const baseDelay=Math.max(0,(data.startAt||Date.now())-Date.now());
  data.details.forEach((item,i)=>{
    const t=setTimeout(()=>{
      const row=document.createElement('div');row.className='battle-row';
      row.innerHTML=`<h3>${ATTR[i]}</h3><div class="duel-grid">${item.fighters.map((p,j)=>{maybePhoto(p);return `<div class="duelist ${item.winner===j?'win':''}"><div class="mini-avatar">${safe(p.emoji)}${imageMarkup(p)}</div><div style="flex:1;min-width:0"><small>${safe(p.name)}</small><strong>${p.value} PTS ${item.winner===j?'🏆':''}</strong><div class="power-bar"><span style="width:${p.value}%"></span></div></div></div>`;}).join('')}</div>`;
      $('battleRows').append(row);
    },baseDelay+i*680);gameTimers.push(t);
  });
}
async function copyResult(){
  const b=model.battle;if(!b)return;
  const txt=`⚔ ANIME DRAFT BATTLE\n${b.names[0]} ${b.totals[0]} x ${b.totals[1]} ${b.names[1]}\n${b.details.map(x=>x.attribute+': '+x.fighters[0].value+' x '+x.fighters[1].value).join('\n')}\n🏆 ${b.winner<0?'Empate':b.names[b.winner]}`;
  try{await navigator.clipboard.writeText(txt);toast('Resultado copiado!')}catch{toast('Não foi possível copiar automaticamente.');}
}
function backLobby(){cancelTimers();send('leave');model.room=null;model.battle=null;renderLobby();show('lobby');}
$('loginBtn').addEventListener('click',login);
$('nickname').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
$('changeName').addEventListener('click',()=>{model.logged=false;model.name='';renderLobby();$('nickname').focus();});
$('inviteBtn').addEventListener('click',inviteFriend);
$('friendName').addEventListener('keydown',e=>{if(e.key==='Enter')inviteFriend();});
$('acceptBtn').addEventListener('click',()=>respond(true));
$('declineBtn').addEventListener('click',()=>respond(false));
$('botBtn').addEventListener('click',()=>send('bot'));
$('passBid').addEventListener('click',giveUpBid);
$('placeBid').addEventListener('click',submitBid);
$('leaveMatch').addEventListener('click',()=>{if(confirm('Sair da partida? Seu adversário também voltará ao lobby.'))backLobby();});
$('goLobby').addEventListener('click',backLobby);
$('copyBattle').addEventListener('click',copyResult);
$('nickname').value=model.name;
show('lobby');renderLobby();renderOnline();
if(location.protocol!=='file:')fetch('./api/characters').then(r=>r.ok?r.json():[]).then(r=>model.roster=r).catch(()=>{});
connect();
