// S-02 Menu + S-03 Giỏ hàng. Luồng chuẩn ≤ 3 chạm (NFR-003/Q-016): "+" món → "Xem giỏ · Gửi đơn" → "Gửi đơn".
// F-081 (ADR-039): bấm món có tùy chọn ("+" hoặc tên món) → bảng chọn trượt lên ngay (tùy chọn + ghi chú + số lượng) → "Thêm vào giỏ";
// món không tùy chọn: "+" vẫn thêm ngay (3 chạm), bấm tên món mở bảng chọn để ghi chú / chọn số lượng. Giỏ hàng để xem và gửi.
// F-082 (ADR-040): giỏ không còn ô ghi chú / nút nhanh — bấm vào món trong giỏ để sửa (mở lại bảng chọn, "Cập nhật").
// F-083 (ADR-041): cài đặt menu.sheet_all (mặc định bật) — "+" mở bảng chọn cho MỌI món (khách làm một lần); tắt → như F-081.
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
  loadCart,
  MAX_QTY,
  removeItem,
  replaceLine,
  saveCart,
  setQuantity,
  syncWithMenu,
  toOrderItems,
} from '../cart.js';
import { mountMemberBox } from '../member-box.js';
import { groupsOf, pickItem } from '../options.js';
import { connectRealtime } from '../socket.js';
import { $, announce, clear, el, errorMessage, modal, money, reducedMotion, setBusy, thumb, toast } from '../ui.js';
import { followTable, getSessionId, goEntry, isLeaving, qrToken, setFlash, takeFlash } from '../customer.js';
import { icon } from '../icons.js';

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
    if (followTable(qr, sessionId, s.table)) return; // F-049: nhóm đã chuyển bàn trong lúc trang đóng / mất mạng
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
                f.hearted ? icon('heart', { filled: true, label: 'Đã thích' }) : '',
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
      // F-081: cùng món + tùy chọn + ghi chú thì cộng dồn, ghi chú khác thì thành dòng riêng
      addItem(
        state.cart,
        item,
        { optionIds: it.optionIds, optionLabels: it.optionLabels, optionDelta: it.optionDelta },
        { quantity: it.quantity, note: it.note || '' },
      );
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
    button.replaceChildren(icon('heart', { filled: on }));
    button.setAttribute('aria-pressed', String(on));
    toast(on ? `Đã thêm ${item.name} vào món yêu thích` : `Đã bỏ ${item.name} khỏi món yêu thích`, 'success', 2000);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ---------- Trạng thái nhận đơn: công tắc QR (F-020) + có ca đang mở (F-055, ADR-017 D-64) ----------
