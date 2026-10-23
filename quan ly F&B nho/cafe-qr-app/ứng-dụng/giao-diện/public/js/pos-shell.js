// Khung trang quầy: kiểm đăng nhập, thanh trên (điều hướng, ca, nhận đơn QR, kết nối, âm thanh, đăng xuất).
// ADR-005: thu tiền cần ca đang mở (F-018); ADR-017 (F-055): tiếp nhận / xử lý đơn cũng cần ca — banner "Chưa mở ca" + nút mở ca; công tắc nhận đơn QR (F-020).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, audioReady, clear, el, errorMessage, modal, money, moneyInput, moneyValue, playSound, time, toast, unlockAudio } from './ui.js';
import { brandMark, icon } from './icons.js';

export async function mountPosShell(active) {
  const user = await requireStaffPage();
  const { shop } = current;
  // Chưa kết nối xong: trạng thái trung tính, không đỏ (đỏ chỉ khi mất kết nối thật — DEF-011)
  const conn = el('span', { class: 'conn connecting', id: 'conn' }, 'Đang kết nối…');
  const soundBtn = el(
    'button',
    { class: 'btn btn-sm', type: 'button', title: 'Trình duyệt chỉ phát âm thanh sau khi bạn bấm nút này' },
    icon('volume-x'),
    'Bật âm thanh',
  );
  const shiftBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'shift-btn' }, 'Ca…');
  const storeBtn = el('button', { class: 'btn btn-sm', type: 'button', id: 'store-btn', title: 'Bật/tắt nhận đơn khách gọi qua QR' }, 'QR…');
  const refreshSound = () => {
    const on = audioReady();
    soundBtn.replaceChildren(icon(on ? 'volume-2' : 'volume-x'), on ? 'Âm thanh: bật' : 'Bật âm thanh');
    soundBtn.classList.toggle('sound-on', on);
    fitHeader();
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
    ['orders', '/pos', 'Đơn hàng', 'ticket'],
    ['tables', '/pos/table-order', 'Gọi món tại bàn', 'utensils'],
    ['takeaway', '/pos/takeaway', 'Bán mang đi', 'shopping-bag'],
    ['stock', '/pos/stock', 'Kho & sơ chế', 'package'],
    ['shift', '/pos/shift', 'Ca & hoàn tiền', 'wallet'],
  ];
  if (user.role === 'MANAGER') nav.push(['today', '/admin/today', 'Hôm nay', 'chart-column']); // F-043 bản rút gọn
  if (user.role === 'ADMIN') nav.push(['admin', '/admin', 'Quản lý', 'settings']);

  // ADR-018 D-67: trái tên quán + điều hướng; phải cụm trạng thái (ca, QR, kết nối, âm thanh) rồi người dùng
  const header = el(
    'header',
    { class: 'pos-top' },
    el('div', { class: 'brand' }, brandMark(), shop?.name || 'Quầy'),
    el(
      'nav',
      { class: 'pos-nav', 'aria-label': 'Điều hướng quầy' },
      nav.map(([key, href, label, ic]) =>
        el('a', { href, class: key === active ? 'active' : '', 'aria-current': key === active ? 'page' : null }, icon(ic), label),
      ),
    ),
    el(
      'div',
      { class: 'pos-tools' },
      el('div', { class: 'pos-status', role: 'group', 'aria-label': 'Trạng thái quầy' }, shiftBtn, storeBtn, conn, soundBtn),
      el(
        'div',
        { class: 'pos-user' },
        el('span', { class: 'user-name' }, user.fullName, user.role === 'MANAGER' ? el('span', { class: 'badge ok' }, 'Trưởng ca') : null),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, icon('log-out'), 'Đăng xuất'),
      ),
    ),
  );
  const noShift = el(
    'div',
    { class: 'banner no-shift', id: 'no-shift', role: 'status', hidden: true },
    icon('triangle-alert'),
    'Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được. ',
    el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openShiftDialog() }, 'Mở ca'),
  );
  // Trang có vùng "Cần xử lý ngay" (màn Đơn hàng) thì dải chưa mở ca đứng đầu vùng đó
  const alerts = $('#pos-alerts');
  if (alerts) {
    document.body.prepend(header);
    alerts.prepend(noShift);
  } else document.body.prepend(header, noShift);
  // Thanh trên một hàng khi đủ chỗ; không thì đưa điều hướng xuống hàng hai (không để nút xuống dòng lộn xộn)
  const fitHeader = () => {
    header.classList.remove('stacked');
    header.classList.toggle('stacked', header.scrollWidth > header.clientWidth + 1);
  };
  let headerWidth = 0;
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width === headerWidth) return; // chỉ đo lại khi đổi bề ngang (đổi hàng làm đổi chiều cao)
    headerWidth = entry.contentRect.width;
    requestAnimationFrame(fitHeader); // đổi hàng ngoài lượt đo — tránh lỗi "ResizeObserver loop"
  }).observe(header);
  document.fonts?.ready.then(fitHeader); // phông web nạp xong làm chữ rộng ra
  if (new URLSearchParams(location.search).get('denied') === 'admin') toast('Chức năng quản lý chỉ dành cho tài khoản Quản lý', 'warning');

  const listeners = new Set();
  const shell = {
    user,
    shop,
    shift: null,
    store: null,
    setOnline(online) {
      conn.classList.remove('connecting');
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
    shiftBtn.replaceChildren(...(s ? [`Ca #${s.shiftId} · từ ${time(s.openedAt)}`] : [icon('triangle-alert'), 'Chưa mở ca']));
    shiftBtn.onclick = s ? () => (location.href = '/pos/shift') : () => openShiftDialog();
    noShift.hidden = Boolean(s) || active === 'shift';
    fitHeader();
  }

  function renderStore() {
    const on = shell.store?.acceptingOrders !== false;
    storeBtn.textContent = on ? 'QR: đang nhận đơn' : 'QR: tạm ngưng';
    storeBtn.classList.toggle('btn-danger', !on);
    fitHeader();
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
