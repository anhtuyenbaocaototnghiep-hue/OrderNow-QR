// F-063 (ADR-021 D-82): QR bàn = PUBLIC_BASE_URL + /t/{mã bàn}. Ba cách QR "chết" mà quán không biết:
//  - mismatch: QR đã in ở địa chỉ khác địa chỉ đang chạy (sửa PUBLIC_BASE_URL / chạy bằng file demo lấy IP mới);
//  - unreachable: PUBLIC_BASE_URL ghi cứng một IP mà máy chủ không còn giữ (laptop đổi Wi-Fi, router cấp IP khác —
//    .env không đổi nên địa chỉ lúc in = địa chỉ đang chạy, chỉ so hai địa chỉ thì không thấy) — review G3;
//  - localhost: localhost / 127.x / ::1 — điện thoại không bao giờ quét được (chỉ cảnh báo ở trang in / bàn).
import os from 'node:os';
import { config } from '../config.js';
import { getSettings, updateSettings } from './settingsService.js';

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
};
const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return String(url ?? '');
  }
};

export function isLocalUrl(url) {
  const host = hostOf(url);
  return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

/** IPv4 đang có trên máy chủ (không tính loopback). Tách ra để test thay được. */
export const machineIps = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

/** → { baseUrl, printedBaseUrl, printedAt, mismatch, localhost, unreachable, machineIps } */
export async function check() {
  const s = await getSettings();
  const baseUrl = config.publicBaseUrl;
  const printedBaseUrl = s.qrPrintedBaseUrl || null;
  const host = hostOf(baseUrl);
  const ips = machineIps();
  // Chỉ phán khi địa chỉ là IPv4 viết số (tên miền / tên máy thì không biết được trỏ đi đâu)
  const unreachable = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !/^127\./.test(host) && !ips.includes(host);
  return {
    baseUrl,
    printedBaseUrl,
    printedAt: s.qrPrintedAt || null,
    mismatch: Boolean(printedBaseUrl) && originOf(printedBaseUrl) !== originOf(baseUrl),
    localhost: isLocalUrl(baseUrl),
    unreachable,
    machineIps: ips,
  };
}

/** Quản lý vừa in QR ở địa chỉ đang chạy. */
export async function markPrinted() {
  await updateSettings({ qrPrintedBaseUrl: config.publicBaseUrl, qrPrintedAt: new Date().toISOString() });
  return check();
}
