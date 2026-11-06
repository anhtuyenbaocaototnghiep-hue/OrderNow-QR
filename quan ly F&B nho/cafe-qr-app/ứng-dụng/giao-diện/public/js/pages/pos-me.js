// SCR-52 Giờ công của tôi (F-072 / F-073, ADR-030 D-129): chỉ của chính mình — giờ chấm công, giờ được tính lương, ai sửa / vì sao,
// báo sai một lần chấm công, lương tạm tính tháng này, phiếu lương các tháng đã chốt (bấm "Đã xem").
// ADR-031 D-136: ngày có lịch mà không chấm công (đang tính vắng) → "Báo quên chấm công" (giờ vào / ra thật + lý do) → chờ quản lý duyệt.
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
const shiftDay = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const vnInstant = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`);
const MISSED_STATUS = { PENDING: 'chờ quản lý duyệt', APPROVED: 'đã duyệt', REJECTED: 'không duyệt' };
let reportDays = 7;

async function load() {
  try {
    const data = await staffApi(`/api/me/attendance?month=${month}`);
    reportDays = data.missedPunchDays ?? reportDays;
    render(data);
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

/** Báo quên chấm công: ngày + giờ vào / ra thật + lý do. Giờ ra nhỏ hơn giờ vào = ca qua đêm (ra hôm sau). */
async function missedDialog(prefill = {}) {
  const today = todayVn();
  const date = el('input', { class: 'input', type: 'date', id: 'mp-date', value: prefill.date ?? today, min: shiftDay(today, -reportDays), max: today });
  const tin = el('input', { class: 'input', type: 'time', id: 'mp-in', value: prefill.start ?? '' });
  const tout = el('input', { class: 'input', type: 'time', id: 'mp-out', value: prefill.end ?? '' });
  const note = el('textarea', { class: 'input', id: 'mp-note', rows: 2, maxlength: 300, placeholder: 'Ví dụ: vào ca vội, quên bấm Chấm công' });
  const msg = el('div');
  await modal({
    title: 'Báo quên chấm công',
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small muted' }, `Ghi giờ vào / ra thật. Quản lý duyệt thì giờ này mới được tính lương. Chỉ báo được trong ${reportDays} ngày gần đây.`),
      el('label', { for: 'mp-date' }, 'Ngày'),
      date,
      el(
        'div',
        { class: 'time-pair' },
        el('div', { class: 'stack' }, el('label', { for: 'mp-in' }, 'Giờ vào'), tin),
        el('div', { class: 'stack' }, el('label', { for: 'mp-out' }, 'Giờ ra'), tout),
      ),
      el('label', { for: 'mp-note' }, 'Vì sao quên?'),
      note,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Gửi quản lý',
        class: 'btn-primary',
        onClick: async () => {
          if (!date.value || !tin.value || !tout.value) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập ngày, giờ vào và giờ ra'));
            return false;
          }
          const clockIn = vnInstant(date.value, tin.value);
          let clockOut = vnInstant(date.value, tout.value);
          if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 86400e3); // ca qua đêm
          try {
            await staffApi('/api/me/missed-punches', {
              method: 'POST',
              body: { clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString(), note: note.value.trim() },
            });
            toast('Đã gửi — quản lý duyệt thì giờ này được tính lương', 'success');
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

/** Ngày có lịch đã qua mà không có chấm công (đang tính vắng) + các lần báo quên đã gửi. */
function missingCard(data) {
  const days = data.missingDays ?? [];
  const sent = data.missedPunches ?? [];
  if (!days.length && !sent.length) return null;
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, 'Quên chấm công?'),
    days.length
      ? el(
          'ul',
          { class: 'me-att' },
          days.map((d) =>
            el(
              'li',
              {},
              el(
                'div',
                { class: 'row between wrap' },
                el('strong', {}, `${dateOnly(d.workDate)} · lịch ${d.startTime}–${d.endTime}`),
                d.reported
                  ? el('span', { class: 'badge pending' }, 'Đã báo quên')
                  : d.canReport
                    ? el(
                        'button',
                        { class: 'btn btn-sm', type: 'button', onclick: () => missedDialog({ date: d.workDate, start: d.startTime, end: d.endTime }) },
                        'Báo quên chấm công',
                      )
                    : el('span', { class: 'small muted' }, 'Quá hạn báo — nói trực tiếp với quản lý'),
              ),
              el('div', { class: 'small muted' }, 'Không có lần chấm công nào: đang tính là vắng (không có giờ công, mất thưởng chuyên cần).'),
            ),
          ),
        )
      : null,
    sent.length ? el('h3', {}, 'Báo quên đã gửi') : null,
    sent.length
      ? el(
          'ul',
          { class: 'plain-list' },
          sent.map((m) =>
            el(
              'li',
              {},
              `${dateOnly(m.clockIn)} ${time(m.clockIn)}–${time(m.clockOut)}: ${m.note} — `,
              el(
                'span',
                { class: m.status === 'APPROVED' ? 'pos-val' : m.status === 'REJECTED' ? 'neg' : 'muted' },
                `${MISSED_STATUS[m.status]}${m.resolvedBy ? ` (${m.resolvedBy})` : ''}${m.resolution ? `: ${m.resolution}` : ''}`,
              ),
            ),
          ),
        )
      : null,
  );
}

function recordsCard(data) {
  const canReport = data.month >= shiftDay(todayVn(), -reportDays).slice(0, 7);
  const head = el(
    'div',
    { class: 'row between wrap' },
    el('h2', { style: { margin: 0 } }, 'Chấm công'),
    canReport ? el('button', { class: 'btn btn-sm', type: 'button', id: 'missed-btn', onclick: () => missedDialog() }, 'Báo quên chấm công') : null,
  );
  if (!data.records.length) return el('section', { class: 'card' }, head, el('p', { class: 'muted' }, 'Chưa có lần chấm công nào trong tháng.'));
  return el(
    'section',
    { class: 'card' },
    head,
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
    missingCard(data),
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
