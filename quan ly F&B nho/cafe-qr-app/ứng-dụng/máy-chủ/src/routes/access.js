// F-079 (ADR-037): quyền riêng từng tài khoản + xin quyền / duyệt.
//  - accessRouter (gắn thẳng dưới /api, mỗi route requireStaff): danh mục quyền, gửi / xem yêu cầu của mình.
//  - accessAdminRouter (gắn dưới /api/admin qua adminRouter — requireAdminArea): xem / đặt quyền riêng của một người, duyệt / từ chối.
//    `users/…` chỉ chủ quán sửa; `access-requests` không thuộc quyền cấp được → chỉ chủ quán.
import express from 'express';
import { z } from 'zod';
import { CAPABILITIES } from '../auth/permissions.js';
import { requireStaff } from '../middleware/auth.js';
import { paramId, parse, zText } from '../middleware/validate.js';
import * as accessService from '../services/accessService.js';

const CAP_KEYS = CAPABILITIES.map((c) => c.key);
const zCap = () => z.enum(CAP_KEYS, { message: 'Quyền không hợp lệ' });

export const accessRouter = express.Router();

accessRouter.get('/access/capabilities', requireStaff, (_req, res) => res.json(accessService.catalogue()));
accessRouter.get('/access-requests/mine', requireStaff, async (req, res) => res.json(await accessService.mine(req.user)));
accessRouter.post('/access-requests', requireStaff, async (req, res) => {
  const body = parse(z.object({ capability: zCap(), reason: zText(200).optional().nullable() }), req.body);
  const { request, created } = await accessService.request(req.user, body);
  res.status(created ? 201 : 200).json({ request, created });
});

export const accessAdminRouter = express.Router();

accessAdminRouter.get('/users/:id/grants', async (req, res) => res.json(await accessService.grantsView(paramId(req))));
accessAdminRouter.put('/users/:id/grants', async (req, res) => {
  const { grants } = parse(
    z.object({
      grants: z
        .array(
          z.object({
            capability: zCap(),
            effect: z.enum(['ALLOW', 'DENY'], { message: 'Chọn Cho phép hoặc Không cho' }),
            expiresAt: z.coerce.date().nullable().optional(),
            note: zText(200).optional().nullable(),
          }),
        )
        .max(CAP_KEYS.length),
    }),
    req.body,
  );
  res.json(await accessService.setGrants(paramId(req), grants, req.user));
});
accessAdminRouter.get('/access-requests', async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['PENDING', 'ALL']).default('PENDING') }), req.query);
  res.json({ requests: await accessService.list({ status }), pending: await accessService.countPending() });
});
accessAdminRouter.post('/access-requests/:id/approve', async (req, res) => {
  const body = parse(
    z.object({ duration: z.enum(['TODAY', 'WEEK', 'ALWAYS'], { message: 'Chọn thời hạn' }), note: zText(200).optional().nullable() }),
    req.body,
  );
  res.json(await accessService.approve(paramId(req), body, req.user));
});
accessAdminRouter.post('/access-requests/:id/reject', async (req, res) => {
  const body = parse(z.object({ note: zText(200).optional().nullable() }), req.body ?? {});
  res.json(await accessService.reject(paramId(req), body, req.user));
});
