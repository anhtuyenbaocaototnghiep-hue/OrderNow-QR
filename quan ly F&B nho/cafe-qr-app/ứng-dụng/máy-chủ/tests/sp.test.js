// Integration test stored procedure trên SQL Server thật (TASK-004, phần SP của TASK-015).
// BR-001, BR-002, BR-010 (ADR-001), BR-019, Q-013; kịch bản ép tải test-strategy §13.2.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetTestDatabase, inventoryViolations, scalar, sql } from './helpers/testDb.js';

let pool, ctx, ids;
const errNo = (e) => e?.number ?? e?.originalError?.info?.number;

async function newSession(tableCode = '01') {
  const r = await pool
    .request()
    .input('c', sql.NVarChar(10), tableCode)
    .query('INSERT dbo.Sessions (TableId) OUTPUT inserted.SessionId SELECT TableId FROM dbo.Tables WHERE Code = @c');
  return r.recordset[0].SessionId;
}

function itemsTvp(items) {
  const tvp = new sql.Table('dbo.OrderItemInput');
  tvp.columns.add('MenuItemId', sql.Int, { nullable: false });
  tvp.columns.add('Quantity', sql.Int, { nullable: false });
  tvp.columns.add('Note', sql.NVarChar(200), { nullable: true });
  for (const it of items) tvp.rows.add(it.menuItemId, it.quantity, it.note ?? null);
  return tvp;
}

async function submit({ sessionId = null, items, type = 'DINE_IN', amountReceived = null, createdBy = null }) {
  const r = await pool
    .request()
    .input('Type', sql.VarChar(10), type)
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('CreatedBy', sql.Int, createdBy)
    .input('PaymentMethod', sql.VarChar(10), type === 'TAKE_AWAY' ? 'CASH' : null)
    .input('AmountReceived', sql.Decimal(12, 0), amountReceived)
    .input('Note', sql.NVarChar(200), null)
    .input('Items', itemsTvp(items))
    .output('OrderId', sql.Int)
    .output('OrderCode', sql.Char(8))
    .output('SessionReopened', sql.Bit)
    .execute('dbo.sp_SubmitOrder');
  return r.output;
}

const accept = (orderId) =>
  pool
    .request()
    .input('id', sql.Int, orderId)
    .query("UPDATE dbo.Orders SET Status = 'PREPARING', AcceptedAt = SYSUTCDATETIME() WHERE OrderId = @id AND Status = 'PENDING'");
const complete = (orderId) => pool.request().input('OrderId', sql.Int, orderId).input('UserId', sql.Int, ctx.staffId).execute('dbo.sp_CompleteOrder');
const cancel = (orderId) =>
  pool
    .request()
    .input('OrderId', sql.Int, orderId)
    .input('UserId', sql.Int, ctx.staffId)
    .input('Reason', sql.NVarChar(200), 'test')
    .execute('dbo.sp_CancelOrder');
const requestPayment = (sessionId) =>
  pool
    .request()
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .output('AmountDue', sql.Decimal(12, 0))
    .output('RequestedAt', sql.DateTime2(0))
    .execute('dbo.sp_RequestPayment');
const settle = (sessionId, amountReceived, expectedDue = null) =>
  pool
    .request()
    .input('SessionId', sql.UniqueIdentifier, sessionId)
    .input('AmountReceived', sql.Decimal(12, 0), amountReceived)
    .input('UserId', sql.Int, ctx.staffId)
    .input('ExpectedDue', sql.Decimal(12, 0), expectedDue)
    .output('PaymentId', sql.Int)
    .output('AmountDue', sql.Decimal(12, 0))
    .execute('dbo.sp_SettleSession');
const adjust = (ingredientId, { newQty = null, delta = null }) =>
  pool
    .request()
    .input('IngredientId', sql.Int, ingredientId)
    .input('NewQty', sql.Decimal(18, 3), newQty)
    .input('Delta', sql.Decimal(18, 3), delta)
    .input('Reason', sql.NVarChar(200), 'test')
    .input('UserId', sql.Int, ctx.adminId)
    .output('BalanceAfter', sql.Decimal(18, 3))
    .execute('dbo.sp_AdjustInventory');

const ing = async (name) =>
  (
    await pool
      .request()
      .input('n', sql.NVarChar(100), name)
      .query('SELECT IngredientId AS id, StockQty AS stock, ReservedQty AS reserved FROM dbo.Ingredients WHERE Name = @n')
  ).recordset[0];

