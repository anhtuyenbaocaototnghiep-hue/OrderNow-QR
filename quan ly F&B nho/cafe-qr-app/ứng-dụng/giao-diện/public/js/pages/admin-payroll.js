// SCR-51 Lương (F-073, ADR-030 D-130…D-134): bảng lương tháng tính từ chấm công; việc chờ xử lý (làm thêm, ngoài lịch, quên chấm ra,
// bị báo vắng, nhân viên báo sai, chưa có hồ sơ) — xử lý hết mới chốt; chốt / mở lại (lý do); thưởng / khấu trừ, chia thưởng chung theo ca;
// trả lương: VietQR tới tài khoản từng người (đối chiếu tên chủ tài khoản) hoặc tiền mặt; phiếu lương in được; hồ sơ lương; ngày lễ.
// ADR-031 D-137: việc chờ "Nhân viên báo quên chấm công" — Duyệt (sửa giờ được) tạo lần chấm công ghi tên bạn; Từ chối cần lý do.
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { $, clear, confirmDialog, dateOnly, dateTime, el, errorMessage, modal, money, reasonDialog, time, toast, todayVn } from '../ui.js';

await mountAdminShell('payroll');

const hours = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const monthLabel = (m) => `Tháng ${m.slice(5)}/${m.slice(0, 4)}`;
const months = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(`${todayVn().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});
const state = { month: months[1], data: null, profiles: [], banks: [], users: [], disputes: [] };
const body = el('div');
clear($('#content'), body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    const [data, prof, users, disputes] = await Promise.all([
      staffApi(`/api/admin/payroll?month=${state.month}`),
      staffApi('/api/admin/pay-profiles'),
      staffApi('/api/admin/users'),
      staffApi(`/api/admin/attendance-disputes?month=${state.month}`),
    ]);
    Object.assign(state, { data, profiles: prof.profiles, banks: prof.banks, users: users.filter((u) => u.isActive), disputes });
    render();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

const run = async (fn, ok) => {
  try {
    await fn();
    if (ok) toast(ok, 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error', 6000);
  }
};

// ---------- Đầu trang ----------
function head() {
  const d = state.data;
  const sel = el(
    'select',
    { class: 'input', id: 'pay-month', 'aria-label': 'Tháng' },
    months.map((m) => el('option', { value: m, selected: m === state.month }, monthLabel(m))),
  );
  sel.addEventListener('change', () => {
    state.month = sel.value;
    load();
  });
  const locked = d.status === 'LOCKED';
  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'row between wrap' },
      el(
        'div',
        { class: 'row wrap' },
        sel,
        locked
          ? el('span', { class: 'badge ok' }, `Đã chốt ${d.run?.lockedAt ? dateOnly(d.run.lockedAt) : ''}`)
          : el('span', { class: 'badge pending' }, 'Nháp'),
      ),
      locked
        ? el(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                const reason = await reasonDialog('Mở lại bảng lương', 'Mở lại để sửa giờ công / khoản cộng trừ. Ghi lý do (lưu vào nhật ký).', {
                  okLabel: 'Mở lại',
                });
                if (reason) run(() => staffApi(`/api/admin/payroll/${state.month}/reopen`, { method: 'POST', body: { reason } }), 'Đã mở lại bảng lương');
              },
            },
            'Mở lại',
          )
        : el(
            'button',
            {
              class: 'btn btn-primary',
              type: 'button',
              id: 'pay-lock',
              disabled: !d.monthEnded || d.pending.length > 0,
              title: !d.monthEnded ? 'Chỉ chốt được tháng đã kết thúc' : d.pending.length ? 'Xử lý hết việc chờ trước' : '',
              onclick: async () => {
                if (
                  await confirmDialog(
                    'Chốt lương',
                    `Chốt lương ${monthLabel(state.month)}? Sau khi chốt không sửa được giờ công của tháng này (trừ khi mở lại).`,
                    { okLabel: 'Chốt lương' },
                  )
                )
                  run(() => staffApi(`/api/admin/payroll/${state.month}/lock`, { method: 'POST' }), 'Đã chốt lương');
              },
            },
            'Chốt lương',
          ),
    ),
    el(
      'div',
      { class: 'kpis' },
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Tổng thực nhận'), el('div', { class: 'value' }, money(d.totals.netPay))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Giờ được tính lương'), el('div', { class: 'value' }, hours(d.totals.minutes))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Đã tạm ứng'), el('div', { class: 'value' }, money(d.totals.advances))),
      el('div', { class: 'card kpi' }, el('div', { class: 'label' }, 'Việc chờ xử lý'), el('div', { class: 'value' }, String(d.pending.length))),
    ),
    !locked && !d.monthEnded ? el('p', { class: 'small muted' }, 'Tháng chưa hết: số liệu là tạm tính, chốt được từ ngày đầu tháng sau.') : null,
  );
}

// ---------- Việc chờ ----------
const DECISIONS = {
  EXTRA: [
    ['ACTUAL', 'Tính cả giờ làm thêm'],
    ['SCHEDULE', 'Chỉ tính theo lịch'],
  ],
  OFF_SCHEDULE: [
    ['ACTUAL', 'Tính'],
    ['NONE', 'Không tính'],
  ],
  AUTO_CLOSED: [
    ['SCHEDULE', 'Tính theo lịch'],
    ['ACTUAL', 'Tính giờ đang ghi'],
    ['NONE', 'Không tính'],
  ],
  DISPUTED: [
    ['ACTUAL', 'Vẫn tính'],
    ['NONE', 'Không tính'],
  ],
};

/** Giờ UTC → [ngày 'YYYY-MM-DD', 'HH:MM'] theo giờ quán. */
const vnParts = (iso) => {
  const t = new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString();
  return [t.slice(0, 10), t.slice(11, 16)];
};

/** Duyệt báo quên chấm công: giờ nhân viên ghi, sửa được trước khi duyệt. */
async function approveMissedDialog(p) {
  const [d0, in0] = vnParts(p.clockIn);
  const [, out0] = vnParts(p.clockOut);
  const date = el('input', { class: 'input', type: 'date', id: 'mpa-date', value: d0 });
  const tin = el('input', { class: 'input', type: 'time', id: 'mpa-in', value: in0 });
  const tout = el('input', { class: 'input', type: 'time', id: 'mpa-out', value: out0 });
  const note = el('input', { class: 'input', id: 'mpa-note', maxlength: 200, placeholder: 'Không bắt buộc — ví dụ: trưởng ca xác nhận có mặt' });
  const msg = el('div');
  await modal({
    title: `Duyệt báo quên — ${p.user.fullName}`,
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small' }, `Lý do nhân viên ghi: "${p.note}"`),
      el('label', { for: 'mpa-date' }, 'Ngày'),
      date,
      el(
        'div',
        { class: 'time-pair' },
        el('div', { class: 'stack' }, el('label', { for: 'mpa-in' }, 'Giờ vào'), tin),
        el('div', { class: 'stack' }, el('label', { for: 'mpa-out' }, 'Giờ ra'), tout),
      ),
      el('label', { for: 'mpa-note' }, 'Ghi chú cho nhân viên'),
      note,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Duyệt — thêm chấm công',
        class: 'btn-primary',
        onClick: async () => {
          if (!date.value || !tin.value || !tout.value) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập ngày, giờ vào và giờ ra'));
            return false;
          }
          const clockIn = new Date(`${date.value}T${tin.value}:00+07:00`);
          let clockOut = new Date(`${date.value}T${tout.value}:00+07:00`);
          if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 86400e3); // ca qua đêm
          try {
            await staffApi(`/api/admin/missed-punches/${p.requestId}/approve`, {
              method: 'POST',
              body: { clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString(), note: note.value.trim() || null },
            });
            toast('Đã duyệt — đã thêm lần chấm công', 'success');
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

function pendingCard() {
  const d = state.data;
  if (!d.pending.length) return null;
  const decide = (attId, decision, label) =>
    run(() => staffApi(`/api/admin/attendance/${attId}/decision`, { method: 'POST', body: { decision, note: label } }), 'Đã ghi quyết định');
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, `Việc chờ xử lý (${d.pending.length})`),
    el('p', { class: 'small muted' }, 'Mỗi quyết định ghi tên bạn và lưu vào nhật ký thao tác. Nhân viên thấy quyết định ở trang Giờ công của họ.'),
    el(
      'ul',
      { class: 'pending-list' },
      d.pending.map((p) => {
        const rec = p.clockIn ? p : null;
        const dispute = p.code === 'EMPLOYEE_DISPUTE' ? state.disputes.find((x) => x.attId === p.attId && !x.resolvedAt) : null;
        return el(
          'li',
          {},
          el(
            'div',
            {},
            el('strong', {}, p.user.fullName),
            rec ? ` · ${dateOnly(rec.clockIn)} ${time(rec.clockIn)}–${rec.clockOut ? time(rec.clockOut) : '…'}` : null,
          ),
          el('div', { class: 'small' }, p.label, dispute ? `: "${dispute.note}"` : null, p.code === 'MISSED_PUNCH' ? `: "${p.note}"` : null),
          el(
            'div',
            { class: 'row wrap' },
            ...(DECISIONS[p.code] ?? []).map(([dec, label]) =>
              el('button', { class: 'btn btn-sm', type: 'button', onclick: () => decide(p.attId, dec, label) }, label),
            ),
            p.code === 'EMPLOYEE_DISPUTE' && dispute
              ? el(
                  'button',
                  {
                    class: 'btn btn-sm',
                    type: 'button',
                    onclick: async () => {
                      const resolution = await reasonDialog('Xử lý báo sai', 'Ghi cách xử lý (ví dụ: đã sửa giờ ra thành 14:05) — nhân viên thấy dòng này.', {
                        okLabel: 'Xong',
                      });
                      if (resolution)
                        run(
                          () => staffApi(`/api/admin/attendance-disputes/${dispute.disputeId}/resolve`, { method: 'POST', body: { resolution } }),
                          'Đã xử lý',
                        );
                    },
                  },
                  'Đã xử lý',
                )
              : null,
            p.code === 'NO_PROFILE'
              ? el('button', { class: 'btn btn-sm', type: 'button', onclick: () => profileDialog(p.user.userId) }, 'Nhập hồ sơ lương')
              : null,
            ...(p.code === 'MISSED_PUNCH'
              ? [
                  el('button', { class: 'btn btn-sm', type: 'button', onclick: () => approveMissedDialog(p) }, 'Duyệt…'),
                  el(
                    'button',
                    {
                      class: 'btn btn-sm',
                      type: 'button',
                      onclick: async () => {
                        const reason = await reasonDialog('Không duyệt báo quên', 'Ghi lý do — nhân viên thấy dòng này ở trang Giờ công.', {
                          okLabel: 'Không duyệt',
                        });
                        if (reason)
                          run(() => staffApi(`/api/admin/missed-punches/${p.requestId}/reject`, { method: 'POST', body: { reason } }), 'Đã ghi không duyệt');
                      },
                    },
                    'Không duyệt',
                  ),
                ]
              : []),
            ['OPEN', 'AUTO_CLOSED', 'EMPLOYEE_DISPUTE'].includes(p.code) ? el('a', { class: 'btn btn-sm', href: '/admin/staff' }, 'Sửa giờ ở Nhân sự') : null,
          ),
        );
      }),
    ),
  );
}

// ---------- Bảng lương ----------
function linesCard() {
  const d = state.data;
  const locked = d.status === 'LOCKED';
  if (!d.lines.length)
    return el('section', { class: 'card' }, el('h2', {}, 'Bảng lương'), el('p', { class: 'muted' }, 'Chưa có ai có hồ sơ lương hoặc chấm công trong tháng.'));
  const cols = ['Người', 'Giờ', 'Lương', 'Ca tối', 'Ngày lễ', 'Chuyên cần', 'Cộng / trừ', 'Tạm ứng', 'Thực nhận', ''];
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, locked ? 'Bảng lương đã chốt' : 'Bảng lương tạm tính'),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'table pay-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            cols.map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          d.lines.map((l) =>
            el(
              'tr',
              {},
              el('td', {}, l.fullName, l.lateCount || l.absentCount ? el('div', { class: 'small muted' }, `Trễ ${l.lateCount} · vắng ${l.absentCount}`) : null),
              el('td', {}, hours(l.minutes)),
              el('td', {}, money(l.basePay)),
              el('td', {}, money(l.nightPay)),
              el('td', {}, money(l.holidayPay)),
              el('td', {}, money(l.attendanceBonus)),
              el('td', {}, money(l.adjustments)),
              el('td', {}, l.advances ? `−${money(l.advances)}` : money(0)),
              el('td', {}, el('strong', {}, money(l.netPay))),
              el(
                'td',
                { class: 'row wrap' },
                el('button', { class: 'btn btn-sm', type: 'button', onclick: () => payslip(l) }, 'Phiếu'),
                locked
                  ? l.paidAt
                    ? el('span', { class: 'badge ok' }, `Đã trả ${l.paidMethod === 'TRANSFER' ? 'CK' : 'TM'}`)
                    : el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => payDialog(l) }, 'Trả lương')
                  : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function payslip(l) {
  const rows = [
    ['Giờ được tính lương', hours(l.minutes)],
    ['Lương', money(l.basePay)],
    [`Phụ cấp ca tối (${hours(l.nightMinutes)})`, money(l.nightPay)],
    [`Thêm ngày lễ (${hours(l.holidayMinutes)})`, money(l.holidayPay)],
    [`Thưởng chuyên cần (trễ ${l.lateCount}, vắng ${l.absentCount})`, money(l.attendanceBonus)],
    ['Thưởng / khấu trừ khác', money(l.adjustments)],
    ['Đã tạm ứng', `−${money(l.advances)}`],
  ];
  const adj = l.detail?.adjustments ?? [];
  modal({
    title: `Phiếu lương ${monthLabel(state.month)} — ${l.fullName}`,
    body: el(
      'div',
      { class: 'payslip stack' },
      el(
        'dl',
        { class: 'kv' },
        ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]),
        el('dt', {}, el('strong', {}, 'Thực nhận')),
        el('dd', {}, el('strong', {}, money(l.netPay))),
      ),
      adj.length
        ? el(
            'ul',
            { class: 'small plain-list' },
            adj.map((a) => el('li', {}, `${money(a.amount)} — ${a.reason}`)),
          )
        : null,
      el('p', { class: 'small muted' }, 'Chưa gồm bảo hiểm, thuế thu nhập cá nhân (do kế toán tính).'),
    ),
    actions: [
      { label: 'Đóng', value: null },
      {
        label: 'In phiếu',
        class: 'btn-primary',
        onClick: () => {
          document.body.classList.add('print-payslip');
          window.print();
          document.body.classList.remove('print-payslip');
          return false;
        },
      },
    ],
  });
}

async function payDialog(l) {
  let qr = null;
  let problem = null;
  try {
    qr = await staffApi(`/api/admin/payroll/${state.month}/lines/${l.userId}/qr`);
  } catch (err) {
    problem = errorMessage(err);
  }
  const mark = (method) =>
    run(() => staffApi(`/api/admin/payroll/${state.month}/lines/${l.userId}/paid`, { method: 'POST', body: { method } }), 'Đã ghi trả lương');
  modal({
    title: `Trả lương — ${l.fullName}: ${money(l.netPay)}`,
    body: qr
      ? el(
          'div',
          { class: 'stack pay-qr' },
          el('img', { src: qr.qr, alt: `Mã VietQR chuyển ${money(qr.amount)} cho ${qr.accountName ?? l.fullName}`, width: 240, height: 240 }),
          el('p', {}, `${qr.bankName} · ${qr.bankAccount}`),
          el('p', {}, `Nội dung: ${qr.content}`),
          el(
            'div',
            { class: 'alert warning' },
            'Quét bằng app ngân hàng của quán. Trước khi bấm chuyển, kiểm tên chủ tài khoản app hiện ra phải là: ',
            el('strong', {}, qr.accountName || l.fullName),
          ),
        )
      : el(
          'div',
          { class: 'stack' },
          el('div', { class: 'alert warning' }, problem),
          el('p', { class: 'small' }, 'Có thể trả tiền mặt, hoặc nhập số tài khoản trong hồ sơ lương.'),
        ),
    actions: [
      { label: 'Hủy', value: null },
      { label: 'Đã trả tiền mặt', onClick: () => mark('CASH') },
      ...(qr ? [{ label: 'Đã chuyển khoản', class: 'btn-primary', onClick: () => mark('TRANSFER') }] : []),
    ],
  });
}

// ---------- Cộng / trừ, thưởng chung ----------
function adjustCard() {
  const d = state.data;
  const locked = d.status === 'LOCKED';
  const who = el(
    'select',
    { class: 'input', id: 'adj-user', 'aria-label': 'Người' },
    el('option', { value: '' }, 'Chọn người…'),
    state.users.map((u) => el('option', { value: u.userId }, u.fullName)),
  );
  const kind = el(
    'select',
    { class: 'input', id: 'adj-kind', 'aria-label': 'Loại' },
    el('option', { value: '1' }, 'Thưởng (+)'),
    el('option', { value: '-1' }, 'Khấu trừ (−)'),
  );
  const amount = el('input', { class: 'input', id: 'adj-amount', type: 'number', min: 1000, step: 1000, placeholder: 'Số tiền', 'aria-label': 'Số tiền' });
  const reason = el('input', { class: 'input', id: 'adj-reason', maxlength: 200, placeholder: 'Lý do', 'aria-label': 'Lý do' });
  const shiftNo = el('input', { class: 'input', id: 'team-shift', type: 'number', min: 1, placeholder: 'Số ca', 'aria-label': 'Số ca thu ngân' });
  const teamAmount = el('input', {
    class: 'input',
    id: 'team-amount',
    type: 'number',
    min: 1000,
    step: 1000,
    placeholder: 'Tổng tiền',
    'aria-label': 'Tổng tiền thưởng chung',
  });
  const teamReason = el('input', { class: 'input', id: 'team-reason', maxlength: 150, placeholder: 'Ví dụ: tip ca tối', 'aria-label': 'Lý do thưởng chung' });
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, 'Thưởng / khấu trừ'),
    d.adjustments.length
      ? el(
          'ul',
          { class: 'plain-list' },
          d.adjustments.map((a) =>
            el(
              'li',
              { class: 'row between wrap' },
              `${a.fullName}: ${a.amount > 0 ? '+' : ''}${money(a.amount)} — ${a.reason}`,
              locked
                ? null
                : el(
                    'button',
                    {
                      class: 'btn btn-sm',
                      type: 'button',
                      onclick: () => run(() => staffApi(`/api/admin/payroll/adjustments/${a.adjId}`, { method: 'DELETE' }), 'Đã xóa'),
                    },
                    'Xóa',
                  ),
            ),
          ),
        )
      : el('p', { class: 'muted small' }, 'Chưa có khoản nào.'),
    locked
      ? null
      : [
          el(
            'div',
            { class: 'inline-form' },
            who,
            kind,
            amount,
            reason,
            el(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () => {
                  if (!who.value || !(Number(amount.value) > 0)) return toast('Chọn người và nhập số tiền', 'warning');
                  run(
                    () =>
                      staffApi(`/api/admin/payroll/${state.month}/adjustments`, {
                        method: 'POST',
                        body: { userId: Number(who.value), amount: Number(kind.value) * Math.round(Number(amount.value)), reason: reason.value.trim() },
                      }),
                    'Đã thêm',
                  );
                },
              },
              'Thêm',
            ),
          ),
          el('h3', {}, 'Chia thưởng chung / tip theo ca'),
          el('p', { class: 'small muted' }, 'Chia theo số phút được tính lương của từng người trong ca thu ngân (số ca xem ở trang Ca & hoàn tiền).'),
          el(
            'div',
            { class: 'inline-form' },
            shiftNo,
            teamAmount,
            teamReason,
            el(
              'button',
              {
                class: 'btn',
                type: 'button',
                onclick: () =>
                  run(async () => {
                    const r = await staffApi('/api/admin/payroll/team-bonus', {
                      method: 'POST',
                      body: { shiftId: Number(shiftNo.value), amount: Math.round(Number(teamAmount.value)), reason: teamReason.value.trim() },
                    });
                    toast(`Đã chia: ${r.shares.map((s) => `${s.fullName} ${money(s.share)}`).join(', ')}`, 'success', 7000);
                  }),
              },
              'Chia',
            ),
          ),
        ],
  );
}

// ---------- Hồ sơ lương ----------
function profileDialog(userId) {
  const user = state.users.find((u) => u.userId === userId);
  const p = state.profiles.find((x) => x.userId === userId) ?? {
    payType: 'HOURLY',
    hourlyRate: 0,
    monthlySalary: 0,
    nightAllowance: 0,
    nightStart: '18:00',
    holidayMultiplier: 3,
    attendanceBonus: 0,
  };
  const field = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id }, label), input);
  const num = (id, value, attrs = {}) => el('input', { class: 'input', id, type: 'number', min: 0, step: 1000, value, ...attrs });
  const type = el(
    'select',
    { class: 'input', id: 'pf-type' },
    el('option', { value: 'HOURLY', selected: p.payType === 'HOURLY' }, 'Theo giờ'),
    el('option', { value: 'MONTHLY', selected: p.payType === 'MONTHLY' }, 'Theo tháng'),
  );
  const hourly = num('pf-hourly', p.hourlyRate);
  const monthly = num('pf-monthly', p.monthlySalary);
  const night = num('pf-night', p.nightAllowance);
  const nightStart = el('input', { class: 'input', id: 'pf-night-start', type: 'time', value: p.nightStart });
  const holiday = num('pf-holiday', p.holidayMultiplier, { step: 0.5, min: 1, max: 5 });
  const bonus = num('pf-bonus', p.attendanceBonus);
  const bank = el(
    'select',
    { class: 'input', id: 'pf-bank' },
    el('option', { value: '' }, 'Chưa có'),
    state.banks.map((b) => el('option', { value: b.bin, selected: b.bin === p.bankBin }, b.name)),
  );
  const account = el('input', { class: 'input', id: 'pf-account', value: p.bankAccount ?? '', maxlength: 19, inputmode: 'numeric' });
  const accName = el('input', { class: 'input', id: 'pf-account-name', value: p.bankAccountName ?? '', maxlength: 100, placeholder: 'Tên in trên tài khoản' });
  const msg = el('div');
  const sync = () => {
    hourly.closest('.field').hidden = type.value !== 'HOURLY';
    monthly.closest('.field').hidden = type.value !== 'MONTHLY';
  };
  const box = el(
    'div',
    { class: 'form-grid' },
    field('pf-type', 'Cách trả', type),
    field('pf-hourly', 'Lương mỗi giờ', hourly),
    field('pf-monthly', 'Lương tháng', monthly),
    field('pf-night', 'Phụ cấp ca tối mỗi giờ', night),
    field('pf-night-start', 'Ca tối tính từ', nightStart),
    field('pf-holiday', 'Hệ số ngày lễ (hỏi kế toán)', holiday),
    field('pf-bonus', 'Thưởng chuyên cần / tháng', bonus),
    field('pf-bank', 'Ngân hàng', bank),
    field('pf-account', 'Số tài khoản', account),
    field('pf-account-name', 'Tên chủ tài khoản', accName),
    el('div', { class: 'field span-all' }, msg),
  );
  type.addEventListener('change', sync);
  modal({
    title: `Hồ sơ lương — ${user?.fullName ?? ''}`,
    body: box,
    actions: [
      { label: 'Hủy', value: null },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async () => {
          try {
            await staffApi(`/api/admin/pay-profiles/${userId}`, {
              method: 'PUT',
              body: {
                payType: type.value,
                hourlyRate: Number(hourly.value) || 0,
                monthlySalary: Number(monthly.value) || 0,
                nightAllowance: Number(night.value) || 0,
                nightStart: nightStart.value || '18:00',
                holidayMultiplier: Number(holiday.value) || 3,
                attendanceBonus: Number(bonus.value) || 0,
                bankBin: bank.value || null,
                bankAccount: account.value.trim() || null,
                bankAccountName: accName.value.trim() || null,
              },
            });
            toast('Đã lưu hồ sơ lương', 'success');
            load();
            return true;
          } catch (err) {
            clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
            return false;
          }
        },
      },
    ],
  });
  sync();
}

function profilesCard() {
  const staff = state.users.filter((u) => u.role !== 'ADMIN' || state.profiles.some((p) => p.userId === u.userId));
  const bankOf = (bin) => state.banks.find((b) => b.bin === bin)?.name ?? '';
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, 'Hồ sơ lương'),
    el(
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
            ['Người', 'Cách trả', 'Mức', 'Ca tối', 'Tài khoản', ''].map((h) => el('th', {}, h)),
          ),
        ),
        el(
          'tbody',
          {},
          staff.map((u) => {
            const p = state.profiles.find((x) => x.userId === u.userId);
            return el(
              'tr',
              {},
              el('td', {}, u.fullName),
              el('td', {}, p ? (p.payType === 'HOURLY' ? 'Theo giờ' : 'Theo tháng') : el('span', { class: 'muted' }, 'Chưa có')),
              el('td', {}, p ? (p.payType === 'HOURLY' ? `${money(p.hourlyRate)}/giờ` : `${money(p.monthlySalary)}/tháng`) : ''),
              el('td', {}, p?.nightAllowance ? `+${money(p.nightAllowance)}/giờ từ ${p.nightStart}` : ''),
              el('td', {}, p?.bankAccount ? `${bankOf(p.bankBin)} · ${p.bankAccount}` : ''),
              el('td', {}, el('button', { class: 'btn btn-sm', type: 'button', onclick: () => profileDialog(u.userId) }, p ? 'Sửa' : 'Nhập')),
            );
          }),
        ),
      ),
    ),
  );
}

// ---------- Ngày lễ ----------
async function holidaysCard() {
  const year = state.month.slice(0, 4);
  const list = await staffApi(`/api/admin/holidays?year=${year}`).catch(() => []);
  const date = el('input', { class: 'input', id: 'hol-date', type: 'date', 'aria-label': 'Ngày lễ' });
  const name = el('input', { class: 'input', id: 'hol-name', maxlength: 100, placeholder: 'Tên ngày lễ', 'aria-label': 'Tên ngày lễ' });
  return el(
    'section',
    { class: 'card' },
    el('h2', {}, `Ngày lễ năm ${year}`),
    el('p', { class: 'small muted' }, 'Giờ làm vào ngày lễ được nhân hệ số trong hồ sơ lương. Tết âm lịch đổi ngày mỗi năm — nhập lại hằng năm.'),
    list.length
      ? el(
          'ul',
          { class: 'plain-list' },
          list.map((h) =>
            el(
              'li',
              { class: 'row between' },
              `${dateOnly(`${h.date}T12:00:00Z`)} — ${h.name}`,
              el(
                'button',
                { class: 'btn btn-sm', type: 'button', onclick: () => run(() => staffApi(`/api/admin/holidays/${h.date}`, { method: 'DELETE' }), 'Đã xóa') },
                'Xóa',
              ),
            ),
          ),
        )
      : el('p', { class: 'muted small' }, 'Chưa nhập ngày lễ nào.'),
    el(
      'div',
      { class: 'inline-form' },
      date,
      name,
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            if (!date.value || !name.value.trim()) return toast('Chọn ngày và nhập tên', 'warning');
            run(() => staffApi(`/api/admin/holidays/${date.value}`, { method: 'PUT', body: { name: name.value.trim() } }), 'Đã thêm ngày lễ');
          },
        },
        'Thêm',
      ),
    ),
  );
}

async function render() {
  const d = state.data;
  clear(
    body,
    head(),
    pendingCard(),
    linesCard(),
    adjustCard(),
    profilesCard(),
    await holidaysCard(),
    d.run?.reopenedAt
      ? el('p', { class: 'small muted' }, `Mở lại lần gần nhất: ${dateTime(d.run.reopenedAt)} bởi ${d.run.reopenedBy} — ${d.run.reopenReason}`)
      : null,
  );
}

load();
