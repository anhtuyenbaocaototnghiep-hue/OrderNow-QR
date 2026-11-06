// F-072 (ADR-030 D-125): bàn phím PIN dùng chung — chấm công ở màn chung, "Đổi người", xác nhận thao tác tiền.
// Số đổi chỗ mỗi lần mở (người đứng cạnh khó nhớ PIN theo vị trí tay bấm); gõ bằng bàn phím máy cũng được.
import { clear, el, errorMessage, modal } from './ui.js';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Mở bàn phím PIN. submit(pin) chạy khi bấm Xác nhận: trả giá trị → đóng và trả giá trị đó;
 * ném lỗi có code trong `retryCodes` (mặc định PIN sai) → báo lỗi, xóa ô, nhập lại; lỗi khác → đóng và ném tiếp.
 * Bấm Hủy → null. `onForgot` (ADR-031 D-135): có thì hiện "Quên PIN?" — bấm → đóng bàn phím (null) rồi gọi onForgot().
 */
export function pinPad({ title, hint = '', submit, retryCodes = ['PIN_INVALID', 'PIN_WEAK'], confirmLabel = 'Xác nhận', onForgot = null }) {
  let pin = '';
  let busy = false;
  let failure = null;
  let forgot = false;
  const dots = el('div', { class: 'pin-dots', role: 'status', 'aria-live': 'polite', 'aria-label': 'Chưa nhập số nào' });
  const msg = el('div', { class: 'pin-msg', role: 'alert' });
  const paint = () => {
    clear(dots, ...Array.from({ length: 6 }, (_, i) => el('span', { class: `pin-dot ${i < pin.length ? 'on' : ''} ${i >= 4 ? 'opt' : ''}` })));
    dots.setAttribute('aria-label', pin.length ? `Đã nhập ${pin.length} số` : 'Chưa nhập số nào');
  };
  const press = (d) => {
    if (busy || pin.length >= 6) return;
    pin += d;
    clear(msg);
    paint();
  };
  const back = () => {
    pin = pin.slice(0, -1);
    paint();
  };
  const go = async (close) => {
    if (busy) return;
    if (pin.length < 4) {
      clear(msg, 'Nhập 4 đến 6 chữ số');
      return;
    }
    busy = true;
    ok.disabled = true;
    try {
      const value = await submit(pin);
      close(value ?? true);
    } catch (err) {
      pin = '';
      paint();
      if (retryCodes.includes(err?.code)) clear(msg, errorMessage(err));
      else {
        failure = err;
        close(null);
      }
    } finally {
      busy = false;
      ok.disabled = false;
    }
  };
  const keys = shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  const grid = el(
    'div',
    { class: 'pin-grid' },
    ...keys.slice(0, 9).map((d) => el('button', { type: 'button', class: 'btn pin-key', onclick: () => press(d) }, d)),
    el('button', { type: 'button', class: 'btn pin-key pin-fn', 'aria-label': 'Xóa số cuối', onclick: back }, '⌫'),
    el('button', { type: 'button', class: 'btn pin-key', onclick: () => press(keys[9]) }, keys[9]),
    el(
      'button',
      {
        type: 'button',
        class: 'btn pin-key pin-fn',
        onclick: () => {
          pin = '';
          clear(msg);
          paint();
        },
      },
      'Xóa',
    ),
  );
  const ok = el('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => go(dialog.close) }, confirmLabel);
  const forgotBtn = onForgot
    ? el(
        'button',
        {
          type: 'button',
          class: 'link-btn small pin-forgot',
          onclick: () => {
            forgot = true;
            dialog.close(null);
          },
        },
        'Quên PIN? Đặt lại bằng mật khẩu đăng nhập',
      )
    : null;
  paint();
  const dialog = modal({
    title,
    body: el('div', { class: 'pin-pad' }, hint ? el('p', { class: 'muted small' }, hint) : null, dots, msg, grid, ok, forgotBtn),
    actions: [{ label: 'Hủy', value: null }],
  });
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') back();
    else if (e.key === 'Enter') go(dialog.close);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  return dialog.result.then((value) => {
    document.removeEventListener('keydown', onKey);
    if (failure) throw failure;
    if (forgot) onForgot();
    return value;
  });
}
