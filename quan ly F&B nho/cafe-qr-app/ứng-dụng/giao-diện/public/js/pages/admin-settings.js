// S-33 Cài đặt quán (ADR-005): nhận đơn QR (F-020), ngưỡng giảm giá tay của nhân viên (D-14), làm tròn (D-7), ưu đãi đơn đầu (D-5).
// ADR-006: quyền trưởng ca (D-24) + ngưỡng duyệt chi quỹ (D-23). F-053: tên quán + địa chỉ in trên hóa đơn (BR-085).
// F-059: Wi-Fi cho khách in thành QR cạnh QR bàn (BR-092). F-060: cảnh báo bất thường qua email (ADR-020, BR-093…BR-095).
import { staffApi, staffUpload } from '../api.js';
import { current } from '../auth.js';
import { brandMark } from '../icons.js';
import { mountAdminShell, toggle } from '../admin-shell.js';
import { showBigQr } from '../transfer-qr.js';
import { $, clear, confirmDialog, dateTime, el, errorMessage, money, setBusy, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('settings');

// F-060: lỗi từng email trong danh sách (path "alertEmails.1" / "emails.0") hiện dưới ô danh sách
const fixPaths = (err) =>
  err?.details?.fields
    ? Object.assign(err, {
        details: {
          ...err.details,
          fields: err.details.fields.map((f) => ({ ...f, path: String(f.path).replace(/^(alertEmails|emails)(\.\d+)?$/, 'alertEmails') })),
        },
      })
    : err;

/** Trạng thái hộp thư gửi + hàng đợi (F-060) — không có mật khẩu. */
async function loadMailStatus(box) {
  try {
    const m = await staffApi('/api/admin/alerts/mail-status');
    const parts = [
      m.configured
        ? `Hộp thư gửi: ${m.from}${m.transport === 'json' ? ' (chế độ thử — không gửi thật)' : ''} ✔`
        : 'Chưa cấu hình hộp thư gửi — điền SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM trong file .env của máy chủ rồi khởi động lại app.',
    ];
    if (m.lastSent) parts.push(`Lần gửi gần nhất: ${dateTime(m.lastSent.at)}`);
    if (m.pending) parts.push(`Đang chờ gửi: ${m.pending}`);
    if (m.failed) parts.push(`Gửi lỗi: ${m.failed}`);
    if (m.lastError) parts.push(`Lỗi gần nhất: ${m.lastError.error}`);
    box.className = !m.configured || m.failed || m.lastError ? 'alert warning' : 'small muted';
    // Email FAILED (vd sai mật khẩu ứng dụng) → sửa .env, khởi động lại app rồi bấm gửi lại
    const retry = m.failed
      ? el(
          'button',
          {
            class: 'btn btn-sm',
            type: 'button',
            onclick: async (e) => {
              setBusy(e.currentTarget, true);
              try {
                const r = await staffApi('/api/admin/alerts/mail-retry', { method: 'POST', body: {} });
                toast(`Đã xếp lại ${r.requeued} email để gửi`, 'success');
              } catch (err) {
                toast(errorMessage(err), 'error');
              }
              loadMailStatus(box);
            },
          },
          `Gửi lại ${m.failed} email lỗi`,
        )
      : null;
    clear(box, el('span', {}, parts.join(' · ')), retry ? ' ' : null, retry);
  } catch (err) {
    box.className = 'alert warning';
    clear(box, `Không đọc được trạng thái hộp thư gửi: ${errorMessage(err)}`);
  }
}

// F-099: danh sách ngân hàng VietQR (cùng danh sách trả lương) — người không xem được thì để trống
let banks = [];
async function load() {
  try {
    const [s, b] = await Promise.all([staffApi('/api/admin/settings'), staffApi('/api/admin/pay-profiles').catch(() => ({ banks: [] }))]);
    banks = b.banks ?? [];
    render(s);
    // F-061: đến từ link "Hiện lại trong menu" → cuộn tới thẻ Giao diện quản lý (thẻ vẽ sau khi tải nên trình duyệt không tự cuộn)
    if (location.hash === '#giao-dien') $('#giao-dien')?.scrollIntoView({ block: 'center' });
  } catch (err) {
    clear($('#content'), el('div', { class: 'alert danger' }, errorMessage(err)));
  }
}

function render(s) {
  let accepting = s.acceptingOrders;
  // F-053: name trùng tên trường API → lỗi 400 hiện ngay dưới ô (showFieldErrors)
  const shopName = el('input', { class: 'input', name: 'shopName', maxlength: 100, required: true, autocomplete: 'off', value: s.shopName });
  const shopAddress = el('input', {
    class: 'input',
    name: 'shopAddress',
    maxlength: 200,
    autocomplete: 'off',
    placeholder: 'Ví dụ: 12 Lê Lợi, phường Bến Nghé — để trống nếu không in',
    value: s.shopAddress,
  });
  // F-059: Wi-Fi cho khách — in QR Wi-Fi cạnh QR bàn (BR-092). Mật khẩu hiện chữ: chủ quán cần đọc lại, và nó in trên thẻ bàn
  const wifiSsid = el('input', { class: 'input', name: 'wifiSsid', maxlength: 32, autocomplete: 'off', value: s.wifiSsid });
  // Mật khẩu WPA chỉ gồm ký tự không dấu — tắt bộ gõ tiếng Việt khi nhập (review G3)
  const wifiPassword = el('input', {
    class: 'input',
    name: 'wifiPassword',
    maxlength: 63,
    autocomplete: 'off',
    spellcheck: 'false',
    autocapitalize: 'off',
    pattern: '[\\x20-\\x7E]{8,63}',
    title: '8–63 ký tự không dấu (chữ, số, ký hiệu)',
    value: s.wifiPassword,
  });
  // F-060: người nhận đổi bất cứ lúc nào (hiệu lực ngay); hộp thư GỬI chỉ ở .env
  const alertEmails = el('input', {
    class: 'input',
    name: 'alertEmails',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'vd: chuquan@gmail.com, quanly@gmail.com',
    value: s.alertEmails.join(', '),
  });
  const parseEmails = () =>
    alertEmails.value
      .split(/[,;\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  const check = (checked) => el('input', { type: 'checkbox', checked });
  const alertImmediate = check(s.alertImmediate);
  const alertShiftReport = check(s.alertShiftReport);
  const alertDailyDigest = check(s.alertDailyDigest);
  const alertUseStats = check(s.alertUseStats);
  const timeIn = (name, value) => el('input', { class: 'input', type: 'time', name, value });
  const alertDigestTime = timeIn('alertDigestTime', s.alertDigestTime);
  const alertQuietStart = timeIn('alertQuietStart', s.alertQuietStart);
  const alertQuietEnd = timeIn('alertQuietEnd', s.alertQuietEnd);
  const numIn = (name, value, attrs) => el('input', { class: 'input', type: 'number', name, value, ...attrs });
  // Ô ngưỡng để trống → giữ giá trị cũ (Number('') = 0 sẽ âm thầm thành "ngưỡng 0" → ca nào lệch cũng báo)
  const numOrKeep = (input) => (input.value.trim() === '' ? undefined : Number(input.value));
  const alertCashDiffMax = numIn('alertCashDiffMax', s.alertCashDiffMax, { min: 0, step: 1000 });
  const alertTransferShareMax = numIn('alertTransferShareMax', s.alertTransferShareMax, { min: 1, max: 100 });
  const alertVoidsMax = numIn('alertVoidsMax', s.alertVoidsMax, { min: 0, max: 100 });
  const alertRefundsMax = numIn('alertRefundsMax', s.alertRefundsMax, { min: 0, max: 100 });
  const alertRefundBig = numIn('alertRefundBig', s.alertRefundBig, { min: 1000, step: 10000 });
  const alertManualDiscountMax = numIn('alertManualDiscountMax', s.alertManualDiscountMax, { min: 0, max: 100 });
  const alertCostRisePct = numIn('alertCostRisePct', s.alertCostRisePct, { min: 1, max: 100 }); // F-064
  const alertCostMarginDrop = numIn('alertCostMarginDrop', s.alertCostMarginDrop, { min: 1, max: 100 });
  const alertCostMarginMin = numIn('alertCostMarginMin', s.alertCostMarginMin, { min: 0, max: 100 });
  const mailStatus = el('div', { class: 'small muted', 'aria-live': 'polite' }, 'Đang kiểm hộp thư gửi…');
  loadMailStatus(mailStatus);
  const testEmail = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: async (e) => {
        const btn = e.currentTarget;
        setBusy(btn, true);
        try {
          const r = await staffApi('/api/admin/alerts/test-email', { method: 'POST', body: { emails: parseEmails() } });
          if (r.ok) toast(`Đã gửi email thử tới ${parseEmails().join(', ')}`, 'success');
          else toast(`Gửi thử không được: ${r.error}`, 'error', 8000);
        } catch (err) {
          showFieldErrors($('#content'), fixPaths(err));
          toast(errorMessage(err), 'error');
        } finally {
          setBusy(btn, false);
          loadMailStatus(mailStatus);
        }
      },
    },
    'Gửi email thử',
  );
  const closedMessage = el('input', { class: 'input', maxlength: 200, value: s.closedMessage });
  const maxPct = el('input', { class: 'input', type: 'number', min: 0, max: 100, value: s.staffMaxPercent });
  const maxAmt = el('input', { class: 'input', type: 'number', min: 0, step: 1000, value: s.staffMaxAmount });
  const round = el(
    'select',
    { class: 'input' },
    [1, 100, 500, 1000].map((v) => el('option', { value: v, selected: v === s.roundTo }, v === 1 ? 'Không làm tròn' : `Làm tròn xuống ${money(v)}`)),
  );
  const firstPct = el('input', { class: 'input', type: 'number', min: 0, max: 50, value: s.firstOrderPercent });
  const mgrPct = el('input', { class: 'input', type: 'number', min: 0, max: 100, value: s.managerMaxPercent });
  const mgrAmt = el('input', { class: 'input', type: 'number', min: 0, step: 1000, value: s.managerMaxAmount });
  const mgrCash = el('input', { class: 'input', type: 'number', min: 0, step: 10000, value: s.managerCashApproveMax });
  const cashThreshold = el('input', { class: 'input', type: 'number', min: 0, step: 10000, value: s.cashApproveThreshold });
  const sameShift = el('input', { type: 'checkbox', checked: s.managerRefundSameShiftOnly });
  const costMethod = el(
    'select',
    { class: 'input', 'aria-label': 'Cách tính giá vốn' },
    el('option', { value: 'AVG', selected: s.costMethod !== 'FIFO' }, 'Bình quân gia quyền'),
    el('option', { value: 'FIFO', selected: s.costMethod === 'FIFO' }, 'FIFO theo lô (nguyên liệu theo lô)'),
  );
  const reviewMin = el('input', { class: 'input', type: 'number', min: 1, max: 100, value: s.reviewMenuMinCount });
  const reviewDays = el('input', { class: 'input', type: 'number', min: 7, max: 365, value: s.reviewMenuDays });
  const safety = el('input', { class: 'input', type: 'number', min: 0, max: 200, value: s.forecastSafetyPercent, 'aria-label': 'Tồn an toàn (%)' });
  // F-061 (ADR-021 D-79): nhóm menu nâng cao — tắt hết = chế độ cơ bản (chỉ ẩn menu, không tắt chức năng)
  const MODULE_GROUPS = [
    ['inventory', 'Kho hàng', 'Nguyên liệu, Nhập kho & kiểm kê, Nhà cung cấp; mục "Kho & sơ chế" ở màn quầy'],
    ['customers', 'Khách hàng & khuyến mãi', 'Hội viên, Tích điểm & voucher, Khuyến mãi, Gợi ý & ghim, Đánh giá món'],
    ['finance', 'Sổ quỹ & nhân sự', 'Sổ quỹ, Nhân sự & chấm công'],
    ['analytics', 'Thu chi', 'Thu chi (lãi / lỗ, chi phí cố định)'], // trang Phân tích đã bỏ (ADR-052)
    ['advanced', 'Công cụ nâng cao', 'Lịch thực đơn, Nhật ký thao tác, Tra cứu API'],
  ];
  const moduleChecks = MODULE_GROUPS.map(([key]) => el('input', { type: 'checkbox', name: `module-${key}`, value: key, checked: s.uiModules.includes(key) }));
  // F-076 (ADR-034): quy trình 1 chạm ở màn Đơn hàng
  const oneTapCheck = el('input', { type: 'checkbox', name: 'oneTap', id: 'one-tap', checked: s.oneTap });
  // F-088 (ADR-049 D-214, D-217): màn quầy một màn hình; món tại bàn nhân viên mang ra / khách nhận tại quầy
  const singleScreenCheck = el('input', { type: 'checkbox', name: 'singleScreen', id: 'single-screen', checked: s.singleScreen });
  const serveMode = el(
    'select',
    { class: 'input', name: 'serveMode', id: 'serve-mode', style: { maxWidth: '360px' } },
    [
      ['TABLE', 'Nhân viên mang ra bàn (mặc định)'],
      ['COUNTER', 'Khách nhận tại quầy'],
    ].map(([v, label]) => el('option', { value: v, selected: v === s.serveMode }, label)),
  );
  // F-083 (ADR-041): màn gọi món của khách — "+" mở bảng chọn cho mọi món
  const sheetAllCheck = el('input', { type: 'checkbox', name: 'menuSheetAll', id: 'sheet-all', checked: s.menuSheetAll });
  // F-092 (ADR-054): màn chào khi khách quét QR
  const welcomeCheck = el('input', { type: 'checkbox', name: 'guestWelcome', id: 'guest-welcome', checked: s.guestWelcome });
  // F-094 (ADR-056): màn khách theo giờ (sáng / tối) và trang trí theo mùa
  const daypartCheck = el('input', { type: 'checkbox', name: 'guestDaypartTheme', id: 'guest-daypart', checked: s.guestDaypartTheme });
  const seasonCheck = el('input', { type: 'checkbox', name: 'guestSeasonDecor', id: 'guest-season', checked: s.guestSeasonDecor });
  // F-087 (ADR-048 D-212): tự đóng bàn khách quét QR nhưng không gọi món
  const idleClose = el(
    'select',
    { class: 'input', name: 'idleCloseMinutes', id: 'idle-close', style: { maxWidth: '320px' } },
    [
      [0, 'Tắt — không tự đóng'],
      [15, 'Sau 15 phút'],
      [30, 'Sau 30 phút (mặc định)'],
      [60, 'Sau 60 phút'],
    ].map(([v, label]) => el('option', { value: v, selected: v === s.idleCloseMinutes }, label)),
  );
  // F-095 (ADR-057): logo quán — chọn ảnh là lưu ngay (thân request là ảnh), "Bỏ logo" hỏi lại; chỉ chủ quán
  const logoBox = el('div', { class: 'logo-field' });
  const paintLogo = () => {
    const logoUrl = current.shop?.logoUrl ?? null;
    const input = el('input', { type: 'file', id: 'shop-logo', accept: 'image/png,image/jpeg,image/webp', hidden: true, 'aria-label': 'Ảnh logo quán' });
    const msg = el('div', { class: 'field-error', role: 'alert', hidden: true });
    const fail = (text) => {
      msg.textContent = text;
      msg.hidden = false;
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 1024 * 1024) return fail('Ảnh logo tối đa 1 MB — chọn ảnh nhỏ hơn');
      try {
        const r = await staffUpload('/api/admin/settings/logo', file);
        current.shop = { ...current.shop, logoUrl: r.logoUrl };
        paintLogo();
        toast('Đã cập nhật logo — màn khách và màn quầy hiện logo mới khi mở lại', 'success');
      } catch (err) {
        fail(errorMessage(err));
      }
    });
    const remove = async () => {
      if (
        !(await confirmDialog('Bỏ logo quán?', 'Các màn sẽ hiện biểu tượng ly cà phê như trước. Bạn có thể tải logo lại bất cứ lúc nào.', {
          okLabel: 'Bỏ logo',
          danger: true,
        }))
      )
        return;
      try {
        await staffApi('/api/admin/settings/logo', { method: 'DELETE' });
        current.shop = { ...current.shop, logoUrl: null };
        paintLogo();
        toast('Đã bỏ logo', 'success');
      } catch (err) {
        fail(errorMessage(err));
      }
    };
    clear(
      logoBox,
      el('span', { class: 'logo-preview' }, brandMark(current.shop)),
      el(
        'div',
        { class: 'logo-actions' },
        el(
          'div',
          { class: 'row' },
          el('button', { class: 'btn btn-sm', type: 'button', id: 'pick-logo', onclick: () => input.click() }, logoUrl ? 'Đổi ảnh…' : 'Chọn ảnh…'),
          logoUrl ? el('button', { class: 'btn btn-sm', type: 'button', id: 'remove-logo', onclick: remove }, 'Bỏ logo') : null,
        ),
        el('p', { class: 'small muted' }, 'Ảnh jpg, png hoặc webp, tối đa 1 MB — nên dùng ảnh vuông.'),
        input,
        msg,
      ),
    );
  };
  paintLogo();
  const card = (title, ...children) =>
    el('div', { class: 'card', style: { maxWidth: '720px', marginBottom: '1rem' } }, el('h2', { style: { fontSize: '1rem' } }, title), ...children);
  // F-099 (ADR-062 D-245): nhận chuyển khoản bằng VietQR — tiền vào thẳng tài khoản / thẻ của quán; đã trả do nhân viên xác nhận
  const transferCheck = el('input', { type: 'checkbox', name: 'transferEnabled', id: 'transfer-enabled', checked: s.transferEnabled });
  const bankBin = el(
    'select',
    { class: 'input', name: 'bankBin', id: 'bank-bin' },
    el('option', { value: '' }, 'Chọn ngân hàng…'),
    banks.map((b) => el('option', { value: b.bin, selected: b.bin === s.bankBin }, b.name)),
  );
  const bankKind = el(
    'select',
    { class: 'input', name: 'bankKind', id: 'bank-kind' },
    el('option', { value: 'ACCOUNT', selected: s.bankKind !== 'CARD' }, 'Số tài khoản'),
    el('option', { value: 'CARD', selected: s.bankKind === 'CARD' }, 'Số thẻ'),
  );
  const bankNumber = el('input', {
    class: 'input',
    name: 'bankNumber',
    id: 'bank-number',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: 19,
    pattern: '[0-9A-Za-z]{4,19}',
    title: '4–19 chữ / số, không khoảng trắng',
    value: s.bankNumber ?? '',
  });
  const bankHolder = el('input', {
    class: 'input',
    name: 'bankHolder',
    id: 'bank-holder',
    maxlength: 100,
    autocomplete: 'off',
    placeholder: 'Như app ngân hàng hiện, vd: NGUYEN VAN A',
    value: s.bankHolder ?? '',
  });
  const transferReady = s.transferEnabled && s.bankBin && s.bankNumber && s.bankHolder;
  clear(
    $('#content'),
    card(
      'Thông tin quán',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Tên quán'), shopName),
        el('div', { class: 'field' }, el('label', {}, 'Địa chỉ (in trên hóa đơn)'), shopAddress),
      ),
      el('div', { class: 'field' }, el('label', { for: 'shop-logo' }, 'Logo quán'), logoBox),
      el(
        'p',
        { class: 'small muted' },
        'Tên và logo hiện ở thanh quầy, thanh bên quản lý, màn chào và đầu trang menu khách, hóa đơn, phiếu đặt hàng và thẻ QR in. Màn đang mở ở máy khác đổi theo khi tải lại.',
      ),
    ),
    card(
      'Màn Đơn hàng ở quầy',
      el(
        'label',
        { class: 'check' },
        oneTapCheck,
        el('span', {}, el('strong', {}, 'Quy trình 1 chạm'), ' — gộp "Mới" và "Đang pha" thành một cột "Cần làm", mỗi đơn chỉ một nút "Xong"'),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Hợp với quán nhỏ 1–2 người pha: bấm Xong là nhận đơn, hoàn tất, trừ kho và báo khách "Món đã xong" cùng lúc. Quán đông nhiều người pha thì tắt để dùng 3 cột (Mới → Đang pha → Xong). Màn quầy đang mở đổi theo khi tải lại.',
      ),
      el(
        'label',
        { class: 'check' },
        singleScreenCheck,
        el('span', {}, el('strong', {}, 'Màn quầy một màn hình'), ' — bên trái hàng pha, bên phải bàn / bán mang đi / gọi món / ca trên cùng một màn hình'),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Hợp với quán chỉ có một màn hình cho hai người: người pha nhìn bên trái, người đứng quầy làm bên phải, hộp thoại của người này không che người kia. Tắt: Bán mang đi, Gọi món tại bàn, Ca là các trang riêng như trước.',
      ),
      el('div', { class: 'field' }, el('label', { for: 'serve-mode' }, 'Món tại bàn pha xong'), serveMode),
      el(
        'p',
        { class: 'small muted' },
        'Mang ra bàn: quầy có dải "Mang ra" và nút "Đã mang", điện thoại khách báo "nhân viên đang mang ra bàn". Nhận tại quầy: khách được mời ra quầy lấy như trước.',
      ),
    ),
    card(
      'Màn gọi món của khách',
      el(
        'label',
        { class: 'check' },
        welcomeCheck,
        el(
          'span',
          {},
          el('strong', {}, 'Màn chào khi khách quét QR'),
          ' — khách thấy quán, bàn đang ngồi, nút Gọi thanh toán / Gọi nhân viên / Đánh giá và nút lớn "Xem thực đơn – Gọi món" trước khi vào thực đơn',
        ),
      ),
      el('p', { class: 'small muted' }, 'Tắt: quét QR là vào thẳng thực đơn (nhanh hơn 1 chạm). Địa chỉ quán trên màn chào lấy từ ô Địa chỉ ở trên.'),
      el(
        'label',
        { class: 'check' },
        sheetAllCheck,
        el('span', {}, el('strong', {}, 'Bấm "+" mở bảng chọn cho mọi món'), ' — khách chọn size, topping, ghi chú, số lượng một lần rồi mới vào giỏ'),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Tắt: món không có tùy chọn bấm "+" là vào giỏ ngay (nhanh hơn 1 chạm), muốn ghi chú thì bấm tên món. Món có tùy chọn luôn mở bảng chọn. Điện thoại khách đổi theo khi tải lại menu.',
      ),
      el(
        'label',
        { class: 'check' },
        daypartCheck,
        el(
          'span',
          {},
          el('strong', {}, 'Tự đổi sáng / tối theo giờ'),
          ' — buổi sáng (5–11 giờ) khung giới thiệu có nắng; từ 18 giờ đến 5 giờ sáng màn gọi món chuyển nền tối cho đỡ chói trong quán đèn mờ',
        ),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Màu đổi theo giờ của quán — điện thoại khách, máy tính đều như nhau. Đang mở mà qua 18 giờ là tự chuyển, không cần tải lại. Tắt: luôn nền sáng như trước.',
      ),
      el(
        'label',
        { class: 'check' },
        seasonCheck,
        el(
          'span',
          {},
          el('strong', {}, 'Trang trí theo mùa'),
          ' — khung giới thiệu ở màn chào đổi màu và hình: Xuân (tháng 1–3) hoa mai, Hạ (4–6) ly đá mát, Thu (7–9) lá vàng, Đông (10–12) ly nóng',
        ),
      ),
      el('p', { class: 'small muted' }, 'Nút, giá và thẻ món giữ màu của quán. Tắt: khung giới thiệu như cũ (ly cà phê).'),
    ),
    card(
      'Bàn trống',
      el('div', { class: 'field' }, el('label', {}, 'Tự trả bàn khách quét QR nhưng không gọi món'), idleClose),
      el(
        'p',
        { class: 'small muted' },
        'Khách quét mã rồi bỏ đi hoặc sang bàn khác thì bàn vẫn hiện "có khách". Hết thời gian này mà nhóm chưa gọi món, không ai vào thêm, không gọi nhân viên → hệ thống tự trả bàn (kiểm 5 phút một lần); khách quay lại vẫn còn món đã chọn. Khách hay ngồi chờ bạn lâu mới gọi → chọn 60 phút hoặc Tắt.',
      ),
    ),
    card(
      'Giao diện quản lý',
      el(
        'p',
        { class: 'small muted', id: 'giao-dien' },
        'Chế độ cơ bản: menu chỉ hiện Hôm nay, Báo cáo, Thực đơn, Ca & hoàn tiền, Cảnh báo, Bàn & QR, Tài khoản, Cài đặt. Tích nhóm nào thì nhóm đó hiện thêm trong menu:',
      ),
      MODULE_GROUPS.map(([, label, items], i) => el('label', { class: 'check' }, moduleChecks[i], el('span', {}, el('strong', {}, label), ` — ${items}`))),
      el(
        'p',
        { class: 'small muted' },
        'Chỉ ẩn khỏi menu — chức năng vẫn chạy (kho vẫn trừ, điểm vẫn tích…) và mở thẳng đường dẫn vẫn dùng được. Lưu xong menu bên trái đổi ngay.',
      ),
    ),
    card(
      'Wi-Fi cho khách',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Tên Wi-Fi'), wifiSsid),
        el('div', { class: 'field' }, el('label', {}, 'Mật khẩu Wi-Fi'), wifiPassword),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Có tên Wi-Fi thì trang In mã QR in thêm QR Wi-Fi cạnh QR gọi món: khách quét là vào mạng, không phải gõ mật khẩu. Mật khẩu 8–63 ký tự không dấu — tắt bộ gõ tiếng Việt khi nhập. Mật khẩu in trên thẻ bàn — nên dùng mạng riêng cho khách. Để trống tên = không in. Mạng không mật khẩu: để trống mật khẩu.',
      ),
    ),
    card(
      'Cảnh báo bất thường qua email',
      el('div', { class: 'field' }, el('label', {}, 'Email nhận cảnh báo (tối đa 5, cách nhau dấu phẩy)'), alertEmails),
      el('label', { class: 'check' }, alertImmediate, 'Cảnh báo tức thì — hoàn tiền lớn, hủy / sửa khoản sổ quỹ đã duyệt, giá nhập tăng làm món tụt lãi'),
      el('label', { class: 'check' }, alertShiftReport, 'Báo cáo khi đóng ca (két khớp hay lệch, các dấu hiệu bất thường)'),
      el('label', { class: 'check' }, alertDailyDigest, 'Tổng kết cuối ngày'),
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Gửi tổng kết lúc'), alertDigestTime),
        el('div', { class: 'field' }, el('label', {}, 'Giờ yên lặng từ (trống = tắt)'), alertQuietStart),
        el('div', { class: 'field' }, el('label', {}, 'Giờ yên lặng đến'), alertQuietEnd),
        el('div', { class: 'field' }, el('label', {}, 'Lệch két cho phép (đ)'), alertCashDiffMax),
        el('div', { class: 'field' }, el('label', {}, 'Tỉ lệ lượt thu chuyển khoản tối đa (%)'), alertTransferShareMax),
        el('div', { class: 'field' }, el('label', {}, 'Món đã pha bị hủy tối đa / ca'), alertVoidsMax),
        el('div', { class: 'field' }, el('label', {}, 'Lượt hoàn tiền tối đa / ca'), alertRefundsMax),
        el('div', { class: 'field' }, el('label', {}, 'Lượt giảm giá tay tối đa / ca'), alertManualDiscountMax),
        el('div', { class: 'field' }, el('label', {}, 'Hoàn tiền "lớn" từ (đ) — báo ngay'), alertRefundBig),
        el('div', { class: 'field' }, el('label', {}, 'Báo khi giá nhập tăng từ (%)'), alertCostRisePct),
        el('div', { class: 'field' }, el('label', {}, 'Và tỷ lệ lãi món tụt từ (điểm %)'), alertCostMarginDrop),
        el('div', { class: 'field' }, el('label', {}, 'Hoặc lãi món xuống dưới (%)'), alertCostMarginMin),
      ),
      el('label', { class: 'check' }, alertUseStats, 'So thêm với mức bình thường của quán (trung bình + 2 độ lệch chuẩn của 30 ca gần nhất, khi có ≥ 10 ca)'),
      mailStatus,
      el('div', { class: 'row' }, testEmail),
      el(
        'p',
        { class: 'small muted' },
        'Email nhận có hiệu lực ngay sau khi lưu. Đổi danh sách → app gửi thư báo tới cả địa chỉ cũ lẫn mới. Hộp thư gửi đặt trong file .env của máy chủ (không hiện ở đây). Mọi cảnh báo luôn có ở trang "Cảnh báo bất thường" kể cả khi email lỗi. Cảnh báo là gợi ý để kiểm tra, không kết luận ai sai.',
      ),
    ),
    card(
      'Nhận đơn qua QR',
      el(
        'div',
        { class: 'row' },
        toggle(accepting, (v) => (accepting = v), 'Nhận đơn qua QR'),
        el('span', {}, 'Khách được gửi đơn qua QR (tắt khi quá tải / sắp đóng cửa — quầy vẫn bán mang đi; nhân viên cũng bật/tắt được ở màn quầy)'),
      ),
      el('div', { class: 'field' }, el('label', {}, 'Thông báo khi tạm ngưng'), closedMessage),
      el('p', { class: 'small muted' }, 'Giờ bán theo danh mục (ví dụ bánh chỉ bán 6:00–11:00) chỉnh ở Thực đơn → Sửa danh mục.'),
    ),
    card(
      'Giảm giá tay của nhân viên',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Tối đa % bill'), maxPct),
        el('div', { class: 'field' }, el('label', {}, 'Tối đa số tiền (đ)'), maxAmt),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Nhân viên tự giảm khi không vượt cả hai ngưỡng; vượt ngưỡng cần tài khoản quản lý nhập để duyệt. Luôn bắt buộc ghi lý do.',
      ),
    ),
    card(
      'Trưởng ca & sổ quỹ',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Trưởng ca giảm tay tối đa % bill'), mgrPct),
        el('div', { class: 'field' }, el('label', {}, 'Trưởng ca giảm tay tối đa (đ)'), mgrAmt),
        el('div', { class: 'field' }, el('label', {}, 'Khoản chi quỹ cần duyệt khi lớn hơn (đ)'), cashThreshold),
        el('div', { class: 'field' }, el('label', {}, 'Trưởng ca duyệt chi tối đa (đ)'), mgrCash),
      ),
      el('label', { class: 'check' }, sameShift, 'Trưởng ca chỉ tự hoàn tiền cho lượt thu trong ca đang mở'),
      el(
        'p',
        { class: 'small muted' },
        'Khoản chi lớn hơn ngưỡng hoặc thuộc danh mục "cần duyệt" chờ trưởng ca / quản lý duyệt; khoản lớn hơn mức duyệt của trưởng ca chỉ quản lý duyệt được.',
      ),
    ),
    card(
      'Kho & giá vốn',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Cách tính giá vốn khi hoàn tất đơn'), costMethod),
        el('div', { class: 'field' }, el('label', {}, 'Tồn an toàn khi đề xuất nhập (% nhu cầu)'), safety),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Bình quân: giá vốn = giá bình quân sau mỗi lần nhập. FIFO: nguyên liệu theo lô lấy giá của lô bị trừ (hết hạn trước dùng trước). Chỉ áp cho đơn hoàn tất sau khi đổi.',
      ),
    ),
    card(
      'Đánh giá món',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Hiện sao trên menu khi món có ít nhất (lượt)'), reviewMin),
        el('div', { class: 'field' }, el('label', {}, 'Tính trong số ngày gần nhất'), reviewDays),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Khách chấm sao từng món sau khi thanh toán. Món mới / ít đánh giá không hiện sao để không bị thiệt. Xem chi tiết ở trang Đánh giá món.',
      ),
    ),
    card(
      'Tính tiền',
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', {}, 'Làm tròn tổng thanh toán'), round),
        el('div', { class: 'field' }, el('label', {}, 'Ưu đãi đơn đầu tiên của hội viên mới (%)'), firstPct),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Thứ tự: khuyến mãi món → khuyến mãi đơn → hội viên → giảm tay → làm tròn xuống. % hạng hội viên chỉnh ở Hội viên → Hạng hội viên.',
      ),
    ),
    card(
      'Nhận chuyển khoản (VietQR)',
      el(
        'div',
        { class: transferReady ? 'alert success' : 'alert warning', id: 'transfer-status' },
        transferReady
          ? 'Đang nhận: khách chọn "Chuyển khoản" khi gọi thanh toán sẽ thấy mã QR có sẵn số tiền; quầy thấy mã ở hộp Thu tiền.'
          : s.transferEnabled
            ? 'Đã bật nhưng còn thiếu ngân hàng / số / tên chủ tài khoản — khách chưa thấy mã.'
            : 'Đang tắt — khách chỉ thấy "Gọi thanh toán" như trước.',
      ),
      el('label', { class: 'check', for: 'transfer-enabled' }, transferCheck, ' Cho khách chuyển khoản bằng mã QR (VietQR)'),
      el(
        'div',
        { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', { for: 'bank-bin' }, 'Ngân hàng'), bankBin),
        el('div', { class: 'field' }, el('label', { for: 'bank-kind' }, 'Loại'), bankKind),
        el('div', { class: 'field' }, el('label', { for: 'bank-number' }, 'Số tài khoản / số thẻ'), bankNumber),
        el('div', { class: 'field' }, el('label', { for: 'bank-holder' }, 'Tên chủ tài khoản'), bankHolder),
      ),
      el(
        'p',
        { class: 'small muted' },
        'Tiền chuyển thẳng vào tài khoản / thẻ này. Nhân viên bấm "Đã nhận chuyển khoản" khi thấy tiền vào — khách không tự đánh dấu đã trả, ảnh chụp màn hình không có tác dụng. Số thẻ: lưu xong bấm "Thử mã 1.000đ" và chuyển thử — app ngân hàng báo không chuyển được tới thẻ thì dùng số tài khoản.',
      ),
      transferReady
        ? el(
            'button',
            {
              class: 'btn',
              type: 'button',
              onclick: async () => {
                try {
                  showBigQr(await staffApi('/api/payments/transfer-qr', { method: 'POST', body: { amount: 1000 } }), 'Mã thử 1.000đ — quét bằng app ngân hàng');
                } catch (err) {
                  toast(errorMessage(err), 'error');
                }
              },
            },
            'Thử mã 1.000đ',
          )
        : null,
    ),
    el(
      'button',
      {
        class: 'btn btn-primary btn-lg',
        type: 'button',
        onclick: async () => {
          try {
            const r = await staffApi('/api/admin/settings', {
              method: 'PUT',
              body: {
                // Chỉ gửi khi đổi: lưu cài đặt khác không chép tên / địa chỉ mặc định (.env) vào DB (review G3)
                shopName: shopName.value.trim() !== s.shopName ? shopName.value.trim() : undefined,
                shopAddress: shopAddress.value.trim() !== s.shopAddress ? shopAddress.value.trim() : undefined,
                wifiSsid: wifiSsid.value.trim() !== s.wifiSsid ? wifiSsid.value.trim() : undefined,
                wifiPassword: wifiPassword.value !== s.wifiPassword ? wifiPassword.value : undefined,
                // F-060: danh sách email chỉ gửi khi đổi (đổi → thư báo cả địa chỉ cũ lẫn mới)
                alertEmails: parseEmails().join(',') !== s.alertEmails.join(',') ? parseEmails() : undefined,
                alertImmediate: alertImmediate.checked,
                alertShiftReport: alertShiftReport.checked,
                alertDailyDigest: alertDailyDigest.checked,
                alertDigestTime: alertDigestTime.value || s.alertDigestTime,
                alertQuietStart: alertQuietStart.value,
                alertQuietEnd: alertQuietEnd.value,
                alertCashDiffMax: numOrKeep(alertCashDiffMax),
                alertTransferShareMax: numOrKeep(alertTransferShareMax),
                alertVoidsMax: numOrKeep(alertVoidsMax),
                alertRefundsMax: numOrKeep(alertRefundsMax),
                alertRefundBig: numOrKeep(alertRefundBig),
                alertManualDiscountMax: numOrKeep(alertManualDiscountMax),
                alertCostRisePct: numOrKeep(alertCostRisePct),
                alertCostMarginDrop: numOrKeep(alertCostMarginDrop),
                alertCostMarginMin: numOrKeep(alertCostMarginMin),
                alertUseStats: alertUseStats.checked,
                uiModules: moduleChecks.filter((c) => c.checked).map((c) => c.value), // F-061
                oneTap: oneTapCheck.checked, // F-076
                singleScreen: singleScreenCheck.checked, // F-088
                serveMode: serveMode.value, // F-088
                menuSheetAll: sheetAllCheck.checked, // F-083
                guestWelcome: welcomeCheck.checked, // F-092
                guestDaypartTheme: daypartCheck.checked, // F-094
                guestSeasonDecor: seasonCheck.checked, // F-094
                // F-099: nhận chuyển khoản bằng VietQR (chỉ chủ quán)
                transferEnabled: transferCheck.checked,
                bankBin: bankBin.value,
                bankKind: bankKind.value,
                bankNumber: bankNumber.value.trim(),
                bankHolder: bankHolder.value.trim(),
                idleCloseMinutes: Number(idleClose.value), // F-087
                acceptingOrders: accepting,
                closedMessage: closedMessage.value.trim() || s.closedMessage,
                staffMaxPercent: Number(maxPct.value),
                staffMaxAmount: Number(maxAmt.value),
                roundTo: Number(round.value),
                firstOrderPercent: Number(firstPct.value),
                managerMaxPercent: Number(mgrPct.value),
                managerMaxAmount: Number(mgrAmt.value),
                managerCashApproveMax: Number(mgrCash.value),
                cashApproveThreshold: Number(cashThreshold.value),
                managerRefundSameShiftOnly: sameShift.checked,
                costMethod: costMethod.value,
                forecastSafetyPercent: Number(safety.value),
                reviewMenuMinCount: Number(reviewMin.value),
                reviewMenuDays: Number(reviewDays.value),
              },
            });
            toast('Đã lưu cài đặt', 'success');
            render(r);
            // Thanh bên hiện tên quán mới ngay (F-053); lỗi ở bước này không làm hỏng thông báo đã lưu
            // F-061: bật / tắt nhóm menu → thanh bên đổi ngay
            if (r.shopName !== s.shopName || r.uiModules.join() !== s.uiModules.join()) mountAdminShell('settings').catch(() => {});
          } catch (err) {
            showFieldErrors($('#content'), fixPaths(err));
            toast(errorMessage(err), 'error');
          }
        },
      },
      'Lưu cài đặt',
    ),
  );
}

load();
