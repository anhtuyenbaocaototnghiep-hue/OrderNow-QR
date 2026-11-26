// E2E trên Chromium thật: điện thoại khách (390px) + máy quầy (1366px) + quản lý, DB test sạch (kịch-bản/e2e-server.js).
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let browser, pos, P, phoneA, A, phoneB, B, phoneC, C, phoneD, D, adminToken, tables, ids;
const phoneOpts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' };
const errors = [];
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && errors.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
};

// F-086: điện thoại thử đóng vai KHÁCH MỚI ở bàn khác → bỏ cookie danh tính máy. Không bỏ thì app (đúng với khách thật) hỏi
// "Bạn đang gọi món ở Bàn …, đã chuyển sang bàn này?" vì điện thoại còn nhóm chưa thanh toán từ bài trước.
const newCustomer = (ctx) => ctx.clearCookies();

async function apiAs(request, method, url, data) {
  const res = await request[method](url, { headers: { Authorization: `Bearer ${adminToken}` }, data });
  expect(res.ok(), `${method} ${url} → ${res.status()}`).toBeTruthy();
  return res.json();
}

test.beforeAll(async ({ browser: b, request }) => {
  browser = b;
  pos = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  phoneA = await browser.newContext(phoneOpts);
  phoneB = await browser.newContext(phoneOpts);
  phoneC = await browser.newContext(phoneOpts);
  phoneD = await browser.newContext(phoneOpts);
  [P, A, B, C, D] = await Promise.all([pos.newPage(), phoneA.newPage(), phoneB.newPage(), phoneC.newPage(), phoneD.newPage()]);
  watch(P, 'pos');
  watch(A, 'A');
  watch(B, 'B');
  watch(C, 'C');
  watch(D, 'D');
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'Admin@123' } });
  adminToken = (await login.json()).accessToken;
  tables = Object.fromEntries((await apiAs(request, 'get', '/api/admin/tables')).map((t) => [t.code, t.qrToken]));
  ids = Object.fromEntries((await apiAs(request, 'get', '/api/admin/menu-items')).map((m) => [m.name, m.menuItemId]));
  await apiAs(request, 'post', '/api/shifts/open', { openingCash: 200000 }); // F-018: thu tiền cần ca đang mở
});

test.afterAll(async () => {
  await Promise.all([pos, phoneA, phoneB, phoneC, phoneD].map((c) => c?.close()));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('nhân viên đăng nhập; sai mật khẩu báo lỗi (S-09)', async () => {
  await P.goto('/pos');
  await expect(P).toHaveURL(/\/pos\/login/);
  await P.fill('#username', 'staff1');
  await P.fill('#password', 'sai-mat-khau');
  await P.click('#submit');
  await expect(P.locator('.alert.danger')).toHaveText('Sai tên đăng nhập hoặc mật khẩu');
  await P.fill('#password', 'Staff@123');
  await P.click('#submit');
  await expect(P).toHaveURL(/\/pos$/);
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
});

test('STAFF mở trang quản lý → phải đăng nhập trang Quản lý (không dùng phiên máy quầy); đăng nhập bằng nhân viên → chưa có quyền, không vào được', async () => {
  await P.goto('/admin/menu');
  await expect(P).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fmenu/);
  await expect(P.locator('#follow-pos')).toHaveCount(0); // ADR-044: không có "Vào bằng tài khoản này"
  await P.fill('#username', 'staff1');
  await P.fill('#password', 'Staff@123');
  await P.click('#submit');
  await expect(P.locator('#msg')).toContainText('chưa có quyền vào trang Quản lý');
  await expect(P).toHaveURL(/\/admin\/login/);
  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
});

test('quét QR: bàn trống vào thẳng menu; khách sau tự vào nhóm của bàn, không còn hỏi Gộp chung / Cá nhân (FEATURE-001, F-097)', async () => {
  await A.goto(`/t/${tables['02']}`);
  await expect(A).toHaveURL(/\/menu$/);
  await expect(A.locator('#table')).toHaveText('Bàn 02');

  // F-097: bàn đang có nhóm → B tự vào nhóm của bàn, không hỏi Gộp chung / Cá nhân
  await B.goto(`/t/${tables['02']}`);
  await expect(B).toHaveURL(/\/menu$/);
  await expect(B.locator('.together-card')).toContainText('Bàn 02 đang có khách'); // TASK-128: thẻ "Bạn đi chung hay đi riêng?"

  // Nhóm thứ hai ở cùng bàn (quầy / API mở — điện thoại không còn nút "Tạo đơn cá nhân") → C có hóa đơn riêng
  await C.goto('/');
  await C.evaluate(
    (qr) => globalThis.fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrToken: qr }) }),
    tables['02'],
  );
  await C.goto(`/t/${tables['02']}`);
  await expect(C).toHaveURL(/\/menu$/);

  await A.goto('/t/' + 'f'.repeat(32));
  await expect(A.getByRole('heading', { name: 'Mã bàn không hợp lệ' })).toBeVisible();
  await A.goto(`/t/${tables['02']}`); // vào lại phiên cũ (cookie còn)
  await expect(A).toHaveURL(/\/menu$/);
});

test('gọi món trong 3 chạm, quầy nhận đơn realtime < 2s (NFR-003, AC-007-01)', async () => {
  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  const item = A.locator('.c-section.cat .c-item', { hasText: 'Cà phê sữa' });
  await item.locator('.add-btn').click(); // chạm 1
  await A.click('#open-cart'); // chạm 2
  await expect(A.locator('.sheet')).toContainText('tiền mặt hoặc chuyển khoản'); // DEF-017 (F-056)
  const t0 = Date.now();
  await A.locator('.sheet .modal-foot .btn-primary').click(); // chạm 3
  await expect(A).toHaveURL(/\/track$/);
  await expect(P.locator('#col-PENDING .ticket', { hasText: 'Cà phê sữa' })).toBeVisible({ timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2000);
  // Thành viên cùng nhóm (B) thấy đơn chung; phiên cá nhân (C) không thấy
  await B.goto(`/t/${tables['02']}/track`);
  await expect(B.locator('.order-card')).toHaveCount(1);
  await C.goto(`/t/${tables['02']}/track`);
  await expect(C.getByText('Bạn chưa gọi món nào.')).toBeVisible();
});

test('tiếp nhận → hoàn tất: khách thấy trạng thái + pop-up không cần F5 (AC-004-01, AC-007-02/03)', async () => {
  const ticket = P.locator('#col-PENDING .ticket', { hasText: 'Cà phê sữa' });
  await ticket.getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
  await expect(A.locator('.order-card .badge')).toHaveText('Đang chuẩn bị');
  await P.locator('#col-PREPARING .ticket', { hasText: 'Cà phê sữa' }).getByRole('button', { name: 'Hoàn tất' }).click();
  await expect(A.locator('.popup-done')).toBeVisible();
  await A.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(A.locator('.order-card .badge')).toHaveText('Đã xong, vui lòng nhận tại quầy');
  await expect(P.locator('#col-COMPLETED .ticket', { hasText: 'Cà phê sữa' })).toBeVisible();
});

test('admin tắt "còn bán" → menu khách đổi sang Hết món ngay (AC-010-02, AC-002-05)', async ({ request }) => {
  await B.goto(`/t/${tables['02']}/menu`);
  const latte = B.locator('.c-section.cat .c-item', { hasText: 'Latte' });
  await expect(latte.locator('.add-btn')).toBeVisible();
  const items = await apiAs(request, 'get', '/api/admin/menu-items');
  const id = items.find((i) => i.name === 'Latte').menuItemId;
  await apiAs(request, 'patch', `/api/admin/menu-items/${id}/availability`, { isAvailable: false });
  await expect(latte.getByText('Hết món')).toBeVisible({ timeout: 2000 });
  await apiAs(request, 'patch', `/api/admin/menu-items/${id}/availability`, { isAvailable: true });
  await expect(latte.locator('.add-btn')).toBeVisible({ timeout: 2000 });
});

test('món vừa hết nguyên liệu lúc gửi → từ chối cả đơn, báo tên món, bỏ khỏi giỏ (AC-003-02, Q-005)', async ({ request }) => {
  await C.goto(`/t/${tables['02']}/menu`);
  await C.locator('.c-section.cat .c-item', { hasText: 'Trà đào' }).locator('.add-btn').click();
  await C.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
  await C.click('#open-cart');
  const ing = (await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.name === 'Cốt trà đào');
  await apiAs(request, 'post', `/api/admin/ingredients/${ing.ingredientId}/adjust`, { newQty: ing.reservedQty + 10, reason: 'E2E: gần hết' });
  await C.locator('.sheet .modal-foot .btn-primary').click();
  await expect(C.locator('.sheet .alert.danger')).toContainText('Trà đào vừa hết món');
  await expect(C.locator('.sheet .cart-line')).toHaveCount(1);
  await expect(C.locator('.c-section.cat .c-item', { hasText: 'Trà đào' }).getByText('Hết món')).toBeVisible();
  await apiAs(request, 'post', `/api/admin/ingredients/${ing.ingredientId}/adjust`, { newQty: 1000, reason: 'E2E: nhập lại' });
  await C.locator('.sheet .modal-foot .btn-primary').click(); // gửi phần còn lại (Cà phê đen)
  await expect(C).toHaveURL(/\/track$/);
});

test('mất kết nối quầy → khi có mạng lại tự tải đơn nhỡ + báo "Có đơn hàng bị trễ" (AC-007-05, REQ-017)', async () => {
  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  await pos.setOffline(true);
  await expect(P.locator('#conn')).toHaveText('Mất kết nối', { timeout: 25_000 });
  // Trong lúc quầy mất mạng, khách A gọi thêm món
  await A.goto(`/t/${tables['02']}/menu`);
  await A.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await A.click('#open-cart');
  await A.locator('.sheet .modal-foot .btn-primary').click();
  await expect(A).toHaveURL(/\/track$/);
  await pos.setOffline(false);
  await expect(P.locator('#conn')).toHaveText('Đã kết nối', { timeout: 25_000 });
  await expect(P.locator('#late')).toContainText('Có đơn hàng bị trễ');
  await expect(P.locator('#col-PENDING .ticket', { hasText: 'Nước suối' })).toBeVisible();
});

test('gọi thanh toán → POS dải "Gọi thanh toán" → thu tiền mặt, tiền thừa, in bill, khách thấy cảm ơn (FEATURE-005/006)', async () => {
  await A.goto(`/t/${tables['02']}/track`);
  await A.click('#pay');
  await A.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(A.locator('#pay-status')).toContainText('Đã gọi thanh toán');
  const card = P.locator('#pay-strip .pay-card', { hasText: 'Bàn 02' });
  await expect(card).toBeVisible({ timeout: 2000 });
  await card.click();
  await expect(P.locator('.drawer')).toContainText('Còn 1 đơn chưa tiếp nhận');
  const settle = P.locator('.drawer .modal-foot .btn-success');
  await expect(settle).toBeDisabled();
  await P.locator('.drawer .mini-order.pending').getByRole('button', { name: 'Tiếp nhận' }).click();
  await expect(P.locator('.drawer .mini-order.pending')).toHaveCount(0);
  const due = await P.locator('.drawer .due span').last().textContent();
  expect(due).toBe('39.000đ'); // Cà phê sữa 29.000 + Nước suối 10.000
  await P.fill('#amount-received', '50000');
  await expect(P.locator('.drawer .change')).toContainText('11.000đ');
  await settle.click();
  await expect(P.locator('.drawer')).toHaveCount(0);
  await expect(A.locator('.thanks')).toContainText('Đã thanh toán 39.000đ');
  await expect(B.locator('body')).toBeVisible();
  await expect(P.locator('#pay-strip')).toBeHidden();
});

test('phiên đã đóng: khách bấm "Gọi món mới" → không vào lại phiên cũ (BR-008, AC-001-04)', async () => {
  await A.getByRole('button', { name: 'Gọi món mới' }).click();
  // Bàn 02 còn nhóm của C đang mở (nhóm đã thanh toán không còn) → F-097: tự vào nhóm đang mở, không vào lại nhóm cũ
  await expect(A).toHaveURL(/\/menu$/);
  await expect(A.locator('#table')).toHaveText('Bàn 02');
  await A.goto(`/t/${tables['02']}/track`);
  await expect(A.locator('.order-card', { hasText: 'Cà phê đen' }).first()).toBeVisible(); // đơn của nhóm đang mở (C)
  await expect(A.locator('.order-card', { hasText: 'Cà phê sữa' })).toHaveCount(0); // không phải nhóm đã thanh toán
});

test('bán mang đi: thiếu tiền bôi đỏ; đủ tiền → đơn PAID vào cột Đang pha (AC-008-01/02)', async () => {
  await P.goto('/pos/takeaway');
  await P.locator('.tile', { hasText: 'Bạc xỉu' }).click();
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.click('#pay');
  await expect(P.locator('#received')).toHaveClass(/invalid/);
  await expect(P.locator('#pay-error')).toContainText('Vui lòng nhập tiền khách đưa (tối thiểu 57.000đ)');
  await P.fill('#received', '100000');
  await expect(P.locator('#change')).toContainText('43.000đ');
  await P.click('#pay');
  await expect(P.locator('#today')).toContainText('Bạc xỉu');
  await P.goto('/pos');
  await expect(P.locator('#col-PREPARING .ticket', { hasText: 'Mang đi' })).toBeVisible();
});

test('hóa đơn phiên in khổ 80mm, tạm tính có chữ TẠM TÍNH (S-12, BR-014)', async ({ request }) => {
  const r = await request.get(
    `/api/admin/orders?from=2026-01-01&to=${new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)}&type=DINE_IN&status=COMPLETED`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  const order = (await r.json()).items.find((o) => o.paymentStatus === 'PAID');
  await P.goto(`/pos/sessions/${order.sessionId}/receipt?mode=final`);
  await expect(P.locator('.receipt .title')).toHaveText('HÓA ĐƠN THANH TOÁN');
  await expect(P.locator('.receipt')).toContainText('Tiền thừa');
  await expect(P.locator('.receipt')).toContainText('Tiền mặt'); // AC-006-04: "Thanh toán: Tiền mặt"
  const width = await P.locator('.receipt').evaluate((n) => n.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(Math.round((80 / 25.4) * 96));
});

test('báo cáo: khoảng ngày sai vô hiệu nút Xem; 01–10/10/2026 = 3.190.000đ (AC-012-01/02)', async () => {
  // Xóa phiên đăng nhập ngay trên trang hiện tại (cùng origin) — vào /pos/login khi đang đăng nhập sẽ tự chuyển trang, làm hỏng lệnh goto kế tiếp
  await P.evaluate(() => localStorage.clear());
  // F-080 / F-084: P giữ hai phiên — trang Quản lý đăng nhập riêng bằng chủ quán (chủ quán không đăng nhập máy quầy); máy quầy đứng bằng
  // quản lý cửa hàng (bài kế tiếp). Các bài sau dùng P cho cả quầy lẫn trang Quản lý.
  await P.goto('/admin/login?next=/admin/reports');
  await P.fill('#username', 'admin');
  await P.fill('#password', 'Admin@123');
  await P.click('#submit');
  await expect(P).toHaveURL(/\/admin\/reports/);
  await P.fill('#from', '2026-10-10');
  await P.fill('#to', '2026-10-01');
  await expect(P.getByRole('button', { name: 'Xem' })).toBeDisabled();
  await expect(P.getByText('Khoảng thời gian không hợp lệ')).toBeVisible();
  await P.fill('#from', '2026-10-01');
  await P.fill('#to', '2026-10-10');
  await P.getByRole('button', { name: 'Xem' }).click();
  await expect(P.locator('.kpi').first()).toContainText('3.190.000đ');
  await expect(P.locator('svg.chart rect.bar')).toHaveCount(10);
});

test('máy quầy P đứng bằng quản lý cửa hàng — chủ quán chỉ dùng trang Quản lý (F-084); trang Quản lý của P vẫn là chủ quán', async ({ request }) => {
  await apiAs(request, 'post', '/api/admin/users', { username: 'quay-ql', password: 'Quay@123', fullName: 'QL quầy E2E', role: 'STORE_MGR' });
  await P.goto('/pos/login');
  await P.fill('#username', 'quay-ql');
  await P.fill('#password', 'Quay@123');
  await P.click('#submit');
  await expect(P).toHaveURL(/\/pos$/);
  await P.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // tài khoản mới → hướng dẫn lần đầu
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  await P.goto('/admin/today');
  await expect(P.locator('#side .who')).toContainText('@admin');
});

test('quản lý: tạo nhân viên trùng tên báo lỗi; BOM -10 bị từ chối (AC-009-02, AC-011-02)', async () => {
  await P.goto('/admin/users');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  await P.fill('.modal [name="username"]', 'STAFF1');
  await P.fill('.modal [name="password"]', '123456');
  await P.fill('.modal [name="fullName"]', 'Trùng tên');
  await P.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(P.locator('.modal .alert.danger')).toHaveText('Tên đăng nhập đã tồn tại, vui lòng chọn tên khác');
  await P.keyboard.press('Escape');

  await P.goto('/admin/menu');
  await P.locator('tr', { hasText: 'Cà phê đen' }).getByRole('link').click();
  await P.locator('.bom-row input').first().fill('-10');
  await P.click('#save');
  await expect(P.locator('#bom-msg .alert.danger')).toHaveText('Định lượng không hợp lệ, phải lớn hơn 0');
  await expect(P.locator('.bom-row input').first()).toHaveClass(/invalid/);
});

test('quản lý: nút Xóa cho món, bàn, nguyên liệu, tài khoản (ADR-004)', async ({ request }) => {
  await apiAs(request, 'post', '/api/admin/menu-items', { categoryId: 1, name: 'Món sẽ xóa', price: 15000 });
  await P.goto('/admin/menu');
  const row = P.locator('tr', { hasText: 'Món sẽ xóa' });
  await row.getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('.toast')).toContainText('Đã xóa món "Món sẽ xóa"');
  await expect(row).toHaveCount(0);

  // Món đã bán (Cà phê sữa) → xóa mềm, báo vẫn giữ trong lịch sử
  await P.locator('tr', { hasText: 'Cà phê sữa' }).getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('.toast').last()).toContainText('vẫn giữ trong lịch sử');

  await apiAs(request, 'post', '/api/admin/tables', { code: '99' });
  await P.goto('/admin/tables');
  await P.locator('tr', { hasText: 'Bàn 99' }).getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('tr', { hasText: 'Bàn 99' })).toHaveCount(0);

  await P.goto('/admin/ingredients');
  await P.getByRole('button', { name: 'Việc khác: Cà phê cốt', exact: true }).click(); // TASK-109: Xóa nằm trong "⋯"
  await P.getByRole('dialog', { name: 'Cà phê cốt', exact: true }).getByRole('button', { name: 'Xóa nguyên liệu' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('.toast').last()).toContainText('Nguyên liệu đang dùng trong định lượng của');

  await apiAs(request, 'post', '/api/admin/users', { username: 'xoa_thu', password: '123456', fullName: 'Xóa thử', role: 'STAFF' });
  await P.goto('/admin/users');
  await expect(P.locator('tr', { hasText: 'admin' }).first().getByRole('button', { name: 'Xóa' })).toHaveCount(0);
  await P.locator('tr', { hasText: 'xoa_thu' }).getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('tr', { hasText: 'xoa_thu' })).toHaveCount(0);
});

// ---------- Mở rộng giai đoạn 2 (ADR-005) ----------
test('hội viên: khách nhập SĐT ở giỏ → đăng ký → quầy thu tiền thấy ưu đãi đơn đầu −10% (F-014)', async () => {
  await D.goto(`/t/${tables['05']}`);
  await expect(D).toHaveURL(/\/menu$/);
  await D.locator('.c-section.cat .c-item', { hasText: 'Bánh croissant' }).locator('.add-btn').click();
  await D.click('#open-cart');
  await D.locator('.sheet .member-box').click();
  await D.locator('input[type="tel"]').fill('0911222333');
  await D.getByRole('button', { name: 'Tiếp tục' }).click();
  await D.getByPlaceholder('Ví dụ: Nguyễn Văn An').fill('Trần Thu Hà');
  await expect(D.locator('.sheet a.policy-link')).toHaveAttribute('href', '/chinh-sach-du-lieu'); // F-062
  await D.getByRole('button', { name: 'Đăng ký & nhận ưu đãi' }).click();
  await expect(D.locator('.field-error')).toContainText('tick đồng ý');
  await D.locator('.sheet label.check input[type="checkbox"]').check();
  await D.getByRole('button', { name: 'Đăng ký & nhận ưu đãi' }).click();
  await expect(D.locator('.sheet .member-box.on')).toContainText('Bạn đang nhận ưu đãi đơn đầu −10%');
  await expect(D.locator('.sheet .member-box.on')).toContainText('Trần T. H.');
  await D.locator('.sheet .modal-foot .btn-primary').click();
  await expect(D).toHaveURL(/\/track$/);
  await expect(D.locator('.bill')).toContainText('22.500đ'); // 25.000 − 10% = 22.500

  await P.goto('/pos');
  await P.locator('#col-PENDING .ticket', { hasText: 'Bánh croissant' }).getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
  await P.locator('#tables .table-row', { hasText: 'Bàn 05' }).getByRole('button', { name: 'Thu tiền' }).click();
  await expect(P.locator('.drawer .breakdown')).toContainText('ưu đãi đơn đầu −10%');
  await expect(P.locator('.drawer .due span').last()).toHaveText('22.500đ');
  await P.locator('.drawer .quick-cash .btn').first().click();
  await P.locator('.drawer .modal-foot .btn-success').click();
  await expect(P.locator('.drawer')).toHaveCount(0);
  await expect(D.locator('.thanks')).toContainText('Đã thanh toán 22.500đ');
});

test('tùy chọn món + combo: khách chọn Size L (+5k); quầy bán combo ở tab Combo (F-013, F-015)', async ({ request }) => {
  const ings = await apiAs(request, 'get', '/api/admin/ingredients');
  const cot = ings.find((i) => i.name === 'Sữa tươi').ingredientId;
  const g = await apiAs(request, 'post', '/api/admin/modifier-groups', {
    name: 'Size',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: 'Size M', priceDelta: 0, isDefault: true },
      { name: 'Size L', priceDelta: 5000, bom: [{ ingredientId: cot, amount: 30 }] },
    ],
  });
  const items = await apiAs(request, 'get', '/api/admin/menu-items');
  const bx = items.find((i) => i.name === 'Bạc xỉu');
  await apiAs(request, 'put', `/api/admin/menu-items/${bx.menuItemId}`, { ...bx, imageUrl: '', groupIds: [g.groupId] });
  const banh = items.find((i) => i.name === 'Bánh croissant');
  const latte = items.find((i) => i.name === 'Latte');
  await apiAs(request, 'post', '/api/admin/combos', {
    name: 'Combo Latte + bánh',
    price: 55000,
    components: [
      { menuItemId: latte.menuItemId, quantity: 1 },
      { menuItemId: banh.menuItemId, quantity: 1 },
    ],
  });

  await C.goto(`/t/${tables['02']}/menu`);
  const card = C.locator('.c-section.cat .c-item', { hasText: 'Bạc xỉu' });
  await card.getByRole('button', { name: /Chọn size/ }).click();
  await C.locator('.opt-row', { hasText: 'Size L' }).click();
  await expect(C.getByRole('dialog').locator('.modal-foot .btn-primary')).toContainText('37.000đ'); // ADR-042: giá 1 phần nằm trên nút thêm
  await C.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await expect(card.locator('.qty-badge')).toHaveText('1');
  await expect(C.locator('.c-section.combo')).toContainText('Tiết kiệm 9.000đ');
  await C.click('#open-cart');
  await expect(C.locator('.sheet .cart-line', { hasText: 'Bạc xỉu' })).toContainText('Size L');
  await expect(C.locator('.sheet .cart-total')).toContainText('37.000đ');
  await C.keyboard.press('Escape');

  await P.goto('/pos/takeaway');
  await P.locator('#tabs .chip', { hasText: 'Combo' }).click();
  await P.locator('.tile', { hasText: 'Combo Latte + bánh' }).click();
  await expect(P.locator('#total')).toHaveText('55.000đ');
  await P.fill('#received', '60000');
  await P.click('#pay');
  await expect(P.locator('#today')).toContainText('Combo Latte + bánh');
  await P.goto('/pos');
  await expect(P.locator('#col-PREPARING .ticket', { hasText: 'Combo Latte + bánh' })).toContainText('Bánh croissant');
});

test('gọi nhân viên: khách bấm → quầy có dải + chuông, bấm Đã xử lý → khách được báo (F-021)', async () => {
  await C.goto(`/t/${tables['02']}/track`);
  await C.getByRole('button', { name: 'Gọi nhân viên' }).click();
  await C.locator('.sheet .chip', { hasText: 'Xin thêm đá' }).click();
  await C.locator('.sheet').getByRole('button', { name: 'Gọi nhân viên' }).click();
  // ADR-072 (AC-021-05): gọi xong vẫn hiện "Đã gọi nhân viên lúc …" nhưng nút còn bấm được để xin thêm (chỉ khóa khi đủ 5 lần / 1 phút)
  await expect(C.locator('#call-status')).toContainText('Đã gọi nhân viên lúc');
  await expect(C.getByRole('button', { name: 'Gọi nhân viên' })).toBeEnabled();
  const card = P.locator('#call-strip .call-card', { hasText: 'Xin thêm đá' });
  await expect(card).toBeVisible({ timeout: 2000 });
  await card.getByRole('button', { name: 'Đã xử lý' }).click();
  await expect(P.locator('#call-strip')).toBeHidden();
  await expect(C.locator('.toast', { hasText: 'Nhân viên đã nhận yêu cầu' })).toBeVisible();
});

test('tạm ngưng nhận đơn QR: khách thấy thông báo, nút gửi bị khóa; mở lại (F-020)', async () => {
  await P.goto('/pos');
  await P.click('#store-btn');
  await P.locator('.modal').getByRole('button', { name: 'Tạm ngưng' }).click();
  await expect(P.locator('#store-btn')).toHaveText('QR: tạm ngưng');
  await C.goto(`/t/${tables['02']}/menu`);
  await expect(C.locator('#store-closed')).toContainText('tạm ngưng nhận đơn');
  await C.click('#open-cart');
  await expect(C.locator('.sheet .modal-foot .btn-primary')).toBeDisabled();
  await C.keyboard.press('Escape');
  await P.click('#store-btn');
  await P.locator('.modal').getByRole('button', { name: 'Mở lại' }).click();
  await expect(C.locator('#store-closed')).toBeHidden({ timeout: 2000 });
});

test('gọi món tại bàn: nhân viên mở Bàn 04 kèm ghi chú, nhập món → Đang pha; khách quét QR gộp nhóm không thấy ghi chú; thu tiền (F-024)', async () => {
  await P.goto('/pos');
  await P.click('#go-table-order');
  await expect(P).toHaveURL(/\/pos\/table-order/);
  const chip = P.locator('.table-chip[data-table="04"]');
  await chip.click();
  await expect(P.locator('#target')).toContainText('Bàn trống');
  await P.fill('#table-note', 'Khách lớn tuổi — ít đá');
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.locator('#tabs .chip', { hasText: 'Trà & đồ uống khác' }).click();
  await P.locator('.tile', { hasText: 'Nước suối' }).click();
  await P.locator('.ta-line', { hasText: 'Cà phê đen' }).locator('input').fill('không đường');
  await expect(P.locator('#total')).toHaveText('60.000đ');
  await P.click('#send');
  await expect(P.locator('.toast', { hasText: 'Đang pha' })).toBeVisible();
  await expect(P.locator('#ordered .mini-order')).toHaveCount(1);
  await expect(P.locator('#ordered')).toContainText('Nhân viên nhập');
  await expect(chip).toContainText('Khách lớn tuổi — ít đá');
  await expect(chip).toHaveClass(/busy/);

  // Khách quét QR bàn 04 → gộp vào nhóm nhân viên đã mở: thấy đơn, không thấy ghi chú bàn
  await D.goto(`/t/${tables['04']}`); // F-097: tự vào nhóm của bàn
  await expect(D).toHaveURL(/\/menu$/);
  await D.goto(`/t/${tables['04']}/track`);
  await expect(D.locator('body')).toContainText('Cà phê đen');
  await expect(D.locator('body')).not.toContainText('Khách lớn tuổi');

  // Quầy: phiếu ghi "Nhân viên nhập"; bàn đang phục vụ có ghi chú; sửa ghi chú; thu tiền như bàn QR
  await P.goto('/pos');
  const ticket = P.locator('#col-PREPARING .ticket', { hasText: 'Bàn 04' });
  await expect(ticket).toContainText('Nhân viên nhập');
  await expect(ticket).toContainText('không đường');
  const row = P.locator('#tables .table-row', { hasText: 'Bàn 04' });
  await expect(row).toContainText('Khách lớn tuổi — ít đá');
  await row.getByRole('button', { name: 'Sửa ghi chú' }).click();
  await P.locator('.modal textarea').fill('Khách lớn tuổi — ít đá, đã thêm ghế');
  await P.locator('.modal').getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(row).toContainText('đã thêm ghế');
  await row.getByRole('button', { name: 'Thu tiền' }).click();
  await expect(P.locator('.drawer')).toContainText('Khách lớn tuổi');
  await expect(P.locator('.drawer .due span').last()).toHaveText('60.000đ');
  await P.fill('#amount-received', '100000');
  await P.locator('.drawer .modal-foot .btn-success').click();
  await expect(P.locator('.drawer')).toHaveCount(0);
  await expect(P.locator('#tables .table-row', { hasText: 'Bàn 04' })).toHaveCount(0);
});

test('gọi lại đơn lần trước + thời gian chờ: hội viên gắn SĐT → "Lần trước bạn gọi" → Gọi lại vào giỏ; giỏ + theo dõi hiện ETA (F-045, F-025)', async () => {
  await D.goto(`/t/${tables['05']}`);
  await expect(D).toHaveURL(/\/menu$/);
  await D.goto(`/t/${tables['05']}/track`);
  await D.locator('.member-box').click();
  await D.locator('input[type="tel"]').fill('0911222333');
  await D.getByRole('button', { name: 'Tiếp tục' }).click();
  await D.getByRole('button', { name: 'Xác nhận, đây là tôi' }).click();
  await expect(D.locator('.member-box.on')).toBeVisible();
  await D.goto(`/t/${tables['05']}/menu`);
  await expect(D.locator('.recall-card')).toContainText('Bánh croissant ×1');
  await D.getByRole('button', { name: 'Gọi lại' }).click();
  await expect(D.locator('.sheet .cart-line', { hasText: 'Bánh croissant' })).toBeVisible();
  await expect(D.locator('#cart-eta')).toContainText('Dự kiến có món sau khoảng');
  await D.locator('.sheet .modal-foot .btn-primary').click();
  await expect(D).toHaveURL(/\/track$/);
  await expect(D.locator('#eta')).toContainText('dự kiến xong sau khoảng');
  await P.goto('/pos');
  await expect(P.locator('#queue-eta')).toContainText(/Hàng chờ: \d+ món · khách mới chờ ~\d+–\d+ phút/);
  await P.locator('#col-PENDING .ticket', { hasText: 'Bánh croissant' }).getByRole('button', { name: 'Tiếp nhận & Hoàn tất' }).click();
  await P.locator('#tables .table-row', { hasText: 'Bàn 05' }).getByRole('button', { name: 'Thu tiền' }).click();
  await P.locator('.drawer .quick-cash .btn').first().click();
  await P.locator('.drawer .modal-foot .btn-success').click();
  await expect(P.locator('.drawer')).toHaveCount(0);
});

test('chia bill: 2 khách gộp bàn, mỗi người chọn món của mình; quầy thu từng phần, in bill riêng, thu xong phần cuối thì đóng bàn (F-026)', async () => {
  await newCustomer(phoneA);
  await A.goto(`/t/${tables['06']}`);
  await expect(A).toHaveURL(/\/menu$/);
  await A.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
  await A.click('#open-cart');
  await A.locator('.sheet .modal-foot .btn-primary').click();
  await expect(A).toHaveURL(/\/track$/);
  await newCustomer(phoneB);
  await B.goto(`/t/${tables['06']}`); // F-097: tự vào nhóm của bàn
  await B.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await B.click('#open-cart');
  await B.locator('.sheet .modal-foot .btn-primary').click();
  await expect(B).toHaveURL(/\/track$/);

  await A.click('#split-bill');
  await A.getByPlaceholder('Tên phần của bạn (ví dụ: Anh A)').fill('Anh A');
  await A.click('#create-split');
  // Q-023 (TASK-058): B đang gõ tên phần thì A nhận món → sheet của B tự vẽ lại; chữ đang gõ và focus phải còn nguyên
  await B.click('#split-bill');
  const nameB = B.getByPlaceholder('Tên phần của bạn (ví dụ: Anh A)');
  await nameB.click();
  await nameB.pressSequentially('Chị');
  await A.locator('.split-line', { hasText: 'Cà phê đen' }).getByRole('button', { name: 'Của tôi' }).click();
  await expect(A.locator('.split-line.mine')).toContainText('Cà phê đen');
  await expect(B.locator('.split-line', { hasText: 'Cà phê đen' })).toContainText('Anh A');
  await expect(nameB).toHaveValue('Chị');
  await expect(nameB).toBeFocused();
  await B.keyboard.type(' B');
  await expect(nameB).toHaveValue('Chị B');
  await B.click('#create-split');
  await B.locator('.split-line', { hasText: 'Nước suối' }).getByRole('button', { name: 'Của tôi' }).click();
  await expect(B.locator('.split-line', { hasText: 'Cà phê đen' })).toContainText('Anh A');

  await P.goto('/pos');
  const pending06 = P.locator('#col-PENDING .ticket', { hasText: 'Bàn 06' });
  await expect(pending06).toHaveCount(2);
  for (let k = 0; k < 2; k++) await pending06.first().getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
  await expect(pending06).toHaveCount(0);
  const row = P.locator('#tables .table-row', { hasText: 'Bàn 06' });
  await expect(row).toContainText('Chia 2 phần');
  await row.getByRole('button', { name: 'Thu tiền' }).click();
  await expect(P.locator('.drawer .split-block')).toContainText('Bàn chia bill: 2 phần');
  await P.locator('.drawer .split-card')
    .filter({ has: P.locator('strong', { hasText: /^Anh A$/ }) })
    .getByRole('button', { name: 'Thu phần này' })
    .click();
  await expect(P.locator('.drawer .due span').last()).toHaveText('25.000đ');
  await P.locator('.drawer .quick-cash .btn').first().click();
  await P.locator('.drawer .modal-foot .btn-success').click();
  await expect(P.locator('.toast', { hasText: 'Đã thu phần Anh A' })).toBeVisible();
  await expect(P.locator('.drawer .split-card').filter({ has: P.locator('strong', { hasText: /^Anh A$/ }) })).toContainText('Đã thu 25.000đ');
  await P.locator('.drawer .split-card')
    .filter({ has: P.locator('strong', { hasText: /^Chị B$/ }) })
    .getByRole('button', { name: 'Thu phần này' })
    .click();
  await expect(P.locator('.drawer .due span').last()).toHaveText('10.000đ');
  await P.locator('.drawer .quick-cash .btn').first().click();
  await P.locator('.drawer .modal-foot .btn-success').click();
  await expect(P.locator('.drawer')).toHaveCount(0);
  await expect(A.locator('.thanks')).toContainText('Đã thanh toán 2 phần, tổng 35.000đ');
});

test('kho nâng cao: Kho ở quầy mở thẻ Tồn kho, không còn Sơ chế (ADR-064); ghi phiếu hủy, nhận hàng theo đơn đặt hàng; quản lý xem đề xuất nhập + giá vốn thực tế (F-032, F-030, F-029, F-031)', async ({
  request,
}) => {
  const ingr = async (name, unit) => (await apiAs(request, 'post', '/api/admin/ingredients', { name, unit, stockQty: 0, lowStockThreshold: 0 })).ingredientId;
  const bean = await ingr('Hạt rang E2E', 'g');
  const water = await ingr('Nước E2E', 'ml');
  await apiAs(request, 'post', '/api/admin/stock-receipts', {
    lines: [
      { ingredientId: bean, qty: 1000, unitCost: 200 },
      { ingredientId: water, qty: 10000, unitCost: 1 },
    ],
  });
  const sup = await apiAs(request, 'post', '/api/admin/suppliers', {
    name: 'NCC E2E',
    items: [{ ingredientId: bean, packUnitCode: 'kg', isPreferred: true, lastPrice: 180000 }],
  });
  const po = await apiAs(request, 'post', '/api/admin/purchase-orders', { supplierId: sup.supplierId, lines: [{ ingredientId: bean, orderedPacks: 2 }] });
  await apiAs(request, 'post', `/api/admin/purchase-orders/${po.poId}/send`);

  await P.goto('/pos/stock');
  // ADR-064 D-254: không còn thẻ Sơ chế — Kho mở thẻ Tồn kho
  await expect(P.locator('#tabs button').first()).toHaveText('Tồn kho');
  await expect(P.locator('#tabs button').first()).toHaveAttribute('aria-selected', 'true');
  await expect(P.locator('#tabs')).not.toContainText('Sơ chế');

  await P.locator('#tabs button', { hasText: 'Hủy hàng' }).click();
  await P.locator('#waste-ing').selectOption(String(water));
  await P.fill('#waste-qty', '500');
  await P.click('#waste-go');
  await expect(P.locator('.toast', { hasText: 'Đã hủy 500 ml Nước E2E' })).toBeVisible();
  await expect(P.locator('#content table')).toContainText('Nước E2E');

  await P.locator('#tabs button', { hasText: 'Nhận hàng' }).click();
  await P.locator('.card', { hasText: 'NCC E2E' }).getByRole('button', { name: 'Nhận hàng' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Nhập kho' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã nhận đủ hàng' })).toBeVisible();

  await P.goto('/admin/purchasing');
  await expect(P.locator('#content table')).toContainText('Hạt rang E2E');
  await P.locator('.tabs button', { hasText: 'Đơn đặt hàng' }).click();
  await expect(P.locator('#content table')).toContainText('Đã nhận đủ');
  await P.goto('/admin/stock');
  await P.locator('.tabs button', { hasText: 'Giá vốn thực tế' }).click();
  await expect(P.locator('.kpi').first()).toContainText('Doanh thu món');
});

test('trưởng ca + sổ quỹ: trưởng ca chi tiền mua đá, duyệt khoản chi lớn ở màn Ca, thấy tab Kiểm kê; quản lý xem sổ quỹ, kéo ca trong lịch tuần, lãi/lỗ ước tính, nhật ký (F-036, F-033, F-035, F-034)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/users', { username: 'lead-e2e', password: 'Lead@123', fullName: 'Trưởng ca E2E', role: 'MANAGER' });
  const lead = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const L = await lead.newPage();
  watch(L, 'lead');
  await L.goto('/pos/login');
  await L.fill('#username', 'lead-e2e');
  await L.fill('#password', 'Lead@123');
  await L.click('#submit');
  await expect(L).toHaveURL(/\/pos$/);
  await L.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // F-061: tài khoản mới → hướng dẫn 5 bước lần đầu
  await expect(L.locator('.pos-top')).toContainText('Trưởng ca');

  // Trưởng ca ghi chi 50.000đ mua đá → duyệt ngay
  await L.goto('/pos/shift');
  await L.locator('.card', { hasText: 'Sổ quỹ trong ca' }).getByRole('button', { name: 'Chi tiền' }).click();
  await L.locator('.modal').getByRole('button', { name: 'Mua đá', exact: true }).click(); // TASK-081: danh mục là nút
  await L.fill('#cash-amount', '50000');
  await L.fill('#cash-reason', 'Mua 2 bao đá');
  await L.locator('.modal').getByRole('button', { name: 'Ghi khoản chi' }).click();
  await expect(L.locator('.toast', { hasText: 'Đã ghi 50.000đ' })).toBeVisible();
  await expect(L.locator('table.cash-book')).toContainText('Mua 2 bao đá');

  // Chủ quán bổ sung 1.000.000đ vào két (thu khác) rồi ghi khoản tạm ứng lương 800.000đ → chờ duyệt → trưởng ca duyệt trên màn Ca
  const categories = await apiAs(request, 'get', '/api/cash-categories');
  const catId = (name) => categories.find((c) => c.name === name).categoryId;
  await apiAs(request, 'post', '/api/cash-transactions', { categoryId: catId('Bổ sung tiền lẻ'), amount: 1000000, reason: 'Bổ sung két E2E' });
  const staff1Id = (await apiAs(request, 'get', '/api/admin/users')).find((u) => u.username === 'staff1').userId; // F-073: tạm ứng ghi người nhận
  const big = await apiAs(request, 'post', '/api/cash-transactions', {
    categoryId: catId('Lương tạm ứng'),
    amount: 800000,
    reason: 'Tạm ứng lương E2E',
    employeeId: staff1Id,
  });
  expect(big.status).toBe('PENDING');
  await L.reload();
  const row = L.locator('table.cash-book tr', { hasText: 'Tạm ứng lương E2E' });
  await expect(row).toContainText('Chờ duyệt');
  await row.getByRole('button', { name: 'Duyệt' }).click();
  await L.locator('.modal').getByRole('button', { name: 'Duyệt chi' }).click();
  await expect(L.locator('.toast', { hasText: 'Đã duyệt khoản chi' })).toBeVisible();
  await expect(L.locator('table.cash-book tr', { hasText: 'Tạm ứng lương E2E' })).toContainText('Đã duyệt');
  await expect(L.locator('.card', { hasText: 'Chấm công hôm nay' })).toContainText('Trưởng ca E2E');
  // F-071 (AC-071-05): trưởng ca không có nút Sửa trên dòng chấm công của chính mình; dòng của người khác vẫn sửa được
  const attendance = L.locator('.card', { hasText: 'Chấm công hôm nay' });
  await expect(attendance.locator('tr', { hasText: 'Trưởng ca E2E' }).getByRole('button', { name: 'Sửa' })).toHaveCount(0);
  await expect(attendance.locator('tbody tr', { hasNotText: 'Trưởng ca E2E' }).getByRole('button', { name: 'Sửa' }).first()).toBeVisible();

  // Trưởng ca có tab Kiểm kê ở Kho; không vào được trang quản lý bằng phiên máy quầy (ADR-044: phải đăng nhập trang Quản lý)
  await L.goto('/pos/stock');
  await expect(L.locator('#tabs button', { hasText: 'Kiểm kê' })).toBeVisible();
  await L.goto('/admin/cash');
  await expect(L).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fcash/);

  // Quản lý: sổ quỹ
  await P.goto('/admin/cash');
  await expect(P.locator('table.cash-book')).toContainText('Mua 2 bao đá');
  await expect(P.locator('.kpi', { hasText: 'Đã chi' })).toContainText('850.000đ');

  // Quản lý: kéo ca của trưởng ca từ thứ Hai sang thứ Ba (cùng tuần)
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
  const tuesday = new Date(Date.parse(`${monday}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10);
  const leadId = (await apiAs(request, 'get', '/api/admin/users')).find((u) => u.username === 'lead-e2e').userId;
  await apiAs(request, 'post', '/api/admin/rosters', { userId: leadId, workDate: monday, startTime: '07:00', endTime: '15:00' });
  await P.goto('/admin/staff');
  await P.locator('.tabs button', { hasText: 'Lịch làm tuần' }).click();
  const chip = P.locator(`td.roster-cell[data-user-id="${leadId}"][data-date="${monday}"] .roster-chip`);
  await expect(chip).toContainText('07:00–15:00');
  await chip.dragTo(P.locator(`td.roster-cell[data-user-id="${leadId}"][data-date="${tuesday}"]`));
  await expect(P.locator('.toast', { hasText: 'Đã chuyển ca 07:00–15:00' })).toBeVisible();
  await expect(P.locator(`td.roster-cell[data-user-id="${leadId}"][data-date="${tuesday}"] .roster-chip`)).toContainText('07:00–15:00');

  // Quản lý: lãi/lỗ ước tính + nhật ký thao tác
  await P.goto('/admin/pnl');
  await expect(P.locator('.pnl-note')).toContainText('ước tính');
  await P.locator('.pnl-detail > summary').click(); // TASK-080: biểu đồ nằm trong "Xem chi tiết"
  await expect(P.locator('svg.pnl-chart')).toBeVisible();
  // TASK-069: Tab vào biểu đồ + phím mũi tên → hộp số liệu ngày (3 chuỗi + lợi nhuận)
  await P.locator('svg.pnl-chart').focus();
  await P.keyboard.press('ArrowLeft');
  await expect(P.locator('.chart-tip')).toContainText('Lãi / lỗ');
  await P.keyboard.press('Escape'); // WCAG 1.4.13: Esc ẩn hộp số liệu
  await expect(P.locator('.chart-tip')).toBeHidden();
  await expect(P.locator('.pnl-flow')).toContainText('lợi nhuận hoạt động');
  await P.goto('/admin/audit');
  await expect(P.locator('#content table')).toContainText('cash.approve');
  await P.locator('#content tr', { hasText: 'cash.approve' }).first().getByRole('button', { name: 'Chi tiết' }).click();
  await expect(P.locator('.drawer pre.json').first()).toContainText('PENDING');

  // Trưởng ca đăng xuất → kết thúc chấm công
  await L.goto('/pos');
  await L.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(L).toHaveURL(/\/pos\/login/);
  const att = await apiAs(request, 'get', `/api/attendance?from=${today}&to=${today}&userId=${leadId}`);
  expect(att.length).toBe(1);
  expect(att[0].clockOut).not.toBeNull();
  await lead.close();
});

test('CRM: quầy đăng ký khách mới có người giới thiệu, thấy điểm/tem dự kiến; thu lần đầu → tặng 2 voucher; người giới thiệu dùng voucher; quản lý chạy chiến dịch xuất danh sách (F-039, F-038, F-037)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/stamp-programs', { name: 'Thẻ cà phê E2E', requiredStamps: 10, menuItemIds: [ids['Cà phê đen']] });
  await apiAs(request, 'post', '/api/admin/rewards', { name: 'Giảm 5.000đ', pointsCost: 10, rewardType: 'DISCOUNT', discountAmount: 5000 });
  await apiAs(request, 'post', '/api/members', { phone: '0933000111', fullName: 'Người Giới Thiệu', consent: true });

  // Khách mới, có người giới thiệu
  await P.goto('/pos/takeaway');
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.locator('details.billing summary').click();
  await P.fill('input[aria-label="SĐT hội viên"]', '0933000222');
  await P.getByRole('button', { name: 'Tra cứu' }).click();
  await P.fill('input[aria-label="Họ tên khách"]', 'Khách Mới E2E');
  await P.fill('input[aria-label="SĐT người giới thiệu"]', '0933000111');
  await P.locator('details.billing .alert input[type="checkbox"]').check();
  await P.locator('details.billing').getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(P.locator('.toast', { hasText: 'có người giới thiệu' })).toBeVisible();
  await expect(P.locator('details.billing .loyalty-info')).toContainText('0 điểm');
  await expect(P.locator('details.billing .loyalty-info')).toContainText('còn 10 ly nữa được tặng');
  await expect(P.locator('details.billing .earn-note')).toHaveText('Lượt này tích +4 điểm, +2 tem'); // 50.000 − 10 % đơn đầu = 45.000
  await P.fill('#received', '100000');
  await P.click('#pay');
  await expect(P.locator('.toast', { hasText: 'Đã tặng 2 voucher giới thiệu' })).toBeVisible();

  // Người giới thiệu dùng voucher vừa nhận
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click(); // món không có tùy chọn size
  await P.locator('details.billing').evaluate((d) => (d.open = true)); // khung có thể đang mở sẵn
  await P.fill('input[aria-label="SĐT hội viên"]', '0933000111');
  await P.getByRole('button', { name: 'Tra cứu' }).click();
  const voucherBtn = P.locator('details.billing .loyalty-slot button', { hasText: '−10%' });
  await expect(voucherBtn).toBeVisible();
  await voucherBtn.click();
  await expect(P.locator('#breakdown')).toContainText('Voucher GT');
  await P.fill('#received', '100000');
  await P.click('#pay');
  await expect(P.locator('.toast', { hasText: 'tiền thừa 80.000đ' })).toBeVisible(); // 25.000 − 10 % đơn đầu − voucher 10 % = 20.250 → làm tròn 20.000

  // Quản lý: quà, voucher, chiến dịch xuất danh sách
  const seg = await apiAs(request, 'post', '/api/admin/segments', { name: 'Mọi hội viên E2E', rule: {} });
  await apiAs(request, 'post', '/api/admin/campaigns', {
    name: 'Chào tháng mới',
    segmentId: seg.segmentId,
    channel: 'EXPORT',
    messageTemplate: 'Chào {name}!',
  });
  await P.goto('/admin/loyalty');
  await expect(P.locator('#content table')).toContainText('Giảm 5.000đ');
  await P.locator('.tabs button', { hasText: 'Voucher' }).click();
  await expect(P.locator('#content table')).toContainText('Giới thiệu bạn');
  await P.locator('.tabs button', { hasText: 'Phân khúc & chiến dịch' }).click();
  await P.locator('#content tr', { hasText: 'Chào tháng mới' }).getByRole('button', { name: 'Chạy ngay' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã chạy' })).toBeVisible();
  await expect(P.locator('.drawer')).toContainText('Trong file xuất');
  await expect(P.locator('.drawer').getByRole('button', { name: /Tải danh sách/ })).toBeVisible();
});

test('bỏ trang Phân tích: /admin/analytics chuyển về Thu chi, thanh bên và Cài đặt không còn "Phân tích"; dashboard: trưởng ca mở "Hôm nay" trên điện thoại không cuộn ngang, không thấy lãi (F-042 AC-042-06, F-043)', async ({
  request,
}) => {
  // TASK-111 (ADR-052): trang Phân tích đã bỏ — địa chỉ cũ về Thu chi; API phân tích vẫn chạy cho chủ quán
  await P.goto('/admin/analytics');
  await expect(P).toHaveURL(/\/admin\/pnl$/);
  await expect(P.locator('#page-title')).toHaveText('Thu chi');
  const side = P.locator('#side');
  await expect(side.locator('a[href="/admin/pnl"]')).toHaveCount(1);
  await expect(side.locator('a[href="/admin/analytics"]')).toHaveCount(0);
  await expect(side).not.toContainText('Phân tích');
  await P.goto('/admin/settings');
  await expect(P.getByRole('checkbox', { name: /^Thu chi/ })).toHaveCount(1);
  await expect(P.locator('#content')).not.toContainText('Phân tích & thu chi');
  expect(Array.isArray((await apiAs(request, 'get', '/api/admin/reports/menu-engineering')).items)).toBe(true); // API giữ (ADR-052)

  await P.goto('/admin/today');
  await expect(P.locator('.today-card', { hasText: 'Doanh thu hôm qua' })).toContainText('Lãi gộp ước tính');
  await P.getByRole('button', { name: 'Tính lại hôm nay' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã tính lại' })).toBeVisible();

  const phone = await browser.newContext(phoneOpts);
  const M = await phone.newPage();
  watch(M, 'lead-phone');
  await M.goto('/admin/login'); // ADR-044: trang Quản lý đăng nhập riêng (không qua phiên máy quầy)
  await M.fill('#username', 'lead-e2e');
  await M.fill('#password', 'Lead@123');
  await M.click('#submit');
  await expect(M).toHaveURL(/\/admin\/today$/);
  await expect(M.locator('.today-card', { hasText: 'Doanh thu hôm qua' })).toBeVisible();
  await expect(M.locator('body')).not.toContainText('Lãi gộp');
  await expect(M.locator('.today-todo')).toContainText('Việc cần làm');
  expect(await M.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await phone.close();
});

test('sửa / xóa món + hủy bàn: nhân viên giảm món đã tiếp nhận cần trưởng ca duyệt, có lịch sử; hủy bàn → bàn trống lại (F-046)', async () => {
  // Máy quầy riêng đăng nhập nhân viên (P lúc này đang là quản lý — quản lý tự duyệt, không cần nhập tài khoản)
  const staffCtx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const S = await staffCtx.newPage();
  watch(S, 'staff');
  await S.goto('/pos/login');
  await S.fill('#username', 'staff1');
  await S.fill('#password', 'Staff@123');
  await S.click('#submit');
  await expect(S).toHaveURL(/\/pos$/);

  await S.goto('/pos/table-order');
  await S.locator('.table-chip[data-table="03"]').click();
  await expect(S.locator('#target')).toContainText('Bàn trống');
  await S.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await S.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await S.locator('#tabs .chip', { hasText: 'Trà & đồ uống khác' }).click();
  await S.locator('.tile', { hasText: 'Nước suối' }).click();
  await S.click('#send');
  await expect(S.locator('.toast', { hasText: 'Đang pha' })).toBeVisible();

  await S.goto('/pos');
  await S.locator('#tables .table-row', { hasText: 'Bàn 03' }).getByRole('button', { name: 'Thu tiền' }).click();
  const drawer = S.locator('.drawer');
  await expect(drawer.locator('.due span').last()).toHaveText('60.000đ');
  // ✎ Cà phê đen 2 → 1: đơn đã tiếp nhận → nhân viên cần trưởng ca nhập tài khoản
  await drawer.getByRole('button', { name: 'Sửa Cà phê đen' }).click();
  const dlg = S.locator('.modal');
  await expect(dlg.locator('input[aria-label="Số lượng mới"]')).toHaveValue('1');
  await expect(dlg.locator('.approval')).toBeVisible();
  await dlg.getByRole('button', { name: 'Khách đổi ý' }).click();
  await dlg.getByRole('button', { name: 'Lưu số lượng' }).click();
  await expect(dlg.locator('.alert.danger')).toContainText('trưởng ca');
  await dlg.locator('input[aria-label="Tên đăng nhập người duyệt"]').fill('lead-e2e');
  await dlg.locator('input[aria-label="Mật khẩu người duyệt"]').fill('Lead@123');
  await dlg.getByRole('button', { name: 'Lưu số lượng' }).click();
  await expect(S.locator('.toast', { hasText: 'Đã sửa Cà phê đen' })).toBeVisible();
  await expect(drawer.locator('.due span').last()).toHaveText('35.000đ');
  await drawer.locator('.void-history summary').click();
  await expect(drawer.locator('.void-history')).toContainText('−1 × Cà phê đen');
  await expect(drawer.locator('.void-history')).toContainText('duyệt: Trưởng ca E2E');

  // Hủy bàn: hủy đơn chưa thu, đóng phiên, bàn biến khỏi danh sách đang phục vụ
  await drawer.getByRole('button', { name: 'Việc khác' }).click(); // TASK-129: việc phụ của bàn nằm sau "Việc khác"
  await drawer.getByRole('button', { name: 'Hủy bàn' }).click();
  await dlg.getByRole('button', { name: 'Khách bỏ về' }).click();
  await dlg.locator('input[aria-label="Tên đăng nhập người duyệt"]').fill('lead-e2e');
  await dlg.locator('input[aria-label="Mật khẩu người duyệt"]').fill('Lead@123');
  await dlg.getByRole('button', { name: 'Hủy bàn' }).click();
  await expect(S.locator('.toast', { hasText: 'Đã hủy Bàn 03' })).toBeVisible();
  await expect(S.locator('.drawer')).toHaveCount(0);
  await expect(S.locator('#tables .table-row', { hasText: 'Bàn 03' })).toHaveCount(0);
  await expect(S.locator('#col-PREPARING .ticket', { hasText: 'Bàn 03' })).toHaveCount(0);
  await staffCtx.close();
});

test('hội viên tại bàn + thẻ thành viên: nhân viên đăng ký nhanh & gắn SĐT ở Gọi món tại bàn; khách cùng bàn xem Thẻ thành viên; bill in điểm (F-047)', async ({
  request,
}) => {
  const staffCtx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const S = await staffCtx.newPage();
  watch(S, 'staff-047');
  await S.goto('/pos/login');
  await S.fill('#username', 'staff1');
  await S.fill('#password', 'Staff@123');
  await S.click('#submit');
  await expect(S).toHaveURL(/\/pos$/);

  // Bàn 01 trống: SĐT chưa có → đăng ký nhanh (phải tick khách đồng ý) → mở bàn & gắn
  await S.goto('/pos/table-order');
  await S.locator('.table-chip[data-table="01"]').click();
  await expect(S.locator('#target')).toContainText('Bàn trống');
  await S.fill('#member-phone', '0909876543');
  await S.click('#member-lookup');
  await expect(S.locator('#member-msg')).toContainText('chưa là hội viên');
  await S.locator('#member-msg input[aria-label="Họ tên khách"]').fill('Trần Thị Bình');
  await S.locator('#member-msg')
    .getByRole('button', { name: /Đăng ký/ })
    .click();
  await expect(S.locator('.toast', { hasText: 'Cần khách đồng ý' })).toBeVisible();
  await S.locator('#member-msg input[aria-label="Khách đồng ý"]').check();
  await S.locator('#member-msg')
    .getByRole('button', { name: /Đăng ký/ })
    .click();
  await expect(S.locator('.toast', { hasText: 'Đã gắn hội viên Trần Thị Bình vào Bàn 01' })).toBeVisible();
  await expect(S.locator('#member-box .member-on')).toContainText('Trần Thị Bình');
  await expect(S.locator('#target')).toContainText('Đang phục vụ');
  const sessionId = new URL(S.url()).searchParams.get('session');
  expect(sessionId).toBeTruthy();

  // Khách quét QR Bàn 01 → gộp nhóm → theo dõi đơn: khung hội viên + Thẻ thành viên (tên che, không có mã voucher)
  const phone = await browser.newContext(phoneOpts);
  const E = await phone.newPage();
  watch(E, 'E');
  await E.goto(`/t/${tables['01']}`); // F-097: tự vào nhóm của bàn
  await expect(E).toHaveURL(/\/menu$/);
  await E.goto(`/t/${tables['01']}/track`);
  await expect(E.locator('.member-box.on')).toContainText('Trần T. B.');
  await E.click('#open-member-card');
  const card = E.locator('.sheet .member-card');
  await expect(card).toContainText('Trần T. B.');
  await expect(card).toContainText('09xx***543');
  await expect(card).toContainText('Lịch sử điểm gần đây');
  expect(await E.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);

  // Nhân viên gọi món + thu tiền → bill in khối Thẻ thành viên
  await S.locator('#tabs .chip', { hasText: 'Trà & đồ uống khác' }).click();
  await S.locator('.tile', { hasText: 'Nước suối' }).click();
  await S.click('#send');
  await expect(S.locator('.toast', { hasText: 'Đang pha' })).toBeVisible();
  await apiAs(request, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 100000 });
  await S.goto(`/pos/sessions/${sessionId}/receipt?mode=final`);
  await expect(S.locator('.receipt')).toContainText('THẺ THÀNH VIÊN (lúc in)');
  await expect(S.locator('.receipt')).toContainText('Điểm hiện có');
  await Promise.all([staffCtx.close(), phone.close()]);
});

test('giỏ còn sau khi tải lại trang; khách rớt mạng lúc đơn hoàn tất → có mạng lại tự cập nhật; phiếu pha + phiếu tạm tính ghi tùy chọn, có chữ TẠM TÍNH (AC-002-04, AC-004-02, AC-013-04, AC-006-04)', async ({
  request,
}) => {
  const phone = await browser.newContext(phoneOpts);
  const G = await phone.newPage();
  watch(G, 'G');
  await G.goto(`/t/${tables['03']}`);
  await expect(G).toHaveURL(/\/menu$/);
  // AC-002-04: 2 món (1 có tùy chọn Size L, 1 có ghi chú) → tải lại trang → giỏ còn nguyên
  const bx = G.locator('.c-section.cat .c-item', { hasText: 'Bạc xỉu' });
  await bx.getByRole('button', { name: /Chọn size/ }).click();
  await G.locator('.opt-row', { hasText: 'Size L' }).click();
  await G.getByRole('button', { name: 'Thêm vào giỏ' }).click();
  await G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await G.click('#open-cart');
  // F-082: ghi chú sửa bằng cách bấm vào món trong giỏ → bảng chọn → Cập nhật
  await G.locator('.sheet .cart-line', { hasText: 'Nước suối' }).locator('.cart-line-main').click();
  await G.locator('#item-note').fill('không lạnh');
  await G.locator('[role="dialog"]', { has: G.locator('.item-sheet') })
    .locator('.modal-foot .btn-primary')
    .click();
  await expect(G.locator('.item-sheet')).toHaveCount(0);
  const total = (await G.locator('.sheet .cart-total').innerText()).match(/[\d.]+đ/)[0];
  await G.keyboard.press('Escape');
  await G.reload();
  await G.click('#open-cart');
  await expect(G.locator('.sheet .cart-line', { hasText: 'Bạc xỉu' })).toContainText('Size L');
  await expect(G.locator('.sheet .cart-line', { hasText: 'Nước suối' })).toContainText('Ghi chú: không lạnh');
  await expect(G.locator('.sheet .cart-total')).toContainText(total);
  await G.locator('.sheet .modal-foot .btn-primary').click();
  await expect(G).toHaveURL(/\/track$/);
  const sessionId = await G.evaluate(async (qr) => {
    const r = await globalThis.fetch('/api/sessions/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken: qr }),
    });
    return (await r.json()).session.sessionId;
  }, tables['03']);

  // AC-013-04: phiếu pha ở quầy ghi tùy chọn + ghi chú; AC-006-04: phiếu tạm tính có chữ TẠM TÍNH và ghi tùy chọn
  await P.goto('/pos');
  const ticket = P.locator('#col-PENDING .ticket', { hasText: 'Bàn 03' });
  await expect(ticket).toContainText('Size L');
  await expect(ticket).toContainText('không lạnh');
  await P.goto(`/pos/sessions/${sessionId}/receipt?mode=provisional`);
  await expect(P.locator('.receipt')).toContainText('TẠM TÍNH');
  await expect(P.locator('.receipt')).toContainText('Size L');

  // AC-004-02: khách rớt mạng trong lúc quầy hoàn tất đơn → có mạng lại, thẻ đơn tự chuyển "đã xong", không tải lại trang
  const detail = await apiAs(request, 'get', `/api/sessions/${sessionId}`);
  const orderId = detail.orders[0].orderId;
  await apiAs(request, 'post', `/api/orders/${orderId}/accept`);
  await expect(G.locator('#main')).toContainText('Đang chuẩn bị');
  await G.evaluate(() => (globalThis.__noReload = true));
  await phone.setOffline(true);
  await expect(G.locator('#offline')).toBeVisible({ timeout: 25_000 });
  await apiAs(request, 'post', `/api/orders/${orderId}/complete`);
  await phone.setOffline(false);
  await expect(G.locator('#offline')).toBeHidden({ timeout: 25_000 });
  await expect(G.locator('#main')).toContainText(/Đã xong, vui lòng nhận tại quầy/i, { timeout: 2000 }); // ≤ 2 s sau khi có mạng lại (NFR-001)
  expect(await G.evaluate(() => globalThis.__noReload === true)).toBe(true);
  await phone.close();
});

test('thực đơn trống / lỗi mạng khi tải menu → thông báo rõ, nút "Thử lại" tải lại được (AC-002-06)', async () => {
  const phone = await browser.newContext(phoneOpts);
  const M = await phone.newPage();
  watch(M, 'M');
  // Thực đơn rỗng (giả lập phản hồi /api/menu không có món)
  await M.route('**/api/menu', async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    await route.fulfill({ response: res, json: { ...json, categories: [], combos: [], suggested: [] } });
  });
  await M.goto(`/t/${tables['05']}`);
  await expect(M).toHaveURL(/\/menu$/);
  await expect(M.locator('#menu')).toContainText('Quán chưa có món nào trên thực đơn.');
  // Lỗi mạng khi tải menu → thông báo + "Thử lại"; có mạng lại → bấm Thử lại tải được menu
  await M.unroute('**/api/menu');
  await M.route('**/api/menu', (route) => route.abort('internetdisconnected'));
  await M.reload();
  const retry = M.locator('#menu').getByRole('button', { name: 'Thử lại' });
  await expect(retry).toBeVisible();
  await M.unroute('**/api/menu');
  await retry.click();
  await expect(M.locator('#menu .c-item', { hasText: 'Nước suối' })).toBeVisible();
  await phone.close();
});

test('sửa / hủy phiếu nhập kho và phiếu kiểm kê: quản lý sửa số lượng rồi hủy phiếu nhập; kiểm kê nháp sửa / xóa ngay trên danh sách, phiếu đã chốt hủy được (F-048, AC-048-11)', async ({
  request,
}) => {
  const id = (await apiAs(request, 'post', '/api/admin/ingredients', { name: 'Sữa sửa phiếu E2E', unit: 'ml', stockQty: 0, lowStockThreshold: 0 }))
    .ingredientId;
  const stockOf = async () => Number((await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.ingredientId === id).stockQty);
  const rowOf = (no) => P.locator('#content tbody tr').filter({ has: P.locator('td.mono', { hasText: new RegExp(`^#${no}$`) }) });
  const rc = await apiAs(request, 'post', '/api/admin/stock-receipts', { supplier: 'NCC sửa E2E', lines: [{ ingredientId: id, qty: 1000, unitCost: 30 }] });

  // Phiếu nhập: Sửa (bắt buộc lý do) → "Đã sửa", tồn 800
  await P.goto('/admin/stock');
  const receipt = rowOf(rc.receiptId);
  await receipt.getByRole('button', { name: `Chi tiết phiếu nhập #${rc.receiptId}` }).click();
  await P.locator('.modal').getByRole('button', { name: 'Sửa', exact: true }).click();
  const form = P.locator('.modal', { hasText: `Sửa phiếu nhập #${rc.receiptId}` });
  await form.getByLabel('Số lượng').fill('800');
  await form.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(P.locator('.toast', { hasText: 'Nhập lý do sửa phiếu' })).toBeVisible();
  await form.getByLabel('Lý do sửa (bắt buộc)').fill('Sai số lượng theo hóa đơn');
  await form.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(P.locator('.toast', { hasText: `Đã sửa phiếu nhập #${rc.receiptId}` })).toBeVisible();
  await expect(receipt).toContainText('Đã sửa');
  expect(await stockOf()).toBe(800);

  // Hủy phiếu (hỏi lý do) → "Đã hủy", dòng gạch, tồn trừ lại
  await receipt.getByRole('button', { name: `Chi tiết phiếu nhập #${rc.receiptId}` }).click();
  await P.locator('.modal').getByRole('button', { name: 'Hủy phiếu' }).click();
  const ask = P.locator('.modal', { hasText: `Hủy phiếu nhập #${rc.receiptId}?` });
  await ask.getByLabel('Lý do (bắt buộc)').fill('Nhập nhầm phiếu');
  await ask.getByRole('button', { name: 'Hủy phiếu' }).click();
  await expect(P.locator('.toast', { hasText: `Đã hủy phiếu nhập #${rc.receiptId}` })).toBeVisible();
  await expect(receipt).toContainText('Đã hủy');
  await expect(receipt).toHaveClass(/voided/);
  expect(await stockOf()).toBe(0);
  await receipt.getByRole('button', { name: `Chi tiết phiếu nhập #${rc.receiptId}` }).click();
  await expect(P.locator('.modal')).toContainText('Lý do: Nhập nhầm phiếu');
  await expect(P.locator('.modal').getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
  await P.locator('.modal-foot').getByRole('button', { name: 'Đóng' }).click();

  // Kiểm kê nháp: Sửa (ghi chú) và Xóa ngay trên danh sách
  await apiAs(request, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: id, qty: 500, unitCost: 30 }] });
  const draft = (await apiAs(request, 'post', '/api/admin/stocktakes', { ingredientIds: [id], note: 'Nháp E2E' })).stocktakeId;
  await P.locator('.tabs button', { hasText: 'Kiểm kê' }).click();
  const draftRow = rowOf(draft);
  await draftRow.getByRole('button', { name: 'Sửa' }).click();
  const edit = P.locator('.modal', { hasText: `Sửa phiếu kiểm kê #${draft}` });
  await edit.getByLabel('Ghi chú').fill('Kiểm cuối tuần E2E');
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(P.locator('.toast', { hasText: `Đã sửa phiếu kiểm kê #${draft}` })).toBeVisible();
  expect((await apiAs(request, 'get', `/api/admin/stocktakes/${draft}`)).note).toBe('Kiểm cuối tuần E2E');
  await draftRow.getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(P.locator('.toast', { hasText: `Đã xóa phiếu kiểm kê #${draft}` })).toBeVisible();
  await expect(draftRow).toHaveCount(0);

  // Phiếu đã chốt (đếm thiếu 50) → Hủy phiếu → tồn trở lại 500, nhãn "Đã hủy"
  const st = (await apiAs(request, 'post', '/api/admin/stocktakes', { ingredientIds: [id] })).stocktakeId;
  await apiAs(request, 'put', `/api/admin/stocktakes/${st}/lines`, [{ ingredientId: id, countedQty: 450 }]);
  await apiAs(request, 'post', `/api/admin/stocktakes/${st}/post`);
  expect(await stockOf()).toBe(450);
  await P.locator('.tabs button', { hasText: 'Nhập kho' }).click();
  await P.locator('.tabs button', { hasText: 'Kiểm kê' }).click();
  await rowOf(st).getByRole('button', { name: 'Hủy phiếu' }).click();
  const askSt = P.locator('.modal', { hasText: `Hủy phiếu kiểm kê #${st}?` });
  await askSt.getByLabel('Lý do (bắt buộc)').fill('Đếm nhầm kệ');
  await askSt.getByRole('button', { name: 'Hủy phiếu' }).click();
  await expect(P.locator('.toast', { hasText: `Đã hủy phiếu kiểm kê #${st}` })).toBeVisible();
  await expect(rowOf(st)).toContainText('Đã hủy');
  await expect(rowOf(st).getByRole('button', { name: 'Hủy phiếu' })).toHaveCount(0);
  expect(await stockOf()).toBe(500);
});

test('chuyển bàn: quầy chuyển nhóm sang bàn khác → thẻ đơn hiện bàn mới; điện thoại khách tự sang bàn mới và gọi thêm được; khách quét QR bàn mới thấy nhóm để Gộp (F-049, AC-049-05)', async ({
  request,
}) => {
  const t1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'CB1', name: 'Bàn CB1' });
  const t2 = await apiAs(request, 'post', '/api/admin/tables', { code: 'CB2', name: 'Bàn CB2' });
  const order = async () => {
    await D.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
    await D.click('#open-cart');
    await D.locator('.sheet .modal-foot .btn-primary').click();
  };
  await newCustomer(phoneD);
  await D.goto(`/t/${t1.qrToken}`);
  await expect(D).toHaveURL(/\/menu$/);
  await order();
  await expect(D).toHaveURL(new RegExp(`/t/${t1.qrToken}/track$`));
  await expect(D.locator('#table')).toHaveText('Bàn CB1');

  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  await P.getByRole('button', { name: 'Chuyển bàn Bàn CB1' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Chuyển sang Bàn CB2' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã chuyển nhóm từ Bàn CB1 sang Bàn CB2' })).toBeVisible();
  // Tên bàn của thẻ đơn là bàn mới, không còn thẻ nào ở bàn cũ; F-087: thẻ có nhãn "Đổi bàn: ~~Bàn CB1~~ → Bàn CB2" (bàn cũ gạch ngang)
  await expect(P.locator('#col-PENDING .ticket .where', { hasText: 'Bàn CB2' })).toBeVisible();
  await expect(P.locator('#col-PENDING .ticket .where', { hasText: 'Bàn CB1' })).toHaveCount(0);
  await expect(P.locator('#col-PENDING .ticket', { hasText: 'Bàn CB2' }).locator('.move-flag')).toContainText('Đổi bàn: Bàn CB1 → Bàn CB2');
  await expect(P.getByText('Chuyển từ Bàn CB1')).toBeVisible();

  // Điện thoại khách đang mở trang theo dõi đơn: tự chuyển sang bàn mới, có thông báo
  await expect(D).toHaveURL(new RegExp(`/t/${t2.qrToken}/track$`), { timeout: 5000 });
  await expect(D.locator('#table')).toHaveText('Bàn CB2');
  await expect(D.locator('.toast', { hasText: 'Nhóm của bạn đã chuyển sang Bàn CB2' })).toBeVisible();
  await D.goto(`/t/${t2.qrToken}/menu`);
  await order();
  await expect(D).toHaveURL(new RegExp(`/t/${t2.qrToken}/track$`));
  await expect(D.locator('.order-card')).toHaveCount(2);
  // Khách khác quét QR bàn mới → thấy nhóm này để Gộp chung
  await newCustomer(phoneA);
  await A.goto(`/t/${t2.qrToken}`); // F-097: tự vào nhóm của bàn mới
  await expect(A).toHaveURL(/\/menu$/);
  await expect(A.locator('#table')).toHaveText('Bàn CB2');

  // Điện thoại KHÔNG mở trang lúc chuyển bàn (bỏ lỡ hẳn sự kiện) → mở lại URL bàn cũ vẫn tự sang bàn mới
  const s = (await apiAs(request, 'get', '/api/tables')).find((t) => t.code === 'CB2').sessions[0];
  await A.goto('about:blank');
  await apiAs(request, 'post', `/api/sessions/${s.sessionId}/move`, { toTableId: t1.tableId });
  await A.goto(`/t/${t2.qrToken}/menu`);
  await expect(A).toHaveURL(new RegExp(`/t/${t1.qrToken}/menu$`), { timeout: 5000 });
  await expect(A.locator('#table')).toHaveText('Bàn CB1');

  // Màn Gọi món tại bàn đang soạn món cho nhóm thì nhóm bị chuyển ở máy khác → đi theo nhóm, món đang soạn chuyển theo, gửi đúng bàn mới
  await P.goto(`/pos/table-order?table=${t1.tableId}&session=${s.sessionId}`);
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await expect(P.locator('#total')).toHaveText('25.000đ');
  await apiAs(request, 'post', `/api/sessions/${s.sessionId}/move`, { toTableId: t2.tableId });
  await expect(P.locator('.toast', { hasText: 'Nhóm đã chuyển từ Bàn CB1 sang Bàn CB2' })).toBeVisible();
  await expect(P.locator('.table-chip[data-table="CB2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(P.locator('#total')).toHaveText('25.000đ');
  await P.click('#send');
  await expect(P.locator('.toast', { hasText: 'Đang pha' })).toBeVisible();
  const after = await apiAs(request, 'get', '/api/tables');
  expect(after.find((t) => t.code === 'CB1').sessions).toHaveLength(0);
  expect(after.find((t) => t.code === 'CB2').sessions.map((x) => [x.sessionId, x.orderCount])).toEqual([[s.sessionId, 3]]);

  // dọn: hủy nhóm để không ảnh hưởng test sau
  await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'dọn test E2E', stockMode: 'WASTE' });
});

test('sổ quỹ: hủy / sửa khoản đã duyệt ở màn Ca — khoản thành "Đã hủy", tiền dự kiến trong két tính lại; Sửa mở form điền sẵn → khoản mới thay thế (F-050, AC-050-05)', async ({
  request,
}) => {
  const cats = Object.fromEntries((await apiAs(request, 'get', '/api/cash-categories')).map((c) => [c.name, c.categoryId]));
  const expected = async () => (await apiAs(request, 'get', '/api/shifts/current')).shift.expectedCash;
  const t = await apiAs(request, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 40000, reason: 'đá E2E hủy' });
  const e0 = await expected();
  await P.goto('/pos/shift');
  await P.getByRole('button', { name: `Hủy khoản #${t.cashTxnId}` }).click();
  const ask = P.locator('.modal', { hasText: `Hủy khoản chi #${t.cashTxnId}` });
  await ask.getByRole('button', { name: 'Hủy khoản' }).click();
  await expect(ask.locator('.field-error')).toHaveText('Nhập lý do hủy');
  await ask.getByLabel('Lý do hủy (bắt buộc)').fill('ghi trùng');
  await ask.getByRole('button', { name: 'Hủy khoản' }).click();
  await expect(P.locator('.toast', { hasText: `Đã hủy khoản #${t.cashTxnId}` })).toBeVisible();
  const row = P.locator('tr', { hasText: 'đá E2E hủy' });
  await expect(row).toContainText('Đã hủy');
  await expect(row).toHaveClass(/voided/);
  await expect(row.getByRole('button', { name: `Sửa khoản #${t.cashTxnId}` })).toHaveCount(0);
  expect(await expected()).toBe(e0 + 40000);

  const t2 = await apiAs(request, 'post', '/api/cash-transactions', { categoryId: cats['Mua đá'], amount: 30000, reason: 'đá E2E sửa' });
  await P.reload();
  await P.getByRole('button', { name: `Sửa khoản #${t2.cashTxnId}` }).click();
  const form = P.locator('.modal', { hasText: `Sửa khoản chi #${t2.cashTxnId}` });
  await expect(form.getByLabel('Nội dung khoản mới')).toHaveValue('đá E2E sửa');
  await form.getByLabel('Số tiền mới').fill('35000');
  await form.getByLabel('Lý do sửa (bắt buộc)').fill('ghi thiếu 5.000đ');
  await form.getByRole('button', { name: 'Lưu khoản mới' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã sửa: khoản mới #' })).toBeVisible();
  await expect(P.locator('tr', { hasText: `đá E2E sửa (thay khoản #${t2.cashTxnId})` })).toContainText('Đã duyệt');
  expect(await expected()).toBe(e0 + 40000 - 35000);
});

test('đánh giá sau khi dùng món: thu tiền xong khách chấm sao từng món + góp ý; quầy có dải "Đánh giá thấp", bấm Đã xử lý; menu hiện sao; trang Đánh giá món của quản lý (F-051, AC-051-06)', async ({
  request,
}) => {
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'DG1', name: 'Bàn DG1' });
  await newCustomer(phoneD);
  await D.goto(`/t/${t.qrToken}`);
  await expect(D).toHaveURL(/\/menu$/);
  await D.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await D.click('#open-cart');
  await D.locator('.sheet .modal-foot .btn-primary').click();
  await expect(D).toHaveURL(/\/track$/);

  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  const sid = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'DG1').sessions[0].sessionId;
  const detail = await apiAs(request, 'get', `/api/sessions/${sid}`);
  await apiAs(request, 'post', `/api/orders/${detail.orders[0].orderId}/accept`);
  await apiAs(request, 'post', `/api/sessions/${sid}/settle`, { amountReceived: 100000 });

  // Màn cảm ơn có khung đánh giá các món của nhóm
  await expect(D.getByRole('heading', { name: 'Cảm ơn quý khách!' })).toBeVisible();
  await expect(D.getByRole('heading', { name: 'Bạn thấy món hôm nay thế nào?' })).toBeVisible();
  await D.getByRole('radiogroup', { name: 'Nước suối' }).getByRole('radio', { name: '2 sao' }).click();
  await expect(D.getByRole('radiogroup', { name: 'Nước suối' }).getByRole('radio', { name: '2 sao' })).toHaveAttribute('aria-checked', 'true');
  await D.getByLabel('Góp ý (không bắt buộc)').fill('nước không lạnh');
  // Quầy hoàn tất món sau khi đã thu → trang khách tải lại ảnh chụp: sao / góp ý đang nhập phải còn nguyên (review G3)
  const reloaded = D.waitForResponse((r) => r.url().endsWith(`/api/sessions/${sid}`) && r.request().method() === 'GET');
  await apiAs(request, 'post', `/api/orders/${detail.orders[0].orderId}/complete`);
  await reloaded;
  const two = D.getByRole('radiogroup', { name: 'Nước suối' }).getByRole('radio', { name: '2 sao' });
  await expect(two).toHaveAttribute('aria-checked', 'true');
  // Sao đã chọn tô đặc, sao chưa chọn rỗng — khác hình, không chỉ khác màu (WCAG 1.4.1); sao là SVG từ TASK-066
  await expect(two.locator('svg.ic-star.filled')).toHaveCount(1);
  await expect(D.getByRole('radiogroup', { name: 'Nước suối' }).getByRole('radio', { name: '3 sao' }).locator('svg.ic-star:not(.filled)')).toHaveCount(1);
  await expect(D.getByLabel('Góp ý (không bắt buộc)')).toHaveValue('nước không lạnh');
  // Món xong → pop-up "Món của bạn đã xong" (AC-004-01) che màn cảm ơn: khách bấm Đã hiểu, bản nháp vẫn còn
  const doneDlg = D.locator('.modal', { hasText: 'Món của bạn đã xong' });
  await expect(doneDlg).toBeVisible();
  await doneDlg.getByRole('button', { name: 'Đã hiểu' }).click();
  await expect(two).toHaveAttribute('aria-checked', 'true');
  await D.getByRole('button', { name: 'Gửi đánh giá' }).click();
  await expect(D.getByText('Cảm ơn bạn đã đánh giá!')).toBeVisible();

  // Quầy: dải "Đánh giá thấp" → Đã xử lý
  const strip = P.locator('#review-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Bàn DG1');
  await expect(strip).toContainText('Nước suối 2★');
  await expect(strip).toContainText('nước không lạnh');
  await P.getByRole('button', { name: 'Đã xử lý đánh giá Bàn DG1' }).click();
  await expect(strip).toBeHidden();

  // Menu hiện sao (hạ ngưỡng về 1 lượt cho bài thử, rồi trả lại 5)
  await apiAs(request, 'put', '/api/admin/settings', { reviewMenuMinCount: 1 });
  try {
    await D.goto(`/t/${t.qrToken}/menu`);
    await expect(D.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.rating')).toHaveText('2,0 (1)');
    await expect(D.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.rating svg.ic-star.filled')).toHaveCount(1);
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', { reviewMenuMinCount: 5 }); // trả lại kể cả khi bước trên lỗi
  }

  // Quản lý: trang Đánh giá món
  await P.goto('/admin/reviews');
  await expect(P.locator('.reviews-table')).toContainText('Nước suối');
  await expect(P.locator('#content')).toContainText('Đã xử lý');
});

test('tra cứu API: quản lý mở Quản lý → Tra cứu API, tìm "settle" rồi mở dòng thấy mã lỗi; lọc quyền Trưởng ca chỉ còn endpoint của trưởng ca (F-052, AC-052-05)', async () => {
  await P.goto('/admin/reports');
  await P.locator('.admin-side summary', { hasText: 'Hệ thống' }).click(); // menu theo nhóm thu gọn (TASK-066): mở nhóm Hệ thống trước
  await P.getByRole('link', { name: 'Tra cứu API' }).click();
  await expect(P).toHaveURL(/\/admin\/api-docs$/);
  await expect(P.locator('.api-count')).toHaveText(/^\d{3} endpoint$/);
  const menuRow = P.locator('.api-ep', { has: P.locator('.api-path', { hasText: /^\/api\/menu$/ }) });
  await expect(menuRow).toBeVisible();
  await P.getByLabel('Tìm', { exact: true }).fill('settle');
  await expect(menuRow).toBeHidden(); // bộ lọc thật sự ẩn dòng không khớp (review G3)
  const [shown, total] = (await P.locator('.api-count').textContent()).match(/\d+/g).map(Number);
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);
  expect(await P.locator('.api-ep:not([hidden])').count()).toBe(shown);
  const settle = P.locator('.api-ep:not([hidden])', { has: P.locator('.api-path', { hasText: /^\/api\/sessions\/:id\/settle$/ }) });
  await expect(settle).toHaveCount(1);
  await settle.locator('summary').click();
  await expect(settle.locator('.api-detail')).toContainText('INSUFFICIENT_AMOUNT');
  await expect(settle.locator('.api-curl')).toContainText('Authorization: Bearer <token>');
  await P.getByLabel('Tìm', { exact: true }).fill('');
  await P.getByLabel('Quyền', { exact: true }).selectOption({ label: 'Trưởng ca' });
  await expect(P.locator('.api-count')).toHaveText(/^Đang hiện \d+ \/ \d{3} endpoint$/);
  const badges = await P.locator('.api-ep:not([hidden]) .badge').allTextContents();
  expect(badges.length).toBeGreaterThan(0);
  expect([...new Set(badges)]).toEqual(['Trưởng ca']);
  await expect(P.locator('.api-ep:not([hidden]) .api-path', { hasText: /^\/api\/ops\/stocktakes$/ }).first()).toBeVisible();
});

test('đổi tên quán: quản lý mở Cài đặt đổi tên → thanh bên hiện tên mới ngay; khách mở menu thấy tên mới ở đầu trang (F-053, AC-053-05)', async ({
  request,
}) => {
  await P.goto('/admin/settings');
  const name = P.getByLabel('Tên quán');
  const old = await name.inputValue();
  let phone = null;
  let t = null;
  try {
    await name.fill('Quán Thử E2E');
    await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(P.locator('.admin-side .brand')).toHaveText('Quán Thử E2E');
    // Khách quét QR một bàn trống (tạo riêng cho bài thử) → đầu trang menu hiện tên mới
    await apiAs(request, 'post', '/api/admin/tables', { code: 'TEN', name: 'Bàn thử đổi tên' });
    t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'TEN');
    phone = await browser.newContext(phoneOpts);
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await expect(G.locator('#shop')).toHaveText('Quán Thử E2E');
  } finally {
    // Trả lại tên cũ (qua API — chạy được cả khi giao diện lỗi giữa chừng) + dọn bàn thử
    await phone?.close();
    await apiAs(request, 'put', '/api/admin/settings', { shopName: old });
    if (t) {
      const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'TEN')?.sessions?.[0];
      if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử đổi tên quán' });
      await apiAs(request, 'delete', `/api/admin/tables/${t.tableId}`);
    }
  }
});

test('chuyển giữa các mục quầy: rời trang không làm hiện "Mất kết nối" (app tự đóng kết nối, không phải mất mạng) (DEF-011, TASK-059)', async () => {
  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  // Rời trang: trình duyệt phát beforeunload rồi pagehide → app tự đóng kết nối realtime của trang cũ
  await P.evaluate(() => {
    globalThis.dispatchEvent(new Event('beforeunload'));
    globalThis.dispatchEvent(new globalThis.PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect(P.locator('#offline-banner')).toBeHidden();
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  // Bấm Back, trình duyệt khôi phục trang từ bfcache → app mở lại kết nối và tải lại ảnh chụp (REQ-017)
  const snapshot = P.waitForRequest((r) => r.url().endsWith('/api/shifts/current'));
  await P.evaluate(() => globalThis.dispatchEvent(new globalThis.PageTransitionEvent('pageshow', { persisted: true })));
  await snapshot;
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  // Chuyển mục thật: trang mới kết nối lại, không có dải đỏ
  await P.locator('.pos-nav a', { hasText: 'Bán mang đi' }).click();
  await expect(P).toHaveURL(/\/pos\/takeaway$/);
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  await expect(P.locator('#offline-banner')).toBeHidden();
});

test('ca: trang Ca & hoàn tiền hiện tiền dự kiến; hoàn tiền một lượt; đóng ca → chênh lệch, khi chưa mở ca quầy báo "Chưa mở ca" (F-018, F-019)', async () => {
  await P.goto('/pos/shift');
  await expect(P.locator('h1')).toContainText('Ca #');
  const row = P.locator('tr', { hasText: '55.000đ' }).first(); // lượt thu đơn mang đi combo
  await row.getByRole('button', { name: 'Hoàn tiền' }).click();
  await P.locator('.modal input[aria-label="Lý do hoàn"]').fill('Khách đổi ý trước khi pha');
  await P.locator('.modal').getByRole('button', { name: 'Hoàn tiền' }).click();
  await expect(P.locator('.toast').last()).toContainText('Đã hoàn 55.000đ');
  await P.getByRole('button', { name: 'Đóng ca' }).click();
  await P.fill('#counted', '1000');
  await expect(P.locator('.modal .change')).toContainText('Thiếu');
  await P.locator('.modal').getByRole('button', { name: 'Đóng ca' }).click();
  await expect(P.locator('h1')).toContainText('Đã đóng ca');
  await P.goto('/pos');
  await expect(P.locator('#no-shift')).toBeVisible();
  await expect(P.locator('#shift-btn')).toHaveText('Chưa mở ca');
});

test('đăng xuất khi đang giữ ca: hộp "Đóng ca trước khi đăng xuất" — Ở lại thì vẫn ở trang; Đến trang đóng ca → đếm tiền, đóng ca → Đăng xuất về trang đăng nhập (F-054, AC-054-04)', async ({
  request,
}) => {
  // Không phụ thuộc test trước: còn ca mở thì quản lý đóng giúp, rồi staff1 mở ca mới (người mở = staff1)
  const before = (await apiAs(request, 'get', '/api/shifts/current')).shift;
  if (before) await apiAs(request, 'post', `/api/shifts/${before.shiftId}/close`, { countedCash: before.expectedCash });
  const staffToken = (await (await request.post('/api/auth/login', { data: { username: 'staff1', password: 'Staff@123' } })).json()).accessToken;
  const opened = await request.post('/api/shifts/open', { headers: { Authorization: `Bearer ${staffToken}` }, data: { openingCash: 0 } });
  expect(opened.status(), await opened.text()).toBe(201);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const S = await ctx.newPage();
  watch(S, 'S');
  try {
    await S.goto('/pos/login');
    await S.fill('#username', 'staff1');
    await S.fill('#password', 'Staff@123');
    await S.click('#submit');
    await expect(S).toHaveURL(/\/pos$/);
    // Ở lại: vẫn ở trang, chưa đăng xuất
    await S.getByRole('button', { name: 'Đăng xuất' }).click();
    const ask = S.locator('.modal', { hasText: 'Đóng ca trước khi đăng xuất' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Ở lại' }).click();
    await expect(ask).toHaveCount(0);
    await expect(S).toHaveURL(/\/pos$/);
    // Đến trang đóng ca: hộp đóng ca mở sẵn → đếm tiền, đóng ca → Đăng xuất
    await S.getByRole('button', { name: 'Đăng xuất' }).click();
    await S.locator('.modal', { hasText: 'Đóng ca trước khi đăng xuất' }).getByRole('button', { name: 'Đến trang đóng ca' }).click();
    await expect(S).toHaveURL(/\/pos\/shift$/); // trang bỏ ?then=logout khỏi URL ngay khi đọc (tải lại không tự đăng xuất)
    const closeDlg = S.locator('.modal', { hasText: 'Tiền mặt đếm thực tế' });
    await expect(closeDlg).toBeVisible();
    await S.fill('#counted', '0');
    await closeDlg.getByRole('button', { name: 'Đóng ca' }).click();
    await expect(S.locator('#main h1')).toContainText('Đã đóng ca');
    await S.locator('#main').getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(S).toHaveURL(/\/pos\/login/);
    expect(await S.evaluate(() => globalThis.localStorage.getItem('cf_staff_token'))).toBeNull(); // phiên trên máy đã xóa
    expect((await apiAs(request, 'get', '/api/shifts/current')).shift).toBeNull(); // ca do staff1 đóng
  } finally {
    await ctx.close();
  }
});

test('chưa mở ca: quầy thấy dải "Chưa mở ca — chưa nhận, xử lý đơn…", nút Tiếp nhận khóa; điện thoại khách thấy "Quán chưa mở ca", nút gửi khóa; quầy Mở ca → điện thoại tự mở lại nút gửi, khách gửi được, quầy tiếp nhận được (F-055, AC-055-05)', async ({
  request,
}) => {
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'MC1', name: 'Bàn MC1' });
  // Một đơn chờ từ lúc còn ca: mở ca (nếu chưa có), khách gửi đơn, rồi đóng ca
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  await newCustomer(phoneD);
  await D.goto(`/t/${t.qrToken}`);
  await expect(D).toHaveURL(/\/menu$/);
  await D.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await D.click('#open-cart');
  await D.locator('.sheet .modal-foot .btn-primary').click();
  await expect(D).toHaveURL(/\/track$/);
  const shift = (await apiAs(request, 'get', '/api/shifts/current')).shift;
  await apiAs(request, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: shift.expectedCash });

  // Quầy: dải cảnh báo + nút Tiếp nhận trên phiếu bị khóa
  await P.goto('/pos');
  await expect(P.locator('#no-shift')).toBeVisible();
  await expect(P.locator('#no-shift')).toContainText('chưa nhận, xử lý đơn');
  const tickets = P.locator('#col-PENDING .ticket', { hasText: 'Bàn MC1' });
  await expect(tickets.first().getByRole('button', { name: 'Tiếp nhận', exact: true })).toBeDisabled();
  await expect(P.getByRole('button', { name: 'Chuyển bàn Bàn MC1' })).toBeDisabled(); // khung bàn cũng khóa (review G3)
  // Gọi món tại bàn: nút gửi khóa, ghi rõ lý do
  await P.goto('/pos/table-order');
  await expect(P.locator('#send')).toBeDisabled();
  await expect(P.locator('#send')).toHaveText('Chưa mở ca — mở ca để gọi món');
  await P.goto('/pos');
  await expect(P.locator('#no-shift')).toBeVisible();

  // Khách: vẫn xem menu, chọn món; nút gửi khóa với lý do
  await D.goto(`/t/${t.qrToken}/menu`);
  await expect(D.locator('#store-closed')).toContainText('Quán chưa mở ca');
  await D.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await D.click('#open-cart');
  const send = D.locator('.sheet .modal-foot .btn-primary');
  await expect(send).toBeDisabled();
  await expect(send).toHaveText('Quán chưa mở ca');

  // Quầy mở ca → điện thoại tự mở lại nút gửi (không tải lại trang); khách gửi được, quầy tiếp nhận được
  await P.locator('#no-shift').getByRole('button', { name: 'Mở ca' }).click();
  const dlg = P.locator('.modal', { hasText: 'Tiền mặt đầu ca' });
  await dlg.locator('#opening-cash').fill('0');
  await dlg.getByRole('button', { name: 'Mở ca' }).click();
  await expect(P.locator('#no-shift')).toBeHidden();
  await expect(D.locator('#store-closed')).toBeHidden();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(D).toHaveURL(/\/track$/);
  const accept = tickets.first().getByRole('button', { name: 'Tiếp nhận', exact: true });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(P.locator('#col-PREPARING .ticket', { hasText: 'Bàn MC1' }).first()).toBeVisible();
});

test('bố cục quầy (ADR-018): lưới bàn hiện cả bàn trống; màn 1024 px lưới bàn là ngăn trượt — nút "Bàn" mở, Esc / nền mờ đóng, focus trả về nút (TASK-072)', async () => {
  await P.goto('/pos');
  // 1366 px: ba vùng cạnh nhau, không cần nút "Bàn"; bàn không có khách vẫn có thẻ "Trống" + Gọi món
  await expect(P.locator('#tables-toggle')).toBeHidden();
  const free = P.locator('#tables .tbl-card.free').first();
  await expect(free).toContainText('Trống');
  await expect(free.getByRole('link', { name: /^Gọi món / })).toHaveAttribute('href', /\/pos\/table-order\?table=\d+$/);
  await expect(P.locator('#tables-summary')).toContainText('bàn trống');

  await P.setViewportSize({ width: 1024, height: 768 });
  const toggle = P.locator('#tables-toggle');
  const panel = P.locator('#tables-panel');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('có khách');
  await expect(panel).toBeHidden();
  expect(await P.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(P.locator('#tables-close')).toBeFocused();
  await P.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(panel).toBeVisible();
  await P.locator('#tables-backdrop').click({ position: { x: 20, y: 300 } });
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused(); // bấm nền mờ cũng trả focus về nút (review G3)
  await P.setViewportSize({ width: 1366, height: 860 });
});

test('đề xuất nhập hàng: nguyên liệu chưa gán nhà cung cấp — ô chọn khóa kèm lý do; "Gán nhà cung cấp" mở form có sẵn nguyên liệu, lưu xong dòng có nhà cung cấp (DEF-016)', async ({
  request,
}) => {
  const suaDac = (await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.name === 'Sữa đặc').ingredientId;
  await P.goto('/admin/purchasing');
  await expect(P.locator('#no-supplier-hint')).toContainText('chưa gán nhà cung cấp');
  const row = P.locator('#content tbody tr', { has: P.getByRole('button', { name: 'Sữa đặc', exact: true }) });
  await expect(row.getByRole('checkbox')).toBeDisabled();
  await expect(row.getByRole('checkbox')).toHaveAttribute('title', 'Chưa gán nhà cung cấp');
  await row.getByRole('button', { name: 'Gán nhà cung cấp cho Sữa đặc' }).click();
  await P.locator('.modal').getByRole('button', { name: 'NCC E2E' }).click();
  const form = P.locator('.modal', { hasText: 'Sửa: NCC E2E' });
  await expect(form.locator('select[aria-label="Nguyên liệu"]').last()).toHaveValue(String(suaDac));
  await form.getByRole('button', { name: 'Lưu' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu nhà cung cấp' })).toBeVisible();
  await expect(P.locator('#content tbody tr', { has: P.getByRole('button', { name: 'Sữa đặc', exact: true }) })).toContainText('NCC E2E');
});

/** Khách (ngữ cảnh trình duyệt riêng — cookie riêng) quét QR bàn rồi gửi đơn qua API; quầy tiếp nhận. → sessionId */
async function guestOrderAccepted(request, qrToken, items) {
  const g = await browser.newContext();
  try {
    await g.request.get('/api/menu');
    const scan = await (await g.request.post('/api/sessions/scan', { data: { qrToken } })).json();
    const sessionId = scan.session?.sessionId ?? (await (await g.request.post('/api/sessions', { data: { qrToken } })).json()).session.sessionId;
    const order = await (await g.request.post('/api/orders', { data: { sessionId, items } })).json();
    await apiAs(request, 'post', `/api/orders/${order.orderId}/accept`);
    return sessionId;
  } finally {
    await g.close();
  }
}

test('thu bằng chuyển khoản: ngăn Thu tiền chọn "Chuyển khoản" → không nhập tiền khách đưa, bàn đóng; trang Ca tách riêng chuyển khoản, két không cộng khoản đó (F-056, AC-056-06)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'CK1', name: 'Bàn CK1' });
  await guestOrderAccepted(request, t.qrToken, [{ menuItemId: ids['Nước suối'], quantity: 2 }]);
  const before = (await apiAs(request, 'get', '/api/shifts/current')).shift;

  await P.goto('/pos');
  await P.locator('#tables .table-row', { hasText: 'Bàn CK1' }).getByRole('button', { name: 'Thu tiền' }).click();
  const drawer = P.locator('.drawer');
  await expect(drawer.getByLabel('Tiền khách đưa')).toBeVisible();
  await drawer.getByRole('button', { name: 'Chuyển khoản', exact: true }).click();
  await expect(drawer.getByLabel('Tiền khách đưa')).toBeHidden();
  const pay = drawer.locator('.modal-foot .btn-success');
  await expect(pay).toHaveText('Đã nhận chuyển khoản & In bill');
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(P.locator('.toast', { hasText: 'đã nhận chuyển khoản' })).toBeVisible();
  await expect(P.locator('#tables .table-row', { hasText: 'Bàn CK1' })).toHaveCount(0);

  const after = (await apiAs(request, 'get', '/api/shifts/current')).shift;
  expect(after.transferIn - before.transferIn).toBe(20000);
  expect(after.expectedCash).toBe(before.expectedCash);
  await P.goto('/pos/shift');
  await expect(P.locator('.kpi', { hasText: 'không vào két' })).toContainText(`${after.transferIn.toLocaleString('vi-VN')}đ`);
  await expect(P.locator('table .badge', { hasText: 'Chuyển khoản' }).first()).toBeVisible();
});

test('thu chung nhiều bàn: ngăn Thu tiền Bàn GH1 → "Thu chung với bàn khác" → tích Bàn GH2 → tổng chung → thu một lần, cả hai bàn đóng (F-057, AC-057-05)', async ({
  request,
}) => {
  const t1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'GH1', name: 'Bàn GH1' });
  const t2 = await apiAs(request, 'post', '/api/admin/tables', { code: 'GH2', name: 'Bàn GH2' });
  await guestOrderAccepted(request, t1.qrToken, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
  await guestOrderAccepted(request, t2.qrToken, [{ menuItemId: ids['Nước suối'], quantity: 1 }]);

  await P.goto('/pos');
  await P.locator('#tables .table-row', { hasText: 'Bàn GH1' }).getByRole('button', { name: 'Thu tiền' }).click();
  const drawer = P.locator('.drawer');
  await drawer.getByRole('button', { name: 'Việc khác' }).click(); // TASK-129
  await drawer.getByRole('button', { name: 'Thu chung với bàn khác' }).click();
  const pick = P.locator('.modal', { hasText: 'Thu chung với Bàn GH1' });
  // TASK-130: mỗi bàn một thẻ lớn; chưa chọn → nút Thu chung khóa; chọn → thẻ sáng lên, dòng tổng "Bàn GH1 + 1 bàn · tạm tính …"
  await expect(pick.getByRole('button', { name: 'Thu chung', exact: true })).toBeDisabled();
  await expect(pick.locator('.merge-total')).toContainText('Chưa chọn bàn nào');
  await pick.getByLabel(/^Bàn GH2/).check();
  await expect(pick.locator('.merge-pick.on')).toHaveCount(1);
  await expect(pick.locator('.merge-pick.on .mp-amount')).toHaveText('10.000đ');
  await expect(pick.locator('.merge-total')).toContainText('Bàn GH1 + 1 bàn');
  await expect(pick.locator('.merge-total')).toContainText('tạm tính 35.000đ');
  await pick.getByRole('button', { name: 'Thu chung', exact: true }).click();
  await expect(drawer.locator('h3')).toHaveText('Thu chung: Bàn GH1 + Bàn GH2');
  await expect(drawer).toContainText('Nước suối');
  await expect(drawer.locator('.due span').last()).toHaveText('35.000đ');
  await P.fill('#amount-received', '50000');
  await drawer.locator('.modal-foot .btn-success').click();
  await expect(P.locator('.toast', { hasText: 'Đã thu chung 2 bàn' })).toBeVisible();
  await expect(P.locator('#tables .table-row', { hasText: 'Bàn GH1' })).toHaveCount(0);
  await expect(P.locator('#tables .table-row', { hasText: 'Bàn GH2' })).toHaveCount(0);
});

test('tách hóa đơn theo món: "Tách hóa đơn" → tích món → "Anh A" + "Phần còn lại"; thu "Anh A" bằng chuyển khoản, phần còn lại bằng tiền mặt (F-058, AC-058-03)', async ({
  request,
}) => {
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'TH1', name: 'Bàn TH1' });
  await guestOrderAccepted(request, t.qrToken, [
    { menuItemId: ids['Cà phê đen'], quantity: 1 },
    { menuItemId: ids['Nước suối'], quantity: 1 },
  ]);

  await P.goto('/pos');
  await P.locator('#tables .table-row', { hasText: 'Bàn TH1' }).getByRole('button', { name: 'Thu tiền' }).click();
  const drawer = P.locator('.drawer');
  await drawer.getByRole('button', { name: 'Việc khác' }).click(); // TASK-129
  await drawer.getByRole('button', { name: 'Tách hóa đơn' }).click();
  const dlg = P.locator('.modal', { hasText: 'Tách hóa đơn — Bàn TH1' });
  await dlg.getByLabel(/Nước suối/).check();
  await dlg.getByLabel('Tên hóa đơn tách ra').fill('Anh A');
  await dlg.getByRole('button', { name: 'Tách ra hóa đơn riêng' }).click();
  await expect(drawer.locator('.split-block')).toContainText('Bàn chia bill: 2 phần');
  const partA = drawer.locator('.split-card').filter({ has: P.locator('strong', { hasText: /^Anh A$/ }) });
  await expect(partA).toContainText('Nước suối');
  await partA.getByRole('button', { name: 'Thu phần này' }).click();
  await drawer.getByRole('button', { name: 'Chuyển khoản', exact: true }).click();
  await expect(drawer.locator('.due span').last()).toHaveText('10.000đ');
  await drawer.locator('.modal-foot .btn-success').click();
  await expect(P.locator('.toast', { hasText: 'Đã thu phần Anh A: đã nhận chuyển khoản' })).toBeVisible();
  await drawer
    .locator('.split-card')
    .filter({ has: P.locator('strong', { hasText: /^Phần còn lại$/ }) })
    .getByRole('button', { name: 'Thu phần này' })
    .click();
  // Phần sau tự về Tiền mặt — không ghi nhầm chuyển khoản theo lượt trước (review G3)
  await expect(drawer.getByRole('button', { name: 'Tiền mặt', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Chờ hộp vẽ lại cho "Phần còn lại" rồi mới bấm "Đủ tiền" — bấm sớm trúng nút của phần trước (10k) → còn thiếu, nút thu bị khóa (bài chập chờn)
  await expect(drawer.locator('.due span').last()).toHaveText('25.000đ');
  await drawer.locator('.quick-cash .btn').first().click();
  await drawer.locator('.modal-foot .btn-success').click();
  await expect(P.locator('.drawer')).toHaveCount(0);
  await expect(P.locator('#tables .table-row', { hasText: 'Bàn TH1' })).toHaveCount(0);
});

test('QR Wi-Fi cho khách: quản lý nhập Wi-Fi ở Cài đặt → trang In QR mỗi thẻ bàn có "① Quét để vào Wi-Fi" (ảnh, tên, mật khẩu) và "② Quét để gọi món" (F-059, AC-059-04)', async () => {
  // Chưa nhập Wi-Fi → thẻ bàn như cũ (không có khối Wi-Fi)
  await P.goto('/admin/tables/print');
  await expect(P.locator('.qr-card').first()).toBeVisible();
  await expect(P.locator('.qr-card .qr-wifi')).toHaveCount(0);
  await expect(P.locator('.qr-card').first()).not.toContainText('Quét để vào Wi-Fi');

  await P.goto('/admin/settings');
  await P.getByLabel('Tên Wi-Fi').fill('QuanMoc-Khach');
  await P.getByLabel('Mật khẩu Wi-Fi').fill('matkhau123');
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();

  await P.goto('/admin/tables/print');
  const cards = P.locator('.qr-card');
  await expect(P.getByRole('button', { name: 'Tải tất cả ảnh' })).toBeEnabled({ timeout: 30_000 }); // TASK-134: vẽ xong mọi ảnh thẻ
  await expect(cards.first()).toBeVisible();
  // Mọi thẻ bàn đều có khối Wi-Fi, dùng chung một ảnh QR Wi-Fi
  await expect(P.locator('.qr-card .qr-wifi')).toHaveCount(await cards.count());
  const wifi = cards.first().locator('.qr-wifi');
  await expect(wifi).toContainText('① Quét để vào Wi-Fi');
  await expect(wifi).toContainText('Wi-Fi: QuanMoc-Khach · Mật khẩu: matkhau123');
  // TASK-134: thẻ là một ảnh 10 × 15 cm có sẵn QR Wi-Fi + QR gọi món (chữ ở trên là bản văn bản của ảnh)
  await expect
    .poll(() =>
      cards
        .first()
        .locator('img.qr-card-img')
        .evaluate((img) => img.complete && img.naturalWidth === 1200),
    )
    .toBe(true);
  await expect(cards.first()).toContainText('② Quét để gọi món');
  await expect(cards.first()).toContainText('Thanh toán tiền mặt hoặc chuyển khoản');
  // Giữ Wi-Fi đã nhập: dự án a11y chạy sau flow quét luôn khối Wi-Fi ở trang In QR
});

test('số điện thoại quán + chữ WIFI giữa mã Wi-Fi: quản lý nhập số ở Cài đặt (số sai báo dưới ô) → thẻ QR bàn in "ĐT: …", mã Wi-Fi trên ảnh thẻ có nhãn WIFI ở giữa (ADR-070, AC-053-08, AC-010-10)', async () => {
  await P.goto('/admin/settings');
  const phone = P.getByLabel('Số điện thoại quán');
  await phone.fill('12345');
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.getByText('Số điện thoại chưa đúng').first()).toBeVisible();
  await phone.fill('0909 123 456');
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();

  await P.goto('/admin/tables/print');
  await expect(P.getByRole('button', { name: 'Tải tất cả ảnh' })).toBeEnabled({ timeout: 30_000 });
  const card = P.locator('.qr-card').first();
  await expect(card.locator('.qr-phone')).toHaveText('ĐT: 0909 123 456');
  await expect(card.locator('.qr-wifi')).toContainText('chữ WIFI ở giữa');
  // Nhãn vẽ thật lên ảnh: giữa mã Wi-Fi (tâm 260, 838 trên ảnh 1200 × 1800) là ô trắng chữ xanh rêu — không còn ô đen của mã
  const px = await card.locator('img.qr-card-img').evaluate((img) => {
    const cv = img.ownerDocument.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(230, 808, 60, 60);
    let black = 0;
    let teal = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r + g + b < 150) black += 1;
      if (Math.abs(r - 0x1f) < 40 && Math.abs(g - 0x5e) < 40 && Math.abs(b - 0x57) < 40) teal += 1;
    }
    return { black: black / (data.length / 4), teal: teal / (data.length / 4) };
  });
  expect(px.black).toBeLessThan(0.02);
  expect(px.teal).toBeGreaterThan(0.03);
});

test('thẻ QR bàn nhắc vào Wi-Fi quán: mã QR trỏ tới máy trong quán (localhost / địa chỉ IP) → mọi thẻ có khung cam "Lưu ý: vào Wi-Fi của quán (mã ①) rồi mới quét mã ② — dùng 4G hay mạng khác sẽ không gọi món được." dưới tên / mật khẩu Wi-Fi (TASK-139, AC-010-11)', async () => {
  await P.goto('/admin/tables/print');
  await expect(P.getByRole('button', { name: 'Tải tất cả ảnh' })).toBeEnabled({ timeout: 30_000 });
  const cards = P.locator('.qr-card');
  await expect(cards.locator('.qr-lan')).toHaveCount(await cards.count());
  await expect(cards.first().locator('.qr-lan')).toHaveText(
    'Lưu ý: vào Wi-Fi của quán (mã ①) rồi mới quét mã ② — dùng 4G hay mạng khác sẽ không gọi món được.',
  );
  // Khung vẽ thật lên ảnh: vùng dưới tên / mật khẩu Wi-Fi (x 90–430, y 1125–1255 trên ảnh 1200 × 1800) có chữ + viền màu cam #B4561E
  const orange = await cards
    .first()
    .locator('img.qr-card-img')
    .evaluate((img) => {
      const cv = img.ownerDocument.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(90, 1125, 340, 130);
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (Math.abs(data[i] - 0xb4) < 40 && Math.abs(data[i + 1] - 0x56) < 40 && Math.abs(data[i + 2] - 0x1e) < 40) n += 1;
      return n / (data.length / 4);
    });
  expect(orange).toBeGreaterThan(0.03);
});

// ---------- TASK-134: thẻ QR bàn dạng ảnh 10 × 15 cm ----------
test('thẻ QR bàn dạng ảnh: trang In QR vẽ mỗi bàn một ảnh 1200 × 1800 (10 × 15 cm, 300 dpi) có chữ thay thế; "Tải ảnh" tải đúng tệp the-qr-<mã bàn>.png; "Tải tất cả ảnh" bấm được khi vẽ xong; in ra đúng cỡ 10 × 15 cm (TASK-134, AC-010-09)', async () => {
  await P.goto('/admin/tables/print');
  await expect(P.getByRole('button', { name: 'Tải tất cả ảnh' })).toBeEnabled({ timeout: 30_000 });
  const card = P.locator('.qr-card').first();
  const img = card.locator('img.qr-card-img');
  await expect(img).toHaveAttribute('alt', /^Thẻ QR gọi món — /);
  expect(await img.evaluate((i) => [i.naturalWidth, i.naturalHeight])).toEqual([1200, 1800]);
  const code = (await img.getAttribute('alt')).replace(/^Thẻ QR gọi món — /, '');
  expect(code.length).toBeGreaterThan(0);
  const download = P.waitForEvent('download');
  await card.getByRole('link', { name: 'Tải ảnh' }).click();
  expect((await download).suggestedFilename()).toMatch(/^the-qr-[\w-]+\.png$/);
  // In: ảnh đúng 10 × 15 cm (96 px / inch → 378 × 567 px CSS)
  await P.emulateMedia({ media: 'print' });
  const size = await img.evaluate((i) => {
    const r = i.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  });
  // Bỏ giả lập (không đặt 'screen'): sau 'screen', P.pdf() bên dưới in bằng giao diện MÀN HÌNH chứ không phải giao diện in
  await P.emulateMedia({ media: null });
  expect(size).toEqual([378, 567]);
  // In ra giấy như hộp thoại In (giao diện in + @page của trang): tờ A4 NGANG, 2 thẻ một tờ — A4 dọc chỉ vừa 1 thẻ (đi luồng thật 24/11)
  const pdf = (await P.pdf({ format: 'A4', preferCSSPageSize: true })).toString('latin1');
  const [, w, h] = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf).map(Number);
  expect(w).toBeGreaterThan(h);
  const sheets = (pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  expect(sheets).toBe(Math.ceil((await P.locator('.qr-card').count()) / 2));
});

test('cảnh báo bất thường qua email: quản lý nhập email nhận ở Cài đặt, "Gửi email thử" báo đã gửi; đóng ca thừa 50.000đ → trang Cảnh báo tự hiện cảnh báo Lệch két, bấm Đã xem (F-060, AC-060-09)', async ({
  request,
}) => {
  await P.goto('/admin/settings');
  await expect(P.getByText(/Hộp thư gửi: .*chế độ thử/)).toBeVisible();
  await P.getByLabel('Email nhận cảnh báo (tối đa 5, cách nhau dấu phẩy)').fill('chuquan@example.com, quanly@example.com');
  await P.getByRole('button', { name: 'Gửi email thử' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã gửi email thử tới chuquan@example.com, quanly@example.com' })).toBeVisible();
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
  expect((await apiAs(request, 'get', '/api/admin/settings')).alertEmails).toEqual(['chuquan@example.com', 'quanly@example.com']);

  // Trang Cảnh báo đang mở; ca đóng thừa 50.000đ (cho phép 20.000đ) → cảnh báo tới qua realtime, không cần tải lại
  await P.goto('/admin/alerts');
  await expect(P.getByRole('button', { name: /^Mới \(\d+\)$/ })).toBeVisible();
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const shift = (await apiAs(request, 'get', '/api/shifts/current')).shift;
  await apiAs(request, 'post', `/api/shifts/${shift.shiftId}/close`, { countedCash: shift.expectedCash + 50000 });
  const title = `Ca #${shift.shiftId} đóng thừa 50.000đ (cho phép 20.000đ)`;
  await expect(P.locator('.toast', { hasText: title })).toBeVisible();
  const card = P.locator('.alert-card', { hasText: title });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge').first()).toHaveText('Lệch két');
  await expect(card.getByRole('link', { name: 'Nhật ký thao tác' })).toHaveAttribute('href', /^\/admin\/audit\?from=\d{4}-\d{2}-\d{2}&to=/);
  await card.getByRole('button', { name: 'Đã xem' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã đánh dấu đã xem' })).toBeVisible();
  await expect(card).toHaveCount(0); // lọc "Mới" không còn cảnh báo này
  await P.getByRole('button', { name: 'Tất cả' }).click();
  await expect(P.locator('.alert-card', { hasText: title }).locator('.badge').nth(1)).toHaveText('Đã xem');
  // Email báo cáo ca đã vào hàng đợi (E2E không chạy bộ gửi nền) — trang Cài đặt hiện số đang chờ
  await P.goto('/admin/settings');
  await expect(P.getByText(/Đang chờ gửi: \d+/)).toBeVisible();
  // a11y tự mở ca nếu chưa có (beforeAll của a11y.spec.js)
});

test('chế độ cơ bản: tắt hết nhóm nâng cao → menu quản lý không có Kho hàng, Khách hàng, Phân tích; trang ẩn mở thẳng vẫn chạy, có dải nhắc; tích "Kho hàng" ở Cài đặt → menu + mục quầy hiện ngay (F-061, AC-061-05)', async ({
  request,
}) => {
  const ALL = ['inventory', 'customers', 'finance', 'analytics', 'advanced'];
  const side = P.locator('.admin-side');
  try {
    await apiAs(request, 'put', '/api/admin/settings', { uiModules: [] });
    await P.goto('/admin/settings');
    await expect(side.locator('a[href="/admin/reports"]')).toHaveCount(1);
    await expect(side.locator('a[href="/admin/settings"]')).toHaveCount(1);
    for (const g of ['Kho hàng', 'Khách hàng']) await expect(side.locator('summary', { hasText: g })).toHaveCount(0);
    for (const href of ['/admin/analytics', '/admin/pnl', '/admin/cash', '/admin/staff', '/admin/audit', '/admin/api-docs', '/admin/menu-schedules'])
      await expect(side.locator(`a[href="${href}"]`)).toHaveCount(0);
    // Trang của nhóm đang ẩn: vẫn chạy, có dải nhắc + link tới thẻ Giao diện quản lý
    await P.goto('/admin/ingredients');
    await expect(P.locator('#module-hidden-note')).toContainText('đang ẩn khỏi menu');
    await expect(P.locator('#content table')).toBeVisible();
    await P.locator('#module-hidden-note a').click();
    await expect(P).toHaveURL(/\/admin\/settings#giao-dien$/);
    await P.getByRole('checkbox', { name: /^Kho hàng/ }).check();
    await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
    await expect(side.locator('summary', { hasText: 'Kho hàng' })).toHaveCount(1);
    await expect(side.locator('a[href="/admin/ingredients"]')).toHaveCount(1);
    await expect(side.locator('a[href="/admin/members"]')).toHaveCount(0);
    // Màn quầy: "Kho" theo nhóm Kho hàng
    await P.goto('/pos');
    await expect(P.locator('.pos-nav a[href="/pos/stock"]')).toHaveCount(1);
    await apiAs(request, 'put', '/api/admin/settings', { uiModules: [] });
    await P.reload();
    await expect(P.locator('#conn')).toHaveText('Đã kết nối');
    await expect(P.locator('.pos-nav a[href="/pos/stock"]')).toHaveCount(0);
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', { uiModules: ALL }); // a11y chạy sau quét đủ trang
  }
});

test('hướng dẫn 5 bước: nhân viên mới đăng nhập quầy lần đầu → Bước 1/5 khoanh nút ca … Xong; tải lại không hiện; nút "Hướng dẫn" mở lại, Esc đóng (F-061, AC-061-05)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/users', { username: 'nv-moi', password: 'Moi@1234', fullName: 'Nhân viên mới', role: 'STAFF' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const N = await ctx.newPage();
    watch(N, 'nv-moi');
    await N.goto('/pos/login');
    await N.fill('#username', 'nv-moi');
    await N.fill('#password', 'Moi@1234');
    await N.click('#submit');
    await expect(N).toHaveURL(/\/pos$/);
    const box = N.getByRole('dialog');
    await expect(box).toContainText('Bước 1 / 5');
    await expect(N.locator('.tour-ring')).toBeVisible();
    // Bước 1 khoanh đúng nút ca
    // Khung bám theo nút ca kể cả khi nút đổi chữ sau khi tải ca (bỏ qua lúc khung đang trượt tới)
    await expect
      .poll(async () => {
        const ring = await N.locator('.tour-ring').boundingBox();
        const btn = await N.locator('#shift-btn').boundingBox();
        return Math.abs(ring.x + 6 - btn.x) < 2 && Math.abs(ring.width - 12 - btn.width) < 2;
      })
      .toBe(true);
    const titles = ['Mở ca', 'Đơn mới → Tiếp nhận', 'Đang pha → Hoàn tất', 'Bàn & thu tiền', 'Cuối ca: Đóng ca'];
    for (let i = 0; i < titles.length; i += 1) {
      await expect(box.locator('.tour-title')).toHaveText(titles[i]);
      await expect(box).toContainText(`Bước ${i + 1} / 5`);
      await box.getByRole('button', { name: i === titles.length - 1 ? 'Xong' : 'Tiếp' }).click();
    }
    await expect(N.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await apiAs(request, 'get', '/api/admin/users')).find((u) => u.username === 'nv-moi').tourSeenAt).not.toBeNull();
    await N.reload();
    await expect(N.locator('#conn')).toHaveText('Đã kết nối');
    await expect(N.getByRole('dialog')).toHaveCount(0);
    await N.getByRole('button', { name: 'Hướng dẫn' }).click();
    await expect(N.getByRole('dialog')).toContainText('Bước 1 / 5');
    await N.keyboard.press('Escape');
    await expect(N.getByRole('dialog')).toHaveCount(0);
    await expect(N.getByRole('button', { name: 'Hướng dẫn' })).toBeFocused(); // trả focus về nút đã mở
    // Màn < 1200 px: lưới bàn là ngăn trượt → bước 4 khoanh nút "Bàn" và nói "Bấm nút Bàn…" (BR-097)
    await N.setViewportSize({ width: 1024, height: 800 });
    await N.getByRole('button', { name: 'Hướng dẫn' }).click();
    for (let i = 0; i < 3; i += 1) await N.getByRole('dialog').getByRole('button', { name: 'Tiếp' }).click();
    await expect(N.locator('.tour-title')).toHaveText('Bàn & thu tiền');
    await expect(N.getByRole('dialog')).toContainText('Bấm nút Bàn để mở lưới bàn');
    await expect
      .poll(async () => {
        const ring = await N.locator('.tour-ring').boundingBox();
        const btn = await N.locator('#tables-toggle').boundingBox();
        return Math.abs(ring.x + 6 - btn.x) < 2 && Math.abs(ring.y + 6 - btn.y) < 2;
      })
      .toBe(true);
    await N.keyboard.press('Escape');
    await expect(N.getByRole('dialog')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test('chính sách dữ liệu: khách đăng ký hội viên ở giỏ bấm "Xem chính sách dữ liệu" → tab mới có tên quán, "Quyền của bạn", cách yêu cầu xóa; điện thoại không cuộn ngang (F-062, AC-062-03)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/tables', { code: 'CS', name: 'Bàn thử chính sách' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'CS');
  const shop = await (await request.get('/api/shop')).json();
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    // F-081: món đầu danh mục (Bạc xỉu) có tùy chọn → "+" mở bảng chọn; dùng món không tùy chọn để thêm ngay
    await G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
    await G.click('#open-cart');
    await G.locator('.sheet .member-box').click();
    await G.locator('input[type="tel"]').fill('0933444555');
    await G.getByRole('button', { name: 'Tiếp tục' }).click();
    const [policy] = await Promise.all([phone.waitForEvent('page'), G.getByRole('link', { name: 'Xem chính sách dữ liệu' }).click()]);
    watch(policy, 'policy');
    await expect(policy).toHaveURL(/\/chinh-sach-du-lieu$/);
    await expect(policy.locator('#shop')).toHaveText(shop.name);
    await expect(policy.getByRole('heading', { name: 'Quyền của bạn' })).toBeVisible();
    await expect(policy.getByText('Ẩn danh theo yêu cầu')).toBeVisible();
    expect(await policy.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  } finally {
    await phone.close();
    const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'CS')?.sessions?.[0];
    // Hủy bàn cần ca đang mở (F-055) — bài trước có thể vừa đóng ca; a11y chạy sau tự dùng ca đang mở
    if (s && !(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
    if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử chính sách dữ liệu' });
    await apiAs(request, 'delete', `/api/admin/tables/${t.tableId}`);
  }
});

test('ô hội viên trên màn khách: chủ quán bỏ tích "Ô Nhập SĐT để nhận ưu đãi" ở Cài đặt → giỏ hàng và trang theo dõi đơn của khách không còn ô hội viên; tích lại → ô hiện lại (F-101, AC-101-03)', async ({
  request,
}) => {
  const toggle = async (want) => {
    await P.goto('/admin/settings');
    await P.locator('label', { hasText: 'Nhập SĐT để nhận ưu đãi' }).click();
    await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
    expect((await apiAs(request, 'get', '/api/admin/settings')).guestMemberBox).toBe(want);
  };
  await toggle(false);
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  await apiAs(request, 'post', '/api/admin/tables', { code: 'MB', name: 'Bàn thử ô hội viên' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'MB');
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
    await G.click('#open-cart');
    await expect(G.locator('.sheet .cart-line-main').first()).toBeVisible();
    await expect(G.locator('.sheet .member-box')).toHaveCount(0);
    await G.goto(`/t/${t.qrToken}/track`);
    await expect(G.locator('#actions')).toBeVisible(); // trang đã vẽ xong (ô hội viên gắn cùng lượt vẽ này)
    await expect(G.locator('.member-box')).toHaveCount(0);

    await toggle(true);
    await G.reload();
    await expect(G.locator('#actions')).toBeVisible();
    await expect(G.locator('.member-box')).toBeVisible();
    await G.goto(`/t/${t.qrToken}/menu`);
    await G.click('#open-cart');
    await expect(G.locator('.sheet .member-box')).toBeVisible();
  } finally {
    await phone.close();
    const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'MB')?.sessions?.[0];
    if (s && !(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
    if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử ô hội viên' });
    await apiAs(request, 'delete', `/api/admin/tables/${t.tableId}`);
    if (!(await apiAs(request, 'get', '/api/admin/settings')).guestMemberBox) await apiAs(request, 'put', '/api/admin/settings', { guestMemberBox: true });
  }
});

test('gọi nhân viên 5 lần / 1 phút: khách bấm "Gọi nhân viên" 5 lần liền vẫn gửi được, nút không khóa; lần 6 máy chủ báo chờ → nút khóa "Đã gọi nhân viên (gọi lại sau … s)" (ADR-072, AC-021-05)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  await apiAs(request, 'post', '/api/admin/tables', { code: 'GN', name: 'Bàn thử gọi nhân viên' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'GN');
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.goto(`/t/${t.qrToken}/track`);
    const btn = G.locator('#call-staff');
    for (let i = 1; i <= 5; i++) {
      await btn.click();
      await G.locator('.sheet').getByRole('button', { name: 'Gọi nhân viên' }).click();
      await expect(G.locator('.sheet')).toHaveCount(0);
      await expect(btn).toBeEnabled(); // chưa đủ 5 lần → vẫn gọi tiếp được
    }
    await btn.click();
    await G.locator('.sheet').getByRole('button', { name: 'Gọi nhân viên' }).click();
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveText(/Đã gọi nhân viên \(gọi lại sau \d+s\)/);
    expect((await apiAs(request, 'get', '/api/staff-calls')).filter((c) => c.table?.code === 'GN')).toHaveLength(5);
  } finally {
    await phone.close();
    const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'GN')?.sessions?.[0];
    if (s && !(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
    if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử gọi nhân viên' });
    await apiAs(request, 'delete', `/api/admin/tables/${t.tableId}`);
  }
});

test('cảnh báo QR sai địa chỉ: trang In QR báo địa chỉ localhost; bấm In → lưu địa chỉ đang chạy; QR in ở địa chỉ cũ hoặc máy chủ đã đổi IP → dải đỏ ở trang quản lý và màn quầy (F-063, AC-063-04)', async () => {
  await P.goto('/admin/tables/print');
  await expect(P.locator('#qr-wrong')).toContainText('điện thoại không mở được địa chỉ localhost');
  await P.evaluate(() => {
    globalThis.print = () => {}; // không mở hộp in thật trong E2E
  });
  const saved = P.waitForResponse((r) => r.url().endsWith('/api/admin/qr-printed') && r.request().method() === 'POST');
  await P.getByRole('button', { name: 'In', exact: true }).click();
  expect((await (await saved).json()).printedBaseUrl).toBe('http://localhost:3100');
  // Trang quản lý khác không nhắc localhost (chạy thử trên máy là bình thường)
  let checked = P.waitForResponse((r) => r.url().endsWith('/api/qr-check'));
  await P.goto('/admin/reports');
  await checked;
  await expect(P.locator('#qr-wrong')).toHaveCount(0);
  // Laptop đổi mạng sau khi in: giả lập kết quả kiểm (máy chủ E2E chỉ chạy ở một địa chỉ; logic lệch kiểm ở basic-mode.test.js)
  const moved = {
    baseUrl: 'http://172.168.238.72:3000',
    printedBaseUrl: 'http://10.50.2.11:3000',
    printedAt: new Date().toISOString(),
    mismatch: true,
    localhost: false,
    unreachable: false,
    machineIps: ['172.168.238.72'],
  };
  await P.route('**/api/qr-check', (r) => r.fulfill({ json: moved }));
  try {
    await P.goto('/admin/reports');
    await expect(P.locator('#qr-wrong')).toContainText('QR đang dán trên bàn trỏ tới http://10.50.2.11:3000 nhưng app đang chạy ở http://172.168.238.72:3000');
    await expect(P.locator('#qr-wrong').getByRole('link', { name: 'In lại QR' })).toHaveAttribute('href', '/admin/tables/print');
    await P.goto('/pos');
    await expect(P.locator('#qr-wrong')).toContainText('QR trên bàn đang trỏ địa chỉ cũ (http://10.50.2.11:3000)');
    // .env ghi cứng IP cũ, máy đã đổi IP (địa chỉ lúc in = địa chỉ đang chạy): báo theo IP thật của máy
    await P.unroute('**/api/qr-check');
    const gone = { ...moved, baseUrl: 'http://10.50.2.11:3000', mismatch: false, unreachable: true };
    await P.route('**/api/qr-check', (r) => r.fulfill({ json: gone }));
    await P.goto('/admin/reports');
    await expect(P.locator('#qr-wrong')).toContainText('máy chủ không còn ở IP đó (IP hiện tại: 172.168.238.72)');
    await P.goto('/pos');
    await expect(P.locator('#qr-wrong')).toContainText('Máy chủ đã đổi IP');
  } finally {
    await P.unroute('**/api/qr-check');
  }
  checked = P.waitForResponse((r) => r.url().endsWith('/api/qr-check'));
  await P.goto('/pos');
  await checked;
  await expect(P.locator('#qr-wrong')).toHaveCount(0);
});

test('báo động giá vốn: nhập sữa giá cao hơn → cảnh báo tới trang Cảnh báo qua realtime, bảng món + giá gợi ý; "Đổi giá" mở sẵn hộp sửa đúng món; Cài đặt sửa được ngưỡng (F-064, AC-064-10)', async ({
  request,
}) => {
  const [category] = await apiAs(request, 'get', '/api/admin/categories');
  const milk = (await apiAs(request, 'post', '/api/admin/ingredients', { name: 'Sữa giá vốn', unit: 'ml', stockQty: 0, lowStockThreshold: 0 })).ingredientId;
  await apiAs(request, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: milk, qty: 10000, unitCost: 30 }] });
  const item = (await apiAs(request, 'post', '/api/admin/menu-items', { categoryId: category.categoryId, name: 'Latte giá vốn', price: 45000 })).menuItemId;
  await apiAs(request, 'put', `/api/admin/menu-items/${item}/bom`, [{ ingredientId: milk, amount: 200 }]);

  await P.goto('/admin/alerts');
  await expect(P.getByRole('button', { name: /^Mới \(\d+\)$/ })).toBeVisible();
  const receipt = await apiAs(request, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: milk, qty: 10000, unitCost: 36 }] });
  const title = `Giá Sữa giá vốn tăng 20% — 1 món tụt lãi (phiếu nhập #${receipt.receiptId})`;
  await expect(P.locator('.toast', { hasText: title })).toBeVisible();
  const card = P.locator('.alert-card', { hasText: title });
  await expect(card.locator('.badge').first()).toHaveText('Giá vốn tăng');
  await expect(card).toContainText('Sữa giá vốn: 30đ/ml → 36đ/ml (+20%)');
  const row = card.getByRole('row', { name: /Latte giá vốn/ });
  await expect(row).toContainText('6.000đ → 7.200đ');
  await expect(row).toContainText('86,7% → 84%');
  await expect(row).toContainText('47.000đ (giữ tiền lãi)');
  await expect(row).toContainText('54.000đ (giữ % lãi)');
  // Màn điện thoại: bảng cuộn trong khung, trang không cuộn ngang
  await P.setViewportSize({ width: 390, height: 800 });
  expect(await P.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await P.setViewportSize({ width: 1366, height: 860 });
  await card.getByRole('link', { name: 'Đổi giá Latte giá vốn' }).click();
  await expect(P).toHaveURL(new RegExp(`/admin/menu\\?edit=${item}$`));
  const dialog = P.getByRole('dialog');
  await expect(dialog.locator('#price')).toHaveValue(/^45[.,]?000$/);
  await expect(dialog.locator('input[name="name"]')).toHaveValue('Latte giá vốn');
  await P.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await P.goto('/admin/settings');
  const rise = P.locator('input[name="alertCostRisePct"]');
  await expect(rise).toHaveValue('5');
  await rise.fill('7');
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
  expect((await apiAs(request, 'get', '/api/admin/settings')).alertCostRisePct).toBe(7);
  await apiAs(request, 'put', '/api/admin/settings', { alertCostRisePct: 5 });
});

test('lãi / lỗ dễ hiểu: câu trả lời lãi hay lỗ, "Tiền đi đâu", mức cần bán mỗi ngày và hôm nay, lưu ý tự phát hiện, chi tiết thu gọn (F-034, AC-034-08, AC-034-09)', async () => {
  // Số liệu giả lập (route) để kiểm đúng từng câu chữ; phần tính toán đã có test integration (AC-034-01…07)
  const day = (offset) => new Date(Date.now() + 7 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
  const today = day(0);
  const lastMonthEnd = new Date(Date.parse(`${today.slice(0, 8)}01T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
  const lastMonthFrom = `${lastMonthEnd.slice(0, 8)}01`;
  const row = (period, revenueNet) => ({
    period,
    revenueNet,
    cogs: 0,
    grossMargin: revenueNet,
    cashExpenses: 0,
    fixedCostsAllocated: 0,
    operatingProfit: revenueNet,
  });
  const main = {
    note: 'ước tính',
    revenueGross: 2_000_000,
    discounts: 100_000,
    refunds: 50_000,
    revenueNet: 1_850_000,
    cogs: 650_000,
    grossMargin: 1_200_000,
    grossMarginPct: 64.86,
    cashExpenses: 50_000,
    fixedCostsAllocated: 500_000,
    fixedCostsPerDay: 500_000,
    operatingProfit: 650_000,
    breakEvenPerDay: 770_833,
    estimatedCogsRows: 0,
    payments: 50,
    lossValue: 120_000,
    expensesByCategory: [{ categoryId: 4, name: 'Lương tạm ứng', amount: 50_000 }],
    series: [row(lastMonthFrom, 900_000), row(lastMonthEnd, 500_000)],
  };
  let data = main;
  await P.route('**/api/admin/reports/pnl?*', (route) => {
    const u = new URL(route.request().url());
    const [from, to] = [u.searchParams.get('from'), u.searchParams.get('to')];
    if (from === today && to === today) return route.fulfill({ json: { ...data, revenueNet: 520_000 } });
    if (from === lastMonthFrom) return route.fulfill({ json: data });
    return route.fulfill({ json: { ...data, operatingProfit: 400_000, payments: 10 } }); // khoảng trước để so sánh
  });
  await P.route('**/api/admin/fixed-costs', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: [{ costId: 1, name: 'Lương nhân viên', monthlyAmount: 6_000_000, effectiveFrom: '2026-01-01', effectiveTo: null }] })
      : route.continue(),
  );
  try {
    await P.goto('/admin/pnl');
    await P.getByRole('button', { name: 'Tháng trước' }).click();
    await expect(P.getByRole('button', { name: 'Tháng trước' })).toHaveAttribute('aria-pressed', 'true');
    const answer = P.locator('.pnl-answer');
    await expect(answer).toContainText('Quán đang lãi 650.000đ');
    await expect(answer).toContainText('Bán được 1.850.000đ, trả nguyên liệu 650.000đ và các chi phí 550.000đ, còn lại 650.000đ.');
    await expect(answer).toContainText('(lãi 400.000đ): tốt hơn 250.000đ');
    const flow = P.locator('.pnl-flow');
    await expect(flow.getByRole('row', { name: /Tiền bán được/ })).toContainText('1.850.000đ');
    await expect(flow.getByRole('row', { name: /Nguyên liệu/ })).toContainText('Cứ 100.000đ bán được thì tốn khoảng 35.135đ nguyên liệu');
    await expect(flow.locator('tr.pnl-total')).toContainText('Lãi');
    await expect(flow.locator('tr.pnl-total')).toContainText('650.000đ');
    const be = P.locator('.pnl-need');
    await expect(be).toContainText('Ít nhất 770.833đ tiền bán được mỗi ngày');
    await expect(be).toContainText('Hôm nay bán được 520.000đ — còn thiếu 250.833đ (67%)');
    await expect(be).toContainText('Trong khoảng đã chọn: 1 / 2 ngày đạt mức này.');
    await expect(be.getByRole('progressbar', { name: 'Hôm nay đã bán so với mức cần bán' })).toBeVisible();
    const hints = P.locator('.pnl-hints');
    await expect(hints).toContainText('lương đang bị trừ hai lần');
    await expect(hints).toContainText('Hàng hao hụt, đổ bỏ, lệch kiểm kê khoảng 120.000đ');
    await expect(hints).not.toContainText('Chưa khai chi phí cố định');
    // Chi tiết thu gọn mặc định
    await expect(P.locator('svg.pnl-chart')).toBeHidden();
    await P.locator('.pnl-detail > summary').click();
    await expect(P.locator('svg.pnl-chart')).toBeVisible();
    // Nút thêm nhanh điền sẵn tên
    await P.getByRole('button', { name: '+ Tiền mặt bằng' }).click();
    await expect(P.getByRole('dialog').locator('input[name="name"]')).toHaveValue('Tiền mặt bằng');
    await P.keyboard.press('Escape');
    await expect(P.getByRole('dialog')).toHaveCount(0);
    // Màn điện thoại không cuộn ngang
    await P.setViewportSize({ width: 390, height: 800 });
    expect(await P.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    await P.setViewportSize({ width: 1366, height: 860 });

    // Lỗ + chưa khai chi phí cố định
    data = { ...main, operatingProfit: -300_000, fixedCostsAllocated: 0, fixedCostsPerDay: 0, breakEvenPerDay: null, lossValue: 0, expensesByCategory: [] };
    await P.getByRole('button', { name: 'Tháng trước' }).click();
    await expect(answer).toContainText('Quán đang lỗ 300.000đ');
    await expect(answer).toContainText('còn thiếu 300.000đ');
    await expect(P.locator('.pnl-flow tr.pnl-total')).toContainText('Lỗ');
    await expect(P.locator('.pnl-need')).toContainText('Khai chi phí cố định (mặt bằng, lương…) ở mục bên dưới');
    await expect(P.locator('.pnl-hints')).toContainText('Chưa khai chi phí cố định');
  } finally {
    await P.unroute('**/api/admin/reports/pnl?*');
    await P.unroute('**/api/admin/fixed-costs');
  }
  await P.goto('/admin/pnl');
  await expect(P.locator('.pnl-answer .pnl-verdict')).toContainText(/Quán đang (lãi|lỗ)|Chưa có tiền bán hàng/);
});

test('sổ quỹ dễ dùng: chọn danh mục bằng nút, số tiền nhanh, nội dung để trống = tên danh mục, báo trước khoản chờ duyệt; trang quản lý có kỳ nhanh, dải chờ duyệt, ghi khoản khi có ca (F-033, AC-033-11, AC-033-12)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const threshold = (await apiAs(request, 'get', '/api/admin/settings')).cashApproveThreshold;
  const vnd = (n) => `${n.toLocaleString('vi-VN')}đ`;
  await P.goto('/pos/shift');
  const card = P.locator('.card', { hasText: 'Sổ quỹ trong ca' });
  const open = async (label) => {
    await card.getByRole('button', { name: label, exact: true }).click();
    return P.locator('.modal');
  };
  // Chi 50.000đ "Mua đá", để trống nội dung
  let m = await open('Chi tiền');
  const chips = m.getByRole('group', { name: 'Danh mục' });
  await expect(chips.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await chips.getByRole('button', { name: 'Mua đá', exact: true }).click();
  await m.getByRole('group', { name: 'Số tiền nhanh' }).getByRole('button', { name: '50.000đ' }).click();
  await expect(m.locator('#cash-amount')).toHaveValue('50.000');
  await expect(m.locator('#cash-reason')).toHaveAttribute('placeholder', 'Để trống sẽ ghi "Mua đá"');
  await expect(m.locator('.cash-note')).toContainText('Lưu xong là trừ vào tiền dự kiến trong két');
  await m.getByRole('button', { name: 'Ghi khoản chi' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã ghi 50.000đ' })).toBeVisible();
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const rows = (await apiAs(request, 'get', `/api/admin/cash-transactions?from=${today}&to=${today}`)).rows;
  const mine = rows.reduce((a, b) => (b.cashTxnId > a.cashTxnId ? b : a));
  expect([mine.reason, mine.amount, mine.status]).toEqual(['Mua đá', 50000, 'APPROVED']);
  await expect(P.locator('table.cash-book tr', { hasText: `#${mine.cashTxnId}` })).toContainText('Mua đá');
  // Danh mục luôn cần duyệt: báo trước + bắt ghi nội dung
  m = await open('Chi tiền');
  await m.getByRole('button', { name: 'Khác (chi)', exact: true }).click();
  await m.locator('#cash-amount').fill('10000');
  await expect(m.locator('.cash-note')).toContainText('Cần duyệt');
  await expect(m.locator('.cash-note')).toContainText('danh mục "Khác (chi)" luôn cần duyệt');
  await m.getByRole('button', { name: 'Ghi khoản chi' }).click();
  await expect(m.locator('.field-error')).toHaveText('Danh mục "Khác (chi)" cần ghi rõ nội dung');
  // Chi vượt ngưỡng: báo trước theo ngưỡng trong Cài đặt
  await m.getByRole('button', { name: 'Mua đá', exact: true }).click();
  await m.locator('#cash-amount').fill(String(threshold + 100000));
  await expect(m.locator('.cash-note')).toContainText(`chi trên ${vnd(threshold)}`);
  await m.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(P.locator('.modal')).toHaveCount(0);

  // Trang quản lý: kỳ nhanh, dải chờ duyệt, ghi khoản khi có ca
  const cats = Object.fromEntries((await apiAs(request, 'get', '/api/cash-categories')).map((c) => [c.name, c.categoryId]));
  const pending = await apiAs(request, 'post', '/api/cash-transactions', { categoryId: cats['Khác (chi)'], amount: 20000, reason: 'Sổ quỹ dễ dùng E2E' });
  await P.goto('/admin/cash');
  await expect(P.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true');
  await expect(P.locator('#head-actions').getByRole('button', { name: 'Chi tiền' })).toBeVisible();
  await expect(P.locator('.kpi', { hasText: 'Đã chi' })).toBeVisible();
  await P.getByRole('button', { name: 'Hôm nay' }).click();
  await expect(P.getByRole('button', { name: 'Hôm nay' })).toHaveAttribute('aria-pressed', 'true');
  const banner = P.locator('.alert.warning', { hasText: 'khoản chờ duyệt' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Xem các khoản chờ duyệt' }).click();
  await expect(P.locator('.cash-more > summary')).toHaveText('Lọc thêm (1)');
  await expect(P.locator('table.cash-book tbody tr', { hasText: 'Sổ quỹ dễ dùng E2E' })).toContainText('Chờ duyệt');
  expect(await P.locator('table.cash-book tbody tr').evaluateAll((trs) => trs.every((tr) => tr.textContent.includes('Chờ duyệt')))).toBe(true);
  await P.setViewportSize({ width: 390, height: 800 });
  expect(await P.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await P.setViewportSize({ width: 1366, height: 860 });
  await apiAs(request, 'post', `/api/cash-transactions/${pending.cashTxnId}/reject`, { rejectReason: 'dọn dữ liệu E2E' });
});

test('hội viên dễ theo dõi: khách mua → điểm tự tích hiện ở "Tích điểm gần đây"; ô tổng quan, lọc nhanh, tiến độ lên hạng; hồ sơ có điểm / hạng nổi bật, sửa thông tin thu gọn, nút điểm nhanh (F-014, AC-014-11)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const water = (await apiAs(request, 'get', '/api/admin/menu-items')).find((i) => i.name === 'Nước suối');
  const m = await apiAs(request, 'post', '/api/members', { phone: '0907000082', fullName: 'Khách Theo Dõi', consent: true });
  await apiAs(request, 'post', '/api/orders/takeaway', {
    items: [{ menuItemId: water.menuItemId, quantity: 10 }],
    amountReceived: 5_000_000,
    memberId: m.memberId,
  });

  await P.goto('/admin/members');
  await expect(P.locator('.kpi', { hasText: 'Điểm tích hôm nay' }).locator('.value')).toHaveText(/^\+[1-9]/);
  await expect(P.locator('.kpi', { hasText: 'Lượt thu có hội viên hôm nay' })).toBeVisible();
  const feed = P.locator('.mem-feed li').first();
  await expect(feed).toContainText('Khách Theo Dõi');
  await expect(feed).toContainText('tích khi thu tiền');
  await expect(feed.locator('.mem-delta')).toHaveText(/^\+[1-9]/);

  const views = P.getByRole('group', { name: 'Lọc nhanh hội viên' });
  await expect(views.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
  await views.getByRole('button', { name: /^Mới tháng này \(\d+\)$/ }).click();
  await expect(views.getByRole('button', { name: /^Mới tháng này/ })).toHaveAttribute('aria-pressed', 'true');
  const row = P.locator('table.mem-table tbody tr', { hasText: 'Khách Theo Dõi' });
  await expect(row).toContainText('lên Thân thiết');
  await expect(row.getByRole('progressbar', { name: 'Tiến độ lên hạng Thân thiết' })).toBeVisible();
  await expect(row).toContainText('hôm nay');

  await feed.getByRole('button', { name: 'Khách Theo Dõi' }).click();
  const dlg = P.getByRole('dialog');
  await expect(dlg.locator('.mem-summary')).toContainText('Điểm hiện có');
  await expect(dlg.locator('.mem-summary')).toContainText('lên Thân thiết');
  await expect(dlg.locator('input[name="fullName"]')).toBeHidden(); // sửa thông tin thu gọn
  await dlg.locator('.mem-edit > summary').click();
  await expect(dlg.locator('input[name="fullName"]')).toHaveValue('Khách Theo Dõi');
  await dlg.getByRole('group', { name: 'Điểm nhanh' }).getByRole('button', { name: '+50' }).click();
  await expect(dlg.getByLabel('Số điểm cộng / trừ')).toHaveValue('50');
  await P.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  await P.setViewportSize({ width: 390, height: 800 });
  expect(await P.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  await P.setViewportSize({ width: 1366, height: 860 });
});

test('ra món khi bạn tới: khách chọn "Khi bạn tới" → quầy thấy phiếu "Chờ bạn tới" cuối cột Mới, không đồng hồ chờ; khách bấm "Bạn đã tới — làm món" → phiếu thành đơn mới, quầy tiếp nhận; đơn hẹn giờ tới giờ tự thành đơn mới (F-066, AC-066-04)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'HB1', name: 'Bàn HB1' });
  const phone = await browser.newContext(phoneOpts);
  const G = await phone.newPage();
  watch(G, 'hold');
  try {
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
    await G.click('#open-cart');
    const when = G.getByRole('group', { name: 'Khi nào làm món?' });
    await expect(when.getByRole('button', { name: 'Làm ngay' })).toHaveAttribute('aria-pressed', 'true');
    await when.getByRole('button', { name: 'Khi bạn tới' }).click();
    await expect(G.locator('.sheet')).toContainText('Quán giữ món tối đa 45 phút');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const card = G.locator('.order-card').first();
    await expect(card.locator('.badge')).toHaveText('Chờ bạn tới');

    await P.goto('/pos');
    const held = P.locator('#col-PENDING .ticket.held', { hasText: 'Bàn HB1' });
    await expect(held).toContainText('Chờ bạn tới');
    await expect(held.locator('.wait-chip')).toHaveCount(0);
    await expect(P.locator('#col-PENDING .ticket').last()).toHaveClass(/held/); // nằm cuối cột Mới

    await card.getByRole('button', { name: 'Bạn đã tới — làm món' }).click();
    await expect(card.locator('.badge')).toHaveText('Chờ xác nhận');
    await expect(P.locator('.toast', { hasText: 'Bàn HB1: khách đã tới' })).toBeVisible();
    const ready = P.locator('#col-PENDING .ticket:not(.held)', { hasText: 'Bàn HB1' });
    await expect(ready.locator('.wait-chip')).toBeVisible();
    await ready.getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
    await expect(card.locator('.badge')).toHaveText('Đang chuẩn bị');

    // Đơn hẹn 10 phút: máy quầy (đồng hồ giả) tua 11 phút → phiếu tự thành đơn mới + báo "tới giờ làm"
    const counter = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
    await counter.clock.install();
    const Q = await counter.newPage();
    try {
      await Q.goto('/pos/login');
      await Q.fill('#username', 'staff1');
      await Q.fill('#password', 'Staff@123');
      await Q.click('#submit');
      await expect(Q).toHaveURL(/\/pos$/);
      await G.goto(`/t/${t.qrToken}/menu`);
      await G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
      await G.click('#open-cart');
      await G.getByRole('group', { name: 'Khi nào làm món?' }).getByRole('button', { name: 'Sau 10 phút' }).click();
      await G.locator('.sheet .modal-foot .btn-primary').click();
      await expect(G).toHaveURL(/\/track$/);
      const timed = Q.locator('#col-PENDING .ticket', { hasText: 'Nước suối' }).filter({ hasText: 'Bàn HB1' });
      await expect(timed).toHaveClass(/held/);
      await expect(timed).toContainText('Làm lúc');
      await Q.clock.fastForward('11:00');
      await expect(Q.locator('.toast', { hasText: 'Bàn HB1: tới giờ làm đơn' })).toBeVisible();
      await expect(timed).not.toHaveClass(/held/);
      await expect(timed.getByRole('button', { name: 'Tiếp nhận', exact: true })).toBeVisible();
    } finally {
      await counter.close();
    }
  } finally {
    await phone.close();
  }
});

test('vòng quay may mắn: quản lý bật + chỉnh ô quà ở Tích điểm → hóa đơn có QR; khách ở màn cảm ơn bấm "quay ngay" → quay → nhận voucher; mở lại thấy kết quả cũ, không quay lần 2 (F-065, AC-065-07)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  await P.goto('/admin/loyalty');
  await P.getByRole('tab', { name: 'Vòng quay may mắn' }).click();
  const enabled = P.getByLabel('Bật vòng quay may mắn');
  await expect(enabled).not.toBeChecked(); // mặc định tắt
  await P.getByText('Bật vòng quay (in QR trên hóa đơn và màn cảm ơn)').click(); // bấm nhãn công tắc như người dùng
  await expect(enabled).toBeChecked();
  // Chỉ để ô "Giảm 10%" có tỷ lệ → chắc chắn trúng voucher (ô "Chúc may mắn" vẫn phải có, tỷ lệ 0)
  for (const i of [2, 3, 4]) await P.getByLabel(`Tỷ lệ ô ${i}`).fill('0');
  await expect(P.locator('table.spin-prizes tbody tr').first().locator('td.num')).toHaveText('100%');
  await P.getByRole('button', { name: 'Lưu vòng quay' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu — hóa đơn từ giờ in QR vòng quay' })).toBeVisible();

  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'VQ1', name: 'Bàn VQ1' });
  const phone = await browser.newContext({ ...phoneOpts, reducedMotion: 'reduce' });
  const G = await phone.newPage();
  watch(G, 'spin');
  try {
    await G.goto(`/t/${t.qrToken}`);
    const den = G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' });
    await den.locator('.add-btn').click();
    await den.getByRole('button', { name: 'Thêm Cà phê đen' }).click(); // nút + của ô số lượng
    await G.click('#open-cart');
    await expect(G.locator('.sheet .modal-foot .btn-primary')).toContainText('50.000đ'); // đủ mức quay 30.000đ
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const sessionId = await G.evaluate((k) => globalThis.localStorage.getItem(k), `cf_session_${t.qrToken}`);
    const session = await apiAs(request, 'get', `/api/sessions/${sessionId}`);
    for (const o of session.orders) await apiAs(request, 'post', `/api/orders/${o.orderId}/accept`);
    await apiAs(request, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 100000 });

    await P.goto(`/pos/sessions/${sessionId}/receipt`);
    await expect(P.locator('#receipt')).toContainText('QUÉT QR ĐỂ QUAY MAY MẮN');
    await expect(P.getByRole('img', { name: 'Mã QR vòng quay may mắn' })).toBeVisible();

    const go = G.getByRole('link', { name: 'Bạn có 1 lượt quay may mắn — quay ngay' });
    await expect(go).toBeVisible();
    await go.click();
    await expect(G).toHaveURL(/\/quay\/[0-9a-f]{32}$/);
    await expect(G.getByRole('img', { name: /Vòng quay gồm các ô: Giảm 10%/ })).toBeVisible();
    await G.getByRole('button', { name: 'Quay ngay' }).click();
    const result = G.locator('.spin-result');
    await expect(result.getByRole('heading')).toHaveText('Bạn trúng: Giảm 10%');
    await expect(result.locator('.voucher-code')).toHaveText(/^QM[0-9A-F]{8}$/);
    await expect(result).toContainText('đọc mã này cho nhân viên khi thanh toán');
    await expect(G.locator('#spin-live')).toHaveText('Bạn trúng Giảm 10%.');
    const code = await result.locator('.voucher-code').textContent();

    await G.reload();
    await expect(G.getByRole('heading', { name: 'Kết quả lượt quay của bạn' })).toBeVisible();
    await expect(G.getByRole('button', { name: 'Quay ngay' })).toHaveCount(0);
    await expect(G.locator('.voucher-code')).toHaveText(code);
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);

    await P.goto('/admin/loyalty');
    await P.getByRole('tab', { name: 'Vòng quay may mắn' }).click();
    await expect(P.locator('.kpi', { hasText: 'Lượt quay (7 ngày)' }).locator('.value')).toHaveText('1');
    await P.getByRole('tab', { name: 'Voucher' }).click();
    await expect(P.locator('#content tbody tr', { hasText: code })).toContainText('Vòng quay may mắn');
  } finally {
    await phone.close();
  }
});

test('quà sinh nhật: quản lý bật ở tab Quà sinh nhật; điện thoại khách đang sinh nhật thấy lời chúc; quầy thấy dải "Sinh nhật khách", tổng đã trừ quà, "Không dùng quà lần này" bỏ trừ; thu xong hóa đơn có "Quà sinh nhật" (F-067, AC-067-07)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const m = await apiAs(request, 'post', '/api/members', { phone: '0907067067', fullName: 'Khách Sinh Nhật', consent: true });
  await apiAs(request, 'put', `/api/admin/members/${m.memberId}`, {
    fullName: 'Khách Sinh Nhật',
    tierCode: 'MEMBER',
    birthDate: `1996-${today.slice(5)}`,
    isActive: true,
  });

  await P.goto('/admin/loyalty');
  await P.getByRole('tab', { name: 'Quà sinh nhật' }).click();
  await expect(P.locator('#content tbody tr', { hasText: 'Khách Sinh Nhật' })).toContainText('Đang trong tuần sinh nhật — chưa ghé');
  const enabled = P.getByLabel('Bật quà sinh nhật');
  await expect(enabled).not.toBeChecked(); // mặc định tắt
  await P.getByText('Bật quà sinh nhật', { exact: true }).click(); // bấm nhãn công tắc như người dùng
  await expect(enabled).toBeChecked();
  await expect(P.locator('.bday-preview')).toContainText('được giảm 20% (tối đa 50.000đ)');
  await P.getByRole('button', { name: 'Lưu quà sinh nhật' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu — hội viên sinh nhật sẽ được tặng quà' })).toBeVisible();

  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'SN1', name: 'Bàn SN1' });
  const phone = await browser.newContext(phoneOpts);
  const G = await phone.newPage();
  watch(G, 'birthday');
  try {
    await G.goto(`/t/${t.qrToken}`);
    await G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
    await G.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).getByRole('button', { name: 'Thêm Cà phê đen' }).click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const sessionId = await G.evaluate((k) => globalThis.localStorage.getItem(k), `cf_session_${t.qrToken}`);
    const session = await apiAs(request, 'get', `/api/sessions/${sessionId}`);
    for (const o of session.orders) await apiAs(request, 'post', `/api/orders/${o.orderId}/accept`);
    await apiAs(request, 'post', `/api/sessions/${sessionId}/member`, { memberId: m.memberId });
    const note = G.locator('.bday-note');
    await expect(note).toContainText('Chúc mừng sinh nhật bạn!');
    await expect(note).toContainText('Quán tặng bạn: Giảm 20% (tối đa 50.000đ) — tự trừ khi thanh toán');

    await P.goto('/pos');
    await P.locator('#tables .table-row', { hasText: 'Bàn SN1' }).getByRole('button', { name: 'Thu tiền' }).click();
    const drawer = P.locator('.drawer');
    const strip = drawer.locator('.bday-strip');
    await expect(strip).toContainText('Sinh nhật khách');
    await expect(strip).toContainText('(hôm nay)');
    await expect(strip).toContainText('Đã tự áp quà: Giảm 20%');
    const giftRow = drawer.locator('.due-row', { hasText: 'Quà sinh nhật' });
    await expect(giftRow).toBeVisible();
    await strip.getByRole('button', { name: 'Không dùng quà lần này' }).click();
    await expect(giftRow).toHaveCount(0);
    await strip.getByRole('button', { name: 'Dùng quà' }).click();
    await expect(giftRow).toBeVisible();
    await P.keyboard.press('Escape');

    await apiAs(request, 'post', `/api/sessions/${sessionId}/settle`, { amountReceived: 100000 });
    await P.goto(`/pos/sessions/${sessionId}/receipt`);
    await expect(P.locator('#receipt')).toContainText('Quà sinh nhật');
    await P.goto('/admin/loyalty');
    await P.getByRole('tab', { name: 'Quà sinh nhật' }).click();
    await expect(P.locator('#content tbody tr', { hasText: 'Khách Sinh Nhật' })).toContainText('Đã dùng quà');
  } finally {
    await phone.close();
  }
});

test('thu thập ngày sinh: đăng ký nhanh ở quầy có ô ngày sinh (để trống năm), quầy nhắc hội viên chưa có ngày sinh → Lưu / Khách không muốn cho, khách tự đăng ký có ô ngày sinh, tab Quà sinh nhật có Thu thập ngày sinh → Chưa có ngày sinh, thẻ QR có dòng mời (F-068, AC-068-05)', async ({
  request,
}) => {
  const cur = await apiAs(request, 'get', '/api/admin/birthday');
  const { kind, value, maxDiscount, menuItemId, windowDays } = cur;
  if (!cur.enabled) await apiAs(request, 'put', '/api/admin/birthday', { enabled: true, kind, value, maxDiscount, menuItemId, windowDays });
  const birthOf = async (phone) => {
    const { member } = await apiAs(request, 'post', '/api/members/lookup', { phone });
    return (await apiAs(request, 'get', `/api/admin/members/${member.memberId}`)).member.birthDate;
  };
  await apiAs(request, 'post', '/api/members', { phone: '0907068001', fullName: 'Khách Quen Chưa Ngày Sinh', consent: true });
  await apiAs(request, 'post', '/api/members', { phone: '0907068002', fullName: 'Khách Không Muốn Cho', consent: true });

  // Quầy đăng ký nhanh: chọn ngày + tháng sinh, để trống năm
  await P.goto('/pos/takeaway');
  const box = P.locator('details.billing');
  await box.evaluate((d) => (d.open = true));
  const lookup = async (phone) => {
    await P.fill('input[aria-label="SĐT hội viên"]', phone);
    await P.getByRole('button', { name: 'Tra cứu' }).click();
  };
  await lookup('0907068003');
  await P.fill('input[aria-label="Họ tên khách"]', 'Khách Mới Có Ngày Sinh');
  await expect(box.getByRole('group', { name: /Ngày sinh \(để quán tặng quà/ })).toBeVisible();
  await box.locator('#pos-reg-birth-day').selectOption('15');
  await box.locator('#pos-reg-birth-month').selectOption('08');
  await box.locator('.alert input[type="checkbox"]').check();
  await box.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await expect(P.locator('.toast', { hasText: 'Đã đăng ký hội viên' })).toBeVisible();
  await expect(box.locator('.member-on')).toContainText('Khách Mới Có Ngày Sinh');
  await expect(box.locator('.bday-ask')).toHaveCount(0); // đã có ngày sinh → không nhắc
  expect(await birthOf('0907068003')).toBe('--08-15');

  // Khách quen chưa có ngày sinh → quầy nhắc hỏi, kèm câu mẫu
  await box.locator('.member-on').getByRole('button', { name: 'Gỡ' }).click();
  await lookup('0907068001');
  const ask = box.locator('.bday-ask');
  await expect(ask).toContainText('Chưa có ngày sinh — hỏi khách');
  await expect(ask).toContainText('Anh/chị cho em xin ngày sinh để quán tặng quà tuần sinh nhật nhé?');
  await ask.getByRole('button', { name: 'Lưu ngày sinh' }).click();
  await expect(P.locator('.toast', { hasText: 'Chọn ngày và tháng sinh của khách' })).toBeVisible();
  await ask.locator('#pos-ask-birth-day').selectOption('02');
  await ask.locator('#pos-ask-birth-month').selectOption('09');
  await ask.locator('#pos-ask-birth-year').fill('1990');
  await ask.getByRole('button', { name: 'Lưu ngày sinh' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu ngày sinh' })).toBeVisible();
  await expect(ask).toHaveCount(0);
  expect(await birthOf('0907068001')).toBe('1990-09-02');

  // Khách không muốn cho → thôi nhắc
  await box.locator('.member-on').getByRole('button', { name: 'Gỡ' }).click();
  await lookup('0907068002');
  await ask.getByRole('button', { name: 'Khách không muốn cho' }).click();
  await expect(ask).toHaveCount(0);
  await box.locator('.member-on').getByRole('button', { name: 'Gỡ' }).click();

  // Khách tự đăng ký trên điện thoại: ô ngày sinh không bắt buộc, 29/02 không năm
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'NS1', name: 'Bàn NS1' });
  const phone = await browser.newContext(phoneOpts);
  const G = await phone.newPage();
  watch(G, 'birthdate');
  try {
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item', { hasText: 'Bánh croissant' }).locator('.add-btn').click();
    await G.click('#open-cart');
    await G.locator('.sheet .member-box').click();
    await G.locator('input[type="tel"]').fill('0907068004');
    await G.getByRole('button', { name: 'Tiếp tục' }).click();
    await G.getByPlaceholder('Ví dụ: Nguyễn Văn An').fill('Lê Ngọc Mai');
    await expect(G.getByRole('group', { name: /Ngày sinh \(để quán tặng quà/ })).toBeVisible();
    await G.locator('#reg-birth-day').selectOption('29');
    await G.locator('#reg-birth-month').selectOption('02');
    await expect(G.locator('.sheet label.check')).toContainText('ngày sinh (nếu có)');
    await G.locator('.sheet label.check input[type="checkbox"]').check();
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    await G.getByRole('button', { name: 'Đăng ký & nhận ưu đãi' }).click();
    await expect(G.locator('.sheet .member-box.on')).toContainText('Bạn đang nhận ưu đãi');
    expect(await birthOf('0907068004')).toBe('--02-29');
  } finally {
    await phone.close();
  }

  // Quản lý: độ phủ ngày sinh → danh sách "Chưa có ngày sinh"
  await P.goto('/admin/loyalty');
  await P.getByRole('tab', { name: 'Quà sinh nhật' }).click();
  const cover = P.locator('.bday-cover');
  await expect(cover).toContainText('Đã có ngày sinh:');
  await expect(cover).toContainText('Khách không muốn cho');
  await cover.getByRole('link', { name: /Xem ai chưa có ngày sinh/ }).click();
  await expect(P).toHaveURL(/\/admin\/members\?view=nobirth$/);
  await expect(P.getByRole('button', { name: /^Chưa có ngày sinh/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(P.locator('#content tbody tr', { hasText: 'Khách Không Muốn Cho' })).toContainText('khách không muốn cho');
  await expect(P.locator('#content tbody tr', { hasText: 'Khách Quen Chưa Ngày Sinh' })).toHaveCount(0);
  await expect(P.locator('#content tbody tr', { hasText: 'Lê Ngọc Mai' })).toHaveCount(0);

  // Thẻ QR in có dòng mời thêm ngày sinh
  await P.goto('/admin/tables/print');
  await expect(P.locator('.qr-card .qr-bday').first()).toContainText('thêm ngày sinh trong Thẻ thành viên');
});

test('mừng khách quay lại: quản lý bật ở tab; quầy gắn hội viên vắng 52 ngày → dải "Khách quay lại sau 52 ngày", tổng đã trừ quà, "Không dùng quà lần này" bỏ trừ; thu xong tab ghi "Đã dùng quà" (F-069, AC-069-06)', async () => {
  // Hội viên "Khách Lâu Không Ghé" (0907069001, lần cuối ghé 52 ngày trước) có sẵn trong dữ liệu E2E (kịch-bản/e2e-server.js)
  await P.goto('/admin/loyalty');
  await P.getByRole('tab', { name: 'Mừng khách quay lại' }).click();
  const enabled = P.getByLabel('Bật mừng khách quay lại');
  await expect(enabled).not.toBeChecked(); // mặc định tắt
  await P.getByText('Bật mừng khách quay lại', { exact: true }).click();
  await expect(enabled).toBeChecked();
  await expect(P.locator('.wb-preview')).toContainText('45 ngày trở lên chưa ghé, quay lại được giảm 15% (tối đa 30.000đ)');
  await P.getByRole('button', { name: 'Lưu mừng khách quay lại' }).click();
  await expect(P.locator('.toast', { hasText: 'khách vắng lâu quay lại sẽ được tặng quà' })).toBeVisible();

  await P.goto('/pos/takeaway');
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  const box = P.locator('details.billing');
  await box.evaluate((d) => (d.open = true));
  await P.fill('input[aria-label="SĐT hội viên"]', '0907069001');
  await P.getByRole('button', { name: 'Tra cứu' }).click();
  const strip = box.locator('.wb-strip');
  await expect(strip).toContainText('Khách quay lại sau 52 ngày');
  await expect(strip).toContainText('đã ghé 8 lần');
  await expect(strip).toContainText('Đã tự áp quà: Giảm 15%');
  const breakdown = P.locator('#breakdown');
  await expect(breakdown).toContainText('Quà quay lại');
  await strip.getByRole('button', { name: 'Không dùng quà lần này' }).click();
  await expect(breakdown).not.toContainText('Quà quay lại');
  await strip.getByRole('button', { name: 'Dùng quà' }).click();
  await expect(breakdown).toContainText('Quà quay lại');
  await P.fill('#received', '100000');
  await P.click('#pay');
  await expect(P.locator('.toast', { hasText: 'tiền thừa' })).toBeVisible();

  await P.goto('/admin/loyalty');
  await P.getByRole('tab', { name: 'Mừng khách quay lại' }).click();
  await expect(P.locator('#content tbody tr', { hasText: 'Khách Lâu Không Ghé' })).toContainText('Đã dùng quà');
  await expect(P.locator('.kpi', { hasText: 'Khách quay lại (90 ngày)' }).locator('.value')).toHaveText('1');
});

test('ly treo: quản lý bật tab Ly tặng; quầy "Bán ly tặng" → mã + QR; điện thoại mở trang quà thấy lời nhắn + mã + "Gửi cho bạn"; quầy nhập mã cho bill có món → dòng "Ly tặng", nhắc mời đăng ký; tab ghi "Đã dùng" (F-070, AC-070-06)', async () => {
  await P.goto('/admin/loyalty?tab=gift');
  const enabled = P.getByLabel('Bật ly tặng');
  await expect(enabled).not.toBeChecked(); // mặc định tắt
  await P.getByText('Bật ly tặng', { exact: true }).click();
  await P.getByRole('button', { name: 'Lưu ly tặng' }).click();
  await expect(P.locator('.toast', { hasText: 'quầy có nút "Bán ly tặng"' })).toBeVisible();

  // Khách A mua tặng bạn 1 Cà phê đen ở quầy (món "Cà phê sữa" đã bị test trước tắt bán)
  await P.goto('/pos/takeaway');
  await P.getByRole('button', { name: 'Bán ly tặng' }).click();
  const dlg = P.locator('.modal');
  // Giá món có thể đã đổi ở các test trước (giá vốn / giá gợi ý) — chọn theo tên, đọc giá trên nhãn
  const option = dlg.locator('#gift-item option', { hasText: 'Cà phê đen' });
  const priceText = (await option.textContent()).split(' — ')[1];
  await dlg.locator('#gift-item').selectOption(await option.getAttribute('value'));
  await dlg.locator('#gift-giver').fill('Lan');
  await dlg.locator('#gift-message').fill('Chúc mừng sinh nhật!');
  await dlg.getByRole('button', { name: `Thu ${priceText} & tạo mã` }).click();
  await expect(dlg.locator('.alert')).toContainText('tiền mặt, đã ghi Sổ quỹ');
  const code = (await dlg.locator('#gift-code').textContent()).trim();
  expect(code).toMatch(/^TB[A-HJKMNP-Z2-9]{6}$/);
  await expect(dlg.locator('img.gift-qr')).toBeVisible();
  const link = (await dlg.getByRole('link', { name: 'In phiếu' }).getAttribute('href')).split('?')[0];
  await dlg.getByRole('button', { name: 'Xong' }).click();

  // Bạn B mở link trên điện thoại
  const phone = await browser.newContext(phoneOpts);
  const G = await phone.newPage();
  watch(G, 'gift');
  try {
    await G.goto(link);
    await expect(G.locator('.gift-card h1')).toHaveText('Lan tặng bạn 1 Cà phê đen');
    await expect(G.locator('.gift-msg')).toContainText('Chúc mừng sinh nhật!');
    await expect(G.locator('#gift-code')).toHaveText(code);
    await expect(G.getByRole('button', { name: 'Gửi cho bạn' })).toBeVisible();
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  } finally {
    await phone.close();
  }

  // B tới quán: gọi Cà phê đen, đọc mã
  await P.locator('.tile', { hasText: 'Cà phê đen' }).click();
  const box = P.locator('details.billing');
  await box.evaluate((d) => (d.open = true));
  await box.locator('input[aria-label="Mã voucher"]').fill(code);
  await box.getByRole('button', { name: 'Áp mã' }).click();
  await expect(box).toContainText('Ly tặng của Lan: 1 Cà phê đen');
  await expect(box.locator('.gift-invite')).toContainText('mời đăng ký hội viên');
  await expect(P.locator('#breakdown')).toContainText('Ly tặng — 1 Cà phê đen');
  await expect(P.locator('#total')).toHaveText('0đ');
  await P.fill('#received', '0');
  await P.click('#pay');
  await expect(P.locator('.toast', { hasText: 'tiền thừa 0đ' })).toBeVisible();

  await P.goto('/admin/loyalty?tab=gift');
  await expect(P.locator('#content tbody tr', { hasText: code })).toContainText('Đã dùng');
});

test('chấm công nhiều người + lương: nhân viên tự đặt PIN; màn Chấm công vào ca bằng PIN; chi tiền hỏi PIN người đứng máy; không còn nút "Đổi người" (ADR-050) — người khác đăng xuất / đăng nhập; Giờ công của tôi; quản lý nhập hồ sơ lương ở trang Lương (F-072, F-073, AC-072-07, AC-073-09)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/attendance-settings', { attendanceMode: 'KIOSK', moneyPin: true });
  await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-ha', password: 'Pass@123', fullName: 'Hà E2E', role: 'STAFF' });
  const baoUser = await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-bao', password: 'Pass@123', fullName: 'Bảo E2E', role: 'STAFF' });
  // ADR-067: chỉ người có ca lúc này mới có tên ở màn Chấm công — quản lý sắp ca cho Bảo quanh giờ hiện tại; Hà (đứng máy) không có ca
  const vnAt = (ms) => new Date(ms + 7 * 3600e3).toISOString();
  const [rs, re] = [vnAt(Date.now() - 3600e3), vnAt(Date.now() + 5 * 3600e3)];
  await apiAs(request, 'post', '/api/admin/rosters', {
    userId: baoUser.userId,
    workDate: rs.slice(0, 10),
    startTime: rs.slice(11, 16),
    endTime: re.slice(11, 16),
  });
  const bao = await (await request.post('/api/auth/login', { data: { username: 'e2e-bao', password: 'Pass@123' } })).json();
  const pinRes = await request.post('/api/auth/pin', { headers: { Authorization: `Bearer ${bao.accessToken}` }, data: { password: 'Pass@123', pin: '1397' } });
  expect(pinRes.ok()).toBeTruthy();

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const Q = await ctx.newPage();
  watch(Q, 'kiosk');
  try {
    await Q.goto('/pos/login');
    await Q.fill('#username', 'e2e-ha');
    await Q.fill('#password', 'Pass@123');
    await Q.click('#submit');
    await expect(Q).toHaveURL(/\/pos$/);
    await Q.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // F-061: tài khoản mới → hướng dẫn lần đầu

    // Chưa có PIN → dải nhắc; tự đặt PIN bằng mật khẩu đăng nhập
    await Q.locator('#no-pin').getByRole('button', { name: 'Đặt PIN' }).click();
    await Q.fill('#pin-pw', 'Pass@123');
    await Q.fill('#pin-new', '2580');
    await Q.fill('#pin-again', '2580');
    await Q.getByRole('button', { name: 'Lưu PIN' }).click();
    await expect(Q.locator('.toast', { hasText: 'Đã lưu PIN' })).toBeVisible();
    await expect(Q.locator('#no-pin')).toHaveCount(0);

    // Màn chấm công chung: Bảo chạm tên mình, nhập PIN (bàn phím số đổi chỗ — gõ bằng bàn phím máy)
    await Q.locator('#kiosk-btn').click();
    const kiosk = Q.locator('.modal', { hasText: 'Chạm vào tên mình' });
    // ADR-067 (AC-072-14): người không có ca (Hà — đang đứng máy) không có tên; Bảo có ca → có tên kèm giờ ca
    await expect(kiosk.locator('.kiosk-note')).toHaveText('Chỉ người có ca lúc này mới có tên. Không thấy tên mình → nhờ quản lý sắp ca.');
    await expect(kiosk.locator('.person-tile', { hasText: 'Bảo E2E' })).toContainText(`Ca ${rs.slice(11, 16)}–${re.slice(11, 16)} · Chưa vào ca`);
    await expect(kiosk.locator('.person-tile', { hasText: 'Hà E2E' })).toHaveCount(0);
    await kiosk.locator('.person-tile', { hasText: 'Bảo E2E' }).click();
    const pad = Q.locator('.modal', { hasText: 'Vào ca — Bảo E2E' });
    await expect(pad.locator('.pin-key')).toHaveCount(12);
    await Q.keyboard.type('1397');
    await pad.getByRole('button', { name: 'Vào ca' }).click();
    await expect(Q.locator('.toast', { hasText: 'Bảo E2E vào ca lúc' })).toBeVisible();
    await expect(kiosk.locator('.person-tile', { hasText: 'Bảo E2E' })).toContainText('Đang làm từ');
    await kiosk.getByRole('button', { name: 'Xong' }).click();

    // Chi tiền từ két → hỏi PIN của người đang đứng máy
    await Q.goto('/pos/shift');
    await Q.locator('.card', { hasText: 'Sổ quỹ trong ca' }).getByRole('button', { name: 'Chi tiền' }).click();
    await Q.locator('.modal').getByRole('button', { name: 'Mua đá', exact: true }).click();
    await Q.fill('#cash-amount', '20000');
    await Q.fill('#cash-reason', 'Đá E2E chấm công');
    await Q.locator('.modal').getByRole('button', { name: 'Ghi khoản chi' }).click();
    const ask = Q.locator('.modal', { hasText: 'Nhập PIN của Hà E2E' });
    await expect(ask).toBeVisible();
    await Q.keyboard.type('9999');
    await ask.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(ask.locator('.pin-msg')).toHaveText('PIN không đúng');
    await Q.keyboard.type('2580');
    await ask.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(Q.locator('.toast', { hasText: 'Đã ghi 20.000đ' })).toBeVisible();
    await expect(Q.locator('table.cash-book')).toContainText('Đá E2E chấm công');

    // ADR-050: máy quầy không còn "Đổi người" — Bảo đứng máy thì Hà đăng xuất, Bảo đăng nhập tài khoản của mình
    await expect(Q.getByRole('button', { name: 'Đổi người' })).toHaveCount(0);
    await Q.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(Q).toHaveURL(/\/pos\/login/);
    await Q.fill('#username', 'e2e-bao');
    await Q.fill('#password', 'Pass@123');
    await Q.click('#submit');
    await expect(Q).toHaveURL(/\/pos$/);
    await Q.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // tài khoản mới → hướng dẫn lần đầu
    await expect(Q.locator('.pos-top .user-name')).toContainText('Bảo E2E');

    // Giờ công của tôi: chỉ của Bảo, đang làm
    await Q.goto('/pos/me');
    await expect(Q.getByRole('heading', { name: 'Giờ công của tôi' })).toBeVisible();
    await expect(Q.locator('ul.me-att > li')).toHaveCount(1);
    await expect(Q.locator('ul.me-att')).toContainText('đang làm');
    await expect(Q.locator('.card', { hasText: 'Lương' }).first()).toContainText('chưa nhập hồ sơ lương');
  } finally {
    await ctx.close();
  }

  // Quản lý: tháng này Bảo có chấm công nhưng chưa có hồ sơ lương → nhập ở trang Lương
  await P.goto('/admin/payroll');
  const month = await P.locator('#pay-month option').first().getAttribute('value');
  await P.locator('#pay-month').selectOption(month);
  const todo = P.locator('.pending-list li', { hasText: 'Bảo E2E' }).filter({ hasText: 'Chưa có hồ sơ lương' });
  await todo.getByRole('button', { name: 'Nhập hồ sơ lương' }).click();
  await P.fill('#pf-hourly', '25000');
  await P.locator('.modal').getByRole('button', { name: 'Lưu' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu hồ sơ lương' })).toBeVisible();
  await expect(P.locator('table.pay-table')).toContainText('Bảo E2E');
  // DEF-020: trang Tài khoản cho thấy ai đã đặt PIN
  await P.goto('/admin/users');
  await expect(P.locator('tbody tr', { hasText: 'e2e-ha' })).toContainText('Đã đặt');
  await expect(P.locator('tbody tr', { hasText: 'e2e-ha' }).getByRole('button', { name: 'Xóa PIN của e2e-ha' })).toBeVisible();
  await apiAs(request, 'put', '/api/admin/attendance-settings', { attendanceMode: 'LOGIN', moneyPin: false }); // trả lại cho các test sau
});

test('nhắc & báo quên chấm công: máy quầy nhắc người có lịch chưa chấm vào; chạm tên chưa có PIN → đặt PIN bằng mật khẩu ngay ở màn chung; vào ca xong hết nhắc; bàn phím PIN có "Quên PIN?"; Giờ công của tôi báo quên ngày có lịch; quản lý duyệt ở trang Lương (F-072, AC-072-12)', async ({
  request,
}) => {
  const vnOf = (ms) => {
    const t = new Date(ms + 7 * 3600e3).toISOString();
    return { date: t.slice(0, 10), hhmm: t.slice(11, 16) };
  };
  const now = Date.now();
  await apiAs(request, 'put', '/api/admin/attendance-settings', { attendanceMode: 'KIOSK', moneyPin: false });
  await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-quay', password: 'Pass@123', fullName: 'Quầy E2E', role: 'STAFF' });
  const tu = await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-tu', password: 'Pass@123', fullName: 'Tú E2E', role: 'STAFF' });
  const [s, e] = [vnOf(now - 30 * 60e3), vnOf(now + 180 * 60e3)];
  await apiAs(request, 'post', '/api/admin/rosters', { userId: tu.userId, workDate: s.date, startTime: s.hhmm, endTime: e.hhmm });
  const yesterday = vnOf(now - 86400e3).date;
  await apiAs(request, 'post', '/api/admin/rosters', { userId: tu.userId, workDate: yesterday, startTime: '08:00', endTime: '12:00' });

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const Q = await ctx.newPage();
  watch(Q, 'remind');
  try {
    await Q.goto('/pos/login');
    await Q.fill('#username', 'e2e-quay');
    await Q.fill('#password', 'Pass@123');
    await Q.click('#submit');
    await expect(Q).toHaveURL(/\/pos$/);
    await Q.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click();

    // Dải nhắc: Tú có lịch từ 30 phút trước mà chưa chấm vào
    const remind = Q.locator('#att-remind');
    await expect(remind).toContainText(`Tú E2E có lịch ${s.hhmm}–${e.hhmm} nhưng chưa chấm vào ca`);
    await remind.getByRole('button', { name: 'Mở Chấm công' }).click();
    const kiosk = Q.locator('.modal', { hasText: 'Chạm vào tên mình' });
    const tile = kiosk.locator('.person-tile', { hasText: 'Tú E2E' });
    await expect(tile).toContainText('Chưa đặt PIN — chạm để đặt');
    // Chưa có PIN: đặt ngay ở màn chung bằng mật khẩu đăng nhập của Tú (máy vẫn đứng tên Quầy E2E)
    await tile.click();
    const setPin = Q.locator('.modal', { hasText: 'Đặt PIN — Tú E2E' });
    await setPin.locator('#pin-pw').fill('Pass@123');
    await setPin.locator('#pin-new').fill('3691');
    await setPin.locator('#pin-again').fill('3691');
    await setPin.getByRole('button', { name: 'Lưu PIN' }).click();
    await expect(Q.locator('.toast', { hasText: 'Đã lưu PIN của Tú E2E' })).toBeVisible();
    await expect(tile).toContainText('Chưa vào ca');
    await tile.click();
    const pad = Q.locator('.modal', { hasText: 'Vào ca — Tú E2E' });
    await expect(pad.getByRole('button', { name: /Quên PIN\?/ })).toBeVisible();
    await Q.keyboard.type('3691');
    await pad.getByRole('button', { name: 'Vào ca' }).click();
    await expect(Q.locator('.toast', { hasText: 'Tú E2E vào ca lúc' })).toBeVisible();
    await kiosk.getByRole('button', { name: 'Xong' }).click();
    await expect(remind).toBeHidden();

    // "Quên PIN?" trên bàn phím → hộp đặt lại PIN bằng mật khẩu
    await Q.locator('#kiosk-btn').click();
    await Q.locator('.modal', { hasText: 'Chạm vào tên mình' }).locator('.person-tile', { hasText: 'Tú E2E' }).click();
    await Q.locator('.modal', { hasText: 'Ra ca — Tú E2E' })
      .getByRole('button', { name: /Quên PIN\?/ })
      .click();
    const reset = Q.locator('.modal', { hasText: 'Đặt lại PIN — Tú E2E' });
    await expect(reset.locator('#pin-pw')).toBeVisible();
    await reset.getByRole('button', { name: 'Hủy' }).click();
    await Q.locator('.modal', { hasText: 'Chạm vào tên mình' }).getByRole('button', { name: 'Xong' }).click();

    // Tú đứng máy (đăng xuất / đăng nhập — ADR-050 bỏ "Đổi người") → Giờ công của tôi: hôm qua có lịch mà không chấm công → Báo quên chấm công
    await Q.getByRole('button', { name: 'Đăng xuất' }).click();
    await expect(Q).toHaveURL(/\/pos\/login/);
    await Q.fill('#username', 'e2e-tu');
    await Q.fill('#password', 'Pass@123');
    await Q.click('#submit');
    await expect(Q).toHaveURL(/\/pos$/);
    await Q.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // tài khoản mới → hướng dẫn lần đầu
    await expect(Q.locator('.pos-top .user-name')).toContainText('Tú E2E');
    await Q.goto('/pos/me');
    await expect(Q.getByRole('heading', { name: 'Giờ công của tôi' })).toBeVisible();
    if (yesterday.slice(0, 7) !== vnOf(now).date.slice(0, 7)) await Q.locator('#me-month').selectOption(yesterday.slice(0, 7));
    const missing = Q.locator('.card', { hasText: 'Quên chấm công?' });
    await expect(missing).toContainText('lịch 08:00–12:00');
    await missing.getByRole('button', { name: 'Báo quên chấm công' }).click();
    const form = Q.locator('.modal', { hasText: 'Báo quên chấm công' });
    await expect(form.locator('#mp-in')).toHaveValue('08:00');
    await form.locator('#mp-note').fill('Quên bấm Chấm công lúc vào ca');
    await form.getByRole('button', { name: 'Gửi quản lý' }).click();
    await expect(Q.locator('.toast', { hasText: 'Đã gửi' })).toBeVisible();
    await expect(missing).toContainText('Đã báo quên');
    await expect(missing).toContainText('chờ quản lý duyệt');
  } finally {
    await ctx.close();
  }

  // Quản lý duyệt ở trang Lương → tạo lần chấm công
  await P.goto('/admin/payroll');
  await P.locator('#pay-month').selectOption(yesterday.slice(0, 7));
  const item = P.locator('.pending-list li', { hasText: 'Tú E2E' }).filter({ hasText: 'báo quên chấm công' });
  await expect(item).toContainText('Quên bấm Chấm công lúc vào ca');
  await item.getByRole('button', { name: 'Duyệt…' }).click();
  const approve = P.locator('.modal', { hasText: 'Duyệt báo quên — Tú E2E' });
  await expect(approve.locator('#mpa-out')).toHaveValue('12:00');
  await approve.getByRole('button', { name: 'Duyệt — thêm chấm công' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã duyệt' })).toBeVisible();
  await expect(P.locator('.pending-list li', { hasText: 'Tú E2E' }).filter({ hasText: 'báo quên chấm công' })).toHaveCount(0);
  await apiAs(request, 'put', '/api/admin/attendance-settings', { attendanceMode: 'LOGIN', moneyPin: false }); // trả lại cho các test sau
});

// ---------- TASK-132 (ADR-068): "Nhân sự & chấm công" + "Lương" gộp một mục ----------
test('Nhân sự & lương gộp một mục: thanh bên chỉ còn "Nhân sự & lương" (không còn mục "Lương" riêng); hàng thẻ chung Chấm công · Lịch làm tuần · Năng suất · Báo cáo tuần · Lương; bấm "Lương" → trang Lương, mục vẫn sáng, thẻ Lương được chọn; bấm "Lịch làm tuần" ở trang Lương → về đúng thẻ (TASK-132, ADR-068, AC-073-10)', async () => {
  await P.goto('/admin/staff');
  const side = P.locator('#side');
  const item = side.getByRole('link', { name: 'Nhân sự & lương' });
  await expect(item).toHaveAttribute('href', '/admin/staff');
  await expect(item).toHaveAttribute('aria-current', 'page');
  await expect(side.locator('a[href="/admin/payroll"]')).toHaveCount(0);
  await expect(P.getByRole('heading', { level: 1 })).toHaveText('Nhân sự & lương');
  const bar = P.getByRole('tablist', { name: 'Nhân sự & lương' });
  await expect(bar.getByRole('tab')).toHaveText(['Chấm công', 'Lịch làm tuần', 'Năng suất', 'Báo cáo tuần', 'Lương']);
  await expect(bar.getByRole('tab', { name: 'Chấm công' })).toHaveAttribute('aria-selected', 'true');

  await bar.getByRole('tab', { name: 'Lương' }).click();
  await expect(P).toHaveURL(/\/admin\/payroll\?tab=payroll$/);
  await expect(P.locator('#pay-month')).toBeVisible();
  await expect(item).toHaveAttribute('aria-current', 'page'); // vẫn sáng mục gộp ở trang Lương
  await expect(bar.getByRole('tab', { name: 'Lương' })).toHaveAttribute('aria-selected', 'true');

  await bar.getByRole('tab', { name: 'Lịch làm tuần' }).click();
  await expect(P).toHaveURL(/\/admin\/staff\?tab=roster$/);
  await expect(bar.getByRole('tab', { name: 'Lịch làm tuần' })).toHaveAttribute('aria-selected', 'true');
  await expect(P.getByRole('button', { name: 'Chép lịch tuần trước' })).toBeVisible();
});

test('bán khi mất mạng: máy quầy mất kết nối → tự chuyển "bán tạm" (giá niêm yết), thu tiền lưu đơn tạm T-… + in bill; có mạng lại tự gửi bù → đơn vào hệ thống, Ca & hoàn tiền có "Đơn bán lúc mất mạng"; quản lý nhập đơn từ phiếu bán tay (F-074, AC-074-05)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-offline', password: 'Pass@123', fullName: 'Thu ngân Mất Mạng', role: 'STAFF' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const Q = await ctx.newPage();
  watch(Q, 'offline');
  try {
    await Q.goto('/pos/login');
    await Q.fill('#username', 'e2e-offline');
    await Q.fill('#password', 'Pass@123');
    await Q.click('#submit');
    await expect(Q).toHaveURL(/\/pos$/);
    await Q.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click();
    await Q.goto('/pos/takeaway');
    await Q.locator('#tabs').getByRole('button', { name: 'Trà & đồ uống khác' }).click();
    const water = Q.getByRole('button', { name: /^Nước suối,/ });
    await expect(water).toBeEnabled();

    // Mất mạng: báo giá không tới máy chủ → chuyển sang bán tạm
    await ctx.setOffline(true);
    await water.click();
    await expect(Q.locator('#offline-note')).toBeVisible();
    await expect(Q.locator('#pay')).toHaveText('Thu tiền — lưu đơn tạm & In bill');
    await expect(Q.locator('#billing-slot')).toBeHidden();
    await Q.locator('#quick button').first().click(); // "Đủ tiền"
    await Q.locator('#pay').click();
    await expect(Q.locator('.toast', { hasText: 'Đã lưu đơn tạm T-0001' })).toBeVisible();
    await expect(Q.locator('#offline-card')).toContainText('Đơn bán tạm chờ gửi (1)');
    await expect(Q.locator('#offline-card')).toContainText('Thu ngân Mất Mạng');
    await expect(Q.locator('#lines')).toContainText('Chạm vào món');

    // Có mạng lại → tự gửi bù
    await ctx.setOffline(false);
    await expect(Q.locator('.toast', { hasText: 'Đã gửi 1 đơn bán tạm về hệ thống' })).toBeVisible({ timeout: 20_000 });
    await expect(Q.locator('#offline-card')).toBeHidden();
    await expect(Q.locator('#offline-note')).toBeHidden();

    await Q.goto('/pos/shift');
    const card = Q.locator('#offline-sales');
    await expect(card).toContainText('Đơn bán lúc mất mạng (1)');
    await expect(card).toContainText('(T-0001)');
    await expect(card).toContainText('Thu ngân Mất Mạng');
  } finally {
    await ctx.close();
  }

  // Quản lý nhập lại đơn ghi trên phiếu bán tay
  await P.goto('/pos/takeaway');
  await P.getByRole('dialog')
    .getByRole('button', { name: 'Bỏ qua' })
    .click({ timeout: 3000 })
    .catch(() => {});
  await P.locator('label', { hasText: 'Nhập đơn từ phiếu bán tay' }).click();
  await expect(P.locator('#paper-time')).toBeVisible();
  await expect(P.locator('#pay')).toHaveText('Ghi đơn bán tay');
  await P.locator('#tabs').getByRole('button', { name: 'Trà & đồ uống khác' }).click();
  await P.getByRole('button', { name: /^Nước suối,/ }).click();
  await P.locator('#quick button').first().click();
  await P.locator('#pay').click();
  await expect(P.locator('.toast', { hasText: 'Đã ghi đơn bán tay #' })).toBeVisible();
  await P.locator('label', { hasText: 'Nhập đơn từ phiếu bán tay' }).click();
  await expect(P.locator('#pay')).toHaveText('Thu tiền & In bill');
});

test('hạn dùng nguyên liệu: quản lý đặt "hộp 100 ml, mở rồi dùng 24 giờ" ở Kho nâng cao; bán món → máy quầy hiện "Nên mời khách hôm nay"; Kho → Hạn dùng có hộp đang mở → "Bỏ phần còn"; trang Hôm nay có thẻ Sắp hết hạn (F-075, AC-075-05)', async ({
  request,
}) => {
  const ingredients = await apiAs(request, 'get', '/api/admin/ingredients');
  const coffee = ingredients.find((i) => i.name === 'Cà phê cốt');
  await P.goto('/admin/ingredients');
  await P.getByRole('button', { name: 'Việc khác: Cà phê cốt', exact: true }).click(); // TASK-109: Kho nâng cao nằm trong "⋯"
  await P.getByRole('dialog', { name: 'Cà phê cốt', exact: true }).getByRole('button', { name: 'Kho nâng cao' }).click();
  const dlg = P.locator('.modal', { hasText: 'Kho nâng cao: Cà phê cốt' });
  await dlg.locator('#adv-pack').fill('100');
  await dlg.locator('#adv-open').fill('24');
  await dlg.getByRole('button', { name: 'Lưu' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu' })).toBeVisible();
  await expect(P.locator('tr', { hasText: 'Cà phê cốt' })).toContainText('hộp 100 ml, mở rồi dùng trong 24 giờ');

  // Bán một ly dùng cà phê cốt → app tự "mở hộp"
  const sale = await apiAs(request, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }], amountReceived: 100_000 });
  await apiAs(request, 'post', `/api/orders/${sale.order.orderId}/complete`);
  expect((await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.ingredientId === coffee.ingredientId).openLeft).toBeGreaterThan(0);

  await P.goto('/pos/stock');
  const push = P.locator('#push-items');
  await expect(push).toContainText('Nên mời khách hôm nay');
  await expect(push).toContainText('Cà phê đen');
  await expect(push).toContainText('Cà phê cốt hộp đang mở còn');
  await P.getByRole('tab', { name: 'Hạn dùng' }).click();
  const packs = P.locator('.open-packs');
  await expect(packs).toContainText('Cà phê cốt');
  await packs.locator('li', { hasText: 'Cà phê cốt' }).getByRole('button', { name: 'Bỏ phần còn' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Bỏ phần còn' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã ghi hủy' })).toBeVisible();
  await expect(P.locator('.open-packs')).toHaveCount(0);

  await P.goto('/admin/today');
  const exp = P.locator('.today-card', { hasText: 'Sắp hết hạn (2 ngày tới)' });
  await expect(exp).toBeVisible();
  await expect(exp).toContainText('Tháng này đã hủy vì hết hạn');
  await apiAs(request, 'put', `/api/admin/ingredients/${coffee.ingredientId}/advanced`, { kind: 'RAW', wastePercent: 0, packSize: null, openShelfHours: null }); // trả lại
});

test('quy trình 1 chạm: quản lý bật ở Cài đặt → màn Đơn hàng chỉ còn cột "Cần làm" (không còn "Đang pha"), mỗi đơn một nút "Xong" → đơn sang "Đã xong hôm nay" (F-076, AC-076-03)', async ({
  request,
}) => {
  await P.goto('/admin/settings');
  await P.locator('label', { hasText: 'Quy trình 1 chạm' }).click();
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast').first()).toBeVisible();
  const sale = await apiAs(request, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Nước suối'], quantity: 1 }], amountReceived: 50_000 });

  await P.goto('/pos');
  await P.getByRole('dialog')
    .getByRole('button', { name: 'Bỏ qua' })
    .click({ timeout: 3000 })
    .catch(() => {});
  await expect(P.locator('#h-pending')).toHaveText('Cần làm');
  await expect(P.locator('.col-preparing')).toBeHidden();
  const card = P.locator('#col-PENDING .ticket', { hasText: `#${sale.order.orderCode}` });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Tiếp nhận' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Xong' }).click();
  await expect(P.locator('.toast', { hasText: `Đã hoàn tất #${sale.order.orderCode}` })).toBeVisible();
  await expect(P.locator('#col-COMPLETED')).toContainText(`#${sale.order.orderCode}`);
  await apiAs(request, 'put', '/api/admin/settings', { oneTap: false }); // trả lại 3 cột cho các test sau
});

test('phân quyền: chủ quán tạo tài khoản "Quản lý cửa hàng" ở Tài khoản (có bảng "Mỗi vai trò làm được gì?"); quản lý cửa hàng đăng nhập → máy quầy có "Quản lý" → trang Quản lý chỉ có mục vận hành (không Thu chi, Lương, Tài khoản, Cài đặt); đổi giá món → chủ quán thấy cảnh báo đổi giá; mở thẳng Thu chi → về Hôm nay kèm thanh Xin quyền (F-077, AC-077-08)', async ({
  request,
}) => {
  await P.goto('/admin/users');
  const guide = P.locator('.role-guide');
  await guide.locator('summary').click();
  await expect(guide).toContainText('Quản lý cửa hàng');
  await expect(guide).toContainText('Chủ quán');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  const form = P.getByRole('dialog');
  await form.locator('input[name="username"]').fill('store-e2e');
  await form.locator('input[name="password"]').fill('Store@123');
  await form.locator('input[name="fullName"]').fill('Quản lý E2E');
  await form.locator('select[name="role"]').selectOption({ label: 'Quản lý cửa hàng' });
  await form.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(P.locator('tr', { hasText: 'store-e2e' })).toContainText('Quản lý cửa hàng');

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const S = await ctx.newPage();
  watch(S, 'store');
  await S.goto('/pos/login');
  await S.fill('#username', 'store-e2e');
  await S.fill('#password', 'Store@123');
  await S.click('#submit');
  await expect(S).toHaveURL(/\/pos$/);
  await S.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click(); // tài khoản mới → hướng dẫn lần đầu
  await expect(S.locator('.pos-top')).toContainText('Quản lý cửa hàng');
  await S.locator('.pos-nav').getByRole('link', { name: 'Quản lý' }).click();
  // ADR-044: không dùng phiên máy quầy — gõ mật khẩu ở trang Đăng nhập Quản lý rồi về đúng trang vừa bấm
  await expect(S).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Ftoday/);
  await S.fill('#username', 'store-e2e');
  await S.fill('#password', 'Store@123');
  await S.click('#submit');
  await expect(S).toHaveURL(/\/admin\/today$/);
  await expect(S.locator('.today-grid')).toBeVisible();
  const side = S.locator('#side');
  for (const href of ['/admin/menu', '/admin/ingredients', '/admin/reports', '/admin/shifts', '/admin/cash', '/admin/alerts', '/admin/tables']) {
    await expect(side.locator(`a[href="${href}"]`), href).toHaveCount(1);
  }
  for (const href of ['/admin/pnl', '/admin/payroll', '/admin/users', '/admin/settings', '/admin/audit', '/admin/analytics', '/admin/api-docs']) {
    await expect(side.locator(`a[href="${href}"]`), href).toHaveCount(0);
  }
  await expect(side).toContainText('Quản lý cửa hàng');
  // TASK-132 (ADR-068): quản lý cửa hàng (chưa được giao quyền Lương) thấy mục "Nhân sự & lương" nhưng không có thẻ Lương
  await expect(side.locator('a[href="/admin/staff"]')).toHaveText('Nhân sự & lương'); // nhóm "Quỹ & nhân sự" đang gập ở trang Hôm nay
  await S.goto('/admin/staff');
  await expect(S.getByRole('tablist', { name: 'Nhân sự & lương' }).getByRole('tab')).toHaveText(['Chấm công', 'Lịch làm tuần', 'Năng suất', 'Báo cáo tuần']);

  // Đổi giá Latte ở Thực đơn → chủ quán được báo
  const latte = (await apiAs(request, 'get', '/api/admin/menu-items')).find((m) => m.name === 'Latte');
  await S.goto(`/admin/menu?edit=${latte.menuItemId}`);
  const dlg = S.getByRole('dialog');
  await dlg.locator('#price').fill(String(latte.price + 2000));
  await dlg.getByRole('button', { name: 'Lưu' }).click();
  await expect(dlg).toHaveCount(0);

  // Sổ quỹ: không có tab Danh mục thu chi; Thu chi (tên cũ Lãi / lỗ) mở thẳng → về quầy
  await S.goto('/admin/cash');
  await expect(S.locator('.tabs')).toContainText('Sổ quỹ');
  await expect(S.locator('.tabs')).not.toContainText('Danh mục thu chi');
  await S.goto('/admin/pnl');
  await expect(S).toHaveURL(/\/admin\/today\?cap=admin\.pnl$/); // F-080: ở lại trang Quản lý, mời Xin quyền
  await expect(S.locator('#access-bar')).toContainText('Thu chi'); // TASK-108: trang Lãi / lỗ đổi tên Thu chi
  await ctx.close();

  await P.goto('/admin/alerts');
  const alert = P.locator('.alert-card', { hasText: 'đổi giá "Latte"' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Quản lý E2E');
  await apiAs(request, 'put', `/api/admin/menu-items/${latte.menuItemId}`, {
    categoryId: latte.categoryId,
    name: latte.name,
    price: latte.price,
    imageUrl: latte.imageUrl ?? '',
    isAvailable: latte.isAvailable,
    isActive: latte.isActive,
  }); // trả giá cũ
});

test('vị trí + cấp: chủ quán tạo nhân viên chỉ tick "Pha chế", cấp "Thử việc" ở Tài khoản; người đó đăng nhập → máy quầy chỉ có Đơn hàng, Kho, Giờ công + nhãn "Thử việc"; mở thẳng Bán mang đi → về Đơn hàng kèm lời nhắc (F-078, AC-078-06)', async () => {
  await P.goto('/admin/users');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  const form = P.getByRole('dialog');
  await form.locator('input[name="username"]').fill('phache-e2e');
  await form.locator('input[name="password"]').fill('Phache@123');
  await form.locator('input[name="fullName"]').fill('Pha chế E2E');
  await expect(form.locator('.staff-fields')).toBeVisible();
  await form.getByLabel('Pha chế', { exact: true }).check();
  await form.locator('#user-level').selectOption({ label: 'Thử việc' });
  await form.getByRole('button', { name: 'Tạo tài khoản' }).click();
  const row = P.locator('tr', { hasText: 'phache-e2e' });
  await expect(row).toContainText('Thử việc');
  await expect(row).toContainText('Pha chế');

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const B2 = await ctx.newPage();
  watch(B2, 'barista');
  await B2.goto('/pos/login');
  await B2.fill('#username', 'phache-e2e');
  await B2.fill('#password', 'Phache@123');
  await B2.click('#submit');
  await expect(B2).toHaveURL(/\/pos$/);
  await B2.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click();
  const nav = B2.locator('.pos-nav');
  await expect(nav.getByRole('link')).toHaveText(['Đơn hàng', 'Kho', 'Giờ công']);
  await expect(B2.locator('.pos-user')).toContainText('Thử việc');
  await B2.goto('/pos/takeaway');
  await expect(B2).toHaveURL(/\/pos\?denied=position/);
  await expect(B2.locator('#access-bar')).toContainText('Bạn chưa có quyền: Thu tiền'); // F-079: lời nhắc kèm nút Xin quyền
  await ctx.close();
});

test('quyền riêng: nhân viên Phục vụ mở Bán mang đi → bị chuyển về kèm thanh "Xin quyền" → gửi lý do; chủ quán thấy ở Hôm nay → trang Quyền nâng cao → Duyệt "Hết hôm nay" → nhân viên vào được; chủ quán tắt công tắc quyền đó của người đó (về như vai trò) → Lưu quyền → hết vào được (F-079, AC-079-07)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/users', {
    username: 'xin-e2e',
    password: 'Xinquyen@1',
    fullName: 'Xin quyền E2E',
    role: 'STAFF',
    positions: ['SERVER'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const X = await ctx.newPage();
  watch(X, 'xin');
  await X.goto('/pos/login');
  await X.fill('#username', 'xin-e2e');
  await X.fill('#password', 'Xinquyen@1');
  await X.click('#submit');
  await expect(X).toHaveURL(/\/pos$/);
  await X.getByRole('dialog').getByRole('button', { name: 'Bỏ qua' }).click();
  await X.goto('/pos/takeaway');
  await expect(X).toHaveURL(/\/pos\?denied=position&cap=pos\.cashier/);
  const bar = X.locator('#access-bar');
  await expect(bar).toContainText('Bạn chưa có quyền: Thu tiền');
  await bar.getByRole('button', { name: 'Xin quyền' }).click();
  await X.locator('#access-reason').fill('Thu ngân nghỉ ốm');
  await X.getByRole('dialog').getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(X.locator('.toast', { hasText: 'Đã gửi — chờ chủ quán duyệt' })).toBeVisible();

  await P.goto('/admin/today');
  await P.locator('.today-todo')
    .getByRole('link', { name: /yêu cầu xin quyền chờ duyệt/ })
    .click();
  await expect(P).toHaveURL(/\/admin\/permissions#xin-quyen$/); // F-091: khung duyệt ở trang Quyền nâng cao
  const req = P.locator('.access-request', { hasText: 'Xin quyền E2E' });
  await expect(req).toContainText('Thu ngân nghỉ ốm');
  await expect(req.locator('select')).toHaveValue('TODAY');
  await req.getByRole('button', { name: 'Duyệt' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã cho phép Xin quyền E2E' })).toBeVisible();
  // Duyệt xong → trang chọn sẵn người đó, thấy quyền tạm vừa cấp
  const person = P.locator('.perm-person', { hasText: 'Xin quyền E2E' });
  await expect(person).toHaveAttribute('aria-pressed', 'true');
  await expect(person).toContainText('1 quyền nâng cao');

  await X.goto('/pos/takeaway');
  await expect(X).toHaveURL(/\/pos\/takeaway$/);

  // F-090 / F-091: công tắc Cho phép / Không cho phép ở trang Quyền nâng cao
  const cashier = P.getByRole('switch', { name: 'Thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi thu chi' });
  await expect(cashier).toBeChecked();
  await cashier.uncheck();
  await P.getByRole('button', { name: 'Lưu quyền' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu quyền của Xin quyền E2E' })).toBeVisible();
  await expect(person).not.toContainText('quyền nâng cao');
  await X.goto('/pos/takeaway');
  await expect(X).toHaveURL(/\/pos\?denied=position/);
  await ctx.close();
});

test('trang Quản lý riêng: máy mới mở /admin → trang "Đăng nhập Quản lý" → vào thẳng Hôm nay; phiên riêng với máy quầy (mở /pos vẫn phải đăng nhập quầy); Đăng xuất chỉ thoát trang Quản lý; nhân viên không có quyền thì được mời Xin quyền; máy đang đăng nhập quầy (quản lý cửa hàng) vẫn phải gõ mật khẩu ở trang Đăng nhập Quản lý — không có "Vào bằng tài khoản này", mở /admin không tự vào (F-080, AC-080-03)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const A2 = await ctx.newPage();
  watch(A2, 'admin-area');
  await A2.goto('/admin');
  await expect(A2).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Ftoday/);
  await expect(A2.getByRole('heading', { name: 'Đăng nhập Quản lý' })).toBeVisible();
  await A2.fill('#username', 'admin');
  await A2.fill('#password', 'Admin@123');
  await A2.click('#submit');
  await expect(A2).toHaveURL(/\/admin\/today$/);
  await expect(A2.locator('.today-grid')).toBeVisible();
  await expect(A2.locator('#side .nav-pos')).toHaveCount(0); // F-084: chủ quán không có lối "Mở màn hình quầy"
  // Phiên riêng: máy quầy trên cùng trình duyệt chưa đăng nhập
  await A2.goto('/pos');
  await expect(A2).toHaveURL(/\/pos\/login/);
  await A2.goto('/admin/menu');
  await expect(A2.locator('#side')).toContainText('Món & định lượng');
  await A2.locator('#side').getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(A2).toHaveURL(/\/admin\/login$/);
  // Nhân viên không có trang Quản lý → báo + Xin quyền (không vào được)
  await A2.fill('#username', 'staff1');
  await A2.fill('#password', 'Staff@123');
  await A2.click('#submit');
  await expect(A2.locator('#msg')).toContainText('chưa có quyền vào trang Quản lý');
  await expect(A2.locator('#ask-cap')).toBeVisible();
  await expect(A2).toHaveURL(/\/admin\/login$/);
  // Máy quầy đăng nhập quản lý cửa hàng → trang Quản lý vẫn đòi mật khẩu (ADR-044: không "Vào bằng tài khoản này", không tự đi theo)
  await A2.goto('/pos/login');
  await A2.fill('#username', 'quay-ql');
  await A2.fill('#password', 'Quay@123');
  await A2.click('#submit');
  await expect(A2).toHaveURL(/\/pos$/);
  await A2.goto('/admin');
  await expect(A2).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Ftoday/);
  await expect(A2.locator('#follow-pos')).toHaveCount(0);
  await expect(A2.getByRole('button', { name: 'Vào bằng tài khoản này' })).toHaveCount(0);
  await A2.fill('#username', 'quay-ql');
  await A2.fill('#password', 'Quay@123');
  await A2.click('#submit');
  await expect(A2).toHaveURL(/\/admin\/today$/);
  await expect(A2.locator('#side .nav-pos')).toHaveAttribute('target', '_blank'); // người đứng quầy vẫn có lối mở máy quầy (tab mới)
  await ctx.close();
});

test('đăng nhập một lần: quản lý cửa hàng đăng nhập trang Quản lý (máy tính 1920 px) → "Mở màn hình quầy" vào thẳng máy quầy, không hỏi mật khẩu, kể cả khi máy còn phiên quầy cũ đã hết hạn → "Quản lý" ở máy quầy về lại trang Quản lý không hỏi; máy quầy đang có người khác đăng nhập thì giữ người đó; chủ quán không mở máy quầy theo lối này (F-080, AC-080-05)', async () => {
  const desk = { viewport: { width: 1920, height: 1000 }, locale: 'vi-VN' };
  const adminLogin = async (page, username, password) => {
    await page.goto('/admin/login');
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.click('#submit');
    await expect(page).toHaveURL(/\/admin\/today$/);
  };
  // 1. Máy còn phiên quầy cũ đã hết hạn; quản lý cửa hàng đăng nhập trang Quản lý → "Mở màn hình quầy" (tab mới)
  const ctx = await browser.newContext(desk);
  try {
    const Q = await ctx.newPage();
    watch(Q, 'one-login');
    await Q.goto('/admin/login');
    await Q.evaluate(() => localStorage.setItem('cf_staff_token', 'phien-quay-cu-het-han'));
    await adminLogin(Q, 'quay-ql', 'Quay@123');
    const [T] = await Promise.all([ctx.waitForEvent('page'), Q.locator('#side .nav-pos').click()]);
    watch(T, 'one-login-pos');
    await expect(T).toHaveURL(/\/pos$/);
    await expect(T.locator('.pos-top')).toContainText('QL quầy E2E');
    await expect(T.locator('#conn')).toHaveText('Đã kết nối');
    const adminToken2 = await Q.evaluate(() => JSON.parse(localStorage.getItem('cf_admin_session')).token);
    expect(await T.evaluate(() => localStorage.getItem('cf_staff_token'))).toBe(adminToken2);
    // 2. Máy quầy → "Quản lý": đã đăng nhập trang Quản lý → vào thẳng, không hỏi mật khẩu
    await T.locator('.pos-nav').getByRole('link', { name: 'Quản lý' }).click();
    await expect(T).toHaveURL(/\/admin\/today$/);
    await expect(T.locator('#side .who')).toContainText('@quay-ql');
  } finally {
    await ctx.close();
  }
  // 3. Máy quầy đang có nhân viên đăng nhập → quản lý mở trang Quản lý rồi "Mở màn hình quầy": giữ nhân viên đang đứng quầy
  const ctx2 = await browser.newContext(desk);
  try {
    const N2 = await ctx2.newPage();
    watch(N2, 'one-login-keep');
    await N2.goto('/pos/login');
    await N2.fill('#username', 'staff1');
    await N2.fill('#password', 'Staff@123');
    await N2.click('#submit');
    await expect(N2).toHaveURL(/\/pos$/);
    await adminLogin(N2, 'quay-ql', 'Quay@123');
    const [T2] = await Promise.all([ctx2.waitForEvent('page'), N2.locator('#side .nav-pos').click()]);
    watch(T2, 'one-login-keep-pos');
    await expect(T2).toHaveURL(/\/pos$/);
    await expect(T2.locator('.pos-top')).toContainText('Nhân viên quầy 1');
  } finally {
    await ctx2.close();
  }
  // 4. Chủ quán: không có "Mở màn hình quầy"; tự gõ /pos?from=admin → trang đăng nhập quầy (không vào được)
  const ctx3 = await browser.newContext(desk);
  try {
    const O2 = await ctx3.newPage();
    watch(O2, 'one-login-owner');
    await adminLogin(O2, 'admin', 'Admin@123');
    await expect(O2.locator('#side .nav-pos')).toHaveCount(0);
    await O2.goto('/pos?from=admin');
    await expect(O2).toHaveURL(/\/pos\/login/);
    expect(await O2.evaluate(() => localStorage.getItem('cf_staff_token'))).toBeNull();
  } finally {
    await ctx3.close();
  }
});

test('chủ quán chỉ dùng trang Quản lý: gõ tài khoản chủ quán ở màn quầy → vào thẳng Hôm nay của trang Quản lý, không có phiên máy quầy; phiên máy quầy cũ đứng tên chủ quán → bị bỏ, phải gõ mật khẩu ở trang Đăng nhập Quản lý; không còn lối "Mở màn hình quầy" / "Mở trang ca ở quầy"; việc cần làm không dẫn về máy quầy; in lại hóa đơn mang đi bằng phiên Quản lý (F-084, AC-084-02, AC-084-03)', async ({
  request,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const O = await ctx.newPage();
  watch(O, 'owner');
  await O.goto('/pos/login');
  await O.fill('#username', 'admin');
  await O.fill('#password', 'Admin@123');
  await O.click('#submit');
  await expect(O).toHaveURL(/\/admin\/today$/);
  await expect(O.locator('.today-grid')).toBeVisible();
  expect(await O.evaluate(() => localStorage.getItem('cf_staff_token'))).toBeNull();
  await expect(O.locator('#side .nav-pos')).toHaveCount(0);
  await expect(O.locator('.today-todo li').first()).toBeVisible();
  await expect(O.locator('.today-todo a[href^="/pos"]')).toHaveCount(0);
  // Mở /pos: không có phiên máy quầy → màn đăng nhập quầy (không mượn phiên Quản lý)
  await O.goto('/pos');
  await expect(O).toHaveURL(/\/pos\/login/);
  // Phiên máy quầy cũ đứng tên chủ quán (đăng nhập trước khi có luật) → bị bỏ, sang trang Đăng nhập Quản lý — phải gõ mật khẩu (ADR-044)
  await O.evaluate((t) => {
    localStorage.removeItem('cf_admin_session');
    localStorage.setItem('cf_staff_token', t);
  }, adminToken);
  await O.goto('/pos/takeaway');
  await expect(O).toHaveURL(/\/admin\/login\?reason=owner$/);
  await expect(O.locator('#msg')).toContainText('Tài khoản Chủ quán chỉ dùng trang Quản lý');
  expect(await O.evaluate(() => localStorage.getItem('cf_staff_token'))).toBeNull();
  expect(await O.evaluate(() => localStorage.getItem('cf_admin_session'))).toBeNull();
  await O.fill('#username', 'admin');
  await O.fill('#password', 'Admin@123');
  await O.click('#submit');
  await expect(O).toHaveURL(/\/admin\/today$/);
  await expect(O.locator('#side .who')).toContainText('@admin');
  // Lịch sử ca: không còn nút sang trang ca ở quầy
  await O.goto('/admin/shifts');
  await expect(O.getByRole('button', { name: 'Xem' })).toBeVisible();
  await expect(O.getByRole('link', { name: /Mở trang ca ở quầy/ })).toHaveCount(0);
  // In lại hóa đơn mang đi từ trang Quản lý: trang in đọc bằng phiên Quản lý (?area=admin)
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const r = await apiAs(request, 'get', `/api/admin/orders?from=2026-01-01&to=${today}&type=TAKE_AWAY&page=1&pageSize=30`);
  const paid = r.items.find((o) => o.paymentStatus === 'PAID');
  expect(paid, 'cần một đơn mang đi đã thu').toBeTruthy();
  await O.goto(`/pos/orders/${paid.orderId}/receipt?area=admin`);
  await expect(O.locator('.receipt .title')).toHaveText('HÓA ĐƠN THANH TOÁN');
  await expect(O).toHaveURL(/\/receipt\?area=admin$/);
  await ctx.close();
});

test('bảng chọn món: khách bấm "+" món có tùy chọn → bảng trượt lên ngay (chưa vào giỏ), chọn Size L + "Ít đá" + số lượng 2 → "Thêm vào giỏ · …"; bấm tên món không tùy chọn mở bảng ghi chú; "+" món không tùy chọn vẫn thêm ngay; giỏ có đủ tùy chọn, ghi chú, số lượng; điện thoại không cuộn ngang (F-081, AC-081-02)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/tables', { code: 'BC', name: 'Bàn bảng chọn' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'BC');
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    const bx = G.locator('.c-section.cat .c-item', { hasText: 'Bạc xỉu' });
    await bx.locator('.add-btn').click();
    const sheet = G.locator('.item-sheet');
    await expect(sheet).toBeVisible();
    await expect(bx.locator('.qty-badge')).toHaveCount(0); // chưa vào giỏ khi chưa bấm Thêm
    await sheet.locator('.opt-row', { hasText: 'Size L' }).click();
    await sheet.locator('.chip', { hasText: 'Ít đá' }).click();
    await expect(G.locator('#item-note')).toHaveValue('Ít đá');
    await G.getByRole('dialog').getByRole('button', { name: 'Thêm Bạc xỉu' }).click(); // ADR-042: số lượng ở chân bảng
    await expect(G.locator('#item-qty')).toHaveText('2');
    const add = G.getByRole('dialog').locator('.modal-foot .btn-primary');
    await expect(add).toHaveText(/^Thêm vào giỏ · [\d.]+đ$/);
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    await add.click();
    await expect(bx.locator('.qty-badge')).toHaveText('2');

    // Món không tùy chọn: bấm tên → bảng ghi chú; "+" → thêm ngay
    const water = G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' });
    await water.locator('.c-name-btn').click();
    await expect(G.locator('.item-sheet .opt-group')).toHaveCount(0);
    await G.locator('#item-note').fill('không lạnh');
    await G.getByRole('dialog').locator('.modal-foot .btn-primary').click();
    await expect(water.locator('.stepper span')).toHaveText('1');
    const croissant = G.locator('.c-section.cat .c-item', { hasText: 'Bánh croissant' });
    await croissant.locator('.add-btn').click();
    await expect(G.getByRole('dialog')).toHaveCount(0);
    await expect(croissant.locator('.stepper span')).toHaveText('1');

    await G.click('#open-cart');
    const line = G.locator('.sheet .cart-line', { hasText: 'Bạc xỉu' });
    await expect(line).toContainText('Size L');
    await expect(line.locator('.stepper span')).toHaveText('2');
    await expect(line).toContainText('Ghi chú: Ít đá'); // F-082: giỏ ghi ghi chú dạng chữ
    await expect(G.locator('.sheet .cart-line', { hasText: 'Nước suối' })).toContainText('Ghi chú: không lạnh');
  } finally {
    await phone.close();
  }
});

test('giỏ gọn: giỏ không còn ô ghi chú / nút nhanh, mỗi món một dòng tóm tắt (tùy chọn, "Ghi chú: …", "Sửa ›"); bấm món trong giỏ → bảng chọn mở với lựa chọn cũ (Size L, "Ít đá", 2) → đổi Size M + "Mang về" + 3 → "Cập nhật · …" → dòng đổi tại chỗ, tổng đổi theo (F-082, AC-082-02)', async ({
  request,
}) => {
  await apiAs(request, 'post', '/api/admin/tables', { code: 'GG', name: 'Bàn giỏ gọn' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'GG');
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    const bx = G.locator('.c-section.cat .c-item', { hasText: 'Bạc xỉu' });
    await bx.locator('.add-btn').click();
    await G.locator('.item-sheet .opt-row', { hasText: 'Size L' }).click();
    await G.locator('.item-sheet .chip', { hasText: 'Ít đá' }).click();
    await G.locator('[role="dialog"]', { has: G.locator('.item-sheet') })
      .getByRole('button', { name: 'Thêm Bạc xỉu' })
      .click();
    await G.locator('[role="dialog"]', { has: G.locator('.item-sheet') })
      .locator('.modal-foot .btn-primary')
      .click();
    await G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();

    await G.click('#open-cart');
    const cart = G.locator('.sheet', { has: G.locator('.cart-line') });
    await expect(cart.locator('.cart-line')).toHaveCount(2);
    await expect(cart.locator('.cart-line input')).toHaveCount(0); // không còn ô ghi chú
    await expect(cart.locator('.cart-line .note-chips')).toHaveCount(0); // không còn hàng nút nhanh
    const line = cart.locator('.cart-line').first();
    await expect(line).toContainText('Bạc xỉu');
    await expect(line).toContainText('Size L');
    await expect(line).toContainText('Ghi chú: Ít đá');
    await expect(line).toContainText('Sửa ›');
    const before = (await cart.locator('.cart-total').innerText()).match(/[\d.]+đ/)[0];

    await line.locator('.cart-line-main').click();
    const edit = G.locator('[role="dialog"]', { has: G.locator('.item-sheet') });
    await expect(edit.locator('.opt-row', { hasText: 'Size L' }).locator('input')).toBeChecked();
    await expect(G.locator('#item-note')).toHaveValue('Ít đá');
    await expect(G.locator('#item-qty')).toHaveText('2');
    await expect(edit.locator('.modal-foot .btn-primary')).toHaveText(/^Cập nhật · [\d.]+đ$/);
    await edit.locator('.opt-row', { hasText: 'Size M' }).click();
    await edit.locator('.chip', { hasText: 'Mang về' }).click();
    await edit.getByRole('button', { name: 'Thêm Bạc xỉu' }).click();
    await expect(G.locator('#item-qty')).toHaveText('3');
    await edit.locator('.modal-foot .btn-primary').click();
    await expect(G.locator('.item-sheet')).toHaveCount(0);

    await expect(cart.locator('.cart-line')).toHaveCount(2);
    const updated = cart.locator('.cart-line').first(); // vẫn ở vị trí cũ
    await expect(updated).toContainText('Size M');
    await expect(updated).toContainText('Ghi chú: Ít đá, Mang về');
    await expect(updated.locator('.stepper span')).toHaveText('3');
    await expect(cart.locator('.cart-total')).not.toContainText(before);
    await expect(bx.locator('.qty-badge')).toHaveText('3');
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
  } finally {
    await phone.close();
  }
});

test('"+" mở bảng chọn cho mọi món: chủ quán bật ở Cài đặt → khách bấm "+" món không tùy chọn (Nước suối) cũng mở bảng chọn (không có nhóm tùy chọn, có ghi chú, số lượng) → chọn 2 → "Thêm vào giỏ" → thẻ món hiện 2, không còn nút −/+ trên thẻ → gửi đơn được (F-083, AC-083-02)', async ({
  request,
}) => {
  await P.goto('/admin/settings');
  await P.locator('label', { hasText: 'Bấm "+" mở bảng chọn cho mọi món' }).click();
  await P.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await expect(P.locator('.toast').first()).toBeVisible();
  expect((await apiAs(request, 'get', '/api/admin/settings')).menuSheetAll).toBe(true);
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  await apiAs(request, 'post', '/api/admin/tables', { code: 'SA', name: 'Bàn mọi món' });
  const t = (await apiAs(request, 'get', '/api/admin/tables')).find((x) => x.code === 'SA');
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'G');
    await G.goto(`/t/${t.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    const water = G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' });
    await water.locator('.add-btn').click();
    const sheet = G.locator('.item-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.opt-group')).toHaveCount(0);
    await expect(G.locator('#item-note')).toBeVisible();
    await G.locator('[role="dialog"]', { has: sheet }).getByRole('button', { name: 'Thêm Nước suối' }).click(); // ADR-042: số lượng ở chân bảng
    await expect(G.locator('#item-qty')).toHaveText('2');
    await G.locator('[role="dialog"]', { has: sheet }).locator('.modal-foot .btn-primary').click();
    await expect(water.locator('.qty-badge')).toHaveText('2');
    await expect(water.locator('.stepper')).toHaveCount(0);
    await G.click('#open-cart');
    await expect(G.locator('.sheet .cart-line', { hasText: 'Nước suối' }).locator('.stepper span')).toHaveText('2');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
  } finally {
    await phone.close();
    await apiAs(request, 'put', '/api/admin/settings', { menuSheetAll: false }); // trả lại cho bài sau
    const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'SA')?.sessions?.[0];
    if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử bảng chọn' });
    await apiAs(request, 'delete', `/api/admin/tables/${t.tableId}`);
  }
});

test('ảnh nguyên liệu: chủ quán mở Kho nguyên liệu → Sửa "Cốt trà đào" → dán đường dẫn sai thì báo ngay dưới ô, dán "/img/nguyen-lieu/cot-tra-dao.jpg" → Lưu → dòng hiện ảnh (tải được), nguyên liệu chưa có ảnh vẫn là ô chữ cái; nhân viên mở Kho → Tồn kho thấy ảnh nhỏ (F-085, AC-085-03)', async ({
  request,
}) => {
  const IMG = '/img/nguyen-lieu/cot-tra-dao.jpg';
  const rowOf = (page, name) => page.locator('tbody tr').filter({ has: page.getByText(name, { exact: true }) });
  await P.goto('/admin/ingredients');
  const row = rowOf(P, 'Cốt trà đào');
  await expect(row.locator('div.thumb')).toHaveText('C'); // chưa có ảnh → ô chữ cái như trang Món
  await row.getByRole('button', { name: 'Sửa' }).click();
  const dialog = P.getByRole('dialog');
  const field = dialog.getByLabel('Ảnh (URL, không bắt buộc)');
  await field.fill('anh-tra-dao.jpg');
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(dialog.locator('.field-error')).toHaveText('Ảnh phải là URL http(s) hoặc đường dẫn bắt đầu bằng /');
  await field.fill(IMG);
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
  const img = row.locator('img.thumb');
  await expect(img).toHaveAttribute('src', IMG);
  await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(rowOf(P, 'Đào ngâm').locator('div.thumb')).toHaveText('Đ');
  const ing = (await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.name === 'Cốt trà đào');
  expect(ing.imageUrl).toBe(IMG);
  expect(Number(ing.lowStockThreshold)).toBeGreaterThan(0); // sửa ảnh không làm mất các trường khác

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const S = await ctx.newPage();
    watch(S, 'kho');
    await S.goto('/pos/login');
    await S.fill('#username', 'staff1');
    await S.fill('#password', 'Staff@123');
    await S.click('#submit');
    await expect(S).toHaveURL(/\/pos$/);
    await S.goto('/pos/stock');
    await S.getByRole('tab', { name: 'Tồn kho' }).click();
    const small = rowOf(S, 'Cốt trà đào').locator('img.thumb.sm');
    await expect(small).toHaveAttribute('src', IMG);
    expect(await small.evaluate((i) => i.getBoundingClientRect().width)).toBe(40);
  } finally {
    await ctx.close();
  }
});

test('báo lỗi xong vẫn lưu được (DEF-024): thêm bàn trùng mã / nhân viên trùng tên đăng nhập / món có ảnh sai → máy chủ báo lỗi, nút không bị khóa → sửa lại → lưu được ngay trong cùng hộp', async ({
  request,
}) => {
  // Bàn: mã đã có → lỗi → đổi mã → tạo được
  await P.goto('/admin/tables');
  await P.getByRole('button', { name: '+ Thêm bàn' }).click();
  let dialog = P.getByRole('dialog');
  const existing = (await apiAs(request, 'get', '/api/admin/tables'))[0].code;
  await dialog.locator('input[name="code"]').fill(existing);
  let save = dialog.getByRole('button', { name: 'Tạo bàn & QR' });
  await save.click();
  await expect(save).toBeEnabled();
  await expect(save).not.toHaveClass(/loading/);
  await dialog.locator('input[name="code"]').fill('DF');
  await save.click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
  const table = (await apiAs(request, 'get', '/api/admin/tables')).find((t) => t.code === 'DF');
  expect(table).toBeTruthy();
  await apiAs(request, 'delete', `/api/admin/tables/${table.tableId}`);

  // Tài khoản: tên đăng nhập đã có → lỗi trong hộp → đổi tên → tạo được
  await P.goto('/admin/users');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  dialog = P.getByRole('dialog');
  await dialog.locator('input[name="username"]').fill('staff1');
  await dialog.locator('input[name="password"]').fill('Def024@123');
  await dialog.locator('input[name="fullName"]').fill('Thử lỗi DEF-024');
  save = dialog.getByRole('button', { name: 'Tạo tài khoản' });
  await save.click();
  await expect(dialog.locator('.alert.danger, .field-error').first()).toBeVisible();
  await expect(save).toBeEnabled();
  await dialog.locator('input[name="username"]').fill('def024-nv');
  await save.click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
  const user = (await apiAs(request, 'get', '/api/admin/users')).find((u) => u.username === 'def024-nv');
  expect(user).toBeTruthy();
  await apiAs(request, 'delete', `/api/admin/users/${user.userId}`);

  // Món: ảnh sai dạng → báo dưới ô → xóa ô ảnh → lưu được
  await P.goto('/admin/menu');
  await P.locator('tr', { hasText: 'Nước suối' }).getByRole('button', { name: 'Sửa' }).click();
  dialog = P.getByRole('dialog');
  await dialog.getByLabel('Ảnh (URL, không bắt buộc)').fill('anh-sai.jpg');
  save = dialog.getByRole('button', { name: 'Lưu' });
  await save.click();
  await expect(dialog.locator('.field-error')).toHaveText('Ảnh phải là URL http(s) hoặc đường dẫn bắt đầu bằng /');
  await expect(save).toBeEnabled();
  await dialog.getByLabel('Ảnh (URL, không bắt buộc)').fill('');
  await save.click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
});

test('đổi bàn khi quét (chưa gửi món): khách chọn 2 món ở Bàn X1 → quét QR Bàn X2 → màn hỏi "Bạn đang gọi món ở Bàn X1 (chưa gửi món nào)" → "Chuyển sang Bàn X2" → thực đơn Bàn X2, giỏ còn 2 món; quầy: Bàn X1 trống, Bàn X2 "Chuyển từ Bàn X1"; quầy "Đóng bàn trống" Bàn X2 → điện thoại mở lại bàn, giỏ vẫn còn, có lời nhắn (F-086, AC-086-06)', async ({
  request,
}) => {
  const made = [];
  for (const code of ['X1', 'X2']) made.push(await apiAs(request, 'post', '/api/admin/tables', { code, name: `Bàn ${code}` }));
  const [x1, x2] = made;
  const phone = await browser.newContext(phoneOpts);
  try {
    const G = await phone.newPage();
    watch(G, 'doi-ban');
    await G.goto(`/t/${x1.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    for (const name of ['Nước suối', 'Cà phê đen'])
      await G.locator('.c-section.cat .c-item')
        .filter({ has: G.getByRole('button', { name, exact: true }) })
        .locator('.add-btn')
        .click();
    await expect(G.locator('#cart-count')).toHaveText('2 món');
    await G.goto(`/t/${x2.qrToken}`);
    await expect(G.locator('.c-hero p')).toHaveText('Bạn đang gọi món ở Bàn X1 (chưa gửi món nào). Bạn đã chuyển sang Bàn X2?');
    await expect(G.getByRole('link', { name: 'Quay lại Bàn X1' })).toBeVisible();
    await G.getByRole('button', { name: /Chuyển sang Bàn X2/ }).click();
    await expect(G).toHaveURL(new RegExp(`/t/${x2.qrToken}/menu$`));
    await expect(G.locator('#cart-count')).toHaveText('2 món');
    await expect(G.locator('.toast', { hasText: 'Đã chuyển sang Bàn X2' })).toBeVisible();
    const tables = await apiAs(request, 'get', '/api/tables');
    expect(tables.find((t) => t.code === 'X1').sessions).toHaveLength(0);
    const s2 = tables.find((t) => t.code === 'X2').sessions[0];
    expect(s2.lastMove.fromTable).toBe('Bàn X1');
    // Quầy đóng bàn trống trong lúc khách còn chọn món → mở lại bàn, giữ giỏ
    await apiAs(request, 'post', `/api/sessions/${s2.sessionId}/close`);
    await expect(G.locator('.toast', { hasText: 'Quầy vừa đóng bàn trống' })).toBeVisible();
    await expect(G).toHaveURL(new RegExp(`/t/${x2.qrToken}/menu$`));
    await expect(G.locator('#cart-count')).toHaveText('2 món');
    const fresh = (await apiAs(request, 'get', '/api/tables')).find((t) => t.code === 'X2').sessions[0];
    expect(fresh.sessionId).not.toBe(s2.sessionId);
    await apiAs(request, 'post', `/api/sessions/${fresh.sessionId}/close`);
  } finally {
    await phone.close();
    for (const t of made) await request.delete(`/api/admin/tables/${t.tableId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  }
});

test('đổi bàn khi quét (đã gửi món): khách gửi đơn ở Bàn X3 → quét QR Bàn X4 → "Nhờ quầy chuyển nhóm sang Bàn X4" → trang theo dõi Bàn X3 hiện dòng chờ; máy quầy thấy thẻ "Bàn X3 → Bàn X4" ở dải Gọi nhân viên → bấm "Chuyển" → điện thoại tự mở lại ở Bàn X4, đơn vẫn còn, thẻ yêu cầu biến mất (F-086, AC-086-07)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const x3 = await apiAs(request, 'post', '/api/admin/tables', { code: 'X3', name: 'Bàn X3' });
  const x4 = await apiAs(request, 'post', '/api/admin/tables', { code: 'X4', name: 'Bàn X4' });
  const phone = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'nho-quay');
    await G.goto(`/t/${x3.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    await G.goto(`/t/${x4.qrToken}`);
    await expect(G.locator('.c-hero p')).toHaveText('Bạn đang gọi món ở Bàn X3 (đã gửi 1 món). Bạn đã chuyển sang Bàn X4?');
    await expect(G.getByRole('button', { name: /Gọi món ở Bàn X4/ })).toBeVisible(); // F-097: bỏ chữ "riêng"
    await G.getByRole('button', { name: /Nhờ quầy chuyển nhóm sang Bàn X4/ }).click();
    await expect(G).toHaveURL(new RegExp(`/t/${x3.qrToken}/track$`));
    await expect(G.locator('#move-status')).toContainText('Đã nhờ quầy chuyển nhóm sang Bàn X4');

    const S = await quay.newPage();
    watch(S, 'quay-doi-ban');
    await S.goto('/pos/login');
    await S.fill('#username', 'staff1');
    await S.fill('#password', 'Staff@123');
    await S.click('#submit');
    await expect(S).toHaveURL(/\/pos$/);
    const card = S.locator('.move-card', { hasText: 'Bàn X3 → Bàn X4' });
    await expect(card).toContainText('Khách xin chuyển bàn');
    await card.getByRole('button', { name: 'Chuyển Bàn X3 sang Bàn X4' }).click();
    await expect(S.locator('.move-card')).toHaveCount(0);
    await expect(G).toHaveURL(new RegExp(`/t/${x4.qrToken}/track$`));
    await expect(G.locator('header')).toContainText('Bàn X4');
    await expect(G.locator('.order-card')).toContainText('Nước suối');
    await expect(G.locator('#move-status')).toHaveCount(0);
  } finally {
    await Promise.all([phone.close(), quay.close()]);
    const s = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'X4')?.sessions?.[0];
    if (s) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử đổi bàn' });
  }
});

test('hoàn thiện đổi bàn: khách gửi món ở Bàn X5 (quầy đã tiếp nhận) rồi nhờ quầy chuyển sang Bàn X6 → thẻ xin chuyển ghi "Bàn X6 đang trống", có nhóm khác vào Bàn X6 thì tự đổi "đang có 1 nhóm khác"; bấm "Chuyển" → nhắc "Thu chung với bàn khác" + "mang ra Bàn X6"; thẻ đơn có nhãn "Đổi bàn: Bàn X5 → Bàn X6" + nút "In phiếu bàn mới"; phiếu pha ghi to Bàn X6, đổi từ Bàn X5, món, không giá (F-087, AC-087-04)', async ({
  request,
}) => {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
  const x5 = await apiAs(request, 'post', '/api/admin/tables', { code: 'X5', name: 'Bàn X5' });
  const x6 = await apiAs(request, 'post', '/api/admin/tables', { code: 'X6', name: 'Bàn X6' });
  const phone = await browser.newContext(phoneOpts);
  const friend = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'doi-ban-x5');
    await G.goto(`/t/${x5.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const order = (await apiAs(request, 'get', '/api/orders')).find((o) => o.table?.name === 'Bàn X5' && o.status === 'PENDING');
    expect(order, 'đơn của Bàn X5').toBeTruthy();

    const S = await quay.newPage();
    watch(S, 'quay-phieu');
    await S.goto('/pos/login');
    await S.fill('#username', 'staff1');
    await S.fill('#password', 'Staff@123');
    await S.click('#submit');
    await expect(S).toHaveURL(/\/pos$/);
    await S.getByRole('dialog')
      .getByRole('button', { name: 'Bỏ qua' })
      .click({ timeout: 3000 })
      .catch(() => {}); // hướng dẫn lần đầu (khi chạy riêng bài này)
    const ticket = S.locator('.ticket', { hasText: `#${order.orderCode}` });
    await ticket.getByRole('button', { name: 'Tiếp nhận', exact: true }).click();
    await expect(S.locator('#col-PREPARING .ticket', { hasText: `#${order.orderCode}` })).toBeVisible();
    await expect(ticket.locator('.move-flag')).toHaveCount(0);

    await G.goto(`/t/${x6.qrToken}`);
    await G.getByRole('button', { name: /Nhờ quầy chuyển nhóm sang Bàn X6/ }).click();
    await expect(G).toHaveURL(new RegExp(`/t/${x5.qrToken}/track$`));
    const card = S.locator('.move-card', { hasText: 'Bàn X5 → Bàn X6' });
    await expect(card).toContainText('Bàn X6 đang trống');
    // Một nhóm khác vừa ngồi vào Bàn X6 → thẻ tự cập nhật (không tải lại trang)
    const F = await friend.newPage();
    watch(F, 'ban-x6');
    await F.goto(`/t/${x6.qrToken}`);
    await expect(F).toHaveURL(/\/menu$/);
    await expect(card).toContainText('Bàn X6 đang có 1 nhóm khác');
    await card.getByRole('button', { name: 'Chuyển Bàn X5 sang Bàn X6' }).click();
    await expect(S.locator('.toast', { hasText: 'Thu chung với bàn khác' })).toBeVisible();
    await expect(S.locator('.toast', { hasText: 'còn 1 đơn chưa ra món, mang ra Bàn X6' })).toBeVisible();
    await expect(G).toHaveURL(new RegExp(`/t/${x6.qrToken}/track$`));

    // Thẻ đơn đang pha: bàn mới + nhãn đổi bàn + nút in phiếu
    await expect(ticket.locator('.where')).toHaveText('Bàn X6');
    await expect(ticket.locator('.move-flag')).toContainText('Đổi bàn: Bàn X5 → Bàn X6');
    await ticket.getByRole('button', { name: `In phiếu bàn mới cho đơn #${order.orderCode}` }).click();
    await expect(S.locator(`iframe[src*="/pos/orders/${order.orderId}/receipt?mode=ticket"]`)).toHaveCount(1);

    // Phiếu pha: tên bàn mới thật to, đổi từ bàn nào, món — không giá
    const R = await quay.newPage();
    watch(R, 'phieu-pha');
    await R.goto(`/pos/orders/${order.orderId}/receipt?mode=ticket`);
    await expect(R.locator('#receipt .title')).toHaveText('PHIẾU PHA — ĐỔI BÀN');
    await expect(R.locator('#receipt .slip-table')).toHaveText('Bàn X6');
    await expect(R.locator('#receipt')).toContainText('(đổi từ Bàn X5 lúc');
    await expect(R.locator('#receipt')).toContainText(`Đơn #${order.orderCode}`);
    await expect(R.locator('#receipt')).toContainText('1×Nước suối');
    await expect(R.locator('#receipt')).not.toContainText(/\d\.\d{3}/); // không in giá
    await expect(R.locator('#print')).toHaveText('In phiếu');
  } finally {
    await Promise.all([phone.close(), friend.close(), quay.close()]);
    for (const code of ['X5', 'X6']) {
      const t = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === code);
      for (const s of t?.sessions ?? []) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử đổi bàn' });
    }
  }
});

test('chủ quán chọn thời gian tự trả bàn trống ở Cài đặt → "Sau 60 phút" → lưu, tải lại vẫn 60 (F-087, AC-087-05)', async ({ request }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const M = await ctx.newPage();
    watch(M, 'cai-dat-ban-trong');
    await M.goto('/admin/login');
    await M.fill('#username', 'admin');
    await M.fill('#password', 'Admin@123');
    await M.click('#submit');
    await expect(M).toHaveURL(/\/admin\/today$/);
    await M.goto('/admin/settings');
    const pick = M.getByLabel('Tự trả bàn khách quét QR nhưng không gọi món');
    await expect(pick).toHaveValue('30');
    await pick.selectOption({ label: 'Sau 60 phút' });
    await M.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(M.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
    expect((await apiAs(request, 'get', '/api/admin/settings')).idleCloseMinutes).toBe(60);
    await M.reload();
    await expect(M.getByLabel('Tự trả bàn khách quét QR nhưng không gọi món')).toHaveValue('60');
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', { idleCloseMinutes: 30 }); // trả lại mặc định
    await ctx.close();
  }
});

// ---------- F-088 (ADR-049): màn quầy một màn hình — e2e-server.js để tắt; mỗi bài tự bật rồi trả lại bố cục cũ ----------
const SINGLE_ON = { singleScreen: true, serveMode: 'TABLE' };
const SINGLE_OFF = { singleScreen: false, serveMode: 'COUNTER' };

async function ensureShift(request) {
  if (!(await apiAs(request, 'get', '/api/shifts/current')).shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 });
}

/** Khách quét QR + gửi đơn qua API — đơn còn ở trạng thái Mới. */
async function guestOrder(qrToken, items) {
  const g = await browser.newContext();
  try {
    await g.request.get('/api/menu');
    const scan = await (await g.request.post('/api/sessions/scan', { data: { qrToken } })).json();
    const sessionId = scan.session?.sessionId ?? (await (await g.request.post('/api/sessions', { data: { qrToken } })).json()).session.sessionId;
    const order = await (await g.request.post('/api/orders', { data: { sessionId, items } })).json();
    expect(order.orderCode, 'gửi đơn').toBeTruthy();
    return { sessionId, order };
  } finally {
    await g.close();
  }
}

async function counterLogin(ctx, name) {
  const S = await ctx.newPage();
  watch(S, name);
  await S.goto('/pos/login');
  await S.fill('#username', 'staff1');
  await S.fill('#password', 'Staff@123');
  await S.click('#submit');
  await expect(S).toHaveURL(/\/pos$/);
  await S.getByRole('dialog')
    .getByRole('button', { name: 'Bỏ qua' })
    .click({ timeout: 3000 })
    .catch(() => {}); // hướng dẫn lần đầu (khi chạy riêng bài này)
  return S;
}

/** Dọn bàn thử: phiên đã xong hết món → thu tiền; còn đơn Mới → hủy. */
async function clearTables(request, codes) {
  for (const code of codes) {
    const t = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === code);
    for (const s of t?.sessions ?? []) {
      const settle = await request.post(`/api/sessions/${s.sessionId}/settle`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { amountReceived: 500_000 },
      });
      if (!settle.ok()) await apiAs(request, 'post', `/api/sessions/${s.sessionId}/cancel`, { reason: 'Dọn bàn thử màn quầy một màn hình' });
    }
  }
}

test('màn quầy một màn hình: máy quầy 1920 px có vùng Hàng pha + vùng Quầy với thẻ Bàn / Bán mang đi / Gọi món tại bàn / Ca & két; thẻ Bán mang đi (trang nhúng, không thanh trên) bán 1 ly → đơn vào Hàng pha, vẫn ở /pos; "Gọi món" trên Bàn M1 mở thẻ Gọi món đúng Bàn M1; ngăn thu tiền Bàn M2 mở trong vùng Quầy, trong lúc đó Hàng pha vẫn bấm Hoàn tất được (F-088, AC-088-06)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', SINGLE_ON);
  await apiAs(request, 'post', '/api/admin/tables', { code: 'M1', name: 'Bàn M1' });
  const m2 = await apiAs(request, 'post', '/api/admin/tables', { code: 'M2', name: 'Bàn M2' });
  const quay = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  try {
    const S = await counterLogin(quay, 'mot-man-hinh');
    await expect(S.getByRole('heading', { name: 'Hàng pha' })).toBeVisible();
    await expect(S.getByRole('tablist', { name: 'Việc ở quầy' }).getByRole('tab')).toHaveText(['Bàn', 'Bán mang đi', 'Gọi món tại bàn', 'Ca & két']);

    // Thẻ Bán mang đi = trang quầy nhúng (không có thanh trên riêng); bán xong đơn hiện ngay ở Hàng pha
    const before = new Set((await apiAs(request, 'get', '/api/orders')).map((o) => o.orderId));
    await S.getByRole('tab', { name: 'Bán mang đi' }).click();
    const sale = S.frameLocator('#tab-takeaway iframe');
    // Món không có tùy chọn (giữa lượt E2E, Bạc xỉu được gắn Size — bấm thì mở bảng chọn)
    await sale.locator('.tile', { hasText: 'Cà phê đen' }).click();
    await sale.locator('#received').fill('50000');
    await sale.locator('#pay').click();
    let sold;
    await expect
      .poll(async () => (sold = (await apiAs(request, 'get', '/api/orders')).find((o) => !before.has(o.orderId) && o.type === 'TAKE_AWAY')), {
        message: 'đơn mang đi vừa bán',
      })
      .toBeTruthy();
    await expect(sale.locator('#today')).toContainText(sold.orderCode);
    await expect(sale.locator('.pos-top')).toHaveCount(0);
    await expect(S.locator('.zone-bar .ticket', { hasText: `#${sold.orderCode}` })).toBeVisible();
    await expect(S).toHaveURL(/\/pos$/);

    // "Gọi món" trên thẻ bàn → thẻ Gọi món tại bàn mở đúng bàn đó
    await S.getByRole('tab', { name: 'Bàn', exact: true }).click();
    await S.getByRole('link', { name: 'Gọi món Bàn M1' }).click();
    await expect(S.getByRole('tab', { name: 'Gọi món tại bàn' })).toHaveAttribute('aria-selected', 'true');
    await expect(S.frameLocator('#tab-table-order iframe').locator('#target h2')).toHaveText('Bàn M1');
    await expect(S).toHaveURL(/\/pos$/);

    // Ngăn thu tiền mở trong vùng Quầy — vùng Hàng pha không bị che, người pha vẫn bấm được
    await guestOrderAccepted(request, m2.qrToken, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    await S.getByRole('tab', { name: 'Bàn', exact: true }).click();
    await S.locator('.tbl-card', { hasText: 'Bàn M2' }).getByRole('button', { name: 'Thu tiền' }).click();
    const drawer = S.locator('.zone-counter .overlay.in-zone .drawer');
    await expect(drawer).toBeVisible();
    await expect(S.locator('.zone-bar .overlay')).toHaveCount(0);
    await S.locator('#col-PREPARING .ticket', { hasText: 'Bàn M2' }).getByRole('button', { name: 'Hoàn tất' }).click();
    await expect(S.locator('#col-COMPLETED')).toContainText('Bàn M2');
    await expect(drawer).toBeVisible();
    await S.fill('#amount-received', '50000');
    await drawer.locator('.modal-foot .btn-success').click();
    await expect(S.locator('.drawer')).toHaveCount(0);
  } finally {
    await quay.close();
    await apiAs(request, 'put', '/api/admin/settings', SINGLE_OFF);
    await clearTables(request, ['M1', 'M2']);
  }
});

test('gom ly + trạm làm món + in phiếu + hết món: hai bàn cùng gọi Cà phê muối → dòng gom "2× Cà phê muối · 2 đơn", chạm → hai thẻ đơn tô sáng; Bánh croissant (trạm Quầy lấy) không vào gom, thẻ đơn ghi "Quầy lấy kèm", đơn chỉ có bánh ở dải "Quầy lấy" → Xong; chạm thẻ đơn → chi tiết có "In phiếu pha" mở khung in phiếu pha; "Hết món" báo hết Cà phê muối → điện thoại khách thấy món hết, mở bán lại → đặt được; quy trình 1 chạm bật (F-088, AC-088-07)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', { ...SINGLE_ON, oneTap: true }); // quán thật mặc định một chạm (F-076)
  const all = await apiAs(request, 'get', '/api/admin/menu-items');
  const croissant = all.find((i) => i.name === 'Bánh croissant');
  const keep = {
    categoryId: croissant.categoryId,
    name: croissant.name,
    price: croissant.price,
    imageUrl: croissant.imageUrl ?? null,
    isAvailable: true,
    isActive: true,
  };
  await apiAs(request, 'put', `/api/admin/menu-items/${croissant.menuItemId}`, { ...keep, station: 'COUNTER' });
  // Món riêng của bài này → số ly gom không lẫn đơn còn lại của các bài trước (nhóm món nào cũng được — giữa lượt E2E có bài đổi / xóa "Cà phê sữa")
  const muoi = await apiAs(request, 'post', '/api/admin/menu-items', { categoryId: croissant.categoryId, name: 'Cà phê muối', price: 35_000 });
  expect(muoi.station).toBe('BAR');
  const tbl = {};
  for (const code of ['N1', 'N2', 'N3', 'N4']) tbl[code] = await apiAs(request, 'post', '/api/admin/tables', { code, name: `Bàn ${code}` });
  const quay = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  const phone = await browser.newContext(phoneOpts);
  try {
    const a = await guestOrder(tbl.N1.qrToken, [
      { menuItemId: muoi.menuItemId, quantity: 1 },
      { menuItemId: croissant.menuItemId, quantity: 1 },
    ]);
    const b = await guestOrder(tbl.N2.qrToken, [{ menuItemId: muoi.menuItemId, quantity: 1 }]);
    const c = await guestOrder(tbl.N3.qrToken, [{ menuItemId: croissant.menuItemId, quantity: 1 }]);
    const S = await counterLogin(quay, 'gom-ly');

    // Gom ly: chỉ món trạm Bar; chạm → tô sáng đúng hai thẻ
    const chip = S.locator('#batch .batch-chip', { hasText: 'Cà phê muối' });
    await expect(chip).toContainText('2× Cà phê muối');
    await expect(chip).toContainText('2 đơn');
    await expect(S.locator('#batch')).not.toContainText('Bánh croissant');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(S.locator('#board .ticket.batch-hit')).toHaveCount(2);
    await expect(S.locator('#board .ticket.batch-hit', { hasText: `#${a.order.orderCode}` })).toHaveCount(1);
    await expect(S.locator('#board .ticket.batch-hit', { hasText: `#${b.order.orderCode}` })).toHaveCount(1);

    // Trạm Quầy lấy: bánh đi kèm đơn cần pha ghi riêng; đơn chỉ có bánh không vào Hàng pha mà ở dải "Quầy lấy"
    await expect(S.locator('#board .ticket', { hasText: `#${a.order.orderCode}` }).locator('.counter-extra')).toHaveText(/Quầy lấy kèm: 1× Bánh croissant/);
    await expect(S.locator('#board')).not.toContainText(`#${c.order.orderCode}`);
    const strip = S.locator('#counter-strip .counter-card', { hasText: 'Bàn N3' });
    await expect(strip).toContainText('1× Bánh croissant');
    await expect(strip).not.toContainText(`#${c.order.orderCode}`); // gọn: không ghi mã đơn

    // Thẻ đơn chỉ một nút (Xong); In phiếu pha / Hủy đơn ở chi tiết đơn (chạm thẻ) — chi tiết mở trong vùng Hàng pha
    const ticketB = S.locator('#board .ticket', { hasText: `#${b.order.orderCode}` });
    await expect(ticketB.getByRole('button')).toHaveText(['Xong']);
    await ticketB.locator('.ticket-meta').click();
    const detail = S.locator('.zone-bar .overlay.in-zone .drawer');
    await expect(detail.getByRole('button', { name: 'Hủy đơn' })).toBeVisible();
    await detail.getByRole('button', { name: 'In phiếu pha' }).click();
    await expect(detail).toHaveCount(0);
    await expect(S.locator(`iframe[src*="/pos/orders/${b.order.orderId}/receipt?mode=ticket"]`)).toHaveCount(1);

    // Người đứng quầy lấy bánh → Xong ở dải; không còn dải "Mang ra" (ADR-064 D-253)
    await strip.getByRole('button', { name: `Xong đơn #${c.order.orderCode} (quầy lấy)` }).click();
    await expect(S.locator('.toast', { hasText: `Đã hoàn tất #${c.order.orderCode}` })).toBeVisible();
    await expect(S.locator('#counter-strip .counter-card', { hasText: 'Bàn N3' })).toHaveCount(0);
    await expect(S.locator('#serve-strip')).toHaveCount(0);

    // Hết món: người pha báo hết món ngay ở Hàng pha → điện thoại khách đổi ngay; mở bán lại → đặt được
    // (món của bài này không có công thức → không tự hết vì thiếu nguyên liệu dù các bài trước đã bán nhiều)
    const G = await phone.newPage();
    watch(G, 'het-mon');
    await G.goto(`/t/${tbl.N4.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    const card = G.locator('.c-section.cat .c-item', { hasText: 'Cà phê muối' });
    await expect(card.locator('.add-btn')).toBeVisible();
    await S.locator('#soldout-btn').click();
    const box = S.locator('.zone-bar .overlay.in-zone');
    await expect(box.getByRole('dialog', { name: 'Báo hết món' })).toBeVisible();
    await box.getByRole('button', { name: 'Báo hết Cà phê muối' }).click();
    await expect(S.locator('.toast', { hasText: 'Đã báo hết Cà phê muối' })).toBeVisible();
    await expect(card.getByText('Hết món')).toBeVisible({ timeout: 2000 });
    await box.getByRole('button', { name: 'Mở bán lại Cà phê muối' }).click();
    await expect(card.locator('.add-btn')).toBeVisible({ timeout: 2000 });
    await box.getByRole('button', { name: 'Xong' }).click();
    await expect(S.locator('.overlay')).toHaveCount(0);
  } finally {
    await Promise.all([quay.close(), phone.close()]);
    await apiAs(request, 'put', '/api/admin/settings', { ...SINGLE_OFF, oneTap: false });
    await apiAs(request, 'put', `/api/admin/menu-items/${croissant.menuItemId}`, { ...keep, station: 'BAR' });
    await clearTables(request, ['N1', 'N2', 'N3', 'N4']);
  }
});

test('mang ra bàn: khách Bàn S1 gọi món bằng điện thoại, quầy Tiếp nhận → Hoàn tất → không có dải "Mang ra" / nút "Đã mang"; điện thoại khách báo "nhân viên đang mang ra bàn", thẻ đơn "Đã xong" (3 bước), không tràn ngang ở 320 px (F-088, AC-088-08, ADR-064)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', SINGLE_ON);
  const s1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'S1', name: 'Bàn S1' });
  const phone = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'mang-ra');
    await G.goto(`/t/${s1.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const order = (await apiAs(request, 'get', '/api/orders')).find((o) => o.table?.name === 'Bàn S1' && o.status === 'PENDING');
    expect(order, 'đơn của Bàn S1').toBeTruthy();

    const S = await counterLogin(quay, 'mang-ra-quay');
    await S.locator('#col-PENDING .ticket', { hasText: `#${order.orderCode}` })
      .getByRole('button', { name: 'Tiếp nhận', exact: true })
      .click();
    await S.locator('#col-PREPARING .ticket', { hasText: `#${order.orderCode}` })
      .getByRole('button', { name: 'Hoàn tất' })
      .click();
    // ADR-064 D-253: không còn dải "Mang ra" / nút "Đã mang" — món xong là xong
    await expect(S.locator('#col-PREPARING .ticket', { hasText: `#${order.orderCode}` })).toHaveCount(0);
    await expect(S.locator('#serve-strip')).toHaveCount(0);
    await expect(S.getByRole('button', { name: /Đã mang/ })).toHaveCount(0);

    await expect(G.locator('.popup-done')).toContainText('nhân viên đang mang ra bàn');
    await G.getByRole('button', { name: 'Đã hiểu' }).click();
    await expect(G.locator('.order-card .badge')).toHaveText('Đã xong');
    await expect(G.locator('.order-card .progress span')).toHaveText(['Đã gửi', 'Đang chuẩn bị', 'Xong']);
    await expect(G.locator('.order-card .progress span.on')).toHaveCount(3);
    // DEF-031: điện thoại nhỏ 320 px — đơn đã xong không làm trang tràn ngang (nhãn dài từng đẩy trang rộng 412 px)
    await G.setViewportSize({ width: 320, height: 700 });
    expect(await G.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  } finally {
    await Promise.all([phone.close(), quay.close()]);
    await apiAs(request, 'put', '/api/admin/settings', SINGLE_OFF);
    await clearTables(request, ['S1']);
  }
});

test('bố cục màn quầy một màn hình: màn 1024 px hai vùng cạnh nhau, không có nút mở vùng Quầy; màn 900 px vùng Quầy là ngăn trượt — nút "Quầy" mở, có thẻ, ← / → đổi thẻ (focus ở lại thẻ), Esc đóng; khách gọi thanh toán → bấm thẻ ở dải trên → ngăn Quầy tự mở kèm bill; chủ quán tắt "Màn quầy một màn hình" ở Cài đặt → /pos về bố cục cũ, mục "Bán mang đi" mở trang riêng (F-088, AC-088-09)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', SINGLE_ON);
  const p9 = await apiAs(request, 'post', '/api/admin/tables', { code: 'P9', name: 'Bàn P9' });
  const quay = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'vi-VN' });
  const owner = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const S = await counterLogin(quay, 'bo-cuc');
    const bar = S.locator('.zone-bar');
    const counter = S.locator('.zone-counter');
    await expect(bar).toBeVisible();
    await expect(counter).toBeVisible();
    await expect(S.locator('#tables-toggle')).toBeHidden();
    const [bb, cb] = [await bar.boundingBox(), await counter.boundingBox()];
    expect(cb.x, 'vùng Quầy nằm bên phải Hàng pha').toBeGreaterThanOrEqual(bb.x + bb.width - 1);
    expect(Math.abs(cb.y - bb.y), 'hai vùng cùng hàng').toBeLessThan(4);

    await S.setViewportSize({ width: 900, height: 700 });
    const toggle = S.locator('#tables-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('Quầy');
    await expect(counter).toBeHidden();
    await toggle.click();
    await expect(counter).toBeVisible();
    await expect(counter.getByRole('tab', { name: 'Bán mang đi' })).toBeVisible();
    // Mẫu thẻ ARIA trong ngăn: → đổi thẻ, focus ở lại thẻ (không nhảy về nút Đóng)
    await counter.getByRole('tab', { name: 'Bàn', exact: true }).focus();
    await S.keyboard.press('ArrowRight');
    await expect(counter.getByRole('tab', { name: 'Bán mang đi' })).toBeFocused();
    await expect(counter.getByRole('tab', { name: 'Bán mang đi' })).toHaveAttribute('aria-selected', 'true');
    await S.keyboard.press('Home');
    await expect(counter.getByRole('tab', { name: 'Bàn', exact: true })).toHaveAttribute('aria-selected', 'true');
    await S.keyboard.press('Escape');
    await expect(counter).toBeHidden();
    await expect(toggle).toBeFocused();

    // Khách Bàn P9 gọi thanh toán → thẻ ở dải "Cần xử lý ngay" → ngăn Quầy tự mở, bill hiện (không nằm trong ngăn đang đóng)
    const g = await browser.newContext();
    try {
      await g.request.get('/api/menu');
      const scan = await (await g.request.post('/api/sessions/scan', { data: { qrToken: p9.qrToken } })).json();
      const sid = scan.session?.sessionId ?? (await (await g.request.post('/api/sessions', { data: { qrToken: p9.qrToken } })).json()).session.sessionId;
      const order = await (await g.request.post('/api/orders', { data: { sessionId: sid, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] } })).json();
      await apiAs(request, 'post', `/api/orders/${order.orderId}/accept`);
      expect((await g.request.post(`/api/sessions/${sid}/request-payment`)).ok(), 'khách gọi thanh toán').toBeTruthy();
    } finally {
      await g.close();
    }
    await S.locator('#pay-strip .pay-card', { hasText: 'Bàn P9' }).click();
    await expect(counter).toBeVisible();
    const bill = counter.locator('.overlay.in-zone .drawer');
    await expect(bill).toBeVisible();
    await expect(bill).toContainText('Bàn P9');
    await bill.getByRole('button', { name: 'Đóng' }).first().click();
    await expect(bill).toHaveCount(0);
    await S.keyboard.press('Escape');
    await expect(counter).toBeHidden();

    // Chủ quán tắt ở Cài đặt → bố cục cũ
    const M = await owner.newPage();
    watch(M, 'tat-mot-man-hinh');
    await M.goto('/admin/login');
    await M.fill('#username', 'admin');
    await M.fill('#password', 'Admin@123');
    await M.click('#submit');
    await expect(M).toHaveURL(/\/admin\/today$/);
    await M.goto('/admin/settings');
    const box = M.getByLabel(/Màn quầy một màn hình/);
    await expect(box).toBeChecked();
    await box.uncheck();
    await M.getByRole('button', { name: 'Lưu cài đặt' }).click();
    await expect(M.locator('.toast', { hasText: 'Đã lưu cài đặt' })).toBeVisible();
    expect((await apiAs(request, 'get', '/api/admin/settings')).singleScreen).toBe(false);

    await S.setViewportSize({ width: 1366, height: 860 });
    await S.reload();
    await expect(S.locator('#conn')).toHaveText('Đã kết nối');
    await expect(S.locator('.counter-tabs')).toHaveCount(0);
    await expect(S.locator('.zone-bar')).toHaveCount(0);
    const nav = S.locator('.pos-nav a', { hasText: 'Bán mang đi' });
    await expect(nav).toHaveAttribute('href', '/pos/takeaway');
    await nav.click();
    await expect(S).toHaveURL(/\/pos\/takeaway$/);
  } finally {
    await Promise.all([quay.close(), owner.close()]);
    await apiAs(request, 'put', '/api/admin/settings', SINGLE_OFF);
    await clearTables(request, ['P9']);
  }
});

test('màn quầy gọn: thanh trên một hàng ở 1366 px chỉ Màn quầy / Kho / Giờ công (không trùng thẻ), kết nối là chấm, "?" và máy in tự in là nút biểu tượng; thẻ đơn một nút, chạm thẻ → chi tiết có Hủy đơn / In phiếu pha / Tiếp nhận & Hoàn tất, "Mở bàn / Thu tiền" mở bill ở vùng Quầy; "Đã xong hôm nay" thu gọn, "Xem" mở; thẻ bàn một nút, chạm tên bàn → bill có Chuyển bàn / Ghi chú, "Gọi thêm món" đóng bill mở thẻ Gọi món đúng bàn; hai hộp thoại hai vùng — Esc đóng hộp đang có focus (F-088, AC-088-10)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', SINGLE_ON);
  const g1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'G1', name: 'Bàn G1' });
  const quay = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const { order } = await guestOrder(g1.qrToken, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const S = await counterLogin(quay, 'man-quay-gon');

    // Thanh trên gọn, một hàng — sau lần chạm đầu (trình duyệt mở khóa âm thanh → nút loa chỉ còn biểu tượng)
    await S.getByRole('heading', { name: 'Hàng pha' }).click();
    await expect(S.getByRole('button', { name: 'Âm thanh: bật' })).toHaveText('');
    const nav = S.locator('.pos-nav a');
    await expect(nav.first()).toHaveText('Màn quầy');
    for (const dup of ['Gọi món tại bàn', 'Bán mang đi', 'Ca & hoàn tiền']) await expect(nav.filter({ hasText: dup })).toHaveCount(0);
    await expect(S.locator('.pos-top')).not.toHaveClass(/stacked/);
    await expect(S.locator('#conn')).toHaveText('Đã kết nối');
    await expect(S.locator('#conn .conn-text')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)'); // chữ chỉ cho trình đọc màn hình
    await expect(S.getByRole('button', { name: 'Hướng dẫn' })).toHaveText('');
    const printer = S.getByRole('button', { name: 'Tự in phiếu pha trên máy này' });
    await expect(printer).toHaveAttribute('aria-pressed', 'false');
    await printer.click();
    await expect(printer).toHaveAttribute('aria-pressed', 'true');
    await printer.click();
    await expect(printer).toHaveAttribute('aria-pressed', 'false');

    // Thẻ đơn: một nút; việc phụ trong chi tiết đơn (vùng Hàng pha); "Mở bàn / Thu tiền" → bill ở vùng Quầy
    const ticket = S.locator('#board .ticket', { hasText: `#${order.orderCode}` });
    await expect(ticket.getByRole('button')).toHaveText(['Tiếp nhận']);
    await ticket.locator('.ticket-meta').click();
    const detail = S.locator('.zone-bar .overlay.in-zone .drawer');
    for (const name of ['Hủy đơn', 'In phiếu pha', 'Tiếp nhận & Hoàn tất', 'Mở bàn / Thu tiền'])
      await expect(detail.getByRole('button', { name })).toBeVisible();
    await detail.getByRole('button', { name: 'Mở bàn / Thu tiền' }).click();
    const bill = S.locator('.zone-counter .overlay.in-zone .drawer');
    await expect(bill).toContainText('Bàn G1');
    await expect(S.locator('.zone-bar .overlay')).toHaveCount(0); // hàng pha không bị che
    await bill.getByRole('button', { name: 'Đóng' }).first().click();
    await expect(bill).toHaveCount(0);

    // "Đã xong hôm nay" thu gọn
    await expect(S.locator('#col-COMPLETED')).toBeHidden();
    await S.locator('.done-band').getByRole('button', { name: 'Xem' }).click();
    await expect(S.locator('#col-COMPLETED')).toBeVisible();
    await S.locator('.done-band').getByRole('button', { name: 'Ẩn' }).click();
    await expect(S.locator('#col-COMPLETED')).toBeHidden();

    // Thẻ bàn: một nút; chạm tên bàn → bill có việc phụ; "Gọi thêm món" → đóng bill, mở thẻ Gọi món đúng bàn
    const card = S.locator('.tbl-card', { hasText: 'Bàn G1' });
    await expect(card.locator('.tc-main').getByRole('button')).toHaveText(['Thu tiền']);
    await expect(card.locator('.tc-tools')).toHaveCount(0);
    await card.getByRole('button', { name: 'Mở bill Bàn G1' }).click();
    await expect(bill.getByRole('button', { name: 'Chuyển bàn' })).toBeVisible();
    await expect(bill.getByRole('button', { name: 'Ghi chú bàn' })).toBeVisible();
    await bill.getByRole('link', { name: 'Gọi thêm món' }).click();
    await expect(bill).toHaveCount(0);
    await expect(S.getByRole('tab', { name: 'Gọi món tại bàn' })).toHaveAttribute('aria-selected', 'true');
    await expect(S.frameLocator('#tab-table-order iframe').locator('#target h2')).toHaveText('Bàn G1');
    await S.getByRole('tab', { name: 'Bàn', exact: true }).click();

    // Hai hộp thoại hai vùng: Esc đóng hộp của người đang thao tác (focus), hộp vùng kia vẫn mở
    await card.getByRole('button', { name: 'Thu tiền' }).click();
    await expect(bill).toBeVisible();
    await S.locator('#soldout-btn').click();
    const soldout = S.locator('.zone-bar .overlay.in-zone');
    await expect(soldout.getByRole('dialog', { name: 'Báo hết món' })).toBeVisible();
    await soldout.getByRole('button', { name: 'Xong' }).focus();
    await S.keyboard.press('Escape');
    await expect(soldout).toHaveCount(0);
    await expect(bill).toBeVisible();
    await bill.getByRole('button', { name: 'Đóng' }).first().click();
    await expect(bill).toHaveCount(0);
  } finally {
    await quay.close();
    await apiAs(request, 'put', '/api/admin/settings', SINGLE_OFF);
    await clearTables(request, ['G1']);
  }
});

// ---------- TASK-129 (ADR-066): hộp Thu tiền gọn — một việc chính, việc phụ sau "Việc khác" ----------
test('hộp Thu tiền gọn: mở bằng "Thu tiền" → "Việc khác" gập, không còn dòng "Không ghi nợ", nút tiền nhanh + nút thu thấy ngay ở 1366 × 768 không phải cuộn; "Việc khác" mở ra Gọi thêm món / Ghi chú bàn / Chuyển bàn / Tách hóa đơn / Thu chung với bàn khác / Hủy bàn, bấm một việc thì gập lại; "Xóa đơn" là chữ nhỏ trên đầu thẻ đơn; chạm tên bàn → bill mở sẵn "Việc khác" (TASK-129, ADR-066, AC-088-11)', async ({
  request,
}) => {
  await ensureShift(request);
  await apiAs(request, 'put', '/api/admin/settings', SINGLE_ON);
  const t = await apiAs(request, 'post', '/api/admin/tables', { code: 'HT1', name: 'Bàn HT1' });
  const quay = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'vi-VN' });
  try {
    await guestOrderAccepted(request, t.qrToken, [{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    const S = await counterLogin(quay, 'hop-thu-tien-gon');
    const card = S.locator('.tbl-card', { hasText: 'Bàn HT1' });
    await card.getByRole('button', { name: 'Thu tiền' }).click();
    const bill = S.locator('.zone-counter .overlay.in-zone .drawer');
    await expect(bill.locator('.due span').last()).toHaveText('25.000đ');

    // Mở bằng "Thu tiền": chỉ việc thu tiền — việc phụ gập sau "Việc khác"
    const more = bill.getByRole('button', { name: 'Việc khác' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    for (const name of ['Ghi chú bàn', 'Chuyển bàn', 'Tách hóa đơn', 'Thu chung với bàn khác', 'Hủy bàn'])
      await expect(bill.getByRole('button', { name })).toHaveCount(0);
    await expect(bill.getByRole('link', { name: 'Gọi thêm món' })).toHaveCount(0);
    await expect(bill).not.toContainText('Không ghi nợ');
    // Thẻ đơn: "Xóa đơn" là chữ nhỏ trên đầu thẻ (không còn hàng nút đỏ riêng); dòng món tên trái · tiền phải
    await expect(bill.locator('.mini-order .mo-head').getByRole('button', { name: 'Xóa đơn' })).toBeVisible();
    await expect(bill.locator('.mo-items li').first().locator('.mo-price')).toHaveText('25.000đ');
    // Nút tiền nhanh + nút thu thấy ngay (không phải cuộn)
    await expect(bill.locator('.quick-cash .btn').first()).toBeInViewport({ ratio: 1 });
    await expect(bill.locator('.modal-foot .btn-success')).toBeInViewport({ ratio: 1 });
    await bill.locator('.quick-cash .btn').first().click();
    await expect(bill.locator('.change')).toContainText('Tiền thừa trả khách');
    await expect(bill.locator('.modal-foot .btn-success')).toBeEnabled();

    // "Việc khác": đủ việc phụ; bấm một việc → gập lại
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const tasks = bill.locator('#settle-tasks');
    await expect(tasks.getByRole('link', { name: 'Gọi thêm món' })).toBeVisible();
    for (const name of ['Ghi chú bàn', 'Chuyển bàn', 'Tách hóa đơn', 'Thu chung với bàn khác', 'Hủy bàn'])
      await expect(tasks.getByRole('button', { name })).toBeVisible();
    await tasks.getByRole('button', { name: 'Ghi chú bàn' }).click();
    const noteDlg = S.locator('.modal', { hasText: 'Ghi chú Bàn HT1' });
    await expect(noteDlg.locator('textarea')).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await S.keyboard.press('Escape');
    await expect(noteDlg).toHaveCount(0);
    await bill.getByRole('button', { name: 'Đóng' }).first().click();
    await expect(bill).toHaveCount(0);

    // Chạm tên bàn (= mở bill để làm việc phụ) → "Việc khác" mở sẵn
    await card.getByRole('button', { name: 'Mở bill Bàn HT1' }).click();
    await expect(bill.getByRole('button', { name: 'Việc khác' })).toHaveAttribute('aria-expanded', 'true');
    await expect(bill.locator('#settle-tasks').getByRole('button', { name: 'Chuyển bàn' })).toBeVisible();
  } finally {
    await quay.close();
    await apiAs(request, 'put', '/api/admin/settings', SINGLE_OFF);
    await clearTables(request, ['HT1']);
  }
});

// ---------- TASK-109 (F-089): Kho nguyên liệu gọn — hạn sử dụng, "⋯"; Nhà cung cấp & đặt hàng gộp vào Nhập kho & kiểm kê ----------
test('kho nguyên liệu: cột Hạn sử dụng hiện lô gần hết hạn nhất (ngày, "Còn 2 ngày", lượng của lô) + dải "Sắp hết hạn"; mỗi dòng chỉ còn Điều chỉnh · Sửa · ⋯, "⋯" mở ngăn Lịch sử kho / Lô & hạn dùng / Kho nâng cao / Xóa nguyên liệu; nguyên liệu chưa theo dõi → "Theo dõi hạn" một chạm → dòng nhập kho có ô Hạn sử dụng (F-089, AC-089-03)', async ({
  request,
}) => {
  const vnDay = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
  const dmy = (iso) => iso.split('-').reverse().join('/');
  const id = (await apiAs(request, 'post', '/api/admin/ingredients', { name: 'Sữa hạn E2E', unit: 'ml', stockQty: 0, lowStockThreshold: 0 })).ingredientId;
  await apiAs(request, 'put', `/api/admin/ingredients/${id}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true });
  await apiAs(request, 'post', '/api/admin/stock-receipts', {
    lines: [{ ingredientId: id, qty: 1000, unitCost: 30, expiryDate: vnDay(10), lotCode: 'E2E-B' }],
  });
  await apiAs(request, 'post', '/api/admin/stock-receipts', { lines: [{ ingredientId: id, qty: 400, unitCost: 30, expiryDate: vnDay(2), lotCode: 'E2E-A' }] });

  await P.goto('/admin/ingredients');
  const rowOf = (name) => P.locator('tbody tr').filter({ has: P.getByText(name, { exact: true }) });
  const row = rowOf('Sữa hạn E2E');
  await expect(P.locator('thead th')).toHaveText(['Nguyên liệu', 'Còn dùng được', 'Hạn sử dụng', 'Trạng thái', '']);
  const cell = row.locator('td.expiry-cell');
  await expect(cell).toContainText(dmy(vnDay(2)));
  await expect(cell.locator('.badge')).toHaveText('Còn 2 ngày');
  await expect(cell).toContainText('400 ml của lô này');
  await expect(row.locator('td.num strong')).toHaveText('1.400');
  await expect(P.locator('#expiry-alert')).toContainText('Sữa hạn E2E (còn 2 ngày)');
  await expect(row.getByRole('button')).toHaveText(['Điều chỉnh', 'Sửa', '⋯']);

  await row.getByRole('button', { name: 'Việc khác: Sữa hạn E2E' }).click();
  const more = P.getByRole('dialog', { name: 'Sữa hạn E2E', exact: true });
  await expect(more.locator('.ing-more-item strong')).toHaveText(['Lịch sử kho', 'Lô & hạn dùng', 'Kho nâng cao', 'Xóa nguyên liệu']);
  await expect(more.locator('.ing-more-summary')).toContainText('Còn 2 ngày');
  await more.getByRole('button', { name: 'Lô & hạn dùng' }).click();
  const lots = P.getByRole('dialog', { name: 'Lô: Sữa hạn E2E' });
  await expect(lots).toContainText('E2E-A');
  await expect(lots).toContainText('E2E-B');
  await lots.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Việc khác: Sữa hạn E2E' })).toBeFocused();

  // Chưa theo dõi hạn → "Theo dõi hạn" (một chạm, không phải vào Kho nâng cao) → nhập kho có ô Hạn sử dụng cho nguyên liệu đó
  await apiAs(request, 'post', '/api/admin/ingredients', { name: 'Bột cacao E2E', unit: 'g', stockQty: 0, lowStockThreshold: 0 });
  await P.reload();
  const cacao = rowOf('Bột cacao E2E').locator('td.expiry-cell');
  await expect(cacao).toContainText('Chưa theo dõi');
  await cacao.getByRole('button', { name: 'Theo dõi hạn: Bột cacao E2E' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã bật theo dõi hạn cho Bột cacao E2E' })).toBeVisible();
  await expect(rowOf('Bột cacao E2E').locator('td.expiry-cell')).toHaveText('Chưa có lô ghi hạn — ghi hạn ở dòng nhập kho');
  await expect(P.getByRole('button', { name: 'Việc khác: Bột cacao E2E' })).toBeFocused();
  const cacaoNow = (await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.name === 'Bột cacao E2E');
  expect([cacaoNow.trackLots, cacaoNow.kind, cacaoNow.wastePercent]).toEqual([true, 'RAW', 0]);
  await P.goto('/admin/stock');
  await expect(P.getByLabel('Hạn sử dụng')).toHaveCount(0);
  await P.getByRole('combobox', { name: 'Nguyên liệu' }).first().selectOption({ label: 'Bột cacao E2E (g) · còn 0' });
  await expect(P.getByLabel('Hạn sử dụng')).toBeVisible();
});

test('Nhập kho & kiểm kê gộp Nhà cung cấp & đặt hàng: thanh bên chỉ còn một mục; hàng thẻ chung Nhập kho · Kiểm kê · Đề xuất nhập hàng · Đơn đặt hàng · Nhà cung cấp + Báo cáo kho; chọn thẻ của trang kia → chuyển đúng thẻ (?tab=), mục ở thanh bên vẫn sáng; tải lại giữ thẻ (F-089, AC-089-04)', async () => {
  await P.goto('/admin/stock');
  const side = P.locator('#side');
  await expect(side.locator('a[href="/admin/purchasing"]')).toHaveCount(0);
  await expect(side.locator('a[href="/admin/stock"]')).toHaveText('Nhập kho & kiểm kê');
  const tabs = P.getByRole('tablist', { name: 'Nhập kho, đặt hàng & kiểm kê' });
  await expect(tabs.getByRole('tab')).toHaveText([
    'Nhập kho',
    'Kiểm kê',
    'Đề xuất nhập hàng',
    'Đơn đặt hàng',
    'Nhà cung cấp',
    'Giá vốn & hao hụt',
    'Giá vốn thực tế',
    'Thất thoát',
    'Giá & giao hàng',
    'Đơn vị',
  ]);
  await expect(tabs.getByRole('tab', { name: 'Nhập kho', exact: true })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Nhà cung cấp' }).click();
  await expect(P).toHaveURL(/\/admin\/purchasing\?tab=suppliers$/);
  await expect(P.getByRole('tab', { name: 'Nhà cung cấp' })).toHaveAttribute('aria-selected', 'true');
  await expect(P.getByRole('button', { name: '+ Thêm nhà cung cấp' })).toBeVisible();
  await expect(side.locator('a[href="/admin/stock"]')).toHaveAttribute('aria-current', 'page');
  await expect(P.locator('#page-title')).toHaveText('Nhập kho & kiểm kê');

  await P.getByRole('tab', { name: 'Đơn đặt hàng' }).click();
  await expect(P).toHaveURL(/\/admin\/purchasing\?tab=pos$/);
  await P.reload();
  await expect(P.getByRole('tab', { name: 'Đơn đặt hàng' })).toHaveAttribute('aria-selected', 'true');

  await P.getByRole('tab', { name: 'Kiểm kê' }).click();
  await expect(P).toHaveURL(/\/admin\/stock\?tab=stocktakes$/);
  await expect(P.getByRole('tab', { name: 'Kiểm kê' })).toHaveAttribute('aria-selected', 'true');
});

// ---------- TASK-110 (F-090, ADR-051): phân quyền chỉ Cho phép / Không cho phép; quyền theo vai lúc tạo tài khoản; Quyền nâng cao ----------
const CASHIER_CAP = 'Thu tiền, bán mang đi, mở / đóng ca, hoàn tiền, ghi thu chi';
const SERVER_CAP = 'Mở bàn, gọi món tại bàn, chuyển bàn';
const permRow = (dlg, name) => dlg.locator('.perm-row').filter({ has: P.getByRole('switch', { name, exact: true }) });

test('tạo tài khoản: chọn vai trò → hiện ngay "Vai trò này được làm" (đổi theo vị trí / vai trò); trang Quyền nâng cao mỗi việc một công tắc Cho phép / Không cho phép — tắt "Trang Hôm nay", bật "Kho hàng" → Lưu quyền → đúng hai quyền riêng, không hạn (F-090, AC-090-02)', async ({
  request,
}) => {
  await P.goto('/admin/users');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  const dlg = P.getByRole('dialog', { name: 'Thêm tài khoản' });
  const base = dlg.locator('.perm-base li');
  await expect(base).toHaveText([CASHIER_CAP, 'Nhận / làm đơn, hủy hàng, nhận hàng', SERVER_CAP]);
  await expect(dlg.locator('.perm-head')).toHaveText('Vai trò này được làm 3 / 17 việc');
  await dlg.getByRole('checkbox', { name: 'Phục vụ' }).check();
  await expect(base).toHaveText([SERVER_CAP]);
  await dlg.getByLabel('Vai trò').selectOption('MANAGER');
  await expect(dlg.locator('.perm-head')).toHaveText('Vai trò này được làm 6 / 17 việc');
  await expect(base).toContainText(['Kiểm kê, điều chỉnh kho ở quầy', 'Sửa / thêm chấm công của người khác', 'Trang Hôm nay']);
  await expect(dlg.getByRole('switch')).toHaveCount(0); // công tắc nằm ở trang Quyền nâng cao (F-091)
  await expect(dlg.getByRole('link', { name: 'Quyền nâng cao' })).toHaveAttribute('href', '/admin/permissions');
  await dlg.getByLabel('Tên đăng nhập').fill('tc-quyen');
  await dlg.getByLabel('Mật khẩu (tối thiểu 6 ký tự)').fill('Pass@123');
  await dlg.getByLabel('Họ tên').fill('Trưởng ca quyền E2E');
  await dlg.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã tạo tài khoản' })).toBeVisible();
  await expect(P.locator('tr', { hasText: 'tc-quyen' })).not.toContainText('Có quyền nâng cao');

  const id = (await apiAs(request, 'get', '/api/admin/users')).find((u) => u.username === 'tc-quyen').userId;
  await P.goto(`/admin/permissions?user=${id}`);
  await expect(P.locator('.perm-person', { hasText: 'Trưởng ca quyền E2E' })).toHaveAttribute('aria-pressed', 'true');
  await expect(P.locator('#perm-panel-title')).toHaveText('Quyền của Trưởng ca quyền E2E');
  const today = P.getByRole('switch', { name: 'Trang Hôm nay', exact: true });
  await expect(today).toBeChecked();
  await expect(permRow(P, 'Trang Hôm nay')).toContainText('Cho phép');
  await expect(permRow(P, 'Trang Hôm nay')).toContainText('Theo vai trò');
  await today.uncheck();
  await expect(permRow(P, 'Trang Hôm nay')).toContainText('Không cho phép');
  await expect(permRow(P, 'Trang Hôm nay')).toContainText('Bỏ bớt');
  const stockCap = 'Kho hàng (nguyên liệu, nhập kho, kiểm kê, nhà cung cấp, đặt hàng)';
  const stock = P.getByRole('switch', { name: stockCap });
  await expect(stock).not.toBeChecked();
  await stock.check();
  await expect(permRow(P, stockCap)).toContainText('Cấp thêm');
  await expect(P.locator('.perm-diff')).toHaveText(`Cấp thêm: ${stockCap} · Bỏ bớt: Trang Hôm nay`);
  await P.getByRole('button', { name: 'Lưu quyền' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu quyền của Trưởng ca quyền E2E' })).toBeVisible();
  await expect(P.locator('.perm-person', { hasText: 'Trưởng ca quyền E2E' })).toContainText('2 quyền nâng cao');
  const view = await apiAs(request, 'get', `/api/admin/users/${id}/grants`);
  expect(view.items.filter((i) => i.override).map((i) => [i.key, i.override.effect, i.override.expiresAt])).toEqual([
    ['dashboard.view', 'DENY', null],
    ['admin.stock', 'ALLOW', null],
  ]);
  await P.goto('/admin/users');
  await expect(P.locator('tr', { hasText: 'tc-quyen' })).toContainText('Có quyền nâng cao');
});

test('quyền nâng cao: nhãn "Có quyền nâng cao" ở Tài khoản mở trang Quyền nâng cao chọn sẵn người đó — quyền tạm ghi "tạm đến …", lưu mà không chạm vẫn giữ hạn (sửa tài khoản cũng không đụng quyền); "Về như vai trò" → Lưu quyền → hết quyền riêng (F-090, AC-090-03)', async ({
  request,
}) => {
  const u = await apiAs(request, 'post', '/api/admin/users', {
    username: 'tc-sua-quyen',
    password: 'Pass@123',
    fullName: 'Sửa quyền E2E',
    role: 'STAFF',
    positions: ['SERVER'],
  });
  const until = new Date(Math.floor(Date.now() / 1000 + 3 * 3600) * 1000).toISOString(); // CSDL lưu hạn tới giây
  await apiAs(request, 'put', `/api/admin/users/${u.userId}/grants`, { grants: [{ capability: 'pos.cashier', effect: 'ALLOW', expiresAt: until }] });
  const keptExpiry = async () => {
    const view = await apiAs(request, 'get', `/api/admin/users/${u.userId}/grants`);
    const g = view.items.find((i) => i.key === 'pos.cashier').override;
    return g && [g.effect, new Date(g.expiresAt).getTime()];
  };

  // Sửa tài khoản (đổi họ tên) không đụng quyền
  await P.goto('/admin/users');
  const row = P.locator('tr', { hasText: 'tc-sua-quyen' });
  await row.getByRole('button', { name: 'Sửa' }).click();
  const dlg = P.getByRole('dialog', { name: 'Sửa tc-sua-quyen' });
  await expect(dlg.getByRole('link', { name: 'Quyền nâng cao' })).toHaveAttribute('href', `/admin/permissions?user=${u.userId}`);
  await expect(dlg).toContainText('Người này có 1 quyền nâng cao');
  await dlg.getByLabel('Họ tên').fill('Sửa quyền E2E (đổi tên)');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(P.locator('.toast', { hasText: 'Đã lưu' })).toBeVisible();
  expect(await keptExpiry()).toEqual(['ALLOW', new Date(until).getTime()]);

  // Nhãn "Có quyền nâng cao" → trang Quyền nâng cao chọn sẵn người này
  await row.getByRole('link', { name: 'Có quyền nâng cao' }).click();
  await expect(P).toHaveURL(new RegExp(`/admin/permissions\\?user=${u.userId}$`));
  const cash = P.getByRole('switch', { name: CASHIER_CAP });
  await expect(cash).toBeChecked();
  await expect(permRow(P, CASHIER_CAP)).toContainText('Cấp thêm · tạm đến');
  await P.getByRole('button', { name: 'Lưu quyền' }).click(); // không chạm → giữ hạn
  await expect(P.locator('.toast', { hasText: 'Đã lưu quyền của Sửa quyền E2E (đổi tên)' })).toBeVisible();
  expect(await keptExpiry()).toEqual(['ALLOW', new Date(until).getTime()]);

  // "Về như vai trò" → Lưu quyền → không còn quyền riêng
  await P.getByRole('button', { name: 'Về như vai trò' }).click();
  await expect(P.getByRole('switch', { name: CASHIER_CAP })).not.toBeChecked();
  await expect(permRow(P, CASHIER_CAP)).toContainText('Theo vai trò');
  await P.getByRole('button', { name: 'Lưu quyền' }).click();
  await expect(P.locator('.perm-person', { hasText: 'Sửa quyền E2E (đổi tên)' })).not.toContainText('quyền nâng cao');
  expect(await keptExpiry()).toBe(null);
});

// ---------- TASK-112 (F-091, ADR-053): trang Quyền nâng cao riêng + số điện thoại tài khoản ----------
test('số điện thoại tài khoản: + Thêm tài khoản có ô Số điện thoại (không bắt buộc) — số sai báo ngay dưới ô, số đúng hiện ở cột Số điện thoại (bấm gọi được); Sửa đổi số (F-091, AC-091-02)', async ({
  request,
}) => {
  await P.goto('/admin/users');
  await expect(P.locator('thead th').nth(2)).toHaveText('Số điện thoại');
  await P.getByRole('button', { name: '+ Thêm tài khoản' }).click();
  const dlg = P.getByRole('dialog', { name: 'Thêm tài khoản' });
  await dlg.getByLabel('Tên đăng nhập').fill('tc-sdt');
  await dlg.getByLabel('Mật khẩu (tối thiểu 6 ký tự)').fill('Pass@123');
  await dlg.getByLabel('Họ tên').fill('Nhân viên có số E2E');
  const phone = dlg.getByLabel('Số điện thoại (không bắt buộc)');
  await phone.fill('0912 345');
  await dlg.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(dlg.locator('.field-error')).toHaveText('Số điện thoại không hợp lệ — ví dụ 0912 345 678');
  await phone.fill('0912 345 678');
  await dlg.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(P.getByRole('dialog')).toHaveCount(0);
  const row = P.locator('tr', { hasText: 'tc-sdt' });
  await expect(row.getByRole('link', { name: '0912 345 678' })).toHaveAttribute('href', 'tel:0912345678');

  await row.getByRole('button', { name: 'Sửa' }).click();
  const edit = P.getByRole('dialog', { name: 'Sửa tc-sdt' });
  await expect(edit.getByLabel('Số điện thoại (không bắt buộc)')).toHaveValue('0912 345 678');
  await edit.getByLabel('Số điện thoại (không bắt buộc)').fill('+84 987 654 321');
  await edit.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(row.getByRole('link', { name: '0987 654 321' })).toHaveAttribute('href', 'tel:0987654321');
  expect((await apiAs(request, 'get', '/api/admin/users')).find((x) => x.username === 'tc-sdt').phone).toBe('0987654321');
});

test('trang Quyền nâng cao: thanh bên Hệ thống có "Quyền nâng cao" ngay sau "Tài khoản"; danh sách người không có chủ quán; đổi công tắc rồi chọn người khác → hỏi "Bỏ thay đổi chưa lưu?" — Hủy thì ở lại, Bỏ thay đổi thì sang người kia và không lưu gì (F-091, AC-091-03)', async ({
  request,
}) => {
  const mk = (username, fullName) =>
    apiAs(request, 'post', '/api/admin/users', { username, password: 'Pass@123', fullName, role: 'STAFF', positions: ['SERVER'] });
  const a = await mk('tc-qa', 'Người quyền A');
  await mk('tc-qb', 'Người quyền B');
  await P.goto('/admin/permissions?user=' + a.userId);
  const side = P.locator('#side');
  const sys = await side.locator('details', { hasText: 'Hệ thống' }).locator('.nav-items a').allInnerTexts();
  const at = sys.indexOf('Tài khoản');
  expect(sys.slice(at, at + 2)).toEqual(['Tài khoản', 'Quyền nâng cao']);
  await expect(side.locator('a[href="/admin/permissions"]')).toHaveAttribute('aria-current', 'page');
  const people = P.locator('.perm-person');
  await expect(people.filter({ hasText: 'Chủ quán' })).toHaveCount(0);
  await expect(people.filter({ hasText: 'Người quyền A' })).toHaveAttribute('aria-pressed', 'true');

  const today = P.getByRole('switch', { name: 'Trang Hôm nay', exact: true });
  await expect(today).not.toBeChecked();
  await today.check();
  await expect(P.locator('.perm-diff')).toHaveText('Cấp thêm: Trang Hôm nay');
  await people.filter({ hasText: 'Người quyền B' }).click();
  const ask = P.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?' });
  await ask.getByRole('button', { name: 'Hủy' }).click();
  await expect(P.locator('#perm-panel-title')).toHaveText('Quyền của Người quyền A');
  await expect(today).toBeChecked();
  await people.filter({ hasText: 'Người quyền B' }).click();
  await P.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?' }).getByRole('button', { name: 'Bỏ thay đổi' }).click();
  await expect(P.locator('#perm-panel-title')).toHaveText('Quyền của Người quyền B');
  await expect(P).toHaveURL(/\/admin\/permissions\?user=\d+$/);
  const view = await apiAs(request, 'get', '/api/admin/users/' + a.userId + '/grants');
  expect(view.items.filter((i) => i.override)).toEqual([]);
});

// ---------- TASK-113 (F-092, ADR-054): màn chào khi quét QR ----------
test('màn chào khi quét QR: quán bật ở Cài đặt → điện thoại quét QR thấy tên + địa chỉ quán, lời chào theo giờ, "Quán sẽ mang món ra cho bạn tại Bàn W1", ô hội viên, Gọi thanh toán / Gọi nhân viên / Đánh giá, nút lớn "Xem thực đơn – Gọi món"; chưa có món thì Gọi thanh toán nhắc gọi món trước; Gọi nhân viên tới quầy; gọi món xong quay lại màn chào thấy "Đơn của bạn", Gọi thanh toán mở thẳng hộp xác nhận; tắt → quét QR vào thẳng thực đơn (F-092, AC-092-02, AC-092-03)', async ({
  request,
}) => {
  const before = await apiAs(request, 'get', '/api/admin/settings');
  await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true, serveMode: 'TABLE', shopAddress: 'Số 12 Đường Thử, Quận 1' });
  const shift = await apiAs(request, 'get', '/api/shifts/current');
  if (!shift.shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 }); // gửi đơn cần ca đang mở
  const w1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'W1' });
  const w2 = await apiAs(request, 'post', '/api/admin/tables', { code: 'W2' });
  const ctx = await browser.newContext(phoneOpts);
  const ctx2 = await browser.newContext(phoneOpts);
  try {
    const G = await ctx.newPage();
    watch(G, 'man-chao');
    await G.goto('/t/' + w1.qrToken);
    const home = G.locator('.c-home');
    await expect(home.locator('h1')).toHaveText(before.shopName);
    await expect(home.locator('.h-addr')).toHaveText('Số 12 Đường Thử, Quận 1');
    // ADR-070: số điện thoại quán (bài "số điện thoại quán + chữ WIFI…" nhập trước trong chuỗi flow) — dòng riêng dưới địa chỉ, bấm là gọi
    await expect(home.locator('.h-tel a')).toHaveText('0909 123 456');
    await expect(home.locator('.h-tel a')).toHaveAttribute('href', 'tel:0909123456');
    await expect(home.locator('.h-greet')).toHaveText(/^Chào buổi (sáng|trưa|chiều|tối), Quý khách$/);
    await expect(home.locator('.h-table')).toHaveText('Quán sẽ mang món ra cho bạn tại Bàn W1');
    await expect(home.locator('.member-box')).toContainText('Nhập SĐT để nhận ưu đãi');
    await expect(home.locator('.h-tile strong')).toHaveText(['Gọi thanh toán', 'Gọi nhân viên', 'Đánh giá']);
    await expect(G.getByRole('link', { name: 'Xem thực đơn – Gọi món' })).toHaveAttribute('href', '/t/' + w1.qrToken + '/menu');
    await expect(G).toHaveURL(new RegExp('/t/' + w1.qrToken + '$'));

    // Chưa có món: Gọi thanh toán nhắc gọi món trước; Đánh giá giải thích; Gọi nhân viên tới quầy
    await G.locator('#home-pay').click();
    await expect(G.locator('.toast', { hasText: 'Bạn chưa gọi món nào' })).toBeVisible();
    await G.locator('#home-review').click();
    const rv = G.getByRole('dialog', { name: 'Đánh giá món' });
    await expect(rv).toContainText('Sau khi thanh toán');
    await rv.getByRole('button', { name: 'Đã hiểu' }).click();
    await G.locator('#home-staff').click();
    const call = G.getByRole('dialog', { name: 'Gọi nhân viên' });
    await call.getByRole('button', { name: 'Dọn bàn' }).click();
    await call.getByRole('button', { name: 'Gọi nhân viên' }).click();
    await expect(G.locator('.toast', { hasText: 'Đã gọi nhân viên' })).toBeVisible();
    const calls = await apiAs(request, 'get', '/api/staff-calls');
    expect(calls.some((c) => c.table.code === 'W1' && c.message === 'Dọn bàn')).toBe(true);

    // Xem thực đơn → gọi món → quay lại màn chào (tên quán ở đầu thực đơn)
    await G.getByRole('link', { name: 'Xem thực đơn – Gọi món' }).click();
    await expect(G).toHaveURL(/\/menu$/);
    await expect(G.locator('#shop a')).toHaveAttribute('href', '/t/' + w1.qrToken);
    await G.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    await G.goto('/t/' + w1.qrToken); // quét lại QR (hoặc bấm tên quán ở thực đơn) → màn chào
    await expect(G.locator('.h-orders')).toContainText('Đơn của bạn · 1 đơn đã gửi');
    await expect(G.locator('#home-pay')).toContainText('Tạm tính');
    await G.locator('#home-pay').click();
    await expect(G).toHaveURL(/\/track$/);
    const pay = G.getByRole('dialog', { name: 'Gọi thanh toán' });
    await pay.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(G.locator('.toast', { hasText: 'Đã báo quầy' })).toBeVisible();

    // Tắt màn chào → điện thoại khác quét QR vào thẳng thực đơn (như trước F-092)
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false });
    const H = await ctx2.newPage();
    watch(H, 'khong-man-chao');
    await H.goto('/t/' + w2.qrToken);
    await expect(H).toHaveURL(/\/menu$/);
    await expect(H.locator('#shop a')).toHaveCount(0);
  } finally {
    await ctx.close();
    await ctx2.close();
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false, serveMode: before.serveMode, shopAddress: before.shopAddress ?? '' });
    await clearTables(request, ['W1', 'W2']);
  }
});

// ---------- TASK-114 (F-093, ADR-055): màn khách chỉ cho điện thoại ----------
test('màn khách chỉ cho điện thoại: máy tính 1366 px — màn chào, thực đơn, giỏ, theo dõi đơn nằm trong một cột 480 px ở giữa, hai bên nền khác màu, thẻ món một cột, thanh giỏ / bảng giỏ / thanh nút đáy trong cột; điện thoại 390 px — cột đủ bề ngang, không cuộn ngang (F-093, AC-093-01, AC-093-02)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true });
  const shift = await apiAs(request, 'get', '/api/shifts/current');
  if (!shift.shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 }); // gửi đơn cần ca đang mở
  const k1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'K1' });
  const k2 = await apiAs(request, 'post', '/api/admin/tables', { code: 'K2' });
  const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  const phone = await browser.newContext(phoneOpts);
  // Khung của phần tử (px, làm tròn) và kiểm "nằm trọn trong cột" = trong khung của body
  const box = (page, sel) =>
    page
      .locator(sel)
      .first()
      .evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
      });
  const inColumn = async (page, sel) => {
    const col = await box(page, 'body');
    const b = await box(page, sel);
    expect(b.l, sel + ' mép trái').toBeGreaterThanOrEqual(col.l - 1);
    expect(b.r, sel + ' mép phải').toBeLessThanOrEqual(col.r + 1);
  };
  try {
    // Máy tính 1366 px: màn chào là một cột 480 px giữa màn, hai bên nền khác màu
    const W = await desk.newPage();
    watch(W, 'may-tinh');
    await W.goto('/t/' + k1.qrToken);
    await expect(W.locator('.c-home')).toBeVisible();
    const col = await box(W, 'body');
    expect(col.w).toBe(480);
    const vw = await W.evaluate(() => globalThis.document.documentElement.clientWidth);
    expect(Math.abs(col.l - (vw - col.r)), 'cột nằm giữa').toBeLessThanOrEqual(1);
    const [htmlBg, bodyBg] = await W.evaluate(() => [
      globalThis.getComputedStyle(globalThis.document.documentElement).backgroundColor,
      globalThis.getComputedStyle(globalThis.document.body).backgroundColor,
    ]);
    expect(htmlBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(htmlBg).not.toBe(bodyBg);
    await inColumn(W, '.c-home');

    // Thực đơn: đầu trang + thanh nhóm món rộng đúng cột, thẻ món một cột; thanh giỏ, bảng giỏ trong cột
    await W.getByRole('link', { name: 'Xem thực đơn – Gọi món' }).click();
    await expect(W).toHaveURL(/\/menu$/);
    await expect(W.locator('.c-item').nth(1)).toBeVisible();
    expect(await box(W, '.c-header')).toEqual(col);
    expect(await box(W, '#tabs')).toEqual(col);
    const lefts = await W.locator('.c-item').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(lefts, 'mọi thẻ món thẳng một cột').toHaveLength(1);
    await W.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await expect(W.locator('#cartbar')).toBeVisible();
    await inColumn(W, '#cartbar');
    await W.click('#open-cart');
    await expect(W.locator('.sheet')).toBeVisible();
    await inColumn(W, '.sheet');

    // Theo dõi đơn: thanh nút đáy (Gọi thêm món / Gọi thanh toán) trong cột
    await W.locator('.sheet .modal-foot .btn-primary').click();
    await expect(W).toHaveURL(/\/track$/);
    await expect(W.locator('#actions')).toBeVisible();
    await inColumn(W, '#actions');

    // Điện thoại 390 px: cột đủ bề ngang (như trước), thanh giỏ trải hết, không cuộn ngang
    const M = await phone.newPage();
    watch(M, 'dien-thoai');
    await M.goto('/t/' + k2.qrToken);
    await M.getByRole('link', { name: 'Xem thực đơn – Gọi món' }).click();
    await expect(M).toHaveURL(/\/menu$/);
    await M.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await expect(M.locator('#cartbar')).toBeVisible();
    expect(await box(M, 'body')).toEqual({ l: 0, r: 390, w: 390 });
    expect(await box(M, '#cartbar')).toEqual({ l: 0, r: 390, w: 390 });
    expect(await M.evaluate(() => globalThis.document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await desk.close();
    await phone.close();
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false });
    await clearTables(request, ['K1', 'K2']);
  }
});

// ---------- TASK-115 (F-094, ADR-056): giao diện màn khách theo giờ (sáng / tối) và theo mùa ----------
// Đồng hồ giả của Playwright: setFixedTime (giờ cố định, hẹn giờ chạy thật) / install + fastForward (qua mốc 18:00 khi đang mở)
const vnTime = (iso) => new Date(iso + '+07:00');
/** Độ sáng tương đối (WCAG) của màu nền / màu chữ một phần tử: 0 = đen, 1 = trắng. */
const lumOf = (page, sel, prop = 'backgroundColor') =>
  page
    .locator(sel)
    .first()
    .evaluate((e, p) => {
      const color = globalThis.getComputedStyle(e)[p];
      const [r, g, b] = color.match(/[\d.]+/g).map(Number);
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }, prop);

test('giao diện khách theo giờ: 8 giờ sáng có ánh nắng ở khung giới thiệu, 8 giờ tối màn chào / thực đơn / theo dõi đơn chuyển nền tối, đang mở lúc 17:59 tự chuyển tối khi qua 18:00 (lời chào đổi theo), máy bật chế độ tối vẫn theo giờ quán (ban ngày sáng); tắt cài đặt → tối vẫn sáng (F-094, AC-094-02)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true, guestDaypartTheme: true, guestSeasonDecor: true });
  const shift = await apiAs(request, 'get', '/api/shifts/current');
  if (!shift.shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 }); // gửi đơn cần ca đang mở
  const t = {};
  for (const code of ['TG1', 'TG2', 'TG3', 'TG4']) t[code] = await apiAs(request, 'post', '/api/admin/tables', { code });
  const contexts = [];
  const phonePage = async (name, extra = {}) => {
    const ctx = await browser.newContext({ ...phoneOpts, ...extra });
    contexts.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000); // thao tác hỏng thì báo nhanh — finally còn kịp trả cài đặt cho bài sau
    watch(page, name);
    return page;
  };
  try {
    // 8:00 sáng: nền sáng, khung giới thiệu có mặt trời ở góc, lời chào buổi sáng
    const M = await phonePage('sang');
    await M.clock.setFixedTime(vnTime('2026-11-16T08:00:00'));
    await M.goto('/t/' + t.TG1.qrToken);
    await expect(M.locator('.c-home')).toBeVisible();
    await expect(M.locator('html')).toHaveAttribute('data-daypart', 'morning');
    await expect(M.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    expect(await lumOf(M, 'body')).toBeGreaterThan(0.8);
    expect(await M.locator('.h-hero').evaluate((e) => globalThis.getComputedStyle(e, '::before').backgroundImage)).toContain('radial-gradient');
    await expect(M.locator('.h-greet')).toHaveText(/^Chào buổi sáng/);

    // 20:00: màn chào, thực đơn, theo dõi đơn nền tối, chữ sáng
    const N = await phonePage('toi');
    await N.clock.setFixedTime(vnTime('2026-11-16T20:00:00'));
    await N.goto('/t/' + t.TG2.qrToken);
    await expect(N.locator('.c-home')).toBeVisible();
    await expect(N.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(N.locator('html')).toHaveAttribute('data-daypart', 'night');
    expect(await lumOf(N, 'body')).toBeLessThan(0.05);
    expect(await lumOf(N, '.h-tile')).toBeLessThan(0.05);
    expect(await lumOf(N, '.h-shop', 'color')).toBeGreaterThan(0.6);
    await expect(N.locator('.h-greet')).toHaveText(/^Chào buổi tối/);
    await N.getByRole('link', { name: 'Xem thực đơn – Gọi món' }).click();
    await expect(N).toHaveURL(/\/menu$/);
    await expect(N.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await lumOf(N, '.c-item')).toBeLessThan(0.05);
    expect(await lumOf(N, '.c-item-name', 'color')).toBeGreaterThan(0.6);
    expect(await lumOf(N, '.c-header')).toBeLessThan(0.05);
    await N.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await N.click('#open-cart');
    await N.locator('.sheet .modal-foot .btn-primary').click();
    await expect(N).toHaveURL(/\/track$/);
    await expect(N.locator('#actions')).toBeVisible();
    expect(await lumOf(N, 'body')).toBeLessThan(0.05);
    expect(await lumOf(N, '.order-card')).toBeLessThan(0.05);

    // Đang mở lúc 17:59:40 → đồng hồ chạy qua 18:00 → tự tối, không tải lại; lời chào thành buổi tối
    const P = await phonePage('qua-18-gio');
    await P.clock.install({ time: vnTime('2026-11-16T17:59:40') });
    await P.goto('/t/' + t.TG3.qrToken);
    await expect(P.locator('.c-home')).toBeVisible();
    await expect(P.locator('html')).toHaveAttribute('data-daypart', 'day');
    await expect(P.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect(P.locator('.h-greet')).toHaveText(/^Chào buổi chiều/);
    await P.clock.fastForward('01:00'); // trang kiểm 30 giây / lần
    await expect(P.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(P.locator('.h-greet')).toHaveText(/^Chào buổi tối/);
    await expect.poll(() => lumOf(P, 'body')).toBeLessThan(0.05);
    await expect(P).toHaveURL(new RegExp('/t/' + t.TG3.qrToken + '$'));

    // Máy bật chế độ tối lúc 10:00 → vẫn theo giờ quán: buổi sáng, nền sáng (ADR-060 D-240 — máy nào cũng như nhau)
    const Q = await phonePage('che-do-toi', { colorScheme: 'dark' });
    await Q.clock.setFixedTime(vnTime('2026-11-16T10:00:00'));
    await Q.goto('/t/' + t.TG4.qrToken);
    await expect(Q.locator('.c-home')).toBeVisible();
    await expect(Q.locator('html')).toHaveAttribute('data-daypart', 'morning');
    await expect(Q.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    expect(await lumOf(Q, 'body')).toBeGreaterThan(0.8);

    // Tắt "Tự đổi sáng / tối theo giờ" → 20:00 vẫn sáng, không còn data-daypart
    await apiAs(request, 'put', '/api/admin/settings', { guestDaypartTheme: false });
    const shopCall = N.waitForRequest((r) => new URL(r.url()).pathname === '/api/shop');
    await N.goto('/t/' + t.TG2.qrToken);
    // Đọc cài đặt giao diện không kèm cookie (máy này đã có cookie danh tính) — không tranh cookie với lệnh quét QR của khách mới
    expect((await (await shopCall).allHeaders()).cookie, '/api/shop gọi không kèm cookie').toBeUndefined();
    await expect(N.locator('.c-home')).toBeVisible();
    await expect(N.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await expect(N.locator('html')).not.toHaveAttribute('data-daypart');
    await expect.poll(() => lumOf(N, 'body')).toBeGreaterThan(0.8);
    await Q.reload();
    await expect(Q.locator('.c-home')).toBeVisible();
    await expect(Q.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false, guestDaypartTheme: false, guestSeasonDecor: false });
    await clearTables(request, ['TG1', 'TG2', 'TG3', 'TG4']);
  }
});

test('trang trí theo mùa: tháng 2 hoa mai, tháng 5 ly đá, tháng 8 lá vàng, tháng 11 ly nóng ở khung giới thiệu màn chào; nút, giá, thẻ món giữ màu quán; tắt cài đặt → khung giới thiệu như cũ (F-094, AC-094-03)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true, guestDaypartTheme: true, guestSeasonDecor: true });
  const s1 = await apiAs(request, 'post', '/api/admin/tables', { code: 'MU1' });
  const ctx = await browser.newContext(phoneOpts);
  try {
    const S = await ctx.newPage();
    S.setDefaultTimeout(15_000); // thao tác hỏng thì báo nhanh — finally còn kịp trả cài đặt cho bài sau
    watch(S, 'theo-mua');
    const heroes = new Set();
    let cta = null;
    for (const [iso, season, art] of [
      ['2026-02-10T15:00:00', 'spring', 'mai'],
      ['2026-05-10T15:00:00', 'summer', 'cup-soda'],
      ['2026-08-10T15:00:00', 'autumn', 'leaf'],
      ['2026-11-10T15:00:00', 'winter', 'coffee'],
    ]) {
      await S.clock.setFixedTime(vnTime(iso));
      await S.goto('/t/' + s1.qrToken);
      await expect(S.locator('.c-home')).toBeVisible();
      await expect(S.locator('html')).toHaveAttribute('data-season', season);
      await expect(S.locator('.h-hero-art')).toHaveAttribute('data-art', art);
      await expect(S.locator('.h-hero-art .ic-' + art)).toBeVisible();
      await expect(S.locator('.h-hero-decor .ic')).toHaveCount(3);
      await expect(S.locator('.h-hero-decor')).toBeVisible();
      heroes.add(await S.locator('.h-hero').evaluate((e) => globalThis.getComputedStyle(e).backgroundImage));
      // Nút chính giữ màu quán ở mọi mùa (chỉ khung giới thiệu đổi)
      const ctaBg = await S.locator('.h-cta').evaluate((e) => globalThis.getComputedStyle(e).backgroundImage);
      if (cta !== null) expect(ctaBg, 'nút "Xem thực đơn – Gọi món" không đổi theo mùa').toBe(cta);
      cta = ctaBg;
    }
    expect(heroes.size, 'mỗi mùa một màu khung giới thiệu').toBe(4);

    // Tắt "Trang trí theo mùa" → không có data-season, khung giới thiệu là ly cà phê, không hình nhỏ
    await apiAs(request, 'put', '/api/admin/settings', { guestSeasonDecor: false });
    await S.clock.setFixedTime(vnTime('2026-02-10T15:00:00'));
    await S.goto('/t/' + s1.qrToken);
    await expect(S.locator('.c-home')).toBeVisible();
    await expect(S.locator('html')).not.toHaveAttribute('data-season');
    await expect(S.locator('.h-hero-art')).toHaveAttribute('data-art', 'coffee');
    await expect(S.locator('.h-hero-decor')).toBeHidden();
  } finally {
    await ctx.close();
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false, guestDaypartTheme: false, guestSeasonDecor: false });
    await clearTables(request, ['MU1']);
  }
});

// ---------- TASK-116 (F-095, ADR-057): logo quán ----------
// Ảnh png 1×1 thật (trình duyệt vẽ được) — đủ để thấy ảnh ở các màn; không thêm tệp mẫu
const LOGO_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('logo quán: chủ quán chọn ảnh ở Cài đặt → Thông tin quán → xem trước, lưu ngay; logo hiện ở màn chào và đầu thực đơn của khách, thanh bên Quản lý, thanh quầy, phiếu tạm tính, thẻ QR in; Bỏ logo → về biểu tượng ly cà phê (F-095, AC-095-02)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true });
  const shift = await apiAs(request, 'get', '/api/shifts/current');
  if (!shift.shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 }); // gửi đơn cần ca đang mở
  const lg = await apiAs(request, 'post', '/api/admin/tables', { code: 'LG1' });
  const desk = { viewport: { width: 1366, height: 860 }, locale: 'vi-VN' };
  const [ownerCtx, staffCtx, phoneCtx] = await Promise.all([browser.newContext(desk), browser.newContext(desk), browser.newContext(phoneOpts)]);
  const open = async (ctx, name) => {
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000); // thao tác hỏng thì báo nhanh — finally còn kịp dọn logo cho bài sau
    watch(page, name);
    return page;
  };
  try {
    // Chủ quán: Cài đặt → Thông tin quán → chọn ảnh → lưu ngay, xem trước, có "Bỏ logo"
    const O = await open(ownerCtx, 'logo-chu-quan');
    await O.goto('/admin/login');
    await O.fill('#username', 'admin');
    await O.fill('#password', 'Admin@123');
    await O.click('#submit');
    await expect(O).toHaveURL(/\/admin\/today$/);
    await O.goto('/admin/settings');
    await expect(O.locator('.admin-side .brand .brand-mark .ic-coffee')).toBeVisible(); // chưa có logo
    await expect(O.locator('#remove-logo')).toHaveCount(0);
    await O.locator('#shop-logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO_PNG });
    await expect(O.locator('.toast', { hasText: 'Đã cập nhật logo' })).toBeVisible();
    const { logoUrl } = await (await request.get('/api/shop')).json();
    expect(logoUrl).toMatch(/^\/api\/shop\/logo\?v=logo-[0-9a-f]{16}\.png$/);
    await expect(O.locator('.logo-preview img')).toHaveAttribute('src', logoUrl);
    await expect(O.locator('#remove-logo')).toBeVisible();
    await O.reload();
    await expect(O.locator('.admin-side .brand .brand-mark img')).toHaveAttribute('src', logoUrl);
    await O.goto('/admin/tables/print');
    await expect(O.locator('.qr-card').first()).toHaveAttribute('data-logo', logoUrl); // TASK-134: logo vẽ vào ảnh thẻ QR

    // Điện thoại khách: màn chào + đầu thực đơn có logo (ảnh tải được); gửi một đơn để có phiếu tạm tính
    const C = await open(phoneCtx, 'logo-khach');
    await C.goto('/t/' + lg.qrToken);
    await expect(C.locator('.c-home .h-logo')).toHaveAttribute('src', logoUrl);
    await expect.poll(() => C.locator('.c-home .h-logo').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
    await C.getByRole('link', { name: 'Xem thực đơn – Gọi món' }).click();
    await expect(C).toHaveURL(/\/menu$/);
    await expect(C.locator('.c-header .c-logo')).toHaveAttribute('src', logoUrl);
    await C.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await C.click('#open-cart');
    await C.locator('.sheet .modal-foot .btn-primary').click();
    await expect(C).toHaveURL(/\/track$/);

    // Quầy (nhân viên): thanh trên có logo; phiếu tạm tính có logo trên tên quán
    const S = await open(staffCtx, 'logo-quay');
    await S.goto('/pos/login');
    await S.fill('#username', 'staff1');
    await S.fill('#password', 'Staff@123');
    await S.click('#submit');
    await expect(S).toHaveURL(/\/pos$/);
    await expect(S.locator('.pos-top .brand .brand-mark img')).toHaveAttribute('src', logoUrl);
    const sid = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'LG1').sessions[0].sessionId;
    await S.goto('/pos/sessions/' + sid + '/receipt?mode=provisional');
    await expect(S.locator('#receipt .receipt-logo')).toHaveAttribute('src', logoUrl);

    // Bỏ logo (hỏi lại) → về ly cà phê ở trang Quản lý và màn khách
    await O.goto('/admin/settings');
    await O.locator('#remove-logo').click();
    await O.getByRole('dialog', { name: 'Bỏ logo quán?' }).getByRole('button', { name: 'Bỏ logo' }).click();
    await expect(O.locator('.toast', { hasText: 'Đã bỏ logo' })).toBeVisible();
    await expect(O.locator('.logo-preview img')).toHaveCount(0);
    expect((await (await request.get('/api/shop')).json()).logoUrl).toBeNull();
    await O.reload();
    await expect(O.locator('.admin-side .brand .brand-mark .ic-coffee')).toBeVisible();
    await C.goto('/t/' + lg.qrToken);
    await expect(C.locator('.c-home')).toBeVisible();
    await expect(C.locator('.c-home .h-logo')).toHaveCount(0);
  } finally {
    await Promise.all([ownerCtx.close(), staffCtx.close(), phoneCtx.close()]);
    await request.delete('/api/admin/settings/logo', { headers: { Authorization: `Bearer ${adminToken}` } });
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false });
    await clearTables(request, ['LG1']);
  }
});

// ---------- TASK-117 (F-096, ADR-058): thêm tài khoản chủ quán ----------
test('thêm tài khoản chủ quán: Tài khoản → "+ Thêm tài khoản" → vai trò Chủ quán hiện cảnh báo toàn quyền + ô Mật khẩu của bạn; sai mật khẩu báo dưới ô, đúng → tạo xong có nhãn Chủ quán; chủ quán mới đăng nhập trang Quản lý thấy Tài khoản; trang Cảnh báo có tin tạo chủ quán (F-096, AC-096-02)', async ({
  request,
}) => {
  const desk = { viewport: { width: 1366, height: 860 }, locale: 'vi-VN' };
  const [ownerCtx, newCtx] = await Promise.all([browser.newContext(desk), browser.newContext(desk)]);
  const open = async (ctx, name) => {
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000);
    watch(page, name);
    return page;
  };
  const adminLogin = async (page, username, password) => {
    await page.goto('/admin/login');
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.click('#submit');
    await expect(page).toHaveURL(/\/admin\/today$/);
  };
  try {
    const O = await open(ownerCtx, 'them-chu-quan');
    await adminLogin(O, 'admin', 'Admin@123');
    await O.goto('/admin/users');
    await O.getByRole('button', { name: '+ Thêm tài khoản' }).click();
    const dlg = O.getByRole('dialog', { name: 'Thêm tài khoản' });
    await dlg.getByLabel('Tên đăng nhập').fill('chuquan_e2e');
    await dlg.getByLabel('Mật khẩu (tối thiểu 6 ký tự)').fill('Pass@123');
    await dlg.getByLabel('Họ tên').fill('Chủ quán E2E');
    await expect(dlg.locator('.owner-confirm')).toBeHidden(); // nhân viên: không cần xác nhận
    await dlg.getByLabel('Vai trò').selectOption('ADMIN');
    await expect(dlg.locator('.owner-confirm')).toBeVisible();
    await expect(dlg.locator('.owner-confirm')).toContainText('Chủ quán có toàn quyền như bạn');
    await dlg.getByLabel('Mật khẩu của bạn (để xác nhận)').fill('sai-mat-khau');
    await dlg.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(dlg.locator('.field-error')).toHaveText('Mật khẩu của bạn không đúng');
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('Mật khẩu của bạn (để xác nhận)').fill('Admin@123');
    await dlg.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(O.locator('.toast', { hasText: 'Đã tạo tài khoản Chủ quán' })).toBeVisible();
    await expect(O.locator('tr', { hasText: 'chuquan_e2e' }).locator('.badge', { hasText: 'Chủ quán' })).toBeVisible();

    // Chủ quán mới đăng nhập trang Quản lý → Hôm nay, mở được Tài khoản
    const N = await open(newCtx, 'chu-quan-moi');
    await adminLogin(N, 'chuquan_e2e', 'Pass@123');
    await N.goto('/admin/users');
    await expect(N.getByRole('button', { name: '+ Thêm tài khoản' })).toBeVisible();

    // Trang Cảnh báo của chủ quán có tin tạo tài khoản Chủ quán
    await O.goto('/admin/alerts');
    await expect(O.locator('.alert-card', { hasText: 'tạo tài khoản Chủ quán (toàn quyền) cho Chủ quán E2E' })).toBeVisible();
  } finally {
    await Promise.all([ownerCtx.close(), newCtx.close()]);
    const u = (await apiAs(request, 'get', '/api/admin/users')).find((x) => x.username === 'chuquan_e2e');
    if (u) await apiAs(request, 'patch', '/api/admin/users/' + u.userId + '/active', { isActive: false }); // không để chủ quán thử hoạt động
  }
});

// ---------- TASK-118 (F-097, ADR-059): quét QR bàn có nhóm → tự vào nhóm của bàn ----------
test('vào nhóm của bàn: bàn có nhóm → điện thoại khác quét QR tự vào nhóm (không hỏi Gộp chung / Tạo đơn cá nhân), thấy món cả nhóm, thấy thẻ "Bàn … đang có khách — Bạn đi chung hay đi riêng?"; bàn có 2 nhóm → hỏi "Bạn đi cùng nhóm nào?"; điện thoại có nhóm ở bàn khác chọn "Gọi món ở Bàn" → vào nhóm của bàn mới, nhóm cũ giữ nguyên; màn chào "Trả riêng từng người?" mở hộp Chia bill (F-097, AC-097-01…04)', async ({
  request,
}) => {
  const shift = await apiAs(request, 'get', '/api/shifts/current');
  if (!shift.shift) await apiAs(request, 'post', '/api/shifts/open', { openingCash: 0 }); // gửi đơn cần ca đang mở
  const t = {};
  for (const code of ['NB1', 'NB2', 'NB3']) t[code] = await apiAs(request, 'post', '/api/admin/tables', { code });
  const contexts = [];
  const phonePage = async (name) => {
    const ctx = await browser.newContext(phoneOpts);
    contexts.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000); // thao tác hỏng thì báo nhanh — finally còn kịp dọn
    watch(page, name);
    return page;
  };
  const groupsOf = async (code) => (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === code).sessions;
  const orderWater = async (page) => {
    await page.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).first().locator('.add-btn').click();
    await page.click('#open-cart');
    await page.locator('.sheet .modal-foot .btn-primary').click();
    await expect(page).toHaveURL(/\/track$/);
  };
  try {
    // AC-097-01: P1 mở nhóm ở NB1 + gọi món; P2 quét → tự vào nhóm (một hóa đơn), không có nút Tạo đơn cá nhân, thấy món của P1
    const P1 = await phonePage('nhom-p1');
    await P1.goto('/t/' + t.NB1.qrToken);
    await expect(P1).toHaveURL(/\/menu$/);
    await orderWater(P1);
    const P2 = await phonePage('nhom-p2');
    await P2.goto('/t/' + t.NB1.qrToken);
    await expect(P2).toHaveURL(/\/menu$/);
    await expect(P2.locator('.together-card')).toContainText('Bàn NB1 đang có khách'); // TASK-128: thẻ "Bạn đi chung hay đi riêng?"
    await expect(P2.getByText('Tạo đơn cá nhân')).toHaveCount(0);
    await P2.goto('/t/' + t.NB1.qrToken + '/track');
    await expect(P2.locator('.order-card', { hasText: 'Nước suối' })).toHaveCount(1);
    expect(await groupsOf('NB1')).toHaveLength(1);

    // AC-097-02: NB2 có 2 nhóm (quầy / API mở) → điện thoại mới hỏi đi cùng nhóm nào, không có Tạo đơn cá nhân; chọn → vào nhóm đó
    for (const name of ['nhom-x1', 'nhom-x2']) {
      const X = await phonePage(name);
      await X.goto('/');
      await X.evaluate(
        (qr) => globalThis.fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qrToken: qr }) }),
        t.NB2.qrToken,
      );
    }
    expect(await groupsOf('NB2')).toHaveLength(2);
    const P3 = await phonePage('nhom-p3');
    await P3.goto('/t/' + t.NB2.qrToken);
    await expect(P3.getByText('Bàn đang có 2 nhóm. Bạn đi cùng nhóm nào?')).toBeVisible();
    await expect(P3.getByRole('button', { name: /Vào nhóm này/ })).toHaveCount(2);
    await expect(P3.getByText('Tạo đơn cá nhân')).toHaveCount(0);
    await P3.getByRole('button', { name: /Vào nhóm này/ })
      .first()
      .click();
    await expect(P3).toHaveURL(/\/menu$/);
    expect(await groupsOf('NB2')).toHaveLength(2); // không mở thêm nhóm

    // AC-097-03: P1 (có nhóm ở NB1, đã gửi món) quét NB3 đang có nhóm → "Gọi món ở Bàn NB3" → vào nhóm của NB3, nhóm NB1 giữ nguyên
    const P4 = await phonePage('nhom-p4');
    await P4.goto('/t/' + t.NB3.qrToken);
    await expect(P4).toHaveURL(/\/menu$/);
    await P1.goto('/t/' + t.NB3.qrToken);
    await expect(P1.locator('.c-hero p')).toContainText('Bạn đã chuyển sang Bàn NB3?');
    await P1.getByRole('button', { name: /Gọi món ở Bàn NB3/ }).click();
    await expect(P1).toHaveURL(/\/menu$/);
    await expect(P1.locator('#table')).toHaveText('Bàn NB3');
    expect(await groupsOf('NB3')).toHaveLength(1);
    expect(await groupsOf('NB1')).toHaveLength(1);

    // AC-097-04: màn chào bật — nhóm đã có món → "Trả riêng từng người? Chia bill theo người" mở thẳng hộp Chia bill ở Theo dõi đơn
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: true });
    await P2.goto('/t/' + t.NB1.qrToken);
    await expect(P2.locator('.c-home')).toBeVisible();
    await P2.getByRole('link', { name: /Trả riêng từng người\? Chia bill theo người/ }).click();
    await expect(P2).toHaveURL(/\/track$/);
    await expect(P2.getByRole('dialog', { name: 'Chia bill theo người' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await apiAs(request, 'put', '/api/admin/settings', { guestWelcome: false });
    await clearTables(request, ['NB1', 'NB2', 'NB3']);
  }
});

test('chuyển khoản bằng mã QR: khách gọi thanh toán chọn "Chuyển khoản" → điện thoại hiện mã VietQR đúng số tiền + nội dung; quầy thấy "chuyển khoản" ở dải Gọi thanh toán, hộp Thu tiền chọn sẵn và hiện mã; "Đã nhận chuyển khoản" → điện thoại khách sang màn cảm ơn (F-099, AC-099-05)', async ({
  request,
}) => {
  await ensureShift(request);
  // Giữ nguyên bố cục quầy của bài trước (dải Gọi thanh toán có ở cả hai bố cục); trả cài đặt về như cũ khi xong
  const before = await apiAs(request, 'get', '/api/admin/settings');
  await apiAs(request, 'put', '/api/admin/settings', {
    guestWelcome: false,
    transferEnabled: true,
    guestTransferQr: true, // ADR-069: bài này thử mã trên điện thoại khách (mặc định tắt)
    bankBin: '970403',
    bankNumber: '060123456789',
    bankKind: 'ACCOUNT',
    bankHolder: 'NGUYEN VAN A',
  });
  const tb = await apiAs(request, 'post', '/api/admin/tables', { code: 'QR1', name: 'Bàn QR1' });
  const phone = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'chuyen-khoan');
    await G.goto(`/t/${tb.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const order = (await apiAs(request, 'get', '/api/orders')).find((o) => o.table?.name === 'Bàn QR1' && o.status === 'PENDING');
    expect(order, 'đơn của Bàn QR1').toBeTruthy();
    await apiAs(request, 'post', `/api/orders/${order.orderId}/accept`);

    // Khách gọi thanh toán → chọn "Chuyển khoản (quét QR)" → mã VietQR có sẵn số tiền + nội dung của bàn
    await G.locator('#pay').click();
    await G.getByRole('dialog', { name: 'Gọi thanh toán' }).getByRole('button', { name: 'Chuyển khoản (quét QR)' }).click();
    const qr = G.getByRole('dialog', { name: 'Chuyển khoản' });
    await expect(qr.locator('.tq-img')).toBeVisible();
    await expect(qr.locator('.tq-amount')).toContainText('đ');
    await expect(qr).toContainText('Sacombank');
    await expect(qr).toContainText('NGUYEN VAN A');
    await expect(qr).toContainText('CF QR1');
    await expect(qr.getByRole('link', { name: 'Lưu ảnh mã QR' })).toHaveAttribute('download', /VietQR-QR1/);
    await qr.locator('.modal-foot').getByRole('button', { name: 'Đóng' }).click();
    await expect(G.locator('#pay-status')).toContainText('chuyển khoản');
    await expect(G.locator('#show-transfer')).toBeVisible();

    // Quầy: dải Gọi thanh toán ghi "Chuyển khoản" → hộp Thu tiền chọn sẵn + hiện mã → "Đã nhận chuyển khoản"
    const S = await counterLogin(quay, 'chuyen-khoan-quay');
    const card = S.locator('#pay-strip .pay-card', { hasText: 'Bàn QR1' });
    await expect(card).toContainText('Chuyển khoản');
    await card.click();
    const bill = S.locator('.drawer');
    await expect(bill.getByRole('button', { name: 'Chuyển khoản', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(bill.locator('#settle-qr img')).toBeVisible();
    await expect(bill.locator('#settle-qr')).toContainText('CF QR1');
    const pay = bill.locator('.modal-foot .btn-success');
    await expect(pay).toHaveText('Đã nhận chuyển khoản & In bill');
    await expect(pay).toBeEnabled();
    await pay.click();

    // Điện thoại khách sang màn cảm ơn (đã trả do nhân viên ghi)
    await expect(G.locator('.thanks')).toContainText('Đã thanh toán');
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', {
      transferEnabled: before.transferEnabled,
      guestTransferQr: before.guestTransferQr,
      guestWelcome: before.guestWelcome,
    });
    await phone.close();
    await quay.close();
    await clearTables(request, ['QR1']);
  }
});

test('tự xác nhận chuyển khoản: chủ quán bật tự xác nhận, khách gọi thanh toán chuyển khoản → giả lập tiền vào đúng số tiền → quầy báo "đã chuyển khoản", bàn rời dải Gọi thanh toán, điện thoại khách sang màn cảm ơn; khách chuyển lần hai → dải "Tiền vào chưa khớp" ở quầy, thu ngân "Đã xử lý" (F-100, AC-100-06)', async ({
  request,
}) => {
  await ensureShift(request);
  const before = await apiAs(request, 'get', '/api/admin/settings');
  await apiAs(request, 'put', '/api/admin/settings', {
    guestWelcome: false,
    transferEnabled: true,
    bankBin: '970403',
    bankNumber: '060123456789',
    bankKind: 'ACCOUNT',
    bankHolder: 'NGUYEN VAN A',
    autoConfirm: true,
    guestTransferQr: true, // ADR-069: khách đọc nội dung dưới mã trên điện thoại (mặc định tắt)
  });
  const tb = await apiAs(request, 'post', '/api/admin/tables', { code: 'SP1', name: 'Bàn SP1' });
  const phone = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'tu-xac-nhan');
    await G.goto(`/t/${tb.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const order = (await apiAs(request, 'get', '/api/orders')).find((o) => o.table?.name === 'Bàn SP1' && o.status === 'PENDING');
    expect(order, 'đơn của Bàn SP1').toBeTruthy();
    await apiAs(request, 'post', `/api/orders/${order.orderId}/accept`);

    // Khách gọi thanh toán → "Chuyển khoản (quét QR)" → đọc số tiền + nội dung dưới mã (như khách chép vào app ngân hàng)
    await G.locator('#pay').click();
    await G.getByRole('dialog', { name: 'Gọi thanh toán' }).getByRole('button', { name: 'Chuyển khoản (quét QR)' }).click();
    const qr = G.getByRole('dialog', { name: 'Chuyển khoản' });
    await expect(qr.locator('.tq-img')).toBeVisible();
    const content = (await qr.locator('.tq-row', { hasText: 'Nội dung' }).locator('.tq-value').innerText()).trim();
    const amount = Number((await qr.locator('.tq-row', { hasText: 'Số tiền' }).locator('.tq-value').innerText()).replace(/\D/g, ''));
    expect(content).toMatch(/^CF SP1 [0-9A-F]{6}$/);
    await qr.locator('.modal-foot').getByRole('button', { name: 'Đóng' }).click();

    const S = await counterLogin(quay, 'tu-xac-nhan-quay');
    await expect(S.locator('#pay-strip .pay-card', { hasText: 'Bàn SP1' })).toBeVisible();

    // Tiền vào đúng số tiền + nội dung (ngân hàng thêm tiền tố) → máy tự thu: quầy báo, bàn rời dải, điện thoại khách cảm ơn
    await apiAs(request, 'post', '/api/admin/bank-feed/simulate', { amount, content: `IBFT ${content}` });
    await expect(S.locator('.toast', { hasText: 'Bàn SP1 đã chuyển khoản' })).toBeVisible();
    await expect(S.locator('#pay-strip .pay-card', { hasText: 'Bàn SP1' })).toHaveCount(0);
    await expect(G.locator('.thanks')).toContainText('Đã thanh toán');

    // Khách chuyển lần hai → quầy thấy "Tiền vào chưa khớp" → thu ngân chọn "Đã trả lại khách" → "Đã xử lý"
    await apiAs(request, 'post', '/api/admin/bank-feed/simulate', { amount, content });
    const strip = S.locator('#bank-strip');
    await expect(strip).toBeVisible();
    await strip.locator('.bank-card', { hasText: 'đã thanh toán' }).click();
    const dlg = S.getByRole('dialog', { name: /^Tiền vào/ });
    await expect(dlg).toContainText(content);
    await dlg.getByRole('button', { name: 'Đã trả lại khách' }).click();
    await dlg.getByRole('button', { name: 'Đã xử lý', exact: true }).click();
    await expect(S.locator('.toast', { hasText: 'Đã đánh dấu đã xử lý' })).toBeVisible();
    await expect(strip).toBeHidden();
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', {
      autoConfirm: before.autoConfirm,
      transferEnabled: before.transferEnabled,
      guestTransferQr: before.guestTransferQr,
      guestWelcome: before.guestWelcome,
    });
    await phone.close();
    await quay.close();
    await clearTables(request, ['SP1']);
  }
});

test('in bill có mã QR: hộp Thu tiền chọn "Chuyển khoản" → khung mã ghi số tiền, ngân hàng · số, nội dung mỗi thứ một dòng (không dính chữ); "In bill có mã QR" → in phiếu tạm tính có mã VietQR đúng số tiền của hộp (F-099, AC-099-07, DEF-032)', async ({
  request,
}) => {
  await ensureShift(request);
  const before = await apiAs(request, 'get', '/api/admin/settings');
  await apiAs(request, 'put', '/api/admin/settings', {
    transferEnabled: true,
    bankBin: '970403',
    bankNumber: '060123456789',
    bankKind: 'ACCOUNT',
    bankHolder: 'NGUYEN VAN A',
  });
  const tb = await apiAs(request, 'post', '/api/admin/tables', { code: 'QR2', name: 'Bàn QR2' });
  const water = (await apiAs(request, 'get', '/api/admin/menu-items')).find((m) => m.name === 'Nước suối').menuItemId;
  const sessionId = await guestOrderAccepted(request, tb.qrToken, [{ menuItemId: water, quantity: 2 }]);
  const quay = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const S = await counterLogin(quay, 'in-bill-qr');
    await S.goto(`/pos?settle=${sessionId}`);
    const bill = S.locator('.drawer');
    await bill.getByRole('button', { name: 'Chuyển khoản', exact: true }).click();
    const box = bill.locator('#settle-qr');
    await expect(box.locator('img')).toBeVisible();
    const side = box.locator('.tq-side');
    await expect(side.locator(':scope > strong')).toHaveText(/^Khách quét mã — [\d.]+đ$/);
    await expect(side.locator(':scope > div').nth(0)).toHaveText('Sacombank · 060123456789');
    await expect(side.locator(':scope > div').nth(1)).toHaveText(/^Nội dung: CF QR2 [0-9A-F]{6}$/);
    // DEF-032: mỗi thứ một dòng — dòng sau nằm dưới dòng trước (trước đây "29.000đSacombank…" dính liền một dòng)
    const tops = await side.locator(':scope > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(
      tops.every((t, i) => i === 0 || t > tops[i - 1]),
      `vị trí các dòng: ${tops.join(', ')}`,
    ).toBeTruthy();

    const shown = Number((await side.locator(':scope > strong').innerText()).replace(/\D/g, ''));
    const printed = S.waitForResponse((r) => r.url().includes(`/api/sessions/${sessionId}/receipt?mode=provisional`));
    await box.getByRole('button', { name: 'In bill có mã QR' }).click();
    const data = await (await printed).json();
    expect(data.transfer?.qr).toMatch(/^data:image\/png;base64,/);
    expect([data.transfer.amount, data.amountDue]).toEqual([shown, shown]);
    expect(data.transfer.content).toMatch(/^CF QR2 [0-9A-F]{6}$/);
    await expect(S.locator('iframe[src*="mode=provisional"]')).toHaveCount(1);
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', { transferEnabled: before.transferEnabled });
    await quay.close();
    await clearTables(request, ['QR2']);
  }
});

// ---------- TASK-133 (ADR-069): chuyển khoản qua nhân viên — điện thoại khách không hiện mã ----------
test('chuyển khoản qua nhân viên (mặc định): khách gọi thanh toán chọn "Chuyển khoản" → điện thoại báo nhân viên sẽ mang bill có mã QR, không có mã / nút xem mã, nhắc chỉ chuyển theo mã trên bill nhân viên đưa; dải Gọi thanh toán ở quầy có "In bill" → in bill có mã QR + "Chủ tài khoản"; thẻ bàn in ra ghi "Mã này chỉ để gọi món, không dùng để trả tiền" (TASK-133, ADR-069, AC-099-09)', async ({
  request,
}) => {
  await ensureShift(request);
  const before = await apiAs(request, 'get', '/api/admin/settings');
  await apiAs(request, 'put', '/api/admin/settings', {
    guestWelcome: false,
    transferEnabled: true,
    guestTransferQr: false,
    bankBin: '970403',
    bankNumber: '060123456789',
    bankKind: 'ACCOUNT',
    bankHolder: 'NGUYEN VAN A',
  });
  const tb = await apiAs(request, 'post', '/api/admin/tables', { code: 'NV1', name: 'Bàn NV1' });
  const phone = await browser.newContext(phoneOpts);
  const quay = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'vi-VN' });
  try {
    const G = await phone.newPage();
    watch(G, 'chuyen-khoan-nhan-vien');
    await G.goto(`/t/${tb.qrToken}`);
    await expect(G).toHaveURL(/\/menu$/);
    await G.locator('.c-section.cat .c-item')
      .filter({ has: G.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
    await G.click('#open-cart');
    await G.locator('.sheet .modal-foot .btn-primary').click();
    await expect(G).toHaveURL(/\/track$/);
    const order = (await apiAs(request, 'get', '/api/orders')).find((o) => o.table?.name === 'Bàn NV1' && o.status === 'PENDING');
    expect(order, 'đơn của Bàn NV1').toBeTruthy();
    await apiAs(request, 'post', `/api/orders/${order.orderId}/accept`);

    // Khách: chọn "Chuyển khoản" → không có mã trên điện thoại, nhân viên mang bill có mã tới bàn
    await G.locator('#pay').click();
    const ask = G.getByRole('dialog', { name: 'Gọi thanh toán' });
    await expect(ask).toContainText('Chuyển khoản: nhân viên mang bill có mã QR tới bàn để bạn quét.');
    await ask.getByRole('button', { name: 'Chuyển khoản', exact: true }).click();
    await expect(G.locator('.toast', { hasText: 'Nhân viên sẽ mang bill có mã QR chuyển khoản tới bàn' })).toBeVisible();
    await expect(G.locator('#pay-status')).toContainText('nhân viên sẽ mang bill có mã QR chuyển khoản tới bàn');
    await expect(G.locator('#pay-status .pay-safe')).toHaveText(
      'Quán chỉ nhận chuyển khoản theo mã QR trên bill do nhân viên đưa — không chuyển theo trang nào khác.',
    );
    await expect(G.locator('#show-transfer')).toHaveCount(0);
    await expect(G.getByRole('dialog')).toHaveCount(0);

    // Quầy: dải Gọi thanh toán → "In bill Bàn NV1" → bill tạm tính in sẵn mã QR + "Chủ tài khoản"
    const sid = (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'NV1').sessions[0].sessionId;
    const S = await counterLogin(quay, 'in-bill-nhan-vien');
    const printed = S.waitForResponse((r) => r.url().includes(`/api/sessions/${sid}/receipt?mode=provisional`));
    await S.getByRole('button', { name: 'In bill Bàn NV1' }).click();
    const data = await (await printed).json();
    expect(data.transfer?.qr).toMatch(/^data:image\/png;base64,/);
    expect([data.transfer.amount, data.transfer.holder]).toEqual([data.amountDue, 'NGUYEN VAN A']);
    const bill = S.frameLocator('iframe[src*="mode=provisional"]').locator('#receipt');
    await expect(bill).toContainText('Chủ tài khoản: NGUYEN VAN A');
    await expect(bill).toContainText('Kiểm tên người nhận trong app ngân hàng');

    // Thẻ bàn in ra: mã bàn không dùng để trả tiền
    await P.goto('/admin/tables/print');
    // TASK-134 vẽ thẻ lần lượt từng bàn — chờ vẽ xong mọi thẻ (Bàn NV1 nằm cuối danh sách, CSDL test lúc này đã nhiều bàn)
    await expect(P.getByRole('button', { name: 'Tải tất cả ảnh' })).toBeEnabled({ timeout: 30_000 });
    await expect(P.locator('.qr-card', { hasText: 'Bàn NV1' }).locator('.qr-safe')).toHaveText(
      'Mã này chỉ để gọi món, không dùng để trả tiền. Chuyển khoản theo mã QR trên bill nhân viên đưa.',
    );
  } finally {
    await apiAs(request, 'put', '/api/admin/settings', {
      transferEnabled: before.transferEnabled,
      guestTransferQr: before.guestTransferQr,
      guestWelcome: before.guestWelcome,
    });
    await phone.close();
    await quay.close();
    await clearTables(request, ['NV1']);
  }
});

test('hộp Nhận hàng (DEF-033): mỗi dòng có tên + "đặt … · đã nhận …" cùng đơn vị gói, các ô có nhãn (Số nhận, Giá / gói, Hạn sử dụng với nguyên liệu theo lô), không ô nào tràn ra ngoài hộp — trang quản lý và máy quầy', async ({
  request,
}) => {
  const ing = await apiAs(request, 'post', '/api/admin/ingredients', { name: 'Sữa thử nhận hàng', unit: 'ml', stockQty: 0, lowStockThreshold: 0 });
  await apiAs(request, 'put', `/api/admin/ingredients/${ing.ingredientId}/advanced`, { kind: 'RAW', shelfLifeHours: null, wastePercent: 0, trackLots: true });
  const sup = await apiAs(request, 'post', '/api/admin/suppliers', {
    name: 'NCC thử nhận hàng',
    items: [{ ingredientId: ing.ingredientId, packUnitCode: 'l', isPreferred: true, lastPrice: 30000 }],
  });
  const po = await apiAs(request, 'post', '/api/admin/purchase-orders', {
    supplierId: sup.supplierId,
    lines: [{ ingredientId: ing.ingredientId, orderedPacks: 6 }],
  });
  await apiAs(request, 'post', `/api/admin/purchase-orders/${po.poId}/send`);
  // Mọi ô nhập nằm trong hộp (trước: ô ngày tràn ra ngoài, tên bị ép một chữ mỗi dòng)
  const checkDialog = async (dlg) => {
    await expect(dlg.locator('.recv-head')).toContainText('đặt 6 l · đã nhận 0 l');
    await expect(dlg.getByLabel('Số nhận (l)')).toHaveValue('6');
    await expect(dlg.getByLabel('Giá / l (đ)')).toBeVisible();
    await expect(dlg.getByLabel('Hạn sử dụng')).toBeVisible();
    const out = await dlg.evaluate((box) => {
      const b = box.getBoundingClientRect();
      return [...box.querySelectorAll('input')].map((i) => i.getBoundingClientRect()).filter((r) => r.left < b.left - 1 || r.right > b.right + 1).length;
    });
    expect(out, 'ô nhập tràn ra ngoài hộp').toBe(0);
    const nameH = await dlg.locator('.recv-head strong').evaluate((n) => n.getBoundingClientRect().height);
    expect(nameH, 'tên nguyên liệu một dòng').toBeLessThan(30);
  };
  const ql = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
  const quay = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'vi-VN' });
  try {
    const A = await ql.newPage();
    watch(A, 'nhan-hang-ql');
    await A.goto('/admin/login');
    await A.fill('#username', 'admin');
    await A.fill('#password', 'Admin@123');
    await A.click('#submit');
    await expect(A).toHaveURL(/\/admin\/today$/);
    await A.goto('/admin/purchasing');
    await A.locator('.tabs button', { hasText: 'Đơn đặt hàng' }).click();
    await A.locator('tr', { hasText: 'NCC thử nhận hàng' }).getByRole('button', { name: 'Xem' }).click();
    await A.getByRole('dialog')
      .getByRole('button', { name: /Nhận hàng/ })
      .click();
    await checkDialog(A.getByRole('dialog', { name: /^Nhận hàng — đơn/ }));

    const S = await counterLogin(quay, 'nhan-hang-quay');
    await S.goto('/pos/stock');
    await S.locator('#tabs button', { hasText: 'Nhận hàng' }).click();
    await S.locator('.card', { hasText: 'NCC thử nhận hàng' }).getByRole('button', { name: 'Nhận hàng' }).click();
    const dlg = S.getByRole('dialog', { name: /^Nhận hàng — đơn/ });
    await checkDialog(dlg);
    await dlg.getByRole('button', { name: 'Hủy' }).click();
  } finally {
    await Promise.all([ql.close(), quay.close()]);
    await apiAs(request, 'post', `/api/admin/purchase-orders/${po.poId}/cancel`);
  }
});

test('đi chung / đi riêng: bàn có nhóm → điện thoại khác quét QR tự vào nhóm, thấy thẻ "Bàn NR1 đang có khách — Bạn đi chung hay đi riêng?" với hai nút lớn; gọi món luôn (không chọn) = đi chung, thẻ mất; "Đi chung" → thẻ mất, báo đi chung; "Đi riêng" → nhóm riêng (bàn có 2 nhóm), món đang chọn giữ nguyên, gửi món chỉ thấy món của mình; bàn 2 nhóm → màn chọn nhóm có nút "Đi riêng" (ADR-065, TASK-128, AC-097-07)', async ({
  request,
}) => {
  await ensureShift(request);
  const tb = await apiAs(request, 'post', '/api/admin/tables', { code: 'NR1' });
  const contexts = [];
  const phonePage = async (name) => {
    const ctx = await browser.newContext(phoneOpts);
    contexts.push(ctx);
    const page = await ctx.newPage();
    page.setDefaultTimeout(15_000); // hỏng thì báo nhanh — finally còn kịp dọn
    watch(page, name);
    return page;
  };
  const addWater = (page) =>
    page
      .locator('.c-section.cat .c-item')
      .filter({ has: page.getByRole('button', { name: 'Nước suối', exact: true }) })
      .locator('.add-btn')
      .click();
  const send = async (page) => {
    await page.click('#open-cart');
    await page.locator('.sheet .modal-foot .btn-primary').click();
    await expect(page).toHaveURL(/\/track$/);
  };
  const groups = async () => (await apiAs(request, 'get', '/api/tables')).find((x) => x.code === 'NR1').sessions;
  try {
    // Nhóm bạn bè mở bàn + gọi món
    const P1 = await phonePage('rieng-p1');
    await P1.goto('/t/' + tb.qrToken);
    await expect(P1).toHaveURL(/\/menu$/);
    await addWater(P1);
    await send(P1);

    // Bạn trong nhóm, không chọn gì mà gọi món luôn = đi chung → thẻ mất
    const P3 = await phonePage('rieng-p3');
    await P3.goto('/t/' + tb.qrToken);
    await expect(P3).toHaveURL(/\/menu$/);
    const card3 = P3.locator('.together-card');
    await expect(card3).toContainText('Bàn NR1 đang có khách');
    await expect(card3).toContainText('Bạn đi chung hay đi riêng?');
    await expect(card3.getByRole('button')).toHaveCount(2);
    await addWater(P3);
    await send(P3);
    await P3.goto('/t/' + tb.qrToken + '/menu');
    await expect(P3.locator('.c-item').first()).toBeVisible();
    await expect(P3.locator('.together-card')).toHaveCount(0);

    // Bạn khác bấm "Đi chung" → thẻ mất, báo đi chung (vẫn một nhóm)
    const P5 = await phonePage('rieng-p5');
    await P5.goto('/t/' + tb.qrToken);
    await expect(P5).toHaveURL(/\/menu$/);
    await P5.locator('.together-card')
      .getByRole('button', { name: /^Đi chung/ })
      .click();
    await expect(P5.locator('.toast', { hasText: 'Bạn đi chung với nhóm ở Bàn NR1' })).toBeVisible();
    await expect(P5.locator('.together-card')).toHaveCount(0);
    expect(await groups()).toHaveLength(1);

    // Khách lạ ngồi ghép bàn: chọn món rồi bấm "Đi riêng" → hóa đơn riêng, giỏ đi theo
    const P2 = await phonePage('rieng-p2');
    await P2.goto('/t/' + tb.qrToken);
    await expect(P2).toHaveURL(/\/menu$/);
    const card2 = P2.locator('.together-card');
    await expect(card2).toContainText('Bàn NR1 đang có khách');
    await addWater(P2);
    await card2.getByRole('button', { name: /^Đi riêng/ }).click();
    await expect(P2.locator('.toast', { hasText: 'Bạn đã có hóa đơn riêng' })).toBeVisible();
    await expect(P2.locator('.together-card')).toHaveCount(0);
    expect(await groups()).toHaveLength(2);
    await send(P2); // giỏ (1 Nước suối) đi theo sang nhóm riêng
    await expect(P2.locator('.order-card')).toHaveCount(1); // chỉ món của mình — không thấy 2 đơn của nhóm kia

    // Bàn đã có 2 nhóm → điện thoại mới thấy màn chọn nhóm, cuối màn có "Đi riêng — hóa đơn riêng"; tự chọn nhóm thì không hỏi lại
    const P4 = await phonePage('rieng-p4');
    await P4.goto('/t/' + tb.qrToken);
    await expect(P4.getByRole('button', { name: /Vào nhóm này/ })).toHaveCount(2);
    await expect(P4.getByRole('button', { name: 'Đi riêng — hóa đơn riêng' })).toBeVisible();
    await P4.getByRole('button', { name: /Vào nhóm này/ })
      .first()
      .click();
    await expect(P4).toHaveURL(/\/menu$/);
    await expect(P4.locator('.c-item').first()).toBeVisible();
    await expect(P4.locator('.together-card')).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await clearTables(request, ['NR1']);
  }
});
