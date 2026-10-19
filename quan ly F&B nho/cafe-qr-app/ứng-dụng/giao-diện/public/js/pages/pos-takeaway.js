// S-13 Bán mang đi: chạm món = +1, nhập tiền khách đưa (BR-006), "Thu tiền & In bill" → đơn PREPARING/PAID vào cột Đang pha.
// ADR-005: tab Combo (F-015), chọn tùy chọn món (F-013), hội viên + giảm giá tay (F-014, F-022); tổng tiền do server báo giá
// (khuyến mãi, hội viên, làm tròn) — POS gửi kèm expectedAmountDue, lệch → AMOUNT_CHANGED. Cần ca mở (F-018).
// ADR-006: tra SĐT hội viên → "Lần trước: … — Gọi lại" (F-045); món ngoài lịch thực đơn có nhãn (F-040).
import { staffApi } from '../api.js';
import { billingControls } from '../billing-controls.js';
import { addItem, cartTotal, clearCart, itemQuantity, lineKey, loadCart, MAX_QTY, saveCart, setQuantity, syncWithMenu, toOrderItems } from '../cart.js';
import { getToken } from '../auth.js';
import { defaultChoice, groupsOf, pickOptions } from '../options.js';
import { mountPosShell } from '../pos-shell.js';
import { printUrl } from '../print.js';
import { connectRealtime } from '../socket.js';
import { $, breakdownRows, clear, el, errorMessage, money, moneyInput, moneyValue, num, setBusy, setMoney, statusBadge, time, toast } from '../ui.js';

const shell = await mountPosShell('takeaway');
const SCOPE = 'takeaway';
const COMBO_TAB = 'combo';
const state = { menu: null, itemsById: new Map(), activeCat: null, cart: loadCart(SCOPE), quote: null };

const received = moneyInput({ id: 'received', name: 'amountReceived' });
$('#received-slot').append(received);
const billing = billingControls({ onChange: () => requestQuote(), onMember: (m) => showRecall(m) });
$('#billing-slot').append(billing.node);
const recallBox = el('div', { id: 'recall' });
$('#billing-slot').before(recallBox);

/** F-045: hội viên vừa tra → đơn lần trước + "Gọi lại" (giỏ đã kiểm, giá hiện tại). */
async function showRecall(m) {
  clear(recallBox);
  if (!m) return;
  try {
    const [last] = await staffApi(`/api/members/${m.memberId}/recent-orders?limit=1`);
    if (!last) return;
    clear(
      recallBox,
      el(
        'div',
        { class: 'recall-card' },
        el('div', { class: 'small muted' }, `Lần trước ${m.fullName} gọi`),
        el(
          'div',
          { class: 'small' },
          last.items.map((i) => `${i.name}${i.options.length ? ` (${i.options.join(', ')})` : ''}${i.note ? ` (${i.note})` : ''} ×${i.quantity}`).join(', '),
        ),
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => replay(last.orderId, e.currentTarget) }, 'Gọi lại'),
      ),
    );
  } catch {
    /* không có lịch sử */
  }
}

