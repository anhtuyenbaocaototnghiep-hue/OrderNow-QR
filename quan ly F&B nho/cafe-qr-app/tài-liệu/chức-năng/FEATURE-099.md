# FEATURE-099 — Chuyển khoản bằng VietQR: mã có sẵn số tiền, nhân viên xác nhận đã nhận

> **Nguồn:** chủ dự án 17/11/2026:
> - "VỚI BẠN ĐƯA RA Ý TƯỞNG LÀM SẴN CÁI THANH TOÁN BẰNG qr CHUYỂN TIỀN LÀ BÁO REAL TIME ÁY"
> - "BẠN TÍCH HỢP VÀO THANH TOÁN ONLINE LUÔN TẠO CÁI HINH LÀM GÌ"
> - "còn cái chuyển khoản online nữa bạn làm nốt luôn đi"
>
> **Quyết định:** [ADR-062](../quyết-định/ADR-062-chuyen-khoan-vietqr.md) D-245…D-248.
>
> **Nền:** [F-005](FEATURE-005.md) gọi thanh toán, [F-006](FEATURE-006.md) thu tiền, [F-056](FEATURE-056.md) cách trả tiền mặt / chuyển khoản, [F-073](FEATURE-073.md) VietQR trả lương.

- **Status:** CONFIRMED (ADR-062) · Triển khai: [TASK-122](../công-việc/TASK-122.md)
- **Cập nhật 24/11/2026 — [ADR-069](../quyết-định/ADR-069-chuyen-khoan-qua-nhan-vien.md) D-261 ([TASK-133](../công-việc/TASK-133.md)):** chống mã QR giả dán ở bàn — **mặc định điện thoại khách không hiện mã chuyển khoản** (cài đặt "Hiện mã chuyển khoản trên điện thoại khách"); khách chọn "Chuyển khoản" → nhân viên bấm **"In bill"** ở dải Gọi thanh toán và mang bill in sẵn mã QR (ghi "Chủ tài khoản") tới bàn; thẻ bàn in "Mã này chỉ để gọi món, không dùng để trả tiền".
- **Actor:**
  - **ACT-GUEST / ACT-MEMBER:** điện thoại khách.
  - **ACT-STAFF:** thu ngân ở quầy.
  - **ACT-ADMIN:** cài đặt nhận chuyển khoản.
- **Màn hình:**
  - **SCR-05** Theo dõi đơn (gọi thanh toán, khung mã QR);
  - **SCR-10** quầy: dải Gọi thanh toán;
  - **SCR-14** hộp Thu tiền;
  - **SCR-13** Bán mang đi;
  - **SCR-12** phiếu tạm tính;
  - **SCR-33** Cài đặt → Nhận chuyển khoản.
- **Dữ liệu:**
  - cài đặt `pay.transfer_enabled`, `pay.bank_bin`, `pay.bank_number`, `pay.bank_kind`, `pay.bank_holder`;
  - migration `0061_chuyen_khoan_vietqr.sql` (`Sessions.PayMethodHint`).

## User Story

- **US-099-1:** Là khách, khi tính tiền tôi muốn quét mã QR có sẵn số tiền và nội dung để chuyển khoản nhanh, không phải hỏi số tài khoản hay gõ số tiền. Là chủ quán, tôi muốn tiền vào đúng tài khoản của quán và chỉ nhân viên mới xác nhận đã nhận.

## Quy tắc

1. **Cài đặt (chỉ chủ quán):**
   - các ô: bật / tắt (mặc định tắt), ngân hàng, loại **số tài khoản** hoặc **số thẻ**, số, tên chủ tài khoản;
   - thiếu một ô thì khách không thấy lựa chọn chuyển khoản.
2. **"Gọi thanh toán" trên điện thoại:** khách chọn "Tiền mặt" hoặc "Chuyển khoản (quét QR)". Chọn chuyển khoản thì:
   - điện thoại hiện mã VietQR có sẵn số tiền tạm tính và nội dung "CF <mã bàn> <mã phiên>";
   - có nút lưu ảnh mã, chép số tài khoản / số tiền / nội dung;
   - có câu nhắc "Nhân viên xác nhận khi tiền vào tài khoản quán".
3. **Quầy:**
   - dải Gọi thanh toán và thông báo ghi "chuyển khoản";
   - hộp Thu tiền chọn sẵn "Chuyển khoản" và hiện mã đúng số phải thu (kể cả ưu đãi, giảm tay), có nút phóng to cho khách quét;
   - Bán mang đi cũng hiện mã khi chọn chuyển khoản;
   - phiếu tạm tính in kèm mã.
4. **Ghi đã trả:**
   - chỉ do nhân viên: bấm "Đã nhận chuyển khoản & In bill" sau khi thấy tiền vào;
   - không có API nào cho khách đổi trạng thái thanh toán.
5. **Mã tạo trên máy chủ của quán**, số tài khoản không gửi ra dịch vụ ngoài.

## Acceptance Criteria

