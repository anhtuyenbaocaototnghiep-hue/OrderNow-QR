// S-23 Kho nguyên liệu: tồn kho, đang giữ cho đơn (ADR-001), khả dụng, ngưỡng sắp hết (BR-016),
// điều chỉnh tay có lý do (Q-011/ADR-003), lịch sử giao dịch kho.
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { $, clear, dateTime, el, errorMessage, modal, num, setBusy, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('ingredients');

clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editIngredient(null) }, '+ Thêm nguyên liệu'));

async function load() {
  let list;
  try {
    list = await staffApi('/api/admin/ingredients');
  } catch (err) {
    return clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  const low = list.filter((i) => i.isActive && i.isLow);
  clear(
    $('#content'),
    low.length ? el('div', { class: 'alert warning' }, `Sắp hết: ${low.map((i) => `${i.name} (còn ${num(i.available)} ${i.unit})`).join(', ')}`) : null,
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có nguyên liệu nào.')
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
                ['Nguyên liệu', 'Tồn kho', 'Đang giữ cho đơn', 'Khả dụng', 'Ngưỡng cảnh báo', 'Trạng thái', ''].map((h, i) =>
                  el('th', { class: i >= 1 && i <= 4 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              list.map((i) =>
                el(
                  'tr',
                  { style: { opacity: i.isActive ? 1 : 0.55 } },
                  el('td', {}, el('strong', {}, i.name), el('div', { class: 'muted small' }, `Đơn vị: ${i.unit} · dùng trong ${i.usedIn} món`)),
                  el('td', { class: 'num' }, num(i.stockQty)),
                  el('td', { class: 'num' }, num(i.reservedQty)),
                  el('td', { class: 'num' }, el('strong', {}, num(i.available))),
                  el('td', { class: 'num' }, num(i.lowStockThreshold)),
                  el(
                    'td',
                    {},
                    !i.isActive
                      ? el('span', { class: 'badge' }, 'Ngừng dùng')
                      : i.isLow
                        ? el('span', { class: 'badge danger' }, 'Sắp hết')
                        : el('span', { class: 'badge ok' }, 'Đủ'),
                  ),
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row wrap' },
                      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => adjust(i) }, 'Điều chỉnh'),
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => history(i) }, 'Lịch sử'),
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editIngredient(i) }, 'Sửa'),
                      el(
                        'button',
                        {
                          class: 'btn btn-sm btn-danger',
                          type: 'button',
                          'aria-label': `Xóa ${i.name}`,
                          onclick: () =>
                            confirmAndDelete({
                              url: `/api/admin/ingredients/${i.ingredientId}`,
                              label: `nguyên liệu "${i.name}"`,
                              warning: 'Chỉ xóa được khi không còn món nào dùng nguyên liệu này trong định lượng.',
                              onDone: load,
                            }),
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
      '"Đang giữ cho đơn" là phần đã được đơn chưa hoàn tất giữ chỗ; tồn kho chỉ bị trừ thật khi quầy bấm Hoàn tất. Không thể điều chỉnh tồn kho thấp hơn phần đang giữ.',
    ),
  );
}

function editIngredient(i) {
  const isNew = !i;
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên nguyên liệu'), el('input', { class: 'input', name: 'name', maxlength: 100, value: i?.name ?? '' })),
    el('div', { class: 'field' }, el('label', {}, 'Đơn vị (ml, g, cái…)'), el('input', { class: 'input', name: 'unit', maxlength: 10, value: i?.unit ?? '' })),
    isNew
      ? el('div', { class: 'field' }, el('label', {}, 'Tồn kho ban đầu'), el('input', { class: 'input', name: 'stockQty', inputmode: 'decimal', value: '0' }))
      : null,
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Ngưỡng cảnh báo sắp hết'),
      el('input', { class: 'input', name: 'lowStockThreshold', inputmode: 'decimal', value: i?.lowStockThreshold ?? '0' }),
    ),
    isNew ? null : el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: i.isActive }), 'Đang sử dụng'),
  );
  const f = (n) => form.elements.namedItem(n);
  modal({
    title: isNew ? 'Thêm nguyên liệu' : `Sửa: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async (_c, e) => {
          setBusy(e.currentTarget, true);
          const decimal = (n) => String(f(n).value).replace(',', '.').trim();
          try {
            if (isNew)
              await staffApi('/api/admin/ingredients', {
                method: 'POST',
                body: { name: f('name').value, unit: f('unit').value, stockQty: decimal('stockQty'), lowStockThreshold: decimal('lowStockThreshold') },
              });
            else
              await staffApi(`/api/admin/ingredients/${i.ingredientId}`, {
                method: 'PUT',
                body: { name: f('name').value, unit: f('unit').value, lowStockThreshold: decimal('lowStockThreshold'), isActive: f('isActive').checked },
              });
            toast('Đã lưu nguyên liệu', 'success');
            load();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error');
            return false;
          }
        },
      },
    ],
  });
}

function adjust(i) {
  const mode = el(
    'select',
    { class: 'input', name: 'mode' },
    el('option', { value: 'newQty' }, 'Đặt số tồn mới (kiểm kê)'),
    el('option', { value: 'delta' }, 'Cộng / trừ (nhập thêm, hao hụt…)'),
  );
  const qty = el('input', { class: 'input', name: 'newQty', inputmode: 'decimal', placeholder: `Ví dụ: ${num(i.stockQty)}` });
  const reason = el('input', { class: 'input', name: 'reason', maxlength: 200, placeholder: 'Ví dụ: Kiểm kê cuối ngày, nhập thêm hàng, đổ vỡ…' });
  const hint = el('div', { class: 'muted small' });
  const updateHint = () => {
    qty.name = mode.value;
    hint.textContent =
      mode.value === 'delta'
        ? 'Số dương = nhập thêm, số âm = giảm (ví dụ -50).'
        : `Tồn hiện tại ${num(i.stockQty)} ${i.unit}; đang giữ cho đơn ${num(i.reservedQty)} ${i.unit}.`;
  };
  mode.addEventListener('change', updateHint);
  updateHint();
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Cách điều chỉnh'), mode),
    el('div', { class: 'field' }, el('label', {}, `Số lượng (${i.unit})`), qty, hint),
    el('div', { class: 'field' }, el('label', {}, 'Lý do'), reason),
  );
  modal({
    title: `Điều chỉnh kho: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu điều chỉnh',
        class: 'btn-primary',
        onClick: async (_c, e) => {
          const value = String(qty.value).replace(',', '.').trim();
          if (value === '' || Number.isNaN(Number(value))) {
            qty.classList.add('invalid');
            toast('Nhập số lượng hợp lệ', 'error');
            return false;
          }
          setBusy(e.currentTarget, true);
          try {
            const r = await staffApi(`/api/admin/ingredients/${i.ingredientId}/adjust`, {
              method: 'POST',
              body: { [mode.value]: Number(value), reason: reason.value },
            });
            toast(`Đã điều chỉnh: ${r.name} còn ${num(r.stockQty)} ${r.unit}`, 'success');
            load();
          } catch (err) {
            setBusy(e.currentTarget, false);
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 5000);
            return false;
          }
        },
      },
    ],
  });
}

