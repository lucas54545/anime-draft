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
  if(mode!=='ffa')return;
  ffaSetup();
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
$('ffaBtn').addEventListener('click',()=>open('ffa'));
// 5v5 agora usa leilões de 50 moedas (public/offline.js), não seleção livre.
})();