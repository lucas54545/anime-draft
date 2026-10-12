'use strict';
const $=id=>document.getElementById(id);
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const SESSION_KEY='anime_draft_session_v2';
const saved=(()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY))||{}}catch{return {}}})();
const model={socket:null,connected:false,name:saved.name||'',token:saved.token||makeToken(),logged:false,room:null,battle:null,invitation:null,online:[],roster:[]};
const photoCache=(()=>{try{return JSON.parse(localStorage.getItem('anime_draft_photos_v2'))||{}}catch{return {}}})();
let photoQueue=[],photoBusy=false,toastTimer=null,gameTimers=[];

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
  return `<img class="character-img ${extraClass}" data-character="${safe(person.id)}" src="${safe(url)}" alt="Foto de ${safe(person.name)}" loading="lazy" ${url?'':'hidden'} onerror="this.hidden=true">`;
}
function maybePhoto(person){
  if(!person||Object.prototype.hasOwnProperty.call(photoCache,person.id))return;
  if(photoQueue.some(x=>x.id===person.id))return;
  photoQueue.push(person);drainPhotos();
}
async function drainPhotos(){
  if(photoBusy||!photoQueue.length)return;
  photoBusy=true;
  while(photoQueue.length){
    const p=photoQueue.shift();
    if(Object.prototype.hasOwnProperty.call(photoCache,p.id))continue;
    try{
      const q=encodeURIComponent(p.name);
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
      const res=await fetch('https://api.jikan.moe/v4/characters?q='+q+'&limit=8',{signal:controller.signal});clearTimeout(timeout);
      if(res.ok){
        const body=await res.json();const choices=body.data||[];
        const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
        const target=norm(p.name);
        let best=choices.find(item=>norm(item.name)===target||norm(item.name).split(',').reverse().join('')===target)||choices[0];
        const url=best?.images?.jpg?.image_url||best?.images?.webp?.image_url;
        if(url&&/^https:\/\//.test(url)){
          photoCache[p.id]=url;
          document.querySelectorAll('img[data-character="'+CSS.escape(p.id)+'"]').forEach(img=>{img.src=url;img.hidden=false;});
          try{localStorage.setItem('anime_draft_photos_v2',JSON.stringify(photoCache));}catch{}
        }
      }
    }catch(e){console.debug('Imagem indisponível:',p.name);}
    await new Promise(r=>setTimeout(r,540));
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
  return `<div class="team-board"><h4>${safe(name)}</h4>${ATTR.map((attr,i)=>{const p=team[i];if(p)maybePhoto(p);return `<div class="team-slot"><div class="mini-avatar">${p?`${safe(p.emoji)}${imageMarkup(p)}`:'?'}</div><div class="team-slot-info"><small>${attr}</small><b>${p?safe(p.name):'Aguardando...'}</b>${p?`<span class="primary-stat">${safe(attr)}: <strong>${p.stats[i]}</strong> / 100</span>${powerSummary(p)}`:''}</div></div>`}).join('')}</div>`;
}
function renderArena(){
  show('arena');const r=model.room;if(!r)return;
  const myBudget=r.budgets[r.you];
  $('roundLabel').textContent=`RODADA ${String(Math.min(r.round+1,5)).padStart(2,'0')} / 05`;
  $('steps').innerHTML=Array.from({length:5},(_,i)=>`<span class="${i<r.round?'done':i===r.round?'active':''}"></span>`).join('');
  $('matchName0').textContent=r.names[0];$('matchName1').textContent=r.names[1];
  $('budget0').textContent=r.budgets[0];$('budget1').textContent=r.budgets[1];
  $('arenaPhase').textContent=r.phase==='auction'?'LEILÃO AO VIVO':'LANCES REVELADOS';
  $('auctionTitle').textContent=(r.phase==='auction'?'LEILÃO DE ':'VENCEDOR DO ')+ATTR[r.round];
  $('auctionCaption').textContent=r.phase==='auction'?'Ambos apostam em segredo no DESTAQUE. Quem vencer paga o lance; o adversário recebe o RESERVA de graça.':'Personagens distribuídos! Seus poderes agora estão visíveis no time de cada jogador.';
  $('auctionPair').innerHTML=r.offered.map((c,i)=>characterCard(c,i===0?'highlight':'backup')).join('');
  $('teamBoards').innerHTML=r.teams.map((team,i)=>teamBoard(team,r.names[i])).join('');
  $('biddingArea').hidden=r.phase!=='auction'||r.submitted[r.you];
  $('awaitBid').hidden=r.phase!=='auction'||!r.submitted[r.you];
  $('reveal').hidden=r.phase!=='reveal';
  $('budgetHint').textContent=myBudget;
  const slider=$('bidSlider');slider.max=myBudget;slider.value=Math.min(myBudget,Math.max(0,Math.min(+slider.value||3,myBudget)));
  $('bidMax').textContent=myBudget;$('bidValue').textContent=slider.value;
  if(r.phase==='auction' && r.submitted[r.you]) $('waitingMessage').textContent=r.submitted[1-r.you]?'Lances recebidos. Calculando...':'Esperando o lance de '+r.names[1-r.you]+'...';
  if(r.phase==='reveal' && r.result){
    const win=r.result.winner,they=win===r.you;
    $('reveal').innerHTML=`<div class="section-eyebrow">RESULTADO DO LEILÃO</div><h3>${they?'🏆 VOCÊ GANHOU O DESTAQUE!':'⚔ '+safe(r.names[win]).toUpperCase()+' LEVOU O DESTAQUE'}</h3><p>${safe(r.names[win])} ganhou <b>${safe(r.result.offers[0].name)}</b> por 🪙 ${r.result.price}. ${safe(r.names[1-win])} recebeu <b>${safe(r.result.offers[1].name)}</b> gratuitamente.</p><div class="reveal-powers">${r.result.offers.map((p,i)=>`<div class="reveal-fighter"><span>${safe(p.emoji)} ${safe(p.name)}</span>${powerSummary(p)}</div>`).join('')}</div><p>Próximo leilão em instantes…</p>`;
  }
}
function submitBid(){
  const r=model.room;if(!r||r.phase!=='auction'||r.submitted[r.you])return;
  const amount=+$('bidSlider').value;
  if(send('bid',{amount})){$('placeBid').disabled=true;setTimeout(()=>$('placeBid').disabled=false,800);}
}
function cancelTimers(){gameTimers.forEach(t=>clearTimeout(t));gameTimers=[];}
function renderBattle(data){
  cancelTimers();show('battle');
  $('battleName0').textContent=data.names[0];$('battleName1').textContent=data.names[1];
  $('winnerTitle').textContent=data.winner<0?'EMPATE ÉPICO!':data.names[data.winner].toUpperCase()+' VENCEU!';
  $('winnerSubtitle').textContent='Força • Resistência • QI • Habilidade • Velocidade';
  $('battleScore0').textContent=data.scores[0];$('battleScore1').textContent=data.scores[1];
  $('battleTotal0').textContent=data.totals[0]+' pontos';$('battleTotal1').textContent=data.totals[1]+' pontos';
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
  const txt=`⚔ ANIME DRAFT BATTLE\n${b.names[0]} ${b.scores[0]} x ${b.scores[1]} ${b.names[1]}\n${b.details.map(x=>x.attribute+': '+x.fighters[0].value+' x '+x.fighters[1].value).join('\n')}\n🏆 ${b.winner<0?'Empate':b.names[b.winner]}`;
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
$('bidSlider').addEventListener('input',()=>{$('bidValue').textContent=$('bidSlider').value;});
$('placeBid').addEventListener('click',submitBid);
$('leaveMatch').addEventListener('click',()=>{if(confirm('Sair da partida? Seu adversário também voltará ao lobby.'))backLobby();});
$('goLobby').addEventListener('click',backLobby);
$('copyBattle').addEventListener('click',copyResult);
$('nickname').value=model.name;
show('lobby');renderLobby();renderOnline();
if(location.protocol!=='file:')fetch('./api/characters').then(r=>r.ok?r.json():[]).then(r=>model.roster=r).catch(()=>{});
connect();
