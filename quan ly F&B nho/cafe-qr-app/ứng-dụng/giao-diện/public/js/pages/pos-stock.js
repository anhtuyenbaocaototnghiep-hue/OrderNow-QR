// S-17 Kho & sơ chế ở quầy (ADR-006, ma trận D-24 — STAFF được): sơ chế mẻ bán thành phẩm (F-027), phiếu hủy hàng (F-032),
// lô sắp / đã hết hạn + hủy lô (F-028), nhận hàng theo đơn đặt hàng (F-030), xem tồn nhanh. Mọi số tồn do server tính.
// F-036: trưởng ca / quản lý thêm điều chỉnh kho tay (tab Tồn kho) và kiểm kê (tab Kiểm kê) — nhân viên không thấy, server cũng chặn.
import { staffApi } from '../api.js';
import { getToken } from '../auth.js';
import { mountPosShell } from '../pos-shell.js';
import { receivePoDialog } from '../receive-po.js';
import { connectRealtime } from '../socket.js';
import { adjustDialog } from '../stock-adjust.js';
import { stocktakeUi } from '../stocktake.js';
import { $, clear, dateTime, el, errorMessage, money, num, setBusy, toast, todayVn } from '../ui.js';

const shell = await mountPosShell('stock');
const isLead = ['MANAGER', 'ADMIN'].includes(shell.user.role);
const REASONS = { SPILL: 'Đổ / vỡ', EXPIRED: 'Hết hạn', QUALITY: 'Hỏng / không đạt', OTHER: 'Khác' };
const state = { tab: 'prep' };
const tabs = $('#tabs');
const body = $('#content');
const TABS = [
  ['prep', 'Sơ chế'],
  ['waste', 'Hủy hàng'],
  ['expiry', 'Hạn dùng'],
  ['receive', 'Nhận hàng'],
  ['stock', 'Tồn kho'],
  ...(isLead ? [['stocktake', 'Kiểm kê']] : []),
];
clear(
  tabs,
  TABS.map(([key, label]) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(state.tab === key),
        dataset: { tab: key },
        onclick: () => {
          state.tab = key;
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === key)));
          load();
        },
      },
      label,
    ),
  ),
);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    if (state.tab === 'prep') await renderPrep();
    else if (state.tab === 'waste') await renderWaste();
    else if (state.tab === 'expiry') await renderExpiry();
    else if (state.tab === 'receive') await renderReceive();
    else if (state.tab === 'stocktake') {
      stockList = await staffApi('/api/ops/ingredients');
      await stocktakes.render();
    } else await renderStock();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const range = () => `from=${todayVn()}&to=${todayVn()}`;

