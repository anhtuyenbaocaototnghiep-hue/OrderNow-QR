// S-31 Nhập kho & kiểm kê (FEATURE-023): phiếu nhập (cộng tồn + giá nhập gần nhất), phiếu kiểm kê (DRAFT → chốt tạo ADJUST theo
// chênh lệch thực tế; nguyên liệu đang kiểm khóa điều chỉnh tay), báo cáo giá vốn (COGS) + lãi gộp theo món và hao hụt theo kỳ.
// ADR-006: nhập theo đơn vị đóng gói + hạn dùng / mã lô (F-031, F-028); giá vốn thực tế chốt lúc hoàn tất (F-031); thất thoát (F-032);
// quản lý đơn vị quy đổi (F-031). ADR-009: sửa / hủy phiếu nhập, hủy phiếu kiểm kê đã chốt (F-048).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { stocktakeUi } from '../stocktake.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, reasonDialog, toast, todayVn } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('stock');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { tab: 'receipts', from: addDays(todayVn(), -29), to: todayVn(), ingredients: [], units: [] };
const body = el('div');
const fromInput = el('input', { type: 'date', class: 'input', value: state.from, max: todayVn(), 'aria-label': 'Từ ngày' });
const toInput = el('input', { type: 'date', class: 'input', value: state.to, max: todayVn(), 'aria-label': 'Đến ngày' });
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['receipts', 'Nhập kho'],
    ['stocktakes', 'Kiểm kê'],
    ['costs', 'Giá vốn & hao hụt'],
    ['cogs', 'Giá vốn thực tế'],
    ['loss', 'Thất thoát'],
    ['units', 'Đơn vị'],
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
const rangeBar = el(
  'div',
  { class: 'filters' },
  el('div', { class: 'field' }, el('label', {}, 'Từ ngày'), fromInput),
  el('div', { class: 'field' }, el('label', {}, 'Đến ngày'), toInput),
  el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        state.from = fromInput.value;
        state.to = toInput.value;
        load();
      },
    },
    'Xem',
  ),
);
clear($('#content'), tabs, body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    [state.ingredients, state.units] = await Promise.all([staffApi('/api/admin/ingredients'), staffApi('/api/admin/units')]);
    if (state.tab === 'receipts') await renderReceipts();
    else if (state.tab === 'stocktakes') await renderStocktakes();
    else if (state.tab === 'cogs') await renderCogs();
    else if (state.tab === 'loss') await renderLoss();
    else if (state.tab === 'units') renderUnits();
    else await renderCosts();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const ingOptions = (selected) => [
  el('option', { value: '' }, '— Nguyên liệu —'),
  ...state.ingredients.map((i) =>
    el('option', { value: i.ingredientId, selected: i.ingredientId === selected }, `${i.name} (${i.unit}) · còn ${num(i.stockQty)}`),
  ),
];

// ---------- Nhập kho ----------
const ingOf = (l) => state.ingredients.find((i) => i.ingredientId === l.ingredientId);
const trackLots = (l) => Boolean(ingOf(l)?.trackLots);

/** Đơn vị nhập được cho nguyên liệu: đơn vị gốc + đơn vị quy về được đơn vị gốc (server quy đổi). */
function unitOptions(l) {
  const ing = ingOf(l);
  if (!ing) return [el('option', { value: '' }, 'Đơn vị')];
  const byCode = new Map(state.units.map((u) => [u.unitCode, u]));
  const reaches = (code) => {
    for (let c = code, hop = 0; c && hop < 10; c = byCode.get(c)?.baseUnitCode, hop++) if (c === ing.unit) return true;
    return false;
  };
  const codes = state.units.filter((u) => u.unitCode !== ing.unit && reaches(u.unitCode));
  // Sửa phiếu (F-048): dòng nhận theo gói của đơn đặt hàng có thể dùng đơn vị không có trong bảng quy đổi — vẫn hiện đúng đơn vị đã nhập
  const kept = l.unit && l.unit !== ing.unit && !codes.some((u) => u.unitCode === l.unit) ? [el('option', { value: l.unit, selected: true }, l.unit)] : [];
  return [
    el('option', { value: '', selected: !l.unit }, ing.unit),
    ...codes.map((u) => el('option', { value: u.unitCode, selected: l.unit === u.unitCode }, `${u.unitCode} (${u.name})`)),
    ...kept,
  ];
}

const receiptLine = (l) => {
  const qty = Number(l.qty);
  const price = l.unitCost === '' ? null : Number(l.unitCost);
  const base = l.unit ? { packUnitCode: l.unit, packQty: qty, packPrice: price } : { qty, unitCost: price };
  return { ingredientId: l.ingredientId, ...base, expiryDate: l.expiryDate || null, lotCode: l.lotCode || null };
};
const newLine = () => ({ ingredientId: null, unit: '', qty: '', unitCost: '', expiryDate: '', lotCode: '' });
/** Dòng phiếu đã lưu → dòng form (đơn vị đóng gói giữ như lúc nhập) — Sửa phiếu (F-048). */
const formLine = (l) => ({
  ingredientId: l.ingredientId,
  unit: l.packUnitCode ?? '',
  qty: l.packUnitCode ? l.packQty : l.qty,
  unitCost: (l.packUnitCode ? l.packPrice : l.unitCost) ?? '',
  expiryDate: l.expiryDate ?? '',
  lotCode: l.lotCode ?? '',
});

/** Bộ nhập dòng phiếu: nguyên liệu, đơn vị, SL, giá, hạn dùng / mã lô (nguyên liệu theo lô). Dùng cho phiếu mới và Sửa phiếu. */
function lineEditor(lines) {
  const rows = el('div');
  const render = () =>
    clear(
      rows,
      lines.map((l, idx) =>
        el(
          'div',
          { class: 'receipt-row' },
          el(
            'select',
            {
              class: 'input',
              'aria-label': 'Nguyên liệu',
              onchange: (e) => {
                l.ingredientId = Number(e.target.value) || null;
                l.unit = '';
                render();
              },
            },
            ingOptions(l.ingredientId),
          ),
          el(
            'select',
            { class: 'input', 'aria-label': 'Đơn vị nhập', style: { maxWidth: '8rem' }, onchange: (e) => (l.unit = e.target.value) },
            unitOptions(l),
          ),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: 'Số lượng nhập',
            value: l.qty,
            'aria-label': 'Số lượng',
            oninput: (e) => (l.qty = e.target.value),
          }),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: 'Giá / đơn vị đã chọn',
            value: l.unitCost,
            'aria-label': 'Giá nhập',
            oninput: (e) => (l.unitCost = e.target.value),
          }),
          trackLots(l)
            ? el('input', {
                class: 'input',
                type: 'date',
                value: l.expiryDate,
                title: 'Hạn sử dụng của lô (trống = tự tính theo "dùng trong … giờ")',
                'aria-label': 'Hạn sử dụng',
                oninput: (e) => (l.expiryDate = e.target.value),
              })
            : null,
          trackLots(l)
            ? el('input', {
                class: 'input',
                maxlength: 30,
                placeholder: 'Mã lô',
                value: l.lotCode,
                'aria-label': 'Mã lô',
                oninput: (e) => (l.lotCode = e.target.value),
              })
            : null,
          el(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': 'Bỏ dòng',
              onclick: () => {
                lines.splice(idx, 1);
                render();
              },
            },
            icon('x'),
          ),
        ),
      ),
    );
  render();
  const addBtn = el(
    'button',
    {
      class: 'btn btn-sm',
      type: 'button',
      onclick: () => {
        lines.push(newLine());
        render();
      },
    },
    '+ Dòng',
  );
  return { rows, addBtn };
}

