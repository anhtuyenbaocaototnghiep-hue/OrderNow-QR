// SCR-52 Giờ công của tôi (F-072 / F-073, ADR-030 D-129): chỉ của chính mình — giờ chấm công, giờ được tính lương, ai sửa / vì sao,
// báo sai một lần chấm công, lương tạm tính tháng này, phiếu lương các tháng đã chốt (bấm "Đã xem").
import { staffApi } from '../api.js';
import { mountPosShell } from '../pos-shell.js';
import { setPinDialog } from '../staff-pin.js';
import { $, clear, dateOnly, dateTime, el, errorMessage, modal, money, time, toast, todayVn } from '../ui.js';

const shell = await mountPosShell('me');
const main = $('#main');
const hours = (m) => `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ''}`;
const monthLabel = (m) => `Tháng ${m.slice(5)}/${m.slice(0, 4)}`;
const months = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(`${todayVn().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});
let month = months[0];

async function load() {
  try {
    render(await staffApi(`/api/me/attendance?month=${month}`));
  } catch (err) {
    clear(main, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function payRows(p) {
  const rows = [
    ['Giờ được tính lương', hours(p.minutes)],
    p.basePay ? ['Lương', money(p.basePay)] : null,
    p.nightPay ? [`Phụ cấp ca tối (${hours(p.nightMinutes)})`, money(p.nightPay)] : null,
    p.holidayPay ? [`Thêm ngày lễ (${hours(p.holidayMinutes)})`, money(p.holidayPay)] : null,
    p.attendanceBonus ? ['Thưởng chuyên cần', money(p.attendanceBonus)] : null,
    p.adjustments ? ['Thưởng / khấu trừ khác', money(p.adjustments)] : null,
    p.advances ? ['Đã tạm ứng', `−${money(p.advances)}`] : null,
  ].filter(Boolean);
  return el(
    'dl',
    { class: 'kv' },
    ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]),
    el('dt', {}, el('strong', {}, p.status === 'LOCKED' ? 'Thực nhận' : 'Tạm tính')),
    el('dd', {}, el('strong', {}, money(p.netPay))),
  );
}

function payCard(data) {
  const p = data.pay;
  if (!p) return el('section', { class: 'card' }, el('h2', {}, 'Lương'), el('p', { class: 'muted' }, 'Quản lý chưa nhập hồ sơ lương của bạn.'));
  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'row between wrap' },
      el('h2', { style: { margin: 0 } }, p.status === 'LOCKED' ? `Phiếu lương ${monthLabel(data.month)}` : 'Lương tạm tính'),
      p.status === 'LOCKED'
        ? p.ackAt
          ? el('span', { class: 'badge ok' }, `Đã xem ${dateOnly(p.ackAt)}`)
          : el(
              'button',
              {
                class: 'btn btn-sm btn-primary',
                type: 'button',
                onclick: async () => {
                  try {
                    await staffApi(`/api/me/payslips/${data.month}/ack`, { method: 'POST' });
                    toast('Đã xác nhận xem phiếu lương', 'success');
                    load();
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  }
                },
              },
              'Đã xem',
            )
        : el('span', { class: 'badge pending' }, 'Chưa chốt'),
    ),
    payRows(p),
    p.status === 'LOCKED' && p.paidAt
      ? el('p', { class: 'small muted' }, `Đã trả ${dateOnly(p.paidAt)} (${p.paidMethod === 'TRANSFER' ? 'chuyển khoản' : 'tiền mặt'})`)
      : null,
    p.status !== 'LOCKED' ? el('p', { class: 'small muted' }, 'Số tạm tính có thể đổi tới khi quản lý chốt lương cuối tháng.') : null,
  );
}

async function disputeDialog(r) {
  const note = el('textarea', { class: 'input', id: 'dispute-note', rows: 3, maxlength: 300, placeholder: 'Ví dụ: hôm đó em vào 7:55, ra 14:05' });
  const msg = el('div');
  await modal({
    title: `Báo sai — ${dateOnly(r.clockIn)}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', {}, `Đang ghi: ${time(r.clockIn)} – ${r.clockOut ? time(r.clockOut) : 'chưa ra'}`),
      el('label', { for: 'dispute-note' }, 'Sai ở đâu, đúng là mấy giờ?'),
      note,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Gửi quản lý',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(`/api/me/attendance/${r.attId}/dispute`, { method: 'POST', body: { note: note.value.trim() } });
            toast('Đã gửi — quản lý sẽ xem trước khi chốt lương', 'success');
            load();
            return true;
          } catch (err) {
            clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
            return false;
          }
        },
      },
    ],
  }).result;
}

