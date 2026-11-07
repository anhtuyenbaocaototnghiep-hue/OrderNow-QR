// F-079 (ADR-037 D-167…D-172): quyền riêng từng tài khoản + xin quyền / duyệt.
//  - Chủ quán đặt từng quyền (CAPABILITIES) cho một người: theo vai trò (không lưu) / cho phép / không cho, kèm hạn tùy chọn.
//  - Nhân viên bị chặn ở việc có quyền cấp được → "Xin quyền"; chủ quán duyệt (hôm nay / 7 ngày / luôn) hoặc từ chối.
//  - Cho phép quyền dính tiền (money) → cảnh báo ACCESS_GRANT (chỉ chủ quán xem) + email theo cài đặt. Đổi quyền → phát realtime để
//    máy của người đó nhắc tải lại trang. Quyền có hiệu lực ngay request kế tiếp (userFromToken nạp lại mỗi request).
import { badRequest, conflict, notFound } from '../errors.js';
import { CAPABILITIES, CAPABILITY, hasCap } from '../auth/permissions.js';
import * as accessRepo from '../repositories/accessRepo.js';
import * as usersRepo from '../repositories/usersRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { addDays, todayVn, vnDayStartUtc } from '../utils/time.js';
import { onAccessGrant } from './alertService.js';

const MAX_PENDING_PER_USER = 5;
const withLabel = (r) => r && { ...r, capabilityLabel: CAPABILITY[r.capability]?.label ?? r.capability };

/** Danh mục quyền cho giao diện (không gửi hàm). */
export const catalogue = () => CAPABILITIES.map(({ key, group, label, money }) => ({ key, group, label, money: Boolean(money) }));

/** Hạn của lần duyệt: hết hôm nay / hết ngày thứ 7 (tính cả hôm nay) theo giờ Việt Nam / không hạn. */
export function expiryOf(duration, today = todayVn()) {
  if (duration === 'TODAY') return vnDayStartUtc(addDays(today, 1));
  if (duration === 'WEEK') return vnDayStartUtc(addDays(today, 7));
  return null;
}

async function targetUser(userId) {
  const u = await usersRepo.findById(userId);
  if (!u) throw notFound('Không tìm thấy tài khoản');
  if (u.role === 'ADMIN') throw badRequest('OWNER_ALWAYS', 'Chủ quán luôn đủ mọi quyền — không cần đặt riêng');
  return u;
}

/** Hộp "Quyền" của một người: mỗi quyền — mặc định theo vai trò, đặt riêng (nếu có), đang có hay không. */
export async function grantsView(userId) {
  const user = await targetUser(userId);
  const grants = await usersRepo.grantsOf(userId);
  const withGrants = { ...user, grants };
  return {
    user: { userId: user.userId, fullName: user.fullName, username: user.username, role: user.role, positions: user.positions, level: user.level },
    items: CAPABILITIES.map((c) => ({
      key: c.key,
      group: c.group,
      label: c.label,
      money: Boolean(c.money),
      byRole: Boolean(c.byRole(user)),
      override: grants.find((g) => g.capability === c.key) ?? null,
      effective: hasCap(withGrants, c.key),
    })),
  };
}

const noteAllowed = async (target, keys, actor, expiresAt) => {
  const money = keys.filter((k) => CAPABILITY[k]?.money);
  if (!money.length) return;
  await onAccessGrant({ target, capabilities: money, actor, expiresAt }).catch((err) => console.error('access alert:', err?.message ?? err));
};

