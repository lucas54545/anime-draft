(() => {
'use strict';
const roster=window.ANIME_ROSTER||[];
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum=p=>p.stats.reduce((a,b)=>a+b,0);
const btn=(text,id,style='btn-primary')=>'<button type="button" class="btn '+style+'" id="'+id+'">'+text+'</button>';
const root=()=>$('offlineContent');
let st=null,ticker=null,botWait=null;
function timers(){clearInterval(ticker);clearTimeout(botWait);ticker=null;botWait=null;}
function portrait(p){
  if(window.maybePhoto)window.maybePhoto(p);
  return '<div class="offline-portrait"><span>'+esc(p.emoji)+'</span>'+(window.imageMarkup?window.imageMarkup(p):'')+'</div>';
}
function stats(p){
  return '<div class="local-power"><div class="local-power-total">⚡ PODER TOTAL <b>'+sum(p)+'</b></div><div class="local-stats">'+ATTR.map((label,i)=>'<span>'+esc(label)+' <strong>'+p.stats[i]+'</strong></span>').join('')+'</div></div>';
}
function slots(n){
  const t=st.teams[n],score=t.reduce((a,p,i)=>a+(p?.stats[i]||0),0);
  return '<div class="offline-team"><div class="offline-team-head"><b>'+esc(st.names[n])+' · ⚡ '+score+' PTS</b><span>🪙 '+st.budgets[n]+' / 20</span></div>'+
  ATTR.map((label,i)=>{
    const p=t[i];
    return '<div class="offline-slot"><div class="offline-slot-ico">'+(p?portrait(p):'❔')+'</div><div><small>'+label+'</small><strong>'+(p?esc(p.name):'POSIÇÃO LIVRE')+'</strong>'+(p?stats(p):'')+'</div></div>';
  }).join('')+'</div>';
}
function teams(){return '<div class="offline-teams">'+slots(0)+slots(1)+'</div>';}
function heading(title,desc){
  return '<div class="offline-topline"><span class="phase-pill">⚡ LEILÃO '+Math.min(10,st.round+1)+' / 10</span><span>⭐ UM PERSONAGEM POR LEILÃO</span></div>'+
    '<h3 class="offline-title">'+title+'</h3><p class="offline-desc">'+desc+'</p><div class="offline-progress">'+
    Array.from({length:10},(_,i)=>'<span class="'+(i<st.round?'done':i===st.round?'current':'')+'"></span>').join('')+'</div>';
}
function card(p){
  return '<div class="offline-card"><div class="offline-card-art">'+portrait(p)+'<span class="offline-tag">⭐ PERSONAGEM DO LEILÃO</span></div>'+
    '<div class="offline-card-copy"><small>'+esc(p.anime)+'</small><strong>'+esc(p.name)+'</strong>'+
    '<div class="offline-unknown">🔒 FORÇA · RESISTÊNCIA · QI · HABILIDADE · VELOCIDADE: <b>???</b></div></div></div>';
}
function free(side){return st.teams[side].map((p,i)=>p===null?i:-1).filter(i=>i>=0);}
function count(side){return 5-free(side).length;}
function quit(){timers();st=null;show('lobby');}
function start(mode){
  timers();
  const first=($('nickname')?.value||'Jogador 1').trim()||'Jogador 1';
  st={mode,names:[first,mode==='bot'?'BOT':'Jogador 2'],budgets:[20,20],
      teams:[Array(5).fill(null),Array(5).fill(null)],round:0,seen:[],
      current:null,leader:-1,turn:0,bid:0,deadline:0,phase:'setup',
      winner:-1,price:0,reason:''};
  show('offline');
  root().innerHTML='<div class="offline-topline"><span class="phase-pill">🎮 '+(mode==='bot'?'CONTRA BOT':'2 JOGADORES NO MESMO APARELHO')+'</span><span>🪙 20 MOEDAS CADA</span></div>'+
    '<h3 class="offline-title">PREPARE O DRAFT!</h3><p class="offline-desc">Serão 10 leilões, com 1 personagem por vez. Depois de vencer, escolha a posição ANTES de revelar o poder.</p>'+
    '<div class="offline-fields"><label class="field-label">JOGADOR 1<input id="offlineName0" maxlength="20" value="'+esc(first)+'"></label>'+
    (mode==='local'?'<label class="field-label">JOGADOR 2<input id="offlineName1" maxlength="20" value="Jogador 2"></label>':'')+'</div>'+
    '<div class="offline-actions">'+btn('COMEÇAR →','offlineStart')+btn('← VOLTAR','offlineBack','btn-outline')+'</div>';
  $('offlineStart').onclick=()=>{
    st.names[0]=$('offlineName0').value.trim().slice(0,20)||'Jogador 1';
    if(mode==='local')st.names[1]=$('offlineName1').value.trim().slice(0,20)||'Jogador 2';
    draw();
  };
  $('offlineBack').onclick=quit;
}
function draw(){
  timers();
  if(st.round===10){battle();return;}
  const pool=roster.filter(p=>!st.seen.includes(p.id));
  let candidate=pool[Math.floor(Math.random()*pool.length)];
  if(Math.random()<.27){
    const weak=pool.filter(p=>sum(p)<290);
    if(weak.length)candidate=weak[Math.floor(Math.random()*weak.length)];
  }
  st.seen.push(candidate.id);st.current=candidate;
  st.leader=-1;st.bid=0;st.turn=free(st.round%2).length?st.round%2:1-st.round%2;
  st.deadline=Date.now()+10000;st.phase='auction';
  auction();schedule();
}
function updateClock(){
  if(!st||st.phase!=='auction')return;
  const left=Math.max(0,(st.deadline-Date.now())/1000);
  if($('localSeconds'))$('localSeconds').textContent=Math.ceil(left);
  if($('localTimerBar'))$('localTimerBar').style.width=left*10+'%';
  if($('localSeconds'))$('localSeconds').classList.toggle('urgent-text',left<=3);
  if($('localRaise'))$('localRaise').disabled=left<=0||st.bid+1>st.budgets[st.turn];
  if(left<=0)endBid('tempo esgotado');
}
function schedule(){
  timers();ticker=setInterval(updateClock,125);updateClock();
  if(st?.mode==='bot'&&st.phase==='auction'&&st.turn===1){
    botWait=setTimeout(()=>{
      if(!st||st.phase!=='auction'||st.turn!==1)return;
      const desired=1+Math.floor(Math.random()*6);
      if(st.bid+1<=st.budgets[1]&&st.bid+1<=desired&&Math.random()<.8)bid(st.bid+1);
      else endBid('bot desistiu');
    },850+Math.random()*1400);
  }
}
function auction(){
  const turn=st.turn,next=st.bid+1;
  root().innerHTML=heading('LEILÃO AO VIVO • 10 SEGUNDOS','Cada jogador pode aumentar o lance em uma moeda ou desistir.')+
    '<div class="offline-budgets"><div><b>'+esc(st.names[0])+'</b><span>🪙 '+st.budgets[0]+' moedas</span></div><strong>VS</strong><div><b>'+esc(st.names[1])+'</b><span>🪙 '+st.budgets[1]+' moedas</span></div></div>'+
    '<div class="auction-pair single-auction">'+card(st.current)+'</div>'+
    '<div class="live-auction"><div class="live-auction-numbers"><div><small>MAIOR LANCE</small><strong>🪙 '+st.bid+'</strong></div><div class="clock-face"><small>TEMPO PARA RESPONDER</small><b id="localSeconds">10</b><div class="timer-track"><span id="localTimerBar"></span></div></div></div><p>'+(st.leader<0?'Sem lances ainda':esc(st.names[st.leader])+' está vencendo')+'</p></div>'+
    '<div class="offline-bidbox"><div class="offline-bidline"><div><span class="section-eyebrow">É A VEZ DE</span><h3>'+esc(st.names[turn])+'</h3></div><div class="offline-current">🪙 <strong>'+next+'</strong></div></div>'+
    '<p class="offline-desc">Você tem '+st.budgets[turn]+' moedas. Vale a pena guardar para um personagem melhor?</p>'+
    '<div class="auction-buttons">'+btn('⚡ OFERECER '+next,'localRaise')+btn('✋ DESISTIR','localPass','btn-outline')+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES FORMADOS ATÉ AGORA</div>'+teams()+
    '<div class="offline-actions">'+btn('← SAIR','localExit','btn-outline')+'</div>';
  $('localRaise').onclick=()=>bid(next);
  $('localPass').onclick=()=>endBid('jogador desistiu');
  $('localExit').onclick=()=>{if(confirm('Sair da partida?'))quit();};
  updateClock();
}
function bid(amount){
  if(!st||st.phase!=='auction'||Date.now()>st.deadline||amount!==st.bid+1||free(st.turn).length===0||amount>st.budgets[st.turn])return;
  st.leader=st.turn;st.bid=amount;st.turn=1-st.turn;st.deadline=Date.now()+10000;
  if(!free(st.turn).length||st.bid+1>st.budgets[st.turn]){endBid('adversário não pode cobrir');return;}
  auction();schedule();
}
function endBid(reason){
  if(!st||st.phase!=='auction')return;
  timers();st.phase='choose';st.reason=reason;
  let winner;
  if(st.leader>=0)winner=st.leader;
  else if(!free(st.turn).length)winner=1-st.turn;
  else if(reason==='jogador desistiu'||reason==='bot desistiu')winner=free(1-st.turn).length?1-st.turn:st.turn;
  else winner=st.turn;
  if(!free(winner).length)winner=1-winner;
  st.winner=winner;st.price=st.leader<0?0:st.bid;st.budgets[winner]-=st.price;
  choose();
  if(st.mode==='bot'&&winner===1)botWait=setTimeout(()=>chooseSlot(free(1)[Math.floor(Math.random()*free(1).length)]),900);
}
function choose(){
  const n=st.winner,p=st.current;
  root().innerHTML=heading('ESCOLHA ONDE COLOCAR','Os atributos numéricos continuam escondidos até confirmar a posição.')+
    '<div class="offline-winner"><span>🏆 VENCEDOR DO LEILÃO</span><h3>'+esc(st.names[n])+'</h3><p>Levou '+esc(p.name)+' por 🪙 '+st.price+'.</p></div>'+
    '<div class="auction-pair single-auction">'+card(p)+'</div>'+
    '<div class="placement-area"><span class="section-eyebrow">🎯 DEFINA SUA ESTRATÉGIA</span><h3>ESCOLHA UMA POSIÇÃO LIVRE</h3>'+
    '<div class="placement-options">'+ATTR.map((label,i)=>'<button class="position-btn" data-slot="'+i+'" '+(st.teams[n][i]?'disabled':'')+'><span>'+label+'</span><b>'+(st.teams[n][i]?'OCUPADO':'ESCOLHER →')+'</b></button>').join('')+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES</div>'+teams();
  root().querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>chooseSlot(Number(b.dataset.slot)));
}
function chooseSlot(slot){
  if(!st||st.phase!=='choose'||!free(st.winner).includes(slot))return;
  timers();st.phase='reveal';st.teams[st.winner][slot]=st.current;
  const p=st.current;
  root().innerHTML=heading('PODER REVELADO!','O personagem entrou na posição escolhida. Agora os números aparecem.')+
    '<div class="offline-winner"><span>🎯 POSIÇÃO ESCOLHIDA: '+ATTR[slot]+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(st.names[st.winner])+' gastou 🪙 '+st.price+' para adquirir este personagem.</p></div>'+
    '<div class="offline-revealpair one-reveal"><div class="offline-revealcard">'+portrait(p)+'<h4>'+esc(p.name)+'</h4>'+stats(p)+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES COMPLETADOS</div>'+teams()+
    '<div class="offline-actions">'+btn(st.round===9?'⚔️ VER BATALHA FINAL':'PRÓXIMO LEILÃO →','localNext')+'</div>';
  $('localNext').onclick=()=>{st.round++;if(st.round>=10)battle();else draw();};
}
function battle(){
  timers();st.phase='battle';
  const scores=[0,0],total=[0,0];
  const fights=ATTR.map((attr,i)=>{
    const a=st.teams[0][i],b=st.teams[1][i];
    if(!a||!b)return '';
    const x=a.stats[i],y=b.stats[i];total[0]+=x;total[1]+=y;
    if(x>y)scores[0]++;else if(y>x)scores[1]++;
    return '<div class="offline-fight"><div class="offline-fight-label">'+attr+'</div><div class="offline-fight-row">'+
      '<div class="'+(x>y?'winner':'')+'"><div class="fight-portrait">'+portrait(a)+'</div><div class="duel-name">'+esc(a.name)+'</div><strong>'+x+'</strong><div class="power-bar"><span style="width:'+x+'%"></span></div></div>'+
      '<b>VS</b><div class="'+(y>x?'winner':'')+'"><div class="fight-portrait">'+portrait(b)+'</div><div class="duel-name">'+esc(b.name)+'</div><strong>'+y+'</strong><div class="power-bar"><span style="width:'+y+'%"></span></div></div></div></div>';
  }).join('');
  const winner=total[0]===total[1]?-1:total[0]>total[1]?0:1;
  root().innerHTML='<div class="offline-final"><span class="phase-pill">🏆 BATALHA FINAL</span><h2>'+(winner<0?'EMPATE!':esc(st.names[winner]).toUpperCase()+' VENCEU!')+'</h2>'+
    '<div class="offline-score"><div><small>'+esc(st.names[0])+'</small><strong>'+total[0]+'</strong><span>'+scores[0]+' categorias vencidas</span></div><b>VS</b>'+
    '<div><small>'+esc(st.names[1])+'</small><strong>'+total[1]+'</strong><span>'+scores[1]+' categorias vencidas</span></div></div></div>'+
    '<p class="offline-desc">🏆 Vence quem SOMAR MAIS PONTOS nos cinco atributos.</p><div class="offline-subtitle">⚔️ CONFRONTOS</div>'+fights+
    '<div class="offline-subtitle">📋 TIMES COMPLETOS</div>'+teams()+'<div class="offline-actions">'+btn('🔄 JOGAR NOVAMENTE','offlineAgain')+btn('← VOLTAR','offlineHome','btn-outline')+'</div>';
  $('offlineAgain').onclick=()=>start(st.mode);$('offlineHome').onclick=quit;
}
$('localBotBtn').addEventListener('click',()=>start('bot'));
$('localDuelBtn').addEventListener('click',()=>start('local'));
})();
