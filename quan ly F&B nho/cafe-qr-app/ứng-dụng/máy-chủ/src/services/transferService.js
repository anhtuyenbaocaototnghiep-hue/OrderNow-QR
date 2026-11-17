// F-099 (ADR-062 D-245…D-248): khách / quầy chuyển khoản bằng VietQR — mã có sẵn số tiền + nội dung riêng của bàn (dễ đối chiếu trong
// app ngân hàng). Tiền vào tài khoản / thẻ của quán (chủ quán nhập ở Cài đặt). Đã trả CHỈ do nhân viên ghi khi thấy tiền vào (D-3):
// không API nào cho khách tự đánh dấu, ảnh chụp màn hình "đã chuyển" không có tác dụng. Mã tạo ngay trên máy chủ của quán.
import QRCode from 'qrcode';
import { bankName, transferContent, vietQrPayload } from '../domain/vietqr.js';
import { conflict, notFound } from '../errors.js';
import * as sessionsRepo from '../repositories/sessionsRepo.js';
import { getSettings, transferReady } from './settingsService.js';

/** Nội dung chuyển khoản: "CF <mã bàn> <6 ký tự đầu mã phiên>" (+ " P<n>" khi thu từng phần) — không dấu, ≤ 25 ký tự. */
export function contentFor({ tableCode = null, sessionId = null, part = null } = {}) {
  if (!sessionId) return transferContent(`CF MANG DI ${new Date(Date.now() + 7 * 3600e3).toISOString().slice(11, 16).replace(':', '')}`);
  return transferContent(`CF ${tableCode ?? ''} ${String(sessionId).replace(/-/g, '').slice(0, 6)}${part ? ` P${part}` : ''}`);
}

/** Mã VietQR + thông tin hiện cạnh mã (ngân hàng, số tài khoản / thẻ, tên chủ) cho một số tiền và nội dung. */
export async function transferQr({ amount, content }) {
  const s = await getSettings();
  if (!transferReady(s)) throw conflict('TRANSFER_OFF', 'Quán chưa bật nhận chuyển khoản bằng mã QR (Cài đặt → Nhận chuyển khoản)');
  const money = Math.max(0, Math.round(Number(amount) || 0));
  const toCard = s.bankKind === 'CARD';
  const note = transferContent(content);
  const payload = vietQrPayload({ bin: s.bankBin, account: s.bankNumber, amount: money, content: note, toCard });
  return {
    amount: money,
    content: note,
    bankName: bankName(s.bankBin),
    kind: s.bankKind,
    number: toCard ? s.bankNumber.replace(/(\w{4})(?=\w)/g, '$1 ') : s.bankNumber,
    holder: s.bankHolder,
    payload,
    qr: await QRCode.toDataURL(payload, { width: 360, margin: 1, errorCorrectionLevel: 'M' }),
  };
}

/** Màn quầy (hộp Thu tiền / Bán mang đi): số tiền do màn quầy đưa (số phải thu đã tính); có phiên → nội dung theo bàn, không → "MANG DI". */
export async function transferForStaff({ amount, sessionId = null, part = null }) {
  const session = sessionId ? await sessionsRepo.findById(sessionId) : null;
  if (sessionId && !session) throw notFound('Không tìm thấy bàn', 'SESSION_NOT_FOUND');
  return transferQr({ amount, content: contentFor({ tableCode: session?.table.code, sessionId: session ? sessionId : null, part }) });
}
