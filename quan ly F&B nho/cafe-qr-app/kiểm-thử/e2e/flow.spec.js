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

  // Trưởng ca có tab Kiểm kê ở Kho; không vào được trang quản lý
  await L.goto('/pos/stock');
  await expect(L.locator('#tabs button', { hasText: 'Kiểm kê' })).toBeVisible();
  await L.goto('/admin/cash');
  await expect(L).toHaveURL(/\/pos\?denied=admin/);

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
    // Màn quầy: "Kho & sơ chế" theo nhóm Kho hàng
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
    await G.locator('.c-section.cat .add-btn').first().click();
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

test('chấm công nhiều người + lương: nhân viên tự đặt PIN; màn Chấm công vào ca bằng PIN; chi tiền hỏi PIN người đứng máy; Đổi người; Giờ công của tôi; quản lý nhập hồ sơ lương ở trang Lương (F-072, F-073, AC-072-07, AC-073-09)', async ({
  request,
}) => {
  await apiAs(request, 'put', '/api/admin/attendance-settings', { attendanceMode: 'KIOSK', moneyPin: true });
  await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-ha', password: 'Pass@123', fullName: 'Hà E2E', role: 'STAFF' });
  await apiAs(request, 'post', '/api/admin/users', { username: 'e2e-bao', password: 'Pass@123', fullName: 'Bảo E2E', role: 'STAFF' });
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

    // Đổi người: Bảo đứng máy → tên trên thanh trên đổi
    await Q.locator('#switch-btn').click();
    await Q.locator('.modal', { hasText: 'Đổi người đứng máy' }).locator('.person-tile', { hasText: 'Bảo E2E' }).click();
    await Q.keyboard.type('1397');
    await Q.locator('.modal', { hasText: 'Đổi sang Bảo E2E' }).getByRole('button', { name: 'Đổi người' }).click();
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

    // Tú đứng máy → Giờ công của tôi: hôm qua có lịch mà không chấm công → Báo quên chấm công
    await Q.locator('#switch-btn').click();
    await Q.locator('.modal', { hasText: 'Đổi người đứng máy' }).locator('.person-tile', { hasText: 'Tú E2E' }).click();
    await Q.keyboard.type('3691');
    await Q.locator('.modal', { hasText: 'Đổi sang Tú E2E' }).getByRole('button', { name: 'Đổi người' }).click();
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
