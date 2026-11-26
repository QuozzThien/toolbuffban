import { normalizeAppearance } from './appearance-config.mjs';

const stylesheet = `
:host{display:block;color-scheme:dark}
.layer{position:absolute;box-sizing:border-box;max-width:calc(100% - 32px);max-height:calc(100% - 32px);overflow:auto;padding:16px;background:var(--bg);color:var(--accent);border:var(--border) solid currentColor;border-radius:var(--radius);font:var(--size)/1.38 var(--font);pointer-events:auto;overflow-wrap:anywhere}
[hidden]{display:none!important}
.layer h2{font-size:1.25em;margin:0 0 .4em}
.layer p{margin:.4em 0}.layer pre{white-space:pre-wrap;font-size:.85em}
.logo{display:block;object-fit:contain;width:42px;height:42px;margin-bottom:8px}
.neon{box-shadow:0 0 20px color-mix(in srgb,currentColor 55%,transparent)}
.rgb{animation:rgb calc(5s / var(--speed)) linear infinite}
.glitch h2{animation:glitch calc(2.4s / var(--speed)) steps(1) infinite}
.scanline{background-image:repeating-linear-gradient(transparent 0 3px,#ffffff0f 4px)}
.matrix{position:absolute;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;opacity:.2}
.layer>*:not(canvas){position:relative;z-index:1}
.marquee{overflow:hidden;white-space:nowrap}.marquee span{display:inline-block;animation:marquee var(--marquee) linear infinite}
.menu-actions{display:grid;gap:var(--gap)}
button{font:inherit;color:inherit;cursor:pointer;border:1px solid currentColor;border-radius:8px;padding:.5em;background:transparent}
.solid button{background:var(--accent);color:var(--bg)}.plain button{border-color:transparent}
.intro{inset:0;max-width:100%;max-height:100%;display:grid;place-content:center;text-align:center;z-index:3}
.intro .logo{margin-inline:auto}
@keyframes rgb{50%{filter:hue-rotate(180deg)}to{filter:hue-rotate(360deg)}}
@keyframes glitch{40%{text-shadow:2px 0 #f04,-2px 0 #0ef}44%{text-shadow:none}}
@keyframes marquee{to{transform:translateX(-100%)}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

function node(tag, value) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function position(layer, value) {
  if (value === 'center') {
    Object.assign(layer.style, { top: '50%', left: '50%', translate: '-50% -50%' });
    return;
  }
  layer.style[value[0] === 't' ? 'top' : 'bottom'] = '16px';
  layer.style[value[1] === 'r' ? 'right' : 'left'] = '16px';
  layer.style.transformOrigin = (value[0] === 't' ? 'top' : 'bottom') + ' ' +
    (value[1] === 'r' ? 'right' : 'left');
}

const mounted = new WeakMap();

export function mountAppearance(container, raw, { sections = ['intro', 'menu', 'brand'] } = {}) {
  mounted.get(container)?.();
  const config = normalizeAppearance(raw);
  const host = node('div');
  const root = host.attachShadow({ mode: 'open' });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const lifecycle = new AbortController();
  const timers = new Set();
  const animations = new Set();
  root.append(node('style', stylesheet));
  container.append(host);

  function destroy() {
    lifecycle.abort();
    for (const timer of timers) clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    host.remove();
    if (mounted.get(container) === destroy) mounted.delete(container);
  }

  mounted.set(container, destroy);

  function later(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  }

  function matrix(layer, speed) {
    const canvas = node('canvas');
    canvas.className = 'matrix';
    canvas.setAttribute('aria-hidden', 'true');
    layer.prepend(canvas);
    const context = canvas.getContext('2d');
    if (!context) return;
    const redraw = () => {
      if (layer.hidden || document.hidden || motion.matches) return;
      canvas.width = layer.clientWidth;
      canvas.height = layer.clientHeight;
      context.fillStyle = getComputedStyle(layer).color;
      context.font = '12px monospace';
      for (let x = 0; x < canvas.width; x += 13) {
        context.fillText(Math.random() > 0.5 ? '1' : '0', x, Math.random() * canvas.height);
      }
    };
    function tick() {
      redraw();
      if (!layer.hidden && !lifecycle.signal.aborted) later(tick, 105 / speed);
    }
    tick();
    motion.addEventListener('change', () => {
      canvas.hidden = motion.matches;
    }, { signal: lifecycle.signal });
    canvas.hidden = motion.matches;
  }

  for (const name of sections) {
    const value = config[name];
    if (!value || value.enabled === false) continue;
    const layer = node('section');
    layer.setAttribute('aria-label', value.title || name);
    layer.classList.add('layer', name);
    for (const effect of ['neon', 'rgb', 'glitch', 'scanline']) {
      layer.classList.toggle(effect, Boolean(value[effect]));
    }
    const style = layer.style;
    const variables = {
      accent: value.color, bg: value.background ?? '#071418', font: value.font ?? 'system-ui',
      size: value.fontSize + 'px', border: (value.border ?? 1) + 'px',
      radius: (value.radius ?? 12) + 'px', speed: value.speed ?? 1,
      gap: (value.gap ?? 12) + 'px', marquee: (value.marqueeSpeed ?? 10) + 's',
    };
    for (const [key, setting] of Object.entries(variables)) style.setProperty('--' + key, setting);
    style.opacity = value.opacity;
    if (value.brightness) style.filter = 'brightness(' + value.brightness + ')';
    if (value.width) style.width = value.width + 'px';
    if (value.scale) style.scale = value.scale;
    if (value.position) position(layer, value.position);
    if (value.logo) {
      const image = node('img');
      image.className = 'logo';
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.src = value.logo;
      layer.append(image);
    } else if (value.logoText) {
      layer.append(node('strong', value.logoText));
    }
    layer.append(node('h2', value.title));
    if (value.brand) layer.append(node('p', value.brand));
    if (value.version) layer.append(node('p', value.version));
    if (value.notice) {
      const notice = node('p');
      notice.classList.toggle('marquee', Boolean(value.marquee));
      notice.append(node('span', value.notice));
      layer.append(notice);
    }
    if (value.terminal) layer.append(node('pre', value.terminal));
    if (name === 'intro') {
      const close = () => { layer.hidden = true; };
      const button = node('button', 'Đóng intro');
      button.addEventListener('click', close, { signal: lifecycle.signal });
      layer.append(button);
      if (value.tapToClose) layer.addEventListener('click', close, { signal: lifecycle.signal });
      if (value.duration > 0) later(close, value.duration * 1000);
    }
    if (name === 'menu') {
      const toggle = node('button', 'Menu demo');
      const actions = node('div');
      actions.classList.add('menu-actions', value.button);
      const details = node('p');
      details.setAttribute('role', 'status');
      for (const label of ['Tổng quan', 'Giới thiệu']) {
        const button = node('button', label);
        button.addEventListener('click', () => { details.textContent = label; }, { signal: lifecycle.signal });
        actions.append(button);
      }
      toggle.setAttribute('aria-expanded', 'true');
      let current;
      toggle.addEventListener('click', () => {
        current?.cancel();
        const opening = toggle.getAttribute('aria-expanded') === 'false';
        toggle.setAttribute('aria-expanded', String(opening));
        const effect = opening ? value.openEffect : value.closeEffect;
        if (motion.matches || effect === 'none') {
          actions.hidden = !opening;
          return;
        }
        actions.hidden = false;
        const from = { opacity: 0, transform: effect === 'slide' ? 'translateY(8px)' : 'none' };
        const to = { opacity: 1, transform: 'none' };
        const animation = actions.animate(opening ? [from, to] : [to, from], 180);
        current = animation;
        animations.add(animation);
        animation.finished.then(() => { actions.hidden = !opening; }, () => {})
          .finally(() => animations.delete(animation));
      }, { signal: lifecycle.signal });
      layer.append(toggle, actions, details);
    }
    root.append(layer);
    if (value.matrix) matrix(layer, value.speed ?? 1);
  }

  return destroy;
}
