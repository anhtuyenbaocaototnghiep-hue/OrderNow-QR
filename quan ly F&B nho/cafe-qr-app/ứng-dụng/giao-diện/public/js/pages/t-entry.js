// S-01 — Vào bàn: quét QR → phiên mới / vào lại phiên cũ (FEATURE-001, BR-008). F-097 (ADR-059): bàn đang có nhóm → tự vào nhóm của
// bàn (không còn chọn "Gộp chung / Tạo đơn cá nhân"); hiếm khi bàn có ≥ 2 nhóm → hỏi đi cùng nhóm nào. Trả riêng = "Chia bill theo người".
// ADR-065 D-255 + TASK-128: vừa tự vào nhóm → thẻ nổi bật "Bàn … đang có khách — Bạn đi chung hay đi riêng?" (hai nút lớn) tới khi chọn / gửi món.
// F-092 (ADR-054): có nhóm rồi → màn chào của quán (tên, địa chỉ, lời chào, bàn, hội viên, Gọi thanh toán / Gọi nhân viên / Đánh giá,
// nút lớn "Xem thực đơn – Gọi món"); quán tắt màn chào ở Cài đặt → vào thẳng thực đơn như trước.
import { api } from '../api.js';
import { $, clear, el, errorMessage, modal, money, setBusy, time, toast } from '../ui.js';
import { mountMemberBox } from '../member-box.js';
import { callStaffSheet } from '../call-staff.js';
import { clearSessionId, qrToken, setFlash, setSessionId, takeFlash } from '../customer.js';
import { icon } from '../icons.js';
import { markJoined, SEPARATED_MESSAGE, togetherCard } from '../join-notice.js';

const qr = qrToken();
const app = $('#app');

// Lời nhắn từ trang trước (vd "bàn trống đã đóng, giỏ vẫn còn" — F-086): báo ở màn chào / màn chọn; vào thẳng thực đơn thì chuyển tiếp
let pendingFlash = takeFlash();
function showFlash() {
  if (pendingFlash) toast(pendingFlash.message, pendingFlash.type, 6000);
  pendingFlash = null;
}

/** Đã có nhóm: quán bật màn chào → màn chào; tắt (hoặc không tải được) → vào thẳng thực đơn như trước. */
async function enter(sessionId) {
  setSessionId(qr, sessionId);
  const [menu, session] = await Promise.all([api('/api/menu').catch(() => null), api(`/api/sessions/${sessionId}`).catch(() => null)]);
  if (!menu?.ui?.welcome || !session || session.status === 'CLOSED') {
    if (pendingFlash) setFlash(pendingFlash.message, pendingFlash.type);
    return location.replace(`/t/${qr}/menu`);
  }
  showFlash();
  const later = takeFlash(); // lời nhắn đặt ngay trên trang này (vd vừa chuyển bàn)
  if (later) toast(later.message, later.type, 6000);
  showHome(menu, session);
}

function loading(text = 'Đang mở thực đơn…') {
  clear(app, el('div', { class: 'c-loading' }, el('div', { class: 'spinner' }), text));
}

async function start() {
  loading();
  try {
    const res = await api('/api/sessions/scan', { method: 'POST', body: { qrToken: qr } });
    if (res.state === 'NEW' || res.state === 'MEMBER') return enter(res.session.sessionId);
    if (res.state === 'ELSEWHERE') {
      showFlash();
      return showElsewhere(res); // F-086
    }
    return joinTable(res); // F-097
  } catch (err) {
    if (err.status === 404 || err.code === 'VALIDATION_ERROR' || err.code === 'TABLE_NOT_FOUND') return showInvalid();
    showError(err);
  }
}

/**
 * F-097 (ADR-059 D-238): bàn đang có nhóm → tự vào nhóm của bàn — món cả nhóm gọi chung một hóa đơn, ai muốn trả riêng thì dùng
 * "Chia bill theo người". Bàn có ≥ 2 nhóm (hiếm — quầy mở thêm) → hỏi đi cùng nhóm nào. Nhóm vừa đóng giữa chừng → mở nhóm mới (BR-008).
 */
function joinTable(res) {
  const groups = res.openSessions ?? [];
  if (!groups.length) return createOwn(null, true);
  if (groups.length === 1) return join(groups[0].sessionId, null, res.table, { ask: true });
  showFlash();
  return showGroups(res);
}

