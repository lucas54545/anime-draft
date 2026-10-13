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

function tierClass(p){return ({'Comum':'common','Raro':'rare','Épico':'epic','Lendário':'legendary','Mítico':'mythic'})[p?.rarity]||'common';}
function rarityTag(p){return p?.rarity?'<span class="rarity-chip rarity-'+tierClass(p)+'">✦ '+esc(p.rarity)+' · '+p.rating+'</span>':'';}
function sound(type){if(window.playAnimeSfx)window.playAnimeSfx(type);}
function historyPanel(){
  const records=st.history||[];
  const rows=records.length?records.map(h=>{
    const price=h.price<0?'🕳️ '+Math.abs(h.price)+' no limbo':h.price>0?'🪙 '+h.price:'Sem custo';
    return '<div class="history-entry"><span class="history-round">#'+String(h.round).padStart(2,'0')+'</span><div class="history-info"><b>'+esc(h.character.name)+'</b><small>'+esc(st.names[h.winner])+' · '+ATTR[h.slot]+'</small></div>'+rarityTag(h)+'<span class="history-price">'+price+'</span></div>';
  }).join(''):'<p class="muted">Nenhum leilão concluído.</p>';
  return '<details class="auction-history"><summary>📜 HISTÓRICO DE LEILÕES · '+records.length+' / 10</summary><div class="history-list">'+rows+'</div></details>';
}
function rouletteSpin(pool){
 st.turnSeconds=10;st.roulette=null;
 if(st.mode!=='roulette')return drawRandom(pool);
 const effects=[
   {key:'coins',icon:'🪙',name:'CHUVA DE MOEDAS',desc:'As duas equipes recebem +2 moedas. Máximo: 30.'},
   {key:'bonus',icon:'🎁',name:'BÔNUS SURPRESA',desc:'Uma das equipes recebe +3 moedas extras.'},
   {key:'speed',icon:'⚡',name:'MODO TURBO',desc:'Cada jogador tem só 7 segundos para responder ao lance.'},
   {key:'slow',icon:'⏳',name:'TEMPO EXTRA',desc:'Cada jogador tem 15 segundos para responder ao lance.'},
   {key:'portal',icon:'🌌',name:'PORTAL MISTERIOSO',desc:'O sorteio favorece personagens especiais, mas suas forças continuam ocultas.'}
 ];
 const fx=effects[Math.floor(Math.random()*effects.length)];
 st.roulette=fx;
 if(fx.key==='coins')st.budgets=st.budgets.map(v=>Math.min(30,v+2));
 if(fx.key==='bonus'){
  const lucky=Math.floor(Math.random()*2);
  st.budgets[lucky]=Math.min(30,st.budgets[lucky]+3);
  fx.desc='🎁 '+st.names[lucky]+' recebeu +3 moedas extras!';
 }
 if(fx.key==='speed')st.turnSeconds=7;
 if(fx.key==='slow')st.turnSeconds=15;
 if(fx.key==='portal'){
  const special=pool.filter(p=>['Épico','Lendário','Mítico'].includes(p.rarity));
  if(special.length)return special[Math.floor(Math.random()*special.length)];
 }
 return drawRandom(pool);
}
function drawRandom(pool){
 const weights=[['Comum',18],['Raro',30],['Épico',31],['Lendário',15],['Mítico',6]];
 const buckets=weights.map(([rarity,weight])=>({weight,items:pool.filter(p=>p.rarity===rarity)})).filter(b=>b.items.length);
 if(!buckets.length)return pool[Math.floor(Math.random()*pool.length)];
 let x=Math.random()*buckets.reduce((sum,b)=>sum+b.weight,0);
 for(const b of buckets){x-=b.weight;if(x<0)return b.items[Math.floor(Math.random()*b.items.length)];}
 return buckets[buckets.length-1].items[0];
}

