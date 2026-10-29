// Cài đặt quán (ADR-005): hội viên, làm tròn, gợi ý, nhận đơn QR, ngưỡng giảm giá tay. Cache ngắn trong tiến trình, xóa cache khi sửa.
import { config } from '../config.js';
import * as settingsRepo from '../repositories/settingsRepo.js';
import * as shiftsRepo from '../repositories/shiftsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { MODULES } from '../utils/modules.js';

const TTL_MS = 10_000;
let cache = null;

const num = (v, fallback) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));
const csv = (v) =>
  v
    ? String(v)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

function toSettings(map) {
  const mode = String(map.get('suggestion.mode') || 'BOTH').toUpperCase();
  return {
    firstOrderPercent: num(map.get('member.first_order_percent'), 10),
    roundTo: num(map.get('pricing.round_down_to'), 500),
    suggestionMode: ['AUTO', 'PINNED', 'BOTH'].includes(mode) ? mode : 'BOTH',
    suggestionWindowDays: num(map.get('suggestion.window_days'), 7),
    suggestionTopN: num(map.get('suggestion.top_n'), 8),
    acceptingOrders: map.get('store.accepting_orders') !== 'false',
    closedMessage: map.get('store.closed_message') || 'Quán tạm ngưng nhận đơn qua QR, vui lòng gọi món tại quầy.',
    staffMaxPercent: num(map.get('discount.staff_max_percent'), 10),
    staffMaxAmount: num(map.get('discount.staff_max_amount'), 20000),
    // F-025 thời gian chờ (D-18)
    etaBaseSeconds: num(map.get('kitchen.base_seconds'), 120),
    kitchenParallelism: Math.max(1, num(map.get('kitchen.parallelism'), 1)),
    etaSpreadPercent: num(map.get('eta.spread_percent'), 25),
    etaDefaultItemSeconds: num(map.get('eta.default_item_seconds'), 180),
    // F-029 dự báo nhập hàng (D-22) · F-031 giá vốn (D-21)
    forecastSafetyPercent: num(map.get('forecast.safety_percent'), 20),
    costMethod: map.get('cost.method') === 'FIFO' ? 'FIFO' : 'AVG',
    // F-036 trưởng ca (D-24) · F-033 sổ quỹ (D-23)
    managerMaxPercent: num(map.get('manager.discount_max_percent'), 20),
    managerMaxAmount: num(map.get('manager.discount_max_amount'), 50000),
    managerRefundSameShiftOnly: map.get('manager.refund_same_shift_only') !== 'false',
    managerCashApproveMax: num(map.get('manager.cash_out_approve_max'), 2000000),
    cashApproveThreshold: num(map.get('cash.approve_threshold'), 500000),
    // F-039 (D-27) · F-038 (D-28) · F-037 (D-29)
    pointValue: num(map.get('loyalty.point_value'), 10000),
    referralMinFirstPayment: num(map.get('referral.min_first_payment'), 30000),
    referralVoucherPercent: num(map.get('referral.voucher_percent'), 10),
    referralVoucherDays: num(map.get('referral.voucher_days'), 30),
    referralMonthlyLimit: num(map.get('referral.monthly_limit'), 5),
    campaignMinDaysBetween: num(map.get('campaign.min_days_between'), 7),
    // F-051 sao trên menu (D-48)
    reviewMenuMinCount: Math.max(1, num(map.get('review.menu_min_count'), 5)),
    reviewMenuDays: Math.max(1, num(map.get('review.menu_days'), 90)),
    // F-053 thông tin quán (BR-085): chưa lưu lần nào → SHOP_NAME / SHOP_ADDRESS của .env; địa chỉ lưu rỗng = không in
    shopName: map.get('shop.name') || config.shop.name,
    shopAddress: map.has('shop.address') ? map.get('shop.address') : config.shop.address,
    // F-059 Wi-Fi cho khách (BR-092): tên rỗng = không in QR Wi-Fi
    wifiSsid: map.get('wifi.ssid') ?? '',
    wifiPassword: map.get('wifi.password') ?? '',
    // F-060 cảnh báo bất thường qua email (ADR-020, BR-093…BR-095): người nhận lưu CSV; hộp thư gửi ở .env
    alertEmails: csv(map.get('alert.emails')),
    alertImmediate: map.get('alert.immediate') !== 'false',
    alertShiftReport: map.get('alert.shift_report') !== 'false',
    alertDailyDigest: map.get('alert.daily_digest') !== 'false',
    alertDigestTime: map.get('alert.digest_time') || '22:00',
    alertQuietStart: map.get('alert.quiet_start') ?? '',
    alertQuietEnd: map.get('alert.quiet_end') ?? '',
    alertCashDiffMax: num(map.get('alert.cash_diff_max'), 20000),
    alertTransferShareMax: num(map.get('alert.transfer_share_max'), 60),
    alertVoidsMax: num(map.get('alert.voids_max'), 3),
    alertRefundsMax: num(map.get('alert.refunds_max'), 2),
    alertRefundBig: num(map.get('alert.refund_big'), 200000),
    alertManualDiscountMax: num(map.get('alert.manual_discount_max'), 5),
    alertUseStats: map.get('alert.use_stats') !== 'false',
    // F-061 (ADR-021 D-79): nhóm menu nâng cao đang bật — chưa lưu = chế độ cơ bản (rỗng)
    uiModules: csv(map.get('ui.modules')).filter((m) => MODULES.includes(m)),
    // F-063 (D-82): địa chỉ máy chủ lúc quản lý in QR bàn gần nhất (không sửa qua PUT — chỉ POST /api/admin/qr-printed)
    qrPrintedBaseUrl: map.get('qr.printed_base_url') ?? '',
    qrPrintedAt: map.get('qr.printed_at') ?? '',
  };
}

