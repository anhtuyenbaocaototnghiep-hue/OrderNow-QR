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
  const item = A.locator('.c-section.cat .c-item', { hasText: 'Cà phê sữa' });
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
  // Xóa phiên đăng nhập ngay trên trang hiện tại (cùng origin) — vào /pos/login khi đang đăng nhập sẽ tự chuyển trang, làm hỏng lệnh goto kế tiếp
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
  await expect(C.locator('.opt-total')).toContainText('37.000đ');
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
  await C.getByRole('button', { name: '🙋 Gọi nhân viên' }).click();
  await C.locator('.sheet .chip', { hasText: 'Xin thêm đá' }).click();
  await C.locator('.sheet').getByRole('button', { name: 'Gọi nhân viên' }).click();
  await expect(C.getByRole('button', { name: /Đã gọi nhân viên/ })).toBeDisabled();
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
  await expect(chip).toContainText('📝 Khách lớn tuổi — ít đá');
  await expect(chip).toHaveClass(/busy/);

  // Khách quét QR bàn 04 → gộp vào nhóm nhân viên đã mở: thấy đơn, không thấy ghi chú bàn
  await D.goto(`/t/${tables['04']}`);
  await D.getByRole('button', { name: /Gộp chung nhóm/ }).click();
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
  await expect(row).toContainText('📝 Khách lớn tuổi — ít đá');
  await row.getByRole('button', { name: 'Sửa ghi chú' }).click();
  await P.locator('.modal textarea').fill('Khách lớn tuổi — ít đá, đã thêm ghế');
  await P.locator('.modal').getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(row).toContainText('đã thêm ghế');
  await row.getByRole('button', { name: 'Thu tiền' }).click();
  await expect(P.locator('.drawer')).toContainText('📝 Khách lớn tuổi');
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
  await A.goto(`/t/${tables['06']}`);
  await expect(A).toHaveURL(/\/menu$/);
  await A.locator('.c-section.cat .c-item', { hasText: 'Cà phê đen' }).locator('.add-btn').click();
  await A.click('#open-cart');
  await A.locator('.sheet .modal-foot .btn-primary').click();
  await expect(A).toHaveURL(/\/track$/);
  await B.goto(`/t/${tables['06']}`);
  await B.getByRole('button', { name: /Gộp chung nhóm/ }).click();
  await B.locator('.c-section.cat .c-item', { hasText: 'Nước suối' }).locator('.add-btn').click();
  await B.click('#open-cart');
  await B.locator('.sheet .modal-foot .btn-primary').click();
  await expect(B).toHaveURL(/\/track$/);

  await A.click('#split-bill');
  await A.getByPlaceholder('Tên phần của bạn (ví dụ: Anh A)').fill('Anh A');
  await A.click('#create-split');
  await A.locator('.split-line', { hasText: 'Cà phê đen' }).getByRole('button', { name: 'Của tôi' }).click();
  await expect(A.locator('.split-line.mine')).toContainText('Cà phê đen');
  await B.click('#split-bill');
  await B.getByPlaceholder('Tên phần của bạn (ví dụ: Anh A)').fill('Chị B');
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

