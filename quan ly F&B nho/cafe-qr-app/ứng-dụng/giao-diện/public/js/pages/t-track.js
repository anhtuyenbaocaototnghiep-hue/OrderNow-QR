// S-05 Theo dõi đơn realtime + S-04 Gọi thanh toán (FEATURE-004, FEATURE-005; BR-018; REQ-019 bản mới).
// Mỗi sự kiện realtime hoặc khi kết nối lại → tải lại ảnh chụp phiên (không tin sự kiện bị nhỡ).
// ADR-005: ô hội viên SĐT (F-014), tổng ước tính sau ưu đãi (bill.breakdown từ server), Gọi nhân viên (F-021).
// ADR-006: thời gian chờ ước tính (F-025), chia bill theo người — mỗi điện thoại chọn món của mình (F-026).
import { api } from '../api.js';
import { mountMemberBox } from '../member-box.js';
import { connectRealtime } from '../socket.js';
import { $, clear, el, elapsed, errorMessage, modal, money, setBusy, time, toast } from '../ui.js';
import { CUSTOMER_STATUS, clearSessionId, followMerged, followTable, getSessionId, goEntry, qrToken, takeFlash } from '../customer.js';
import { icon } from '../icons.js';

const qr = qrToken();
const sessionId = getSessionId(qr);
if (!sessionId) {
  goEntry(qr);
  await new Promise(() => {});
}

const RECALL_AFTER_MS = 2 * 60 * 1000; // cho "Gọi lại" sau 2 phút
const BUSY_AFTER_MS = 5 * 60 * 1000; // sau 5 phút gợi ý ra quầy
const CALL_COOLDOWN_MS = 60 * 1000; // gọi nhân viên: 60 giây/phiên (F-021)
const CALL_CHOICES = ['Xin nước lọc', 'Xin thêm đá', 'Xin khăn giấy', 'Dọn bàn'];

let session = null;
let eta = null; // F-025
let splits = null; // F-026: ảnh chụp chia bill khi phiên có chia
let splitSheet = null;
let prevStatuses = null;
let loadTimer = null;
let lastCall = null; // { at, handled }
let review = null; // F-051: { canReview, reason, submitted, items[] } khi phiên đã thanh toán
const reviewDraft = { picked: new Map(), comment: '' }; // bản nháp giữ qua các lần vẽ lại (review G3)
let closedKey = null; // màn cảm ơn đang vẽ — không vẽ lại khi không đổi (giữ ô đang gõ / đang chọn)
const memberSlot = el('div');
let memberBox = null;

$('#menu-link').href = `/t/${qr}/menu`;
$('#more').href = `/t/${qr}/menu`;
const flash = takeFlash();
if (flash) toast(flash.message, flash.type, 5000);

async function load() {
  try {
    session = await api(`/api/sessions/${sessionId}`);
  } catch (err) {
    if (err.status === 403 || err.status === 404) return goEntry(qr);
    clear(
      $('#main'),
      el('div', { class: 'empty' }, el('p', {}, errorMessage(err)), el('button', { class: 'btn btn-primary', type: 'button', onclick: load }, 'Thử lại')),
    );
    return;
  }
  if (session.status !== 'CLOSED' && followTable(qr, sessionId, session.table)) return; // F-049: nhóm đã chuyển bàn trong lúc trang đóng / mất mạng
  // F-057: bàn đã được thu chung vào bàn khác (kể cả khi lỡ sự kiện) → sang trang theo dõi của bàn đó
  if (followMerged(qr, session.mergedInto)) return;
  $('#table').textContent = session.table.name;
  const waiting = session.orders.some((o) => o.status === 'PENDING' || o.status === 'PREPARING');
  const [e, sp, rv] = await Promise.all([
    waiting && session.status !== 'CLOSED' ? api(`/api/sessions/${sessionId}/eta`).catch(() => null) : null,
    session.splitCount > 0 && session.status !== 'CLOSED' ? api(`/api/sessions/${sessionId}/splits`).catch(() => null) : null,
    session.status === 'CLOSED' ? api(`/api/sessions/${sessionId}/review`).catch(() => null) : null,
  ]);
  eta = e?.eta ?? null;
  splits = sp;
  review = rv;
  notifyCompleted();
  render();
  splitSheet?.refresh();
}

