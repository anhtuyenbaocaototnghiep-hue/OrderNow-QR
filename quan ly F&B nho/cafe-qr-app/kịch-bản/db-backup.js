// Sao lưu CSDL chạy thật + ảnh hóa đơn sổ quỹ (bước 15, ADR-016 D-62). Chỉ ĐỌC dữ liệu.
//   npm run db:backup                         → sao lưu ngay (máy chủ app cũng tự sao lưu — F-103, ADR-074; Task Scheduler không bắt buộc)
//   npm run db:backup -- --label truoc-v1.1   → bản trước phát hành / migration (giữ 12 tháng)
//   npm run db:backup -- --dir D:\thu-muc      → thư mục khác BACKUP_DIR (thử script)
// Lõi dùng chung với máy chủ app: ứng-dụng/máy-chủ/src/services/backupService.js (tạo thư mục + cấp quyền cho SQL Server khi chưa có,
// BACKUP DATABASE … WITH CHECKSUM, chép ảnh, chép sang BACKUP_COPY_DIR, dọn bản cũ, last-backup.json, backup.log).
// - Không sao lưu .env (chứa mật khẩu) — giữ theo tài-liệu/vận-hành/secrets-register.md.
// - Mã thoát: 0 = xong, 1 = lỗi. Không gọi process.exit(): trên Windows, thoát khi kết nối còn đang đóng làm Node crash
//   (mã âm) và file .cmd / Task Scheduler hiểu nhầm là "xong".
import { BackupError, runBackup } from '../ứng-dụng/máy-chủ/src/services/backupService.js';
import { closePool } from '../ứng-dụng/máy-chủ/src/db.js';

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const r = await runBackup({ label: argValue('--label') || '', dir: argValue('--dir'), copyDir: argValue('--copy-dir') });
  console.log(`Sao lưu CSDL ${r.db} → ${r.file}`);
  console.log(`Xong: ${(r.bytes / 1024 / 1024).toFixed(1)} MB trong ${r.seconds} giây · ảnh (hóa đơn, món, logo): ${r.uploads} file`);
  if (r.copyDir) console.log(r.copied ? `Đã chép sang ${r.copyDir}` : `CHƯA chép được sang ${r.copyDir}: ${r.copyError} — bản trong BACKUP_DIR vẫn dùng được`);
  if (r.removed.length) console.log(`Đã dọn ${r.removed.length} bản cũ: ${r.removed.join(', ')}`);
  return r.copyDir && !r.copied ? 1 : 0;
}

process.exitCode = await main().catch((err) => {
  console.error(`\n*** Sao lưu KHÔNG thành công: ${err.message} ***`);
  if (!(err instanceof BackupError)) console.error(err.stack);
  return 1;
});
await closePool().catch(() => {});