const receiptStatus = (r) => (r.status === 'VOIDED' ? el('span', { class: 'pill off' }, 'Đã hủy') : r.edited ? el('span', { class: 'pill' }, 'Đã sửa') : null);

async function renderReceipts() {
  const list = await staffApi(`/api/admin/stock-receipts?from=${state.from}&to=${state.to}`);
  const lines = [newLine()];
  const editor = lineEditor(lines);
  const supplier = el('input', { class: 'input', maxlength: 100, placeholder: 'Nhà cung cấp (không bắt buộc)' });
  const note = el('input', { class: 'input', maxlength: 200, placeholder: 'Ghi chú' });
  clear(
    body,
    el(
      'div',
      { class: 'card', style: { marginBottom: '1rem' } },
      el('h2', { style: { fontSize: '1rem' } }, 'Phiếu nhập mới'),
      el('div', { class: 'form-grid' }, supplier, note),
      el('div', { style: { marginTop: '0.6rem' } }, editor.rows),
      el(
        'div',
        { class: 'row', style: { marginTop: '0.5rem' } },
        editor.addBtn,
        el(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onclick: async () => {
              try {
                const r = await staffApi('/api/admin/stock-receipts', {
                  method: 'POST',
                  body: {
                    supplier: supplier.value || null,
                    note: note.value || null,
                    lines: lines.filter((l) => l.ingredientId).map(receiptLine),
                  },
                });
                toast(`Đã nhập kho phiếu #${r.receiptId} (${r.lines.length} nguyên liệu)`, 'success');
                load();
              } catch (err) {
                toast(errorMessage(err), 'error', 6000);
              }
            },
          },
          'Lưu phiếu nhập',
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Lưu là cộng tồn ngay (lịch sử kho IMPORT), cập nhật giá vốn bình quân. Nhập theo thùng / lon / kg… được quy ra đơn vị gốc của nguyên liệu (tab Đơn vị). Nguyên liệu theo lô: mỗi dòng thành một lô có hạn dùng. Nhập sai: bấm vào phiếu để Sửa hoặc Hủy phiếu.',
      ),
    ),
    rangeBar,
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có phiếu nhập trong khoảng này.')
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
                ['Phiếu', 'Thời gian', 'Nhà cung cấp', 'Số dòng', 'Tổng tiền nhập', 'Người nhập', 'Trạng thái', ''].map((h, i) =>
                  el('th', { class: i >= 3 && i <= 4 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              list.map((r) =>
                el(
                  'tr',
                  { class: r.status === 'VOIDED' ? 'voided' : '', style: { cursor: 'pointer' }, onclick: () => showReceipt(r.receiptId) },
                  el('td', { class: 'mono' }, `#${r.receiptId}`),
                  el('td', { class: 'nowrap' }, dateTime(r.receivedAt)),
                  el('td', {}, r.supplier ?? '—'),
                  el('td', { class: 'num' }, r.lineCount),
                  el('td', { class: 'num' }, money(r.totalCost)),
                  el('td', {}, r.receivedBy),
                  el('td', {}, receiptStatus(r)),
                  el(
                    'td',
                    {},
                    el(
                      'button',
                      {
                        class: 'btn btn-sm',
                        type: 'button',
                        'aria-label': `Chi tiết phiếu nhập #${r.receiptId}`,
                        onclick: (e) => {
                          e.stopPropagation();
                          showReceipt(r.receiptId);
                        },
                      },
                      'Chi tiết',
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
  );
}

async function showReceipt(id) {
  let r;
  try {
    r = await staffApi(`/api/admin/stock-receipts/${id}`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const voided = r.status === 'VOIDED';
  modal({
    title: `Phiếu nhập #${r.receiptId}${voided ? ' (đã hủy)' : ''}`,
    body: el(
      'div',
      {},
      el(
        'p',
        { class: 'small muted' },
        `${dateTime(r.receivedAt)} · ${r.receivedBy}${r.supplier ? ` · ${r.supplier}` : ''}${r.note ? ` · ${r.note}` : ''}${r.poId ? ` · Đơn đặt hàng #${r.poId}` : ''}`,
      ),
      voided ? el('p', { class: 'small' }, el('strong', {}, 'Đã hủy'), ` ${dateTime(r.voidedAt)} · ${r.voidedBy} · Lý do: ${r.voidReason}`) : null,
      r.editedAt ? el('p', { class: 'small' }, el('strong', {}, 'Sửa gần nhất'), ` ${dateTime(r.editedAt)} · ${r.editedBy} · Lý do: ${r.editReason}`) : null,
      el(
        'ul',
        { class: voided ? 'voided' : '' },
        r.lines.map((l) =>
          el(
            'li',
            {},
            `${l.name}: +${num(l.qty)} ${l.unit}${l.unitCost !== null ? ` × ${money(l.unitCost)}` : ''}${l.lotCode ? ` · lô ${l.lotCode}` : ''}${l.expiryDate ? ` · HSD ${l.expiryDate}` : ''}`,
          ),
        ),
      ),
      voided
        ? null
        : el(
            'p',
            { class: 'small muted' },
            'Sửa / hủy được khi hàng của phiếu chưa bị dùng hết, chưa kiểm kê sau lúc nhập và không đang kiểm kê — không được thì hệ thống báo rõ lý do.',
          ),
    ),
    actions: voided
      ? [{ label: 'Đóng', class: 'btn-primary' }]
      : [
          {
            label: 'Hủy phiếu',
            class: 'btn-danger',
            onClick: async (close) => {
              const reason = await reasonDialog(
                `Hủy phiếu nhập #${r.receiptId}?`,
                'Kho trừ lại đúng số đã nhập, giá vốn bình quân tính lại. Phiếu vẫn còn trong danh sách với nhãn "Đã hủy".',
                { okLabel: 'Hủy phiếu', danger: true, placeholder: 'Ví dụ: nhập nhầm, trả hàng nhà cung cấp…' },
              );
              if (!reason) return false;
              try {
                await staffApi(`/api/admin/stock-receipts/${r.receiptId}/void`, { method: 'POST', body: { reason } });
                toast(`Đã hủy phiếu nhập #${r.receiptId}`, 'success');
                close();
                load();
              } catch (err) {
                toast(errorMessage(err), 'error', 8000);
              }
              return false;
            },
          },
          {
            label: 'Sửa',
            onClick: (close) => {
              close();
              editReceipt(r);
              return false;
            },
          },
          { label: 'Đóng', class: 'btn-primary' },
        ],
  });
}

/** Sửa phiếu nhập (F-048): giữ số phiếu; dòng không đổi giữ nguyên, dòng đổi = bỏ dòng cũ + nhập dòng mới; bắt buộc lý do. */
function editReceipt(r) {
  const lines = r.lines.map(formLine);
  const editor = lineEditor(lines);
  const supplier = el('input', { class: 'input', maxlength: 100, value: r.supplier ?? '', disabled: Boolean(r.supplierId) });
  const note = el('input', { class: 'input', maxlength: 200, value: r.note ?? '' });
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Ví dụ: sai số lượng theo hóa đơn' });
  const send = (confirmOver) =>
    staffApi(`/api/admin/stock-receipts/${r.receiptId}`, {
      method: 'PUT',
      body: {
        supplier: supplier.value || null,
        note: note.value || null,
        reason: reason.value,
        confirmOver,
        lines: lines.filter((l) => l.ingredientId).map(receiptLine),
      },
    });
  const m = modal({
    title: `Sửa phiếu nhập #${r.receiptId}`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'p',
        { class: 'small muted' },
        'Dòng không đổi giữ nguyên; dòng đổi = bỏ dòng cũ và nhập dòng mới (lịch sử kho ghi cả hai). Tồn, giá vốn bình quân, lô và đơn đặt hàng được tính lại.',
      ),
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, r.supplierId ? 'Nhà cung cấp (theo đơn đặt hàng)' : 'Nhà cung cấp'), supplier),
        el('div', { class: 'field' }, el('label', {}, 'Ghi chú'), note),
      ),
      editor.rows,
      el('div', {}, editor.addBtn),
      el('div', { class: 'field' }, el('label', {}, 'Lý do sửa (bắt buộc)'), reason),
    ),
    actions: [
      { label: 'Thôi', value: false },
      {
        label: 'Lưu thay đổi',
        class: 'btn-primary',
        onClick: async (close) => {
          if (!reason.value.trim()) {
            toast('Nhập lý do sửa phiếu', 'error');
            reason.focus();
            return false;
          }
          try {
            let res;
            try {
              res = await send(false);
            } catch (err) {
              if (err.code !== 'OVER_RECEIPT') throw err;
              if (!(await confirmDialog('Nhận vượt số đã đặt?', errorMessage(err), { okLabel: 'Vẫn lưu' }))) return false;
              res = await send(true);
            }
            toast(`Đã sửa phiếu nhập #${res.receiptId}`, 'success');
            close();
            load();
          } catch (err) {
            toast(errorMessage(err), 'error', 8000);
          }
          return false;
        },
      },
    ],
  });
  m.root.style.width = 'min(960px, 100%)';
}

// ---------- Kiểm kê (dùng chung với quầy cho trưởng ca — js/stocktake.js, F-036) ----------
const stocktakes = stocktakeUi({ base: '/api/admin/stocktakes', body, ingredients: () => state.ingredients, reload: () => load(), canVoid: true });
const renderStocktakes = () => stocktakes.render();

// ---------- Giá vốn & hao hụt ----------
async function renderCosts() {
  const r = await staffApi(`/api/admin/reports/costs?from=${state.from}&to=${state.to}`);
  clear(
    body,
    rangeBar,
    el(
      'div',
      { class: 'kpis' },
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Doanh thu món (đã thu)'), el('div', { class: 'value' }, money(r.totals.revenue))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Giá vốn (món đủ giá nhập)'), el('div', { class: 'value' }, money(r.totals.cogs))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Lãi gộp (món đủ giá nhập)'), el('div', { class: 'value' }, money(r.totals.grossProfit))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Hao hụt kiểm kê'), el('div', { class: 'value neg' }, money(r.shrinkageValue))),
    ),
    el(
      'div',
      { class: 'card', style: { marginBottom: '1rem' } },
      el('h2', { style: { fontSize: '1rem' } }, 'Giá vốn & lãi gộp theo món'),
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
              ['Món', 'SL', 'Doanh thu', 'Giá vốn / phần', 'Giá vốn', 'Lãi gộp'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)),
            ),
          ),
          el(
            'tbody',
            {},
            r.items.map((i) =>
              el(
                'tr',
                {},
                el('td', {}, i.name, i.itemType === 'COMBO' ? el('span', { class: 'pill' }, 'combo') : null),
                el('td', { class: 'num' }, num(i.qty)),
                el('td', { class: 'num' }, money(i.revenue)),
                el('td', { class: 'num' }, i.unitCost === null ? (i.hasBom ? '—' : 'chưa có định lượng') : money(i.unitCost)),
                el('td', { class: 'num' }, i.cogs === null ? '—' : money(i.cogs)),
                el('td', { class: 'num' }, i.grossProfit === null ? '—' : money(i.grossProfit)),
              ),
            ),
          ),
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Giá vốn = Σ định lượng × giá nhập gần nhất. "—" = có nguyên liệu chưa nhập giá (nhập kho kèm giá để tính). Doanh thu trước chiết khấu hội viên/giảm tay.',
      ),
    ),
    el(
      'div',
      { class: 'card' },
      el('h2', { style: { fontSize: '1rem' } }, 'Hao hụt theo kiểm kê'),
      r.shrinkage.length === 0
        ? el('p', { class: 'muted' }, 'Không có chênh lệch kiểm kê trong khoảng này.')
        : el(
            'ul',
            {},
            r.shrinkage.map((x) => el('li', {}, `${x.name}: ${num(x.diff)} ${x.unit} (${money(x.value)})`)),
          ),
    ),
  );
}

