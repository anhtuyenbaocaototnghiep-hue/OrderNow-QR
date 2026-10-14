// Chuẩn bị DB test thật (SQL Server, không mock): reset schema + migrate + seed nền.
// Dùng TEST_DB_NAME (mặc định CafeQrTest). Phải gọi useTestDatabase() TRƯỚC khi import module app (config đọc env lúc import).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export function useTestDatabase() {
  const name = process.env.TEST_DB_NAME || 'CafeQrTest';
  if (!/test$/i.test(name)) throw new Error('TEST_DB_NAME phải kết thúc bằng "Test"');
  process.env.DB_NAME = name;
  process.env.RATE_LIMIT = 'off';
  process.env.JWT_SECRET ||= 'test-secret-only-for-local-tests';
  process.env.ADMIN_SEED_USERNAME = 'admin';
  process.env.ADMIN_SEED_PASSWORD = 'Admin@123';
  return name;
}

export async function resetTestDatabase() {
  const name = useTestDatabase();
  execFileSync(process.execPath, [path.join(root, 'kịch-bản/db-migrate.js'), '--db', name, '--reset', '--quiet'], {
    stdio: 'inherit',
    env: process.env,
  });
  const { config } = await import('../../src/config.js');
  const { seedBase } = await import('../../../../kịch-bản/seed-data.js');
  const pool = await new sql.ConnectionPool({ ...config.db, database: name }).connect();
  const seeded = await seedBase(pool, { adminUsername: 'admin', adminPassword: 'Admin@123' });
  return { pool, ...seeded };
}

export async function scalar(pool, query, inputs = {}) {
  const req = pool.request();
  for (const [k, [type, v]] of Object.entries(inputs)) req.input(k, type, v);
  const r = await req.query(query);
  return Object.values(r.recordset[0] ?? {})[0];
}

/** Bất biến kho sau mọi test (BR-001, BR-002, ADR-001). Trả về danh sách vi phạm (rỗng = OK). */
export async function inventoryViolations(pool) {
  const r = await pool.request().query(`
    SELECT 'NEGATIVE_STOCK' AS v, IngredientId FROM dbo.Ingredients WHERE StockQty < 0 OR ReservedQty < 0
    UNION ALL
    SELECT 'RESERVED_MISMATCH', ing.IngredientId
    FROM dbo.Ingredients ing
    OUTER APPLY (SELECT ISNULL(SUM(oi.Qty), 0) AS q FROM dbo.OrderIngredients oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
                 WHERE oi.IngredientId = ing.IngredientId AND o.Status IN ('PENDING','PREPARING')) x
    WHERE ing.ReservedQty <> x.q
    UNION ALL
    SELECT 'DOUBLE_DEDUCT', IngredientId FROM dbo.InventoryTransactions WHERE Type = 'DEDUCT'
    GROUP BY OrderId, IngredientId HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'UNPAID_IN_CLOSED_SESSION', o.OrderId FROM dbo.Orders o JOIN dbo.Sessions s ON s.SessionId = o.SessionId
    WHERE s.Status = 'CLOSED' AND o.Status <> 'CANCELLED' AND o.PaymentStatus = 'UNPAID'`);
  return r.recordset;
}

export { sql };
