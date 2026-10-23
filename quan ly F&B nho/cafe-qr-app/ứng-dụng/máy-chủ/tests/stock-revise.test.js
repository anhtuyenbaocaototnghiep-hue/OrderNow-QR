// Integration test (SQL Server thật) F-048 — sửa / hủy phiếu nhập kho, sửa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt (ADR-009 D-39…D-42).
// Bất biến thêm (helpers/testDb.js): Σ IMPORT của phiếu = Σ dòng (0 nếu đã hủy), Σ giao dịch của phiếu kiểm kê = Σ chênh lệch (0 nếu đã hủy),
// số đã nhận của dòng PO = Σ dòng phiếu còn hiệu lực; cùng mọi bất biến kho cũ (Σ lô mở = tồn…).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let flushAudit;
let app, api, pool, admin, staff, lead, ids, ing;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const row = async (id) => {
  const [x] = await q1(`SELECT StockQty, ReservedQty, AvgCost, LastUnitCost FROM dbo.Ingredients WHERE IngredientId = ${id}`);
  return { stock: Number(x.StockQty), reserved: Number(x.ReservedQty), avg: Number(x.AvgCost), last: x.LastUnitCost === null ? null : Number(x.LastUnitCost) };
};
const openLots = async (id) =>
  q1(
    `SELECT LotId, LotCode, Qty, CONVERT(CHAR(10), ExpiryDate, 23) AS Expiry FROM dbo.IngredientLots
     WHERE IngredientId = ${id} AND IsClosed = 0 AND Qty > 0 ORDER BY LotId`,
  );
const receiptTxns = (receiptId, ingredientId) =>
  q1(`SELECT TxnId, Delta, BalanceAfter, Reason, UnitCost FROM dbo.InventoryTransactions
      WHERE StockReceiptId = ${receiptId} AND IngredientId = ${ingredientId} AND Type = 'IMPORT' ORDER BY TxnId`);
const sum = (rows, key = 'Delta') => rows.reduce((s, r) => s + Number(r[key]), 0);

