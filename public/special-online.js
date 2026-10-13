(() => {
'use strict';
/* Interface V13: multiplayer dos cinco modos, usando o socket autenticado do app.js. */
const $=id=>document.getElementById(id);
const NAMES={mystery:'🎭 LEILÃO MISTERIOSO',roulette:'🎰 ROLETA',ffa:'👑 TODOS CONTRA TODOS',
  direct:'⚔️ PERSONAGENS 5v5',tournament:'🏆 TORNEIO'};
const COUNTS={mystery:2,roulette:2,ffa:4,direct:2,tournament:8};
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const RARITY={'Comum':'common','Raro':'rare','Épico':'epic','Lendário':'legendary','Mítico':'mythic'};
const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const btn=(text,id,secondary=false)=>'<button id="'+id+'" class="btn '+(secondary?'btn-outline':'btn-primary')+'" type="button">'+text+'</button>';
const root=()=> $('specialContent');
const send=(type,extra={})=>window.animeSpecialSend?.(type,extra);
const connected=()=>window.animeSpecialConnected?.()||false;
const notify=s=>window.animeSpecialToast?.(s);
const screen=()=>window.animeSpecialShow?.('special');
const portrait=p=>{
  if(!p)return '<div class="sp-photo sp-unknown">?</div>';
  try{window.maybePhoto?.(p)}catch{}
  const markup=window.imageMarkup?window.imageMarkup(p):escape(p.emoji||'⚔️');
  return '<div class="sp-photo">'+markup+'</div>';
};
const rarity=p=>p?.rarity?'<span class="rarity-chip rarity-'+(RARITY[p.rarity]||'common')+'">✦ '+escape(p.rarity)+(p.rating?' · '+p.rating:'')+'</span>':'';
let state=null,clock=null,pendingChoice=false;
function clockClear(){if(clock){clearInterval(clock);clock=null}}
function startClock(deadline){
  clockClear();
  if(!deadline)return;
  const update=()=>{
    const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000)),el=$('spClock');
    if(el){el.textContent=seconds;el.classList.toggle('urgent-text',seconds<=3)}
  };
  update();clock=setInterval(update,225);
}
function headline(title,sub){
  return '<div class="sp-heading"><span class="phase-pill">🌐 MULTIPLAYER ONLINE</span><h2>'+escape(title)+'</h2><p>'+escape(sub||'')+'</p></div>';
}
function leaveButton(){return '<div class="sp-bottom">'+btn('← SAIR DA SALA','spLeave',true)+'</div>';}
function attachLeave(){
  const el=$('spLeave');if(el)el.onclick=()=>{
    if(confirm('Sair desta sala online? A partida será encerrada para todos.'))send('special_leave');
  };
}
function enterLobby(mode){
  if(!connected()){notify('Entre com um apelido e conecte-se ao servidor multiplayer antes de criar salas online.');return;}
  if(!COUNTS[mode])return;
  if(send('special_create',{mode})){pendingChoice=false;notify('Criando sala '+NAMES[mode]+'...')}
}
function joinCode(){
  if(!connected()){notify('Para entrar na sala, o servidor precisa estar CONECTADO.');return;}
  const code=$('specialOnlineCodeInput')?.value?.trim().toUpperCase()||'';
  if(!/^[A-Z2-9]{6}$/.test(code)){notify('Digite o código de 6 caracteres que seu amigo enviou.');return;}
  send('special_join',{code});
}
async function copyLink(code){
  const link=location.origin+location.pathname+'?special='+encodeURIComponent(code);
  try{await navigator.clipboard.writeText(link);notify('Link da sala copiado! Envie aos seus amigos.')}
  catch{if(typeof prompt==='function')prompt('Copie o link:',link);else notify('Código da sala: '+code);}
}
function showLobby(data){
  state=data;pendingChoice=false;clockClear();screen();
  root().innerHTML=headline(NAMES[data.mode]||'MODO ONLINE',
    'Sala criada! Compartilhe o código. O jogo começa automaticamente quando todas as pessoas entrarem.')+
    '<div class="sp-code-panel"><small>CÓDIGO DA SALA MULTIPLAYER</small><h2>'+escape(data.code)+'</h2>'+
      '<p>'+data.members.length+' / '+data.needed+' jogadores conectados à sala</p>'+
      '<div class="sp-code-actions">'+btn('📋 COPIAR LINK DA SALA','spCopy')+btn('← SAIR','spLeave',true)+'</div></div>'+
    '<div class="sp-waiting-grid">'+Array.from({length:data.needed},(_,i)=>'<div class="sp-wait-person '+(data.members[i]?'ready':'')+'">'+
      '<span>'+(data.members[i]?'⚡':'○')+'</span><b>'+escape(data.members[i]||'Aguardando jogador...')+'</b></div>').join('')+'</div>'+
    '<p class="sp-help">Todos devem abrir o mesmo site, clicar em Entrar na Arena, digitar seus apelidos e entrar usando o código.</p>';
  $('spCopy').onclick=()=>copyLink(data.code);attachLeave();
}
function teamRows(data){
  const labels=data.mode==='direct'?Array.from({length:5},(_,i)=>'PERSONAGEM '+(i+1)):ATTR;
  return '<details class="auction-history sp-team-details"><summary>⚔️ VER EQUIPES E PERSONAGENS</summary>'+
    '<div class="sp-team-grid">'+data.teams.map((team,i)=>'<div class="sp-team-entry"><b>'+escape(data.names[i])+' · 🪙 '+(data.budgets?.[i]??0)+'</b>'+
      Array.from({length:5},(_,j)=>{
        const p=team[j]||null;
        return '<div class="sp-team-character"><span>'+labels[j]+'</span><b>'+escape(p?.name||'—')+'</b><strong>'+(p?.stats?(data.mode==='direct'?p.stats.reduce((a,b)=>a+b,0):p.stats[j]):'?')+'</strong></div>';
      }).join('')+'</div>').join('')+'</div></details>';
}
function history(data){
  if(!data.history?.length)return '';
  return '<details class="auction-history sp-history"><summary>📜 HISTÓRICO DOS LEILÕES · '+data.history.length+' / '+data.max+'</summary>'+
    '<div class="history-list">'+data.history.map(x=>'<div class="history-entry"><span class="history-round">#'+x.round+'</span>'+
      '<div class="history-info"><b>'+escape(x.character.name)+'</b><small>'+escape(data.names[x.winner])+' · '+ATTR[x.slot]+'</small></div>'+
      rarity(x)+'<strong class="history-price">'+(x.price<0?'🕳️ '+Math.abs(x.price):'🪙 '+x.price)+'</strong></div>').join('')+'</div></details>';
}
function bracketView(bracket){
  if(!bracket)return '';
  const labels=['QUARTAS DE FINAL','SEMIFINAIS','GRANDE FINAL'];
  const rows=[...bracket.history.map(x=>x),{stage:bracket.stage,matches:bracket.current}];
  const unique=new Map(rows.map(r=>[r.stage,r]));
  return '<details class="tournament-bracket" open><summary>🏆 CHAVEAMENTO REAL — 8 JOGADORES</summary>'+
    [...unique.values()].map(r=>'<div class="tournament-stage"><h4>'+labels[r.stage]+'</h4>'+
      r.matches.map(m=>'<div class="tournament-pair"><span class="'+(m.winner===m.names[0]?'advanced':'')+'">'+escape(m.names[0])+'</span>'+
        '<b>VS</b><span class="'+(m.winner===m.names[1]?'advanced':'')+'">'+escape(m.names[1])+'</span>'+
        '</div><small>'+escape(m.winner?'🏅 '+m.winner:m.status||'Em andamento')+'</small>').join('')+'</div>').join('')+'</details>';
}
function actionInfo(data){
  const step=data.round+1;
  return '<div class="sp-round-header"><span>'+escape(NAMES[data.mode]||'PARTIDA')+'</span>'+
    '<b>'+ (data.mode==='tournament'?['QUARTAS','SEMIFINAL','FINAL'][data.bracket?.stage||0]+' · ':'')+
    'LEILÃO '+step+' / '+data.max+'</b></div>';
}
function auctionCard(data){
  const p=data.current;if(!p)return '';
  const hidden=p.name==='PERSONAGEM MISTERIOSO';
  return '<div class="sp-current-card '+(hidden?'secret':'')+'">'+(hidden?
    '<div class="sp-photo sp-unknown"><strong>?</strong><span>🎭 MISTÉRIO</span></div>':portrait(p))+
    '<div><span>PERSONAGEM DA RODADA</span><h3>'+escape(p.name)+'</h3>'+
    '<p>'+escape(p.anime)+'</p><small>🔒 PODER E RARIDADE OCULTOS ATÉ A ESCOLHA</small></div></div>';
}
function rowOfWallets(data){
  return '<div class="sp-wallet-grid">'+data.names.map((name,i)=>
    '<div class="sp-wallet '+(data.turn===i&&data.phase==='auction'?'active':'')+'"><b>'+escape(name)+'</b>'+
    '<span>🪙 '+data.budgets[i]+' <small>'+data.teams[i].filter(Boolean).length+'/5 personagens</small></span></div>'
  ).join('')+'</div>';
}
function renderAuction(data){
  const mine=data.turn===data.you,neutral=data.bidMode==='neutral';
  const anyBid=data.lead>=0;
  const amount=data.bidMode==='neutral'?1:data.minimum,avoidAmount=data.bidMode==='neutral'?-1:data.minimum;
  const canBuy=amount>0&&amount<=data.budgets[data.you]&&data.teams[data.you].some(x=>x===null);
  const canAvoid=data.canAvoid&&avoidAmount<0&&Math.abs(avoidAmount)<=data.budgets[data.you];
  let controls='';
  if(mine){
    controls='<div class="sp-bid-actions">'+
      (data.bidMode==='avoid'?'':btn('⚡ OFERECER +'+amount,'spBid'))+
      (data.bidMode==='buy'||data.mode==='ffa'||!canAvoid?'':btn('🛡️ EVITAR '+avoidAmount,'spAvoid',true))+
      (anyBid?btn(data.bidMode==='avoid'?'✅ PEGAR GRÁTIS':'✋ DESISTIR','spPass',true):'')+'</div>';
  }
  return headline(NAMES[data.mode],data.mode==='ffa'?
    'Quatro jogadores, 20 leilões e cinco personagens por pessoa. Lances por turno, com 10 segundos para responder.':
    (data.mode==='direct'?'5v5 online: 10 leilões e 50 moedas por pessoa. O time que somar mais poder dos cinco personagens vence.':'Dez leilões, dez segundos por resposta. A raridade aparece somente depois da posição escolhida.'))+
    actionInfo(data)+bracketView(data.bracket)+
    (data.event?'<div class="roulette-event"><div class="roulette-wheel">🎰</div><div><span>EFEITO DA RODADA</span><h3>'+escape(data.event.name)+'</h3><p>'+escape(data.event.description)+'</p></div></div>':'')+
    rowOfWallets(data)+auctionCard(data)+
    '<div class="sp-auction-panel"><div><small>LANCE ATUAL</small><strong>🪙 '+data.bid+'</strong></div>'+
    '<div><small>TEMPO PARA RESPONDER</small><strong id="spClock">—</strong></div></div>'+
    '<div class="sp-turn-panel"><b>'+(mine?'🎯 É SUA VEZ!':escape(data.names[data.turn])+' está decidindo...')+'</b>'+
    '<p>'+(neutral?'O primeiro lance deve ser +1 ou -1. Não é possível pegar grátis antes de alguém dar um lance.':
        'Maior lance: '+escape(data.names[data.lead])+
        (data.bidMode==='avoid'?' evita o personagem e perde as moedas no limbo.':' está vencendo o leilão.'))+'</p>'+
    controls+'</div>'+teamRows(data)+history(data)+leaveButton();
}
function renderPlace(data){
  const yours=data.placer===data.you,p=data.current;
  const positions=data.mode==='direct'?Array.from({length:5},(_,i)=>'⚔️ PERSONAGEM '+(i+1)):ATTR;
  return headline('🎯 ESCOLHA A POSIÇÃO',yours?
    'Seu time recebeu o personagem. Escolha o lugar antes dos poderes aparecerem.':
    escape(data.names[data.placer])+' está escolhendo o lugar do personagem.')+
    actionInfo(data)+bracketView(data.bracket)+rowOfWallets(data)+auctionCard(data)+
    '<p class="sp-pick-note">⏱️ <b id="spClock">—</b> segundos para a escolha. Se o tempo acabar, uma posição livre é preenchida automaticamente.</p>'+
    (yours?'<div class="placement-options">'+positions.map((a,i)=>'<button type="button" class="position-btn" data-sp-slot="'+i+'" '+(data.teams[data.you][i]?'disabled':'')+'><span>'+a+'</span><b>'+(data.teams[data.you][i]?'OCUPADO':'ESCOLHER →')+'</b></button>').join('')+'</div>':
      '<div class="waiting-card">⏳ Aguarde a outra pessoa escolher a posição.</div>')+
    teamRows(data)+history(data)+leaveButton();
}
function renderReveal(data){
  const p=data.result?.fighter;
  const position=data.mode==='direct'?'PERSONAGEM '+(data.result.slot+1):ATTR[data.result?.slot];
  return headline('✨ PODER REVELADO!',escape(data.names[data.result?.winner]||'Jogador')+' ficou com o personagem!')+
    actionInfo(data)+bracketView(data.bracket)+rowOfWallets(data)+
    '<div class="sp-revealed">'+portrait(p)+'<div><h3>'+escape(p?.name||'Personagem')+'</h3>'+rarity(p)+
    '<p>Posição: '+position+'</p><div class="sp-stats">'+ATTR.map((a,i)=>'<span>'+a+' <b>'+p.stats[i]+'</b></span>').join('')+'</div>'+
    '<small>Próximo leilão inicia automaticamente.</small></div></div>'+teamRows(data)+history(data)+leaveButton();
}
function renderState(data){
  state=data;pendingChoice=false;clockClear();screen();
  let html;
  html=data.phase==='auction'?renderAuction(data):data.phase==='place'?renderPlace(data):renderReveal(data);
  root().innerHTML=html;
  if(data.phase==='auction'){
    if($('spBid')){
      const amount=data.bidMode==='neutral'?1:data.minimum;
      $('spBid').disabled=amount>data.budgets[data.you]||!data.teams[data.you].some(x=>x===null);
      $('spBid').onclick=()=>send('special_bid',{amount});
    }
    if($('spAvoid'))$('spAvoid').onclick=()=>send('special_bid',{amount:data.bidMode==='neutral'?-1:data.minimum});
    if($('spPass'))$('spPass').onclick=()=>send('special_pass');
  }
  if(data.phase==='place'){
    root().querySelectorAll('[data-sp-slot]').forEach(b=>b.onclick=()=>{
      if(pendingChoice)return;
      pendingChoice=true;
      send('special_place',{slot:Number(b.dataset.spSlot)});
      root().querySelectorAll('[data-sp-slot]').forEach(x=>x.disabled=true);
    });
  }
  startClock(data.deadline);attachLeave();
}
function resultRows(battle){
  if(battle.bouts){
    return '<div class="direct-history">'+battle.bouts.map((bout,i)=>'<div class="direct-history-row"><span>DUEL '+(i+1)+'</span>'+
      bout.fighters.map((p,j)=>'<div class="'+(bout.winner===j?'winner':'')+'">'+portrait(p)+'<b>'+escape(p.name)+'</b><strong>'+bout.powers[j]+'</strong></div>').join('<b>VS</b>')+
      '</div>').join('')+'</div>';
  }
  return '<div class="sp-results-table">'+battle.details.map(d=>'<div class="sp-result-row"><strong>'+escape(d.attribute)+'</strong>'+
    '<div>'+d.fighters.map((p,i)=>'<span class="'+(d.winner===i?'winner':'')+'">'+
      (p?portrait(p):'')+'<small>'+escape(p?.name||'—')+'</small><b>'+ (p?.value??'—')+'</b></span>').join('')+'</div></div>').join('')+'</div>';
}
function renderResult(data){
  state=data;clockClear();screen();
  const battle=data.battle,mode=data.mode;
  const winner=battle.winner;
  const title=winner<0?'EMPATE!':escape(battle.names[winner]||'Jogador')+' VENCEU!';
  root().innerHTML=headline('🏆 '+title,mode==='direct'?'5v5 concluído! A pontuação é a soma de TODOS os atributos dos cinco personagens. Cada jogador começou com 50 moedas.':'Partida concluída no servidor, com resultados iguais para todos os participantes.')+
    (data.stage!==undefined?'<p class="tournament-active">ETAPA '+(['QUARTAS DE FINAL','SEMIFINAL','FINAL'][data.stage]||'')+'</p>':'')+
    '<div class="sp-result-score">'+battle.names.map((name,i)=>'<div><small>'+escape(name)+'</small><b>⚡ '+(battle.totals?.[i]??battle.scores?.[i]??0)+'</b></div>').join('')+'</div>'+
    resultRows(battle)+bracketView(data.bracket)+
    (data.waiting?'<p class="sp-help">Aguarde o término das demais partidas para continuar no torneio.</p>':
      '<div class="sp-replay-box"><p>Revanche: todos devem aceitar para iniciar outra partida.</p>'+btn('🔄 PEDIR REVANCHE','spReplay')+
      '<small id="spVoteCount">0 / '+(data.needed||2)+' confirmaram.</small></div>')+leaveButton();
  if($('spReplay'))$('spReplay').onclick=()=>{$('spReplay').disabled=true;send('special_replay');};
  attachLeave();
}
function renderTournamentStatus(data){
  state=data;clockClear();screen();
  root().innerHTML=headline('🏆 TORNEIO ONLINE','Acompanhe o mata-mata enquanto os outros confrontos terminam.')+
    '<p class="tournament-verdict">'+escape(data.status)+'</p>'+
    bracketView(data.bracket)+'<p class="sp-help">Quando chegar sua próxima fase, a partida começará automaticamente.</p>'+leaveButton();
  attachLeave();
}
function renderChampion(data){
  state=data;clockClear();screen();
  root().innerHTML=headline('🏆 CAMPEÃO DO TORNEIO','Oito jogadores participaram de um torneio eliminatório online.')+
    '<div class="tournament-verdict">👑 '+escape(data.champion)+' É O CAMPEÃO!</div>'+
    bracketView(data.bracket)+
    '<div class="sp-replay-box"><p>Os oito participantes precisam concordar para recomeçar.</p>'+
      btn('🔄 NOVO TORNEIO','spReplay')+'<small id="spVoteCount">'+(data.voted||0)+' / 8 confirmaram.</small></div>'+
    leaveButton();
  $('spReplay').onclick=()=>{$('spReplay').disabled=true;send('special_replay');};attachLeave();
}
function handle(data){
  if(!data?.type?.startsWith('special_'))return;
  if(data.type==='special_left'){
    state=null;clockClear();window.animeSpecialShow?.('lobby');notify(data.reason||'Você saiu da partida.');return;
  }
  if(data.type==='special_lobby')showLobby(data);
  else if(data.type==='special_state')renderState(data);
  else if(data.type==='special_result')renderResult(data);
  else if(data.type==='special_tournament_status')renderTournamentStatus(data);
  else if(data.type==='special_tournament_champion')renderChampion(data);
  else if(data.type==='special_vote'){
    const p=$('spVoteCount');if(p)p.textContent=data.voted+' / '+data.needed+' confirmaram.';
  }
}
window.addEventListener('anime-special',ev=>handle(ev.detail));
const starts=[
  ['onlineMysteryBtn','mystery'],
  ['onlineRouletteBtn','roulette'],
  ['onlineTournamentBtn','tournament'],
  ['onlineFfaBtn','ffa'],
  ['onlineDirectBtn','direct']
];
for(const [button,mode] of starts)$(button).addEventListener('click',()=>enterLobby(mode));
$('specialOnlineJoinBtn').addEventListener('click',joinCode);
$('specialOnlineCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter')joinCode();});
try{
  const code=new URLSearchParams(location.search).get('special');
  if(code&&/^[A-Z2-9]{6}$/i.test(code))$('specialOnlineCodeInput').value=code.toUpperCase();
}catch{}
})();