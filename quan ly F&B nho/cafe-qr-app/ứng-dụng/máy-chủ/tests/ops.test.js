// Unit test (không cần CSDL) — logic của script vận hành bước 15 (ADR-016 D-62, D-63): tên file sao lưu, quy tắc giữ bản cũ,
// đánh giá kết quả kiểm tra hệ thống. Script thật (db-backup / db-restore / ops-health) thử trên máy dev — xem TASK-070.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backupAgeStatus,
  backupFileName,
  cleanLabel,
  dbSizeStatus,
  diskStatus,
  isSafeDbName,
  buildMoves,
  overall,
  parseBackupName,
  parseFileList,
  parseHeader,
  positiveInt,
  selectExpired,
  stamp,
} from '../../../kịch-bản/lib/vận-hành.js';

const vn = (s) => new Date(`${s}+07:00`); // giờ Việt Nam

describe('Vận hành: tên file sao lưu (NFR-AVL-06)', () => {
  test('tên file theo giờ Việt Nam, nhãn bỏ dấu; đọc ngược đúng thời điểm; file khác mẫu → null', () => {
    assert.equal(stamp(new Date('2026-10-23T16:30:00Z')), '20261023-2330');
    assert.equal(stamp(new Date('2026-10-23T17:05:00Z')), '20261024-0005'); // qua nửa đêm giờ Việt Nam
    assert.equal(cleanLabel('Trước v1.1 — đổi máy'), 'truoc-v1-1-doi-may');
    assert.equal(cleanLabel(''), '');
    assert.equal(backupFileName('CafeQr', vn('2026-10-23T22:15:00')), 'CafeQr_20261023-2215.bak');
    assert.equal(backupFileName('CafeQr', vn('2026-10-23T22:15:00'), 'Trước v1.1'), 'CafeQr_20261023-2215_truoc-v1-1.bak');
    const p = parseBackupName('CafeQr_20261023-2215_truoc-v1-1.bak');
    assert.equal(p.db, 'CafeQr');
    assert.equal(p.date.toISOString(), '2026-10-23T15:15:00.000Z');
    assert.equal(p.month, '202610');
    assert.equal(p.label, 'truoc-v1-1');
    for (const other of ['ghi-chu.txt', 'CafeQr_2026-10-23.bak', 'CafeQr_20261023-2215.bak.tmp', 'backup.log'])
      assert.equal(parseBackupName(other), null, other);
  });

  test('tên CSDL an toàn để ghép vào lệnh SQL: chặn dấu cách, ; ] và tên rỗng', () => {
    for (const ok of ['CafeQr', 'CafeQrRestoreDrill', 'Cafe_Qr2']) assert.equal(isSafeDbName(ok), true, ok);
    for (const bad of ['', 'Cafe Qr', 'Cafe;DROP', 'Cafe]x', '1Cafe', 'a'.repeat(65), null, undefined]) assert.equal(isSafeDbName(bad), false, String(bad));
  });
});

