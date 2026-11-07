// S-15 Ca tiền mặt (FEATURE-018): mở ca, tiền dự kiến trong két, lượt thu trong ca, đóng ca (đếm tiền → chênh lệch), in phiếu chốt ca.
// F-056 (ADR-019 D-72): tiền mặt và chuyển khoản tách riêng — két chỉ tính tiền mặt.
// Hoàn tiền sau thu (FEATURE-019, D-15): chọn lượt thu → số tiền, lý do, đơn bị hủy, hoàn kho; nhân viên cần quản lý nhập tài khoản.
// ADR-006: sổ quỹ ca — chi tiền / thu khác, duyệt khoản chờ (F-033); trưởng ca / quản lý sửa chấm công trong ngày (F-035, F-036).
// F-074 (ADR-032): danh sách đơn bán lúc mất mạng / phiếu bán tay ghi vào ca + việc cần kiểm; đóng ca khi máy này còn đơn bán tạm chưa gửi → nhắc.
import { staffApi } from '../api.js';
import { attendanceDialog, attendanceTable } from '../attendance.js';
import { getToken, logout } from '../auth.js';
import { cashBookTable, cashEntryDialog } from '../cash-book.js';
import { pendingSales, syncPending } from '../offline-sales.js';
import { mountPosShell } from '../pos-shell.js';
import { connectRealtime } from '../socket.js';
import { $, clear, dateTime, el, errorMessage, modal, money, moneyInput, moneyValue, setMoney, statusBadge, time, toast, todayVn } from '../ui.js';

const shell = await mountPosShell('shift');
const main = $('#main');
const isLead = ['MANAGER', 'ADMIN'].includes(shell.user.role); // trưởng ca / quản lý
let closedReport = null; // phiếu chốt ca vừa đóng (để in)
// F-054 (ADR-014 D-59): tới từ nút Đăng xuất khi đang giữ ca → nhắc + tự mở hộp đóng ca; đóng xong thì đăng xuất
const logoutAfter = new URLSearchParams(location.search).get('then') === 'logout';
// Bỏ tham số khỏi URL ngay: tải lại / Back / đăng nhập lại (next=) không tự đăng xuất người khác (review G3)
if (logoutAfter) history.replaceState(null, '', location.pathname);
let promptedClose = false;
// Đang tự đóng ca: sự kiện realtime shift.closed có thể về trước phản hồi HTTP — lúc đó không tự đăng xuất, chờ màn "Đã đóng ca" (in phiếu)
let closingSelf = false;
let loadSeq = 0; // lượt tải mới nhất — lượt cũ về sau không được vẽ đè (DEF-012)

async function load() {
  const my = ++loadSeq;
  if (closedReport) return renderClosed(closedReport);
  const shift = shell.shift;
  if (!shift && logoutAfter && !closingSelf) return logout(); // ca đã được người khác đóng → không còn gì chặn
  if (!shift) {
    clear(
      main,
      el(
        'div',
        { class: 'card center', style: { maxWidth: '520px', margin: '2rem auto' } },
        el('h1', {}, 'Chưa mở ca'),
        el('p', { class: 'muted' }, 'Mở ca trước khi thu tiền: nhập số tiền mặt đầu ca có trong két.'),
        el('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: async () => (await shell.openShiftDialog()) && load() }, 'Mở ca'),
      ),
    );
    return;
  }
  let data;
  try {
    const today = todayVn();
    const [report, attendance, offline] = await Promise.all([
      staffApi(`/api/shifts/${shift.shiftId}/report`),
      isLead ? staffApi(`/api/attendance?from=${today}&to=${today}`) : null,
      staffApi(`/api/offline-sales?shiftId=${shift.shiftId}`).catch(() => []), // phần phụ — lỗi thì bỏ qua, không làm hỏng cả trang Ca
    ]);
    data = { ...report, attendance, offline };
  } catch (err) {
    if (my !== loadSeq || closedReport) return;
    clear(main, el('div', { class: 'alert danger' }, errorMessage(err)));
    return;
  }
  // Lượt tải bắt đầu khi ca còn mở (vd. sau sự kiện hoàn tiền) có thể về sau màn "Đã đóng ca": lượt đã cũ thì bỏ (DEF-012)
  if (my !== loadSeq || closedReport) return;
  render(data);
}

// F-056: cách trả của một lượt thu
const methodBadge = (m) => (m === 'TRANSFER' ? el('span', { class: 'badge preparing' }, 'Chuyển khoản') : el('span', { class: 'badge' }, 'Tiền mặt'));

const kpi = (label, value, cls = '') => el('div', { class: `card kpi ${cls}` }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value));

