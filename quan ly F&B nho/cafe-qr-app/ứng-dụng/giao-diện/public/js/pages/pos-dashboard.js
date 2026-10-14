// S-10 Dashboard quầy (FEATURE-007): 3 cột Mới / Đang pha / Đã xong; dải Gọi thanh toán; bàn đang phục vụ.
// S-11 chi tiết đơn, S-14 thu tiền bàn (FEATURE-006). Mất kết nối → tải lại + "Có đơn hàng bị trễ" (REQ-017, AC-007-05).
import { staffApi } from '../api.js';
import { mountPosShell } from '../pos-shell.js';
import { printUrl } from '../print.js';
import { connectRealtime } from '../socket.js';
import { getToken } from '../auth.js';
import {
  $,
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

const shell = await mountPosShell('orders');

const state = { orders: new Map(), sessions: [], fresh: new Set(), drawer: null };
const COLUMNS = ['PENDING', 'PREPARING', 'COMPLETED'];

// ---------- Tải ảnh chụp ----------
async function loadOrders() {
  const list = await staffApi('/api/orders');
  state.orders = new Map(list.map((o) => [o.orderId, o]));
}

async function loadSessions() {
  state.sessions = await staffApi('/api/sessions?status=OPEN,PAYMENT_REQUESTED');
}

async function loadAll({ detectLate = false } = {}) {
  const knownOrders = new Set(state.orders.keys());
  const knownPayReq = new Set(state.sessions.filter((s) => s.status === 'PAYMENT_REQUESTED').map((s) => s.sessionId));
  try {
    await Promise.all([loadOrders(), loadSessions()]);
  } catch (err) {
    toast(errorMessage(err), 'error');
    return;
  }
  if (detectLate) {
    const lateOrders = [...state.orders.values()].filter((o) => !knownOrders.has(o.orderId) && o.status === 'PENDING');
    const latePays = state.sessions.filter((s) => s.status === 'PAYMENT_REQUESTED' && !knownPayReq.has(s.sessionId));
    if (lateOrders.length || latePays.length) {
      const parts = [];
      if (lateOrders.length) parts.push(`${lateOrders.length} đơn mới`);
      if (latePays.length) parts.push(`${latePays.length} bàn gọi thanh toán`);
      const banner = $('#late');
      clear(
        banner,
        `Có đơn hàng bị trễ trong lúc mất kết nối: ${parts.join(', ')}. `,
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => (banner.hidden = true) }, 'Đã xem'),
      );
      banner.hidden = false;
      lateOrders.forEach((o) => state.fresh.add(o.orderId));
      playSound(latePays.length ? 'chime' : 'ting');
    }
  }
  renderBoard();
  renderSessions();
  if (state.drawer) state.drawer.reload();
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

function ticket(o) {
  const actions = [];
  if (o.status === 'PENDING') {
    actions.push(el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => act(e, () => accept(o, e.currentTarget)) }, 'Tiếp nhận'));
    actions.push(
      el('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => act(e, () => acceptAndComplete(o, e.currentTarget)) }, 'Tiếp nhận & Hoàn tất'),
    );
    actions.push(el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: (e) => act(e, () => cancelOrder(o)) }, 'Hủy'));
  } else if (o.status === 'PREPARING') {
    actions.push(el('button', { class: 'btn btn-sm btn-success', type: 'button', onclick: (e) => act(e, () => complete(o, e.currentTarget)) }, 'Hoàn tất'));
  }
  const node = el(
    'article',
    {
      class: `ticket ${o.status.toLowerCase()} ${state.fresh.has(o.orderId) ? 'fresh' : ''}`,
      tabindex: 0,
      onclick: () => openOrder(o.orderId),
      onkeydown: (e) => e.key === 'Enter' && openOrder(o.orderId),
    },
    el(
      'div',
      { class: 'ticket-head' },
      el('span', { class: 'where' }, whereLabel(o)),
      el('span', { class: 'code' }, `#${o.orderCode}`),
      el('span', { class: 'ago', dataset: { since: o.createdAt } }, `${time(o.createdAt)} · ${elapsed(o.createdAt)}`),
    ),
    el(
      'ul',
      {},
      o.items.map((i) => el('li', {}, el('span', { class: 'qty' }, `${i.quantity}×`), i.name, i.note ? el('span', { class: 'note' }, i.note) : null)),
    ),
    o.note ? el('div', { class: 'small', style: { color: '#b4530a', fontWeight: 700 } }, `Ghi chú đơn: ${o.note}`) : null,
    el('div', { class: 'ticket-foot' }, el('strong', {}, money(o.totalAmount)), paymentBadge(o.paymentStatus)),
    actions.length ? el('div', { class: 'ticket-actions' }, actions) : null,
  );
  return node;
}

function act(e, fn) {
  e.stopPropagation();
  fn();
}

