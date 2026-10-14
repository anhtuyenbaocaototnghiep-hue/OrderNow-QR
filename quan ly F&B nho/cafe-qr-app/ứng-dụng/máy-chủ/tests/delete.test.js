// Xóa trong trang Quản lý (ADR-004): xóa hẳn khi chưa có lịch sử, xóa mềm khi đã có, chặn khi đang dùng.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import supertest from 'supertest';
import { resetTestDatabase, inventoryViolations } from './helpers/testDb.js';

let ctx, pool, server, api, admin, staff;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function login(username, password) {
  const r = await api.post('/api/auth/login').send({ username, password });
  return r.body.accessToken;
}

async function customer() {
  const r = await api.get('/api/menu');
  const cookie = r.headers['set-cookie'].find((c) => c.startsWith('cf_client=')).split(';')[0];
  return {
    post: (p, b) =>
      api
        .post(p)
        .set('Cookie', cookie)
        .send(b ?? {}),
  };
}

const adminGet = async (path) => (await api.get(path).set(auth(admin))).body;
const del = (path, token = admin) => api.delete(path).set(auth(token));
const itemId = async (name) => (await adminGet('/api/admin/menu-items')).find((i) => i.name === name)?.menuItemId;
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

before(async () => {
  ctx = await resetTestDatabase();
  pool = ctx.pool;
  const { createApp } = await import('../src/app.js');
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, r));
  api = supertest(server);
  admin = await login('admin', 'Admin@123');
  staff = await login('staff1', 'Staff@123');
});

after(async () => {
  const v = await inventoryViolations(pool);
  await new Promise((r) => server.close(r));
  const { closePool } = await import('../src/db.js');
  await closePool();
  await pool.close();
  assert.deepEqual(v, []);
});

