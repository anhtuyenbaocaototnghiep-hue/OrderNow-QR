// S-16 Gọi món tại bàn (FEATURE-024): khách không dùng QR → nhân viên chọn bàn, chạm món (tùy chọn, combo, ghi chú từng món)
// rồi gửi đơn vào phiên của bàn (bàn trống → mở bàn). Đơn vào thẳng "Đang pha"; thu tiền như bàn gọi qua QR.
// Ghi chú bàn chỉ nhân viên thấy. Tổng tiền lấy từ báo giá server (/api/orders/quote — cùng bộ tính lúc gửi, ADR-005).
import { staffApi } from '../api.js';
import { addItem, cartCount, cartTotal, clearCart, itemQuantity, loadCart, MAX_QTY, saveCart, setQuantity, syncWithMenu, toOrderItems } from '../cart.js';
import { getToken } from '../auth.js';
import { defaultChoice, groupsOf, pickOptions } from '../options.js';
import { mountPosShell } from '../pos-shell.js';
import { connectRealtime } from '../socket.js';
import { $, breakdownRows, clear, el, errorMessage, money, setBusy, statusBadge, time, toast } from '../ui.js';
import { icon } from '../icons.js';

const shell = await mountPosShell('tables');
const COMBO_TAB = 'combo';
const params = new URLSearchParams(location.search);
const state = {
  menu: null,
  itemsById: new Map(),
  activeCat: null,
  tables: [],
  tableId: Number(params.get('table')) || null,
  sessionId: params.get('session') || null, // null = bàn trống, hoặc "Nhóm mới" khi newGroup
  newGroup: false,
  cart: [],
  quote: null,
  detail: null, // phiên đang chọn: các đơn đã gọi
};
const cartScope = (tableId) => `table_${tableId}`;
const table = () => state.tables.find((t) => t.tableId === state.tableId) ?? null;
const session = () => table()?.sessions.find((s) => s.sessionId === state.sessionId) ?? null;

