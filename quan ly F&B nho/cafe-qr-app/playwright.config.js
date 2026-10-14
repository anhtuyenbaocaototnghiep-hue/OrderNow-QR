// E2E giao diện thật (Chromium) — test-strategy: luồng khách + quầy + quản lý. Chạy: npm run test:e2e
import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '3100';

export default defineConfig({
  testDir: 'kiểm-thử/e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --env-file-if-exists=.env kịch-bản/e2e-server.js',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
