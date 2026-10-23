// SCR-46 Tra cứu API (FEATURE-052, ADR-011 D-49…D-51): mọi endpoint /api đang chạy, đọc từ router lúc chạy — method, đường dẫn,
// quyền theo middleware; mở một dòng để xem request / response / mã lỗi ghép từ api-contract.md. Chỉ đọc: không gọi thử API.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, toast } from '../ui.js';

await mountAdminShell('api-docs');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const AREAS = { GUEST: 'Khách', POS: 'Quầy', ADMIN: 'Quản lý' };
const ACCESS = {
  PUBLIC: { label: 'Công khai', badge: '', hint: 'Không cần đăng nhập (khách dùng cookie cf_client)' },
  CLIENT_OR_STAFF: { label: 'Khách hoặc quầy', badge: 'preparing', hint: 'Khách dùng cookie; quầy gửi kèm Bearer để xem rộng hơn' },
  STAFF: { label: 'Nhân viên', badge: 'ok', hint: 'Mọi tài khoản quầy' },
  MANAGER: { label: 'Trưởng ca', badge: 'pending', hint: 'Trưởng ca hoặc quản lý' },
  ADMIN: { label: 'Quản lý', badge: 'primary', hint: 'Chỉ quản lý' },
};
const ROLE_NAMES = { STAFF: 'nhân viên', MANAGER: 'trưởng ca', ADMIN: 'quản lý' };
const PURPOSE_FIELDS = ['Mục đích', 'Ghi chú', 'Kết quả']; // cột dùng làm dòng tóm tắt, theo thứ tự ưu tiên

/** Bỏ dấu tiếng Việt: gõ "thu tien" cũng ra "thu tiền". */
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
/** Markdown của api-contract → chữ thường (bỏ **, link giữ chữ). */
const plain = (s) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
/** Markdown của api-contract → node: `code` thành <code>, còn lại là chữ (không innerHTML). */
const rich = (s) =>
  plain(s)
    .split('`')
    .map((part, i) => (i % 2 ? el('code', {}, part) : part));

const filters = { q: '', method: '', access: '', area: '' };
const list = el('div', { class: 'api-list' });
const count = el('p', { class: 'small muted api-count', role: 'status', 'aria-live': 'polite' });
const rows = [];
const sections = [];

try {
  render(await staffApi('/api/admin/api-docs'));
} catch (err) {
  clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
}

function render(data) {
  const select = (key, label, options) =>
    el(
      'div',
      { class: 'field' },
      el('label', {}, label),
      el(
        'select',
        { class: 'input', onchange: (e) => setFilter(key, e.target.value) },
        el('option', { value: '' }, 'Tất cả'),
        options.map(([value, text]) => el('option', { value }, text)),
      ),
    );
  clear(
    $('#content'),
    el(
      'p',
      { class: 'small muted api-intro' },
      `${data.total} endpoint đang chạy trên server này, đọc trực tiếp từ code. ${data.contract.documented} endpoint có mô tả request / response / mã lỗi lấy từ `,
      el('code', {}, data.contract.file),
      '. Bấm vào một dòng để xem chi tiết.',
    ),
    data.contract.found ? null : el('div', { class: 'alert warning' }, `Không đọc được ${data.contract.file} — trang chỉ hiện danh sách, chưa có mô tả.`),
    el(
      'p',
      { class: 'small muted api-intro' },
      'Gọi API của quầy / quản lý: đăng nhập bằng ',
      el('code', {}, 'POST /api/auth/login'),
      ' → nhận ',
      el('code', {}, 'accessToken'),
      ' → gửi kèm ',
      el('code', {}, 'Authorization: Bearer <token>'),
      '. Khách không đăng nhập: server tự cấp cookie ',
      el('code', {}, 'cf_client'),
      '. Lỗi luôn có dạng ',
      el('code', {}, '{ code, message, details }'),
      '. Quyền ghi ở đây là lớp chặn đầu tiên; một số thao tác còn kiểm thêm trong server (ví dụ duyệt khoản chi lớn, hạn mức giảm giá, hoàn tiền cần tài khoản trưởng ca / quản lý).',
    ),
    el(
      'div',
      { class: 'filters' },
      el(
        'div',
        { class: 'field api-search' },
        el('label', {}, 'Tìm'),
        el('input', {
          class: 'input',
          type: 'search',
          placeholder: 'Đường dẫn, chức năng, mã lỗi…',
          autocomplete: 'off',
          oninput: (e) => setFilter('q', e.target.value),
        }),
      ),
      select(
        'method',
        'Method',
        METHODS.map((m) => [m, m]),
      ),
      select(
        'access',
        'Quyền',
        Object.entries(ACCESS).map(([k, v]) => [k, v.label]),
      ),
      select(
        'area',
        'Khu vực',
        Object.entries(AREAS).map(([k, v]) => [k, v]),
      ),
    ),
    count,
    list,
  );

  for (const [area, areaName] of Object.entries(AREAS)) {
    const inArea = data.endpoints.filter((e) => e.area === area);
    if (!inArea.length) continue;
    const head = el('h2', { class: 'api-area-title' }, areaName, ' ', el('span', { class: 'muted small' }));
    const section = el('section', { class: 'api-area', 'aria-label': `API khu vực ${areaName}` }, head);
    const resources = [...new Set(inArea.map((e) => e.resource))];
    for (const resource of resources) {
      const items = inArea.filter((e) => e.resource === resource).map(endpointRow);
      const group = el(
        'div',
        { class: 'api-resource' },
        el('h3', {}, el('code', {}, `/api${resource}`)),
        el(
          'div',
          { class: 'card api-eps' },
          items.map((r) => r.node),
        ),
      );
      for (const r of items) r.group = group;
      section.append(group);
    }
    sections.push({ section, head });
    list.append(section);
  }
  applyFilters();
}

