// S-36 Sổ quỹ (FEATURE-033, ADR-006 D-23): thu / chi tiền mặt ngoài bán hàng theo ngày + danh mục; tổng theo danh mục (khoản đã duyệt);
// duyệt khoản chờ (khi ca còn mở); xem ảnh hóa đơn; xuất CSV. Tab "Danh mục" — thêm / sửa / ngừng dùng danh mục thu chi.
// TASK-081 (dễ dùng): nút chọn kỳ nhanh, "Lọc thêm" thu gọn, dải "Có n khoản chờ duyệt", ghi khoản ngay ở trang này khi có ca đang mở.
import { staffApi, staffBlobUrl } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { cashBookTable, cashEntryDialog } from '../cash-book.js';
import { $, clear, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';
import { icon } from '../icons.js';

const me = await mountAdminShell('cash');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const PRESETS = [
  ['today', 'Hôm nay'],
  ['7d', '7 ngày'],
  ['month', 'Tháng này'],
  ['lastMonth', 'Tháng trước'],
];
function rangeOf(key) {
  const t = todayVn();
  if (key === 'today') return [t, t];
  if (key === 'month') return [`${t.slice(0, 8)}01`, t];
  if (key === 'lastMonth') {
    const end = addDays(`${t.slice(0, 8)}01`, -1);
    return [`${end.slice(0, 8)}01`, end];
  }
  return [addDays(t, -6), t];
}
const state = { tab: 'book', preset: '7d', from: addDays(todayVn(), -6), to: todayVn(), categoryId: '', status: '', direction: '', categories: [] };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['book', 'Sổ quỹ'],
    ['categories', 'Danh mục thu chi'],
  ]
    .filter(([key]) => key !== 'categories' || me.role === 'ADMIN') // F-077: danh mục (tính vào lãi / lỗ, cần duyệt) — chủ quán
    .map(([key, label]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': String(state.tab === key),
          onclick: (e) => {
            state.tab = key;
            tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
            load();
          },
        },
        label,
      ),
    ),
);
clear($('#content'), tabs, body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    state.categories = await staffApi('/api/admin/cash-categories');
    if (state.tab === 'categories') renderCategories();
    else await renderBook();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const query = () =>
  new URLSearchParams(
    Object.entries({ from: state.from, to: state.to, categoryId: state.categoryId, status: state.status, direction: state.direction }).filter(([, v]) => v),
  ).toString();

function filters() {
  const date = (key, label) => {
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn() });
    input.addEventListener('change', () => {
      if (!input.value) return;
      state[key] = input.value;
      state.preset = '';
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  const select = (key, label, options) => {
    const s = el(
      'select',
      { class: 'input' },
      options.map(([v, l]) => el('option', { value: v, selected: String(state[key]) === String(v) }, l)),
    );
    s.addEventListener('change', () => {
      state[key] = s.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), s);
  };
  const extra = [state.direction, state.categoryId, state.status].filter(Boolean).length;
  return el(
    'div',
    { class: 'cash-filters' },
    el(
      'div',
      { class: 'row wrap', role: 'group', 'aria-label': 'Chọn khoảng thời gian' },
      PRESETS.map(([key, label]) =>
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            'aria-pressed': String(state.preset === key),
            onclick: () => {
              [state.from, state.to] = rangeOf(key);
              state.preset = key;
              load();
            },
          },
          label,
        ),
      ),
    ),
    el(
      'details',
      { class: 'cash-more', open: !state.preset || extra > 0 },
      el('summary', {}, extra ? `Lọc thêm (${extra})` : 'Lọc thêm'),
      el(
        'div',
        { class: 'filters' },
        date('from', 'Từ ngày'),
        date('to', 'Đến ngày'),
        select('direction', 'Loại', [
          ['', 'Tất cả'],
          ['OUT', 'Chi'],
          ['IN', 'Thu'],
        ]),
        select('categoryId', 'Danh mục', [['', 'Tất cả'], ...state.categories.map((c) => [c.categoryId, c.name])]),
        select('status', 'Trạng thái', [
          ['', 'Tất cả'],
          ['PENDING', 'Chờ duyệt'],
          ['APPROVED', 'Đã duyệt'],
          ['REJECTED', 'Từ chối'],
          ['VOIDED', 'Đã hủy'], // F-050
        ]),
      ),
    ),
  );
}