/** Đặt tồn kho tuyệt đối cho test (chỉ khi không còn đơn giữ chỗ). */
async function setStock(name, qty) {
  await pool
    .request()
    .input('n', sql.NVarChar(100), name)
    .input('q', sql.Decimal(18, 3), qty)
    .query('UPDATE dbo.Ingredients SET StockQty = @q WHERE Name = @n AND ReservedQty = 0');
}

async function expectSqlError(promise, number) {
  try {
    await promise;
  } catch (e) {
    assert.equal(errNo(e), number, `mong lỗi ${number}, nhận ${errNo(e)}: ${e.message}`);
    return e;
  }
  assert.fail(`mong lỗi ${number} nhưng thành công`);
}

before(async () => {
  ctx = await resetTestDatabase();
  pool = ctx.pool;
  const menu = (await pool.request().query('SELECT MenuItemId, Name FROM dbo.MenuItems')).recordset;
  ids = Object.fromEntries(menu.map((m) => [m.Name, m.MenuItemId]));
});

after(async () => {
  const v = await inventoryViolations(pool);
  await pool.close();
  assert.deepEqual(v, [], 'bất biến kho bị vi phạm');
});

describe('sp_SubmitOrder', () => {
  test('happy path: lưu đơn PENDING/UNPAID, snapshot giá, giữ kho đúng Σ BOM (AC-003-01)', async () => {
    const s = await newSession('01');
    const before = await ing('Cà phê cốt');
    const out = await submit({
      sessionId: s,
      items: [
        { menuItemId: ids['Cà phê sữa'], quantity: 2, note: 'ít đá' },
        { menuItemId: ids['Cà phê đen'], quantity: 1 },
      ],
    });
    assert.match(out.OrderCode, /^[A-HJ-NP-Z2-9]{8}$/);
    const o = (
      await pool.request().input('id', sql.Int, out.OrderId).query('SELECT Status, PaymentStatus, TotalAmount, TableId FROM dbo.Orders WHERE OrderId = @id')
    ).recordset[0];
    assert.equal(o.Status, 'PENDING');
    assert.equal(o.PaymentStatus, 'UNPAID');
    assert.equal(o.TotalAmount, 2 * 29000 + 25000);
    assert.ok(o.TableId);
    const after = await ing('Cà phê cốt');
    assert.equal(after.reserved - before.reserved, 3 * 25);
    assert.equal(after.stock, before.stock);
    assert.equal(await scalar(pool, 'SELECT COUNT(*) FROM dbo.OrderItems WHERE OrderId = @id', { id: [sql.Int, out.OrderId] }), 2);
  });

  test('thiếu nguyên liệu → 50002 kèm MenuItemId, không ghi gì (AC-003-02)', async () => {
    const tra = await ing('Cốt trà đào');
    const ordersBefore = await scalar(pool, 'SELECT COUNT(*) FROM dbo.Orders');
    await setStock('Cốt trà đào', 40);
    const s = await newSession('02');
    const e = await expectSqlError(
      submit({
        sessionId: s,
        items: [
          { menuItemId: ids['Trà đào'], quantity: 1 },
          { menuItemId: ids['Cà phê đen'], quantity: 1 },
        ],
      }),
      50002,
    );
    assert.deepEqual(e.message.split(',').map(Number), [ids['Trà đào']]);
    assert.equal(await scalar(pool, 'SELECT COUNT(*) FROM dbo.Orders'), ordersBefore);
    assert.equal((await ing('Cốt trà đào')).reserved, tra.reserved);
    await setStock('Cốt trà đào', 1000);
  });

  test('món bị tắt / không tồn tại → 50010', async () => {
    const s = await newSession('02');
    await pool.request().input('id', sql.Int, ids['Latte']).query('UPDATE dbo.MenuItems SET IsAvailable = 0 WHERE MenuItemId = @id');
    const e = await expectSqlError(
      submit({
        sessionId: s,
        items: [
          { menuItemId: ids['Latte'], quantity: 1 },
          { menuItemId: 99999, quantity: 1 },
        ],
      }),
      50010,
    );
    assert.deepEqual(
      e.message
        .split(',')
        .map(Number)
        .sort((a, b) => a - b),
      [ids['Latte'], 99999].sort((a, b) => a - b),
    );
    await pool.request().input('id', sql.Int, ids['Latte']).query('UPDATE dbo.MenuItems SET IsAvailable = 1 WHERE MenuItemId = @id');
  });

  test('20 phiên gửi đồng thời khi kho chỉ đủ 1 suất → đúng 1 thành công (AC-003-04, US10)', async () => {
    await setStock('Cốt trà đào', 50);
    const sessions = await Promise.all(Array.from({ length: 20 }, (_, i) => newSession(String((i % 6) + 1).padStart(2, '0'))));
    const results = await Promise.allSettled(sessions.map((s) => submit({ sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 1 }] })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 19);
    for (const f of failed) assert.equal(errNo(f.reason), 50002, f.reason.message);
    const t = await ing('Cốt trà đào');
    assert.equal(t.reserved, 50);
    assert.ok(t.stock - t.reserved >= 0);
    await cancel(ok[0].value.OrderId).catch(() => {});
    await setStock('Cốt trà đào', 1000);
  });

  test('gửi đơn vào phiên CLOSED → 50031 (BR-020)', async () => {
    const s = await newSession('03');
    await pool.request().input('s', sql.UniqueIdentifier, s).query("UPDATE dbo.Sessions SET Status = 'CLOSED' WHERE SessionId = @s");
    await expectSqlError(submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] }), 50031);
  });

  test('mang đi: thiếu tiền → 50020; đủ → PREPARING/PAID + Payments có tiền thừa (BR-006)', async () => {
    await expectSqlError(
      submit({
        type: 'TAKE_AWAY',
        createdBy: ctx.staffId,
        amountReceived: 40000,
        items: [
          { menuItemId: ids['Cà phê sữa'], quantity: 1 },
          { menuItemId: ids['Bánh croissant'], quantity: 1 },
        ],
      }),
      50020,
    );
    const out = await submit({
      type: 'TAKE_AWAY',
      createdBy: ctx.staffId,
      amountReceived: 60000,
      items: [
        { menuItemId: ids['Cà phê sữa'], quantity: 1 },
        { menuItemId: ids['Bánh croissant'], quantity: 1 },
      ],
    });
    const row = (
      await pool
        .request()
        .input('id', sql.Int, out.OrderId)
        .query(
          'SELECT o.Status, o.PaymentStatus, p.AmountDue, p.ChangeGiven FROM dbo.Orders o JOIN dbo.Payments p ON p.OrderId = o.OrderId WHERE o.OrderId = @id',
        )
    ).recordset[0];
    assert.deepEqual({ ...row }, { Status: 'PREPARING', PaymentStatus: 'PAID', AmountDue: 54000, ChangeGiven: 6000 });
    await complete(out.OrderId);
  });
});

