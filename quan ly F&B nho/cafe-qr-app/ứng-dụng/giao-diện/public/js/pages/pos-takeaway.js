// S-13 Bán mang đi: chạm món = +1, nhập tiền khách đưa (BR-006), "Thu tiền & In bill" → đơn PREPARING/PAID vào cột Đang pha.
// ADR-005: tab Combo (F-015), chọn tùy chọn món (F-013), hội viên + giảm giá tay (F-014, F-022); tổng tiền do server báo giá
// (khuyến mãi, hội viên, làm tròn) — POS gửi kèm expectedAmountDue, lệch → AMOUNT_CHANGED. Cần ca mở (F-018).
// ADR-006: tra SĐT hội viên → "Lần trước: … — Gọi lại" (F-045); món ngoài lịch thực đơn có nhãn (F-040).
// F-074 (ADR-032): mất kết nối → bán tạm theo giá niêm yết, lưu trên máy này, in bill ngay, có mạng lại tự gửi bù; mỗi giỏ có mã lượt thu
// (gửi lại không tính hai lần); trưởng ca / quản lý nhập đơn từ phiếu bán tay; in phiếu bán tay trống để dự phòng.
import { staffApi } from '../api.js';
import { billingControls } from '../billing-controls.js';
import { mountGiftSell } from '../gift-sell.js';
import { addItem, cartTotal, clearCart, itemQuantity, lineKey, loadCart, MAX_QTY, saveCart, setQuantity, syncWithMenu, toOrderItems } from '../cart.js';
import { getToken } from '../auth.js';
import { defaultChoice, groupsOf, pickOptions } from '../options.js';
import { deviceName, newClientRef, onQueueChange, pendingSales, printBlankForm, printOfflineReceipt, recordSale, syncPending } from '../offline-sales.js';
import { mountPosShell } from '../pos-shell.js';
import { printUrl } from '../print.js';
import { connectRealtime } from '../socket.js';
import { $, breakdownRows, clear, el, errorMessage, money, moneyInput, moneyValue, num, setBusy, setMoney, statusBadge, time, toast } from '../ui.js';

const shell = await mountPosShell('takeaway');
// F-070: nút "Bán ly tặng" cạnh tiêu đề giỏ (chỉ hiện khi quản lý bật)
{
  const title = $('.cart-panel > h2');
  const giftSlot = el('div');
  const head = el('div', { class: 'row between cart-head' });
  title.replaceWith(head);
  head.append(title, giftSlot);
  mountGiftSell(giftSlot);
}
const SCOPE = 'takeaway';
const COMBO_TAB = 'combo';
const state = { menu: null, itemsById: new Map(), activeCat: null, cart: loadCart(SCOPE), quote: null };

// ---------- F-074: bán tạm khi mất kết nối, nhập phiếu bán tay ----------
const REF_KEY = 'cf_takeaway_ref';
const isLead = ['MANAGER', 'ADMIN'].includes(shell.user.role);
let offline = false;
let paperMode = false;
let offlineTimer = null;
/** Mã lượt thu của giỏ hiện tại — giữ nguyên khi thu lại (mạng chập chờn), đổi khi giỏ đổi. */
function cartRef() {
  let ref = null;
  try {
    ref = localStorage.getItem(REF_KEY);
  } catch {
    /* không có bộ nhớ: mỗi lần một mã */
  }
  if (!ref) {
    ref = newClientRef();
    try {
      localStorage.setItem(REF_KEY, ref);
    } catch {
      /* bỏ qua */
    }
  }
  return ref;
}
function dropCartRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* bỏ qua */
  }
}
const listMode = () => offline || paperMode; // giá niêm yết, không báo giá từ máy chủ
/** Giá một món theo bảng giá niêm yết đã tải (gồm tùy chọn) — đúng như máy chủ tính khi nhận đơn gửi bù. */
const listPrice = (l) => (state.itemsById.get(l.menuItemId)?.listPrice ?? l.price - (l.optionDelta ?? 0)) + (l.optionDelta ?? 0);
const listTotal = () => state.cart.reduce((sum, l) => sum + listPrice(l) * l.quantity, 0);
const offlinePhone = el('input', { class: 'input', id: 'offline-phone', type: 'tel', inputmode: 'tel', maxlength: 20, placeholder: '09xx xxx xxx' });
const offlineNote = el(
  'div',
  { class: 'offline-note', id: 'offline-note', role: 'status', hidden: true },
  el('strong', {}, 'Đang bán tạm khi mất kết nối'),
  el('p', { class: 'small' }, 'Giá niêm yết — không áp khuyến mãi, giảm giá, voucher. Đơn lưu trên máy này, in bill ngay, có mạng lại tự gửi về hệ thống.'),
  el('p', { class: 'small' }, 'Đừng tải lại trang khi đang mất mạng (đơn đã lưu không mất, nhưng trang sẽ không mở lại được tới khi có mạng).'),
  el('label', { for: 'offline-phone', class: 'small' }, 'SĐT hội viên (cộng điểm khi có mạng lại, không bắt buộc)'),
  offlinePhone,
);
const paperTime = el('input', { class: 'input', type: 'datetime-local', id: 'paper-time' });
const paperBox = el(
  'div',
  { class: 'paper-box', id: 'paper-box', hidden: true },
  el('label', { for: 'paper-time' }, 'Giờ bán ghi trên phiếu'),
  paperTime,
  el(
    'p',
    { class: 'small muted' },
    'Chọn món như trên phiếu. Đơn ghi vào ca đang mở theo giá niêm yết, ghi tên bạn là người nhập. Chỉ nhập phiếu trong 7 ngày.',
  ),
);
const offlineCard = el('div', { class: 'card offline-card', id: 'offline-card', hidden: true });

