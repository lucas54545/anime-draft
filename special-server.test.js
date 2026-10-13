'use strict';
// Testes completos do multiplayer V13 sem navegador nem servidor de rede.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'special-server.js'),'utf8');
const roster=JSON.parse(fs.readFileSync(path.join(__dirname,'characters.json'),'utf8'));

let now=100000,sequence=0;
const timers=[];
const fakeClock={now:()=>now};
function fakeSetTimeout(fn,delay){
  const t={fn,at:now+delay,cancelled:false,called:false,unref(){}};
  timers.push(t);return t;
}
function fakeClearTimeout(ref){if(ref)ref.cancelled=true;}
const fakeCrypto={randomBytes(n){
  const i=++sequence,arr=Array.from({length:n},(_,k)=>(i*47+k*11)%256);
  arr.toString=fmt=>fmt==='hex'?i.toString(16).padStart(20,'0'):Array.prototype.join.call(arr,',');
  return arr;
}};
const sandbox={
  module:{exports:{}},require:()=>fakeCrypto,
  process:{env:{SPECIAL_ROUND_DELAY_MS:'5'}},
  Date:fakeClock,setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout
};
vm.runInNewContext(source,sandbox,{filename:'special-server.js'});
const create=sandbox.module.exports.createSpecialMultiplayer;
assert.equal(typeof create,'function');

