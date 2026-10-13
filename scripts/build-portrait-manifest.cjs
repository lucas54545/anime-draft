#!/usr/bin/env node
'use strict';
// V1: armazena SOMENTE enderecos de imagens da comunidade anime, nao os arquivos de terceiros.
const fs=require('node:fs'),path=require('node:path');
const roster=require('../characters.json'),config=require('../portrait-config.json');
const target=path.resolve(__dirname,'../public/portrait-map.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let cache={};try{cache=JSON.parse(fs.readFileSync(target,'utf8')).images||{}}catch{}
const images={};let lastCall=0,requestCount=0;
function normalize(s){return String(s||'').normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
function variants(s){const raw=String(s||'').trim(),split=raw.split(',').map(x=>x.trim());return [raw,split.length===2?split[1]+' '+split[0]:''].map(normalize).filter(Boolean)}
function keys(p){return new Set([p.name,...(config.aliases[p.id]||[])].flatMap(variants))}
function sourceURL(u){if(typeof u!=='string')return null;try{const h=new URL(u);if(h.protocol!=='https:')return null;if(h.hostname==='cdn.myanimelist.net'||h.hostname.endsWith('.myanimelist.net')||h.hostname==='s4.anilist.co'||h.hostname.endsWith('.anilist.co'))return u}catch{}return null}
function photo(c){return sourceURL(c?.images?.jpg?.image_url||c?.images?.webp?.image_url||c?.image?.large||c?.image?.medium||'')}
function choose(person,candidates){const expected=keys(person);for(const record of candidates||[]){const c=record.character||record;if(!c)continue;const candidate=c.name?.full||c.name;if(variants(candidate).some(k=>expected.has(k))){const url=photo(c);if(url)return url;}}return null}
async function get(url,opt={}){for(let n=0;n<3;n++){try{const pause=Math.max(0,lastCall+550-Date.now());if(pause)await sleep(pause);lastCall=Date.now();requestCount++;const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),15000);let response;try{response=await fetch(url,{...opt,signal:abort.signal,headers:{Accept:'application/json',...(opt.headers||{})}})}finally{clearTimeout(timer)}if(response.ok)return await response.json();if([429,500,502,503,504].includes(response.status)){await sleep((n+1)*2500);continue;}break;}catch(e){if(n===2)console.warn('Imagem indisponivel:',e.message);else await sleep((n+1)*1900);}}return null}
async function build(){
 for(const p of roster)if(sourceURL(cache[p.id]))images[p.id]=cache[p.id];
 const groups=new Map();for(const p of roster){if(!groups.has(p.anime))groups.set(p.anime,[]);groups.get(p.anime).push(p)}
 for(const [anime,people] of groups){const malId=config.animeIds[anime];if(!malId)continue;
  const response=await get('https://api.jikan.moe/v4/anime/'+malId+'/characters');let found=0;
  for(const p of people){if(images[p.id])continue;const u=choose(p,response?.data||[]);if(u){images[p.id]=u;found++;}}
  console.log(anime,'+',found,'fotos de elenco');
 }
 for(const p of roster.filter(p=>!images[p.id])){
  const queries=[p.name,...(config.aliases[p.id]||[])];
  for(const q of [...new Set(queries)].slice(0,3)){
   const json=await get('https://api.jikan.moe/v4/characters?q='+encodeURIComponent(q)+'&limit=20');
   const u=choose(p,json?.data||[]);if(u){images[p.id]=u;break;}
  }
 }
 const query='query($search:String){Character(search:$search){name{full}image{large medium}}}';
 for(const p of roster.filter(p=>!images[p.id])){
  for(const q of [p.name,...(config.aliases[p.id]||[])].slice(0,2)){
   const json=await get('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{search:q}})});
   const candidate=json?.data?.Character;const u=choose(p,candidate?[candidate]:[]);
   if(u){images[p.id]=u;break;}
  }
 }
 const sorted=Object.fromEntries(roster.filter(p=>images[p.id]).map(p=>[p.id,images[p.id]]));
 const output={version:'1.0',updatedAt:new Date().toISOString(),totalCharacters:roster.length,photosFound:Object.keys(sorted).length,images:sorted};
 fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n');
 console.log('V1: fotos encontradas',output.photosFound,'/',roster.length,'consultas:',requestCount);
 console.log('Fotos ainda nao disponiveis:',roster.filter(p=>!sorted[p.id]).map(p=>p.name).join(', ')||'nenhuma');
}
build().catch(e=>{console.error(e);process.exitCode=1});
