// Khung trang quầy: kiểm đăng nhập, thanh trên (điều hướng, ca, nhận đơn QR, kết nối, âm thanh, đăng xuất).
// ADR-005: thu tiền cần ca đang mở (F-018) — banner "Chưa mở ca" + nút mở ca; công tắc nhận đơn QR (F-020).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, audioReady, clear, el, errorMessage, modal, money, moneyInput, moneyValue, playSound, time, toast, unlockAudio } from './ui.js';

export async function mountPosShell(active) {
  const user = await requireStaffPage();
  const { shop } = current;
  const conn = el('span', { class: 'conn offline', id: 'conn' }, 'Đang kết nối…');
  const soundBtn = el('button', { class: 'btn btn-sm', type: 'button', title: 'Trình duyệt chỉ phát âm thanh sau khi bạn bấm nút này' }, '🔇 Bật âm thanh');
  const shiftBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'shift-btn' }, 'Ca…');
  const storeBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'store-btn', title: 'Bật/tắt nhận đơn khách gọi qua QR' }, 'QR…');
  const refreshSound = () => {
    const on = audioReady();
    soundBtn.textContent = on ? '🔔 Âm thanh: bật' : '🔇 Bật âm thanh';
    soundBtn.classList.toggle('sound-on', on);
  };
  soundBtn.addEventListener('click', () => {
    unlockAudio();
    setTimeout(() => {
      refreshSound();
      if (playSound('ting')) toast('Đã bật âm thanh báo đơn mới', 'success');
    }, 50);
  });
  // Nhiều trình duyệt mở khóa âm thanh ở lần chạm đầu tiên
  document.addEventListener(
    'pointerdown',
    () => {
      unlockAudio();
      setTimeout(refreshSound, 50);
    },
    { once: true },
  );

  const nav = [
    ['orders', '/pos', 'Đơn hàng'],
    ['tables', '/pos/table-order', 'Gọi món tại bàn'],
    ['takeaway', '/pos/takeaway', 'Bán mang đi'],
    ['stock', '/pos/stock', 'Kho & sơ chế'],
    ['shift', '/pos/shift', 'Ca & hoàn tiền'],
  ];
  if (user.role === 'MANAGER') nav.push(['today', '/admin/today', 'Hôm nay']); // F-043 bản rút gọn
  if (user.role === 'ADMIN') nav.push(['admin', '/admin', 'Quản lý']);

  const header = el(
    'header',
    { class: 'pos-top' },
    el('div', { class: 'brand' }, '☕ ', shop?.name || 'Quầy'),
    el(
      'nav',
      { class: 'pos-nav', 'aria-label': 'Điều hướng quầy' },
      nav.map(([key, href, label]) => el('a', { href, class: key === active ? 'active' : '' }, label)),
    ),
    el(
      'div',
      { class: 'pos-tools' },
      shiftBtn,
      storeBtn,
      conn,
      soundBtn,
      el(
        'span',
        { class: 'small' },
        user.fullName,
        user.role === 'MANAGER' ? el('span', { class: 'badge ok', style: { marginLeft: '.35rem' } }, 'Trưởng ca') : null,
      ),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, 'Đăng xuất'),
    ),
  );
  const noShift = el(
    'div',
    { class: 'banner no-shift', id: 'no-shift', hidden: true },
    'Chưa mở ca — chưa thu tiền được. ',
    el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openShiftDialog() }, 'Mở ca'),
  );
  document.body.prepend(header, noShift);
  if (new URLSearchParams(location.search).get('denied') === 'admin') toast('Chức năng quản lý chỉ dành cho tài khoản Quản lý', 'warning');

  const listeners = new Set();
  const shell = {
    user,
    shop,
    shift: null,
    store: null,
    setOnline(online) {
      conn.classList.toggle('offline', !online);
      conn.textContent = online ? 'Đã kết nối' : 'Mất kết nối';
      $('#offline-banner')?.toggleAttribute('hidden', online);
    },
    /** Trang đăng ký nhận thông báo khi ca thay đổi (bật/tắt nút thu tiền). */
    onShiftChange(cb) {
      listeners.add(cb);
    },
    setShift(shift) {
      shell.shift = shift ?? null;
      renderShift();
      for (const cb of listeners) cb(shell.shift);
    },
    setStore(store) {
      shell.store = store;
      renderStore();
    },
    /** Gắn các sự kiện realtime của khung (ca, nhận đơn) vào socket của trang. */
    attach(socket) {
      socket?.on('shift.opened', (p) => shell.setShift(p.shift));
      socket?.on('shift.closed', () => shell.setShift(null));
      socket?.on('store.status_changed', (p) => shell.setStore(p));
      // F-038: voucher giới thiệu vừa được tặng sau lượt thu đầu tiên của khách mới
      socket?.on('member.vouchers_issued', (p) =>
        toast(`Đã tặng ${p.vouchers.length} voucher giới thiệu: ${p.vouchers.map((v) => v.code).join(', ')}`, 'success', 8000),
      );
    },
    reloadShift: loadShift,
    openShiftDialog,
  };

  function renderShift() {
    const s = shell.shift;
    shiftBtn.classList.toggle('btn-danger', !s);
    shiftBtn.textContent = s ? `Ca #${s.shiftId} · từ ${time(s.openedAt)}` : '⚠ Chưa mở ca';
    shiftBtn.onclick = s ? () => (location.href = '/pos/shift') : () => openShiftDialog();
    noShift.hidden = Boolean(s) || active === 'shift';
  }

  function renderStore() {
    const on = shell.store?.acceptingOrders !== false;
    storeBtn.textContent = on ? 'QR: đang nhận đơn' : 'QR: tạm ngưng';
    storeBtn.classList.toggle('btn-danger', !on);
  }

  storeBtn.addEventListener('click', async () => {
    const on = shell.store?.acceptingOrders !== false;
    const ok = await modal({
      title: on ? 'Tạm ngưng nhận đơn qua QR?' : 'Mở lại nhận đơn qua QR?',
      body: el(
        'p',
        {},
        on
          ? 'Khách quét QR vẫn xem được thực đơn nhưng không gửi đơn được (quầy vẫn bán mang đi). Dùng khi quán quá tải / sắp đóng cửa.'
          : 'Khách lại gửi đơn qua QR bình thường.',
      ),
      actions: [
        { label: 'Hủy', value: false },
        { label: on ? 'Tạm ngưng' : 'Mở lại', class: on ? 'btn-danger' : 'btn-primary', value: true },
      ],
    }).result;
    if (ok !== true) return;
    try {
      shell.setStore(await staffApi('/api/store', { method: 'PUT', body: { acceptingOrders: !on } }));
      toast(on ? 'Đã tạm ngưng nhận đơn QR' : 'Đã mở lại nhận đơn QR', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  });

  async function openShiftDialog() {
    const cash = moneyInput({ id: 'opening-cash', 'aria-label': 'Tiền đầu ca' });
    const msg = el('div');
    const ok = await modal({
      title: 'Mở ca',
      body: el('div', { class: 'stack' }, el('label', { for: 'opening-cash' }, 'Tiền mặt đầu ca trong két (tiền lẻ để thối)'), cash, msg),
      actions: [
        { label: 'Hủy', value: false },
        {
          label: 'Mở ca',
          class: 'btn-primary',
          onClick: async (close) => {
            const v = moneyValue(cash);
            if (v === null) {
              clear(msg, el('div', { class: 'field-error' }, 'Nhập số tiền đầu ca (0 nếu không có)'));
              return false;
            }
            try {
              const r = await staffApi('/api/shifts/open', { method: 'POST', body: { openingCash: v } });
              shell.setShift(r.shift);
              toast(`Đã mở ca #${r.shift.shiftId} · đầu ca ${money(v)}`, 'success');
              close(true);
            } catch (err) {
              clear(msg, el('div', { class: 'field-error' }, errorMessage(err)));
              if (err.code === 'SHIFT_ALREADY_OPEN') loadShift();
            }
            return false;
          },
        },
      ],
    }).result;
    return ok === true;
  }

  async function loadShift() {
    try {
      const [{ shift }, store] = await Promise.all([staffApi('/api/shifts/current'), staffApi('/api/store')]);
      shell.setStore(store);
      shell.setShift(shift);
    } catch {
      /* lần kết nối lại sau sẽ tải lại */
    }
  }

  renderShift();
  renderStore();
  await loadShift();
  return shell;
}