// ---------- Sơ chế (F-027) ----------
async function renderPrep() {
  const [recipes, batches] = await Promise.all([staffApi('/api/prep/recipes'), staffApi(`/api/prep/batches?${range()}`)]);
  if (!recipes.length) {
    clear(
      body,
      el('div', { class: 'empty card' }, 'Chưa có bán thành phẩm có công thức. Quản lý tạo ở Kho nguyên liệu → Kho nâng cao → Bán thành phẩm → Công thức.'),
    );
    return;
  }
  const sel = el(
    'select',
    { class: 'input', id: 'prep-semi', 'aria-label': 'Bán thành phẩm' },
    recipes.map((r) => el('option', { value: r.ingredientId }, `${r.name} — còn ${num(r.available)} ${r.unit}${r.isLow ? ' (sắp hết)' : ''}`)),
  );
  const mult = el('input', {
    class: 'input',
    id: 'prep-mult',
    type: 'number',
    min: 0.1,
    max: 100,
    step: 0.5,
    value: 1,
    style: { maxWidth: '7rem' },
    'aria-label': 'Số mẻ',
  });
  const note = el('input', { class: 'input', maxlength: 200, placeholder: 'Ghi chú (không bắt buộc)' });
  const preview = el('div');
  const go = el('button', { class: 'btn btn-success btn-lg', type: 'button', id: 'prep-go' }, 'Hoàn tất mẻ');
  let timer = null;
  async function refresh() {
    try {
      const p = await staffApi(`/api/prep/preview?semiId=${sel.value}&multiplier=${Number(mult.value) || 1}`);
      const r = recipes.find((x) => x.ingredientId === Number(sel.value));
      go.disabled = !p.canPrepare;
      clear(
        preview,
        el(
          'p',
          {},
          `Ra ${num(p.outputQty)} ${r.unit} · giá vốn ước tính ${money(p.estimatedCost)}`,
          r.instructions ? el('div', { class: 'small muted' }, r.instructions) : null,
        ),
        el(
          'table',
          { class: 'table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              ['Nguyên liệu', 'Cần', 'Khả dụng', ''].map((h, k) => el('th', { class: k && k < 3 ? 'num' : '' }, h)),
            ),
          ),
          el(
            'tbody',
            {},
            p.lines.map((l) =>
              el(
                'tr',
                { class: l.enough ? '' : 'loss-flag' },
                el('td', {}, l.name),
                el('td', { class: 'num' }, `${num(l.need)} ${l.unit}`),
                el('td', { class: 'num' }, `${num(l.available)} ${l.unit}`),
                el('td', {}, l.enough ? '✓' : el('strong', {}, 'Thiếu')),
              ),
            ),
          ),
        ),
      );
    } catch (err) {
      clear(preview, el('div', { class: 'field-error' }, errorMessage(err)));
    }
  }
  [sel, mult].forEach((x) =>
    x.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 200);
    }),
  );
  go.addEventListener('click', async () => {
    setBusy(go, true);
    try {
      const b = await staffApi('/api/prep/batches', {
        method: 'POST',
        body: { semiIngredientId: Number(sel.value), multiplier: Number(mult.value), note: note.value || null },
      });
      toast(`Đã sơ chế ${num(b.outputQty)} ${b.unit} ${b.name} (mẻ #${b.batchId})`, 'success', 5000);
      load();
    } catch (err) {
      toast(errorMessage(err), 'error', 6000);
      setBusy(go, false);
    }
  });
  const low = recipes.filter((r) => r.isLow);
  clear(
    body,
    low.length ? el('div', { class: 'alert warning' }, `Nên pha thêm: ${low.map((r) => `${r.name} (còn ${num(r.available)} ${r.unit})`).join(', ')}`) : null,
    el(
      'div',
      { class: 'card stack' },
      el('h2', { style: { margin: 0, fontSize: '1.05rem' } }, 'Pha một mẻ'),
      el('div', { class: 'row wrap' }, sel, el('label', {}, '× mẻ'), mult),
      note,
      preview,
      go,
    ),
    el('h2', { style: { fontSize: '1.05rem', marginTop: '1rem' } }, 'Mẻ hôm nay'),
    batches.length === 0
      ? el('p', { class: 'muted' }, 'Chưa có mẻ nào hôm nay.')
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
                ['Lúc', 'Bán thành phẩm', 'Ra', 'Giá vốn', 'Dùng trước', 'Người pha'].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              batches.map((b) =>
                el(
                  'tr',
                  {},
                  el('td', {}, dateTime(b.preparedAt)),
                  el('td', {}, b.name, b.note ? el('div', { class: 'small muted' }, b.note) : null),
                  el('td', { class: 'num' }, `${num(b.outputQty)} ${b.unit}`),
                  el('td', { class: 'num' }, money(b.totalCost)),
                  el('td', {}, b.expiresAt ? dateTime(b.expiresAt) : '—'),
                  el('td', {}, b.preparedBy),
                ),
              ),
            ),
          ),
        ),
  );
  refresh();
}

