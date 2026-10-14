// Kết nối SQL Server qua `mssql` (tedious). Một pool dùng chung cho toàn tiến trình.
import sql from 'mssql';
import { config } from './config.js';

let poolPromise = null;

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config.db).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export async function closePool() {
  if (poolPromise) {
    const pool = await poolPromise.catch(() => null);
    poolPromise = null;
    if (pool) await pool.close();
  }
}

export async function request() {
  return (await getPool()).request();
}

/** query('SELECT … WHERE Id = @id', { id: [sql.Int, 5] }) */
export async function query(text, params = {}) {
  const req = await request();
  for (const [name, [type, value]] of Object.entries(params)) req.input(name, type, value);
  return req.query(text);
}

/** Chạy fn(tx) trong một transaction; rollback nếu lỗi. */
export async function inTransaction(fn) {
  const tx = new sql.Transaction(await getPool());
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

export function txQuery(tx, text, params = {}) {
  const req = new sql.Request(tx);
  for (const [name, [type, value]] of Object.entries(params)) req.input(name, type, value);
  return req.query(text);
}

/** Số lỗi SQL Server (THROW 5000x, 1205 deadlock, 2627 trùng khóa…). */
export function sqlErrorNumber(err) {
  return err?.number ?? err?.originalError?.info?.number ?? err?.originalError?.number;
}

/** Chạy lại khi bị chọn làm nạn nhân deadlock (1205) — tối đa 3 lần, backoff ngắn. */
export async function withDeadlockRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (sqlErrorNumber(err) !== 1205 || i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * i + Math.floor(Math.random() * 30)));
    }
  }
}

export { sql };