function showGroups({ table, openSessions }) {
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo' }, icon('coffee')),
      el('h1', {}, table.name),
      el('p', { class: 'muted' }, `Bàn đang có ${openSessions.length} nhóm. Bạn đi cùng nhóm nào?`),
    ),
    openSessions.map((s) =>
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (e) => join(s.sessionId, e.currentTarget, table) },
        el('strong', {}, 'Vào nhóm này'),
        el('span', { class: 'muted small' }, `${s.label} · ${s.itemCount} món · mở lúc ${time(s.openedAt)}`),
        el('span', { class: 'small' }, 'Gọi chung một hóa đơn — ai muốn trả riêng thì dùng "Chia bill theo người"'),
      ),
    ),
    // ADR-065 D-255 + TASK-128: khách lạ ngồi ghép bàn → nhóm riêng, hóa đơn riêng (cùng chữ với thẻ "đi chung hay đi riêng")
    el('button', { class: 'btn btn-block c-alone', type: 'button', onclick: (e) => createOwn(e.currentTarget) }, icon('user'), 'Đi riêng — hóa đơn riêng'),
  );
}

/**
 * F-086 (ADR-047): điện thoại đang có nhóm mở ở bàn khác — hỏi khách đã đổi bàn chưa thay vì lặng lẽ mở nhóm mới (món mang ra nhầm bàn,
 * khách tưởng mất đơn rồi gọi lại). Nhóm chưa gửi món, chỉ một mình → chuyển ngay, giỏ đi theo; còn lại → nhờ quầy chuyển.
 */
function showElsewhere(res) {
  const { table, elsewhere: e, otherGroups = [] } = res;
  const sent = e.orderCount > 0;
  const status = sent ? `đã gửi ${e.itemCount} món` : 'chưa gửi món nào';
  const choices = [];
  if (e.canMoveNow) {
    choices.push(
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (ev) => moveHere(res, ev.currentTarget) },
        el('strong', {}, `Chuyển sang ${table.name}`),
        el('span', { class: 'small' }, `Món bạn đang chọn đi theo. ${e.table.name} được trả lại cho quán.`),
      ),
    );
  } else {
    choices.push(
      el(
        'button',
        { class: 'c-choice', type: 'button', onclick: (ev) => requestMove(res, ev.currentTarget) },
        el('strong', {}, `Nhờ quầy chuyển nhóm sang ${table.name}`),
        el(
          'span',
          { class: 'small' },
          sent ? 'Món đã gửi và hóa đơn chuyển theo — nhân viên xác nhận trong giây lát.' : 'Cả nhóm chuyển theo — nhân viên xác nhận trong giây lát.',
        ),
      ),
      el(
        'button',
        { class: 'c-choice alt', type: 'button', onclick: (ev) => orderHere(res, ev.currentTarget) },
        el('strong', {}, `Gọi món ở ${table.name}`),
        el('span', { class: 'small muted' }, `Nhóm ở ${e.table.name} vẫn giữ nguyên, hóa đơn riêng.`),
      ),
    );
  }
  // Điện thoại còn nhóm khác (đã "gọi riêng" ở bàn khác trước đó) → mỗi nhóm một lựa chọn chuyển
  for (const g of otherGroups) {
    const label = g.orderCount > 0 ? `đã gửi ${g.itemCount} món` : 'chưa gửi món';
    choices.push(
      el(
        'button',
        { class: 'c-choice alt', type: 'button', onclick: (ev) => (g.canMoveNow ? moveHere : requestMove)({ ...res, elsewhere: g }, ev.currentTarget) },
        el('strong', {}, g.canMoveNow ? `Chuyển nhóm ${g.table.name} sang ${table.name}` : `Nhờ quầy chuyển nhóm ${g.table.name} sang ${table.name}`),
        el('span', { class: 'small muted' }, `Nhóm thứ hai của bạn ở ${g.table.name} (${label}).`),
      ),
    );
  }
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo' }, icon('coffee')),
      el('h1', {}, table.name),
      el('p', { class: 'muted' }, `Bạn đang gọi món ở ${e.table.name} (${status}). Bạn đã chuyển sang ${table.name}?`),
    ),
    e.moveRequest ? el('div', { class: 'alert info' }, `Bạn đã nhờ quầy chuyển sang ${e.moveRequest.toTable} — đang chờ nhân viên xác nhận.`) : null,
    choices,
    el('a', { class: 'btn btn-block c-back', href: `/t/${e.table.qrToken}` }, `Quay lại ${e.table.name}`),
  );
}