function summary({ shift, report }) {
  return [
    el(
      'div',
      { class: 'kpis' },
      kpi('Tiền đầu ca', money(shift.openingCash)),
      kpi(`Tiền mặt đã thu (${shift.paymentCount - (shift.transferCount ?? 0)} lượt)`, money(shift.cashIn)),
      kpi(`Chuyển khoản (${shift.transferCount ?? 0} lượt) — không vào két`, money(shift.transferIn ?? 0)),
      kpi('Đã hoàn tiền mặt', money(shift.cashOut)),
      shift.transferRefunds ? kpi('Đã hoàn chuyển khoản', money(shift.transferRefunds)) : null,
      shift.cashBookIn ? kpi('Thu thêm (sổ quỹ)', money(shift.cashBookIn)) : null,
      kpi('Đã chi (sổ quỹ)', money(shift.cashBookOut)),
      kpi(shift.status === 'OPEN' ? 'Tiền dự kiến trong két' : 'Tiền dự kiến', money(shift.expectedCash), 'strong'),
      shift.status === 'CLOSED' ? kpi('Đếm thực tế', money(shift.countedCash)) : null,
      shift.status === 'CLOSED' ? kpi('Chênh lệch', money(shift.difference), shift.difference < 0 ? 'neg' : 'pos') : null,
    ),
    el(
      'div',
      { class: 'grid-2' },
      el(
        'div',
        { class: 'card' },
        el('h2', {}, 'Theo nhân viên thu'),
        report.byStaff.length
          ? el(
              'ul',
              {},
              report.byStaff.map((s) => el('li', {}, `${s.fullName}: ${s.payments} lượt · ${money(s.amount)}`)),
            )
          : el('p', { class: 'muted' }, 'Chưa có lượt thu.'),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', {}, 'Giảm giá trong ca'),
        el(
          'ul',
          {},
          el('li', {}, `Khuyến mãi: ${money(report.discounts.promo)}`),
          el('li', {}, `Hội viên: ${money(report.discounts.member)}`),
          el('li', {}, `Giảm tay: ${money(report.discounts.manual)}`),
          el('li', {}, `Làm tròn: ${money(report.discounts.rounding)}`),
        ),
        el('p', { class: 'small muted' }, `${report.orderCount} đơn đã thu trong ca`),
      ),
    ),
  ];
}

