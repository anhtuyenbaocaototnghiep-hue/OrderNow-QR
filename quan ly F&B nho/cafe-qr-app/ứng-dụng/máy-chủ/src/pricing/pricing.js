// Bộ tính giá dùng chung (ADR-005 D-7, D-8) — module thuần: không phụ thuộc Express/DB, test được độc lập (tests/pricing.test.js).
// Thứ tự cố định: giá niêm yết → khuyến mãi dòng (giá thấp nhất) / giá combo → cộng phụ thu tùy chọn → khuyến mãi đơn (một cái, lớn nhất)
//   → chiết khấu hội viên (chỉ dòng cho phép cộng dồn) → giảm giá tay → làm tròn XUỐNG (mặc định 500đ). Không âm.
// Mọi số tiền là VND nguyên.

export class PricingError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Ngày / thứ / phút trong ngày theo giờ quán (Asia/Ho_Chi_Minh, UTC+7). dow: 0 = Chủ nhật … 6 = Thứ bảy. */
export function vnClock(now = new Date()) {
  const d = new Date(now.getTime() + VN_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** 'HH:MM' | 'HH:MM:SS' → phút trong ngày; null giữ null. */
export function toMinutes(t) {
  if (t === null || t === undefined || t === '') return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Khung giờ [from, to); from > to = qua nửa đêm; thiếu một đầu = cả ngày. */
export function inTimeWindow(from, to, minutes) {
  if (from === null || to === null) return true;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/** Khuyến mãi đang hiệu lực lúc `now` (ngày, thứ trong tuần — bit0 = CN, khung giờ). Chưa xét lượt dùng/ngày. */
export function isPromotionActive(p, now = new Date()) {
  if (!p || !p.isActive) return false;
  const c = vnClock(now);
  if (c.date < p.startDate || c.date > p.endDate) return false;
  if (!((p.daysOfWeekMask ?? 127) & (1 << c.dow))) return false;
  return inTimeWindow(toMinutes(p.startTime), toMinutes(p.endTime), c.minutes);
}

const targets = (p, item) => p.itemIds?.includes(item.id) || (item.categoryId !== null && p.categoryIds?.includes(item.categoryId));

/** Khuyến mãi giá đặc biệt tốt nhất cho một món (combo không nhận ITEM_PRICE). */
export function bestItemPromotion(item, promotions, now = new Date()) {
  if (item.itemType === 'COMBO') return null;
  let best = null;
  for (const p of promotions) {
    if (p.type !== 'ITEM_PRICE' || p.exhausted || !isPromotionActive(p, now) || !targets(p, item)) continue;
    const price = Math.round(Number(p.value));
    if (price >= item.price) continue;
    if (!best || price < best.price || (price === best.price && p.promotionId < best.promotion.promotionId)) best = { promotion: p, price };
  }
  return best;
}

/** Kiểm tùy chọn đã chọn theo nhóm gán cho món (Min/Max) → danh sách tùy chọn hợp lệ. */
function resolveOptions(item, optionIds, catalog) {
  const ids = [...new Set((optionIds ?? []).map(Number))];
  if (item.itemType === 'COMBO') {
    if (ids.length) throw new PricingError('INVALID_OPTIONS', `Combo "${item.name}" không có tùy chọn`, { menuItemId: item.id });
    return [];
  }
  const groupIds = item.groupIds ?? [];
  const chosen = [];
  for (const id of ids) {
    const opt = catalog.options.get(id);
    if (!opt || !groupIds.includes(opt.groupId)) {
      throw new PricingError('INVALID_OPTIONS', `Tùy chọn không hợp lệ cho món "${item.name}"`, { menuItemId: item.id, optionId: id });
    }
    chosen.push(opt);
  }
  for (const gid of groupIds) {
    const g = catalog.groups.get(gid);
    if (!g) continue;
    const n = chosen.filter((o) => o.groupId === gid).length;
    if (n < g.minSelect) throw new PricingError('INVALID_OPTIONS', `Vui lòng chọn ${g.name} cho món "${item.name}"`, { menuItemId: item.id, groupId: gid });
    if (n > g.maxSelect) {
      throw new PricingError('INVALID_OPTIONS', `${g.name} của món "${item.name}" chỉ chọn tối đa ${g.maxSelect}`, { menuItemId: item.id, groupId: gid });
    }
  }
  const groupOrder = (o) => catalog.groups.get(o.groupId)?.sortOrder ?? 0;
  return chosen.sort((a, b) => groupOrder(a) - groupOrder(b) || a.groupId - b.groupId || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
}

/**
 * Tính giá một đơn (khóa lúc gửi — D-8).
 * items: [{ menuItemId, quantity, note, optionIds }]
 * catalog: { items: Map(id → { id, name, price, itemType, categoryId, groupIds, components: [{ menuItemId, name, quantity }] }),
 *            groups: Map(id → { id, name, minSelect, maxSelect }), options: Map(id → { id, groupId, name, priceDelta, sortOrder }) }
 * promotions: ứng viên (đã lọc IsActive, có `exhausted` nếu hết lượt hôm nay).
 */
export function priceOrder(items, catalog, promotions = [], now = new Date()) {
  const missing = [...new Set(items.map((i) => i.menuItemId).filter((id) => !catalog.items.has(id)))];
  if (missing.length) throw new PricingError('ITEM_UNAVAILABLE', 'Có món không còn bán', { menuItemIds: missing });

  const lines = items.map((input) => {
    const item = catalog.items.get(input.menuItemId);
    const options = resolveOptions(item, input.optionIds, catalog);
    const optionDelta = options.reduce((s, o) => s + o.priceDelta, 0);
    const promo = bestItemPromotion(item, promotions, now);
    const listPrice = item.price + optionDelta;
    const unitPrice = (promo ? promo.price : item.price) + optionDelta;
    const quantity = input.quantity;
    return {
      menuItemId: item.id,
      name: item.name,
      itemType: item.itemType,
      quantity,
      note: input.note?.trim() || null,
      options: options.map((o) => ({ optionId: o.id, name: o.name, priceDelta: o.priceDelta })),
      listPrice,
      unitPrice,
      lineDiscount: (listPrice - unitPrice) * quantity,
      lineTotal: unitPrice * quantity,
      promotionId: promo?.promotion.promotionId ?? null,
      promotionName: promo?.promotion.name ?? null,
      allowMemberStack: promo ? Boolean(promo.promotion.stackWithMember) : true,
      children: item.itemType === 'COMBO' ? item.components.map((c) => ({ menuItemId: c.menuItemId, name: c.name, quantity: quantity * c.quantity })) : [],
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.listPrice * l.quantity, 0);
  const afterLine = lines.reduce((s, l) => s + l.lineTotal, 0);

  let orderPromotion = null;
  for (const p of promotions) {
    if ((p.type !== 'ORDER_PERCENT' && p.type !== 'ORDER_AMOUNT') || p.exhausted || !isPromotionActive(p, now)) continue;
    if (afterLine < Number(p.minOrderAmount || 0)) continue;
    const discount = Math.min(afterLine, p.type === 'ORDER_PERCENT' ? Math.round((afterLine * Number(p.value)) / 100) : Math.round(Number(p.value)));
    if (discount <= 0) continue;
    if (!orderPromotion || discount > orderPromotion.discount || (discount === orderPromotion.discount && p.promotionId < orderPromotion.promotionId)) {
      orderPromotion = { promotionId: p.promotionId, name: p.name, type: p.type, discount, stackWithMember: Boolean(p.stackWithMember) };
    }
  }
  if (orderPromotion && !orderPromotion.stackWithMember) for (const l of lines) l.allowMemberStack = false;

  const orderDiscount = orderPromotion?.discount ?? 0;
  return {
    lines,
    subtotal,
    lineDiscount: subtotal - afterLine,
    orderPromotion,
    promoDiscount: subtotal - afterLine + orderDiscount,
    total: afterLine - orderDiscount,
  };
}

/** Dòng phẳng cho TVP dbo.OrderLineInput (+ OrderLineOptionInput): dòng khách chọn trước, dòng con combo sau. */
export function toSpLines(priced) {
  const rows = [];
  const options = [];
  priced.lines.forEach((l, i) => {
    rows.push({
      lineNum: i + 1,
      parentLineNum: null,
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      note: l.note,
      listPrice: l.listPrice,
      unitPrice: l.unitPrice,
      promotionId: l.promotionId,
      allowMemberStack: l.allowMemberStack,
    });
    for (const o of l.options) options.push({ lineNum: i + 1, optionId: o.optionId });
  });
  let next = priced.lines.length + 1;
  priced.lines.forEach((l, i) => {
    for (const c of l.children) {
      rows.push({
        lineNum: next++,
        parentLineNum: i + 1,
        menuItemId: c.menuItemId,
        quantity: c.quantity,
        note: null,
        listPrice: 0,
        unitPrice: 0,
        promotionId: null,
        allowMemberStack: l.allowMemberStack,
      });
    }
  });
  return { rows, options };
}

/**
 * Tổng thanh toán (D-7): chiết khấu hội viên + giảm tay + làm tròn tính trên các đơn đã khóa giá.
 * orders: [{ totalAmount, subtotalAmount (null = đơn cũ), promoDiscount, orderPromoDiscount, lines: [{ lineTotal, allowMemberStack }] }]
 *   (lines chỉ gồm dòng khách chọn — không gồm dòng con combo)
 * member: { tierName, discountPercent, firstOrderDiscount } | null
 * manual: { kind: 'AMOUNT' | 'PERCENT', value, reason } | null
 * voucher (F-038): { code, percent | amount, maxDiscount, stackWithMember } | null — sau hội viên; stackWithMember = false → bỏ % hạng
 * reward (F-039): { amount, label } | null — đổi thưởng điểm / tem, sau voucher (service chặn dùng cùng giảm tay)
 * settings: { firstOrderPercent = 10, roundTo = 500, pointValue = 10000 }
 * Thứ tự: khuyến mãi (đã trong đơn) → hội viên → voucher → đổi thưởng → giảm tay → làm tròn xuống.
 */
export function settleTotals({ orders, member = null, manual = null, settings = {}, voucher = null, reward = null }) {
  const firstOrderPercent = Number(settings.firstOrderPercent ?? 10);
  const roundTo = Math.max(1, Number(settings.roundTo ?? 500));

  let subtotal = 0;
  let promoDiscount = 0;
  let ordersTotal = 0;
  let memberBase = 0;
  for (const o of orders) {
    const legacy = o.subtotalAmount === null || o.subtotalAmount === undefined;
    subtotal += legacy ? o.totalAmount : o.subtotalAmount;
    promoDiscount += legacy ? 0 : o.promoDiscount;
    ordersTotal += o.totalAmount;
    const afterLine = o.totalAmount + (o.orderPromoDiscount ?? 0);
    const eligible = o.lines.filter((l) => l.allowMemberStack !== false).reduce((s, l) => s + l.lineTotal, 0);
    // Khuyến mãi đơn chia đều theo tỉ lệ cho phần được cộng dồn
    memberBase += afterLine > 0 ? eligible - ((o.orderPromoDiscount ?? 0) * eligible) / afterLine : 0;
  }

  let memberPercent = 0;
  let firstOrderApplied = false;
  if (member && (!voucher || voucher.stackWithMember !== false)) {
    memberPercent = Number(member.discountPercent) || 0;
    if (member.firstOrderDiscount && firstOrderPercent > memberPercent) {
      memberPercent = firstOrderPercent;
      firstOrderApplied = true;
    }
  }
  const memberDiscount = Math.min(ordersTotal, Math.max(0, Math.round((memberBase * memberPercent) / 100)));
  const afterMember = ordersTotal - memberDiscount;

  let voucherDiscount = 0;
  if (voucher) {
    voucherDiscount = voucher.percent ? Math.round((afterMember * Math.min(100, Number(voucher.percent))) / 100) : Math.round(Number(voucher.amount) || 0);
    if (voucher.maxDiscount) voucherDiscount = Math.min(voucherDiscount, Number(voucher.maxDiscount));
    voucherDiscount = Math.min(afterMember, Math.max(0, voucherDiscount));
  }
  const afterVoucher = afterMember - voucherDiscount;
  const rewardDiscount = reward ? Math.min(afterVoucher, Math.max(0, Math.round(Number(reward.amount) || 0))) : 0;
  const afterReward = afterVoucher - rewardDiscount;

  let manualDiscount = 0;
  if (manual && Number(manual.value) > 0) {
    manualDiscount = manual.kind === 'PERCENT' ? Math.round((afterReward * Math.min(100, Number(manual.value))) / 100) : Math.round(Number(manual.value));
    manualDiscount = Math.min(afterReward, Math.max(0, manualDiscount));
  }
  const afterManual = afterReward - manualDiscount;
  const roundingAdj = afterManual % roundTo;
  const amountDue = afterManual - roundingAdj;

  const breakdownLines = [{ key: 'subtotal', label: 'Tạm tính', amount: subtotal }];
  if (promoDiscount > 0) breakdownLines.push({ key: 'promo', label: 'Khuyến mãi', amount: -promoDiscount });
  if (memberDiscount > 0) {
    breakdownLines.push({
      key: 'member',
      label: firstOrderApplied ? `Hội viên — ưu đãi đơn đầu −${memberPercent}%` : `Hội viên ${member.tierName ?? ''} −${memberPercent}%`.replace('  ', ' '),
      amount: -memberDiscount,
    });
  }
  if (voucherDiscount > 0) {
    breakdownLines.push({
      key: 'voucher',
      label: `Voucher ${voucher.code ?? ''}${voucher.percent ? ` −${Number(voucher.percent)}%` : ''}`.trim(),
      amount: -voucherDiscount,
    });
  }
  if (rewardDiscount > 0) breakdownLines.push({ key: 'reward', label: reward.label ?? 'Đổi thưởng', amount: -rewardDiscount });
  if (manualDiscount > 0) breakdownLines.push({ key: 'manual', label: manual.reason ? `Giảm giá (${manual.reason})` : 'Giảm giá', amount: -manualDiscount });
  if (roundingAdj > 0) breakdownLines.push({ key: 'rounding', label: 'Làm tròn', amount: -roundingAdj });
  breakdownLines.push({ key: 'total', label: 'Tổng thanh toán', amount: amountDue });

  return {
    subtotal,
    promoDiscount,
    ordersTotal,
    memberPercent: member ? memberPercent : null,
    firstOrderApplied,
    memberDiscount,
    voucherDiscount,
    rewardDiscount,
    manualDiscount,
    roundingAdj,
    amountDue,
    // F-039 (D-27): điểm dự kiến tích = 1 / pointValue đồng thực trả (SP tính lại cùng công thức khi ghi)
    pointsEarned: member ? pointsFor(amountDue, settings.pointValue) : 0,
    breakdownLines,
  };
}

/** D-27: số điểm tích cho số tiền thực trả. */
export const pointsFor = (amountDue, pointValue = 10000) => (Number(pointValue) > 0 ? Math.floor(amountDue / Number(pointValue)) : 0);

/** Giá một đơn vị rẻ nhất của các món `menuItemIds` trên bill (sau khuyến mãi dòng) — quà "món miễn phí" (F-039). null nếu không có. */
export function cheapestUnit(orders, menuItemIds) {
  let best = null;
  for (const o of orders) {
    for (const l of o.lines) {
      if (!menuItemIds.includes(l.menuItemId) || !(l.quantity > 0)) continue;
      const unit = Math.round(l.lineTotal / l.quantity);
      if (!best || unit < best.unit) best = { menuItemId: l.menuItemId, name: l.name, unit };
    }
  }
  return best;
}

/** Tem dự kiến (F-039): Σ SL món thuộc chương trình trên bill, trừ món được tặng. programs: [{ programId, name, menuItemIds }] */
export function stampsFor(orders, programs, freeItemId = null) {
  return programs
    .map((p) => {
      let qty = 0;
      for (const o of orders) for (const l of o.lines) if (p.menuItemIds.includes(l.menuItemId)) qty += l.quantity;
      if (freeItemId && p.menuItemIds.includes(freeItemId)) qty -= 1;
      return { programId: p.programId, name: p.name, stamps: Math.max(0, qty) };
    })
    .filter((x) => x.stamps > 0);
}

/** D-14: nhân viên tự giảm khi không vượt cả % lẫn số tiền tối đa (tính trên số tiền sau chiết khấu hội viên). */
export function manualNeedsApproval(manualDiscount, base, { staffMaxPercent = 10, staffMaxAmount = 20000 } = {}) {
  if (manualDiscount <= 0) return false;
  return manualDiscount > Number(staffMaxAmount) || manualDiscount > Math.floor((base * Number(staffMaxPercent)) / 100);
}

// ---------- Chia bill theo phần (FEATURE-026, ADR-006 D-17) ----------

/** Chia `discount` cho các dòng theo tỉ lệ lineTotal (phần dư cho dòng có phần lẻ lớn nhất, hòa thì dòng trước) → mảng số nguyên, tổng = discount. */
export function allocateOrderPromo(lineTotals, discount) {
  const total = lineTotals.reduce((s, x) => s + x, 0);
  if (!discount || discount <= 0 || total <= 0) return lineTotals.map(() => 0);
  const d = Math.min(discount, total);
  const raw = lineTotals.map((x) => (d * x) / total);
  const out = raw.map(Math.floor);
  let rest = d - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k].i] += 1;
  return out;
}

/**
 * Đơn của một phần (chỉ dòng `inPart(line)`), khuyến mãi đơn phân bổ theo dòng trên TOÀN BỘ dòng của đơn
 * (nên Σ mọi phần = khuyến mãi đơn). Kết quả dùng thẳng làm `orders` của settleTotals.
 * orders: [{ orderPromoDiscount, lines: [{ lineTotal, listTotal, allowMemberStack, … }] }]
 * → { orders, linesTotal (Σ lineTotal dòng được chọn), promoAlloc (Σ khuyến mãi đơn phân bổ) }
 */
export function partOrders(orders, inPart) {
  const out = [];
  let linesTotal = 0;
  let promoAlloc = 0;
  for (const o of orders) {
    const alloc = allocateOrderPromo(
      o.lines.map((l) => l.lineTotal),
      o.orderPromoDiscount ?? 0,
    );
    const picked = o.lines.map((l, i) => ({ l, a: alloc[i] })).filter((x) => inPart(x.l));
    if (!picked.length) continue;
    const lt = picked.reduce((s, x) => s + x.l.lineTotal, 0);
    const al = picked.reduce((s, x) => s + x.a, 0);
    const list = picked.reduce((s, x) => s + (x.l.listTotal ?? x.l.lineTotal), 0);
    out.push({ totalAmount: lt - al, subtotalAmount: list, promoDiscount: list - lt + al, orderPromoDiscount: al, lines: picked.map((x) => x.l) });
    linesTotal += lt;
    promoAlloc += al;
  }
  return { orders: out, linesTotal, promoAlloc };
}
