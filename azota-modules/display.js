/* QUOZZ Public Display V3. Backwards compatible with existing v3.js loader. */
(function(){
'use strict';
if(window.__AZA_PUBLIC_DISPLAY__)return;
const src=document.currentScript?.src;
if(!src||!document.body)return;
window.__AZA_PUBLIC_DISPLAY__=true;
const URL='https://drssuyohwfgwjotunudv.supabase.co';
const KEY='sb_publishable_8PzmBR-8ph_pNjwN-QrdzA_1kwMs8jd';
const defaults={enabled:true,title:'VIP TOOL',version:'V4.9',notice:'SYSTEM ONLINE',logoText:'Q',color:'#00ff9c',position:'bl',width:240,fontSize:14,opacity:.95,marqueeSpeed:10,neon:true,rgb:false,matrix:false,glitch:false,marquee:true};
const host=document.createElement('div');host.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;max-width:90vw';
const root=host.attachShadow({mode:'open'});
root.innerHTML=`<style>
*{box-sizing:border-box}.panel{position:relative;background:rgba(3,13,13,.94);border:1px solid currentColor;color:#00ff9c;min-width:120px;max-width:90vw;overflow:hidden;border-radius:12px;padding:11px 13px;font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
.neon{box-shadow:0 0 20px currentColor;text-shadow:0 0 6px currentColor}.rgb{animation:rgb 6s linear infinite}.glitch .brand-name{animation:glitch 2s infinite}
@keyframes rgb{0%,100%{color:#00ff9c}33%{color:#00cfff}66%{color:#ff39de}}@keyframes glitch{0%,94%,100%{transform:none}95%{transform:translate(2px,-1px)}97%{transform:translate(-2px,1px)}}
@keyframes marquee{to{transform:translateX(-100%)}}
canvas{position:absolute;inset:0;width:100%;height:100%;opacity:.19;pointer-events:none}.content{position:relative;z-index:1}.header{display:flex;gap:10px;align-items:center}.logo{display:grid;place-items:center;border:1px solid currentColor;border-radius:7px;font-weight:900;font-size:1.45em;min-width:33px;min-height:33px;padding:3px}.logo-img{max-width:42px;max-height:42px;display:none}.brand-name{font-weight:900;line-height:1.25}.version{opacity:.85;font-size:.76em;margin-top:4px}.message{border-top:1px solid currentColor;margin-top:10px;padding-top:7px;overflow:hidden;white-space:nowrap;font-size:.82em}.message span{display:inline-block}.marquee .message span{padding-left:100%;animation:marquee var(--marquee-speed,10s) linear infinite}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style><div class="panel"><canvas></canvas><div class="content"><div class="header"><span class="logo">Q</span><img class="logo-img" alt="Logo"><div><div class="brand-name"></div><div class="version"></div></div></div><div class="message"><span></span></div></div></div>`;
document.body.append(host);
const $=q=>root.querySelector(q), panel=$('.panel'),canvas=$('canvas'),ctx=canvas.getContext('2d');
let matrixId=0,configSignature='',isBusy=false;
const posMap={'bottom-left':'bl','bottom-right':'br','top-left':'tl','top-right':'tr'};
function apply(raw){const c={...defaults,...raw};const signature=JSON.stringify(c);if(signature===configSignature)return;configSignature=signature;
 host.hidden=c.enabled===false;const pos=posMap[c.position]||c.position||'bl';host.style.top=host.style.bottom=host.style.left=host.style.right='auto';host.style[pos[0]==='t'?'top':'bottom']='12px';host.style[pos[1]==='r'?'right':'left']='12px';host.style.opacity=Math.min(1,Math.max(.1,Number(c.opacity)||.95));
 panel.style.width=Math.min(400,Math.max(150,Number(c.width)||240))+'px';panel.style.fontSize=Math.min(24,Math.max(11,Number(c.fontSize)||14))+'px';panel.style.color=/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#00ff9c';panel.classList.toggle('neon',c.neon!==false);panel.classList.toggle('rgb',!!c.rgb);panel.classList.toggle('glitch',!!c.glitch);panel.classList.toggle('marquee',!!c.marquee);panel.style.setProperty('--marquee-speed',Math.min(30,Math.max(4,Number(c.marqueeSpeed)||10))+'s');
 $('.brand-name').textContent=String(c.title||'VIP TOOL').slice(0,80);$('.version').textContent=String(c.version||'').slice(0,40);$('.message span').textContent=String(c.notice||'').slice(0,200);$('.logo').textContent=String(c.logoText||'Q').slice(0,3);
 const img=$('.logo-img');if(typeof c.logo==='string'&&/^https:\/\//i.test(c.logo)){img.src=c.logo;img.style.display='block';$('.logo').style.display='none'}else{img.removeAttribute('src');img.style.display='none';$('.logo').style.display='grid'}
 clearInterval(matrixId);matrixId=0;canvas.style.display=c.matrix?'block':'none';if(c.matrix&&ctx&&!host.hidden){canvas.width=panel.clientWidth;canvas.height=panel.clientHeight;const drops=Array.from({length:Math.ceil(canvas.width/12)},()=>Math.random()*-20);matrixId=setInterval(()=>{if(document.hidden)return;ctx.fillStyle='rgba(3,13,13,.17)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=panel.style.color;ctx.font='12px monospace';drops.forEach((y,i)=>{ctx.fillText(Math.random()>.5?'1':'0',i*12,y*12);drops[i]=y*12>canvas.height&&Math.random()>.95?0:y+1})},105)}
}
async function refresh(){if(isBusy)return;isBusy=true;try{const r=await fetch(URL+'/rest/v1/display_config?select=config&id=eq.1',{headers:{apikey:KEY,Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error('Supabase '+r.status);const rows=await r.json();if(!Array.isArray(rows)||!rows[0]?.config)throw Error('Config unavailable');apply(rows[0].config)}catch(e){console.warn('[QUOZZ DISPLAY] Falling back to static config:',e);try{const u=new URL('config.json',src);u.searchParams.set('t',Date.now());const r=await fetch(u,{cache:'no-store'});if(r.ok)apply(await r.json())}catch(err){console.warn('[QUOZZ DISPLAY] No config available:',err)}}finally{isBusy=false}}
refresh();setInterval(refresh,60000);
})();