function endpointRow(e) {
  const access = ACCESS[e.access];
  const fields = e.contract.flatMap((c) => c.fields);
  const purpose = PURPOSE_FIELDS.map((name) => fields.find(([n]) => n === name)?.[1]).find(Boolean) ?? '';
  const node = el(
    'details',
    { class: 'api-ep' },
    el(
      'summary',
      {},
      el('span', { class: 'api-method', dataset: { method: e.method } }, e.method),
      el('code', { class: 'api-path' }, e.path),
      el('span', { class: `badge ${access.badge}`, title: access.hint }, access.label),
      purpose ? el('span', { class: 'api-purpose' }, plain(purpose).replace(/`/g, '')) : null,
    ),
  );
  node.addEventListener('toggle', () => {
    if (node.open && !node.dataset.built) buildDetail(node, e);
  });
  const text = [e.method, e.path, e.resource, access.label, e.permission ?? '', ...e.contract.flatMap((c) => [c.section, ...c.fields.flat()])].join(' ');
  const row = { e, node, hay: fold(text) };
  rows.push(row);
  return row;
}

function buildDetail(node, e) {
  node.dataset.built = '1';
  const access = ACCESS[e.access];
  const who = e.roles.length ? `(${e.roles.map((r) => ROLE_NAMES[r]).join(', ')})` : `— ${access.hint.toLowerCase()}`;
  const curl = curlFor(e);
  node.append(
    el(
      'div',
      { class: 'api-detail' },
      e.contract.length
        ? e.contract.map((c) =>
            el(
              'div',
              { class: 'api-contract' },
              el('p', { class: 'small muted' }, `api-contract.md · ${c.section}`),
              el(
                'dl',
                { class: 'api-fields' },
                c.fields.map(([name, value]) => [el('dt', {}, name), el('dd', {}, rich(value))]),
              ),
            ),
          )
        : el('p', { class: 'muted' }, 'Chưa có mô tả trong api-contract.md.'),
      el('p', { class: 'small' }, `Quyền: ${access.label} ${who}`, e.permission ? [' · quyền ', el('code', {}, e.permission)] : null),
      el(
        'div',
        { class: 'api-actions' },
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(curl);
                toast('Đã chép lệnh curl', 'success');
              } catch {
                toast('Trình duyệt không cho chép tự động — hãy bôi đen lệnh bên dưới và chép tay', 'warning');
              }
            },
          },
          'Sao chép lệnh curl',
        ),
      ),
      el('pre', { class: 'api-curl' }, el('code', {}, curl)),
    ),
  );
}

function curlFor(e) {
  const parts = [`curl -X ${e.method} "${location.origin}${e.path}"`];
  if (e.roles.length) parts.push('-H "Authorization: Bearer <token>"');
  if (['POST', 'PUT', 'PATCH'].includes(e.method)) parts.push('-H "Content-Type: application/json" -d "{}"');
  return parts.join(' ');
}

function setFilter(key, value) {
  filters[key] = value;
  applyFilters();
}

function applyFilters() {
  const terms = fold(filters.q).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const r of rows) {
    const ok =
      (!filters.method || r.e.method === filters.method) &&
      (!filters.access || r.e.access === filters.access) &&
      (!filters.area || r.e.area === filters.area) &&
      terms.every((t) => r.hay.includes(t));
    r.node.hidden = !ok;
    if (ok) shown++;
  }
  for (const group of new Set(rows.map((r) => r.group))) group.hidden = !group.querySelector('.api-ep:not([hidden])');
  for (const { section, head } of sections) {
    const n = section.querySelectorAll('.api-ep:not([hidden])').length;
    section.hidden = n === 0;
    head.lastChild.textContent = `${n} endpoint`;
  }
  count.textContent =
    shown === rows.length ? `${rows.length} endpoint` : shown ? `Đang hiện ${shown} / ${rows.length} endpoint` : 'Không có endpoint nào khớp bộ lọc.';
}