/** Nút trên đầu trang: ghi khoản (chỉ khi có ca đang mở — quy tắc F-033) + xuất CSV. */
async function headActions() {
  let open = false;
  try {
    open = Boolean((await staffApi('/api/shifts/current')).shift);
  } catch {
    open = false; // không đọc được ca → chỉ ẩn nút ghi khoản
  }
  const add = (direction, label, cls) =>
    el('button', { class: `btn ${cls}`, type: 'button', onclick: async () => (await cashEntryDialog(direction)) && load() }, label);
  clear(
    $('#head-actions'),
    open ? [add('OUT', 'Chi tiền', 'btn-primary'), add('IN', 'Thu thêm', '')] : el('span', { class: 'small muted' }, 'Mở ca ở màn quầy để ghi khoản'),
    el('button', { class: 'btn', type: 'button', onclick: exportCsv }, 'Xuất CSV'),
  );
}

async function exportCsv() {
  try {
    const url = await staffBlobUrl(`/api/admin/cash-transactions/export.csv?${query()}`);
    const a = el('a', { href: url, download: `so-quy_${state.from}_${state.to}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

const kpi = (label, value, cls = '') => el('div', { class: `card kpi ${cls}` }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value));

async function renderBook() {
  const r = await staffApi(`/api/admin/cash-transactions?${query()}`);
  const s = r.summary;
  clear(
    body,
    filters(),
    s.pending && state.status !== 'PENDING'
      ? el(
          'div',
          { class: 'alert warning row wrap between' },
          el('span', {}, `Có ${s.pending} khoản chờ duyệt — chưa trừ vào két tới khi duyệt.`),
          el(
            'button',
            {
              class: 'btn btn-sm',
              type: 'button',
              onclick: () => {
                state.status = 'PENDING';
                load();
              },
            },
            'Xem các khoản chờ duyệt',
          ),
        )
      : null,
    el(
      'div',
      { class: 'kpis' },
      kpi('Đã chi', money(s.totalOut)),
      kpi('Đã thu thêm', money(s.totalIn)),
      kpi('Két thay đổi', `${s.net > 0 ? '+' : s.net < 0 ? '−' : ''}${money(Math.abs(s.net))}`, s.net < 0 ? 'neg' : ''),
      kpi('Chờ duyệt', String(s.pending), s.pending ? 'neg' : ''),
    ),
    el(
      'div',
      { class: 'card' },
      el('h2', {}, `Các khoản (${r.rows.length})`),
      el('p', { class: 'small muted' }, 'Duyệt / từ chối / sửa / hủy làm được khi ca của khoản đó còn mở.'),
      cashBookTable(r.rows, { user: me, editable: true, onChange: load, showDate: true }),
    ),
    el(
      'div',
      { class: 'card', style: { marginTop: '1rem' } },
      el('h2', {}, 'Theo danh mục'),
      s.byCategory.length
        ? el(
            'table',
            { class: 'table' },
            el(
              'tbody',
              {},
              s.byCategory.map((c) =>
                el(
                  'tr',
                  {},
                  el('td', {}, c.name, c.isExpense ? el('span', { class: 'pill', title: 'Tính vào chi phí ở trang Lãi / lỗ' }, ' chi phí') : null),
                  el('td', { class: 'num' }, `${c.count} lần`),
                  el('td', { class: `num ${c.direction === 'OUT' ? 'neg' : ''}` }, `${c.direction === 'OUT' ? '−' : '+'}${money(c.amount)}`),
                ),
              ),
            ),
          )
        : el('p', { class: 'muted' }, 'Chưa có khoản nào đã duyệt.'),
    ),
  );
}

// ---------- Danh mục ----------
function renderCategories() {
  clear(
    body,
    el(
      'div',
      { class: 'row', style: { marginBottom: '1rem' } },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editCategory(null) }, '+ Thêm danh mục'),
      el(
        'span',
        { class: 'small muted' },
        '"Chi phí" = trừ vào lãi ở trang Lãi / lỗ (bỏ tích với khoản không phải chi phí, như nộp tiền về két tổng). "Cần duyệt" = mọi khoản chi danh mục này đều chờ trưởng ca / quản lý duyệt và phải ghi rõ nội dung.',
      ),
    ),
    el(
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
            ['Danh mục', 'Loại', 'Chi phí', 'Cần duyệt', 'Đang dùng', ''].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          state.categories.map((c) =>
            el(
              'tr',
              { class: c.isActive ? '' : 'muted' },
              el('td', {}, c.name),
              el('td', {}, c.direction === 'IN' ? 'Thu' : 'Chi'),
              el('td', {}, c.isExpense ? icon('check', { label: 'Có' }) : ''),
              el('td', {}, c.requiresApproval ? icon('check', { label: 'Có' }) : ''),
              el(
                'td',
                {},
                toggle(c.isActive, (on, input) => save(c, { ...c, isActive: on }).catch(() => (input.checked = !on)), `Đang dùng ${c.name}`),
              ),
              el(
                'td',
                { class: 'row' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editCategory(c) }, 'Sửa'),
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    onclick: () => confirmAndDelete({ url: `/api/admin/cash-categories/${c.categoryId}`, label: `danh mục "${c.name}"`, onDone: load }),
                  },
                  'Xóa',
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

async function save(c, body) {
  try {
    await staffApi(c ? `/api/admin/cash-categories/${c.categoryId}` : '/api/admin/cash-categories', { method: c ? 'PUT' : 'POST', body });
    toast('Đã lưu danh mục', 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
    throw err;
  }
}

function editCategory(c) {
  const name = el('input', { class: 'input', name: 'name', maxlength: 50, value: c?.name ?? '' });
  const dir = el(
    'select',
    { class: 'input', name: 'direction', disabled: Boolean(c) },
    el('option', { value: 'OUT', selected: c?.direction !== 'IN' }, 'Chi'),
    el('option', { value: 'IN', selected: c?.direction === 'IN' }, 'Thu'),
  );
  const expense = el('input', { type: 'checkbox', checked: c ? c.isExpense : true });
  const approval = el('input', { type: 'checkbox', checked: c?.requiresApproval ?? false });
  const sort = el('input', { class: 'input', name: 'sortOrder', type: 'number', min: 0, value: c?.sortOrder ?? 0 });
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên danh mục'), name),
    el('div', { class: 'field' }, el('label', {}, 'Loại'), dir),
    el('label', { class: 'check' }, expense, 'Là chi phí của quán (trừ vào lãi ở trang Lãi / lỗ)'),
    el('label', { class: 'check' }, approval, 'Khoản chi nào cũng phải duyệt (và ghi rõ nội dung)'),
    el('div', { class: 'field' }, el('label', {}, 'Thứ tự hiện (số nhỏ đứng trước)'), sort),
  );
  modal({
    title: c ? `Sửa danh mục: ${c.name}` : 'Thêm danh mục thu chi',
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const payload = {
            name: name.value.trim(),
            direction: dir.value,
            isExpense: expense.checked,
            requiresApproval: approval.checked,
            isActive: c?.isActive ?? true,
            sortOrder: Number(sort.value) || 0,
          };
          try {
            await staffApi(c ? `/api/admin/cash-categories/${c.categoryId}` : '/api/admin/cash-categories', { method: c ? 'PUT' : 'POST', body: payload });
            toast('Đã lưu danh mục', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

headActions();
await load();
