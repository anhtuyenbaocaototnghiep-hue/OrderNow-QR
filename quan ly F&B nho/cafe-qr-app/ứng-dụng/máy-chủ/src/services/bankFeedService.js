// F-100 (ADR-063 D-249…D-252): tự xác nhận chuyển khoản.
//  - Máy chủ của quán tự hỏi SePay (API v2 GET /v2/transactions, Bearer SEPAY_API_TOKEN trong .env) mỗi 5 giây — không mở cổng ra
//    Internet, không cần webhook. Bật / tắt ở Cài đặt (pay.auto_confirm, chỉ chủ quán, mặc định tắt). Giới hạn SePay: 3 lần / giây / IP.
//  - Chỉ giữ khoản có mã của quán ("CF …"): tiền vào khác (tài khoản cá nhân: lương, người nhà…) không lưu, không hiện ở quầy.
//  - Mỗi khoản lưu một dòng BankTransactions (khóa Provider + ProviderTxnId → không xử lý hai lần, không xóa được).
//  - "CF <bàn> <6 ký tự mã phiên>" của đúng một bàn đang mở + đúng số phải thu + bàn chưa chia bill + ca đang mở → tự thu tiền
//    (chuyển khoản), người ghi "Tự động (ngân hàng)". Khác đi → "Tiền vào chưa khớp" ở quầy (ghép vào bàn / đã xử lý).
//  - "CF MANG DI …" (mã ở Bán mang đi) → chỉ báo quầy; quầy ghi đơn như cũ.
//  - Quầy nhận bank.received (chuông + đọc to); điện thoại khách nhận session.settled như khi nhân viên thu.
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { badRequest, conflict, notFound } from '../errors.js';
import * as bankRepo from '../repositories/bankRepo.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { publish, ROOMS } from '../realtime/publisher.js';
import * as sessionService from './sessionService.js';
import { getSettings, updateSettings } from './settingsService.js';

const POLL_MS = 5000;
const MAX_PAGES = 10; // mỗi lần hỏi tối đa 1.000 giao dịch — còn thì lần sau hỏi tiếp
const EARLY_MS = 2 * 60e3; // nhận cả giao dịch ngân hàng ghi giờ sớm hơn lúc bật một chút (đồng hồ hai bên lệch)
export const feed = { lastSyncAt: null, lastError: null, accountId: null, accountFor: null, retryAt: 0, timer: null, skipped: 0 };

export const configured = () => Boolean(config.sepay.token);

/** Chữ hoa, bỏ dấu, chỉ giữ chữ / số — ngân hàng hay bỏ khoảng trắng, thêm tiền tố ("MBVCB.123.CF B02 A1B2C3.CT tu …"). */
export const compact = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const codeOf = (session) => compact(`CF${session.table.code}${session.sessionId.replace(/-/g, '').slice(0, 6)}`);
const TAKEAWAY = /CFMANGDI/;
const SHOP_CODE = /CF[A-Z0-9]{1,12}[0-9A-F]{6}/;
/** Nội dung có mã của quán: "CF" + mã bàn + 6 ký tự mã phiên, hoặc "CF MANG DI". */
export const isShopTransfer = (content) => {
  const c = compact(content);
  return TAKEAWAY.test(c) || SHOP_CODE.test(c);
};

/** Bàn đang mở có mã trong nội dung — đúng một bàn mới tính (hai bàn trùng mã → để nhân viên chọn). */
export function matchSession(content, sessions) {
  const c = compact(content);
  const hits = sessions.filter((s) => c.includes(codeOf(s)));
  return hits.length === 1 ? hits[0] : null;
}

const vnd = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

