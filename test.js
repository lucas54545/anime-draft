'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const chars=JSON.parse(read('characters.json'));
const local=read('public/characters-local.js');
const localRoster=JSON.parse(local.slice(local.indexOf('=')+1).trim().replace(/;$/,''));
assert.deepEqual(localRoster,chars,'Elenco do modo local deve ser idêntico ao do servidor');
assert.equal(chars.length,142,'O elenco deve preservar os 142 personagens');
assert.equal(new Set(chars.map(c=>c.anime)).size,38,'O jogo deve preservar os 38 animes');
const rarity=rating=>rating>=96?'Mítico':rating>=88?'Lendário':rating>=79?'Épico':rating>=64?'Raro':'Comum';
for(const character of chars){
  assert.equal(character.stats.length,5,'Cada personagem precisa ter cinco atributos');
  assert.ok(character.stats.every(n=>Number.isInteger(n)&&n>=8&&n<=99));
  assert.equal(character.rating,Math.round(character.stats.reduce((a,b)=>a+b,0)/5));
  assert.equal(character.rarity,rarity(character.rating));
}
const byId=Object.fromEntries(chars.map(c=>[c.id,c]));
assert.deepEqual(byId.anos.stats,[99,99,99,99,99]);
assert.deepEqual(byId.rimuru.stats,[99,99,99,99,99]);
assert.ok(byId.goku.stats.every(n=>n<=90),'Goku não deve ultrapassar 90');
assert.ok(byId.vegeta.stats.every(n=>n<=90),'Vegeta não deve ultrapassar 90');
for(const file of ['server.js','public/app.js','public/offline.js','public/special-modes.js','public/characters-local.js']){
  new vm.Script(read(file),{filename:file});
}
const server=read('server.js'),app=read('public/app.js'),offline=read('public/offline.js'),html=read('public/index.html');
assert.ok(server.includes('rematchVotes.add(side)'),'Revanche precisa do voto dos jogadores');
assert.ok(server.includes('room.history.push('),'Histórico deve ser atualizado após a escolha');
assert.ok(server.includes('room.budgets[avoider]+=price'),'Lances negativos devem queimar moedas');
assert.ok(server.includes('const publicFighter = c => ({id: c.id, name: c.name, anime: c.anime, emoji: c.emoji});'),'Não revelar atributos no leilão online');
assert.ok(app.includes('function historyMarkup(')&&app.includes('function requestRematch('));
assert.ok(offline.includes('function historyPanel(')&&offline.includes('function rarityTag('));
assert.ok(html.includes('id="soundToggle"')&&html.includes('id="battleRematch"'));
assert.ok(read('public/style.css').includes('arena-impact'),'A batalha deve ter efeitos de anime');

const htmlSquad=read('public/index.html'),css=read('public/style.css');
for(const control of ['squadCreateBtn','squadJoinBtn','squadCodeInput','squadSide','squadWaiting','squadTeamA','squadTeamB','squadCopyBtn','squadLeaveBtn','localSquadBtn']){
  assert.ok(htmlSquad.includes('id="'+control+'"'),'Controle 2v2 ausente: '+control);
}
for(const token of ['const squadLobbies = new Map()','function addSquadMember(','function syncSquadLobby(','function teamNames(','function removeSquadLobbyMember(',"'squad_create'","'squad_join'","'squad_leave'"]){
  assert.ok(server.includes(token),'Servidor não suporta recurso 2v2: '+token);
}
assert.ok(server.includes("room.mode==='squad'?playerIdx%2:playerIdx"),'Ação dos integrantes da dupla precisa usar seu time');
assert.ok(server.includes("room.mode==='squad'?4:2"),'Revanche 2v2 precisa de quatro votos');
assert.ok(app.includes('function renderSquadLobby(')&&app.includes('function joinSquad('),'Lobby 2v2 não preparado');
assert.ok(offline.includes("mode==='local2v2'"),'Modo 2v2 local indisponível');
assert.ok(css.includes('.squad-lobby-columns'),'Design da sala 2v2 indisponível');
console.log('✓ Modo 2v2 online/local, sala por código, duplas e revanche com quatro votos');

const extraModes=read('public/special-modes.js');
for(const id of ['localTournamentBtn','localMysteryBtn','localRouletteBtn','ffaBtn','direct5v5Btn','specialContent']){
  assert.ok(html.includes('id="'+id+'"'),'Botão ou tela V12 ausente: '+id);
}
assert.ok(html.includes('special-modes.js?v=12.0'),'Novo script precisa ser carregado');
assert.ok(app.includes("['lobby','offline','special','arena','battle']"),'Navegação V12 indisponível');
assert.ok(app.includes('window.imageMarkup=imageMarkup;'),'Os retratos locais devem usar as imagens reais');
for(const method of ['function tournamentBotDuel(','function tournamentAdvance(','function tournamentBracket(','function rouletteSpin(']){
  assert.ok(offline.includes(method),'Modo Torneio ou Roleta ausente: '+method);
}
assert.ok(offline.includes("st?.mode==='mystery'"),'Identidade precisa ficar oculta antes do leilão misterioso');
assert.ok(offline.includes("['bot','mystery','roulette','tournament']"),'Modos novos contra BOT precisam funcionar');
for(const method of ['function ffaNewAuction(','function ffaPlace(','function ffaFinish(','function duelFightStart(','function duelFinish(']){
  assert.ok(extraModes.includes(method),'Modo independente V12 ausente: '+method);
}
const duelScoreBody=extraModes.slice(extraModes.indexOf('function calculateDuel('),extraModes.indexOf('function duelFightStart('));
assert.ok(!duelScoreBody.includes('.stats['),'O confronto direto 5v5 não pode comparar atributos individuais');
assert.ok(duelScoreBody.includes('rarity'),'O confronto direto deve usar raridade e sorte');
assert.ok(read('public/style.css').includes('.direct-clash'),'O confronto direto precisa de interface visual');
console.log('✓ Cinco modos V12: Torneio, Mistério, Roleta, 4 jogadores FFA e duelo direto 5v5');

assert.ok(html.includes('id="arenaConnectionNotice"'),'Aviso de entrada local precisa existir');
assert.ok(app.includes("$('loginBtn').disabled=false;"),'Botão de entrar não deve ficar bloqueado sem WebSocket');
assert.ok(app.includes("!model.connected"),'Login local deve funcionar quando multiplayer cair');
assert.ok(app.includes("/\.github\.io$/i"),'GitHub Pages deve abrir o modo local sem erro de conexão');
assert.ok(app.includes("$('localBotBtn').click();"),'Treino contra bot precisa ter fallback offline');
assert.ok(html.includes('./app.js?v=12.1'),'Browser deve atualizar automaticamente o script corrigido');
console.log('✓ Arena V12.1: login sem WebSocket e jogo local liberado');



console.log('✓ Elenco: 142 personagens / 38 animes');
console.log('✓ Balanço, raridades secretas, histórico, revanche, limbo e interface');
console.log('✓ Sintaxe de todos os arquivos JavaScript');
