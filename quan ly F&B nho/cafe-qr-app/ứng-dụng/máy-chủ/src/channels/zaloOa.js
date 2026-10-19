// Kênh gửi tin Zalo OA (FEATURE-037, ADR-006 D-29). Interface chung của kênh: send({ phone, text }) → { ok, error }.
// Chỉ bật khi có ZALO_OA_TOKEN (+ ZALO_OA_URL nếu dùng cổng khác). Không token → không gửi gì ra ngoài.
// Lưu ý triển khai thật: Zalo OA gửi theo user_id (người đã quan tâm OA) hoặc ZNS theo template đã duyệt — cần cấu hình
// cổng gửi phù hợp tài khoản OA của quán; adapter này gói lời gọi HTTP + thời gian chờ + báo lỗi rõ ràng.
import { config } from '../config.js';

export const configured = () => Boolean(config.zaloOa.token);

let override = null;
/** Test: thay hàm gửi (không gọi mạng thật). */
export function setSender(fn) {
  override = fn;
}

export async function send({ phone, text }) {
  if (override) return override({ phone, text });
  if (!configured()) return { ok: false, error: 'NOT_CONFIGURED' };
  try {
    const res = await fetch(config.zaloOa.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: config.zaloOa.token },
      body: JSON.stringify({ phone, message: { text } }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error) return { ok: true };
    return { ok: false, error: String(data.message ?? data.error ?? `HTTP ${res.status}`).slice(0, 200) };
  } catch (err) {
    return { ok: false, error: String(err.message).slice(0, 200) };
  }
}
