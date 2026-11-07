// Khung trang quầy: kiểm đăng nhập, thanh trên (điều hướng, ca, nhận đơn QR, kết nối, âm thanh, đăng xuất).
// ADR-005: thu tiền cần ca đang mở (F-018); ADR-017 (F-055): tiếp nhận / xử lý đơn cũng cần ca — banner "Chưa mở ca" + nút mở ca; công tắc nhận đơn QR (F-020).
// ADR-031 D-136: dải nhắc chấm công (chế độ màn chung) — tải lại mỗi phút và sau khi đóng hộp Chấm công.
// F-075 (ADR-033 D-151): dải "Nên mời khách hôm nay" — món dùng nguyên liệu sắp hết hạn (tải lại mỗi 10 phút, ẩn được).
import { staffApi } from './api.js';
import { current, logout, requireStaffPage } from './auth.js';
import { $, audioReady, clear, el, errorMessage, modal, money, moneyInput, moneyValue, playSound, time, toast, unlockAudio } from './ui.js';
import { brandMark, icon } from './icons.js';
import { canOpenPosPage, hasPosition, isProbation, positionsText, ROLE_LABEL } from './roles.js';
import { kioskDialog, registerPinPrompter, setPinDialog, switchUserDialog } from './staff-pin.js';

export async function mountPosShell(active) {
  const user = await requireStaffPage();
  // F-078: trang không thuộc vị trí của nhân viên → về Đơn hàng (máy chủ vẫn chặn từng việc)
  if (!canOpenPosPage(user, active)) {
    location.replace('/pos?denied=position');
    return new Promise(() => {});
  }
  const canPay = hasPosition(user, 'CASHIER');
  const { shop } = current;
  registerPinPrompter(); // F-072: thao tác tiền cần PIN → hỏi PIN rồi gửi lại
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
    // F-061 (ADR-021 D-79): "Kho & sơ chế" theo nhóm Kho hàng (ẩn mục, trang vẫn mở được bằng đường dẫn)
    ...(current.modules.includes('inventory') ? [['stock', '/pos/stock', 'Kho & sơ chế', 'package']] : []),
    ['shift', '/pos/shift', 'Ca & hoàn tiền', 'wallet'],
    ['me', '/pos/me', 'Giờ công', 'timer'], // F-072 / F-073: giờ công, lương tạm tính, phiếu lương của chính mình
  ];
  const ownNav = nav.filter(([key]) => canOpenPosPage(user, key)); // F-078: mục theo vị trí
  nav.length = 0;
  nav.push(...ownNav);
  if (user.role === 'MANAGER') nav.push(['today', '/admin/today', 'Hôm nay', 'chart-column']); // F-043 bản rút gọn
  if (user.role === 'STORE_MGR') nav.push(['admin', '/admin/today', 'Quản lý', 'settings']); // F-077: trang Quản lý phần vận hành
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
        el(
          'span',
          { class: 'user-name' },
          user.fullName,
          ['MANAGER', 'STORE_MGR'].includes(user.role)
            ? el('span', { class: `badge ${user.role === 'MANAGER' ? 'ok' : 'preparing'}` }, ROLE_LABEL[user.role])
            : null,
          isProbation(user) ? el('span', { class: 'badge pending', title: 'Giảm giá tay, chi quỹ, sửa / xóa món cần trưởng ca duyệt' }, 'Thử việc') : null,
        ),
        // F-072: màn chấm công chung (PIN riêng) + đổi người đứng máy
        current.attendance.mode === 'KIOSK'
          ? el('button', { class: 'btn btn-sm', type: 'button', id: 'kiosk-btn', onclick: () => kioskDialog().then(loadReminders) }, icon('clock'), 'Chấm công')
          : null,
        user.role !== 'ADMIN'
          ? el('button', { class: 'btn btn-sm', type: 'button', id: 'switch-btn', onclick: () => switchUserDialog() }, icon('users'), 'Đổi người')
          : null,
        // F-061 (ADR-021 D-80): xem lại hướng dẫn 5 bước — ở trang Đơn hàng mở ngay, trang khác chuyển về Đơn hàng
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            id: 'tour-btn',
            title: 'Hướng dẫn 5 bước dùng màn quầy',
            onclick: () => (shell.tourHandler ? shell.tourHandler() : (location.href = '/pos?tour=1')),
          },
          icon('circle-help'),
          'Hướng dẫn',
        ),
        el('button', { class: 'btn btn-sm', type: 'button', onclick: logout }, icon('log-out'), 'Đăng xuất'),
      ),
    ),
  );
  const noShift = el(
    'div',
    { class: 'banner no-shift', id: 'no-shift', role: 'status', hidden: true },
    icon('triangle-alert'),
    'Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được. ',
    canPay
      ? el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openShiftDialog() }, 'Mở ca')
      : el('strong', {}, 'Nhờ thu ngân mở ca.'), // F-078
  );
  // F-072: chưa đặt PIN (cần cho chấm công / thao tác tiền) → dải nhắc đặt PIN
  const noPin =
    user.role !== 'ADMIN' && !user.hasPin && (current.attendance.mode === 'KIOSK' || current.attendance.moneyPin)
      ? el(
          'div',
          { class: 'banner no-pin', id: 'no-pin', role: 'status' },
          icon('triangle-alert'),
          'Bạn chưa đặt PIN — cần để chấm công và xác nhận thao tác tiền. ',
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => setPinDialog() }, 'Đặt PIN'),
        )
      : null;
  // ADR-031 D-136: có lịch mà quá 10 phút chưa chấm vào / hết lịch 15 phút chưa chấm ra → dải nhắc (ẩn được tới khi danh sách đổi)
  const remind = el('div', { class: 'banner att-remind', id: 'att-remind', role: 'status', hidden: true });
  // Trang có vùng "Cần xử lý ngay" (màn Đơn hàng) thì dải chưa mở ca đứng đầu vùng đó
  const alerts = $('#pos-alerts');
  if (alerts) {
    document.body.prepend(header);
    alerts.prepend(noShift);
    if (noPin) alerts.prepend(noPin);
  } else document.body.prepend(header, ...(noPin ? [noPin] : []), noShift);
  noShift.after(remind);
  const pushBanner = el('div', { class: 'banner push-items', id: 'push-items', role: 'status', hidden: true });
  remind.after(pushBanner);
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
  if (new URLSearchParams(location.search).get('denied') === 'position')
    toast(`Trang đó không thuộc vị trí của bạn (${positionsText(user)}) — nhờ chủ quán đổi ở Tài khoản nếu cần`, 'warning', 6000);
  // F-063 (ADR-021 D-82): QR trên bàn in ở địa chỉ cũ → nhân viên biết vì sao khách quét lỗi, báo quản lý in lại
  staffApi('/api/qr-check')
    .then((q) => {
      if (!q.mismatch && !q.unreachable) return;
      const b = el(
        'div',
        { class: 'banner qr-wrong', id: 'qr-wrong', role: 'alert' },
        icon('triangle-alert'),
        q.unreachable
          ? ` Máy chủ đã đổi IP — QR trên bàn (${q.baseUrl}) không vào được. Báo quản lý sửa địa chỉ và in lại QR.`
          : ` QR trên bàn đang trỏ địa chỉ cũ (${q.printedBaseUrl}) — khách quét sẽ lỗi. Báo quản lý in lại QR.`,
      );
      if (alerts) alerts.prepend(b);
      else header.after(b);
    })
    .catch(() => {});

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
    /** F-061: trang Đơn hàng gắn hàm mở hướng dẫn (nút "Hướng dẫn"). */
    tourHandler: null,
  };

  function renderShift() {
    const s = shell.shift;
    shiftBtn.classList.toggle('btn-danger', !s);
    shiftBtn.replaceChildren(...(s ? [`Ca #${s.shiftId} · từ ${time(s.openedAt)}`] : [icon('triangle-alert'), 'Chưa mở ca']));
    // F-078: chỉ thu ngân (hoặc trưởng ca trở lên) vào trang Ca / mở ca
    shiftBtn.onclick = !canPay ? () => toast('Mở / đóng ca là việc của thu ngân', 'info') : s ? () => (location.href = '/pos/shift') : () => openShiftDialog();
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

  const REMIND_KEY = 'att-remind-hidden';
  const remindLine = (r) =>
    r.kind === 'NOT_IN'
      ? el('li', {}, el('strong', {}, r.fullName), ` có lịch ${r.rosterStart}–${r.rosterEnd} nhưng chưa chấm vào ca`)
      : el('li', {}, el('strong', {}, r.fullName), ` hết lịch lúc ${r.rosterEnd} nhưng chưa chấm ra (vào từ ${time(r.since)})`);
  async function loadReminders() {
    if (current.attendance.mode !== 'KIOSK' || document.visibilityState === 'hidden') return;
    let items;
    try {
      ({ items } = await staffApi('/api/attendance/reminders'));
    } catch {
      return; // lần sau tải lại
    }
    const sig = items.map((r) => `${r.kind}:${r.userId}`).join(',');
    let hiddenSig = null;
    try {
      hiddenSig = sessionStorage.getItem(REMIND_KEY);
    } catch {
      /* không có sessionStorage: luôn hiện */
    }
    if (!items.length || hiddenSig === sig) {
      remind.hidden = true;
      return;
    }
    clear(
      remind,
      icon('clock'),
      el('ul', { 'aria-label': 'Nhắc chấm công' }, items.map(remindLine)),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => kioskDialog().then(loadReminders) }, 'Mở Chấm công'),
        el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: () => {
              try {
                sessionStorage.setItem(REMIND_KEY, sig);
              } catch {
                /* bỏ qua */
              }
              remind.hidden = true;
            },
          },
          'Ẩn',
        ),
      ),
    );
    remind.hidden = false;
  }
  // F-075: món nên mời — ẩn theo "chữ ký" danh sách (danh sách đổi thì hiện lại)
  const PUSH_KEY = 'push-items-hidden';
  async function loadPushItems() {
    if (document.visibilityState === 'hidden') return;
    let pushItems;
    try {
      ({ pushItems } = await staffApi('/api/expiry/risk'));
    } catch {
      return;
    }
    const sig = pushItems.map((p) => p.menuItemId).join(',');
    let hiddenSig = null;
    try {
      hiddenSig = sessionStorage.getItem(PUSH_KEY);
    } catch {
      /* bỏ qua */
    }
    if (!pushItems.length || hiddenSig === sig) {
      pushBanner.hidden = true;
      return;
    }
    const causes = [...new Map(pushItems.flatMap((p) => p.because).map((b) => [b.ingredientId, b])).values()];
    clear(
      pushBanner,
      icon('utensils'),
      el(
        'div',
        { class: 'push-text' },
        el('strong', {}, 'Nên mời khách hôm nay: '),
        pushItems.map((p) => p.name).join(', '),
        el('div', { class: 'small' }, causes.map((c) => `${c.name} ${c.when}`).join(' · ')),
      ),
      el(
        'button',
        {
          class: 'btn btn-sm',
          type: 'button',
          onclick: () => {
            try {
              sessionStorage.setItem(PUSH_KEY, sig);
            } catch {
              /* bỏ qua */
            }
            pushBanner.hidden = true;
          },
        },
        'Ẩn',
      ),
    );
    pushBanner.hidden = false;
  }
  setInterval(loadPushItems, 10 * 60_000);
  loadPushItems();

  if (current.attendance.mode === 'KIOSK') {
    setInterval(loadReminders, 60_000);
    document.addEventListener('visibilitychange', loadReminders);
    loadReminders();
  }

  renderShift();
  renderStore();
  await loadShift();
  return shell;
}
