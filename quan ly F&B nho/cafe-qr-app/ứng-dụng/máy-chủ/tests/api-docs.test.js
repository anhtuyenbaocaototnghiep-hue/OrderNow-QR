// Integration test (SQL Server thật) F-052 — Tra cứu API trong Quản lý (ADR-011 D-49…D-51).
// Danh sách endpoint đọc từ router lúc chạy; so với route khai báo trong src/routes/*.js để chắc không sót / không trùng.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auth, startApp } from './helpers/harness.js';

const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/routes');
let app, api, admin, staff, lead, docs, apiDocsService, contractFile;

const find = (method, p) => docs.endpoints.find((e) => e.method === method && e.path === p);

before(async () => {
  app = await startApp();
  ({ api } = app);
  apiDocsService = await import('../src/services/apiDocsService.js');
  ({ apiContractFile: contractFile } = (await import('../src/config.js')).config);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  const u = await api
    .post('/api/admin/users')
    .set(auth(admin))
    .send({ username: 'lead_api', password: 'Pass@123', fullName: 'Trưởng ca API', role: 'MANAGER' });
  assert.equal(u.status, 201, JSON.stringify(u.body));
  lead = await app.login('lead_api', 'Pass@123');
  const r = await api.get('/api/admin/api-docs').set(auth(admin));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  docs = r.body;
});

after(() => app.close());

