// Kịch bản ép tải tranh chấp kho (test-strategy §13.2, NFR-002) + đo độ trễ realtime (NFR-001) qua HTTP thật.
// Chạy trên DB TEST (reset sạch), server khởi động trong tiến trình này:  npm run load
// Tham số: --rounds 10 --clients 30
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { io as ioc } from 'socket.io-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const ROUNDS = arg('--rounds', 10);
const CLIENTS = arg('--clients', 30);
const SERVING_ML = 50; // BOM "Trà đào" = 50 ml cốt trà đào

const dbName = process.env.TEST_DB_NAME || 'CafeQrTest';
if (!/test$/i.test(dbName)) throw new Error('TEST_DB_NAME phải kết thúc bằng "Test"');
Object.assign(process.env, { DB_NAME: dbName, RATE_LIMIT: 'off', NODE_ENV: 'test' });
process.env.JWT_SECRET ||= 'load-test-secret';

execFileSync(process.execPath, [path.join(root, 'kịch-bản/db-migrate.js'), '--db', dbName, '--reset', '--quiet'], { stdio: 'inherit', env: process.env });
const { config } = await import('../ứng-dụng/máy-chủ/src/config.js');
const { seedBase } = await import('./seed-data.js');
const pool = await new sql.ConnectionPool(config.db).connect();
await seedBase(pool, { adminUsername: 'admin', adminPassword: 'Admin@123' });

const { createApp } = await import('../ứng-dụng/máy-chủ/src/app.js');
const { attachRealtime } = await import('../ứng-dụng/máy-chủ/src/realtime/io.js');
const { initAvailability } = await import('../ứng-dụng/máy-chủ/src/services/menuService.js');
const { closePool } = await import('../ứng-dụng/máy-chủ/src/db.js');
const server = http.createServer(createApp());
const io = attachRealtime(server);
await initAvailability();
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, url, { body, token, cookie } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(cookie && { Cookie: cookie }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: await res.json().catch(() => null), cookie: setCookie?.split(';')[0] };
}

const admin = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).body.accessToken;
const menu = (await call('GET', '/api/admin/menu-items', { token: admin })).body;
const traDao = menu.find((m) => m.name === 'Trà đào').menuItemId;
const ingredients = (await call('GET', '/api/admin/ingredients', { token: admin })).body;
const ingId = (name) => ingredients.find((i) => i.name === name).ingredientId;
const tables = (await call('GET', '/api/admin/tables', { token: admin })).body;

const staffSocket = ioc(base, { transports: ['websocket'], auth: { token: admin } });
await new Promise((r) => staffSocket.on('ready', r));
const receivedAt = new Map();
staffSocket.on('order.created', (p) => receivedAt.set(p.order.orderId, Date.now()));

async function violations() {
  const r = await pool.request().query(`
    SELECT 'NEGATIVE' AS v FROM dbo.Ingredients WHERE StockQty < 0 OR ReservedQty < 0
    UNION ALL SELECT 'RESERVED_MISMATCH' FROM dbo.Ingredients ing
      OUTER APPLY (SELECT ISNULL(SUM(oi.Qty),0) q FROM dbo.OrderIngredients oi JOIN dbo.Orders o ON o.OrderId = oi.OrderId
                   WHERE oi.IngredientId = ing.IngredientId AND o.Status IN ('PENDING','PREPARING')) x WHERE ing.ReservedQty <> x.q
    UNION ALL SELECT 'DOUBLE_DEDUCT' FROM dbo.InventoryTransactions WHERE Type = 'DEDUCT' GROUP BY OrderId, IngredientId HAVING COUNT(*) > 1`);
  return r.recordset.map((x) => x.v);
}

