// S-02 Menu + S-03 Giỏ hàng. Luồng chuẩn ≤ 3 chạm (NFR-003/Q-016): "+" món → "Xem giỏ · Gửi đơn" → "Gửi đơn".
// Lỗi hết món (BR-009/Q-005): server từ chối cả đơn → bỏ món đó khỏi giỏ và báo khách.
// ADR-005: mục Ưu đãi / Gợi ý / Combo, tùy chọn món (món có lựa chọn mặc định vẫn thêm 1 chạm), hội viên SĐT, báo giá từ server.
// ADR-006: "Lần trước bạn gọi — Gọi lại?" + món yêu thích ♥ (F-045), thời gian chờ ước tính (F-025), menu theo lịch tự tải lại (F-040).
import { api } from '../api.js';
import {
  addItem,
  cartCount,
  cartTotal,
  clearCart,
  itemQuantity,
  lineKey,
  loadCart,
  MAX_QTY,
  removeItem,
  saveCart,
  setQuantity,
  syncWithMenu,
  toOrderItems,
} from '../cart.js';
import { mountMemberBox } from '../member-box.js';
import { defaultChoice, groupsOf, pickOptions } from '../options.js';
import { connectRealtime } from '../socket.js';
import { $, clear, el, errorMessage, modal, money, setBusy, thumb, toast } from '../ui.js';
import { getSessionId, goEntry, qrToken, setFlash, takeFlash } from '../customer.js';

const qr = qrToken();
const sessionId = getSessionId(qr);
if (!sessionId) {
  goEntry(qr);
  await new Promise(() => {}); // dừng module trong lúc chuyển trang
}

const state = {
  session: null,
  menu: null,
  itemsById: new Map(),
  cart: loadCart(sessionId),
  controls: new Map(), // itemId → Set(node điều khiển) — một món có thể hiện ở nhiều mục (Gợi ý + danh mục)
  sheet: null,
  quote: null,
  recall: null, // { memberId, recent, favorites } khi phiên có hội viên (F-045)
  eta: null, // { minMinutes, maxMinutes } (F-025)
};
const NOTE_CHIPS = ['Ít đường', 'Không đường', 'Ít đá', 'Nhiều đá', 'Không đá', 'Mang về'];

const flash = takeFlash();
if (flash) toast(flash.message, flash.type, 6000);