const NO_SHIFT_MESSAGE = 'Quán chưa mở ca nên chưa nhận đơn — vui lòng chờ nhân viên mở ca. Bạn vẫn xem menu và chọn món được.';
const acceptingOrders = () => state.menu?.store?.acceptingOrders !== false && state.menu?.store?.shiftOpen !== false;
/** Lý do chưa gửi được đơn (null = gửi được). Công tắc QR tắt ưu tiên hơn chưa mở ca. */
function closedReason() {
  const store = state.menu?.store;
  if (!store || acceptingOrders()) return null;
  return store.acceptingOrders === false ? store.closedMessage : NO_SHIFT_MESSAGE;
}
function renderStore() {
  const banner = $('#store-closed');
  const reason = closedReason();
  banner.hidden = !reason;
  if (reason) banner.textContent = reason;
}

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
  // ADR-042 D-193: chỉ hiện ảnh thật — món chưa có ảnh không còn ô chữ cái; bấm ảnh / cả dòng = bấm tên món (F-081)
  const pic = item.imageUrl ? thumb(item.name, item.imageUrl) : null;
  pic?.addEventListener('click', () => openItem(item));
  const card = el(
    'div',
    { class: `c-item ${item.isAvailable ? '' : 'soldout'}`, dataset: { id: item.id } },
    pic,
    el(
      'div',
      { class: 'grow' },
      el(
        'div',
        { class: 'c-item-name' },
        el('button', { class: 'c-name-btn', type: 'button', onclick: () => openItem(item) }, item.name), // F-081: mở bảng chọn
        badge ? el('span', { class: 'tag' }, badge) : null,
        item.promotionBadge ? el('span', { class: 'tag promo' }, item.promotionBadge) : null,
      ),
      // F-051: sao trung bình (chỉ món đủ số lượt đánh giá)
      item.rating
        ? el(
            'div',
            { class: 'rating small' },
            icon('star', { filled: true }),
            ` ${item.rating.avg.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${item.rating.count})`,
          )
        : null,
      isCombo ? el('div', { class: 'small muted' }, item.components.map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${c.name}`).join(' + ')) : null,
      priceNode(item),
      isCombo && item.savings > 0 ? el('div', { class: 'small save' }, `Tiết kiệm ${money(item.savings)}`) : null,
      hasOptions && item.isAvailable
        ? el('button', { class: 'link-btn small', type: 'button', onclick: () => openItem(item) }, 'Chọn size / tùy chọn ›')
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
          icon('heart', { filled: state.recall.favorites.hearted.includes(item.id) }),
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
          dataset: { target: s.id },
          'aria-current': i === 0 ? 'true' : null,
          onclick: (e) => {
            setActiveTab(e.currentTarget);
            spyPausedUntil = Date.now() + 900; // đang cuộn tới nhóm vừa bấm: không để thanh tự đổi theo các nhóm lướt qua
            // Người tắt chuyển động (prefers-reduced-motion) → nhảy thẳng tới nhóm, không cuộn mượt (review G3 TASK-066)
            document.getElementById(s.id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
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
        // ADR-042 D-194: tiêu đề nhóm là chữ — bỏ biểu tượng lấp lánh / quà / dao nĩa trước tên nhóm
        el('h2', {}, s.kind === 'suggest' ? 'Gợi ý cho bạn' : s.kind === 'promo' ? 'Ưu đãi hôm nay' : s.name),
        s.kind === 'promo'
          ? state.menu.promotions.map((p) =>
              el('div', { class: 'promo-card' }, el('strong', {}, p.badgeText || p.name), el('div', { class: 'small' }, p.description)),
            )
          : null,
        s.kind === 'suggest' ? s.items.map(({ s: sug, item }) => itemCard(item, { badge: sug.label })) : s.items.map((item) => itemCard(item)),
      ),
    ),
  );
  spyOnScroll(); // vẽ lại menu khi đang cuộn giữa trang (menu theo lịch, hết món…) → thanh nhóm theo đúng nhóm đang xem
}

// ---------- Thanh nhóm món: nhóm đang chọn tô màu, tự đổi theo nhóm đang xem khi cuộn (ADR-042 D-193, D-195) ----------
let spyPausedUntil = 0;
let spyFrame = 0;

function setActiveTab(btn) {
  const tabs = $('#tabs');
  if (!btn || !tabs) return;
  for (const b of tabs.querySelectorAll('.chip')) {
    b.classList.toggle('active', b === btn);
    if (b === btn) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  }
  // Nhóm đang chọn luôn nằm trong tầm nhìn của thanh (thanh cuộn ngang khi nhiều nhóm)
  tabs.scrollTo({ left: btn.offsetLeft - (tabs.clientWidth - btn.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** Nhóm đang xem = nhóm cuối cùng có đầu đã cuộn qua mép dưới thanh nhóm món; cuộn chạm đáy trang → nhóm cuối. */
function spyOnScroll() {
  if (spyFrame) return;
  spyFrame = requestAnimationFrame(() => {
    spyFrame = 0;
    if (Date.now() < spyPausedUntil) return;
    const sections = [...document.querySelectorAll('#menu .c-section')];
    if (!sections.length) return;
    const line = parseFloat(getComputedStyle(document.documentElement).fontSize) * 8.75 + 16; // = scroll-margin-top của .c-section + 16 px
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    // Cuộn chạm đáy → nhóm cuối; chỉ khi trang cuộn được và đã cuộn (màn lớn, trang ngắn không cuộn → giữ nhóm đầu — sửa 09/11/2026)
    const page = document.documentElement;
    if (globalThis.scrollY > 0 && page.scrollHeight > globalThis.innerHeight + 4 && globalThis.innerHeight + globalThis.scrollY >= page.scrollHeight - 4)
      current = sections.at(-1);
    const btn = document.querySelector(`#tabs .chip[data-target="${current.id}"]`);
    if (btn && !btn.classList.contains('active')) setActiveTab(btn);
  });
}
globalThis.addEventListener('scroll', spyOnScroll, { passive: true });

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
    const lines = state.cart.filter((l) => l.menuItemId === itemId);
    if (sheetAll() || hasOptions || lines.length > 1) {
      // F-081 / F-083: "+" mở bảng chọn (mọi món khi quán bật, hoặc món có tùy chọn); nhiều dòng → số trong giỏ, sửa từng dòng trong giỏ
      clear(
        control,
        qty ? el('span', { class: 'qty-badge', 'aria-label': `${qty} trong giỏ` }, qty) : null,
        el('button', { class: 'add-btn', type: 'button', 'aria-label': `Thêm ${item.name}`, onclick: () => quickAdd(item) }, icon('plus')),
      );
      continue;
    }
    const line = lines[0];
    if (!line)
      clear(control, el('button', { class: 'add-btn', type: 'button', 'aria-label': `Thêm ${item.name}`, onclick: () => quickAdd(item) }, icon('plus')));
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

