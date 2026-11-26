import { createSecurityPanel } from './admin-security.mjs';
import { publishedAppearance } from './appearance-config.mjs';
import { createAppearanceEditor } from './appearance-editor.mjs';
import {SUPABASE_URL as URL, SUPABASE_KEY as KEY} from './supabase-config.js';
const $=id=>document.getElementById(id);
const state={token:'',refresh:'',expires:0,user:null,profiles:[],sessions:[],design:null,system:null,page:'overview',poll:null};
const toIso=d=>d?new Date(d).toLocaleString('vi-VN'):'—';
const sessionLabels = {
  online: 'ONLINE', idle: 'Không hoạt động', legacy: 'Phiên V3 cũ', auth_ended: 'Auth đã kết thúc',
  banned: 'Đã khóa tài khoản', expired: 'Hết hạn', revoked: 'Đã thu hồi',
};
const online = (session) => session.status === 'online';
let authRevision = 0;
let refreshPending;
let peopleRequest = 0;
const rpc = (name, body = {}) => response('/rest/v1/rpc/quozz_' + name, { method: 'POST', body });
function flash(message,error=false){const t=$('toast');t.textContent=message;t.className=error?'error':'';t.style.display='block';clearTimeout(flash.timeout);flash.timeout=setTimeout(()=>t.style.display='none',4000)}
async function response(path,{method='GET',body,auth=true,headers={}}={}){
  const revision = authRevision;
  if(auth){if(!state.token)throw Error('Cần đăng nhập Admin');if(Date.now()>state.expires-60000)await refreshAuth()}
  if (auth && revision !== authRevision) throw Error('Phiên đăng nhập đã thay đổi');
  const h={'apikey':KEY,'Accept':'application/json',...headers};
  if(auth)h.Authorization='Bearer '+state.token;
  if(body!==undefined)h['Content-Type']='application/json';
  const r=await fetch(URL+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const raw=await r.text();let value;try{value=raw?JSON.parse(raw):null}catch{value=raw}
  if (auth && revision !== authRevision) throw Error('Phiên đăng nhập đã thay đổi');
  if (!r.ok) {
    if (auth && (r.status === 401 || value?.message === 'ADMIN_REQUIRED')) clearAuth();
    throw Error(value?.message || value?.msg || value?.error_description || value?.error || 'HTTP ' + r.status);
  }
  return value;
}
async function refreshAuth() {
  if (refreshPending) return refreshPending;
  if (!state.refresh) throw Error('Phiên hết hạn, vui lòng đăng nhập lại');
  const revision = authRevision;
  const task = response('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', body: { refresh_token: state.refresh }, auth: false,
  }).then((tokens) => {
    if (revision === authRevision) setTokens(tokens);
  });
  refreshPending = task;
  try {
    await task;
  } finally {
    if (refreshPending === task) refreshPending = undefined;
  }
}
function setTokens(o){state.token=o.access_token;state.refresh=o.refresh_token;state.expires=Date.now()+(o.expires_in||3600)*1000}
async function login(email,password){const r=await response('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});setTokens(r);
  const allowed=await response('/rest/v1/rpc/is_admin',{method:'POST',body:{}});if(allowed!==true){clearAuth();throw Error('Tài khoản không có quyền Admin')}
  state.user=await response('/auth/v1/user');$('login-panel').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('admin-status').textContent='ADMIN: '+(state.user.email||'AUTHORIZED');await loadAll();setPage('overview');clearInterval(state.poll);state.poll=setInterval(()=>{if(state.page==='sessions'||state.page==='users'||state.page==='overview')loadPeople().catch(e=>flash(e.message,true))},20000)
}
function clearAuth(){authRevision++;refreshPending=undefined;securityPanel.clear();state.token='';state.refresh='';state.expires=0;state.user=null;editor.clearPreview();$('appearance-status').textContent='';state.profiles=[];state.sessions=[];clearInterval(state.poll);$('login-panel').hidden=false;$('workspace').hidden=true;$('logout').hidden=true;$('admin-status').textContent='CHƯA ĐĂNG NHẬP'}
async function loadPeople() {
  const request = ++peopleRequest;
  const [profiles, sessions, counts] = await Promise.all(
    ['profiles', 'sessions', 'overview'].map((kind) => rpc('admin_data', { p_kind: kind })),
  );
  if (request !== peopleRequest) return;
  state.profiles = profiles;
  state.sessions = sessions;
  renderPeople(counts);
}
async function loadConfig(){const [d,s]=await Promise.all([response('/rest/v1/display_config?select=*&id=eq.1'),response('/rest/v1/system_config?select=*&id=eq.1')]);state.design=d?.[0]?.config||{};state.designUpdatedAt=d?.[0]?.updated_at;state.system=s?.[0]||{maintenance:false,notice:''};fillDesign(state.design);$('system-form').elements.maintenance.checked=!!state.system.maintenance;$('system-form').elements.notice.value=state.system.notice||'';$('overview-display').textContent=state.design.enabled===false?'OFF':'ON';$('overview-maintenance').textContent=state.system.maintenance?'ON':'OFF'}
async function loadAll(){await Promise.all([loadPeople(),loadConfig()]);flash('Kết nối Supabase thành công')}
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);if(cls)x.className=cls;return x}
function action(text,klass,fn){const b=el('button',text,'button '+klass);b.type='button';b.onclick=fn;return b}
function cell(tr,content){const td=el('td');if(content instanceof Node)td.append(content);else td.textContent=String(content??'');tr.append(td);return td}
function renderPeople(counts) {
  const { profiles, sessions } = state;
  $('stat-users').textContent = counts.users;
  $('stat-online').textContent = counts.online_users;
  $('stat-sessions').textContent = counts.sessions;
  $('stat-banned').textContent = counts.banned;
  const users = $('user-list');
  users.replaceChildren();
  $('users-empty').hidden = profiles.length > 0;
  for (const profile of profiles) {
    const row = el('tr');
    cell(row, profile.username || profile.id.slice(0, 8) + '…');
    cell(row, profile.is_admin ? 'Admin' : profile.banned ? 'Đã khóa' : 'Hoạt động');
    cell(row, toIso(profile.created_at));
    cell(row, toIso(profile.last_seen));
    cell(row, toIso(profile.vip_expires_at));
    cell(row, profile.is_admin ? '—' : action(profile.banned ? 'Mở khóa' : 'Ban',
      profile.banned ? 'subtle' : 'danger', (event) => changeBan(profile, event.currentTarget)));
    users.append(row);
  }
  const sessionList = $('session-list');
  sessionList.replaceChildren();
  $('sessions-empty').hidden = sessions.length > 0;
  for (const session of sessions) {
    const row = el('tr');
    cell(row, (session.device || 'Thiết bị không xác định').slice(0, 95));
    cell(row, session.user_id.slice(0, 8) + '…');
    cell(row, toIso(session.last_seen));
    cell(row, toIso(session.expires_at));
    cell(row, sessionLabels[session.status] ?? '—');
    const canKick = session.status === 'online' || session.status === 'idle';
    cell(row, canKick ? action('Kick', 'danger', (event) => kick(session, event.currentTarget)) : '—');
    sessionList.append(row);
  }
  const feed = $('recent-sessions');
  feed.replaceChildren();
  if (!sessions.length) feed.textContent = 'Chưa có dữ liệu phiên.';
  for (const session of sessions.slice(0, 4)) {
    const line = `${(session.device || 'Thiết bị').slice(0, 38)} · ${toIso(session.last_seen)} ${online(session) ? '• ONLINE' : ''}`;
    feed.append(el('div', line, 'feed-line'));
  }
}