describe('Vận hành: quy tắc giữ bản sao lưu (ADR-016 D-62)', () => {
  const now = vn('2026-10-23T23:30:00');
  const files = [
    'CafeQr_20261023-2300.bak',
    'CafeQr_20261020-2300.bak', // 3 bản mới nhất: 23, 20, 15/10
    'CafeQr_20261015-2300.bak', // 8 ngày → giữ
    'CafeQr_20261009-2300.bak', // 14 ngày + 30 phút → quá 14 ngày, không thuộc 3 bản mới nhất → xóa
    'CafeQr_20261002-2300.bak', // xóa
    'CafeQr_20261001-2300.bak', // bản đầu tháng 10 → giữ
    'CafeQr_20260910-2300_truoc-v1-0.bak', // có nhãn, trong 12 tháng → giữ
    'CafeQr_20260905-2300.bak', // xóa
    'CafeQr_20260901-2300.bak', // bản đầu tháng 9 → giữ
    'CafeQr_20251015-2300.bak', // đầu tháng 10/2025: 12 tháng trước → ngoài 12 tháng → xóa
    'CafeQr_20251101-2300.bak', // đầu tháng 11/2025: tháng thứ 12 tính lùi → giữ
    'CafeQrTest_20260101-2300.bak', // CSDL khác → không đụng
    'ghi-chu.txt', // file lạ → không đụng
  ];

  test('giữ 14 ngày + bản đầu tháng + bản có nhãn trong 12 tháng; chỉ xóa file đúng mẫu của đúng CSDL', () => {
    assert.deepEqual(selectExpired(files, { db: 'CafeQr', now }).sort(), [
      'CafeQr_20251015-2300.bak',
      'CafeQr_20260905-2300.bak',
      'CafeQr_20261002-2300.bak',
      'CafeQr_20261009-2300.bak',
    ]);
  });

  test('máy tắt lâu ngày: vẫn giữ ít nhất 3 bản mới nhất dù đã quá 14 ngày', () => {
    const old = ['CafeQr_20260801-2300.bak', 'CafeQr_20260802-2300.bak', 'CafeQr_20260803-2300.bak', 'CafeQr_20260804-2300.bak'];
    assert.deepEqual(selectExpired(old, { db: 'CafeQr', now }), []); // 01/08 là bản đầu tháng, 02–04/08 là 3 bản mới nhất
    assert.deepEqual(selectExpired([...old, 'CafeQr_20260805-2300.bak'], { db: 'CafeQr', now }), ['CafeQr_20260802-2300.bak']);
  });
});

describe('Vận hành: đánh giá kiểm tra hệ thống (ADR-016 D-63)', () => {
  test('tổng = mức nặng nhất (OK 0 / WARN 1 / FAIL 2); không có mục nào → FAIL', () => {
    assert.deepEqual(overall([{ status: 'OK' }, { status: 'OK' }]), { status: 'OK', exitCode: 0 });
    assert.deepEqual(overall([{ status: 'OK' }, { status: 'WARN' }]), { status: 'WARN', exitCode: 1 });
    assert.deepEqual(overall([{ status: 'WARN' }, { status: 'FAIL' }, { status: 'OK' }]), { status: 'FAIL', exitCode: 2 });
    assert.deepEqual(overall([]), { status: 'FAIL', exitCode: 2 });
  });

  test('tuổi bản sao lưu: ≤ 26 giờ ổn, lỡ một đêm (≤ 50 giờ) cần để ý, lâu hơn hoặc chưa có → lỗi', () => {
    const now = new Date('2026-10-24T10:00:00Z');
    assert.equal(backupAgeStatus('2026-10-23T16:00:00Z', now).status, 'OK'); // 18 giờ
    assert.equal(backupAgeStatus('2026-10-23T07:00:00Z', now).status, 'WARN'); // 27 giờ
    assert.equal(backupAgeStatus('2026-10-22T07:00:00Z', now).status, 'FAIL'); // 51 giờ
    assert.equal(backupAgeStatus(null, now).status, 'FAIL');
    assert.equal(backupAgeStatus('không phải ngày', now).status, 'FAIL');
    assert.equal(backupAgeStatus('2026-10-23T16:00:00Z', now).hours, 18);
  });

  test('ổ đĩa < 2 GB lỗi, < 10 GB cần để ý; CSDL bản Express ≥ 80 % giới hạn 10 GB cần để ý, ≥ 95 % lỗi, bản khác luôn ổn', () => {
    const GB = 1024 ** 3;
    assert.equal(diskStatus(50 * GB), 'OK');
    assert.equal(diskStatus(5 * GB), 'WARN');
    assert.equal(diskStatus(1 * GB), 'FAIL');
    assert.equal(dbSizeStatus(500, 4), 'OK');
    assert.equal(dbSizeStatus(8500, 4), 'WARN');
    assert.equal(dbSizeStatus(9900, 4), 'FAIL');
    assert.equal(dbSizeStatus(50000, 3), 'OK'); // Developer / Standard: không giới hạn 10 GB
  });
});

