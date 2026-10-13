(() => {
'use strict';
// Modos locais independentes. Não alteram as salas e leilões 1v1/2v2 existentes.
const roster=window.ANIME_ROSTER||[];
const $=id=>document.getElementById(id);
const root=()=> $('specialContent');
const ATTR=['⚔️ FORÇA','🛡️ RESISTÊNCIA','🧠 QI','✨ HABILIDADE','💨 VELOCIDADE'];
const TIERS=['Comum','Raro','Épico','Lendário','Mítico'];
const TIER_WEIGHT=[18,30,31,15,6];
const POINTS=[15,30,45,60,75];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(caption,id,variant='btn-primary')=>'<button id="'+id+'" class="btn '+variant+'" type="button">'+caption+'</button>';
const sound=type=>{if(window.playAnimeSfx)window.playAnimeSfx(type)};
const sum=p=>p.stats.reduce((n,v)=>n+v,0);
const draw=items=>items[Math.floor(Math.random()*items.length)];
const rarity=p=>'<span class="rarity-chip rarity-'+(['common','rare','epic','legendary','mythic'][Math.max(0,TIERS.indexOf(p.rarity))])+'">✦ '+esc(p.rarity)+'</span>';
const photo=p=>{
  if(!p)return '';
  if(window.maybePhoto)window.maybePhoto(p);
  return window.imageMarkup?window.imageMarkup(p):'<span>'+esc(p.emoji||'✨')+'</span>';
};
const portrait=p=>'<div class="special-portrait">'+photo(p)+'</div>';
function weightedPick(pool) {
  const buckets=TIERS.map((tier,i)=>({items:pool.filter(p=>p.rarity===tier),weight:TIER_WEIGHT[i]})).filter(b=>b.items.length);
  if(!buckets.length)return draw(pool);
  let r=Math.random()*buckets.reduce((a,b)=>a+b.weight,0);
  for(const group of buckets){r-=group.weight;if(r<0)return draw(group.items);}
  return draw(buckets[buckets.length-1].items);
}
let game=null;
function open(mode) {
  if(!roster.length){if(window.toast)toast('Elenco ainda não carregou.');return;}
  if(typeof show!=='function')return;
  show('special');
  if(mode==='ffa')ffaSetup();else duelSetup();
}
function quit(){game=null;show('lobby');}
function headline(title,desc){
  return '<div class="special-heading"><span class="phase-pill">✦ MODO ESPECIAL • ANIME DRAFT</span><h2>'+title+'</h2><p>'+desc+'</p></div>';
}
function teamPhoto(p){return '<div class="special-player-face">'+portrait(p)+'<b>'+esc(p.name)+'</b></div>';}
function ffaSetup(){
  game=null;
  root().innerHTML=headline('👑 TODOS CONTRA TODOS','Quatro pessoas disputam 20 leilões. Cada uma recebe 20 moedas e monta cinco posições. Não há cronômetro: passe o aparelho a cada turno.')+
    '<div class="special-input-grid">'+Array.from({length:4},(_,i)=>'<label class="field-label">JOGADOR '+(i+1)+'<input id="ffaName'+i+'" maxlength="20" value="'+esc(i===0?($('nickname')?.value||'Jogador 1'):'Jogador '+(i+1))+'"></label>').join('')+'</div>'+
    '<div class="offline-actions">'+button('👑 COMEÇAR 4 JOGADORES','ffaBegin')+button('← VOLTAR','specialExit','btn-outline')+'</div>';
  $('ffaBegin').onclick=ffaStart;
  $('specialExit').onclick=quit;
}
function ffaStart(){
  const players=Array.from({length:4},(_,i)=>({name:($('ffaName'+i)?.value||'').trim().slice(0,20)||'Jogador '+(i+1),
    coins:20,team:Array(5).fill(null)}));
  game={mode:'ffa',players,round:0,seen:new Set(),history:[],leader:-1,bid:0,turn:0,
    passed:new Set(),current:null,phase:'auction',winner:-1,price:0};
  ffaNewAuction();
}
function eligible(){
  return game.players.map((p,i)=>({p,i})).filter(x=>x.p.team.some(c=>!c)).map(x=>x.i);
}
function ffaWallets(){
  return '<div class="ffa-wallets">'+game.players.map((p,i)=>
   '<div class="ffa-wallet '+(game.turn===i&&game.phase==='auction'?'active':'')+'"><small>JOGADOR '+(i+1)+'</small><b>'+esc(p.name)+'</b><span>🪙 '+p.coins+' · '+p.team.filter(Boolean).length+'/5</span></div>'
  ).join('')+'</div>';
}
function ffaTeams(){
  return '<details class="auction-history ffa-team-details"><summary>⚔️ VER TIMES DOS 4 JOGADORES</summary><div class="ffa-teams">'+
    game.players.map((p,i)=>'<div class="ffa-team"><b>'+esc(p.name)+'</b>'+
      p.team.map((c,k)=>'<div class="ffa-team-slot"><small>'+ATTR[k]+'</small><span>'+(c?esc(c.name):'—')+'</span><strong>'+(c?c.stats[k]:'?')+'</strong></div>').join('')+'</div>').join('')+'</div></details>';
}
function ffaHistory(){
  return '<details class="auction-history"><summary>📜 HISTÓRICO · '+game.history.length+' / 20 LEILÕES</summary><div class="history-list">'+
    (game.history.length?game.history.map(h=>'<div class="history-entry"><b>#'+h.round+'</b><div class="history-info"><b>'+esc(h.character.name)+'</b><small>'+esc(game.players[h.winner].name)+' · '+ATTR[h.slot]+'</small></div><strong class="history-price">🪙 '+h.price+'</strong></div>').join(''):'<span class="muted">Nenhum leilão ainda.</span>')+
    '</div></details>';
}
function ffaNextTurn(from){
  for(let d=1;d<=4;d++){
    const i=(from+d)%4,p=game.players[i];
    if(i===game.leader||game.passed.has(i)||p.coins<=game.bid||p.team.every(Boolean))continue;
    return i;
  }
  return -1;
}
function ffaNewAuction(){
  if(!game||game.mode!=='ffa')return;
  if(game.round>=20||!eligible().length){ffaFinish();return;}
  const pool=roster.filter(p=>!game.seen.has(p.id));
  if(!pool.length){ffaFinish();return;}
  game.current=weightedPick(pool);game.seen.add(game.current.id);
  game.bid=0;game.leader=-1;game.passed=new Set();
  game.phase='auction';
  const options=eligible().filter(i=>game.players[i].coins>0);
  if(options.length<=1){
    const forced=eligible()[(game.round)%eligible().length];
    game.leader=forced;game.bid=0;ffaAward(true);return;
  }
  const start=game.round%4;
  game.turn=options.find(i=>i>=start)??options[0];
  ffaAuction();
}
function ffaAuction(){
  const active=game.players[game.turn],leader=game.leader;
  root().innerHTML=headline('👑 LEILÃO '+(game.round+1)+' DE 20','Turnos alternados no mesmo aparelho. Só é possível passar depois do primeiro lance. Quem vencer escolhe a posição antes de ver os poderes.')+
    ffaWallets()+
    '<div class="ffa-auction-layout"><div class="ffa-offer">'+portrait(game.current)+'<div><small>'+esc(game.current.anime)+'</small><h3>'+esc(game.current.name)+'</h3><span class="offline-unknown">🔒 RARIDADE E PODER: ???</span></div></div>'+
    '<div class="ffa-turn"><span>É A VEZ DE</span><h3>'+esc(active.name)+'</h3><p>Maior lance: <b>🪙 '+game.bid+'</b><br>'+(leader>=0?'Líder: '+esc(game.players[leader].name):'Ninguém deu lance ainda.')+'</p>'+
    '<div class="auction-buttons">'+button('⚡ OFERECER '+(game.bid+1)+' MOEDA'+(game.bid?'S':''),'ffaRaise')+
    (leader<0?'':button('✋ PASSAR','ffaPass','btn-outline'))+'</div><small>Seu saldo: '+active.coins+' moedas.</small></div></div>'+
    ffaTeams()+ffaHistory()+'<div class="offline-actions">'+button('← ENCERRAR','ffaExit','btn-outline')+'</div>';
  $('ffaRaise').disabled=active.coins<game.bid+1;
  $('ffaRaise').onclick=ffaRaise;
  if($('ffaPass'))$('ffaPass').onclick=ffaPass;
  $('ffaExit').onclick=()=>{if(confirm('Encerrar partida de quatro jogadores?'))quit();};
}
function ffaRaise(){
  if(!game||game.phase!=='auction')return;
  const who=game.turn,amount=game.bid+1;
  if(game.players[who].coins<amount||game.players[who].team.every(Boolean))return;
  game.bid=amount;game.leader=who;sound('bid');
  const next=ffaNextTurn(who);
  if(next<0)ffaAward();else{game.turn=next;ffaAuction();}
}
function ffaPass(){
  if(!game||game.phase!=='auction'||game.leader<0)return;
  game.passed.add(game.turn);sound('confirm');
  const next=ffaNextTurn(game.turn);
  if(next<0)ffaAward();else{game.turn=next;ffaAuction();}
}
function ffaAward(forced=false){
  if(!game||game.mode!=='ffa')return;
  if(game.leader<0)throw Error('Leilão sem vencedor');
  game.phase='place';game.winner=game.leader;game.price=game.bid;
  game.players[game.winner].coins-=game.price;
  const p=game.players[game.winner];
  root().innerHTML=headline('🏆 '+esc(p.name)+' VENCEU!','Escolha uma das cinco posições livres para revelar os poderes. A raridade ainda está escondida.')+
    ffaWallets()+'<div class="ffa-choose-box">'+portrait(game.current)+'<div><h3>'+esc(game.current.name)+'</h3><p>'+(forced?'Distribuição automática: apenas uma equipe podia disputar o personagem.':'Preço pago: 🪙 '+game.price)+'.</p></div></div>'+
    '<div class="placement-options">'+ATTR.map((a,i)=>'<button type="button" class="position-btn" data-ffa-slot="'+i+'" '+(p.team[i]?'disabled':'')+'><span>'+a+'</span><b>'+(p.team[i]?'OCUPADO':'ESCOLHER →')+'</b></button>').join('')+'</div>'+
    ffaTeams()+ffaHistory();
  root().querySelectorAll('[data-ffa-slot]').forEach(b=>b.onclick=()=>ffaPlace(Number(b.dataset.ffaSlot)));
}
function ffaPlace(slot){
  if(!game||game.phase!=='place'||!Number.isInteger(slot)||slot<0||slot>=5)return;
  const player=game.players[game.winner];if(player.team[slot])return;
  player.team[slot]=game.current;
  game.history.push({round:game.round+1,character:game.current,winner:game.winner,price:game.price,slot});
  game.phase='reveal';sound(game.current.rarity==='Mítico'?'victory':'place');
  root().innerHTML=headline('✨ PERSONAGEM REVELADO!','Agora os poderes e a raridade podem ser vistos.')+
    '<div class="ffa-choose-box">'+portrait(game.current)+'<div><h3>'+esc(game.current.name)+'</h3>'+rarity(game.current)+
      '<p>'+esc(player.name)+' colocou o personagem em '+ATTR[slot]+'.</p><div class="special-power">⚡ PODER GERAL '+game.current.rating+'<br>'+
      ATTR.map((a,i)=>a+': '+game.current.stats[i]).join(' • ')+'</div></div></div>'+
    ffaWallets()+ffaTeams()+ffaHistory()+
    '<div class="offline-actions">'+button(game.round===19?'👑 VER RESULTADO FINAL':'PRÓXIMO LEILÃO →','ffaNext')+'</div>';
  $('ffaNext').onclick=()=>{game.round++;ffaNewAuction();};
}
function ffaFinish(){
  if(!game||game.mode!=='ffa')return;
  game.phase='result';sound('victory');
  const standings=game.players.map((p,i)=>({name:p.name,team:p.team,index:i,total:p.team.reduce((sum,c,k)=>sum+(c?.stats?.[k]||0),0)}))
    .sort((a,b)=>b.total-a.total);
  const leader=standings[0],max=leader.total;
  const names=standings.filter(x=>x.total===max).map(x=>x.name);
  root().innerHTML=headline('👑 '+(names.length>1?'EMPATE NO TOPO!':esc(leader.name)+' É O CAMPEÃO!'),'20 leilões disputados. Classificação final pela soma dos cinco atributos de cada jogador.')+
    '<div class="ffa-standings">'+standings.map((p,i)=>'<div class="ffa-standing '+(i===0?'champion':'')+'"><b>#'+(i+1)+'</b><span>'+esc(p.name)+'</span><strong>⚡ '+p.total+'</strong></div>').join('')+'</div>'+
    '<div class="ffa-result-scroll"><div class="ffa-battle-matrix">'+ATTR.map((a,i)=>'<div class="ffa-compare-row"><strong>'+a+'</strong><div>'+game.players.map(p=>'<div>'+portrait(p.team[i])+'<small>'+esc(p.team[i]?.name||'—')+'</small><b>'+(p.team[i]?.stats?.[i]??'—')+'</b></div>').join('')+'</div></div>').join('')+'</div></div>'+
    ffaHistory()+'<div class="offline-actions">'+button('🔄 NOVA PARTIDA','ffaAgain')+button('← VOLTAR','ffaHome','btn-outline')+'</div>';
  $('ffaAgain').onclick=ffaSetup;$('ffaHome').onclick=quit;
}
function duelSetup(){
  game=null;
  root().innerHTML=headline('⚔️ BATALHA DIRETA 5v5','Escolha cinco personagens para cada lado. Eles lutam um contra um em cinco confrontos. Não há disputa de Força, QI ou outros atributos: cada duelo usa raridade e um fator surpresa.')+
    '<div class="duel-setup">'+
    '<label class="field-label">JOGADOR 1<input id="duelName0" maxlength="20" value="'+esc($('nickname')?.value||'Jogador 1')+'"></label>'+
    '<label class="field-label">ADVERSÁRIO<select id="duelOpponent"><option value="bot">🤖 CONTRA BOT</option><option value="local">👥 2 JOGADORES LOCAIS</option></select></label>'+
    '<label class="field-label" id="duelName2Wrap" hidden>NOME DO JOGADOR 2<input id="duelName1" maxlength="20" value="Jogador 2"></label>'+
    '</div><div class="offline-actions">'+button('⚔️ MONTAR TIMES','duelBegin')+button('← VOLTAR','duelHome','btn-outline')+'</div>';
  $('duelOpponent').onchange=()=>{$('duelName2Wrap').hidden=$('duelOpponent').value!=='local';};
  $('duelBegin').onclick=duelBegin;
  $('duelHome').onclick=quit;
}
function duelBegin(){
  const isBot=$('duelOpponent').value==='bot';
  const name0=($('duelName0').value||'').trim().slice(0,20)||'Jogador 1';
  const name1=isBot?'BOT':(($('duelName1').value||'').trim().slice(0,20)||'Jogador 2');
  game={mode:'duel',names:[name0,name1],isBot,teams:[[],[]],used:new Set(),phase:'select',side:0,
    bouts:[],round:0};
  duelSelect();
}
function duelLineup(){
  return '<div class="duel-lineups">'+game.teams.map((team,i)=>'<div class="duel-roster"><h4>'+(i===0?'🔷 ':'🔶 ')+esc(game.names[i])+' · '+team.length+'/5</h4>'+
    '<div class="duel-lineup-faces">'+Array.from({length:5},(_,k)=>team[k]?'<div class="duel-picked">'+portrait(team[k])+'<small>'+esc(team[k].name)+'</small></div>':'<div class="duel-unfilled">?</div>').join('')+'</div></div>').join('')+'</div>';
}
function availableDuelCharacters(query=''){
  const needle=query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return roster.filter(p=>!game.used.has(p.id)&&(!needle||(p.name+' '+p.anime).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(needle)))
    .sort((a,b)=>a.anime.localeCompare(b.anime)||a.name.localeCompare(b.name));
}
function updateDuelOptions(){
  const options=availableDuelCharacters($('duelSearch')?.value||'');
  $('duelSelect').innerHTML=options.length?options.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' — '+esc(p.anime)+'</option>').join(''):'<option value="">Nenhum personagem encontrado</option>';
  $('duelAdd').disabled=!options.length;
  if(options.length)duelPreview();
  else $('duelPreview').innerHTML='<span class="muted">Tente outro nome ou anime.</span>';
}
function duelPreview(){
  const p=roster.find(x=>x.id===$('duelSelect').value);if(!p)return;
  $('duelPreview').innerHTML=portrait(p)+'<div><h3>'+esc(p.name)+'</h3><small>'+esc(p.anime)+'</small><div>'+rarity(p)+'</div></div>';
}
function duelSelect(){
  if(!game||game.mode!=='duel')return;
  game.phase='select';
  const side=game.side;
  root().innerHTML=headline('⚔️ FORME O SEU TIME','Selecione cinco personagens. Cada personagem só pode ser escolhido uma vez. No confronto final, vale a vitória do personagem, não o atributo escolhido.')+
    duelLineup()+'<div class="duel-select-box"><span class="section-eyebrow">É A VEZ DE</span><h3>'+esc(game.names[side])+'</h3>'+
    '<label class="field-label">ENCONTRE PERSONAGEM POR NOME OU ANIME<input id="duelSearch" placeholder="Ex.: Naruto, Goku, Rimuru..." autocomplete="off"></label>'+
    '<label class="field-label">SELECIONE O PERSONAGEM<select id="duelSelect"></select></label><div id="duelPreview" class="duel-preview"></div>'+
    '<div class="offline-actions">'+button('➕ ADICIONAR AO TIME','duelAdd')+button('↩ DESFAZER ÚLTIMO','duelUndo','btn-outline')+button('← SAIR','duelExit','btn-outline')+'</div></div>';
  $('duelSearch').oninput=updateDuelOptions;
  $('duelSelect').onchange=duelPreview;
  $('duelAdd').onclick=duelAdd;
  $('duelUndo').disabled=!game.teams[side].length;
  $('duelUndo').onclick=duelUndo;
  $('duelExit').onclick=()=>{if(confirm('Sair da batalha 5v5?'))quit();};
  updateDuelOptions();
}
function duelAdd(){
  if(!game||game.mode!=='duel'||game.phase!=='select')return;
  const id=$('duelSelect').value,p=roster.find(x=>x.id===id),team=game.teams[game.side];
  if(!p||game.used.has(id)||team.length>=5)return;
  team.push(p);game.used.add(id);sound('place');
  if(team.length===5){
    if(game.side===0){
      game.side=1;
      if(game.isBot){
        for(let k=0;k<5;k++){
          const next=weightedPick(roster.filter(x=>!game.used.has(x.id)));
          game.teams[1].push(next);game.used.add(next.id);
        }
        duelFightStart();return;
      }
    }else{duelFightStart();return;}
  }
  duelSelect();
}
function duelUndo(){
  if(!game||game.mode!=='duel'||game.phase!=='select')return;
  const last=game.teams[game.side].pop();if(!last)return;
  game.used.delete(last.id);duelSelect();
}
function calculateDuel(a,b){
  // A batalha NÃO compara atributos. Força do confronto = tier de raridade + sorte da rodada.
  // Vantagem de raridade pode ser revertida por variação de combate.
  const tierA=TIERS.indexOf(a.rarity)+1,tierB=TIERS.indexOf(b.rarity)+1;
  const powerA=tierA*12+Math.floor(Math.random()*40)+1;
  const powerB=tierB*12+Math.floor(Math.random()*40)+1;
  const winner=powerA===powerB?(Math.random()<.5?0:1):(powerA>powerB?0:1);
  return {a,b,powerA,powerB,winner};
}
function duelFightStart(){
  if(!game||game.teams.some(team=>team.length!==5))return;
  game.bouts=Array.from({length:5},(_,i)=>calculateDuel(game.teams[0][i],game.teams[1][i]));
  game.round=0;game.phase='battle';duelFight();
}
function duelScore(){
  return [0,1].map(i=>game.bouts.slice(0,game.round+1).filter(b=>b.winner===i).length);
}
function duelFight(){
  if(!game||game.phase!=='battle')return;
  const current=game.bouts[game.round],scores=duelScore();
  sound(game.round===4?'victory':'impact');
  root().innerHTML=headline('⚔️ BATALHA DIRETA • DUELO '+(game.round+1)+' / 5','Cada confronto compara o desempenho de batalha, que depende da raridade e de uma variação de combate. Nenhum dos cinco atributos é usado individualmente.')+
    '<div class="special-battle-score"><div><small>'+esc(game.names[0])+'</small><strong>'+scores[0]+'</strong></div><span>VS</span><div><small>'+esc(game.names[1])+'</small><strong>'+scores[1]+'</strong></div></div>'+
    '<div class="direct-clash">'+
    '<div class="direct-fighter '+(current.winner===0?'winner':'')+'">'+portrait(current.a)+rarity(current.a)+'<h3>'+esc(current.a.name)+'</h3><strong>⚔️ '+current.powerA+'</strong></div>'+
    '<span class="direct-vs">VS</span>'+
    '<div class="direct-fighter '+(current.winner===1?'winner':'')+'">'+portrait(current.b)+rarity(current.b)+'<h3>'+esc(current.b.name)+'</h3><strong>⚔️ '+current.powerB+'</strong></div></div>'+
    '<div class="special-match-winner">🏅 VENCEU O DUELO: '+esc(current.winner===0?current.a.name:current.b.name)+'</div>'+
    '<div class="special-battle-progress">'+game.bouts.map((b,i)=>'<span class="'+(i<=game.round?'done':'')+'">DUELO '+(i+1)+'</span>').join('')+'</div>'+
    '<div class="offline-actions">'+button(game.round===4?'🏆 VER RESULTADO FINAL':'⚔️ PRÓXIMO CONFRONTO','duelNext')+'</div>';
  $('duelNext').onclick=()=>{game.round++;if(game.round===5)duelFinish();else duelFight();};
}
function duelFinish(){
  if(!game||game.bouts.length!==5)return;
  game.phase='result';sound('victory');
  const scores=[0,1].map(i=>game.bouts.filter(b=>b.winner===i).length);
  const winner=scores[0]>scores[1]?0:1;
  root().innerHTML=headline('🏆 '+esc(game.names[winner])+' VENCEU O 5v5!','Cinco lutas diretas entre personagens. Não foi comparado nenhum atributo específico.')+
    '<div class="special-battle-score"><div><small>'+esc(game.names[0])+'</small><strong>'+scores[0]+'</strong></div><span>VS</span><div><small>'+esc(game.names[1])+'</small><strong>'+scores[1]+'</strong></div></div>'+
    '<div class="direct-history">'+game.bouts.map((b,i)=>'<div class="direct-history-row"><span>ROUND '+(i+1)+'</span>'+
      '<div class="'+(b.winner===0?'winner':'')+'">'+portrait(b.a)+'<b>'+esc(b.a.name)+'</b><strong>'+b.powerA+'</strong></div>'+
      '<b>VS</b>'+
      '<div class="'+(b.winner===1?'winner':'')+'">'+portrait(b.b)+'<b>'+esc(b.b.name)+'</b><strong>'+b.powerB+'</strong></div></div>').join('')+'</div>'+
    '<div class="offline-actions">'+button('⚔️ NOVA BATALHA','duelAgain')+button('← VOLTAR','duelHome','btn-outline')+'</div>';
  $('duelAgain').onclick=duelSetup;$('duelHome').onclick=quit;
}
$('ffaBtn').addEventListener('click',()=>open('ffa'));
// 5v5 agora usa leilões de 50 moedas (public/offline.js), não seleção livre.
})();