// S-36 Sổ quỹ (FEATURE-033, ADR-006 D-23): thu / chi tiền mặt ngoài bán hàng theo ngày + danh mục; tổng theo danh mục (khoản đã duyệt);
// duyệt khoản chờ (khi ca còn mở); xem ảnh hóa đơn; xuất CSV. Tab "Danh mục" — thêm / sửa / ngừng dùng danh mục thu chi.
import { staffApi, staffBlobUrl } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { cashBookTable } from '../cash-book.js';
import { $, clear, el, errorMessage, modal, money, showFieldErrors, toast, todayVn } from '../ui.js';

const me = await mountAdminShell('cash');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { tab: 'book', from: addDays(todayVn(), -6), to: todayVn(), categoryId: '', status: '', direction: '', categories: [] };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['book', 'Sổ quỹ'],
    ['categories', 'Danh mục thu chi'],
  ].map(([key, label]) =>
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
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn(), 'aria-label': label });
    input.addEventListener('change', () => {
      state[key] = input.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  const select = (key, label, options) => {
    const s = el(
      'select',
      { class: 'input', 'aria-label': label },
      options.map(([v, l]) => el('option', { value: v, selected: String(state[key]) === String(v) }, l)),
    );
    s.addEventListener('change', () => {
      state[key] = s.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), s);
  };
  return el(
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
    ]),
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
    el(
      'div',
      { class: 'kpis' },
      kpi('Thu khác (đã duyệt)', money(s.totalIn)),
      kpi('Chi quỹ (đã duyệt)', money(s.totalOut)),
      kpi('Ròng', money(s.net)),
      kpi('Chờ duyệt', String(s.pending), s.pending ? 'neg' : ''),
    ),
    el(
      'div',
      { class: 'grid-2' },
      el(
        'div',
        { class: 'card' },
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
                    el('td', {}, c.name, c.isExpense ? el('span', { class: 'pill', title: 'Tính vào chi phí ở báo cáo lãi/lỗ' }, ' chi phí') : null),
                    el('td', { class: 'num' }, c.count),
                    el('td', { class: `num ${c.direction === 'OUT' ? 'neg' : ''}` }, `${c.direction === 'OUT' ? '−' : '+'}${money(c.amount)}`),
                  ),
                ),
              ),
            )
          : el('p', { class: 'muted' }, 'Chưa có khoản nào đã duyệt.'),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', {}, `Các khoản (${r.rows.length})`),
        el('p', { class: 'small muted' }, 'Khoản chờ duyệt chỉ duyệt / từ chối được khi ca của khoản đó còn mở.'),
        cashBookTable(r.rows, { user: me, editable: true, onChange: load, showDate: true }),
      ),
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
      el('span', { class: 'small muted' }, '"Chi phí" = tính vào báo cáo lãi/lỗ; "Cần duyệt" = mọi khoản chi danh mục này đều chờ trưởng ca / quản lý duyệt.'),
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
              el('td', {}, c.isExpense ? '✔' : ''),
              el('td', {}, c.requiresApproval ? '✔' : ''),
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
    el('label', { class: 'check' }, expense, 'Tính vào chi phí (lãi/lỗ)'),
    el('label', { class: 'check' }, approval, 'Luôn cần duyệt'),
    el('div', { class: 'field' }, el('label', {}, 'Thứ tự'), sort),
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

await load();
