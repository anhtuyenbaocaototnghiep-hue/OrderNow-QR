// S-32 Lịch sử ca (FEATURE-018) + hoàn tiền (FEATURE-019) cho quản lý: tiền dự kiến / đếm thực tế / chênh lệch (âm tô đỏ), phiếu chốt ca;
// danh sách hoàn tiền (ai làm, ai duyệt, lý do). Thao tác hoàn tiền thực hiện ở Quầy → Ca & hoàn tiền.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, dateTime, el, errorMessage, modal, money, toast, todayVn } from '../ui.js';

await mountAdminShell('shifts');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const state = { from: addDays(todayVn(), -6), to: todayVn() };
const fromInput = el('input', { type: 'date', class: 'input', value: state.from, max: todayVn(), 'aria-label': 'Từ ngày' });
const toInput = el('input', { type: 'date', class: 'input', value: state.to, max: todayVn(), 'aria-label': 'Đến ngày' });
const body = el('div');
clear(
  $('#content'),
  el(
    'div',
    { class: 'filters' },
    el('div', { class: 'field' }, el('label', {}, 'Từ ngày'), fromInput),
    el('div', { class: 'field' }, el('label', {}, 'Đến ngày'), toInput),
    el(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onclick: () => {
          state.from = fromInput.value;
          state.to = toInput.value;
          load();
        },
      },
      'Xem',
    ),
    el('a', { class: 'btn', href: '/pos/shift' }, 'Mở trang ca ở quầy →'),
  ),
  body,
);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    const q = `from=${state.from}&to=${state.to}`;
    const [shifts, refunds] = await Promise.all([staffApi(`/api/admin/shifts?${q}`), staffApi(`/api/admin/refunds?${q}`)]);
    render(shifts, refunds);
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function render(shifts, refunds) {
  clear(
    body,
    el('h2', { style: { fontSize: '1.05rem' } }, 'Ca làm việc'),
    shifts.length === 0
      ? el('div', { class: 'empty card' }, 'Không có ca nào trong khoảng này.')
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
                // F-056 (ADR-019 D-72): két chỉ tính tiền mặt; chuyển khoản hiện riêng
                ['Ca', 'Mở', 'Đóng', 'Đầu ca', 'Tiền mặt thu', 'Hoàn tiền mặt', 'Chuyển khoản', 'Dự kiến trong két', 'Đếm thực tế', 'Chênh lệch', ''].map(
                  (h, i) => el('th', { class: i >= 3 && i <= 9 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              shifts.map((s) =>
                el(
                  'tr',
                  {},
                  el('td', { class: 'mono' }, `#${s.shiftId}`),
                  el('td', { class: 'small' }, dateTime(s.openedAt), el('div', { class: 'muted' }, s.openedBy.fullName)),
                  el(
                    'td',
                    { class: 'small' },
                    s.closedAt
                      ? [dateTime(s.closedAt), el('div', { class: 'muted' }, s.closedBy?.fullName ?? '')]
                      : el('span', { class: 'pill on' }, 'Đang mở'),
                  ),
                  el('td', { class: 'num' }, money(s.openingCash)),
                  el('td', { class: 'num' }, money(s.cashIn)),
                  el('td', { class: 'num' }, money(s.cashOut)),
                  el('td', { class: 'num' }, money((s.transferIn ?? 0) - (s.transferRefunds ?? 0))),
                  el('td', { class: 'num' }, money(s.expectedCash)),
                  el('td', { class: 'num' }, s.countedCash === null ? '—' : money(s.countedCash)),
                  el('td', { class: `num ${s.difference < 0 ? 'neg' : s.difference > 0 ? 'pos-val' : ''}` }, s.difference === null ? '—' : money(s.difference)),
                  el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => report(s.shiftId) }, 'Phiếu')),
                ),
              ),
            ),
          ),
        ),
    el('h2', { style: { fontSize: '1.05rem', marginTop: '1.5rem' } }, 'Hoàn tiền'),
    refunds.length === 0
      ? el('div', { class: 'empty card' }, 'Không có lần hoàn tiền nào.')
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
                ['Thời gian', 'Bàn / đơn', 'Số tiền', 'Cách hoàn', 'Lý do', 'Hoàn kho', 'Thực hiện', 'Duyệt'].map((h, i) =>
                  el('th', { class: i === 2 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              refunds.map((r) =>
                el(
                  'tr',
                  {},
                  el('td', { class: 'nowrap' }, dateTime(r.createdAt)),
                  el('td', {}, r.target, r.voidedOrderIds.length ? el('div', { class: 'small muted' }, `hủy ${r.voidedOrderIds.length} đơn`) : null),
                  el('td', { class: 'num' }, money(r.amount)),
                  el('td', {}, r.method === 'TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'),
                  el('td', {}, r.reason),
                  el('td', {}, r.restockInventory ? 'Có' : 'Không'),
                  el('td', {}, r.createdBy),
                  el('td', {}, r.approvedBy),
                ),
              ),
            ),
          ),
        ),
  );
}

async function report(id) {
  try {
    const { shift, report: r } = await staffApi(`/api/shifts/${id}/report`);
    modal({
      title: `Phiếu chốt ca #${shift.shiftId}`,
      body: el(
        'div',
        { class: 'stack' },
        el('p', { class: 'small muted' }, `${dateTime(shift.openedAt)} → ${shift.closedAt ? dateTime(shift.closedAt) : 'đang mở'} · ${r.orderCount} đơn`),
        el(
          'ul',
          {},
          el(
            'li',
            {},
            `Đầu ca ${money(shift.openingCash)} + tiền mặt thu ${money(shift.cashIn)} − hoàn tiền mặt ${money(shift.cashOut)} = dự kiến ${money(shift.expectedCash)}`,
          ),
          el(
            'li',
            {},
            `Chuyển khoản ${money(shift.transferIn ?? 0)} (${shift.transferCount ?? 0} lượt)${shift.transferRefunds ? `, đã hoàn ${money(shift.transferRefunds)}` : ''} — vào tài khoản quán, không tính vào két`,
          ),
          shift.countedCash !== null
            ? el(
                'li',
                {},
                `Đếm thực tế ${money(shift.countedCash)} → chênh lệch `,
                el('strong', { class: shift.difference < 0 ? 'neg' : '' }, money(shift.difference)),
              )
            : null,
          el(
            'li',
            {},
            `Giảm giá: khuyến mãi ${money(r.discounts.promo)} · hội viên ${money(r.discounts.member)} · giảm tay ${money(r.discounts.manual)} · làm tròn ${money(r.discounts.rounding)}`,
          ),
        ),
        el('h3', { style: { fontSize: '1rem' } }, 'Theo nhân viên thu'),
        el(
          'ul',
          {},
          r.byStaff.map((s) => el('li', {}, `${s.fullName}: ${s.payments} lượt · ${money(s.amount)}`)),
        ),
        shift.note ? el('p', {}, `Ghi chú: ${shift.note}`) : null,
      ),
      actions: [{ label: 'Đóng', class: 'btn-primary' }],
    });
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

load();
