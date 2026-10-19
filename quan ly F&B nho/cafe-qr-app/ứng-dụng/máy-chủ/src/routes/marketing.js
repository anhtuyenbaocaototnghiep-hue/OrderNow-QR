// API quản lý "Marketing & Khách hàng" (chỉ ADMIN — gắn dưới /api/admin): hội viên + hạng (F-014), combo (F-015),
// khuyến mãi (F-016), gợi ý & ghim (F-017), báo cáo marketing.
import express from 'express';
import { z } from 'zod';
import { paramId, parse, parseRange, parseUtcRange, zDate, zId, zText, zTime } from '../middleware/validate.js';
import * as marketingService from '../services/marketingService.js';
import * as memberService from '../services/memberService.js';
import * as loyaltyService from '../services/loyaltyService.js';
import * as campaignService from '../services/campaignService.js';
import { sendCsv } from '../utils/csv.js';
import { badRequest } from '../errors.js';
import { todayVn } from '../utils/time.js';

export const marketingRouter = express.Router();

const zPrice = () => z.coerce.number().int('Giá phải là số nguyên (VND)').min(0, 'Giá không được âm').max(100_000_000);
const zImage = () =>
  z
    .string()
    .trim()
    .max(500)
    .refine((s) => s === '' || /^(https?:\/\/|\/)[^\s]*$/i.test(s), 'Ảnh phải là URL http(s) hoặc đường dẫn bắt đầu bằng /')
    .optional()
    .nullable()
    .transform((s) => s || null);

// ---- Hội viên ----
marketingRouter.get('/members', async (req, res) => {
  const q = parse(z.object({ q: z.string().max(100).optional().default(''), page: z.coerce.number().int().min(1).default(1) }), req.query);
  res.json(await memberService.adminList(q));
});
marketingRouter.get('/members/:id', async (req, res) => res.json(await memberService.adminGet(paramId(req))));
marketingRouter.put('/members/:id', async (req, res) => {
  const body = parse(
    z.object({
      fullName: zText(100).min(2, 'Nhập họ tên'),
      tierCode: z.string().max(20),
      note: zText(200).optional().nullable(),
      birthDate: zDate().optional().nullable(),
      isActive: z.boolean().default(true),
    }),
    req.body,
  );
  res.json(await memberService.adminUpdate(paramId(req), body));
});
marketingRouter.post('/members/:id/anonymize', async (req, res) => res.json(await memberService.anonymize(paramId(req))));
marketingRouter.get('/member-tiers', async (_req, res) => res.json(await memberService.tiers()));
marketingRouter.put('/member-tiers', async (req, res) => {
  const list = parse(
    z
      .array(
        z.object({
          tierCode: z.string().max(20),
          name: zText(50).min(1, 'Nhập tên hạng'),
          minSpent: z.coerce.number().int().min(0).max(10_000_000_000),
          discountPercent: z.coerce.number().min(0).max(50, 'Chiết khấu tối đa 50%'),
        }),
      )
      .min(1)
      .max(10),
    req.body,
  );
  res.json(await memberService.updateTiers(list));
});

// ---- Combo ----
const comboBody = z.object({
  name: zText(100).min(1, 'Nhập tên combo'),
  price: zPrice(),
  imageUrl: zImage(),
  isAvailable: z.boolean().default(true),
  isActive: z.boolean().default(true),
  components: z
    .array(z.object({ menuItemId: zId(), quantity: z.coerce.number().int().min(1).max(10, 'Tối đa 10 mỗi món') }))
    .min(1, 'Chọn món cho combo')
    .max(10)
    .refine((list) => list.reduce((s, c) => s + c.quantity, 0) >= 2, 'Combo cần ít nhất 2 phần món'),
});
marketingRouter.get('/combos', async (_req, res) => res.json(await marketingService.listCombos()));
marketingRouter.post('/combos', async (req, res) => res.status(201).json(await marketingService.createCombo(parse(comboBody, req.body))));
marketingRouter.put('/combos/:id', async (req, res) => res.json(await marketingService.updateCombo(paramId(req), parse(comboBody, req.body))));
marketingRouter.patch('/combos/:id/availability', async (req, res) => {
  const { isAvailable } = parse(z.object({ isAvailable: z.boolean() }), req.body);
  res.json(await marketingService.setComboAvailability(paramId(req), isAvailable));
});

