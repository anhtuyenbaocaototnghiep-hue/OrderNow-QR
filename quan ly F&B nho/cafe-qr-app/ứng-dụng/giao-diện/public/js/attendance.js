// Chấm công (FEATURE-035, ADR-006 D-25) — bảng + sửa tay (bắt buộc lý do) dùng ở màn Ca (trưởng ca: trong ngày) và trang Nhân sự (quản lý).
import { staffApi } from './api.js';
import { clear, dateTime, el, errorMessage, modal, time, toast } from './ui.js';

export const ROLE_LABEL = { STAFF: 'Nhân viên', MANAGER: 'Trưởng ca', ADMIN: 'Quản lý' };
const VN = 7 * 3600e3;
/** Date → 'YYYY-MM-DDTHH:MM' giờ VN cho <input type=datetime-local>. */
export const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() + VN).toISOString().slice(0, 16) : '');
/** 'YYYY-MM-DDTHH:MM' giờ VN → ISO có múi giờ. */
export const fromLocalInput = (s) => (s ? `${s}:00+07:00` : null);
export const hoursText = (minutes) => `${Math.floor(minutes / 60)} giờ ${String(minutes % 60).padStart(2, '0')} phút`;

/** Hộp thoại sửa (att) hoặc thêm tay (att = null, cần users). Trả true nếu đã lưu. */
export async function attendanceDialog(att, { users = [] } = {}) {
  const userSel = att
    ? null
    : el(
        'select',
        { class: 'input', id: 'att-user', 'aria-label': 'Nhân viên' },
        users.map((u) => el('option', { value: u.userId }, `${u.fullName} (${ROLE_LABEL[u.role] ?? u.role})`)),
      );
  const inEl = el('input', { class: 'input', type: 'datetime-local', id: 'att-in', value: toLocalInput(att?.clockIn ?? new Date()), 'aria-label': 'Giờ vào' });
  const outEl = el('input', { class: 'input', type: 'datetime-local', id: 'att-out', value: toLocalInput(att?.clockOut), 'aria-label': 'Giờ ra' });
  const reason = el('input', { class: 'input', id: 'att-reason', maxlength: 200, placeholder: 'Ví dụ: quên bấm ra ca, máy hỏng…', 'aria-label': 'Lý do sửa' });
  const msg = el('div');
  const ok = await modal({
    title: att ? `Sửa chấm công — ${att.user.fullName}` : 'Thêm chấm công',
    body: el(
      'div',
      { class: 'stack' },
      userSel ? [el('label', { for: 'att-user' }, 'Nhân viên'), userSel] : null,
      el('label', { for: 'att-in' }, 'Giờ vào'),
      inEl,
      el('label', { for: 'att-out' }, 'Giờ ra (để trống nếu đang làm)'),
      outEl,
      el('label', { for: 'att-reason' }, 'Lý do (bắt buộc — ghi vào nhật ký)'),
      reason,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Lưu',
        class: 'btn-primary',
        onClick: async (close) => {
          const body = { clockIn: fromLocalInput(inEl.value), clockOut: fromLocalInput(outEl.value), reason: reason.value.trim() };
          if (!body.clockIn) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập giờ vào'));
            return false;
          }
          if (!body.reason) {
            clear(msg, el('div', { class: 'field-error' }, 'Nhập lý do sửa chấm công'));
            return false;
          }
          try {
            if (att) await staffApi(`/api/attendance/${att.attId}`, { method: 'PUT', body });
            else await staffApi('/api/attendance', { method: 'POST', body: { ...body, userId: Number(userSel.value) } });
            toast('Đã lưu chấm công', 'success');
            close(true);
          } catch (err) {
            clear(msg, el('div', { class: 'alert danger' }, errorMessage(err)));
          }
          return false;
        },
      },
    ],
  }).result;
  return ok === true;
}

/** Bảng chấm công. opts: { editable(att) → bool, onChange, showDate } */
export function attendanceTable(rows, { editable = () => false, onChange, showDate = false } = {}) {
  if (!rows.length) return el('p', { class: 'muted' }, 'Chưa có ai chấm công.');
  return el(
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
          ['Nhân viên', 'Vào', 'Ra', 'Thời gian', 'Nguồn', ''].map((h) => el('th', {}, h)),
        ),
      ),
      el(
        'tbody',
        {},
        rows.map((a) =>
          el(
            'tr',
            {},
            el('td', {}, a.user.fullName, el('div', { class: 'small muted' }, ROLE_LABEL[a.user.role] ?? a.user.role)),
            el('td', {}, showDate ? dateTime(a.clockIn) : time(a.clockIn)),
            el('td', {}, a.clockOut ? (showDate ? dateTime(a.clockOut) : time(a.clockOut)) : el('span', { class: 'badge ok' }, 'Đang làm')),
            el('td', {}, hoursText(a.minutes)),
            el(
              'td',
              {},
              a.source === 'MANUAL' ? 'Thêm tay' : 'Đăng nhập',
              a.editedBy ? el('div', { class: 'small muted', title: a.editReason ?? '' }, `Sửa bởi ${a.editedBy.fullName}: ${a.editReason ?? ''}`) : null,
            ),
            el(
              'td',
              {},
              editable(a)
                ? el('button', { class: 'btn btn-sm', type: 'button', onclick: async () => (await attendanceDialog(a)) && onChange?.() }, 'Sửa')
                : null,
            ),
          ),
        ),
      ),
    ),
  );
}
