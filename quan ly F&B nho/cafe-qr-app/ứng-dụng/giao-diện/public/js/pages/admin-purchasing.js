// S-35 Nhà cung cấp & đặt hàng (FEATURE-030) + Đề xuất nhập hàng (FEATURE-029).
// Nhà cung cấp (gói, giá gần nhất, ưu tiên) · Đơn đặt hàng (nháp → gửi/in → nhận từng phần → đủ) · Đề xuất nhập theo dự báo · Báo cáo giá / giao hàng.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { receivePoDialog } from '../receive-po.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, modal, money, num, showFieldErrors, toast, todayVn } from '../ui.js';
import { icon } from '../icons.js';

await mountAdminShell('purchasing');

const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const STATUS = { DRAFT: 'Nháp', SENT: 'Đã gửi', PARTIAL: 'Nhận một phần', RECEIVED: 'Đã nhận đủ', CANCELLED: 'Đã hủy' };
const STATUS_CLASS = { DRAFT: '', SENT: 'pending', PARTIAL: 'preparing', RECEIVED: 'completed', CANCELLED: 'cancelled' };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { tab: 'suggest', suppliers: [], ingredients: [], units: [], from: addDays(todayVn(), -29), to: todayVn() };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['suggest', 'Đề xuất nhập hàng'],
    ['pos', 'Đơn đặt hàng'],
    ['suppliers', 'Nhà cung cấp'],
    ['report', 'Giá & giao hàng'],
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
clear($('#content'), tabs, body);

async function load() {
  clear($('#head-actions'));
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    [state.suppliers, state.ingredients, state.units] = await Promise.all([
      staffApi('/api/admin/suppliers'),
      staffApi('/api/admin/ingredients'),
      staffApi('/api/admin/units'),
    ]);
    if (state.tab === 'suppliers') renderSuppliers();
    else if (state.tab === 'pos') await renderPos();
    else if (state.tab === 'report') await renderReport();
    else await renderSuggest();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const daysText = (mask) => (mask === 127 ? 'mọi ngày' : DAYS.filter((_, i) => mask & (1 << i)).join(', '));
const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '—');

