// Quyền của một tài khoản (F-090 — ADR-051; F-091 — ADR-053):
//  - roleSummary(form): trong hộp Thêm / Sửa tài khoản — "Vai trò này được làm N / 17 việc" theo vai trò + vị trí đang chọn (máy chủ
//    tính — GET /api/admin/role-permissions), đổi ngay khi chọn vai / vị trí khác; liên kết sang trang Quyền nâng cao.
//  - permissionSwitches(view): trên trang Quyền nâng cao — mỗi việc một công tắc **Cho phép / Không cho phép**. Khác mặc định của vai
//    trò → lưu quyền riêng (ALLOW / DENY, không hạn); giống mặc định → không lưu. Quyền tạm (duyệt Xin quyền, có hạn) giữ hạn nếu không chạm.
//  Chủ quán luôn đủ mọi quyền. Quyền thật vẫn kiểm ở máy chủ (permissions.js) — đây chỉ là chỗ xem / đặt.
import { staffApi } from './api.js';
import { clear, dateTime, el, errorMessage } from './ui.js';

const time = (d) => (d ? new Date(d).getTime() : null);
export const PERMISSIONS_PAGE = '/admin/permissions';

/**
 * Tóm tắt quyền theo vai trò trong hộp Thêm / Sửa. `form` có ô `role` và (nhân viên) các ô `positions`.
 * `user` (khi sửa): { userId, grantCount } — có quyền nâng cao thì ghi số + liên kết tới đúng người.
 * Trả { node, ready() } — `ready()` đợi lần lấy quyền gần nhất.
 */
export function roleSummary(form, user = null) {
  let seq = 0;
  let pending = Promise.resolve();
  const roleOf = () => form.elements.namedItem('role').value;
  const positionsOf = () => (roleOf() === 'STAFF' ? [...form.querySelectorAll('input[name="positions"]:checked')].map((i) => i.value) : []);
  const summary = el('div', { class: 'perm-summary' }, el('p', { class: 'small muted' }, 'Đang tải quyền của vai trò…'));
  const href = user ? `${PERMISSIONS_PAGE}?user=${user.userId}` : PERMISSIONS_PAGE;
  const more = el(
    'p',
    { class: 'small perm-more' },
    user?.grantCount ? el('strong', {}, `Người này có ${user.grantCount} quyền nâng cao. `) : null,
    user ? 'Cấp thêm / bỏ bớt từng việc cho người này ở ' : 'Muốn cấp thêm / bỏ bớt từng việc: tạo xong rồi mở ',
    el('a', { href }, 'Quyền nâng cao'),
    '.',
  );
  const node = el('fieldset', { class: 'field perm-editor' }, el('legend', {}, 'Quyền'), summary, more);

  function paint(items) {
    if (roleOf() === 'ADMIN') {
      more.hidden = true;
      return clear(summary, el('p', { class: 'small muted' }, 'Chủ quán luôn đủ mọi quyền — không cần đặt riêng.'));
    }
    more.hidden = false;
    const base = items.filter((i) => i.byRole);
    clear(
      summary,
      el(
        'p',
        { class: 'perm-head' },
        el('strong', {}, `Vai trò này được làm ${base.length} / ${items.length} việc`),
        base.length ? '' : ' — chọn vị trí, hoặc cho phép riêng ở Quyền nâng cao',
      ),
      base.length
        ? el(
            'ul',
            { class: 'perm-base' },
            base.map((i) => el('li', {}, i.label)),
          )
        : null,
    );
  }

  /** Lấy quyền mặc định của vai / vị trí đang chọn (bỏ kết quả cũ nếu người dùng đã đổi tiếp). */
  function refresh() {
    if (roleOf() === 'ADMIN') return paint([]);
    const my = ++seq;
    const qs = new URLSearchParams({ role: roleOf() });
    const pos = positionsOf();
    if (pos.length) qs.set('positions', pos.join(','));
    pending = staffApi(`/api/admin/role-permissions?${qs}`).then(
      (r) => my === seq && paint(r.items),
      (err) => my === seq && clear(summary, el('div', { class: 'alert danger' }, errorMessage(err))),
    );
    return pending;
  }
  form.addEventListener('change', (e) => {
    if (e.target.name === 'role' || e.target.name === 'positions') refresh();
  });
  refresh();
  return { node, ready: () => pending };
}

/**
 * Công tắc Cho phép / Không cho phép cho một người (trang Quyền nâng cao). `view` = GET /api/admin/users/{id}/grants.
 * `onChange()` gọi mỗi lần bật / tắt. Trả { node, grants(), changed(), reset() } — `grants()` cho PUT /api/admin/users/{id}/grants.
 */
export function permissionSwitches(view, onChange = () => {}) {
  const items = view.items;
  const saved = new Map(items.filter((i) => i.override).map((i) => [i.key, i.override]));
  const touched = new Map(); // key → bật / tắt chủ quán vừa chọn
  /** Đang bật? Đã chạm → theo công tắc; có quyền riêng đang lưu → theo quyền đó; không thì theo vai trò. */
  const onOf = (it) => (touched.has(it.key) ? touched.get(it.key) : saved.has(it.key) ? saved.get(it.key).effect === 'ALLOW' : it.byRole);

  function paintRow(r) {
    const on = onOf(r.it);
    const tempUntil = !touched.has(r.it.key) && saved.get(r.it.key)?.expiresAt;
    r.state.textContent = on ? 'Cho phép' : 'Không cho phép';
    r.note.textContent = [on === r.it.byRole ? 'Theo vai trò' : on ? 'Cấp thêm' : 'Bỏ bớt', tempUntil ? `tạm đến ${dateTime(tempUntil)}` : null]
      .filter(Boolean)
      .join(' · ');
    r.row.classList.toggle('diff', on !== r.it.byRole);
  }

  const rows = items.map((it) => {
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
      onChange();
    });
    paintRow(r);
    return r;
  });
  const groups = [...new Set(items.map((i) => i.group))];
  const node = el(
    'div',
    { class: 'perm-list' },
    groups.map((g) =>
      el(
        'div',
        { class: 'perm-group', role: 'group', 'aria-label': g },
        el('div', { class: 'perm-group-title', 'aria-hidden': 'true' }, g),
        rows.filter((r) => r.it.group === g).map((r) => r.row),
      ),
    ),
  );

  return {
    node,
    /** Việc đang khác vai trò: { more: [nhãn cấp thêm], less: [nhãn bỏ bớt] }. */
    diff: () => ({
      more: items.filter((i) => onOf(i) && !i.byRole).map((i) => i.label),
      less: items.filter((i) => !onOf(i) && i.byRole).map((i) => i.label),
    }),
    /** "Về như vai trò": mọi công tắc về mặc định (chưa lưu). */
    reset() {
      for (const r of rows) {
        touched.set(r.it.key, r.it.byRole);
        r.input.checked = r.it.byRole;
        paintRow(r);
      }
      onChange();
    },
    /** Quyền riêng cần lưu: chỉ việc khác mặc định; quyền tạm chưa chạm giữ hạn cũ (đã hết hạn lúc đang mở → bỏ). */
    grants() {
      return items
        .filter((it) => onOf(it) !== it.byRole)
        .map((it) => ({
          capability: it.key,
          effect: onOf(it) ? 'ALLOW' : 'DENY',
          expiresAt: touched.has(it.key) ? null : (saved.get(it.key)?.expiresAt ?? null),
        }))
        .filter((g) => !g.expiresAt || time(g.expiresAt) > Date.now());
    },
    /** Khác quyền riêng đang lưu? */
    changed() {
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
