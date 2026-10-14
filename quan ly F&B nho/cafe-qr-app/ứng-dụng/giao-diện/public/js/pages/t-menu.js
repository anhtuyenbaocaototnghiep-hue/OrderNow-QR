// S-02 Menu + S-03 Giỏ hàng. Luồng chuẩn ≤ 3 chạm (NFR-003/Q-016): "+" món → "Xem giỏ · Gửi đơn" → "Gửi đơn".
// Lỗi hết món (BR-009/Q-005): server từ chối cả đơn → bỏ món đó khỏi giỏ và báo khách.
import { api } from '../api.js';
import { addItem, cartCount, cartTotal, clearCart, loadCart, MAX_QTY, saveCart, setQuantity, syncWithMenu, toOrderItems } from '../cart.js';
import { connectRealtime } from '../socket.js';
import { $, clear, el, errorMessage, modal, money, setBusy, thumb, toast } from '../ui.js';
import { getSessionId, goEntry, qrToken, setFlash, takeFlash } from '../customer.js';

const qr = qrToken();
const sessionId = getSessionId(qr);
if (!sessionId) {
  goEntry(qr);
  await new Promise(() => {}); // dừng module trong lúc chuyển trang
}

const state = { session: null, categories: [], itemsById: new Map(), cart: loadCart(sessionId), controls: new Map(), sheet: null };
const NOTE_CHIPS = ['Ít đường', 'Không đường', 'Ít đá', 'Nhiều đá', 'Không đá', 'Mang về'];

const flash = takeFlash();
if (flash) toast(flash.message, flash.type, 6000);

// ---------- Tải dữ liệu ----------
async function loadSession() {
  try {
    const s = await api(`/api/sessions/${sessionId}`);
    if (s.status === 'CLOSED') return goEntry(qr, 'Phiên trước đã thanh toán. Hệ thống tạo phiên mới cho bạn.');
    state.session = s;
    $('#table').textContent = s.table.name;
    const active = s.orders.filter((o) => o.status !== 'CANCELLED').length;
    const link = $('#orders-link');
    link.href = `/t/${qr}/track`;
    link.textContent = active ? `Đơn của bạn (${active})` : 'Đơn của bạn';
    link.hidden = false;
  } catch (err) {
    if (err.status === 403 || err.status === 404) return goEntry(qr);
    throw err;
  }
}

async function loadMenu() {
  const { shop, categories } = await api('/api/menu');
  $('#shop').textContent = shop.name;
  document.title = `Thực đơn · ${shop.name}`;
  state.categories = categories;
  state.itemsById = new Map(categories.flatMap((c) => c.items).map((i) => [i.id, i]));
  const gone = syncWithMenu(state.cart, state.itemsById);
  if (gone.length) {
    state.cart = state.cart.filter((l) => !gone.includes(l));
    toast(`${gone.map((g) => g.name).join(', ')} không còn trên thực đơn nên đã được bỏ khỏi giỏ`, 'warning', 5000);
  }
  persist();
}

async function loadAll() {
  try {
    await Promise.all([loadSession(), loadMenu()]);
    renderMenu();
    renderCartBar();
  } catch (err) {
    clear(
      $('#menu'),
      el('div', { class: 'empty' }, el('p', {}, errorMessage(err)), el('button', { class: 'btn btn-primary', type: 'button', onclick: loadAll }, 'Thử lại')),
    );
  }
}

