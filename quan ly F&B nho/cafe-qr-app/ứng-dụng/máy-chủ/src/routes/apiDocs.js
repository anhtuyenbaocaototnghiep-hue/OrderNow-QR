// Tra cứu API (F-052, ADR-011 D-49…D-51): đọc router Express lúc chạy → method, đường dẫn đầy đủ, mức quyền theo middleware.
// Gắn dưới /api/admin (requireAdmin ở adminRouter) — chỉ ADMIN. Mô tả request / response ghép ở apiDocsService từ api-contract.md.
import express from 'express';
import { PERMISSIONS } from '../auth/permissions.js';
import { optionalStaff, requireAdmin, requireStaff } from '../middleware/auth.js';
import * as apiDocsService from '../services/apiDocsService.js';

export const apiDocsRouter = express.Router();

const ROLES = ['STAFF', 'MANAGER', 'ADMIN'];

/** Mức quyền từ các middleware chạy trước handler. requireAdmin > requirePermission(p) > requireStaff > optionalStaff > công khai. */
export function accessOf(handlers) {
  if (handlers.includes(requireAdmin)) return { access: 'ADMIN', roles: ['ADMIN'], permission: null };
  const permission = handlers.find((h) => typeof h.permission === 'string')?.permission;
  if (permission) {
    const roles = ROLES.filter((r) => PERMISSIONS[permission]?.includes(r));
    const access = roles.includes('STAFF') ? 'STAFF' : roles.includes('MANAGER') ? 'MANAGER' : 'ADMIN';
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
          out.push({ method: method.toUpperCase(), path: prefix + (routePath === '/' ? '' : routePath), ...accessOf(handlers) });
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
