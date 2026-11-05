// F-072 (ADR-030): ở máy quầy — hỏi PIN khi thao tác tiền, hộp "Chấm công" (màn chung), "Đổi người", "Đặt PIN".
import { setPinPrompter, staffApi } from './api.js';
import { saveStaffSession } from './auth-store.js';
import { current } from './auth.js';
import { pinPad } from './pin-pad.js';
import { clear, el, errorMessage, modal, time, toast } from './ui.js';

const ROLE = { STAFF: 'Nhân viên', MANAGER: 'Trưởng ca' };

/** Thao tác tiền bị 403 PIN_REQUIRED → hỏi PIN người đang đứng máy rồi gửi lại. */
export function registerPinPrompter() {
  setPinPrompter((message, attempt) =>
    pinPad({ title: `Nhập PIN của ${current.user?.fullName ?? 'bạn'}`, hint: message, submit: attempt, retryCodes: ['PIN_INVALID'] }),
  );
}

function personTile(p, { onPick, status }) {
  return el(
    'button',
    {
      type: 'button',
      class: 'person-tile',
      disabled: !p.hasPin,
      'aria-label': `${p.fullName}, ${status}`,
      onclick: () => onPick(p),
    },
    el('strong', {}, p.fullName),
    el('span', { class: 'small muted' }, ROLE[p.role] ?? ''),
    el('span', { class: `small ${p.workingSince ? 'pos-val' : 'muted'}` }, status),
    p.roster?.length ? el('span', { class: 'small muted' }, `Lịch: ${p.roster.join(', ')}`) : null,
  );
}

/** Hộp "Chấm công": chạm tên → nhập PIN → Vào ca / Ra ca. */
export async function kioskDialog() {
  const list = el('div', { class: 'person-grid' }, el('p', { class: 'muted' }, 'Đang tải…'));
  const load = async () => {
    try {
      const { people } = await staffApi('/api/attendance/board');
      clear(
        list,
        ...(people.length
          ? people.map((p) =>
              personTile(p, {
                status: !p.hasPin ? 'Chưa đặt PIN' : p.workingSince ? `Đang làm từ ${time(p.workingSince)}` : 'Chưa vào ca',
                onPick: (who) => punch(who, load),
              }),
            )
          : [el('p', { class: 'muted' }, 'Chưa có nhân viên nào.')]),
      );
    } catch (err) {
      clear(list, el('div', { class: 'alert danger' }, errorMessage(err)));
    }
  };
  load();
  await modal({
    title: 'Chấm công',
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small muted' }, 'Chạm vào tên mình, nhập PIN riêng. Người chưa đặt PIN: đăng nhập bằng mật khẩu một lần để đặt.'),
      list,
    ),
    actions: [{ label: 'Xong', value: null }],
  }).result;
}

async function punch(p, reload) {
  const action = p.workingSince ? 'OUT' : 'IN';
  try {
    const att = await pinPad({
      title: `${action === 'IN' ? 'Vào ca' : 'Ra ca'} — ${p.fullName}`,
      hint: action === 'IN' ? 'Lương tính từ giờ bắt đầu ca theo lịch.' : `Đang làm từ ${time(p.workingSince)}.`,
      confirmLabel: action === 'IN' ? 'Vào ca' : 'Ra ca',
      submit: (pin) => staffApi('/api/attendance/punch', { method: 'POST', body: { userId: p.userId, pin, action } }),
    });
    if (att) toast(`${p.fullName} ${action === 'IN' ? `vào ca lúc ${time(att.clockIn)}` : `ra ca lúc ${time(att.clockOut)}`}`, 'success');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
  reload();
}

/** "Đổi người": người sắp đứng máy chạm tên + PIN → phiên mới đứng tên người đó. */
export async function switchUserDialog() {
  const list = el('div', { class: 'person-grid' }, el('p', { class: 'muted' }, 'Đang tải…'));
  const dialog = modal({
    title: 'Đổi người đứng máy',
    body: el('div', { class: 'stack' }, el('p', { class: 'small muted' }, 'Từ lúc đổi, mọi việc thu tiền, hoàn tiền, giảm giá ghi tên người mới.'), list),
    actions: [{ label: 'Hủy', value: null }],
  });
  try {
    const { people } = await staffApi('/api/attendance/board');
    clear(
      list,
      ...people
        .filter((p) => p.userId !== current.user.userId)
        .map((p) =>
          personTile(p, {
            status: p.hasPin ? 'Chạm để đổi sang' : 'Chưa đặt PIN',
            onPick: async (who) => {
              try {
                const r = await pinPad({
                  title: `Đổi sang ${who.fullName}`,
                  confirmLabel: 'Đổi người',
                  submit: (pin) => staffApi('/api/auth/switch', { method: 'POST', body: { userId: who.userId, pin } }),
                });
                if (!r) return;
                saveStaffSession(r.accessToken, r.user);
                dialog.close(true);
                location.reload();
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
            },
          }),
        ),
    );
  } catch (err) {
    clear(list, el('div', { class: 'alert danger' }, errorMessage(err)));
  }
  return dialog.result;
}

/** Đặt / đổi PIN của chính mình — cần mật khẩu đăng nhập. */
export async function setPinDialog() {
  const pw = el('input', { class: 'input', type: 'password', id: 'pin-pw', autocomplete: 'current-password', maxlength: 100 });
  const pin1 = el('input', { class: 'input', type: 'password', id: 'pin-new', inputmode: 'numeric', autocomplete: 'off', maxlength: 6 });
  const pin2 = el('input', { class: 'input', type: 'password', id: 'pin-again', inputmode: 'numeric', autocomplete: 'off', maxlength: 6 });
  const msg = el('div');
  return modal({
    title: current.user?.hasPin ? 'Đổi PIN' : 'Đặt PIN',
    body: el(
      'div',
      { class: 'stack' },
      el('p', { class: 'small muted' }, 'PIN 4–6 chữ số, chỉ mình bạn biết: dùng để chấm công, đổi người và xác nhận thao tác tiền. Không dùng 1234, 0000…'),
      el('label', { for: 'pin-pw' }, 'Mật khẩu đăng nhập'),
      pw,
      el('label', { for: 'pin-new' }, 'PIN mới'),
      pin1,
      el('label', { for: 'pin-again' }, 'Nhập lại PIN'),
      pin2,
      msg,
    ),
    actions: [
      { label: 'Hủy', value: false },
      {
        label: 'Lưu PIN',
        class: 'btn-primary',
        onClick: async () => {
          if (pin1.value !== pin2.value) {
            clear(msg, el('div', { class: 'field-error' }, 'Hai lần nhập PIN không giống nhau'));
            return false;
          }
          try {
            await staffApi('/api/auth/pin', { method: 'POST', body: { password: pw.value, pin: pin1.value } });
            current.user.hasPin = true;
            document.getElementById('no-pin')?.remove();
            toast('Đã lưu PIN', 'success');
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
