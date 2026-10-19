// Integration test (SQL Server thật) giai đoạn 5 — ADR-006: đơn vị & giá vốn (F-031), bán thành phẩm (F-027), hao hụt (F-032),
// lô & FEFO (F-028, gồm thao tác ngẫu nhiên giữ Σ lô = tồn), nhà cung cấp & PO (F-030), dự báo nhập hàng (F-029).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let app, api, pool, admin, staff, ids, ing;

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ing = await ingredientIds();
  assert.equal((await api.post('/api/shifts/open').set(auth(staff)).send({ openingCash: 0 })).status, 201);
});

after(() => app.close());

async function ingredientIds() {
  const r = await pool.request().query('SELECT IngredientId, Name FROM dbo.Ingredients WHERE DeletedAt IS NULL');
  return Object.fromEntries(r.recordset.map((x) => [x.Name, x.IngredientId]));
}
const adminApi = (method, path, body) => api[method](path).set(auth(admin)).send(body);
const staffApi = (method, path, body) => api[method](path).set(auth(staff)).send(body);
const row = async (name) =>
  (await pool.request().query(`SELECT StockQty, ReservedQty, AvgCost, TrackLots FROM dbo.Ingredients WHERE Name = N'${name}' AND DeletedAt IS NULL`))
    .recordset[0];