// ---------- Menu ----------
function renderMenu() {
  const menu = $('#menu');
  const tabs = $('#tabs');
  state.controls.clear();
  if (state.categories.length === 0) {
    clear(tabs);
    clear(menu, el('div', { class: 'empty' }, 'Quán chưa có món nào trên thực đơn.'));
    return;
  }
  clear(
    tabs,
    state.categories.map((c, i) =>
      el(
        'button',
        {
          class: `chip ${i === 0 ? 'active' : ''}`,
          type: 'button',
          onclick: (e) => {
            tabs.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        c.name,
      ),
    ),
  );
  clear(
    menu,
    state.categories.map((c) =>
      el(
        'section',
        { class: 'c-section', id: `cat-${c.id}` },
        el('h2', {}, c.name),
        c.items.map((item) => {
          const control = el('div', { class: 'c-control' });
          state.controls.set(item.id, control);
          const card = el(
            'div',
            { class: `c-item ${item.isAvailable ? '' : 'soldout'}`, dataset: { id: item.id } },
            thumb(item.name, item.imageUrl),
            el('div', { class: 'grow' }, el('div', { class: 'c-item-name' }, item.name), el('div', { class: 'c-item-price' }, money(item.price))),
            control,
          );
          renderControl(item.id, card);
          return card;
        }),
      ),
    ),
  );
}

function renderControl(itemId, card = $(`.c-item[data-id="${itemId}"]`)) {
  const control = state.controls.get(itemId);
  const item = state.itemsById.get(itemId);
  if (!control || !item) return;
  card?.classList.toggle('soldout', !item.isAvailable);
  const line = state.cart.find((l) => l.menuItemId === itemId);
  if (!item.isAvailable) return clear(control, el('span', { class: 'badge danger' }, 'Hết món'));
  if (!line) {
    return clear(control, el('button', { class: 'add-btn', type: 'button', 'aria-label': `Thêm ${item.name}`, onclick: () => changeQty(item, 1) }, '+'));
  }
  clear(
    control,
    stepper(line.quantity, (d) => changeQty(item, d), item.name),
  );
}

function stepper(qty, onChange, name) {
  return el(
    'div',
    { class: 'stepper' },
    el('button', { type: 'button', 'aria-label': `Bớt ${name}`, onclick: () => onChange(-1) }, '−'),
    el('span', { 'aria-live': 'polite' }, qty),
    el('button', { type: 'button', 'aria-label': `Thêm ${name}`, disabled: qty >= MAX_QTY, onclick: () => onChange(1) }, '+'),
  );
}

function changeQty(item, delta) {
  if (delta > 0 && !item.isAvailable) return toast(`${item.name} đã hết món`, 'warning');
  const line = state.cart.find((l) => l.menuItemId === item.id);
  if (!line && delta > 0) addItem(state.cart, item);
  else if (line) setQuantity(state.cart, item.id, line.quantity + delta);
  persist();
  renderControl(item.id);
  renderCartBar();
  if (state.sheet) renderSheet();
}

function persist() {
  saveCart(sessionId, state.cart);
}

// ---------- Thanh giỏ + sheet giỏ hàng ----------
function renderCartBar() {
  const count = cartCount(state.cart);
  $('#cartbar').hidden = count === 0;
  $('#cart-count').textContent = `${count} món`;
  $('#cart-total').textContent = money(cartTotal(state.cart));
}

function openCart() {
  const body = el('div');
  const sendBtn = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: () => submit(sendBtn) });
  state.sheet = { body, sendBtn, message: el('div') };
  const m = modal({
    title: 'Giỏ hàng',
    sheet: true,
    body: el('div', {}, state.sheet.message, body),
    actions: [],
    onClose: () => (state.sheet = null),
  });
  m.root.append(el('div', { class: 'modal-foot' }, sendBtn));
  state.sheet.close = m.close;
  renderSheet();
}