/** Nguyên liệu mới tồn 0 — giá vốn bình quân dễ tính tay. */
async function newIngredient(name, unit = 'ml') {
  const r = await call(admin, 'post', '/api/admin/ingredients', { name, unit, lowStockThreshold: 0, stockQty: 0 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.ingredientId;
}
async function receive(lines, extra = {}) {
  const r = await call(admin, 'post', '/api/admin/stock-receipts', { lines, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const edit = (id, body, token = admin) => call(token, 'put', `/api/admin/stock-receipts/${id}`, body);
const voidReceipt = (id, reason, token = admin) => call(token, 'post', `/api/admin/stock-receipts/${id}/void`, reason === undefined ? {} : { reason });
async function stocktake(counts, token = admin, base = '/api/admin/stocktakes') {
  const ingredientIds = Object.keys(counts).map(Number);
  const st = await call(token, 'post', base, { ingredientIds });
  assert.equal(st.status, 201, JSON.stringify(st.body));
  const id = st.body.stocktakeId;
  assert.equal(
    (
      await call(
        token,
        'put',
        `${base}/${id}/lines`,
        ingredientIds.map((i) => ({ ingredientId: i, countedQty: counts[i] })),
      )
    ).status,
    200,
  );
  const p = await call(token, 'post', `${base}/${id}/post`);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  return id;
}
const voidStocktake = (id, reason, token = admin) => call(token, 'post', `/api/admin/stocktakes/${id}/void`, reason === undefined ? {} : { reason });

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ids = await app.ids();
  ing = Object.fromEntries((await q1('SELECT IngredientId, Name FROM dbo.Ingredients WHERE DeletedAt IS NULL')).map((x) => [x.Name, x.IngredientId]));
  const u = await call(admin, 'post', '/api/admin/users', { username: 'lead1', password: 'Pass@123', fullName: 'Trưởng ca 1', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  lead = await app.login('lead1', 'Pass@123');
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 0 })).status, 201);
});

after(() => app.close());

describe('Sửa / hủy phiếu nhập kho (F-048)', () => {
  let milk, sugar, r1;

  test('AC-048-01: sửa phiếu (sữa 1.000 → 800 ml, đường giữ nguyên) có lý do → tồn −200, giữ số phiếu, lịch sử "+800 / −1.000", đường không có giao dịch mới', async () => {
    milk = await newIngredient('NL sửa phiếu — sữa');
    sugar = await newIngredient('NL sửa phiếu — đường', 'g');
    r1 = await receive(
      [
        { ingredientId: milk, qty: 1000, unitCost: 30 },
        { ingredientId: sugar, qty: 500, unitCost: 20 },
      ],
      { supplier: 'NCC Một' },
    );
    const lines = [
      { ingredientId: milk, qty: 800, unitCost: 30 },
      { ingredientId: sugar, qty: 500, unitCost: 20 },
    ];
    const noReason = await edit(r1.receiptId, { lines });
    assert.equal(noReason.status, 400);
    const blank = await edit(r1.receiptId, { lines, reason: '   ' });
    assert.equal(blank.status, 400);
    const dup = await edit(r1.receiptId, { lines: [lines[0], lines[0]], reason: 'x' });
    assert.equal(dup.status, 400);
    const r = await edit(r1.receiptId, { lines, reason: 'Đếm lại theo hóa đơn', supplier: 'NCC Hai', note: 'Hóa đơn 0012' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.receiptId, r1.receiptId);
    assert.equal(r.body.status, 'POSTED');
    assert.equal(r.body.supplier, 'NCC Hai');
    assert.equal(r.body.note, 'Hóa đơn 0012');
    assert.equal(r.body.editReason, 'Đếm lại theo hóa đơn');
    assert.ok(r.body.editedBy && r.body.editedAt);
    assert.equal(r.body.lines.find((l) => l.ingredientId === milk).qty, 800);
    assert.equal((await row(milk)).stock, 800);
    assert.equal((await row(sugar)).stock, 500);
    const t = await receiptTxns(r1.receiptId, milk);
    assert.deepEqual(
      t.map((x) => [Number(x.Delta), Number(x.BalanceAfter)]),
      [
        [1000, 1000],
        [800, 1800],
        [-1000, 800],
      ],
    );
    assert.match(t[1].Reason, new RegExp(`^Sửa phiếu nhập #${r1.receiptId} — Đếm lại theo hóa đơn`));
    assert.equal((await receiptTxns(r1.receiptId, sugar)).length, 1);
    const list = (await call(admin, 'get', `/api/admin/stock-receipts?from=${todayVn()}&to=${todayVn()}`)).body;
    const item = list.find((x) => x.receiptId === r1.receiptId);
    assert.equal(item.edited, true);
    assert.equal(item.totalCost, 800 * 30 + 500 * 20);
  });

  test('AC-048-02: hủy phiếu kèm lý do → trừ lại kho, phiếu "Đã hủy" còn trong danh sách, Σ IMPORT = 0; hủy lại / sửa phiếu đã hủy → 409; thiếu lý do → 400', async () => {
    assert.equal((await voidReceipt(r1.receiptId)).status, 400);
    const v = await voidReceipt(r1.receiptId, 'Nhập nhầm phiếu');
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.status, 'VOIDED');
    assert.equal(v.body.voidReason, 'Nhập nhầm phiếu');
    assert.ok(v.body.voidedBy && v.body.voidedAt);
    assert.equal(v.body.lines.length, 2, 'dòng phiếu giữ nguyên để xem lại');
    assert.equal((await row(milk)).stock, 0);
    assert.equal((await row(sugar)).stock, 0);
    assert.equal(sum(await receiptTxns(r1.receiptId, milk)), 0);
    assert.equal(sum(await receiptTxns(r1.receiptId, sugar)), 0);
    assert.match((await receiptTxns(r1.receiptId, sugar)).at(-1).Reason, /^Hủy phiếu nhập #\d+ — Nhập nhầm phiếu/);
    const list = (await call(admin, 'get', `/api/admin/stock-receipts?from=${todayVn()}&to=${todayVn()}`)).body;
    assert.equal(list.find((x) => x.receiptId === r1.receiptId).status, 'VOIDED');
    const again = await voidReceipt(r1.receiptId, 'lần 2');
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'RECEIPT_VOIDED');
    const e = await edit(r1.receiptId, { lines: [{ ingredientId: milk, qty: 1, unitCost: 1 }], reason: 'x' });
    assert.equal(e.body.code, 'RECEIPT_VOIDED');
    assert.equal((await voidReceipt(999999, 'x')).status, 404);
  });

  test('AC-048-03: giá vốn bình quân tính ngược — A 1.000 × 30, B 1.000 × 40 → 35; hủy B → 30 (giá gần nhất 30); sửa A giá 20 → 20', async () => {
    const c = await newIngredient('NL giá vốn ngược');
    const a = await receive([{ ingredientId: c, qty: 1000, unitCost: 30 }]);
    const b = await receive([{ ingredientId: c, qty: 1000, unitCost: 40 }]);
    assert.deepEqual(await row(c), { stock: 2000, reserved: 0, avg: 35, last: 40 });
    assert.equal((await voidReceipt(b.receiptId, 'Trả hàng')).status, 200);
    assert.deepEqual(await row(c), { stock: 1000, reserved: 0, avg: 30, last: 30 });
    const r = await edit(a.receiptId, { lines: [{ ingredientId: c, qty: 1000, unitCost: 20 }], reason: 'Sai giá' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await row(c), { stock: 1000, reserved: 0, avg: 20, last: 20 });
    // Phiếu nhập sau (còn hiệu lực) giữ "giá gần nhất": sửa phiếu cũ không đè
    const d = await receive([{ ingredientId: c, qty: 1000, unitCost: 50 }]);
    assert.equal((await row(c)).last, 50);
    assert.equal((await edit(a.receiptId, { lines: [{ ingredientId: c, qty: 1000, unitCost: 25 }], reason: 'Sai giá lần 2' })).status, 200);
    assert.equal((await row(c)).last, 50);
    assert.equal((await row(c)).avg, 37.5);
    assert.ok(d.receiptId);
  });

  test('AC-048-04: hàng đã dùng → 409 RECEIPT_STOCK_USED (kể cả phần đang giữ cho đơn); đang kiểm kê → 409 STOCKTAKE_LOCKED; đã kiểm kê sau lúc nhập → 409 RECEIPT_AFTER_STOCKTAKE — không đổi gì', async () => {
    const d = await newIngredient('NL đã dùng');
    const r = await receive([{ ingredientId: d, qty: 1000, unitCost: 10 }]);
    assert.equal((await call(admin, 'post', `/api/admin/ingredients/${d}/adjust`, { delta: -300, reason: 'Đổ vỡ' })).status, 200);
    const used = await voidReceipt(r.receiptId, 'x');
    assert.equal(used.status, 409);
    assert.equal(used.body.code, 'RECEIPT_STOCK_USED');
    assert.deepEqual(used.body.details.items, ['NL đã dùng']);
    assert.match(used.body.message, /NL đã dùng/);
    assert.equal((await edit(r.receiptId, { lines: [{ ingredientId: d, qty: 200, unitCost: 10 }], reason: 'x' })).body.code, 'RECEIPT_STOCK_USED');
    assert.equal((await row(d)).stock, 700);
    assert.equal((await edit(r.receiptId, { lines: [{ ingredientId: d, qty: 800, unitCost: 10 }], reason: 'Giảm còn 800' })).status, 200);
    assert.equal((await row(d)).stock, 500);

    // Phần đang giữ cho đơn chưa hoàn tất: tồn chỉ còn đúng hàng của phiếu, đơn mang đi giữ 50 ml cà phê cốt
    const cot = ing['Cà phê cốt'];
    const rc = await receive([{ ingredientId: cot, qty: 500, unitCost: 100 }]);
    assert.equal((await call(admin, 'post', `/api/admin/ingredients/${cot}/adjust`, { newQty: 500, reason: 'Chỉ còn hàng phiếu mới' })).status, 200);
    const o = await call(staff, 'post', '/api/orders/takeaway', { items: [{ menuItemId: ids['Cà phê đen'], quantity: 2 }], amountReceived: 500_000 });
    assert.equal(o.status, 201, JSON.stringify(o.body));
    assert.equal((await row(cot)).reserved, 50);
    const reserved = await edit(rc.receiptId, { lines: [{ ingredientId: cot, qty: 20, unitCost: 100 }], reason: 'x' });
    assert.equal(reserved.body.code, 'RECEIPT_STOCK_USED');
    assert.equal((await call(staff, 'post', `/api/orders/${o.body.order.orderId}/complete`)).status, 200);

    // Kiểm kê
    const e = await newIngredient('NL đã kiểm kê');
    const re = await receive([{ ingredientId: e, qty: 100, unitCost: 5 }]);
    const draft = await call(admin, 'post', '/api/admin/stocktakes', { ingredientIds: [e] });
    const locked = await voidReceipt(re.receiptId, 'x');
    assert.equal(locked.body.code, 'STOCKTAKE_LOCKED');
    assert.match(locked.body.message, /NL đã kiểm kê/);
    assert.equal((await call(admin, 'delete', `/api/admin/stocktakes/${draft.body.stocktakeId}`)).status, 200);
    await stocktake({ [e]: 100 });
    const after = await voidReceipt(re.receiptId, 'x');
    assert.equal(after.status, 409);
    assert.equal(after.body.code, 'RECEIPT_AFTER_STOCKTAKE');
    assert.match(after.body.message, /NL đã kiểm kê/);
    assert.equal((await row(e)).stock, 100);
  });

  test('AC-048-05: nguyên liệu theo lô — sửa dòng → lô cũ đóng, lô mới đúng SL / hạn / mã; lô đã dùng → 409 RECEIPT_LOT_USED; hủy phiếu lô còn nguyên → đóng lô; Σ lô = tồn', async () => {
    const f = await newIngredient('NL theo lô');
    assert.equal((await call(admin, 'put', `/api/admin/ingredients/${f}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true })).status, 200);
    const r = await receive([{ ingredientId: f, qty: 1000, unitCost: 10, expiryDate: '2099-01-10', lotCode: 'L1' }]);
    const e = await edit(r.receiptId, { lines: [{ ingredientId: f, qty: 600, unitCost: 10, expiryDate: '2099-02-20', lotCode: 'L2' }], reason: 'Sai hạn' });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.equal(e.body.lines[0].lotCode, 'L2');
    assert.equal(e.body.lines[0].expiryDate, '2099-02-20');
    assert.deepEqual(
      (await openLots(f)).map((l) => [l.LotCode, Number(l.Qty), l.Expiry]),
      [['L2', 600, '2099-02-20']],
    );
    assert.equal((await row(f)).stock, 600);
    // Không đổi gì (dòng giống hệt) → không có giao dịch mới
    const n = (await receiptTxns(r.receiptId, f)).length;
    assert.equal(
      (
        await edit(r.receiptId, {
          lines: [{ ingredientId: f, qty: 600, unitCost: 10, expiryDate: '2099-02-20', lotCode: 'L2' }],
          reason: 'Đổi ghi chú',
          note: 'x',
        })
      ).status,
      200,
    );
    assert.equal((await receiptTxns(r.receiptId, f)).length, n);

    assert.equal((await call(staff, 'post', '/api/waste', { ingredientId: f, qty: 100, reason: 'SPILL' })).status, 201);
    const usedLot = await voidReceipt(r.receiptId, 'x');
    assert.equal(usedLot.status, 409);
    assert.equal(usedLot.body.code, 'RECEIPT_LOT_USED');
    const r2 = await receive([{ ingredientId: f, qty: 300, unitCost: 12, lotCode: 'L3' }]);
    assert.equal((await voidReceipt(r2.receiptId, 'Hàng lỗi')).status, 200);
    const lots = await openLots(f);
    assert.deepEqual(
      lots.map((l) => l.LotCode),
      ['L2'],
    );
    assert.equal((await row(f)).stock, sum(lots, 'Qty'));
    assert.equal((await row(f)).stock, 500);
  });

  test('AC-048-06: phiếu nhận theo đơn đặt hàng — sửa giảm → PARTIAL; tăng vượt → 409 OVER_RECEIPT, xác nhận → được; hủy → SENT, đã nhận 0, hủy PO được; giá NCC của phiếu bị bỏ', async () => {
    const g = await newIngredient('NL đặt hàng');
    assert.ok([200, 201].includes((await call(admin, 'put', '/api/admin/units/hộp1l', { name: 'hộp 1 lít', baseUnitCode: 'ml', factor: 1000 })).status));
    const s = await call(admin, 'post', '/api/admin/suppliers', {
      name: 'NCC sửa phiếu',
      phone: '0909000222',
      leadTimeDays: 1,
      deliveryDaysMask: 127,
      items: [{ ingredientId: g, packUnitCode: 'hộp1l', isPreferred: true, lastPrice: 30000 }],
    });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    const p = (await call(admin, 'post', '/api/admin/purchase-orders', { supplierId: s.body.supplierId, lines: [{ ingredientId: g, orderedPacks: 2 }] })).body;
    assert.equal((await call(admin, 'post', `/api/admin/purchase-orders/${p.poId}/send`)).body.status, 'SENT');
    const rcv = await call(staff, 'post', `/api/receiving/purchase-orders/${p.poId}/receive`, {
      lines: [{ poLineId: p.lines[0].poLineId, packs: 2, packPrice: 31000 }],
    });
    assert.equal(rcv.status, 201, JSON.stringify(rcv.body));
    assert.equal(rcv.body.po.status, 'RECEIVED');
    const id = rcv.body.receipt.receiptId;
    const poRow = async () =>
      (await q1(`SELECT p.Status, l.ReceivedBaseQty FROM dbo.PurchaseOrders p JOIN dbo.PurchaseOrderLines l ON l.PoId = p.PoId WHERE p.PoId = ${p.poId}`)).map(
        (x) => [x.Status, Number(x.ReceivedBaseQty)],
      )[0];

    const down = await edit(id, { lines: [{ ingredientId: g, packUnitCode: 'hộp1l', packQty: 1, packPrice: 31000 }], reason: 'Giao thiếu 1 hộp' });
    assert.equal(down.status, 200, JSON.stringify(down.body));
    assert.deepEqual(await poRow(), ['PARTIAL', 1000]);
    assert.equal((await row(g)).stock, 1000);
    const lineUp = [{ ingredientId: g, packUnitCode: 'hộp1l', packQty: 3, packPrice: 31000 }];
    const over = await edit(id, { lines: lineUp, reason: 'Giao dư' });
    assert.equal(over.status, 409);
    assert.equal(over.body.code, 'OVER_RECEIPT');
    assert.equal((await edit(id, { lines: lineUp, reason: 'Giao dư', confirmOver: true })).status, 200);
    assert.deepEqual(await poRow(), ['RECEIVED', 3000]);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.SupplierPriceHistory WHERE ReceiptId = ${id}`))[0].n, 1);

    assert.equal((await voidReceipt(id, 'Giao nhầm quán')).status, 200);
    assert.deepEqual(await poRow(), ['SENT', 0]);
    assert.equal((await row(g)).stock, 0);
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.SupplierPriceHistory WHERE ReceiptId = ${id}`))[0].n, 0);
    assert.equal((await call(admin, 'post', `/api/admin/purchase-orders/${p.poId}/cancel`)).body.status, 'CANCELLED');
  });

  test('AC-048-06 (review G3): phiếu nhận theo PO, gói 12 lít khác bảng đơn vị (thùng = 24 lon) — sửa chỉ ghi chú không đổi SL / giá / PO; sửa số gói quy theo quy cách của PO', async () => {
    const w = await newIngredient('NL thùng 12 lít');
    const s = await call(admin, 'post', '/api/admin/suppliers', {
      name: 'NCC thùng 12 lít',
      items: [{ ingredientId: w, packUnitCode: 'thùng', packSize: 12000, isPreferred: true, lastPrice: 360000 }],
    });
    assert.equal(s.status, 201, JSON.stringify(s.body));
    const p = (await call(admin, 'post', '/api/admin/purchase-orders', { supplierId: s.body.supplierId, lines: [{ ingredientId: w, orderedPacks: 2 }] })).body;
    await call(admin, 'post', `/api/admin/purchase-orders/${p.poId}/send`);
    const rcv = await call(staff, 'post', `/api/receiving/purchase-orders/${p.poId}/receive`, { lines: [{ poLineId: p.lines[0].poLineId, packs: 2 }] });
    assert.equal(rcv.status, 201, JSON.stringify(rcv.body));
    const id = rcv.body.receipt.receiptId;
    assert.deepEqual([(await row(w)).stock, rcv.body.receipt.lines[0].unitCost], [24000, 30]);
    const poRow = async () =>
      (await q1(`SELECT p.Status, l.ReceivedBaseQty FROM dbo.PurchaseOrders p JOIN dbo.PurchaseOrderLines l ON l.PoId = p.PoId WHERE p.PoId = ${p.poId}`)).map(
        (x) => [x.Status, Number(x.ReceivedBaseQty)],
      )[0];
    // Đúng dạng dòng màn Sửa gửi lên (điền sẵn theo gói như lúc nhận), chỉ đổi ghi chú
    const line = { ingredientId: w, packUnitCode: 'thùng', packQty: 2, packPrice: 360000, expiryDate: null, lotCode: null };
    const n = (await receiptTxns(id, w)).length;
    const noteOnly = await edit(id, { lines: [line], reason: 'Bổ sung số hóa đơn', note: 'HĐ 0099' });
    assert.equal(noteOnly.status, 200, JSON.stringify(noteOnly.body));
    assert.equal(noteOnly.body.note, 'HĐ 0099');
    assert.equal((await receiptTxns(id, w)).length, n, 'không có giao dịch kho mới');
    assert.equal((await row(w)).stock, 24000);
    assert.deepEqual(await poRow(), ['RECEIVED', 24000]);
    const one = await edit(id, { lines: [{ ...line, packQty: 1 }], reason: 'Giao thiếu 1 thùng' });
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.deepEqual([one.body.lines[0].qty, one.body.lines[0].unitCost], [12000, 30]);
    assert.equal((await row(w)).stock, 12000);
    assert.deepEqual(await poRow(), ['PARTIAL', 12000]);
    // Không gửi ghi chú = giữ nguyên
    assert.equal((await edit(id, { lines: [{ ...line, packQty: 1 }], reason: 'Không đổi gì' })).body.note, 'HĐ 0099');
  });

  test('AC-048-05 (review G3): sửa giá dòng theo lô để trống hạn dùng → hạn tính theo NGÀY NHẬP gốc (không gia hạn hàng), lô mới giữ thời điểm nhập gốc', async () => {
    const x = await newIngredient('NL hạn 72 giờ');
    assert.equal(
      (await call(admin, 'put', `/api/admin/ingredients/${x}/advanced`, { kind: 'RAW', shelfLifeHours: 72, wastePercent: 0, trackLots: true })).status,
      200,
    );
    const r = await receive([{ ingredientId: x, qty: 500, unitCost: 10 }]);
    // Giả lập phiếu nhập từ 2 ngày trước (lô + phiếu cùng lùi 2 ngày)
    await q1(`UPDATE dbo.StockReceipts SET ReceivedAt = DATEADD(DAY, -2, ReceivedAt) WHERE ReceiptId = ${r.receiptId};
              UPDATE dbo.IngredientLots SET ExpiryDate = DATEADD(DAY, -2, ExpiryDate), ReceivedAt = DATEADD(DAY, -2, ReceivedAt)
              WHERE Source = 'RECEIPT' AND SourceId = ${r.receiptId}; SELECT 1 AS ok`);
    const [before] = await openLots(x);
    const e = await edit(r.receiptId, { lines: [{ ingredientId: x, qty: 500, unitCost: 12 }], reason: 'Sai giá' });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    const [after] = await openLots(x);
    assert.notEqual(after.LotId, before.LotId);
    assert.equal(after.Expiry, before.Expiry, 'hạn dùng không được gia hạn');
    const [t] = await q1(`SELECT CONVERT(CHAR(19), l.ReceivedAt, 120) AS a, CONVERT(CHAR(19), sr.ReceivedAt, 120) AS b
                          FROM dbo.IngredientLots l JOIN dbo.StockReceipts sr ON sr.ReceiptId = l.SourceId WHERE l.LotId = ${after.LotId}`);
    assert.equal(t.a, t.b);
  });
});

describe('Sửa / hủy phiếu kiểm kê (F-048)', () => {
  test('AC-048-07: phiếu nháp — sửa ghi chú, thêm / bớt nguyên liệu (giữ số đếm dòng còn lại), bớt hết → 400; trưởng ca sửa / xóa ở quầy; phiếu đã chốt → 409', async () => {
    const milk = ing['Sữa tươi'];
    const sugar = ing['Đường'];
    const st = (await call(admin, 'post', '/api/admin/stocktakes', { ingredientIds: [milk], note: 'Cũ' })).body;
    assert.equal((await call(admin, 'put', `/api/admin/stocktakes/${st.stocktakeId}/lines`, [{ ingredientId: milk, countedQty: 123 }])).status, 200);
    const e = await call(admin, 'put', `/api/admin/stocktakes/${st.stocktakeId}`, { ingredientIds: [milk, sugar], note: 'Kiểm cuối tuần' });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.equal(e.body.note, 'Kiểm cuối tuần');
    assert.deepEqual(e.body.lines.map((l) => l.ingredientId).sort(), [milk, sugar].sort());
    assert.equal(e.body.lines.find((l) => l.ingredientId === milk).countedQty, 123);
    assert.equal(e.body.lines.find((l) => l.ingredientId === sugar).countedQty, null);
    const e2 = await call(lead, 'put', `/api/ops/stocktakes/${st.stocktakeId}`, { ingredientIds: [sugar] });
    assert.equal(e2.status, 200, JSON.stringify(e2.body));
    assert.deepEqual(
      e2.body.lines.map((l) => l.ingredientId),
      [sugar],
    );
    assert.equal((await call(admin, 'put', `/api/admin/stocktakes/${st.stocktakeId}`, { ingredientIds: [] })).status, 400);
    assert.equal((await call(staff, 'put', `/api/ops/stocktakes/${st.stocktakeId}`, { ingredientIds: [milk] })).status, 403);
    assert.equal((await call(lead, 'delete', `/api/ops/stocktakes/${st.stocktakeId}`)).status, 200);
    assert.equal((await call(admin, 'put', `/api/admin/stocktakes/${st.stocktakeId}`, { ingredientIds: [milk] })).status, 404);

    const posted = await stocktake({ [sugar]: Number((await row(sugar)).stock) });
    const late = await call(admin, 'put', `/api/admin/stocktakes/${posted}`, { ingredientIds: [sugar] });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'STOCKTAKE_NOT_DRAFT');
  });

  test('AC-048-08: hủy phiếu đã chốt (thiếu 100 ml, thừa 50 g) → tồn +100 / −50, "Đã hủy", hao hụt / thất thoát kỳ không tính; theo lô: trả đúng lô bị trừ, bỏ lô thừa', async () => {
    const h = await newIngredient('NL kiểm kê thiếu');
    const i = await newIngredient('NL kiểm kê thừa', 'g');
    await receive([
      { ingredientId: h, qty: 1000, unitCost: 30 },
      { ingredientId: i, qty: 500, unitCost: 20 },
    ]);
    const st = await stocktake({ [h]: 900, [i]: 550 });
    assert.deepEqual([(await row(h)).stock, (await row(i)).stock], [900, 550]);
    const today = todayVn();
    const shrink = async () => (await call(admin, 'get', `/api/admin/reports/costs?from=${today}&to=${today}`)).body.shrinkage.map((x) => x.ingredientId);
    const loss = async () =>
      (await call(admin, 'get', `/api/admin/reports/loss?from=${today}&to=${today}`)).body.find((x) => x.ingredientId === h)?.stocktakeShortage ?? 0;
    assert.ok((await shrink()).includes(h));
    assert.equal(await loss(), 100);

    assert.equal((await voidStocktake(st)).status, 400);
    const v = await voidStocktake(st, 'Đếm nhầm kệ');
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.equal(v.body.status, 'VOIDED');
    assert.equal(v.body.voidReason, 'Đếm nhầm kệ');
    assert.deepEqual([(await row(h)).stock, (await row(i)).stock], [1000, 500]);
    assert.ok(!(await shrink()).includes(h));
    assert.equal(await loss(), 0);
    const t = await q1(`SELECT SUM(Delta) AS d, MAX(Reason) AS r FROM dbo.InventoryTransactions WHERE StocktakeId = ${st} AND IngredientId = ${h}`);
    assert.equal(Number(t[0].d), 0);
    assert.equal((await voidStocktake(st, 'lần 2')).body.code, 'STOCKTAKE_NOT_POSTED');

    // Theo lô: thiếu → trả lại đúng lô đã bị trừ; thừa → bỏ lô "Kiểm kê"
    const j = await newIngredient('NL kiểm kê theo lô');
    assert.equal((await call(admin, 'put', `/api/admin/ingredients/${j}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true })).status, 200);
    await receive([{ ingredientId: j, qty: 1000, unitCost: 10, lotCode: 'LA', expiryDate: '2099-03-01' }]);
    const before = await openLots(j);
    const s1 = await stocktake({ [j]: 900 });
    assert.equal(Number((await openLots(j))[0].Qty), 900);
    assert.equal((await voidStocktake(s1, 'Đếm thiếu')).status, 200);
    assert.deepEqual(await openLots(j), before);
    const s2 = await stocktake({ [j]: 1100 });
    assert.equal((await openLots(j)).length, 2);
    assert.equal((await voidStocktake(s2, 'Đếm thừa')).status, 200);
    assert.deepEqual(await openLots(j), before);
    assert.equal((await row(j)).stock, 1000);
  });

  test('AC-048-09: chỉ hủy phiếu chốt gần nhất (409 STOCKTAKE_NOT_LATEST); phần thừa đã dùng → 409 STOCKTAKE_SURPLUS_USED; phiếu nháp → 409 STOCKTAKE_NOT_POSTED', async () => {
    const k = await newIngredient('NL kiểm kê hai lần');
    await receive([{ ingredientId: k, qty: 1000, unitCost: 10 }]);
    const s1 = await stocktake({ [k]: 950 });
    const s2 = await stocktake({ [k]: 940 });
    const notLatest = await voidStocktake(s1, 'x');
    assert.equal(notLatest.status, 409);
    assert.equal(notLatest.body.code, 'STOCKTAKE_NOT_LATEST');
    assert.match(notLatest.body.message, /NL kiểm kê hai lần/);
    assert.equal((await voidStocktake(s2, 'Sai')).status, 200);
    assert.equal((await voidStocktake(s1, 'Sai')).status, 200);
    assert.equal((await row(k)).stock, 1000);

    const s3 = await stocktake({ [k]: 1050 });
    assert.equal((await call(admin, 'post', `/api/admin/ingredients/${k}/adjust`, { newQty: 30, reason: 'Dùng hết' })).status, 200);
    const used = await voidStocktake(s3, 'x');
    assert.equal(used.status, 409);
    assert.equal(used.body.code, 'STOCKTAKE_SURPLUS_USED');
    assert.equal((await row(k)).stock, 30);

    const draft = (await call(admin, 'post', '/api/admin/stocktakes', { ingredientIds: [k] })).body.stocktakeId;
    assert.equal((await voidStocktake(draft, 'x')).body.code, 'STOCKTAKE_NOT_POSTED');
    assert.equal((await call(admin, 'delete', `/api/admin/stocktakes/${draft}`)).status, 200);
    assert.equal((await voidStocktake(999999, 'x')).status, 404);
  });

  test('AC-048-08 / 09 (review G3): hủy kiểm kê khi nguyên liệu đang trong phiếu nháp khác → 409 STOCKTAKE_LOCKED có tên; tắt rồi bật lại theo lô → không mở lại lô cũ, Σ lô = tồn', async () => {
    const y = await newIngredient('NL bật tắt lô');
    assert.equal((await call(admin, 'put', `/api/admin/ingredients/${y}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: true })).status, 200);
    await receive([{ ingredientId: y, qty: 1000, unitCost: 10, lotCode: 'L1' }]);
    const st = await stocktake({ [y]: 900 });
    const draft = (await call(admin, 'post', '/api/admin/stocktakes', { ingredientIds: [y] })).body.stocktakeId;
    const locked = await voidStocktake(st, 'x');
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'STOCKTAKE_LOCKED');
    assert.match(locked.body.message, /NL bật tắt lô/);
    assert.equal((await call(admin, 'delete', `/api/admin/stocktakes/${draft}`)).status, 200);

    // Tắt rồi bật lại theo lô: lô L1 (900) bị đóng nhưng giữ số, tồn vào lô "Tồn đầu" 900
    for (const on of [false, true]) {
      assert.equal((await call(admin, 'put', `/api/admin/ingredients/${y}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: on })).status, 200);
    }
    assert.equal((await voidStocktake(st, 'Đếm sai')).status, 200);
    const lots = await openLots(y);
    assert.equal((await row(y)).stock, 1000);
    assert.equal(sum(lots, 'Qty'), 1000, 'Σ lô mở = tồn');
    assert.ok(!lots.some((l) => l.LotCode === 'L1'), 'lô cũ đã đóng không mở lại');
    // Lô L1 đóng mà còn số là hành vi có sẵn của "tắt theo lô" (sp_SetTrackLots — DEF-013, ngoài phạm vi F-048): tắt theo lô để bất biến CLOSED_LOT_HAS_QTY không áp
    assert.equal((await call(admin, 'put', `/api/admin/ingredients/${y}/advanced`, { kind: 'RAW', wastePercent: 0, trackLots: false })).status, 200);
  });

  test('AC-048-10: nhân viên / trưởng ca không sửa / hủy phiếu nhập, không hủy kiểm kê (403); nhật ký thao tác có sửa / hủy, ảnh "trước" của phiếu nhập có dòng', async () => {
    const m = await newIngredient('NL quyền');
    const r = await receive([{ ingredientId: m, qty: 100, unitCost: 10 }]);
    const st = await stocktake({ [m]: 90 });
    for (const token of [staff, lead]) {
      assert.equal((await edit(r.receiptId, { lines: [{ ingredientId: m, qty: 50, unitCost: 10 }], reason: 'x' }, token)).status, 403);
      assert.equal((await voidReceipt(r.receiptId, 'x', token)).status, 403);
      assert.equal((await voidStocktake(st, 'x', token)).status, 403);
    }
    assert.equal((await call(lead, 'post', `/api/ops/stocktakes/${st}/void`, { reason: 'x' })).status, 404);
    assert.equal((await voidStocktake(st, 'Đếm lại')).status, 200);
    assert.equal((await edit(r.receiptId, { lines: [{ ingredientId: m, qty: 80, unitCost: 10 }], reason: 'Sửa số' })).status, 200);
    assert.equal((await voidReceipt(r.receiptId, 'Hủy')).status, 200);
    await flushAudit();
    const logs = await q1(
      `SELECT Action, EntityId, BeforeJson FROM dbo.AuditLogs
       WHERE (Action IN ('stock-receipts.update', 'stock-receipts.void') AND EntityId = '${r.receiptId}') OR (Action = 'stocktakes.void' AND EntityId = '${st}')
       ORDER BY AuditId`,
    );
    assert.deepEqual(
      logs.map((x) => x.Action),
      ['stocktakes.void', 'stock-receipts.update', 'stock-receipts.void'],
    );
    const beforeEdit = JSON.parse(logs[1].BeforeJson);
    assert.equal(beforeEdit.lines[0].qty, 100);
    assert.equal(JSON.parse(logs[2].BeforeJson).lines[0].qty, 80);
  });
});