/** Quyết định cho một khoản có mã của quán: tự thu (MATCHED), chỉ báo (mang đi — HANDLED) hay để nhân viên xử lý (UNMATCHED). */
async function decide(money, content, sys) {
  const c = compact(content);
  if (TAKEAWAY.test(c)) return { status: 'HANDLED', note: 'Bán mang đi — quầy ghi đơn khi bán', handledBy: sys.userId, takeaway: true };
  const open = await sessionsRepo.listByStatus(['OPEN', 'PAYMENT_REQUESTED']);
  const hits = open.filter((s) => c.includes(codeOf(s)));
  if (hits.length > 1) return { status: 'UNMATCHED', note: 'Nhiều bàn trùng mã — nhân viên chọn bàn' };
  const session = hits[0];
  if (!session) {
    const paid = (await bankRepo.recentClosedSessions(24)).find((s) => c.includes(codeOf(s)));
    if (paid) return { status: 'UNMATCHED', sessionId: paid.sessionId, note: `${paid.table.name} đã thanh toán — có thể khách chuyển hai lần` };
    return { status: 'UNMATCHED', note: 'Mã trong nội dung không khớp bàn nào đang mở' };
  }
  const sessionId = session.sessionId;
  if (session.splitCount > 0 || session.paidAmount > 0) return { status: 'UNMATCHED', sessionId, note: 'Bàn đang chia bill — nhân viên thu từng phần' };
  try {
    const due = (await sessionService.settlePreview(sessionId, {}, sys)).totals.amountDue;
    if (money !== due) {
      const gap = money < due ? `Chuyển thiếu ${vnd(due - money)}` : `Chuyển dư ${vnd(money - due)}`;
      return { status: 'UNMATCHED', sessionId, note: `${gap} (phải thu ${vnd(due)})` };
    }
    const settled = await sessionService.settle(sessionId, { method: 'TRANSFER', expectedAmountDue: due }, sys);
    return { status: 'MATCHED', sessionId, paymentId: settled.payment?.paymentId ?? null, note: 'Tự thu khi tiền vào', handledBy: sys.userId };
  } catch (err) {
    return { status: 'UNMATCHED', sessionId, note: err.message || 'Không tự thu được' };
  }
}

/** Một giao dịch tiền vào: bỏ qua nếu không có mã của quán / đã xử lý → lưu → tự thu hoặc để "chưa khớp"; báo quầy. */
export async function handleIncoming({ provider, providerTxnId, amount, content, accountNumber = null, referenceNumber = null, transactionAt = new Date() }) {
  const money = Math.round(Number(amount) || 0);
  if (!(money > 0)) return null;
  if (!isShopTransfer(content)) {
    feed.skipped += 1; // không phải tiền của quán — không lưu, không báo
    return null;
  }
  const id = await bankRepo.insert({ provider, providerTxnId, accountNumber, amount: money, content, referenceNumber, transactionAt });
  if (!id) return null; // đã xử lý
  const result = await decide(money, content, await bankRepo.systemUser());
  const row = await bankRepo.setResult(id, result);
  publish([ROOMS.staff], 'bank.received', {
    bankTxnId: id,
    status: row.status,
    amount: row.amount,
    content: row.content,
    table: row.table,
    takeaway: Boolean(result.takeaway),
    note: row.note,
  });
  return row;
}

/** Giả lập tiền vào (chủ quán thử trước khi có khóa SePay) — chạy y như giao dịch thật, ghi nguồn SIMULATED. */
export async function simulate({ amount, content }) {
  if (!(await getSettings()).autoConfirm) throw conflict('AUTO_CONFIRM_OFF', 'Bật "Tự xác nhận khi tiền vào" ở Cài đặt trước khi thử');
  if (!isShopTransfer(content)) {
    return { status: 'SKIPPED', amount, content, note: 'Nội dung không có mã của quán (CF …) — khoản như vậy máy bỏ qua: không lưu, không báo quầy' };
  }
  return handleIncoming({ provider: 'SIMULATED', providerTxnId: randomUUID(), amount, content, transactionAt: new Date() });
}

