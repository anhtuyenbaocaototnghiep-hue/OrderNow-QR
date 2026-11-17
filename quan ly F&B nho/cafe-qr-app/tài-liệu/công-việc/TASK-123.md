# TASK-123 — Tự xác nhận chuyển khoản qua SePay: tiền vào khớp bàn thì tự đóng bill (F-100, ADR-063)

- **Status:** READY_FOR_REVIEW (17/11/2026)
- **Tài liệu:** [FEATURE-100](../chức-năng/FEATURE-100.md) · ADR [ADR-063](../quyết-định/ADR-063-tu-xac-nhan-chuyen-khoan-sepay.md) (D-249…D-252) · AC-100-01…06 · US-100-1 · BR-129
- **Màn hình:** SCR-05, SCR-10, SCR-33
- **Nguồn:** chủ dự án 17/11/2026:
  - "bạn có làm cái chuyển khoản xong báo về máy đã nhận chưa";
  - "tôi sài cá nhân";
  - "ok làm trc đi rồi tôi đăng ký sepay sẽ báo với bạn".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-123-tu-xac-nhan-sepay`, chồng lên `task/TASK-122-chuyen-khoan-vietqr`
- **Kế hoạch:** [TASK-123-plan.md](../kế-hoạch/TASK-123-plan.md)

## Phạm vi

- **Máy chủ hỏi SePay 5 giây một lần** khi chủ quán bật và `.env` có khóa:
  - chỉ xét khoản có mã của quán ("CF …");
  - tiền vào khác của tài khoản cá nhân không lưu, không hiện.
- **Khớp bàn + đúng số phải thu + chưa chia bill + ca đang mở** → tự thu chuyển khoản. Người ghi là "Tự động (ngân hàng)"; điện thoại khách sang màn cảm ơn.
- **Không khớp** → dải "Tiền vào chưa khớp" ở quầy. Thu ngân "Ghép & thu" (đúng số phải thu) hoặc "Đã xử lý" (có ghi chú).
- **Mã bán mang đi** → chỉ báo quầy.
- **Quầy:** chuông + đọc to (giọng tiếng Việt của máy, khi đã bật âm thanh).
- **Cài đặt** (chủ quán): công tắc "Tự xác nhận khi tiền vào", trạng thái hỏi SePay, "Giả lập tiền vào".
- **Hướng dẫn** đăng ký SePay + tạo khóa: [tu-xac-nhan-chuyen-khoan.md](../vận-hành/tu-xac-nhan-chuyen-khoan.md).

**Ngoài phạm vi** (để sau):

- đối chiếu tổng tiền SePay báo với tổng "chuyển khoản" nhân viên ghi trong ca;
- in bill tự động khi máy tự thu;
- webhook (cần địa chỉ công khai).

## Test

- `ứng-dụng/máy-chủ/tests/bank-feed.test.js`: AC-100-01…05, có máy chủ SePay giả trong test.
- E2E "tự xác nhận chuyển khoản…": AC-100-06.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- `npm run db:migrate`: CafeQrDev — thêm bảng `BankTransactions` + tài khoản hệ thống, không đổi dữ liệu cũ.