async function moveHere(res, button) {
  const { table, elsewhere: e } = res;
  setBusy(button, true);
  try {
    await api(`/api/sessions/${e.sessionId}/move-here`, { method: 'POST', body: { qrToken: qr } });
    clearSessionId(e.table.qrToken);
    setFlash(`Đã chuyển sang ${table.name} — món bạn đang chọn vẫn còn trong giỏ.`, 'success');
    enter(e.sessionId);
  } catch (err) {
    setBusy(button, false);
    toast(errorMessage(err), 'warning', 6000);
    start(); // nhóm vừa có món / có người vào → hỏi lại với lựa chọn "Nhờ quầy chuyển"
  }
}

async function requestMove(res, button) {
  const { elsewhere: e } = res;
  setBusy(button, true);
  try {
    await api(`/api/sessions/${e.sessionId}/move-request`, { method: 'POST', body: { qrToken: qr } });
    // Về trang của nhóm ở bàn cũ: trang theo nhóm — quầy chuyển xong thì tự mở lại ở bàn mới
    setSessionId(e.table.qrToken, e.sessionId);
    // Không cần thông báo nổi: trang theo dõi đơn hiện dòng "Đã nhờ quầy chuyển…" cho tới khi xong
    location.replace(`/t/${e.table.qrToken}/${e.orderCount > 0 ? 'track' : 'menu'}`);
  } catch (err) {
    setBusy(button, false);
    toast(errorMessage(err), 'error');
    if (err.code === 'SESSION_CLOSED') start();
  }
}

/** F-086 + F-097: gọi món ở bàn mới, nhóm ở bàn cũ giữ nguyên — bàn mới có nhóm thì vào nhóm đó (như quét bình thường), trống thì mở nhóm mới. */
function orderHere(res, button) {
  if (res.openSessions?.length) return joinTable(res);
  return createOwn(button);
}

async function join(sessionId, button, table, { ask = false } = {}) {
  setBusy(button, true);
  try {
    const res = await api(`/api/sessions/${sessionId}/join`, { method: 'POST', body: { qrToken: qr } });
    // F-097 + ADR-065 + TASK-128: tự vào nhóm (không tự chọn) → hỏi "đi chung hay đi riêng" bằng thẻ nổi bật ở màn chào / đầu thực đơn;
    // khách đã tự chọn nhóm ở màn chọn nhóm thì không hỏi lại
    if (ask) markJoined(qr, res.session.sessionId, table?.name ?? res.table?.name ?? 'Bàn');
    enter(res.session.sessionId);
  } catch (err) {
    setBusy(button, false);
    if (err.code === 'SESSION_CLOSED') {
      // AC-001-04: nhóm vừa thanh toán → tự chuyển sang tạo phiên mới và báo khách
      setFlash(err.message, 'warning');
      return createOwn(null, true);
    }
    if (err.status === 404) {
      toast('Nhóm này không còn trên bàn, vui lòng chọn lại', 'warning');
      return start();
    }
    toast(errorMessage(err), 'error');
  }
}

async function createOwn(button, silent = false) {
  setBusy(button, true);
  if (silent) loading('Đang tạo phiên mới cho bạn…');
  try {
    const res = await api('/api/sessions', { method: 'POST', body: { qrToken: qr } });
    enter(res.session.sessionId);
  } catch (err) {
    setBusy(button, false);
    if (err.status === 404) return showInvalid();
    showError(err);
  }
}

function showInvalid() {
  showFlash();
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo warn' }, icon('triangle-alert')),
      el('h1', {}, 'Mã bàn không hợp lệ'),
      el('p', { class: 'muted' }, 'Mã QR này không còn hiệu lực. Vui lòng quét lại mã dán trên bàn hoặc gọi nhân viên.'),
    ),
  );
}

function showError(err) {
  clear(
    app,
    el(
      'div',
      { class: 'c-hero' },
      el('div', { class: 'logo warn' }, icon('wifi-off')),
      el('h1', {}, 'Chưa mở được thực đơn'),
      el('p', { class: 'muted' }, errorMessage(err)),
    ),
    el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: start }, 'Thử lại'),
  );
}