/** Thay toàn bộ quyền riêng của một người. grants: [{ capability, effect, expiresAt, note }]. */
export async function setGrants(userId, grants, actor) {
  const target = await targetUser(userId);
  const keys = grants.map((g) => g.capability);
  if (new Set(keys).size !== keys.length) throw badRequest('VALIDATION_ERROR', 'Mỗi quyền chỉ đặt một lần');
  const now = Date.now();
  if (grants.some((g) => g.expiresAt && new Date(g.expiresAt).getTime() <= now)) throw badRequest('VALIDATION_ERROR', 'Hạn phải ở tương lai');
  const before = await usersRepo.grantsOf(userId);
  await usersRepo.replaceGrants(userId, grants, actor.userId);
  // Quyền dính tiền vừa được cho phép (mới, hoặc trước đó không cho / hạn khác)
  const newlyAllowed = grants
    .filter((g) => g.effect === 'ALLOW')
    .filter((g) => {
      const old = before.find((b) => b.capability === g.capability);
      const t = (d) => (d ? new Date(d).getTime() : null);
      const sameExpiry = t(old?.expiresAt) === t(g.expiresAt) || Math.abs((t(old?.expiresAt) ?? 0) - (t(g.expiresAt) ?? 0)) < 1000;
      return !old || old.effect !== 'ALLOW' || !sameExpiry;
    });
  for (const g of newlyAllowed) await noteAllowed(target, [g.capability], actor, g.expiresAt ?? null);
  publish([ROOMS.staff], 'access.changed', { userId });
  return grantsView(userId);
}

/** Nhân viên xin một quyền đang bị chặn. */
export async function request(user, { capability, reason }) {
  if (!CAPABILITY[capability]) throw badRequest('VALIDATION_ERROR', 'Quyền không hợp lệ');
  if (user.role === 'ADMIN') throw badRequest('OWNER_ALWAYS', 'Chủ quán luôn đủ mọi quyền');
  if (hasCap(user, capability)) throw conflict('ALREADY_ALLOWED', 'Bạn đã có quyền này — tải lại trang rồi thử lại');
  if ((await accessRepo.countPending(user.userId)) >= MAX_PENDING_PER_USER) {
    throw conflict('TOO_MANY_REQUESTS', `Bạn đang có ${MAX_PENDING_PER_USER} yêu cầu chờ duyệt — chờ chủ quán xử lý trước`);
  }
  const { request, created } = await accessRepo.create({ userId: user.userId, capability, reason: reason?.trim() || null });
  const r = withLabel(request);
  if (created) publish([ROOMS.admin], 'access.requested', { request: r });
  return { request: r, created };
}

export const mine = async (user) => (await accessRepo.mine(user.userId)).map(withLabel);
export const list = async (opts) => (await accessRepo.list(opts)).map(withLabel);
export const countPending = () => accessRepo.countPending();

async function pendingRequest(id) {
  const r = await accessRepo.find(id);
  if (!r) throw notFound('Không tìm thấy yêu cầu');
  if (r.status !== 'PENDING') throw conflict('REQUEST_DECIDED', 'Yêu cầu này đã được xử lý');
  return r;
}

/** Duyệt: cho phép quyền theo thời hạn (TODAY / WEEK / ALWAYS). */
export async function approve(id, { duration, note }, actor) {
  const r = await pendingRequest(id);
  const target = await targetUser(r.user.userId);
  const expiresAt = expiryOf(duration);
  await usersRepo.upsertGrant(target.userId, { capability: r.capability, effect: 'ALLOW', expiresAt, note: note ?? r.reason }, actor.userId);
  if (!(await accessRepo.decide(id, { status: 'APPROVED', decidedBy: actor.userId, duration, note: note ?? null }))) {
    throw conflict('REQUEST_DECIDED', 'Yêu cầu này đã được xử lý');
  }
  await noteAllowed(target, [r.capability], actor, expiresAt);
  const decided = withLabel(await accessRepo.find(id));
  publish([ROOMS.staff], 'access.decided', { userId: target.userId, request: decided, expiresAt });
  return { request: decided, expiresAt };
}

export async function reject(id, { note }, actor) {
  const r = await pendingRequest(id);
  if (!(await accessRepo.decide(id, { status: 'REJECTED', decidedBy: actor.userId, note: note ?? null }))) {
    throw conflict('REQUEST_DECIDED', 'Yêu cầu này đã được xử lý');
  }
  const decided = withLabel(await accessRepo.find(id));
  publish([ROOMS.staff], 'access.decided', { userId: r.user.userId, request: decided, expiresAt: null });
  return { request: decided };
}
