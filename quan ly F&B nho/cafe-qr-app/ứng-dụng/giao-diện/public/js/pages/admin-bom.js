// S-24 Định lượng (BOM) một món: thay toàn bộ khi lưu; định lượng > 0, không trùng nguyên liệu (BR-003, AC-011-02).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, el, errorMessage, money, setBusy, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('menu');

const menuItemId = Number(location.pathname.split('/')[3]);
let ingredients = [];
let rows = [];

async function load() {
  try {
    const [bomRes, ings] = await Promise.all([staffApi(`/api/admin/menu-items/${menuItemId}/bom`), staffApi('/api/admin/ingredients')]);
    ingredients = ings.filter((i) => i.isActive || bomRes.bom.some((b) => b.ingredientId === i.ingredientId));
    rows = bomRes.bom.map((b) => ({ ingredientId: b.ingredientId, amount: String(b.amount) }));
    $('#page-title').textContent = `Định lượng: ${bomRes.item.name}`;
    document.title = `Quản lý — Định lượng ${bomRes.item.name}`;
    render(bomRes.item);
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

clear($('#head-actions'), el('a', { class: 'btn', href: '/admin/menu' }, '← Về thực đơn'));

function render(item) {
  const form = el('form', { id: 'bom-form', novalidate: true, onsubmit: save });
  const list = el('div');
  const unitOf = (id) => ingredients.find((i) => i.ingredientId === Number(id))?.unit ?? '';

  function drawRows() {
    clear(
      list,
      rows.length === 0 ? el('p', { class: 'muted' }, 'Món này chưa có nguyên liệu — hoàn tất món sẽ không trừ kho (ví dụ nước suối, bánh mua sẵn).') : null,
      rows.map((r, idx) =>
        el(
          'div',
          { class: 'bom-row' },
          el(
            'div',
            {},
            el(
              'select',
              {
                class: 'input',
                name: `${idx}.ingredientId`,
                'aria-label': 'Nguyên liệu',
                onchange: (e) => {
                  r.ingredientId = e.target.value ? Number(e.target.value) : '';
                  drawRows();
                },
              },
              el('option', { value: '' }, '— Chọn nguyên liệu —'),
              ingredients.map((i) => el('option', { value: i.ingredientId, selected: i.ingredientId === r.ingredientId }, `${i.name} (${i.unit})`)),
            ),
          ),
          el(
            'div',
            {},
            el('input', {
              class: 'input',
              name: `${idx}.amount`,
              inputmode: 'decimal',
              placeholder: 'Định lượng / 1 suất',
              value: r.amount,
              'aria-label': 'Định lượng',
              oninput: (e) => (r.amount = e.target.value),
            }),
          ),
          el('span', { class: 'muted', style: { paddingTop: '0.6rem' } }, unitOf(r.ingredientId)),
          el(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': 'Xóa dòng',
              onclick: () => {
                rows.splice(idx, 1);
                drawRows();
              },
            },
            '✕',
          ),
        ),
      ),
    );
  }

  clear(
    form,
    el(
      'p',
      { class: 'muted' },
      `Giá bán ${money(item.price)} · ${item.categoryName}. Nhập lượng nguyên liệu cho 1 suất; mỗi suất bán ra sẽ trừ đúng lượng này khi quầy bấm Hoàn tất.`,
    ),
    list,
    el(
      'div',
      { class: 'row', style: { marginTop: '0.75rem' } },
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            rows.push({ ingredientId: '', amount: '' });
            drawRows();
          },
        },
        '+ Thêm nguyên liệu',
      ),
      el('button', { class: 'btn btn-primary', type: 'submit', id: 'save' }, 'Lưu định lượng'),
    ),
    el('div', { id: 'bom-msg', style: { marginTop: '0.75rem' } }),
  );
  drawRows();
  clear(
    $('#content'),
    el('div', { class: 'card', style: { maxWidth: '760px' } }, form),
    ingredients.length === 0 ? el('div', { class: 'alert warning' }, 'Chưa có nguyên liệu nào. Hãy tạo ở trang Kho nguyên liệu.') : null,
  );

  async function save(e) {
    e.preventDefault();
    const btn = $('#save');
    setBusy(btn, true);
    clear($('#bom-msg'));
    try {
      const res = await staffApi(`/api/admin/menu-items/${menuItemId}/bom`, {
        method: 'PUT',
        body: rows.map((r) => ({ ingredientId: r.ingredientId === '' ? null : r.ingredientId, amount: String(r.amount).replace(',', '.').trim() })),
      });
      rows = res.bom.map((b) => ({ ingredientId: b.ingredientId, amount: String(b.amount) }));
      drawRows();
      toast('Đã lưu định lượng', 'success');
    } catch (err) {
      // AC-011-02: highlight ô lỗi + "Định lượng không hợp lệ, phải lớn hơn 0"; BOM cũ giữ nguyên trên server
      showFieldErrors(form, err);
      clear($('#bom-msg'), el('div', { class: 'alert danger' }, errorMessage(err)));
    } finally {
      setBusy(btn, false);
    }
  }
}

load();
