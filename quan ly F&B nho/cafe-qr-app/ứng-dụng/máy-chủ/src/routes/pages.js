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
  '/pos/sessions/:id/receipt': 'pos/receipt.html',
  '/pos/orders/:id/receipt': 'pos/receipt.html',
  // Quản lý (S-20 … S-25)
  '/admin/reports': 'admin/reports.html',
  '/admin/menu': 'admin/menu.html',
  '/admin/menu/:id/bom': 'admin/bom.html',
  '/admin/tables': 'admin/tables.html',
  '/admin/tables/print': 'admin/qr-print.html',
  '/admin/ingredients': 'admin/ingredients.html',
  '/admin/users': 'admin/users.html',
};

export const pagesRouter = express.Router();

for (const [route, file] of Object.entries(PAGES)) {
  pagesRouter.get(route, (_req, res) => res.sendFile(file, { root: publicDir, headers: { 'Cache-Control': 'no-cache' } }));
}
pagesRouter.get('/admin', (_req, res) => res.redirect('/admin/reports'));

export function notFoundPage(_req, res) {
  res.status(404).sendFile('404.html', { root: publicDir });
}