/** F-051: chấm sao từng món + góp ý sau khi thanh toán (1 lần / điện thoại / lượt, trong 24 giờ). */
function reviewBlock() {
  if (!review) return null;
  if (review.submitted) return el('p', { class: 'review-done', role: 'status' }, icon('heart', { filled: true }), 'Cảm ơn bạn đã đánh giá!');
  if (!review.canReview || review.items.length === 0) return null;
  const picked = reviewDraft.picked;
  const comment = el('textarea', {
    class: 'input',
    maxlength: 300,
    rows: 2,
    value: reviewDraft.comment,
    placeholder: 'Ví dụ: cà phê hơi ngọt, phục vụ nhanh…',
    oninput: (e) => (reviewDraft.comment = e.target.value),
  });
  const rows = review.items.map((it) => {
    const buttons = [];
    // Sao tô đặc = đã chọn, sao rỗng = chưa chọn (không chỉ khác màu — WCAG 1.4.1); bấm lại sao đang chọn để bỏ chấm món đó
    const show = (n) =>
      buttons.forEach((b, i) => {
        b.classList.toggle('on', i < n);
        b.replaceChildren(icon('star', { filled: i < n }));
        b.setAttribute('aria-checked', String(i + 1 === n));
      });
    const pick = (n) => {
      if (picked.get(it.menuItemId) === n) {
        picked.delete(it.menuItemId);
        show(0);
      } else {
        picked.set(it.menuItemId, n);
        show(n);
      }
    };
    for (let n = 1; n <= 5; n++) {
      buttons.push(
        el('button', { type: 'button', class: 'star', role: 'radio', 'aria-checked': 'false', 'aria-label': `${n} sao`, onclick: () => pick(n) }, icon('star')),
      );
    }
    show(picked.get(it.menuItemId) ?? 0);
    return el(
      'div',
      { class: 'review-row' },
      el('span', { class: 'review-name', id: `rv-${it.menuItemId}` }, it.name),
      el('div', { class: 'stars', role: 'radiogroup', 'aria-labelledby': `rv-${it.menuItemId}` }, buttons),
    );
  });
  const send = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        const items = [...picked].map(([menuItemId, stars]) => ({ menuItemId, stars }));
        if (!items.length && !comment.value.trim()) return toast('Chấm ít nhất một món hoặc viết góp ý', 'warning');
        setBusy(send, true);
        try {
          await api(`/api/sessions/${sessionId}/review`, { method: 'POST', body: { items, comment: comment.value.trim() || null } });
          review = { ...review, submitted: true, canReview: false };
          render();
        } catch (err) {
          setBusy(send, false);
          toast(errorMessage(err), 'error');
          if (err.code === 'ALREADY_REVIEWED') {
            review = { ...review, submitted: true };
            render();
          }
        }
      },
    },
    'Gửi đánh giá',
  );
  return el(
    'section',
    { class: 'review-box', 'aria-label': 'Đánh giá món' },
    el('h2', {}, 'Bạn thấy món hôm nay thế nào?'),
    rows,
    el('div', { class: 'field' }, el('label', {}, 'Góp ý (không bắt buộc)'), comment),
    send,
  );
}

/** Pop-up khi có đơn vừa chuyển sang COMPLETED (AC-004-01). */
function notifyCompleted() {
  const now = new Map(session.orders.map((o) => [o.orderId, o.status]));
  if (prevStatuses) {
    const done = session.orders.filter((o) => o.status === 'COMPLETED' && prevStatuses.get(o.orderId) !== 'COMPLETED');
    if (done.length) {
      navigator.vibrate?.([200, 100, 200]);
      modal({
        title: 'Món của bạn đã xong',
        body: el(
          'div',
          { class: 'popup-done' },
          el('div', { class: 'big' }, icon('party-popper')),
          el('p', {}, done.length === 1 ? `Đơn #${done[0].orderCode} đã xong, vui lòng nhận tại quầy.` : `${done.length} đơn đã xong, vui lòng nhận tại quầy.`),
        ),
        actions: [{ label: 'Đã hiểu', class: 'btn-primary' }],
      });
    }
  }
  prevStatuses = now;
}