// ---- Khuyến mãi ----
const promotionBody = z.object({
  name: zText(100).min(1, 'Nhập tên khuyến mãi'),
  type: z.enum(['ITEM_PRICE', 'ORDER_PERCENT', 'ORDER_AMOUNT']),
  value: z.coerce.number().min(0).max(100_000_000),
  minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
  startDate: zDate(),
  endDate: zDate(),
  daysOfWeekMask: z.coerce.number().int().min(0).max(127).default(127),
  startTime: zTime(),
  endTime: zTime(),
  maxUsesPerDay: z.coerce.number().int().min(1).max(100000).nullable().optional().default(null),
  stackWithMember: z.boolean().default(false),
  badgeText: zText(30).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  itemIds: z.array(zId()).max(200).default([]),
  categoryIds: z.array(zId()).max(50).default([]),
});
const parsePromotion = (body) => {
  const d = parse(promotionBody, body);
  if (d.type === 'ORDER_PERCENT' && d.value > 100)
    throw badRequest('VALIDATION_ERROR', 'Phần trăm giảm tối đa 100', { fields: [{ path: 'value', message: '≤ 100' }] });
  if (d.type !== 'ORDER_PERCENT') d.value = Math.round(d.value);
  return { ...d, badgeText: d.badgeText || null };
};
marketingRouter.get('/promotions', async (_req, res) => res.json(await marketingService.listPromotions()));
marketingRouter.post('/promotions', async (req, res) => res.status(201).json(await marketingService.createPromotion(parsePromotion(req.body))));
marketingRouter.get('/promotions/:id', async (req, res) => res.json(await marketingService.getPromotion(paramId(req))));
marketingRouter.put('/promotions/:id', async (req, res) => res.json(await marketingService.updatePromotion(paramId(req), parsePromotion(req.body))));
marketingRouter.patch('/promotions/:id/active', async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  res.json(await marketingService.setPromotionActive(paramId(req), isActive));
});
marketingRouter.delete('/promotions/:id', async (req, res) => res.json({ result: await marketingService.deletePromotion(paramId(req)) }));
marketingRouter.get('/promotions/:id/stats', async (req, res) => {
  const { from, to } = req.query.from ? parseRange(req.query) : { from: '2000-01-01', to: todayVn() };
  res.json(await marketingService.promotionStats(paramId(req), from, to));
});

// ---- Gợi ý & ghim ----
marketingRouter.get('/suggestions', async (_req, res) => res.json(await marketingService.suggestionsAdmin()));
marketingRouter.put('/suggestions', async (req, res) => {
  const body = parse(
    z.object({
      mode: z.enum(['AUTO', 'PINNED', 'BOTH']),
      topN: z.coerce.number().int().min(1).max(20).default(8),
      windowDays: z.coerce.number().int().min(1).max(90).default(7),
      pins: z.array(z.object({ menuItemId: zId(), label: zText(30).optional().nullable() })).max(20),
      hidden: z.array(zId()).max(200).default([]),
    }),
    req.body,
  );
  res.json(await marketingService.saveSuggestions(body));
});

// ---- Báo cáo marketing ----
marketingRouter.get('/reports/marketing', async (req, res) => {
  const { from, to } = parseRange(req.query);
  if (to > todayVn()) throw badRequest('INVALID_RANGE', 'Khoảng thời gian không hợp lệ');
  res.json(await marketingService.marketingReport(from, to));
});