// ---------- Thực đơn ----------
async function loadMenu() {
  try {
    const menu = await staffApi('/api/menu'); // quầy thấy cả danh mục ngoài giờ bán (F-020)
    state.menu = menu;
    state.itemsById = new Map([...menu.categories.flatMap((c) => c.items), ...menu.combos].map((i) => [i.id, i]));
    state.activeCat ??= menu.categories[0]?.id ?? (menu.combos.length ? COMBO_TAB : null);
    if (state.tableId) loadTableCart();
    renderTabs();
    renderTiles();
    renderCart();
  } catch (err) {
    clear($('#tiles'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function loadTableCart() {
  state.cart = loadCart(cartScope(state.tableId));
  if (!state.menu) return; // thực đơn chưa tải xong → loadMenu sẽ đồng bộ lại
  syncWithMenu(state.cart, state.itemsById);
  state.cart = state.cart.filter((l) => state.itemsById.has(l.menuItemId));
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
  if (!state.menu) return;
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

/** Món có tùy chọn: luôn mở bảng chọn (nhân viên hỏi khách). */
async function add(item) {
  if (!table()) {
    toast('Chọn bàn trước khi chọn món', 'warning');
    return;
  }
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
  if (state.tableId) saveCart(cartScope(state.tableId), state.cart);
  renderTiles();
  renderCart();
  renderTables();
}

// ---------- Sơ đồ bàn ----------
/** Tải sơ đồ bàn; giữ lựa chọn hợp lệ khi phiên vừa được mở / thanh toán ở máy khác. */
async function loadTables({ quiet = false } = {}) {
  try {
    state.tables = await staffApi('/api/tables');
  } catch (err) {
    clear($('#table-grid'), el('div', { class: 'alert danger' }, errorMessage(err)));
    return;
  }
  const t = table();
  if (!t) {
    state.tableId = null;
    state.sessionId = null;
    state.newGroup = false;
  } else if (state.sessionId && !session()) {
    const movedTo = state.tables.find((x) => x.sessions.some((s) => s.sessionId === state.sessionId));
    if (movedTo) return followGroup(t, movedTo); // F-049: nhóm đang chọn vừa được chuyển bàn
    // Nhóm đang chọn vừa thanh toán / đóng → đơn tiếp theo là nhóm mới, không gộp nhầm vào hóa đơn nhóm khác
    state.sessionId = null;
    state.newGroup = t.sessions.length > 0;
    if (!quiet) toast(`${t.name}: nhóm đang chọn đã thanh toán / đóng`, 'info');
  } else if (!state.sessionId && !state.newGroup && t.sessions.length) {
    const opened = t.sessions.find((s) => !s.lastMove);
    if (opened) {
      state.sessionId = opened.sessionId;
      if (!quiet) toast(`${t.name} vừa có khách mở bàn — đơn sẽ thêm vào nhóm đang mở`, 'info');
    } else {
      // F-049: bàn đang chọn vừa có nhóm CHUYỂN tới → món đang soạn không tự gộp vào bill nhóm đó (D-43), gửi thành nhóm mới
      state.newGroup = true;
      if (!quiet) toast(`${t.name} vừa có nhóm chuyển tới — món đang soạn sẽ gửi thành nhóm mới (bill riêng)`, 'info');
    }
  }
  renderTables();
  renderTarget();
}

/** F-049: nhóm đang chọn được chuyển sang bàn khác → đi theo nhóm, chuyển cả món đang soạn sang giỏ của bàn mới. */
function followGroup(from, to) {
  const moving = state.cart;
  saveCart(cartScope(from.tableId), []);
  state.tableId = to.tableId;
  const target = loadCart(cartScope(to.tableId));
  state.cart = [...target, ...moving];
  saveCart(cartScope(to.tableId), state.cart);
  toast(`Nhóm đã chuyển từ ${from.name} sang ${to.name}${moving.length ? ' — món đang soạn chuyển theo' : ''}`, 'info', 6000);
  afterSelect();
}

function renderTables() {
  const box = $('#table-grid');
  if (state.tables.length === 0) return clear(box, el('p', { class: 'muted small' }, 'Chưa có bàn nào. Quản lý thêm bàn ở trang "Bàn & mã QR".'));
  clear(
    box,
    state.tables.map((t) => {
      const pay = t.sessions.some((s) => s.status === 'PAYMENT_REQUESTED');
      const amount = t.sessions.reduce((sum, s) => sum + s.amountDue, 0);
      const ordered = t.sessions.some((s) => s.orderCount > 0);
      const notes = t.sessions.map((s) => s.note).filter(Boolean);
      const unsent = cartCount(t.tableId === state.tableId ? state.cart : loadCart(cartScope(t.tableId)));
      const selected = t.tableId === state.tableId;
      return el(
        'button',
        {
          class: `table-chip ${t.sessions.length ? (pay ? 'pay' : 'busy') : ''} ${selected ? 'active' : ''}`,
          type: 'button',
          'aria-pressed': String(selected),
          dataset: { table: t.code },
          onclick: () => selectTable(t.tableId),
        },
        el('span', { class: 'name' }, t.name),
        el(
          'span',
          { class: 'state' },
          t.sessions.length === 0
            ? 'Trống'
            : `${t.sessions.length > 1 ? `${t.sessions.length} nhóm · ` : ''}${ordered ? money(amount) : 'Chưa gọi món'}${pay ? ' · gọi thanh toán' : ''}`,
        ),
        notes.length ? el('span', { class: 'note', title: notes.join(' | ') }, icon('notebook-pen', { label: 'Ghi chú' }), notes.join(' | ')) : null,
        unsent ? el('span', { class: 'in-cart', title: 'Món đã chọn nhưng chưa gửi' }, unsent) : null,
      );
    }),
  );
}

function selectTable(tableId) {
  if (state.tableId === tableId) return;
  state.tableId = tableId;
  state.sessionId = table()?.sessions[0]?.sessionId ?? null;
  state.newGroup = false;
  noteDirty = false;
  resetMember();
  loadTableCart();
  afterSelect();
}

function selectGroup(sessionId) {
  state.sessionId = sessionId;
  state.newGroup = sessionId === null;
  noteDirty = false;
  resetMember();
  afterSelect();
}

function afterSelect() {
  const q = new URLSearchParams();
  if (state.tableId) q.set('table', state.tableId);
  if (state.sessionId) q.set('session', state.sessionId);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  clear($('#send-error'));
  renderTables();
  renderTarget();
  renderTiles();
  renderCart();
  loadDetail();
}

// ---------- Bàn đang chọn: nhóm + ghi chú bàn ----------
function renderTarget() {
  const t = table();
  const box = $('#target');
  if (!t) {
    clear(box, el('p', { class: 'muted' }, 'Chọn một bàn ở bên trái.'));
    clear($('#note-box'));
    clear($('#member-box'));
    updateSend();
    return;
  }
  const s = session();
  clear(
    box,
    el(
      'div',
      { class: 'row between' },
      el('h2', { style: { margin: 0, fontSize: '1.2rem' } }, t.name),
      s
        ? s.status === 'PAYMENT_REQUESTED'
          ? el('span', { class: 'badge pending' }, 'Gọi thanh toán')
          : el('span', { class: 'badge preparing' }, 'Đang phục vụ')
        : el('span', { class: 'badge' }, state.newGroup ? 'Nhóm mới' : 'Bàn trống'),
    ),
    t.sessions.length
      ? el(
          'div',
          { class: 'group-chips', role: 'group', 'aria-label': 'Nhóm trên bàn' },
          t.sessions.map((x, i) =>
            el(
              'button',
              { class: `chip ${x.sessionId === state.sessionId ? 'active' : ''}`, type: 'button', onclick: () => selectGroup(x.sessionId) },
              `Nhóm ${i + 1} · ${x.itemCount} món`,
            ),
          ),
          el('button', { class: `chip ${state.newGroup ? 'active' : ''}`, type: 'button', onclick: () => selectGroup(null) }, '+ Nhóm mới'),
        )
      : null,
    s
      ? el(
          'p',
          { class: 'muted small' },
          `Mở ${time(s.openedAt)}${s.openedBy ? ` bởi ${s.openedBy.fullName}` : ' (khách quét QR)'} · ${s.orderCount} đơn · ${money(s.amountDue)}`,
          s.member ? [' · ', icon('star', { label: 'Hội viên' }), s.member.fullName] : '',
        )
      : el('p', { class: 'muted small' }, state.newGroup ? 'Gửi đơn sẽ mở thêm một nhóm (hóa đơn riêng) trên bàn này.' : 'Bàn trống — gửi đơn sẽ mở bàn.'),
  );
  renderNote();
  renderMember();
  updateSend();
}

const noteInput = el('textarea', {
  class: 'input',
  id: 'table-note',
  maxlength: 200,
  rows: 2,
  placeholder: 'Chỉ nhân viên thấy. Ví dụ: chờ thêm 2 người, khách quen ít ngọt, sinh nhật…',
});
const noteMeta = el('span', { class: 'muted small' });
const noteBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'save-note' }, 'Lưu ghi chú');
let noteDirty = false;
noteInput.addEventListener('input', () => {
  noteDirty = true;
  renderNote();
});
noteBtn.addEventListener('click', saveNote);

function renderNote() {
  const box = $('#note-box');
  const t = table();
  if (!t) return clear(box);
  const s = session();
  if (!noteDirty) noteInput.value = s?.note ?? '';
  const hasText = noteInput.value.trim().length > 0;
  noteBtn.textContent = s ? 'Lưu ghi chú' : hasText ? 'Mở bàn & lưu ghi chú' : 'Mở bàn (chưa gọi món)';
  noteBtn.disabled = s ? !noteDirty : false;
  noteMeta.textContent = s?.note && s.noteUpdatedAt ? `Sửa ${time(s.noteUpdatedAt)}${s.noteUpdatedBy ? ` · ${s.noteUpdatedBy}` : ''}` : '';
  if (!box.contains(noteInput)) {
    clear(
      box,
      el('label', { for: 'table-note' }, icon('notebook-pen'), 'Ghi chú bàn'),
      noteInput,
      el('div', { class: 'row between', style: { margin: '0.3rem 0 0.6rem' } }, noteMeta, noteBtn),
    );
  }
}

/** Bàn trống / nhóm mới → mở phiên. Bàn vừa được mở ở nơi khác → chọn nhóm đó và để nhân viên bấm lại. */
async function openSession(note) {
  const t = table();
  try {
    const { session: s } = await staffApi(`/api/tables/${t.tableId}/sessions`, { method: 'POST', body: { note, newGroup: state.newGroup } });
    state.sessionId = s.sessionId;
    state.newGroup = false;
    return s.sessionId;
  } catch (err) {
    if (err.code !== 'TABLE_OCCUPIED') throw err;
    await loadTables({ quiet: true });
    state.sessionId = err.details?.sessions?.[0]?.sessionId ?? state.sessionId;
    afterSelect();
    toast(`${t.name} vừa được mở (khách quét QR / máy quầy khác). Kiểm tra nhóm rồi bấm lại.`, 'warning', 6000);
    return null;
  }
}

async function saveNote() {
  const t = table();
  if (!t) return;
  const note = noteInput.value.trim() || null;
  setBusy(noteBtn, true);
  try {
    if (state.sessionId) {
      await staffApi(`/api/sessions/${state.sessionId}/note`, { method: 'PUT', body: { note } });
      toast(note ? `Đã lưu ghi chú ${t.name}` : `Đã xóa ghi chú ${t.name}`, 'success');
    } else {
      if (!(await openSession(note))) return;
      toast(`Đã mở ${t.name}`, 'success');
    }
    noteDirty = false;
    await loadTables({ quiet: true });
    afterSelect();
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
    if (err.code === 'SESSION_CLOSED') await loadTables();
  } finally {
    setBusy(noteBtn, false);
    renderNote();
  }
}

// ---------- F-047 Hội viên của bàn (ADR-008 D-36): tra cứu / đăng ký nhanh → gắn vào phiên ----------
// Ô nhập tạo một lần, vẽ lại không thay phần tử (không mất chữ đang gõ khi có cập nhật realtime)
const memberPhone = el('input', {
  class: 'input',
  id: 'member-phone',
  type: 'tel',
  inputmode: 'tel',
  maxlength: 15,
  placeholder: 'SĐT hội viên',
  'aria-label': 'SĐT hội viên',
});
const memberLookupBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'member-lookup' }, 'Tra cứu');
const memberCurrent = el('div', { class: 'member-current' });
const memberMsg = el('div', { id: 'member-msg' });
memberLookupBtn.addEventListener('click', lookupMember);
memberPhone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') lookupMember();
});