function progress(status) {
  const step = { PENDING: 1, PREPARING: 2, COMPLETED: 3 }[status] ?? 0;
  return el(
    'div',
    { class: 'progress', 'aria-hidden': 'true' },
    [1, 2, 3].map((i) => el('span', { class: i <= step ? 'on' : '' })),
  );
}

function orderLine(i) {
  return el(
    'li',
    {},
    el(
      'span',
      {},
      `${i.quantity} × ${i.name}`,
      i.options?.length ? el('span', { class: 'line-opts' }, i.options.map((o) => o.name).join(', ')) : null,
      i.children?.length ? el('span', { class: 'line-opts' }, i.children.map((c) => `${c.quantity}× ${c.name}`).join(' + ')) : null,
      i.note ? el('span', { class: 'line-note' }, i.note) : null,
    ),
    el('span', { class: 'nowrap' }, i.lineDiscount > 0 ? el('s', { class: 'muted small' }, money(i.listPrice * i.quantity)) : null, ' ', money(i.lineTotal)),
  );
}

function orderCard(o) {
  const label = o.status === 'VOIDED' ? 'Đã hoàn tiền' : CUSTOMER_STATUS[o.status];
  return el(
    'article',
    { class: `order-card ${o.status.toLowerCase()}` },
    el(
      'div',
      { class: 'row between' },
      el('div', {}, el('strong', {}, `Đơn #${o.orderCode}`), el('span', { class: 'muted small' }, ` · ${time(o.createdAt)}`)),
      el('span', { class: `badge ${o.status.toLowerCase()}` }, label),
    ),
    o.status !== 'CANCELLED' && o.status !== 'VOIDED'
      ? progress(o.status)
      : o.cancelReason
        ? el('div', { class: 'muted small' }, `Lý do: ${o.cancelReason}`)
        : null,
    el('ul', {}, o.items.map(orderLine)),
    o.orderPromotion ? el('div', { class: 'small save' }, `${o.orderPromotion.name}: −${money(o.orderPromotion.discount)}`) : null,
  );
}

/** Tổng: dùng breakdown server tính (khuyến mãi + hội viên + làm tròn) — không tự tính ở FE. */
function billSummary() {
  const bill = session.bill;
  if (!bill) return null;
  const lines = bill.breakdown.filter((b) => b.key !== 'total');
  return el(
    'div',
    { class: 'bill' },
    lines.length > 1
      ? lines.map((b) => el('div', { class: `cart-sub ${b.amount < 0 ? 'save' : ''}` }, el('span', {}, b.label), el('span', {}, money(b.amount))))
      : null,
    el('div', { class: 'c-summary' }, el('span', {}, lines.length > 1 ? 'Tổng thanh toán (dự kiến)' : 'Tổng tạm tính'), el('span', {}, money(bill.amountDue))),
  );
}

