import { fields, normalizeAppearance } from './appearance-config.mjs';
import { mountAppearance } from './appearance-render.mjs';

const labels = {
  enabled: 'Hiển thị', title: 'Tiêu đề', brand: 'Thương hiệu', version: 'Phiên bản',
  notice: 'Thông báo', terminal: 'Nội dung terminal', color: 'Màu chữ', background: 'Màu nền',
  font: 'Font chữ', fontSize: 'Cỡ chữ', opacity: 'Độ trong suốt', border: 'Độ dày viền',
  radius: 'Bo góc', logo: 'URL logo (HTTPS)', logoText: 'Logo dạng chữ', width: 'Chiều rộng',
  position: 'Vị trí', gap: 'Khoảng cách', button: 'Kiểu nút', openEffect: 'Hiệu ứng mở',
  closeEffect: 'Hiệu ứng đóng', speed: 'Tốc độ hiệu ứng', brightness: 'Độ sáng',
  duration: 'Thời lượng (giây)', tapToClose: 'Chạm để đóng', scale: 'Tỷ lệ',
  marquee: 'Chữ chạy', marqueeSpeed: 'Chu kỳ chữ chạy (giây)', rgb: 'RGB',
};

export function createAppearanceEditor(form, preview, dialog) {
  let section = 'brand';
  let draft = normalizeAppearance();
  let stopPreview;
  let stopDialog;
  const inputs = form.querySelector('[data-fields]');
  const tabs = [...form.querySelectorAll('[data-section]')];

  function renderPreview() {
    stopPreview?.();
    stopPreview = mountAppearance(preview, draft, { sections: [section] });
  }

  function show() {
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.section === section));
    inputs.replaceChildren();
    for (const [key, rule] of Object.entries(fields[section])) {
      const label = document.createElement('label');
      label.textContent = labels[key] ?? key[0].toUpperCase() + key.slice(1);
      const input = document.createElement(rule.options ? 'select' : 'input');
      const flag = typeof rule === 'boolean';
      const numeric = !flag && 'min' in rule;
      if (rule.options) {
        for (const option of rule.options) input.add(new Option(option, option));
      } else {
        input.type = flag ? 'checkbox' : numeric ? 'number' : rule.color ? 'color' : rule.url ? 'url' : 'text';
        if (numeric) {
          input.min = rule.min;
          input.max = rule.max;
          input.step = 'any';
          input.required = true;
        }
        if (!flag && !numeric) input.maxLength = rule.max ?? 2048;
        if (rule.url) input.pattern = 'https://.+';
      }
      if (flag) input.checked = draft[section][key];
      else input.value = draft[section][key];
      input.addEventListener('input', () => {
        draft[section][key] = flag ? input.checked : numeric ? input.valueAsNumber : input.value;
        renderPreview();
      });
      label.append(input);
      inputs.append(label);
    }
    renderPreview();
  }

  for (const tab of tabs) tab.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    section = tab.dataset.section;
    show();
  });
  form.querySelector('[data-preview]').addEventListener('click', () => {
    if (!form.reportValidity() || dialog.open) return;
    dialog.showModal();
    stopDialog = mountAppearance(dialog.querySelector('[data-preview-stage]'), draft, { sections: [section] });
  });
  dialog.addEventListener('close', () => stopDialog?.());

  return {
    fill(raw) {
      draft = normalizeAppearance(raw);
      show();
    },
    value: () => normalizeAppearance(draft),
    renderPreview,
    clearPreview() {
      if (dialog.open) dialog.close();
      stopDialog?.();
      stopPreview?.();
    },
  };
}