function resetMember() {
  memberPhone.value = '';
  clear(memberMsg);
}

const memberPerk = (m) =>
  m.firstOrderDiscount && m.firstOrderPercent > m.discountPercent ? `đơn đầu −${m.firstOrderPercent}%` : `${m.tierName ?? 'hội viên'} −${m.discountPercent}%`;

function renderMember() {
  const box = $('#member-box');
  if (!table()) return clear(box);
  const s = session();
  if (!box.contains(memberPhone)) {
    clear(
      box,
      el('label', { for: 'member-phone' }, icon('star'), 'Hội viên'),
      memberCurrent,
      el('div', { class: 'row member-row' }, memberPhone, memberLookupBtn),
      memberMsg,
    );
  }
  clear(
    memberCurrent,
    s?.member
      ? el(
          'div',
          { class: 'member-on row between' },
          el('span', {}, icon('star', { label: 'Hội viên' }), `${s.member.fullName} · ${memberPerk(s.member)}`),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: detachMember }, 'Gỡ'),
        )
      : el('p', { class: 'muted small' }, 'Nhập SĐT để khách tích điểm / dùng ưu đãi (tính lúc thu tiền). Khách quét QR bàn cũng thấy điểm, voucher.'),
  );
  memberPhone.placeholder = s?.member ? 'Đổi sang SĐT khác' : 'SĐT hội viên';
}

