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
for(const file of ['server.js','special-server.js','public/portrait-loader.js','public/app.js','public/offline.js','public/special-modes.js','public/special-online.js','public/characters-local.js']){
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
assert.ok(html.includes('special-modes.js?v=1.0'),'Novo script precisa ser carregado');
assert.ok(app.includes("['lobby','offline','special','arena','battle']"),'Navegação V12 indisponível');
assert.ok(app.includes('window.imageMarkup=imageMarkup;'),'Os retratos locais devem usar as imagens reais');
for(const method of ['function tournamentBotDuel(','function tournamentAdvance(','function tournamentBracket(','function rouletteSpin(']){
  assert.ok(offline.includes(method),'Modo Torneio ou Roleta ausente: '+method);
}
assert.ok(offline.includes("st?.mode==='mystery'"),'Identidade precisa ficar oculta antes do leilão misterioso');
assert.ok(offline.includes("['bot','mystery','roulette','tournament']"),'Modos novos contra BOT precisam funcionar');
for(const method of ['function ffaNewAuction(','function ffaPlace(','function ffaFinish(']){
  assert.ok(extraModes.includes(method),'Modo Todos Contra Todos local ausente: '+method);
}
assert.ok(!extraModes.includes('function duelSetup('),'Seleção livre antiga do 5v5 não pode permanecer no código');
assert.ok(read('public/style.css').includes('.direct-clash'),'O confronto direto precisa de interface visual');
console.log('✓ Cinco modos: Torneio, Mistério, Roleta, Todos Contra Todos e 5v5 com leilão');

assert.ok(html.includes('id="arenaConnectionNotice"'),'Aviso de entrada local precisa existir');
assert.ok(app.includes("$('loginBtn').disabled=false;"),'Botão de entrar não deve ficar bloqueado sem WebSocket');
assert.ok(app.includes("!model.connected"),'Login local deve funcionar quando multiplayer cair');
assert.ok(app.includes(String.raw`/\.github\.io$/i`),'GitHub Pages deve abrir o modo local sem erro de conexão');
assert.ok(app.includes("$('localBotBtn').click();"),'Treino contra bot precisa ter fallback offline');
assert.ok(html.includes('./app.js?v=1.0'),'Browser deve atualizar automaticamente o script corrigido');
console.log('✓ Arena V12.1: login sem WebSocket e jogo local liberado');



console.log('✓ Elenco: 142 personagens / 38 animes');
console.log('✓ Balanço, raridades secretas, histórico, revanche, limbo e interface');
console.log('✓ Sintaxe de todos os arquivos JavaScript');


const specialBackend=read('special-server.js');
const specialFrontend=read('public/special-online.js');
for(const id of ['onlineMysteryBtn','onlineRouletteBtn','onlineTournamentBtn','onlineFfaBtn','onlineDirectBtn',
 'specialOnlineCodeInput','specialOnlineJoinBtn']){
  assert.ok(html.includes('id="'+id+'"'),'Controle de multiplayer V13 ausente: '+id);
}
assert.ok(html.includes('special-online.js?v=1.0'),'Script multiplayer deve carregar na versão pública V1');
assert.ok(server.includes("require('./special-server')"),'Servidor principal precisa carregar partidas online especiais');
assert.ok(server.includes("specialMultiplayer.handle(user,data)"),'Ações especiais precisam ser autenticadas pelo WebSocket');
assert.ok(server.includes("specialMultiplayer.resume(user)"),'Jogadores devem retornar à partida após reconexão');
assert.ok(server.includes("specialGameId")&&server.includes("specialLobbyCode"),'Presença deve identificar sessões especiais');
for(const word of ["mystery:2","roulette:2","ffa:4","direct:2","tournament:8",
 "function startTournamentStage(","function offerNext(","function expireAuction(","function finishMatch(","function genCode("]){
  assert.ok(specialBackend.includes(word),'Backend especial ausente: '+word);
}
assert.ok(specialBackend.includes("const masked=game.mode==='mystery'"),'Leilão misterioso não pode revelar nome antes da escolha');
assert.ok(specialBackend.includes("budgets:participants.map(()=>game.mode==='direct'?50:20)"),'5v5 online deve começar com 50 moedas');
assert.ok(specialBackend.includes("const direct=m.mode==='direct'"),'5v5 online deve usar a soma de todos os atributos');
assert.ok(specialBackend.includes("direct?avg(c):c.stats[i]"),'Comparação 5v5 deve mostrar poder total do personagem');
assert.ok(specialBackend.includes("totals[0]===totals[1]?-1"),'Empate total no 5v5 deve ser possível');
assert.ok(!specialBackend.includes("function pickDirect("),'5v5 online não deve permitir seleção livre');
assert.ok(specialFrontend.includes("function renderAuction(")&&specialFrontend.includes("function renderPlace(")&&
 specialFrontend.includes("function renderTournamentStatus("),'Multiplayer precisa de telas para leilões, escolhas e torneio');
assert.ok(specialFrontend.includes("data.bidMode==='avoid'?'✅ PEGAR GRÁTIS'"),'Pegar grátis segue lance negativo');
assert.ok(specialFrontend.includes("anyBid?btn("),'Não revelar pegar grátis antes do primeiro lance');
assert.ok(offline.includes("function directAuctionBattle("),'5v5 local deve usar total dos cinco personagens');
assert.ok(offline.includes("budgets:direct?[50,50]:[20,20]"),'5v5 local deve iniciar com 50 moedas');
assert.ok(offline.includes("$('direct5v5Btn').addEventListener('click',()=>start('direct5v5'))"),'Botão do 5v5 precisa abrir leilão local');
assert.ok(!extraModes.includes("$('direct5v5Btn').addEventListener('click',()=>open('duel'))"),'Botão 5v5 não deve abrir seleção livre');
console.log('✓ V13.1: cinco modos multiplayer, leilão 5v5 de 50 moedas e soma total');
require('./special-server.test.js');


const portraitConfig=JSON.parse(read('portrait-config.json'));
const portraitAliases=JSON.parse(read('public/portrait-aliases.json'));
const portraitMap=JSON.parse(read('public/portrait-map.json'));
const portraitLoader=read('public/portrait-loader.js');
const portraitScript=read('scripts/build-portrait-manifest.cjs');
new vm.Script(portraitScript.replace(/^#![^\\n]*\\n/,''),{filename:'scripts/build-portrait-manifest.cjs'});
assert.equal(portraitConfig.version,'1.0');
assert.equal(portraitAliases.version,'1.0');
assert.equal(portraitMap.version,'1.0');
assert.equal(Object.keys(portraitConfig.aliases).length,142,'Os 142 personagens devem ter aliases cadastrados');
assert.ok(chars.every(p=>portraitConfig.aliases[p.id]&&portraitConfig.animeIds[p.anime]),
  'Todo personagem deve ter aliases e ID do anime na fonte de fotos');
assert.equal(Object.keys(portraitAliases.aliases).length,142);
assert.equal(portraitMap.totalCharacters,142);
assert.ok(html.includes('portrait-loader.js?v=1.0'),'A V1 deve carregar o catálogo de fotos');
assert.ok(html.includes('V 1.0 • LANÇAMENTO'),'A versão pública deve ser V1');
assert.ok(html.includes('Anime Draft Battle V1'),'Título de SEO da V1 ausente');
assert.ok(app.includes('window.animeImageFailed=function(img)'),'Fotos quebradas precisam de recuperação');
assert.ok(app.includes("const proxy=imageProxy(person.id)"),'As imagens precisam de alternativa via servidor');
assert.ok(app.includes("window.ANIME_PORTRAITS?.[id]"),'A busca deve consultar o catálogo de retratos');
assert.ok(app.includes("window.ANIME_PORTRAIT_ALIASES?.[person.id]"),'Nomes japoneses precisam ser pesquisados');
assert.ok(server.includes("const PORTRAIT_INDEX=require('./public/portrait-map.json').images||{};"),
  'O proxy do servidor deve usar fotos catalogadas');
assert.ok(portraitLoader.includes('anime-portraits-updated'),'O carregador deve atualizar imagens já mostradas');
console.log('✓ V1: lançamento, 142 aliases, catálogo de fotos e recuperação de imagens quebradas');