describe('Tra cứu API (F-052)', () => {
  test('AC-052-01: quản lý xem danh sách API — POST /api/orders công khai, GET /api/menu khách hoặc quầy, settle nhân viên, kiểm kê ở quầy trưởng ca (stocktake.post), ghi quỹ nhân viên (cash.create), /api/admin/* quản lý', async () => {
    const expect = [
      ['POST', '/api/orders', 'PUBLIC', null, 'GUEST'],
      ['GET', '/api/menu', 'CLIENT_OR_STAFF', null, 'GUEST'],
      ['POST', '/api/sessions/:id/settle', 'STAFF', null, 'POS'],
      ['POST', '/api/ops/stocktakes', 'MANAGER', 'stocktake.post', 'POS'],
      ['POST', '/api/cash-transactions', 'STAFF', 'cash.create', 'POS'],
      ['GET', '/api/admin/reviews', 'ADMIN', null, 'ADMIN'],
      ['GET', '/api/admin/api-docs', 'ADMIN', null, 'ADMIN'],
    ];
    for (const [method, p, access, permission, area] of expect) {
      const e = find(method, p);
      assert.ok(e, `thiếu ${method} ${p}`);
      assert.deepEqual([e.access, e.permission, e.area], [access, permission, area], `${method} ${p}`);
    }
    assert.deepEqual(find('POST', '/api/ops/stocktakes').roles, ['MANAGER', 'ADMIN']);
    assert.deepEqual(find('POST', '/api/sessions/:id/settle').roles, ['STAFF', 'MANAGER', 'ADMIN']);
    assert.deepEqual(find('POST', '/api/orders').roles, []);
    assert.equal(find('POST', '/api/sessions/:id/settle').resource, '/sessions');
    assert.equal(find('GET', '/api/admin/reviews').resource, '/admin/reviews');
    // Quyền ghi trên trang khớp server: nhân viên gọi kiểm kê ở quầy (trưởng ca) → 403; trưởng ca → 200
    await api.get('/api/ops/stocktakes').set(auth(staff)).expect(403);
    await api.get('/api/ops/stocktakes').set(auth(lead)).expect(200);
  });

  test('AC-052-02: không sót, không trùng — số endpoint = số route khai báo trong src/routes/*.js; mọi route khai báo đều có trên trang', () => {
    const declared = [];
    for (const f of fs.readdirSync(routesDir).filter((x) => x.endsWith('.js') && x !== 'pages.js')) {
      const text = fs.readFileSync(path.join(routesDir, f), 'utf8');
      for (const m of text.matchAll(/\b\w+Router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g))
        declared.push({ file: f, method: m[1].toUpperCase(), path: m[2] });
    }
    assert.ok(declared.length > 250, `chỉ đọc được ${declared.length} route`);
    assert.equal(docs.total, docs.endpoints.length);
    assert.equal(docs.total, declared.length, 'số endpoint trên trang khác số route khai báo');
    const keys = docs.endpoints.map((e) => `${e.method} ${e.path}`);
    assert.deepEqual(
      keys.filter((k, i) => keys.indexOf(k) !== i),
      [],
      'trùng endpoint',
    );
    for (const d of declared) {
      const ok = docs.endpoints.some((e) => e.method === d.method && (e.path.endsWith(d.path) || (d.path === '/' && /^\/api(\/admin)?$/.test(e.path))));
      assert.ok(ok, `${d.file}: ${d.method} ${d.path} không có trên trang`);
    }
    for (const e of docs.endpoints) assert.match(e.path, /^\/api\//);
  });

  test('AC-052-03: mô tả ghép từ api-contract.md — POST /api/orders có Idempotency-Key + OUT_OF_STOCK; dạng PUT / DELETE … và …/cancel khớp; thiếu dòng → rỗng; thiếu file → vẫn đủ danh sách, found = false', async () => {
    assert.equal(docs.contract.found, true);
    assert.equal(docs.contract.file, 'tài-liệu/kiến-trúc/api-contract.md');
    const orders = JSON.stringify(find('POST', '/api/orders').contract);
    assert.match(orders, /Idempotency-Key/);
    assert.match(orders, /OUT_OF_STOCK/);
    assert.ok(find('PUT', '/api/members/:id/favorites/:menuItemId').contract.length > 0, 'dòng `PUT` / `DELETE …` chưa khớp');
    assert.ok(find('DELETE', '/api/members/:id/favorites/:menuItemId').contract.length > 0);
    assert.ok(find('POST', '/api/admin/purchase-orders/:id/cancel').contract.length > 0, 'dòng `…/cancel` chưa khớp');
    assert.equal(docs.contract.documented, docs.endpoints.filter((e) => e.contract.length > 0).length);
    for (const e of docs.endpoints) {
      for (const c of e.contract) assert.ok(c.section && c.fields.every(([name, value]) => name && value), `${e.method} ${e.path}`);
    }

    // Bảng mẫu: mọi dạng viết gọn đang dùng trong api-contract.md
    const rows = apiDocsService.parseContract(
      [
        '## Mục A',
        '**Quầy**',
        '| Method & path | Mục đích | Lỗi |',
        '| --- | --- | --- |',
        '| `GET /api/x?from&to` · `POST` · `PUT` / `DELETE …/{id}` | Danh sách x | — |',
        '| `POST /api/po/{id}/send` · `…/cancel` | Gửi PO | `409 PO_NOT_DRAFT` |',
        '| `PATCH /api/s/{id}` · `PATCH …/{id}/active` | Bật tắt | 404 |',
        '',
        'Đoạn văn `GET /api/khong-phai-bang` không tính.',
      ].join('\n'),
    );
    assert.deepEqual(
      [...rows.keys()].sort(),
      [
        'DELETE /api/x/:p',
        'GET /api/x',
        'PATCH /api/s/:p',
        'PATCH /api/s/:p/active',
        'POST /api/po/:p/cancel',
        'POST /api/po/:p/send',
        'POST /api/x',
        'PUT /api/x/:p',
      ].sort(),
    );
    assert.deepEqual(rows.get('POST /api/po/:p/cancel'), [
      {
        section: 'Mục A · Quầy',
        fields: [
          ['Mục đích', 'Gửi PO'],
          ['Lỗi', '`409 PO_NOT_DRAFT`'],
        ],
      },
    ]);
    assert.deepEqual(rows.get('GET /api/x')[0].fields, [['Mục đích', 'Danh sách x']]);

    // Không đọc được file → vẫn đủ danh sách
    const plainRoutes = docs.endpoints.map(({ method, path: p, access, roles, permission }) => ({ method, path: p, access, roles, permission }));
    const missing = await apiDocsService.catalog(plainRoutes, path.join(routesDir, 'khong-co-file.md'));
    assert.equal(missing.contract.found, false);
    assert.equal(missing.contract.documented, 0);
    assert.equal(missing.total, docs.total);
    assert.ok(missing.endpoints.every((e) => e.contract.length === 0));
  });

  test('AC-052-01 (review G3): quyền ghi trên trang khớp server ở mọi endpoint — không token → 401 (Nhân viên / Trưởng ca / Quản lý); nhân viên → 403 (Trưởng ca / Quản lý); trưởng ca → 403 (Quản lý)', async () => {
    // Middleware quyền chạy trước mọi bước khác của route có quyền, nên các lần gọi bị chặn này không đổi dữ liệu
    const who = new Map([
      [null, 'không token'],
      [staff, 'nhân viên'],
      [lead, 'trưởng ca'],
    ]);
    const wrong = [];
    let calls = 0;
    for (const e of docs.endpoints) {
      if (e.permission) assert.ok(e.roles.length > 0, `${e.method} ${e.path}: quyền ${e.permission} không có vai nào`);
      const checks = [];
      if (['STAFF', 'MANAGER', 'ADMIN'].includes(e.access)) checks.push([null, 401]);
      if (['MANAGER', 'ADMIN'].includes(e.access)) checks.push([staff, 403]);
      if (e.access === 'ADMIN') checks.push([lead, 403]);
      for (const [token, status] of checks) {
        const req = api[e.method.toLowerCase()](e.path.replace(/:\w+/g, '1'));
        const r = await (token ? req.set(auth(token)) : req);
        calls++;
        if (r.status !== status) wrong.push(`${e.method} ${e.path} (${who.get(token)}): ${r.status}, trang ghi ${e.access}`);
      }
    }
    assert.ok(calls > 500, `chỉ gọi ${calls} lần`);
    assert.deepEqual(wrong, []);
  });

  test('AC-052-03 (review G3): mọi dòng bảng trong api-contract.md trỏ tới endpoint đang chạy (không gắn nhầm / mồ côi); ô lạ không làm hỏng việc đọc file', () => {
    const live = new Set(docs.endpoints.map((e) => apiDocsService.endpointKey(e.method, e.path)));
    const rows = apiDocsService.parseContract(fs.readFileSync(contractFile, 'utf8'));
    assert.deepEqual(
      [...rows.keys()].filter((k) => !live.has(k)),
      [],
      'dòng trong api-contract.md trỏ tới endpoint không tồn tại',
    );
    const odd = apiDocsService.parseContract(
      ['| Method & path | Mục đích |', '| --- | --- |', '| `GET /api/x` · `POST …` · `GET …` | a |', '| Lấy TARGET /api/y | b |'].join('\n'),
    );
    assert.deepEqual([...odd.keys()], ['GET /api/x']);
  });

  test('AC-052-04: nhân viên, trưởng ca gọi trang Tra cứu API → 403; chưa đăng nhập → 401', async () => {
    await api.get('/api/admin/api-docs').set(auth(staff)).expect(403);
    await api.get('/api/admin/api-docs').set(auth(lead)).expect(403);
    await api.get('/api/admin/api-docs').expect(401);
  });
});