// ---------- Hủy hàng (F-032) ----------
async function renderWaste() {
  const [ings, logs] = await Promise.all([staffApi('/api/ops/ingredients'), staffApi(`/api/waste?${range()}`)]);
  const sel = el(
    'select',
    { class: 'input', id: 'waste-ing', 'aria-label': 'Nguyên liệu' },
    ings.filter((i) => i.isActive).map((i) => el('option', { value: i.ingredientId }, `${i.name} (${i.unit}) — còn ${num(i.available)}`)),
  );
  const qty = el('input', { class: 'input', id: 'waste-qty', type: 'number', min: 0, step: 'any', placeholder: 'Số lượng hủy', 'aria-label': 'Số lượng hủy' });
  const reason = el(
    'select',
    { class: 'input', id: 'waste-reason', 'aria-label': 'Lý do' },
    Object.entries(REASONS).map(([k, v]) => el('option', { value: k }, v)),
  );
  const note = el('input', { class: 'input', maxlength: 200, placeholder: 'Ghi chú (vd. làm đổ hộp sữa)' });
  const go = el('button', { class: 'btn btn-danger', type: 'button', id: 'waste-go' }, 'Ghi phiếu hủy');
  go.addEventListener('click', async () => {
    setBusy(go, true);
    try {
      const w = await staffApi('/api/waste', {
        method: 'POST',
        body: { ingredientId: Number(sel.value), qty: Number(qty.value), reason: reason.value, note: note.value || null },
      });
      toast(`Đã hủy ${num(w.qty)} ${w.unit} ${w.name}`, 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error', 6000);
      setBusy(go, false);
    }
  });
  clear(
    body,
    el(
      'div',
      { class: 'card stack' },
      el('h2', { style: { margin: 0, fontSize: '1.05rem' } }, 'Phiếu hủy hàng'),
      el('div', { class: 'form-grid' }, sel, qty, reason, note),
      el('p', { class: 'small muted' }, 'Trừ kho ngay và ghi vào báo cáo thất thoát. Không hủy được phần đang giữ cho đơn chưa hoàn tất.'),
      go,
    ),
    el('h2', { style: { fontSize: '1.05rem', marginTop: '1rem' } }, 'Hủy hôm nay'),
    logs.length === 0
      ? el('p', { class: 'muted' }, 'Chưa có phiếu hủy hôm nay.')
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
                ['Lúc', 'Nguyên liệu', 'Số lượng', 'Lý do', 'Giá trị', 'Người ghi'].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              logs.map((w) =>
                el(
                  'tr',
                  {},
                  el('td', {}, dateTime(w.createdAt)),
                  el('td', {}, w.name),
                  el('td', { class: 'num' }, `${num(w.qty)} ${w.unit}`),
                  el('td', {}, REASONS[w.reason], w.note ? el('div', { class: 'small muted' }, w.note) : null),
                  el('td', { class: 'num' }, w.cost === null ? '—' : money(w.cost)),
                  el('td', {}, w.createdBy),
                ),
              ),
            ),
          ),
        ),
  );
}

