// Tra cứu API (F-052, ADR-011 D-49…D-51): đọc router Express lúc chạy → method, đường dẫn đầy đủ, mức quyền theo middleware.
// Gắn dưới /api/admin (requireAdminArea ở adminRouter) — chỉ Chủ quán (không nằm trong STORE_MGR_AREAS). Mô tả request / response ghép ở apiDocsService từ api-contract.md.
import express from 'express';
import { capabilityForAdmin, PERMISSIONS, ROLES, storeManagerMay } from '../auth/permissions.js';
import { optionalStaff, requireAdmin, requireStaff } from '../middleware/auth.js';
import * as apiDocsService from '../services/apiDocsService.js';

export const apiDocsRouter = express.Router();

const ADMIN_PREFIX = '/api/admin';

/**
 * Mức quyền từ các middleware chạy trước handler. requireAdmin / requireAdminArea > requirePermission(p) > requireStaff > optionalStaff > công khai.
 * requireAdminArea (F-077): Chủ quán; thêm Quản lý cửa hàng nếu `method path` nằm trong STORE_MGR_AREAS.
 */
export function accessOf(handlers, route = null) {
  if (handlers.includes(requireAdmin)) return { access: 'ADMIN', roles: ['ADMIN'], permission: null };
  if (handlers.some((h) => h.adminArea)) {
    const sub = route?.path.startsWith(ADMIN_PREFIX) ? route.path.slice(ADMIN_PREFIX.length) : null;
    const capability = sub !== null ? capabilityForAdmin(route.method, sub) : null; // F-079: quyền cấp riêng được (null = chỉ chủ quán)
    return sub !== null && storeManagerMay(route.method, sub)
      ? { access: 'STORE_MGR', roles: ['STORE_MGR', 'ADMIN'], permission: null, capability }
      : { access: 'ADMIN', roles: ['ADMIN'], permission: null, capability };
  }
  const permission = handlers.find((h) => typeof h.permission === 'string')?.permission;
  if (permission) {
    const roles = ROLES.filter((r) => PERMISSIONS[permission]?.includes(r));
    const access = roles.find((r) => r !== 'ADMIN') ?? 'ADMIN';
    return { access, roles, permission };
  }
  if (handlers.includes(requireStaff)) return { access: 'STAFF', roles: ROLES, permission: null };
  if (handlers.includes(optionalStaff)) return { access: 'CLIENT_OR_STAFF', roles: [], permission: null };
  return { access: 'PUBLIC', roles: [], permission: null };
}

/**
 * Mọi route của các router đã gắn ({ prefix, router, pathless } — app.locals.apiRouters), theo đúng cách Express chạy:
 * - router con gắn không tiền tố (`adminRouter.use(marketingRouter)`) đi theo tiền tố cha;
 * - middleware cấp router gắn không tiền tố (`staffRouter.use(requireStaff)`) chạy cho mọi request đi qua router đó, nên áp
 *   cho route khai báo sau nó — kể cả route của router anh em gắn sau (request không khớp route nào vẫn đi tiếp xuống dưới).
 * Gắn có tiền tố (`.use('/x', …)`) không đọc được đường dẫn: router con → test AC-052-02 báo thiếu route;
 * middleware → bỏ qua, test so quyền với server (AC-052-01, review G3) báo lệch.
 */
export function listRoutes(mounts) {
  const out = [];
  const walk = (router, prefix, inherited) => {
    let before = [...inherited];
    for (const layer of router.stack) {
      if (layer.route) {
        const handlers = [...before, ...layer.route.stack.map((l) => l.handle)];
        const routePath = String(layer.route.path);
        for (const method of Object.keys(layer.route.methods).filter((m) => m !== '_all')) {
          const route = { method: method.toUpperCase(), path: prefix + (routePath === '/' ? '' : routePath) };
          // F-078: vị trí nhân viên cần cho việc này (null = mọi vị trí)
          out.push({ ...route, ...accessOf(handlers, route), positions: handlers.find((h) => Array.isArray(h.positions))?.positions ?? null });
        }
      } else if (layer.slash && Array.isArray(layer.handle?.stack)) {
        before = walk(layer.handle, prefix, before);
      } else if (layer.slash) {
        before.push(layer.handle);
      }
    }
    return before;
  };
  let carried = [];
  for (const { prefix, router, pathless } of mounts) {
    const after = walk(router, prefix, carried);
    if (pathless) carried = after;
  }
  return out;
}

apiDocsRouter.get('/api-docs', async (req, res) => res.json(await apiDocsService.catalog(listRoutes(req.app.locals.apiRouters))));
