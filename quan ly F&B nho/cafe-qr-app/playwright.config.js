// E2E giao diện thật (Chromium) — test-strategy: luồng khách + quầy + quản lý. Chạy: npm run test:e2e
import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '3100';

export default defineConfig({
  testDir: 'kiểm-thử/e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  // JSON: kết quả thật cho ma trận truy vết (npm run trace — TASK-057)
  reporter: [['list'], ['json', { outputFile: 'kiểm-thử/kết-quả/e2e.json' }]],
  // a11y chạy SAU luồng chính (cần dữ liệu thật, không làm bẩn dữ liệu của flow)
  projects: [
    { name: 'flow', testMatch: /flow\.spec\.js$/ },
    { name: 'a11y', testMatch: /a11y\.spec\.js$/, dependencies: ['flow'] },
  ],
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
