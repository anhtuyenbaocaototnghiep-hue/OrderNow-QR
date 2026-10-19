// S-42 Hôm nay — dashboard chủ quán (FEATURE-043, ADR-006 D-32). Đọc số tính sẵn (job 00:30) → mở nhanh trên điện thoại.
// Quản lý: đủ thẻ (kể cả lãi gộp). Trưởng ca: bản rút gọn, không có giá vốn / lãi (server đã bỏ). Nhân viên → về quầy.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { logout, requireStaffPage } from '../auth.js';
import { $, clear, dateTime, el, errorMessage, money, toast } from '../ui.js';

const user = await requireStaffPage();
if (user.role === 'ADMIN') await mountAdminShell('today');
else if (user.role === 'MANAGER') {
  // Trưởng ca không có menu quản lý — chỉ thanh trên gọn
  document.body.classList.add('today-lead');
  clear(
    $('#side'),
    el('div', { class: 'brand' }, '☕ Hôm nay'),
    el('a', { href: '/pos' }, '← Màn hình quầy'),
    el('div', { class: 'spacer' }),
    el('div', { class: 'who' }, el('strong', {}, user.fullName), el('div', { class: 'small' }, 'Trưởng ca')),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, 'Đăng xuất'),
  );
} else {
  location.replace('/pos?denied=admin');
  await new Promise(() => {});
}

const main = $('#content');
const fmtD = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function load(recompute = false) {
  try {
    const d = await staffApi(recompute ? '/api/dashboard/recompute' : '/api/dashboard/today', { method: recompute ? 'POST' : 'GET' });
    render(d);
    if (recompute) toast('Đã tính lại số liệu hôm nay', 'success');
  } catch (err) {
    clear(main, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const card = (title, ...children) => el('section', { class: 'card today-card' }, el('h2', {}, title), ...children);
const delta = (pct) =>
  pct === null || pct === undefined
    ? el('span', { class: 'muted' }, 'chưa có số tuần trước')
    : el('span', { class: pct >= 0 ? 'up' : 'down' }, `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%`);

function render(d) {
  const y = d.yesterday;
  const snap = d.today ?? y; // ảnh chụp kho mới nhất
  const t = d.todos;
  clear(
    $('#head-actions'),
    el('span', { class: 'small muted' }, `Tính lúc ${dateTime((d.today ?? y).computedAt)}`),
    el('button', { class: 'btn btn-sm', type: 'button', onclick: () => load(true) }, 'Tính lại hôm nay'),
  );
  clear(
    main,
    el(
      'div',
      { class: 'today-grid' },
      card(
        `Doanh thu hôm qua (${fmtD(d.date)})`,
        el('div', { class: 'big' }, money(y.revenueNet)),
        el('div', { class: 'small' }, delta(d.revenueChange), ` so với cùng thứ tuần trước (${money(d.sameDayLastWeek.revenueNet)})`),
        el('div', { class: 'small muted' }, `${y.orderCount} đơn · bill TB ${money(y.avgBill)}`),
        d.full ? el('div', { class: 'small' }, `Lãi gộp ước tính: `, el('strong', {}, money(y.grossProfit))) : null,
      ),
      card(
        'Lệch két ca gần nhất',
        d.lastShift
          ? [
              el(
                'div',
                { class: `big ${d.lastShift.difference < 0 ? 'down' : d.lastShift.difference > 0 ? 'up' : ''}` },
                `${d.lastShift.difference > 0 ? '+' : ''}${money(d.lastShift.difference)}`,
              ),
              el('div', { class: 'small muted' }, `Ca #${d.lastShift.shiftId} đóng ${dateTime(d.lastShift.closedAt)}`),
            ]
          : el('p', { class: 'muted' }, 'Chưa có ca nào đóng.'),
      ),
      card(
        'Kho cần chú ý',
        snap.lowStock.length || snap.expiring.length
          ? el(
              'ul',
              { class: 'small' },
              snap.lowStock.slice(0, 5).map((i) => el('li', {}, `Sắp hết: ${i.name}`)),
              snap.expiring.slice(0, 5).map((l) => el('li', {}, `${l.daysLeft < 0 ? 'Đã hết hạn' : `Còn ${l.daysLeft} ngày`}: ${l.name}`)),
            )
          : el('p', { class: 'muted' }, 'Không có nguyên liệu sắp hết / sắp hết hạn.'),
      ),
      card(
        'Top 3 món hôm qua',
        y.topItems.length
          ? el(
              'ol',
              { class: 'small' },
              y.topItems.map((i) => el('li', {}, `${i.name} — ${i.qty} phần`)),
            )
          : el('p', { class: 'muted' }, 'Chưa có đơn.'),
      ),
      card(
        'Hội viên hôm qua',
        el('div', { class: 'big' }, `+${y.newMembers}`),
        el('div', { class: 'small muted' }, `hội viên mới · ${y.vouchersUsed} voucher đã dùng`),
      ),
    ),
    el(
      'section',
      { class: 'card today-todo' },
      el('h2', {}, 'Việc cần làm'),
      el(
        'ul',
        {},
        todo(t.pendingCash, `${t.pendingCash} khoản chi quỹ chờ duyệt${t.pendingCashAmount ? ` (${money(t.pendingCashAmount)})` : ''}`, '/pos/shift'),
        todo(t.posDue, `${t.posDue} đơn đặt hàng đến hạn nhận`, '/pos/stock'),
        todo(t.expiredLots, `${t.expiredLots} lô đã hết hạn còn hàng — cần hủy`, '/pos/stock'),
        todo(
          t.stocktakeOverdue,
          t.stocktakeAgeDays === null ? 'Chưa từng chốt kiểm kê' : `${t.stocktakeAgeDays} ngày chưa kiểm kê (quá 7 ngày)`,
          d.full ? '/admin/stock' : '/pos/stock',
        ),
        !t.pendingCash && !t.posDue && !t.expiredLots && !t.stocktakeOverdue ? el('li', { class: 'muted' }, '✔ Không có việc tồn đọng.') : null,
      ),
    ),
  );
}

const todo = (show, text, href) => (show ? el('li', {}, el('a', { href }, text)) : null);

await load();
