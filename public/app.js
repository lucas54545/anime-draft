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
const placeholderCache={};
function portraitFallback(person){
  if(placeholderCache[person.id])return placeholderCache[person.id];
  const colors=[['#194b77','#5cd2e9'],['#513675','#e88ef2'],['#174b42','#79e7ad'],['#553040','#ffad68'],['#223a82','#a1bbfa']];
  let hash=0;for(const c of String(person.id))hash=(hash*31+c.charCodeAt(0))>>>0;
  const [dark,light]=colors[hash%colors.length];
  const label=safe(String(person.name||'Personagem').slice(0,26));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="'+dark+'"/><stop offset="1" stop-color="#090f24"/></linearGradient></defs><rect width="300" height="340" fill="url(#g)"/><circle cx="150" cy="132" r="105" fill="'+light+'" opacity=".18"/><path d="M50 290q20-90 100-90t100 90" fill="'+light+'" opacity=".48"/><ellipse cx="150" cy="136" rx="54" ry="70" fill="#cd9c87"/><path d="M94 125q-7-86 58-94 61 2 57 94-31-19-46-51-29 40-69 51" fill="#151b2f"/><path d="M122 150h17m27 0h17" stroke="#161923" stroke-width="5"/><path d="M138 181q12 9 24 0" stroke="#7c4651" fill="none" stroke-width="3"/><rect y="282" width="300" height="58" fill="#080c1b"/><text x="150" y="312" font-size="18" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial">'+label+'</text><text x="150" y="329" font-size="10" text-anchor="middle" fill="'+light+'" font-family="Arial">RETRATO ILUSTRADO</text></svg>';
  return placeholderCache[person.id]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function imageMarkup(person,extraClass=''){
  if(!person||!person.id)return '';
  const fallback=portraitFallback(person);
  const real=photoURL(person.id)||(location.protocol==='file:'?'':'/api/portrait/'+encodeURIComponent(person.id)+'?v=7');
  const url=real||fallback;
  return '<img class="character-img '+safe(extraClass)+'" data-character="'+safe(person.id)+'" data-fallback="'+safe(fallback)+'" src="'+safe(url)+'" alt="Retrato de '+safe(person.name)+'" loading="eager" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.fallback">';
}
// Matching images from Jikan's anime cast first, with a character search as fallback.
// The queries are cached so the same photo doesn't require new requests every round.
const NAME_ALIASES={goku:['Son Gokuu','Gokuu Son'],satan:['Mister Satan','Hercule Satan'],luffy:['Luffy, Monkey D.'],zoro:['Zoro, Roronoa'],deku:['Midoriya Izuku'],eren:['Eren Jaeger'],gohan:['Son Gohan'],kyubey:['Kyuubey'],rimuru:['Limule Tempest']};
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
  const acceptable=new Set([p.name,...(NAME_ALIASES[p.id]||[])].map(normName));
  const found=items.find(x=>acceptable.has(normName(x.name))||acceptable.has(normName(String(x.name||'').split(',').map(y=>y.trim()).reverse().join(' '))));
  if(found)setImage(p,found.images?.jpg?.image_url||found.images?.webp?.image_url);
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
function characterCard(p){
  maybePhoto(p);
  return '<div class="character-card featured"><div class="character-art"><span class="emoji">'+safe(p.emoji)+'</span>'+imageMarkup(p)+'<span class="character-label">⭐ ÚNICO PERSONAGEM DO LEILÃO</span></div><div class="character-info"><small>'+safe(p.anime)+'</small><h4>'+safe(p.name)+'</h4><div class="secret">🔒 FORÇA · RESISTÊNCIA · QI · HABILIDADE · VELOCIDADE: <b>???</b></div></div></div>';
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
  $('placeBid').disabled=!myTurn || r.bidMode==='avoid' || r.minimum>r.budgets[r.you] || remain<=0;
  $('avoidBid').disabled=!myTurn || r.bidMode==='buy' || !r.canAvoid || Math.abs(r.bidMode==='avoid'?r.minimum:-1)>r.budgets[r.you] || remain<=0;
  $('passBid').disabled=!myTurn||remain<=0;
}
function renderArena(){
  show('arena');const r=model.room;if(!r)return;
  const isAuction=r.phase==='auction',isPlace=r.phase==='place',isReveal=r.phase==='reveal';
  const myBudget=r.budgets[r.you];
  $('roundLabel').textContent='LEILÃO '+String(Math.min(r.round+1,10)).padStart(2,'0')+' / 10';
  $('steps').innerHTML=Array.from({length:10},(_,i)=>'<span class="'+(i<r.round?'done':i===r.round?'active':'')+'"></span>').join('');
  $('matchName0').textContent=r.names[0];$('matchName1').textContent=r.names[1];
  $('budget0').textContent=r.budgets[0];$('budget1').textContent=r.budgets[1];
  $('arenaPhase').textContent=isAuction?'LEILÃO • UM PERSONAGEM':isPlace?'ESCOLHA DO ATRIBUTO':'PODERES REVELADOS';
  $('auctionTitle').textContent=isAuction?'QUAL JOGADOR VAI LEVAR?':isPlace?'ESCOLHA O ATRIBUTO ANTES DE REVELAR':'PERSONAGEM REVELADO!';
  $('auctionCaption').textContent=isAuction?'Um personagem por leilão. O rival tem 10 segundos para aumentar o lance em uma moeda ou desistir.':isPlace?'Somente o vencedor escolhe a posição. O personagem fica oculto até confirmar.':'Os poderes foram revelados após a escolha do atributo. Agora começa o próximo leilão!';
  $('auctionPair').hidden=isReveal;
  $('auctionPair').innerHTML=(r.offered||[]).map(c=>characterCard(c)).join('');
  $('teamBoards').innerHTML=r.teams.map((team,i)=>teamBoard(team,r.names[i])).join('');
  $('liveBidBanner').hidden=!isAuction;
  $('biddingArea').hidden=!isAuction||r.turn!==r.you;
  $('awaitBid').hidden=!isAuction||r.turn===r.you;
  $('placementArea').hidden=!isPlace;
  $('reveal').hidden=!isReveal;
  $('currentBid').textContent=r.currentBid;
  $('bidLeader').textContent=r.leader<0?'Compre (+1), evite (-1) ou aceite grátis.':r.bidMode==='avoid'?r.names[r.leader]+' queimará '+Math.abs(r.currentBid)+' moedas para evitar este personagem.':r.names[r.leader]+' está ganhando por '+r.currentBid+' moedas.';
  $('budgetHint').textContent=myBudget;
  $('bidValue').textContent=r.currentBid;
  $('placeBid').textContent='⚡ COMPRAR +'+(r.bidMode==='neutral'?1:r.minimum);
  $('avoidBid').textContent='🛡️ EVITAR '+(r.bidMode==='neutral'?-1:r.minimum);
  $('placeBid').hidden=r.bidMode==='avoid';
  $('avoidBid').hidden=r.bidMode==='buy'||!r.canAvoid;
  $('passBid').textContent=r.bidMode==='neutral'?'✅ ACEITAR GRÁTIS':r.bidMode==='avoid'?'✅ ACEITAR PERSONAGEM GRÁTIS':'✋ DESISTIR';
  $('waitingMessage').textContent=r.names[r.turn]+' tem 10 segundos para responder.';
  $('auctionCaption').textContent=r.bidMode==='avoid'?'Lance negativo: quem evitar o personagem perde as moedas no limbo. O outro fica com ele grátis.':r.bidMode==='buy'?'Lance positivo: quem oferecer mais paga e leva o personagem.':'Escolha comprar +1 ou evitar -1. As moedas negativas somem do jogo.';
  clearInterval(auctionClock);auctionClock=null;
  if(isAuction){updateAuctionTimer();auctionClock=setInterval(updateAuctionTimer,125);}
  if(isPlace){
    const choosing=r.placer===r.you;
    $('placeTitle').textContent=choosing?'VOCÊ GANHOU! ESCOLHA ONDE COLOCAR':r.names[r.placer]+' ESTÁ ESCOLHENDO';
    $('placeHint').textContent=choosing?'Você levou '+r.pending.name+'. Escolha uma posição livre para revelar o poder!':r.names[r.placer]+' levou '+r.pending.name+'. Aguarde a escolha para revelar os números.';
    const options=$('placementOptions');
    if(choosing){
      const slots=r.teams[r.you]||[];
      options.innerHTML=ATTR.map((attr,i)=>'<button class="position-btn" type="button" data-place="'+i+'" '+(slots[i]?'disabled':'')+'><span>'+attr+'</span><b>'+(slots[i]?'OCUPADO':'ESCOLHER →')+'</b></button>').join('');
      options.querySelectorAll('[data-place]').forEach(button=>button.onclick=()=>{
        if(send('place',{slot:Number(button.dataset.place)}))options.querySelectorAll('button').forEach(b=>b.disabled=true);
      });
    }else{
      options.innerHTML='<div class="waiting-card">⏳ Aguardando o outro jogador escolher Força, Resistência, QI, Habilidade ou Velocidade.</div>';
    }
  }
  if(isReveal&&r.result){
    const win=r.result.winner,me=win===r.you,f=r.result.fighter;
    maybePhoto(f);
    $('reveal').innerHTML='<div class="section-eyebrow">🎯 ATRIBUTO ESCOLHIDO: '+ATTR[r.result.slot]+'</div><h3>'+(me?'🏆 VOCÊ GANHOU!':'⚔ '+safe(r.names[win]).toUpperCase()+' GANHOU!')+'</h3><p>'+safe(r.names[win])+' colocou <b>'+safe(f.name)+'</b> em <b>'+ATTR[r.result.slot]+'</b> por 🪙 '+r.result.price+'. Agora os poderes estão revelados.</p><div class="reveal-portrait">'+safe(f.emoji)+imageMarkup(f)+'</div>'+powerSummary(f)+'<p>O próximo personagem pode ser ainda mais forte!</p>';
  }
}
function submitBid(){
  const r=model.room;if(!r||r.phase!=='auction'||r.turn!==r.you)return;
  if(send('bid',{amount:r.bidMode==='neutral'?1:r.minimum})){$('placeBid').disabled=true;}
}
function avoidBid(){
  const r=model.room;if(!r||r.phase!=='auction'||r.turn!==r.you||r.bidMode==='buy')return;
  if(send('bid',{amount:r.bidMode==='neutral'?-1:r.minimum}))$('avoidBid').disabled=true;
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
  $('winnerSubtitle').textContent='Maior soma dos cinco atributos vence';
  $('battleScore0').textContent=data.totals[0];$('battleScore1').textContent=data.totals[1];
  $('battleTotal0').textContent=data.scores[0]+' categorias vencidas';$('battleTotal1').textContent=data.scores[1]+' categorias vencidas';
  $('battleRows').replaceChildren();
  // Mostrar os cinco confrontos juntos, sem animação que exija rolagem.
  data.details.forEach((item,i)=>{
      const row=document.createElement('div');row.className='battle-row';
      row.innerHTML=`<h3>${ATTR[i]}</h3><div class="duel-grid">${item.fighters.map((p,j)=>{maybePhoto(p);return `<div class="duelist ${item.winner===j?'win':''}"><div class="mini-avatar">${safe(p.emoji)}${imageMarkup(p)}</div><div style="flex:1;min-width:0"><small>${safe(p.name)}</small><strong>${p.value} PTS ${item.winner===j?'🏆':''}</strong><div class="power-bar"><span style="width:${p.value}%"></span></div></div></div>`;}).join('')}</div>`;
      $('battleRows').append(row);
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
$('avoidBid').addEventListener('click',avoidBid);
$('leaveMatch').addEventListener('click',()=>{if(confirm('Sair da partida? Seu adversário também voltará ao lobby.'))backLobby();});
$('goLobby').addEventListener('click',backLobby);
$('copyBattle').addEventListener('click',copyResult);
$('nickname').value=model.name;
show('lobby');renderLobby();renderOnline();
if(location.protocol!=='file:')fetch('./api/characters').then(r=>r.ok?r.json():[]).then(r=>model.roster=r).catch(()=>{});
connect();
