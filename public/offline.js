(() => {
'use strict';
const roster=window.ANIME_ROSTER||[];
const attrNames=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const $el=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const button=(label,id,theme='btn-primary')=>`<button type="button" class="btn ${theme}" id="${id}">${label}</button>`;
const sum=p=>p.stats.reduce((a,b)=>a+b,0);
const content=()=>$el('offlineContent');
let state=null,timer=null,botTimer=null;
function clearTimers(){clearInterval(timer);clearTimeout(botTimer);timer=null;botTimer=null;}
function portrait(p){if(window.maybePhoto)window.maybePhoto(p);return `<div class="offline-portrait"><span>${escape(p.emoji)}</span>${window.imageMarkup?window.imageMarkup(p):''}</div>`;}
function stats(p){return `<div class="local-power"><div class="local-power-total">⚡ PODER TOTAL <b>${sum(p)}</b></div><div class="local-stats">${attrNames.map((a,i)=>`<span>${a.split(' ').slice(1).join(' ')} <strong>${p.stats[i]}</strong></span>`).join('')}</div></div>`;}
function team(i){const partial=state.teams[i].reduce((acc,p,j)=>acc+p.stats[j],0);return `<div class="offline-team"><div class="offline-team-head"><b>${escape(state.names[i])} · ⚡ ${partial} pontos</b><span>🪙 ${state.budgets[i]} / 20</span></div>${attrNames.map((a,k)=>{const p=state.teams[i][k];return `<div class="offline-slot"><div class="offline-slot-ico">${p?portrait(p):'❔'}</div><div><small>${a}</small><strong>${p?escape(p.name):'Aguardando leilão...'}</strong>${p?stats(p):''}</div></div>`;}).join('')}</div>`;}
function teams(){return `<div class="offline-teams">${team(0)}${team(1)}</div>`;}
function card(p,label){return `<div class="offline-card"><div class="offline-card-art">${portrait(p)}<span class="offline-tag">${label}</span></div><div class="offline-card-copy"><small>${escape(p.anime)}</small><strong>${escape(p.name)}</strong><div class="offline-unknown">🔒 FORÇA · RESISTÊNCIA · QI<br>HABILIDADE · VELOCIDADE: <b>???</b></div></div></div>`;}
function heading(title,description=''){
 return `<div class="offline-topline"><span class="phase-pill">⚡ RODADA ${state.round+1} / 5</span><span>⚔️ ${attrNames[state.round]}</span></div><h3 class="offline-title">${title}</h3><p class="offline-desc">${description}</p><div class="offline-progress">${attrNames.map((a,i)=>`<span class="${i<state.round?'done':i===state.round?'current':''}"></span>`).join('')}</div>`;
}
function start(mode){
 clearTimers();const name=($el('nickname')?.value||'Jogador 1').trim()||'Jogador 1';
 state={mode,names:[name,mode==='bot'?'BOT':'Jogador 2'],budgets:[20,20],teams:[[],[]],round:0,pair:[],leader:-1,turn:0,currentBid:0,deadline:0,phase:'setup'};
 show('offline');
 content().innerHTML=`<div class="offline-topline"><span class="phase-pill">🎮 ${mode==='bot'?'CONTRA BOT':'2 JOGADORES NO MESMO APARELHO'}</span><span>🪙 20 MOEDAS CADA</span></div><h3 class="offline-title">PREPARE O LEILÃO</h3><p class="offline-desc">Um jogador oferece 1 moeda. O outro tem 10 segundos para oferecer 2 ou desistir. Os poderes só aparecem depois do leilão.</p><div class="offline-fields"><label class="field-label">JOGADOR 1<input id="offlineName0" maxlength="20" value="${escape(name)}"></label>${mode==='local'?`<label class="field-label">JOGADOR 2<input id="offlineName1" maxlength="20" value="Jogador 2"></label>`:''}</div><div class="offline-actions">${button('COMEÇAR LEILÃO →','offlineStart')}${button('← VOLTAR','offlineBack','btn-outline')}</div>`;
 $el('offlineStart').onclick=()=>{state.names[0]=$el('offlineName0').value.trim().slice(0,20)||'Jogador 1';if(mode==='local')state.names[1]=$el('offlineName1').value.trim().slice(0,20)||'Jogador 2';draw();};
 $el('offlineBack').onclick=home;
}
function home(){clearTimers();state=null;show('lobby');}
function draw(){
 clearTimers();const used=new Set(state.teams.flat().map(p=>p.id));const pool=roster.filter(p=>!used.has(p.id));
 let first=pick(pool);
 if(Math.random()<.25){const weak=pool.filter(x=>sum(x)<290);if(weak.length)first=pick(weak);}
 const second=pick(pool.filter(p=>p.id!==first.id));
 state.pair=[first,second];state.leader=-1;state.currentBid=0;state.turn=state.round%2;
 state.deadline=Date.now()+10000;state.phase='auction';renderAuction();schedule();
}
function updateClock(){
 if(!state||state.phase!=='auction')return;
 const left=Math.max(0,(state.deadline-Date.now())/1000);
 const counter=$el('localSeconds'),bar=$el('localTimerBar');
 if(counter){counter.textContent=Math.ceil(left);counter.classList.toggle('urgent-text',left<=3);}
 if(bar)bar.style.width=(left*10)+'%';
 const action=$el('localRaise');if(action)action.disabled=left<=0;
 if(left<=0)finish('O tempo acabou');
}
function schedule(){
 clearTimers();timer=setInterval(updateClock,120);updateClock();
 if(state?.mode==='bot'&&state.phase==='auction'&&state.turn===1){
   botTimer=setTimeout(()=>{
     if(!state||state.phase!=='auction'||state.turn!==1)return;
     const next=state.currentBid+1;
     const willingness=Math.min(9,Math.max(2,Math.ceil(state.pair[0].stats[state.round]/15)+Math.floor(Math.random()*3)-1));
     if(next<=state.budgets[1] && next<=willingness && Math.random()>.12)raise(next);
     else finish('O bot desistiu');
   },900+Math.random()*1600);
 }
}
function renderAuction(){
 if(!state||state.phase!=='auction')return;
 const n=state.turn,budget=state.budgets[n],next=state.currentBid+1;
 content().innerHTML=heading('LEILÃO AO VIVO • 10 SEGUNDOS','A cada lance, o outro jogador tem 10 segundos para oferecer mais uma moeda ou desistir.')+
 `<div class="offline-budgets"><div><b>${escape(state.names[0])}</b><span>🪙 ${state.budgets[0]} moedas</span></div><strong>VS</strong><div><b>${escape(state.names[1])}</b><span>🪙 ${state.budgets[1]} moedas</span></div></div>`+
 `<div class="auction-pair">${card(state.pair[0],'⭐ PERSONAGEM DO LEILÃO')}${card(state.pair[1],'🎲 PERSONAGEM RESERVA')}</div>`+
 `<div class="live-auction"><div class="live-auction-numbers"><div><small>MAIOR LANCE</small><strong>🪙 ${state.currentBid}</strong></div><div class="clock-face"><small>TEMPO PARA RESPONDER</small><b id="localSeconds">10</b><div class="timer-track"><span id="localTimerBar"></span></div></div></div><p>${state.leader<0?'Sem lances ainda':escape(state.names[state.leader])+' está vencendo o leilão'}</p></div>`+
 `<div class="offline-bidbox"><div class="offline-bidline"><div><span class="section-eyebrow">É A VEZ DE</span><h3>${escape(state.names[n])}</h3></div><div class="offline-current">🪙 <strong>${next}</strong></div></div><p class="offline-desc">Você tem ${budget} moedas. ${state.leader<0?'Comece com 1 moeda.':'Cubra o lance ou deixe o personagem para o rival.'}</p><div class="auction-buttons">${button('⚡ OFERECER '+next+' MOEDA'+(next!==1?'S':''),'localRaise')}${button('✋ DESISTIR','localPass','btn-outline')}</div></div>`+
 `<div class="offline-subtitle">✦ PERSONAGENS JÁ ESCOLHIDOS • PODERES REVELADOS</div>${teams()}<div class="offline-actions">${button('← SAIR DA PARTIDA','localExit','btn-outline')}</div>`;
 $el('localRaise').disabled=next>budget;
 $el('localRaise').onclick=()=>raise(next);
 $el('localPass').onclick=()=>finish('Desistiu do lance');
 $el('localExit').onclick=()=>{if(confirm('Sair desta partida?'))home();};
 updateClock();
}
function raise(amount){
 if(!state||state.phase!=='auction'||Date.now()>state.deadline)return;
 const n=state.turn;if(amount!==state.currentBid+1||amount>state.budgets[n])return;
 state.leader=n;state.currentBid=amount;state.turn=1-n;
 if(state.currentBid+1>state.budgets[state.turn]){finish('O rival ficou sem moedas para cobrir');return;}
 state.deadline=Date.now()+10000;renderAuction();schedule();
}
function finish(reason){
 if(!state||state.phase!=='auction')return;
 clearTimers();state.phase='reveal';
 const win=state.leader<0?state.round%2:state.leader,lose=1-win;
 const price=state.leader<0?0:state.currentBid;
 state.budgets[win]-=price;
 state.teams[win].push(state.pair[0]);state.teams[lose].push(state.pair[1]);
 content().innerHTML=heading('PODERES DESBLOQUEADOS!','Você só vê os atributos depois que o personagem é escolhido.')+
 `<div class="offline-winner"><span>🏆 VENCEDOR DO LEILÃO</span><h3>${escape(state.names[win])}</h3><p>Levou ${escape(state.pair[0].name)} por 🪙 ${price}. ${escape(state.names[lose])} recebeu o reserva gratuitamente. <small>${escape(reason)}.</small></p></div>`+
 `<div class="offline-revealpair">${state.pair.map(p=>`<div class="offline-revealcard">${portrait(p)}<h4>${escape(p.name)}</h4>${stats(p)}</div>`).join('')}</div><div class="offline-subtitle">⚔️ SEUS TIMES</div>${teams()}<div class="offline-actions">${button(state.round===4?'⚔️ MOSTRAR BATALHA FINAL':'PRÓXIMO LEILÃO →','localNext')}</div>`;
 $el('localNext').onclick=()=>{if(state.round===4){battle();return;}state.round++;draw();};
}
function battle(){
 clearTimers();state.phase='battle';const scores=[0,0],totals=[0,0];
 const fights=attrNames.map((name,i)=>{
  const a=state.teams[0][i],b=state.teams[1][i],va=a.stats[i],vb=b.stats[i];
  totals[0]+=va;totals[1]+=vb;if(va>vb)scores[0]++;else if(vb>va)scores[1]++;
  return `<div class="offline-fight"><div class="offline-fight-label">${name}</div><div class="offline-fight-row"><div class="${va>vb?'winner':''}"><div class="fight-portrait">${portrait(a)}</div><div class="duel-name">${escape(a.name)}</div><strong>${va}</strong><div class="power-bar"><span style="width:${va}%"></span></div></div><b>VS</b><div class="${vb>va?'winner':''}"><div class="fight-portrait">${portrait(b)}</div><div class="duel-name">${escape(b.name)}</div><strong>${vb}</strong><div class="power-bar"><span style="width:${vb}%"></span></div></div></div></div>`;
 }).join('');
 // Mais pontos somados nos cinco atributos = vencedor.
 const winner=totals[0]===totals[1]?-1:totals[0]>totals[1]?0:1;
 content().innerHTML=`<div class="offline-final"><span class="phase-pill">🏆 BATALHA FINAL</span><h2>${winner<0?'EMPATE!':escape(state.names[winner]).toUpperCase()+' VENCEU!'}</h2><div class="offline-score"><div><small>${escape(state.names[0])}</small><strong>${totals[0]}</strong><span>${scores[0]} categorias vencidas</span></div><b>VS</b><div><small>${escape(state.names[1])}</small><strong>${totals[1]}</strong><span>${scores[1]} categorias vencidas</span></div></div></div><p class="offline-desc">🏆 Quem somar MAIS PONTOS nas cinco categorias vence. O número de categorias ganhas é apenas informativo.</p><div class="offline-subtitle">⚔️ CONFRONTOS</div>${fights}<div class="offline-subtitle">📋 TIMES COMPLETOS</div>${teams()}<div class="offline-actions">${button('🔄 JOGAR NOVAMENTE','offlineAgain')}${button('← VOLTAR','offlineHome','btn-outline')}</div>`;
 $el('offlineAgain').onclick=()=>start(state.mode);$el('offlineHome').onclick=home;
}
$el('localBotBtn').addEventListener('click',()=>start('bot'));
$el('localDuelBtn').addEventListener('click',()=>start('local'));
})();