// ---------- F-092 (ADR-054): màn chào khi quét QR ----------
const TZ = 'Asia/Ho_Chi_Minh';
/** Lời chào theo giờ quán (giờ Việt Nam): sáng 5–10, trưa 11–13, chiều 14–17, tối còn lại. */
function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(now));
  if (h >= 5 && h < 11) return { text: 'Chào buổi sáng', day: true };
  if (h >= 11 && h < 14) return { text: 'Chào buổi trưa', day: true };
  if (h >= 14 && h < 18) return { text: 'Chào buổi chiều', day: true };
  return { text: 'Chào buổi tối', day: false };
}
const activeOrders = (s) => s.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
// F-094 (ADR-056 D-232): hình ở khung giới thiệu theo mùa — mùa do js/guest-theme.js đặt ở <html data-season> (tắt → ly cà phê như cũ)
const SEASON_ART = { spring: 'mai', summer: 'cup-soda', autumn: 'leaf', winter: 'coffee' };
const SEASON_DECOR = { spring: 'mai', summer: 'droplet', autumn: 'leaf', winter: 'snowflake' }; // hình nhỏ không gắn với ngày / đêm

function showHome(menu, first) {
  let session = first;
  const sessionId = session.sessionId;
  document.title = `${menu.shop.name} · ${session.table.name}`;
  const serveAtTable = session.serveMode !== 'COUNTER';
  const store = menu.store ?? {};
  const closedText =
    store.acceptingOrders === false ? store.closedMessage : store.shiftOpen === false ? 'Quán chưa mở ca nên chưa nhận đơn — bạn vẫn xem thực đơn được.' : null;
  const promo = menu.promotions?.[0];

  const greet = el('p', { class: 'h-greet' });
  const paintGreet = () => {
    const g = greeting();
    clear(
      greet,
      el('span', { class: 'h-greet-ic', 'aria-hidden': 'true' }, icon(g.day ? 'sun' : 'moon')),
      `${g.text}, `,
      el('strong', {}, session.member?.maskedName || 'Quý khách'),
    );
  };
  const art = el('div', { class: 'h-hero-art', 'aria-hidden': 'true' });
  const decor = el('div', { class: 'h-hero-decor', 'aria-hidden': 'true' });
  const paintSeason = () => {
    const season = document.documentElement.dataset.season;
    art.dataset.art = SEASON_ART[season] ?? 'coffee';
    clear(art, icon(art.dataset.art));
    clear(decor, ...(season ? [1, 2, 3].map(() => icon(SEASON_DECOR[season])) : []));
  };
  // Qua mốc giờ khi đang mở (17:59 → 18:00) hoặc quán đổi cài đặt → lời chào và hình theo mùa vẽ lại (guest-theme.js báo)
  window.addEventListener('guest-theme', () => {
    paintGreet();
    paintSeason();
  });
  const memberSlot = el('div', { class: 'h-member' });
  const tiles = el('div', { class: 'h-tiles' });
  const ordersSlot = el('div');

  const tile = (id, iconName, label, sub, onclick) =>
    el(
      'button',
      { class: `h-tile h-tile-${iconName}`, type: 'button', id, onclick },
      el('span', { class: 'h-tile-ic', 'aria-hidden': 'true' }, icon(iconName)),
      el('strong', {}, label),
      el('span', { class: 'h-tile-sub' }, sub),
    );
  const paintTiles = () => {
    const active = activeOrders(session);
    const due = session.bill?.amountDue ?? session.amountDue ?? 0;
    const paySub = session.status === 'PAYMENT_REQUESTED' ? 'Đã gọi — nhân viên đang tới' : active.length ? `Tạm tính ${money(due)}` : 'Chưa có món';
    clear(
      tiles,
      tile('home-pay', 'wallet', 'Gọi thanh toán', paySub, () => {
        if (!activeOrders(session).length) return toast('Bạn chưa gọi món nào — mời bạn xem thực đơn và gọi món trước nhé.', 'info');
        location.href = `/t/${qr}/track${session.status === 'OPEN' ? '?act=pay' : ''}`;
      }),
      tile('home-staff', 'hand', 'Gọi nhân viên', 'Nước, đá, khăn giấy…', async () => {
        const r = await callStaffSheet(sessionId);
        if (r.sent) await refresh();
      }),
      tile('home-review', 'star', 'Đánh giá', 'Sau khi dùng món', () =>
        modal({
          title: 'Đánh giá món',
          sheet: true,
          body: el(
            'div',
            { class: 'stack' },
            el('p', {}, 'Sau khi thanh toán, màn cảm ơn mời bạn chấm sao từng món đã gọi và góp ý cho quán — chỉ mất vài giây.'),
            el('p', { class: 'small muted' }, 'Món chưa ngon? Bấm "Gọi nhân viên" để quán xử lý ngay trong lúc bạn còn ngồi.'),
          ),
          actions: [{ label: 'Đã hiểu', class: 'btn-primary' }],
        }),
      ),
    );
    clear(
      ordersSlot,
      active.length
        ? el(
            'a',
            { class: 'h-orders', href: `/t/${qr}/track` },
            icon('receipt'),
            el('span', { class: 'grow' }, el('strong', {}, 'Đơn của bạn'), ` · ${active.length} đơn đã gửi`),
            icon('chevron-right'),
          )
        : null,
      // F-097 (ADR-059 D-239): trả riêng thay cho "Tạo đơn cá nhân" — mở thẳng hộp Chia bill theo người
      active.length && session.status === 'OPEN'
        ? el('a', { class: 'h-split', href: `/t/${qr}/track?act=split` }, 'Trả riêng từng người? ', el('strong', {}, 'Chia bill theo người'))
        : null,
    );
  };
  async function refresh() {
    try {
      session = await api(`/api/sessions/${sessionId}`);
    } catch {
      return;
    }
    paintGreet();
    paintTiles();
    memberBox.render();
  }
  const memberBox = mountMemberBox(memberSlot, { sessionId, getSession: () => session, onChange: refresh });

  clear(
    app,
    el(
      'div',
      { class: 'c-home' },
      el(
        'header',
        { class: menu.shop.logoUrl ? 'h-top has-logo' : 'h-top' },
        menu.shop.logoUrl ? el('img', { class: 'h-logo', src: menu.shop.logoUrl, alt: '' }) : null, // F-095: tên quán ngay bên → ảnh trang trí
        el('h1', { class: 'h-shop' }, menu.shop.name),
        menu.shop.address ? el('p', { class: 'h-addr' }, el('span', { 'aria-hidden': 'true' }, icon('map-pin')), menu.shop.address) : null,
        // ADR-070 D-262: số điện thoại quán — bấm là gọi (đặt bàn, quên đồ…)
        menu.shop.phone
          ? el(
              'p',
              { class: 'h-addr' },
              el('span', { 'aria-hidden': 'true' }, icon('phone')),
              el('a', { class: 'h-phone', href: `tel:${menu.shop.phone.replace(/[^\d+]/g, '')}` }, menu.shop.phone),
            )
          : null,
      ),
      // ADR-065 D-255 + TASK-128: vừa tự vào nhóm của bàn → "Bạn đi chung hay đi riêng?"
      togetherCard(qr, sessionId, {
        onSeparate: (id) => {
          toast(SEPARATED_MESSAGE, 'success', 6000);
          enter(id);
        },
      }),
      el(
        'section',
        { class: 'h-hero', 'aria-label': 'Gọi món tại bàn' },
        el(
          'div',
          { class: 'h-hero-text' },
          el('span', { class: 'h-kicker' }, 'Gọi món tại bàn'),
          el('strong', { class: 'h-hero-title' }, 'Chọn món ngay trên điện thoại'),
          el('span', { class: 'h-hero-sub' }, serveAtTable ? 'Pha xong, nhân viên mang ra tận bàn' : 'Pha xong, quán mời bạn ra quầy nhận'),
          promo ? el('span', { class: 'h-promo' }, icon('sparkles'), promo.name) : null,
        ),
        art,
        decor,
      ),
      greet,
      el(
        'p',
        { class: 'h-table' },
        serveAtTable ? 'Quán sẽ mang món ra cho bạn tại ' : 'Bạn đang ngồi ',
        el('span', { class: 'h-table-chip' }, session.table.name),
        serveAtTable ? null : ' · nhận món tại quầy',
      ),
      closedText ? el('div', { class: 'alert warning', role: 'status' }, closedText) : null,
      memberSlot,
      tiles,
      el(
        'a',
        { class: 'h-cta', href: `/t/${qr}/menu`, id: 'home-menu' },
        el('span', { class: 'h-cta-ic', 'aria-hidden': 'true' }, icon('utensils')),
        el('span', { class: 'grow' }, 'Xem thực đơn – Gọi món'),
        icon('chevron-right'),
      ),
      ordersSlot,
    ),
  );
  paintGreet();
  paintSeason();
  paintTiles();
  memberBox.render();
}

start();
