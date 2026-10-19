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

async function call(path, { method = 'GET', body, headers = {}, staff = false } = {}) {
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