function render(data) {
  const { shift, report } = data;
  const mine = shift.openedBy.userId === shell.user.userId;
  if (logoutAfter && !mine && !closingSelf) return void logout(); // ca của người khác → mình được đăng xuất ngay
  clear(
    main,
    logoutAfter ? el('div', { class: 'alert warning', role: 'status' }, 'Bạn đang giữ ca này — đếm tiền trong két rồi bấm "Đóng ca" để đăng xuất.') : null,
    el(
      'div',
      { class: 'row between wrap', style: { marginBottom: '1rem' } },
      el(
        'h1',
        { style: { margin: 0 } },
        `Ca #${shift.shiftId}`,
        el('span', { class: 'muted small' }, ` · mở ${dateTime(shift.openedAt)} bởi ${shift.openedBy.fullName}`),
      ),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'btn', type: 'button', onclick: load }, 'Tải lại'),
        el('button', { class: 'btn btn-danger', type: 'button', onclick: () => closeShift(shift) }, 'Đóng ca'),
      ),
    ),
    summary(data),
    offlineCard(data.offline),
    cashCard(data, true),
    data.attendance ? attendanceCard(data.attendance) : null,
    el(
      'div',
      { class: 'card', style: { marginTop: '1rem' } },
      el('h2', {}, 'Lượt thu trong ca'),
      report.payments.length === 0
        ? el('p', { class: 'muted' }, 'Chưa có lượt thu nào.')
        : el(
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
                  ['Giờ', 'Bàn / đơn', 'Cách trả', 'Phải thu', 'Đã hoàn', 'Thu ngân', ''].map((h, i) =>
                    el('th', { class: i === 3 || i === 4 ? 'num' : '' }, h),
                  ),
                ),
              ),
              el(
                'tbody',
                {},
                report.payments.map((p) =>
                  el(
                    'tr',
                    {},
                    el('td', {}, time(p.paidAt)),
                    el('td', {}, p.target),
                    el('td', {}, methodBadge(p.method)),
                    el('td', { class: 'num' }, money(p.amountDue)),
                    el('td', { class: 'num' }, p.refunded ? money(p.refunded) : '—'),
                    el('td', {}, p.receivedBy),
                    el(
                      'td',
                      {},
                      p.refunded < p.amountDue
                        ? el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => openRefund(p.paymentId) }, 'Hoàn tiền')
                        : el('span', { class: 'badge danger' }, 'Đã hoàn hết'),
                    ),
                  ),
                ),
              ),
            ),
          ),
    ),
    report.refunds.length
      ? el(
          'div',
          { class: 'card', style: { marginTop: '1rem' } },
          el('h2', {}, 'Hoàn tiền trong ca'),
          el(
            'ul',
            {},
            report.refunds.map((r) =>
              el(
                'li',
                {},
                `${time(r.createdAt)} · ${money(r.amount)} ${r.method === 'TRANSFER' ? '(chuyển khoản)' : '(tiền mặt)'} — ${r.reason} (thực hiện: ${r.createdBy}, duyệt: ${r.approvedBy})`,
              ),
            ),
          ),
        )
      : null,
  );
  // F-054: tới từ nút Đăng xuất → mở sẵn hộp đóng ca (một lần)
  if (logoutAfter && !promptedClose) {
    promptedClose = true;
    closeShift(shift);
  }
}

function renderClosed(data) {
  const { shift } = data;
  clear(
    main,
    el(
      'div',
      { class: 'row between wrap no-print', style: { marginBottom: '1rem' } },
      el('h1', { style: { margin: 0 } }, `Đã đóng ca #${shift.shiftId}`),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, 'In phiếu chốt ca'),
        // F-054: đóng ca để đăng xuất → in phiếu (nếu cần) rồi bấm Đăng xuất
        logoutAfter
          ? el('button', { class: 'btn', type: 'button', onclick: logout }, 'Đăng xuất')
          : el(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => {
                  closedReport = null;
                  load();
                },
              },
              'Xong',
            ),
      ),
    ),
    el(
      'div',
      { class: 'shift-print' },
      el('h2', { class: 'print-only' }, `PHIẾU CHỐT CA #${shift.shiftId}`),
      el('p', {}, `Mở: ${dateTime(shift.openedAt)} (${shift.openedBy.fullName}) · Đóng: ${dateTime(shift.closedAt)} (${shift.closedBy?.fullName ?? ''})`),
      shift.note ? el('p', {}, `Ghi chú: ${shift.note}`) : null,
      summary(data),
      cashCard(data, false),
    ),
  );
}

