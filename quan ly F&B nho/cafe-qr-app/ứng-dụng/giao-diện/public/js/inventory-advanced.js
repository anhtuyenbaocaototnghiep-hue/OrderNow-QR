// Hộp thoại kho nâng cao dùng chung (ADR-006 giai đoạn 5): thuộc tính nguyên liệu (bán thành phẩm F-027, hạn dùng / theo lô F-028,
// hao hụt định mức F-032), công thức sơ chế (F-027), danh sách lô + hủy lô (F-028). Server kiểm mọi ràng buộc.
import { staffApi } from './api.js';
import { clear, dateTime, el, errorMessage, modal, money, num, showFieldErrors, toast } from './ui.js';
import { icon } from './icons.js';

const KIND = { RAW: 'Nguyên liệu thô', SEMI: 'Bán thành phẩm (tự sơ chế)' };
// Nguồn của lô (F-028)
const LOT_SOURCE = { RECEIPT: 'Nhập kho', PREP: 'Sơ chế', ADJUST: 'Điều chỉnh / kiểm kê', RESTOCK: 'Hoàn tiền' };

export function ingredientBadges(i) {
  return [
    i.kind === 'SEMI' ? el('span', { class: 'pill' }, 'Bán thành phẩm') : null,
    i.trackLots ? el('span', { class: 'pill' }, 'Theo lô') : null,
    i.expiredQty > 0 ? el('span', { class: 'pill danger' }, `Hết hạn ${num(i.expiredQty)} ${i.unit}`) : null,
  ];
}

export function costLine(i) {
  return el(
    'div',
    { class: 'muted small' },
    `Giá vốn bình quân: ${i.avgCost ? `${num(i.avgCost)}đ/${i.unit}` : 'chưa có'}`,
    i.wastePercent ? ` · hao hụt định mức ${num(i.wastePercent)}%` : '',
    i.shelfLifeHours ? ` · dùng trong ${i.shelfLifeHours} giờ` : '',
  );
}

/** Loại, hạn dùng, hao hụt định mức, theo lô. */
export function advancedDialog(i, onDone) {
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Loại'),
      el(
        'select',
        { class: 'input', name: 'kind' },
        Object.entries(KIND).map(([k, label]) => el('option', { value: k, selected: k === i.kind }, label)),
      ),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Dùng trong (giờ, sau khi pha / mở) — trống = không hạn'),
      el('input', { class: 'input', name: 'shelfLifeHours', type: 'number', min: 1, max: 8760, value: i.shelfLifeHours ?? '' }),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Hao hụt định mức (% tiêu thụ) — dùng cho báo cáo thất thoát và dự báo nhập hàng'),
      el('input', { class: 'input', name: 'wastePercent', type: 'number', min: 0, max: 100, step: 'any', value: i.wastePercent ?? 0 }),
    ),
    el(
      'label',
      { class: 'check' },
      el('input', { type: 'checkbox', name: 'trackLots', checked: i.trackLots }),
      'Theo dõi theo lô + hạn sử dụng (trừ kho lô hết hạn sớm trước — FEFO)',
    ),
    el('p', { class: 'small muted' }, 'Bật theo lô: tồn hiện có thành một lô "Tồn đầu" không hạn. Tắt: đóng mọi lô.'),
  );
  modal({
    title: `Kho nâng cao: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          try {
            await staffApi(`/api/admin/ingredients/${i.ingredientId}/advanced`, {
              method: 'PUT',
              body: {
                kind: f('kind').value,
                shelfLifeHours: f('shelfLifeHours').value ? Number(f('shelfLifeHours').value) : null,
                wastePercent: Number(f('wastePercent').value || 0),
                trackLots: f('trackLots').checked,
              },
            });
            toast('Đã lưu', 'success');
            onDone?.();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

/** Công thức sơ chế: một mẻ ra bao nhiêu + các nguyên liệu đầu vào. */
export async function recipeDialog(i, ingredients, onDone) {
  let data;
  try {
    data = await staffApi(`/api/admin/ingredients/${i.ingredientId}/recipe`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const recipe = data.recipe ?? { outputQty: '', instructions: '', lines: [] };
  const lines = recipe.lines.length ? recipe.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })) : [{ ingredientId: null, qty: '' }];
  const rows = el('div');
  const options = (sel) => [
    el('option', { value: '' }, '— Nguyên liệu —'),
    ...ingredients
      .filter((x) => x.ingredientId !== i.ingredientId)
      .map((x) => el('option', { value: x.ingredientId, selected: x.ingredientId === sel }, `${x.name} (${x.unit})`)),
  ];
  const render = () =>
    clear(
      rows,
      lines.map((l, k) =>
        el(
          'div',
          { class: 'receipt-row' },
          el(
            'select',
            { class: 'input', 'aria-label': 'Nguyên liệu đầu vào', onchange: (e) => (l.ingredientId = Number(e.target.value) || null) },
            options(l.ingredientId),
          ),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: 'Lượng / mẻ',
            value: l.qty,
            'aria-label': 'Lượng',
            oninput: (e) => (l.qty = e.target.value),
          }),
          el(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': 'Bỏ dòng',
              onclick: () => {
                lines.splice(k, 1);
                render();
              },
            },
            icon('x'),
          ),
        ),
      ),
    );
  render();
  const output = el('input', { class: 'input', name: 'outputQty', type: 'number', min: 0, step: 'any', value: recipe.outputQty });
  const instructions = el('textarea', { class: 'input', name: 'instructions', maxlength: 500, rows: 2 });
  instructions.value = recipe.instructions ?? '';
  const form = el(
    'form',
    { class: 'stack' },
    el('div', { class: 'field' }, el('label', {}, `Một mẻ ra bao nhiêu ${i.unit}`), output),
    el('label', {}, 'Nguyên liệu cho một mẻ'),
    rows,
    el(
      'button',
      {
        class: 'btn btn-sm',
        type: 'button',
        onclick: () => {
          lines.push({ ingredientId: null, qty: '' });
          render();
        },
      },
      '+ Nguyên liệu',
    ),
    el('div', { class: 'field' }, el('label', {}, 'Cách làm (không bắt buộc)'), instructions),
    el(
      'p',
      { class: 'small muted' },
      'Bán thành phẩm có thể dùng bán thành phẩm khác (tối đa 3 cấp, không vòng lặp). BOM món dùng bán thành phẩm như nguyên liệu thường.',
    ),
  );
  modal({
    title: `Công thức sơ chế: ${i.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu công thức',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(`/api/admin/ingredients/${i.ingredientId}/recipe`, {
              method: 'PUT',
              body: {
                outputQty: Number(output.value),
                instructions: instructions.value || null,
                lines: lines.filter((l) => l.ingredientId).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) })),
              },
            });
            toast('Đã lưu công thức', 'success');
            onDone?.();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : 'không hạn');

