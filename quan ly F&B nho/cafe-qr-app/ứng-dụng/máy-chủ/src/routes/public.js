// API khách (không đăng nhập — cookie cf_client) + đăng nhập nhân viên + health.
// Khách chỉ chạm phiên/đơn của mình (SessionClients); không có endpoint nào cho khách đổi PaymentStatus (BR-007).
import express from 'express';
import { z } from 'zod';
import { request, withDeadlockRetry } from '../db.js';
import { capsOf } from '../auth/permissions.js';
import { optionalStaff, requireStaff } from '../middleware/auth.js';
import { loginLimiter, memberLimiters, orderLimiter } from '../middleware/rateLimit.js';
import { paramGuid, paramId, parse, zBirthDate, zGuid, zId, zOrderItems, zQrToken, zText } from '../middleware/validate.js';
import * as memberService from '../services/memberService.js';
import * as menuService from '../services/menuService.js';
import * as orderService from '../services/orderService.js';
import * as qrCheckService from '../services/qrCheckService.js';
import * as usersRepo from '../repositories/usersRepo.js';
import * as sessionService from '../services/sessionService.js';
import * as settingsService from '../services/settingsService.js';
import * as staffCallService from '../services/staffCallService.js';
import * as userService from '../services/userService.js';

export const publicRouter = express.Router();

publicRouter.get('/health', async (_req, res) => {
  try {
    await (await request()).query('SELECT 1 AS ok');
    res.json({ status: 'ok', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// ---- Auth (FEATURE-009) ----
publicRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const body = parse(
    z.object({
      username: zText(50).min(1, 'Nhập tên đăng nhập'),
      password: z.string().min(1, 'Nhập mật khẩu').max(100),
      // F-080: 'admin' = đăng nhập trang Quản lý — không chấm công vào. F-084: 'pos' = màn đăng nhập quầy (luôn gửi) — chủ quán bị từ chối.
      // Không gửi (công cụ / script gọi API) → như trước: chấm công theo vai, không chặn.
      area: z.enum(['pos', 'admin']).optional(),
    }),
    req.body,
  );
  res.json(await userService.login(body.username, body.password, { ip: req.ip, area: body.area }));
});

// F-053: tên / địa chỉ quán đọc từ Cài đặt (chưa lưu → .env). F-061: nhóm menu nâng cao đang bật (`modules`), `user.tourSeenAt`
// F-072: `attendance` — chấm công bằng màn chung (KIOSK) hay theo đăng nhập; có cần PIN cho thao tác tiền không
publicRouter.get('/auth/me', requireStaff, async (req, res) => {
  const s = await settingsService.getSettings();
  res.json({
    user: { ...req.user, caps: capsOf(req.user) }, // F-079: quyền đang có (mặc định theo vai + đặt riêng) — giao diện ẩn / hiện theo đây
    shop: await settingsService.shopInfo(),
    modules: s.uiModules,
    attendance: { mode: s.attendanceMode, moneyPin: s.moneyPin },
    pos: { oneTap: s.oneTap }, // F-076
  });
});
// ADR-045: đã đăng nhập trang Quản lý (gõ mật khẩu) → mở máy quầy không đăng nhập lại: chấm công vào như đăng nhập quầy (chế độ
// theo đăng nhập). Giao diện dùng lại chính token đang có — không cấp token mới (không kéo dài phiên). Chủ quán → 403 OWNER_ADMIN_ONLY.
publicRouter.post('/auth/pos-session', requireStaff, async (req, res) => res.json(await userService.startPosSession(req.user)));
// F-061 (ADR-021 D-80): xem xong / bỏ qua hướng dẫn 5 bước ở màn quầy — lưu theo tài khoản
publicRouter.post('/auth/tour-seen', requireStaff, async (req, res) => res.json({ tourSeenAt: await usersRepo.markTourSeen(req.user.userId) }));
// F-062 (D-81): tên + địa chỉ quán cho trang Chính sách dữ liệu (công khai, chỉ 2 trường này)
publicRouter.get('/shop', async (_req, res) => res.json(await settingsService.shopInfo()));
// F-063 (D-82): QR đang dán trên bàn có còn đúng địa chỉ máy chủ không — quản lý + màn quầy hiện cảnh báo
publicRouter.get('/qr-check', requireStaff, async (_req, res) => res.json(await qrCheckService.check()));

// ---- Menu (FEATURE-002) ----
// Quầy gọi kèm Bearer → thấy cả danh mục ngoài giờ bán (bán mang đi); khách chỉ thấy danh mục đang trong giờ (F-020)
publicRouter.get('/menu', optionalStaff, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ shop: { name: (await settingsService.shopInfo()).name }, ...(await menuService.getPublicMenu({ staff: Boolean(req.user) })) });
});

// ---- Hội viên (FEATURE-014): khách thấy tên che; quầy (Bearer) thấy tên đầy đủ. Giới hạn tra cứu D-6 ----
const zPhone = () => z.string().trim().min(1, 'Nhập số điện thoại').max(20);
publicRouter.post('/members/lookup', optionalStaff, ...memberLimiters, async (req, res) => {
  const { phone } = parse(z.object({ phone: zPhone() }), req.body);
  res.json(await memberService.lookup(phone, { staff: Boolean(req.user) }));
});