// ---- F-074: đơn bán lúc mất mạng / phiếu bán tay ghi vào ca này ----
function offlineCard(rows) {
  if (!rows?.length) return null;
  const total = rows.reduce((sum, r) => sum + r.amountDue, 0);
  const toCheck = rows.filter((r) => r.issues.length).length;
  return el(
    'section',
    { class: 'card', id: 'offline-sales', style: { marginTop: '1rem' } },
    el('h2', {}, `Đơn bán lúc mất mạng (${rows.length}) · ${money(total)}`),
    el(
      'p',
      { class: 'small muted' },
      toCheck
        ? `${toCheck} đơn cần kiểm — giá khác bảng giá: hỏi người bán; kho chưa trừ: kiểm kho lại; chuyển khoản: đối chiếu app ngân hàng; ghi vào ca khác: két ca trước sẽ lệch đúng số này.`
        : 'Không có đơn nào cần kiểm.',
    ),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'table' },
        el(
          'thead',
          {},
          el('tr', {}, ...['Đơn', 'Giờ bán', 'Người bán', 'Tiền', 'Cách trả', 'Cần kiểm'].map((h, i) => el('th', { class: i === 3 ? 'num' : '' }, h))),
        ),
        el(
          'tbody',
          {},
          rows.map((r) =>
            el(
              'tr',
              {},
              el(
                'td',
                {},
                el('span', { class: 'mono' }, `#${r.orderCode}`),
                r.localCode ? ` (${r.localCode})` : '',
                r.source === 'PAPER' ? ' · phiếu tay' : '',
              ),
              el('td', {}, dateTime(r.soldAt)),
              el('td', {}, r.soldBy.fullName),
              el('td', { class: 'num' }, money(r.amountDue)),
              el('td', {}, methodBadge(r.method)),
              el('td', { class: 'small' }, r.issues.length ? r.issues.map((i) => el('div', { class: i.code === 'TRANSFER_CHECK' ? '' : 'neg' }, i.text)) : '—'),
            ),
          ),
        ),
      ),
    ),
  );
}

// ---- F-033 Sổ quỹ trong ca ----
function cashCard({ shift, report }, editable) {
  const pending = (report.cashBook ?? []).filter((t) => t.status === 'PENDING').length;
  return el(
    'div',
    { class: 'card', style: { marginTop: '1rem' } },
    el(
      'div',
      { class: 'row between wrap' },
      el(
        'h2',
        { style: { margin: 0 } },
        'Sổ quỹ trong ca',
        pending ? el('span', { class: 'badge pending', style: { marginLeft: '.5rem' } }, `${pending} chờ duyệt`) : null,
      ),
      editable
        ? el(
            'div',
            { class: 'row no-print' },
            el('button', { class: 'btn btn-primary', type: 'button', onclick: async () => (await cashEntryDialog('OUT')) && load() }, 'Chi tiền'),
            el('button', { class: 'btn', type: 'button', onclick: async () => (await cashEntryDialog('IN')) && load() }, 'Thu thêm'),
          )
        : null,
    ),
    el(
      'p',
      { class: 'small muted' },
      `Đã chi ${money(shift.cashBookOut)} · thu thêm ${money(shift.cashBookIn)} — đã tính vào tiền dự kiến trong két. Mua đá, trả shipper… bấm "Chi tiền"; chủ quán bỏ thêm tiền lẻ bấm "Thu thêm".`,
    ),
    cashBookTable(report.cashBook ?? [], { user: shell.user, editable, onChange: load }),
  );
}

// ---- F-035 Chấm công hôm nay (trưởng ca / quản lý) ----
function attendanceCard(rows) {
  return el(
    'div',
    { class: 'card', style: { marginTop: '1rem' } },
    el(
      'div',
      { class: 'row between wrap' },
      el('h2', { style: { margin: 0 } }, 'Chấm công hôm nay'),
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: async () => {
            const users = await staffApi('/api/attendance/users').catch((err) => toast(errorMessage(err), 'error'));
            if (users && (await attendanceDialog(null, { users: users.filter(notSelf) }))) load();
          },
        },
        'Thêm chấm công',
      ),
    ),
    attendanceTable(rows, { editable: (a) => notSelf(a.user), onChange: load }),
  );
}

