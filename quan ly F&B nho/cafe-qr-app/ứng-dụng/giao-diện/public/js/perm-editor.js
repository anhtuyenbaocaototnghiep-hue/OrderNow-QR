// F-090 (ADR-051): quyền của một tài khoản trong hộp Thêm / Sửa tài khoản.
//  - "Vai trò này được làm": quyền mặc định của vai trò + vị trí đang chọn (máy chủ tính — GET /api/admin/role-permissions), đổi ngay khi
//    chọn vai / vị trí khác.
//  - "Quyền nâng cao": mỗi việc một công tắc **Cho phép / Không cho phép**. Khác mặc định → lưu quyền riêng (ALLOW / DENY, không hạn);
//    giống mặc định → không lưu (theo vai trò). Quyền tạm (duyệt Xin quyền, có hạn) giữ nguyên hạn nếu không chạm vào.
//  Chủ quán luôn đủ mọi quyền (không có công tắc). Quyền thật vẫn kiểm ở máy chủ (permissions.js) — đây chỉ là chỗ đặt.
import { staffApi } from './api.js';
import { clear, dateTime, el, errorMessage } from './ui.js';

const time = (d) => (d ? new Date(d).getTime() : null);

/**
 * `form`: hộp có ô `role` và (nhân viên) các ô `positions`. `current`: GET /api/admin/users/{id}/grants (null khi tạo mới / chủ quán).
 * Trả { node, ready(), grants(), changed() } — `grants()` là danh sách cho PUT /api/admin/users/{id}/grants.
 */