// Chỉ dựng lại phiếu nào thực sự đổi (khóa theo trạng thái/nội dung) — tránh mất cú bấm khi sự kiện realtime đến cùng lúc
const ticketCache = new Map(); // orderId → { key, node }
const ticketKey = (o) => [o.status, o.paymentStatus, o.totalAmount, o.items.length, o.acceptedAt, o.completedAt, o.paidAt].join('|');

function ticketNode(o) {
  const key = ticketKey(o);
  const cached = ticketCache.get(o.orderId);
  if (cached && cached.key === key) return cached.node;
  const node = ticket(o);
  ticketCache.set(o.orderId, { key, node });
  return node;
}

function renderBoard() {
  const byStatus = { PENDING: [], PREPARING: [], COMPLETED: [] };
  for (const o of state.orders.values()) byStatus[o.status]?.push(o);
  byStatus.COMPLETED.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  for (const id of ticketCache.keys()) if (!state.orders.has(id)) ticketCache.delete(id);
  for (const s of COLUMNS) {
    $(`#count-${s}`).textContent = byStatus[s].length;
    const col = $(`#col-${s}`);
    if (byStatus[s].length === 0) {
      clear(col, el('p', { class: 'muted small center' }, s === 'PENDING' ? 'Chưa có đơn mới' : 'Trống'));
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
    await loadAll();
    return null;
  } finally {
    setBusy(button, false);
  }
}

function upsert(order) {
  if (!order) return;
  if (order.status === 'CANCELLED') state.orders.delete(order.orderId);
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
  if (o.status === 'PENDING') actions.push({ label: 'Tiếp nhận', class: 'btn-primary', onClick: () => accept(o, null) });
  if (o.status === 'PREPARING') actions.push({ label: 'Hoàn tất', class: 'btn-success', onClick: () => complete(o, null) });
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
                el('td', {}, i.name, i.note ? el('div', { class: 'small', style: { color: '#b4530a' } }, i.note) : null),
                el('td', { class: 'num' }, i.quantity),
                el('td', { class: 'num' }, money(i.lineTotal)),
              ),
            ),
          ),
        ),
      ),
      el('div', { class: 'due' }, el('span', {}, 'Tổng'), el('span', {}, money(o.totalAmount))),
    ),
    actions,
  });
}

// ---------- Dải gọi thanh toán + bàn đang phục vụ ----------
function renderSessions() {
  const requested = state.sessions
    .filter((s) => s.status === 'PAYMENT_REQUESTED')
    .sort((a, b) => new Date(a.paymentRequestedAt) - new Date(b.paymentRequestedAt));
  const strip = $('#pay-strip');
  strip.hidden = requested.length === 0;
  clear(
    strip,
    el('span', { class: 'label' }, '🔔 Gọi thanh toán'),
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

  const box = $('#tables');
  if (state.sessions.length === 0) return clear(box, el('p', { class: 'muted small' }, 'Chưa có bàn nào đang phục vụ.'));
  clear(
    box,
    state.sessions.map((s) =>
      el(
        'div',
        { class: 'table-row' },
        el(
          'div',
          { class: 'row between' },
          el('span', { class: 'name' }, s.table.name),
          s.status === 'PAYMENT_REQUESTED'
            ? el('span', { class: 'badge pending' }, 'Gọi thanh toán')
            : el('span', { class: 'badge preparing' }, 'Đang phục vụ'),
        ),
        el(
          'div',
          { class: 'muted small' },
          `${s.orderCount} đơn · ${money(s.amountDue)} · mở ${time(s.openedAt)}`,
          s.pendingCount ? ` · ${s.pendingCount} chờ tiếp nhận` : '',
        ),
        el(
          'div',
          { class: 'row', style: { marginTop: '0.35rem' } },
          s.orderCount > 0
            ? el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openSettle(s.sessionId) }, 'Thu tiền')
            : el('button', { class: 'btn btn-sm', type: 'button', onclick: () => closeEmpty(s) }, 'Đóng bàn trống'),
        ),
      ),
    ),
  );
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

