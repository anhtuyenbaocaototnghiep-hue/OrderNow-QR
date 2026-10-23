// S-10 Dashboard quầy (FEATURE-007): cột Mới / Đang pha + dải Đã xong; vùng "Cần xử lý ngay"; lưới bàn (ADR-018, TASK-072).
// S-11 chi tiết đơn, S-14 thu tiền bàn (FEATURE-006). Mất kết nối → tải lại + "Có đơn hàng bị trễ" (REQ-017, AC-007-05).
// ADR-005: dải Gọi nhân viên (F-021), thu tiền có hội viên (F-014) + giảm giá tay (F-022) xem trước bằng số server tính, cần ca mở (F-018).
// F-024: ghi chú bàn (chỉ nhân viên thấy), nút "Gọi món" sang trang gọi món tại bàn, phiếu ghi nhân viên nhập đơn.
// ADR-006: hàng chờ + thời gian chờ ước tính ở cột Mới (F-025); bàn chia bill → thu từng phần, in bill từng phần, "Thu chung" (F-026).
import { staffApi } from '../api.js';
import { billingControls } from '../billing-controls.js';
import { mountPosShell } from '../pos-shell.js';
import { printUrl } from '../print.js';
import { connectRealtime } from '../socket.js';
import { getToken } from '../auth.js';
import {
  $,
  breakdownRows,
  clear,
  confirmDialog,
  el,
  elapsed,
  errorMessage,
  modal,
  money,
  moneyInput,
  moneyValue,
  num,
  paymentBadge,
  playSound,
  setBusy,
  setMoney,
  statusBadge,
  time,
  toast,
} from '../ui.js';
import { icon } from '../icons.js';

const shell = await mountPosShell('orders');
// F-055 (ADR-017 D-65): chưa mở ca thì khóa mọi nút xử lý đơn; lý do đọc ở dải #no-shift (aria-describedby). Server cũng chặn 409 NO_OPEN_SHIFT
const NO_SHIFT_HINT = 'Chưa mở ca — bấm "Mở ca" ở dải phía trên để xử lý đơn';
const shiftGate = () => (shell.shift ? {} : { disabled: true, title: NO_SHIFT_HINT, 'aria-describedby': 'no-shift' });

const state = { orders: new Map(), sessions: [], tables: [], calls: [], lowReviews: [], fresh: new Set(), drawer: null };
const COLUMNS = ['PENDING', 'PREPARING', 'COMPLETED'];

// ---------- Tải ảnh chụp ----------
async function loadOrders() {
  const list = await staffApi('/api/orders');
  state.orders = new Map(list.map((o) => [o.orderId, o]));
}

async function loadSessions() {
  state.sessions = await staffApi('/api/sessions?status=OPEN,PAYMENT_REQUESTED');
}

// ADR-018 D-69: lưới bàn cần cả bàn trống → danh sách bàn đang bật; nhóm vẫn đọc từ /api/sessions (bàn vừa bị tắt vẫn thấy nhóm)
async function loadTables() {
  const list = await staffApi('/api/tables').catch(() => null); // lỗi danh sách bàn không chặn tải bảng đơn — giữ danh sách cũ
  if (list) state.tables = list.map(({ tableId, name }) => ({ tableId, name }));
}

async function loadCalls() {
  state.calls = await staffApi('/api/staff-calls');
}

// F-051: đánh giá thấp (món ≤ 2 sao) chưa xử lý trong ngày
async function loadLowReviews() {
  state.lowReviews = await staffApi('/api/reviews/alerts').catch(() => state.lowReviews); // lỗi dải cảnh báo không chặn tải bảng đơn
}

async function loadAll({ detectLate = false } = {}) {
  const knownOrders = new Set(state.orders.keys());
  const knownPayReq = new Set(state.sessions.filter((s) => s.status === 'PAYMENT_REQUESTED').map((s) => s.sessionId));
  const knownCalls = new Set(state.calls.map((c) => c.callId));
  try {
    await Promise.all([loadOrders(), loadSessions(), loadTables(), loadCalls(), loadLowReviews()]);
  } catch (err) {
    toast(errorMessage(err), 'error');
    return;
  }
  if (detectLate) {
    const lateOrders = [...state.orders.values()].filter((o) => !knownOrders.has(o.orderId) && o.status === 'PENDING');
    const latePays = state.sessions.filter((s) => s.status === 'PAYMENT_REQUESTED' && !knownPayReq.has(s.sessionId));
    const lateCalls = state.calls.filter((c) => !knownCalls.has(c.callId));
    if (lateOrders.length || latePays.length || lateCalls.length) {
      const parts = [];
      if (lateOrders.length) parts.push(`${lateOrders.length} đơn mới`);
      if (latePays.length) parts.push(`${latePays.length} bàn gọi thanh toán`);
      if (lateCalls.length) parts.push(`${lateCalls.length} bàn gọi nhân viên`);
      const banner = $('#late');
      clear(
        banner,
        `Có đơn hàng bị trễ trong lúc mất kết nối: ${parts.join(', ')}. `,
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => (banner.hidden = true) }, 'Đã xem'),
      );
      banner.hidden = false;
      lateOrders.forEach((o) => state.fresh.add(o.orderId));
      playSound(latePays.length ? 'chime' : lateCalls.length ? 'bell' : 'ting');
    }
  }
  renderBoard();
  renderSessions();
  renderCalls();
  renderReviews();
  refreshQueueEta();
  if (state.drawer) state.drawer.reload();
}

// F-025: "Hàng chờ: 6 món · ~9 phút" (khách gọi lúc này chờ khoảng bao lâu)
let etaTimer = null;
function refreshQueueEta() {
  clearTimeout(etaTimer);
  etaTimer = setTimeout(async () => {
    try {
      const e = await staffApi('/api/queue/eta');
      $('#queue-eta').textContent = e.queueLength
        ? `Hàng chờ: ${e.queueLength} món · khách mới chờ ~${e.minMinutes}–${e.maxMinutes} phút`
        : 'Không có món đang chờ';
    } catch {
      /* lần sau */
    }
  }, 400);
}

let sessionsTimer = null;
function refreshSessionsSoon() {
  clearTimeout(sessionsTimer);
  sessionsTimer = setTimeout(async () => {
    try {
      await loadSessions();
      renderSessions();
    } catch {
      /* lần kết nối lại sau sẽ tải lại */
    }
  }, 150);
}

// ---------- Bảng đơn ----------
const whereLabel = (o) => (o.type === 'TAKE_AWAY' ? 'Mang đi' : (o.table?.name ?? 'Bàn ?'));