// ---------- Hạn dùng (F-028) ----------
async function renderExpiry() {
  const lots = await staffApi('/api/lots/expiring?days=3');
  clear(
    body,
    el(
      'p',
      { class: 'small muted' },
      'Lô của nguyên liệu theo dõi hạn dùng: đã hết hạn (không bán) và sắp hết hạn trong 3 ngày. Lô hết hạn không còn tính vào khả dụng — hủy để trừ kho.',
    ),
    lots.length === 0
      ? el('div', { class: 'empty card' }, 'Không có lô nào sắp hết hạn. 👍')
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
                ['Nguyên liệu', 'Lô', 'Còn', 'Hạn dùng', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              lots.map((l) =>
                el(
                  'tr',
                  { class: l.daysLeft < 0 ? 'loss-flag' : '' },
                  el('td', {}, l.name),
                  el('td', {}, l.lotCode ?? `#${l.lotId}`),
                  el('td', { class: 'num' }, `${num(l.qty)} ${l.unit}`),
                  el(
                    'td',
                    {},
                    l.expiryDate.split('-').reverse().join('/'),
                    ' ',
                    l.daysLeft < 0 ? el('span', { class: 'badge danger' }, 'Đã hết hạn') : el('span', { class: 'badge pending' }, `Còn ${l.daysLeft} ngày`),
                  ),
                  el(
                    'td',
                    {},
                    el(
                      'button',
                      {
                        class: 'btn btn-sm btn-danger',
                        type: 'button',
                        onclick: async (e) => {
                          setBusy(e.currentTarget, true);
                          try {
                            await staffApi(`/api/lots/${l.lotId}/write-off`, { method: 'POST', body: {} });
                            toast(`Đã hủy lô ${l.lotCode ?? `#${l.lotId}`} (${num(l.qty)} ${l.unit})`, 'success');
                            load();
                          } catch (err) {
                            toast(errorMessage(err), 'error', 6000);
                            setBusy(e.currentTarget, false);
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
}

// ---------- Nhận hàng theo PO (F-030) ----------
async function renderReceive() {
  const [pos, ings] = await Promise.all([staffApi('/api/receiving/purchase-orders'), staffApi('/api/ops/ingredients')]);
  clear(
    body,
    pos.length === 0
      ? el('div', { class: 'empty card' }, 'Không có đơn đặt hàng nào đang chờ giao. Quản lý tạo đơn ở Nhà cung cấp & đặt hàng.')
      : pos.map((po) =>
          el(
            'div',
            { class: 'card row between', style: { marginBottom: '0.6rem' } },
            el(
              'div',
              {},
              el('strong', {}, `#${po.poId} · ${po.supplierName}`),
              el(
                'div',
                { class: 'small muted' },
                `${po.status === 'PARTIAL' ? 'Đã nhận một phần' : 'Chờ giao'} · giao dự kiến ${po.expectedDate ? po.expectedDate.split('-').reverse().join('/') : '—'}`,
              ),
            ),
            el(
              'button',
              {
                class: 'btn btn-success',
                type: 'button',
                onclick: async () => {
                  const full = await staffApi(`/api/receiving/purchase-orders/${po.poId}`);
                  receivePoDialog(full, { url: `/api/receiving/purchase-orders/${po.poId}/receive`, onDone: load, ingredients: ings });
                },
              },
              'Nhận hàng',
            ),
          ),
        ),
  );
}

// ---------- Kiểm kê (trưởng ca) ----------
let stockList = [];
const stocktakes = stocktakeUi({
  base: '/api/ops/stocktakes',
  body,
  ingredients: () => stockList.filter((i) => i.isActive),
  reload: () => load(),
});

// ---------- Tồn kho nhanh ----------
async function renderStock() {
  const ings = await staffApi('/api/ops/ingredients');
  stockList = ings;
  clear(
    body,
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
            ['Nguyên liệu', 'Tồn', 'Đang giữ', 'Hết hạn', 'Khả dụng', ''].map((h, k) => el('th', { class: k && k < 5 ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          ings
            .filter((i) => i.isActive)
            .map((i) =>
              el(
                'tr',
                { class: i.isLow ? 'loss-flag' : '' },
                el('td', {}, i.name, i.kind === 'SEMI' ? el('span', { class: 'pill' }, ' bán thành phẩm') : null),
                el('td', { class: 'num' }, `${num(i.stockQty)} ${i.unit}`),
                el('td', { class: 'num' }, num(i.reservedQty)),
                el('td', { class: 'num' }, i.expiredQty ? num(i.expiredQty) : ''),
                el('td', { class: 'num' }, el('strong', {}, num(i.available))),
                el(
                  'td',
                  { class: 'row' },
                  i.isLow ? el('span', { class: 'badge danger' }, 'Sắp hết') : null,
                  isLead
                    ? el(
                        'button',
                        {
                          class: 'btn btn-sm',
                          type: 'button',
                          onclick: () => adjustDialog(i, { url: `/api/ops/ingredients/${i.ingredientId}/adjust`, onDone: load }),
                        },
                        'Điều chỉnh',
                      )
                    : null,
                ),
              ),
            ),
        ),
      ),
    ),
  );
}

await load();
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) load();
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
shell.attach(socket);
socket?.on('inventory.low', (p) => toast(`Nguyên liệu sắp hết: ${p.name} (còn ${num(p.available)} ${p.unit ?? ''})`, 'warning', 6000));
socket?.on('inventory.expiring', (p) => toast(`${p.lots.length} lô sắp hết hạn — xem tab Hạn dùng`, 'warning', 6000));
socket?.on('inventory.runout', (p) => toast(`Sắp hết trước ngày giao: ${p.items.map((i) => i.name).join(', ')}`, 'warning', 8000));