/** F-071: trưởng ca không tự sửa / tự thêm chấm công của chính mình (máy chủ cũng chặn) — quản lý thì được. */
const notSelf = (u) => shell.user.role === 'ADMIN' || u.userId !== shell.user.userId;

/**
 * F-072 (ADR-030 D-128): chế độ màn chấm công chung — người đóng ca xem ai làm trong ca: ai quên chấm ra thì chấm ra hộ (quản lý xem lại),
 * đánh dấu có mặt / không có mặt cho người khác (dòng của chính mình do quản lý xác nhận). → { node, read() } | null
 */
async function attendanceCheck(shift) {
  let board;
  try {
    board = await staffApi(`/api/attendance/shift/${shift.shiftId}`);
  } catch {
    return null;
  }
  if (board.mode !== 'KIOSK' || !board.rows.length) return null;
  const others = board.rows.filter((a) => !a.self);
  const picks = others.map((a) => {
    const out = !a.clockOut ? el('input', { type: 'checkbox', checked: true, id: `att-out-${a.attId}` }) : null;
    const present = el('select', { class: 'input', id: `att-present-${a.attId}`, 'aria-label': `${a.user.fullName} có mặt không` }, [
      el('option', { value: 'OK' }, 'Có mặt'),
      el('option', { value: 'NO' }, 'Không có mặt'),
    ]);
    const row = el(
      'li',
      { class: 'att-row' },
      el(
        'div',
        {},
        el('strong', {}, a.user.fullName),
        el('div', { class: 'small muted' }, `${time(a.clockIn)} – ${a.clockOut ? time(a.clockOut) : 'đang làm'}`),
      ),
      el('div', { class: 'att-ctrls' }, out ? el('label', { class: 'row', for: `att-out-${a.attId}` }, out, 'Chấm ra lúc đóng ca') : null, present),
    );
    return { a, out, present, row };
  });
  const mine = board.rows.filter((a) => a.self);
  const node = el(
    'div',
    { class: 'stack att-check' },
    el('h3', {}, 'Chấm công trong ca'),
    others.length
      ? el(
          'ul',
          { class: 'att-list' },
          picks.map((p) => p.row),
        )
      : null,
    mine.length ? el('p', { class: 'small muted' }, 'Giờ công của chính bạn do quản lý xác nhận (không tự xác nhận cho mình).') : null,
    el('p', { class: 'small muted' }, 'Người được chấm ra hộ hoặc bị báo không có mặt sẽ chờ quản lý xem lại trước khi tính lương.'),
  );
  return {
    node,
    read: () => ({
      clockOut: picks.filter((p) => p.out?.checked).map((p) => p.a.attId),
      present: picks.filter((p) => p.present.value === 'OK').map((p) => p.a.attId),
      absent: picks.filter((p) => p.present.value === 'NO').map((p) => p.a.attId),
    }),
  };
}