function render() {
  const main = $('#main');
  const actions = $('#actions');
  if (session.status === 'CLOSED') {
    actions.hidden = true;
    const paid = session.payment;
    // Sự kiện realtime / kết nối lại sau khi đã thu (đơn pha xong, voucher…) → không vẽ lại nếu màn cảm ơn không đổi
    const key = JSON.stringify([paid?.amountDue, session.payments?.length, review?.canReview, review?.submitted, review?.items?.length]);
    if (key === closedKey && main.querySelector('.thanks')) return;
    closedKey = key;
    clear(
      main,
      el(
        'div',
        { class: 'thanks card' },
        el('div', { class: 'big' }, icon('coffee')),
        el('h1', {}, 'Cảm ơn quý khách!'),
        paid
          ? el('p', {}, `Đã thanh toán ${money(paid.amountDue)} (tiền mặt).`)
          : session.payments?.length
            ? el('p', {}, `Đã thanh toán ${session.payments.length} phần, tổng ${money(session.payments.reduce((s, p) => s + p.amountDue, 0))} (tiền mặt).`)
            : el('p', {}, 'Bàn đã được đóng.'),
        paid?.memberDiscount > 0 ? el('p', { class: 'save' }, `Bạn đã tiết kiệm ${money(paid.memberDiscount)} nhờ ưu đãi hội viên.`) : null,
        el('p', { class: 'muted' }, 'Hẹn gặp lại bạn lần sau.'),
        reviewBlock(),
        el(
          'button',
          {
            class: 'btn btn-primary btn-lg',
            type: 'button',
            onclick: () => {
              clearSessionId(qr);
              location.href = `/t/${qr}`;
            },
          },
          'Gọi món mới',
        ),
      ),
    );
    return;
  }

  const orders = session.orders;
  const active = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
  actions.hidden = false;
  $('#pay').hidden = active.length === 0; // BR-018: chưa có đơn → ẩn nút

  memberBox ??= mountMemberBox(memberSlot, { sessionId, getSession: () => session, onChange: load });
  memberBox.render();
  clear(
    main,
    paymentStatus(),
    etaLine(),
    callStatus(),
    memberSlot,
    orders.length === 0
      ? el('div', { class: 'empty card' }, el('p', {}, 'Bạn chưa gọi món nào.'), el('a', { class: 'btn btn-primary', href: `/t/${qr}/menu` }, 'Xem thực đơn'))
      : [...orders].reverse().map(orderCard),
    active.length ? billSummary() : null,
    splitSummary(),
    active.length
      ? el(
          'div',
          { class: 'center' },
          el('button', { class: 'btn', type: 'button', id: 'split-bill', onclick: openSplit }, icon('receipt'), 'Chia bill theo người'),
        )
      : null,
    active.length ? el('p', { class: 'muted small center' }, 'Thanh toán bằng tiền mặt hoặc chuyển khoản. Bấm "Gọi thanh toán" khi bạn muốn tính tiền.') : null,
    el(
      'div',
      { class: 'center' },
      el('button', { class: 'btn btn-ghost', type: 'button', id: 'call-staff', onclick: callStaff }, icon('hand'), 'Gọi nhân viên'),
    ),
  );
  updatePayButton();
  updateCallButton();
}

function paymentStatus() {
  if (session.status !== 'PAYMENT_REQUESTED') return null;
  const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
  return el(
    'div',
    { class: 'pay-status', id: 'pay-status' },
    el('strong', {}, 'Đã gọi thanh toán'),
    el('p', {}, `Nhân viên sẽ đến bàn trong giây lát · Tổng ${money(session.bill?.amountDue ?? session.amountDue)} (tiền mặt)`),
    el(
      'div',
      { class: 'row between' },
      el('span', { class: 'muted' }, 'Đang chờ'),
      el('span', { class: 'timer', id: 'pay-timer' }, elapsed(session.paymentRequestedAt)),
    ),
    waited >= BUSY_AFTER_MS
      ? el(
          'div',
          { class: 'alert warning', style: { marginTop: '0.6rem', marginBottom: 0 } },
          'Nhân viên đang bận, bạn có thể ra quầy thanh toán hoặc bấm "Gọi lại".',
        )
      : null,
  );
}

/** F-025: "Món của bạn dự kiến xong sau khoảng 8–12 phút" (hàng chờ trước bạn + món của bạn). */
function etaLine() {
  if (!eta) return null;
  return el('div', { class: 'alert info eta', id: 'eta' }, icon('timer'), `Món của bạn dự kiến xong sau khoảng ${eta.minMinutes}–${eta.maxMinutes} phút`);
}

