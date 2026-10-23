// S-30 Nhóm tùy chọn món (FEATURE-013, D-13): Size, Đường, Đá, Topping… dùng chung cho nhiều món.
// Mỗi tùy chọn có phụ thu và định lượng cộng thêm (trừ kho khi hoàn tất). Gán nhóm cho món ở trang Thực đơn (Sửa món).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, confirmDialog, el, errorMessage, modal, money, toast } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('modifiers');

const state = { groups: [], ingredients: [] };
clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => edit(null) }, '+ Thêm nhóm tùy chọn'));

async function load() {
  try {
    [state.groups, state.ingredients] = await Promise.all([staffApi('/api/admin/modifier-groups'), staffApi('/api/admin/ingredients')]);
    render();
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const rule = (g) =>
  g.minSelect > 0
    ? g.maxSelect === 1
      ? 'Bắt buộc chọn 1'
      : `Chọn ${g.minSelect}–${g.maxSelect}`
    : g.maxSelect === 1
      ? 'Không bắt buộc, chọn 1'
      : `Tối đa ${g.maxSelect}`;

function render() {
  clear(
    $('#content'),
    state.groups.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có nhóm tùy chọn. Ví dụ: "Size" (M mặc định, L +5.000đ thêm 20 ml cà phê), "Topping" (tối đa 2).')
      : el(
          'div',
          { class: 'grid-2', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' } },
          state.groups.map((g) =>
            el(
              'div',
              { class: 'card' },
              el('div', { class: 'row between' }, el('h2', { style: { fontSize: '1.05rem', margin: 0 } }, g.name), el('span', { class: 'pill' }, rule(g))),
              el('p', { class: 'small muted' }, `Đang gán cho ${g.itemCount} món`),
              el(
                'ul',
                {},
                g.options.map((o) =>
                  el(
                    'li',
                    {},
                    el('strong', {}, o.name),
                    o.priceDelta ? ` +${money(o.priceDelta)}` : '',
                    o.isDefault ? el('span', { class: 'pill on' }, 'mặc định') : null,
                    o.isActive ? null : el('span', { class: 'pill off' }, 'tắt'),
                    o.bom.length ? el('div', { class: 'small muted' }, `+ ${o.bom.map((b) => `${b.amount} ${b.unit} ${b.name}`).join(', ')}`) : null,
                  ),
                ),
              ),
              el(
                'div',
                { class: 'row' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(g) }, 'Sửa'),
                el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => remove(g) }, 'Xóa'),
              ),
            ),
          ),
        ),
    el('p', { class: 'muted small' }, 'Món có nhóm bắt buộc mà mọi nhóm đều có tùy chọn mặc định vẫn thêm vào giỏ bằng 1 chạm; khách đổi tùy chọn khi cần.'),
  );
}

