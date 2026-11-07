// F-074 (ADR-032 D-140…D-146): bán tiếp khi mất mạng ở máy quầy.
//  - Đơn bán tạm lưu trong bộ nhớ của trình duyệt trên máy này (localStorage) → tải lại trang / tắt trình duyệt không mất.
//  - Có mạng lại tự gửi bù lần lượt (POST /api/offline-sales); máy chủ nhận ra mã lượt thu nên gửi lại bao nhiêu lần cũng chỉ ghi một đơn.
//  - Lỗi mạng / máy chủ → dừng, thử lại sau; lỗi dữ liệu (món đã xóa…) → giữ lại kèm lý do để trưởng ca xử lý.
//  - Hóa đơn in ngay trên máy này (iframe srcdoc, CSS kèm sẵn) — không cần tải trang nào từ máy chủ.
// Mạng nội bộ chạy http (không phải https) nên trình duyệt không cho dùng crypto.randomUUID / service worker:
// mã lượt thu tạo bằng crypto.getRandomValues; trang đang mở vẫn bán được, nhưng tải lại trang lúc máy chủ tắt thì không mở được.
import { staffApi } from './api.js';
import { receiptWidth } from './print.js';

const QUEUE_KEY = 'cf_offline_sales';
const SEQ_KEY = 'cf_offline_seq';
const DEVICE_KEY = 'cf_device_name';

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** UUID v4 bằng crypto.getRandomValues (crypto.randomUUID chỉ có trên https / localhost). */
export function newClientRef() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Tên máy này (ghi kèm đơn gửi bù để biết đơn từ máy nào). */
export function deviceName() {
  let name = read(DEVICE_KEY, null);
  if (!name) {
    name = `Máy ${newClientRef().slice(0, 4).toUpperCase()}`;
    write(DEVICE_KEY, name);
  }
  return name;
}

const listeners = new Set();
/** Đăng ký nghe hàng chờ đổi (thêm / gửi xong / lỗi). */
export const onQueueChange = (cb) => listeners.add(cb);
export const pendingSales = () => read(QUEUE_KEY, []);
function saveQueue(queue) {
  const saved = write(QUEUE_KEY, queue);
  for (const cb of listeners) cb(queue);
  return saved;
}

function nextLocalCode() {
  const n = (read(SEQ_KEY, 0) % 9999) + 1;
  write(SEQ_KEY, n);
  return `T-${String(n).padStart(4, '0')}`;
}

/**
 * Ghi một đơn bán tạm trên máy này. sale: { clientRef, soldBy: { userId, fullName }, shiftId, method, amountReceived, total,
 * memberPhone, note, items: [{ menuItemId, name, quantity, note, optionIds, optionLabels, unitPrice }] } → bản ghi (có localCode, soldAt).
 * Không lưu được (bộ nhớ trình duyệt bị chặn / đầy) → ném lỗi: nhân viên ghi phiếu bán tay.
 */
export function recordSale(sale) {
  const entry = { ...sale, localCode: nextLocalCode(), soldAt: new Date().toISOString(), device: deviceName(), error: null };
  const queue = pendingSales();
  if (queue.some((s) => s.clientRef === entry.clientRef)) return queue.find((s) => s.clientRef === entry.clientRef);
  queue.push(entry);
  if (!saveQueue(queue)) throw new Error('Không lưu được đơn trên máy này (bộ nhớ trình duyệt bị chặn hoặc đầy) — ghi vào phiếu bán tay');
  return entry;
}

const payload = (s) => ({
  clientRef: s.clientRef,
  source: 'OFFLINE',
  localCode: s.localCode,
  soldAt: s.soldAt,
  soldBy: s.soldBy?.userId ?? null,
  shiftId: s.shiftId ?? null,
  method: s.method,
  amountReceived: s.method === 'CASH' ? s.amountReceived : null,
  total: s.total,
  memberPhone: s.memberPhone || null,
  device: s.device ?? null,
  note: s.note || null,
  items: s.items.map(({ menuItemId, quantity, note, optionIds, unitPrice }) => ({
    menuItemId,
    quantity,
    note: note || null,
    optionIds: optionIds ?? [],
    unitPrice,
  })),
});

let syncing = null;
/**
 * Gửi bù lần lượt theo thứ tự bán. Gửi xong (kể cả máy chủ báo đã có) → bỏ khỏi hàng chờ.
 * Mất mạng / máy chủ lỗi / chưa mở ca → dừng, lần sau thử lại. Lỗi dữ liệu → giữ lại kèm lý do, gửi tiếp đơn sau.
 * → { sent, left, results: [{ localCode, issues }] }
 */