load();

// ---------- Giá vốn thực tế (F-031): chốt lúc hoàn tất đơn ----------
async function renderCogs() {
  const r = await staffApi(`/api/admin/reports/cogs?from=${state.from}&to=${state.to}`);
  const totalRev = r.items.reduce((s, i) => s + i.revenue, 0);
  const totalCogs = r.items.reduce((s, i) => s + i.cogs, 0);
  clear(
    body,
    rangeBar,
    el(
      'div',
      { class: 'kpis' },
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Doanh thu món (đơn hoàn tất)'), el('div', { class: 'value' }, money(totalRev))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Giá vốn thực tế'), el('div', { class: 'value' }, money(totalCogs))),
      el(
        'div',
        { class: 'card kpi' },
        el('div', { class: 'label' }, 'Món chưa biết giá vốn'),
        el(
          'div',
          { class: 'value' },
          r.items.reduce((s, i) => s + i.unknownQty, 0),
        ),
      ),
    ),
    el(
      'p',
      { class: 'small muted' },
      'Giá vốn mỗi ly chốt lúc bấm Hoàn tất theo giá vốn bình quân (hoặc giá lô khi cài FIFO) — đổi giá nhập sau đó không làm thay đổi đơn cũ.',
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
            ['Món', 'SL', 'Doanh thu', 'Giá vốn', 'Biên lãi gộp', 'Chưa biết giá'].map((h, k) => el('th', { class: k ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.items.map((i) =>
            el(
              'tr',
              {},
              el('td', {}, i.name),
              el('td', { class: 'num' }, i.qty),
              el('td', { class: 'num' }, money(i.revenue)),
              el('td', { class: 'num' }, money(i.cogs)),
              el('td', { class: 'num' }, i.marginPct === null ? '—' : `${num(i.marginPct)}%`),
              el('td', { class: 'num' }, i.unknownQty || ''),
            ),
          ),
        ),
      ),
    ),
    el('h2', { style: { fontSize: '1rem', marginTop: '1rem' } }, 'Theo nguyên liệu'),
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
            ['Nguyên liệu', 'Đã dùng', 'Giá vốn'].map((h, k) => el('th', { class: k ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.ingredients.map((i) =>
            el('tr', {}, el('td', {}, i.name), el('td', { class: 'num' }, `${num(i.qty)} ${i.unit}`), el('td', { class: 'num' }, money(i.cost))),
          ),
        ),
      ),
    ),
  );
}