/** F-083: quán bật "+" mở bảng chọn cho mọi món (mặc định) — máy chủ gửi `ui.sheetAll` cùng menu. */
const sheetAll = () => state.menu?.ui?.sheetAll !== false;

/** Nút "+": bật "mở bảng chọn cho mọi món" (F-083) hoặc món có tùy chọn (F-081) → bảng chọn; còn lại → thêm 1 phần ngay. */
async function quickAdd(item) {
  if (!item.isAvailable) return toast(`${item.name} đã hết món`, 'warning');
  if (sheetAll() || groupsOf(item, state.menu.modifierGroups).length) return openItem(item);
  addItem(state.cart, item, {});
  announce(`Đã thêm 1 ${item.name} vào giỏ`);
  changed(item.id);
}

/** Đầu bảng chọn món: ảnh vuông 112 px khi quán có ảnh thật (ADR-042 D-193, sửa 09/11), giá (giá gạch khi khuyến mãi), nhãn khuyến mãi, thành phần combo. */
// Đầu bảng chọn: có ảnh → ảnh vuông nhỏ bên trái, giá / nhãn / thành phần combo bên phải — ảnh không đẩy tùy chọn và nút "Thêm vào giỏ"
// xuống dưới (09/11/2026: ảnh rộng cả bảng chiếm gần nửa chiều cao, chủ dự án báo "phá bố cục")
function itemHead(item) {
  return el(
    'div',
    { class: `item-sheet-head${item.imageUrl ? ' has-photo' : ''}` },
    item.imageUrl ? el('img', { class: 'item-photo', src: item.imageUrl, alt: '', width: 112, height: 112 }) : null,
    el(
      'div',
      { class: 'item-head-info' },
      priceNode(item),
      item.promotionBadge ? el('span', { class: 'tag promo' }, item.promotionBadge) : null,
      item.itemType === 'COMBO'
        ? el('div', { class: 'small muted' }, item.components.map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${c.name}`).join(' + '))
        : null,
    ),
  );
}

/** F-081 (ADR-039): bảng chọn món trượt lên — tùy chọn, ghi chú, số lượng → "Thêm vào giỏ". */
async function openItem(item) {
  if (!item.isAvailable) return toast(`${item.name} đã hết món`, 'warning');
  const choice = await pickItem(item, state.menu.modifierGroups, {
    head: itemHead(item),
    noteChips: NOTE_CHIPS,
    allowNote: item.itemType !== 'COMBO',
    maxQty: MAX_QTY,
  });
  if (!choice) return;
  addItem(state.cart, item, choice, { quantity: choice.quantity, note: choice.note });
  // ADR-042 D-192: không hiện thông báo xanh — thanh giỏ nảy, số món / tổng đổi ngay; trình đọc màn hình vẫn được đọc
  const extra = [...choice.optionLabels, choice.note].filter(Boolean).join(', ');
  announce(`Đã thêm ${choice.quantity} ${item.name}${extra ? ` (${extra})` : ''} vào giỏ`);
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
let shownCount = null;
function renderCartBar() {
  const count = cartCount(state.cart);
  const bar = $('#cartbar');
  bar.hidden = count === 0;
  $('#cart-count').textContent = `${count} món`;
  $('#cart-total').textContent = money(shownTotal());
  // ADR-042 D-192: thêm món → thanh giỏ nảy nhẹ ngay chỗ khách nhìn (thay thông báo xanh)
  if (shownCount !== null && count > shownCount && !bar.hidden && !reducedMotion()) {
    bar.classList.remove('bump');
    void bar.offsetWidth; // thêm liên tiếp → chạy lại hiệu ứng
    bar.classList.add('bump');
  }
  shownCount = count;
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

/**
 * Dòng giỏ (F-082, ADR-040): tên, tùy chọn, ghi chú (chữ), giá + bước số lượng. Không còn ô ghi chú / nút nhanh trong giỏ —
 * bấm vào món ("Sửa ›") mở lại bảng chọn với lựa chọn cũ, "Cập nhật" thay dòng tại chỗ.
 */
function lineNode(line) {
  const item = state.itemsById.get(line.menuItemId);
  const unavailable = !item?.isAvailable;
  const quoted = state.quote?.lines.find((q) => q.menuItemId === line.menuItemId && sameOptions(q.options, line.optionIds));
  const main = el(
    'button',
    { class: 'cart-line-main', type: 'button', 'aria-label': `Sửa ${line.name}`, onclick: () => editLine(line.key) },
    el('strong', {}, line.name),
    line.optionLabels?.length ? el('span', { class: 'small opt-labels' }, line.optionLabels.join(', ')) : null,
    item?.itemType === 'COMBO' ? el('span', { class: 'small muted' }, item.components.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
    line.note ? el('span', { class: 'small line-note' }, `Ghi chú: ${line.note}`) : null,
    el(
      'span',
      { class: 'muted small line-price' },
      quoted && quoted.lineDiscount > 0 ? el('s', {}, money(quoted.listPrice)) : null,
      el('span', {}, money(quoted?.unitPrice ?? line.price)),
      quoted?.promotionName ? el('span', { class: 'tag promo' }, quoted.promotionName) : null,
    ),
    unavailable ? el('span', { class: 'field-error' }, 'Món này vừa hết — vui lòng bỏ khỏi giỏ') : el('span', { class: 'edit-hint small' }, 'Sửa ›'),
  );
  return el(
    'div',
    { class: `cart-line ${unavailable ? 'unavailable' : ''} ${state.flash?.key === line.key && Date.now() < state.flash.until ? 'updated' : ''}` },
    el(
      'div',
      { class: 'row between' },
      main,
      stepper(line.quantity, (d) => changeLine(line.key, d), line.name),
    ),
  );
}

/** F-082: bấm món trong giỏ → bảng chọn (tùy chọn, ghi chú, số lượng của dòng) → "Cập nhật" thay dòng tại chỗ. */
async function editLine(key) {
  const line = state.cart.find((l) => l.key === key);
  const item = line && state.itemsById.get(line.menuItemId);
  if (!item) return;
  if (!item.isAvailable) return toast(`${line.name} đã hết món — bấm − để bỏ khỏi giỏ`, 'warning');
  const choice = await pickItem(item, state.menu.modifierGroups, {
    head: itemHead(item),
    noteChips: NOTE_CHIPS,
    allowNote: item.itemType !== 'COMBO',
    maxQty: MAX_QTY,
    initial: { optionIds: line.optionIds, note: line.note, quantity: line.quantity },
    confirmLabel: 'Cập nhật',
  });
  if (!choice) return;
  const at = state.cart.findIndex((l) => l.key === key);
  replaceLine(state.cart, key, item, choice, { quantity: choice.quantity, note: choice.note });
  // ADR-042 D-192: dòng vừa sửa sáng lên rồi nhạt dần ngay trong giỏ (thay thông báo); trình đọc màn hình vẫn được đọc
  const updated = state.cart[at]?.menuItemId === item.id ? state.cart[at] : state.cart.find((l) => l.menuItemId === item.id);
  state.flash = updated ? { key: updated.key, until: Date.now() + 1200 } : null;
  announce(`Đã cập nhật ${item.name}`);
  changed(item.id);
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
    state.eta
      ? el(
          'p',
          { class: 'small eta', id: 'cart-eta' },
          icon('timer'),
          el('span', {}, 'Dự kiến có món sau khoảng ', el('span', { class: 'nowrap' }, `${state.eta.minMinutes}–${state.eta.maxMinutes} phút`)),
        )
      : null,
    m ? el('p', { class: 'small save' }, `Ưu đãi hội viên (${m.maskedName}) được trừ khi thanh toán.`) : null,
    holdPicker(),
    el('p', { class: 'muted small' }, 'Thanh toán bằng tiền mặt hoặc chuyển khoản sau khi dùng xong — bấm "Gọi thanh toán" ở màn hình theo dõi đơn.'),
    acceptingOrders() ? null : el('div', { class: 'alert warning' }, closedReason()),
  );
  sendBtn.disabled = !acceptingOrders();
  sendBtn.textContent = acceptingOrders()
    ? `Gửi đơn · ${money(shownTotal())}`
    : state.menu.store.acceptingOrders === false
      ? 'Quán tạm ngưng nhận đơn'
      : 'Quán chưa mở ca';
}

// F-066 (ADR-024 D-93): khách chọn lúc làm món cho đơn này
const HOLD_CHOICES = [
  ['now', 'Làm ngay'],
  ['10', 'Sau 10 phút'],
  ['20', 'Sau 20 phút'],
  ['arrival', 'Khi bạn tới'],
];
let holdChoice = 'now';
const holdBody = () => (holdChoice === 'now' ? undefined : holdChoice === 'arrival' ? { mode: 'ARRIVAL' } : { mode: 'TIME', minutes: Number(holdChoice) });

function holdPicker() {
  return el(
    'div',
    { class: 'hold-picker' },
    el('div', { class: 'small', id: 'hold-label' }, 'Khi nào làm món?'),
    el(
      'div',
      { class: 'note-chips', role: 'group', 'aria-labelledby': 'hold-label' },
      HOLD_CHOICES.map(([key, label]) =>
        el(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(holdChoice === key),
            onclick: () => {
              holdChoice = key;
              renderTotals();
            },
          },
          label,
        ),
      ),
    ),
    holdChoice === 'arrival'
      ? el('p', { class: 'small muted' }, 'Quán giữ món tối đa 45 phút. Bạn của bạn tới thì bấm "Bạn đã tới — làm món" ở màn theo dõi đơn.')
      : holdChoice !== 'now'
        ? el('p', { class: 'small muted' }, `Quán bắt đầu làm sau ${holdChoice} phút — vẫn bấm "Làm ngay" được ở màn theo dõi đơn.`)
        : null,
  );
}

let idempotencyKey = null;
let submitting = false;
let pendingMove = null; // F-049: nhóm được chuyển bàn đúng lúc đang gửi đơn → chuyển trang SAU khi gửi xong (không cắt ngang request)
async function submit(button) {
  if (state.cart.length === 0) return;
  setBusy(button, true);
  submitting = true;
  idempotencyKey ||= crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  try {
    await api('/api/orders', {
      method: 'POST',
      body: { sessionId, items: toOrderItems(state.cart), hold: holdBody() },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    idempotencyKey = null;
    state.cart = [];
    clearCart(sessionId);
    setFlash(
      holdChoice === 'now'
        ? 'Đặt món thành công! Quầy đã nhận đơn của bạn.'
        : holdChoice === 'arrival'
          ? 'Đã gửi đơn — quán giữ món tới khi bạn bấm "Bạn đã tới".'
          : `Đã gửi đơn — quán bắt đầu làm sau ${holdChoice} phút.`,
      'success',
    );
    holdChoice = 'now';
    submitting = false;
    if (pendingMove && followTable(qr, sessionId, { ...pendingMove, path: '/track' })) return;
    location.href = `/t/${qr}/track`;
  } catch (err) {
    idempotencyKey = null;
    submitting = false;
    setBusy(button, false);
    if (pendingMove && followTable(qr, sessionId, pendingMove)) return;
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
    state.menu.store = { ...state.menu.store, acceptingOrders: false, closedMessage: err.message };
    renderStore();
  }
  if (err.code === 'NO_OPEN_SHIFT') {
    // Khóa nút gửi ngay; tải lại menu để đúng trạng thái nếu sự kiện "đã mở ca" tới trước phản hồi này (review G3)
    state.menu.store = { ...state.menu.store, shiftOpen: false };
    renderStore();
    reloadMenuSoon();
    if (state.sheet) renderTotals(); // khung giỏ tự hiện lý do — không thêm cảnh báo đỏ thứ hai
    return;
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
socket?.on('session.settled', () => !isLeaving() && (location.href = `/t/${qr}/track`));
socket?.on('session.closed', () => goEntry(qr, 'Bàn đã được đóng. Vui lòng quét lại mã QR để gọi món.'));
socket?.on('session.table_changed', (p) => (submitting ? (pendingMove = p.toTable) : followTable(qr, sessionId, p.toTable))); // F-049
