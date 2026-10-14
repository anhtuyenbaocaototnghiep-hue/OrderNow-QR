// Express app: REST /api/* + FE tĩnh (ADR-002). Tầng: routes → services → repositories/SP (system-overview).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { ensureClientToken } from './middleware/client.js';
import { errorHandler, notFoundApi } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.js';
import { notFoundPage, pagesRouter, publicDir } from './routes/pages.js';
import { publicRouter } from './routes/public.js';
import { staffRouter } from './routes/staff.js';

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
  api.use(publicRouter);
  api.use('/admin', adminRouter);
  api.use(staffRouter);
  app.use('/api', api);
  app.use('/api', notFoundApi);

  app.use(pagesRouter);
  app.use(express.static(publicDir, { index: false, maxAge: config.env === 'production' ? '1h' : 0 }));
  app.use(notFoundPage);
  app.use(errorHandler);
  return app;
}
