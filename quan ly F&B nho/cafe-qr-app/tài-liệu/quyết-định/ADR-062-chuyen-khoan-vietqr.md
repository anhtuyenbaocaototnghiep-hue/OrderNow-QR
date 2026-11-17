# ADR-062 — Khách chuyển khoản bằng VietQR (mã có sẵn số tiền), nhân viên xác nhận đã nhận

- **Trạng thái:** ACCEPTED (17/11/2026).
- **Chủ dự án duyệt qua các lời nhắn:**
  1. "VỚI BẠN ĐƯA RA Ý TƯỞNG LÀM SẴN CÁI THANH TOÁN BẰNG qr CHUYỂN TIỀN LÀ BÁO REAL TIME ÁY" — Claude đề xuất phương án.
  2. "BẠN CÓ THỂ TẠO VIETQR GIÚP MÌNH KHÔNG" — tạo ảnh VietQR rời cho quán.
  3. "BẠN TÍCH HỢP VÀO THANH TOÁN ONLINE LUÔN TẠO CÁI HINH LÀM GÌ".
  4. "còn cái chuyển khoản online nữa bạn làm nốt luôn đi".
- **Nới / bổ sung:**
  - [ADR-000](ADR-000-thanh-toan-tien-mat.md) D-1/D-2/D-3: chỉ tiền mặt; khách gọi thanh toán, nhân viên thu tại bàn; khách không tự đánh dấu đã trả.
  - [ADR-019](ADR-019-chuyen-khoan-gop-tach-hoa-don.md): nhân viên ghi "chuyển khoản" ở lượt thu.
- **Bối cảnh:** quán đã nhận chuyển khoản (ADR-019), nhưng khách phải hỏi số tài khoản, tự gõ số tiền và nội dung. Nhân viên khó biết khoản tiền nào của bàn nào. Chủ dự án muốn tích hợp sẵn trong app thay cho tấm ảnh QR in rời.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-245 | **Cài đặt "Nhận chuyển khoản (VietQR)", chỉ chủ quán sửa.** Gồm các ô: bật / tắt (mặc định tắt); ngân hàng (danh sách VietQR của app); loại **số tài khoản** hoặc **số thẻ** (NAPAS QRIBFTTA / QRIBFTTC); số; tên chủ tài khoản. Chỉ hiện mã khi đủ cả 4 thông tin và đang bật. Quản lý cửa hàng không sửa được (`403 OWNER_ONLY`). |
| D-246 | **Khách chọn cách trả khi gọi thanh toán:** "Tiền mặt" hoặc "Chuyển khoản (quét QR)". Lựa chọn lưu ở phiên (`Sessions.PayMethodHint`) và **chỉ là gợi ý cho quầy**: dải "Gọi thanh toán" và thông báo ghi "chuyển khoản", hộp Thu tiền chọn sẵn "Chuyển khoản". Quán chưa bật mà khách chọn chuyển khoản → `409 TRANSFER_OFF`. |
| D-247 | **Mã VietQR có sẵn số tiền và nội dung riêng của bàn:** "CF <mã bàn> <6 ký tự đầu mã phiên>" (không dấu, tối đa 25 ký tự). Thu từng phần thêm " P<n>"; bán mang đi dùng "CF MANG DI <giờ>". Mã tạo ngay trên máy chủ của quán, số tài khoản không gửi ra dịch vụ ngoài. Mã hiện ở ba nơi: (1) **điện thoại khách**, với số tiền tạm tính như lúc gọi thanh toán; (2) **hộp Thu tiền ở quầy** khi chọn "Chuyển khoản", với số phải thu đã tính (kể cả ưu đãi, giảm tay); (3) **phiếu tạm tính** in kèm mã. |
| D-248 | **Đã trả chỉ do nhân viên ghi:** nhân viên xem tiền đã vào app ngân hàng rồi bấm "Đã nhận chuyển khoản & In bill", như ADR-019. Không có API nào cho khách đổi trạng thái thanh toán. Ảnh chụp màn hình "đã chuyển" không có tác dụng. Số trên điện thoại khác số quầy thu (vì ưu đãi / giảm giá áp ở quầy) thì nhân viên xử lý phần chênh như thu tiền thường. Tự xác nhận khi tiền vào (dịch vụ báo biến động số dư như SePay, Casso) để giai đoạn sau, có ADR riêng khi chủ quán đăng ký dịch vụ. |

## Phương án đã cân nhắc

- **Ảnh VietQR in rời, khách tự nhập số tiền:** đã làm theo yêu cầu "TẠO VIETQR". Chủ dự án chọn tích hợp vào app vì ảnh rời không có số tiền và nội dung, khó đối chiếu.
- **Khách tự bấm "Tôi đã chuyển" để đóng bàn:** bỏ. Vì đây là D-3, ảnh / thao tác giả rất dễ, phải có người xác nhận tiền đã vào.
- **Cổng thanh toán (VNPay, MoMo…):** cần hợp đồng doanh nghiệp và tốn phí, nằm ngoài phạm vi một quán nhỏ. VietQR chuyển thẳng vào tài khoản quán, miễn phí.

## Hệ quả

- **Mã nguồn:**
  - `domain/vietqr.js` (`toCard`);
  - `services/transferService.js` (mới), `settingsService` (cài đặt, `transferReady`), `sessionService` (`requestPayment(method)`, `transferForCustomer`, phiếu tạm tính);
  - routes: `public.js` (`GET /api/sessions/{id}/transfer`, `request-payment` nhận `method`), `staff.js` (`POST /api/payments/transfer-qr`), `operations.js` (cài đặt);
  - giao diện: Cài đặt (khối "Nhận chuyển khoản"), Theo dõi đơn của khách (chọn cách trả, khung mã QR), hộp Thu tiền + dải Gọi thanh toán ở quầy, Bán mang đi, phiếu tạm tính.
- **CSDL:** migration `0061_chuyen_khoan_vietqr.sql` (`Sessions.PayMethodHint`); `sp_RequestPayment` thêm tham số `@Method`.
- **Quy tắc:** BR-128 mới; `.agent/rules.md` ghi ngoại lệ D-1/D-2/D-3 theo ADR này (đã trả vẫn chỉ do nhân viên ghi).
- **Test:** `transfer-qr.test.js` (AC-099-01…04), E2E "chuyển khoản bằng mã QR…" (AC-099-05), a11y khung mã QR.
