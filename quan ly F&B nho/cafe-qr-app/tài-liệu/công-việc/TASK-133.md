# TASK-133 — Chuyển khoản qua nhân viên: mã QR chỉ trên bill (F-099, ADR-069)

- **Status:** READY_FOR_REVIEW (24/11/2026)
- **Tài liệu:**
  - [FEATURE-099](../chức-năng/FEATURE-099.md) (AC-099-08, AC-099-09);
  - ADR [ADR-069](../quyết-định/ADR-069-chuyen-khoan-qua-nhan-vien.md) (D-261);
  - BR-128;
  - US-099-1.
- **Màn hình:** SCR-05 (theo dõi đơn — gọi thanh toán), SCR-10 (dải Gọi thanh toán), SCR-12 (bill in), SCR-14 (hộp Thu tiền), thẻ bàn in, Cài đặt
- **Nguồn:** chủ dự án 24/11/2026: lo QR giả dán ở bàn → "ko khả thi lắm quá rủi ro có cách khác ko" → "bạn làm thêm cái in hóa đơn có QR ngân hàng để chuyển tiền với làm thêm chỗ thay thế QR chuyển khoản nữa nha".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-133-chuyen-khoan-qua-nhan-vien`, chồng lên `task/TASK-132-gop-nhan-su-luong`
- **Kế hoạch:** [TASK-133-plan.md](../kế-hoạch/TASK-133-plan.md)

## Phạm vi

- **Cài đặt "Hiện mã chuyển khoản trên điện thoại khách"** (mặc định tắt). Khi tắt:
  - điện thoại khách không nhận mã (`409 TRANSFER_STAFF_ONLY`);
  - hộp gọi thanh toán và thẻ "Đã gọi thanh toán" báo nhân viên sẽ mang bill có mã QR, kèm dòng nhắc chỉ chuyển theo bill.
- **"In bill" ở dải Gọi thanh toán của máy quầy:** phiếu tạm tính có mã QR. Nút chân hộp Thu tiền đổi tên "In bill".
- **Bill in:** "Chủ tài khoản: …" + dòng kiểm tên người nhận.
- **Thẻ bàn in:** khung "Mã này chỉ để gọi món, không dùng để trả tiền…".
- **Đổi tài khoản nhận tiền** vẫn ở Cài đặt → Nhận chuyển khoản.

**Ngoài phạm vi:**
- ghi đã trả (vẫn nhân viên / SePay);
- tự in bill khi khách gọi thanh toán;
- Zalo Mini App.

## Test

- **`transfer-qr.test.js` AC-099-08:**
  - `/api/shop` `guestQr`;
  - `409 TRANSFER_STAFF_ONLY`;
  - `request-payment` TRANSFER;
  - bill tạm tính có mã + holder;
  - quản lý cửa hàng `403`;
  - bật lại lấy được mã.
- **E2E "chuyển khoản qua nhân viên (mặc định)…" (AC-099-09):**
  - điện thoại khách không có mã, có dòng nhắc;
  - "In bill Bàn NV1" in bill có mã + Chủ tài khoản;
  - thẻ bàn có khung nhắc.
- **a11y:** thẻ "Đã gọi thanh toán" khi chuyển khoản qua nhân viên (`khach-cho-chuyen-khoan-qua-nhan-vien`).
- **Bài cũ thử mã trên điện thoại khách bật `guestTransferQr`:** transfer-qr, bank-feed, E2E QR1 / SP1, a11y AQ1.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** khởi động lại máy chủ; in lại thẻ bàn.