/** Dòng món trên phiếu: tùy chọn (F-013) và thành phần combo (F-015) để người pha làm đúng. */
const itemDetail = (i) => [
  i.options?.length ? el('span', { class: 'opts' }, i.options.map((o) => o.name).join(', ')) : null,
  i.children?.length ? el('span', { class: 'opts' }, i.children.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
  i.note ? el('span', { class: 'note' }, i.note) : null,
];

// D-68: thời gian chờ từ lúc đặt — từ 8 phút vàng, từ 15 phút đỏ (đề xuất, chỉnh sau)
const WAIT_WARN_MIN = 8;
const WAIT_LATE_MIN = 15;
function markWait(chip, since) {
  const min = (Date.now() - new Date(since).getTime()) / 60000;
  chip.classList.toggle('warn', min >= WAIT_WARN_MIN && min < WAIT_LATE_MIN);
  chip.classList.toggle('late', min >= WAIT_LATE_MIN);
}

// Enter trên chính phiếu mới mở chi tiết — Enter ở nút trong phiếu chỉ bấm nút (review G3)
const openOnKey = (o) => (e) => e.key === 'Enter' && e.target === e.currentTarget && openOrder(o.orderId);

function ticket(o) {
  if (o.status === 'COMPLETED') return doneTicket(o);
  const actions = [];
  const gate = shiftGate();
  if (o.status === 'PENDING') {
    actions.push(el('button', { class: 'btn btn-primary', type: 'button', ...gate, onclick: (e) => act(e, () => accept(o, e.currentTarget)) }, 'Tiếp nhận'));
    actions.push(
      el('button', { class: 'btn', type: 'button', ...gate, onclick: (e) => act(e, () => acceptAndComplete(o, e.currentTarget)) }, 'Tiếp nhận & Hoàn tất'),
    );
    actions.push(el('button', { class: 'btn btn-danger', type: 'button', ...gate, onclick: (e) => act(e, () => cancelOrder(o)) }, 'Hủy'));
  } else if (o.status === 'PREPARING') {
    actions.push(el('button', { class: 'btn btn-success', type: 'button', ...gate, onclick: (e) => act(e, () => complete(o, e.currentTarget)) }, 'Hoàn tất'));
  }
  const wait = el(
    'span',
    { class: 'wait-chip' },
    icon('clock', { label: 'Đã chờ' }),
    el('span', { class: 'ago', dataset: { since: o.createdAt } }, elapsed(o.createdAt)),
  );
  markWait(wait, o.createdAt);
  return el(
    'article',
    {
      class: `ticket ${o.status.toLowerCase()} ${state.fresh.has(o.orderId) ? 'fresh' : ''}`,
      tabindex: 0,
      onclick: () => openOrder(o.orderId),
      onkeydown: openOnKey(o),
    },
    el('div', { class: 'ticket-head' }, el('span', { class: 'where' }, whereLabel(o)), wait),
    el(
      'div',
      { class: 'ticket-meta' },
      el('span', { class: 'code' }, `#${o.orderCode}`),
      el('span', {}, `đặt ${time(o.createdAt)}`),
      o.type === 'DINE_IN' && o.createdBy ? el('span', { class: 'by-staff' }, `Nhân viên nhập: ${o.createdBy.fullName}`) : null,
    ),
    el(
      'ul',
      {},
      o.items.map((i) => el('li', {}, el('span', { class: 'qty' }, `${i.quantity}×`), i.name, itemDetail(i))),
    ),
    o.note ? el('div', { class: 'order-note' }, `Ghi chú đơn: ${o.note}`) : null,
    el('div', { class: 'ticket-foot' }, el('strong', {}, money(o.totalAmount)), paymentBadge(o.paymentStatus)),
    actions.length ? el('div', { class: 'ticket-actions' }, actions) : null,
  );
}

/** Phiếu đã xong rút gọn một dòng: bàn · mã · món · tổng · đã / chưa thu · giờ xong (D-68). */
function doneTicket(o) {
  const items = o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
  return el(
    'article',
    { class: 'ticket completed compact', tabindex: 0, title: items, onclick: () => openOrder(o.orderId), onkeydown: openOnKey(o) },
    el('span', { class: 'where' }, whereLabel(o)),
    el('span', { class: 'code' }, `#${o.orderCode}`),
    el('span', { class: 'items' }, items),
    el('strong', {}, money(o.totalAmount)),
    paymentBadge(o.paymentStatus),
    o.completedAt ? el('span', { class: 'done-at' }, `xong ${time(o.completedAt)}`) : null,
  );
}

function act(e, fn) {
  e.stopPropagation();
  fn();
}

// Chỉ dựng lại phiếu nào thực sự đổi (khóa theo trạng thái/nội dung) — tránh mất cú bấm khi sự kiện realtime đến cùng lúc
const ticketCache = new Map(); // orderId → { key, node }
// Có bàn trong khóa: chuyển bàn (F-049) phải vẽ lại thẻ đơn với bàn mới
// Có ca trong khóa: mở / đóng ca (F-055) phải vẽ lại để bật / khóa nút xử lý đơn
const ticketKey = (o) =>
  [o.status, o.paymentStatus, o.totalAmount, o.items.length, o.acceptedAt, o.completedAt, o.paidAt, o.table?.tableId, shell.shift ? 1 : 0].join('|');
shell.onShiftChange(() => {
  renderBoard();
  renderSessions();
});

function ticketNode(o) {
  const key = ticketKey(o);
  const cached = ticketCache.get(o.orderId);
  if (cached && cached.key === key) return cached.node;
  const node = ticket(o);
  ticketCache.set(o.orderId, { key, node });
  return node;
}

const EMPTY_TEXT = { PENDING: 'Chưa có đơn mới', PREPARING: 'Không có đơn đang pha', COMPLETED: 'Chưa có đơn xong hôm nay' };

function renderBoard() {
  const byStatus = { PENDING: [], PREPARING: [], COMPLETED: [] };
  for (const o of state.orders.values()) byStatus[o.status]?.push(o);
  byStatus.COMPLETED.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  for (const id of ticketCache.keys()) if (!state.orders.has(id)) ticketCache.delete(id);
  for (const s of COLUMNS) {
    $(`#count-${s}`).textContent = byStatus[s].length;
    const col = $(`#col-${s}`);
    if (byStatus[s].length === 0) {
      clear(col, el('div', { class: 'col-empty' }, icon(s === 'COMPLETED' ? 'coffee' : 'circle-check'), EMPTY_TEXT[s]));
      continue;
    }
    const nodes = byStatus[s].map(ticketNode);
    const same = nodes.length === col.children.length && nodes.every((n, i) => col.children[i] === n);
    if (!same) col.replaceChildren(...nodes);
  }
  setTimeout(() => {
    state.fresh.clear();
    document.querySelectorAll('.ticket.fresh').forEach((n) => n.classList.remove('fresh'));
  }, 3000);
}

// ---------- Hành động trên đơn ----------
async function run(button, fn, okMessage) {
  setBusy(button, true);
  try {
    const result = await fn();
    if (okMessage) toast(okMessage, 'success');
    return result;
  } catch (err) {
    toast(errorMessage(err), err.code === 'ALREADY_PROCESSED' ? 'warning' : 'error', 5000);
    if (err.code === 'NO_OPEN_SHIFT') shell.reloadShift(); // ca đã bị đóng ở máy khác lúc mất kết nối → khóa lại nút
    await loadAll();
    return null;
  } finally {
    setBusy(button, false);
  }
}

function upsert(order) {
  if (!order) return;
  if (order.status === 'CANCELLED' || order.status === 'VOIDED') state.orders.delete(order.orderId);
  else state.orders.set(order.orderId, order);
  renderBoard();
}

async function accept(o, button) {
  const r = await run(button, () => staffApi(`/api/orders/${o.orderId}/accept`, { method: 'POST' }));
  upsert(r?.order);
  return r;
}

async function complete(o, button) {
  const r = await run(button, () => staffApi(`/api/orders/${o.orderId}/complete`, { method: 'POST' }), `Đã hoàn tất #${o.orderCode}`);
  upsert(r?.order);
  return r;
}

async function acceptAndComplete(o, button) {
  const r = await accept(o, button);
  if (r?.order) await complete(r.order, button);
}

async function cancelOrder(o) {
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Ví dụ: khách đổi ý, quán hết món…' });
  const ok = await modal({
    title: `Hủy đơn #${o.orderCode}?`,
    body: el(
      'div',
      {},
      el('p', {}, `${whereLabel(o)} · ${money(o.totalAmount)}. Phần nguyên liệu đã giữ sẽ được trả lại kho.`),
      el('label', {}, 'Lý do (không bắt buộc)'),
      reason,
    ),
    actions: [
      { label: 'Không', value: false },
      { label: 'Hủy đơn', class: 'btn-danger', value: true },
    ],
  }).result;
  if (ok !== true) return;
  const r = await run(
    null,
    () => staffApi(`/api/orders/${o.orderId}/cancel`, { method: 'POST', body: { reason: reason.value.trim() || null } }),
    `Đã hủy #${o.orderCode}`,
  );
  upsert(r?.order);
}

// ---------- S-11 Chi tiết đơn ----------
function openOrder(orderId) {
  const o = state.orders.get(orderId);
  if (!o) return;
  const actions = [];
  if (o.type === 'TAKE_AWAY') actions.push({ label: 'In lại bill', onClick: () => printUrl(`/pos/orders/${o.orderId}/receipt`) });
  if (o.sessionId) actions.push({ label: 'Mở bàn / Thu tiền', onClick: () => openSettle(o.sessionId) });
  // F-055: chưa mở ca thì chi tiết đơn không có nút xử lý (review G3 TASK-072)
  if (o.status === 'PENDING' && shell.shift) actions.push({ label: 'Tiếp nhận', class: 'btn-primary', onClick: () => accept(o, null) });
  if (o.status === 'PREPARING' && shell.shift) actions.push({ label: 'Hoàn tất', class: 'btn-success', onClick: () => complete(o, null) });
  modal({
    title: `Đơn #${o.orderCode}`,
    drawer: true,
    body: el(
      'div',
      { class: 'stack' },
      el('div', { class: 'row wrap' }, el('strong', { style: { fontSize: '1.2rem' } }, whereLabel(o)), statusBadge(o.status), paymentBadge(o.paymentStatus)),
      el(
        'div',
        { class: 'muted small' },
        `Tạo lúc ${time(o.createdAt)}${o.createdBy ? ` bởi ${o.createdBy.fullName}` : ' (khách gọi qua QR)'}`,
        o.acceptedAt ? ` · Tiếp nhận ${time(o.acceptedAt)}` : '',
        o.completedAt ? ` · Xong ${time(o.completedAt)}` : '',
      ),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'table' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Món'), el('th', { class: 'num' }, 'SL'), el('th', { class: 'num' }, 'Thành tiền'))),
          el(
            'tbody',
            {},
            o.items.map((i) =>
              el(
                'tr',
                {},
                el(
                  'td',
                  {},
                  i.name,
                  i.promotionName ? el('span', { class: 'badge danger', style: { marginLeft: '0.35rem' } }, i.promotionName) : null,
                  i.options?.length ? el('div', { class: 'small opts' }, i.options.map((x) => x.name).join(', ')) : null,
                  i.children?.length ? el('div', { class: 'small muted' }, i.children.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
                  i.note ? el('div', { class: 'small', style: { color: '#b4530a' } }, i.note) : null,
                ),
                el('td', { class: 'num' }, i.quantity),
                el('td', { class: 'num' }, money(i.lineTotal)),
              ),
            ),
          ),
        ),
      ),
      o.orderPromotion ? el('div', { class: 'small' }, `Khuyến mãi đơn "${o.orderPromotion.name}": −${money(o.orderPromotion.discount)}`) : null,
      el('div', { class: 'due' }, el('span', {}, 'Tổng'), el('span', {}, money(o.totalAmount))),
    ),
    actions,
  });
}