describe('Vận hành: cấu hình giữ bản và đọc bản sao lưu khi khôi phục (review G3 TASK-070)', () => {
  test('số ngày / tháng giữ bản: gõ sai ("14 ngày", 0, -1, 1.5) → lỗi trước khi dọn; để trống → mặc định', () => {
    assert.equal(positiveInt(undefined, 14, 'BACKUP_KEEP_DAYS'), 14);
    assert.equal(positiveInt('', 14, 'BACKUP_KEEP_DAYS'), 14);
    assert.equal(positiveInt(' 30 ', 14, 'BACKUP_KEEP_DAYS'), 30);
    for (const bad of ['14 ngày', '0', '-1', '1.5', 'abc']) {
      assert.throws(() => positiveInt(bad, 14, 'BACKUP_KEEP_DAYS'), /BACKUP_KEEP_DAYS phải là số nguyên từ 1/, bad);
    }
  });

  test('đọc kết quả RESTORE FILELISTONLY / HEADERONLY của sqlcmd (cột cách bởi "|"); bỏ dòng lạ', () => {
    const files = parseFileList([
      'CafeQr|C:\\SQL\\DATA\\CafeQr.mdf|D|PRIMARY|8388608|35184372080640|1|0|0|00000000-0000-0000-0000-000000000000',
      'CafeQr_log|C:\\SQL\\DATA\\CafeQr_log.ldf|L|NULL|8388608|2199023255552|2|0|0|00000000-0000-0000-0000-000000000000',
      'Processed 1808 pages for database',
    ]);
    assert.deepEqual(files, [
      { logical: 'CafeQr', type: 'D' },
      { logical: 'CafeQr_log', type: 'L' },
    ]);
    const header = parseHeader([
      'CafeQr hằng ngày|NULL|1|NULL|0|1|2|LAPTOP\\Asus|LAPTOP|CafeQr|904|2026-10-14 10:00:00.000|14774272|1|2|3|0|2026-10-23 22:15:01.000|2026-10-23 22:15:02.000|1',
    ]);
    assert.deepEqual(header, { database: 'CafeQr', finishedAt: '2026-10-23 22:15:02.000' });
    assert.deepEqual(parseHeader([]), { database: null, finishedAt: null });
  });

  test('đích MOVE: CSDL mới → thư mục mặc định theo tên đích (nhiều file dữ liệu / nhật ký); CSDL có sẵn cùng số file → ghi đúng file đang dùng', () => {
    const files = [
      { logical: 'Cafe', type: 'D' },
      { logical: 'Cafe_2', type: 'D' },
      { logical: 'Cafe_log', type: 'L' },
    ];
    assert.deepEqual(buildMoves({ files, target: 'CafeQrRestoreDrill', dataDir: 'C:\\SQL\\DATA\\', logDir: 'C:\\SQL\\LOG' }), [
      ['Cafe', 'C:\\SQL\\DATA\\CafeQrRestoreDrill.mdf'],
      ['Cafe_2', 'C:\\SQL\\DATA\\CafeQrRestoreDrill_1.ndf'],
      ['Cafe_log', 'C:\\SQL\\LOG\\CafeQrRestoreDrill_log.ldf'],
    ]);
    assert.deepEqual(buildMoves({ files, target: 'CafeQr', dataDir: '/var/opt/mssql/data/', logDir: '/var/opt/mssql/data' })[2], [
      'Cafe_log',
      '/var/opt/mssql/data/CafeQr_log.ldf',
    ]);
    const current = [
      { type: 'ROWS', path: 'D:\\db\\a.mdf' },
      { type: 'ROWS', path: 'D:\\db\\b.ndf' },
      { type: 'LOG', path: 'E:\\log\\c.ldf' },
    ];
    assert.deepEqual(buildMoves({ files, current, target: 'CafeQr', dataDir: 'X', logDir: 'Y' }), [
      ['Cafe', 'D:\\db\\a.mdf'],
      ['Cafe_2', 'D:\\db\\b.ndf'],
      ['Cafe_log', 'E:\\log\\c.ldf'],
    ]);
    // Khác số file → không đoán: về thư mục mặc định
    assert.equal(buildMoves({ files, current: current.slice(1), target: 'CafeQr', dataDir: 'X', logDir: 'Y' })[0][1], 'X\\CafeQr.mdf');
  });
});