// ---------- Thất thoát (F-032) ----------
async function renderLoss() {
  const rows = await staffApi(`/api/admin/reports/loss?from=${state.from}&to=${state.to}`);
  clear(
    body,
    rangeBar,
    el(
      'p',
      { class: 'small muted' },
      'Chênh lệch = hụt khi kiểm kê + hủy đã ghi. Thất thoát bất thường = chênh lệch − hao hụt định mức − hủy đã ghi; tô đỏ khi > 2% tiêu thụ. Đặt hao hụt định mức ở Kho nguyên liệu → Kho nâng cao.',
    ),
    rows.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có tiêu thụ / kiểm kê trong khoảng này.')
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
                ['Nguyên liệu', 'Tiêu thụ', 'Định mức', 'Hủy đã ghi', 'Hụt kiểm kê', 'Chênh lệch', 'Thất thoát bất thường', 'Giá trị'].map((h, k) =>
                  el('th', { class: k ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              rows.map((x) =>
                el(
                  'tr',
                  { class: x.flagged ? 'loss-flag' : '' },
                  el('td', {}, x.name, el('div', { class: 'small muted' }, `định mức ${num(x.wastePercent)}%`)),
                  el('td', { class: 'num' }, `${num(x.consumption)} ${x.unit}`),
                  el('td', { class: 'num' }, num(x.standard)),
                  el('td', { class: 'num' }, num(x.loggedWaste)),
                  el('td', { class: 'num' }, num(Math.max(0, x.stocktakeShortage))),
                  el('td', { class: 'num' }, num(x.gap)),
                  el('td', { class: 'num' }, x.abnormal > 0 ? el('strong', {}, `${num(x.abnormal)} ${x.unit}`) : 'Bình thường'),
                  el('td', { class: 'num' }, x.abnormalValue ? money(x.abnormalValue) : ''),
                ),
              ),
            ),
          ),
        ),
  );
}