async function lookupMember() {
  if (!table() || !memberPhone.value.trim()) return;
  clear(memberMsg);
  setBusy(memberLookupBtn, true);
  try {
    const r = await staffApi('/api/members/lookup', { method: 'POST', body: { phone: memberPhone.value } });
    const verb = state.sessionId ? 'Gắn vào bàn' : 'Mở bàn & gắn';
    if (r.found) {
      clear(
        memberMsg,
        el(
          'div',
          { class: 'alert info row between' },
          el('span', {}, `${r.member.fullName} · ${r.member.phone} · ${memberPerk(r.member)}`),
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: (e) => attachMember(r.member, e.currentTarget) }, verb),
        ),
      );
      return;
    }
    const name = el('input', { class: 'input', maxlength: 100, placeholder: 'Họ tên khách', 'aria-label': 'Họ tên khách' });
    const referrer = el('input', {
      class: 'input',
      type: 'tel',
      inputmode: 'tel',
      maxlength: 15,
      placeholder: 'SĐT người giới thiệu (không bắt buộc)',
      'aria-label': 'SĐT người giới thiệu',
    });
    const consent = el('input', { type: 'checkbox', 'aria-label': 'Khách đồng ý' });
    const register = async (e) => {
      const btn = e.currentTarget;
      if (!consent.checked) return toast('Cần khách đồng ý trước khi đăng ký', 'warning');
      setBusy(btn, true);
      try {
        const m = await staffApi('/api/members', {
          method: 'POST',
          body: { phone: memberPhone.value, fullName: name.value, consent: true, referrerPhone: referrer.value.trim() || null },
        });
        await attachMember({ ...m, fullName: name.value.trim() }, null, m.referred);
      } catch (err) {
        toast(errorMessage(err), 'error', 5000);
      } finally {
        setBusy(btn, false);
      }
    };
    clear(
      memberMsg,
      el(
        'div',
        { class: 'alert info stack' },
        el('div', {}, 'Số này chưa là hội viên. Đăng ký nhanh:'),
        name,
        referrer,
        el('label', { class: 'check' }, consent, 'Khách đồng ý cho quán lưu SĐT + tên để tích lũy ưu đãi'),
        el('a', { class: 'policy-link small', href: '/chinh-sach-du-lieu', target: '_blank', rel: 'noopener' }, 'Chính sách dữ liệu (mở cho khách xem)'), // F-062
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: register }, `Đăng ký & ${verb.toLowerCase()}`),
      ),
    );
  } catch (err) {
    clear(memberMsg, el('div', { class: 'field-error' }, errorMessage(err)));
  } finally {
    setBusy(memberLookupBtn, false);
  }
}