// ---------- Dải gọi thanh toán + gọi nhân viên + lưới bàn ----------
function renderSessions() {
  renderPayStrip();
  renderTables();
}

function renderPayStrip() {
  const requested = state.sessions
    .filter((s) => s.status === 'PAYMENT_REQUESTED')
    .sort((a, b) => new Date(a.paymentRequestedAt) - new Date(b.paymentRequestedAt));
  const strip = $('#pay-strip');
  strip.hidden = requested.length === 0;
  clear(
    strip,
    el('span', { class: 'label' }, icon('bell-ring'), 'Gọi thanh toán'),
    requested.map((s) =>
      el(
        'button',
        { class: 'pay-card', type: 'button', onclick: () => openSettle(s.sessionId) },
        el('strong', {}, s.table.name),
        el('span', {}, money(s.amountDue)),
        el('span', { class: 'wait', dataset: { since: s.paymentRequestedAt } }, elapsed(s.paymentRequestedAt)),
      ),
    ),
  );
}

// D-69: trạng thái nhóm bằng màu + chữ; ưu tiên gọi thanh toán > có đơn chờ tiếp nhận > đang phục vụ
const groupState = (s) => (s.status === 'PAYMENT_REQUESTED' ? 'pay' : s.pendingCount ? 'waiting' : 'serving');
const stateText = (s, st) =>
  st === 'pay'
    ? [
        'Gọi thanh toán · ',
        el('span', { class: 'wait', dataset: { since: s.paymentRequestedAt } }, elapsed(s.paymentRequestedAt)),
        // Còn đơn chờ tiếp nhận thì chưa thu được (BR-019) — vẫn báo trên thẻ (review G3)
        s.pendingCount ? ` · ${s.pendingCount} đơn chờ tiếp nhận` : '',
      ]
    : st === 'waiting'
      ? `${s.pendingCount} đơn chờ tiếp nhận`
      : 'Đang phục vụ';

/** Thẻ một nhóm khách (bàn có nhiều nhóm — bill riêng — thì mỗi nhóm một thẻ). Giữ lớp .table-row cho test. */
function groupCard(s, groupNo) {
  const st = groupState(s);
  return el(
    'div',
    { class: `tbl-card table-row ${st}` },
    el(
      'div',
      { class: 'tc-head' },
      el('span', { class: 'name' }, s.table.name, groupNo ? el('span', { class: 'grp' }, `Nhóm ${groupNo}`) : null),
      el(
        'div',
        { class: 'tc-tools' },
        el(
          'button',
          {
            class: 'btn',
            type: 'button',
            'aria-label': s.note ? 'Sửa ghi chú' : 'Ghi chú',
            title: s.note ? 'Sửa ghi chú bàn' : 'Ghi chú bàn',
            onclick: () => editNote(s),
          },
          icon('notebook-pen'),
        ),
        el(
          'button',
          { class: 'btn', type: 'button', 'aria-label': `Chuyển bàn ${s.table.name}`, title: 'Chuyển bàn', ...shiftGate(), onclick: () => moveTable(s) },
          icon('arrow-left-right'),
        ),
      ),
    ),
    el('span', { class: 'tc-state' }, stateText(s, st)),
    s.orderCount ? el('div', { class: 'tc-amount' }, money(s.amountDue)) : null,
    el(
      'div',
      { class: 'tc-meta' },
      s.orderCount ? `${s.orderCount} đơn · ` : 'Chưa gọi món · ',
      `mở ${time(s.openedAt)}${s.openedBy ? ` bởi ${s.openedBy.fullName}` : ''}`,
    ),
    s.splitCount
      ? el('div', { class: 'tc-meta split-info' }, icon('receipt'), `Chia ${s.splitCount} phần${s.paidAmount ? ` · đã thu ${money(s.paidAmount)}` : ''}`)
      : null,
    s.member ? el('div', { class: 'tc-meta' }, icon('star', { label: 'Hội viên' }), `${s.member.fullName} (${s.member.tierName})`) : null,
    s.lastMove ? el('div', { class: 'tc-meta' }, icon('corner-down-right'), `Chuyển từ ${s.lastMove.fromTable} lúc ${time(s.lastMove.movedAt)}`) : null,
    s.note ? el('div', { class: 'table-note' }, icon('notebook-pen', { label: 'Ghi chú' }), s.note) : null,
    el(
      'div',
      { class: 'tc-main' },
      el('a', { class: 'btn', href: tableOrderUrl(s), 'aria-label': `Gọi món ${s.table.name}` }, 'Gọi món'),
      s.orderCount > 0
        ? el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openSettle(s.sessionId) }, 'Thu tiền')
        : el('button', { class: 'btn', type: 'button', 'aria-label': 'Đóng bàn trống', onclick: () => closeEmpty(s) }, 'Đóng bàn'),
    ),
  );
}

const emptyCard = (t) =>
  el(
    'div',
    { class: 'tbl-card free' },
    el('div', { class: 'tc-head' }, el('span', { class: 'name' }, t.name)),
    el('span', { class: 'tc-state' }, 'Trống'),
    el(
      'div',
      { class: 'tc-main' },
      el('a', { class: 'btn', href: `/pos/table-order?table=${t.tableId}`, 'aria-label': `Gọi món ${t.name}` }, icon('plus'), 'Gọi món'),
    ),
  );