function timers(){clearInterval(ticker);clearTimeout(botWait);ticker=null;botWait=null;}
function portrait(p){
  if(window.maybePhoto)window.maybePhoto(p);
  return '<div class="offline-portrait"><span>'+esc(p.emoji)+'</span>'+(window.imageMarkup?window.imageMarkup(p):'')+'</div>';
}
function stats(p){
  return rarityTag(p)+'<div class="local-power"><div class="local-power-total">⚡ PODER TOTAL <b>'+sum(p)+'</b></div><div class="local-stats">'+ATTR.map((label,i)=>'<span>'+esc(label)+' <strong>'+p.stats[i]+'</strong></span>').join('')+'</div></div>';
}
function slots(n){
  const t=st.teams[n],score=t.reduce((a,p,i)=>a+(p?.stats?.[i]||0),0);
  return '<div class="offline-team compact-team"><div class="offline-team-head"><b>'+esc(st.names[n])+' · ⚡ '+score+'</b><span>🪙 '+st.budgets[n]+'</span></div>'+
    ATTR.map((label,i)=>{
      const p=t[i];
      return '<div class="offline-slot compact-slot">'+
        '<div class="offline-slot-ico">'+(p?portrait(p):'❔')+'</div>'+
        '<div class="compact-slot-info"><small>'+label+'</small><strong>'+(p?esc(p.name):'Posição livre')+'</strong></div>'+
        '<b class="slot-score">'+(p?p.stats[i]:'—')+'</b></div>';
    }).join('')+'</div>';
}
function teams(){return '<div class="offline-teams">'+slots(0)+slots(1)+'</div>';}
function heading(title,desc){
  return '<div class="offline-topline"><span class="phase-pill">⚡ LEILÃO '+Math.min(10,st.round+1)+' / 10</span><span>⭐ UM PERSONAGEM POR LEILÃO</span></div>'+
    '<h3 class="offline-title">'+title+'</h3><p class="offline-desc">'+desc+'</p><div class="offline-progress">'+
    Array.from({length:10},(_,i)=>'<span class="'+(i<st.round?'done':i===st.round?'current':'')+'"></span>').join('')+'</div>';
}
function card(p){
  if(st?.mode==='mystery'&&['auction','choose'].includes(st.phase)){
    return '<div class="offline-card mystery-auction-card"><div class="offline-card-art">'+
      '<div class="mystery-art"><span class="mystery-silhouette">?</span><span class="mystery-stars">✦ ✧ ✦</span></div>'+
      '<span class="offline-tag">🎭 IDENTIDADE ESCONDIDA</span></div>'+
      '<div class="offline-card-copy"><small>ANIME DE ORIGEM: '+esc(p.anime)+'</small>'+
      '<strong>PERSONAGEM MISTERIOSO</strong><div class="offline-unknown">🔒 Nome, raridade e atributos: <b>???</b></div></div></div>';
  }
  return '<div class="offline-card"><div class="offline-card-art">'+portrait(p)+'<span class="offline-tag">⭐ PERSONAGEM DO LEILÃO</span></div>'+
    '<div class="offline-card-copy"><small>'+esc(p.anime)+'</small><strong>'+esc(p.name)+'</strong>'+
    '<div class="offline-unknown">🔒 FORÇA · RESISTÊNCIA · QI · HABILIDADE · VELOCIDADE: <b>???</b></div></div></div>';
}
function free(side){return st.teams[side].map((p,i)=>p===null?i:-1).filter(i=>i>=0);}
function count(side){return 5-free(side).length;}
function quit(){timers();st=null;show('lobby');}
function tournamentBotDuel(first,second){
  // Outras chaves são jogadas por times de cinco personagens sorteados para os bots.
  const pool=[...roster].sort(()=>Math.random()-.5);
  const scores=[pool.slice(0,5),pool.slice(5,10)].map(team=>team.reduce((sum,p,i)=>sum+p.stats[i],0));
  const winner=scores[0]===scores[1]?(Math.random()<.5?0:1):(scores[0]>scores[1]?0:1);
  return {first,second,winner:winner===0?first:second,scores};
}
function newTournament(name){
  const bots=['BOT NINJA','BOT SAIYAJIN','BOT SHINIGAMI','BOT HUNTER','BOT PIRATA','BOT MAGO','BOT SENSEI'];
  const q2=tournamentBotDuel(bots[1],bots[2]);
  const q3=tournamentBotDuel(bots[3],bots[4]);
  const q4=tournamentBotDuel(bots[5],bots[6]);
  const s2=tournamentBotDuel(q3.winner,q4.winner);
  return {stage:0,human:name,bots,quarter2:q2,quarter3:q3,quarter4:q4,semi2:s2,
    opponents:[bots[0],q2.winner,s2.winner],results:[]};
}
function tournamentBracket(){
  if(st?.mode!=='tournament'||!st.tournament)return '';
  const t=st.tournament,result=(left,right,winner)=>'<div class="tournament-pair"><span class="'+(winner===left?'advanced':'')+'">'+esc(left)+'</span><b>VS</b><span class="'+(winner===right?'advanced':'')+'">'+esc(right)+'</span></div>';
  const playerWinner=i=>t.results[i]?.winner===0?t.human:t.results[i]?.winner===1?t.opponents[i]:'';
  return '<details class="tournament-bracket" '+(st.phase==='battle'?'open':'')+'><summary>🏆 CHAVE DO TORNEIO · 8 PARTICIPANTES</summary>'+
    '<div class="tournament-stage"><h4>QUARTAS DE FINAL</h4>'+
      result(t.human,t.bots[0],playerWinner(0))+
      result(t.quarter2.first,t.quarter2.second,t.quarter2.winner)+
      result(t.quarter3.first,t.quarter3.second,t.quarter3.winner)+
      result(t.quarter4.first,t.quarter4.second,t.quarter4.winner)+'</div>'+
    '<div class="tournament-stage"><h4>SEMIFINAIS</h4>'+
      result(t.results[0]?.winner===1?t.bots[0]:t.human,t.quarter2.winner,playerWinner(1))+
      result(t.semi2.first,t.semi2.second,t.semi2.winner)+'</div>'+
    '<div class="tournament-stage"><h4>FINAL</h4>'+
      result(t.results[1]?.winner===1?t.quarter2.winner:t.human,t.semi2.winner,playerWinner(2))+'</div></details>';
}
function tournamentAdvance(){
 if(!st||st.mode!=='tournament'||!st.tournament)return;
 const t=st.tournament,last=t.results[t.stage];
 if(!last||last.winner===1)return;
 if(last.winner===0)t.stage++;
 if(t.stage>=3)return;
 st.names=[t.human,t.opponents[t.stage]];
 st.budgets=[20,20];st.teams=[Array(5).fill(null),Array(5).fill(null)];
 st.round=0;st.seen=[];st.current=null;st.bidMode=null;
 st.leader=-1;st.bid=0;st.turn=0;st.history=[];st.lastBeepSecond=10;
 st.roulette=null;st.turnSeconds=10;
 sound('confirm');draw();
}
function start(mode){
  timers();
  const first=($('nickname')?.value||'Jogador 1').trim()||'Jogador 1';
  const squad=mode==='local2v2',direct=mode==='direct5v5';
  st={mode,names:[first,['bot','mystery','roulette','tournament','direct5v5'].includes(mode)?'BOT':'Jogador 2'],members:[],
    directBot:direct,budgets:direct?[50,50]:[20,20],teams:[Array(5).fill(null),Array(5).fill(null)],round:0,seen:[],
    current:null,leader:-1,turn:0,bid:0,deadline:0,phase:'setup',
    winner:-1,price:0,bidMode:null,avoider:-1,reason:'',history:[],lastBeepSecond:10};
  if(mode==='tournament'){st.tournament=newTournament(first);st.names[1]=st.tournament.opponents[0];}
  show('offline');
  root().innerHTML=(mode==='tournament'?tournamentBracket():'')+'<div class="offline-topline"><span class="phase-pill">🎮 '+(mode==='bot'?'CONTRA BOT':mode==='mystery'?'LEILÃO MISTERIOSO':mode==='roulette'?'ROLETA':mode==='tournament'?'TORNEIO DE 8':direct?'PERSONAGENS 5v5 • LEILÃO':squad?'2v2 LOCAL • QUATRO JOGADORES':'2 JOGADORES NO MESMO APARELHO')+'</span><span>🪙 '+(direct?'50':'20')+' MOEDAS POR EQUIPE</span></div>'+
    '<h3 class="offline-title">PREPARE O DRAFT!</h3><p class="offline-desc">'+(squad?'Dupla A: jogadores 1 e 2. Dupla B: jogadores 3 e 4. As moedas e cinco posições são compartilhadas por dupla.':mode==='mystery'?'O personagem fica escondido até você escolher a posição. Você só conhece o anime durante os lances.':mode==='roulette'?'Todo leilão tem uma roleta de efeitos: moedas extras, 7 segundos, 15 segundos e portais especiais.':mode==='tournament'?'Oito participantes no mata-mata! Dispute quartas, semifinal e final contra bots com 10 leilões por partida.':direct?'São 10 leilões para formar times de 5 personagens. Cada jogador começa com 50 moedas. Na batalha final, vence o time com a maior soma do poder total de seus cinco personagens.':'Serão 10 leilões, com 1 personagem por vez. Depois de vencer, escolha a posição ANTES de revelar o poder.')+'</p>'+
    '<div class="offline-fields">'+(squad?
      Array.from({length:4},(_,i)=>'<label class="field-label">'+(i<2?'🔷 DUPLA A':'🔶 DUPLA B')+' · JOGADOR '+(i+1)+'<input id="offlineName'+i+'" maxlength="20" value="'+esc(i===0?first:'Jogador '+(i+1))+'"></label>').join(''):
      '<label class="field-label">JOGADOR 1<input id="offlineName0" maxlength="20" value="'+esc(first)+'"></label>'+
      ((mode==='local'||direct)?'<label class="field-label">'+(direct?'ADVERSÁRIO':'JOGADOR 2')+(direct?'<select id="directOpponent"><option value="bot">🤖 BOT</option><option value="local">👥 AMIGO NO MESMO APARELHO</option></select>':'')+'<input id="offlineName1" maxlength="20" value="Jogador 2" '+(direct?'style="display:none"':'')+'></label>':''))+'</div>'+
    '<div class="offline-actions">'+btn('COMEÇAR →','offlineStart')+btn('← VOLTAR','offlineBack','btn-outline')+'</div>';
  if(direct){$('directOpponent').onchange=()=>{$('offlineName1').style.display=$('directOpponent').value==='local'?'block':'none';};}
  $('offlineStart').onclick=()=>{
    if(squad){
      st.members=Array.from({length:4},(_,i)=>($('offlineName'+i).value.trim().slice(0,20)||'Jogador '+(i+1)));
      st.names=[st.members[0]+' + '+st.members[1],st.members[2]+' + '+st.members[3]];
    }else{
      st.names[0]=$('offlineName0').value.trim().slice(0,20)||'Jogador 1';
      if(mode==='local')st.names[1]=$('offlineName1').value.trim().slice(0,20)||'Jogador 2';
      if(direct){st.directBot=$('directOpponent').value==='bot';st.names[1]=st.directBot?'BOT':($('offlineName1').value.trim().slice(0,20)||'Jogador 2');}
      if(mode==='tournament'){st.tournament=newTournament(st.names[0]);st.names[1]=st.tournament.opponents[0];}
    }
    draw();
  };
  $('offlineBack').onclick=quit;
}
function draw(){
  timers();
  if(st.round===10){battle();return;}
  const pool=roster.filter(p=>!st.seen.includes(p.id));
  const candidate=rouletteSpin(pool);
  st.seen.push(candidate.id);st.current=candidate;
  st.leader=-1;st.bid=0;st.bidMode=null;st.turn=free(st.round%2).length?st.round%2:1-st.round%2;
  st.deadline=Date.now()+(st.turnSeconds||10)*1000;st.phase='auction';st.lastBeepSecond=10;
  auction();schedule();
}
function updateClock(){
  if(!st||st.phase!=='auction')return;
  const left=Math.max(0,(st.deadline-Date.now())/1000);
  const second=Math.ceil(left);
  if(second>0&&second<=3&&st.lastBeepSecond!==second){st.lastBeepSecond=second;sound('tick');}
  if($('localSeconds'))$('localSeconds').textContent=second;
  if($('localTimerBar'))$('localTimerBar').style.width=Math.max(0,Math.min(100,left/(st.turnSeconds||10)*100))+'%';
  if($('localSeconds'))$('localSeconds').classList.toggle('urgent-text',left<=3);
  if($('localRaise'))$('localRaise').disabled=left<=0||st.bidMode==='avoid'||st.bid+1>st.budgets[st.turn];
  if($('localAvoid'))$('localAvoid').disabled=left<=0||st.bidMode==='buy'||!free(0).length||!free(1).length||Math.abs(st.bidMode==='avoid'?st.bid-1:-1)>st.budgets[st.turn];
  if(left<=0)expireAuctionTurn();
}
function expireAuctionTurn(){
  if(!st||st.phase!=='auction')return;
  if(st.bidMode!==null){endBid('tempo esgotado');return;}
  const other=1-st.turn;
  if(free(other).length&&st.budgets[other]>=1)st.turn=other;
  else if(!(free(st.turn).length&&st.budgets[st.turn]>=1)){
    // Só se ninguém puder dar lance é necessário distribuir sem custo.
    endBid('nenhum lance possível');return;
  }
  st.deadline=Date.now()+(st.turnSeconds||10)*1000;st.lastBeepSecond=10;
  auction();schedule();
}
function schedule(){
  timers();ticker=setInterval(updateClock,125);updateClock();
  if(st&&(['bot','mystery','roulette','tournament'].includes(st.mode)||(st.mode==='direct5v5'&&st.directBot))&&st.phase==='auction'&&st.turn===1){
    botWait=setTimeout(()=>{
      if(!st||st.phase!=='auction'||st.turn!==1)return;
      const next=st.bidMode==='avoid'?st.bid-1:st.bid+1,desired=1+Math.floor(Math.random()*6);
      if(st.bidMode===null&&free(0).length&&st.budgets[1]>=1&&Math.random()<.23)bid(-1);
      else if(st.bidMode==='avoid'&&Math.abs(next)<=st.budgets[1]&&Math.abs(next)<=desired&&Math.random()<.65)bid(next);
      else if(st.bidMode===null&&st.budgets[1]>=1)bid(1);
      else if(st.bidMode!=='avoid'&&next<=st.budgets[1]&&next<=desired&&Math.random()<.8)bid(next);
      else if(st.bidMode===null)expireAuctionTurn();
      else endBid('bot aceitou o lance');
    },850+Math.random()*1400);
  }
}
function auction(){
  const turn=st.turn,next=st.bid+1,neg=st.bidMode==='avoid'?st.bid-1:-1;
  root().innerHTML=(st.mode==='tournament'?'<div class="tournament-active">🏆 '+['QUARTAS DE FINAL','SEMIFINAL','GRANDE FINAL'][st.tournament.stage]+' · '+esc(st.names[0])+' VS '+esc(st.names[1])+'</div>'+tournamentBracket():'')+
    heading(st.mode==='roulette'?'🎰 ROLETA • '+(st.turnSeconds||10)+' SEGUNDOS':'LEILÃO • 10 SEGUNDOS','Escolha comprar +1 ou evitar -1: quem evitar perde as moedas no limbo.')+
    (st.mode==='roulette'&&st.roulette?'<div class="roulette-event"><div class="roulette-wheel">🎰</div><div><span>EFEITO DA RODADA</span><h3>'+st.roulette.icon+' '+esc(st.roulette.name)+'</h3><p>'+esc(st.roulette.desc)+'</p></div></div>':'')+
    '<div class="offline-budgets"><div><b>'+esc(st.names[0])+'</b><span>🪙 '+st.budgets[0]+' moedas</span></div><strong>VS</strong><div><b>'+esc(st.names[1])+'</b><span>🪙 '+st.budgets[1]+' moedas</span></div></div>'+
    '<div class="auction-pair single-auction">'+card(st.current)+'</div>'+
    '<div class="live-auction"><div class="live-auction-numbers"><div><small>LANCE ATUAL</small><strong>🪙 '+st.bid+'</strong></div><div class="clock-face"><small>TEMPO PARA RESPONDER</small><b id="localSeconds">'+(st.turnSeconds||10)+'</b><div class="timer-track"><span id="localTimerBar"></span></div></div></div><p>'+(st.leader<0?'Faça o primeiro lance: +1 para comprar ou -1 para evitar':st.bidMode==='avoid'?esc(st.names[st.leader])+' queimará '+Math.abs(st.bid)+' moedas no limbo':esc(st.names[st.leader])+' está vencendo')+'</p></div>'+
    '<div class="offline-bidbox"><div class="offline-bidline"><div><span class="section-eyebrow">É A VEZ DE</span><h3>'+esc(st.names[turn])+'</h3></div><div class="offline-current">🪙 <strong>'+st.bid+'</strong></div></div>'+
    '<p class="offline-desc">Saldo: '+st.budgets[turn]+'. '+(st.bidMode==='avoid'?'Quem oferecer mais negativo evita o personagem; as moedas desaparecem.':st.bidMode==='buy'?'Quem oferecer mais positivo fica com o personagem.':'Para abrir o leilão, escolha comprar ou evitar. Pegar grátis não está disponível.')+'</p>'+
    '<div class="auction-buttons">'+(st.bidMode==='avoid'?'':btn('⚡ COMPRAR +'+next,'localRaise'))+
    ((st.bidMode==='buy'||!free(0).length||!free(1).length)?'':btn('🛡️ EVITAR '+neg,'localAvoid','btn-danger'))+
    (st.bidMode===null?'':btn(st.bidMode==='avoid'?'✅ PEGAR GRÁTIS':'✋ DESISTIR','localPass','btn-outline'))+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES FORMADOS ATÉ AGORA</div>'+teams()+historyPanel()+
    '<div class="offline-actions">'+btn('← SAIR','localExit','btn-outline')+'</div>';
  if($('localRaise'))$('localRaise').onclick=()=>bid(next);
  if($('localAvoid'))$('localAvoid').onclick=()=>bid(neg);
  if($('localPass'))$('localPass').onclick=()=>{if(st.bidMode!==null)endBid(st.bidMode==='avoid'?'Pegou gratuitamente':'Desistiu de cobrir');};
  $('localExit').onclick=()=>{if(confirm('Sair da partida?'))quit();};
  updateClock();
}
function bid(amount){
  if(!st||st.phase!=='auction'||Date.now()>st.deadline||!Number.isInteger(amount)||amount===0||!free(st.turn).length||Math.abs(amount)>st.budgets[st.turn])return;
  if(st.bidMode===null){
    if(amount!==1&&amount!==-1)return;
    if(amount<0&&(!free(0).length||!free(1).length))return;
    st.bidMode=amount<0?'avoid':'buy';
  }else if(amount!==st.bid+(st.bidMode==='avoid'?-1:1))return;
  st.leader=st.turn;st.bid=amount;st.turn=1-st.turn;st.deadline=Date.now()+(st.turnSeconds||10)*1000;st.lastBeepSecond=10;sound(amount<0?'avoid':'bid');
  if(!free(st.turn).length||Math.abs(st.bid)+1>st.budgets[st.turn]){endBid('rival não pode cobrir');return;}
  auction();schedule();
}
function endBid(reason){
  if(!st||st.phase!=='auction'||(st.bidMode===null&&reason!=='nenhum lance possível'))return;
  timers();st.phase='choose';st.reason=reason;
  let winner,avoider=-1,price=0;
  if(st.bidMode==='avoid'&&st.leader>=0){
    avoider=st.leader;winner=1-avoider;price=st.bid;
    st.budgets[avoider]+=price; // negativo diminui orçamento de quem evita, não transfere ao rival
  }else if(st.bidMode==='buy'&&st.leader>=0){
    winner=st.leader;price=st.bid;st.budgets[winner]-=price;
  }else winner=st.turn;
  if(!free(winner).length)winner=1-winner;
  st.winner=winner;st.avoider=avoider;st.price=price;
  sound('confirm');choose();
  if((['bot','mystery','roulette','tournament'].includes(st.mode)||(st.mode==='direct5v5'&&st.directBot))&&winner===1)botWait=setTimeout(()=>chooseSlot(free(1)[Math.floor(Math.random()*free(1).length)]),900);
}
function choose(){
  const n=st.winner,p=st.current;
  const chosenName=st.mode==='mystery'?'um personagem misterioso de '+esc(p.anime):esc(p.name);
  root().innerHTML=heading('ESCOLHA ONDE COLOCAR',st.mode==='direct5v5'?'Defina a ordem do seu time de cinco. O resultado dependerá da soma de todos os poderes.':'Os atributos numéricos continuam escondidos até confirmar a posição.')+
    '<div class="offline-winner"><span>🏆 VENCEDOR DO LEILÃO</span><h3>'+esc(st.names[n])+'</h3><p>Levou '+esc(p.name)+'. '+(st.price<0?'O rival queimou '+Math.abs(st.price)+' moedas no limbo.':'Preço 🪙 '+st.price+'.')+'</p></div>'+
    '<div class="auction-pair single-auction">'+card(p)+'</div>'+
    '<div class="placement-area"><span class="section-eyebrow">🎯 DEFINA SUA ESTRATÉGIA</span><h3>ESCOLHA UMA POSIÇÃO LIVRE</h3>'+
    '<div class="placement-options">'+ATTR.map((label,i)=>'<button class="position-btn" data-slot="'+i+'" '+(st.teams[n][i]?'disabled':'')+'><span>'+label+'</span><b>'+(st.teams[n][i]?'OCUPADO':'ESCOLHER →')+'</b></button>').join('')+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES</div>'+teams();
  root().querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>chooseSlot(Number(b.dataset.slot)));
}
function chooseSlot(slot){
  if(!st||st.phase!=='choose'||!free(st.winner).includes(slot))return;
  timers();st.phase='reveal';st.teams[st.winner][slot]=st.current;
  const p=st.current;sound('place');if(p.rarity==='Mítico')sound('victory');
  st.history.push({round:st.round+1,character:{id:p.id,name:p.name},winner:st.winner,price:st.price,slot,rarity:p.rarity,rating:p.rating});
  root().innerHTML=heading('PODER REVELADO!','O personagem entrou na posição escolhida. Agora os números aparecem.')+
    '<div class="offline-winner"><span>🎯 POSIÇÃO ESCOLHIDA: '+ATTR[slot]+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(st.names[st.winner])+' colocou o personagem. '+(st.price<0?'O rival queimou '+Math.abs(st.price)+' moedas no limbo.':'Pagou 🪙 '+st.price+'.')+'</p></div>'+
    '<div class="offline-revealpair one-reveal"><div class="offline-revealcard">'+portrait(p)+'<h4>'+esc(p.name)+'</h4>'+stats(p)+'</div></div>'+
    '<div class="offline-subtitle">⚔️ TIMES COMPLETADOS</div>'+teams()+historyPanel()+
    '<div class="offline-actions">'+btn(st.round===9?'⚔️ VER BATALHA FINAL':'PRÓXIMO LEILÃO →','localNext')+'</div>';
  $('localNext').onclick=()=>{st.round++;if(st.round>=10)battle();else draw();};
}
function directAuctionBattle(){
 timers();st.phase='battle';sound('victory');
 const power=p=>p?.stats?.reduce((sum,v)=>sum+v,0)||0;
 const totals=st.teams.map(team=>team.reduce((sum,p)=>sum+power(p),0));
 const counts=[0,0];
 const fights=Array.from({length:5},(_,i)=>{
  const a=st.teams[0][i],b=st.teams[1][i],x=power(a),y=power(b);
  if(x>y)counts[0]++;else if(y>x)counts[1]++;
  return '<div class="offline-fight offline-fight-v9" style="--battle-delay:'+(i*85)+'ms">'+
    '<div class="versus-text left '+(x>y?'win':'')+'"><small>PERSONAGEM '+(i+1)+'</small><b>'+esc(a?.name||'—')+'</b><strong>⚡ '+x+'</strong></div>'+
    '<div class="versus-middle"><div class="middle-photos"><div class="mid-photo '+(x>y?'win':'')+'">'+(a?portrait(a):'?')+'</div>'+
    '<div class="mid-vs-wrap"><span>VS</span><em>COMBATE '+(i+1)+'</em></div>'+
    '<div class="mid-photo '+(y>x?'win':'')+'">'+(b?portrait(b):'?')+'</div></div></div>'+
    '<div class="versus-text right '+(y>x?'win':'')+'"><small>PERSONAGEM '+(i+1)+'</small><b>'+esc(b?.name||'—')+'</b><strong>⚡ '+y+'</strong></div></div>';
 }).join('');
 const winner=totals[0]===totals[1]?-1:totals[0]>totals[1]?0:1;
 root().innerHTML='<div class="offline-final"><span class="phase-pill">⚔️ PERSONAGENS 5v5 • SOMA TOTAL</span>'+
  '<h2>'+(winner<0?'EMPATE!':esc(st.names[winner]).toUpperCase()+' VENCEU!')+'</h2>'+
  '<p>Vence o time que somar mais poder dos cinco personagens. Cada poder é a soma dos cinco atributos.</p>'+
  '<div class="offline-score"><div><small>'+esc(st.names[0])+'</small><strong>'+totals[0]+'</strong><span>PODER TOTAL DO TIME</span></div><b>VS</b>'+
  '<div><small>'+esc(st.names[1])+'</small><strong>'+totals[1]+'</strong><span>PODER TOTAL DO TIME</span></div></div></div>'+
  '<div class="offline-compact-fights"><div class="battle-lane-head"><span>'+esc(st.names[0])+'</span>'+
  '<span>5 PERSONAGENS VS 5 PERSONAGENS</span><span>'+esc(st.names[1])+'</span></div>'+fights+'</div>'+historyPanel()+
  '<div class="offline-actions">'+btn('🔄 REVANCHE • 50 MOEDAS','offlineAgain')+btn('← VOLTAR','offlineHome','btn-outline')+'</div>';
 $('offlineAgain').onclick=()=>{
  if(!st)return;const names=[...st.names],directBot=st.directBot;
  st={mode:'direct5v5',names,directBot,members:[],budgets:[50,50],
    teams:[Array(5).fill(null),Array(5).fill(null)],round:0,seen:[],
    current:null,leader:-1,turn:0,bid:0,deadline:0,phase:'setup',
    winner:-1,price:0,bidMode:null,avoider:-1,reason:'',history:[],lastBeepSecond:10};
  sound('confirm');draw();
 };
 $('offlineHome').onclick=quit;
}

