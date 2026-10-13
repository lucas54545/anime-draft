'use strict';
/* Anime Draft Battle V1 — catálogo único de retratos para online e offline. */
(() => {
  const CACHE_KEY='anime_draft_portrait_map_v1';
  const CACHE_AGE=7*24*60*60*1000;
  function trusted(uri){
    if(typeof uri!=='string'||!uri.startsWith('https://'))return false;
    try{
      const host=new URL(uri).hostname.toLowerCase();
      return host==='cdn.myanimelist.net'||host.endsWith('.myanimelist.net')||
        host==='s4.anilist.co'||host.endsWith('.anilist.co');
    }catch{return false;}
  }
  function sanitize(images){
    const filtered={};
    if(!images||typeof images!=='object'||Array.isArray(images))return filtered;
    for(const [id,url] of Object.entries(images)){
      if(/^[a-z0-9_-]{1,48}$/i.test(id)&&trusted(url))filtered[id]=url;
    }
    return filtered;
  }
  window.ANIME_PORTRAITS={};
  try{
    const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(cached?.images)window.ANIME_PORTRAITS=sanitize(cached.images);
  }catch{}
  window.animePortraitFor=person=>{
    if(!person?.id)return '';
    return window.ANIME_PORTRAITS?.[person.id]||'';
  };
  async function refresh(){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),9000);
      let response;
      try{response=await fetch('./portrait-map.json?v=1.0',{cache:'no-cache',signal:controller.signal});}
      finally{clearTimeout(timer);}
      if(!response.ok)return;
      const body=await response.json();
      if(body?.version!=='1.0'||!body.images)return;
      const next=sanitize(body.images);
      const old=window.ANIME_PORTRAITS||{};
      window.ANIME_PORTRAITS={...old,...next};
      try{localStorage.setItem(CACHE_KEY,JSON.stringify({images:window.ANIME_PORTRAITS,time:Date.now()}));}catch{}
      window.dispatchEvent(new CustomEvent('anime-portraits-updated',{
        detail:{found:Object.keys(window.ANIME_PORTRAITS).length,total:body.totalCharacters||142}
      }));
    }catch(e){console.debug('Catálogo de fotos temporariamente indisponível:',e?.message||'');}
  }
  refresh();
})();