function renderTables() {
  const byTable = new Map();
  const byOpened = [...state.sessions].sort((a, b) => new Date(a.openedAt) - new Date(b.openedAt));
  for (const s of byOpened) byTable.set(s.table.tableId, [...(byTable.get(s.table.tableId) ?? []), s]);
  const cards = state.tables.map((t) => {
    const groups = byTable.get(t.tableId);
    byTable.delete(t.tableId);
    return groups ? groups.map((s, i) => groupCard(s, groups.length > 1 ? i + 1 : 0)) : emptyCard(t);
  });
  // Nhóm ở bàn không còn trong danh sách (vừa bị tắt / thêm sau lần tải) vẫn hiện — không mất yêu cầu thanh toán
  for (const groups of byTable.values()) cards.push(groups.map((s) => groupCard(s, 0)));

  const busy = new Set(state.sessions.map((s) => s.table.tableId)).size;
  const pays = state.sessions.filter((s) => s.status === 'PAYMENT_REQUESTED').length;
  const waits = state.sessions.filter((s) => s.pendingCount > 0).length;
  const free = state.tables.filter((t) => !state.sessions.some((s) => s.table.tableId === t.tableId)).length;
  clear(
    $('#tables-summary'),
    el('span', { class: 'serving' }, `${busy} bàn có khách`),
    pays ? el('span', { class: 'pay' }, `${pays} gọi thanh toán`) : null,
    waits ? el('span', { class: 'waiting' }, `${waits} có đơn chờ`) : null,
    el('span', { class: 'free' }, `${free} bàn trống`),
  );
  clear($('#tables-toggle'), icon('layout-grid'), `Bàn · ${busy} có khách`, pays ? el('span', { class: 'badge pending' }, `${pays} gọi thanh toán`) : null);
  const box = $('#tables');
  if (cards.length === 0) return clear(box, el('p', { class: 'muted small' }, 'Chưa có bàn nào — thêm bàn ở Quản lý › Bàn & mã QR.'));
  clear(box, cards);
}

