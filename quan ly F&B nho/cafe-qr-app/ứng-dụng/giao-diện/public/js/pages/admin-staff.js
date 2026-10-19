// S-37 Nhân sự (FEATURE-035, ADR-006 D-25): chấm công (sửa / thêm tay, bắt buộc lý do), lịch làm theo tuần (kéo thả ca sang ô khác,
// cảnh báo đi muộn > 15 phút / vắng), năng suất theo người (tiền thu, đơn hoàn tất, giờ làm).
import { staffApi } from '../api.js';
import { mountAdminShell } from '../admin-shell.js';
import { attendanceDialog, attendanceTable, hoursText, ROLE_LABEL } from '../attendance.js';
import { $, clear, confirmDialog, el, errorMessage, modal, money, time, toast, todayVn } from '../ui.js';

await mountAdminShell('staff');

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const state = { tab: 'attendance', from: addDays(todayVn(), -6), to: todayVn(), userId: '', week: mondayOf(todayVn()), users: [] };
const body = el('div');
const tabs = el(
  'div',
  { class: 'tabs', role: 'tablist' },
  [
    ['attendance', 'Chấm công'],
    ['roster', 'Lịch làm tuần'],
    ['productivity', 'Năng suất'],
  ].map(([key, label]) =>
    el(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': String(state.tab === key),
        onclick: (e) => {
          state.tab = key;
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          load();
        },
      },
      label,
    ),
  ),
);
clear($('#content'), tabs, body);