function recordsCard(data) {
  if (!data.records.length)
    return el('section', { class: 'card' }, el('h2', {}, 'Chấm công'), el('p', { class: 'muted' }, 'Chưa có lần chấm công nào trong tháng.'));
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, 'Chấm công'),
    el(
      'ul',
      { class: 'me-att' },
      data.records.map((r) =>
        el(
          'li',
          {},
          el(
            'div',
            { class: 'row between wrap' },
            el('strong', {}, `${dateOnly(r.clockIn)} · ${time(r.clockIn)} – ${r.clockOut ? time(r.clockOut) : 'đang làm'}`),
            r.openDispute
              ? el('span', { class: 'badge pending' }, 'Đã báo sai')
              : r.clockOut
                ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => disputeDialog(r) }, 'Báo sai')
                : null,
          ),
          el('div', { class: 'small' }, `Lịch ${r.roster ?? 'không có'} · được tính ${hours(r.paidMinutes)}`),
          r.late ? el('div', { class: 'small neg' }, 'Đi trễ') : null,
          ...r.issues.map((t) => el('div', { class: 'small muted' }, t)),
          r.decision
            ? el(
                'div',
                { class: 'small' },
                `Quản lý ${r.decidedBy ?? ''}: ${{ ACTUAL: 'tính giờ thật', SCHEDULE: 'tính theo lịch', NONE: 'không tính' }[r.decision]}`,
              )
            : null,
          ...r.edits.map((e) => el('div', { class: 'small muted' }, `Sửa bởi ${e.by} lúc ${dateTime(e.at)}${e.reason ? `: ${e.reason}` : ''}`)),
        ),
      ),
    ),
  );
}

function render(data) {
  const sel = el(
    'select',
    { class: 'input', id: 'me-month', 'aria-label': 'Chọn tháng' },
    months.map((m) => el('option', { value: m, selected: m === month }, `${monthLabel(m)}${data.payslipMonths.includes(m) ? ' · đã chốt' : ''}`)),
  );
  sel.addEventListener('change', () => {
    month = sel.value;
    load();
  });
  const disputes = data.disputes.filter((d) => d.createdAt);
  clear(
    main,
    el(
      'div',
      { class: 'row between wrap' },
      el('h1', {}, 'Giờ công của tôi'),
      el(
        'div',
        { class: 'row wrap' },
        sel,
        el('button', { class: 'btn', type: 'button', onclick: () => setPinDialog() }, shell.user.hasPin ? 'Đổi PIN' : 'Đặt PIN'),
      ),
    ),
    payCard(data),
    recordsCard(data),
    disputes.length
      ? el(
          'section',
          { class: 'card' },
          el('h2', {}, 'Báo sai đã gửi'),
          el(
            'ul',
            { class: 'plain-list' },
            disputes.map((d) =>
              el(
                'li',
                {},
                `${dateTime(d.createdAt)}: ${d.note} — `,
                d.resolvedAt ? el('span', { class: 'pos-val' }, `Đã xử lý: ${d.resolution}`) : el('span', { class: 'muted' }, 'chờ quản lý'),
              ),
            ),
          ),
        )
      : null,
  );
}

load();