// ---------- S-14 Thu tiền bàn ----------
function openSettle(sessionId) {
  state.drawer?.close();
  const body = el('div', {}, el('p', { class: 'muted' }, 'Đang tải…'));
  const amount = moneyInput({ id: 'amount-received', 'aria-label': 'Tiền khách đưa' });
  const changeBox = el('div', { class: 'change' });
  const settleBtn = el('button', { class: 'btn btn-success btn-lg', type: 'button' }, 'Đã thu tiền & In bill');
  const provisionalBtn = el('button', { class: 'btn', type: 'button' }, 'In tạm tính');
  const closeBtn = el('button', { class: 'btn', type: 'button', hidden: true }, 'Đóng bàn trống');
  let session = null;
  let busy = false;

  const m = modal({ title: 'Thu tiền bàn', drawer: true, body, onClose: () => (state.drawer = null) });
  m.root.append(el('div', { class: 'modal-foot' }, closeBtn, provisionalBtn, settleBtn));

  const updateChange = () => {
    if (!session) return;
    const due = session.amountDue;
    const got = moneyValue(amount);
    const pending = session.orders.some((o) => o.status === 'PENDING');
    if (got === null) clear(changeBox, el('span', {}, 'Tiền thừa'), el('span', {}, '—'));
    else if (got < due) {
      changeBox.classList.add('short');
      clear(changeBox, el('span', {}, 'Còn thiếu'), el('span', {}, money(due - got)));
    } else {
      changeBox.classList.remove('short');
      clear(changeBox, el('span', {}, 'Tiền thừa trả khách'), el('span', {}, money(got - due)));
    }
    if (got !== null && got >= due) changeBox.classList.remove('short');
    settleBtn.disabled = busy || pending || got === null || got < due || session.status === 'CLOSED';
  };
  amount.addEventListener('input', updateChange);

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
    const active = session.orders.filter((o) => o.status !== 'CANCELLED');
    const pending = active.filter((o) => o.status === 'PENDING');
    closeBtn.hidden = active.length > 0;
    provisionalBtn.disabled = active.length === 0;
    const due = session.amountDue;
    const quick = [...new Set([due, 50000, 100000, 200000, 500000].filter((v) => v >= due && v > 0))];
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
      pending.length
        ? el('div', { class: 'alert warning' }, `Còn ${pending.length} đơn chưa tiếp nhận — hãy Tiếp nhận hoặc Hủy trước khi thu tiền (BR-019).`)
        : null,
      active.length === 0 ? el('div', { class: 'alert info' }, 'Phiên chưa có đơn nào. Có thể "Đóng bàn trống".') : null,
      active.map((o) =>
        el(
          'div',
          { class: `mini-order ${o.status === 'PENDING' ? 'pending' : ''}` },
          el('div', { class: 'row between' }, el('strong', {}, `#${o.orderCode} · ${time(o.createdAt)}`), statusBadge(o.status)),
          el(
            'ul',
            { class: 'small' },
            o.items.map((i) => el('li', {}, `${i.quantity} × ${i.name}`, i.note ? ` (${i.note})` : '', ` — ${money(i.lineTotal)}`)),
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
                    onclick: async () => {
                      await cancelOrder(o);
                      reload();
                    },
                  },
                  'Hủy',
                ),
              )
            : null,
        ),
      ),
      el('div', { class: 'due' }, el('span', {}, 'Tổng phải thu'), el('span', {}, money(due))),
      active.length
        ? el(
            'div',
            {},
            el('label', { for: 'amount-received' }, 'Tiền khách đưa'),
            amount,
            el(
              'div',
              { class: 'quick-cash' },
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
                  v === due ? `Đủ tiền (${num(v / 1000)}k)` : `${num(v / 1000)}k`,
                ),
              ),
            ),
            changeBox,
            el('p', { class: 'muted small' }, 'Chỉ thu tiền mặt. Không hỗ trợ ghi nợ / trả thiếu.'),
          )
        : null,
    );
    updateChange();
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
      const r = await staffApi(`/api/sessions/${sessionId}/settle`, { method: 'POST', body: { amountReceived: got, expectedAmountDue: session.amountDue } });
      printUrl(`/pos/sessions/${sessionId}/receipt?mode=final`);
      toast(`Đã thu ${money(r.payment.amountReceived)} · tiền thừa ${money(r.payment.changeGiven)}`, 'success', 6000);
      m.close();
      await loadAll();
    } catch (err) {
      toast(errorMessage(err), err.code === 'AMOUNT_CHANGED' || err.code === 'HAS_PENDING_ORDERS' ? 'warning' : 'error', 6000);
      if (err.code === 'ALREADY_SETTLED') m.close();
      else await reload();
    } finally {
      busy = false;
      setBusy(settleBtn, false);
      updateChange();
    }
  });

  state.drawer = { sessionId, close: m.close, reload: () => !busy && reload() };
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
  if (order.sessionId) refreshSessionsSoon();
  if (state.drawer && order.sessionId === state.drawer.sessionId) state.drawer.reload();
}

function onSessionEvent(payload) {
  refreshSessionsSoon();
  if (state.drawer && payload.sessionId === state.drawer.sessionId) state.drawer.reload();
}

await loadAll();
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) loadAll({ detectLate: true });
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
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
socket?.on('inventory.low', (p) => toast(`Nguyên liệu sắp hết: ${p.name} (còn ${num(p.available)} ${p.unit ?? ''})`, 'warning', 6000));

// Cập nhật đồng hồ chờ mỗi giây
setInterval(() => {
  document.querySelectorAll('[data-since]').forEach((n) => {
    const since = n.dataset.since;
    n.textContent = n.classList.contains('ago') ? `${time(since)} · ${elapsed(since)}` : elapsed(since);
  });
}, 1000);
