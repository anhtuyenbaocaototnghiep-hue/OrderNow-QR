// Integration test (SQL Server thật) F-050 — hủy / sửa khoản sổ quỹ đã duyệt khi ca còn mở, quyền như duyệt (ADR-010 D-44, D-45).
// Bất biến (helpers/testDb.js): SHIFT_EXPECTED_CASH (F-033 — ca đã đóng đúng công thức, khoản đã hủy không tính), CASH_REPLACE_LINK.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp, todayVn } from './helpers/harness.js';

let flushAudit;
let app, api, pool, admin, staff, lead, users, cats;

const q1 = async (sqlText) => (await pool.request().query(sqlText)).recordset;
const call = (token, method, path, body) => {
  const req = api[method](path).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const shift = async () => (await call(staff, 'get', '/api/shifts/current')).body.shift;
async function cash(token, catName, amount, reason = 'test') {
  const r = await call(token, 'post', '/api/cash-transactions', { categoryId: cats[catName], amount, reason });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const voidTxn = (id, body, token = lead) => call(token, 'post', `/api/cash-transactions/${id}/void`, body);

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  ({ flushAudit } = await import('../src/middleware/audit.js'));
  admin = await app.login('admin', 'Admin@123');
  for (const u of ['lead1', 'lead2']) {
    const r = await call(admin, 'post', '/api/admin/users', { username: u, password: 'Pass@123', fullName: `Trưởng ca ${u}`, role: 'MANAGER' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  users = Object.fromEntries((await q1('SELECT UserId, Username FROM dbo.Users')).map((u) => [u.Username, u.UserId]));
  staff = await app.login('staff1', 'Staff@123');
  lead = await app.login('lead1', 'Pass@123');
  cats = Object.fromEntries((await call(staff, 'get', '/api/cash-categories')).body.map((c) => [c.name, c.categoryId]));
  assert.equal((await call(staff, 'post', '/api/shifts/open', { openingCash: 5_000_000 })).status, 201);
});

after(() => app.close());

describe('Hủy / sửa khoản sổ quỹ đã duyệt (F-050)', () => {
  test('AC-050-01: trưởng ca hủy khoản chi 50.000đ đã duyệt (nhân viên ghi) → "Đã hủy" kèm người / lúc / lý do, két cộng lại 50.000đ, sổ quỹ quản lý không tính', async () => {
    const s0 = await shift();
    const t = await cash(staff, 'Mua đá', 50_000, 'mua 2 bao đá');
    assert.equal((await shift()).expectedCash, s0.expectedCash - 50_000);
    const r = await voidTxn(t.cashTxnId, { reason: 'ghi trùng' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(
      [r.body.voided.status, r.body.voided.voidReason, r.body.voided.voidedBy.userId, r.body.replacement],
      ['VOIDED', 'ghi trùng', users.lead1, null],
    );
    assert.ok(r.body.voided.voidedAt);
    const s1 = await shift();
    assert.equal(s1.expectedCash, s0.expectedCash);
    assert.equal(s1.cashBookOut, s0.cashBookOut);
    const book = (await call(admin, 'get', `/api/admin/cash-transactions?from=${todayVn()}&to=${todayVn()}`)).body;
    assert.equal(book.rows.find((x) => x.cashTxnId === t.cashTxnId).status, 'VOIDED');
    assert.ok(!book.summary.byCategory.some((c) => c.name === 'Mua đá' && c.count > 0), 'khoản đã hủy không vào tổng');
    await flushAudit();
    assert.equal((await q1(`SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'cash.void' AND EntityId = '${t.cashTxnId}'`))[0].n, 1);
  });

  test('AC-050-02: sửa 50.000đ → 80.000đ: khoản cũ "Đã hủy", khoản mới đã duyệt ghi "(thay khoản #N)", két chỉ trừ 80.000đ; sửa thành 800.000đ → khoản mới chờ duyệt, két chưa trừ, đóng ca → 409 CASH_PENDING', async () => {
    const s0 = await shift();
    const t = await cash(staff, 'Mua đá', 50_000, 'mua 2 bao đá');
    const r = await voidTxn(t.cashTxnId, { reason: 'ghi nhầm số tiền', replacement: { categoryId: cats['Mua đá'], amount: 80_000, reason: 'mua 3 bao đá' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const n = r.body.replacement;
    assert.deepEqual([n.status, n.amount, n.reason, n.replacesId], ['APPROVED', 80_000, `mua 3 bao đá (thay khoản #${t.cashTxnId})`, t.cashTxnId]);
    assert.deepEqual([r.body.voided.status, r.body.voided.replacedById], ['VOIDED', n.cashTxnId]);
    assert.equal(n.createdBy.userId, users.lead1, 'khoản thay thế do người sửa ghi');
    assert.equal((await shift()).expectedCash, s0.expectedCash - 80_000);

    const big = await voidTxn(
      n.cashTxnId,
      { reason: 'thêm tiền đá cả tuần', replacement: { categoryId: cats['Mua đá'], amount: 800_000, reason: 'đá cả tuần' } },
      admin,
    );
    assert.equal(big.status, 200, JSON.stringify(big.body));
    assert.equal(big.body.replacement.status, 'PENDING');
    assert.equal((await shift()).expectedCash, s0.expectedCash, 'khoản chờ duyệt chưa trừ két');
    const cur = await shift();
    const close = await call(staff, 'post', `/api/shifts/${cur.shiftId}/close`, { countedCash: cur.expectedCash });
    assert.deepEqual([close.status, close.body.code], [409, 'CASH_PENDING']);
    assert.equal(
      (await call(lead, 'post', `/api/cash-transactions/${big.body.replacement.cashTxnId}/reject`, { rejectReason: 'không có hóa đơn' })).status,
      200,
    );
  });

  test('AC-050-03: quyền như duyệt — nhân viên tự hủy 403, kèm tài khoản trưởng ca → được; trưởng ca hủy khoản > 2.000.000đ / khoản mình ghi → 403; quản lý hủy khoản mình ghi → được; thiếu lý do 400; khoản chờ / từ chối / đã hủy → 409', async () => {
    const a = await cash(staff, 'Mua đá', 20_000);
    const self = await voidTxn(a.cashTxnId, { reason: 'x' }, staff);
    assert.deepEqual([self.status, self.body.code], [403, 'ADMIN_APPROVAL_REQUIRED']);
    const withCreds = await voidTxn(a.cashTxnId, { reason: 'ghi trùng', adminUsername: 'lead1', adminPassword: 'Pass@123' }, staff);
    assert.equal(withCreds.status, 200, JSON.stringify(withCreds.body));
    assert.equal(withCreds.body.voided.voidedBy.userId, users.lead1);

    const big = await cash(staff, 'Bổ sung tiền lẻ', 3_000_000, 'chủ quán bổ sung');
    assert.equal(big.status, 'APPROVED');
    assert.equal((await voidTxn(big.cashTxnId, { reason: 'x' })).status, 403);
    assert.equal((await voidTxn(big.cashTxnId, { reason: 'ghi nhầm' }, admin)).status, 200);

    const own = await cash(lead, 'Mua đá', 15_000);
    const ownVoid = await voidTxn(own.cashTxnId, { reason: 'x' });
    assert.deepEqual([ownVoid.status, ownVoid.body.code], [403, 'SELF_APPROVAL']);
    assert.equal((await voidTxn(own.cashTxnId, { reason: 'trưởng ca khác duyệt', adminUsername: 'lead2', adminPassword: 'Pass@123' }, lead)).status, 200);
    const adminOwn = await cash(admin, 'Mua đá', 10_000);
    assert.equal((await voidTxn(adminOwn.cashTxnId, { reason: 'quản lý tự hủy' }, admin)).status, 200);

    const b = await cash(staff, 'Mua đá', 30_000);
    assert.equal((await voidTxn(b.cashTxnId, {})).status, 400);
    assert.equal((await voidTxn(b.cashTxnId, { reason: '   ' })).status, 400);
    const pending = await cash(staff, 'Khác (chi)', 10_000);
    assert.equal(pending.status, 'PENDING');
    assert.deepEqual([(await voidTxn(pending.cashTxnId, { reason: 'x' })).body.code], ['CASH_NOT_APPROVED']);
    assert.equal((await call(lead, 'post', `/api/cash-transactions/${pending.cashTxnId}/reject`, { rejectReason: 'không cần' })).status, 200);
    assert.equal((await voidTxn(pending.cashTxnId, { reason: 'x' })).body.code, 'CASH_NOT_APPROVED');
    assert.equal((await voidTxn(a.cashTxnId, { reason: 'lần 2' })).body.code, 'CASH_NOT_APPROVED');
    assert.equal((await voidTxn(999999, { reason: 'x' })).status, 404);
  });

  test('AC-050-02 / 03 (review G3): khoản thay thế sai → 400 và khoản cũ giữ nguyên; sửa vào danh mục cần duyệt → chờ duyệt; trưởng ca sửa thành 3.000.000đ → chờ duyệt, tự duyệt không được; nhân viên nhập tài khoản trưởng ca → nhân viên ghi khoản mới; hai lần hủy cùng lúc → một lần được', async () => {
    const base = await cash(staff, 'Mua đá', 40_000, 'đá sáng');
    const count = async () => (await q1('SELECT COUNT(*) AS n FROM dbo.CashTransactions'))[0].n;
    const n0 = await count();
    for (const bad of [
      { categoryId: 999999, amount: 10_000, reason: 'x' },
      { categoryId: cats['Mua đá'], amount: 0, reason: 'x' },
      { categoryId: cats['Mua đá'], amount: 10_000, reason: '  ' },
      { categoryId: cats['Mua đá'], amount: 10_000, reason: 'x'.repeat(181) },
    ]) {
      const r = await voidTxn(base.cashTxnId, { reason: 'sửa', replacement: bad });
      assert.equal(r.status, 400, JSON.stringify(r.body));
    }
    assert.equal((await q1(`SELECT Status FROM dbo.CashTransactions WHERE CashTxnId = ${base.cashTxnId}`))[0].Status, 'APPROVED');
    assert.equal(await count(), n0, 'không có khoản mồ côi');

    const toOther = await voidTxn(base.cashTxnId, {
      reason: 'sai danh mục',
      replacement: { categoryId: cats['Khác (chi)'], amount: 40_000, reason: 'đá + ly' },
    });
    assert.equal(toOther.status, 200, JSON.stringify(toOther.body));
    assert.equal(toOther.body.replacement.status, 'PENDING', 'danh mục luôn cần duyệt');
    assert.equal((await call(admin, 'post', `/api/cash-transactions/${toOther.body.replacement.cashTxnId}/reject`, { rejectReason: 'dọn test' })).status, 200);

    const small = await cash(staff, 'Mua đá', 50_000, 'đá trưa');
    const big = await voidTxn(small.cashTxnId, { reason: 'gộp cả tuần', replacement: { categoryId: cats['Mua đá'], amount: 3_000_000, reason: 'đá cả tuần' } });
    assert.equal(big.status, 200, JSON.stringify(big.body));
    assert.deepEqual([big.body.replacement.status, big.body.replacement.createdBy.userId], ['PENDING', users.lead1]);
    const selfApprove = await call(lead, 'post', `/api/cash-transactions/${big.body.replacement.cashTxnId}/approve`, {});
    assert.equal(selfApprove.status, 403, 'trưởng ca không tự duyệt / vượt mức 2.000.000đ');
    assert.equal((await call(admin, 'post', `/api/cash-transactions/${big.body.replacement.cashTxnId}/reject`, { rejectReason: 'dọn test' })).status, 200);

    const st = await cash(staff, 'Mua đá', 20_000, 'đá chiều');
    const viaLead = await voidTxn(
      st.cashTxnId,
      {
        reason: 'ghi nhầm',
        replacement: { categoryId: cats['Mua đá'], amount: 25_000, reason: 'đá chiều' },
        adminUsername: 'lead1',
        adminPassword: 'Pass@123',
      },
      staff,
    );
    assert.equal(viaLead.status, 200, JSON.stringify(viaLead.body));
    assert.deepEqual([viaLead.body.voided.voidedBy.userId, viaLead.body.replacement.createdBy.userId], [users.lead1, users.staff1]);

    const race = await cash(staff, 'Mua đá', 15_000, 'đá tối');
    const both = await Promise.all([voidTxn(race.cashTxnId, { reason: 'trùng' }), voidTxn(race.cashTxnId, { reason: 'trùng' }, admin)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  });

  test('AC-050-01 (review G3): CSV sổ quỹ ghi "Đã hủy", không tính vào tổng, người / lý do hủy, khoản thay thế; lọc trạng thái Đã hủy; ảnh hóa đơn của khoản đã hủy không đổi được', async () => {
    const t = await cash(staff, 'Mua đá', 33_000, 'đá CSV');
    const r = await voidTxn(t.cashTxnId, { reason: 'ghi nhầm CSV', replacement: { categoryId: cats['Mua đá'], amount: 34_000, reason: 'đá CSV' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const range = `from=${todayVn()}&to=${todayVn()}`;
    const csv = await call(admin, 'get', `/api/admin/cash-transactions/export.csv?${range}`);
    assert.equal(csv.status, 200);
    const line = csv.text.split(/\r?\n/).find((l) => l.startsWith(`${t.cashTxnId},`));
    assert.ok(line, csv.text.slice(0, 300));
    assert.match(line, /,không,/);
    assert.match(line, /Đã hủy/);
    assert.match(line, /ghi nhầm CSV/);
    assert.match(line, new RegExp(`,${r.body.replacement.cashTxnId},`));
    const voidedOnly = await call(admin, 'get', `/api/admin/cash-transactions?${range}&status=VOIDED`);
    assert.equal(voidedOnly.status, 200, JSON.stringify(voidedOnly.body));
    assert.ok(voidedOnly.body.rows.every((x) => x.status === 'VOIDED') && voidedOnly.body.rows.some((x) => x.cashTxnId === t.cashTxnId));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const img = await api.put(`/api/cash-transactions/${t.cashTxnId}/receipt`).set(auth(admin)).set('Content-Type', 'image/png').send(png);
    assert.deepEqual([img.status, img.body.code], [409, 'CASH_NOT_APPROVED']);
  });

  test('AC-050-04: khoản của ca đã đóng → 409 SHIFT_CLOSED, không đổi gì; tiền dự kiến / chênh lệch của ca đã đóng giữ nguyên', async () => {
    const t = await cash(staff, 'Trả shipper', 25_000, 'trả ship nguyên liệu');
    const cur = await shift();
    const close = await call(staff, 'post', `/api/shifts/${cur.shiftId}/close`, { countedCash: cur.expectedCash });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    const [before] = await q1(`SELECT ExpectedCash, CountedCash FROM dbo.Shifts WHERE ShiftId = ${cur.shiftId}`);
    const r = await voidTxn(t.cashTxnId, { reason: 'nhầm' }, admin);
    assert.deepEqual([r.status, r.body.code], [409, 'SHIFT_CLOSED']);
    const [afterRow] = await q1(`SELECT ExpectedCash, CountedCash FROM dbo.Shifts WHERE ShiftId = ${cur.shiftId}`);
    assert.deepEqual([Number(afterRow.ExpectedCash), Number(afterRow.CountedCash)], [Number(before.ExpectedCash), Number(before.CountedCash)]);
    assert.equal((await q1(`SELECT Status FROM dbo.CashTransactions WHERE CashTxnId = ${t.cashTxnId}`))[0].Status, 'APPROVED');
  });
});
