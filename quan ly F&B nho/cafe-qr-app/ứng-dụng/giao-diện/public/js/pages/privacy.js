// SCR-48 Chính sách dữ liệu (FEATURE-062, ADR-021 D-81): ghi tên + địa chỉ quán từ Cài đặt. Trang công khai, không cần đăng nhập.
import { $ } from '../ui.js';

try {
  const r = await fetch('/api/shop');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { name, address } = await r.json();
  $('#shop').textContent = name || 'Quán';
  document.title = `Chính sách dữ liệu — ${name || 'Quán'}`;
  if (address) {
    $('#addr').textContent = address;
    $('#addr').hidden = false;
  }
} catch {
  $('#shop').textContent = 'Quán'; // lỗi mạng / máy chủ: trang vẫn đọc được
}