/** Bàn trống / nhóm mới → mở bàn (kèm ghi chú đang gõ) rồi gắn. */
async function attachMember(m, button, referred = false) {
  const t = table();
  setBusy(button, true);
  try {
    let sid = state.sessionId;
    if (!sid) {
      sid = await openSession(noteDirty ? noteInput.value.trim() || null : null);
      if (!sid) return;
      noteDirty = false;
    }
    await staffApi(`/api/sessions/${sid}/member`, { method: 'POST', body: { memberId: m.memberId } });
    toast(referred ? `Đã đăng ký ${m.fullName} (có người giới thiệu) và gắn vào ${t.name}` : `Đã gắn hội viên ${m.fullName} vào ${t.name}`, 'success', 5000);
    resetMember();
    await loadTables({ quiet: true });
    afterSelect();
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
    if (err.code === 'SESSION_CLOSED') await loadTables();
  } finally {
    setBusy(button, false);
  }
}

async function detachMember() {
  const t = table();
  if (!state.sessionId) return;
  try {
    await staffApi(`/api/sessions/${state.sessionId}/member`, { method: 'DELETE' });
    toast(`Đã gỡ hội viên khỏi ${t.name}`, 'success');
    await loadTables({ quiet: true });
    afterSelect();
  } catch (err) {
    toast(errorMessage(err), 'error', 5000);
  }
}

// ---------- Giỏ + báo giá ----------
function renderCart() {
  const lines = $('#lines');
  if (!table()) clear(lines);
  else if (state.cart.length === 0) clear(lines, el('p', { class: 'muted small' }, 'Chạm vào món bên trái để thêm.'));
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
            placeholder: 'Ghi chú món (ít đá, không đường…)',
            maxlength: 200,
            value: l.note || '',
            oninput: (e) => {
              l.note = e.target.value;
              saveCart(cartScope(state.tableId), state.cart);
            },
          }),
        ),
      ),
    );
  requestQuote();
}

let quoteTimer = null;
let quoteSeq = 0;
function requestQuote() {
  clearTimeout(quoteTimer);
  quoteSeq++;
  state.quote = null;
  renderTotals();
  if (state.cart.length) quoteTimer = setTimeout(fetchQuote, 200);
}

async function fetchQuote() {
  const seq = ++quoteSeq;
  try {
    const q = await staffApi('/api/orders/quote', { method: 'POST', body: { items: toOrderItems(state.cart) } });
    if (seq !== quoteSeq) return;
    state.quote = q;
  } catch {
    if (seq !== quoteSeq) return;
    state.quote = null; // lỗi thật sẽ hiện khi bấm Gửi
  }
  renderTotals();
}

function renderTotals() {
  const q = state.quote;
  $('#total').textContent = money(q?.total ?? cartTotal(state.cart));
  clear(
    $('#promo'),
    q && q.promoDiscount > 0
      ? breakdownRows(
          [
            { key: 'subtotal', label: 'Tạm tính', amount: q.subtotal },
            { key: 'promo', label: q.orderPromotion ? `Khuyến mãi (${q.orderPromotion.name})` : 'Khuyến mãi', amount: -q.promoDiscount },
          ],
          'due-row',
        )
      : null,
  );
  updateSend();
}

function updateSend() {
  const t = table();
  const btn = $('#send');
  if (btn.classList.contains('loading')) return;
  // F-055 (ADR-017 D-65): đơn nhân viên nhập vào thẳng "Đang pha" → cần ca đang mở như mọi thao tác xử lý đơn
  btn.disabled = !t || state.cart.length === 0 || !shell.shift;
  btn.textContent = !shell.shift ? 'Chưa mở ca — mở ca để gọi món' : t ? `Gửi đơn ${t.name}` : 'Chọn bàn để gọi món';
}
shell.onShiftChange(() => updateSend());