test('kho nâng cao: quầy pha mẻ bán thành phẩm, ghi phiếu hủy, nhận hàng theo đơn đặt hàng; quản lý xem đề xuất nhập + giá vốn thực tế (F-027, F-032, F-030, F-029, F-031)', async ({
  request,
}) => {
  const ingr = async (name, unit) => (await apiAs(request, 'post', '/api/admin/ingredients', { name, unit, stockQty: 0, lowStockThreshold: 0 })).ingredientId;
  const bean = await ingr('Hạt rang E2E', 'g');
  const water = await ingr('Nước E2E', 'ml');
  const semi = await ingr('Cốt pha E2E', 'ml');
  await apiAs(request, 'post', '/api/admin/stock-receipts', {
    lines: [
      { ingredientId: bean, qty: 1000, unitCost: 200 },
      { ingredientId: water, qty: 10000, unitCost: 1 },
    ],
  });
  await apiAs(request, 'put', `/api/admin/ingredients/${semi}/advanced`, { kind: 'SEMI', shelfLifeHours: 24, wastePercent: 0 });
  await apiAs(request, 'put', `/api/admin/ingredients/${semi}/recipe`, {
    outputQty: 900,
    lines: [
      { ingredientId: bean, qty: 100 },
      { ingredientId: water, qty: 1000 },
    ],
  });
  const sup = await apiAs(request, 'post', '/api/admin/suppliers', {
    name: 'NCC E2E',
    items: [{ ingredientId: bean, packUnitCode: 'kg', isPreferred: true, lastPrice: 180000 }],
  });
  const po = await apiAs(request, 'post', '/api/admin/purchase-orders', { supplierId: sup.supplierId, lines: [{ ingredientId: bean, orderedPacks: 2 }] });
  await apiAs(request, 'post', `/api/admin/purchase-orders/${po.poId}/send`);

  await P.goto('/pos/stock');
  await P.locator('#prep-semi').selectOption(String(semi));
  await P.fill('#prep-mult', '2');
  await expect(P.locator('#content')).toContainText('Ra 1.800 ml');
  await P.click('#prep-go');
  await expect(P.locator('.toast', { hasText: 'Đã sơ chế 1.800 ml Cốt pha E2E' })).toBeVisible();

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
  await expect(L.locator('.pos-top')).toContainText('Trưởng ca');

  // Trưởng ca ghi chi 50.000đ mua đá → duyệt ngay
  await L.goto('/pos/shift');
  await L.locator('.card', { hasText: 'Sổ quỹ trong ca' }).getByRole('button', { name: 'Chi tiền' }).click();
  await L.locator('#cash-cat').selectOption({ label: 'Mua đá' });
  await L.fill('#cash-amount', '50000');
  await L.fill('#cash-reason', 'Mua 2 bao đá');
  await L.locator('.modal').getByRole('button', { name: 'Ghi khoản chi' }).click();
  await expect(L.locator('.toast', { hasText: 'Đã ghi 50.000đ' })).toBeVisible();
  await expect(L.locator('table.cash-book')).toContainText('Mua 2 bao đá');

  // Chủ quán bổ sung 1.000.000đ vào két (thu khác) rồi ghi khoản tạm ứng lương 800.000đ → chờ duyệt → trưởng ca duyệt trên màn Ca
  const categories = await apiAs(request, 'get', '/api/cash-categories');
  const catId = (name) => categories.find((c) => c.name === name).categoryId;
  await apiAs(request, 'post', '/api/cash-transactions', { categoryId: catId('Bổ sung tiền lẻ'), amount: 1000000, reason: 'Bổ sung két E2E' });
  const big = await apiAs(request, 'post', '/api/cash-transactions', { categoryId: catId('Lương tạm ứng'), amount: 800000, reason: 'Tạm ứng lương E2E' });
  expect(big.status).toBe('PENDING');
  await L.reload();
  const row = L.locator('table.cash-book tr', { hasText: 'Tạm ứng lương E2E' });
  await expect(row).toContainText('Chờ duyệt');
  await row.getByRole('button', { name: 'Duyệt' }).click();
  await L.locator('.modal').getByRole('button', { name: 'Duyệt chi' }).click();
  await expect(L.locator('.toast', { hasText: 'Đã duyệt khoản chi' })).toBeVisible();
  await expect(L.locator('table.cash-book tr', { hasText: 'Tạm ứng lương E2E' })).toContainText('Đã duyệt');
  await expect(L.locator('.card', { hasText: 'Chấm công hôm nay' })).toContainText('Trưởng ca E2E');

  // Trưởng ca có tab Kiểm kê ở Kho; không vào được trang quản lý
  await L.goto('/pos/stock');
  await expect(L.locator('#tabs button', { hasText: 'Kiểm kê' })).toBeVisible();
  await L.goto('/admin/cash');
  await expect(L).toHaveURL(/\/pos\?denied=admin/);

  // Quản lý: sổ quỹ
  await P.goto('/admin/cash');
  await expect(P.locator('table.cash-book')).toContainText('Mua 2 bao đá');
  await expect(P.locator('.kpi', { hasText: 'Chi quỹ (đã duyệt)' })).toContainText('850.000đ');

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
  await expect(P.locator('.alert.warning')).toContainText('Ước tính');
  await expect(P.locator('svg.pnl-chart')).toBeVisible();
  await expect(P.locator('.kpi', { hasText: 'Lợi nhuận hoạt động' })).toBeVisible();
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

test('phân tích + dashboard: quản lý xem menu engineering, giờ cao điểm, dự báo, so sánh, theo bàn; trưởng ca mở "Hôm nay" trên điện thoại không cuộn ngang, không thấy lãi (F-041, F-042, F-043)', async () => {
  await P.goto('/admin/analytics');
  await expect(P.locator('#content table')).toContainText('Lãi / món');
  await expect(P.locator('#content .badge').first()).toBeVisible();
  await P.locator('.tabs button', { hasText: 'Giờ cao điểm' }).click();
  await expect(P.locator('table.heatmap')).toBeVisible();
  await P.locator('.tabs button', { hasText: 'Dự báo doanh thu' }).click();
  await expect(P.locator('svg.fc-chart')).toBeVisible();
  await P.locator('.tabs button', { hasText: 'So sánh kỳ' }).click();
  await expect(P.locator('.kpi', { hasText: 'Doanh thu thuần' })).toBeVisible();
  await P.locator('.tabs button', { hasText: 'Theo bàn' }).click();
  await expect(P.locator('#content table')).toContainText('Doanh thu / giờ ngồi');

  await P.goto('/admin/today');
  await expect(P.locator('.today-card', { hasText: 'Doanh thu hôm qua' })).toContainText('Lãi gộp ước tính');
  await P.getByRole('button', { name: 'Tính lại hôm nay' }).click();
  await expect(P.locator('.toast', { hasText: 'Đã tính lại' })).toBeVisible();

  const phone = await browser.newContext(phoneOpts);
  const M = await phone.newPage();
  watch(M, 'lead-phone');
  await M.goto('/pos/login?next=/admin/today');
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
  await E.goto(`/t/${tables['01']}`);
  await E.getByRole('button', { name: /Gộp chung nhóm/ }).click();
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
  await expect(P.locator('#shift-btn')).toHaveText('⚠ Chưa mở ca');
});
