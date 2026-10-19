// S-29 Gợi ý & ghim (FEATURE-017, D-11): món ghim (thứ tự + nhãn) đứng trước, sau đó là top bán chạy N ngày (cache 15 phút);
// chế độ AUTO / PINNED / BOTH; ẩn món khỏi gợi ý; xem bảng top 20 thực tế.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, num, toast } from '../ui.js';

await mountAdminShell('suggestions');

const state = { data: null, pins: [], hidden: new Set() };

async function load() {
  try {
    state.data = await staffApi('/api/admin/suggestions');
    state.pins = state.data.items
      .filter((i) => i.isPinned)
      .sort((a, b) => (a.pinOrder ?? 99) - (b.pinOrder ?? 99))
      .map((i) => ({ menuItemId: i.menuItemId, label: i.pinLabel ?? '' }));
    state.hidden = new Set(state.data.items.filter((i) => i.hideFromSuggestions).map((i) => i.menuItemId));
    render();
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const nameOf = (id) => state.data.items.find((i) => i.menuItemId === id)?.name ?? `#${id}`;

function render() {
  const d = state.data;
  const mode = el(
    'select',
    { class: 'input', style: { width: 'auto' } },
    [
      ['BOTH', 'Ghim + bán chạy'],
      ['PINNED', 'Chỉ món ghim'],
      ['AUTO', 'Chỉ bán chạy tự động'],
    ].map(([v, l]) => el('option', { value: v, selected: v === d.mode }, l)),
  );
  const topN = el('input', { class: 'input', type: 'number', min: 1, max: 20, value: d.topN, style: { width: '5rem' } });
  const windowDays = el('input', { class: 'input', type: 'number', min: 1, max: 90, value: d.windowDays, style: { width: '5rem' } });
  const addSel = el(
    'select',
    { class: 'input' },
    el('option', { value: '' }, '— Chọn món để ghim —'),
    d.items
      .filter((i) => i.isActive && !state.pins.some((p) => p.menuItemId === i.menuItemId))
      .map((i) => el('option', { value: i.menuItemId }, `${i.name}${i.itemType === 'COMBO' ? ' (combo)' : ''}`)),
  );
  const move = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= state.pins.length) return;
    [state.pins[idx], state.pins[j]] = [state.pins[j], state.pins[idx]];
    render();
  };
  clear(
    $('#content'),
    el(
      'div',
      { class: 'grid-2', style: { gridTemplateColumns: '1.2fr 1fr' } },
      el(
        'div',
        { class: 'stack' },
        el(
          'div',
          { class: 'card' },
          el('h2', { style: { fontSize: '1rem' } }, 'Cách hiển thị mục "Gợi ý" trên menu khách'),
          el(
            'div',
            { class: 'filters' },
            el('div', { class: 'field' }, el('label', {}, 'Chế độ'), mode),
            el('div', { class: 'field' }, el('label', {}, 'Số món bán chạy'), topN),
            el('div', { class: 'field' }, el('label', {}, 'Tính trong (ngày)'), windowDays),
          ),
        ),
        el(
          'div',
          { class: 'card' },
          el('h2', { style: { fontSize: '1rem' } }, 'Món ghim (hiện trước, theo thứ tự)'),
          state.pins.length === 0 ? el('p', { class: 'muted' }, 'Chưa ghim món nào.') : null,
          state.pins.map((p, idx) =>
            el(
              'div',
              { class: 'row', style: { marginBottom: '0.4rem' } },
              el('span', { class: 'rank' }, idx + 1),
              el('strong', { class: 'grow' }, nameOf(p.menuItemId)),
              el('input', {
                class: 'input',
                maxlength: 30,
                placeholder: 'Nhãn (mặc định "Quán gợi ý")',
                value: p.label,
                style: { maxWidth: '14rem' },
                oninput: (e) => (p.label = e.target.value),
              }),
              el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Lên', onclick: () => move(idx, -1) }, '↑'),
              el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Xuống', onclick: () => move(idx, 1) }, '↓'),
              el(
                'button',
                {
                  class: 'btn btn-sm btn-ghost',
                  type: 'button',
                  'aria-label': 'Bỏ ghim',
                  onclick: () => {
                    state.pins.splice(idx, 1);
                    render();
                  },
                },
                '×',
              ),
            ),
          ),
          el(
            'div',
            { class: 'row', style: { marginTop: '0.5rem' } },
            addSel,
            el(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => {
                  if (!addSel.value) return;
                  state.pins.push({ menuItemId: Number(addSel.value), label: '' });
                  render();
                },
              },
              'Ghim',
            ),
          ),
        ),
        el(
          'div',
          { class: 'card' },
          el('h2', { style: { fontSize: '1rem' } }, 'Ẩn khỏi gợi ý tự động'),
          el(
            'div',
            { class: 'check-list' },
            d.items.map((i) =>
              el(
                'label',
                {},
                el('input', {
                  type: 'checkbox',
                  checked: state.hidden.has(i.menuItemId),
                  onchange: (e) => (e.target.checked ? state.hidden.add(i.menuItemId) : state.hidden.delete(i.menuItemId)),
                }),
                i.name,
              ),
            ),
          ),
        ),
        el(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            onclick: async () => {
              try {
                state.data = await staffApi('/api/admin/suggestions', {
                  method: 'PUT',
                  body: {
                    mode: mode.value,
                    topN: Number(topN.value),
                    windowDays: Number(windowDays.value),
                    pins: state.pins.map((p) => ({ menuItemId: p.menuItemId, label: p.label.trim() || null })),
                    hidden: [...state.hidden],
                  },
                });
                toast('Đã lưu gợi ý — menu khách cập nhật ngay', 'success');
                load();
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
            },
          },
          'Lưu',
        ),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', { style: { fontSize: '1rem' } }, `Bán chạy thực tế (${d.windowDays} ngày, đơn đã thu)`),
        d.top.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có dữ liệu bán.')
          : el(
              'table',
              { class: 'table' },
              el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Món'), el('th', { class: 'num' }, 'SL'))),
              el(
                'tbody',
                {},
                d.top.map((t, i) =>
                  el(
                    'tr',
                    {},
                    el('td', {}, i + 1),
                    el('td', {}, t.name, state.hidden.has(t.menuItemId) ? el('span', { class: 'pill off' }, 'ẩn') : null),
                    el('td', { class: 'num' }, num(t.qty)),
                  ),
                ),
              ),
            ),
        el('p', { class: 'small muted' }, 'Số liệu tính lại tối đa 15 phút/lần.'),
      ),
    ),
  );
}

load();