function createPlayers(mode,count){
  const users=new Map(),messages=[];
  const players=Array.from({length:count},(_,i)=>{
    const p={token:'token-'+mode+'-'+i,name:'Jogador '+(i+1),conn:{}};
    users.set(p.token,p);return p;
  });
  const api=create({users,roster,issue:(person,message)=>messages.push({to:person.token,...message}),presence(){}});
  const action=(index,type,extra={})=>{
    const result=api.handle(players[index],{type,...extra});
    assert.equal(result?.error,undefined,'Erro em '+mode+'/'+index+'/'+type+': '+result?.error);
    return result;
  };
  action(0,'special_create',{mode});
  const code=[...api.lobbies.keys()][0];
  assert.match(code,/^[A-Z2-9]{6}$/);
  for(let i=1;i<count;i++)action(i,'special_join',{code});
  const game=[...api.games.values()][0];
  assert.ok(game&&players.every(p=>p.specialGameId===game.id));
  return {mode,players,api,action,messages,game};
}
function tick(ref){
  assert.ok(ref&&!ref.called&&!ref.cancelled,'Timer da rodada deveria estar ativo');
  now=Math.max(now,ref.at);ref.called=true;ref.fn();
}
function playMatch(ctx,match,starting=0){
  for(let round=starting;round<match.max;round++){
    if(match.phase==='auction'){
      const who=ctx.players.findIndex(p=>p.token===match.players[match.turn]);
      assert.ok(who>=0);
      ctx.action(who,'special_bid',{amount:1});
      let count=0;
      while(match.phase==='auction'&&match.lead>=0&&count++<match.players.length+2){
        const person=ctx.players.findIndex(p=>p.token===match.players[match.turn]);
        ctx.action(person,'special_pass');
      }
      assert.ok(count<match.players.length+3,'Leilão não encerrou após desistências');
    }
    assert.equal(match.phase,'place','Sem escolha de posição na rodada '+round);
    const recipient=ctx.players.findIndex(p=>p.token===match.players[match.placer]);
    ctx.action(recipient,'special_place',{slot:match.teams[match.placer].indexOf(null)});
    assert.equal(match.phase,'reveal');
    assert.equal(match.history.length,round+1);
    assert.ok(match.result.fighter.rarity,'Raridade revelada após posicionar');
    tick(match.timer);
  }
  assert.equal(match.phase,'complete','Partida não terminou');
}
{
  const ctx=createPlayers('mystery',2),match=ctx.game.matches[0];
  const first=ctx.messages.find(x=>x.type==='special_state');
  assert.equal(first.current.name,'PERSONAGEM MISTERIOSO');
  assert.equal(first.current.id,undefined,'Identidade não pode ser divulgada no leilão');
  assert.equal(first.current.stats,undefined);
  // Um lance negativo deve mandar o personagem para o outro jogador.
  const starting=match.turn,who=ctx.players.findIndex(p=>p.token===match.players[starting]);
  ctx.action(who,'special_bid',{amount:-1});
  const rival=ctx.players.findIndex(p=>p.token===match.players[match.turn]);
  ctx.action(rival,'special_pass');
  assert.equal(match.placer,1-starting);
  assert.equal(match.budgets[starting],19,'Uma moeda deve ir para o limbo');
  const receiver=ctx.players.findIndex(p=>p.token===match.players[match.placer]);
  ctx.action(receiver,'special_place',{slot:0});
  tick(match.timer);
  playMatch(ctx,match,1);
  assert.ok(ctx.messages.some(x=>x.type==='special_result'));
  ctx.action(0,'special_replay');ctx.action(1,'special_replay');
  assert.notEqual(ctx.game.matches[0],match,'Revanche precisa reiniciar partida');
}
{
  const ctx=createPlayers('roulette',2),match=ctx.game.matches[0];
  assert.ok(match.event,'Roleta não sorteada');
  assert.ok([7,10,15].includes(match.seconds));
  playMatch(ctx,match);
}
{
  const ctx=createPlayers('ffa',4),match=ctx.game.matches[0];
  assert.equal(match.max,20);
  playMatch(ctx,match);
  assert.equal(match.teams.length,4);
  assert.ok(match.teams.every(t=>t.length===5&&t.every(Boolean)),'Cada jogador precisa ter cinco personagens');
  assert.ok(ctx.messages.some(x=>x.type==='special_result'&&x.battle.totals.length===4));
}
{
  const ctx=createPlayers('direct',2),game=ctx.game,match=game.matches[0];
  assert.equal(game.direct,null,'5v5 deve usar leilão e não seleção livre');
  assert.equal(match.max,10,'5v5 deve ter dez leilões');
  assert.deepEqual(Array.from(match.budgets),[50,50],'Cada jogador começa com cinquenta moedas');
  const firstState=ctx.messages.find(x=>x.type==='special_state');
  assert.equal(firstState.budgets[0],50);
  assert.equal(firstState.budgets[1],50);
  assert.ok(firstState.current,'Personagem deve aparecer no leilão');
  assert.equal(firstState.current.stats,undefined,'Poder deve ficar oculto até escolher posição');
  const invalid=ctx.api.handle(ctx.players[0],{type:'special_pick',id:roster[0].id});
  assert.ok(invalid?.error,'Escolha livre deve ser bloqueada no 5v5 com leilão');
  playMatch(ctx,match);
  const battle=match.battle;
  assert.ok(battle,'Resultado 5v5 ausente');
  assert.equal(battle.details.length,5,'Cada equipe deve comparar cinco personagens');
  assert.equal(battle.history.length,10,'Histórico deve registrar dez leilões');
  assert.ok(battle.rule.includes('Soma'),'A pontuação deve usar a soma total');
  for(let side=0;side<2;side++){
    const expected=match.teams[side].reduce((total,id)=>total+
      roster.find(c=>c.id===id).stats.reduce((sum,value)=>sum+value,0),0);
    assert.equal(battle.totals[side],expected,'Poder total precisa somar os cinco atributos dos cinco personagens');
  }
  const expectedWinner=battle.totals[0]===battle.totals[1]?-1:battle.totals[0]>battle.totals[1]?0:1;
  assert.equal(battle.winner,expectedWinner,'Vence apenas o time com maior poder total');
  ctx.action(0,'special_replay');ctx.action(1,'special_replay');
  assert.deepEqual(Array.from(game.matches[0].budgets),[50,50],'A revanche 5v5 reinicia com 50 moedas');
}
{
  const ctx=createPlayers('tournament',8),game=ctx.game;
  for(let stage=0;stage<3;stage++){
    const matches=[...game.matches];
    assert.equal(matches.length,[4,2,1][stage],'Quantidade de confrontos do torneio');
    for(const m of matches)playMatch(ctx,m);
    if(stage<2)assert.equal(game.stage,stage+1);
  }
  assert.equal(game.phase,'complete');
  assert.equal(game.alive.length,1);
  assert.equal(ctx.messages.filter(x=>x.type==='special_tournament_champion').length,8);
  for(let i=0;i<8;i++)ctx.action(i,'special_replay');
  assert.equal(game.stage,0);
  assert.equal(game.matches.length,4);
}
console.log('✓ Cinco modos multiplayer V13 simulados: 10, 10, 20, 10 leilões (5v5 com 50 moedas e soma geral) e torneio 8 jogadores');