async function history(i) {
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  modal({ title: `Lịch sử kho: ${i.name}`, drawer: true, body });
  try {
    const { transactions } = await staffApi(`/api/admin/ingredients/${i.ingredientId}/transactions`);
    const label = { DEDUCT: 'Trừ theo đơn', ADJUST: 'Điều chỉnh', IMPORT: 'Nhập kho' };
    clear(
      body,
      transactions.length === 0
        ? el('p', { class: 'muted' }, 'Chưa có giao dịch.')
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
                  ['Thời gian', 'Loại', 'Thay đổi', 'Còn lại', 'Ghi chú'].map((h, k) => el('th', { class: k === 2 || k === 3 ? 'num' : '' }, h)),
                ),
              ),
              el(
                'tbody',
                {},
                transactions.map((t) =>
                  el(
                    'tr',
                    {},
                    el('td', { class: 'nowrap small' }, dateTime(t.createdAt)),
                    el('td', {}, label[t.type] ?? t.type),
                    el(
                      'td',
                      { class: 'num', style: { color: t.delta < 0 ? 'var(--c-danger)' : 'var(--c-success)' } },
                      `${t.delta > 0 ? '+' : ''}${num(t.delta)}`,
                    ),
                    el('td', { class: 'num' }, num(t.balanceAfter)),
                    el('td', { class: 'small' }, t.order ? `Đơn #${t.order.orderCode}` : (t.reason ?? ''), t.createdBy ? ` · ${t.createdBy}` : ''),
                  ),
                ),
              ),
            ),
          ),
    );
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

load();
