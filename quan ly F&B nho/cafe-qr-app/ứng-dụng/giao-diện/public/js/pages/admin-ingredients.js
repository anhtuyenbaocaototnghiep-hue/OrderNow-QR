// S-23 Kho nguyên liệu: tồn kho, đang giữ cho đơn (ADR-001), khả dụng, ngưỡng sắp hết (BR-016),
// điều chỉnh tay có lý do (Q-011/ADR-003), lịch sử giao dịch kho.
// ADR-006: bán thành phẩm + công thức (F-027), theo lô + hạn dùng (F-028), giá vốn bình quân (F-031), hao hụt định mức (F-032).
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { advancedDialog, costLine, ingredientBadges, lotsDialog, recipeDialog } from '../inventory-advanced.js';
import { adjustDialog } from '../stock-adjust.js';
import { $, clear, dateTime, el, errorMessage, modal, num, setBusy, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('ingredients');

clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editIngredient(null) }, '+ Thêm nguyên liệu'));

let ingredients = [];
async function load() {
  let list;
  try {
    list = await staffApi('/api/admin/ingredients');
    ingredients = list;
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
                  el(
                    'td',
                    {},
                    el('strong', {}, i.name),
                    ' ',
                    ingredientBadges(i),
                    el('div', { class: 'muted small' }, `Đơn vị: ${i.unit} · dùng trong ${i.usedIn} món`),
                    costLine(i),
                  ),
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
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => advancedDialog(i, load) }, 'Kho nâng cao'),
                      i.kind === 'SEMI'
                        ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => recipeDialog(i, ingredients, load) }, 'Công thức')
                        : null,
                      i.trackLots ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => lotsDialog(i, load) }, 'Lô') : null,
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

// Điều chỉnh tay (dùng chung với quầy cho trưởng ca — js/stock-adjust.js, F-036)
const adjust = (i) => adjustDialog(i, { url: `/api/admin/ingredients/${i.ingredientId}/adjust`, onDone: load });

// Phiếu hủy hàng ghi lý do dạng 'WASTE:<mã> — ghi chú' (F-032) → hiển thị tiếng Việt
const WASTE_REASON = { SPILL: 'Đổ / vỡ', EXPIRED: 'Hết hạn', QUALITY: 'Hỏng / không đạt', OTHER: 'Khác' };
const reasonText = (r) => (r ?? '').replace(/^WASTE:(\w+)/, (_m, code) => `Hủy hàng: ${WASTE_REASON[code] ?? code}`);

async function history(i) {
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  modal({ title: `Lịch sử kho: ${i.name}`, drawer: true, body });
  try {
    const { transactions } = await staffApi(`/api/admin/ingredients/${i.ingredientId}/transactions`);
    const label = {
      DEDUCT: 'Trừ theo đơn',
      ADJUST: 'Điều chỉnh / hủy hàng',
      IMPORT: 'Nhập kho',
      RESTOCK: 'Hoàn kho (hoàn tiền)',
      PREP_OUT: 'Xuất cho sơ chế',
      PREP_IN: 'Nhập từ sơ chế',
    };
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
                    el('td', { class: 'small' }, t.order ? `Đơn #${t.order.orderCode}` : reasonText(t.reason), t.createdBy ? ` · ${t.createdBy}` : ''),
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
