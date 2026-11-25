# TASK-135 — Số điện thoại quán trong Cài đặt + chữ "WIFI" giữa mã Wi-Fi trên thẻ bàn (ADR-070)

- **Status:** READY_FOR_REVIEW (25/11/2026)
- **Tài liệu:** [ADR-070](../quyết-định/ADR-070-so-dien-thoai-quan-va-chu-wifi.md) (D-262, D-263), [FEATURE-053](../chức-năng/FEATURE-053.md) (AC-053-06…08), [FEATURE-010](../chức-năng/FEATURE-010.md) (AC-010-10), BR-085, US-053-1, US-010-2
- **Màn hình:** SCR-33 Cài đặt, SCR-01 màn chào, SCR-12 hóa đơn, SCR-22 In mã QR
- **Nguồn:** chủ dự án 25/11/2026: "làm sạch dữ liệu , cài đặt thêm chỗ số điện thoại" và "làm lại hình mã QR ở wifi quán này ghi thêm wifi nữa".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-135-sdt-quan-va-chu-wifi`, chồng lên `task/TASK-134-the-qr-ban`
- **Kế hoạch:** [TASK-135-plan.md](../kế-hoạch/TASK-135-plan.md)

## Phạm vi

- **Số điện thoại quán (D-262):**
  - Cài đặt → Thông tin quán có ô "Số điện thoại quán" (khóa `shop.phone`, chỉ chủ quán đổi; số sai báo dưới ô).
  - In dưới địa chỉ: hóa đơn / phiếu tạm tính, hóa đơn bán lúc mất mạng, phiếu bán tay, phiếu đặt hàng.
  - Chân thẻ QR bàn: "ĐT: …" dưới "Cảm ơn quý khách!".
  - Màn chào khi quét QR: số bấm là gọi.
  - API: `shopPhone` ở cài đặt; `shop.phone` ở `/api/auth/me`, `/api/menu`, hóa đơn; `phone` ở `/api/shop`.
- **Chữ WIFI giữa mã Wi-Fi (D-263):** ô trắng viền xanh rêu, biểu tượng sóng + chữ WIFI giữa mã Wi-Fi trên ảnh thẻ; mã Wi-Fi đổi mức sửa lỗi M → H.

**Ngoài phạm vi:**
- "Làm sạch dữ liệu" (xóa dữ liệu bán thử trong CafeQrDev) — việc dữ liệu, chờ chủ dự án duyệt danh sách (`.agent/rules.md`: xóa hàng loạt dữ liệu thật cần duyệt).
- Nhập menu / công thức / nguyên liệu / 20 bàn theo ảnh của quán — làm qua API trên CafeQrDev, không đổi mã nguồn.

## Test

- **`tests/shop-info.test.js`:**
  - AC-053-06: lưu số → 5 nguồn đọc đều có; lưu cài đặt khác không đổi số; lưu rỗng → `null` ở mọi nơi.
  - AC-053-07: 8 số sai → 400 ở `shopPhone`, 6 số đúng (số bàn, +84, tổng đài, có ngoặc / gạch), nhân viên + trưởng ca → 403.
  - Ba chỗ `deepEqual` cũ (AC-053-01…03) thêm `phone: null` — hợp đồng mới có thêm khóa, không bớt điều kiện kiểm.
- **E2E `flow.spec.js` "số điện thoại quán + chữ WIFI…" (AC-053-08, AC-010-10):** số sai báo dưới ô, số đúng lưu được; thẻ bàn có "ĐT: 0909 123 456"; đo điểm ảnh vùng 60 × 60 giữa mã Wi-Fi trên ảnh thẻ: < 2 % điểm đen, > 3 % điểm xanh rêu.
- **Kiểm quét được (ngoài bộ test, jsQR 1.4.0 cài ở thư mục tạm):**
  - thẻ vẽ bằng `table-card.js` thật;
  - 3 mẫu Wi-Fi (mật khẩu ngắn, 63 ký tự, mạng mở) × mức M / H × cỡ 100 / 60 / 40 %;
  - mức H giải đúng 9/9; mức M thu nhỏ 40 % có 1 mẫu không giải được;
  - mã gọi món giải đúng mọi lần.

## Lệnh kiểm chứng

- `node --test ứng-dụng/máy-chủ/tests/shop-info.test.js` — 7/7 PASS.
- Toàn bộ: xem phần Bàn giao (cập nhật sau khi chạy).
