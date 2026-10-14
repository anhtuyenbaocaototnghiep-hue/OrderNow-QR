// S-13 Bán mang đi: chạm món = +1, nhập tiền khách đưa (BR-006), "Thu tiền & In bill" → đơn PREPARING/PAID vào cột Đang pha.
import { api, staffApi } from '../api.js';
import { addItem, cartTotal, clearCart, loadCart, MAX_QTY, saveCart, setQuantity, syncWithMenu, toOrderItems } from '../cart.js';
import { getToken } from '../auth.js';
import { mountPosShell } from '../pos-shell.js';
import { printUrl } from '../print.js';
import { connectRealtime } from '../socket.js';
import { $, clear, el, errorMessage, money, moneyInput, moneyValue, num, setBusy, setMoney, statusBadge, time, toast } from '../ui.js';

const shell = await mountPosShell('takeaway');
const SCOPE = 'takeaway';
const state = { categories: [], itemsById: new Map(), activeCat: null, cart: loadCart(SCOPE) };

const received = moneyInput({ id: 'received', name: 'amountReceived' });
$('#received-slot').append(received);

async function loadMenu() {
  try {
    const { categories } = await api('/api/menu');
    state.categories = categories;
    state.itemsById = new Map(categories.flatMap((c) => c.items).map((i) => [i.id, i]));
    state.activeCat ??= categories[0]?.id ?? null;
    syncWithMenu(state.cart, state.itemsById);
    state.cart = state.cart.filter((l) => state.itemsById.has(l.menuItemId));
    renderTabs();
    renderTiles();
    renderCart();
  } catch (err) {
    clear($('#tiles'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function renderTabs() {
  clear(
    $('#tabs'),
    state.categories.map((c) =>
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
  const cat = state.categories.find((c) => c.id === state.activeCat);
  if (!cat) return clear($('#tiles'), el('p', { class: 'muted' }, 'Chưa có món.'));
  clear(
    $('#tiles'),
    cat.items.map((item) => {
      const inCart = state.cart.find((l) => l.menuItemId === item.id)?.quantity;
      return el(
        'button',
        { class: 'tile', type: 'button', disabled: !item.isAvailable, onclick: () => add(item), 'aria-label': `${item.name}, ${money(item.price)}` },
        el('span', { class: 'name' }, item.name),
        el('span', { class: 'price' }, money(item.price)),
        !item.isAvailable ? el('div', { class: 'badge danger', style: { marginTop: '0.3rem' } }, 'Hết món') : null,
        inCart ? el('span', { class: 'in-cart' }, inCart) : null,
      );
    }),
  );
}

function add(item) {
  addItem(state.cart, item);
  persist();
}

function persist() {
  saveCart(SCOPE, state.cart);
  renderTiles();
  renderCart();
}

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
          el('div', {}, el('strong', {}, l.name), el('div', { class: 'muted small' }, money(l.price))),
          el(
            'div',
            { class: 'qty-ctl' },
            el(
              'button',
              {
                type: 'button',
                'aria-label': `Bớt ${l.name}`,
                onclick: () => {
                  setQuantity(state.cart, l.menuItemId, l.quantity - 1);
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
                  setQuantity(state.cart, l.menuItemId, l.quantity + 1);
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
  const total = cartTotal(state.cart);
  $('#total').textContent = money(total);
  const quick = [...new Set([total, 50000, 100000, 200000, 500000].filter((v) => v >= total && v > 0))];
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
        v === total ? `Đủ tiền (${num(v / 1000)}k)` : `${num(v / 1000)}k`,
      ),
    ),
  );
  updateChange();
}

function updateChange() {
  const total = cartTotal(state.cart);
  const got = moneyValue(received);
  const box = $('#change');
  box.classList.toggle('short', got !== null && got < total);
  if (got === null || total === 0) clear(box, el('span', {}, 'Tiền thừa'), el('span', {}, '—'));
  else if (got < total) clear(box, el('span', {}, 'Còn thiếu'), el('span', {}, money(total - got)));
  else clear(box, el('span', {}, 'Tiền thừa trả khách'), el('span', {}, money(got - total)));
  $('#pay').disabled = state.cart.length === 0;
  received.classList.remove('invalid');
  clear($('#pay-error'));
}
received.addEventListener('input', updateChange);

$('#pay-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const total = cartTotal(state.cart);
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
    const { order, payment } = await staffApi('/api/orders/takeaway', { method: 'POST', body: { items: toOrderItems(state.cart), amountReceived: got } });
    printUrl(`/pos/orders/${order.orderId}/receipt`);
    toast(`Đơn #${order.orderCode}: thu ${money(payment.amountReceived)}, tiền thừa ${money(payment.changeGiven)}`, 'success', 6000);
    state.cart = [];
    clearCart(SCOPE);
    setMoney(received, null);
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
    clear($('#pay-error'), el('div', { class: 'alert danger', style: { marginTop: '0.5rem' } }, errorMessage(err)));
  } finally {
    setBusy(btn, false);
    $('#pay').disabled = state.cart.length === 0;
  }
});

$('#clear').addEventListener('click', () => {
  state.cart = [];
  clearCart(SCOPE);
  setMoney(received, null);
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
                  el('td', { class: 'small' }, o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')),
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
    }
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
socket?.on('menu.availability_changed', ({ menuItemId, isAvailable }) => {
  const item = state.itemsById.get(menuItemId);
  if (item) {
    item.isAvailable = isAvailable;
    renderTiles();
  }
});
for (const evt of ['order.created', 'order.status_changed']) {
  socket?.on(evt, (p) => p.order?.type === 'TAKE_AWAY' && loadToday());
}
