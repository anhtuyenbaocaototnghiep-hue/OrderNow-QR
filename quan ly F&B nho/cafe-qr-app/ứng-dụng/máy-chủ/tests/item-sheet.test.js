// Integration test (SQL Server thật) F-081 — bảng chọn món của khách (ADR-039 D-178…D-181). Giao diện chọn tùy chọn + ghi chú +
// số lượng ngay khi bấm món; cùng món + cùng tùy chọn nhưng khác ghi chú thành hai dòng giỏ → máy chủ phải báo giá và nhận đơn đúng
// từng dòng (không gộp, không mất ghi chú). Không có API mới.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, size;
const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  assert.equal((await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 })).status, 201);
  const g = await api
    .post('/api/admin/modifier-groups')
    .set(auth(admin))
    .send({
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: 'Size M', priceDelta: 0, isDefault: true },
        { name: 'Size L', priceDelta: 5000 },
      ],
    });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  size = { groupId: g.body.groupId, L: g.body.options.find((o) => o.name === 'Size L').optionId };
  const items = (await api.get('/api/admin/menu-items').set(auth(admin))).body;
  const bx = items.find((i) => i.name === 'Bạc xỉu');
  const r = await api
    .put(`/api/admin/menu-items/${bx.menuItemId}`)
    .set(auth(admin))
    .send({ ...bx, imageUrl: '', groupIds: [size.groupId] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

after(() => app.close());

describe('Bảng chọn món của khách (F-081)', () => {
  test('AC-081-01: hai dòng cùng món + cùng tùy chọn nhưng khác ghi chú (và số lượng chọn sẵn) → báo giá đủ 2 dòng; gửi đơn giữ 2 dòng với đúng ghi chú, số lượng, tùy chọn; tổng = đơn giá có tùy chọn × số lượng', async () => {
    const lines = [
      { menuItemId: ids['Bạc xỉu'], quantity: 2, note: 'Ít đá', optionIds: [size.L] },
      { menuItemId: ids['Bạc xỉu'], quantity: 1, note: 'Không đường', optionIds: [size.L] },
      { menuItemId: ids['Nước suối'], quantity: 3, note: 'Không lạnh' },
    ];
    const quote = await api.post('/api/orders/quote').send({ items: lines });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const bxLines = quote.body.lines.filter((l) => l.menuItemId === ids['Bạc xỉu']);
    assert.equal(bxLines.length, 2, 'không gộp hai dòng khác ghi chú');
    assert.deepEqual(
      bxLines.map((l) => l.quantity),
      [2, 1],
    );
    const unit = bxLines[0].unitPrice;
    assert.equal(bxLines[1].unitPrice, unit);

    const c = await app.customer();
    const sessionId = await app.seat(c, '04');
    const o = await c.post('/api/orders', { sessionId, items: lines });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    const rows = await q1(
      `SELECT oi.MenuItemId, oi.Quantity, oi.Note, oi.UnitPrice,
              (SELECT COUNT(*) FROM dbo.OrderItemModifiers x WHERE x.OrderItemId = oi.OrderItemId) AS Opts
       FROM dbo.OrderItems oi WHERE oi.OrderId = ${o.body.orderId} ORDER BY oi.OrderItemId`,
    );
    assert.deepEqual(
      rows.map((r) => [r.MenuItemId, r.Quantity, r.Note]),
      [
        [ids['Bạc xỉu'], 2, 'Ít đá'],
        [ids['Bạc xỉu'], 1, 'Không đường'],
        [ids['Nước suối'], 3, 'Không lạnh'],
      ],
    );
    assert.deepEqual(
      rows.map((r) => r.Opts),
      [1, 1, 0],
    );
    assert.equal(Number(rows[0].UnitPrice), Number(unit));
    assert.equal(o.body.totalAmount, quote.body.total);
  });
});