async function load() {
  clear(body, el('p', { class: 'muted' }, 'Đang tải…'));
  try {
    state.users = (await staffApi('/api/admin/users')).filter((u) => u.isActive);
    if (state.tab === 'roster') await renderRoster();
    else if (state.tab === 'productivity') await renderProductivity();
    else await renderAttendance();
  } catch (err) {
    clear(body, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function rangeFilters(extra = []) {
  const date = (key, label) => {
    const input = el('input', { type: 'date', class: 'input', value: state[key], max: todayVn(), 'aria-label': label });
    input.addEventListener('change', () => {
      state[key] = input.value;
      load();
    });
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  return el('div', { class: 'filters' }, date('from', 'Từ ngày'), date('to', 'Đến ngày'), extra);
}

// ---------- Chấm công ----------
async function renderAttendance() {
  const userSel = el(
    'select',
    { class: 'input', 'aria-label': 'Nhân viên' },
    el('option', { value: '' }, 'Tất cả'),
    state.users.map((u) => el('option', { value: u.userId, selected: String(u.userId) === String(state.userId) }, u.fullName)),
  );
  userSel.addEventListener('change', () => {
    state.userId = userSel.value;
    load();
  });
  const q = new URLSearchParams({ from: state.from, to: state.to, ...(state.userId ? { userId: state.userId } : {}) });
  const rows = await staffApi(`/api/attendance?${q}`);
  const perUser = new Map();
  for (const a of rows) {
    const cur = perUser.get(a.user.userId) ?? { user: a.user, minutes: 0, count: 0 };
    cur.minutes += a.minutes;
    cur.count += 1;
    perUser.set(a.user.userId, cur);
  }
  clear(
    body,
    rangeFilters([
      el('div', { class: 'field' }, el('label', {}, 'Nhân viên'), userSel),
      el(
        'button',
        { class: 'btn btn-primary', type: 'button', onclick: async () => (await attendanceDialog(null, { users: state.users })) && load() },
        '+ Thêm chấm công',
      ),
    ]),
    el(
      'div',
      { class: 'grid-2' },
      el(
        'div',
        { class: 'card' },
        el('h2', {}, 'Tổng giờ làm'),
        perUser.size
          ? el(
              'table',
              { class: 'table' },
              el(
                'tbody',
                {},
                [...perUser.values()]
                  .sort((a, b) => b.minutes - a.minutes)
                  .map((x) =>
                    el('tr', {}, el('td', {}, x.user.fullName), el('td', { class: 'num' }, `${x.count} lần`), el('td', { class: 'num' }, hoursText(x.minutes))),
                  ),
              ),
            )
          : el('p', { class: 'muted' }, 'Chưa có dữ liệu.'),
      ),
      el(
        'div',
        { class: 'card' },
        el('h2', {}, 'Các lần chấm công'),
        el(
          'p',
          { class: 'small muted' },
          'Tự động: đăng nhập = vào ca; đăng xuất / đóng ca / hết hạn đăng nhập = ra ca. Mọi lần sửa đều ghi nhật ký thao tác.',
        ),
        attendanceTable(rows, { editable: () => true, onChange: load, showDate: true }),
      ),
    ),
  );
}

// ---------- Lịch làm tuần (kéo thả) ----------
const STATUS = { LATE: ['Muộn', 'danger'], ABSENT: ['Vắng', 'danger'], ON_TIME: ['Đúng giờ', 'ok'], UPCOMING: ['', ''] };

async function renderRoster() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
  const rosters = await staffApi(`/api/admin/rosters?from=${days[0]}&to=${days[6]}`);
  const late = rosters.filter((r) => r.status === 'LATE' || r.status === 'ABSENT');
  const nav = el(
    'div',
    { class: 'filters' },
    el('button', { class: 'btn', type: 'button', onclick: () => goWeek(addDays(state.week, -7)) }, '← Tuần trước'),
    el('strong', { style: { alignSelf: 'center' } }, `Tuần ${fmt(days[0])} – ${fmt(days[6])}`),
    el('button', { class: 'btn', type: 'button', onclick: () => goWeek(addDays(state.week, 7)) }, 'Tuần sau →'),
    el('button', { class: 'btn', type: 'button', onclick: () => goWeek(mondayOf(todayVn())) }, 'Tuần này'),
    el('button', { class: 'btn', type: 'button', onclick: copyLastWeek }, 'Chép lịch tuần trước'),
  );
  const cell = (user, date) => {
    const td = el(
      'td',
      { class: `roster-cell ${date === todayVn() ? 'today' : ''}`, dataset: { userId: user.userId, date } },
      rosters.filter((r) => r.user.userId === user.userId && r.workDate === date).map(chip),
      el(
        'button',
        {
          class: 'roster-add',
          type: 'button',
          title: 'Thêm ca',
          'aria-label': `Thêm ca ${user.fullName} ${date}`,
          onclick: () => editRoster(null, { user, date }),
        },
        '+',
      ),
    );
    td.addEventListener('dragover', (e) => {
      e.preventDefault();
      td.classList.add('drop');
    });
    td.addEventListener('dragleave', () => td.classList.remove('drop'));
    td.addEventListener('drop', async (e) => {
      e.preventDefault();
      td.classList.remove('drop');
      const r = rosters.find((x) => String(x.rosterId) === e.dataTransfer.getData('text/plain'));
      if (!r || (r.user.userId === user.userId && r.workDate === date)) return;
      try {
        await staffApi(`/api/admin/rosters/${r.rosterId}`, {
          method: 'PUT',
          body: { userId: user.userId, workDate: date, startTime: r.startTime, endTime: r.endTime, note: r.note },
        });
        toast(`Đã chuyển ca ${r.startTime}–${r.endTime} sang ${user.fullName} · ${fmt(date)}`, 'success');
        load();
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    });
    return td;
  };
  clear(
    body,
    nav,
    late.length
      ? el(
          'div',
          { class: 'alert warning' },
          `Cảnh báo: ${late.map((r) => `${r.user.fullName} ${fmt(r.workDate)} ${r.status === 'ABSENT' ? 'chưa chấm công' : `muộn ${r.lateMinutes} phút`}`).join(' · ')}`,
        )
      : null,
    el('p', { class: 'small muted' }, 'Kéo một ca sang ô khác để đổi người / ngày. Bấm vào ca để sửa hoặc xóa; bấm + để thêm ca.'),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        { class: 'table roster' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', {}, 'Nhân viên'),
            days.map((d, i) => el('th', { class: d === todayVn() ? 'today' : '' }, `${DOW[i]} ${fmt(d)}`)),
          ),
        ),
        el(
          'tbody',
          {},
          state.users.map((u) =>
            el(
              'tr',
              {},
              el('td', {}, u.fullName, el('div', { class: 'small muted' }, ROLE_LABEL[u.role])),
              days.map((d) => cell(u, d)),
            ),
          ),
        ),
      ),
    ),
  );
}

const fmt = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
function goWeek(week) {
  state.week = week;
  load();
}

function chip(r) {
  const [label, cls] = STATUS[r.status];
  const c = el(
    'button',
    {
      type: 'button',
      class: `roster-chip ${cls}`,
      draggable: 'true',
      title: r.firstClockIn ? `Vào lúc ${time(r.firstClockIn)}` : r.note || '',
      onclick: () => editRoster(r),
    },
    `${r.startTime}–${r.endTime}`,
    label ? el('span', { class: `badge ${cls}` }, r.status === 'LATE' ? `+${r.lateMinutes}′` : label) : null,
  );
  c.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(r.rosterId));
    e.dataTransfer.effectAllowed = 'move';
  });
  return c;
}

