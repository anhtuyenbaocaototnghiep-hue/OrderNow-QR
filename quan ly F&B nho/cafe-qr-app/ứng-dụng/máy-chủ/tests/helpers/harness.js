// Khởi động app thật (HTTP + Socket.io) trên DB test sạch cho các bộ test tích hợp mới (ADR-005).
import assert from 'node:assert/strict';
import http from 'node:http';
import supertest from 'supertest';
import { io as ioc } from 'socket.io-client';
import { inventoryViolations, resetTestDatabase } from './testDb.js';

export const auth = (token) => ({ Authorization: `Bearer ${token}` });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const todayVn = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export async function startApp() {
  const ctx = await resetTestDatabase();
  const { createApp } = await import('../../src/app.js');
  const { attachRealtime } = await import('../../src/realtime/io.js');
  const { initAvailability } = await import('../../src/services/menuService.js');
  const server = http.createServer(createApp());
  attachRealtime(server);
  await initAvailability();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = supertest(server);
  const sockets = [];

  async function login(username, password) {
    const r = await api.post('/api/auth/login').send({ username, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.accessToken;
  }

  /** Một "điện thoại khách": giữ cookie cf_client. */
  async function customer() {
    const r = await api.get('/api/menu');
    const cookie = r.headers['set-cookie'].find((c) => c.startsWith('cf_client=')).split(';')[0];
    const call = (method, path, body, headers = {}) => {
      const req = api[method](path).set('Cookie', cookie).set(headers);
      return body === undefined ? req : req.send(body);
    };
    return { cookie, get: (p) => call('get', p), post: (p, b, h) => call('post', p, b ?? {}, h), del: (p) => call('delete', p) };
  }

  /** Khách quét QR bàn → phiên của mình. */
  async function seat(c, tableCode) {
    const qr = (await ctx.pool.request().query(`SELECT QrToken FROM dbo.Tables WHERE Code = '${tableCode}'`)).recordset[0].QrToken;
    const r = await c.post('/api/sessions/scan', { qrToken: qr });
    if (r.body.state === 'OCCUPIED') return (await c.post('/api/sessions', { qrToken: qr })).body.session.sessionId;
    return r.body.session.sessionId;
  }

  function connect(opts) {
    return new Promise((resolve, reject) => {
      const s = ioc(base, { transports: ['websocket'], reconnection: false, ...opts });
      sockets.push(s);
      s.on('ready', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  function waitFor(socket, event, predicate = () => true, ms = 2000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout chờ ${event}`)), ms);
      const handler = (payload) => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(payload);
        }
      };
      socket.on(event, handler);
    });
  }

  const ids = async () =>
    Object.fromEntries(
      (await ctx.pool.request().query('SELECT MenuItemId, Name FROM dbo.MenuItems WHERE DeletedAt IS NULL')).recordset.map((m) => [m.Name, m.MenuItemId]),
    );

  async function close() {
    sockets.forEach((s) => s.close());
    const violations = await inventoryViolations(ctx.pool);
    await new Promise((r) => server.close(r));
    const { closePool } = await import('../../src/db.js');
    await closePool();
    await ctx.pool.close();
    assert.deepEqual(violations, []);
  }

  return { ctx, pool: ctx.pool, api, base, login, customer, seat, connect, waitFor, ids, close };
}