// ---------- Đề xuất nhập hàng (F-029) ----------
async function renderSuggest() {
  const supplierSel = el(
    'select',
    { class: 'input', style: { width: 'auto' } },
    el('option', { value: '' }, 'Mọi nhà cung cấp'),
    state.suppliers.filter((s) => s.isActive).map((s) => el('option', { value: s.supplierId }, s.name)),
  );
  const dateIn = el('input', { class: 'input', type: 'date', min: addDays(todayVn(), 1), 'aria-label': 'Ngày giao kế tiếp' });
  const tableBox = el('div');
  const selected = new Map();
  let selectable = 0;
  // Chỉ đặt được dòng đã có nhà cung cấp và có số đề xuất > 0 — ô bị khóa thì nói rõ vì sao (DEF-016)
  const lockReason = (p) => (!p.supplier ? 'Chưa gán nhà cung cấp' : !p.suggestPacks ? 'Chưa cần nhập — đủ dùng đến ngày giao' : null);
  async function refresh() {
    const q = new URLSearchParams();
    if (supplierSel.value) q.set('supplierId', supplierSel.value);
    if (dateIn.value) q.set('nextDeliveryDate', dateIn.value);
    const plan = await staffApi(`/api/admin/inventory/replenishment?${q}`);
    selected.clear();
    selectable = plan.filter((p) => !lockReason(p)).length;
    const noSupplier = plan.filter((p) => !p.supplier).length;
    clear(
      tableBox,
      noSupplier
        ? el(
            'div',
            { class: 'alert warning', id: 'no-supplier-hint', style: { marginBottom: '0.6rem' } },
            `${noSupplier} nguyên liệu chưa gán nhà cung cấp nên chưa chọn để đặt được — bấm "Gán nhà cung cấp" ở cuối dòng. `,
            'Cần đặt hàng không có trong đề xuất: tab Đơn đặt hàng › "+ Tạo đơn đặt hàng".',
          )
        : null,
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
              ['', 'Nguyên liệu', 'Khả dụng', 'Đang về', 'Nhu cầu đến ngày giao', 'An toàn', 'Đề xuất nhập', 'Dự kiến hết', 'Nhà cung cấp'].map((h, k) =>
                el('th', { class: k >= 2 && k <= 6 ? 'num' : '' }, h),
              ),
            ),
          ),
          el(
            'tbody',
            {},
            plan.map((p) => {
              const reason = lockReason(p);
              const box = el('input', {
                type: 'checkbox',
                disabled: Boolean(reason),
                title: reason,
                'aria-label': reason ? `Chọn ${p.name} — ${reason}` : `Chọn ${p.name}`,
                onchange: (e) => (e.target.checked ? selected.set(p.ingredientId, p) : selected.delete(p.ingredientId)),
              });
              return el(
                'tr',
                { class: p.runsOutBeforeDelivery ? 'loss-flag' : '' },
                el('td', {}, box),
                el('td', {}, el('button', { class: 'link-btn', type: 'button', onclick: () => chart(p) }, p.name)),
                el('td', { class: 'num' }, `${num(p.available)} ${p.unit}`),
                el('td', { class: 'num' }, p.incoming ? num(p.incoming) : ''),
                el('td', { class: 'num' }, p.enoughData ? num(p.demand) : el('span', { class: 'muted small' }, 'Không đủ dữ liệu')),
                el('td', { class: 'num' }, p.enoughData ? num(p.safety) : ''),
                el(
                  'td',
                  { class: 'num' },
                  p.suggestPacks
                    ? el('strong', {}, `${num(p.suggestPacks)} ${p.packUnitCode ?? p.unit}`)
                    : el('span', { class: 'muted small' }, p.enoughData ? 'Chưa cần' : '—'),
                  p.suggestBase ? el('div', { class: 'small muted' }, `${num(p.suggestBase)} ${p.unit}`) : null,
                ),
                el(
                  'td',
                  {},
                  p.runOutDate ? fmtDate(p.runOutDate) : '',
                  p.runsOutBeforeDelivery ? el('div', { class: 'small' }, `trước ngày giao ${fmtDate(p.nextDeliveryDate)}`) : null,
                ),
                el(
                  'td',
                  { class: 'small' },
                  p.supplier?.name ??
                    el(
                      'button',
                      { class: 'btn btn-sm', type: 'button', 'aria-label': `Gán nhà cung cấp cho ${p.name}`, onclick: () => assignSupplier(p) },
                      icon('plus'),
                      'Gán nhà cung cấp',
                    ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
  clear(
    $('#head-actions'),
    el(
      'button',
      {
        class: 'btn',
        type: 'button',
        onclick: async () => {
          const r = await staffApi('/api/admin/jobs/demand-forecast/run', { method: 'POST' }).catch((err) => ({ status: 'FAILED', error: errorMessage(err) }));
          toast(r.status === 'OK' ? 'Đã tính lại dự báo' : `Không chạy được: ${r.error ?? r.status}`, r.status === 'OK' ? 'success' : 'warning');
          refresh();
        },
      },
      'Tính lại dự báo',
    ),
  );
  supplierSel.addEventListener('change', refresh);
  dateIn.addEventListener('change', refresh);
  clear(
    body,
    el(
      'p',
      { class: 'small muted' },
      'Dự báo theo thứ trong tuần (trung bình 4 tuần gần nhất, tuần gần nặng hơn) × (1 + hao hụt định mức), tự tính lúc 02:00. ',
      'Đề xuất = nhu cầu đến ngày giao kế tiếp + thời gian giao + tồn an toàn 20% − khả dụng − hàng đang về, làm tròn lên theo gói. Dòng đỏ: sẽ hết trước ngày giao.',
    ),
    el(
      'div',
      { class: 'filters' },
      el('div', { class: 'field' }, el('label', {}, 'Nhà cung cấp'), supplierSel),
      el('div', { class: 'field' }, el('label', {}, 'Ép ngày giao (tùy chọn)'), dateIn),
    ),
    tableBox,
    el(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        style: { marginTop: '0.6rem' },
        onclick: async () => {
          if (!selected.size) {
            return toast(selectable ? 'Tick các nguyên liệu cần đặt' : 'Chưa có dòng nào đặt được — gán nhà cung cấp cho nguyên liệu trước', 'warning');
          }
          const bySupplier = new Map();
          for (const p of selected.values()) {
            if (!bySupplier.has(p.supplier.supplierId)) bySupplier.set(p.supplier.supplierId, []);
            bySupplier.get(p.supplier.supplierId).push({ ingredientId: p.ingredientId, packs: p.suggestPacks });
          }
          try {
            for (const [supplierId, lines] of bySupplier) {
              await staffApi('/api/admin/purchase-orders/from-suggestion', { method: 'POST', body: { supplierId, lines, expectedDate: dateIn.value || null } });
            }
            toast(`Đã tạo ${bySupplier.size} đơn đặt hàng nháp`, 'success');
            state.tab = 'pos';
            tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-selected', String(k === 1)));
            load();
          } catch (err) {
            toast(errorMessage(err), 'error', 6000);
          }
        },
      },
      'Tạo đơn đặt hàng từ dòng đã chọn',
    ),
  );
  await refresh();
}

/** DEF-016: gán nhà cung cấp ngay từ dòng đề xuất → mở form nhà cung cấp đã có sẵn dòng nguyên liệu này (ưu tiên). */
function assignSupplier(p) {
  const active = state.suppliers.filter((s) => s.isActive);
  const m = modal({
    title: `Gán nhà cung cấp cho ${p.name}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small muted' }, 'Chọn nhà cung cấp, rồi điền gói đặt hàng (đơn vị gói, số lượng gốc mỗi gói, giá) và bấm Lưu.'),
      active.length
        ? el(
            'div',
            { class: 'row wrap' },
            active.map((s) =>
              el(
                'button',
                {
                  class: 'btn',
                  type: 'button',
                  onclick: () => {
                    m.close();
                    editSupplier(s, p.ingredientId);
                  },
                },
                s.name,
              ),
            ),
          )
        : el('p', {}, 'Chưa có nhà cung cấp nào đang hợp tác.'),
    ),
    actions: [
      { label: 'Hủy', value: false },
      { label: '+ Nhà cung cấp mới', class: 'btn-primary', onClick: () => editSupplier(null, p.ingredientId) },
    ],
  });
}

/** Biểu đồ SVG: tiêu thụ 4 tuần qua (nâu) + dự báo 14 ngày tới (cam). */
async function chart(p) {
  const s = await staffApi(`/api/admin/inventory/forecast/${p.ingredientId}`);
  const pts = [...s.history.map((h) => ({ ...h, f: false })), ...s.forecast.map((f) => ({ ...f, f: true }))];
  const max = Math.max(1, ...pts.map((x) => x.qty));
  const W = 640;
  const H = 200;
  const bw = W / pts.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 20}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tiêu thụ và dự báo ${p.name}`);
  pts.forEach((x, k) => {
    const h = (x.qty / max) * H;
    const r = document.createElementNS(svg.namespaceURI, 'rect');
    r.setAttribute('x', String(k * bw + 1));
    r.setAttribute('y', String(H - h));
    r.setAttribute('width', String(Math.max(1, bw - 2)));
    r.setAttribute('height', String(h));
    r.setAttribute('class', x.f ? 'bar forecast' : 'bar');
    const title = document.createElementNS(svg.namespaceURI, 'title');
    title.textContent = `${fmtDate(x.date)} ${DAYS[x.dow]}: ${num(x.qty)} ${p.unit}${x.f ? ' (dự báo)' : ''}`;
    r.append(title);
    svg.append(r);
    if (x.dow === 1) {
      const t = document.createElementNS(svg.namespaceURI, 'text');
      t.setAttribute('x', String(k * bw));
      t.setAttribute('y', String(H + 14));
      t.setAttribute('class', 'axis');
      t.textContent = fmtDate(x.date).slice(0, 5);
      svg.append(t);
    }
  });
  modal({
    title: `${p.name}: 4 tuần qua + 14 ngày tới`,
    body: el('div', {}, svg, el('p', { class: 'small muted' }, 'Cột nâu: đã dùng; cột cam: dự báo. Rê chuột lên cột để xem số.')),
    actions: [{ label: 'Đóng', class: 'btn-primary' }],
  });
}

// ---------- Đơn đặt hàng (F-030) ----------
async function renderPos() {
  const list = await staffApi('/api/admin/purchase-orders');
  clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editPo(null) }, '+ Tạo đơn đặt hàng'));
  clear(
    body,
    list.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có đơn đặt hàng. Tạo tay hoặc từ tab "Đề xuất nhập hàng".')
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
                ['Đơn', 'Nhà cung cấp', 'Trạng thái', 'Ngày giao dự kiến', 'Tổng', 'Tạo lúc', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              list.map((po) =>
                el(
                  'tr',
                  {},
                  el('td', {}, `#${po.poId}`),
                  el('td', {}, po.supplierName),
                  el('td', {}, el('span', { class: `badge ${STATUS_CLASS[po.status]}` }, STATUS[po.status])),
                  el('td', {}, fmtDate(po.expectedDate)),
                  el('td', { class: 'num' }, money(po.total)),
                  el('td', { class: 'small' }, dateTime(po.createdAt)),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => viewPo(po.poId) }, 'Xem')),
                ),
              ),
            ),
          ),
        ),
  );
}

