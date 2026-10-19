// Seed dữ liệu mẫu (idempotent).
//   npm run db:seed          → admin (ADMIN_SEED_USERNAME/ADMIN_SEED_PASSWORD), staff1/Staff@123, menu, nguyên liệu, BOM, 6 bàn
//   npm run db:seed:demo     → thêm đơn lịch sử 01–10/10/2026 cho báo cáo
//   npm run db:seed:mau2     → thêm mẫu giai đoạn 2: tùy chọn Size/Topping, combo, khuyến mãi, món ghim (ADR-005)
import sql from 'mssql';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';
import { seedBase, seedDemo, seedExtras } from './seed-data.js';

const adminUsername = process.env.ADMIN_SEED_USERNAME;
const adminPassword = process.env.ADMIN_SEED_PASSWORD;
if (!adminUsername || !adminPassword) {
  console.error('Thiếu ADMIN_SEED_USERNAME / ADMIN_SEED_PASSWORD trong .env');
  process.exit(1);
}

const pool = await new sql.ConnectionPool(config.db).connect();
try {
  const result = await seedBase(pool, { adminUsername, adminPassword });
  result.log.forEach((l) => console.log(l));
  if (process.argv.includes('--demo')) console.log(await seedDemo(pool, result.adminId));
  if (process.argv.includes('--extras')) console.log(await seedExtras(pool));
  const tables = await pool.request().query('SELECT Code, QrToken FROM dbo.Tables WHERE DeletedAt IS NULL AND IsActive = 1 ORDER BY Code');
  console.log('\nURL quét QR từng bàn:');
  for (const t of tables.recordset) console.log(`  Bàn ${t.Code}: ${config.publicBaseUrl}/t/${t.QrToken}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.close();
}
