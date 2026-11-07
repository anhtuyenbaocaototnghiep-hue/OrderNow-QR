// Gọi REST API: JSON, map lỗi { code, message, details }. Nhân viên gửi kèm Bearer token; khách dùng cookie cf_client.
import { clearStaffSession, getToken } from './auth-store.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Lỗi ${status}`);
    this.status = status;
    this.code = body?.code || `HTTP_${status}`;
    this.details = body?.details;
  }
}

// F-072: thao tác tiền cần PIN → máy chủ trả 403 PIN_REQUIRED; trang quầy đăng ký hộp nhập PIN, gửi lại kèm header X-Actor-Pin
let pinPrompter = null;
export const setPinPrompter = (fn) => {
  pinPrompter = fn;
};

// F-079: máy chủ chặn vì thiếu một quyền cấp riêng được (403 + details.capability) → khung trang hiện thanh "Xin quyền"
let accessNotifier = null;
export const setAccessNotifier = (fn) => {
  accessNotifier = fn;
};

async function call(path, opts = {}) {
  try {
    return await send(path, opts);
  } catch (err) {
    if (!(opts.staff && err.code === 'PIN_REQUIRED' && pinPrompter)) throw err;
    let data = null;
    const done = await pinPrompter(err.message, async (pin) => {
      data = await send(path, { ...opts, headers: { ...(opts.headers ?? {}), 'X-Actor-Pin': pin } });
      return true;
    });
    if (!done) throw new ApiError(0, { code: 'PIN_CANCELLED', message: 'Chưa nhập PIN — thao tác chưa được thực hiện' });
    return data;
  }
}

async function send(path, { method = 'GET', body, headers = {}, staff = false } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (staff) {
    const token = getToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Mất kết nối mạng, vui lòng thử lại' });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (staff && (res.status === 401 || err.code === 'ACCOUNT_LOCKED')) {
      clearStaffSession();
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/pos/login?next=${next}&reason=${err.code === 'ACCOUNT_LOCKED' ? 'locked' : 'expired'}`;
    }
    if (staff && res.status === 403 && err.details?.capability && accessNotifier) accessNotifier(err);
    throw err;
  }
  return data;
}

/** API khách (công khai). */
export const api = (path, opts) => call(path, opts);
/** API nhân viên/quản lý (Bearer token). */
export const staffApi = (path, opts = {}) => call(path, { ...opts, staff: true });

/** Gửi file (ảnh) làm thân request — ví dụ ảnh hóa đơn sổ quỹ (F-033). Trả JSON như staffApi. */
export async function staffUpload(path, file, method = 'PUT') {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': file.type || 'application/octet-stream', Accept: 'application/json' },
      body: file,
    });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Mất kết nối mạng, vui lòng thử lại' });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Tải file nhị phân có xác thực (ví dụ ảnh QR) → object URL. */
export async function staffBlobUrl(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return URL.createObjectURL(await res.blob());
}