function renderSheet() {
  const { body, sendBtn } = state.sheet;
  if (state.cart.length === 0) {
    clear(body, el('div', { class: 'empty' }, 'Giỏ hàng đang trống.'));
    sendBtn.disabled = true;
    sendBtn.textContent = 'Gửi đơn';
    return;
  }
  clear(
    body,
    state.cart.map((line) => {
      const item = state.itemsById.get(line.menuItemId);
      const unavailable = !item?.isAvailable;
      const note = el('input', {
        class: 'input',
        maxlength: 200,
        placeholder: 'Ghi chú (ít đường, nhiều đá…)',
        value: line.note || '',
        'aria-label': `Ghi chú cho ${line.name}`,
        oninput: (e) => {
          line.note = e.target.value;
          persist();
        },
      });
      return el(
        'div',
        { class: `cart-line ${unavailable ? 'unavailable' : ''}` },
        el(
          'div',
          { class: 'row between' },
          el(
            'div',
            { class: 'grow' },
            el('strong', {}, line.name),
            el('div', { class: 'muted small' }, money(line.price)),
            unavailable ? el('div', { class: 'field-error' }, 'Món này vừa hết — vui lòng bỏ khỏi giỏ') : null,
          ),
          stepper(line.quantity, (d) => changeQty(item ?? { id: line.menuItemId, name: line.name, isAvailable: false }, d), line.name),
        ),
        el('div', { style: { marginTop: '0.4rem' } }, note),
        el(
          'div',
          { class: 'note-chips' },
          NOTE_CHIPS.map((chip) =>
            el(
              'button',
              {
                class: 'chip',
                type: 'button',
                'aria-pressed': String((line.note || '').includes(chip)),
                onclick: (e) => {
                  const parts = (line.note || '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const next = parts.includes(chip) ? parts.filter((p) => p !== chip) : [...parts, chip];
                  line.note = next.join(', ').slice(0, 200);
                  note.value = line.note;
                  e.currentTarget.setAttribute('aria-pressed', String(next.includes(chip)));
                  persist();
                },
              },
              chip,
            ),
          ),
        ),
      );
    }),
    el('div', { class: 'cart-total' }, el('span', {}, 'Tạm tính'), el('span', {}, money(cartTotal(state.cart)))),
    el('p', { class: 'muted small' }, 'Thanh toán bằng tiền mặt sau khi dùng xong — bấm "Gọi thanh toán" ở màn hình theo dõi đơn.'),
  );
  sendBtn.disabled = false;
  sendBtn.textContent = `Gửi đơn · ${money(cartTotal(state.cart))}`;
}

let idempotencyKey = null;
async function submit(button) {
  if (state.cart.length === 0) return;
  setBusy(button, true);
  idempotencyKey ||= crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  try {
    await api('/api/orders', {
      method: 'POST',
      body: { sessionId, items: toOrderItems(state.cart) },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    idempotencyKey = null;
    state.cart = [];
    clearCart(sessionId);
    setFlash('Đặt món thành công! Quầy đã nhận đơn của bạn.', 'success');
    location.href = `/t/${qr}/track`;
  } catch (err) {
    idempotencyKey = null;
    setBusy(button, false);
    handleSubmitError(err);
  }
}

function handleSubmitError(err) {
  if (err.code === 'OUT_OF_STOCK' || err.code === 'ITEM_UNAVAILABLE') {
    const removed = err.details?.items ?? [];
    for (const it of removed) {
      const item = state.itemsById.get(it.menuItemId);
      if (item) item.isAvailable = false;
      setQuantity(state.cart, it.menuItemId, 0);
      renderControl(it.menuItemId);
    }
    persist();
    renderCartBar();
    if (state.sheet) {
      clear(state.sheet.message, el('div', { class: 'alert danger' }, err.message));
      renderSheet();
    } else toast(err.message, 'error', 6000);
    return;
  }
  if (err.code === 'SESSION_CLOSED' || err.status === 403) {
    state.sheet?.close();
    return goEntry(qr, err.code === 'SESSION_CLOSED' ? 'Phiên trước đã thanh toán. Vui lòng gọi món trong phiên mới.' : 'Vui lòng quét lại mã QR tại bàn.');
  }
  if (state.sheet) clear(state.sheet.message, el('div', { class: 'alert danger' }, errorMessage(err)));
  else toast(errorMessage(err), 'error');
}

// ---------- Realtime ----------
function onAvailability({ menuItemId, isAvailable }) {
  const item = state.itemsById.get(menuItemId);
  if (!item || item.isAvailable === isAvailable) return;
  item.isAvailable = isAvailable;
  renderControl(menuItemId);
  if (!isAvailable && state.cart.some((l) => l.menuItemId === menuItemId)) {
    toast(`${item.name} vừa hết món — vui lòng chọn món khác`, 'warning', 5000);
    if (state.sheet) renderSheet();
  }
}

$('#open-cart').addEventListener('click', openCart);

await loadAll();
const socket = connectRealtime({
  sessionId,
  onOnline: (reconnected) => {
    $('#offline').hidden = true;
    if (reconnected) loadAll();
  },
  onOffline: () => ($('#offline').hidden = false),
  onAuthError: () => goEntry(qr),
});
socket?.on('menu.availability_changed', onAvailability);
socket?.on('order.created', () => loadSession().catch(() => {}));
socket?.on('session.settled', () => (location.href = `/t/${qr}/track`));
socket?.on('session.closed', () => goEntry(qr, 'Bàn đã được đóng. Vui lòng quét lại mã QR để gọi món.'));
