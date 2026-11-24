# ADR-069 — Chuyển khoản qua nhân viên: mã chuyển khoản chỉ trên bill in và máy quầy (mặc định)

- **Trạng thái:** ACCEPTED (24/11/2026).
- **Chủ dự án duyệt:**
  1. Hỏi cách phân biệt QR thật / QR giả khi kẻ gian dán mã giả giống web của quán.
  2. Claude đề xuất kiểm tên người nhận và kiểm mã mỗi sáng → chủ dự án: "ko khả thi lắm quá rủi ro có cách khác ko".
  3. Claude đề xuất: mã QR ở bàn không bao giờ dùng để trả tiền; nhân viên mang bill in sẵn mã QR.
  4. Chủ dự án: "bạn làm thêm cái in hóa đơn có QR ngân hàng để chuyển tiền với làm thêm chỗ thay thế QR chuyển khoản nữa nha".
- **Thay một phần:** [ADR-062](ADR-062-chuyen-khoan-vietqr.md) D-247 — điện thoại khách tự xem mã VietQR của bàn. Nay là **tùy chọn, mặc định tắt**. D-245 (tài khoản của quán), D-246 (khách chọn cách trả), D-248 (đã trả do nhân viên / SePay ghi) giữ nguyên. Quay về đúng tinh thần D-2 (khách gọi thanh toán, nhân viên thu tại bàn).
- **Bối cảnh:**
  - Mã QR bàn chỉ là một đường link. Kẻ gian dán mã giả trỏ tới trang giống hệt trang của quán, rồi trang giả hiện mã chuyển khoản vào tài khoản của kẻ gian.
  - Khách không phân biệt được trang thật / giả, nhất là khi web chạy ở địa chỉ IP trong quán (`http://10.x.x.x`).
  - Bắt khách dò tên người nhận hay nhân viên quét mã mỗi sáng thì dễ quên, chủ quán thấy không chắc chắn.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-261 | **Mã chuyển khoản không hiện trên điện thoại khách; nhân viên mang bill in sẵn mã QR tới bàn.**<ul><li>**Cài đặt mới** "Hiện mã chuyển khoản trên điện thoại khách" (`pay.guest_qr`). **Mặc định tắt**, chỉ chủ quán đổi được.</li><li>**Khi tắt:**<ul><li>khách vẫn bấm "Gọi thanh toán" và chọn **Tiền mặt / Chuyển khoản**, để quầy biết cách khách muốn trả;</li><li>hộp gọi thanh toán ghi "Chuyển khoản: nhân viên mang bill có mã QR tới bàn để bạn quét";</li><li>chọn xong báo "Nhân viên sẽ mang bill có mã QR chuyển khoản tới bàn";</li><li>thẻ "Đã gọi thanh toán" không có nút xem mã, có dòng nhắc "Quán chỉ nhận chuyển khoản theo mã QR trên bill do nhân viên đưa — không chuyển theo trang nào khác";</li><li>máy chủ không gửi mã cho điện thoại khách: `GET /api/sessions/{id}/transfer` → `409 TRANSFER_STAFF_ONLY`. `/api/shop` báo `transfer.guestQr = false`.</li></ul></li><li>**In bill có mã QR:**<ul><li>dải "Gọi thanh toán" ở máy quầy có nút **"In bill"** cạnh mỗi bàn, in phiếu tạm tính có mã VietQR đúng số tiền + nội dung của bàn;</li><li>nút ở chân hộp Thu tiền đổi tên "In tạm tính" → **"In bill"**;</li><li>bill in ghi **"Chủ tài khoản: …"** và dòng "Kiểm tên người nhận trong app ngân hàng trùng tên trên trước khi chuyển".</li></ul></li><li>**Thẻ bàn in ra** (Bàn & mã QR → In) có khung **"Mã này chỉ để gọi món, không dùng để trả tiền."** Khi quán nhận chuyển khoản, thêm "Chuyển khoản theo mã QR trên bill nhân viên đưa".</li><li>**Bật lại công tắc** → điện thoại khách xem mã như ADR-062; thẻ bàn bỏ khung nhắc.</li><li>**Đổi tài khoản nhận tiền** (mã chuyển khoản trỏ tới đâu) vẫn ở Cài đặt → Nhận chuyển khoản như cũ. Mã trên bill và máy quầy đổi theo ngay.</li></ul> |

## Phương án đã cân nhắc

- **Khách dò tên người nhận + nhân viên quét kiểm mã bàn mỗi sáng:** phụ thuộc người nhớ làm, chủ dự án thấy "quá rủi ro". Bỏ: làm thành quy trình bắt buộc qua nhân viên.
- **Mã QR động trên màn hình nhỏ ở mỗi bàn / thẻ NFC:** tốn tiền thiết bị, vẫn dán đè được. Bỏ.
- **Gọi món qua Zalo Mini App của Zalo OA đã xác thực:** chống giả tốt nhất nhưng là việc tích hợp lớn. Để sau (khi cho thuê / nhiều quán).
- **Tự in bill mỗi khi khách gọi thanh toán chuyển khoản:** dễ in thừa (khách gọi lại, còn đơn chưa tiếp nhận). Bỏ: một nút "In bill" ngay ở dải.

## Hệ quả

- **Mã nguồn:**
  - `settingsService` (`guestTransferQr`, `/api/shop` `transfer.guestQr`), `routes/operations.js` (khóa cài đặt);
  - `sessionService.transferForCustomer` (`409 TRANSFER_STAFF_ONLY`);
  - `pages/t-track.js` (hộp gọi thanh toán, thẻ "Đã gọi thanh toán");
  - `pages/pos-dashboard.js` (nút "In bill" ở dải, chân hộp Thu tiền);
  - `pages/pos-receipt.js` (Chủ tài khoản + dòng kiểm tên);
  - `pages/admin-settings.js` (công tắc), `pages/admin-qr-print.js` (khung trên thẻ bàn);
  - CSS `.pay-safe`, `.pay-item`, `.qr-safe`.
- **Dữ liệu:** khóa cài đặt `pay.guest_qr` (không migration — bảng Settings dạng khóa / giá trị).
- **Vận hành:** **phải khởi động lại máy chủ.** Sau cập nhật, điện thoại khách không còn thấy mã (mặc định tắt). Nên in lại thẻ bàn để có khung nhắc.
- **Tài liệu:** FEATURE-099 (quy tắc, AC-099-08, AC-099-09), BR-128, US-099-1, api-contract, data-model, screens-flows, tc-map, `.agent/rules.md`.
- **Test:**
  - `transfer-qr.test.js` AC-099-08;
  - E2E "chuyển khoản qua nhân viên (mặc định)…" (AC-099-09);
  - a11y `khach-cho-chuyen-khoan-qua-nhan-vien`;
  - các bài cũ thử mã trên điện thoại khách bật `guestTransferQr`.
