// Đăng ký mọi job nền vào bộ lập lịch chung (ADR-006 — skill advanced-features mục 6). Chỉ đăng ký, không tự chạy.
import { registerJob } from './scheduler.js';
import * as etaService from '../services/etaService.js';
import { invalidateSuggestions } from '../services/menuService.js';
import * as forecastService from '../services/forecastService.js';
import * as attendanceService from '../services/attendanceService.js';
import * as auditRepo from '../repositories/auditRepo.js';
import * as campaignService from '../services/campaignService.js';
import * as dashboardService from '../services/dashboardService.js';
import * as inventoryService from '../services/inventoryService.js';
import { publish, ROOMS } from '../realtime/publisher.js';

// Mỗi 15 phút: làm mới thống kê gợi ý (F-017) + bảng thời gian chuẩn (F-025)
registerJob('refresh-caches', { label: 'Làm mới gợi ý & thời gian chờ', everyMinutes: 15 }, async () => {
  invalidateSuggestions();
  etaService.invalidateItems();
  return { ok: true };
});

// 02:00: thời gian pha thực tế (trung vị 30 ngày) — F-025
registerJob('prep-stats', { label: 'Thống kê thời gian pha', at: '02:00' }, () => etaService.recomputeStats());

// 02:00: dự báo tiêu thụ 14 ngày tới — F-029
registerJob('demand-forecast', { label: 'Dự báo nhập hàng', at: '02:00' }, () => forecastService.computeForecasts());

// 06:00: lô sắp hết hạn (≤ 2 ngày) / đã hết hạn — F-028
registerJob('lot-expiry', { label: 'Cảnh báo lô hết hạn', at: '06:00' }, async () => {
  const lots = await inventoryService.expiringLots(2);
  const expired = lots.filter((l) => l.daysLeft < 0);
  const expiring = lots.filter((l) => l.daysLeft >= 0);
  if (expiring.length) publish([ROOMS.staff], 'inventory.expiring', { lots: expiring });
  if (expired.length) publish([ROOMS.staff], 'inventory.expired', { lots: expired });
  return { expiring: expiring.length, expired: expired.length };
});

// 06:05: nguyên liệu sẽ hết trước ngày giao kế tiếp — F-029
registerJob('runout-alert', { label: 'Cảnh báo sắp hết trước ngày giao', at: '06:05' }, () => forecastService.runOutAlert());

// Mỗi 15 phút: đóng chấm công quên đăng xuất (quá thời hạn token) — F-035
registerJob('attendance-autoclose', { label: 'Đóng chấm công quên đăng xuất', everyMinutes: 15 }, () => attendanceService.autoClose());

// 03:00: nhật ký thao tác giữ 12 tháng — F-035 (D-26)
registerJob('audit-retention', { label: 'Dọn nhật ký thao tác quá 12 tháng', at: '03:00' }, async () => ({ deleted: await auditRepo.purgeOlderThan(12) }));

// Mỗi 5 phút: chạy chiến dịch đã đến giờ hẹn — F-037
registerJob('campaigns-due', { label: 'Chạy chiến dịch đã hẹn giờ', everyMinutes: 5 }, () => campaignService.runDue());

// 00:30: tổng hợp số liệu hôm qua cho dashboard chủ quán — F-043
registerJob('daily-summary', { label: 'Tổng hợp ngày (dashboard)', at: '00:30' }, () => dashboardService.computeYesterday());