async function remove(g) {
  if (!(await confirmDialog(`Xóa nhóm "${g.name}"?`, 'Nhóm sẽ được gỡ khỏi mọi món. Đơn cũ vẫn giữ tên tùy chọn đã chọn.', { okLabel: 'Xóa', danger: true })))
    return;
  try {
    await staffApi(`/api/admin/modifier-groups/${g.groupId}`, { method: 'DELETE' });
    toast('Đã xóa nhóm tùy chọn', 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

function edit(g) {
  const isNew = !g;
  const opts = g
    ? g.options.map((o) => ({ ...o, bom: o.bom.map((b) => ({ ingredientId: b.ingredientId, amount: b.amount })) }))
    : [{ name: '', priceDelta: 0, isDefault: true, isActive: true, bom: [] }];
  const name = el('input', { class: 'input', value: g?.name ?? '', maxlength: 50, placeholder: 'Size, Đường, Đá, Topping…' });
  const min = el('input', { class: 'input', type: 'number', min: 0, max: 20, value: g?.minSelect ?? 1 });
  const max = el('input', { class: 'input', type: 'number', min: 1, max: 20, value: g?.maxSelect ?? 1 });
  const list = el('div');
  const ingSelect = (value, onchange) =>
    el(
      'select',
      { class: 'input', onchange, 'aria-label': 'Nguyên liệu' },
      el('option', { value: '' }, '— Nguyên liệu —'),
      state.ingredients.map((i) => el('option', { value: i.ingredientId, selected: i.ingredientId === value }, `${i.name} (${i.unit})`)),
    );
  const renderList = () =>
    clear(
      list,
      opts.map((o, idx) =>
        el(
          'div',
          { class: 'opt-card' },
          el(
            'div',
            { class: 'sub-row' },
            el('input', {
              class: 'input',
              value: o.name,
              maxlength: 50,
              placeholder: 'Tên tùy chọn (Size L…)',
              'aria-label': 'Tên tùy chọn',
              oninput: (e) => (o.name = e.target.value),
            }),
            el('input', {
              class: 'input',
              type: 'number',
              min: 0,
              step: 1000,
              value: o.priceDelta,
              'aria-label': 'Phụ thu',
              title: 'Phụ thu (đ)',
              oninput: (e) => (o.priceDelta = Number(e.target.value) || 0),
            }),
            el(
              'label',
              { class: 'check' },
              el('input', { type: 'checkbox', checked: o.isDefault, onchange: (e) => (o.isDefault = e.target.checked) }),
              'Mặc định',
            ),
            el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: o.isActive, onchange: (e) => (o.isActive = e.target.checked) }), 'Bật'),
            el(
              'button',
              {
                class: 'btn btn-sm btn-ghost',
                type: 'button',
                'aria-label': 'Bỏ tùy chọn',
                onclick: () => {
                  opts.splice(idx, 1);
                  renderList();
                },
              },
              icon('x'),
            ),
          ),
          o.bom.map((b, bi) =>
            el(
              'div',
              { class: 'bom-mini' },
              ingSelect(b.ingredientId, (e) => (b.ingredientId = Number(e.target.value) || null)),
              el('input', {
                class: 'input',
                type: 'number',
                min: 0,
                step: 'any',
                value: b.amount,
                'aria-label': 'Định lượng thêm',
                oninput: (e) => (b.amount = Number(e.target.value)),
              }),
              el(
                'button',
                {
                  class: 'btn btn-sm btn-ghost',
                  type: 'button',
                  'aria-label': 'Bỏ dòng',
                  onclick: () => {
                    o.bom.splice(bi, 1);
                    renderList();
                  },
                },
                icon('x'),
              ),
            ),
          ),
          el(
            'button',
            {
              class: 'link-btn small',
              type: 'button',
              onclick: () => {
                o.bom.push({ ingredientId: null, amount: '' });
                renderList();
              },
            },
            '+ định lượng cộng thêm',
          ),
        ),
      ),
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: () => {
            opts.push({ name: '', priceDelta: 0, isDefault: false, isActive: true, bom: [] });
            renderList();
          },
        },
        '+ Thêm tùy chọn',
      ),
    );
  renderList();
  modal({
    title: isNew ? 'Thêm nhóm tùy chọn' : `Sửa nhóm: ${g.name}`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Tên nhóm'), name),
        el('div', { class: 'field' }, el('label', {}, 'Chọn tối thiểu (0 = không bắt buộc)'), min),
        el('div', { class: 'field' }, el('label', {}, 'Chọn tối đa'), max),
      ),
      el('label', {}, 'Tùy chọn (phụ thu đ · định lượng cộng thêm trừ kho khi hoàn tất)'),
      list,
    ),
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const body = {
            name: name.value,
            minSelect: Number(min.value),
            maxSelect: Number(max.value),
            sortOrder: g?.sortOrder ?? state.groups.length + 1,
            options: opts.map((o) => ({
              optionId: o.optionId ?? null,
              name: o.name,
              priceDelta: o.priceDelta,
              isDefault: o.isDefault,
              isActive: o.isActive,
              bom: o.bom.filter((b) => b.ingredientId).map((b) => ({ ingredientId: b.ingredientId, amount: Number(b.amount) })),
            })),
          };
          try {
            if (isNew) await staffApi('/api/admin/modifier-groups', { method: 'POST', body });
            else await staffApi(`/api/admin/modifier-groups/${g.groupId}`, { method: 'PUT', body });
            toast('Đã lưu nhóm tùy chọn', 'success');
            load();
          } catch (err) {
            toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

load();