export async function getSettings() {
  if (cache && cache.expires > Date.now()) return cache.value;
  const value = toSettings(await settingsRepo.all());
  cache = { value, expires: Date.now() + TTL_MS };
  return value;
}

const KEYS = {
  firstOrderPercent: 'member.first_order_percent',
  roundTo: 'pricing.round_down_to',
  suggestionMode: 'suggestion.mode',
  suggestionWindowDays: 'suggestion.window_days',
  suggestionTopN: 'suggestion.top_n',
  acceptingOrders: 'store.accepting_orders',
  closedMessage: 'store.closed_message',
  staffMaxPercent: 'discount.staff_max_percent',
  staffMaxAmount: 'discount.staff_max_amount',
  etaBaseSeconds: 'kitchen.base_seconds',
  kitchenParallelism: 'kitchen.parallelism',
  etaSpreadPercent: 'eta.spread_percent',
  etaDefaultItemSeconds: 'eta.default_item_seconds',
  forecastSafetyPercent: 'forecast.safety_percent',
  costMethod: 'cost.method',
  managerMaxPercent: 'manager.discount_max_percent',
  managerMaxAmount: 'manager.discount_max_amount',
  managerRefundSameShiftOnly: 'manager.refund_same_shift_only',
  managerCashApproveMax: 'manager.cash_out_approve_max',
  cashApproveThreshold: 'cash.approve_threshold',
  pointValue: 'loyalty.point_value',
  referralMinFirstPayment: 'referral.min_first_payment',
  referralVoucherPercent: 'referral.voucher_percent',
  referralVoucherDays: 'referral.voucher_days',
  referralMonthlyLimit: 'referral.monthly_limit',
  campaignMinDaysBetween: 'campaign.min_days_between',
  reviewMenuMinCount: 'review.menu_min_count',
  reviewMenuDays: 'review.menu_days',
  shopName: 'shop.name',
  shopAddress: 'shop.address',
  wifiSsid: 'wifi.ssid',
  wifiPassword: 'wifi.password',
  alertEmails: 'alert.emails',
  alertImmediate: 'alert.immediate',
  alertShiftReport: 'alert.shift_report',
  alertDailyDigest: 'alert.daily_digest',
  alertDigestTime: 'alert.digest_time',
  alertQuietStart: 'alert.quiet_start',
  alertQuietEnd: 'alert.quiet_end',
  alertCashDiffMax: 'alert.cash_diff_max',
  alertTransferShareMax: 'alert.transfer_share_max',
  alertVoidsMax: 'alert.voids_max',
  alertRefundsMax: 'alert.refunds_max',
  alertRefundBig: 'alert.refund_big',
  alertManualDiscountMax: 'alert.manual_discount_max',
  alertUseStats: 'alert.use_stats',
  uiModules: 'ui.modules',
  qrPrintedBaseUrl: 'qr.printed_base_url',
  qrPrintedAt: 'qr.printed_at',
};

/** Sửa một phần cài đặt (đã validate ở route). Đổi trạng thái nhận đơn → báo khách + quầy ngay. */
export async function updateSettings(patch) {
  const before = await getSettings();
  const entries = Object.entries(patch)
    .filter(([k, v]) => KEYS[k] && v !== undefined)
    .map(([k, v]) => [KEYS[k], typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.join(',') : v]);
  await settingsRepo.setMany(entries);
  cache = null;
  const after = await getSettings();
  if (before.acceptingOrders !== after.acceptingOrders || before.closedMessage !== after.closedMessage) {
    publish([ROOMS.public, ROOMS.staff], 'store.status_changed', await storeStatus());
  }
  return after;
}

/**
 * Trạng thái nhận đơn cho khách / quầy: công tắc nhận đơn QR (F-020) + có ca đang mở không (F-055, ADR-017 D-64).
 * Khách gửi được đơn khi `acceptingOrders && shiftOpen`; hai điều kiện để riêng để quầy không thấy công tắc tự tắt.
 */
export const storeStatus = async () => {
  const [s, shiftOpen] = await Promise.all([getSettings(), shiftsRepo.isOpen()]);
  return { acceptingOrders: s.acceptingOrders, closedMessage: s.closedMessage, shiftOpen };
};

/** Tên + địa chỉ quán (F-053) — một nguồn cho thanh quầy / quản lý, menu khách, hóa đơn. */
export const shopInfo = async () => {
  const s = await getSettings();
  return { name: s.shopName, address: s.shopAddress };
};

export function invalidateSettings() {
  cache = null;
}