async function replay(orderId, button) {
  setBusy(button, true);
  try {
    const r = await staffApi('/api/cart/replay', { method: 'POST', body: { orderId } });
    for (const it of r.items) {
      const item = state.itemsById.get(it.menuItemId);
      if (!item) continue;
      const key = lineKey(it.menuItemId, it.optionIds);
      const before = state.cart.find((l) => l.key === key)?.quantity ?? 0;
      addItem(state.cart, item, { optionIds: it.optionIds, optionLabels: it.optionLabels, optionDelta: it.optionDelta });
      setQuantity(state.cart, key, before + it.quantity);
      const line = state.cart.find((l) => l.key === key);
      if (line && it.note && !line.note) line.note = it.note;
    }
    persist();
    if (r.skipped.length) toast(`Không thêm: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`, 'warning', 7000);
    else toast('Đã nạp đơn lần trước vào giỏ', 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    setBusy(button, false);
  }
}

async function loadMenu() {
  try {
    const menu = await staffApi('/api/menu'); // quầy thấy cả danh mục ngoài giờ bán (F-020)
    state.menu = menu;
    state.itemsById = new Map([...menu.categories.flatMap((c) => c.items), ...menu.combos].map((i) => [i.id, i]));
    state.activeCat ??= menu.categories[0]?.id ?? (menu.combos.length ? COMBO_TAB : null);
    syncWithMenu(state.cart, state.itemsById);
    state.cart = state.cart.filter((l) => state.itemsById.has(l.menuItemId));
    renderTabs();
    renderTiles();
    renderCart();
    requestQuote();
  } catch (err) {
    clear($('#tiles'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function renderTabs() {
  const tabs = [...(state.menu.combos.length ? [{ id: COMBO_TAB, name: 'Combo' }] : []), ...state.menu.categories];
  clear(
    $('#tabs'),
    tabs.map((c) =>
      el(
        'button',
        {
          class: `chip ${c.id === state.activeCat ? 'active' : ''}`,
          type: 'button',
          onclick: () => {
            state.activeCat = c.id;
            renderTabs();
            renderTiles();
          },
        },
        c.name,
      ),
    ),
  );
}

function renderTiles() {
  const items = state.activeCat === COMBO_TAB ? state.menu.combos : state.menu.categories.find((c) => c.id === state.activeCat)?.items;
  if (!items?.length) return clear($('#tiles'), el('p', { class: 'muted' }, 'Chưa có món.'));
  clear(
    $('#tiles'),
    items.map((item) => {
      const inCart = itemQuantity(state.cart, item.id);
      const hasOptions = groupsOf(item, state.menu.modifierGroups).length > 0;
      return el(
        'button',
        { class: 'tile', type: 'button', disabled: !item.isAvailable, onclick: () => add(item), 'aria-label': `${item.name}, ${money(item.price)}` },
        el('span', { class: 'name' }, item.name),
        el(
          'span',
          { class: 'price' },
          item.listPrice > item.price ? el('s', { class: 'small muted' }, money(item.listPrice)) : null,
          item.listPrice > item.price ? ' ' : null,
          money(item.price),
        ),
        item.itemType === 'COMBO' ? el('span', { class: 'small muted sub' }, item.components.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
        hasOptions ? el('span', { class: 'small muted sub' }, 'có tùy chọn') : null,
        item.hiddenBySchedule ? el('span', { class: 'small sub off-schedule', title: 'Khách không thấy món này lúc này (lịch thực đơn)' }, 'Ngoài lịch') : null,
        !item.isAvailable ? el('div', { class: 'badge danger', style: { marginTop: '0.3rem' } }, 'Hết món') : null,
        inCart ? el('span', { class: 'in-cart' }, inCart) : null,
      );
    }),
  );
}

/** Món có tùy chọn: luôn mở bảng chọn ở quầy (nhân viên hỏi khách). */
async function add(item) {
  let choice = {};
  if (groupsOf(item, state.menu.modifierGroups).length) {
    choice = await pickOptions(item, state.menu.modifierGroups, {
      sheet: false,
      initial: defaultChoice(item, state.menu.modifierGroups)?.optionIds,
      confirmLabel: 'Thêm',
    });
    if (!choice) return;
  }
  addItem(state.cart, item, choice);
  persist();
}

function persist() {
  saveCart(SCOPE, state.cart);
  renderTiles();
  renderCart();
  requestQuote();
}

// ---------- Báo giá + tổng thanh toán từ server ----------
let quoteTimer = null;
let quoteSeq = 0;
let quoteFresh = false; // báo giá khớp giỏ + lựa chọn hiện tại

async function fetchQuote() {
  const seq = ++quoteSeq;
  try {
    const q = await staffApi('/api/orders/takeaway/quote', { method: 'POST', body: { items: toOrderItems(state.cart), ...billing.body() } });
    if (seq !== quoteSeq) return;
    state.quote = q;
    quoteFresh = true;
    billing.setApproval(q.needsApproval);
    billing.showEarn(q.totals);
    clear($('#pay-error'));
  } catch (err) {
    if (seq !== quoteSeq) return;
    state.quote = null;
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
  }
  renderTotals();
}

function requestQuote() {
  clearTimeout(quoteTimer);
  quoteFresh = false;
  if (state.cart.length === 0) {
    state.quote = null;
    renderTotals();
    return;
  }
  quoteTimer = setTimeout(fetchQuote, 200);
}

/** Trước khi thu tiền: chắc chắn đang dùng báo giá mới nhất. */
async function ensureQuote() {
  if (quoteFresh && state.quote) return true;
  clearTimeout(quoteTimer);
  await fetchQuote();
  return Boolean(state.quote);
}

const due = () => state.quote?.totals.amountDue ?? null;

function renderCart() {
  const lines = $('#lines');
  if (state.cart.length === 0) clear(lines, el('p', { class: 'muted small' }, 'Chạm vào món bên trái để thêm.'));
  else
    clear(
      lines,
      state.cart.map((l) =>
        el(
          'div',
          { class: 'ta-line' },
          el(
            'div',
            {},
            el('strong', {}, l.name),
            l.optionLabels?.length ? el('div', { class: 'small opts' }, l.optionLabels.join(', ')) : null,
            el('div', { class: 'muted small' }, money(l.price)),
          ),
          el(
            'div',
            { class: 'qty-ctl' },
            el(
              'button',
              {
                type: 'button',
                'aria-label': `Bớt ${l.name}`,
                onclick: () => {
                  setQuantity(state.cart, l.key, l.quantity - 1);
                  persist();
                },
              },
              '−',
            ),
            el('span', {}, l.quantity),
            el(
              'button',
              {
                type: 'button',
                'aria-label': `Thêm ${l.name}`,
                disabled: l.quantity >= MAX_QTY,
                onclick: () => {
                  setQuantity(state.cart, l.key, l.quantity + 1);
                  persist();
                },
              },
              '+',
            ),
          ),
          el('strong', { class: 'nowrap' }, money(l.price * l.quantity)),
          el('input', {
            class: 'input',
            placeholder: 'Ghi chú (ít đá…)',
            maxlength: 200,
            value: l.note || '',
            oninput: (e) => {
              l.note = e.target.value;
              saveCart(SCOPE, state.cart);
            },
          }),
        ),
      ),
    );
  renderTotals();
}

function renderTotals() {
  const d = due();
  const shown = d ?? cartTotal(state.cart);
  $('#total').textContent = money(shown);
  clear($('#breakdown'), state.quote && state.quote.totals.breakdownLines.length > 2 ? breakdownRows(state.quote.totals.breakdownLines, 'due-row') : null);
  const quick = [...new Set([shown, 50000, 100000, 200000, 500000].filter((v) => v >= shown && v > 0))];
  clear(
    $('#quick'),
    quick.map((v) =>
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: () => {
            setMoney(received, v);
            updateChange();
          },
        },
        v === shown ? `Đủ tiền (${num(v / 1000)}k)` : `${num(v / 1000)}k`,
      ),
    ),
  );
  updateChange();
}

function updateChange() {
  const total = due() ?? cartTotal(state.cart);
  const got = moneyValue(received);
  const box = $('#change');
  box.classList.toggle('short', got !== null && got < total);
  if (got === null || total === 0) clear(box, el('span', {}, 'Tiền thừa'), el('span', {}, '—'));
  else if (got < total) clear(box, el('span', {}, 'Còn thiếu'), el('span', {}, money(total - got)));
  else clear(box, el('span', {}, 'Tiền thừa trả khách'), el('span', {}, money(got - total)));
  $('#pay').disabled = state.cart.length === 0 || !shell.shift;
  $('#pay').title = shell.shift ? '' : 'Chưa mở ca';
  received.classList.remove('invalid');
}
received.addEventListener('input', () => {
  updateChange();
  clear($('#pay-error'));
});
shell.onShiftChange(updateChange);

$('#pay-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.cart.length === 0 || !(await ensureQuote())) return;
  const total = due();
  const got = moneyValue(received);
  if (got === null || got < total) {
    // AC-008-02: chặn, bôi đỏ, báo lỗi
    received.classList.add('invalid');
    clear($('#pay-error'), el('div', { class: 'field-error' }, `Vui lòng nhập tiền khách đưa (tối thiểu ${money(total)})`));
    received.focus();
    return;
  }
  const btn = $('#pay');
  setBusy(btn, true);
  try {
    const { order, payment } = await staffApi('/api/orders/takeaway', {
      method: 'POST',
      body: { items: toOrderItems(state.cart), amountReceived: got, expectedAmountDue: total, ...billing.body() },
    });
    printUrl(`/pos/orders/${order.orderId}/receipt`);
    toast(`Đơn #${order.orderCode}: thu ${money(payment.amountReceived)}, tiền thừa ${money(payment.changeGiven)}`, 'success', 6000);
    state.cart = [];
    clearCart(SCOPE);
    setMoney(received, null);
    billing.reset();
    persist();
    loadToday();
  } catch (err) {
    if (err.code === 'OUT_OF_STOCK' || err.code === 'ITEM_UNAVAILABLE') {
      for (const it of err.details?.items ?? []) {
        const item = state.itemsById.get(it.menuItemId);
        if (item) item.isAvailable = false;
      }
      renderTiles();
    }
    if (err.code === 'ADMIN_APPROVAL_REQUIRED') billing.setApproval(true);
    if (err.code === 'AMOUNT_CHANGED') requestQuote();
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
  } finally {
    setBusy(btn, false);
    updateChange();
  }
});

$('#clear').addEventListener('click', () => {
  state.cart = [];
  clearCart(SCOPE);
  setMoney(received, null);
  billing.reset();
  persist();
});

async function loadToday() {
  try {
    const orders = await staffApi('/api/orders?type=TAKE_AWAY&status=PREPARING,COMPLETED');
    const box = $('#today');
    if (orders.length === 0) return clear(box, el('p', { class: 'muted small' }, 'Chưa có đơn mang đi hôm nay.'));
    clear(
      box,
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
              el('th', {}, 'Mã'),
              el('th', {}, 'Giờ'),
              el('th', {}, 'Món'),
              el('th', { class: 'num' }, 'Tổng'),
              el('th', {}, 'Trạng thái'),
              el('th', {}, ''),
            ),
          ),
          el(
            'tbody',
            {},
            [...orders]
              .reverse()
              .map((o) =>
                el(
                  'tr',
                  {},
                  el('td', { class: 'mono' }, o.orderCode),
                  el('td', {}, time(o.createdAt)),
                  el(
                    'td',
                    { class: 'small' },
                    o.items.map((i) => `${i.quantity}× ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(', ')})` : ''}`).join(', '),
                  ),
                  el('td', { class: 'num' }, money(o.totalAmount)),
                  el('td', {}, statusBadge(o.status)),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => printUrl(`/pos/orders/${o.orderId}/receipt`) }, 'In lại')),
                ),
              ),
          ),
        ),
      ),
    );
  } catch (err) {
    clear($('#today'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}
$('#reload-today').addEventListener('click', loadToday);

await Promise.all([loadMenu(), loadToday()]);
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) {
      loadMenu();
      loadToday();
      shell.reloadShift();
    }
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
shell.attach(socket);
socket?.on('menu.availability_changed', ({ menuItemId, isAvailable }) => {
  const item = state.itemsById.get(menuItemId);
  if (item) {
    item.isAvailable = isAvailable;
    renderTiles();
  }
});
socket?.on('menu.updated', () => loadMenu());
for (const evt of ['order.created', 'order.status_changed']) {
  socket?.on(evt, (p) => p.order?.type === 'TAKE_AWAY' && loadToday());
}
