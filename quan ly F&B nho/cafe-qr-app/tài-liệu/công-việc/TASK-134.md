# TASK-134 — Thẻ QR bàn dạng ảnh 10 × 15 cm, thiết kế như thẻ in (F-010)

- **Status:** READY_FOR_REVIEW (24/11/2026)
- **Tài liệu:** [FEATURE-010](../chức-năng/FEATURE-010.md) (AC-010-09), US-010-2
- **Màn hình:** SCR-22 Bàn & mã QR → In (`/admin/tables/print`)
- **Nguồn:** chủ dự án 24/11/2026: ảnh một thẻ menu in giấy ("Cà phê rang xay vị tươi") kèm câu "bạn thiết kế cái này thành cái mã QR bàn thật đẹp và chuyên nghiệp ko quá bị AI hóa thành bức ảnh thôi để tôi in ra dán lên bàn cho khách quét".
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-134-the-qr-ban`, chồng lên `task/TASK-133-chuyen-khoan-qua-nhan-vien`
- **Kế hoạch / ADR:** không cần — chỉ giao diện một trang in, không đổi quy tắc, API, CSDL. Không thêm thư viện: vẽ bằng canvas, chữ Be Vietnam Pro (có sẵn) + chữ có chân của máy (Cambria / Times New Roman).

## Phạm vi

- **`js/table-card.js` (mới):** `drawTableCard()` vẽ thẻ 1200 × 1800. Lấy phong cách thẻ mẫu, không chép logo / ảnh / chữ của thẻ mẫu:
  - nền kem;
  - hạt cà phê vẽ nét;
  - khung tiêu đề viền đôi xanh rêu;
  - tên bàn cam đất;
  - QR lớn;
  - ba bước;
  - thanh toán + khung chống mã giả;
  - dải chân.
- **Tên / logo / địa chỉ quán** lấy từ Cài đặt (muốn đổi logo: Cài đặt → Thông tin quán).
- **`pages/admin-qr-print.js`:**
  - vẽ lần lượt từng bàn, có dòng "Đang vẽ thẻ QR… n/N";
  - mỗi thẻ là một `<figure>`: ảnh (chữ thay thế) + bản văn bản ẩn + "Tải ảnh";
  - đầu trang "Tải tất cả ảnh";
  - giữ "In" + ghi địa chỉ máy chủ lúc in (F-063).
- **`admin.css`:** lưới ảnh trên màn hình.
- **`css/qr-print.css` (mới, chỉ trang In QR nạp):**
  - khi in: đúng 10 × 15 cm, khổ **A4 ngang** (`@page { size: landscape }`), 2 thẻ một tờ, căn giữa;
  - đường cắt mảnh;
  - ẩn tiêu đề trang.
  - Lý do: đi luồng thật 24/11 đo PDF in bằng giao diện in. A4 dọc chỉ vừa 1 thẻ một tờ: 6 bàn ra 7 tờ (tờ đầu chỉ có tiêu đề trang). Sau lề máy in, A4 dọc còn ~19 cm, mà 2 thẻ cần 20 cm.
  - Sau khi sửa: 6 bàn ra 3 tờ; mỗi thẻ đúng 100 × 150 mm, căn giữa.

**Ngoài phạm vi:**
- đổi mã QR / đường dẫn;
- in nhiều mẫu thiết kế để chọn.

## Test

- **E2E "thẻ QR bàn dạng ảnh: …" (AC-010-09):**
  - ảnh 1200 × 1800, chữ thay thế;
  - "Tải ảnh" → tệp `the-qr-*.png`;
  - in = 10 × 15 cm;
  - in ra PDF như hộp thoại In: tờ ngang, số tờ = số bàn / 2.
- **E2E "QR Wi-Fi cho khách…":** chờ vẽ xong; ảnh thẻ 1200 px; chữ Wi-Fi ở bản văn bản.
- **E2E TASK-133 / sinh nhật:** khung `.qr-safe`, `.qr-bday` trong bản văn bản.
- **a11y "quản lý (máy tính)…":** chờ vẽ xong rồi quét `tables/print`; lưu `the-qr-ban-mau.png` cỡ thật để duyệt thiết kế.
- **Đi luồng thật** (CafeQrTest, cổng 3400, cài đặt giống quán: logo, "Nhân viên mang ra", chuyển khoản bật, không Wi-Fi). 8/8 đạt:
  - chủ quán ở 1920 px và 390 px;
  - "Tải ảnh": mã QR trong ảnh trùng từng ô (33 × 33) với địa chỉ bàn;
  - điện thoại mở địa chỉ đó vào đúng thực đơn Bàn 01;
  - PDF A4 ngang 3 tờ / 6 bàn;
  - "Tải tất cả ảnh" ra 6 tệp;
  - quản lý cửa hàng xem được;
  - nhân viên bị chặn.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
- **Triển khai:** chỉ giao diện — không cần khởi động lại.
