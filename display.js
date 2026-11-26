(function(){
'use strict';
if(window.__AZA_PUBLIC_DISPLAY__)return;
const src=document.currentScript?.src;
if(!src)return;
window.__AZA_PUBLIC_DISPLAY__=true;
const host=document.createElement('div');host.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483646;pointer-events:none;max-width:70vw';
const root=host.attachShadow({mode:'open'});const panel=document.createElement('div');panel.style.cssText='background:#04100b;border:1px solid currentColor;border-radius:8px;padding:8px 12px;font:12px monospace;white-space:pre-wrap;overflow-wrap:anywhere';root.append(panel);document.body.append(host);
async function refresh(){try{const url=new URL('config.json',src);url.searchParams.set('t',Date.now());const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(r.status);const c=await r.json();host.hidden=c.enabled===false;panel.style.color=/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#00ff9c';panel.textContent=[c.title,c.version,c.notice].filter(x=>typeof x==='string').map(x=>x.slice(0,200)).join('\n');}catch(e){console.warn('[Display]',e);}}
refresh();setInterval(refresh,60000);
})();
