// FEATURE-033 Sổ quỹ (ADR-006 D-23): thu / chi tiền mặt ngoài bán hàng, gắn vào ca đang mở.
// Chi > cash.approve_threshold hoặc danh mục cần duyệt → PENDING; trưởng ca duyệt ≤ manager.cash_out_approve_max, quản lý không giới hạn.
// Người đứng quầy là nhân viên → duyệt bằng xác thực lại tài khoản trưởng ca / quản lý (như giảm giá vượt ngưỡng — D-14).
// Không tự duyệt khoản do chính mình tạo (trừ quản lý). Ảnh hóa đơn ≤ 2 MB (jpg/png/webp, kiểm chữ ký file) lưu uploads/receipts/.
// F-050 (ADR-010 D-44, D-45): hủy / sửa khoản ĐÃ DUYỆT khi ca còn mở — quyền như duyệt, sửa = hủy + khoản thay thế (đi qua duyệt như thường).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { can } from '../auth/permissions.js';
import { config } from '../config.js';
import { withDeadlockRetry } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import * as cashRepo from '../repositories/cashRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import { getSettings } from './settingsService.js';
import { requireOpenShift } from './shiftService.js';
import { resolveApproval } from './userService.js';

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const SIGNATURES = [
  ['jpg', 'image/jpeg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', 'image/png', (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['webp', 'image/webp', (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
];
const receiptsDir = () => path.join(config.uploadsDir, 'receipts');

export const categories = (opts) => cashRepo.categories(opts);

export async function saveCategory(id, body) {
  const cat = await cashRepo.saveCategory(id, body);
  if (!cat) throw notFound('Không tìm thấy danh mục thu chi');
  return cat;
}

/** ADR-004: danh mục đã dùng → chỉ ngừng dùng (ARCHIVED); chưa dùng → xóa hẳn. */
export async function removeCategory(id) {
  const all = await cashRepo.categories({ all: true });
  const cat = all.find((c) => c.categoryId === id);
  if (!cat) throw notFound('Không tìm thấy danh mục thu chi');
  if ((await cashRepo.categoryUsage(id)) > 0) {
    await cashRepo.saveCategory(id, { ...cat, isActive: false });
    return 'ARCHIVED';
  }
  await cashRepo.deleteCategory(id);
  return 'DELETED';
}

export async function create({ categoryId, amount, reason }, user) {
  const shift = await requireOpenShift();
  const settings = await getSettings();
  const { cashTxnId } = await withDeadlockRetry(() =>
    cashRepo.create({ shiftId: shift.shiftId, categoryId, amount, reason, userId: user.userId, threshold: settings.cashApproveThreshold }),
  );
  const txn = await cashRepo.getById(cashTxnId);
  publish([ROOMS.staff], 'cash.created', { txn });
  return txn;
}

export async function get(id) {
  const txn = await cashRepo.getById(id);
  if (!txn) throw notFound('Không tìm thấy khoản thu chi');
  return txn;
}

export const listByShift = (shiftId) => cashRepo.listByShift(shiftId);

/** Duyệt / từ chối khoản chi đang chờ. body: { rejectReason?, adminUsername?, adminPassword? } */
export async function review(id, approve, body, user) {
  const txn = await get(id);
  if (txn.status !== 'PENDING') throw conflict('CASH_NOT_PENDING', 'Khoản này đã được duyệt / từ chối');
  if (!approve && !body.rejectReason) throw badRequest('VALIDATION_ERROR', 'Nhập lý do từ chối');
  const settings = await getSettings();
  const allowManager = txn.amount <= settings.managerCashApproveMax;
  // Có nhập tài khoản duyệt → luôn kiểm tài khoản đó (trưởng ca khác duyệt khoản của trưởng ca đang đứng quầy)
  const actor = body.adminUsername ? { ...user, role: 'STAFF' } : user;
  const approver = await resolveApproval(actor, body, approve ? 'khoản chi quỹ' : 'việc từ chối khoản chi', { allowManager });
  if (approver.userId === txn.createdBy.userId && approver.role !== 'ADMIN') {
    throw forbidden('Không tự duyệt khoản chi do chính mình tạo — nhờ trưởng ca / quản lý khác', 'SELF_APPROVAL');
  }
  await withDeadlockRetry(() => cashRepo.review(id, approve, approver.userId, approve ? null : body.rejectReason));
  const updated = await cashRepo.getById(id);
  publish([ROOMS.staff], 'cash.reviewed', { txn: updated });
  return updated;
}

/**
 * Hủy / sửa khoản đã duyệt (F-050). body: { reason, replacement?: { categoryId, amount, reason }, adminUsername?, adminPassword? }.
 * Quyền như duyệt: trưởng ca ≤ manager.cash_out_approve_max, quản lý mọi khoản; không tự hủy khoản mình ghi (trừ quản lý); nhân viên nhập tài khoản.
 */
export async function voidTxn(id, body, user) {
  const txn = await get(id);
  if (txn.status !== 'APPROVED') throw conflict('CASH_NOT_APPROVED', 'Chỉ hủy / sửa được khoản đã duyệt — khoản chờ duyệt dùng Từ chối');
  const settings = await getSettings();
  const allowManager = txn.amount <= settings.managerCashApproveMax;
  const actor = body.adminUsername ? { ...user, role: 'STAFF' } : user;
  const approver = await resolveApproval(actor, body, body.replacement ? 'việc sửa khoản sổ quỹ' : 'việc hủy khoản sổ quỹ', { allowManager });
  if (approver.userId === txn.createdBy.userId && approver.role !== 'ADMIN') {
    throw forbidden('Không tự hủy / sửa khoản do chính mình ghi — nhờ trưởng ca / quản lý khác', 'SELF_APPROVAL');
  }
  const r = await withDeadlockRetry(() =>
    cashRepo.voidTxn({
      id,
      approverId: approver.userId,
      actorId: user.userId,
      reason: body.reason,
      replacement: body.replacement ?? null,
      threshold: settings.cashApproveThreshold,
    }),
  );
  const voided = await cashRepo.getById(id);
  publish([ROOMS.staff], 'cash.reviewed', { txn: voided });
  const replacement = r.newTxnId ? await cashRepo.getById(r.newTxnId) : null;
  if (replacement) publish([ROOMS.staff], 'cash.created', { txn: replacement });
  return { voided, replacement };
}

/** Ảnh hóa đơn: người tạo khoản hoặc trưởng ca / quản lý. Ghi file mới rồi mới đổi đường dẫn; xóa file cũ (nếu có). */
export async function attachReceipt(id, buf, user) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw badRequest('RECEIPT_INVALID', 'Chọn ảnh hóa đơn (jpg, png hoặc webp)');
  if (buf.length > MAX_RECEIPT_BYTES) throw badRequest('RECEIPT_TOO_LARGE', 'Ảnh hóa đơn tối đa 2 MB');
  const sig = SIGNATURES.find(([, , ok]) => ok(buf));
  if (!sig) throw badRequest('RECEIPT_INVALID', 'Ảnh hóa đơn phải là jpg, png hoặc webp');
  const txn = await get(id);
  if (txn.createdBy.userId !== user.userId && !can(user, 'cash.approve')) throw forbidden('Chỉ người ghi khoản này hoặc trưởng ca được gắn ảnh');
  // F-050: ảnh hóa đơn của khoản đã hủy / từ chối giữ nguyên làm chứng từ (gắn ảnh mới sẽ xóa ảnh cũ)
  if (txn.status === 'VOIDED' || txn.status === 'REJECTED') throw conflict('CASH_NOT_APPROVED', 'Khoản đã hủy / từ chối — không đổi ảnh hóa đơn');
  const old = await cashRepo.receiptPath(id);
  await fs.mkdir(receiptsDir(), { recursive: true });
  const name = `${id}-${crypto.randomBytes(8).toString('hex')}.${sig[0]}`;
  await fs.writeFile(path.join(receiptsDir(), name), buf, { flag: 'wx' });
  await cashRepo.setReceipt(id, `receipts/${name}`);
  if (old) await fs.rm(path.join(config.uploadsDir, old), { force: true }).catch(() => {});
  return cashRepo.getById(id);
}

/** Trả { file (đường dẫn tuyệt đối), contentType } của ảnh hóa đơn. */
export async function receiptFile(id) {
  const rel = await cashRepo.receiptPath(id);
  if (!rel) throw notFound('Khoản này chưa có ảnh hóa đơn');
  const file = path.resolve(config.uploadsDir, rel);
  if (!file.startsWith(path.resolve(receiptsDir()) + path.sep)) throw notFound('Khoản này chưa có ảnh hóa đơn');
  const ext = path.extname(file).slice(1);
  const type = SIGNATURES.find(([e]) => e === ext)?.[1];
  if (!type) throw notFound('Khoản này chưa có ảnh hóa đơn');
  return { file, contentType: type };
}

/** Sổ quỹ (admin): danh sách + tổng theo danh mục (chỉ khoản ĐÃ DUYỆT) + số khoản chờ duyệt. */
export async function book(filter) {
  const rows = await cashRepo.list(filter);
  const byCat = new Map();
  let totalIn = 0;
  let totalOut = 0;
  for (const t of rows.filter((x) => x.status === 'APPROVED')) {
    const k = t.category.categoryId;
    const cur = byCat.get(k) ?? { ...t.category, direction: t.direction, amount: 0, count: 0 };
    cur.amount += t.amount;
    cur.count += 1;
    byCat.set(k, cur);
    if (t.direction === 'IN') totalIn += t.amount;
    else totalOut += t.amount;
  }
  return {
    rows,
    summary: {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      pending: rows.filter((x) => x.status === 'PENDING').length,
      byCategory: [...byCat.values()].sort((a, b) => b.amount - a.amount),
    },
  };
}