// ---------- Gửi đơn ----------
let idempotencyKey = null;
$('#send').addEventListener('click', async () => {
  const t = table();
  if (!t || state.cart.length === 0) return;
  const btn = $('#send');
  setBusy(btn, true);
  clear($('#send-error'));
  try {
    let sid = state.sessionId;
    if (!sid) {
      // F-055: ca có thể đã bị đóng ở máy khác lúc mất kết nối — kiểm lại trước khi mở bàn để không để lại bàn trống
      await shell.reloadShift();
      if (!shell.shift) return;
      sid = await openSession(noteDirty ? noteInput.value.trim() || null : null);
      if (!sid) return;
      noteDirty = false;
    }
    idempotencyKey ||= crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const { order } = await staffApi(`/api/sessions/${sid}/orders`, {
      method: 'POST',
      body: { items: toOrderItems(state.cart) },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    idempotencyKey = null;
    toast(`Đã gửi đơn #${order.orderCode} · ${t.name} · ${money(order.totalAmount)} → Đang pha`, 'success', 5000);
    state.cart = [];
    clearCart(cartScope(t.tableId));
    persist();
    await loadTables({ quiet: true });
    afterSelect();
  } catch (err) {
    idempotencyKey = null;
    if (err.code === 'OUT_OF_STOCK' || err.code === 'ITEM_UNAVAILABLE') {
      for (const it of err.details?.items ?? []) {
        const item = state.itemsById.get(it.menuItemId);
        if (item) item.isAvailable = false;
      }
      renderTiles();
    }
    if (err.code === 'SESSION_CLOSED') await loadTables();
    if (err.code === 'NO_OPEN_SHIFT') shell.reloadShift();
    clear($('#send-error'), el('div', { class: 'alert danger', style: { marginBottom: '0.5rem' } }, errorMessage(err)));
  } finally {
    setBusy(btn, false);
    updateSend();
  }
});

$('#clear').addEventListener('click', () => {
  if (!state.tableId) return;
  state.cart = [];
  clearCart(cartScope(state.tableId));
  persist();
});

// ---------- Đơn đã gọi của nhóm đang chọn ----------
let detailSeq = 0;
async function loadDetail() {
  const sid = state.sessionId;
  const my = ++detailSeq;
  if (!sid) {
    state.detail = null;
    return renderOrdered();
  }
  try {
    const d = await staffApi(`/api/sessions/${sid}`);
    if (my === detailSeq) state.detail = d;
  } catch {
    if (my === detailSeq) state.detail = null;
  }
  if (my === detailSeq) renderOrdered();
}

function renderOrdered() {
  const box = $('#ordered');
  const d = state.detail;
  if (!d || d.sessionId !== state.sessionId || d.status === 'CLOSED') return clear(box);
  const active = d.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
  clear(
    box,
    el('h3', { style: { fontSize: '1rem', margin: '1rem 0 0.4rem' } }, `Đã gọi (${active.length} đơn)`),
    active.length === 0
      ? el('p', { class: 'muted small' }, 'Chưa có đơn nào.')
      : active.map((o) =>
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
                ),
              ),
            ),
            el('div', { class: 'muted small' }, o.createdBy ? `Nhân viên nhập: ${o.createdBy.fullName}` : 'Khách gọi qua QR'),
          ),
        ),
    active.length ? el('a', { class: 'btn btn-sm btn-block', href: `/pos?settle=${d.sessionId}` }, 'Thu tiền bàn này') : null,
  );
}

// ---------- Khởi động + realtime ----------
await Promise.all([loadMenu(), loadTables({ quiet: true })]);
afterSelect();

let refreshTimer = null;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await loadTables();
    loadDetail();
  }, 200);
}

const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) {
      loadMenu();
      refreshSoon();
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
for (const evt of [
  'session.opened',
  'session.note_changed',
  'session.settled',
  'session.closed',
  'session.payment_requested',
  'session.payment_cancelled',
  'session.member_changed',
  'session.table_changed', // F-049
]) {
  socket?.on(evt, refreshSoon);
}
for (const evt of ['order.created', 'order.status_changed', 'order.cancelled']) {
  socket?.on(evt, (p) => p.order?.type !== 'TAKE_AWAY' && refreshSoon());
}