async function peopleAction(button, name, payload, success) {
  button.disabled = true;
  try {
    const changed = await rpc(name, payload);
    flash(changed ? success : 'Trạng thái đã thay đổi hoặc mục không còn tồn tại');
    await loadPeople();
  } catch (error) {
    flash(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function changeBan(profile, button) {
  const label = profile.banned ? 'Mở khóa' : 'Khóa';
  if (!confirm(label + ' tài khoản ' + (profile.username || profile.id) + '?')) return;
  return peopleAction(button, 'set_ban', { p_user_id: profile.id, p_banned: !profile.banned },
    profile.banned ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản và thu hồi các phiên');
}

function kick(session, button) {
  if (!confirm('Thu hồi phiên ' + session.id.slice(0, 8) + '…?')) return;
  return peopleAction(button, 'kick', { p_session_id: session.id }, 'Đã thu hồi phiên ứng dụng');
}

const securityPanel = createSecurityPanel({ rpc, flash, el, cell, action, toIso });
const editor = createAppearanceEditor($('design-form'), $('preview-surface'), $('appearance-dialog'));
const draftKey = () => 'quozz-appearance-draft:' + state.user.id;
let draftBase;
function fillDesign(raw) {
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem(draftKey())); } catch {}
  draftBase = draft?.base ?? state.designUpdatedAt;
  editor.fill(draft?.config ?? raw);
  if (state.page !== 'design') editor.clearPreview();
  $('appearance-status').textContent = draft && draftBase !== state.designUpdatedAt
    ? 'Bản nháp dựa trên phiên bản cũ. Hãy Reset trước khi phát hành.'
    : '';
}
async function publishDesign() {
  if (!state.designUpdatedAt || draftBase !== state.designUpdatedAt) {
    throw Error('Phiên bản cấu hình đã thay đổi. Hãy tải lại trang và Reset trước khi phát hành.');
  }
  if (!confirm('Phát hành cấu hình cho trang demo và bảng thương hiệu?')) return;
  const config = publishedAppearance(state.design, editor.value());
  const previous = encodeURIComponent(state.designUpdatedAt);
  const rows = await response('/rest/v1/display_config?id=eq.1&updated_at=eq.' + previous, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: { config, updated_at: new Date().toISOString() },
  });
  if (!rows?.length) throw Error('Cấu hình đã thay đổi. Lưu bản nháp rồi tải lại trang trước khi phát hành.');
  state.design = rows[0].config;
  state.designUpdatedAt = rows[0].updated_at;
  draftBase = state.designUpdatedAt;
  try { sessionStorage.removeItem(draftKey()); } catch {}
  $('overview-display').textContent = config.brand.enabled ? 'ON' : 'OFF';
  $('appearance-status').textContent = 'Đã phát hành cấu hình.';
}
async function saveSystem() {
  const form = $('system-form').elements;
  state.system = await rpc('set_system', {
    p_maintenance: form.maintenance.checked,
    p_notice: form.notice.value.trim(),
    p_expected_updated_at: state.system.updated_at ?? null,
  });
  $('overview-maintenance').textContent = state.system.maintenance ? 'ON' : 'OFF';
  flash('Đã cập nhật cài đặt hệ thống');
}
function setPage(page){state.page=page;for(const v of document.querySelectorAll('[data-view]'))v.classList.toggle('active',v.dataset.view===page);for(const b of document.querySelectorAll('[data-page]'))b.classList.toggle('active',b.dataset.page===page);const labels={overview:'Tổng quan hệ thống',users:'Quản lý người dùng',sessions:'Phiên truy cập',design:'Thiết kế giao diện',security:'Bảo mật',system:'Cài đặt hệ thống'};$('page-title').textContent=labels[page]||page;$('crumb').textContent=page.toUpperCase();window.scrollTo({top:0,behavior:'instant'});if(page==='design')editor.renderPreview();else editor.clearPreview();
  if (page === 'security' && state.user) securityPanel.load().catch((error) => flash(error.message, true));
  else securityPanel.clear();
}
for(const b of document.querySelectorAll('[data-page],[data-go]'))b.onclick=()=>setPage(b.dataset.page||b.dataset.go);
for(const b of document.querySelectorAll('[data-refresh]'))b.onclick=()=>loadPeople().then(()=>flash('Đã cập nhật danh sách')).catch(e=>flash(e.message,true));
$('login-form').onsubmit=async e=>{e.preventDefault();const button=$('login-submit');button.disabled=true;try{await login($('email').value.trim(),$('password').value);$('password').value=''}catch(err){clearAuth();flash(err.message,true)}finally{$('password').value='';button.disabled=false}};
$('logout').onclick=async()=>{try{if(state.token)await response('/auth/v1/logout',{method:'POST'})}catch{}clearAuth();flash('Đã đăng xuất')};
$('design-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    if (button.id === 'save-draft') {
      sessionStorage.setItem(draftKey(), JSON.stringify({ base: draftBase, config: editor.value() }));
      $('appearance-status').textContent = 'Đã lưu bản nháp trong tab này.';
    } else {
      await publishDesign();
    }
  } catch (error) {
    $('appearance-status').textContent = error.message;
    flash(error.message, true);
  } finally {
    button.disabled = false;
  }
};
$('reset-design').onclick = () => {
  draftBase = state.designUpdatedAt;
  editor.fill(state.design);
  try { sessionStorage.removeItem(draftKey()); } catch {}
  $('appearance-status').textContent = 'Đã khôi phục cấu hình đang phát hành.';
};
$('system-form').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    await saveSystem();
  } catch (error) {
    flash(error.message === 'SYSTEM_SETTINGS_CHANGED' ? 'Cài đặt đã đổi. Hãy tải lại trang.' : error.message, true);
  } finally {
    button.disabled = false;
  }
};
window.addEventListener('pagehide',()=>{clearInterval(state.poll);editor.clearPreview();securityPanel.clear()});
clearAuth();
