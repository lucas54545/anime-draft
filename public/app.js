'use strict';
const $=id=>document.getElementById(id);
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const SESSION_KEY='anime_draft_session_v2';
const saved=(()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY))||{}}catch{return {}}})();
const model={socket:null,connected:false,name:saved.name||'',token:saved.token||makeToken(),logged:false,room:null,battle:null,invitation:null,online:[],roster:[]};
const photoCache=(()=>{try{return JSON.parse(localStorage.getItem('anime_draft_photos_v9'))||{}}catch{return {}}})();
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
function photoURL(id){return id==='satan'?'':typeof photoCache[id]==='string'?photoCache[id]:'';}
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
  const real=person.id==='satan'?(location.protocol==='file:'?'https://images.microcms-assets.io/assets/79a305090571443fb06a9260d669fe02/fc8a3dec2f03474cb5b0b1d81b9a1358/chara_satan.png':'/api/portrait/satan?v=9'):photoURL(person.id)||(location.protocol==='file:'?'':'/api/portrait/'+encodeURIComponent(person.id)+'?v=9');
  const url=real||fallback;
  return '<img class="character-img '+safe(extraClass)+'" data-character="'+safe(person.id)+'" data-fallback="'+safe(fallback)+'" src="'+safe(url)+'" alt="Retrato de '+safe(person.name)+'" loading="eager" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.fallback">';
}
// Matching images from Jikan's anime cast first, with a character search as fallback.
// The queries are cached so the same photo doesn't require new requests every round.
const NAME_ALIASES={goku:['Son Gokuu','Gokuu Son'],satan:['Mister Satan','Hercule Satan'],luffy:['Luffy, Monkey D.'],zoro:['Zoro, Roronoa'],deku:['Midoriya Izuku'],eren:['Eren Jaeger'],gohan:['Son Gohan'],kyubey:['Kyuubey'],rimuru:['Limule Tempest']};
// Elenco ampliado: usar elenco oficial do anime reduz retratos trocados e buscas individuais.
Object.assign(NAME_ALIASES,{
  satan:['Mr. Satan','Mister Satan','Hercule'],rimuru:['Rimuru Tempest','Limule Tempest'],
  killua:['Killua Zoldyck'],gon:['Gon Freecss'],kurapika:['Kurapika'],
  edward:['Edward Elric'],alphonse:['Alphonse Elric'],roy:['Roy Mustang'],
  lawliet:['L Lawliet','L'],light:['Light Yagami'],jinwoo:['Sung Jinwoo','Jinwoo Sung'],
  cha:['Cha Hae-In'],frierenstark:['Stark'],cc:['C.C.'],ash:['Satoshi'],
  okarun:['Ken Takakura','Okarun'],gintoki:['Gintoki Sakata'],pikachu:['Pikachu'],
  thorfinn:['Thorfinn'],tsukasa:['Tsukasa Shishiou'],shinra:['Shinra Kusakabe'],
  hinata:['Shouyou Hinata','Shoyo Hinata'],kageyama:['Tobio Kageyama'],
  albedo:['Albedo'],meliodas:['Meliodas'],goku:['Goku','Son Gokuu','Son Goku'],
  gojo:['Satoru Gojou','Gojo Satoru'],tanjiro:['Tanjirou Kamado'],
  lelouch:['Lelouch Lamperouge'],reigen:['Reigen Arataka'],eren:['Eren Yeager','Eren Jaeger']
});
const MAL_ANIME={
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
const castJobs=new Map();
const pendingIDs=new Set();
function normName(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function setImage(person,url){
  if(!url||!/^https:\/\//i.test(url))return;
  // Só salva fotos que carregam. URLs mortas não estragam os cards.
  const test=new Image();
  test.onload=()=>{
    photoCache[person.id]=url;pendingIDs.delete(person.id);
    document.querySelectorAll('img[data-character="'+CSS.escape(person.id)+'"]').forEach(img=>{
      img.onerror=function(){this.onerror=null;this.src=this.dataset.fallback};
      img.src=url;img.hidden=false;
    });
    try{localStorage.setItem('anime_draft_photos_v9',JSON.stringify(photoCache));}catch{}
  };
  test.onerror=()=>{};test.referrerPolicy='no-referrer';test.src=url;
}
function matchImage(p,items){
  const acceptable=new Set([p.name,...(NAME_ALIASES[p.id]||[])].map(normName));
  const matches=name=>{
    const norm=normName(name);
    const reversed=normName(String(name||'').split(',').reverse().join(' '));
    return acceptable.has(norm)||acceptable.has(reversed);
  };
  const found=(items||[]).find(x=>matches(x.name));
  if(found)setImage(p,found.images?.jpg?.image_url||found.images?.webp?.image_url);
}
async function fetchJSON(url,options={}){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),9500);
  try{
    const r=await fetch(url,{...options,signal:c.signal});
    if(!r.ok)throw new Error('HTTP '+r.status);
    return await r.json();
  }finally{clearTimeout(t);}
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
  if(!person || person.id==='satan' || photoURL(person.id)||pendingIDs.has(person.id))return;
  pendingIDs.add(person.id);photoQueue.unshift(person);drainPhotos();
}
async function drainPhotos(){
  if(photoBusy)return;photoBusy=true;
  while(photoQueue.length){
    const p=photoQueue.pop();
    if(photoURL(p.id)){pendingIDs.delete(p.id);continue;}
    try{
      // 1. Personagem por anime, preservando a identidade correta.
      await fetchAnimeCast(p.anime);
      // 2. Procura nomes alternativos no MyAnimeList.
      if(!photoURL(p.id)){
        for(const name of [p.name,...(NAME_ALIASES[p.id]||[])].slice(0,3)){
          const body=await fetchJSON('https://api.jikan.moe/v4/characters?q='+encodeURIComponent(name)+'&limit=15');
          matchImage(p,body.data||[]);
          if(photoURL(p.id))break;
        }
      }
      // 3. AniList como fonte extra se MyAnimeList não localizou retrato.
      if(!photoURL(p.id)){
        const query='query($search:String){Character(search:$search){name{full}image{large}}}';
        for(const name of [p.name,...(NAME_ALIASES[p.id]||[])].slice(0,2)){
          const body=await fetchJSON('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{search:name}})});
          const c=body.data?.Character;
          if(c&&new Set([p.name,...(NAME_ALIASES[p.id]||[])].map(normName)).has(normName(c.name?.full))){
            setImage(p,c.image?.large);
            break;
          }
        }
      }
    }catch(e){console.debug('Retrato externo indisponível:',p.name,e.message);}
    pendingIDs.delete(p.id);
    await new Promise(resolve=>setTimeout(resolve,480));
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
  return '<div class="team-board compact-team"><h4>'+safe(name)+
    '<span class="team-running-total">⚡ '+partial+' PTS</span></h4>'+
    ATTR.map((attr,i)=>{
      const p=team[i];
      if(p)maybePhoto(p);
      return '<div class="team-slot compact-slot">'+
        '<div class="mini-avatar">'+(p?imageMarkup(p):'?')+'</div>'+
        '<div class="team-slot-info"><small>'+safe(attr)+'</small>'+
        '<b>'+(p?safe(p.name):'Vazio')+'</b></div>'+
        '<strong class="slot-score">'+(p?p.stats[i]:'—')+'</strong></div>';
    }).join('')+'</div>';
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
  $('passBid').disabled=!myTurn||r.bidMode==='neutral'||remain<=0;
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
  $('bidLeader').textContent=r.leader<0?'Primeiro lance: comprar +1 ou evitar -1.':r.bidMode==='avoid'?r.names[r.leader]+' queimará '+Math.abs(r.currentBid)+' moedas para evitar este personagem.':r.names[r.leader]+' está ganhando por '+r.currentBid+' moedas.';
  $('budgetHint').textContent=myBudget;
  $('bidValue').textContent=r.currentBid;
  $('placeBid').textContent='⚡ COMPRAR +'+(r.bidMode==='neutral'?1:r.minimum);
  $('avoidBid').textContent='🛡️ EVITAR '+(r.bidMode==='neutral'?-1:r.minimum);
  $('placeBid').hidden=r.bidMode==='avoid';
  $('avoidBid').hidden=r.bidMode==='buy'||!r.canAvoid;
  // Pegar grátis só fica disponível após um lance negativo.
  // Após um lance positivo, a outra opção é desistir (não pegar grátis).
  $('passBid').hidden=r.bidMode==='neutral';
  $('passBid').textContent=r.bidMode==='avoid'?'✅ PEGAR GRÁTIS':'✋ DESISTIR';
  $('waitingMessage').textContent=r.bidMode==='neutral'?r.names[r.turn]+' tem 10 segundos para abrir o leilão.':r.names[r.turn]+' tem 10 segundos para responder ao lance.';
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
  const r=model.room;if(!r||r.phase!=='auction'||r.turn!==r.you||r.bidMode==='neutral')return;
  if(send('pass')){$('passBid').disabled=true;}
}
function cancelTimers(){clearInterval(auctionClock);auctionClock=null;gameTimers.forEach(t=>clearTimeout(t));gameTimers=[];}
function renderBattle(data){
  cancelTimers();show('battle');
  $('battleName0').textContent=data.names[0];$('battleName1').textContent=data.names[1];
  $('winnerTitle').textContent=data.winner<0?'EMPATE!':data.names[data.winner].toUpperCase()+' VENCEU!';
  $('winnerSubtitle').textContent='Maior soma dos cinco atributos vence';
  $('battleScore0').textContent=data.totals[0];$('battleScore1').textContent=data.totals[1];
  $('battleTotal0').textContent=data.scores[0]+' atributos vencidos';
  $('battleTotal1').textContent=data.scores[1]+' atributos vencidos';
  const area=$('battleRows');
  area.innerHTML='<div class="battle-lane-head"><span>'+safe(data.names[0])+'</span><span>FOTOS NO CENTRO</span><span>'+safe(data.names[1])+'</span></div>';
  data.details.forEach((item,i)=>{
    const left=item.fighters[0],right=item.fighters[1];
    maybePhoto(left);maybePhoto(right);
    const row=document.createElement('div');row.className='battle-row battle-row-v9';
    row.innerHTML=`<div class="versus-text left ${item.winner===0?'win':''}"><small>JOGADOR 1</small><b>${safe(left.name)}</b><strong>${left.value}</strong></div><div class="versus-middle"><div class="middle-photos"><div class="mid-photo ${item.winner===0?'win':''}">${imageMarkup(left)}</div><div class="mid-vs-wrap"><span>VS</span><em>${safe(ATTR[i])}</em></div><div class="mid-photo ${item.winner===1?'win':''}">${imageMarkup(right)}</div></div></div><div class="versus-text right ${item.winner===1?'win':''}"><small>JOGADOR 2</small><b>${safe(right.name)}</b><strong>${right.value}</strong></div>`;
    area.append(row);
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
