// S-23 Kho nguyên liệu: tồn kho, đang giữ cho đơn (ADR-001), khả dụng, ngưỡng sắp hết (BR-016),
// điều chỉnh tay có lý do (Q-011/ADR-003), lịch sử giao dịch kho.
// ADR-006: bán thành phẩm + công thức (F-027), theo lô + hạn dùng (F-028), giá vốn bình quân (F-031), hao hụt định mức (F-032).
import { staffApi } from '../api.js';
import { confirmAndDelete, mountAdminShell } from '../admin-shell.js';
import { advancedDialog, costLine, ingredientBadges, lotsDialog, recipeDialog } from '../inventory-advanced.js';
import { adjustDialog } from '../stock-adjust.js';
import { $, clear, dateTime, el, errorMessage, modal, num, setBusy, showFieldErrors, thumb, toast } from '../ui.js';

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
  // TASK-109: hàng sắp hết hạn (≤ 3 ngày) / đã hết hạn — báo ngay đầu trang như hàng sắp hết
  const soon = list.filter((i) => i.isActive && i.nextExpiry && i.nextExpiryDays <= EXPIRY_SOON_DAYS);
  clear(
    $('#content'),
    low.length ? el('div', { class: 'alert warning' }, `Sắp hết: ${low.map((i) => `${i.name} (còn ${num(i.available)} ${i.unit})`).join(', ')}`) : null,
    soon.length
      ? el(
          'div',
          { class: 'alert warning', id: 'expiry-alert' },
          `${soon.some((i) => i.nextExpiryDays < 0) ? 'Sắp / đã hết hạn' : 'Sắp hết hạn'}: ${soon.map((i) => `${i.name} (${expiryText(i.nextExpiryDays).toLowerCase()})`).join(', ')}`,
        )
      : null,
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có nguyên liệu nào.')
      : el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            { class: 'table ing-table' },
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ['Nguyên liệu', 'Còn dùng được', 'Hạn sử dụng', 'Trạng thái', ''].map((h, k) => el('th', { class: k === 1 ? 'num' : '' }, h)),
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
                    // F-085: ảnh nguyên liệu (chưa có ảnh → ô chữ cái như trang Món)
                    el(
                      'div',
                      { class: 'row ing-name' },
                      thumb(i.name, i.imageUrl),
                      el(
                        'div',
                        {},
                        el('strong', {}, i.name),
                        ' ',
                        ingredientBadges(i),
                        el('div', { class: 'muted small' }, `${i.unit} · dùng trong ${i.usedIn} món`),
                        costLine(i),
                      ),
                    ),
                  ),
                  el('td', { class: 'num' }, availableCell(i)),
                  el('td', { class: 'expiry-cell' }, expiryCell(i)),
                  el(
                    'td',
                    {},
                    !i.isActive
                      ? el('span', { class: 'badge' }, 'Ngừng dùng')
                      : i.isLow
                        ? el('span', { class: 'badge danger' }, 'Sắp hết')
                        : el('span', { class: 'badge ok' }, 'Đủ'),
                  ),
                  // Một nút chính + Sửa; việc ít dùng (lịch sử, lô, công thức, kho nâng cao, xóa) ở "⋯"
                  el(
                    'td',
                    {},
                    el(
                      'div',
                      { class: 'row ing-actions' },
                      el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => adjust(i) }, 'Điều chỉnh'),
                      el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editIngredient(i) }, 'Sửa'),
                      el(
                        'button',
                        {
                          class: 'btn btn-sm',
                          type: 'button',
                          'aria-label': `Việc khác: ${i.name}`,
                          'data-ing': i.ingredientId,
                          title: 'Lịch sử, lô & hạn dùng, kho nâng cao, xóa',
                          onclick: () => more(i),
                        },
                        '⋯',
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
      '"Còn dùng được" = tồn kho − phần đơn chưa hoàn tất đang giữ − hàng đã hết hạn. Tồn kho chỉ bị trừ thật khi quầy bấm Hoàn tất. Hạn sử dụng: bấm "Theo dõi hạn" ở nguyên liệu cần theo dõi rồi ghi hạn ở từng dòng khi nhập kho; hiện lô gần hết hạn nhất.',
    ),
  );
}

