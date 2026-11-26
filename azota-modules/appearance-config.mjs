const text = (value, max) => ({ value, max });
const number = (value, min, max) => ({ value, min, max });
const choice = (value, options) => ({ value, options });
const color = (value) => ({ value, color: true });
const logo = { value: '', url: true };
const effects = { neon: true, rgb: false, glitch: false, scanline: false };
const font = choice('system-ui', ['system-ui', 'monospace', 'sans-serif', 'serif']);
const panel = {
  color: color('#00ff9c'), background: color('#071418'), font,
  fontSize: number(16, 11, 48), opacity: number(1, 0.1, 1),
  border: number(1, 0, 8), radius: number(16, 0, 40), logo, ...effects,
};
const corners = ['tl', 'tr', 'bl', 'br'];

export const fields = {
  intro: {
    ...panel, enabled: true, title: text('QUOZZ', 80), brand: text('CONTROL CENTER', 80),
    version: text('V3.1', 40), notice: text('SYSTEM ONLINE', 200),
    terminal: text('Khởi động giao diện', 400), matrix: false,
    speed: number(1, 0.25, 3), brightness: number(1, 0.3, 1.5),
    duration: number(4, 0, 30), tapToClose: true,
  },
  menu: {
    ...panel, title: text('QUOZZ CONTROL CENTER', 80), width: number(340, 150, 600),
    position: choice('bl', [...corners, 'center']), gap: number(12, 4, 32),
    button: choice('outline', ['outline', 'solid', 'plain']),
    openEffect: choice('fade', ['none', 'fade', 'slide']),
    closeEffect: choice('fade', ['none', 'fade', 'slide']),
  },
  brand: {
    enabled: true, title: text('VIP TOOL', 80), version: text('V4.9', 40),
    notice: text('SYSTEM ONLINE', 200), logoText: text('Q', 3), logo,
    color: color('#00ff9c'), position: choice('bl', corners),
    width: number(240, 150, 400), fontSize: number(14, 11, 24),
    opacity: number(0.95, 0.1, 1), scale: number(1, 0.5, 1.5),
    neon: true, rgb: false, matrix: false, glitch: false, marquee: true,
    marqueeSpeed: number(10, 4, 30),
  },
};

const positions = new Map([
  ['bottom-left', 'bl'], ['bottom-right', 'br'], ['top-left', 'tl'], ['top-right', 'tr'],
]);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function normalizeField(rule, value) {
  if (typeof rule === 'boolean') return typeof value === 'boolean' ? value : rule;
  if ('min' in rule) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(rule.max, Math.max(rule.min, value))
      : rule.value;
  }
  if (typeof value !== 'string') return rule.value;
  if (rule.options) return rule.options.includes(value) ? value : rule.value;
  if (rule.color) return /^#[0-9a-f]{6}$/i.test(value) ? value : rule.value;
  if (rule.url) {
    if (value.length > 2048) return rule.value;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : rule.value;
    } catch {
      return rule.value;
    }
  }
  return value.slice(0, rule.max);
}

export function normalizeAppearance(raw = {}) {
  if (!isRecord(raw)) raw = {};
  const config = { schemaVersion: 2 };
  for (const [section, rules] of Object.entries(fields)) {
    const source = isRecord(raw[section]) ? raw[section] : section === 'brand' ? raw : {};
    config[section] = Object.fromEntries(Object.entries(rules).map(([key, rule]) => {
      const value = key === 'position' ? positions.get(source[key]) ?? source[key] : source[key];
      return [key, normalizeField(rule, value)];
    }));
  }
  return config;
}

export function publishedAppearance(previous, value) {
  const config = normalizeAppearance(value);
  return {
    ...(isRecord(previous) ? previous : {}),
    ...config.brand,
    ...config,
  };
}