function renderCalls() {
  const strip = $('#call-strip');
  strip.hidden = state.calls.length === 0;
  clear(
    strip,
    el('span', { class: 'label' }, icon('hand'), 'Gọi nhân viên'),
    state.calls.map((c) =>
      el(
        'div',
        { class: 'pay-card call-card' },
        el('strong', {}, c.table.name),
        el('span', {}, c.message || 'Cần hỗ trợ'),
        el('span', { class: 'wait', dataset: { since: c.requestedAt } }, elapsed(c.requestedAt)),
        el('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: (e) => handleCall(c, e.currentTarget) }, 'Đã xử lý'),
      ),
    ),
  );
}

function renderReviews() {
  const strip = $('#review-strip');
  strip.hidden = state.lowReviews.length === 0;
  clear(
    strip,
    el('span', { class: 'label' }, icon('triangle-alert'), 'Đánh giá thấp'),
    state.lowReviews.map((r) =>
      el(
        'div',
        { class: 'pay-card call-card review-card' },
        el('strong', {}, r.table.name),
        el(
          'span',
          {},
          r.items
            .filter((i) => i.stars <= 2)
            .map((i) => `${i.name} ${i.stars}★`)
            .join(', '),
        ),
        r.comment ? el('span', { class: 'small' }, `“${r.comment}”`) : null,
        el('span', { class: 'wait', dataset: { since: r.createdAt } }, elapsed(r.createdAt)),
        el(
          'button',
          {
            class: 'btn btn-sm btn-success',
            type: 'button',
            'aria-label': `Đã xử lý đánh giá ${r.table.name}`,
            onclick: (e) => handleReview(r, e.currentTarget),
          },
          'Đã xử lý',
        ),
      ),
    ),
  );
}

async function handleReview(r, button) {
  setBusy(button, true);
  try {
    await staffApi(`/api/reviews/${r.reviewId}/handle`, { method: 'POST' });
  } catch (err) {
    if (err.code !== 'ALREADY_PROCESSED') {
      setBusy(button, false);
      return toast(errorMessage(err), 'error'); // chưa xử lý được → giữ thẻ
    }
  }
  state.lowReviews = state.lowReviews.filter((x) => x.reviewId !== r.reviewId);
  renderReviews();
}

async function handleCall(c, button) {
  setBusy(button, true);
  try {
    await staffApi(`/api/staff-calls/${c.callId}/handle`, { method: 'POST' });
  } catch (err) {
    if (err.code !== 'ALREADY_PROCESSED') toast(errorMessage(err), 'error');
  }
  state.calls = state.calls.filter((x) => x.callId !== c.callId);
  renderCalls();
}

const tableOrderUrl = (s) => `/pos/table-order?table=${s.table.tableId}&session=${s.sessionId}`;

/** F-024: ghi chú bàn — chỉ nhân viên thấy; để trống = xóa. */
async function editNote(s) {
  const input = el('textarea', {
    class: 'input',
    maxlength: 200,
    rows: 3,
    'aria-label': 'Ghi chú bàn',
    placeholder: 'Ví dụ: chờ thêm 2 người, khách quen ít ngọt, sinh nhật…',
  });
  input.value = s.note ?? '';
  const msg = el('div');
  const ok = await modal({
    title: `Ghi chú ${s.table.name}`,
    body: el('div', { class: 'stack' }, el('p', { class: 'muted small' }, 'Chỉ nhân viên thấy, khách không thấy. Để trống rồi Lưu = xóa ghi chú.'), input, msg),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Lưu ghi chú',
        class: 'btn-primary',
        onClick: async (close) => {
          try {
            await staffApi(`/api/sessions/${s.sessionId}/note`, { method: 'PUT', body: { note: input.value.trim() || null } });
            close(true);
          } catch (err) {
            clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
  if (ok !== true) return;
  toast(`Đã lưu ghi chú ${s.table.name}`, 'success');
  await loadSessions();
  renderSessions();
  if (state.drawer?.sessionId === s.sessionId) state.drawer.reload();
}

async function closeEmpty(s) {
  if (!(await confirmDialog(`Đóng ${s.table.name}?`, 'Phiên này không có đơn nào (khách quét rồi rời đi). Đóng bàn trống?', { okLabel: 'Đóng bàn' }))) return;
  try {
    await staffApi(`/api/sessions/${s.sessionId}/close`, { method: 'POST' });
    toast(`Đã đóng ${s.table.name}`, 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
  await loadSessions();
  renderSessions();
}

// ---------- F-046 Sửa / xóa món đã gọi, xóa đơn, hủy bàn (ADR-007) ----------
const VOID_REASONS = ['Khách đổi ý', 'Gọi nhầm món', 'Quán hết món', 'Pha sai món', 'Khách bỏ về', 'Mở nhầm bàn'];
const LIVE = ['PENDING', 'PREPARING', 'COMPLETED'];
const isStaffOnly = () => shell.user.role === 'STAFF';
const editable = (o) => LIVE.includes(o.status) && o.paymentStatus === 'UNPAID';

/**
 * Hộp thoại chung: số lượng mới (sửa món) + lý do bắt buộc + xử lý kho món đã pha (D-34: ghi hủy / hoàn kho)
 * + tài khoản trưởng ca / quản lý khi nhân viên sửa đơn đã tiếp nhận (D-33; hiện thêm nếu server báo cần duyệt).
 */
async function voidDialog({ title, intro, qty = null, completed = false, needApproval = false, okLabel, submit }) {
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Ví dụ: khách đổi ý, gọi nhầm, hết món…', 'aria-label': 'Lý do' });
  const chips = el(
    'div',
    { class: 'reason-chips' },
    VOID_REASONS.map((r) => el('button', { type: 'button', class: 'chip', onclick: () => ((reason.value = r), reason.focus()) }, r)),
  );
  const count = qty ? el('input', { class: 'input', type: 'number', min: 0, max: qty - 1, step: 1, value: qty - 1, 'aria-label': 'Số lượng mới' }) : null;
  const radio = (value, label, checked) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'void-stock', value, checked }), label);
  const stock = completed
    ? el(
        'fieldset',
        { class: 'opt-group' },
        el('legend', { class: 'small' }, 'Món đã pha xong — nguyên liệu xử lý thế nào?'),
        radio('WASTE', 'Ghi hủy hàng (đã đổ bỏ / đã đưa khách)', true),
        radio('RESTOCK', 'Hoàn kho (chưa dùng, còn dùng lại được)', false),
      )
    : null;
  const adminUser = el('input', {
    class: 'input',
    placeholder: 'Tên đăng nhập trưởng ca / quản lý',
    autocomplete: 'off',
    'aria-label': 'Tên đăng nhập người duyệt',
  });
  const adminPass = el('input', {
    class: 'input',
    type: 'password',
    placeholder: 'Mật khẩu',
    autocomplete: 'new-password',
    'aria-label': 'Mật khẩu người duyệt',
  });
  const approval = el(
    'div',
    { class: 'approval', hidden: !needApproval },
    el('div', { class: 'small' }, 'Đơn đã tiếp nhận / đã pha — cần trưởng ca / quản lý nhập tài khoản để duyệt:'),
    el('div', { class: 'row' }, adminUser, adminPass),
  );
  const msg = el('div');
  const m = modal({
    title,
    body: el(
      'div',
      { class: 'stack' },
      intro,
      count ? [el('label', {}, 'Số lượng mới (0 = xóa món)'), count] : null,
      el('label', {}, 'Lý do (bắt buộc)'),
      reason,
      chips,
      stock,
      approval,
      msg,
    ),
    actions: [
      { label: 'Không', value: false },
      {
        label: okLabel,
        class: 'btn-danger',
        onClick: async (close, e) => {
          const btn = e.currentTarget; // currentTarget về null sau await
          clear(msg);
          const body = { reason: reason.value.trim() };
          if (!body.reason) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập lý do'));
            reason.focus();
            return false;
          }
          if (count) {
            body.quantity = Number(count.value);
            if (!Number.isInteger(body.quantity) || body.quantity < 0 || body.quantity >= qty) {
              clear(msg, el('div', { class: 'field-error' }, `Số lượng mới từ 0 đến ${qty - 1} (thêm món dùng "Gọi thêm món")`));
              return false;
            }
          }
          if (stock) body.stockMode = stock.querySelector('input:checked')?.value ?? 'WASTE';
          if (!approval.hidden && adminUser.value.trim()) Object.assign(body, { adminUsername: adminUser.value.trim(), adminPassword: adminPass.value });
          setBusy(btn, true);
          try {
            close(await submit(body));
          } catch (err) {
            if (err.code === 'ADMIN_APPROVAL_REQUIRED') approval.hidden = false;
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          } finally {
            setBusy(btn, false);
          }
          return false;
        },
      },
    ],
  });
  if (count) {
    const okBtn = m.root.querySelector('.modal-foot .btn-danger');
    count.addEventListener('input', () => (okBtn.textContent = Number(count.value) === 0 ? 'Xóa món' : okLabel));
    okBtn.textContent = qty === 1 ? 'Xóa món' : okLabel;
  }
  (count ?? reason).focus();
  const r = await m.result;
  return r && typeof r === 'object' ? r : null;
}

/** Giảm số lượng / xóa một dòng món chưa thu (SL mới 0 = xóa, kèm thành phần combo + tùy chọn). */
async function editLine(o, item) {
  const r = await voidDialog({
    title: `Sửa món — ${item.name}`,
    intro: el(
      'p',
      { class: 'small muted' },
      `#${o.orderCode} · `,
      statusBadge(o.status),
      ` · đang gọi ${item.quantity} × ${money(item.unitPrice)}. Muốn thêm món dùng "Gọi thêm món".`,
    ),
    qty: item.quantity,
    completed: o.status === 'COMPLETED',
    needApproval: isStaffOnly() && o.status !== 'PENDING',
    okLabel: 'Lưu số lượng',
    submit: (body) => staffApi(`/api/order-items/${item.orderItemId}/void`, { method: 'POST', body }),
  });
  if (!r) return;
  upsert(r.order);
  toast(r.cancelled ? `Đã xóa hết món — đơn #${o.orderCode} chuyển Đã hủy` : `Đã sửa ${item.name} · đơn còn ${money(r.order.totalAmount)}`, 'success');
  if (r.sessionClosed) toast('Các món còn lại đã thu đủ — bàn đã đóng', 'info', 5000);
}

/** Xóa cả một đơn tại bàn chưa thu (đã tiếp nhận / đã pha; đơn chờ dùng nút Hủy cũ). */
async function voidWholeOrder(o) {
  const r = await voidDialog({
    title: `Xóa đơn #${o.orderCode}?`,
    intro: el(
      'p',
      {},
      `${whereLabel(o)} · ${money(o.totalAmount)} · `,
      statusBadge(o.status),
      el('br'),
      el('span', { class: 'small muted' }, `${o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}. Đơn chuyển sang Đã hủy, giữ lại làm lịch sử.`),
    ),
    completed: o.status === 'COMPLETED',
    needApproval: isStaffOnly() && o.status !== 'PENDING',
    okLabel: 'Xóa đơn',
    submit: (body) => staffApi(`/api/orders/${o.orderId}/void`, { method: 'POST', body }),
  });
  if (!r) return;
  upsert(r.order);
  toast(`Đã xóa đơn #${o.orderCode}`, 'success');
  if (r.sessionClosed) toast('Các đơn còn lại đã thu đủ — bàn đã đóng', 'info', 5000);
}

/** D-35 Hủy lượt phục vụ: hủy mọi đơn chưa thu + đóng phiên, bàn trống lại (không tạo lượt thu). */
async function cancelTable(session) {
  const live = session.orders.filter(editable);
  const r = await voidDialog({
    title: `Hủy bàn — ${session.table.name}?`,
    intro: el(
      'p',
      {},
      `Hủy ${live.length} đơn chưa thu (${money(live.reduce((s, o) => s + o.totalAmount, 0))}) và đóng bàn — không tạo lượt thu. `,
      el('span', { class: 'small muted' }, 'Dùng khi khách bỏ về / mở nhầm bàn. Phần nguyên liệu đang giữ được trả lại kho.'),
    ),
    completed: live.some((o) => o.status === 'COMPLETED'),
    needApproval: isStaffOnly() && live.some((o) => o.status !== 'PENDING'),
    okLabel: 'Hủy bàn',
    submit: (body) => staffApi(`/api/sessions/${session.sessionId}/cancel`, { method: 'POST', body }),
  });
  if (!r) return;
  toast(`Đã hủy ${session.table.name} · ${r.cancelledOrders} đơn`, 'success');
  state.drawer?.close();
  await loadAll();
}

const STOCK_LABEL = { RELEASE: 'trả phần giữ', WASTE: 'ghi hủy hàng', RESTOCK: 'hoàn kho' };

/** Lịch sử sửa / xóa món của phiên (mới nhất trước). */
function voidHistory(voids) {
  if (!voids.length) return null;
  return el(
    'details',
    { class: 'void-history' },
    el('summary', { class: 'small' }, `Đã sửa / xóa món (${voids.length})`),
    el(
      'ul',
      { class: 'small' },
      voids.map((v) =>
        el(
          'li',
          {},
          `${time(v.createdAt)} · −${v.qty} × ${v.itemName} (${money(v.amount)}) · #${v.orderCode} · ${v.reason}`,
          el(
            'span',
            { class: 'muted' },
            ` — ${v.createdBy}${v.approvedBy && v.approvedBy !== v.createdBy ? `, duyệt: ${v.approvedBy}` : ''} · ${STOCK_LABEL[v.stockMode]}`,
          ),
        ),
      ),
    ),
  );
}

// ---------- S-14 Thu tiền bàn ----------
function openSettle(sessionId) {
  state.drawer?.close();
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  const amount = moneyInput({ id: 'amount-received', 'aria-label': 'Tiền khách đưa' });
  const changeBox = el('div', { class: 'change' });
  const breakdown = el('div', { class: 'breakdown' });
  const settleBtn = el('button', { class: 'btn btn-success btn-lg', type: 'button' }, 'Đã thu tiền & In bill');
  const provisionalBtn = el('button', { class: 'btn', type: 'button' }, 'In tạm tính');
  const closeBtn = el('button', { class: 'btn', type: 'button', hidden: true }, 'Đóng bàn trống');
  let session = null;
  let preview = null;
  let busy = false;
  let seq = 0;
  let splitData = null; // F-026: bàn đã chia bill
  let partId = null; // phần đang thu

  // Hội viên của cả phiên (gắn vào phiên) hoặc của một phần (chỉ áp cho lượt thu phần đó)
  const sessionBilling = billingControls({ sessionId, onChange: () => loadPreview() });
  const partBilling = billingControls({ onChange: () => loadPreview() });
  let billing = sessionBilling;
  const m = modal({ title: 'Thu tiền bàn', drawer: true, body, onClose: () => (state.drawer = null) });
  m.root.append(el('div', { class: 'modal-foot' }, closeBtn, provisionalBtn, settleBtn));

  const due = () => preview?.totals.amountDue ?? session?.amountDue ?? 0;

  const updateChange = () => {
    if (!session) return;
    const got = moneyValue(amount);
    const pending = session.orders.some((o) => o.status === 'PENDING');
    if (got === null) clear(changeBox, el('span', {}, 'Tiền thừa'), el('span', {}, '—'));
    else if (got < due()) {
      changeBox.classList.add('short');
      clear(changeBox, el('span', {}, 'Còn thiếu'), el('span', {}, money(due() - got)));
    } else {
      changeBox.classList.remove('short');
      clear(changeBox, el('span', {}, 'Tiền thừa trả khách'), el('span', {}, money(got - due())));
    }
    settleBtn.disabled = busy || !preview || !shell.shift || pending || got === null || got < due() || session.status === 'CLOSED';
    settleBtn.title = shell.shift ? '' : 'Chưa mở ca — bấm "Chưa mở ca" trên thanh trên để mở ca';
  };
  amount.addEventListener('input', updateChange);

  /** Số phải thu do server tính (khuyến mãi đã khóa + hội viên + giảm tay + làm tròn). */
  async function loadPreview() {
    if (!session || session.status === 'CLOSED') return;
    const my = ++seq;
    try {
      const url = splitData?.hasSplits ? (partId ? `/api/splits/${partId}/settle/preview` : null) : `/api/sessions/${sessionId}/settle/preview`;
      if (!url) {
        preview = null;
        clear(breakdown);
        renderQuick();
        updateChange();
        return;
      }
      const p = await staffApi(url, { method: 'POST', body: billing.body() });
      if (my !== seq) return;
      preview = p;
      billing.setApproval(p.needsApproval);
      billing.showEarn(p.totals);
      clear(
        breakdown,
        breakdownRows(
          p.totals.breakdownLines.filter((b) => b.key !== 'total'),
          'due-row',
        ),
        p.includeCommon ? el('p', { class: 'small muted' }, 'Phần cuối — đã gộp các món Chung chưa ai nhận.') : null,
        el('div', { class: 'due' }, el('span', {}, partId ? 'Phần này phải thu' : 'Tổng phải thu'), el('span', {}, money(p.totals.amountDue))),
      );
    } catch (err) {
      if (my !== seq) return;
      preview = null;
      clear(breakdown, el('div', { class: 'field-error' }, errorMessage(err)));
    }
    renderQuick();
    updateChange();
  }

  /** F-046: nút bút chì trên dòng món chưa thu → sửa số lượng / xóa món. */
  const editButton = (o, i) =>
    el(
      'button',
      {
        class: 'line-edit',
        type: 'button',
        title: 'Sửa / xóa món',
        'aria-label': `Sửa ${i.name}`,
        ...shiftGate(),
        onclick: () => editLine(o, i).then(() => reload()),
      },
      icon('pencil'),
    );

  async function reload() {
    try {
      session = await staffApi(`/api/sessions/${sessionId}`);
    } catch (err) {
      clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
      return;
    }
    if (session.status === 'CLOSED') {
      clear(body, el('div', { class: 'alert success' }, `${session.table.name} đã được thu tiền / đóng.`));
      settleBtn.disabled = true;
      provisionalBtn.disabled = true;
      return;
    }
    const [splits, voids] = await Promise.all([
      session.splitCount > 0 ? staffApi(`/api/sessions/${sessionId}/splits`).catch(() => null) : null,
      staffApi(`/api/sessions/${sessionId}/voids`).catch(() => []),
    ]);
    splitData = splits;
    const splitMode = Boolean(splitData?.hasSplits);
    if (splitMode && partId && !splitData.splits.some((s) => s.splitId === partId && (s.isCommon || s.status === 'OPEN'))) partId = null;
    billing = splitMode ? partBilling : sessionBilling;
    if (!splitMode) billing.showMember(session.member);
    const active = session.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
    const pending = active.filter((o) => o.status === 'PENDING');
    closeBtn.hidden = active.length > 0;
    provisionalBtn.disabled = active.length === 0;
    clear(
      body,
      el(
        'div',
        { class: 'row between' },
        el('h3', { style: { margin: 0 } }, session.table.name),
        session.status === 'PAYMENT_REQUESTED'
          ? el('span', { class: 'badge pending' }, `Gọi thanh toán · ${elapsed(session.paymentRequestedAt)}`)
          : el('span', { class: 'badge preparing' }, 'Đang phục vụ'),
      ),
      el('p', { class: 'muted small' }, `Mở lúc ${time(session.openedAt)} · ${active.length} đơn`),
      session.note ? el('div', { class: 'table-note', style: { marginBottom: '0.4rem' } }, icon('notebook-pen', { label: 'Ghi chú' }), session.note) : null,
      el(
        'div',
        { class: 'row', style: { gap: '0.3rem', marginBottom: '0.5rem' } },
        el('a', { class: 'btn btn-sm', href: tableOrderUrl(session) }, 'Gọi thêm món'),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => editNote(session) }, session.note ? 'Sửa ghi chú' : 'Ghi chú bàn'),
        el('button', { class: 'btn btn-sm', type: 'button', ...shiftGate(), onclick: () => moveTable(session) }, 'Chuyển bàn'),
        // F-046 D-35: bàn đã thu một phần (chia bill) thì xóa từng món chưa thu thay vì hủy bàn
        active.length && !session.paidAmount
          ? el('button', { class: 'btn btn-sm btn-danger', type: 'button', ...shiftGate(), onclick: () => cancelTable(session) }, 'Hủy bàn')
          : null,
      ),
      shell.shift ? null : el('div', { class: 'alert warning' }, 'Chưa mở ca — hãy mở ca trước khi tiếp nhận, sửa món, chuyển bàn, chia bill và thu tiền.'),
      pending.length
        ? el('div', { class: 'alert warning' }, `Còn ${pending.length} đơn chưa tiếp nhận — hãy Tiếp nhận hoặc Hủy trước khi thu tiền (BR-019).`)
        : null,
      active.length === 0 ? el('div', { class: 'alert info' }, 'Phiên chưa có đơn nào. Có thể "Đóng bàn trống".') : null,
      splitMode ? splitsBlock() : null,
      (splitMode ? [] : active).map((o) =>
        el(
          'div',
          { class: `mini-order ${o.status === 'PENDING' ? 'pending' : ''}` },
          el('div', { class: 'row between' }, el('strong', {}, `#${o.orderCode} · ${time(o.createdAt)}`), statusBadge(o.status)),
          el(
            'ul',
            { class: 'small' },
            o.items.map((i) =>
              el(
                'li',
                {},
                `${i.quantity} × ${i.name}`,
                i.options?.length ? ` [${i.options.map((x) => x.name).join(', ')}]` : '',
                i.note ? ` (${i.note})` : '',
                ` — ${money(i.lineTotal)}`,
                editable(o) && !i.paidAt ? editButton(o, i) : null,
              ),
            ),
          ),
          o.status === 'PENDING'
            ? el(
                'div',
                { class: 'row', style: { marginTop: '0.35rem' } },
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-primary',
                    type: 'button',
                    ...shiftGate(),
                    onclick: async (e) => {
                      await accept(o, e.currentTarget);
                      reload();
                    },
                  },
                  'Tiếp nhận',
                ),
                el(
                  'button',
                  {
                    class: 'btn btn-sm btn-danger',
                    type: 'button',
                    ...shiftGate(),
                    onclick: async () => {
                      await cancelOrder(o);
                      reload();
                    },
                  },
                  'Hủy',
                ),
              )
            : editable(o)
              ? el(
                  'div',
                  { class: 'row', style: { marginTop: '0.35rem' } },
                  el('button', { class: 'btn btn-sm btn-danger', type: 'button', ...shiftGate(), onclick: () => voidWholeOrder(o).then(reload) }, 'Xóa đơn'),
                )
              : null,
        ),
      ),
      voidHistory(voids),
      active.length && (!splitMode || partId) ? billing.node : null,
      breakdown,
      active.length && (!splitMode || partId)
        ? el(
            'div',
            {},
            el('label', { for: 'amount-received' }, 'Tiền khách đưa'),
            amount,
            el('div', { class: 'quick-cash', id: 'quick-cash' }),
            changeBox,
            el('p', { class: 'muted small' }, 'Chỉ thu tiền mặt. Không hỗ trợ ghi nợ / trả thiếu.'),
          )
        : null,
    );
    await loadPreview();
  }

  /** F-026: các phần của bàn — chọn phần để thu, đổi món giữa các phần, "Thu chung". */
  function splitsBlock() {
    const splits = splitData.splits;
    const open = splits.filter((s) => !s.isCommon && s.status === 'OPEN');
    const common = splits.find((s) => s.isCommon);
    const commonUnpaid = common?.lines.filter((l) => !l.paid) ?? [];
    const options = [{ value: '', label: 'Chung' }, ...open.map((s) => ({ value: String(s.splitId), label: s.label }))];
    const lineEdit = (l) => {
      const o = session.orders.find((x) => x.items.some((i) => i.orderItemId === l.orderItemId));
      const item = o?.items.find((i) => i.orderItemId === l.orderItemId);
      return o && editable(o) ? editButton(o, item) : null;
    };
    const lineRow = (l, s) =>
      el(
        'li',
        { class: l.paid ? 'muted' : '' },
        `${l.quantity} × ${l.name}`,
        l.options.length ? ` [${l.options.join(', ')}]` : '',
        ` — ${money(l.amount)}`,
        l.paid ? null : lineEdit(l),
        l.paid
          ? [' ', icon('check', { label: 'Đã thu' })]
          : el(
              'select',
              {
                class: 'input input-sm split-move',
                'aria-label': `Chuyển ${l.name} sang phần`,
                ...shiftGate(),
                onchange: async (e) => {
                  try {
                    await staffApi(`/api/sessions/${sessionId}/items/${l.orderItemId}/split`, {
                      method: 'PUT',
                      body: { splitId: e.target.value ? Number(e.target.value) : null },
                    });
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  }
                  reload();
                },
              },
              options.map((o) => el('option', { value: o.value, selected: o.value === (s.isCommon ? '' : String(s.splitId)) }, o.label)),
            ),
      );
    const card = (s) =>
      el(
        'div',
        { class: `mini-order split-card ${partId === s.splitId ? 'selected' : ''}` },
        el(
          'div',
          { class: 'row between' },
          el('strong', {}, s.isCommon ? 'Chung (chưa ai nhận)' : s.label),
          s.status === 'PAID' && !s.isCommon
            ? el(
                'span',
                { class: 'row' },
                el('span', { class: 'badge completed' }, `Đã thu ${money(s.paidAmount ?? 0)}`),
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => printUrl(`/pos/payments/${s.paymentId ?? ''}/receipt`) }, 'In lại'),
              )
            : el('span', {}, `~${money(s.unpaidAmount)}`),
        ),
        el(
          'ul',
          { class: 'small' },
          s.lines.map((l) => lineRow(l, s)),
        ),
        s.status === 'OPEN' && (!s.isCommon || (commonUnpaid.length && open.length))
          ? el(
              'button',
              {
                class: `btn btn-sm ${partId === s.splitId ? 'btn-primary' : ''}`,
                type: 'button',
                onclick: () => {
                  partId = s.splitId;
                  partBilling.reset();
                  reload();
                },
              },
              s.isCommon ? 'Thu riêng phần Chung' : partId === s.splitId ? 'Đang thu phần này' : 'Thu phần này',
            )
          : null,
      );
    return el(
      'div',
      { class: 'split-block' },
      el(
        'div',
        { class: 'row between' },
        el('strong', {}, `Bàn chia bill: ${splits.filter((s) => !s.isCommon).length} phần`),
        el(
          'span',
          { class: 'row' },
          el(
            'button',
            {
              class: 'btn btn-sm',
              type: 'button',
              ...shiftGate(),
              onclick: async () => {
                const label = prompt('Tên phần mới (ví dụ: Anh C)');
                if (!label?.trim()) return;
                try {
                  await staffApi(`/api/sessions/${sessionId}/splits`, { method: 'POST', body: { label: label.trim() } });
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
                reload();
              },
            },
            '+ Thêm phần',
          ),
          el(
            'button',
            {
              class: 'btn btn-sm',
              type: 'button',
              id: 'merge-splits',
              ...shiftGate(),
              onclick: async () => {
                if (!(await confirmDialog('Thu chung?', 'Gộp các phần chưa thu thành một để thu một lần.', { okLabel: 'Gộp lại' }))) return;
                try {
                  const r = await staffApi(`/api/sessions/${sessionId}/splits/merge`, { method: 'POST' });
                  toast(r.unsplit ? 'Đã bỏ chia bill — thu cả bàn như bình thường' : 'Đã gộp các phần còn lại vào phần Chung', 'success');
                  partId = null;
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
                reload();
              },
            },
            'Thu chung',
          ),
        ),
      ),
      open.map(card),
      splits.filter((s) => !s.isCommon && s.status === 'PAID').map(card),
      common && common.lines.length ? card(common) : null,
      partId ? null : el('p', { class: 'small muted' }, 'Chọn "Thu phần này" để thu từng người. Phần cuối tự gộp các món Chung.'),
    );
  }

  function renderQuick() {
    const box = $('#quick-cash', m.root);
    if (!box) return;
    const d = due();
    const quick = [...new Set([d, 50000, 100000, 200000, 500000].filter((v) => v >= d && v > 0))];
    clear(
      box,
      quick.map((v) =>
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: () => {
              setMoney(amount, v);
              updateChange();
            },
          },
          v === d ? `Đủ tiền (${num(v / 1000)}k)` : `${num(v / 1000)}k`,
        ),
      ),
    );
  }

  provisionalBtn.addEventListener('click', () => printUrl(`/pos/sessions/${sessionId}/receipt?mode=provisional`));
  closeBtn.addEventListener('click', async () => {
    await closeEmpty({ sessionId, table: session.table });
    m.close();
  });
  settleBtn.addEventListener('click', async () => {
    const got = moneyValue(amount);
    busy = true;
    setBusy(settleBtn, true);
    try {
      if (splitData?.hasSplits) {
        const r = await staffApi(`/api/splits/${partId}/settle`, {
          method: 'POST',
          body: { amountReceived: got, expectedAmountDue: due(), ...billing.body() },
        });
        printUrl(`/pos/payments/${r.payment.paymentId}/receipt`);
        toast(`Đã thu phần ${r.split.label}: ${money(r.payment.amountReceived)} · tiền thừa ${money(r.payment.changeGiven)}`, 'success', 6000);
        partId = null;
        setMoney(amount, null);
        partBilling.reset();
        if (r.sessionClosed) {
          m.close();
          await loadAll();
        } else await reload();
        return;
      }
      const r = await staffApi(`/api/sessions/${sessionId}/settle`, {
        method: 'POST',
        body: { amountReceived: got, expectedAmountDue: due(), ...billing.body() },
      });
      printUrl(`/pos/sessions/${sessionId}/receipt?mode=final`);
      toast(`Đã thu ${money(r.payment.amountReceived)} · tiền thừa ${money(r.payment.changeGiven)}`, 'success', 6000);
      m.close();
      await loadAll();
    } catch (err) {
      toast(
        errorMessage(err),
        ['AMOUNT_CHANGED', 'HAS_PENDING_ORDERS', 'ADMIN_APPROVAL_REQUIRED', 'SPLIT_PAID', 'SESSION_HAS_SPLITS'].includes(err.code) ? 'warning' : 'error',
        6000,
      );
      if (err.code === 'ADMIN_APPROVAL_REQUIRED') billing.setApproval(true);
      if (err.code === 'ALREADY_SETTLED') m.close();
      else await reload();
    } finally {
      busy = false;
      setBusy(settleBtn, false);
      updateChange();
    }
  });

  state.drawer = { sessionId, close: m.close, reload: () => !busy && reload() };
  // Mở / đóng ca: vẽ lại cả ngăn để bật / khóa nút xử lý đơn (F-055) và nút thu tiền (F-018)
  shell.onShiftChange(() => state.drawer?.sessionId === sessionId && state.drawer.reload());
  reload();
}