const receive = async (lines, extra = {}) => {
  const r = await adminApi('post', '/api/admin/stock-receipts', { lines, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
};
async function sellAndComplete(items) {
  const r = await staffApi('post', '/api/orders/takeaway', { items, amountReceived: 5_000_000 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = await staffApi('post', `/api/orders/${r.body.order.orderId}/complete`);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return r.body.order.orderId;
}
const cogsOf = async (orderId) => (await pool.request().query(`SELECT MenuItemId, CogsAmount FROM dbo.OrderItems WHERE OrderId = ${orderId}`)).recordset;
const plusDays = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
async function newIngredient(name, unit, stockQty = 0) {
  const r = await adminApi('post', '/api/admin/ingredients', { name, unit, stockQty, lowStockThreshold: 0 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ing[name] = r.body.ingredientId;
  return r.body.ingredientId;
}

describe('Đơn vị & giá vốn bình quân (F-031)', () => {
  test('nhập 1 thùng (24 lon × 330 ml) → tồn +7.920 ml; giá gói quy ra giá / ml; đơn vị không quy được → 400', async () => {
    const before = await row('Sữa tươi');
    const r = await receive([{ ingredientId: ing['Sữa tươi'], packUnitCode: 'thùng', packQty: 1, packPrice: 792000 }]);
    assert.deepEqual([r.lines[0].qty, r.lines[0].unitCost, r.lines[0].packUnitCode, r.lines[0].packQty], [7920, 100, 'thùng', 1]);
    const after = await row('Sữa tươi');
    assert.equal(Number(after.StockQty) - Number(before.StockQty), 7920);
    assert.equal(Number(after.AvgCost), 100);
    const bad = await adminApi('post', '/api/admin/stock-receipts', { lines: [{ ingredientId: ing['Sữa tươi'], packUnitCode: 'kg', packQty: 1 }] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'UNIT_MISMATCH');
  });

  test('giá vốn bình quân đúng sau 2 lần nhập giá khác (tồn cũ chưa có giá coi như cùng giá lần nhập đầu)', async () => {
    await receive([{ ingredientId: ing['Cà phê cốt'], qty: 1000, unitCost: 100 }]);
    assert.equal(Number((await row('Cà phê cốt')).AvgCost), 100);
    await receive([{ ingredientId: ing['Cà phê cốt'], qty: 1000, unitCost: 200 }]);
    // (3.000 × 100 + 1.000 × 200) / 4.000 = 125
    assert.equal(Number((await row('Cà phê cốt')).AvgCost), 125);
  });

  test('hoàn tất ly cà phê → giá vốn dòng = 25 ml × giá cốt + 10 g × giá đường; giá đổi sau đó không tính lại đơn cũ; thiếu giá → NULL', async () => {
    await receive([{ ingredientId: ing['Đường'], qty: 1000, unitCost: 50 }]);
    const orderId = await sellAndComplete([{ menuItemId: ids['Cà phê đen'], quantity: 1 }]);
    assert.equal(Number((await cogsOf(orderId))[0].CogsAmount), 25 * 125 + 10 * 50);
    const ded = (
      await pool.request().query(`SELECT IngredientId, UnitCost, CostAmount FROM dbo.InventoryTransactions WHERE OrderId = ${orderId} AND Type = 'DEDUCT'`)
    ).recordset;
    assert.deepEqual(
      ded.map((d) => Number(d.CostAmount)).sort((a, b) => a - b),
      [500, 3125],
    );
    await receive([{ ingredientId: ing['Cà phê cốt'], qty: 1000, unitCost: 900 }]);
    assert.equal(Number((await cogsOf(orderId))[0].CogsAmount), 3625);
    const unknown = await sellAndComplete([{ menuItemId: ids['Trà đào'], quantity: 1 }]); // cốt trà đào chưa có giá nhập
    assert.equal((await cogsOf(unknown))[0].CogsAmount, null);
  });

  test('báo cáo COGS thực tế theo món + nguyên liệu; quản lý đơn vị: thêm / vòng lặp / đang dùng', async () => {
    const today = todayVn();
    const rep = (await adminApi('get', `/api/admin/reports/cogs?from=${today}&to=${today}`)).body;
    const den = rep.items.find((i) => i.name === 'Cà phê đen');
    assert.equal(den.cogs, 3625);
    assert.equal(den.marginPct, Math.round(((25000 - 3625) / 25000) * 1000) / 10);
    assert.equal(rep.items.find((i) => i.name === 'Trà đào').unknownQty, 1);
    assert.ok(rep.ingredients.some((i) => i.name === 'Cà phê cốt' && i.cost === 3125));

    assert.equal((await adminApi('put', '/api/admin/units/hộp1l', { name: 'hộp 1 lít', baseUnitCode: 'ml', factor: 1000 })).status, 200);
    assert.equal((await adminApi('put', '/api/admin/units/ml', { name: 'ml', baseUnitCode: 'hộp1l', factor: 0.001 })).status, 400);
    assert.equal((await adminApi('delete', '/api/admin/units/ml')).status, 409);
    assert.equal((await adminApi('delete', '/api/admin/units/hộp1l')).status, 200);
    assert.equal((await staffApi('get', '/api/admin/units')).status, 403);
  });
});

describe('Bán thành phẩm / phiếu sơ chế (F-027)', () => {
  test('công thức 100 g hạt + 1.000 ml nước → 900 ml cốt; pha ×2: hạt −200, nước −2.000, cốt +1.800; giá vốn mẻ chia đều', async () => {
    await newIngredient('Hạt cà phê', 'g');
    await newIngredient('Nước lọc', 'ml');
    await newIngredient('Cốt pha sẵn', 'ml');
    await receive([
      { ingredientId: ing['Hạt cà phê'], qty: 1000, unitCost: 200 },
      { ingredientId: ing['Nước lọc'], qty: 10000, unitCost: 1 },
    ]);
    const adv = await adminApi('put', `/api/admin/ingredients/${ing['Cốt pha sẵn']}/advanced`, { kind: 'SEMI', shelfLifeHours: 24, wastePercent: 0 });
    assert.equal(adv.body.kind, 'SEMI');
    const rec = await adminApi('put', `/api/admin/ingredients/${ing['Cốt pha sẵn']}/recipe`, {
      outputQty: 900,
      instructions: 'Pha phin lớn',
      lines: [
        { ingredientId: ing['Hạt cà phê'], qty: 100 },
        { ingredientId: ing['Nước lọc'], qty: 1000 },
      ],
    });
    assert.equal(rec.status, 200, JSON.stringify(rec.body));
    const pv = (await staffApi('get', `/api/prep/preview?semiId=${ing['Cốt pha sẵn']}&multiplier=2`)).body;
    assert.deepEqual([pv.outputQty, pv.canPrepare, pv.estimatedCost], [1800, true, 42000]);
    const b = await staffApi('post', '/api/prep/batches', { semiIngredientId: ing['Cốt pha sẵn'], multiplier: 2, note: 'Mẻ sáng' });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.deepEqual([b.body.outputQty, b.body.totalCost], [1800, 42000]);
    assert.equal(Number((await row('Hạt cà phê')).StockQty), 800);
    assert.equal(Number((await row('Nước lọc')).StockQty), 8000);
    const semi = await row('Cốt pha sẵn');
    assert.equal(Number(semi.StockQty), 1800);
    assert.equal(Number(semi.AvgCost), Math.round((42000 / 1800) * 10000) / 10000);
    assert.deepEqual(b.body.transactions.map((t) => [t.name, t.type, t.delta]).sort(), [
      ['Cốt pha sẵn', 'PREP_IN', 1800],
      ['Hạt cà phê', 'PREP_OUT', -200],
      ['Nước lọc', 'PREP_OUT', -2000],
    ]);
  });

  test('thiếu hạt → 409, không đổi gì; công thức A dùng B dùng A → 400 RECIPE_CYCLE', async () => {
    const r = await staffApi('post', '/api/prep/batches', { semiIngredientId: ing['Cốt pha sẵn'], multiplier: 20 });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'PREP_SHORT');
    assert.match(r.body.message, /Hạt cà phê/);
    assert.equal(Number((await row('Hạt cà phê')).StockQty), 800);
    assert.equal(Number((await row('Cốt pha sẵn')).StockQty), 1800);

    await newIngredient('Syrup cà phê', 'ml');
    assert.equal(
      (
        await adminApi('put', `/api/admin/ingredients/${ing['Syrup cà phê']}/recipe`, {
          outputQty: 500,
          lines: [{ ingredientId: ing['Cốt pha sẵn'], qty: 100 }],
        })
      ).status,
      200,
    );
    const cyc = await adminApi('put', `/api/admin/ingredients/${ing['Cốt pha sẵn']}/recipe`, {
      outputQty: 900,
      lines: [{ ingredientId: ing['Syrup cà phê'], qty: 10 }],
    });
    assert.equal(cyc.status, 400);
    assert.equal(cyc.body.code, 'RECIPE_CYCLE');
  });

  test('món có BOM trỏ vào bán thành phẩm: bán ly → trừ cốt 25 ml; giá vốn ly = 25 × giá cốt', async () => {
    const item = (await adminApi('post', '/api/admin/menu-items', { categoryId: 1, name: 'Cà phê pha sẵn', price: 20000 })).body;
    assert.equal((await adminApi('put', `/api/admin/menu-items/${item.menuItemId}/bom`, [{ ingredientId: ing['Cốt pha sẵn'], amount: 25 }])).status, 200);
    const orderId = await sellAndComplete([{ menuItemId: item.menuItemId, quantity: 1 }]);
    assert.equal(Number((await row('Cốt pha sẵn')).StockQty), 1775);
    assert.equal(Number((await cogsOf(orderId))[0].CogsAmount), Math.round(25 * (42000 / 1800)));
  });
});

describe('Hao hụt định mức & phiếu hủy (F-032)', () => {
  test('phiếu hủy: trừ tồn + ADJUST "WASTE:…" có giá vốn; hủy vượt tồn / lý do sai → lỗi', async () => {
    const before = Number((await row('Sữa đặc')).StockQty);
    const r = await staffApi('post', '/api/waste', { ingredientId: ing['Sữa đặc'], qty: 50, reason: 'SPILL', note: 'Đổ hộp' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(Number((await row('Sữa đặc')).StockQty), before - 50);
    const t = (await pool.request().query(`SELECT Type, Delta, Reason FROM dbo.InventoryTransactions WHERE WasteId = ${r.body.wasteId}`)).recordset[0];
    assert.deepEqual([t.Type, Number(t.Delta), t.Reason], ['ADJUST', -50, 'WASTE:SPILL — Đổ hộp']);
    assert.equal((await staffApi('post', '/api/waste', { ingredientId: ing['Sữa đặc'], qty: 1_000_000, reason: 'SPILL' })).body.code, 'BELOW_RESERVED');
    assert.equal((await staffApi('post', '/api/waste', { ingredientId: ing['Sữa đặc'], qty: 1, reason: 'LOST' })).status, 400);
  });

  test('báo cáo thất thoát: định mức 5 %, kiểm kê thiếu 120 ml → thất thoát = 120 − 5 % tiêu thụ, tô đỏ', async () => {
    await adminApi('put', `/api/admin/ingredients/${ing['Cà phê cốt']}/advanced`, { kind: 'RAW', wastePercent: 5 });
    const st = (await adminApi('post', '/api/admin/stocktakes', { ingredientIds: [ing['Cà phê cốt']] })).body;
    const cur = Number((await row('Cà phê cốt')).StockQty);
    await adminApi('put', `/api/admin/stocktakes/${st.stocktakeId}/lines`, [{ ingredientId: ing['Cà phê cốt'], countedQty: cur - 120 }]);
    assert.equal((await adminApi('post', `/api/admin/stocktakes/${st.stocktakeId}/post`)).status, 200);
    const today = todayVn();
    const rep = (await adminApi('get', `/api/admin/reports/loss?from=${today}&to=${today}`)).body;
    const r = rep.find((x) => x.name === 'Cà phê cốt');
    assert.equal(r.stocktakeShortage, 120);
    assert.equal(r.abnormal, Math.round((120 - r.consumption * 0.05) * 1000) / 1000);
    assert.equal(r.flagged, true);
  });
});

describe('Lô & hạn sử dụng — FEFO (F-028)', () => {
  test('bật theo lô → tồn hiện có thành lô mở đầu; hai lô có hạn: hủy 300 lấy lô hết hạn sớm trước, 400 vượt sang lô sau (2 dòng)', async () => {
    const r = await adminApi('put', `/api/admin/ingredients/${ing['Sữa tươi']}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true });
    assert.equal(r.body.trackLots, true);
    await receive([{ ingredientId: ing['Sữa tươi'], qty: 500, unitCost: 30, expiryDate: plusDays(3), lotCode: 'A' }]);
    await receive([{ ingredientId: ing['Sữa tươi'], qty: 500, unitCost: 40, expiryDate: plusDays(8), lotCode: 'B' }]);
    const w1 = (await staffApi('post', '/api/waste', { ingredientId: ing['Sữa tươi'], qty: 300, reason: 'QUALITY' })).body;
    const lots = (await adminApi('get', `/api/admin/ingredients/${ing['Sữa tươi']}/lots`)).body.lots;
    assert.equal(lots.find((l) => l.lotCode === 'A').qty, 200);
    const w2 = (await staffApi('post', '/api/waste', { ingredientId: ing['Sữa tươi'], qty: 400, reason: 'QUALITY' })).body;
    const rows = (await pool.request().query(`SELECT LotId, Delta FROM dbo.InventoryTransactions WHERE WasteId = ${w2.wasteId} ORDER BY TxnId`)).recordset;
    assert.equal(rows.length, 2);
    const after = (await adminApi('get', `/api/admin/ingredients/${ing['Sữa tươi']}/lots`)).body.lots;
    assert.ok(!after.some((l) => l.lotCode === 'A'), 'lô A đã đóng');
    assert.equal(after.find((l) => l.lotCode === 'B').qty, 300);
    assert.ok(w1.wasteId);
  });

  test('hoàn tất đơn trừ FEFO qua nhiều lô → nhiều dòng DEDUCT (khóa đơn × nguyên liệu × lô); FIFO dùng giá lô', async () => {
    await adminApi('put', '/api/admin/settings', { costMethod: 'FIFO' });
    const orderId = await sellAndComplete([{ menuItemId: ids['Sữa tươi đường'], quantity: 2 }]); // 400 ml: 300 từ lô B + 100 từ lô tồn đầu
    const ded = (
      await pool
        .request()
        .query(`SELECT LotId, Delta, UnitCost FROM dbo.InventoryTransactions WHERE OrderId = ${orderId} AND IngredientId = ${ing['Sữa tươi']} ORDER BY TxnId`)
    ).recordset;
    assert.deepEqual(
      ded.map((d) => Number(d.Delta)),
      [-300, -100],
    );
    assert.equal(Number(ded[0].UnitCost), 40);
    await adminApi('put', '/api/admin/settings', { costMethod: 'AVG' });
  });

  test('lô đã hết hạn không tính vào khả dụng; quầy thấy trong "sắp/đã hết hạn"; hủy lô → WasteLogs EXPIRED, đóng lô', async () => {
    const list = async () => (await staffApi('get', '/api/ops/ingredients')).body.find((i) => i.name === 'Sữa tươi');
    const before = await list();
    await receive([{ ingredientId: ing['Sữa tươi'], qty: 1000, unitCost: 30, expiryDate: plusDays(-1), lotCode: 'C' }]);
    const mid = await list();
    assert.equal(mid.stockQty - before.stockQty, 1000);
    assert.equal(mid.available, before.available, 'lô hết hạn không làm tăng khả dụng');
    assert.equal(mid.expiredQty, 1000);
    const exp = (await staffApi('get', '/api/lots/expiring?days=2')).body;
    const c = exp.find((l) => l.lotCode === 'C');
    assert.equal(c.daysLeft, -1);
    const w = await staffApi('post', `/api/lots/${c.lotId}/write-off`, {});
    assert.equal(w.status, 201, JSON.stringify(w.body));
    assert.equal(w.body.reason, 'EXPIRED');
    const last = await list();
    assert.equal(last.stockQty, before.stockQty);
    assert.equal(last.expiredQty, 0);
  });

  test('40 thao tác ngẫu nhiên (nhập có hạn, hủy, điều chỉnh, bán) vẫn giữ Σ lô = tồn', async () => {
    let seed = 7;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let k = 0; k < 40; k++) {
      const op = rnd(4);
      const stock = Number((await row('Sữa tươi')).StockQty);
      if (op === 0) await receive([{ ingredientId: ing['Sữa tươi'], qty: 50 + rnd(400), unitCost: 20 + rnd(30), expiryDate: plusDays(rnd(10) - 2) }]);
      else if (op === 1 && stock > 100) await staffApi('post', '/api/waste', { ingredientId: ing['Sữa tươi'], qty: 1 + rnd(80), reason: 'SPILL' });
      else if (op === 2) await adminApi('post', `/api/admin/ingredients/${ing['Sữa tươi']}/adjust`, { delta: rnd(2) ? 25 : -25, reason: 'Thử ngẫu nhiên' });
      else if (stock > 400) await sellAndComplete([{ menuItemId: ids['Sữa tươi đường'], quantity: 1 }]);
    }
    const bad = (
      await pool
        .request()
        .query(
          `SELECT i.StockQty, (SELECT SUM(Qty) FROM dbo.IngredientLots WHERE IngredientId = i.IngredientId AND IsClosed = 0) AS Lots FROM dbo.Ingredients i WHERE i.IngredientId = ${ing['Sữa tươi']}`,
        )
    ).recordset[0];
    assert.equal(Number(bad.StockQty), Number(bad.Lots));
  });
});

describe('Nhà cung cấp & đơn đặt hàng (F-030)', () => {
  let supplier, po;

  test('PO 10 hộp: nhận 6 → PARTIAL (+6.000 ml), nhận vượt → 409, nhận 4 → RECEIVED; lịch sử giá; hủy PO đã nhận → 409', async () => {
    await adminApi('put', '/api/admin/units/hộp1l', { name: 'hộp 1 lít', baseUnitCode: 'ml', factor: 1000 });
    const s = await adminApi('post', '/api/admin/suppliers', {
      name: 'Sữa Đà Lạt',
      phone: '0909000111',
      leadTimeDays: 1,
      deliveryDaysMask: 127,
      items: [{ ingredientId: ing['Sữa tươi'], packUnitCode: 'hộp1l', isPreferred: true, lastPrice: 32000 }],
    });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    supplier = s.body;
    assert.equal(supplier.items[0].packSize, 1000);
    const p = await adminApi('post', '/api/admin/purchase-orders', {
      supplierId: supplier.supplierId,
      lines: [{ ingredientId: ing['Sữa tươi'], orderedPacks: 10 }],
    });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    po = p.body;
    assert.deepEqual([po.status, po.lines[0].orderedBaseQty, po.lines[0].unitPrice, po.total], ['DRAFT', 10000, 32000, 320000]);
    assert.equal(
      (await staffApi('post', `/api/receiving/purchase-orders/${po.poId}/receive`, { lines: [{ poLineId: po.lines[0].poLineId, packs: 1 }] })).body.code,
      'PO_NOT_RECEIVABLE',
    );
    assert.equal((await adminApi('post', `/api/admin/purchase-orders/${po.poId}/send`)).body.status, 'SENT');
    const stock0 = Number((await row('Sữa tươi')).StockQty);
    const r1 = await staffApi('post', `/api/receiving/purchase-orders/${po.poId}/receive`, {
      lines: [{ poLineId: po.lines[0].poLineId, packs: 6, packPrice: 31000 }],
    });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(r1.body.po.status, 'PARTIAL');
    assert.equal(Number((await row('Sữa tươi')).StockQty) - stock0, 6000);
    const over = await staffApi('post', `/api/receiving/purchase-orders/${po.poId}/receive`, { lines: [{ poLineId: po.lines[0].poLineId, packs: 5 }] });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, 'OVER_RECEIPT');
    const r2 = await staffApi('post', `/api/receiving/purchase-orders/${po.poId}/receive`, { lines: [{ poLineId: po.lines[0].poLineId, packs: 4 }] });
    assert.equal(r2.body.po.status, 'RECEIVED');
    assert.equal((await adminApi('post', `/api/admin/purchase-orders/${po.poId}/cancel`)).body.code, 'PO_HAS_RECEIPTS');
    const sup = (await adminApi('get', '/api/admin/suppliers')).body.find((x) => x.supplierId === supplier.supplierId);
    assert.equal(sup.items[0].lastPrice, 32000);
    const today = todayVn();
    const rep = (await adminApi('get', `/api/admin/reports/suppliers?from=${today}&to=${today}`)).body;
    assert.equal(rep.prices.filter((x) => x.supplierId === supplier.supplierId).length, 2);
    assert.deepEqual(
      rep.performance.find((x) => x.supplierId === supplier.supplierId),
      { supplierId: supplier.supplierId, name: 'Sữa Đà Lạt', pos: 1, received: 1, onTimePct: 100, fillPct: 100 },
    );
  });

  test('nhận vượt có xác nhận được; hủy PO nháp → CANCELLED; quầy không sửa được nhà cung cấp', async () => {
    const p = (
      await adminApi('post', '/api/admin/purchase-orders', { supplierId: supplier.supplierId, lines: [{ ingredientId: ing['Sữa tươi'], orderedPacks: 2 }] })
    ).body;
    await adminApi('post', `/api/admin/purchase-orders/${p.poId}/send`);
    const r = await staffApi('post', `/api/receiving/purchase-orders/${p.poId}/receive`, {
      confirmOver: true,
      lines: [{ poLineId: p.lines[0].poLineId, packs: 3 }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.po.lines[0].receivedBaseQty, 3000);
    const d = (
      await adminApi('post', '/api/admin/purchase-orders', { supplierId: supplier.supplierId, lines: [{ ingredientId: ing['Sữa tươi'], orderedPacks: 1 }] })
    ).body;
    assert.equal((await adminApi('post', `/api/admin/purchase-orders/${d.poId}/cancel`)).body.status, 'CANCELLED');
    assert.equal((await staffApi('post', '/api/admin/suppliers', { name: 'x' })).status, 403);
  });
});

describe('Dự báo nhập hàng (F-029)', () => {
  test('tiêu thụ 4 tuần (thứ Bảy cao) → dự báo thứ Bảy > thứ Ba; đề xuất = nhu cầu + an toàn − khả dụng − đang về; chưa có lịch sử → không đề xuất', async () => {
    // 28 ngày qua: mỗi ngày một lượt thu (quán mở cửa) + tiêu thụ Sữa đặc (thứ Bảy 300 ml, ngày khác 100 ml)
    const sid = ing['Sữa đặc'];
    await pool.request().query(`
      DECLARE @d INT = 1, @at DATETIME2(0), @o INT, @code CHAR(8);
      WHILE @d <= 28
      BEGIN
        SET @at = DATEADD(HOUR, 5, CAST(DATEADD(DAY, -@d, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE)) AS DATETIME2(0)));
        SET @code = 'FC' + RIGHT('000000' + CAST(@d AS VARCHAR(6)), 6);
        INSERT dbo.Orders (OrderCode, Type, Status, PaymentStatus, PaymentMethod, TotalAmount, CreatedAt, PaidAt, CompletedAt)
        VALUES (@code, 'TAKE_AWAY', 'COMPLETED', 'PAID', 'CASH', 0, @at, @at, @at);
        SET @o = SCOPE_IDENTITY();
        INSERT dbo.Payments (OrderId, AmountDue, AmountReceived, ReceivedBy, PaidAt) VALUES (@o, 0, 0, 1, @at);
        INSERT dbo.InventoryTransactions (IngredientId, OrderId, Type, Delta, BalanceAfter, CreatedAt)
        VALUES (${sid}, @o, 'DEDUCT', CASE WHEN DATEPART(WEEKDAY, DATEADD(HOUR, 7, @at)) = 7 THEN -300 ELSE -100 END, 0, @at);
        SET @d += 1;
      END`);
    await pool.request().query('SET DATEFIRST 7');
    const run = await adminApi('post', '/api/admin/jobs/demand-forecast/run');
    assert.equal(run.body.status, 'OK', JSON.stringify(run.body));
    const series = (await adminApi('get', `/api/admin/inventory/forecast/${sid}`)).body;
    const sat = series.forecast.find((f) => f.dow === 6);
    const tue = series.forecast.find((f) => f.dow === 2);
    assert.equal(sat.qty, 300);
    assert.equal(tue.qty, 100);
    assert.equal(series.history.length, 29);

    const plan = (await adminApi('get', '/api/admin/inventory/replenishment')).body;
    const sd = plan.find((p) => p.ingredientId === sid);
    assert.equal(sd.enoughData, true);
    assert.equal(sd.suggestBase, Math.max(0, Math.round((sd.demand + sd.safety - sd.available - sd.incoming) * 1000) / 1000));
    assert.equal(sd.safety, Math.round(sd.demand * 0.2 * 1000) / 1000);
    assert.equal(plan.find((p) => p.name === 'Đào ngâm').enoughData, false);
    assert.equal(plan.find((p) => p.name === 'Đào ngâm').suggestBase, 0);

    // Có PO đang về → đề xuất giảm tương ứng
    const sup = (
      await adminApi('post', '/api/admin/suppliers', {
        name: 'NCC Sữa đặc',
        items: [{ ingredientId: sid, packUnitCode: 'ml', packSize: 1, isPreferred: true }],
      })
    ).body;
    const forced = plusDays(7);
    const before = (await adminApi('get', `/api/admin/inventory/replenishment?nextDeliveryDate=${forced}`)).body.find((p) => p.ingredientId === sid);
    const p = (await adminApi('post', '/api/admin/purchase-orders/from-suggestion', { supplierId: sup.supplierId, lines: [{ ingredientId: sid, packs: 800 }] }))
      .body;
    assert.equal(p.status, 'DRAFT');
    await adminApi('post', `/api/admin/purchase-orders/${p.poId}/send`);
    const afterPlan = (await adminApi('get', `/api/admin/inventory/replenishment?nextDeliveryDate=${forced}`)).body.find((x) => x.ingredientId === sid);
    assert.equal(afterPlan.incoming, 800);
    assert.equal(afterPlan.suggestBase, Math.max(0, Math.round((before.suggestBase - 800) * 1000) / 1000));
  });
});
