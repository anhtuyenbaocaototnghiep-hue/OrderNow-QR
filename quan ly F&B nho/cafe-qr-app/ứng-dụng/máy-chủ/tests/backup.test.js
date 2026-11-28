// Integration test (SQL Server thật) F-103 — sao lưu tự động trong máy chủ app (ADR-074 D-272…D-275, BR-133).
// Sao lưu THẬT CSDL test vào thư mục tạm: thư mục chưa có → app tạo + cấp quyền ghi cho dịch vụ SQL Server bằng icacls (D-274);
// thư mục do Node tạo sẵn (không cấp quyền) → SQL Server không ghi được → lỗi có lệnh icacls (AC-103-04).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auth, sleep, startApp } from './helpers/harness.js';
import { backupFileName } from '../../../kịch-bản/lib/vận-hành.js';

const ROOT = path.join(os.tmpdir(), `cafe-qr-test-backup-${process.pid}`);
const DIR = path.join(ROOT, 'sao-luu'); // chưa có → app tự tạo + cấp quyền
const COPY = path.join(ROOT, 'ban-chep');
const NO_RIGHTS = path.join(ROOT, 'khong-quyen'); // Node tạo sẵn → dịch vụ SQL Server không có quyền ghi
const PHOTO = 'anh-thu-sao-luu.txt';
const HOUR = 3_600_000;

let app, api, pool, admin, staff, store, backupService, backupTimer, db;
const saved = {};
const call = (token, method, path_, body) => {
  const req = api[method](path_).set(auth(token));
  return body === undefined ? req : req.send(body);
};
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
const readLast = (dir = DIR) => JSON.parse(fs.readFileSync(path.join(dir, 'last-backup.json'), 'utf8'));
const runNow = async () => ok(await call(admin, 'post', '/api/admin/backup/run', {}));

before(async () => {
  app = await startApp();
  ({ api, pool } = app);
  backupService = await import('../src/services/backupService.js'); // nạp src SAU harness (DEF-030)
  backupTimer = await import('../src/jobs/backupTimer.js');
  for (const k of ['BACKUP_DIR', 'BACKUP_COPY_DIR', 'JOBS_ENABLED']) saved[k] = process.env[k];
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  process.env.BACKUP_DIR = DIR;
  process.env.BACKUP_COPY_DIR = COPY;
  fs.mkdirSync(process.env.UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.UPLOADS_DIR, PHOTO), 'ảnh thử');
  admin = await app.login('admin', 'Admin@123');
  staff = await app.login('staff1', 'Staff@123');
  ok(await call(admin, 'post', '/api/admin/users', { username: 'ql_saoluu', password: 'Ql#Sao-Luu-2026', fullName: 'QL sao lưu', role: 'STORE_MGR' }), 201);
  store = await app.login('ql_saoluu', 'Ql#Sao-Luu-2026');
  db = ok(await call(admin, 'get', '/api/admin/backup')).db;
});