function battle(){
  if(st.mode==='direct5v5'){directAuctionBattle();return;}
  timers();st.phase='battle';sound('victory');
  const scores=[0,0],total=[0,0];
  const fights=ATTR.map((attr,i)=>{
    const a=st.teams[0][i],b=st.teams[1][i];
    const x=a?.stats?.[i]??0,y=b?.stats?.[i]??0;
    total[0]+=x;total[1]+=y;
    if(x>y)scores[0]++;else if(y>x)scores[1]++;
    return '<div class="offline-fight offline-fight-v9" style="--battle-delay:'+(i*85)+'ms">'+
      '<div class="versus-text left '+(x>y?'win':'')+'"><small>'+(st.mode==='local2v2'?'DUPLA A':'JOGADOR 1')+'</small><b>'+(a?esc(a.name):'—')+'</b><strong>'+x+'</strong></div>'+
      '<div class="versus-middle"><div class="middle-photos"><div class="mid-photo '+(x>y?'win':'')+'">'+(a?portrait(a):'?')+'</div><div class="mid-vs-wrap"><span>VS</span><em>'+attr+'</em></div><div class="mid-photo '+(y>x?'win':'')+'">'+(b?portrait(b):'?')+'</div></div></div>'+
      '<div class="versus-text right '+(y>x?'win':'')+'"><small>'+(st.mode==='local2v2'?'DUPLA B':'JOGADOR 2')+'</small><b>'+(b?esc(b.name):'—')+'</b><strong>'+y+'</strong></div></div>';
  }).join('');
  const winner=total[0]===total[1]?-1:total[0]>total[1]?0:1;
  if(st.mode==='tournament')st.tournament.results[st.tournament.stage]={winner,totals:[...total]};
  const tournamentEnding=st.mode==='tournament'
    ?tournamentBracket()+
      '<div class="tournament-verdict">'+(winner===0&&st.tournament.stage===2?'🏆 VOCÊ É O CAMPEÃO DO TORNEIO!':winner===0?'✅ CLASSIFICADO PARA A PRÓXIMA FASE!':winner===1?'❌ ELIMINADO DO TORNEIO':'🤝 EMPATE: A FASE PRECISA SER REPETIDA')+'</div>'
    :'';
  root().innerHTML='<div class="offline-final"><span class="phase-pill">⚡ BATALHA FINAL • 5 CONFRONTOS</span><h2>'+(winner<0?'EMPATE!':esc(st.names[winner]).toUpperCase()+' VENCEU!')+'</h2>'+
    '<div class="offline-score"><div><small>'+esc(st.names[0])+'</small><strong>'+total[0]+'</strong><span>'+scores[0]+' atributos vencidos</span></div><b>VS</b>'+
    '<div><small>'+esc(st.names[1])+'</small><strong>'+total[1]+'</strong><span>'+scores[1]+' atributos vencidos</span></div></div></div>'+
    '<div class="offline-compact-fights"><div class="battle-lane-head"><span>'+esc(st.names[0])+'</span><span>FOTOS NO CENTRO</span><span>'+esc(st.names[1])+'</span></div>'+fights+'</div>'+
    historyPanel()+tournamentEnding+'<div class="offline-actions">'+
      (st.mode==='tournament'&&winner!==1&&(winner===-1||st.tournament.stage<2)?btn(winner===-1?'🔄 REPETIR FASE':st.tournament.stage===0?'🏆 IR PARA SEMIFINAL':'🏆 IR PARA FINAL','tournamentNext'):'')+
      btn(st.mode==='tournament'?'🏆 NOVO TORNEIO':'🔄 REVANCHE','offlineAgain')+btn('← VOLTAR','offlineHome','btn-outline')+'</div>';
  if(st.mode==='tournament'&&winner!==1&&(winner===-1||st.tournament.stage<2))$('tournamentNext').onclick=tournamentAdvance;
  $('offlineAgain').onclick=()=>{
    if(!st)return;
    if(st.mode==='tournament'){start('tournament');return;}
    const names=[...st.names],mode=st.mode,members=[...(st.members||[])];
    st={mode,names,members,budgets:[20,20],teams:[Array(5).fill(null),Array(5).fill(null)],round:0,seen:[],
      current:null,leader:-1,turn:0,bid:0,deadline:0,phase:'setup',
      winner:-1,price:0,bidMode:null,avoider:-1,reason:'',history:[],lastBeepSecond:10};
    sound('confirm');draw();
  };
  $('offlineHome').onclick=quit;
}
$('localBotBtn').addEventListener('click',()=>start('bot'));
$('localDuelBtn').addEventListener('click',()=>start('local'));
$('localSquadBtn').addEventListener('click',()=>start('local2v2'));
$('localMysteryBtn').addEventListener('click',()=>start('mystery'));
$('localRouletteBtn').addEventListener('click',()=>start('roulette'));
$('localTournamentBtn').addEventListener('click',()=>start('tournament'));
})();