/** F-026: tóm tắt các phần khi bàn đã chia bill. */
function splitSummary() {
  if (!splits?.hasSplits) return null;
  return el(
    'div',
    { class: 'card split-summary', id: 'split-summary' },
    el('strong', {}, 'Bàn đang chia bill'),
    splits.splits
      .filter((s) => !s.isCommon || s.lines.some((l) => !l.paid))
      .map((s) =>
        el(
          'div',
          { class: 'cart-sub' },
          el('span', {}, s.isCommon ? 'Chung (chưa ai nhận)' : `${s.label}${s.mine ? ' (bạn)' : ''}`),
          el('span', {}, s.status === 'PAID' && !s.isCommon ? `Đã thu ${money(s.paidAmount ?? 0)}` : `~${money(s.unpaidAmount)}`),
        ),
      ),
    el('p', { class: 'small muted' }, 'Số tiền mỗi phần là tạm tính (chưa gồm ưu đãi hội viên). Phần "Chung" được thu cùng phần cuối.'),
  );
}

/** F-026: mỗi khách tạo phần của mình rồi chạm chọn món; món chưa ai nhận thuộc phần "Chung". */
async function openSplit() {
  const label = el('input', { class: 'input', maxlength: 50, placeholder: 'Tên phần của bạn (ví dụ: Anh A)', 'aria-label': 'Tên phần' });
  // Q-023: khối "Tạo phần" tạo một lần và không bị gỡ khỏi trang khi vẽ lại → không mất focus / chữ đang gõ khi có cập nhật realtime
  const createBox = el(
    'div',
    { class: 'stack' },
    el('p', { class: 'small muted' }, 'Tạo phần của bạn, rồi chạm vào các món bạn dùng. Món không ai chọn sẽ tính vào phần cuối cùng.'),
    label,
    el('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'create-split', onclick: createSplit }, 'Tạo phần của tôi'),
  );
  const head = el('div', { style: { display: 'contents' } });
  const rest = el('div', { class: 'stack' }); // giữ khoảng cách giữa các dòng như trước
  const body = el('div', { class: 'stack' }, head, rest);
  const msg = el('div');
  let data = null;
  const m = modal({ title: 'Chia bill theo người', sheet: true, body: el('div', {}, msg, body), onClose: () => (splitSheet = null) });

  async function refresh() {
    try {
      data = await api(`/api/sessions/${sessionId}/splits`);
    } catch (err) {
      clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
      return;
    }
    if (data.status === 'CLOSED') {
      m.close();
      return;
    }
    const mine = data.splits.find((s) => s.mine && s.status === 'OPEN');
    const owner = new Map();
    for (const s of data.splits) for (const l of s.lines) owner.set(l.orderItemId, s);
    const lines = data.hasSplits ? data.splits.flatMap((s) => s.lines) : data.lines;
    if (mine) clear(head, el('div', { class: 'alert info' }, `Phần của bạn: `, el('strong', {}, mine.label), ` · ~${money(mine.unpaidAmount)}`));
    else if (!head.contains(createBox)) clear(head, createBox);
    clear(
      rest,
      el('h3', { style: { margin: '0.4rem 0 0', fontSize: '1rem' } }, 'Món trong bàn'),
      lines
        .filter((l) => !l.paid)
        .sort((a, b) => a.orderItemId - b.orderItemId)
        .map((l) => {
          const s = owner.get(l.orderItemId);
          const isMine = s && !s.isCommon && s.mine;
          const isCommon = !s || s.isCommon;
          return el(
            'div',
            { class: `split-line ${isMine ? 'mine' : ''}` },
            el(
              'div',
              { class: 'grow' },
              el('strong', {}, `${l.quantity} × ${l.name}`),
              l.options.length ? el('div', { class: 'small muted' }, l.options.join(', ')) : null,
              el('div', { class: 'small muted' }, isCommon ? 'Chung' : isMine ? 'Của bạn' : s.label),
            ),
            el('span', { class: 'nowrap' }, money(l.amount)),
            isMine
              ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => assign(l.orderItemId, null) }, 'Bỏ')
              : isCommon && mine
                ? el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => assign(l.orderItemId, mine.splitId) }, 'Của tôi')
                : null,
          );
        }),
      data.hasSplits
        ? el(
            'div',
            { class: 'stack' },
            el('h3', { style: { margin: '0.6rem 0 0', fontSize: '1rem' } }, 'Các phần'),
            data.splits.map((s) =>
              el(
                'div',
                { class: 'cart-sub' },
                el('span', {}, s.isCommon ? 'Chung' : s.label),
                el('span', {}, s.status === 'PAID' && !s.isCommon ? 'Đã thu' : money(s.unpaidAmount)),
              ),
            ),
          )
        : null,
      el('p', { class: 'small muted' }, 'Khi xong, bấm "Gọi thanh toán": nhân viên sẽ thu riêng từng phần.'),
    );
  }

  async function createSplit(e) {
    const btn = e.currentTarget; // currentTarget về null sau await
    setBusy(btn, true);
    try {
      await api(`/api/sessions/${sessionId}/splits`, { method: 'POST', body: { label: label.value.trim() || 'Tôi' } });
      // Khối tạo phần được dùng lại nếu phần của khách bị gộp / đã thu → trả nút và ô về trạng thái mới
      setBusy(btn, false);
      label.value = '';
      await refresh();
      scheduleLoad();
    } catch (err) {
      clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
      setBusy(btn, false);
    }
  }

  async function assign(orderItemId, splitId) {
    clear(msg);
    try {
      await api(`/api/sessions/${sessionId}/items/${orderItemId}/split`, { method: 'PUT', body: { splitId } });
      await refresh();
    } catch (err) {
      clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
      await refresh();
    }
  }

  splitSheet = { refresh };
  await refresh();
}