const received = moneyInput({ id: 'received', name: 'amountReceived' });
$('#received-slot').append(received);
// F-056 (ADR-019 D-71): tiền mặt / chuyển khoản
let method = 'CASH';
function setMethod(next) {
  method = next;
  $('#method-cash').setAttribute('aria-pressed', String(next === 'CASH'));
  $('#method-transfer').setAttribute('aria-pressed', String(next === 'TRANSFER'));
  $('#cash-fields').hidden = next !== 'CASH';
  $('#transfer-note').hidden = next !== 'TRANSFER';
  $('#pay').textContent = payLabel();
  clear($('#pay-error'));
}
function payLabel() {
  if (paperMode) return 'Ghi đơn bán tay';
  if (offline) return method === 'TRANSFER' ? 'Đã nhận chuyển khoản — lưu đơn tạm & In' : 'Thu tiền — lưu đơn tạm & In bill';
  return method === 'TRANSFER' ? 'Đã nhận chuyển khoản & In bill' : 'Thu tiền & In bill';
}
$('#method-cash').addEventListener('click', () => setMethod('CASH'));
$('#method-transfer').addEventListener('click', () => setMethod('TRANSFER'));
const billing = billingControls({ onChange: () => requestQuote(), onMember: (m) => showRecall(m) });
$('#billing-slot').append(billing.node);
const recallBox = el('div', { id: 'recall' });
$('#billing-slot').before(recallBox);
$('#billing-slot').before(offlineNote);
$('#pay-form').after(
  ...(isLead
    ? [
        el(
          'label',
          { class: 'check paper-toggle' },
          el('input', { type: 'checkbox', id: 'paper-mode', onchange: (e) => setPaperMode(e.target.checked) }),
          ' Nhập đơn từ phiếu bán tay',
        ),
        paperBox,
      ]
    : []),
  el(
    'button',
    { class: 'link-btn small', type: 'button', id: 'blank-form', onclick: () => printBlankForm(shell.shop) },
    'In phiếu bán tay trống (dự phòng mất điện / hỏng máy)',
  ),
);
$('#today').closest('.card').before(offlineCard);

/** Vào / ra chế độ bán tạm (mất kết nối với máy chủ). */
function setOffline(on) {
  if (offline === on) return;
  offline = on;
  offlineNote.hidden = !on;
  syncModeUi();
  if (!on) syncNow();
}

/** Đang bán tạm: hỏi máy chủ mỗi 8 giây — kết nối realtime có thể chậm nhận ra mạng đã có lại (hoặc chưa nhận ra đã mất). */
async function probeServer() {
  if (!offline) return;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) setOffline(false);
  } catch {
    /* vẫn mất kết nối */
  }
}
setInterval(probeServer, 8000);
window.addEventListener('offline', () => setOffline(true));
window.addEventListener('online', probeServer);

function setPaperMode(on) {
  paperMode = on;
  paperBox.hidden = !on;
  if (on && !paperTime.value) paperTime.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  syncModeUi();
}