- **AC-099-08:** (ADR-069) Mặc định (`guestTransferQr` tắt), quán đã bật nhận chuyển khoản:
  - `GET /api/shop` → `transfer = { enabled: true, guestQr: false }`;
  - `GET /api/sessions/{id}/transfer` (khách trong nhóm) → `409 TRANSFER_STAFF_ONLY`;
  - khách vẫn `request-payment` với `TRANSFER` (`payMethod = TRANSFER`);
  - phiếu tạm tính của quầy có mã VietQR đúng số phải thu, `holder`, nội dung "CF <mã bàn> <mã phiên>"; `POST /api/payments/transfer-qr` vẫn chạy;
  - quản lý cửa hàng đổi công tắc → `403 OWNER_ONLY`; chủ quán bật lại → điện thoại khách lấy được mã.
- **AC-099-09:** (ADR-069, trình duyệt) Khách gọi thanh toán:
  - hộp ghi "Chuyển khoản: nhân viên mang bill có mã QR tới bàn để bạn quét", nút "Chuyển khoản" (không "quét QR");
  - chọn → báo "Nhân viên sẽ mang bill có mã QR chuyển khoản tới bàn", không mở mã; thẻ "Đã gọi thanh toán" không có nút xem mã, có dòng "Quán chỉ nhận chuyển khoản theo mã QR trên bill do nhân viên đưa…";
  - máy quầy: dải Gọi thanh toán có "In bill <bàn>" → in bill tạm tính có mã QR, "Chủ tài khoản: …", dòng "Kiểm tên người nhận…";
  - trang in thẻ bàn có khung "Mã này chỉ để gọi món, không dùng để trả tiền. Chuyển khoản theo mã QR trên bill nhân viên đưa.";
  - thẻ "Đã gọi thanh toán" đạt kiểm tra khả năng tiếp cận.

- **AC-099-01:** Chủ quán nhập đủ thông tin và bật → `GET /api/shop` có `transfer.enabled = true`.
  - Thiếu số hoặc tắt → `false`.
  - Quản lý cửa hàng đổi số tài khoản → `403 OWNER_ONLY`.
  - Ngân hàng không có trong danh sách → `400`.
- **AC-099-02:** `GET /api/sessions/{id}/transfer` (người trong nhóm của bàn) trả:
  - số tiền = số tạm tính của bàn;
  - nội dung "CF <mã bàn> <6 ký tự mã phiên>";
  - mã VietQR có CRC đúng, dịch vụ QRIBFTTA (số tài khoản) hoặc QRIBFTTC (số thẻ).

  Người ngoài nhóm không lấy được. Quán chưa bật → `409 TRANSFER_OFF`.
- **AC-099-03:** `POST /api/sessions/{id}/request-payment` với `{ method: "TRANSFER" }`:
  - quầy nhận `session.payment_requested` có `payMethod: TRANSFER`;
  - danh sách bàn ghi `payMethod`;
  - quán chưa bật → `409 TRANSFER_OFF`.

  Khách gọi `settle` → `401`. Nhân viên thu với `method: TRANSFER` → bàn đóng, lượt thu ghi chuyển khoản.
- **AC-099-04:** `POST /api/payments/transfer-qr` (thu ngân):
  - có `sessionId` → mã đúng số tiền, cùng nội dung với điện thoại khách;
  - không có `sessionId` (bán mang đi) → nội dung "CF MANG DI …";
  - chưa đăng nhập → `401`.

  Phiếu tạm tính có `transfer.qr`.
- **AC-099-05:** (E2E, điện thoại 390 px + máy quầy)
  1. Khách gọi thanh toán, chọn "Chuyển khoản" → điện thoại hiện mã QR, số tiền, nội dung.
  2. Quầy thấy "chuyển khoản" ở dải Gọi thanh toán; mở Thu tiền thì "Chuyển khoản" đã chọn và mã QR hiện.
  3. Bấm "Đã nhận chuyển khoản & In bill" → điện thoại khách sang màn cảm ơn.
- **AC-099-06:** (TASK-125, 18/11/2026) Phiếu tạm tính in từ hộp Thu tiền mang theo lựa chọn đang có ở hộp (`?bill=<JSON>`: hội viên, voucher, đổi thưởng, giảm tay, bỏ quà):
  - số phải thu và mã QR trên phiếu = xem trước thu tiền (`POST /api/sessions/{id}/settle/preview`);
  - không có `bill` → như cũ;
  - `bill` sai → `400 VALIDATION_ERROR`;
  - tài khoản / mật khẩu duyệt trong `bill` không có tác dụng.
- **AC-099-07:** (TASK-125, E2E, DEF-032) Hộp Thu tiền chọn "Chuyển khoản":
  - khung mã ghi số tiền, "ngân hàng · số", nội dung — mỗi thứ một dòng, không dính chữ;
  - "In bill có mã QR" → in phiếu tạm tính có mã VietQR đúng số tiền của hộp.

## Bằng chứng

- **Integration:** `ứng-dụng/máy-chủ/tests/transfer-qr.test.js` (AC-099-01…04, AC-099-06, AC-099-08).
- **E2E:** `kiểm-thử/e2e/flow.spec.js` "chuyển khoản bằng mã QR…" (AC-099-05), "in bill có mã QR…" (AC-099-07), "chuyển khoản qua nhân viên (mặc định)…" (AC-099-09).
- **a11y:** quét khung mã QR trên điện thoại.