function callStatus() {
  if (!lastCall || lastCall.handled || !session.openCalls) return null;
  return el('div', { class: 'alert info', id: 'call-status' }, `Đã gọi nhân viên lúc ${time(lastCall.at)} — nhân viên sẽ đến bàn ngay.`);
}

function updatePayButton() {
  const btn = $('#pay');
  if (session?.status === 'PAYMENT_REQUESTED') {
    const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
    btn.disabled = waited < RECALL_AFTER_MS;
    btn.textContent = waited < RECALL_AFTER_MS ? `Gọi lại sau ${elapsed(Date.now() - (RECALL_AFTER_MS - waited), Date.now())}` : 'Gọi lại nhân viên';
  } else {
    btn.disabled = false;
    btn.textContent = 'Gọi thanh toán';
  }
}

function updateCallButton() {
  const btn = $('#call-staff');
  if (!btn) return;
  const left = lastCall ? CALL_COOLDOWN_MS - (Date.now() - lastCall.at) : 0;
  btn.disabled = left > 0;
  btn.replaceChildren(icon('hand'), left > 0 ? `Đã gọi nhân viên (gọi lại sau ${Math.ceil(left / 1000)}s)` : 'Gọi nhân viên');
}

async function requestPayment() {
  const active = session.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'VOIDED');
  const recall = session.status === 'PAYMENT_REQUESTED';
  const due = session.bill?.amountDue ?? session.amountDue;
  const ok = await modal({
    title: recall ? 'Gọi lại nhân viên?' : 'Gọi thanh toán',
    body: el(
      'div',
      {},
      el('p', {}, `Gọi nhân viên ra thu tiền ${money(due)} (tiền mặt)?`),
      el(
        'ul',
        { class: 'small muted' },
        active.map((o) => el('li', {}, `Đơn #${o.orderCode} — ${money(o.totalAmount)}`)),
      ),
      session.member ? el('p', { class: 'small save' }, `Đã gồm ưu đãi hội viên ${session.member.maskedName}.`) : null,
    ),
    actions: [
      { label: 'Hủy', value: false },
      { label: recall ? 'Gọi lại' : 'Xác nhận', class: 'btn-primary', value: true },
    ],
  }).result;
  if (ok !== true) return;
  const btn = $('#pay');
  setBusy(btn, true);
  try {
    await api(`/api/sessions/${sessionId}/request-payment`, { method: 'POST' });
    toast('Đã báo quầy. Nhân viên sẽ đến bàn thu tiền.', 'success');
    await load();
  } catch (err) {
    if (err.code === 'SESSION_CLOSED') return load();
    toast(errorMessage(err), 'error');
  } finally {
    setBusy(btn, false);
    updatePayButton();
  }
}