function syncModeUi() {
  $('#billing-slot').hidden = listMode(); // hội viên / giảm giá / voucher cần máy chủ
  recallBox.hidden = listMode();
  $('#pay').textContent = payLabel();
  renderCart();
  requestQuote();
  renderOffline();
}

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
  dropCartRef(); // giỏ đổi → lượt thu mới
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
    if (err.code === 'NETWORK') {
      setOffline(true);
      return;
    }
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
  }
  renderTotals();
}

function requestQuote() {
  clearTimeout(quoteTimer);
  quoteFresh = false;
  if (state.cart.length === 0 || listMode()) {
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

const due = () => (listMode() ? (state.cart.length ? listTotal() : null) : (state.quote?.totals.amountDue ?? null));

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
            el('div', { class: 'muted small' }, money(listMode() ? listPrice(l) : l.price)),
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
          el('strong', { class: 'nowrap' }, money((listMode() ? listPrice(l) : l.price) * l.quantity)),
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
  clear(
    $('#breakdown'),
    !listMode() && state.quote && state.quote.totals.breakdownLines.length > 2 ? breakdownRows(state.quote.totals.breakdownLines, 'due-row') : null,
  );
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

/** Kiểm tiền khách đưa (tiền mặt) → số tiền hoặc null (đã báo lỗi). */
function cashOk(total) {
  const got = moneyValue(received);
  if (method === 'CASH' && (got === null || got < total)) {
    received.classList.add('invalid');
    clear($('#pay-error'), el('div', { class: 'field-error' }, `Vui lòng nhập tiền khách đưa (tối thiểu ${money(total)})`));
    received.focus();
    return null;
  }
  return method === 'CASH' ? got : 0;
}

const saleItems = () =>
  state.cart.map((l) => ({
    menuItemId: l.menuItemId,
    name: l.name,
    quantity: l.quantity,
    note: l.note?.trim() || null,
    optionIds: l.optionIds ?? [],
    optionLabels: l.optionLabels ?? [],
    unitPrice: listPrice(l),
  }));

function resetCart() {
  state.cart = [];
  clearCart(SCOPE);
  setMoney(received, null);
  setMethod('CASH');
  billing.reset();
  offlinePhone.value = '';
  dropCartRef();
  persist();
}

/** Mất kết nối: lưu đơn bán tạm trên máy này + in bill ngay. */
function payOffline() {
  const total = listTotal();
  const got = cashOk(total);
  if (got === null) return;
  let sale;
  try {
    sale = recordSale({
      clientRef: cartRef(),
      soldBy: { userId: shell.user.userId, fullName: shell.user.fullName },
      shiftId: shell.shift?.shiftId ?? null,
      method,
      amountReceived: method === 'CASH' ? got : null,
      total,
      memberPhone: offlinePhone.value.trim() || null,
      items: saleItems(),
    });
  } catch (err) {
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
    return;
  }
  printOfflineReceipt(sale, shell.shop);
  toast(`Đã lưu đơn tạm ${sale.localCode} (${money(total)}) — tự gửi về hệ thống khi có mạng lại`, 'success', 6000);
  resetCart();
}

/** Trưởng ca / quản lý nhập lại đơn ghi trên phiếu bán tay (cần có mạng). */
async function payPaper() {
  if (!paperTime.value) {
    clear($('#pay-error'), el('div', { class: 'field-error' }, 'Nhập giờ bán ghi trên phiếu'));
    paperTime.focus();
    return;
  }
  const total = listTotal();
  const got = cashOk(total);
  if (got === null) return;
  const btn = $('#pay');
  setBusy(btn, true);
  try {
    const r = await staffApi('/api/offline-sales', {
      method: 'POST',
      body: {
        clientRef: cartRef(),
        source: 'PAPER',
        soldAt: new Date(paperTime.value).toISOString(),
        shiftId: shell.shift?.shiftId ?? null,
        method,
        amountReceived: method === 'CASH' ? got : null,
        total,
        device: deviceName(),
        items: saleItems().map(({ name: _n, optionLabels: _o, ...i }) => i),
      },
    });
    const warn = r.issues.filter((i) => i.code !== 'TRANSFER_CHECK');
    toast(
      `Đã ghi đơn bán tay #${r.order.orderCode} (${money(total)})${warn.length ? ` — cần kiểm: ${warn.map((i) => i.text).join('; ')}` : ''}`,
      'success',
      8000,
    );
    resetCart();
    loadToday();
  } catch (err) {
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
  } finally {
    setBusy(btn, false);
    updateChange();
  }
}

$('#pay-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.cart.length === 0) return;
  if (paperMode) return payPaper();
  if (offline) return payOffline();
  if (!(await ensureQuote())) return;
  const total = due();
  const got = moneyValue(received);
  if (method === 'CASH' && (got === null || got < total)) {
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
      body: {
        items: toOrderItems(state.cart),
        method,
        ...(method === 'CASH' ? { amountReceived: got } : {}),
        expectedAmountDue: total,
        clientRef: cartRef(), // F-074: gửi lại cùng mã không tạo đơn thứ hai
        ...billing.body(),
      },
    });
    printUrl(`/pos/orders/${order.orderId}/receipt`);
    toast(
      payment.method === 'TRANSFER'
        ? `Đơn #${order.orderCode}: đã nhận chuyển khoản ${money(payment.amountDue)}`
        : `Đơn #${order.orderCode}: thu ${money(payment.amountReceived)}, tiền thừa ${money(payment.changeGiven)}`,
      'success',
      6000,
    );
    state.cart = [];
    clearCart(SCOPE);
    setMoney(received, null);
    setMethod('CASH'); // đơn sau mặc định tiền mặt (review G3)
    billing.reset();
    dropCartRef();
    persist();
    loadToday();
  } catch (err) {
    if (err.code === 'NETWORK') {
      // Có thể máy chủ đã ghi kịp — thu lại / lưu đơn tạm dùng CÙNG mã lượt thu nên không bị tính hai lần
      setOffline(true);
      clear(
        $('#pay-error'),
        el(
          'div',
          { class: 'alert danger', style: { marginTop: '0.5rem' } },
          'Mất kết nối khi đang thu tiền — bấm lại để lưu thành đơn bán tạm (không bị tính hai lần).',
        ),
      );
      return;
    }
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

$('#clear').addEventListener('click', resetCart);

// ---------- F-074: đơn bán tạm chờ gửi ----------
function renderOffline() {
  const queue = pendingSales();
  offlineCard.hidden = queue.length === 0;
  if (!queue.length) return;
  clear(
    offlineCard,
    el(
      'div',
      { class: 'row between wrap' },
      el('h2', { style: { margin: 0, fontSize: '1.05rem' } }, `Đơn bán tạm chờ gửi (${queue.length})`),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', id: 'sync-now', disabled: offline, onclick: () => syncNow(true) }, 'Gửi ngay'),
    ),
    el('p', { class: 'small muted' }, offline ? 'Đang mất kết nối — có mạng lại máy tự gửi.' : 'Máy tự gửi mỗi 30 giây khi có mạng.'),
    el(
      'ul',
      { class: 'offline-list' },
      queue.map((s) =>
        el(
          'li',
          {},
          el('strong', {}, s.localCode),
          ` · ${time(s.soldAt)} · ${money(s.total)} · ${s.method === 'TRANSFER' ? 'chuyển khoản' : 'tiền mặt'} · ${s.soldBy?.fullName ?? ''}`,
          s.error ? el('div', { class: 'small neg' }, `Chưa gửi được: ${s.error}`) : null,
        ),
      ),
    ),
  );
}
onQueueChange(renderOffline);

async function syncNow(manual = false) {
  if (offline || !pendingSales().length) return;
  const r = await syncPending();
  if (r.sent) {
    const check = r.results.some((x) => x.issues.some((i) => ['PRICE_DIFF', 'STOCK_SHORT', 'SHIFT_LATE'].includes(i.code)));
    toast(`Đã gửi ${r.sent} đơn bán tạm về hệ thống${check ? ' — có đơn cần trưởng ca kiểm (Ca & hoàn tiền)' : ''}`, 'success', 7000);
    loadToday();
  } else if (manual && r.left) toast('Chưa gửi được — kiểm tra kết nối / ca, máy sẽ thử lại', 'warning');
}
setInterval(() => {
  if (!offline && pendingSales().length) syncNow();
}, 30_000);

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
renderOffline();
syncNow();
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    clearTimeout(offlineTimer);
    setOffline(false);
    if (reconnected) {
      loadMenu();
      loadToday();
      shell.reloadShift();
    }
  },
  onOffline: () => {
    shell.setOnline(false);
    clearTimeout(offlineTimer);
    offlineTimer = setTimeout(() => setOffline(true), 4000); // chập chờn vài giây thì không đổi chế độ
  },
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