// ---- SePay ----
const vnStamp = (ms) => new Date(ms + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const fromVn = (s) => new Date(`${String(s).trim().replace(' ', 'T')}+07:00`);

async function sepayGet(path, params, fetchImpl) {
  const url = `${config.sepay.baseUrl}${path}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const r = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${config.sepay.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 429) {
    feed.retryAt = Date.now() + (Number(r.headers.get('retry-after')) || 5) * 1000;
    throw new Error('SePay báo hỏi quá nhanh (429) — đợi rồi hỏi lại');
  }
  if (r.status === 401 || r.status === 403) {
    feed.retryAt = Date.now() + 60e3;
    throw new Error(`Khóa SePay không đúng hoặc đã bị thu hồi (${r.status}) — sửa SEPAY_API_TOKEN trong .env rồi khởi động lại`);
  }
  if (!r.ok) throw new Error(`SePay lỗi ${r.status}`);
  return r.json();
}

/**
 * Tài khoản theo dõi: SEPAY_BANK_ACCOUNT_ID, hoặc tài khoản trùng số ở Cài đặt, hoặc tài khoản duy nhất đã liên kết.
 * Nhiều tài khoản mà không biết chọn cái nào → dừng (không đọc tiền vào của tài khoản khác).
 */
async function resolveAccount(s, fetchImpl) {
  if (config.sepay.bankAccountId) return config.sepay.bankAccountId;
  const list = (await sepayGet('/v2/bank-accounts', null, fetchImpl)).data ?? [];
  const same = list.find((a) => String(a.account_number ?? '') === String(s.bankNumber ?? ''));
  if (same) return same.id;
  if (list.length === 1) return list[0].id;
  throw new Error(
    list.length ? 'SePay có nhiều tài khoản — ghi SEPAY_BANK_ACCOUNT_ID (mã tài khoản ở trang SePay) vào .env' : 'SePay chưa liên kết tài khoản ngân hàng nào',
  );
}

/** Một lần hỏi SePay: giao dịch tiền vào mới (sau giao dịch đã xét cuối; lần đầu: từ lúc bật tự xác nhận) → xử lý lần lượt. */
export async function pollOnce(fetchImpl = fetch) {
  const s = await getSettings();
  if (!s.autoConfirm || !configured()) return { skipped: true };
  if (Date.now() < feed.retryAt) return { skipped: true, retry: true };
  try {
    if (!feed.accountId || feed.accountFor !== s.bankNumber) {
      feed.accountId = await resolveAccount(s, fetchImpl);
      feed.accountFor = s.bankNumber;
    }
    const sinceMs = new Date(s.autoConfirmSince ?? Date.now()).getTime() - EARLY_MS;
    const base = { bank_account_id: String(feed.accountId), transfer_type: 'in', transaction_date_sort: 'asc', per_page: '100' };
    base.transaction_date_from = vnStamp(sinceMs);
    if (s.sepaySinceId) base.since_id = s.sepaySinceId;
    const handled = [];
    // Giao dịch cuối đã xét xong — lỗi giữa chừng (mất kết nối CSDL…) vẫn giữ phần đã xong; lần sau hỏi tiếp từ khoản bị lỗi
    let lastDone = null;
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await sepayGet('/v2/transactions', { ...base, page: String(page) }, fetchImpl);
        for (const t of body.data ?? []) {
          const id = t.id === undefined || t.id === null ? null : String(t.id);
          const parsed = t.transaction_date ? fromVn(t.transaction_date) : null;
          const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(); // giờ lạ → lấy giờ nhận, không kẹt vòng hỏi
          const own = id && (!t.transfer_type || t.transfer_type === 'in') && at.getTime() >= sinceMs; // trước lúc bật: đã xử lý tay
          if (own) {
            const row = await handleIncoming({
              provider: 'SEPAY',
              providerTxnId: id,
              amount: t.amount_in,
              content: t.transaction_content,
              accountNumber: t.account_number,
              referenceNumber: t.reference_number,
              transactionAt: at,
            });
            if (row) handled.push(row.bankTxnId);
          }
          if (id) lastDone = id;
        }
        if (!body.meta?.pagination?.has_more) break;
      }
    } finally {
      if (lastDone && lastDone !== s.sepaySinceId) await updateSettings({ sepaySinceId: lastDone });
    }
    feed.lastSyncAt = new Date();
    feed.lastError = null;
    return { handled };
  } catch (err) {
    feed.lastError = err.name === 'TimeoutError' ? 'SePay không trả lời (mạng chậm / mất mạng) — sẽ hỏi lại' : err.message;
    return { error: feed.lastError };
  }
}

/** Vòng hỏi SePay 5 giây (cùng công tắc JOBS_ENABLED với job nền). Mỗi lần hỏi xong mới hẹn lần sau — không chồng lần hỏi. */
export function startBankFeed() {
  if (process.env.JOBS_ENABLED === 'false' || feed.timer) return false;
  const tick = async () => {
    await pollOnce().catch(() => {});
    feed.timer = setTimeout(tick, POLL_MS);
    feed.timer.unref?.();
  };
  feed.timer = setTimeout(tick, POLL_MS);
  feed.timer.unref?.();
  return true;
}

/** Trạng thái cho Cài đặt (chủ quán): có khóa SePay chưa, đang bật không, lần hỏi cuối, lỗi cuối, khoản chưa khớp, khoản bỏ qua. */
export async function status() {
  const s = await getSettings();
  return {
    configured: configured(),
    enabled: s.autoConfirm,
    lastSyncAt: feed.lastSyncAt,
    lastError: feed.lastError,
    unmatched: await bankRepo.countUnmatched(),
    skipped: feed.skipped,
  };
}

// ---- Quầy: tiền vào chưa khớp ----
const STATUSES = ['UNMATCHED', 'MATCHED', 'HANDLED'];
export const list = (status = 'UNMATCHED') => bankRepo.list({ status: STATUSES.includes(status) ? status : null });

const changed = (row) => publish([ROOMS.staff], 'bank.updated', { bankTxnId: row.bankTxnId, status: row.status });

async function pending(id) {
  const row = await bankRepo.getById(id);
  if (!row) throw notFound('Không tìm thấy khoản tiền vào', 'BANK_TXN_NOT_FOUND');
  if (row.status !== 'UNMATCHED') throw conflict('BANK_TXN_HANDLED', 'Khoản tiền vào này đã được xử lý');
  return row;
}

/** Nhân viên ghép tiền vào với một bàn: số tiền phải đúng số phải thu → thu tiền (chuyển khoản) do chính nhân viên đó ghi. */
export async function matchToSession(id, sessionId, user) {
  const row = await pending(id);
  const due = (await sessionService.settlePreview(sessionId, {}, user)).totals.amountDue;
  if (due !== row.amount) {
    throw conflict('AMOUNT_MISMATCH', `Bàn này phải thu ${vnd(due)}, khoản tiền vào ${vnd(row.amount)} — thu ở hộp Thu tiền rồi bấm "Đã xử lý"`, {
      amountDue: due,
      amount: row.amount,
    });
  }
  // Giữ chỗ trước khi thu: hai máy quầy cùng ghép một khoản → máy sau bị chặn (một khoản tiền không thể thu cho hai bàn)
  if (!(await bankRepo.claimUnmatched(id, { status: 'MATCHED', sessionId, note: 'Nhân viên ghép vào bàn', handledBy: user.userId }))) {
    throw conflict('BANK_TXN_HANDLED', 'Khoản tiền vào này vừa được xử lý ở máy khác');
  }
  try {
    const settled = await sessionService.settle(sessionId, { method: 'TRANSFER', expectedAmountDue: row.amount }, user);
    const done = await bankRepo.setResult(id, {
      status: 'MATCHED',
      sessionId,
      paymentId: settled.payment?.paymentId ?? null,
      note: 'Nhân viên ghép vào bàn',
      handledBy: user.userId,
    });
    changed(done);
    return done;
  } catch (err) {
    await bankRepo.setResult(id, { status: 'UNMATCHED', sessionId: row.sessionId, note: row.note });
    throw err;
  }
}

/** Đánh dấu đã xử lý (đã thu tay, đã ghi bán mang đi, trả lại khách…) — bắt buộc ghi chú. */
export async function resolve(id, note, user) {
  const text = String(note ?? '').trim();
  if (text.length < 3) throw badRequest('NOTE_REQUIRED', 'Ghi chú cách đã xử lý (ít nhất 3 ký tự)');
  const row = await pending(id);
  if (!(await bankRepo.claimUnmatched(id, { status: 'HANDLED', sessionId: row.sessionId, paymentId: row.paymentId, note: text, handledBy: user.userId }))) {
    throw conflict('BANK_TXN_HANDLED', 'Khoản tiền vào này vừa được xử lý ở máy khác');
  }
  const done = await bankRepo.getById(id);
  changed(done);
  return done;
}
