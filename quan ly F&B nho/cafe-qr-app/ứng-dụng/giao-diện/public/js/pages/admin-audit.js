// S-38 Nhật ký thao tác (FEATURE-035, ADR-006 D-26) — CHỈ ĐỌC: ai đổi tiền / kho / quyền / giá / BOM / khuyến mãi, lúc nào, trước → sau.
// Không có nút sửa / xóa (server cũng chặn sửa bằng trigger); tự xóa bản ghi quá 12 tháng.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { ROLE_LABEL } from '../attendance.js';
import { $, clear, dateTime, el, errorMessage, modal, todayVn } from '../ui.js';

await mountAdminShell('audit');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { from: addDays(todayVn(), -6), to: todayVn(), userId: '', entity: '', action: '', entityId: '', page: 1, facets: { entities: [], users: [] } };
const body = el('div');
clear($('#content'), body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    state.facets = await staffApi('/api/admin/audit-logs/facets');
    const q = new URLSearchParams(
      Object.entries({
        from: state.from,
        to: state.to,
        userId: state.userId,
        entity: state.entity,
        action: state.action,
        entityId: state.entityId,
        page: state.page,
      }).filter(([, v]) => v !== '' && v !== null),
    );
    render(await staffApi(`/api/admin/audit-logs?${q}`));
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function filters() {
  const field = (label, input, key, event = 'change') => {
    input.addEventListener(event, () => {
      state[key] = input.value.trim();
      state.page = 1;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  return el(
    'div',
    { class: 'filters' },
    field('Từ ngày', el('input', { type: 'date', class: 'input', value: state.from, max: todayVn() }), 'from'),
    field('Đến ngày', el('input', { type: 'date', class: 'input', value: state.to, max: todayVn() }), 'to'),
    field(
      'Người thao tác',
      el(
        'select',
        { class: 'input' },
        el('option', { value: '' }, 'Tất cả'),
        state.facets.users.map((u) => el('option', { value: u.userId, selected: String(u.userId) === state.userId }, u.fullName)),
      ),
      'userId',
    ),
    field(
      'Đối tượng',
      el(
        'select',
        { class: 'input' },
        el('option', { value: '' }, 'Tất cả'),
        state.facets.entities.map((e) => el('option', { value: e, selected: e === state.entity }, e)),
      ),
      'entity',
    ),
    field('Mã đối tượng', el('input', { class: 'input', value: state.entityId, placeholder: 'ví dụ 12', style: { width: '7rem' } }), 'entityId'),
    field(
      'Hành động bắt đầu bằng',
      el('input', { class: 'input', value: state.action, placeholder: 'ví dụ payment.refund', style: { width: '12rem' } }),
      'action',
    ),
  );
}

function render(r) {
  const pages = Math.max(1, Math.ceil(r.total / r.pageSize));
  clear(
    body,
    filters(),
    el('p', { class: 'small muted' }, `${r.total} dòng · nhật ký chỉ đọc, không sửa / xóa được; tự dọn bản ghi cũ hơn 12 tháng.`),
    r.rows.length === 0
      ? el('div', { class: 'empty card' }, 'Không có thao tác nào khớp bộ lọc.')
      : el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ['Thời gian', 'Người', 'Hành động', 'Đối tượng', 'IP', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              r.rows.map((a) =>
                el(
                  'tr',
                  {},
                  el('td', { class: 'nowrap' }, dateTime(a.at)),
                  el('td', {}, a.user ? [a.user.fullName, el('div', { class: 'small muted' }, ROLE_LABEL[a.user.role] ?? a.user.role ?? '')] : '—'),
                  el('td', { class: 'mono' }, a.action),
                  el('td', {}, a.entity, a.entityId ? el('span', { class: 'muted' }, ` #${a.entityId}`) : null),
                  el('td', { class: 'small mono' }, a.ip ?? ''),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => detail(a) }, 'Chi tiết')),
                ),
              ),
            ),
          ),
        ),
    pages > 1
      ? el(
          'div',
          { class: 'row', style: { marginTop: '1rem' } },
          el('button', { class: 'btn btn-sm', type: 'button', disabled: r.page <= 1, onclick: () => go(r.page - 1) }, '← Trước'),
          el('span', { class: 'small' }, `Trang ${r.page}/${pages}`),
          el('button', { class: 'btn btn-sm', type: 'button', disabled: r.page >= pages, onclick: () => go(r.page + 1) }, 'Sau →'),
        )
      : null,
  );
}

function go(page) {
  state.page = page;
  load();
}

const pretty = (v) => el('pre', { class: 'json' }, v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));

function detail(a) {
  modal({
    title: `${a.action} · ${a.entity}${a.entityId ? ` #${a.entityId}` : ''}`,
    drawer: true,
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small' }, `${dateTime(a.at)} · ${a.user?.fullName ?? '—'} · IP ${a.ip ?? '—'}`),
      a.userAgent ? el('p', { class: 'small muted' }, a.userAgent) : null,
      el('h3', {}, 'Trước'),
      pretty(a.before),
      el('h3', {}, 'Sau (dữ liệu gửi lên + kết quả)'),
      pretty(a.after),
    ),
  });
}

await load();