// ---------- Realtime ----------
function onOrderEvent(payload) {
  const order = payload.order;
  if (!order) return loadAll();
  const isNew = !state.orders.has(order.orderId);
  if (isNew && order.status === 'PENDING') {
    state.fresh.add(order.orderId);
    playSound('ting');
  }
  upsert(order);
  refreshQueueEta();
  if (order.sessionId) refreshSessionsSoon();
  if (state.drawer && order.sessionId === state.drawer.sessionId) state.drawer.reload();
}

/** F-049: chuyển cả nhóm sang bàn khác — bàn trống hoặc có nhóm khác (bill vẫn riêng); điện thoại khách tự theo. */
async function moveTable(session) {
  let tables;
  try {
    tables = await staffApi('/api/tables');
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const choices = tables.filter((t) => t.tableId !== session.table.tableId);
  const m = modal({
    title: `Chuyển ${session.table.name} sang bàn…`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'p',
        { class: 'small muted' },
        'Đơn, chia bill, hội viên đi theo nhóm. Bàn đang có nhóm khác thì hai nhóm ngồi chung nhưng bill vẫn riêng. Điện thoại khách tự chuyển theo.',
      ),
      choices.length === 0
        ? el('p', {}, 'Không còn bàn nào khác đang dùng.')
        : el(
            'div',
            { class: 'move-grid' },
            choices.map((t) =>
              el(
                'button',
                { class: 'btn', type: 'button', 'aria-label': `Chuyển sang ${t.name}`, onclick: (e) => doMove(t, e.currentTarget) },
                el('strong', {}, t.name),
                el('span', { class: 'small muted' }, t.sessions.length ? `đang có ${t.sessions.length} nhóm` : 'trống'),
              ),
            ),
          ),
    ),
    actions: [{ label: 'Thôi', value: false }],
  });
  async function doMove(t, button) {
    const all = [...button.parentElement.querySelectorAll('button')];
    all.forEach((b) => (b.disabled = true)); // chống bấm 2 lần
    try {
      const r = await staffApi(`/api/sessions/${session.sessionId}/move`, {
        method: 'POST',
        body: { toTableId: t.tableId, fromTableId: session.table.tableId }, // máy khác đã chuyển nhóm đi → 409, không chuyển nhầm
      });
      toast(`Đã chuyển nhóm từ ${r.fromTable.name} sang ${r.toTable.name}`, 'success');
      m.close();
      await loadAll();
    } catch (err) {
      all.forEach((b) => (b.disabled = false));
      toast(errorMessage(err), 'error', 6000);
      if (err.code === 'SESSION_MOVED') {
        m.close();
        await loadAll();
      }
    }
  }
}