const latencies = [];
let pass = 0;
console.log(`Kịch bản §13.2: ${ROUNDS} vòng × ${CLIENTS} khách gửi đồng thời "Trà đào" khi kho chỉ đủ M suất\n`);
for (let round = 1; round <= ROUNDS; round++) {
  const servings = 1 + Math.floor(Math.random() * 5);
  // Đặt tồn kho đúng M suất (các đơn vòng trước đã hoàn tất nên ReservedQty = 0)
  await call('POST', `/api/admin/ingredients/${ingId('Cốt trà đào')}/adjust`, {
    token: admin,
    body: { newQty: servings * SERVING_ML, reason: `load round ${round}` },
  }).catch(() => {});
  for (const name of ['Đào ngâm', 'Đường'])
    await call('POST', `/api/admin/ingredients/${ingId(name)}/adjust`, { token: admin, body: { delta: 1000, reason: 'load' } });

  // Mỗi khách: cookie riêng + phiên riêng
  const clients = await Promise.all(
    Array.from({ length: CLIENTS }, async (_, i) => {
      const first = await call('GET', '/api/menu');
      const s = await call('POST', '/api/sessions', { cookie: first.cookie, body: { qrToken: tables[i % tables.length].qrToken } });
      return { cookie: first.cookie, sessionId: s.body.session.sessionId };
    }),
  );
  const sentAt = new Map();
  const results = await Promise.all(
    clients.map(async (c) => {
      const t0 = Date.now();
      const r = await call('POST', '/api/orders', { cookie: c.cookie, body: { sessionId: c.sessionId, items: [{ menuItemId: traDao, quantity: 1 }] } });
      if (r.status === 201) sentAt.set(r.body.orderId, t0);
      return r;
    }),
  );
  const ok = results.filter((r) => r.status === 201);
  const oos = results.filter((r) => r.status === 409 && r.body.code === 'OUT_OF_STOCK');
  await new Promise((r) => setTimeout(r, 300));
  for (const [id, t0] of sentAt) if (receivedAt.has(id)) latencies.push(receivedAt.get(id) - t0);

  // Quầy tiếp nhận rồi bắn 2 request hoàn tất đồng thời cho mỗi đơn
  for (const r of ok) await call('POST', `/api/orders/${r.body.orderId}/accept`, { token: admin });
  const comp = await Promise.all(
    ok.flatMap((r) => [
      call('POST', `/api/orders/${r.body.orderId}/complete`, { token: admin }),
      call('POST', `/api/orders/${r.body.orderId}/complete`, { token: admin }),
    ]),
  );
  const compOk = comp.filter((r) => r.status === 200).length;
  const compDup = comp.filter((r) => r.status === 409 && r.body.code === 'ALREADY_PROCESSED').length;
  const stock = (
    await pool.request().input('id', sql.Int, ingId('Cốt trà đào')).query('SELECT StockQty, ReservedQty FROM dbo.Ingredients WHERE IngredientId = @id')
  ).recordset[0];
  const v = await violations();
  const good =
    ok.length === servings &&
    oos.length === CLIENTS - servings &&
    compOk === servings &&
    compDup === servings &&
    stock.StockQty === 0 &&
    stock.ReservedQty === 0 &&
    v.length === 0;
  if (good) pass++;
  console.log(
    `${good ? 'PASS' : 'FAIL'} vòng ${String(round).padStart(2)}: M=${servings} → 201: ${ok.length}, 409 OUT_OF_STOCK: ${oos.length}; hoàn tất 200: ${compOk}, 409 ALREADY_PROCESSED: ${compDup}; tồn ${stock.StockQty}/giữ ${stock.ReservedQty}${v.length ? `; VI PHẠM: ${v.join(',')}` : ''}`,
  );
}

latencies.sort((a, b) => a - b);
const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
console.log(`\nNFR-002: ${pass}/${ROUNDS} vòng PASS (${pass === ROUNDS ? '100 %' : 'CÓ LỖI'})`);
if (latencies.length)
  console.log(
    `NFR-001 (máy local, ${latencies.length} đơn): gửi → quầy nhận realtime p50 = ${p(0.5)} ms, p95 = ${p(0.95)} ms, max = ${latencies.at(-1)} ms (ngưỡng < 2000 ms)`,
  );

staffSocket.close();
io.close();
server.close();
await closePool();
await pool.close();
process.exit(pass === ROUNDS ? 0 : 1);