/** F-021: chọn nhanh yêu cầu hoặc ghi chú → quầy nhận dải "Gọi nhân viên" + chuông. */
async function callStaff() {
  const other = el('input', { class: 'input', maxlength: 100, placeholder: 'Yêu cầu khác (không bắt buộc)' });
  let chosen = CALL_CHOICES[0];
  const chips = el(
    'div',
    { class: 'note-chips' },
    CALL_CHOICES.map((c, i) =>
      el(
        'button',
        {
          class: 'chip',
          type: 'button',
          'aria-pressed': String(i === 0),
          onclick: (e) => {
            chosen = c;
            chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
          },
        },
        c,
      ),
    ),
  );
  const ok = await modal({
    title: 'Gọi nhân viên',
    sheet: true,
    body: el('div', { class: 'stack' }, el('p', { class: 'small muted' }, 'Chọn nhanh yêu cầu của bạn:'), chips, other),
    actions: [
      { label: 'Hủy', value: false },
      { label: 'Gọi nhân viên', class: 'btn-primary', value: true },
    ],
  }).result;
  if (ok !== true) return;
  const message = other.value.trim() || chosen;
  try {
    await api(`/api/sessions/${sessionId}/call-staff`, { method: 'POST', body: { message } });
    lastCall = { at: Date.now(), handled: false };
    toast('Đã gọi nhân viên, vui lòng chờ trong giây lát.', 'success');
    await load();
  } catch (err) {
    if (err.code === 'TOO_SOON') lastCall = { at: Date.now() - (CALL_COOLDOWN_MS - (err.details?.retryAfter ?? 60) * 1000), handled: false };
    toast(errorMessage(err), err.status === 429 ? 'warning' : 'error');
    updateCallButton();
  }
}

function scheduleLoad() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(load, 150);
}

$('#pay').addEventListener('click', requestPayment);

setInterval(() => {
  updateCallButton();
  if (session?.status !== 'PAYMENT_REQUESTED') return;
  const timer = $('#pay-timer');
  if (timer) timer.textContent = elapsed(session.paymentRequestedAt);
  const waited = Date.now() - new Date(session.paymentRequestedAt).getTime();
  if (waited >= BUSY_AFTER_MS && !$('#pay-status .alert')) render();
  updatePayButton();
}, 1000);

await load();
const socket = connectRealtime({
  sessionId,
  onOnline: (reconnected) => {
    $('#offline').hidden = true;
    if (reconnected) load(); // AC-004-02
  },
  onOffline: () => ($('#offline').hidden = false),
  onAuthError: () => goEntry(qr),
});
for (const evt of [
  'order.created',
  'order.status_changed',
  'order.cancelled',
  'session.payment_requested',
  'session.payment_cancelled',
  'session.settled',
  'session.closed',
  'session.member_changed',
  'session.split_changed',
]) {
  socket?.on(evt, scheduleLoad);
}
socket?.on('session.table_changed', (p) => followTable(qr, sessionId, p.toTable)); // F-049
// F-057: bàn này được thu chung vào bàn khác → sang trang theo dõi của bàn đó (đánh giá món ở đó)
socket?.on('session.settled', (p) => followMerged(qr, p.mergedInto));
socket?.on('session.staff_called', (c) => {
  lastCall = { at: new Date(c.requestedAt).getTime(), handled: false };
  scheduleLoad();
});
// F-038: thanh toán lần đầu của người được giới thiệu → cả hai nhận voucher
socket?.on('member.vouchers_issued', (p) => {
  toast(`Bạn và người giới thiệu mỗi người nhận 1 voucher giảm ${p.percent}% — dùng ở lần sau, báo nhân viên khi thanh toán.`, 'success', 9000);
  scheduleLoad();
});
socket?.on('session.staff_call_handled', () => {
  if (lastCall) lastCall.handled = true;
  toast('Nhân viên đã nhận yêu cầu của bạn.', 'success');
  scheduleLoad();
});
