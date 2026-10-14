// In link QR của các bàn đang hoạt động (chỉ đọc, không sửa dữ liệu).  npm run qr:links
// Mở một link bằng trình duyệt (nên dùng cửa sổ ẩn danh hoặc điện thoại) để vào vai khách ngồi bàn đó.
import sql from 'mssql';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';

const pool = await new sql.ConnectionPool(config.db).connect();
try {
  const r = await pool.request().query('SELECT Code, Name, QrToken FROM dbo.Tables WHERE DeletedAt IS NULL AND IsActive = 1 ORDER BY Code');
  console.log(`Link QR các bàn đang hoạt động (PUBLIC_BASE_URL = ${config.publicBaseUrl}):\n`);
  for (const t of r.recordset) console.log(`  ${t.Name.padEnd(12)} ${config.publicBaseUrl}/t/${t.QrToken}`);
  if (r.recordset.length === 0) console.log('  (chưa có bàn nào — tạo ở Quản lý → Bàn & mã QR)');
  console.log('\nMẹo: mỗi cửa sổ ẩn danh / mỗi điện thoại là một "khách" khác nhau.');
} catch (err) {
  console.error(`Không đọc được danh sách bàn: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.close();
}