export function syncPending() {
  if (syncing) return syncing;
  syncing = (async () => {
    let sent = 0;
    const results = [];
    for (const s of pendingSales()) {
      try {
        const r = await staffApi('/api/offline-sales', { method: 'POST', body: payload(s) });
        saveQueue(pendingSales().filter((x) => x.clientRef !== s.clientRef));
        sent += 1;
        results.push({ localCode: s.localCode, orderCode: r.order?.orderCode, issues: r.issues ?? [] });
      } catch (err) {
        const retryLater = err.status === 0 || err.status >= 500 || err.status === 401 || err.code === 'NO_OPEN_SHIFT';
        saveQueue(pendingSales().map((x) => (x.clientRef === s.clientRef ? { ...x, error: retryLater ? null : err.message } : x)));
        if (retryLater) break;
      }
    }
    return { sent, left: pendingSales().length, results };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;
const RECEIPT_CSS = `
  body { margin: 0; background: #fff; }
  .receipt { --w: 80mm; width: var(--w); padding: 4mm 3mm; color: #000; font: 12px/1.35 ui-monospace, Consolas, 'Courier New', monospace; }
  .receipt.w58 { --w: 58mm; font-size: 10.5px; }
  h1 { font: 800 1.25em system-ui, 'Segoe UI', Arial, sans-serif; text-align: center; margin: 0; }
  .center { text-align: center; } .title { text-align: center; font-weight: 800; font-size: 1.15em; margin: 1.5mm 0; }
  .flag { text-align: center; font-weight: 800; border: 1px solid #000; padding: 1mm; margin: 1.5mm 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; } td { padding: 0.4mm 0; vertical-align: top; }
  td.q { width: 9mm; text-align: center; } td.m { text-align: right; white-space: nowrap; padding-left: 1.5mm; }
  .note { font-size: 0.9em; font-style: italic; } .kv { display: flex; justify-content: space-between; gap: 2mm; }
  .kv.total { font-weight: 800; font-size: 1.2em; }`;

/** In hóa đơn đơn bán tạm ngay trên máy này (không cần máy chủ). shop: { name, address }. */
export function printOfflineReceipt(sale, shop = {}) {
  const w = receiptWidth();
  const lines = sale.items
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}</td><td class="q">x${l.quantity}</td><td class="m">${vnd(l.unitPrice * l.quantity)}</td></tr>` +
        (l.optionLabels?.length ? `<tr><td class="note" colspan="3">  + ${esc(l.optionLabels.join(', '))}</td></tr>` : '') +
        (l.note ? `<tr><td class="note" colspan="3">  (${esc(l.note)})</td></tr>` : ''),
    )
    .join('');
  const at = new Date(sale.soldAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const cash = sale.method === 'CASH';
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Hóa đơn ${esc(sale.localCode)}</title>
    <style>@page { size: ${w}mm auto; margin: 0; } ${RECEIPT_CSS}</style></head>
    <body><main class="receipt ${w === 58 ? 'w58' : ''}">
      <h1>${esc(shop.name || 'Hóa đơn')}</h1>${shop.address ? `<div class="center">${esc(shop.address)}</div>` : ''}
      <div class="title">HÓA ĐƠN THANH TOÁN</div>
      <div class="flag">BÁN LÚC MẤT MẠNG · Đơn tạm ${esc(sale.localCode)}</div>
      <div class="center">${esc(at)}</div>${sale.note ? `<div class="center">${esc(sale.note)}</div>` : ''}<hr>
      <table><tbody>${lines}</tbody></table><hr>
      <div class="kv total"><span>TỔNG CỘNG</span><span>${vnd(sale.total)}</span></div>
      ${cash ? `<div class="kv"><span>Tiền khách đưa</span><span>${vnd(sale.amountReceived)}</span></div><div class="kv"><span>Tiền thừa</span><span>${vnd(sale.amountReceived - sale.total)}</span></div>` : ''}
      <div class="kv"><span>Thanh toán</span><span>${cash ? 'Tiền mặt' : 'Chuyển khoản'}</span></div>
      <div class="kv"><span>Thu ngân</span><span>${esc(sale.soldBy?.fullName)}</span></div>
      ${sale.memberPhone ? '<div class="center note">Điểm hội viên sẽ cộng khi có mạng lại</div>' : ''}
      <hr><div class="center note">Giá niêm yết · đơn tự gửi về hệ thống khi có mạng lại</div>
    </main></body></html>`;
  const frame = document.createElement('iframe');
  frame.title = 'In hóa đơn đơn bán tạm';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 60_000);
    }
  });
  frame.srcdoc = html;
  document.body.append(frame);
}

/** Phiếu bán tay trống (A4) — in sẵn để dùng khi máy quầy cũng hỏng / mất điện; trưởng ca nhập lại ở "Nhập đơn từ phiếu bán tay". */
export function printBlankForm(shop = {}) {
  const rows = Array.from({ length: 22 }, (_, i) => `<tr><td class="n">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu bán tay</title><style>
    @page { size: A4 portrait; margin: 12mm; } body { margin: 0; font: 12px/1.4 system-ui, 'Segoe UI', Arial, sans-serif; color: #000; }
    h1 { font-size: 18px; margin: 0 0 2mm; } .sub { margin: 0 0 4mm; } table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; height: 9mm; padding: 1mm 2mm; text-align: left; vertical-align: top; } th { height: auto; background: #eee; }
    td.n { width: 7mm; text-align: center; } .foot { margin-top: 4mm; }</style></head><body>
    <h1>${esc(shop.name || 'Quán')} — PHIẾU BÁN TAY</h1>
    <p class="sub">Dùng khi máy quầy không dùng được. Ngày: ............ Ca: ............ Người ghi: ....................................</p>
    <table><thead><tr><th>#</th><th>Giờ</th><th>Món × số lượng (ghi rõ size / tùy chọn)</th><th>Tổng tiền</th><th>Tiền mặt / CK</th><th>SĐT hội viên</th><th>Người bán</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="foot">Có máy lại: trưởng ca vào <b>Bán mang đi → Nhập đơn từ phiếu bán tay</b>, nhập từng dòng với đúng giờ bán (trong 7 ngày). Giữ phiếu này để đối chiếu két.</p>
    </body></html>`;
  const frame = document.createElement('iframe');
  frame.title = 'In phiếu bán tay';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 60_000);
    }
  });
  frame.srcdoc = html;
  document.body.append(frame);
}