// ---------- Đơn vị quy đổi (F-031) ----------
function renderUnits() {
  const code = el('input', { class: 'input', maxlength: 10, placeholder: 'Mã (vd. thùng)' });
  const name = el('input', { class: 'input', maxlength: 30, placeholder: 'Tên (vd. thùng 24 lon)' });
  const base = el(
    'select',
    { class: 'input' },
    el('option', { value: '' }, '— Đơn vị gốc (không quy đổi) —'),
    state.units.map((u) => el('option', { value: u.unitCode }, u.unitCode)),
  );
  const factor = el('input', { class: 'input', type: 'number', min: 0, step: 'any', placeholder: 'Hệ số' });
  clear(
    body,
    el(
      'div',
      { class: 'card', style: { marginBottom: '1rem' } },
      el('h2', { style: { fontSize: '1rem' } }, 'Thêm / sửa đơn vị'),
      el('div', { class: 'form-grid' }, code, name, base, factor),
      el('p', { class: 'small muted' }, '1 [mã] = [hệ số] × [đơn vị gốc]. Ví dụ: thùng = 24 × lon; lon = 330 × ml → nhập "2 thùng" sữa tươi = 15.840 ml.'),
      el(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onclick: async () => {
            try {
              await staffApi(`/api/admin/units/${encodeURIComponent(code.value.trim())}`, {
                method: 'PUT',
                body: { name: name.value || code.value, baseUnitCode: base.value || null, factor: factor.value ? Number(factor.value) : null },
              });
              toast('Đã lưu đơn vị', 'success');
              load();
            } catch (err) {
              toast(errorMessage(err), 'error', 6000);
            }
          },
        },
        'Lưu đơn vị',
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
            ['Mã', 'Tên', 'Quy đổi', 'Nguyên liệu dùng làm gốc', ''].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          state.units.map((u) =>
            el(
              'tr',
              {},
              el('td', {}, el('strong', {}, u.unitCode)),
              el('td', {}, u.name),
              el('td', {}, u.baseUnitCode ? `1 ${u.unitCode} = ${num(u.factor)} ${u.baseUnitCode}` : 'đơn vị gốc'),
              el('td', { class: 'num' }, u.usedBy || ''),
              el(
                'td',
                {},
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    onclick: async () => {
                      try {
                        await staffApi(`/api/admin/units/${encodeURIComponent(u.unitCode)}`, { method: 'DELETE' });
                        toast('Đã xóa đơn vị', 'success');
                        load();
                      } catch (err) {
                        toast(errorMessage(err), 'error', 6000);
                      }
                    },
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