function editRoster(r, { user, date } = {}) {
  const userSel = el(
    'select',
    { class: 'input', 'aria-label': 'Nhân viên' },
    state.users.map((u) => el('option', { value: u.userId, selected: u.userId === (r?.user.userId ?? user?.userId) }, u.fullName)),
  );
  const day = el('input', { class: 'input', type: 'date', value: r?.workDate ?? date, 'aria-label': 'Ngày' });
  const start = el('input', { class: 'input', type: 'time', value: r?.startTime ?? '07:00', 'aria-label': 'Giờ bắt đầu' });
  const end = el('input', { class: 'input', type: 'time', value: r?.endTime ?? '15:00', 'aria-label': 'Giờ kết thúc' });
  const note = el('input', { class: 'input', maxlength: 100, value: r?.note ?? '', placeholder: 'Ghi chú (ví dụ: ca sáng, pha chế)' });
  const msg = el('div');
  modal({
    title: r ? `Ca ${r.user.fullName} · ${fmt(r.workDate)}` : 'Thêm ca làm',
    body: el(
      'div',
      { class: 'stack' },
      el('label', {}, 'Nhân viên'),
      userSel,
      el('label', {}, 'Ngày'),
      day,
      el('div', { class: 'row' }, el('div', {}, el('label', {}, 'Bắt đầu'), start), el('div', {}, el('label', {}, 'Kết thúc'), end)),
      el('p', { class: 'small muted' }, 'Giờ kết thúc nhỏ hơn giờ bắt đầu = ca qua nửa đêm.'),
      note,
      r?.firstClockIn ? el('p', { class: 'small' }, `Chấm công vào: ${time(r.firstClockIn)}${r.lateMinutes ? ` (muộn ${r.lateMinutes} phút)` : ''}`) : null,
      msg,
    ),
    actions: [
      r
        ? {
            label: 'Xóa ca',
            class: 'btn-danger',
            onClick: async (close) => {
              if (
                !(await confirmDialog('Xóa ca này?', `${r.user.fullName} · ${fmt(r.workDate)} ${r.startTime}–${r.endTime}`, { okLabel: 'Xóa', danger: true }))
              )
                return false;
              try {
                await staffApi(`/api/admin/rosters/${r.rosterId}`, { method: 'DELETE' });
                close();
                load();
              } catch (err) {
                clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
              }
              return false;
            },
          }
        : { label: 'Hủy' },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async (close) => {
          try {
            await staffApi(r ? `/api/admin/rosters/${r.rosterId}` : '/api/admin/rosters', {
              method: r ? 'PUT' : 'POST',
              body: { userId: Number(userSel.value), workDate: day.value, startTime: start.value, endTime: end.value, note: note.value.trim() || null },
            });
            close();
            load();
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  });
}

async function copyLastWeek() {
  try {
    const r = await staffApi('/api/admin/rosters/copy-week', { method: 'POST', body: { fromWeek: addDays(state.week, -7), toWeek: state.week } });
    toast(r.created ? `Đã chép ${r.created} ca từ tuần trước` : 'Tuần này đã có đủ các ca của tuần trước', 'success');
    load();
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ---------- Năng suất ----------
async function renderProductivity() {
  const r = await staffApi(`/api/admin/reports/productivity?from=${state.from}&to=${state.to}`);
  clear(
    body,
    rangeFilters(),
    el(
      'p',
      { class: 'small muted' },
      'Tiền thu = Σ số phải thu các lượt người đó thu; đơn hoàn tất = đơn người đó bấm hoàn tất; giờ làm theo chấm công trong kỳ.',
    ),
    r.rows.length === 0
      ? el('div', { class: 'empty card' }, 'Chưa có dữ liệu trong kỳ.')
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
                ['Nhân viên', 'Vai trò', 'Giờ làm', 'Lượt thu', 'Tiền thu', 'Đơn hoàn tất', 'Tiền thu / giờ'].map((h, i) =>
                  el('th', { class: i > 1 ? 'num' : '' }, h),
                ),
              ),
            ),
            el(
              'tbody',
              {},
              r.rows.map((x) =>
                el(
                  'tr',
                  {},
                  el('td', {}, x.user.fullName),
                  el('td', {}, ROLE_LABEL[x.user.role] ?? x.user.role),
                  el('td', { class: 'num' }, hoursText(x.minutes)),
                  el('td', { class: 'num' }, x.payments),
                  el('td', { class: 'num' }, money(x.amount)),
                  el('td', { class: 'num' }, x.orders),
                  el('td', { class: 'num' }, x.amountPerHour === null ? '—' : money(x.amountPerHour)),
                ),
              ),
            ),
          ),
        ),
  );
}

await load();