async function closeShift(shift) {
  // F-074: máy này còn đơn bán tạm chưa gửi → tiền của các đơn đó chưa vào ca, két sẽ lệch
  const queued = pendingSales();
  if (queued.length) {
    const choice = await modal({
      title: 'Còn đơn bán tạm chưa gửi',
      body: el(
        'p',
        {},
        `Máy này còn ${queued.length} đơn bán lúc mất mạng (${money(queued.reduce((sum, q) => sum + q.total, 0))}) chưa gửi về hệ thống. Gửi trước rồi hãy đóng ca để tiền khớp két — đóng ca bây giờ thì các đơn này sẽ ghi vào ca sau.`,
      ),
      actions: [
        { label: 'Hủy', value: 'cancel' },
        { label: 'Vẫn đóng ca', value: 'close' },
        { label: 'Gửi ngay', class: 'btn-primary', value: 'sync' },
      ],
    }).result;
    if (choice === 'sync') {
      const r = await syncPending();
      toast(r.left ? `Đã gửi ${r.sent}, còn ${r.left} đơn chưa gửi được` : `Đã gửi ${r.sent} đơn bán tạm`, r.left ? 'warning' : 'success');
      await shell.reloadShift();
      return load();
    }
    if (choice !== 'close') return;
  }
  const counted = moneyInput({ id: 'counted', 'aria-label': 'Tiền đếm thực tế' });
  const note = el('input', { class: 'input', maxlength: 200, placeholder: 'Ghi chú (không bắt buộc)' });
  const diff = el('div', { class: 'change' });
  const msg = el('div');
  const update = () => {
    const v = moneyValue(counted);
    if (v === null) return clear(diff, el('span', {}, 'Chênh lệch'), el('span', {}, '—'));
    const d = v - shift.expectedCash;
    diff.classList.toggle('short', d < 0);
    clear(diff, el('span', {}, d < 0 ? 'Thiếu' : d > 0 ? 'Thừa' : 'Khớp'), el('span', {}, money(d)));
  };
  counted.addEventListener('input', update);
  update();
  const check = await attendanceCheck(shift);
  await modal({
    title: `Đóng ca #${shift.shiftId}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', {}, `Tiền dự kiến trong két: `, el('strong', {}, money(shift.expectedCash))),
      shift.cashPending ? el('div', { class: 'alert warning' }, `Còn ${shift.cashPending} khoản chi chờ duyệt — duyệt hoặc từ chối trước khi đóng ca.`) : null,
      el('label', { for: 'counted' }, 'Tiền mặt đếm thực tế'),
      counted,
      diff,
      note,
      check?.node ?? null,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Đóng ca',
        class: 'btn-danger',
        onClick: async (close) => {
          const v = moneyValue(counted);
          if (v === null) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập số tiền đếm được'));
            return false;
          }
          closingSelf = true;
          try {
            closedReport = await staffApi(`/api/shifts/${shift.shiftId}/close`, {
              method: 'POST',
              body: { countedCash: v, note: note.value.trim() || null, ...(check ? { attendance: check.read() } : {}) },
            });
            shell.setShift(null);
            toast(`Đã đóng ca #${shift.shiftId}`, 'success');
            close(true);
            load();
          } catch (err) {
            clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
          } finally {
            closingSelf = false;
            // Người khác đóng ca trước mình (lệnh đóng của mình lỗi) → không còn gì chặn, đăng xuất như đã định
            if (logoutAfter && !closedReport && !shell.shift) load();
          }
          return false;
        },
      },
    ],
  }).result;
}

