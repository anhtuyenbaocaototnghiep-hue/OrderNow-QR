// Áp migration + stored procedure lên SQL Server.
//   npm run db:migrate                 → DB trong DB_NAME
//   npm run db:migrate -- --db CafeQrTest --reset   → xóa sạch schema dbo rồi tạo lại (chỉ cho DB tên kết thúc bằng "Test")
//   npm run db:migrate -- --create                  → tạo database nếu chưa có (login cần quyền dbcreator/sa — dùng cho CI/Docker)
// - cơ-sở-dữ-liệu/chuyển-đổi/NNNN_*.sql: chạy một lần, ghi vào dbo.SchemaMigrations; KHÔNG sửa file đã chạy.
// - cơ-sở-dữ-liệu/thủ-tục/*.sql: CREATE OR ALTER, chạy lại mỗi lần (idempotent).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { config } from '../ứng-dụng/máy-chủ/src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const database = argValue('--db') || config.db.database;
const reset = args.includes('--reset');
const create = args.includes('--create');
const quiet = args.includes('--quiet');
const log = (...m) => quiet || console.log(...m);

const splitBatches = (text) =>
  text
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

async function resetSchema(pool) {
  if (!/test$/i.test(database)) throw new Error(`--reset chỉ dùng cho DB test (tên kết thúc bằng "Test"), không phải ${database}`);
  const drops = await pool.request().query(`
    SELECT 'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + '.' + QUOTENAME(OBJECT_NAME(parent_object_id))
           + ' DROP CONSTRAINT ' + QUOTENAME(name) AS stmt, 1 AS ord FROM sys.foreign_keys
    UNION ALL SELECT 'DROP TABLE dbo.' + QUOTENAME(name), 2 FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')
    UNION ALL SELECT 'DROP PROCEDURE dbo.' + QUOTENAME(name), 3 FROM sys.procedures WHERE schema_id = SCHEMA_ID('dbo')
    UNION ALL SELECT 'DROP TYPE dbo.' + QUOTENAME(name), 4 FROM sys.types WHERE is_user_defined = 1 AND schema_id = SCHEMA_ID('dbo')
    ORDER BY ord`);
  for (const { stmt } of drops.recordset) await pool.request().batch(stmt);
  log(`reset: dropped ${drops.recordset.length} objects in ${database}`);
}

async function createDatabaseIfMissing() {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Tên database không hợp lệ: ${database}`);
  const master = await new sql.ConnectionPool({ ...config.db, database: 'master' }).connect();
  try {
    await master.request().batch(`IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}] COLLATE Vietnamese_CI_AS`);
  } finally {
    await master.close();
  }
}

async function main() {
  if (create) await createDatabaseIfMissing();
  const pool = await new sql.ConnectionPool({ ...config.db, database }).connect();
  try {
    if (reset) await resetSchema(pool);

    await pool.request().batch(`
      IF OBJECT_ID('dbo.SchemaMigrations') IS NULL
        CREATE TABLE dbo.SchemaMigrations (
          Filename  NVARCHAR(200) NOT NULL PRIMARY KEY,
          AppliedAt DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
        );`);
    const applied = new Set((await pool.request().query('SELECT Filename FROM dbo.SchemaMigrations')).recordset.map((r) => r.Filename));

    const migDir = path.join(root, 'cơ-sở-dữ-liệu', 'chuyển-đổi');
    const migrations = (await fs.readdir(migDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const file of migrations) {
      if (applied.has(file)) {
        log(`skip   ${file}`);
        continue;
      }
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const batch of splitBatches(await fs.readFile(path.join(migDir, file), 'utf8'))) {
          await new sql.Request(tx).batch(batch);
        }
        await new sql.Request(tx).input('f', sql.NVarChar(200), file).query('INSERT dbo.SchemaMigrations (Filename) VALUES (@f)');
        await tx.commit();
        log(`apply  ${file}`);
      } catch (err) {
        await tx.rollback().catch(() => {});
        throw new Error(`Migration ${file} lỗi: ${err.message}`);
      }
    }

    const procDir = path.join(root, 'cơ-sở-dữ-liệu', 'thủ-tục');
    const procs = (await fs.readdir(procDir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of procs) {
      for (const batch of splitBatches(await fs.readFile(path.join(procDir, file), 'utf8'))) {
        try {
          await pool.request().batch(batch);
        } catch (err) {
          throw new Error(`Procedure ${file} lỗi: ${err.message}`);
        }
      }
      log(`proc   ${file}`);
    }
    log(`OK — ${database}`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