export function permissionEditor(form, current = null) {
  const saved = new Map((current?.items ?? []).filter((i) => i.override).map((i) => [i.key, i.override]));
  const touched = new Map(); // key → bật / tắt chủ quán vừa chọn trong hộp này
  let items = current?.items ?? null; // danh mục + byRole của vai / vị trí đang chọn
  let rows = [];
  let seq = 0;
  let pending = Promise.resolve();

  const roleOf = () => form.elements.namedItem('role').value;
  const positionsOf = () => (roleOf() === 'STAFF' ? [...form.querySelectorAll('input[name="positions"]:checked')].map((i) => i.value) : []);
  /** Đang bật? Đã chạm → theo công tắc; có quyền riêng đang lưu → theo quyền đó; không thì theo vai trò. */
  const onOf = (it) => (touched.has(it.key) ? touched.get(it.key) : saved.has(it.key) ? saved.get(it.key).effect === 'ALLOW' : it.byRole);

  const summary = el('div', { class: 'perm-summary' });
  const list = el('div', { class: 'perm-list' });
  const reset = el(
    'button',
    {
      class: 'btn btn-sm',
      type: 'button',
      onclick: () => {
        for (const r of rows) {
          touched.set(r.it.key, r.it.byRole);
          r.input.checked = r.it.byRole;
          paintRow(r);
        }
        paintSummary();
      },
    },
    'Về như vai trò',
  );
  const advanced = el(
    'details',
    { class: 'perm-advanced', open: saved.size > 0 },
    el('summary', {}, 'Quyền nâng cao — cho phép / không cho phép từng việc'),
    el('p', { class: 'small muted' }, 'Chủ quán cấp thêm hoặc bỏ bớt từng việc so với vai trò. Có hiệu lực ngay ở thao tác kế tiếp của người đó.'),
    list,
    el('div', { class: 'row' }, reset),
  );
  const node = el('fieldset', { class: 'field perm-editor' }, el('legend', {}, 'Quyền'), summary, advanced);

  function paintRow(r) {
    const on = onOf(r.it);
    const tempUntil = !touched.has(r.it.key) && saved.get(r.it.key)?.expiresAt;
    r.state.textContent = on ? 'Cho phép' : 'Không cho phép';
    r.note.textContent = [on === r.it.byRole ? 'Theo vai trò' : on ? 'Cấp thêm' : 'Bỏ bớt', tempUntil ? `tạm đến ${dateTime(tempUntil)}` : null]
      .filter(Boolean)
      .join(' · ');
    r.row.classList.toggle('diff', on !== r.it.byRole);
  }

  function paintSummary() {
    if (roleOf() === 'ADMIN') {
      advanced.hidden = true;
      return clear(summary, el('p', { class: 'small muted' }, 'Chủ quán luôn đủ mọi quyền — không cần đặt riêng.'));
    }
    advanced.hidden = false;
    if (!items) return clear(summary, el('p', { class: 'small muted' }, 'Đang tải quyền của vai trò…'));
    const base = items.filter((i) => i.byRole);
    const more = items.filter((i) => onOf(i) && !i.byRole).map((i) => i.label);
    const less = items.filter((i) => !onOf(i) && i.byRole).map((i) => i.label);
    clear(
      summary,
      el(
        'p',
        { class: 'perm-head' },
        el('strong', {}, `Vai trò này được làm ${base.length} / ${items.length} việc`),
        base.length ? '' : ' — chọn vị trí hoặc cho phép ở Quyền nâng cao',
      ),
      base.length
        ? el(
            'ul',
            { class: 'perm-base' },
            base.map((i) => el('li', {}, i.label)),
          )
        : null,
      more.length || less.length
        ? el(
            'p',
            { class: 'small perm-diff' },
            [more.length ? `Cấp thêm: ${more.join('; ')}` : null, less.length ? `Bỏ bớt: ${less.join('; ')}` : null].filter(Boolean).join(' · '),
          )
        : null,
    );
  }

  function buildList() {
    rows = items.map((it) => {
      const id = `perm-${it.key.replace(/\./g, '-')}`;
      const input = el('input', { type: 'checkbox', role: 'switch', 'aria-labelledby': id, 'aria-describedby': `${id}-note`, checked: onOf(it) });
      const r = {
        it,
        input,
        state: el('span', { class: 'perm-state', 'aria-hidden': 'true' }),
        note: el('div', { class: 'small muted perm-note', id: `${id}-note` }),
      };
      r.row = el(
        'div',
        { class: 'perm-row', dataset: { cap: it.key } },
        el(
          'div',
          { class: 'perm-text' },
          el('span', { id }, it.label),
          it.money ? el('span', { class: 'badge pending', title: 'Dính tới tiền — cho phép thì chủ quán được báo' }, 'Tiền') : null,
          r.note,
        ),
        el('label', { class: 'perm-switch' }, input, r.state),
      );
      input.addEventListener('change', () => {
        touched.set(it.key, input.checked);
        paintRow(r);
        paintSummary();
      });
      paintRow(r);
      return r;
    });
    const groups = [...new Set(items.map((i) => i.group))];
    clear(
      list,
      groups.map((g) =>
        el(
          'div',
          { class: 'perm-group', role: 'group', 'aria-label': g },
          el('div', { class: 'perm-group-title', 'aria-hidden': 'true' }, g),
          rows.filter((r) => r.it.group === g).map((r) => r.row),
        ),
      ),
    );
  }

  /** Lấy quyền mặc định của vai / vị trí đang chọn (bỏ kết quả cũ nếu người dùng đã đổi tiếp). */
  function refresh() {
    if (roleOf() === 'ADMIN') return paintSummary();
    const my = ++seq;
    const qs = new URLSearchParams({ role: roleOf() });
    const pos = positionsOf();
    if (pos.length) qs.set('positions', pos.join(','));
    pending = staffApi(`/api/admin/role-permissions?${qs}`).then(
      (r) => {
        if (my !== seq) return;
        items = r.items;
        buildList();
        paintSummary();
      },
      (err) => {
        if (my !== seq) return;
        items = null;
        clear(summary, el('div', { class: 'alert danger' }, errorMessage(err)));
      },
    );
    return pending;
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'role' || e.target.name === 'positions') refresh();
  });
  if (items) {
    buildList();
    paintSummary();
  } else refresh();

  return {
    node,
    /** Đợi lần lấy quyền mặc định gần nhất (bấm Lưu ngay sau khi đổi vai trò). */
    ready: () => pending,
    /** Quyền riêng cần lưu: chỉ việc khác mặc định; quyền tạm chưa chạm giữ hạn cũ. */
    grants() {
      if (!items || roleOf() === 'ADMIN') return [];
      return items
        .filter((it) => onOf(it) !== it.byRole)
        .map((it) => ({
          capability: it.key,
          effect: onOf(it) ? 'ALLOW' : 'DENY',
          expiresAt: touched.has(it.key) ? null : (saved.get(it.key)?.expiresAt ?? null),
        }))
        .filter((g) => !g.expiresAt || time(g.expiresAt) > Date.now()); // quyền tạm vừa hết hạn lúc hộp đang mở → về theo vai trò
    },
    /** Khác quyền riêng đang lưu? (không có gì đổi → không gọi API) */
    changed() {
      if (!items || roleOf() === 'ADMIN') return false;
      const next = this.grants();
      return (
        next.length !== saved.size ||
        next.some((g) => {
          const s = saved.get(g.capability);
          return !s || s.effect !== g.effect || time(s.expiresAt) !== time(g.expiresAt);
        })
      );
    },
  };
}
