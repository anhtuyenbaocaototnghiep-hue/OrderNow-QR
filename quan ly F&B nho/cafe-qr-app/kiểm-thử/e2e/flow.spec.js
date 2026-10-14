// E2E trên Chromium thật: điện thoại khách (390px) + máy quầy (1366px) + quản lý, DB test sạch (kịch-bản/e2e-server.js).
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let browser, pos, P, phoneA, A, phoneB, B, phoneC, C, adminToken, tables;
const phoneOpts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'vi-VN' };
const errors = [];
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && errors.push(`[${name}] HTTP ${r.status()} ${r.url()}`));
};

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
  [P, A, B, C] = await Promise.all([pos.newPage(), phoneA.newPage(), phoneB.newPage(), phoneC.newPage()]);
  watch(P, 'pos');
  watch(A, 'A');
  watch(B, 'B');
  watch(C, 'C');
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'Admin@123' } });
  adminToken = (await login.json()).accessToken;
  tables = Object.fromEntries((await apiAs(request, 'get', '/api/admin/tables')).map((t) => [t.code, t.qrToken]));
});

test.afterAll(async () => {
  await Promise.all([pos, phoneA, phoneB, phoneC].map((c) => c?.close()));
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

test('STAFF mở trang quản lý → bị chuyển về quầy', async () => {
  await P.goto('/admin/menu');
  await expect(P).toHaveURL(/\/pos\?denied=admin/);
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
});

test('quét QR: bàn trống vào thẳng menu; khách sau chọn Gộp chung / Cá nhân (FEATURE-001)', async () => {
  await A.goto(`/t/${tables['02']}`);
  await expect(A).toHaveURL(/\/menu$/);
  await expect(A.locator('#table')).toHaveText('Bàn 02');

  await B.goto(`/t/${tables['02']}`);
  await expect(B.getByText('Bàn đang có người. Bạn đi cùng nhóm hay đi lẻ?')).toBeVisible();
  await B.getByRole('button', { name: /Gộp chung nhóm/ }).click();
  await expect(B).toHaveURL(/\/menu$/);

  await C.goto(`/t/${tables['02']}`);
  await C.getByRole('button', { name: /Tạo đơn cá nhân/ }).click();
  await expect(C).toHaveURL(/\/menu$/);

  await A.goto('/t/' + 'f'.repeat(32));
  await expect(A.getByRole('heading', { name: 'Mã bàn không hợp lệ' })).toBeVisible();
  await A.goto(`/t/${tables['02']}`); // vào lại phiên cũ (cookie còn)
  await expect(A).toHaveURL(/\/menu$/);
});

test('gọi món trong 3 chạm, quầy nhận đơn realtime < 2s (NFR-003, AC-007-01)', async () => {
  await P.goto('/pos');
  await expect(P.locator('#conn')).toHaveText('Đã kết nối');
  const item = A.locator('.c-item', { hasText: 'Cà phê sữa' });
  await item.locator('.add-btn').click(); // chạm 1
  await A.click('#open-cart'); // chạm 2
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
  const latte = B.locator('.c-item', { hasText: 'Latte' });
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
  await C.locator('.c-item', { hasText: 'Trà đào' }).locator('.add-btn').click();
  await C.locator('.c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
  await C.click('#open-cart');
  const ing = (await apiAs(request, 'get', '/api/admin/ingredients')).find((i) => i.name === 'Cốt trà đào');
  await apiAs(request, 'post', `/api/admin/ingredients/${ing.ingredientId}/adjust`, { newQty: ing.reservedQty + 10, reason: 'E2E: gần hết' });
  await C.locator('.sheet .modal-foot .btn-primary').click();
  await expect(C.locator('.sheet .alert.danger')).toContainText('Trà đào vừa hết món');
  await expect(C.locator('.sheet .cart-line')).toHaveCount(1);
  await expect(C.locator('.c-item', { hasText: 'Trà đào' }).getByText('Hết món')).toBeVisible();
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
  await A.locator('.c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
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
  // Bàn 02 vẫn còn phiên cá nhân của C đang mở → hỏi Gộp/Cá nhân; phiên đã thanh toán không còn trong danh sách
  await expect(A.getByText('Bàn đang có người. Bạn đi cùng nhóm hay đi lẻ?')).toBeVisible();
  await expect(A.getByRole('button', { name: /Gộp chung nhóm/ })).toHaveCount(1);
  await A.getByRole('button', { name: /Tạo đơn cá nhân/ }).click();
  await expect(A).toHaveURL(/\/menu$/);
  await expect(A.locator('#table')).toHaveText('Bàn 02');
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
  const width = await P.locator('.receipt').evaluate((n) => n.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(Math.round((80 / 25.4) * 96));
});

test('báo cáo: khoảng ngày sai vô hiệu nút Xem; 01–10/10/2026 = 3.190.000đ (AC-012-01/02)', async () => {
  await P.goto('/pos/login');
  await P.evaluate(() => localStorage.clear());
  await P.goto('/admin/reports');
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

test('quản lý: tạo nhân viên trùng tên báo lỗi; BOM -10 bị từ chối (AC-009-02, AC-011-02)', async () => {
  await P.goto('/admin/users');
  await P.getByRole('button', { name: '+ Thêm nhân viên' }).click();
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
  await P.locator('tr', { hasText: 'Cà phê cốt' }).getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('.toast').last()).toContainText('Nguyên liệu đang dùng trong định lượng của');

  await apiAs(request, 'post', '/api/admin/users', { username: 'xoa_thu', password: '123456', fullName: 'Xóa thử', role: 'STAFF' });
  await P.goto('/admin/users');
  await expect(P.locator('tr', { hasText: 'admin' }).first().getByRole('button', { name: 'Xóa' })).toHaveCount(0);
  await P.locator('tr', { hasText: 'xoa_thu' }).getByRole('button', { name: 'Xóa' }).click();
  await P.locator('.modal').getByRole('button', { name: 'Xóa' }).click();
  await expect(P.locator('tr', { hasText: 'xoa_thu' })).toHaveCount(0);
});
