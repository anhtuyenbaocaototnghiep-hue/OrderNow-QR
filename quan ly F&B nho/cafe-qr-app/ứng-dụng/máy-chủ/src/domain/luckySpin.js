// F-065 vòng quay may mắn (ADR-024 D-89…D-92) — hàm thuần, không chạm CSDL.
export const KINDS = ['PERCENT', 'AMOUNT', 'POINTS', 'NONE'];
export const MAX_SLICES = 8;

/** Ô hiện trên vòng của một lượt thu: ô đang bật; ô điểm chỉ khi lượt thu có hội viên (D-91). */
export const visibleSlices = (prizes, { hasMember }) => prizes.filter((p) => p.isActive && (hasMember || p.kind !== 'POINTS'));

/**
 * Chọn ô theo trọng số. rand: số ngẫu nhiên trong [0, 1) (service dùng crypto). Trọng số 0 không bao giờ trúng.
 * → ô được chọn, hoặc null khi tổng trọng số = 0.
 */
export function pickSlice(slices, rand) {
  const total = slices.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (!(total > 0)) return null;
  let x = rand * total;
  for (const p of slices) {
    const w = Math.max(0, p.weight);
    if (w > 0 && x < w) return p;
    x -= w;
  }
  return [...slices].reverse().find((p) => p.weight > 0);
}

/** Kiểm danh sách ô quà quản lý gửi lên (D-92). → câu báo lỗi đầu tiên, hoặc null khi hợp lệ. */
export function validatePrizes(list) {
  if (list.length < 2 || list.length > MAX_SLICES) return `Vòng quay cần 2–${MAX_SLICES} ô`;
  if (!list.some((p) => p.kind === 'NONE')) return 'Cần ít nhất một ô loại "Chúc may mắn" (không có quà — dùng khi hết quà trong ngày)';
  if (!(list.reduce((s, p) => s + p.weight, 0) > 0)) return 'Tổng tỷ lệ các ô phải lớn hơn 0';
  for (const p of list) {
    if (p.kind === 'PERCENT' && !(p.value >= 1 && p.value <= 50)) return `Ô "${p.label}": giảm 1–50%`;
    if (p.kind === 'AMOUNT' && !(p.value >= 1000)) return `Ô "${p.label}": giảm từ 1.000đ`;
    if (p.kind === 'POINTS' && !(p.value >= 1 && p.value <= 1000)) return `Ô "${p.label}": 1–1.000 điểm`;
  }
  return null;
}
