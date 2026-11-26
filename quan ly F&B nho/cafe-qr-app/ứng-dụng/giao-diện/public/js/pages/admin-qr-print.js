// Trang in lưới QR để dán lên bàn (FEATURE-010). F-059: có Wi-Fi cho khách trong Cài đặt → mỗi thẻ in thêm QR Wi-Fi (bước ①).
// F-068 (ADR-026 D-105): quà sinh nhật bật → mỗi thẻ in thêm dòng mời hội viên thêm ngày sinh.
// TASK-134: mỗi thẻ là MỘT ẢNH 1200 × 1800 (10 × 15 cm, 300 dpi) vẽ bằng canvas (table-card.js) — xem, "Tải ảnh" từng bàn / "Tải tất cả ảnh",
// In ra đúng cỡ 10 × 15 cm. Chữ trên thẻ có bản văn bản ẩn (trình đọc màn hình) trong <figcaption>.
import { staffApi, staffBlobUrl } from '../api.js';
import { mountAdminShell, refreshQrBanner } from '../admin-shell.js';
import { current } from '../auth.js';
import { $, clear, el, errorMessage } from '../ui.js';
import { icon } from '../icons.js';
import { CARD_H, CARD_W, drawTableCard, LAN_NOTE, LAN_NOTE_WIFI } from '../table-card.js';

await mountAdminShell('tables');

// F-063 (ADR-021 D-82): in QR → lưu địa chỉ máy chủ lúc in; sau này app chạy ở địa chỉ khác thì mọi trang báo "in lại QR".
// Bấm nút In và Ctrl+P (beforeprint) đều ghi — chặn ghi hai lần liền nhau.
let lastMark = 0;
async function markPrinted() {
  if (Date.now() - lastMark < 3000) return;
  lastMark = Date.now();
  try {
    await staffApi('/api/admin/qr-printed', { method: 'POST', body: {} });
    refreshQrBanner('tables');
  } catch {
    /* không ghi được thì chỉ mất cảnh báo — vẫn in */
  }
}
addEventListener('beforeprint', markPrinted);

const downloadAllBtn = el('button', { class: 'btn', type: 'button', disabled: true, onclick: downloadAll }, 'Tải tất cả ảnh');
clear(
  $('#head-actions'),
  el('a', { class: 'btn', href: '/admin/tables' }, '← Về danh sách bàn'),
  downloadAllBtn,
  el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onclick: () => {
        markPrinted();
        window.print();
      },
    },
    icon('printer'),
    'In',
  ),
);

/** TASK-134: tải lần lượt ảnh mọi thẻ (trình duyệt có thể hỏi "cho phép tải nhiều tệp" một lần). */
async function downloadAll() {
  for (const a of document.querySelectorAll('.qr-card a[download]')) {
    a.click();
    await new Promise((r) => setTimeout(r, 400));
  }
}

const loadImg = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không tải được ảnh'));
    img.src = src;
  });
const toBlobUrl = (canvas) => new Promise((resolve) => canvas.toBlob((b) => resolve(URL.createObjectURL(b)), 'image/png'));

/** Chữ Be Vietnam Pro (cả bộ tiếng Việt) phải tải xong trước khi vẽ lên canvas — không thì canvas dùng chữ thay thế. */
async function fontsReady() {
  const sample = 'Quét mã gọi món Bàn Thanh toán chuyển khoản Nhân viên Mật khẩu ① ② WIFI ĐT';
  await Promise.all(['400 28px', '600 30px', '700 34px', '800 70px'].map((f) => document.fonts.load(`${f} "Be Vietnam Pro"`, sample).catch(() => null)));
}

/** Bản chữ của thẻ (ẩn — cho trình đọc màn hình, giữ đủ nội dung in trên ảnh). */
function cardText(t, { settings, wifi, payLine, safeText, birthday, lanNote }) {
  return el(
    'figcaption',
    { class: 'sr-only' },
    el('div', { class: 'tname' }, t.name),
    wifi
      ? [
          el(
            'div',
            { class: 'qr-wifi' },
            el('div', { class: 'qr-step' }, '① Quét để vào Wi-Fi (mã có chữ WIFI ở giữa)'),
            el(
              'div',
              {},
              'Wi-Fi: ',
              el('strong', {}, settings.wifiSsid),
              settings.wifiPassword ? [' · Mật khẩu: ', el('strong', {}, settings.wifiPassword)] : ' · không mật khẩu',
            ),
          ),
          el('div', { class: 'qr-step' }, '② Quét để gọi món'),
        ]
      : null,
    el('div', {}, 'Quét mã để xem thực đơn & gọi món'),
    el('div', {}, payLine),
    // ADR-069 D-261: mã bàn không dùng để trả tiền (mã dán đè / trang lạ đòi chuyển tiền là giả) — trừ khi quán bật mã trên điện thoại khách
    safeText ? el('div', { class: 'qr-safe' }, safeText) : null,
    birthday ? el('div', { class: 'qr-bday' }, birthday) : null,
    settings.shopPhone ? el('div', { class: 'qr-phone' }, `ĐT: ${settings.shopPhone}`) : null, // ADR-070
    lanNote ? el('div', { class: 'qr-lan' }, wifi ? LAN_NOTE_WIFI : LAN_NOTE) : null, // TASK-139
  );
}

