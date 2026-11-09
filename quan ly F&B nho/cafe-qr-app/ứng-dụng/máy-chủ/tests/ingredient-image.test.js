// Integration test (SQL Server thật) F-085 — ảnh nguyên liệu ở kho (ADR-046 D-203…D-205): lưu đường dẫn ảnh như ảnh món,
// trả về ở danh sách kho của trang Quản lý và của máy quầy; sửa nguyên liệu không gửi ảnh thì giữ ảnh cũ.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { auth, startApp } from './helpers/harness.js';

let app, api, admin, staff, storeMgr;

before(async () => {
  app = await startApp();
  ({ api } = app);
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  const r = await api.post('/api/admin/users').set(auth(admin)).send({ username: 'ql_anh', password: 'Pass@123', fullName: 'TK ql_anh', role: 'STORE_MGR' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  storeMgr = await app.login('ql_anh', 'Pass@123');
});

after(() => app.close());

const find = (list, id) => list.find((i) => i.ingredientId === id);

describe('Ảnh nguyên liệu (F-085)', () => {
  test('AC-085-01: chủ quán thêm nguyên liệu có ảnh → danh sách kho trang Quản lý và tab Tồn kho máy quầy đều trả ảnh; quản lý cửa hàng đổi ảnh được; nguyên liệu cũ chưa có ảnh trả null', async () => {
    const c = await api
      .post('/api/admin/ingredients')
      .set(auth(admin))
      .send({ name: 'Đường ảnh', unit: 'g', stockQty: 1000, lowStockThreshold: 100, imageUrl: '/img/nguyen-lieu/duong.jpg' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.imageUrl, '/img/nguyen-lieu/duong.jpg');
    const id = c.body.ingredientId;

    const adminList = (await api.get('/api/admin/ingredients').set(auth(admin))).body;
    assert.equal(find(adminList, id).imageUrl, '/img/nguyen-lieu/duong.jpg');
    // Nguyên liệu có sẵn (tạo trước F-085, không gửi ảnh) → null, không phải undefined
    assert.ok(adminList.some((i) => i.ingredientId !== id && i.imageUrl === null));

    const posList = await api.get('/api/ops/ingredients').set(auth(staff));
    assert.equal(posList.status, 200);
    assert.equal(find(posList.body, id).imageUrl, '/img/nguyen-lieu/duong.jpg');

    // Quản lý cửa hàng có quyền kho (STORE_MGR_AREAS full) → đổi được ảnh
    const u = await api
      .put(`/api/admin/ingredients/${id}`)
      .set(auth(storeMgr))
      .send({ name: 'Đường ảnh', unit: 'g', lowStockThreshold: 100, isActive: true, imageUrl: 'https://example.com/duong.jpg' });
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal(u.body.imageUrl, 'https://example.com/duong.jpg');
    // Nhân viên không sửa được nguyên liệu (giữ như cũ)
    assert.equal(
      (await api.put(`/api/admin/ingredients/${id}`).set(auth(staff)).send({ name: 'x', unit: 'g', lowStockThreshold: 0, isActive: true })).status,
      403,
    );
  });

  test('AC-085-02: sửa nguyên liệu không gửi ảnh → giữ ảnh cũ; gửi rỗng → bỏ ảnh; ảnh không phải URL http(s) hoặc "/…" → 400, ảnh cũ còn nguyên', async () => {
    const c = await api
      .post('/api/admin/ingredients')
      .set(auth(admin))
      .send({ name: 'Sữa tươi ảnh', unit: 'ml', stockQty: 0, lowStockThreshold: 0, imageUrl: '/img/nguyen-lieu/sua-tuoi.jpg' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const id = c.body.ingredientId;
    const put = (body) =>
      api
        .put(`/api/admin/ingredients/${id}`)
        .set(auth(admin))
        .send({ name: 'Sữa tươi ảnh', unit: 'ml', lowStockThreshold: 50, isActive: true, ...body });

    // Không gửi imageUrl (bản cũ / nơi khác) → giữ ảnh, các trường khác vẫn đổi
    const keep = await put({});
    assert.equal(keep.status, 200, JSON.stringify(keep.body));
    assert.equal(keep.body.imageUrl, '/img/nguyen-lieu/sua-tuoi.jpg');
    assert.equal(Number(keep.body.lowStockThreshold), 50);

    for (const bad of ['javascript:alert(1)', 'img/khong-gach.jpg', 'https://a b.jpg', `/${'x'.repeat(500)}`]) {
      const r = await put({ imageUrl: bad });
      assert.equal(r.status, 400, `${bad} → ${r.status}`);
      assert.equal(r.body.code, 'VALIDATION_ERROR');
    }
    assert.equal(find((await api.get('/api/admin/ingredients').set(auth(admin))).body, id).imageUrl, '/img/nguyen-lieu/sua-tuoi.jpg');

    const clear = await put({ imageUrl: '' });
    assert.equal(clear.status, 200);
    assert.equal(clear.body.imageUrl, null);
    // Thêm mới không gửi ảnh → null
    const plain = await api.post('/api/admin/ingredients').set(auth(admin)).send({ name: 'Không ảnh', unit: 'g', stockQty: 0, lowStockThreshold: 0 });
    assert.equal(plain.status, 201);
    assert.equal(plain.body.imageUrl, null);
  });
});
