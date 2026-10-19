// Route trang sạch → file HTML tĩnh trong ứng-dụng/giao-diện/public (ADR-002). Dữ liệu luôn lấy qua /api/*.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../giao-diện/public');

const PAGES = {
  '/': 'index.html',
  // Khách (S-01 … S-05)
  '/t/:qrToken': 't/index.html',
  '/t/:qrToken/menu': 't/menu.html',
  '/t/:qrToken/track': 't/track.html',
  // Quầy (S-09 … S-14)
  '/pos/login': 'pos/login.html',
  '/pos': 'pos/index.html',
  '/pos/takeaway': 'pos/takeaway.html',
  '/pos/table-order': 'pos/table-order.html', // S-16 gọi món tại bàn (F-024)
  '/pos/sessions/:id/receipt': 'pos/receipt.html',
  '/pos/orders/:id/receipt': 'pos/receipt.html',
  '/pos/shift': 'pos/shift.html', // S-15 ca + hoàn tiền (F-018, F-019)
  // Quản lý (S-20 … S-25)
  '/admin/reports': 'admin/reports.html',
  '/admin/menu': 'admin/menu.html',
  '/admin/menu/:id/bom': 'admin/bom.html',
  '/admin/tables': 'admin/tables.html',
  '/admin/tables/print': 'admin/qr-print.html',
  '/admin/ingredients': 'admin/ingredients.html',
  '/admin/users': 'admin/users.html',
  // Marketing & Khách hàng + vận hành (ADR-005)
  '/admin/members': 'admin/members.html',
  '/admin/combos': 'admin/combos.html',
  '/admin/promotions': 'admin/promotions.html',
  '/admin/suggestions': 'admin/suggestions.html',
  '/admin/modifiers': 'admin/modifiers.html',
  '/admin/stock': 'admin/stock.html',
  '/admin/shifts': 'admin/shifts.html',
  '/admin/settings': 'admin/settings.html',
  // Giai đoạn 4–8 (ADR-006)
  '/admin/menu-schedules': 'admin/menu-schedules.html',
  '/admin/purchasing': 'admin/purchasing.html',
  '/admin/purchase-orders/:id/print': 'admin/po-print.html',
  '/pos/stock': 'pos/stock.html', // S-17 Kho & sơ chế ở quầy
  '/pos/payments/:id/receipt': 'pos/receipt.html',
  // Giai đoạn 6 — tài chính & nhân sự (chỉ ADMIN)
  '/admin/cash': 'admin/cash.html',
  '/admin/staff': 'admin/staff.html',
  '/admin/audit': 'admin/audit.html',
  '/admin/pnl': 'admin/pnl.html',
  // Giai đoạn 7 — CRM
  '/admin/loyalty': 'admin/loyalty.html',
  // Giai đoạn 8 — phân tích + dashboard chủ quán (/admin/today: quản lý + trưởng ca)
  '/admin/analytics': 'admin/analytics.html',
  '/admin/today': 'admin/today.html',
};

export const pagesRouter = express.Router();

for (const [route, file] of Object.entries(PAGES)) {
  pagesRouter.get(route, (_req, res) => res.sendFile(file, { root: publicDir, headers: { 'Cache-Control': 'no-cache' } }));
}
pagesRouter.get('/admin', (_req, res) => res.redirect('/admin/reports'));

export function notFoundPage(_req, res) {
  res.status(404).sendFile('404.html', { root: publicDir });
}
