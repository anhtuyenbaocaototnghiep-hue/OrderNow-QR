// F-059 (BR-092): chuỗi QR Wi-Fi chuẩn mà camera Android / iPhone đọc được để tự vào mạng.
// Ký tự \ ; , : " trong tên / mật khẩu phải thoát bằng \ — không thoát thì máy đọc sai tên mạng / mật khẩu.
const escape = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

/** { ssid, password } → `WIFI:T:WPA;S:…;P:…;;`; mật khẩu rỗng = mạng mở `WIFI:T:nopass;S:…;;`. */
export function wifiQrText({ ssid, password }) {
  return password ? `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;` : `WIFI:T:nopass;S:${escape(ssid)};;`;
}