describe('sp_CompleteOrder / sp_CancelOrder', () => {
  test('hoàn tất trừ đúng BOM, ghi N dòng DEDUCT (AC-007-03, AC-011-01)', async () => {
    const s = await newSession('04');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Cà phê đen'], quantity: 1 }] });
    const cf0 = await ing('Cà phê cốt');
    const du0 = await ing('Đường');
    await expectSqlError(complete(OrderId), 50003); // còn PENDING → INVALID_STATE (BR-013)
    await accept(OrderId);
    const r = await complete(OrderId);
    assert.equal(r.recordset.length, 2);
    assert.equal(cf0.stock - (await ing('Cà phê cốt')).stock, 25);
    assert.equal(du0.stock - (await ing('Đường')).stock, 10);
    assert.equal(await scalar(pool, "SELECT COUNT(*) FROM dbo.InventoryTransactions WHERE OrderId = @id AND Type = 'DEDUCT'", { id: [sql.Int, OrderId] }), 2);
    await expectSqlError(complete(OrderId), 50001);
  });

  test('2 request hoàn tất đồng thời → 1 thành công, 1 ALREADY_PROCESSED, trừ 1 lần (AC-007-04, BR-002)', async () => {
    const s = await newSession('04');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Latte'], quantity: 2 }] });
    await accept(OrderId);
    const sua0 = await ing('Sữa tươi');
    const res = await Promise.allSettled([complete(OrderId), complete(OrderId)]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(errNo(res.find((r) => r.status === 'rejected').reason), 50001);
    assert.equal(sua0.stock - (await ing('Sữa tươi')).stock, 300);
  });

  test('hủy đơn PENDING trả lại phần giữ; hủy đơn PREPARING → INVALID_STATE', async () => {
    const s = await newSession('05');
    const r0 = (await ing('Sữa tươi')).reserved;
    const a = await submit({ sessionId: s, items: [{ menuItemId: ids['Sữa tươi đường'], quantity: 2 }] });
    assert.equal((await ing('Sữa tươi')).reserved - r0, 400);
    await cancel(a.OrderId);
    assert.equal((await ing('Sữa tươi')).reserved, r0);
    const b = await submit({ sessionId: s, items: [{ menuItemId: ids['Sữa tươi đường'], quantity: 1 }] });
    await accept(b.OrderId);
    await expectSqlError(cancel(b.OrderId), 50003);
    await complete(b.OrderId);
  });

  test('sửa BOM khi đơn đang chờ không làm lệch ReservedQty (ADR-001 snapshot)', async () => {
    const s = await newSession('05');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 1 }] });
    await pool.request().input('m', sql.Int, ids['Cà phê sữa']).query('UPDATE dbo.BomItems SET Amount = Amount + 10 WHERE MenuItemId = @m');
    await accept(OrderId);
    await complete(OrderId);
    await pool.request().input('m', sql.Int, ids['Cà phê sữa']).query('UPDATE dbo.BomItems SET Amount = Amount - 10 WHERE MenuItemId = @m');
    assert.deepEqual(await inventoryViolations(pool), []);
  });

  test('kịch bản §13.2 lặp 10 lần: chỉ M/30 đơn thành công, hoàn tất đồng thời trừ đúng 1 lần, kho về 0', async () => {
    for (let round = 1; round <= 10; round++) {
      const servings = 1 + Math.floor(Math.random() * 5);
      await setStock('Cốt trà đào', servings * 50);
      await setStock('Đào ngâm', 1000);
      await setStock('Đường', 5000);
      const sessions = await Promise.all(Array.from({ length: 30 }, (_, i) => newSession(String((i % 6) + 1).padStart(2, '0'))));
      const res = await Promise.allSettled(sessions.map((s) => submit({ sessionId: s, items: [{ menuItemId: ids['Trà đào'], quantity: 1 }] })));
      const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value.OrderId);
      assert.equal(ok.length, servings, `round ${round}`);
      assert.ok(res.filter((r) => r.status === 'rejected').every((r) => errNo(r.reason) === 50002));
      assert.equal((await ing('Cốt trà đào')).reserved, servings * 50);
      for (const id of ok) await accept(id);
      const comp = await Promise.allSettled(ok.flatMap((id) => [complete(id), complete(id)]));
      assert.equal(comp.filter((r) => r.status === 'fulfilled').length, servings);
      assert.ok(comp.filter((r) => r.status === 'rejected').every((r) => errNo(r.reason) === 50001));
      const t = await ing('Cốt trà đào');
      assert.equal(t.stock, 0);
      assert.equal(t.reserved, 0);
      assert.deepEqual(await inventoryViolations(pool), [], `round ${round}`);
    }
    await setStock('Cốt trà đào', 1000);
  });
});