try {
  const [tables, settings] = await Promise.all([staffApi('/api/admin/tables'), staffApi('/api/admin/settings')]);
  const active = tables.filter((t) => t.isActive);
  const transferOn = Boolean(settings.transferEnabled && settings.bankBin && settings.bankNumber && settings.bankHolder);
  const safeText =
    transferOn && settings.guestTransferQr
      ? null
      : transferOn
        ? 'Mã này chỉ để gọi món, không dùng để trả tiền. Chuyển khoản theo mã QR trên bill nhân viên đưa.'
        : 'Mã này chỉ để gọi món, không dùng để trả tiền.';
  const payLine = 'Thanh toán tiền mặt hoặc chuyển khoản — bấm "Gọi thanh toán" khi xong';
  const birthday = settings.birthdayEnabled ? 'Hội viên: thêm ngày sinh trong Thẻ thành viên — quán tặng quà tuần sinh nhật' : null;
  // Một ảnh QR Wi-Fi dùng chung cho mọi thẻ; tải lỗi (vd. tên Wi-Fi vừa bị xóa ở máy khác) → vẫn in thẻ bàn, không có khối Wi-Fi (review G3)
  const wifiSrc = settings.wifiSsid ? await staffBlobUrl('/api/admin/wifi-qr.png').catch(() => null) : null;
  const wifiImg = wifiSrc ? await loadImg(wifiSrc).catch(() => null) : null;
  const wifiWarn =
    settings.wifiSsid && !wifiImg
      ? el('div', { class: 'alert warning no-print' }, 'Không tải được QR Wi-Fi — thẻ in ra không có Wi-Fi. Tải lại trang để thử lại.')
      : null;
  if (!active.length) {
    clear($('#content'), wifiWarn, el('div', { class: 'empty card' }, 'Không có bàn đang hoạt động.'));
  } else {
    const progress = el('p', { class: 'muted no-print', role: 'status' }, `Đang vẽ thẻ QR… 0/${active.length}`);
    const grid = el('div', { class: 'qr-grid' });
    clear(
      $('#content'),
      wifiWarn,
      el(
        'p',
        { class: 'small muted no-print' },
        'Mỗi thẻ là một ảnh 10 × 15 cm: bấm "Tải ảnh" để in ở tiệm ảnh, hoặc "In" để in bằng máy in (2 thẻ một tờ A4 ngang).',
      ),
      progress,
      grid,
    );
    // F-095: logo quán (Cài đặt) — tải lỗi thì thẻ chỉ có tên quán
    const logo = current.shop?.logoUrl ? await loadImg(current.shop.logoUrl).catch(() => null) : null;
    await fontsReady();
    let done = 0;
    for (const t of active) {
      // Lần lượt từng bàn — mỗi ảnh lớn, vẽ cùng lúc dễ tốn bộ nhớ ở máy quầy yếu
      const qr = await loadImg(await staffBlobUrl(`/api/admin/tables/${t.tableId}/qr.png`));
      const wifi = wifiImg ? { img: wifiImg, ssid: settings.wifiSsid, password: settings.wifiPassword } : null;
      // TASK-139: mã QR trỏ tới địa chỉ IP / localhost = app chạy trên máy trong quán → khách phải vào Wi-Fi quán mới gọi món được.
      // Sau này dùng tên miền (app trên mạng) thì 4G vẫn gọi được → không in dòng nhắc.
      const host = new URL(t.qrUrl, location.origin).hostname;
      const lanNote = host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
      const canvas = drawTableCard({
        shopName: current.shop?.name ?? settings.shopName ?? '',
        shopAddress: settings.shopAddress ?? '',
        shopPhone: settings.shopPhone ?? '', // ADR-070
        logo,
        tableName: t.name,
        qr,
        wifi,
        counterPickup: settings.serveMode === 'COUNTER',
        payLine,
        safeText,
        birthday,
        lanNote,
      });
      const url = await toBlobUrl(canvas);
      grid.append(
        el(
          'figure',
          // data-logo: logo quán (F-095) đã vẽ vào ảnh thẻ — để kiểm tra / gỡ lỗi
          { class: 'qr-card', dataset: logo ? { logo: current.shop.logoUrl } : null },
          el('img', { class: 'qr-card-img', src: url, alt: `Thẻ QR gọi món — ${t.name}`, width: CARD_W, height: CARD_H }),
          cardText(t, { settings, wifi, payLine, safeText, birthday, lanNote }),
          el('a', { class: 'btn btn-sm no-print', href: url, download: `the-qr-${t.code}.png` }, 'Tải ảnh'),
        ),
      );
      done += 1;
      progress.textContent = `Đang vẽ thẻ QR… ${done}/${active.length}`;
    }
    progress.remove();
    downloadAllBtn.disabled = false;
  }
} catch (err) {
  clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
}
