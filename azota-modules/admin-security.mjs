const actions = {
  'session.kick': 'Thu hồi phiên',
  'user.ban': 'Khóa tài khoản',
  'user.unban': 'Mở khóa tài khoản',
  'system.update': 'Lưu cài đặt hệ thống',
  'vip.issue': 'Tạo VIP Key',
  'vip.revoke': 'Thu hồi VIP Key',
  'vip.redeem': 'Đổi VIP Key',
};

export function createSecurityPanel({ rpc, flash, el, cell, action, toIso }) {
  const byId = (id) => document.getElementById(id);
  const auditList = byId('audit-list');
  const keyList = byId('vip-key-list');
  const earlier = byId('audit-earlier');
  const refresh = byId('security-refresh');
  const form = byId('vip-key-form');
  const result = byId('issued-vip-key');
  let before;
  let revision = 0;
  let securityView = 0;

  function clear() {
    revision++;
    securityView++;
    before = undefined;
    auditList.replaceChildren();
    keyList.replaceChildren();
    earlier.hidden = true;
    result.value = '';
    result.closest('label').hidden = true;
    form.reset();
  }

  async function loadAudit({ append = false, current = revision } = {}) {
    const rows = await rpc('admin_data', append ? { p_kind: 'audit', p_before: before } : { p_kind: 'audit' });
    if (current !== revision) return;
    if (!append) auditList.replaceChildren();
    for (const entry of rows) {
      const row = el('tr');
      cell(row, toIso(entry.occurred_at));
      cell(row, actions[entry.action] ?? entry.action);
      cell(row, entry.actor_id);
      cell(row, entry.target_id);
      cell(row, Object.keys(entry.details).length ? JSON.stringify(entry.details) : '—');
      auditList.append(row);
    }
    if (!append && !rows.length) appendEmpty(auditList, 5, 'Chưa có nhật ký.');
    before = rows.at(-1)?.id;
    earlier.hidden = rows.length < 50;
  }

  function appendEmpty(table, columns, message) {
    const row = el('tr');
    cell(row, message).colSpan = columns;
    table.append(row);
  }

  async function loadKeys(current = revision) {
    const rows = await rpc('admin_data', { p_kind: 'keys' });
    if (current !== revision) return;
    keyList.replaceChildren();
    if (!rows.length) appendEmpty(keyList, 5, 'Chưa có VIP Key.');
    for (const key of rows) {
      const row = el('tr');
      const expired = Date.parse(key.redeem_before) <= Date.now();
      cell(row, key.id);
      cell(row, key.duration_days + ' ngày');
      cell(row, toIso(key.redeem_before));
      cell(row, key.redeemed_at ? 'Đã dùng' : key.revoked_at ? 'Đã thu hồi' : expired ? 'Hết hạn' : 'Có thể đổi');
      const available = !key.redeemed_at && !key.revoked_at && !expired;
      cell(row, available ? action('Thu hồi', 'danger', (event) => run(event.currentTarget, async () => {
        if (!confirm('Thu hồi VIP Key chưa sử dụng này?')) return;
        const changed = await rpc('revoke_key', { p_key_id: key.id });
        flash(changed ? 'Đã thu hồi VIP Key' : 'VIP Key đã được xử lý');
        await load();
      })) : '—');
      keyList.append(row);
    }
  }

  async function load() {
    const current = ++revision;
    await Promise.all([loadAudit({ current }), loadKeys(current)]);
  }

  async function run(button, task) {
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      flash(error.message, true);
    } finally {
      button.disabled = false;
    }
  }

  refresh.addEventListener('click', () => run(refresh, load));
  earlier.addEventListener('click', () => run(earlier, () => loadAudit({ append: true })));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = event.submitter;
    run(button, async () => {
      if (!confirm('Tạo VIP Key dùng một lần?')) return;
      const current = securityView;
      const key = await rpc('issue_key', {
        p_duration_days: form.elements.duration.valueAsNumber,
        p_redeem_before: new Date(form.elements.redeemBefore.value).toISOString(),
      });
      if (current !== securityView) return;
      result.value = key.key;
      result.closest('label').hidden = false;
      flash('Đã tạo VIP Key. Sao chép trước khi rời trang.');
      await load();
    });
  });

  return { load, clear };
}
