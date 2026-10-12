(() => {
'use strict';
const roster = window.ANIME_ROSTER || [];
const attrNames=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const $el=id=>document.getElementById(id);
const htmlEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null;
const button=(label,id,theme='btn-primary')=>`<button type="button" class="btn ${theme}" id="${id}">${label}</button>`;
const content=()=>$el('offlineContent');
const sum=p=>p.stats.reduce((a,b)=>a+b,0);
const getRandom=n=>Math.floor(Math.random()*n);
const statHTML=p=>`<div class="local-power"><div class="local-power-total">⚡ PODER TOTAL <b>${sum(p)}</b></div><div class="local-stats">${attrNames.map((a,i)=>`<span>${a.split(' ').slice(1).join(' ')} <strong>${p.stats[i]}</strong></span>`).join('')}</div></div>`;
const characterImg=p=>{
  if(typeof window.maybePhoto==='function') window.maybePhoto(p);
  const photo=(typeof window.imageMarkup==='function')?window.imageMarkup(p):'';
  return `<div class="offline-portrait"><span>${htmlEscape(p.emoji)}</span>${photo}</div>`;
};
function teamHTML(i){
  return `<div class="offline-team"><div class="offline-team-head"><b>${htmlEscape(state.names[i])}</b><span>🪙 ${state.budgets[i]} / 20</span></div>${attrNames.map((a,k)=>{
    const p=state.teams[i][k];return `<div class="offline-slot"><span class="offline-slot-ico">${p?htmlEscape(p.emoji):'❔'}</span><div><small>${a}</small><strong>${p?htmlEscape(p.name):'Aguardando leilão'}</strong>${p?statHTML(p):''}</div></div>`;
  }).join('')}</div>`;
}
function teamDisplay(){return `<div class="offline-teams">${teamHTML(0)}${teamHTML(1)}</div>`}
function auctionCard(p,role){return `<div class="offline-card"><div class="offline-card-art">${characterImg(p)}<span class="offline-tag">${role}</span></div><div class="offline-card-copy"><small>${htmlEscape(p.anime)}</small><strong>${htmlEscape(p.name)}</strong><div class="offline-unknown">🔒 FORÇA · RESISTÊNCIA · QI<br>HABILIDADE · VELOCIDADE: <b>???</b></div></div></div>`}
function deck(){
  const used=new Set(state.teams.flat().map(p=>p.id));
  const left=roster.filter(p=>!used.has(p.id));
  // Draw stronger and weaker characters unpredictably: powers hidden from buyers.
  const a=left[getRandom(left.length)];
  const other=left.filter(p=>p.id!==a.id);
  const b=other[getRandom(other.length)];
  state.pair=[a,b];state.bids=[null,null];state.turn=0;state.phase='auction';renderAuction();
}
function start(mode){
  const name=($el('nickname')?.value||'Jogador 1').trim()||'Jogador 1';
  const opponent=mode==='bot'?'BOT': 'Jogador 2';
  state={mode,names:[name,opponent],budgets:[20,20],teams:[[],[]],round:0,pair:[],bids:[null,null],turn:0,phase:'names'};
  show('offline');
  $el('netLabel').textContent=model.connected?'ONLINE + LOCAL':'MODO LOCAL';
  content().innerHTML=`<div class="offline-topline"><span class="phase-pill">🎮 ${mode==='bot'?'CONTRA BOT':'2 JOGADORES LOCAIS'}</span><span>🪙 20 MOEDAS CADA</span></div><h3 class="offline-title">PREPARE OS JOGADORES</h3><p class="offline-desc">São cinco rodadas. Quem vencer o lance recebe o personagem de destaque; o outro recebe o reserva. Os poderes aparecem após a compra.</p><div class="offline-fields"><label class="field-label">JOGADOR 1<input id="offlineName0" maxlength="20" value="${htmlEscape(name)}"/></label>${mode==='local'?`<label class="field-label">JOGADOR 2<input id="offlineName1" maxlength="20" value="${htmlEscape(opponent)}"/></label>`:''}</div><div class="offline-actions">${button('COMEÇAR LEILÃO →','offlineStart')}${button('← VOLTAR','offlineBack','btn-outline')}</div>`;
  $el('offlineStart').onclick=()=>{state.names[0]=$el('offlineName0').value.trim().slice(0,20)||'Jogador 1';if(mode==='local')state.names[1]=$el('offlineName1').value.trim().slice(0,20)||'Jogador 2';deck()};
  $el('offlineBack').onclick=returnLobby;
}
function returnLobby(){state=null;show('lobby');}
function header(title,desc=''){
  return `<div class="offline-topline"><span class="phase-pill">⚡ RODADA ${state.round+1} / 5</span><span>⚔️ ${attrNames[state.round]}</span></div><h3 class="offline-title">${title}</h3><p class="offline-desc">${desc}</p><div class="offline-progress">${attrNames.map((a,i)=>`<span class="${i<state.round?'done':i===state.round?'current':''}"></span>`).join('')}</div>`;
}
function renderAuction(){
  state.phase='auction';
  const i=state.turn;
  const canBid=state.budgets[i];
  content().innerHTML=header('LEILÃO SECRETO','O poder dos personagens fica escondido até o resultado do leilão. Os dois times serão comparados no final.')+
    `<div class="offline-budgets"><div><b>${htmlEscape(state.names[0])}</b><span>🪙 ${state.budgets[0]} moedas</span></div><strong>VS</strong><div><b>${htmlEscape(state.names[1])}</b><span>🪙 ${state.budgets[1]} moedas</span></div></div>`+
    `<div class="auction-pair">${auctionCard(state.pair[0],'⭐ DESTAQUE')}${auctionCard(state.pair[1],'🎲 RESERVA')}</div>`+
    `<div class="offline-bidbox"><div class="offline-bidline"><div><span class="section-eyebrow">VEZ DE</span><h3>${htmlEscape(state.names[i])}</h3></div><div class="offline-current">🪙 <strong id="localBidNumber">${Math.min(3,canBid)}</strong></div></div><input id="localBidRange" class="range" type="range" min="0" max="${canBid}" value="${Math.min(3,canBid)}" step="1" aria-label="Seu lance"/><div class="range-ends"><span>0 moedas</span><span>${canBid} moedas</span></div>${button('🔒 CONFIRMAR LANCE','localConfirm')}</div>`+
    `<div class="offline-subtitle">✦ TIMES ATUAIS • PODERES REVELADOS APÓS A COMPRA</div>${teamDisplay()}<div class="offline-actions">${button('← SAIR DO JOGO','localExit','btn-outline')}</div>`;
  $el('localBidRange').oninput=()=>{$el('localBidNumber').textContent=$el('localBidRange').value};
  $el('localConfirm').onclick=()=>bid(Number($el('localBidRange').value));
  $el('localExit').onclick=()=>{if(confirm('Deseja sair desta partida?'))returnLobby()};
}
function bid(n){
  if(!state||state.phase!=='auction')return;
  state.bids[state.turn]=Math.max(0,Math.min(state.budgets[state.turn],Math.floor(n)));
  if(state.mode==='bot'){
    const otherBudget=state.budgets[1];
    const botBid=Math.min(otherBudget,Math.max(0,Math.round(state.pair[0].stats[state.round]/26+Math.random()*3-1)));
    state.bids[1]=botBid;
    reveal();
  }else if(state.turn===0){
    state.turn=1;state.phase='pass';
    content().innerHTML=header('LANCE REGISTRADO','Passe o aparelho ao segundo jogador. O lance de '+htmlEscape(state.names[0])+' está escondido.')+
      `<div class="offline-pass"><span>🔒</span><h3>${htmlEscape(state.names[1])}, SUA VEZ!</h3><p>Não mostre seu lance ao adversário.</p>${button('COMEÇAR MEU LANCE →','offlinePass')}</div>`;
    $el('offlinePass').onclick=renderAuction;
  }else reveal();
}
function reveal(){
  state.phase='reveal';
  const [bid0,bid1]=state.bids;
  const winner=bid0===bid1?state.round%2:(bid0>bid1?0:1);
  state.budgets[winner]-=state.bids[winner];
  state.teams[winner].push(state.pair[0]);state.teams[1-winner].push(state.pair[1]);
  content().innerHTML=header('PERSONAGENS REVELADOS!','O leilão terminou. Agora você pode ver todos os atributos dos personagens adquiridos.')+
    `<div class="offline-winner"><span>🏆 DESTAQUE ARREMATADO</span><h3>${htmlEscape(state.names[winner])}</h3><p>Pagou <b>${state.bids[winner]} moedas</b> por ${htmlEscape(state.pair[0].name)}. ${htmlEscape(state.names[1-winner])} recebeu ${htmlEscape(state.pair[1].name)} gratuitamente.</p></div>`+
    `<div class="offline-revealpair">${state.pair.map(p=>`<div class="offline-revealcard">${characterImg(p)}<h4>${htmlEscape(p.name)}</h4>${statHTML(p)}</div>`).join('')}</div>`+
    `<div class="offline-subtitle">⚔️ TIMES DEPOIS DO LEILÃO</div>${teamDisplay()}<div class="offline-actions">${button(state.round===4?'⚔️ INICIAR BATALHA FINAL':'PRÓXIMO LEILÃO →','localNext')}</div>`;
  $el('localNext').onclick=()=>{if(state.round===4){battle();return}state.round++;deck()};
}
function battle(){
  state.phase='battle';
  let scores=[0,0],totals=[0,0];
  const rounds=attrNames.map((a,i)=>{
    const p=state.teams[0][i],q=state.teams[1][i];
    const x=p.stats[i],y=q.stats[i];
    totals[0]+=x;totals[1]+=y;
    if(x>y)scores[0]++;else if(y>x)scores[1]++;
    const winner=x>y?0:y>x?1:-1;
    return `<div class="offline-fight"><div class="offline-fight-label">${a}</div><div class="offline-fight-row"><div class="${winner===0?'winner':''}"><div class="duel-name">${htmlEscape(p.emoji)} ${htmlEscape(p.name)}</div><strong>${x}</strong><div class="power-bar"><span style="width:${x}%"></span></div></div><b>VS</b><div class="${winner===1?'winner':''}"><div class="duel-name">${htmlEscape(q.emoji)} ${htmlEscape(q.name)}</div><strong>${y}</strong><div class="power-bar"><span style="width:${y}%"></span></div></div></div></div>`;
  }).join('');
  let winner=scores[0]===scores[1]?-1:(scores[0]>scores[1]?0:1);
  content().innerHTML=`<div class="offline-final"><span class="phase-pill">🏆 FINAL DA ARENA</span><h2>${winner<0?'EMPATE ÉPICO!':htmlEscape(state.names[winner]).toUpperCase()+' VENCEU!'}</h2><div class="offline-score"><div><small>${htmlEscape(state.names[0])}</small><strong>${scores[0]}</strong><span>${totals[0]} pontos somados</span></div><b>VS</b><div><small>${htmlEscape(state.names[1])}</small><strong>${scores[1]}</strong><span>${totals[1]} pontos somados</span></div></div></div><div class="offline-subtitle">⚔️ BATALHA DOS CINCO ATRIBUTOS</div>${rounds}<div class="offline-subtitle">📋 TIMES COMPLETOS</div>${teamDisplay()}<div class="offline-actions">${button('🔄 JOGAR NOVAMENTE','offlineAgain')}${button('← VOLTAR AO INÍCIO','offlineHome','btn-outline')}</div>`;
  $el('offlineAgain').onclick=()=>start(state.mode);
  $el('offlineHome').onclick=returnLobby;
}
$el('localBotBtn').addEventListener('click',()=>start('bot'));
$el('localDuelBtn').addEventListener('click',()=>start('local'));
})();