// ---------- Tải dữ liệu ----------
async function loadSession() {
  try {
    const s = await api(`/api/sessions/${sessionId}`);
    if (s.status === 'CLOSED') return goEntry(qr, 'Phiên trước đã thanh toán. Hệ thống tạo phiên mới cho bạn.');
    const memberChanged = s.member?.memberId !== state.session?.member?.memberId;
    state.session = s;
    if (memberChanged) loadRecall();
    $('#table').textContent = s.table.name;
    const active = s.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED').length;
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
  const menu = await api('/api/menu');
  $('#shop').textContent = menu.shop.name;
  document.title = `Thực đơn · ${menu.shop.name}`;
  state.menu = menu;
  state.itemsById = new Map([...menu.categories.flatMap((c) => c.items), ...menu.combos].map((i) => [i.id, i]));
  scheduleMenuReload(menu.nextChangeAt);
  const gone = syncWithMenu(state.cart, state.itemsById);
  if (gone.length) {
    state.cart = state.cart.filter((l) => !gone.includes(l));
    toast(`${[...new Set(gone.map((g) => g.name))].join(', ')} không còn trên thực đơn nên đã được bỏ khỏi giỏ`, 'warning', 5000);
  }
  persist();
}

async function loadAll() {
  try {
    await Promise.all([loadSession(), loadMenu()]);
    renderStore();
    renderMenu();
    renderCartBar();
    requestQuote();
  } catch (err) {
    clear(
      $('#menu'),
      el('div', { class: 'empty' }, el('p', {}, errorMessage(err)), el('button', { class: 'btn btn-primary', type: 'button', onclick: loadAll }, 'Thử lại')),
    );
  }
}

let menuTimer = null;
function reloadMenuSoon() {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(async () => {
    try {
      await loadMenu();
      renderStore();
      renderMenu();
      renderCartBar();
      requestQuote();
      if (state.sheet) renderSheet();
    } catch {
      /* lần sau */
    }
  }, 300);
}

// F-040: lịch thực đơn đổi (vd. hết giờ bữa sáng) → tự tải lại menu đúng lúc
let scheduleTimer = null;
function scheduleMenuReload(at) {
  clearTimeout(scheduleTimer);
  if (!at) return;
  const wait = Math.min(24 * 3600e3, Math.max(1000, new Date(at).getTime() - Date.now() + 1500));
  scheduleTimer = setTimeout(reloadMenuSoon, wait);
}

// ---------- Gọi lại đơn lần trước + món yêu thích (F-045) ----------
async function loadRecall() {
  const memberId = state.session?.member?.memberId;
  if (!memberId) {
    state.recall = null;
    if (state.menu) renderMenu();
    return;
  }
  try {
    const [recent, favorites] = await Promise.all([api(`/api/members/${memberId}/recent-orders?limit=1`), api(`/api/members/${memberId}/favorites`)]);
    state.recall = { memberId, recent: recent[0] ?? null, favorites };
  } catch {
    state.recall = null;
  }
  if (state.menu) renderMenu();
}

function recallSection() {
  const r = state.recall;
  if (!r || (!r.recent && !r.favorites.items.length)) return null;
  const favs = r.favorites.items.filter((f) => state.itemsById.get(f.menuItemId));
  return el(
    'section',
    { class: 'c-section recall', id: 'recall' },
    r.recent
      ? el(
          'div',
          { class: 'recall-card' },
          el('div', { class: 'small muted' }, 'Lần trước bạn gọi'),
          el(
            'div',
            {},
            r.recent.items
              .map((i) => `${i.name}${i.options.length ? ` (${i.options.join(', ')})` : ''}${i.note ? ` (${i.note})` : ''} ×${i.quantity}`)
              .join(', '),
          ),
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', id: 'replay', onclick: (e) => replay(r.recent.orderId, e.currentTarget) }, 'Gọi lại'),
        )
      : null,
    favs.length
      ? el(
          'div',
          { class: 'fav-strip' },
          el('div', { class: 'small muted' }, 'Món yêu thích của bạn'),
          el(
            'div',
            { class: 'note-chips' },
            favs.map((f) =>
              el(
                'button',
                {
                  class: 'chip',
                  type: 'button',
                  disabled: !state.itemsById.get(f.menuItemId)?.isAvailable,
                  onclick: () => quickAdd(state.itemsById.get(f.menuItemId)),
                },
                f.hearted ? '♥ ' : '',
                f.name,
                ' · ',
                money(state.itemsById.get(f.menuItemId)?.price ?? f.price),
              ),
            ),
          ),
        )
      : null,
  );
}

/** Nạp đơn cũ vào giỏ — server đã kiểm món còn bán, tùy chọn hợp lệ và lấy giá hiện tại. */
async function replay(orderId, button) {
  setBusy(button, true);
  try {
    const r = await api('/api/cart/replay', { method: 'POST', body: { orderId } });
    let added = 0;
    for (const it of r.items) {
      const item = state.itemsById.get(it.menuItemId);
      if (!item) continue;
      const key = lineKey(it.menuItemId, it.optionIds);
      const before = state.cart.find((l) => l.key === key)?.quantity ?? 0;
      addItem(state.cart, item, { optionIds: it.optionIds, optionLabels: it.optionLabels, optionDelta: it.optionDelta });
      setQuantity(state.cart, key, before + it.quantity);
      const line = state.cart.find((l) => l.key === key);
      if (line && it.note && !line.note) line.note = it.note;
      added += it.quantity;
    }
    persist();
    for (const id of new Set(r.items.map((i) => i.menuItemId))) renderControl(id);
    renderCartBar();
    requestQuote();
    if (r.skipped.length) toast(`Không thêm được: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`, 'warning', 7000);
    if (added) {
      toast(`Đã thêm ${added} món như lần trước vào giỏ`, 'success');
      openCart();
    }
  } catch (err) {
    toast(errorMessage(err), 'error');
  } finally {
    setBusy(button, false);
  }
}

async function toggleFavorite(item, button) {
  const r = state.recall;
  if (!r) return;
  const on = !r.favorites.hearted.includes(item.id);
  try {
    r.favorites = await api(`/api/members/${r.memberId}/favorites/${item.id}`, { method: on ? 'PUT' : 'DELETE' });
    button.textContent = on ? '♥' : '♡';
    button.setAttribute('aria-pressed', String(on));
    toast(on ? `Đã thêm ${item.name} vào món yêu thích` : `Đã bỏ ${item.name} khỏi món yêu thích`, 'success', 2000);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ---------- Trạng thái nhận đơn (F-020) ----------
function renderStore() {
  const store = state.menu?.store;
  const banner = $('#store-closed');
  banner.hidden = !store || store.acceptingOrders;
  if (store && !store.acceptingOrders) banner.textContent = store.closedMessage;
}
const acceptingOrders = () => state.menu?.store?.acceptingOrders !== false;

// ---------- Menu ----------
const SECTIONS = () => {
  const m = state.menu;
  const out = [];
  const promoItems = m.categories.flatMap((c) => c.items).filter((i) => i.promotionBadge);
  if (m.promotions.length || promoItems.length) out.push({ id: 'promo', name: 'Ưu đãi', kind: 'promo', items: promoItems });
  const suggested = m.suggested.map((s) => ({ s, item: state.itemsById.get(s.menuItemId) })).filter((x) => x.item);
  if (suggested.length) out.push({ id: 'suggest', name: 'Gợi ý', kind: 'suggest', items: suggested });
  if (m.combos.length) out.push({ id: 'combo', name: 'Combo', kind: 'combo', items: m.combos });
  for (const c of m.categories) out.push({ id: `cat-${c.id}`, name: c.name, kind: 'cat', items: c.items });
  return out;
};

function priceNode(item) {
  return el(
    'div',
    { class: 'c-item-price' },
    item.listPrice > item.price ? el('s', { class: 'muted small' }, money(item.listPrice)) : null,
    item.listPrice > item.price ? ' ' : null,
    money(item.price),
  );
}

function itemCard(item, { badge = null } = {}) {
  const control = el('div', { class: 'c-control' });
  if (!state.controls.has(item.id)) state.controls.set(item.id, new Set());
  state.controls.get(item.id).add(control);
  const hasOptions = groupsOf(item, state.menu.modifierGroups).length > 0;
  const isCombo = item.itemType === 'COMBO';
  const card = el(
    'div',
    { class: `c-item ${item.isAvailable ? '' : 'soldout'}`, dataset: { id: item.id } },
    thumb(item.name, item.imageUrl),
    el(
      'div',
      { class: 'grow' },
      el(
        'div',
        { class: 'c-item-name' },
        item.name,
        badge ? el('span', { class: 'tag' }, badge) : null,
        item.promotionBadge ? el('span', { class: 'tag promo' }, item.promotionBadge) : null,
      ),
      isCombo ? el('div', { class: 'small muted' }, item.components.map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${c.name}`).join(' + ')) : null,
      priceNode(item),
      isCombo && item.savings > 0 ? el('div', { class: 'small save' }, `Tiết kiệm ${money(item.savings)}`) : null,
      hasOptions && item.isAvailable
        ? el('button', { class: 'link-btn small', type: 'button', onclick: () => chooseOptions(item) }, 'Chọn size / tùy chọn ›')
        : null,
    ),
    state.recall
      ? el(
          'button',
          {
            class: 'fav-btn',
            type: 'button',
            'aria-pressed': String(state.recall.favorites.hearted.includes(item.id)),
            'aria-label': `Yêu thích ${item.name}`,
            onclick: (e) => toggleFavorite(item, e.currentTarget),
          },
          state.recall.favorites.hearted.includes(item.id) ? '♥' : '♡',
        )
      : null,
    control,
  );
  renderControl(item.id);
  return card;
}

function renderMenu() {
  const menu = $('#menu');
  const tabs = $('#tabs');
  state.controls.clear();
  const sections = SECTIONS();
  if (sections.every((s) => s.items.length === 0 && s.kind !== 'promo')) {
    clear(tabs);
    clear(menu, el('div', { class: 'empty' }, 'Quán chưa có món nào trên thực đơn.'));
    return;
  }
  clear(
    tabs,
    sections.map((s, i) =>
      el(
        'button',
        {
          class: `chip ${i === 0 ? 'active' : ''} ${s.kind !== 'cat' ? 'special' : ''}`,
          type: 'button',
          onclick: (e) => {
            tabs.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        s.name,
      ),
    ),
  );
  clear(
    menu,
    recallSection(),
    sections.map((s) =>
      el(
        'section',
        { class: `c-section ${s.kind}`, id: s.id },
        el('h2', {}, s.kind === 'suggest' ? '⭐ Gợi ý cho bạn' : s.kind === 'promo' ? '🎁 Ưu đãi hôm nay' : s.kind === 'combo' ? '🍱 Combo' : s.name),
        s.kind === 'promo'
          ? state.menu.promotions.map((p) =>
              el('div', { class: 'promo-card' }, el('strong', {}, p.badgeText || p.name), el('div', { class: 'small' }, p.description)),
            )
          : null,
        s.kind === 'suggest' ? s.items.map(({ s: sug, item }) => itemCard(item, { badge: sug.label })) : s.items.map((item) => itemCard(item)),
      ),
    ),
  );
}

function renderControl(itemId) {
  const item = state.itemsById.get(itemId);
  const nodes = state.controls.get(itemId);
  if (!item || !nodes) return;
  const hasOptions = groupsOf(item, state.menu.modifierGroups).length > 0;
  const qty = itemQuantity(state.cart, itemId);
  for (const control of nodes) {
    control.closest('.c-item')?.classList.toggle('soldout', !item.isAvailable);
    if (!item.isAvailable) {
      clear(control, el('span', { class: 'badge danger' }, 'Hết món'));
      continue;
    }
    if (hasOptions) {
      // Món có tùy chọn: "+" thêm theo lựa chọn mặc định (vẫn 1 chạm); sửa số lượng từng dòng trong giỏ
      clear(
        control,
        qty ? el('span', { class: 'qty-badge', 'aria-label': `${qty} trong giỏ` }, qty) : null,
        el('button', { class: 'add-btn', type: 'button', 'aria-label': `Thêm ${item.name}`, onclick: () => quickAdd(item) }, '+'),
      );
      continue;
    }
    const line = state.cart.find((l) => l.menuItemId === itemId);
    if (!line) clear(control, el('button', { class: 'add-btn', type: 'button', 'aria-label': `Thêm ${item.name}`, onclick: () => quickAdd(item) }, '+'));
    else
      clear(
        control,
        stepper(line.quantity, (d) => changeLine(line.key, d), item.name),
      );
  }
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

async function quickAdd(item) {
  if (!item.isAvailable) return toast(`${item.name} đã hết món`, 'warning');
  const choice = defaultChoice(item, state.menu.modifierGroups);
  if (!choice) return chooseOptions(item);
  addItem(state.cart, item, choice);
  if (choice.optionLabels.length) toast(`Đã thêm ${item.name} (${choice.optionLabels.join(', ')})`, 'success', 2000);
  changed(item.id);
}

async function chooseOptions(item) {
  const choice = await pickOptions(item, state.menu.modifierGroups);
  if (!choice) return;
  addItem(state.cart, item, choice);
  changed(item.id);
}

function changeLine(key, delta) {
  const line = state.cart.find((l) => l.key === key);
  if (!line) return;
  const item = state.itemsById.get(line.menuItemId);
  if (delta > 0 && !item?.isAvailable) return toast(`${line.name} đã hết món`, 'warning');
  setQuantity(state.cart, key, line.quantity + delta);
  changed(line.menuItemId);
}

function changed(itemId) {
  persist();
  renderControl(itemId);
  renderCartBar();
  requestQuote();
  if (state.sheet) renderSheet();
}

function persist() {
  saveCart(sessionId, state.cart);
}

// ---------- Báo giá từ server (khuyến mãi, combo, tùy chọn — không tự tính ở FE) ----------
let quoteTimer = null;
let quoteSeq = 0;
function requestQuote() {
  clearTimeout(quoteTimer);
  if (state.cart.length === 0) {
    state.quote = null;
    return;
  }
  quoteTimer = setTimeout(async () => {
    fetchEta();
    const seq = ++quoteSeq;
    try {
      const q = await api('/api/orders/quote', { method: 'POST', body: { items: toOrderItems(state.cart) } });
      if (seq !== quoteSeq) return;
      state.quote = q;
    } catch {
      if (seq !== quoteSeq) return;
      state.quote = null; // lỗi (món hết…) sẽ được báo rõ khi gửi đơn
    }
    renderCartBar();
    // Có báo giá mới: vẽ lại dòng (giá khuyến mãi) — trừ khi khách đang gõ ghi chú trong giỏ
    if (state.sheet) state.sheet.body.contains(document.activeElement) ? renderTotals() : renderSheet();
  }, 250);
}

const shownTotal = () => state.quote?.total ?? cartTotal(state.cart);

/** F-025: "Dự kiến khoảng 8–12 phút" theo hàng chờ hiện tại + giỏ. */
async function fetchEta() {
  if (!state.cart.length) return;
  try {
    state.eta = await api(`/api/queue/eta?items=${encodeURIComponent(state.cart.map((l) => `${l.menuItemId}:${l.quantity}`).join(','))}`);
  } catch {
    state.eta = null;
  }
  if (state.sheet) renderTotals();
}

// ---------- Thanh giỏ + sheet giỏ hàng ----------
function renderCartBar() {
  const count = cartCount(state.cart);
  $('#cartbar').hidden = count === 0;
  $('#cart-count').textContent = `${count} món`;
  $('#cart-total').textContent = money(shownTotal());
}

function openCart() {
  const body = el('div');
  const totals = el('div');
  const memberSlot = el('div');
  const sendBtn = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: () => submit(sendBtn) });
  state.sheet = { body, totals, sendBtn, message: el('div') };
  const m = modal({
    title: 'Giỏ hàng',
    sheet: true,
    body: el('div', {}, state.sheet.message, memberSlot, body, totals),
    actions: [],
    onClose: () => (state.sheet = null),
  });
  m.root.append(el('div', { class: 'modal-foot' }, sendBtn));
  state.sheet.close = m.close;
  state.sheet.member = mountMemberBox(memberSlot, {
    sessionId,
    getSession: () => state.session,
    onChange: async () => {
      await loadSession();
      state.sheet?.member.render();
      if (state.sheet) renderTotals();
    },
  });
  renderSheet();
}

function lineNode(line) {
  const item = state.itemsById.get(line.menuItemId);
  const unavailable = !item?.isAvailable;
  const quoted = state.quote?.lines.find((q) => q.menuItemId === line.menuItemId && sameOptions(q.options, line.optionIds));
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
        line.optionLabels?.length ? el('div', { class: 'small opt-labels' }, line.optionLabels.join(', ')) : null,
        item?.itemType === 'COMBO' ? el('div', { class: 'small muted' }, item.components.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
        el(
          'div',
          { class: 'muted small' },
          quoted && quoted.lineDiscount > 0 ? el('s', {}, money(quoted.listPrice)) : null,
          quoted && quoted.lineDiscount > 0 ? ' ' : null,
          money(quoted?.unitPrice ?? line.price),
          quoted?.promotionName ? el('span', { class: 'tag promo' }, quoted.promotionName) : null,
        ),
        unavailable ? el('div', { class: 'field-error' }, 'Món này vừa hết — vui lòng bỏ khỏi giỏ') : null,
      ),
      stepper(line.quantity, (d) => changeLine(line.key, d), line.name),
    ),
    item?.itemType === 'COMBO' ? null : el('div', { style: { marginTop: '0.4rem' } }, note),
    item?.itemType === 'COMBO'
      ? null
      : el(
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
}

const sameOptions = (quotedOptions, optionIds = []) => {
  const a = quotedOptions.map((o) => o.optionId).sort((x, y) => x - y);
  const b = [...optionIds].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

function renderSheet() {
  const { body, sendBtn } = state.sheet;
  if (state.cart.length === 0) {
    clear(body, el('div', { class: 'empty' }, 'Giỏ hàng đang trống.'));
    clear(state.sheet.totals);
    sendBtn.disabled = true;
    sendBtn.textContent = 'Gửi đơn';
    return;
  }
  clear(body, state.cart.map(lineNode));
  renderTotals();
}

function renderTotals() {
  const { totals, sendBtn } = state.sheet;
  const q = state.quote;
  const m = state.session?.member;
  clear(
    totals,
    q && q.promoDiscount > 0 ? el('div', { class: 'cart-sub' }, el('span', {}, 'Tạm tính'), el('span', {}, money(q.subtotal))) : null,
    q && q.lineDiscount > 0 ? el('div', { class: 'cart-sub save' }, el('span', {}, 'Giá khuyến mãi'), el('span', {}, `−${money(q.lineDiscount)}`)) : null,
    q?.orderPromotion
      ? el('div', { class: 'cart-sub save' }, el('span', {}, q.orderPromotion.name), el('span', {}, `−${money(q.orderPromotion.discount)}`))
      : null,
    el('div', { class: 'cart-total' }, el('span', {}, 'Tổng đơn này'), el('span', {}, money(shownTotal()))),
    state.eta ? el('p', { class: 'small eta', id: 'cart-eta' }, `⏱ Dự kiến có món sau khoảng ${state.eta.minMinutes}–${state.eta.maxMinutes} phút`) : null,
    m ? el('p', { class: 'small save' }, `Ưu đãi hội viên (${m.maskedName}) được trừ khi thanh toán.`) : null,
    el('p', { class: 'muted small' }, 'Thanh toán bằng tiền mặt sau khi dùng xong — bấm "Gọi thanh toán" ở màn hình theo dõi đơn.'),
    acceptingOrders() ? null : el('div', { class: 'alert warning' }, state.menu.store.closedMessage),
  );
  sendBtn.disabled = !acceptingOrders();
  sendBtn.textContent = acceptingOrders() ? `Gửi đơn · ${money(shownTotal())}` : 'Quán tạm ngưng nhận đơn';
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
    for (const it of err.details?.items ?? []) {
      const item = state.itemsById.get(it.menuItemId);
      if (item) item.isAvailable = false;
      state.cart = removeItem(state.cart, it.menuItemId);
      renderControl(it.menuItemId);
    }
    persist();
    renderCartBar();
    requestQuote();
    if (state.sheet) {
      clear(state.sheet.message, el('div', { class: 'alert danger' }, err.message));
      renderSheet();
    } else toast(err.message, 'error', 6000);
    return;
  }
  if (err.code === 'STORE_CLOSED') {
    state.menu.store = { acceptingOrders: false, closedMessage: err.message };
    renderStore();
  }
  if (err.code === 'SESSION_CLOSED' || err.status === 403) {
    state.sheet?.close();
    return goEntry(qr, err.code === 'SESSION_CLOSED' ? 'Phiên trước đã thanh toán. Vui lòng gọi món trong phiên mới.' : 'Vui lòng quét lại mã QR tại bàn.');
  }
  if (err.code === 'INVALID_OPTIONS') reloadMenuSoon();
  if (state.sheet) {
    clear(state.sheet.message, el('div', { class: 'alert danger' }, errorMessage(err)));
    renderTotals();
  } else toast(errorMessage(err), 'error');
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
socket?.on('menu.updated', reloadMenuSoon);
socket?.on('store.status_changed', (p) => {
  if (!state.menu) return;
  state.menu.store = p;
  renderStore();
  if (state.sheet) renderTotals();
});
socket?.on('session.member_changed', async () => {
  await loadSession().catch(() => {});
  state.sheet?.member.render();
  if (state.sheet) renderTotals();
});
socket?.on('order.created', () => loadSession().catch(() => {}));
socket?.on('session.settled', () => (location.href = `/t/${qr}/track`));
socket?.on('session.closed', () => goEntry(qr, 'Bàn đã được đóng. Vui lòng quét lại mã QR để gọi món.'));
