// FEATURE-040 Thực đơn theo mùa / khung giờ — logic thuần (không DB), test độc lập trong tests/phase4-unit.test.js.
// Quy tắc: món hiện khi (không thuộc lịch SHOW nào) hoặc (thuộc ≥ 1 lịch SHOW đang hiệu lực), VÀ không thuộc lịch HIDE đang hiệu lực.
// Một mục tiêu là món (menuItemId) hoặc cả danh mục (categoryId). Giờ theo giờ quán (UTC+7).
import { inTimeWindow, toMinutes, vnClock } from '../pricing/pricing.js';
import { vnDayStartUtc } from '../utils/time.js';

/** Lịch đang hiệu lực lúc `now`: bật, trong khoảng ngày, đúng thứ (bit0 = CN), trong khung giờ (qua nửa đêm được). */
export function scheduleInEffect(s, now = new Date()) {
  if (!s.isActive) return false;
  const c = vnClock(now);
  if (s.startDate && c.date < s.startDate) return false;
  if (s.endDate && c.date > s.endDate) return false;
  if (!((s.daysOfWeekMask ?? 127) & (1 << c.dow))) return false;
  return inTimeWindow(toMinutes(s.startTime), toMinutes(s.endTime), c.minutes);
}

const keysOf = (item) => [`i:${item.id}`, ...(item.categoryId ? [`c:${item.categoryId}`] : [])];

/**
 * schedules: [{ isActive, startDate, endDate, daysOfWeekMask, startTime, endTime, targets: [{ menuItemId, categoryId, mode }] }]
 * → (item: { id, categoryId }) => boolean (khách có thấy món lúc `now` không).
 */
export function buildVisibility(schedules, now = new Date()) {
  const showMember = new Set();
  const showNow = new Set();
  const hideNow = new Set();
  for (const s of schedules) {
    if (!s.isActive) continue;
    const on = scheduleInEffect(s, now);
    for (const t of s.targets ?? []) {
      const key = t.menuItemId ? `i:${t.menuItemId}` : `c:${t.categoryId}`;
      if (t.mode === 'SHOW') {
        showMember.add(key);
        if (on) showNow.add(key);
      } else if (on) hideNow.add(key);
    }
  }
  return (item) => {
    const keys = keysOf(item);
    if (keys.some((k) => hideNow.has(k))) return false;
    return !keys.some((k) => showMember.has(k)) || keys.some((k) => showNow.has(k));
  };
}

/** Thời điểm sớm nhất (trong 8 ngày tới) có lịch đổi trạng thái hiệu lực → trang khách tự tải lại menu. null nếu không có. */
export function nextChangeAt(schedules, now = new Date()) {
  const active = schedules.filter((s) => s.isActive && (s.targets ?? []).length);
  if (!active.length) return null;
  const dayStart = vnDayStartUtc(vnClock(now).date).getTime();
  const candidates = new Set();
  for (let d = 0; d <= 8; d++) {
    const base = dayStart + d * 86_400_000;
    candidates.add(base);
    for (const s of active) {
      for (const t of [s.startTime, s.endTime]) {
        const m = toMinutes(t);
        if (m !== null) candidates.add(base + m * 60_000);
      }
    }
  }
  const state = (ms) => active.map((s) => (scheduleInEffect(s, new Date(ms)) ? 1 : 0)).join('');
  const current = state(now.getTime());
  for (const t of [...candidates].filter((x) => x > now.getTime()).sort((a, b) => a - b)) {
    if (state(t) !== current) return new Date(t).toISOString();
  }
  return null;
}