async function viewPo(id) {
  const po = await staffApi(`/api/admin/purchase-orders/${id}`);
  const act = (label, cls, fn) => ({ label, class: cls, onClick: fn });
  const actions = [{ label: 'Đóng' }];
  if (po.status === 'DRAFT') {
    actions.push(act('Sửa', '', () => editPo(po)));
    actions.push(
      act('Gửi & in', 'btn-primary', async () => {
        try {
          await staffApi(`/api/admin/purchase-orders/${id}/send`, { method: 'POST' });
          window.open(`/admin/purchase-orders/${id}/print`, '_blank');
          load();
        } catch (err) {
          toast(errorMessage(err), 'error');
          return false;
        }
      }),
    );
  } else actions.push(act('In', '', () => window.open(`/admin/purchase-orders/${id}/print`, '_blank')));
  if (['SENT', 'PARTIAL'].includes(po.status)) actions.push(act('Nhận hàng', 'btn-success', () => receivePo(po)));
  if (['DRAFT', 'SENT'].includes(po.status)) {
    actions.push(
      act('Hủy đơn', 'btn-danger', async () => {
        if (!(await confirmDialog(`Hủy đơn #${id}?`, 'Chỉ hủy được đơn chưa nhận hàng.', { okLabel: 'Hủy đơn', danger: true }))) return false;
        try {
          await staffApi(`/api/admin/purchase-orders/${id}/cancel`, { method: 'POST' });
          toast('Đã hủy đơn', 'success');
          load();
        } catch (err) {
          toast(errorMessage(err), 'error');
          return false;
        }
      }),
    );
  }
  modal({
    title: `Đơn đặt hàng #${po.poId} — ${po.supplierName}`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'div',
        {},
        el('span', { class: `badge ${STATUS_CLASS[po.status]}` }, STATUS[po.status]),
        ` · giao dự kiến ${fmtDate(po.expectedDate)}`,
        po.note ? ` · ${po.note}` : '',
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
              ['Nguyên liệu', 'Đặt', 'Đã nhận', 'Giá / gói', 'Thành tiền'].map((h, k) => el('th', { class: k ? 'num' : '' }, h)),
            ),
          ),
          el(
            'tbody',
            {},
            po.lines.map((l) =>
              el(
                'tr',
                {},
                el('td', {}, l.name),
                el(
                  'td',
                  { class: 'num' },
                  `${num(l.orderedPacks)} ${l.packUnitCode}`,
                  el('div', { class: 'small muted' }, `${num(l.orderedBaseQty)} ${l.unit}`),
                ),
                el('td', { class: 'num' }, `${num(l.receivedBaseQty)} ${l.unit}`),
                el('td', { class: 'num' }, l.unitPrice === null ? '—' : money(l.unitPrice)),
                el('td', { class: 'num' }, l.unitPrice === null ? '—' : money(l.unitPrice * l.orderedPacks)),
              ),
            ),
          ),
        ),
      ),
      el('div', { class: 'due' }, el('span', {}, 'Tổng dự kiến'), el('span', {}, money(po.total))),
    ),
    actions,
  });
}