describe('Xóa (ADR-004)', () => {
  test('STAFF không xóa được; khách không có token → 401', async () => {
    assert.equal((await del('/api/admin/menu-items/1', staff)).status, 403);
    assert.equal((await api.delete('/api/admin/tables/1')).status, 401);
  });

  test('món chưa bán → xóa hẳn (kèm BOM), biến mất khỏi menu và danh sách', async () => {
    const created = await api.post('/api/admin/menu-items').set(auth(admin)).send({ categoryId: 1, name: 'Món thử xóa', price: 20000 });
    const id = created.body.menuItemId;
    await api
      .put(`/api/admin/menu-items/${id}/bom`)
      .set(auth(admin))
      .send([{ ingredientId: 1, amount: 5 }]);
    const r = await del(`/api/admin/menu-items/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.result, 'DELETED');
    assert.equal(await itemId('Món thử xóa'), undefined);
    const bom = await pool.request().query(`SELECT COUNT(*) AS n FROM dbo.BomItems WHERE MenuItemId = ${id}`);
    assert.equal(bom.recordset[0].n, 0);
    assert.equal((await del(`/api/admin/menu-items/${id}`)).status, 404);
  });

  test('món đã bán → xóa mềm: ẩn khỏi menu, không đặt được nữa, lịch sử/báo cáo vẫn giữ tên', async () => {
    const C = await customer();
    const qr = (await adminGet('/api/admin/tables')).find((t) => t.code === '01').qrToken;
    const sessionId = (await C.post('/api/sessions/scan', { qrToken: qr })).body.session.sessionId;
    const id = await itemId('Nước suối');
    const order = await C.post('/api/orders', { sessionId, items: [{ menuItemId: id, quantity: 2 }] });
    assert.equal(order.status, 201);
    await api.post(`/api/orders/${order.body.orderId}/accept`).set(auth(staff));
    await api.post(`/api/sessions/${sessionId}/settle`).set(auth(staff)).send({ amountReceived: 20000 });

    const r = await del(`/api/admin/menu-items/${id}`);
    assert.equal(r.body.result, 'ARCHIVED');
    assert.equal(await itemId('Nước suối'), undefined);
    const menu = (await api.get('/api/menu')).body.categories.flatMap((c) => c.items);
    assert.ok(!menu.some((i) => i.id === id));
    const C2 = await customer();
    const s2 = (await C2.post('/api/sessions', { qrToken: qr })).body.session.sessionId;
    assert.equal((await C2.post('/api/orders', { sessionId: s2, items: [{ menuItemId: id, quantity: 1 }] })).body.code, 'ITEM_UNAVAILABLE');
    const report = await adminGet(`/api/admin/reports/revenue?from=${today()}&to=${today()}`);
    assert.ok(report.topItems.some((t) => t.name === 'Nước suối'));
    assert.equal((await api.put(`/api/admin/menu-items/${id}`).set(auth(admin)).send({ categoryId: 2, name: 'X', price: 1 })).status, 404);
  });

  test('danh mục: còn món → 409 HAS_ITEMS; chỉ còn món đã xóa mềm → ARCHIVED; trống → DELETED', async () => {
    const r1 = await del('/api/admin/categories/2');
    assert.equal(r1.status, 409);
    assert.equal(r1.body.code, 'HAS_ITEMS');
    for (const item of (await adminGet('/api/admin/menu-items')).filter((i) => i.categoryId === 2)) {
      assert.equal((await del(`/api/admin/menu-items/${item.menuItemId}`)).status, 200);
    }
    assert.equal((await del('/api/admin/categories/2')).body.result, 'ARCHIVED'); // còn "Nước suối" đã xóa mềm
    assert.ok(!(await adminGet('/api/admin/categories')).some((c) => c.categoryId === 2));
    const empty = await api.post('/api/admin/categories').set(auth(admin)).send({ name: 'Trống' });
    assert.equal((await del(`/api/admin/categories/${empty.body.categoryId}`)).body.result, 'DELETED');
  });

  test('bàn: đang có khách → 409 TABLE_BUSY; đã dùng → ARCHIVED + QR cũ chết; chưa dùng → DELETED; mã bàn dùng lại được', async () => {
    const tables = await adminGet('/api/admin/tables');
    const t2 = tables.find((t) => t.code === '02');
    const C = await customer();
    const sid = (await C.post('/api/sessions/scan', { qrToken: t2.qrToken })).body.session.sessionId;
    const busy = await del(`/api/admin/tables/${t2.tableId}`);
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, 'TABLE_BUSY');
    await api.post(`/api/sessions/${sid}/close`).set(auth(staff));
    assert.equal((await del(`/api/admin/tables/${t2.tableId}`)).body.result, 'ARCHIVED');
    assert.equal((await C.post('/api/sessions/scan', { qrToken: t2.qrToken })).status, 404);
    assert.ok(!(await adminGet('/api/admin/tables')).some((t) => t.code === '02'));
    const again = await api.post('/api/admin/tables').set(auth(admin)).send({ code: '02' });
    assert.equal(again.status, 201);
    const t6 = tables.find((t) => t.code === '06');
    assert.equal((await del(`/api/admin/tables/${t6.tableId}`)).body.result, 'DELETED');
  });

  test('nguyên liệu: đang trong BOM → 409 IN_USE kèm tên món; đang giữ cho đơn → 409 HAS_RESERVED; có lịch sử → ARCHIVED; mới → DELETED', async () => {
    const ings = await adminGet('/api/admin/ingredients');
    const coffee = ings.find((i) => i.name === 'Cà phê cốt');
    const inUse = await del(`/api/admin/ingredients/${coffee.ingredientId}`);
    assert.equal(inUse.status, 409);
    assert.equal(inUse.body.code, 'IN_USE');
    assert.ok(inUse.body.details.menuItems.includes('Cà phê đen'));
    assert.match(inUse.body.message, /Cà phê đen/);

    // "Đường": bỏ khỏi BOM các món, rồi giữ chỗ bằng một đơn → HAS_RESERVED
    const sugar = ings.find((i) => i.name === 'Đường');
    const C = await customer();
    const qr = (await adminGet('/api/admin/tables')).find((t) => t.code === '03').qrToken;
    const sid = (await C.post('/api/sessions/scan', { qrToken: qr })).body.session.sessionId;
    const order = await C.post('/api/orders', { sessionId: sid, items: [{ menuItemId: await itemId('Cà phê đen'), quantity: 1 }] });
    for (const item of await adminGet('/api/admin/menu-items')) {
      const { bom } = await adminGet(`/api/admin/menu-items/${item.menuItemId}/bom`);
      const rest = bom.filter((b) => b.ingredientId !== sugar.ingredientId);
      if (rest.length !== bom.length)
        await api
          .put(`/api/admin/menu-items/${item.menuItemId}/bom`)
          .set(auth(admin))
          .send(rest.map((b) => ({ ingredientId: b.ingredientId, amount: b.amount })));
    }
    const reserved = await del(`/api/admin/ingredients/${sugar.ingredientId}`);
    assert.equal(reserved.body.code, 'HAS_RESERVED');
    await api.post(`/api/orders/${order.body.orderId}/cancel`).set(auth(staff)).send({});
    assert.equal((await del(`/api/admin/ingredients/${sugar.ingredientId}`)).body.result, 'ARCHIVED');
    assert.ok(!(await adminGet('/api/admin/ingredients')).some((i) => i.name === 'Đường'));
    assert.equal((await api.post(`/api/admin/ingredients/${sugar.ingredientId}/adjust`).set(auth(admin)).send({ delta: 1, reason: 'x' })).status, 404);

    const fresh = await api.post('/api/admin/ingredients').set(auth(admin)).send({ name: 'Đường', unit: 'g', stockQty: 0, lowStockThreshold: 0 });
    assert.equal(fresh.status, 201, 'tên đã xóa dùng lại được');
    assert.equal((await del(`/api/admin/ingredients/${fresh.body.ingredientId}`)).body.result, 'DELETED');
  });

  test('tài khoản: không tự xóa; chưa thao tác → DELETED; đã thao tác → ARCHIVED, token cũ 401, username dùng lại được', async () => {
    const self = await del(`/api/admin/users/${ctx.adminId}`);
    assert.equal(self.status, 400);
    assert.equal(self.body.code, 'CANNOT_DELETE_SELF');
    const u = await api.post('/api/admin/users').set(auth(admin)).send({ username: 'tamthoi', password: '123456', fullName: 'Tạm', role: 'STAFF' });
    assert.equal((await del(`/api/admin/users/${u.body.userId}`)).body.result, 'DELETED');

    // staff1 đã tiếp nhận/thu tiền ở các test trên → xóa mềm
    assert.equal((await del(`/api/admin/users/${ctx.staffId}`)).body.result, 'ARCHIVED');
    assert.equal((await api.get('/api/orders').set(auth(staff))).status, 401);
    assert.equal((await api.post('/api/auth/login').send({ username: 'staff1', password: 'Staff@123' })).status, 401);
    assert.ok(!(await adminGet('/api/admin/users')).some((x) => x.username === 'staff1'));
    const report = await adminGet(`/api/admin/reports/revenue?from=${today()}&to=${today()}`);
    assert.ok(
      report.byStaff.some((s) => s.fullName === 'Nhân viên quầy 1'),
      'báo cáo thu tiền vẫn giữ tên nhân viên đã xóa',
    );
    const reuse = await api.post('/api/admin/users').set(auth(admin)).send({ username: 'staff1', password: '123456', fullName: 'Người mới', role: 'STAFF' });
    assert.equal(reuse.status, 201);
  });
});