// ---------- TASK-109 (F-089): hạn sử dụng + ô gọn ----------
const EXPIRY_SOON_DAYS = 3;
const fmtDate = (iso) => iso.split('-').reverse().join('/');
const expiryText = (days) => (days < 0 ? `Hết hạn ${-days} ngày trước` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`);

/** "Còn dùng được" + tồn / đang giữ / đã hết hạn (chỉ khi khác nhau) + ngưỡng báo sắp hết. */
function availableCell(i) {
  const extra = [];
  if (i.reservedQty > 0) extra.push(`đang giữ ${num(i.reservedQty)}`);
  if (i.expiredQty > 0) extra.push(`hết hạn ${num(i.expiredQty)}`);
  return [
    el('strong', {}, num(i.available)),
    ` ${i.unit}`,
    extra.length ? el('div', { class: 'muted small' }, `tồn ${num(i.stockQty)} · ${extra.join(' · ')}`) : null,
    el('div', { class: 'muted small' }, `báo khi dưới ${num(i.lowStockThreshold)}`),
  ];
}

/**
 * Hạn sử dụng: lô còn hàng gần hết hạn nhất (theo lô — F-028) + hộp đang mở (F-075).
 * Chưa theo dõi → nút "Theo dõi hạn" bật theo lô một chạm (`action` = false: chỉ hiện chữ — dùng trong ngăn "⋯").
 */
function expiryCell(i, action = true) {
  const parts = [];
  if (i.nextExpiry) {
    const d = i.nextExpiryDays;
    const tone = d < 0 ? 'danger' : d <= EXPIRY_SOON_DAYS ? 'pending' : 'ok';
    parts.push(el('div', {}, el('strong', {}, fmtDate(i.nextExpiry)), ' ', el('span', { class: `badge ${tone}` }, expiryText(d))));
    parts.push(el('div', { class: 'muted small' }, `${num(i.nextExpiryQty)} ${i.unit} của lô này`));
  }
  if (i.openedAt && i.openShelfHours && i.openLeft > 0) {
    const until = new Date(new Date(i.openedAt).getTime() + i.openShelfHours * 3_600_000);
    parts.push(el('div', { class: 'small' }, `Hộp đang mở: dùng trước ${dateTime(until)}`));
  }
  if (parts.length) return parts;
  if (i.trackLots) return [el('span', { class: 'muted small' }, 'Chưa có lô ghi hạn — ghi hạn ở dòng nhập kho')];
  return [
    el('span', { class: 'muted small' }, 'Chưa theo dõi'),
    action
      ? el(
          'div',
          {},
          el(
            'button',
            { class: 'link-btn small', type: 'button', 'aria-label': `Theo dõi hạn: ${i.name}`, onclick: (e) => trackExpiry(i, e.currentTarget) },
            'Theo dõi hạn',
          ),
        )
      : null,
  ];
}

/** Bật theo dõi hạn (theo lô — F-028) một chạm; giữ nguyên các thiết lập Kho nâng cao khác (PUT thay cả bộ). */
async function trackExpiry(i, button) {
  setBusy(button, true);
  try {
    await staffApi(`/api/admin/ingredients/${i.ingredientId}/advanced`, {
      method: 'PUT',
      body: {
        kind: i.kind,
        shelfLifeHours: i.shelfLifeHours,
        wastePercent: i.wastePercent,
        trackLots: true,
        packSize: i.packSize,
        openShelfHours: i.openShelfHours,
      },
    });
    toast(`Đã bật theo dõi hạn cho ${i.name} — khi nhập kho, ghi hạn sử dụng ở dòng của nguyên liệu này`, 'success', 6000);
    await load();
    $(`button[data-ing="${i.ingredientId}"]`)?.focus(); // nút vừa bấm đã được dựng lại → focus về "⋯" của dòng đó
  } catch (err) {
    setBusy(button, false);
    toast(errorMessage(err), 'error', 6000);
  }
}

/** "⋯": việc ít dùng của một nguyên liệu — đóng ngăn rồi mở hộp việc đó (focus trả về nút ⋯). */
function more(i) {
  const go = (fn) => () => {
    m.close();
    fn();
  };
  const item = (label, hint, fn, cls = '') =>
    el(
      'button',
      { class: `btn ing-more-item ${cls}`, type: 'button', onclick: go(fn) },
      el('strong', {}, label),
      hint ? el('span', { class: 'small muted' }, hint) : null,
    );
  const m = modal({
    title: i.name,
    drawer: true,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'div',
        { class: 'ing-more-summary' },
        el('div', {}, el('div', { class: 'small muted' }, 'Còn dùng được'), availableCell(i)),
        el('div', { class: 'expiry-cell' }, el('div', { class: 'small muted' }, 'Hạn sử dụng'), expiryCell(i, false)),
      ),
      item('Lịch sử kho', 'Nhập, bán, điều chỉnh, hủy hàng', () => history(i)),
      i.trackLots ? item('Lô & hạn dùng', 'Từng lô, hạn sử dụng, hủy lô hết hạn', () => lotsDialog(i, load)) : null,
      i.kind === 'SEMI' ? item('Công thức', 'Bán thành phẩm làm từ nguyên liệu nào', () => recipeDialog(i, ingredients, load)) : null,
      item('Kho nâng cao', 'Theo lô + hạn sử dụng, hạn sau khi mở, giá vốn, hao hụt', () => advancedDialog(i, load)),
      item(
        'Xóa nguyên liệu',
        'Chỉ xóa được khi không món nào còn dùng',
        () =>
          confirmAndDelete({
            url: `/api/admin/ingredients/${i.ingredientId}`,
            label: `nguyên liệu "${i.name}"`,
            warning: 'Chỉ xóa được khi không còn món nào dùng nguyên liệu này trong định lượng.',
            onDone: load,
          }),
        'btn-danger-ghost',
      ),
    ),
  });
}

function editIngredient(i) {
  const isNew = !i;
  const form = el(
    'form',
    {},
    el('div', { class: 'field' }, el('label', {}, 'Tên nguyên liệu'), el('input', { class: 'input', name: 'name', maxlength: 100, value: i?.name ?? '' })),
    el('div', { class: 'field' }, el('label', {}, 'Đơn vị (ml, g, cái…)'), el('input', { class: 'input', name: 'unit', maxlength: 10, value: i?.unit ?? '' })),
    // F-085: ảnh như ảnh món — đường dẫn ảnh (URL hoặc /img/…); để trống = không ảnh
    el(
      'div',
      { class: 'field' },
      el('label', { for: 'ing-image' }, 'Ảnh (URL, không bắt buộc)'),
      el('input', { class: 'input', id: 'ing-image', name: 'imageUrl', maxlength: 500, placeholder: 'https://… hoặc /img/…', value: i?.imageUrl ?? '' }),
    ),
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
          const btn = e.currentTarget; // DEF-024: giữ nút trước await — sau await e.currentTarget là null, nút sẽ khóa mãi khi máy chủ báo lỗi
          setBusy(btn, true);
          const decimal = (n) => String(f(n).value).replace(',', '.').trim();
          try {
            if (isNew)
              await staffApi('/api/admin/ingredients', {
                method: 'POST',
                body: {
                  name: f('name').value,
                  unit: f('unit').value,
                  imageUrl: f('imageUrl').value,
                  stockQty: decimal('stockQty'),
                  lowStockThreshold: decimal('lowStockThreshold'),
                },
              });
            else
              await staffApi(`/api/admin/ingredients/${i.ingredientId}`, {
                method: 'PUT',
                body: {
                  name: f('name').value,
                  unit: f('unit').value,
                  imageUrl: f('imageUrl').value,
                  lowStockThreshold: decimal('lowStockThreshold'),
                  isActive: f('isActive').checked,
                },
              });
            toast('Đã lưu nguyên liệu', 'success');
            load();
          } catch (err) {
            setBusy(btn, false);
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
