// FEATURE-025 Thời gian chờ ước tính (ADR-006 D-18): hàng chờ = món SINGLE của đơn PENDING/PREPARING (cache 10 giây,
// xóa cache khi đơn đổi trạng thái); thời gian chuẩn món = quản lý nhập → trung vị 30 ngày (job 02:00) → mặc định.
import { etaRange, linesSeconds } from '../domain/eta.js';
import * as etaRepo from '../repositories/etaRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { notFound } from '../errors.js';
import { getSettings } from './settingsService.js';

const QUEUE_TTL_MS = 10_000;
const ITEMS_TTL_MS = 30_000;
let queueCache = null;
let itemsCache = null;

async function queue() {
  if (queueCache && queueCache.expires > Date.now()) return queueCache.value;
  const value = await etaRepo.queueLines();
  queueCache = { value, expires: Date.now() + QUEUE_TTL_MS };
  return value;
}

async function items() {
  if (itemsCache && itemsCache.expires > Date.now()) return itemsCache.value;
  const value = await etaRepo.itemsForEta();
  itemsCache = { value, expires: Date.now() + ITEMS_TTL_MS };
  return value;
}

/** Gọi khi đơn được gửi / tiếp nhận / hoàn tất / hủy. */
export function invalidateQueue() {
  queueCache = null;
}

/** Sau khi quản lý sửa thời gian pha / job thống kê chạy. */
export function invalidateItems() {
  itemsCache = null;
}

const qty = (lines) => lines.reduce((s, l) => s + l.quantity, 0);

/** ETA cho giỏ đang chọn: { minMinutes, maxMinutes, etaSeconds, queueLength (số món đang chờ) }. */
export async function queueEta(cart = []) {
  const [settings, map, q] = await Promise.all([getSettings(), items(), queue()]);
  const opts = { defaultSeconds: settings.etaDefaultItemSeconds };
  const r = etaRange({
    baseSeconds: settings.etaBaseSeconds,
    parallelism: settings.kitchenParallelism,
    spreadPercent: settings.etaSpreadPercent,
    queueSeconds: linesSeconds(q, map, opts),
    cartSeconds: linesSeconds(cart, map, opts),
  });
  return { ...r, queueLength: qty(q), queueOrders: new Set(q.map((l) => l.orderId)).size };
}

/** ETA đơn đang chờ của một phiên: các món đứng trước + món của phiên (đến đơn cuối của phiên). null khi không còn đơn chờ. */
export async function sessionEta(sessionId) {
  if (!(await sessionsRepo.findById(sessionId))) throw notFound('Không tìm thấy phiên');
  const [settings, map, q] = await Promise.all([getSettings(), items(), queue()]);
  const last = q.map((l) => l.sessionId).lastIndexOf(sessionId);
  if (last < 0) return null;
  const ahead = q.slice(0, last + 1);
  const r = etaRange({
    baseSeconds: settings.etaBaseSeconds,
    parallelism: settings.kitchenParallelism,
    spreadPercent: settings.etaSpreadPercent,
    queueSeconds: linesSeconds(ahead, map, { defaultSeconds: settings.etaDefaultItemSeconds }),
  });
  return { ...r, aheadItems: qty(ahead) };
}

/** Quản lý: thời gian chuẩn vs thực tế từng món. */
export async function prepStats() {
  const [settings, map] = await Promise.all([getSettings(), etaRepo.itemsForEta()]);
  return [...map.values()]
    .filter((i) => i.itemType === 'SINGLE')
    .map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      prepSeconds: i.prepSeconds,
      medianSeconds: i.medianSeconds ?? null,
      sampleCount: i.sampleCount,
      computedAt: i.computedAt ?? null,
      usedSeconds: i.prepSeconds || (i.medianSeconds && i.sampleCount >= 3 ? i.medianSeconds : settings.etaDefaultItemSeconds),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Job 02:00 — thống kê thời gian pha thực tế. */
export async function recomputeStats() {
  const n = await etaRepo.recomputePrepStats(30);
  invalidateItems();
  return { items: n };
}