/** Lô của nguyên liệu (mở + đã đóng gần đây); hủy lô còn hàng. writeOffUrl: (lotId) → endpoint (quản lý hoặc quầy). */
export async function lotsDialog(i, onDone, writeOffUrl = (id) => `/api/admin/lots/${id}/write-off`) {
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  const m = modal({ title: `Lô: ${i.name}`, body, actions: [{ label: 'Đóng', class: 'btn-primary' }] });
  async function load() {
    try {
      const r = await staffApi(`/api/admin/ingredients/${i.ingredientId}/lots?all=1`);
      clear(
        body,
        r.lots.length === 0
          ? el('p', { class: 'muted' }, 'Chưa có lô.')
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
                    ['Lô', 'Còn', 'Hạn dùng', 'Giá', 'Nguồn', 'Nhận lúc', ''].map((h) => el('th', {}, h)),
                  ),
                ),
                el(
                  'tbody',
                  {},
                  r.lots.map((l) =>
                    el(
                      'tr',
                      { class: l.isClosed ? 'muted' : '' },
                      el('td', {}, l.lotCode ?? `#${l.lotId}`),
                      el('td', { class: 'num' }, `${num(l.qty)} ${i.unit}`),
                      el(
                        'td',
                        {},
                        fmtDate(l.expiryDate),
                        !l.isClosed && l.daysLeft !== null && l.daysLeft < 0 ? el('span', { class: 'badge danger' }, ' Hết hạn') : null,
                        !l.isClosed && l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 2
                          ? el('span', { class: 'badge pending' }, ` Còn ${l.daysLeft} ngày`)
                          : null,
                      ),
                      el('td', { class: 'num' }, `${money(l.unitCost)}/${i.unit}`),
                      el('td', {}, LOT_SOURCE[l.source] ?? l.source),
                      el('td', { class: 'small' }, dateTime(l.receivedAt)),
                      el(
                        'td',
                        {},
                        l.isClosed
                          ? 'Đã đóng'
                          : el(
                              'button',
                              {
                                class: 'btn btn-sm btn-danger',
                                type: 'button',
                                onclick: async () => {
                                  try {
                                    await staffApi(writeOffUrl(l.lotId), { method: 'POST', body: {} });
                                    toast(`Đã hủy lô ${l.lotCode ?? `#${l.lotId}`}`, 'success');
                                    await load();
                                    onDone?.();
                                  } catch (err) {
                                    toast(errorMessage(err), 'error', 6000);
                                  }
                                },
                              },
                              'Hủy lô',
                            ),
                      ),
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
  await load();
  return m;
}
