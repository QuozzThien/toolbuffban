import {SUPABASE_URL as URL, SUPABASE_KEY as KEY} from './supabase-config.js';
const $=id=>document.getElementById(id);
const state={token:'',refresh:'',expires:0,user:null,profiles:[],sessions:[],design:null,system:null,page:'overview',poll:null};
const DEFAULT={enabled:true,title:'QUOZZ VIP SYSTEM',version:'V5.0',notice:'WELCOME TO PREMIUM TOOL',logoText:'Q',color:'#00ff9c',position:'bl',width:240,fontSize:14,opacity:.95,marqueeSpeed:10,neon:true,rgb:false,matrix:false,glitch:false,marquee:true};
const pmap={'bottom-left':'bl','bottom-right':'br','top-left':'tl','top-right':'tr'};
const toIso=d=>d?new Date(d).toLocaleString('vi-VN'):'—';
const online=s=>!s.revoked&&Date.now()-new Date(s.last_seen).getTime()<120000;
function flash(message,error=false){const t=$('toast');t.textContent=message;t.className=error?'error':'';t.style.display='block';clearTimeout(flash.timeout);flash.timeout=setTimeout(()=>t.style.display='none',4000)}
async function response(path,{method='GET',body,auth=true,headers={}}={}){
  if(auth){if(!state.token)throw Error('Cần đăng nhập Admin');if(Date.now()>state.expires-60000)await refreshAuth()}
  const h={'apikey':KEY,'Accept':'application/json',...headers};
  if(auth)h.Authorization='Bearer '+state.token;
  if(body!==undefined)h['Content-Type']='application/json';
  const r=await fetch(URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const raw=await r.text();let value;try{value=raw?JSON.parse(raw):null}catch{value=raw}
  if(!r.ok)throw Error(value?.message||value?.msg||value?.error_description||value?.error||'HTTP '+r.status);
  return value;
}
async function refreshAuth(){if(!state.refresh)throw Error('Phiên hết hạn, vui lòng đăng nhập lại');const r=await response('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:state.refresh},auth:false});setTokens(r)}
function setTokens(o){state.token=o.access_token;state.refresh=o.refresh_token;state.expires=Date.now()+(o.expires_in||3600)*1000}
async function login(email,password){const r=await response('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});setTokens(r);
  const allowed=await response('/rest/v1/rpc/is_admin',{method:'POST',body:{}});if(allowed!==true){clearAuth();throw Error('Tài khoản không có quyền Admin')}
  state.user=await response('/auth/v1/user');$('login-panel').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('admin-status').textContent='ADMIN: '+(state.user.email||'AUTHORIZED');await loadAll();setPage('overview');clearInterval(state.poll);state.poll=setInterval(()=>{if(state.page==='sessions'||state.page==='users'||state.page==='overview')loadPeople().catch(e=>flash(e.message,true))},20000)
}
function clearAuth(){state.token='';state.refresh='';state.expires=0;state.user=null;state.profiles=[];state.sessions=[];clearInterval(state.poll);$('login-panel').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;$('admin-status').textContent='CHƯA ĐĂNG NHẬP'}
async function loadPeople(){const [p,s]=await Promise.all([response('/rest/v1/profiles?select=id,username,banned,created_at&order=created_at.desc'),response('/rest/v1/sessions?select=id,user_id,device,revoked,started_at,last_seen&order=last_seen.desc&limit=300')]);state.profiles=p||[];state.sessions=s||[];renderPeople()}
async function loadConfig(){const [d,s]=await Promise.all([response('/rest/v1/display_config?select=*&id=eq.1'),response('/rest/v1/system_config?select=*&id=eq.1')]);state.design=d?.[0]?.config||DEFAULT;state.system=s?.[0]||{maintenance:false,notice:''};fillDesign(state.design);$('system-form').elements.maintenance.checked=!!state.system.maintenance;$('system-form').elements.notice.value=state.system.notice||'';$('overview-display').textContent=state.design.enabled===false?'OFF':'ON';$('overview-maintenance').textContent=state.system.maintenance?'ON':'OFF'}
async function loadAll(){await Promise.all([loadPeople(),loadConfig()]);flash('Kết nối Supabase thành công')}
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);if(cls)x.className=cls;return x}
function action(text,klass,fn){const b=el('button',text,'button '+klass);b.type='button';b.onclick=fn;return b}
function cell(tr,content){const td=el('td');if(content instanceof Node)td.append(content);else td.textContent=String(content??'');tr.append(td);return td}
function renderPeople(){const profiles=state.profiles,sessions=state.sessions;$('stat-users').textContent=profiles.length;$('stat-online').textContent=new Set(sessions.filter(online).map(s=>s.user_id)).size;$('stat-sessions').textContent=sessions.length;$('stat-banned').textContent=profiles.filter(p=>p.banned).length;
 const ul=$('user-list');ul.replaceChildren();$('users-empty').hidden=profiles.length>0;
 for(const p of profiles){const tr=el('tr');cell(tr,p.username||p.id.slice(0,8)+'…');cell(tr,p.banned?'ĐÃ KHÓA':'Hoạt động');cell(tr,toIso(p.created_at));const row=el('div');row.append(action(p.banned?'Mở khóa':'Ban',p.banned?'subtle':'danger',()=>changeBan(p)));cell(tr,row);ul.append(tr)}
 const sl=$('session-list');sl.replaceChildren();$('sessions-empty').hidden=sessions.length>0;
 for(const s of sessions){const tr=el('tr');cell(tr,(s.device||'Thiết bị không xác định').slice(0,95));cell(tr,s.user_id.slice(0,8)+'…');cell(tr,toIso(s.last_seen));cell(tr,s.revoked?'ĐÃ KICK':online(s)?'ONLINE':'Offline');const row=el('div');if(!s.revoked)row.append(action('Kick','danger',()=>kick(s)));cell(tr,row);sl.append(tr)}
 const feed=$('recent-sessions');feed.replaceChildren();if(!sessions.length)feed.textContent='Chưa có dữ liệu phiên.';for(const s of sessions.slice(0,4)){const line=el('div',`${(s.device||'Thiết bị').slice(0,38)} · ${toIso(s.last_seen)} ${online(s)?'• ONLINE':''}`,'feed-line');feed.append(line)}
}
async function changeBan(p){if(!confirm((p.banned?'Mở khóa':'Khóa')+' tài khoản '+(p.username||p.id)+'?'))return;try{await response('/rest/v1/profiles?id=eq.'+encodeURIComponent(p.id),{method:'PATCH',body:{banned:!p.banned}});if(!p.banned)await response('/rest/v1/sessions?user_id=eq.'+encodeURIComponent(p.id)+'&revoked=eq.false',{method:'PATCH',body:{revoked:true}});await loadPeople();flash(p.banned?'Đã mở khóa tài khoản':'Đã khóa tài khoản và thu hồi các phiên')}catch(e){flash(e.message,true)}}
async function kick(s){if(!confirm('Thu hồi phiên '+s.id.slice(0,8)+'…?'))return;try{await response('/rest/v1/sessions?id=eq.'+encodeURIComponent(s.id),{method:'PATCH',body:{revoked:true}});await loadPeople();flash('Đã đánh dấu thu hồi phiên')}catch(e){flash(e.message,true)}}
function normalizeDesign(c){return {...DEFAULT,...c,position:pmap[c.position]||c.position||'bl',opacity:Math.min(1,Math.max(.1,Number(c.opacity??DEFAULT.opacity)))}}
function fillDesign(raw){const c=normalizeDesign(raw),f=$('design-form').elements;for(const key of ['title','version','notice','logoText','color','position','width','fontSize','marqueeSpeed'])f[key].value=c[key];f.opacity.value=Math.round(c.opacity*100);for(const key of ['enabled','neon','rgb','matrix','glitch','marquee'])f[key].checked=!!c[key];renderPreview()}
function readDesign(){const f=$('design-form').elements;const c={};for(const k of ['title','version','notice','logoText','color','position'])c[k]=f[k].value;for(const k of ['width','fontSize','marqueeSpeed'])c[k]=Number(f[k].value);c.opacity=Number(f.opacity.value)/100;for(const k of ['enabled','neon','rgb','matrix','glitch','marquee'])c[k]=f[k].checked;return c}
function renderPreview(){const c=readDesign(),p=$('preview-widget');p.hidden=!c.enabled;p.classList.toggle('rgb',c.rgb);p.classList.toggle('glitch',c.glitch);p.classList.toggle('marquee',c.marquee);p.style.color=c.color;p.style.width=Math.min(c.width,$('preview-surface').clientWidth-24)+'px';p.style.fontSize=c.fontSize+'px';p.style.opacity=c.opacity;p.style.boxShadow=c.neon?`0 0 23px ${c.color}77`:'none';p.style['--marquee-speed']=c.marqueeSpeed+'s';p.style.top=p.style.right=p.style.bottom=p.style.left='auto';p.style[c.position[0]==='t'?'top':'bottom']='12px';p.style[c.position[1]==='r'?'right':'left']='12px';$('preview-title').textContent=c.title;$('preview-version').textContent=c.version;$('preview-notice').textContent=c.notice;$('preview-logo').textContent=c.logoText||'Q';p.querySelector('.preview-glow').style.display=c.matrix?'block':'none';$('width-out').textContent=c.width+'px';$('opacity-out').textContent=Math.round(c.opacity*100)+'%';$('size-out').textContent=c.fontSize+'px';$('speed-out').textContent=c.marqueeSpeed+'s'}
async function saveDesign(){const c=readDesign();if(!c.title.trim())throw Error('Thiếu tên thương hiệu');if(!/^#[\da-f]{6}$/i.test(c.color))throw Error('Màu không hợp lệ');await response('/rest/v1/display_config?id=eq.1',{method:'PATCH',body:{config:{...normalizeDesign(state.design||{}),...c},updated_at:new Date().toISOString()}});state.design={...normalizeDesign(state.design||{}),...c};$('overview-display').textContent=c.enabled?'ON':'OFF';flash('Đã phát hành cấu hình V3 lên Supabase')}
async function saveSystem(){const f=$('system-form').elements;const c={maintenance:f.maintenance.checked,notice:f.notice.value.trim().slice(0,500),updated_at:new Date().toISOString()};await response('/rest/v1/system_config?id=eq.1',{method:'PATCH',body:c});state.system={...state.system,...c};$('overview-maintenance').textContent=c.maintenance?'ON':'OFF';flash('Đã cập nhật cài đặt hệ thống')}
function setPage(page){state.page=page;for(const v of document.querySelectorAll('[data-view]'))v.classList.toggle('active',v.dataset.view===page);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===page);const labels={overview:'Tổng quan hệ thống',users:'Quản lý người dùng',sessions:'Phiên truy cập',design:'Thiết kế giao diện',system:'Cài đặt hệ thống'};$('page-title').textContent=labels[page]||page;$('crumb').textContent=page.toUpperCase();window.scrollTo({top:0,behavior:'instant'});if(page==='design')renderPreview()}
for(const b of document.querySelectorAll('[data-page],[data-go]'))b.onclick=()=>setPage(b.dataset.page||b.dataset.go);
for(const b of document.querySelectorAll('[data-refresh]'))b.onclick=()=>loadPeople().then(()=>flash('Đã cập nhật danh sách')).catch(e=>flash(e.message,true));
$('login-form').onsubmit=async e=>{e.preventDefault();const button=$('login-submit');button.disabled=true;try{await login($('email').value.trim(),$('password').value);$('password').value=''}catch(err){clearAuth();flash(err.message,true)}finally{button.disabled=false}};
$('logout').onclick=async()=>{try{if(state.token)await response('/auth/v1/logout',{method:'POST'})}catch{}clearAuth();flash('Đã đăng xuất')};
$('design-form').addEventListener('input',renderPreview);$('design-form').onsubmit=async e=>{e.preventDefault();try{await saveDesign()}catch(err){flash(err.message,true)}};
$('reset-design').onclick=()=>fillDesign(state.design||DEFAULT);
$('system-form').onsubmit=async e=>{e.preventDefault();try{await saveSystem()}catch(err){flash(err.message,true)}};
window.addEventListener('pagehide',()=>clearInterval(state.poll));
clearAuth();
