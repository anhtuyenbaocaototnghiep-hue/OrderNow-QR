# Tự xác nhận chuyển khoản (SePay)

> **Dành cho chủ quán.** Khách chuyển khoản đúng số tiền và nội dung → bill tự đóng, màn quầy kêu và đọc to. Không cần nhân viên mở app ngân hàng dò từng khoản.
>
> **Liên quan:** [FEATURE-100](../chức-năng/FEATURE-100.md), [ADR-063](../quyết-định/ADR-063-tu-xac-nhan-chuyen-khoan-sepay.md). Cần làm xong [chuyển khoản bằng VietQR](../chức-năng/FEATURE-099.md) trước (Cài đặt → Nhận chuyển khoản).

## Cách hoạt động

1. Khách gọi thanh toán, chọn "Chuyển khoản". Mã QR có sẵn số tiền và nội dung riêng của bàn, ví dụ `CF 05 A1B2C3`.
2. Ngân hàng báo tiền vào cho SePay. Máy chủ của quán hỏi SePay 5 giây một lần.
3. **Đúng mã của bàn + đúng số tiền** → bill tự đóng, điện thoại khách hiện "Đã thanh toán". Máy quầy kêu chuông và đọc "Bàn 05 đã chuyển khoản … đồng".
4. **Lệch** (thiếu / dư, bàn chưa tiếp nhận đơn, khách chuyển hai lần…) → khoản tiền hiện ở dải **"Tiền vào chưa khớp"**. Thu ngân bấm vào để chọn một trong hai cách:
   - "Ghép & thu" vào bàn đúng số tiền;
   - "Đã xử lý" kèm ghi chú.
5. **Tiền vào không có mã của quán** (lương, người nhà chuyển…) → máy bỏ qua: không lưu, không hiện ở quầy. Nhân viên không thấy tiền riêng của bạn.

## Cài đặt (làm một lần)

1. **Đăng ký SePay** ở [my.sepay.vn](https://my.sepay.vn) rồi **liên kết tài khoản ngân hàng nhận tiền** (tài khoản đã khai ở Cài đặt → Chuyển khoản) theo hướng dẫn kết nối ngân hàng của SePay ([docs.sepay.vn](https://docs.sepay.vn)).
2. **Nên dùng số tài khoản** ở Quản lý → Cài đặt → Nhận chuyển khoản. Số trùng với tài khoản đã liên kết trong SePay thì máy tự nhận ra tài khoản cần theo dõi.
   - Số thẻ vẫn chạy được khi SePay chỉ liên kết một tài khoản.
   - Nhưng vài app ngân hàng không chuyển được tới số thẻ.
3. **Tạo khóa API:** my.sepay.vn → **Cấu hình Công ty → API Access → "+ Thêm API"** → chép khóa vừa tạo.
4. **Dán khóa vào file `.env`** trong thư mục app, thêm một dòng:

   ```
   SEPAY_API_TOKEN=<khóa vừa chép>
   ```

   - **Không** gửi khóa qua Zalo / email / chat, kể cả cho người hỗ trợ: khóa xem được mọi giao dịch của tài khoản.
   - SePay có **nhiều** tài khoản liên kết mà không tài khoản nào trùng số ở Cài đặt → thêm `SEPAY_BANK_ACCOUNT_ID=<mã tài khoản trong SePay>`.
5. **Khởi động lại app** bằng nút khởi động trên màn hình.
6. **Bật tự xác nhận:** Quản lý → Cài đặt → Nhận chuyển khoản → tích **"Tự xác nhận khi tiền vào (SePay)"** → Lưu cài đặt. Dòng trạng thái phải báo "Đang theo dõi tiền vào".
7. **Thử thật:**
   1. Mở một bàn, gọi một món rẻ.
   2. Gọi thanh toán, chọn chuyển khoản.
   3. Chuyển đúng số tiền bằng app ngân hàng.
   4. Trong vài giây, màn quầy phải báo "đã chuyển khoản" và bàn tự đóng.

**Thử khi chưa có SePay:** sau khi bật tự xác nhận, bấm **"Giả lập tiền vào"** ở Cài đặt. Nhập số tiền và nội dung dưới mã QR của khách, máy chạy y như tiền vào thật.

## Khi có trục trặc

| Dòng trạng thái ở Cài đặt | Làm gì |
| --- | --- |
| "Chưa có khóa SePay trong .env" | Làm bước 3–5 |
| "Khóa SePay không đúng hoặc đã bị thu hồi (401)" | Tạo khóa mới ở API Access, sửa `.env`, khởi động lại |
| "SePay có nhiều tài khoản…" | Thêm `SEPAY_BANK_ACCOUNT_ID` vào `.env` (bước 4) |
| "SePay không trả lời (mạng chậm / mất mạng)" | Kiểm tra Internet của máy chủ; máy tự hỏi lại. Trong lúc đó nhân viên xác nhận tay như trước |
| "SePay báo hỏi quá nhanh (429)" | Máy tự đợi rồi hỏi tiếp; không cần làm gì |

**Tắt:** bỏ tích "Tự xác nhận khi tiền vào" → nhân viên bấm "Đã nhận chuyển khoản" như trước. Mã QR vẫn dùng bình thường.

**Nghi lộ khóa:** xóa khóa ở API Access, tạo khóa mới, sửa `.env`, khởi động lại. Xem [sổ bí mật](secrets-register.md) S-12.