async function openRefund(paymentId) {
  let detail;
  try {
    detail = await staffApi(`/api/payments/${paymentId}`);
  } catch (err) {
    return toast(errorMessage(err), 'error');
  }
  const { payment, orders, refunds } = detail;
  const remaining = payment.amountDue - payment.refunded;
  const amount = moneyInput({ id: 'refund-amount', 'aria-label': 'Số tiền hoàn' });
  setMoney(amount, remaining);
  const reason = el('input', { class: 'input', maxlength: 200, placeholder: 'Ví dụ: pha sai món, khách đổi ý…', 'aria-label': 'Lý do hoàn' });
  const restock = el('input', { type: 'checkbox' });
  const live = orders.filter((o) => o.status !== 'VOIDED');
  const checks = live.map((o) => ({ o, box: el('input', { type: 'checkbox', value: o.orderId }) }));
  const adminUser = el('input', { class: 'input', placeholder: 'Tên đăng nhập quản lý', autocomplete: 'off' });
  const adminPass = el('input', { class: 'input', type: 'password', placeholder: 'Mật khẩu quản lý', autocomplete: 'new-password' });
  // D-24: trưởng ca tự hoàn cho lượt thu trong ca đang mở; ngoài ca → cần quản lý
  const sameShift = payment.shiftId === shell.shift?.shiftId;
  const needApproval = shell.user.role === 'STAFF' || (shell.user.role === 'MANAGER' && !sameShift);
  const msg = el('div');
  await modal({
    title: `Hoàn tiền — ${money(payment.amountDue)}`,
    body: el(
      'div',
      { class: 'stack' },
      el(
        'p',
        { class: 'small muted' },
        `Thu lúc ${dateTime(payment.paidAt)} bởi ${payment.receivedBy.fullName}. Đã hoàn ${money(payment.refunded)}. Chỉ hoàn được trong ngày thu tiền.`,
      ),
      // F-056 (ADR-019 D-72): hoàn theo cách khách đã trả
      payment.method === 'TRANSFER'
        ? el('p', { class: 'transfer-note' }, 'Lượt này khách trả bằng chuyển khoản — chuyển trả lại cho khách, không lấy tiền trong két.')
        : null,
      refunds.length
        ? el(
            'ul',
            { class: 'small' },
            refunds.map((r) => el('li', {}, `${time(r.createdAt)} · ${money(r.amount)} — ${r.reason}`)),
          )
        : null,
      el('label', { for: 'refund-amount' }, `Số tiền hoàn (tối đa ${money(remaining)})`),
      amount,
      el('label', {}, 'Lý do (bắt buộc)'),
      reason,
      live.length
        ? el(
            'fieldset',
            { class: 'opt-group' },
            el('legend', { class: 'small' }, 'Hủy đơn (không chọn = tự hủy tất cả khi hoàn đủ số đã thu)'),
            checks.map(({ o, box }) =>
              el(
                'label',
                { class: 'check' },
                box,
                `#${o.orderCode} · ${money(o.totalAmount)} · `,
                statusBadge(o.status),
                ` ${o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`,
              ),
            ),
          )
        : null,
      el('label', { class: 'check' }, restock, 'Hoàn kho cho món đã làm (pha sai / chưa giao khách)'),
      needApproval
        ? el(
            'div',
            { class: 'approval' },
            el('div', { class: 'small' }, sameShift ? 'Cần trưởng ca / quản lý xác thực:' : 'Cần quản lý xác thực (lượt thu của ca khác):'),
            el('div', { class: 'row' }, adminUser, adminPass),
          )
        : null,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Hoàn tiền',
        class: 'btn-danger',
        onClick: async (close) => {
          clear(msg);
          const body = {
            amount: moneyValue(amount) ?? 0,
            reason: reason.value.trim(),
            restockInventory: restock.checked,
            orderIds: checks.filter((c) => c.box.checked).map((c) => c.o.orderId),
            ...(needApproval ? { adminUsername: adminUser.value.trim(), adminPassword: adminPass.value } : {}),
          };
          try {
            const r = await staffApi(`/api/payments/${paymentId}/refunds`, { method: 'POST', body });
            toast(`Đã hoàn ${money(r.refund.amount)}${r.refund.voidedOrderIds.length ? ` · hủy ${r.refund.voidedOrderIds.length} đơn` : ''}`, 'success', 6000);
            close(true);
            load();
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
}

await load();
const socket = connectRealtime({
  token: getToken(),
  onOnline: (reconnected) => {
    shell.setOnline(true);
    if (reconnected) shell.reloadShift().then(load);
  },
  onOffline: () => shell.setOnline(false),
  onAuthError: () => (location.href = '/pos/login?reason=expired'),
});
shell.attach(socket);
shell.onShiftChange(() => !closedReport && load());
let timer = null;
const soon = () => {
  clearTimeout(timer);
  timer = setTimeout(load, 300);
};
for (const evt of ['session.settled', 'order.created', 'payment.refunded', 'cash.created', 'cash.reviewed']) socket?.on(evt, soon);
