// Express app: REST /api/* + FE tĩnh (ADR-002). Tầng: routes → services → repositories/SP (system-overview).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { ensureClientToken } from './middleware/client.js';
import { auditTrail } from './middleware/audit.js';
import { errorHandler, notFoundApi } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { engagementRouter } from './routes/engagement.js';
import { financeRouter } from './routes/finance.js';
import { loyaltyRouter } from './routes/loyalty.js';
import { dashboardRouter } from './routes/analytics.js';
import { opsRouter } from './routes/ops.js';
import { notFoundPage, pagesRouter, publicDir } from './routes/pages.js';
import { publicRouter } from './routes/public.js';
import { staffRouter } from './routes/staff.js';
import './jobs/index.js'; // đăng ký job nền (không tự chạy — server.js mới bật bộ lập lịch)

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          // Chạy được qua http trong LAN của quán (không ép https)
          'upgrade-insecure-requests': null,
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(ensureClientToken);
  api.use(auditTrail); // ADR-006 D-26: nhật ký thao tác đổi tiền/kho/quyền/giá (theo bảng luật)
  // Router dưới /api theo đúng thứ tự gắn (tiền tố '' = gắn thẳng). Trang Tra cứu API đọc lại bảng này (F-052, ADR-011 D-50).
  const apiRouters = [
    ['', publicRouter],
    ['', engagementRouter], // ADR-006: gọi lại đơn, thời gian chờ, chia bill (khách + quầy)
    ['/admin', adminRouter],
    ['', opsRouter], // ADR-006: kho cho quầy (sơ chế, hủy hàng, lô, nhận hàng; trưởng ca: điều chỉnh, kiểm kê)
    ['', financeRouter], // ADR-006: sổ quỹ, chấm công, đăng xuất
    ['', loyaltyRouter], // ADR-006: điểm / tem / voucher (quầy)
    ['', dashboardRouter], // ADR-006 F-043: dashboard chủ quán (quản lý + trưởng ca)
    ['', staffRouter],
  ];
  for (const [prefix, router] of apiRouters) {
    if (prefix) api.use(prefix, router);
    else api.use(router);
  }
  app.locals.apiRouters = apiRouters.map(([prefix, router]) => ({ prefix: `/api${prefix}`, router, pathless: !prefix }));
  app.use('/api', api);
  app.use('/api', notFoundApi);

  app.use(pagesRouter);
  app.use(express.static(publicDir, { index: false, maxAge: config.env === 'production' ? '1h' : 0 }));
  app.use(notFoundPage);
  app.use(errorHandler);
  return app;
}