publicRouter.post('/members', optionalStaff, ...memberLimiters, async (req, res) => {
  const body = parse(
    z.object({
      phone: zPhone(),
      fullName: zText(100).min(2, 'Nhập họ tên'),
      consent: z.boolean().optional(),
      referrerPhone: z.string().trim().max(20).optional().nullable(),
      birthDate: zBirthDate().optional().nullable(), // F-068: không bắt buộc, năm không bắt buộc
    }),
    req.body,
  );
  res.status(201).json(await memberService.register(body, { staff: Boolean(req.user) }));
});

publicRouter.post('/sessions/:id/member', optionalStaff, ...memberLimiters, async (req, res) => {
  const body = parse(
    z.object({ phone: zPhone().optional(), memberId: zId().optional() }).refine((b) => b.phone || b.memberId, 'Nhập số điện thoại'),
    req.body,
  );
  res.json({ member: await memberService.attachToSession(paramGuid(req), body, { user: req.user, clientToken: req.clientToken }) });
});

// F-067: khách thêm ngày sinh ở Thẻ thành viên (một lần) để nhận quà sinh nhật
publicRouter.post('/sessions/:id/member/birthday', optionalStaff, ...memberLimiters, async (req, res) => {
  const { birthDate } = parse(z.object({ birthDate: zBirthDate() }), req.body);
  res.json(await sessionService.selfBirthDate(paramGuid(req), birthDate, { user: req.user, clientToken: req.clientToken }));
});

publicRouter.delete('/sessions/:id/member', optionalStaff, async (req, res) => {
  res.json(await memberService.detachFromSession(paramGuid(req), { user: req.user, clientToken: req.clientToken }));
});

// ---- Phiên khách (FEATURE-001, 004, 005) ----
const qrBody = z.object({ qrToken: zQrToken() });

publicRouter.post('/sessions/scan', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.json(await sessionService.scan(qrToken, req.clientToken));
});

publicRouter.post('/sessions', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.status(201).json(await sessionService.createSession(qrToken, req.clientToken));
});

publicRouter.post('/sessions/:id/join', async (req, res) => {
  const { qrToken } = parse(qrBody, req.body);
  res.json(await sessionService.join(paramGuid(req), qrToken, req.clientToken));
});

publicRouter.get('/sessions/:id', optionalStaff, async (req, res) => {
  // DEF-019: điện thoại khách đọc phiên đúng lúc quầy thu tiền / hoàn tất → đôi khi deadlock 1205 → 500; chỉ đọc nên chạy lại an toàn
  res.json(await withDeadlockRetry(() => sessionService.getDetail(paramGuid(req), { user: req.user, clientToken: req.clientToken })));
});

publicRouter.post('/sessions/:id/request-payment', async (req, res) => {
  res.json(await sessionService.requestPayment(paramGuid(req), req.clientToken));
});

// ---- Gọi nhân viên (FEATURE-021): 60 giây/phiên ----
publicRouter.post('/sessions/:id/call-staff', async (req, res) => {
  const body = parse(z.object({ type: z.enum(['STAFF']).default('STAFF'), message: zText(100).optional().nullable() }), req.body ?? {});
  res.status(201).json(await staffCallService.call(paramGuid(req), body.message || null, req.clientToken));
});

// ---- Đơn khách (FEATURE-003) ----
// Báo giá giỏ (khuyến mãi, combo, tùy chọn) — cùng bộ tính với lúc gửi; FE không tự tính tiền (ADR-005)
publicRouter.post('/orders/quote', async (req, res) => {
  const { items } = parse(z.object({ items: zOrderItems() }), req.body);
  res.json(await orderService.quoteItems(items));
});

publicRouter.post('/orders', orderLimiter, async (req, res) => {
  const body = parse(
    z.object({
      sessionId: zGuid(),
      items: zOrderItems(),
      note: zText(200).optional().nullable(),
      // F-066 (ADR-024 D-93): hẹn giờ làm món — sau 5–45 phút, hoặc chờ bạn tới (tối đa 45 phút)
      hold: z
        .discriminatedUnion('mode', [
          z.object({ mode: z.literal('TIME'), minutes: z.coerce.number().int().min(5, 'Hẹn từ 5 phút').max(45, 'Hẹn tối đa 45 phút') }),
          z.object({ mode: z.literal('ARRIVAL') }),
        ])
        .optional()
        .nullable(),
    }),
    req.body,
  );
  const key = parse(z.string().max(100).optional(), req.get('idempotency-key') || undefined);
  const order = await orderService.submitDineIn(body, req.clientToken, key);
  res.status(201).json({
    orderId: order.orderId,
    orderCode: order.orderCode,
    totalAmount: order.totalAmount,
    status: order.status,
    paymentStatus: order.paymentStatus,
    order,
  });
});

// F-066: "Bạn đã tới — làm món" (thiết bị trong phiên hoặc nhân viên)
publicRouter.post('/orders/:id/release', optionalStaff, async (req, res) => {
  res.json({ order: await orderService.release(paramId(req), { user: req.user, clientToken: req.clientToken }) });
});

publicRouter.get('/orders/:id', optionalStaff, async (req, res) => {
  res.json(await orderService.getForViewer(paramId(req), { user: req.user, clientToken: req.clientToken }));
});
