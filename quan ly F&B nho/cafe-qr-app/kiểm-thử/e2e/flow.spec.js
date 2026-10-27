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
  await expect(P.locator('.receipt')).toContainText('Tiền mặt'); // AC-006-04: "Thanh toán: Tiền mặt"
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
  await C.getByRole('button', { name: 'Gọi nhân viên' }).click();
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
  await expect(chip).toContainText('Khách lớn tuổi — ít đá');
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
  // TASK-069: Tab vào biểu đồ + phím mũi tên → hộp số liệu ngày (3 chuỗi + lợi nhuận)
  await P.locator('svg.pnl-chart').focus();
  await P.keyboard.press('ArrowLeft');
  await expect(P.locator('.chart-tip')).toContainText('Lợi nhuận hoạt động');
  await P.keyboard.press('Escape'); // WCAG 1.4.13: Esc ẩn hộp số liệu
  await expect(P.locator('.chart-tip')).toBeHidden();
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
  await expect(P.locator('#content .legend')).toContainText('Dự báo');
  await P.locator('svg.fc-chart').hover(); // TASK-069: rê chuột → hộp số liệu ngày gần nhất
  await expect(P.locator('.chart-tip')).toBeVisible();
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
  await G.locator('.sheet input[aria-label="Ghi chú cho Nước suối"]').fill('không lạnh');
  const total = (await G.locator('.sheet .cart-total').innerText()).match(/[\d.]+đ/)[0];
  await G.keyboard.press('Escape');
  await G.reload();
  await G.click('#open-cart');
  await expect(G.locator('.sheet .cart-line', { hasText: 'Bạc xỉu' })).toContainText('Size L');
  await expect(G.locator('.sheet input[aria-label="Ghi chú cho Nước suối"]')).toHaveValue('không lạnh');
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
  await expect(P.locator('#col-PENDING .ticket', { hasText: 'Bàn CB2' })).toBeVisible();
  await expect(P.locator('#col-PENDING .ticket', { hasText: 'Bàn CB1' })).toHaveCount(0);
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
  await A.goto(`/t/${t2.qrToken}`);
  await expect(A.getByText('Bàn đang có người. Bạn đi cùng nhóm hay đi lẻ?')).toBeVisible();
  await A.getByRole('button', { name: /Gộp chung nhóm/ }).click();
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
  await drawer.getByRole('button', { name: 'Thu chung với bàn khác' }).click();
  const pick = P.locator('.modal', { hasText: 'Thu chung với Bàn GH1' });
  await pick.getByLabel(/^Bàn GH2/).check();
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
  await expect(cards.first()).toBeVisible();
  // Mọi thẻ bàn đều có khối Wi-Fi, dùng chung một ảnh QR Wi-Fi
  await expect(P.locator('.qr-card .qr-wifi')).toHaveCount(await cards.count());
  const wifi = cards.first().locator('.qr-wifi');
  await expect(wifi).toContainText('① Quét để vào Wi-Fi');
  await expect(wifi).toContainText('Wi-Fi: QuanMoc-Khach · Mật khẩu: matkhau123');
  await expect.poll(() => wifi.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(cards.first()).toContainText('② Quét để gọi món');
  await expect(cards.first()).toContainText('Thanh toán tiền mặt hoặc chuyển khoản');
  // Giữ Wi-Fi đã nhập: dự án a11y chạy sau flow quét luôn khối Wi-Fi ở trang In QR
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