function onSessionEvent(payload) {
  refreshSessionsSoon();
  if (state.drawer && payload.sessionId === state.drawer.sessionId) state.drawer.reload();
}

// ---------- D-70: màn < 1200 px — lưới bàn là ngăn trượt bên phải, mở bằng nút "Bàn" ----------
const tablesPanel = $('#tables-panel');
const tablesToggle = $('#tables-toggle');
const tablesBackdrop = $('#tables-backdrop');
const drawerMode = matchMedia('(max-width: 1199px)');
// Ngăn mở: phần phía sau không bấm / Tab tới được (inert); đóng bằng cách nào cũng trả focus về nút "Bàn" (review G3)
const behindDrawer = [$('.pos-top'), $('#pos-alerts'), $('.orders-area')];
function setTablesOpen(open) {
  const wasOpen = tablesPanel.classList.contains('open');
  const show = open && drawerMode.matches;
  tablesPanel.classList.toggle('open', show);
  tablesBackdrop.hidden = !show;
  tablesToggle.setAttribute('aria-expanded', String(show));
  behindDrawer.forEach((n) => n?.toggleAttribute('inert', show));
  if (show) $('#tables-close').focus();
  else if (wasOpen && drawerMode.matches) tablesToggle.focus();
}
tablesToggle.addEventListener('click', () => setTablesOpen(!tablesPanel.classList.contains('open')));
$('#tables-close').addEventListener('click', () => setTablesOpen(false));
tablesBackdrop.addEventListener('click', () => setTablesOpen(false));
document.addEventListener('keydown', (e) => {
  // Hộp thoại đang mở (thu tiền, ghi chú…) thì Esc đóng hộp thoại trước
  if (e.key === 'Escape' && tablesPanel.classList.contains('open') && !document.querySelector('.overlay')) setTablesOpen(false);
});
drawerMode.addEventListener('change', () => setTablesOpen(false));