after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(path.join(process.env.UPLOADS_DIR, PHOTO), { force: true });
  await app.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('Sao lưu tự động trong máy chủ (F-103)', () => {
  test('AC-103-01: chủ quán bấm Sao lưu ngay → thư mục chưa có được tạo, có .bak đúng mẫu tên + last-backup.json, ảnh chép vào uploads, có bản chép thứ hai; GET trả bản vừa làm; quản lý cửa hàng / nhân viên → 403', async () => {
    assert.equal(fs.existsSync(DIR), false);
    const { result, status } = await runNow();
    assert.match(result.file, new RegExp(`^${db}_\\d{8}-\\d{4}\\.bak$`));
    assert.equal(fs.statSync(path.join(DIR, result.file)).size, result.bytes);
    assert.ok(result.bytes > 100_000, 'bản sao lưu CSDL thật, không rỗng');
    assert.equal(readLast().file, result.file);
    assert.ok(result.uploads >= 1);
    assert.equal(fs.readFileSync(path.join(DIR, 'uploads', PHOTO), 'utf8'), 'ảnh thử');
    assert.equal(result.copied, true);
    assert.ok(fs.existsSync(path.join(COPY, result.file)));
    assert.ok(fs.existsSync(path.join(COPY, 'uploads', PHOTO)));
    assert.equal(status.last.file, result.file);
    assert.deepEqual([status.dir, status.copyDir, status.lastError, status.due], [DIR, COPY, null, false]);
    assert.ok(status.freeBytes > 0);
    assert.deepEqual(ok(await call(admin, 'get', '/api/admin/backup')).last, status.last);
    for (const [token, method, url] of [
      [store, 'get', '/api/admin/backup'],
      [store, 'post', '/api/admin/backup/run'],
      [staff, 'get', '/api/admin/backup'],
      [staff, 'post', '/api/admin/backup/run'],
    ]) {
      assert.equal((await call(token, method, url, method === 'post' ? {} : undefined)).status, 403, `${method} ${url}`);
    }
    const { flushAudit } = await import('../src/middleware/audit.js');
    await flushAudit();
    assert.equal((await pool.request().query("SELECT COUNT(*) AS n FROM dbo.AuditLogs WHERE Action = 'backup.run'")).recordset[0].n, 1);
  });

  test('AC-103-02: dọn bản cũ đúng luật giữ — bản quá 14 ngày (không phải bản đầu tháng / có nhãn) và bản quá 12 tháng bị xóa; file khác mẫu, bản của CSDL khác còn nguyên', async () => {
    const monthsAgo = (n, day) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - n);
      d.setUTCDate(day);
      d.setUTCHours(1, 0, 0, 0); // 08:00 giờ Việt Nam
      return d;
    };
    const first = backupFileName(db, monthsAgo(2, 1)); // bản đầu tháng (trong 12 tháng) → giữ
    const mid = backupFileName(db, monthsAgo(2, 5)); // giữa tháng, quá 14 ngày → xóa
    const labeled = backupFileName(db, monthsAgo(2, 10), 'truoc-v1'); // có nhãn → giữ
    const ancient = backupFileName(db, monthsAgo(14, 3)); // quá 12 tháng → xóa
    const otherDb = backupFileName('CafeQrKhac', monthsAgo(14, 3)); // CSDL khác → không đụng
    // Bản hôm qua: cùng bản hôm nay và bản có nhãn là 3 bản mới nhất (luôn giữ ≥ 3) — hai lần sao lưu trong một phút trùng tên file
    const yesterday = backupFileName(db, new Date(Date.now() - 24 * HOUR));
    for (const name of [first, mid, labeled, ancient, otherDb, yesterday, 'ghi-chu.txt']) fs.writeFileSync(path.join(DIR, name), 'cũ');
    const { result } = await runNow();
    assert.equal(result.removed, 2);
    for (const name of [first, labeled, otherDb, yesterday, 'ghi-chu.txt', result.file]) assert.ok(fs.existsSync(path.join(DIR, name)), `còn ${name}`);
    for (const name of [mid, ancient]) assert.equal(fs.existsSync(path.join(DIR, name)), false, `đã xóa ${name}`);
  });

  test('AC-103-03: lịch — chưa có bản / bản ≥ 20 giờ thì đến hạn, < 20 giờ thì chưa; sau đóng ca sao lưu khi bản gần nhất ≥ 30 phút (đóng ca thật → có bản mới)', async () => {
    const now = new Date();
    const ago = (ms) => ({ finishedAt: new Date(now.getTime() - ms).toISOString() });
    assert.equal(backupService.isDue(null, now), true);
    assert.equal(backupService.isDue(ago(19 * HOUR), now), false);
    assert.equal(backupService.isDue(ago(20 * HOUR), now), true);
    assert.equal(backupService.dueAfterShiftClose(ago(29 * 60_000), now), false);
    assert.equal(backupService.dueAfterShiftClose(ago(31 * 60_000), now), true);
    // Bộ hẹn giờ: bản vừa làm → không chạy; 21 giờ sau → chạy job db-backup
    assert.equal(await backupTimer.tick(now), null);
    const before = readLast().finishedAt;
    const later = await backupTimer.tick(new Date(now.getTime() + 21 * HOUR));
    assert.equal(later.status, 'OK');
    assert.ok(readLast().finishedAt > before);
    // Đóng ca thật → sao lưu nền (bản gần nhất giả là 2 giờ trước). JOBS_ENABLED=false (test) chặn tự chạy → bật tạm cho bài này
    const last = readLast();
    const fake = new Date(Date.now() - 2 * HOUR).toISOString();
    fs.writeFileSync(path.join(DIR, 'last-backup.json'), JSON.stringify({ ...last, finishedAt: fake }));
    process.env.JOBS_ENABLED = 'true';
    try {
      const sh = ok(await call(staff, 'post', '/api/shifts/open', { openingCash: 100_000 }), 201).shift;
      ok(await call(staff, 'post', `/api/shifts/${sh.shiftId}/close`, { countedCash: 100_000 }));
      let after = fake;
      for (let i = 0; i < 60 && after === fake; i++) {
        await sleep(250);
        after = readLast().finishedAt;
      }
      assert.ok(after > fake, 'đóng ca xong phải có bản sao lưu mới');
    } finally {
      process.env.JOBS_ENABLED = 'false';
    }
  });

  test('AC-103-04: SQL Server không ghi được vào thư mục → 500 BACKUP_FAILED có lệnh icacls; GET trả lỗi gần nhất; JobRuns FAILED; bộ hẹn giờ chờ 60 phút mới thử lại; sửa xong sao lưu lại → hết lỗi', async () => {
    fs.mkdirSync(NO_RIGHTS, { recursive: true });
    process.env.BACKUP_DIR = NO_RIGHTS;
    try {
      const r = await call(admin, 'post', '/api/admin/backup/run', {});
      assert.equal(r.status, 500, JSON.stringify(r.body));
      assert.equal(r.body.code, 'BACKUP_FAILED');
      assert.match(r.body.message, /icacls/);
      assert.ok(r.body.message.includes(NO_RIGHTS));
      const s = ok(await call(admin, 'get', '/api/admin/backup'));
      assert.equal(s.last, null);
      assert.match(s.lastError.message, /icacls/);
      const [run] = (await pool.request().query("SELECT TOP 1 Status FROM dbo.JobRuns WHERE Name = 'db-backup' ORDER BY RunId DESC")).recordset;
      assert.equal(run.Status, 'FAILED');
      // Bộ hẹn giờ: lỗi → 10 phút sau không thử; 61 phút sau thử lại
      const now = new Date();
      assert.equal((await backupTimer.tick(now)).status, 'FAILED');
      assert.equal(await backupTimer.tick(new Date(now.getTime() + 10 * 60_000)), null);
      assert.equal((await backupTimer.tick(new Date(Date.now() + 61 * 60_000))).status, 'FAILED');
    } finally {
      process.env.BACKUP_DIR = DIR;
    }
    const { status } = await runNow();
    assert.equal(status.lastError, null);
  });
});