// ---- F-039 Tích điểm đổi quà & tem · F-038 voucher (ADR-006 D-27, D-28) ----
const rewardBody = z
  .object({
    name: zText(100).min(1, 'Nhập tên quà'),
    pointsCost: z.coerce.number().int().min(1, 'Số điểm phải lớn hơn 0').max(1_000_000),
    rewardType: z.enum(['DISCOUNT', 'FREE_ITEM']),
    discountAmount: z.coerce.number().int().min(1).max(10_000_000).optional().nullable(),
    menuItemId: zId().optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .refine((r) => (r.rewardType === 'DISCOUNT' ? r.discountAmount > 0 : Boolean(r.menuItemId)), 'Quà giảm tiền cần số tiền; quà tặng món cần chọn món');
marketingRouter.get('/rewards', async (_req, res) => res.json(await loyaltyService.rewards()));
marketingRouter.post('/rewards', async (req, res) => res.status(201).json(await loyaltyService.saveReward(null, parse(rewardBody, req.body))));
marketingRouter.put('/rewards/:id', async (req, res) => res.json(await loyaltyService.saveReward(paramId(req), parse(rewardBody, req.body))));
marketingRouter.delete('/rewards/:id', async (req, res) => res.json({ result: await loyaltyService.removeReward(paramId(req)) }));

const programBody = z.object({
  name: zText(100).min(1, 'Nhập tên chương trình'),
  requiredStamps: z.coerce.number().int().min(2).max(50).default(10),
  rewardMenuItemId: zId().optional().nullable(),
  isActive: z.boolean().default(true),
  menuItemIds: z.array(zId()).min(1, 'Chọn ít nhất một món tích tem').max(200),
});
marketingRouter.get('/stamp-programs', async (_req, res) => res.json(await loyaltyService.programs()));
marketingRouter.post('/stamp-programs', async (req, res) => res.status(201).json(await loyaltyService.saveProgram(null, parse(programBody, req.body))));
marketingRouter.put('/stamp-programs/:id', async (req, res) => res.json(await loyaltyService.saveProgram(paramId(req), parse(programBody, req.body))));
marketingRouter.delete('/stamp-programs/:id', async (req, res) => res.json({ result: await loyaltyService.removeProgram(paramId(req)) }));

marketingRouter.get('/members/:id/loyalty', async (req, res) => res.json(await loyaltyService.memberDetail(paramId(req))));
marketingRouter.post('/members/:id/points', async (req, res) => {
  const body = parse(
    z.object({
      delta: z.coerce
        .number()
        .int()
        .min(-1_000_000)
        .max(1_000_000)
        .refine((v) => v !== 0, 'Nhập số điểm cộng / trừ'),
      reason: zText(200).min(1, 'Nhập lý do điều chỉnh điểm'),
    }),
    req.body,
  );
  res.json(await loyaltyService.adjustPoints(paramId(req), body, req.user));
});

marketingRouter.get('/vouchers', async (req, res) => {
  const { fromUtc, toUtc } = parseUtcRange(req.query);
  const { source } = parse(z.object({ source: z.enum(['REFERRAL', 'CAMPAIGN', 'MANUAL']).optional() }).passthrough(), {
    ...req.query,
    source: req.query.source || undefined,
  });
  res.json(await loyaltyService.listVouchers({ fromUtc, toUtc, source: source ?? null }));
});
marketingRouter.post('/vouchers', async (req, res) => {
  const body = parse(
    z
      .object({
        memberId: zId().optional().nullable(),
        percent: z.coerce.number().min(1).max(100).optional().nullable(),
        amount: z.coerce.number().int().min(1000).max(10_000_000).optional().nullable(),
        maxDiscount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
        minOrderAmount: z.coerce.number().int().min(0).max(100_000_000).default(0),
        stackWithMember: z.boolean().default(true),
        days: z.coerce.number().int().min(1).max(365).default(30),
      })
      .refine((v) => Boolean(v.percent) !== Boolean(v.amount), 'Chọn giảm theo % HOẶC số tiền'),
    req.body,
  );
  res.status(201).json(await loyaltyService.createManualVoucher(body, req.user));
});

// ---- F-037 Phân khúc + chiến dịch (ADR-006 D-29) ----
const zCount = (max) => z.coerce.number().int().min(0).max(max).optional();
const segmentRule = z
  .object({
    tierIn: z.array(zText(20).min(1)).max(10).optional(),
    lastVisitDaysGte: zCount(3650),
    lastVisitDaysLte: zCount(3650),
    visitCountGte: zCount(100_000),
    visitCountLte: zCount(100_000),
    totalSpentGte: zCount(10_000_000_000),
    birthdayMonth: z.coerce.number().int().min(1).max(12).optional(),
    hasPointsGte: zCount(10_000_000),
  })
  .strict();
const segmentBody = z.object({ name: zText(100).min(1, 'Nhập tên phân khúc'), rule: segmentRule });
marketingRouter.get('/segments', async (_req, res) => res.json(await campaignService.segments()));
marketingRouter.post('/segments/preview', async (req, res) => res.json(await campaignService.preview(parse(segmentRule, req.body?.rule ?? {}))));
marketingRouter.post('/segments', async (req, res) => res.status(201).json(await campaignService.saveSegment(null, parse(segmentBody, req.body), req.user)));
marketingRouter.put('/segments/:id', async (req, res) => res.json(await campaignService.saveSegment(paramId(req), parse(segmentBody, req.body), req.user)));
marketingRouter.delete('/segments/:id', async (req, res) => res.json({ result: await campaignService.removeSegment(paramId(req)) }));

const campaignBody = z
  .object({
    name: zText(100).min(1, 'Nhập tên chiến dịch'),
    segmentId: zId(),
    channel: z.enum(['EXPORT', 'ZALO_OA', 'SMS']).default('EXPORT'),
    messageTemplate: zText(500).min(1, 'Nhập nội dung tin nhắn'),
    voucherPercent: z.coerce.number().min(1).max(100).optional().nullable(),
    voucherDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
    voucherMinOrder: z.coerce.number().int().min(0).max(100_000_000).default(0),
    scheduledAt: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional()
      .nullable(),
  })
  .refine((c) => !c.voucherPercent || c.voucherDays, 'Nhập số ngày hiệu lực của voucher')
  .refine((c) => !c.scheduledAt || c.scheduledAt > new Date(Date.now() - 60_000), 'Giờ hẹn phải ở tương lai');
marketingRouter.get('/campaigns', async (_req, res) => res.json(await campaignService.campaigns()));
marketingRouter.get('/campaigns/:id', async (req, res) => res.json(await campaignService.get(paramId(req))));
marketingRouter.post('/campaigns', async (req, res) => res.status(201).json(await campaignService.create(parse(campaignBody, req.body), req.user)));
marketingRouter.put('/campaigns/:id', async (req, res) => res.json(await campaignService.update(paramId(req), parse(campaignBody, req.body))));
marketingRouter.delete('/campaigns/:id', async (req, res) => res.json({ result: await campaignService.remove(paramId(req)) }));
marketingRouter.post('/campaigns/:id/run', async (req, res) => res.json(await campaignService.run(paramId(req))));
marketingRouter.get('/campaigns/:id/export.csv', async (req, res) => {
  const { campaign, header, rows } = await campaignService.exportRows(paramId(req), req);
  sendCsv(res, `chien-dich-${campaign.campaignId}.csv`, header, rows);
});
marketingRouter.patch('/members/:id/opt-out', async (req, res) => {
  const { optOut } = parse(z.object({ optOut: z.boolean() }), req.body);
  res.json(await campaignService.setOptOut(paramId(req), optOut));
});