await loadAll();
// Từ trang Gọi món tại bàn: /pos?settle=<sessionId> → mở ngay drawer thu tiền
const settleParam = new URLSearchParams(location.search).get('settle');
if (settleParam) {
  history.replaceState(null, '', location.pathname);
  openSettle(settleParam);
}
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) {
      loadAll({ detectLate: true });
      shell.reloadShift();
    }
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
shell.attach(socket);
socket?.on('order.created', onOrderEvent);
socket?.on('order.status_changed', onOrderEvent);
socket?.on('order.cancelled', onOrderEvent);
socket?.on('session.payment_requested', (p) => {
  playSound('chime');
  toast(`${p.table?.name ?? 'Một bàn'} gọi thanh toán · ${money(p.amountDue)}`, 'warning', 6000);
  onSessionEvent(p);
});
socket?.on('session.payment_cancelled', onSessionEvent);
socket?.on('session.settled', onSessionEvent);
socket?.on('session.closed', onSessionEvent);
socket?.on('session.member_changed', onSessionEvent);
socket?.on('session.opened', onSessionEvent);
socket?.on('session.note_changed', onSessionEvent);
socket?.on('session.table_changed', () => loadAll()); // F-049: thẻ đơn + danh sách bàn + ngăn kéo hiện bàn mới
// F-051: khách chấm món ≤ 2 sao → dải "Đánh giá thấp" + chuông, để ra xử lý khi khách còn ở quán
socket?.on('review.low', (r) => {
  if (r.ring !== false) {
    playSound('bell'); // chỉ rung lần đầu của nhóm
    toast(`${r.table.name}: khách chấm món thấp — xem dải "Đánh giá thấp"`, 'warning', 6000);
  }
  if (!state.lowReviews.some((x) => x.reviewId === r.reviewId)) state.lowReviews.push(r);
  renderReviews();
});
socket?.on('review.handled', ({ reviewId }) => {
  state.lowReviews = state.lowReviews.filter((x) => x.reviewId !== reviewId);
  renderReviews();
});
socket?.on('session.split_changed', onSessionEvent);
socket?.on('session.staff_called', (c) => {
  playSound('bell');
  toast(`${c.table?.name ?? 'Một bàn'} gọi nhân viên: ${c.message || 'cần hỗ trợ'}`, 'warning', 6000);
  if (!state.calls.some((x) => x.callId === c.callId)) state.calls.push(c);
  renderCalls();
});
socket?.on('session.staff_call_handled', (c) => {
  state.calls = state.calls.filter((x) => x.callId !== c.callId);
  renderCalls();
});
socket?.on('inventory.low', (p) => toast(`Nguyên liệu sắp hết: ${p.name} (còn ${num(p.available)} ${p.unit ?? ''})`, 'warning', 6000));

// Cập nhật đồng hồ chờ mỗi giây; phiếu đơn đổi màu khi chờ lâu (D-68)
setInterval(() => {
  document.querySelectorAll('[data-since]').forEach((n) => {
    n.textContent = elapsed(n.dataset.since);
    if (n.classList.contains('ago')) markWait(n.parentElement, n.dataset.since);
  });
}, 1000);
