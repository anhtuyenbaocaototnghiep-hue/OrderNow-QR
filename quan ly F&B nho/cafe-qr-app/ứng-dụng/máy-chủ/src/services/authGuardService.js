// F-071 (ADR-029 D-120, D-121): khóa tạm khi nhập sai mật khẩu nhiều lần — chặn dò mật khẩu quản lý / trưởng ca.
//  - Đăng nhập: 10 lần sai / 15 phút cùng tên + cùng máy → tên đó tạm khóa trên máy đó (máy khác vẫn đăng nhập được).
//  - Tài khoản duyệt ở quầy (giảm giá vượt ngưỡng, hoàn tiền, xóa món, duyệt chi quỹ…): 5 lần sai / 15 phút cùng tên duyệt
//    + cùng người đứng quầy → người đó không thử tiếp được tên ấy (quản lý vẫn duyệt cho người khác bình thường).
//  - Đang khóa → 429, kể cả khi lần này gõ đúng (không cho dò tiếp). Lần sai chạm ngưỡng → cảnh báo AUTH_LOCK cho chủ quán.
import { tooMany } from '../errors.js';
import * as authGuardRepo from '../repositories/authGuardRepo.js';
import { onAuthLock } from './alertService.js';

export const WINDOW_MINUTES = 15;
export const LIMITS = { LOGIN: 10, APPROVAL: 5, PIN: 5 }; // PIN: F-072
const LOCKED = {
  LOGIN: ['LOGIN_LOCKED', `Nhập sai mật khẩu quá nhiều lần — tài khoản này tạm khóa trên máy này ${WINDOW_MINUTES} phút`],
  APPROVAL: ['APPROVAL_LOCKED', `Nhập sai tài khoản duyệt quá nhiều lần — tạm khóa ${WINDOW_MINUTES} phút, chủ quán đã được báo`],
  PIN: ['PIN_LOCKED', `Nhập sai PIN quá nhiều lần — tạm khóa ${WINDOW_MINUTES} phút, chủ quán đã được báo`],
};

const since = () => new Date(Date.now() - WINDOW_MINUTES * 60_000);

/** who: { username, ip } (LOGIN) | { username, actor } (APPROVAL / PIN — actor = người đang đứng quầy). */
const normName = (username) =>
  String(username ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 50);

function keyOf(kind, { username, actor, ip }) {
  const name = normName(username);
  return kind === 'LOGIN' ? { kind, username: name, ip: String(ip || 'unknown').slice(0, 45) } : { kind, username: name, actorUserId: actor.userId };
}

export async function assertNotLocked(kind, who) {
  if ((await authGuardRepo.count({ ...keyOf(kind, who), since: since() })) >= LIMITS[kind]) throw tooMany(...LOCKED[kind]);
}

export async function recordFailure(kind, who) {
  const key = keyOf(kind, who);
  const n = await authGuardRepo.add({ ...key, since: since() });
  if (n !== LIMITS[kind]) return;
  await onAuthLock({ kind, username: key.username, actor: who.actor ?? null, ip: key.ip ?? null, count: n, windowMinutes: WINDOW_MINUTES }).catch((err) =>
    console.error('[auth-guard] không tạo được cảnh báo', err.message),
  );
}

/** ADR-031 D-135: PIN vừa được đặt lại / bị quản lý xóa → xóa mọi lần nhập sai PIN cũ của người đó (ở mọi máy, mọi người đứng quầy). */
export const clearFailures = (kind, username) => authGuardRepo.clear({ kind, username: normName(username) });
