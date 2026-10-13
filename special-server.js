'use strict';
// Multiplayer V13 para modos especiais. Leilões, sorteios e confrontos são definidos no servidor.
// Nenhum saldo ou resultado enviado pelo navegador é confiável.
const crypto=require('node:crypto');
const TIERS=['Comum','Raro','Épico','Lendário','Mítico'];
const WEIGHTS=[18,30,31,15,6];
const ATTR=['Força','Resistência','QI','Habilidade','Velocidade'];
const MODES={mystery:2,roulette:2,ffa:4,direct:2,tournament:8};
const MAX_ROUNDS={mystery:10,roulette:10,ffa:20,tournament:10};
const delay=()=>Number(process.env.SPECIAL_ROUND_DELAY_MS||2600);
const codeAlphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function createSpecialMultiplayer({users,roster,issue,presence}){
  const characters=new Map(roster.map(c=>[c.id,c]));
  const lobbies=new Map(),games=new Map();
  const chosen=[]; // usado apenas para estatísticas internas dos testes
  const token=()=>crypto.randomBytes(10).toString('hex');
  function genCode(){
    for(let i=0;i<50;i++){
      const bytes=crypto.randomBytes(6),code=[...bytes].map(n=>codeAlphabet[n%codeAlphabet.length]).join('');
      if(!lobbies.has(code))return code;
    }
    throw Error('Não foi possível gerar uma sala.');
  }
  const nickname=tok=>users.get(tok)?.name||'Jogador';
  const notify=(tok,msg)=>{const user=users.get(tok);if(user)issue(user,msg);};
  const notifyMany=(toks,msg)=>toks.forEach(t=>notify(t,msg));
  function emitPresence(){if(presence)presence();}
  const plain=c=>({id:c.id,name:c.name,anime:c.anime,emoji:c.emoji});
  const revealed=c=>({...plain(c),stats:c.stats,rarity:c.rarity,rating:c.rating});
  const tier=c=>Math.max(0,TIERS.indexOf(c.rarity));
  const avg=c=>c.stats.reduce((a,b)=>a+b,0);
  function drawWeighted(pool){
    const groups=TIERS.map((name,i)=>({items:pool.filter(x=>x.rarity===name),weight:WEIGHTS[i]})).filter(x=>x.items.length);
    if(!groups.length)return pool[Math.floor(Math.random()*pool.length)];
    let draw=Math.random()*groups.reduce((n,b)=>n+b.weight,0);
    for(const g of groups){draw-=g.weight;if(draw<0)return g.items[Math.floor(Math.random()*g.items.length)];}
    return groups.at(-1).items[0];
  }
  function busy(user){return !!(user?.roomId||user?.squadCode||user?.specialLobbyCode||user?.specialGameId);}
  function lobbyView(lobby){
    return {type:'special_lobby',code:lobby.code,mode:lobby.mode,needed:MODES[lobby.mode],
      members:lobby.players.map(nickname),host:nickname(lobby.host)};
  }
  function sendLobby(lobby){notifyMany(lobby.players,lobbyView(lobby));}
  function create(user,mode){
    if(!MODES[mode])throw Error('Modo online inexistente.');
    if(busy(user))throw Error('Saia da sua sala atual antes de criar outra.');
    const code=genCode(),lobby={code,mode,host:user.token,players:[user.token]};
    lobbies.set(code,lobby);user.specialLobbyCode=code;sendLobby(lobby);emitPresence();
  }
  function join(user,code){
    if(busy(user))throw Error('Saia da sua sala atual antes de entrar em outra.');
    if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Código inválido: use seis letras/números.');
    const lobby=lobbies.get(code);
    if(!lobby)throw Error('Sala não encontrada. Confira o código.');
    if(lobby.players.length>=MODES[lobby.mode])throw Error('Sala cheia.');
    lobby.players.push(user.token);user.specialLobbyCode=code;
    sendLobby(lobby);emitPresence();
    if(lobby.players.length===MODES[lobby.mode]){
      lobbies.delete(lobby.code);const game={id:token(),code:lobby.code,mode:lobby.mode,
        players:[...lobby.players],matches:[],stage:0,bracket:[],winners:[],voted:new Set(),phase:'active'};
      games.set(game.id,game);
      for(const t of game.players){const u=users.get(t);if(u){u.specialLobbyCode=null;u.specialGameId=game.id;}}
      startGame(game);emitPresence();
    }
  }
  function leave(user){
    if(user.specialLobbyCode){
      const lobby=lobbies.get(user.specialLobbyCode);user.specialLobbyCode=null;
      if(lobby){
        if(lobby.host===user.token){
          lobbies.delete(lobby.code);
          for(const tok of lobby.players){const u=users.get(tok);if(u){u.specialLobbyCode=null;notify(tok,{type:'special_left',reason:'O criador encerrou a sala.'});}}
        }else{
          lobby.players=lobby.players.filter(t=>t!==user.token);sendLobby(lobby);
          notify(user.token,{type:'special_left',reason:'Você saiu da sala online.'});
        }
      }
      emitPresence();return;
    }
    if(user.specialGameId){
      const game=games.get(user.specialGameId);user.specialGameId=null;
      if(game){
        stopGame(game);
        for(const tok of game.players){const u=users.get(tok);if(u)u.specialGameId=null;}
        notifyMany(game.players,{type:'special_left',reason:nickname(user.token)+' encerrou a partida online.'});
        games.delete(game.id);
      }
      emitPresence();
    }
  }
  function stopGame(game){for(const m of game.matches){clearTimeout(m.timer);m.timer=null;}}
  function onDisconnect(user){
    // A sessão e os jogos ficam preservados para reconexão pelo mesmo token.
    // Os timers do servidor continuam garantindo o andamento das rodadas.
  }
  function resume(user){
    if(user.specialLobbyCode){const lobby=lobbies.get(user.specialLobbyCode);if(lobby)notify(user.token,lobbyView(lobby));else user.specialLobbyCode=null;}
    if(user.specialGameId){const game=games.get(user.specialGameId);if(game)sendView(game,user.token);else user.specialGameId=null;}
  }
  function resetMatch(game,participants,stage=0,ordinal=0){
    return {id:token(),gameId:game.id,stage,ordinal,players:[...participants],mode:game.mode,
      teams:participants.map(()=>Array(5).fill(null)),budgets:participants.map(()=>20),
      round:0,max:game.mode==='ffa'?20:10,phase:'auction',
      seen:new Set(),current:null,lead:-1,bid:0,bidMode:null,turn:0,passes:new Set(),
      deadline:0,timer:null,placer:-1,price:0,avoider:-1,event:null,seconds:10,
      result:null,history:[],battle:null};
  }
  function startGame(game){
    game.phase='active';game.stage=0;game.bracket=[];game.winners=[];game.voted=new Set();
    stopGame(game);
    if(game.mode==='direct'){
      game.matches=[];
      game.direct={phase:'draft',picks:0,players:[...game.players],teams:[[],[]],
        used:new Set(),deadline:0,timer:null,round:0,bouts:[],scores:[0,0],result:null};
      scheduleDirect(game);return;
    }
    if(game.mode==='tournament'){
      game.alive=[...game.players];
      startTournamentStage(game);return;
    }
    game.matches=[resetMatch(game,game.players)];
    offerNext(game,game.matches[0]);
  }
  function bracketView(game){
    return {stage:game.stage,roundName:['QUARTAS DE FINAL','SEMIFINAL','FINAL'][game.stage]||'TORNEIO',
      history:game.bracket.map(b=>({stage:b.stage,matches:b.matches.map(p=>({names:p.names,winner:p.winner,status:p.status}))})),
      current:game.matches.map(m=>({names:m.players.map(nickname),winner:m.battle?.winnerName||null,
        status:m.phase==='complete'?'finalizado':'em andamento'}))};
  }
  function startTournamentStage(game){
    game.matches=[];
    const round={stage:game.stage,matches:[]};
    game.bracket.push(round);
    for(let i=0;i<game.alive.length;i+=2){
      const players=game.alive.slice(i,i+2),m=resetMatch(game,players,game.stage,i/2);
      game.matches.push(m);
      round.matches.push({names:players.map(nickname),winner:null,status:'em andamento'});
    }
    for(const m of game.matches)offerNext(game,m);
    sendSpectators(game);
  }
  function participantsInActiveMatch(game){return new Set(game.matches.filter(m=>m.phase!=='complete').flatMap(m=>m.players));}
  function sendSpectators(game){
    if(game.mode!=='tournament')return;
    const active=participantsInActiveMatch(game);
    for(const tok of game.players)if(!active.has(tok)){
      const m=game.matches.find(m=>m.players.includes(tok));
      if(m?.phase==='complete'&&game.phase!=='complete'){
        notify(tok,{type:'special_tournament_status',mode:'tournament',code:game.code,
          bracket:bracketView(game),status:game.alive.includes(tok)?'Aguardando os outros confrontos.':'Eliminado — você pode acompanhar a chave.'});
      }else if(!m){
        notify(tok,{type:'special_tournament_status',mode:'tournament',code:game.code,
          bracket:bracketView(game),status:'Você foi eliminado, mas pode acompanhar o torneio.'});
      }
    }
  }
  function matchFor(game,tok){return game.matches.find(m=>m.players.includes(tok));}
  function validForTurn(m,idx){return idx>=0&&m.teams[idx].some(x=>x===null)&&m.budgets[idx]>0;}
  function openSlots(m,i){return m.teams[i].map((p,index)=>p===null?index:-1).filter(n=>n>=0);}
  function startingIndex(m){
    const candidates=m.players.map((_,i)=>i).filter(i=>validForTurn(m,i));
    if(!candidates.length)return -1;
    const desired=m.round%m.players.length;
    return candidates.find(i=>i>=desired)??candidates[0];
  }
  function remainingMatchSlots(m){return m.teams.some(team=>team.some(x=>x===null));}
  function pickEffect(m){
    if(m.mode!=='roulette'){m.event=null;m.seconds=10;return;}
    const effects=[
      {key:'coins',name:'🪙 CHUVA DE MOEDAS',description:'As duas equipes recebem +2 moedas.'},
      {key:'bonus',name:'🎁 BÔNUS SURPRESA',description:'Uma equipe recebe +3 moedas extras.'},
      {key:'speed',name:'⚡ MODO TURBO',description:'Sete segundos por resposta.'},
      {key:'slow',name:'⏳ TEMPO EXTRA',description:'Quinze segundos por resposta.'},
      {key:'portal',name:'🌌 PORTAL MISTERIOSO',description:'Maior chance de personagens poderosos.'}
    ];
    m.event={...effects[Math.floor(Math.random()*effects.length)]};m.seconds=10;
    if(m.event.key==='coins')m.budgets=m.budgets.map(n=>Math.min(n+2,30));
    if(m.event.key==='bonus'){
      const i=Math.floor(Math.random()*m.players.length);
      m.budgets[i]=Math.min(30,m.budgets[i]+3);
      m.event.description=nickname(m.players[i])+' recebeu +3 moedas.';
    }
    if(m.event.key==='speed')m.seconds=7;
    if(m.event.key==='slow')m.seconds=15;
  }
  function offerNext(game,m){
    clearTimeout(m.timer);m.timer=null;
    if(m.round>=m.max||!remainingMatchSlots(m)){finishMatch(game,m);return;}
    pickEffect(m);
    const pool=roster.filter(c=>!m.seen.has(c.id)&&!m.teams.flat().includes(c.id));
    if(!pool.length){finishMatch(game,m);return;}
    let offerPool=pool;
    if(m.event?.key==='portal'){
      const special=pool.filter(c=>['Épico','Lendário','Mítico'].includes(c.rarity));
      if(special.length)offerPool=special;
    }
    const p=drawWeighted(offerPool);m.current=p.id;m.seen.add(p.id);
    m.phase='auction';m.bid=0;m.lead=-1;m.bidMode=null;m.price=0;m.avoider=-1;
    m.placer=-1;m.result=null;m.passes=new Set();
    m.turn=startingIndex(m);
    if(m.turn<0){
      const choices=m.players.map((_,i)=>i).filter(i=>openSlots(m,i).length);
      if(!choices.length){finishMatch(game,m);return;}
      m.placer=choices[m.round%choices.length];m.price=0;m.phase='place';m.deadline=Date.now()+16000;
      publishGame(game);scheduleMatch(game,m);
      return;
    }
    m.deadline=Date.now()+m.seconds*1000;
    publishGame(game);scheduleMatch(game,m);
  }
  function scheduleMatch(game,m){
    clearTimeout(m.timer);
    if(!games.has(game.id))return;
    m.timer=setTimeout(()=>{
      if(!games.has(game.id))return;
      if(m.phase==='auction')expireAuction(game,m);
      else if(m.phase==='place')place(game,m,m.placer,openSlots(m,m.placer)[0]);
      else if(m.phase==='reveal'){m.round++;offerNext(game,m);}
    },Math.max(1,m.deadline-Date.now())+50);
    m.timer.unref?.();
  }
  function nextEligible(m,from){
    const count=m.players.length;
    for(let d=1;d<=count;d++){
      const i=(from+d)%count;
      if(i===m.lead||m.passes.has(i)||!validForTurn(m,i)||m.budgets[i]<Math.abs(m.bid)+1)continue;
      return i;
    }
    return -1;
  }
  function expireAuction(game,m){
    if(m.phase!=='auction')return;
    if(m.lead>=0){finishAuction(game,m);return;}
    const remaining=m.players.map((_,i)=>i).filter(i=>validForTurn(m,i));
    if(!remaining.length){
      m.placer=m.players.map((_,i)=>i).filter(i=>openSlots(m,i).length)[m.round%m.players.length]??-1;
      if(m.placer<0){finishMatch(game,m);return;}
      m.phase='place';m.deadline=Date.now()+16000;publishGame(game);scheduleMatch(game,m);return;
    }
    const i=remaining.find(x=>x!==m.turn);
    if(i===undefined&&m.turn===remaining[0]){
      // O único participante com moedas pode ganhar sem pagar, caso ninguém mais consiga dar lance.
      m.lead=m.turn;m.bid=0;finishAuction(game,m);return;
    }
    m.turn=i??remaining[0];m.deadline=Date.now()+m.seconds*1000;publishGame(game);scheduleMatch(game,m);
  }
  function bid(game,m,idx,amount){
    if(m.phase!=='auction'||m.turn!==idx||Date.now()>m.deadline)return false;
    if(!Number.isInteger(amount)||amount===0||!validForTurn(m,idx)||Math.abs(amount)>m.budgets[idx])return false;
    const isFFA=m.mode==='ffa';
    if(m.bidMode===null){
      if(amount!==1&&!(amount===-1&&!isFFA&&m.players.every((_,i)=>openSlots(m,i).length)))return false;
      m.bidMode=amount<0?'avoid':'buy';
    }else if(amount!==m.bid+(m.bidMode==='avoid'?-1:1))return false;
    m.bid=amount;m.lead=idx;m.passes.clear();
    const next=nextEligible(m,idx);
    if(next<0){finishAuction(game,m);return true;}
    m.turn=next;m.deadline=Date.now()+m.seconds*1000;
    publishGame(game);scheduleMatch(game,m);return true;
  }
  function pass(game,m,idx){
    if(m.phase!=='auction'||m.turn!==idx||m.lead<0||Date.now()>m.deadline)return false;
    m.passes.add(idx);
    const next=nextEligible(m,idx);
    if(next<0){finishAuction(game,m);return true;}
    m.turn=next;m.deadline=Date.now()+m.seconds*1000;publishGame(game);scheduleMatch(game,m);return true;
  }
  function finishAuction(game,m){
    if(m.phase!=='auction')return;
    clearTimeout(m.timer);
    let winner=m.lead,price=m.bid,avoider=-1;
    if(m.bidMode==='avoid'&&m.lead>=0){
      avoider=m.lead;winner=1-avoider;
      m.budgets[avoider]+=price; // saldo negativo desaparece no limbo, sem transferência
    }else if(m.bidMode==='buy'&&m.lead>=0){
      m.budgets[m.lead]-=price;
    }else{
      winner=m.turn;price=0;
    }
    if(!openSlots(m,winner).length){
      winner=m.players.map((_,i)=>i).find(i=>openSlots(m,i).length);
    }
    if(winner===undefined||winner<0){finishMatch(game,m);return;}
    m.phase='place';m.placer=winner;m.price=price;m.avoider=avoider;
    m.deadline=Date.now()+20000;publishGame(game);scheduleMatch(game,m);
  }
  function place(game,m,idx,slot){
    if(m.phase!=='place'||m.placer!==idx||!Number.isInteger(slot)||slot<0||slot>=5||m.teams[idx][slot]!==null)return false;
    clearTimeout(m.timer);
    const c=characters.get(m.current);if(!c)return false;
    m.teams[idx][slot]=c.id;
    m.history.push({round:m.round+1,character:plain(c),rarity:c.rarity,rating:c.rating,
      winner:idx,price:m.price,avoider:m.avoider,slot});
    m.phase='reveal';m.deadline=Date.now()+delay();
    m.result={winner:idx,price:m.price,avoider:m.avoider,slot,fighter:revealed(c)};
    publishGame(game);scheduleMatch(game,m);return true;
  }
  function winnerByScore(totals,scores){
    if(totals.length===2){
      if(totals[0]!==totals[1])return totals[0]>totals[1]?0:1;
      if(scores[0]!==scores[1])return scores[0]>scores[1]?0:1;
      return Math.random()<.5?0:1; // não há empates no mata-mata
    }
    return totals.indexOf(Math.max(...totals));
  }
  function finishMatch(game,m){
    if(m.phase==='complete')return;
    clearTimeout(m.timer);m.phase='complete';m.timer=null;
    const totals=m.teams.map(team=>team.reduce((sum,p,i)=>sum+(characters.get(p)?.stats[i]||0),0));
    const scores=m.teams.map(()=>0);
    const details=ATTR.map((a,i)=>{
      const fighters=m.teams.map(team=>{
        const c=characters.get(team[i]);return c?{...plain(c),value:c.stats[i]}:null;
      });
      let winner=-1,top=-1;const equal=[];
      fighters.forEach((p,k)=>{if(p&&p.value>top){winner=k;top=p.value;equal.length=0;equal.push(k)}else if(p&&p.value===top)equal.push(k)});
      if(equal.length===1)scores[winner]++;
      else winner=-1;
      return {attribute:a,fighters,winner};
    });
    const champion=winnerByScore(totals,scores);
    m.battle={winner:champion,winnerName:nickname(m.players[champion]),totals,scores,details,
      history:m.history,budgets:m.budgets,names:m.players.map(nickname)};
    if(game.mode==='tournament'){
      const target=game.bracket[game.stage].matches[m.ordinal];
      target.winner=m.battle.winnerName;target.status='finalizado';target.winnerToken=m.players[champion];
      notifyMany(m.players,{type:'special_result',mode:game.mode,code:game.code,battle:m.battle,
        stage:game.stage,bracket:bracketView(game),waiting:true});
      sendSpectators(game);
      if(game.matches.every(x=>x.phase==='complete')){
        game.alive=game.matches.map(x=>x.players[x.battle.winner]);
        if(game.alive.length===1){
          game.phase='complete';const champ=nickname(game.alive[0]);
          notifyMany(game.players,{type:'special_tournament_champion',code:game.code,
            mode:game.mode,champion:champ,bracket:bracketView(game),voted:0,needed:8});
        }else{
          game.stage++;
          startTournamentStage(game);
        }
      }
    }else{
      game.phase='complete';
      notifyMany(game.players,{type:'special_result',mode:game.mode,code:game.code,battle:m.battle,
        voted:0,needed:game.players.length,waiting:false});
    }
  }
  function viewMatch(game,m,tok){
    const me=m.players.indexOf(tok),c=characters.get(m.current);
    const masked=game.mode==='mystery'&&m.phase!=='reveal'&&m.phase!=='complete';
    const offered=c?(masked?{name:'PERSONAGEM MISTERIOSO',anime:c.anime,emoji:'🎭'}:plain(c)):null;
    return {type:'special_state',mode:game.mode,code:game.code,matchId:m.id,round:m.round,max:m.max,phase:m.phase,
      you:me,names:m.players.map(nickname),teams:m.teams.map(team=>team.map(id=>id?revealed(characters.get(id)):null)),
      budgets:m.budgets,current:offered,bid:m.bid,bidMode:m.bidMode||'neutral',lead:m.lead,turn:m.turn,
      minimum:m.bidMode==='avoid'?m.bid-1:m.bid+1,canAvoid:m.mode!=='ffa'&&m.players.every((_,i)=>openSlots(m,i).length>0),
      placer:m.placer,deadline:m.deadline,seconds:m.seconds,event:m.event,
      result:m.result,history:m.history,
      bracket:game.mode==='tournament'?bracketView(game):null};
  }
  function sendView(game,tok){
    if(game.mode==='direct'){notify(tok,directView(game,tok));return;}
    const m=matchFor(game,tok);
    if(m?.phase==='complete'&&game.mode==='tournament'&&game.phase!=='complete'){
      notify(tok,{type:'special_tournament_status',mode:game.mode,code:game.code,
        bracket:bracketView(game),status:game.alive.includes(tok)?'Aguardando os outros jogos.':'Você foi eliminado.'});
    }else if(m?.phase==='complete'){
      if(game.mode==='tournament')notify(tok,{type:'special_tournament_champion',mode:game.mode,code:game.code,
        champion:nickname(game.alive[0]),bracket:bracketView(game),voted:game.voted.size,needed:8});
      else notify(tok,{type:'special_result',mode:game.mode,code:game.code,battle:m.battle,
        voted:game.voted.size,needed:game.players.length});
    }else if(m)notify(tok,viewMatch(game,m,tok));
    else if(game.mode==='tournament'){
      notify(tok,game.phase==='complete'
        ?{type:'special_tournament_champion',mode:game.mode,code:game.code,champion:nickname(game.alive[0]),
          bracket:bracketView(game),voted:game.voted.size,needed:8}
        :{type:'special_tournament_status',mode:game.mode,code:game.code,
          bracket:bracketView(game),status:'Você foi eliminado, mas pode acompanhar o torneio.'});
    }
  }
  function publishGame(game){
    if(game.mode==='direct'){for(const tok of game.players)notify(tok,directView(game,tok));return;}
    for(const tok of game.players)sendView(game,tok);
  }
  function directView(game,tok){
    const d=game.direct;
    if(d.phase==='complete')return {type:'special_result',mode:'direct',code:game.code,
      battle:d.result,voted:game.voted.size,needed:2};
    return {type:'special_state',mode:'direct',code:game.code,phase:d.phase,
      names:game.players.map(nickname),you:game.players.indexOf(tok),teams:d.teams.map(team=>team.map(id=>plain(characters.get(id)))),
      picks:d.picks,turn:d.phase==='draft'?d.picks%2:-1,deadline:d.deadline,
      used:[...d.used],round:d.round,bouts:d.bouts.slice(0,d.round+1),scores:d.scores};
  }
  function scheduleDirect(game){
    const d=game.direct;
    clearTimeout(d.timer);
    if(d.phase==='draft'){
      d.deadline=Date.now()+22000;publishGame(game);
      d.timer=setTimeout(()=>{
        const options=roster.filter(c=>!d.used.has(c.id));
        if(options.length)pickDirect(game,d.picks%2,drawWeighted(options).id);
      },22030);
    }else if(d.phase==='duel'){
      d.deadline=Date.now()+2800;publishGame(game);
      d.timer=setTimeout(()=>{
        if(d.phase!=='duel')return;
        if(d.round<4){d.round++;scheduleDirect(game);}
        else finishDirect(game);
      },2850);
    }
    d.timer?.unref?.();
  }
  function pickDirect(game,side,id){
    const d=game.direct;
    if(d.phase!=='draft'||d.picks%2!==side||!characters.has(id)||d.used.has(id))return false;
    d.used.add(id);d.teams[side].push(id);d.picks++;
    if(d.picks===10){
      d.bouts=Array.from({length:5},(_,i)=>{
        const a=characters.get(d.teams[0][i]),b=characters.get(d.teams[1][i]);
        const powerA=(tier(a)+1)*12+Math.floor(Math.random()*40)+1;
        const powerB=(tier(b)+1)*12+Math.floor(Math.random()*40)+1;
        const winner=powerA===powerB?(Math.random()<.5?0:1):powerA>powerB?0:1;
        return {fighters:[plain(a),plain(b)],rarities:[a.rarity,b.rarity],powers:[powerA,powerB],winner};
      });
      d.scores=[0,0];d.round=0;d.phase='duel';scheduleDirect(game);
    }else scheduleDirect(game);
    return true;
  }
  function finishDirect(game){
    const d=game.direct;clearTimeout(d.timer);
    d.scores=[0,1].map(i=>d.bouts.filter(b=>b.winner===i).length);
    const winner=d.scores[0]>d.scores[1]?0:1;
    d.phase='complete';game.phase='complete';
    d.result={winner,names:game.players.map(nickname),scores:d.scores,
      bouts:d.bouts,rule:'raridade e variação de combate — sem atributos individuais'};
    notifyMany(game.players,{type:'special_result',mode:'direct',code:game.code,
      battle:d.result,voted:0,needed:2});
  }
  function handle(user,data){
    try{
      if(data.type==='special_create'){create(user,String(data.mode||''));return true;}
      if(data.type==='special_join'){join(user,String(data.code||'').trim().toUpperCase());return true;}
      if(data.type==='special_leave'){leave(user);return true;}
      if(!data.type?.startsWith('special_'))return false;
      const game=games.get(user.specialGameId);
      if(!game||!game.players.includes(user.token))throw Error('Você não está em uma partida desse modo.');
      if(data.type==='special_replay'){
        if(game.phase!=='complete')throw Error('A partida ainda não terminou.');
        game.voted.add(user.token);
        if(game.voted.size===game.players.length){startGame(game);}
        else notifyMany(game.players,{type:'special_vote',voted:game.voted.size,needed:game.players.length});
        return true;
      }
      if(game.phase!=='active')throw Error('Essa partida já terminou.');
      if(game.mode==='direct'){
        if(data.type!=='special_pick')throw Error('Ação inválida para o modo 5v5.');
        const d=game.direct,side=game.players.indexOf(user.token);
        if(Date.now()>d.deadline){throw Error('Sua vez acabou.');}
        if(!pickDirect(game,side,String(data.id||'')))throw Error('Escolha um personagem disponível na sua vez.');
        return true;
      }
      const m=matchFor(game,user.token);
      if(!m||m.phase==='complete')throw Error('Você não está disputando este confronto.');
      const idx=m.players.indexOf(user.token);
      if(data.type==='special_bid'){
        if(!bid(game,m,idx,Number(data.amount)))throw Error('Lance inválido ou sua vez terminou.');
      }else if(data.type==='special_pass'){
        if(!pass(game,m,idx))throw Error('Só é possível passar depois do primeiro lance, na sua vez.');
      }else if(data.type==='special_place'){
        if(!place(game,m,idx,Number(data.slot)))throw Error('Escolha uma posição livre quando for sua vez.');
      }else throw Error('Ação desconhecida.');
      return true;
    }catch(e){
      return {error:e.message||'Ocorreu um erro na sala.'};
    }
  }
  // Limpeza de lobbies vazios ocorre na saída; partidas podem ser encerradas pelos participantes.
  return {handle,resume,leave,onDisconnect,busy,lobbies,games,notify:notifyMany};
}
module.exports={createSpecialMultiplayer};
