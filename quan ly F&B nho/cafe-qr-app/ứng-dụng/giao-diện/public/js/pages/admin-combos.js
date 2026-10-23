// S-27 Combo cố định (FEATURE-015, D-9): danh sách món + số lượng, giá combo do quản lý đặt, "Tiết kiệm" = Σ giá lẻ − giá combo.
// Kho trừ theo BOM của món thành phần; combo hết khi một thành phần hết.
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, el, errorMessage, modal, money, moneyInput, moneyValue, setMoney, showFieldErrors, thumb, toast } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('combos');

const state = { combos: [], items: [] };
clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => edit(null) }, '+ Thêm combo'));

async function load() {
  try {
    [state.combos, state.items] = await Promise.all([staffApi('/api/admin/combos'), staffApi('/api/admin/menu-items')]);
    render();
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function render() {
  clear(
    $('#content'),
    state.combos.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có combo. Bấm "+ Thêm combo" (ví dụ: Cà phê + bánh giá ưu đãi).')
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
                ['Combo', 'Gồm', 'Giá lẻ', 'Giá combo', 'Tiết kiệm', 'Còn bán', 'Hiện trên menu', ''].map((h, i) =>
                  el('th', { class: i >= 2 && i <= 4 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              state.combos.map((c) =>
                el(
                  'tr',
                  {},
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row' },
                      thumb(c.name, c.imageUrl),
                      el(
                        'div',
                        {},
                        el('strong', {}, c.name),
                        c.soldOut && c.isAvailable ? el('div', { class: 'badge danger' }, 'Thiếu nguyên liệu / thành phần') : null,
                      ),
                    ),
                  ),
                  el('td', { class: 'small' }, c.components.map((k) => `${k.quantity}× ${k.name}`).join(' + ')),
                  el('td', { class: 'num' }, money(c.listTotal)),
                  el('td', { class: 'num' }, el('strong', {}, money(c.price))),
                  el('td', { class: 'num' }, c.listTotal > c.price ? money(c.listTotal - c.price) : '—'),
                  el(
                    'td',
                    {},
                    toggle(
                      c.isAvailable,
                      async (v, input) => {
                        try {
                          await staffApi(`/api/admin/combos/${c.menuItemId}/availability`, { method: 'PATCH', body: { isAvailable: v } });
                          load();
                        } catch (err) {
                          input.checked = !v;
                          toast(errorMessage(err), 'error');
                        }
                      },
                      `Còn bán ${c.name}`,
                    ),
                  ),
                  el(
                    'td',
                    {},
                    toggle(c.isActive, (v, input) => save(c.menuItemId, { ...bodyOf(c), isActive: v }, input), `Hiện ${c.name}`),
                  ),
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row' },
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => edit(c) }, 'Sửa'),
                      el(
                        'button',
                        {
                          class: 'btn btn-sm btn-danger',
                          type: 'button',
                          onclick: () => confirmAndDelete({ url: `/api/admin/menu-items/${c.menuItemId}`, label: `combo "${c.name}"`, onDone: load }),
                        },
                        'Xóa',
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
    el(
      'p',
      { class: 'muted small' },
      'Combo hiện ở mục "Combo" trên menu khách và tab Combo khi bán mang đi. Combo không nhận khuyến mãi giá đặc biệt theo món.',
    ),
  );
}

const bodyOf = (c) => ({
  name: c.name,
  price: c.price,
  imageUrl: c.imageUrl ?? '',
  isAvailable: c.isAvailable,
  isActive: c.isActive,
  components: c.components.map((k) => ({ menuItemId: k.menuItemId, quantity: k.quantity })),
});

async function save(id, body, input) {
  try {
    await staffApi(`/api/admin/combos/${id}`, { method: 'PUT', body });
    load();
  } catch (err) {
    if (input) input.checked = !input.checked;
    toast(errorMessage(err), 'error');
  }
}

function edit(combo) {
  const isNew = !combo;
  const price = moneyInput({ name: 'price', id: 'price' });
  setMoney(price, combo?.price ?? null);
  const rows = el('div');
  const listTotal = el('div', { class: 'small muted' });
  const comps = combo ? combo.components.map((k) => ({ ...k })) : [{ menuItemId: null, quantity: 1 }];
  const priceOf = (id) => state.items.find((i) => i.menuItemId === id)?.price ?? 0;
  const refresh = () => {
    const total = comps.reduce((s, k) => s + priceOf(k.menuItemId) * k.quantity, 0);
    const p = moneyValue(price) ?? 0;
    listTotal.textContent = `Tổng giá lẻ: ${money(total)}${p ? ` · khách tiết kiệm ${money(Math.max(0, total - p))}` : ''}`;
  };
  price.addEventListener('input', refresh);
  const renderRows = () => {
    clear(
      rows,
      comps.map((k, idx) =>
        el(
          'div',
          { class: 'row', style: { marginBottom: '0.4rem' } },
          el(
            'select',
            {
              class: 'input',
              'aria-label': 'Món thành phần',
              onchange: (e) => {
                k.menuItemId = Number(e.target.value) || null;
                refresh();
              },
            },
            el('option', { value: '' }, '— Chọn món —'),
            state.items.map((i) => el('option', { value: i.menuItemId, selected: i.menuItemId === k.menuItemId }, `${i.name} (${money(i.price)})`)),
          ),
          el('input', {
            class: 'input',
            type: 'number',
            min: 1,
            max: 10,
            value: k.quantity,
            style: { maxWidth: '5rem' },
            'aria-label': 'Số lượng',
            oninput: (e) => {
              k.quantity = Math.max(1, Number(e.target.value) || 1);
              refresh();
            },
          }),
          el(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': 'Bỏ dòng',
              onclick: () => {
                comps.splice(idx, 1);
                renderRows();
                refresh();
              },
            },
            icon('x'),
          ),
        ),
      ),
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: () => {
            comps.push({ menuItemId: null, quantity: 1 });
            renderRows();
          },
        },
        '+ Thêm món',
      ),
    );
  };
  renderRows();
  refresh();
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên combo'), el('input', { class: 'input', name: 'name', maxlength: 100, value: combo?.name ?? '' })),
    el('div', { class: 'field' }, el('label', {}, 'Gồm các món'), rows, listTotal),
    el('div', { class: 'field' }, el('label', { for: 'price' }, 'Giá combo (VND)'), price),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Ảnh (URL, không bắt buộc)'),
      el('input', { class: 'input', name: 'imageUrl', maxlength: 500, value: combo?.imageUrl ?? '', placeholder: 'https://… hoặc /img/…' }),
    ),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isAvailable', checked: combo?.isAvailable ?? true }), 'Còn bán'),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: combo?.isActive ?? true }), 'Hiện trên menu'),
  );
  modal({
    title: isNew ? 'Thêm combo' : `Sửa combo: ${combo.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          const body = {
            name: f('name').value,
            price: moneyValue(price) ?? -1,
            imageUrl: f('imageUrl').value,
            isAvailable: f('isAvailable').checked,
            isActive: f('isActive').checked,
            components: comps.filter((k) => k.menuItemId),
          };
          try {
            if (isNew) await staffApi('/api/admin/combos', { method: 'POST', body });
            else await staffApi(`/api/admin/combos/${combo.menuItemId}`, { method: 'PUT', body });
            toast(isNew ? 'Đã thêm combo' : 'Đã lưu combo', 'success');
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

load();
