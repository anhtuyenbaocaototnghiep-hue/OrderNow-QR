// FEATURE-045 (skill F-024): "Lần trước bạn gọi … — Gọi lại?" + "Món yêu thích" (top 5 hay gọi + món đánh dấu ♥).
// Gọi lại: kiểm từng dòng (món còn trên thực đơn, còn bán, tùy chọn còn hợp lệ) và lấy giá HIỆN TẠI; dòng không còn → bỏ qua + lý do.
// Khách chỉ dùng được với hội viên đang gắn vào phiên của mình; quầy dùng mọi hội viên.
import { forbidden, notFound } from '../errors.js';
import { priceOrder, PricingError } from '../pricing/pricing.js';
import * as ordersRepo from '../repositories/ordersRepo.js';
import * as recallRepo from '../repositories/recallRepo.js';
import { getPublicMenu } from './menuService.js';
import { getCatalog } from './pricingService.js';

async function assertAccess(memberId, viewer) {
  if (viewer.user) return;
  if (!(await recallRepo.clientHasMember(viewer.clientToken, memberId))) {
    throw forbidden('Chỉ xem được đơn của hội viên đang gắn với bàn của bạn');
  }
}

/** Món trên thực đơn hiện tại theo người xem (khách: theo lịch; quầy: đủ). */
async function menuItems(viewer) {
  const menu = await getPublicMenu({ staff: Boolean(viewer.user) });
  return new Map([...menu.categories.flatMap((c) => c.items), ...menu.combos].map((i) => [i.id, i]));
}

/** Kiểm một dòng đơn cũ → { item } (dòng giỏ mới, giá hiện tại) | { skip } (lý do). */
function checkLine(line, menu, catalog) {
  const item = menu.get(line.menuItemId);
  if (!item) return { skip: { name: line.name, reason: 'không còn trên thực đơn lúc này' } };
  if (!item.isAvailable) return { skip: { name: line.name, reason: 'đang hết món' } };
  const optionIds = line.options.map((o) => o.optionId);
  let priced;
  try {
    priced = priceOrder([{ menuItemId: line.menuItemId, quantity: 1, optionIds }], catalog);
  } catch (err) {
    if (err instanceof PricingError) return { skip: { name: line.name, reason: 'tùy chọn đã thay đổi — vui lòng chọn lại' } };
    throw err;
  }
  const opts = priced.lines[0].options;
  const optionDelta = opts.reduce((s, o) => s + o.priceDelta, 0);
  return {
    item: {
      menuItemId: item.id,
      name: item.name,
      quantity: line.quantity,
      note: line.note,
      optionIds,
      optionLabels: opts.map((o) => o.name),
      optionDelta,
      price: item.price + optionDelta,
    },
  };
}

export async function recentOrders(memberId, limit, viewer) {
  await assertAccess(memberId, viewer);
  const ids = await recallRepo.recentOrderIds(memberId, limit);
  const [orders, menu, catalog] = await Promise.all([ordersRepo.listByIds(ids), menuItems(viewer), getCatalog()]);
  return orders.map((o) => ({
    orderId: o.orderId,
    orderCode: o.orderCode,
    paidAt: o.paidAt,
    totalAmount: o.totalAmount,
    items: o.items.map((i) => {
      const r = checkLine(i, menu, catalog);
      return {
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        note: i.note,
        options: i.options.map((x) => x.name),
        available: Boolean(r.item),
        reason: r.skip?.reason ?? null,
      };
    }),
  }));
}

export async function favorites(memberId, viewer) {
  await assertAccess(memberId, viewer);
  const [hearted, top, menu] = await Promise.all([recallRepo.favoriteIds(memberId), recallRepo.topItems(memberId, 5), menuItems(viewer)]);
  const times = new Map(top.map((t) => [t.menuItemId, t.quantity]));
  const ids = [...new Set([...hearted, ...top.map((t) => t.menuItemId)])];
  return {
    hearted,
    items: ids
      .map((id) => menu.get(id))
      .filter(Boolean)
      .map((i) => ({
        menuItemId: i.id,
        name: i.name,
        price: i.price,
        isAvailable: i.isAvailable,
        hearted: hearted.includes(i.id),
        timesOrdered: times.get(i.id) ?? 0,
      })),
  };
}

export async function setFavorite(memberId, menuItemId, on, viewer) {
  await assertAccess(memberId, viewer);
  const catalog = await getCatalog();
  if (!catalog.items.has(menuItemId)) throw notFound('Không tìm thấy món');
  if (on) await recallRepo.addFavorite(memberId, menuItemId);
  else await recallRepo.removeFavorite(memberId, menuItemId);
  return favorites(memberId, viewer);
}

/** Gọi lại đơn cũ → giỏ đã kiểm: { orderId, items[], skipped[] }. Giá lấy theo thực đơn hiện tại (không lấy giá cũ). */
export async function replay(orderId, viewer) {
  const memberId = await recallRepo.memberOfOrder(orderId);
  if (!memberId) throw notFound('Không tìm thấy đơn của hội viên');
  await assertAccess(memberId, viewer);
  const [order, menu, catalog] = await Promise.all([ordersRepo.getById(orderId), menuItems(viewer), getCatalog()]);
  const items = [];
  const skipped = [];
  for (const line of order.items) {
    const r = checkLine(line, menu, catalog);
    if (r.item) items.push(r.item);
    else skipped.push(r.skip);
  }
  return { orderId, orderCode: order.orderCode, items, skipped };
}
