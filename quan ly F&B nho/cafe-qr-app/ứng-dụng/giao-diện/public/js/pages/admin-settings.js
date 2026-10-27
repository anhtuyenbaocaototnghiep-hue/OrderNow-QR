// S-33 Cài đặt quán (ADR-005): nhận đơn QR (F-020), ngưỡng giảm giá tay của nhân viên (D-14), làm tròn (D-7), ưu đãi đơn đầu (D-5).
// ADR-006: quyền trưởng ca (D-24) + ngưỡng duyệt chi quỹ (D-23). F-053: tên quán + địa chỉ in trên hóa đơn (BR-085).
// F-059: Wi-Fi cho khách in thành QR cạnh QR bàn (BR-092).
import { staffApi } from '../api.js';
import { mountAdminShell, toggle } from '../admin-shell.js';
import { $, clear, el, errorMessage, money, showFieldErrors, toast } from '../ui.js';

await mountAdminShell('settings');

async function load() {
  try {
    render(await staffApi('/api/admin/settings'));
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
  const card = (title, ...children) =>
    el('div', { class: 'card', style: { maxWidth: '720px', marginBottom: '1rem' } }, el('h2', { style: { fontSize: '1rem' } }, title), ...children);
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
      el(
        'p',
        { class: 'small muted' },
        'Hiện ở thanh quầy, thanh bên quản lý, đầu trang menu khách, hóa đơn, phiếu đặt hàng và thẻ QR in. Màn đang mở ở máy khác đổi theo khi tải lại.',
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
            if (r.shopName !== s.shopName) mountAdminShell('settings').catch(() => {});
          } catch (err) {
            showFieldErrors($('#content'), err);
            toast(errorMessage(err), 'error');
          }
        },
      },
      'Lưu cài đặt',
    ),
  );
}

load();
