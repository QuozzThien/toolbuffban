import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';
import { normalizeAppearance } from './appearance-config.mjs';
import { mountAppearance } from './appearance-render.mjs';

const stage = document.querySelector('#demo-stage');
const status = document.querySelector('#demo-status');
const endpoint = new URL('/rest/v1/display_config?select=config&id=eq.1', SUPABASE_URL);
let signature;
let destroy;
let pending;
let poll;
let introShown = false;

function apply(raw) {
  const config = normalizeAppearance(raw);
  const next = JSON.stringify(config);
  if (next === signature) return;
  signature = next;
  const sections = introShown ? ['menu', 'brand'] : ['intro', 'menu', 'brand'];
  destroy = mountAppearance(stage, config, { sections });
  introShown ||= config.intro.enabled;
}

async function readJson(url, signal, headers) {
  const response = await fetch(url, { signal, headers, cache: 'no-store' });
  if (!response.ok) throw Error('HTTP ' + response.status);
  return response.json();
}

async function refresh() {
  if (pending || document.hidden) return;
  const controller = new AbortController();
  pending = controller;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]);
  try {
    const rows = await readJson(endpoint, signal, { apikey: SUPABASE_KEY });
    if (!rows?.[0]?.config) throw Error('Thiếu cấu hình');
    if (controller.signal.aborted) return;
    apply(rows[0].config);
    status.textContent = 'Đang dùng cấu hình đã phát hành.';
  } catch {
    if (controller.signal.aborted) return;
    if (!signature) {
      let fallback;
      try {
        fallback = await readJson(new URL('./config.json', import.meta.url),
          AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]));
      } catch {}
      if (controller.signal.aborted) return;
      apply(fallback);
      status.textContent = 'Đang dùng cấu hình dự phòng.';
    } else {
      status.textContent = 'Mất kết nối. Đang dùng cấu hình gần nhất.';
    }
  } finally {
    if (pending === controller) pending = undefined;
  }
}

function schedule() {
  clearInterval(poll);
  if (document.hidden) return;
  refresh();
  poll = setInterval(refresh, 60000);
}

window.addEventListener('pagehide', () => {
  clearInterval(poll);
  pending?.abort();
  pending = undefined;
  destroy?.();
  signature = undefined;
});
window.addEventListener('pageshow', schedule);
document.addEventListener('visibilitychange', schedule);