function editPo(po) {
  const isNew = !po;
  const supplier = el(
    'select',
    { class: 'input', name: 'supplierId' },
    state.suppliers
      .filter((s) => s.isActive || s.supplierId === po?.supplierId)
      .map((s) => el('option', { value: s.supplierId, selected: s.supplierId === po?.supplierId }, s.name)),
  );
  const expected = el('input', { class: 'input', type: 'date', name: 'expectedDate', value: po?.expectedDate ?? '' });
  const note = el('input', { class: 'input', name: 'note', maxlength: 200, value: po?.note ?? '' });
  const lines = po
    ? po.lines.map((l) => ({ ingredientId: l.ingredientId, orderedPacks: l.orderedPacks, unitPrice: l.unitPrice ?? '' }))
    : [{ ingredientId: null, orderedPacks: '', unitPrice: '' }];
  const rows = el('div');
  const supplierItems = () => state.suppliers.find((s) => s.supplierId === Number(supplier.value))?.items ?? [];
  const render = () =>
    clear(
      rows,
      lines.map((l, k) => {
        const it = supplierItems().find((i) => i.ingredientId === l.ingredientId);
        return el(
          'div',
          { class: 'receipt-row' },
          el(
            'select',
            { class: 'input', 'aria-label': 'Nguyên liệu', onchange: (e) => ((l.ingredientId = Number(e.target.value) || null), render()) },
            el('option', { value: '' }, '— Nguyên liệu —'),
            supplierItems().map((i) =>
              el(
                'option',
                { value: i.ingredientId, selected: i.ingredientId === l.ingredientId },
                `${i.name} (gói ${i.packUnitCode} = ${num(i.packSize)} ${i.unit})`,
              ),
            ),
          ),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: `Số ${it?.packUnitCode ?? 'gói'}`,
            value: l.orderedPacks,
            oninput: (e) => (l.orderedPacks = e.target.value),
          }),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: `Giá / gói (gần nhất ${it?.lastPrice ? money(it.lastPrice) : '—'})`,
            value: l.unitPrice,
            oninput: (e) => (l.unitPrice = e.target.value),
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
        );
      }),
    );
  supplier.addEventListener('change', render);
  render();
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Nhà cung cấp'), supplier),
      el('div', { class: 'field' }, el('label', {}, 'Ngày giao dự kiến'), expected),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Ghi chú'), note),
    el('label', {}, 'Nguyên liệu (chỉ nguyên liệu đã gán cho nhà cung cấp ở tab Nhà cung cấp)'),
    rows,
    el(
      'button',
      {
        class: 'btn btn-sm',
        type: 'button',
        onclick: () => {
          lines.push({ ingredientId: null, orderedPacks: '', unitPrice: '' });
          render();
        },
      },
      '+ Dòng',
    ),
  );
  modal({
    title: isNew ? 'Tạo đơn đặt hàng' : `Sửa đơn #${po.poId}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu nháp',
        class: 'btn-primary',
        onClick: async () => {
          const body2 = {
            supplierId: Number(supplier.value),
            expectedDate: expected.value || null,
            note: note.value || null,
            lines: lines
              .filter((l) => l.ingredientId)
              .map((l) => ({ ingredientId: l.ingredientId, orderedPacks: Number(l.orderedPacks), unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice) })),
          };
          try {
            if (isNew) await staffApi('/api/admin/purchase-orders', { method: 'POST', body: body2 });
            else await staffApi(`/api/admin/purchase-orders/${po.poId}`, { method: 'PUT', body: body2 });
            toast('Đã lưu đơn đặt hàng nháp', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

const receivePo = (po) => receivePoDialog(po, { url: `/api/admin/purchase-orders/${po.poId}/receive`, onDone: load, ingredients: state.ingredients });

// ---------- Nhà cung cấp ----------
function renderSuppliers() {
  clear($('#head-actions'), el('button', { class: 'btn btn-primary', type: 'button', onclick: () => editSupplier(null) }, '+ Thêm nhà cung cấp'));
  clear(
    body,
    state.suppliers.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có nhà cung cấp.')
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
                ['Nhà cung cấp', 'Liên hệ', 'Giao hàng', 'Nguyên liệu', ''].map((h) => el('th', {}, h)),
              ),
            ),
            el(
              'tbody',
              {},
              state.suppliers.map((s) =>
                el(
                  'tr',
                  { style: { opacity: s.isActive ? 1 : 0.55 } },
                  el('td', {}, el('strong', {}, s.name), s.note ? el('div', { class: 'small muted' }, s.note) : null),
                  el('td', { class: 'small' }, [s.phone, s.email].filter(Boolean).join(' · ') || '—'),
                  el('td', { class: 'small' }, `${daysText(s.deliveryDaysMask)} · sau ${s.leadTimeDays} ngày`),
                  el(
                    'td',
                    { class: 'small' },
                    s.items.map((i) =>
                      el(
                        'div',
                        {},
                        i.isPreferred ? icon('star', { filled: true, label: 'Nhà cung cấp ưu tiên' }) : '',
                        `${i.name}: gói ${i.packUnitCode} (${num(i.packSize)} ${i.unit})`,
                        i.lastPrice ? ` · ${money(i.lastPrice)}` : '',
                      ),
                    ),
                  ),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editSupplier(s) }, 'Sửa')),
                ),
              ),
            ),
          ),
        ),
  );
}

function editSupplier(s, addIngredientId = null) {
  const isNew = !s;
  const items = s ? s.items.map((i) => ({ ...i })) : [];
  // Mở từ "Gán nhà cung cấp" (DEF-016): thêm sẵn dòng nguyên liệu, gói mặc định theo đơn vị gốc
  if (addIngredientId && !items.some((i) => i.ingredientId === addIngredientId)) {
    const unit = state.ingredients.find((i) => i.ingredientId === addIngredientId)?.unit;
    const packUnitCode = state.units.some((u) => u.unitCode === unit) ? unit : state.units[0]?.unitCode;
    items.push({ ingredientId: addIngredientId, packUnitCode, packSize: '', lastPrice: '', isPreferred: true });
  }
  const rows = el('div');
  const render = () =>
    clear(
      rows,
      items.map((it, k) =>
        el(
          'div',
          { class: 'receipt-row' },
          el(
            'select',
            { class: 'input', 'aria-label': 'Nguyên liệu', onchange: (e) => (it.ingredientId = Number(e.target.value) || null) },
            el('option', { value: '' }, '— Nguyên liệu —'),
            state.ingredients.map((i) => el('option', { value: i.ingredientId, selected: i.ingredientId === it.ingredientId }, `${i.name} (${i.unit})`)),
          ),
          el(
            'select',
            { class: 'input', 'aria-label': 'Đơn vị gói', style: { maxWidth: '9rem' }, onchange: (e) => (it.packUnitCode = e.target.value) },
            state.units.map((u) => el('option', { value: u.unitCode, selected: u.unitCode === it.packUnitCode }, u.unitCode)),
          ),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: 'SL gốc / gói (trống = tự quy đổi)',
            value: it.packSize ?? '',
            oninput: (e) => (it.packSize = e.target.value),
          }),
          el('input', {
            class: 'input',
            type: 'number',
            min: 0,
            step: 'any',
            placeholder: 'Giá / gói',
            value: it.lastPrice ?? '',
            oninput: (e) => (it.lastPrice = e.target.value),
          }),
          el(
            'label',
            { class: 'check' },
            el('input', { type: 'checkbox', checked: it.isPreferred, onchange: (e) => (it.isPreferred = e.target.checked) }),
            'Ưu tiên',
          ),
          el(
            'button',
            {
              class: 'btn btn-sm btn-ghost',
              type: 'button',
              'aria-label': 'Bỏ dòng',
              onclick: () => {
                items.splice(k, 1);
                render();
              },
            },
            icon('x'),
          ),
        ),
      ),
    );
  render();
  const mask = s?.deliveryDaysMask ?? 127;
  const form = el(
    'form',
    { class: 'stack' },
    el(
      'div',
      { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', {}, 'Tên'), el('input', { class: 'input', name: 'name', maxlength: 100, value: s?.name ?? '' })),
      el('div', { class: 'field' }, el('label', {}, 'Điện thoại'), el('input', { class: 'input', name: 'phone', maxlength: 20, value: s?.phone ?? '' })),
      el('div', { class: 'field' }, el('label', {}, 'Email'), el('input', { class: 'input', name: 'email', maxlength: 100, value: s?.email ?? '' })),
      el(
        'div',
        { class: 'field' },
        el('label', {}, 'Giao sau (ngày)'),
        el('input', { class: 'input', name: 'leadTimeDays', type: 'number', min: 0, max: 60, value: s?.leadTimeDays ?? 1 }),
      ),
    ),
    el(
      'div',
      { class: 'field' },
      el('label', {}, 'Ngày giao trong tuần'),
      el(
        'div',
        { class: 'days' },
        DAYS.map((d, i) => el('label', {}, el('input', { type: 'checkbox', name: 'dow', value: i, checked: Boolean(mask & (1 << i)) }), d)),
      ),
    ),
    el('div', { class: 'field' }, el('label', {}, 'Ghi chú'), el('input', { class: 'input', name: 'note', maxlength: 200, value: s?.note ?? '' })),
    el('label', {}, 'Nguyên liệu cung cấp (gói đặt hàng; ', icon('star', { filled: true, label: 'ngôi sao' }), '= nhà cung cấp ưu tiên khi đề xuất nhập)'),
    rows,
    el(
      'button',
      {
        class: 'btn btn-sm',
        type: 'button',
        onclick: () => {
          items.push({ ingredientId: null, packUnitCode: state.units[0]?.unitCode, packSize: '', lastPrice: '', isPreferred: false });
          render();
        },
      },
      '+ Nguyên liệu',
    ),
    el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: s?.isActive ?? true }), 'Đang hợp tác'),
  );
  modal({
    title: isNew ? 'Thêm nhà cung cấp' : `Sửa: ${s.name}`,
    body: form,
    actions: [
      { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          const f = (n) => form.elements.namedItem(n);
          const body2 = {
            name: f('name').value,
            phone: f('phone').value || null,
            email: f('email').value || null,
            leadTimeDays: Number(f('leadTimeDays').value || 0),
            deliveryDaysMask: [...form.querySelectorAll('input[name="dow"]:checked')].reduce((m, x) => m | (1 << Number(x.value)), 0),
            note: f('note').value || null,
            isActive: f('isActive').checked,
            items: items
              .filter((i) => i.ingredientId)
              .map((i) => ({
                ingredientId: i.ingredientId,
                packUnitCode: i.packUnitCode,
                packSize: i.packSize === '' || i.packSize === null ? null : Number(i.packSize),
                lastPrice: i.lastPrice === '' || i.lastPrice === null ? null : Number(i.lastPrice),
                isPreferred: Boolean(i.isPreferred),
              })),
          };
          try {
            if (isNew) await staffApi('/api/admin/suppliers', { method: 'POST', body: body2 });
            else await staffApi(`/api/admin/suppliers/${s.supplierId}`, { method: 'PUT', body: body2 });
            toast('Đã lưu nhà cung cấp', 'success');
            load();
          } catch (err) {
            if (!showFieldErrors(form, err)) toast(errorMessage(err), 'error', 6000);
            return false;
          }
        },
      },
    ],
  });
}

// ---------- Báo cáo giá & giao hàng ----------
async function renderReport() {
  const r = await staffApi(`/api/admin/reports/suppliers?from=${state.from}&to=${state.to}`);
  clear(
    body,
    el('h2', { style: { fontSize: '1rem' } }, `Giao hàng (${fmtDate(state.from)} – ${fmtDate(state.to)})`),
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
            ['Nhà cung cấp', 'Số đơn', 'Đã nhận đủ', 'Đúng hạn', 'Đủ hàng'].map((h, k) => el('th', { class: k ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.performance.map((p) =>
            el(
              'tr',
              {},
              el('td', {}, p.name),
              el('td', { class: 'num' }, p.pos),
              el('td', { class: 'num' }, p.received),
              el('td', { class: 'num' }, p.onTimePct === null ? '—' : `${p.onTimePct}%`),
              el('td', { class: 'num' }, p.fillPct === null ? '—' : `${p.fillPct}%`),
            ),
          ),
        ),
      ),
    ),
    el('h2', { style: { fontSize: '1rem', marginTop: '1rem' } }, 'Lịch sử giá nhập'),
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
            ['Ngày', 'Nguyên liệu', 'Nhà cung cấp', 'Giá / gói', 'Giá / đơn vị gốc'].map((h, k) => el('th', { class: k >= 3 ? 'num' : '' }, h)),
          ),
        ),
        el(
          'tbody',
          {},
          r.prices.map((p) =>
            el(
              'tr',
              {},
              el('td', { class: 'small' }, dateTime(p.recordedAt)),
              el('td', {}, p.name),
              el('td', {}, p.supplierName),
              el('td', { class: 'num' }, p.packPrice === null ? '—' : `${money(p.packPrice)}${p.packUnitCode ? ` / ${p.packUnitCode}` : ''}`),
              el('td', { class: 'num' }, `${num(p.unitCost)}đ / ${p.unit}`),
            ),
          ),
        ),
      ),
    ),
  );
}

load();
