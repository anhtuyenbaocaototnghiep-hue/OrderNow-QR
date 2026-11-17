# FEATURE-100 — Tự xác nhận chuyển khoản qua SePay

> **Nguồn:** chủ dự án 17/11/2026:
> - "bạn có làm cái chuyển khoản xong báo về máy đã nhận chưa"
> - "tôi sài cá nhân"
> - "ok làm trc đi rồi tôi đăng ký sepay sẽ báo với bạn"
>
> **Quyết định:** [ADR-063](../quyết-định/ADR-063-tu-xac-nhan-chuyen-khoan-sepay.md) D-249…D-252.
> **Nền:** [F-099](FEATURE-099.md) chuyển khoản bằng VietQR.

- **Status:** CONFIRMED (ADR-063).
- **Triển khai:** [TASK-123](../công-việc/TASK-123.md).
- **Actor:**
  - ACT-ADMIN: bật / tắt, xem trạng thái, giả lập.
  - ACT-STAFF: thu ngân xử lý tiền vào chưa khớp.
  - ACT-GUEST: điện thoại khách nhận "đã thanh toán".
- **Màn hình:**
  - **SCR-10 quầy:** chuông, đọc to, dải "Tiền vào chưa khớp".
  - **SCR-33 Cài đặt → Nhận chuyển khoản:** công tắc, trạng thái, giả lập.
  - **SCR-05 điện thoại khách.**
- **Dữ liệu:**
  - Migration `0062_tien_vao_ngan_hang.sql`.
  - Cài đặt `pay.auto_confirm`, `pay.auto_confirm_since`, `pay.sepay_since_id`.
  - `.env`: `SEPAY_API_TOKEN`, `SEPAY_BANK_ACCOUNT_ID` (không bắt buộc), `SEPAY_BASE_URL`.

## User Story

- **US-100-1:** Là chủ quán, tôi muốn khi khách chuyển khoản đúng số tiền thì máy tự biết và đóng bill, màn quầy báo to, để nhân viên không phải mở app ngân hàng dò từng khoản. Khoản nào lệch thì hiện riêng để xử lý. Tiền riêng vào tài khoản cá nhân của tôi thì nhân viên không thấy.

## Quy tắc

1. **Hỏi SePay.** Máy chủ quán tự hỏi SePay 5 giây một lần, chỉ khi đã bật và `.env` có khóa.
   - Lần đầu tính từ lúc bật; sau đó tính từ giao dịch cuối.
   - Mỗi giao dịch xử lý một lần.
2. **Chỉ xét khoản có mã của quán** ("CF <mã bàn> <6 ký tự mã phiên>" hoặc "CF MANG DI").
   - Tiền vào khác thì không lưu, không báo.
   - SePay có nhiều tài khoản mà không biết tài khoản nào của quán → dừng, báo chủ quán.
3. **Tự thu chuyển khoản khi đủ 4 điều kiện:**
   - mã khớp đúng một bàn đang mở;
   - số tiền đúng số phải thu;
   - bàn chưa chia bill;
   - ca đang mở.

   Người ghi là "Tự động (ngân hàng)".
4. **Không đủ điều kiện → "Tiền vào chưa khớp"** kèm lý do. Thu ngân xử lý bằng một trong hai cách:
   - **"Ghép & thu"**: số tiền phải đúng số phải thu;
   - **"Đã xử lý"**: bắt buộc ghi chú.

   Mỗi khoản chỉ xử lý được một lần.
5. **Mã bán mang đi** → chỉ báo quầy.
6. **Quầy báo tiền vào:** chuông + đọc to (khi đã bật âm thanh), chỉ máy người thu tiền.
7. **Điện thoại khách:**
   - sang màn cảm ơn khi bill đóng;
   - khung mã QR ghi "quán tự xác nhận khi tiền vào" (khi đang bật và có khóa).
8. **Giả lập tiền vào** (chủ quán): thử trước khi có SePay.

## Acceptance Criteria

### AC-100-01: Bật tự xác nhận, trạng thái, giả lập

- Chủ quán bật / tắt `autoConfirm`. Quản lý cửa hàng không đổi được (`403 OWNER_ONLY`).
- Bật → `autoConfirmSince` = lúc bật, `sepaySinceId` xóa trống.
- `GET /api/admin/bank-feed` (chỉ chủ quán) → `{ configured, enabled, lastSyncAt, lastError, unmatched, skipped }`.
- `POST /api/admin/bank-feed/simulate`: chỉ chủ quán; chưa bật → `409 AUTO_CONFIRM_OFF`.
- Mã QR của khách có `auto: true` khi đã bật và có khóa.

### AC-100-02: Tự thu khi tiền vào khớp

Tiền vào có mã của bàn, đúng số phải thu, ca đang mở:

- phiên đóng;
- lượt thu `TRANSFER`, người ghi "Tự động (ngân hàng)";
- `BankTransactions` ở trạng thái `MATCHED`, có `PaymentId`;
- quầy nhận `bank.received` (`MATCHED`), điện thoại nhận `session.settled`.

Cùng mã giao dịch gửi lại → không xử lý.

### AC-100-03: Có mã nhưng không tự thu

- Thiếu / dư / còn đơn chưa tiếp nhận / bàn đã thanh toán → `UNMATCHED` kèm `note`, bàn vẫn mở.
- "CF MANG DI" → `HANDLED`, `bank.received` có `takeaway: true`.
- Không có mã của quán → `SKIPPED`, không lưu.

### AC-100-04: Thu ngân xử lý khoản chưa khớp

- `POST /api/bank-transactions/{id}/match`:
  - đúng số → thu, người ghi là thu ngân;
  - lệch → `409 AMOUNT_MISMATCH`.
- `POST /api/bank-transactions/{id}/resolve`: cần ghi chú (≥ 3 ký tự, thiếu → `400 NOTE_REQUIRED`) → `HANDLED`.
- Khoản đã xử lý → `409 BANK_TXN_HANDLED`.
- `DELETE` trên CSDL → `HISTORY_NO_DELETE`.
- Chưa đăng nhập / khách → `401`.

### AC-100-05: Hỏi SePay (máy chủ giả trong test)

- Gửi `Authorization: Bearer <SEPAY_API_TOKEN>`, `transfer_type=in`, `bank_account_id` của tài khoản trùng số ở Cài đặt.
- Lần đầu có `transaction_date_from`, chưa có `since_id`; lần sau `since_id` = giao dịch cuối.
- Giao dịch trước lúc bật và khoản không có mã → bỏ qua.
- Không xử lý trùng.
- SePay `401` / `429` → ghi `lastError`, đợi (`429` theo `Retry-After`) rồi hỏi tiếp.

### AC-100-06: E2E

1. Chủ quán bật tự xác nhận. Khách gọi thanh toán, chọn chuyển khoản.
2. Giả lập tiền vào đúng số:
   - quầy báo "đã chuyển khoản";
   - bàn rời dải Gọi thanh toán;
   - điện thoại khách sang màn cảm ơn.
3. Khách chuyển lần hai → quầy có "Tiền vào chưa khớp", thu ngân "Đã xử lý".

## Bằng chứng

- **Integration:** `ứng-dụng/máy-chủ/tests/bank-feed.test.js` (AC-100-01…05).
- **E2E:** `kiểm-thử/e2e/flow.spec.js` "tự xác nhận chuyển khoản…" (AC-100-06).
