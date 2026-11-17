# TASK-122 — Chuyển khoản bằng VietQR: mã có sẵn số tiền, nhân viên xác nhận (F-099, ADR-062)

- **Status:** READY_FOR_REVIEW (17/11/2026)
- **Tài liệu:** [FEATURE-099](../chức-năng/FEATURE-099.md) · ADR [ADR-062](../quyết-định/ADR-062-chuyen-khoan-vietqr.md) (D-245…D-248) · AC-099-01…05 · US-099-1 · BR-128
- **Màn hình:** SCR-05, SCR-10, SCR-12, SCR-13, SCR-14, SCR-33
- **Nguồn:** chủ dự án 17/11/2026: "BẠN TÍCH HỢP VÀO THANH TOÁN ONLINE LUÔN TẠO CÁI HINH LÀM GÌ" → "còn cái chuyển khoản online nữa bạn làm nốt luôn đi".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-122-chuyen-khoan-vietqr`, chồng lên `task/TASK-121-loi-tran-ngang-man-khach`
- **Kế hoạch:** [TASK-122-plan.md](../kế-hoạch/TASK-122-plan.md)

## Phạm vi

- **Cài đặt "Nhận chuyển khoản" (chủ quán):** ngân hàng, số tài khoản / số thẻ, tên chủ, bật / tắt.
- **Khách gọi thanh toán:** chọn tiền mặt hoặc chuyển khoản; chọn chuyển khoản thì hiện mã VietQR có sẵn số tiền và nội dung.
- **Quầy:**
  - dải Gọi thanh toán ghi "chuyển khoản";
  - hộp Thu tiền chọn sẵn và hiện mã;
  - Bán mang đi hiện mã;
  - phiếu tạm tính in mã.
- **Đã trả:** chỉ nhân viên ghi, như cũ.

**Ngoài phạm vi** (giai đoạn sau, ADR riêng): tự xác nhận khi tiền vào qua dịch vụ báo biến động số dư.

## Test

- `ứng-dụng/máy-chủ/tests/transfer-qr.test.js`: AC-099-01…04.
- E2E "chuyển khoản bằng mã QR…": AC-099-05.
- a11y: khung mã QR trên điện thoại.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- `npm run db:migrate`: CafeQrDev, chỉ thêm cột `Sessions.PayMethodHint`.
