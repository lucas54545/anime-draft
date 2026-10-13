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
for(const file of ['server.js','public/app.js','public/offline.js','public/characters-local.js']){
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
console.log('✓ Elenco: 142 personagens / 38 animes');
console.log('✓ Balanço, raridades secretas, histórico, revanche, limbo e interface');
console.log('✓ Sintaxe de todos os arquivos JavaScript');