describe('sp_RequestPayment / sp_SettleSession / sp_CloseEmptySession', () => {
  test('gọi thanh toán: chưa có đơn → 50030; có đơn → PAYMENT_REQUESTED, bấm lại idempotent (BR-018)', async () => {
    const s = await newSession('06');
    await expectSqlError(requestPayment(s), 50030);
    await submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 2 }] });
    const r1 = await requestPayment(s);
    assert.equal(r1.output.AmountDue, 20000);
    await requestPayment(s);
    assert.equal(await scalar(pool, 'SELECT Status FROM dbo.Sessions WHERE SessionId = @s', { s: [sql.UniqueIdentifier, s] }), 'PAYMENT_REQUESTED');
  });

  test('gọi thêm món khi đang PAYMENT_REQUESTED → phiên về OPEN (Q-013/ADR-003)', async () => {
    const s = await newSession('06');
    await submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    await requestPayment(s);
    const out = await submit({ sessionId: s, items: [{ menuItemId: ids['Bánh croissant'], quantity: 1 }] });
    assert.equal(out.SessionReopened, true);
    assert.equal(await scalar(pool, 'SELECT Status FROM dbo.Sessions WHERE SessionId = @s', { s: [sql.UniqueIdentifier, s] }), 'OPEN');
  });

  test('thu tiền: còn PENDING → 50033; thiếu tiền → 50020; sai số tiền POS đang hiển thị → 50034; thành công → mọi đơn PAID, 1 Payments (AC-006-01, AC-006-03)', async () => {
    const s = await newSession('03');
    const a = await submit({ sessionId: s, items: [{ menuItemId: ids['Cà phê sữa'], quantity: 2 }] });
    const b = await submit({
      sessionId: s,
      items: [
        { menuItemId: ids['Trà đào'], quantity: 1 },
        { menuItemId: ids['Nước suối'], quantity: 1 },
      ],
    });
    const e = await expectSqlError(settle(s, 200000), 50033);
    assert.deepEqual(
      e.message
        .split(',')
        .map(Number)
        .sort((x, y) => x - y),
      [a.OrderId, b.OrderId].sort((x, y) => x - y),
    );
    await accept(a.OrderId);
    await accept(b.OrderId);
    await expectSqlError(settle(s, 100000), 50020);
    await expectSqlError(settle(s, 200000, 58000), 50034);
    const r = await settle(s, 200000, 103000);
    assert.equal(r.output.AmountDue, 103000);
    const pay = (
      await pool.request().input('s', sql.UniqueIdentifier, s).query('SELECT AmountDue, AmountReceived, ChangeGiven FROM dbo.Payments WHERE SessionId = @s')
    ).recordset;
    assert.deepEqual({ ...pay[0] }, { AmountDue: 103000, AmountReceived: 200000, ChangeGiven: 97000 });
    assert.equal(await scalar(pool, "SELECT COUNT(*) FROM dbo.Orders WHERE SessionId = @s AND PaymentStatus = 'PAID'", { s: [sql.UniqueIdentifier, s] }), 2);
    await complete(a.OrderId);
    await complete(b.OrderId);
  });

  test('2 request thu tiền đồng thời → 1 thành công, 1 ALREADY_SETTLED, chỉ 1 Payments (AC-006-02)', async () => {
    const s = await newSession('02');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    await accept(OrderId);
    const res = await Promise.allSettled([settle(s, 10000), settle(s, 10000)]);
    assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(errNo(res.find((r) => r.status === 'rejected').reason), 50032);
    assert.equal(await scalar(pool, 'SELECT COUNT(*) FROM dbo.Payments WHERE SessionId = @s', { s: [sql.UniqueIdentifier, s] }), 1);
    await complete(OrderId);
  });

  test('gửi đơn đồng thời với thu tiền (Q-013), lặp 10 lần → không có đơn UNPAID trong phiên CLOSED', async () => {
    for (let i = 0; i < 10; i++) {
      const s = await newSession('01');
      const first = await submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
      await accept(first.OrderId);
      await requestPayment(s);
      const [settled, submitted] = await Promise.allSettled([
        settle(s, 100000),
        submit({ sessionId: s, items: [{ menuItemId: ids['Bánh croissant'], quantity: 1 }] }),
      ]);
      // Hoặc đơn mới vào trước (settle → 50033 vì đơn mới PENDING), hoặc settle trước (submit → 50031)
      if (settled.status === 'fulfilled') assert.equal(errNo(submitted.reason), 50031);
      else {
        assert.equal(errNo(settled.reason), 50033);
        assert.equal(submitted.status, 'fulfilled');
        await cancel(submitted.value.OrderId);
        await settle(s, 100000);
      }
      await complete(first.OrderId);
    }
    assert.deepEqual(await inventoryViolations(pool), []);
  });

  test('đóng bàn trống: có đơn → 50035; chỉ còn đơn hủy → đóng được (Q-018)', async () => {
    const s = await newSession('04');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Nước suối'], quantity: 1 }] });
    const close = () => pool.request().input('SessionId', sql.UniqueIdentifier, s).input('UserId', sql.Int, ctx.staffId).execute('dbo.sp_CloseEmptySession');
    await expectSqlError(close(), 50035);
    await cancel(OrderId);
    await expectSqlError(settle(s, 0), 50030);
    await close();
    await expectSqlError(close(), 50031);
  });
});

describe('sp_AdjustInventory', () => {
  test('không cho âm / dưới phần đang giữ; ghi ADJUST', async () => {
    const s = await newSession('05');
    const sua = await ing('Sữa tươi');
    const { OrderId } = await submit({ sessionId: s, items: [{ menuItemId: ids['Sữa tươi đường'], quantity: 1 }] });
    await expectSqlError(adjust(sua.id, { newQty: -1 }), 50042);
    await expectSqlError(adjust(sua.id, { newQty: 100 }), 50043);
    const r = await adjust(sua.id, { delta: 500 });
    assert.equal(r.output.BalanceAfter, sua.stock + 500);
    assert.equal(
      await scalar(pool, "SELECT TOP 1 Delta FROM dbo.InventoryTransactions WHERE IngredientId = @i AND Type = 'ADJUST' ORDER BY TxnId DESC", {
        i: [sql.Int, sua.id],
      }),
      500,
    );
    await cancel(OrderId);
  });
});
