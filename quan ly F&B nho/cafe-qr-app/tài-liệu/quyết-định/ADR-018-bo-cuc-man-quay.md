# ADR-018 — Bố cục màn quầy "Đơn hàng": đơn cần làm + lưới bàn

- **Trạng thái:** ACCEPTED (23/10/2026). Chủ dự án gửi ảnh màn quầy và yêu cầu "sắp xếp lại bố cục cho rõ ràng, đẹp mắt, dễ thao tác sử dụng và chuyên nghiệp"; chọn phương án "Đơn cần làm + lưới bàn" và "dùng như nhau trên máy tính và máy tính bảng".
- **Bối cảnh** (ảnh chủ dự án gửi, màn 1900 px):
  - Thanh trên chật: 6 mục điều hướng + 6 nút trạng thái (ca, QR, kết nối, âm thanh, tên, đăng xuất) cùng một hàng, xuống dòng tùy độ rộng.
  - "Chưa mở ca" hiện hai lần (nút đỏ trên thanh + dải dưới).
  - Cột "Mới" / "Đang pha" là hộp thấp nhiều khoảng trống; cột "Đã xong hôm nay" kéo dài cả trang dù ít cần thao tác; phiếu đã xong vẫn hiện "123 giờ 17 phút".
  - Khung "Bàn đang phục vụ" hẹp (300 px), mỗi bàn 4 nút xếp hai hàng; không thấy bàn trống.
  - Các dải gọi thanh toán / gọi nhân viên / đánh giá thấp là băng màu kéo hết chiều ngang, mỗi loại một kiểu.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-67 | **Ba vùng theo mức cần thao tác.** <br>• **Thanh trên** gọn: tên quán + điều hướng (có biểu tượng) bên trái; cụm trạng thái (ca, QR, kết nối, âm thanh) và người dùng bên phải, cùng cỡ, cùng kiểu. <br>• **Dải "Cần xử lý ngay"**: chưa mở ca, mất kết nối, đơn trễ, gọi thanh toán, gọi nhân viên, đánh giá thấp — cùng một kiểu thẻ, xếp chồng ngay dưới thanh trên, chỉ hiện khi có việc. <br>• **Vùng chính:** trái là **đơn cần làm** (2 cột Mới, Đang pha, cao hết màn hình); phải là **lưới bàn**; "Đã xong hôm nay" thu thành dải gọn dưới hai cột đơn. |
| D-68 | **Phiếu đơn dễ đọc từ xa, nút to.** Tên bàn lớn, mã đơn nhỏ; thời gian chờ đổi màu theo độ lâu (từ 8 phút: vàng, từ 15 phút: đỏ — đề xuất, đổi được sau); nút Tiếp nhận / Hoàn tất cỡ chạm ≥ 44 px trải ngang phiếu. Phiếu đã xong rút gọn một dòng (bàn · mã · tổng · đã / chưa thu · giờ xong), không hiện thời gian chờ. |
| D-69 | **Lưới bàn thay danh sách.** Mọi bàn đang dùng, mỗi bàn một thẻ: tên bàn, trạng thái bằng **màu + chữ** (Trống · Đang phục vụ · Có đơn chờ tiếp nhận · Gọi thanh toán), số tiền tạm tính, số đơn, giờ mở. Nút chính trên thẻ: **Gọi món** và **Thu tiền** (bàn trống: Gọi món); nút phụ dạng biểu tượng có tên (Ghi chú, Chuyển bàn, Đóng bàn trống). Bàn có nhiều nhóm (bill riêng) → mỗi nhóm một thẻ. Đầu khung: tổng số bàn theo trạng thái + nút **Gọi món**, **Mang đi**. |
| D-70 | **Co giãn.** ≥ 1200 px: ba vùng cạnh nhau. 760–1199 px (máy tính bảng ngang): hai cột đơn; lưới bàn thành **ngăn trượt** bên phải mở bằng nút "Bàn" (có số bàn đang phục vụ / gọi thanh toán). < 760 px: một cột. Vùng chạm ≥ 44 px ở mọi cỡ. |

Chủ dự án **không chọn**:
- giữ ba cột như cũ rồi làm gọn;
- sơ đồ bàn làm màn chính.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Lưới cần cả bàn trống | Màn Đơn hàng đọc thêm `GET /api/tables` (đã có — F-024: mọi bàn đang bật) khi tải đầy đủ; nhóm vẫn đọc từ `GET /api/sessions?status=OPEN,PAYMENT_REQUESTED` như cũ. Nhóm ở bàn không có trong danh sách (bàn vừa bị tắt khi còn khách) vẫn hiện thẻ ở cuối lưới | Không thêm API; `PUT /api/admin/tables/:id` tắt được bàn đang có khách — nếu chỉ đọc `/api/tables` thì yêu cầu thanh toán của bàn đó sẽ mất khỏi màn quầy |
| Thanh trên vừa một hàng hay hai hàng | `pos-shell.js` đo: nội dung tràn thì thêm lớp `stacked` (điều hướng xuống hàng hai); đo lại khi đổi bề ngang và khi chữ nút ca / QR / âm thanh đổi | Tên quán, tên người dùng, số mục điều hướng (trưởng ca, quản lý thêm mục) khác nhau nên không chọn được một mốc cỡ màn cố định |
| Giữ hành vi và bằng chứng test | Giữ nguyên mã nhận diện đang dùng: `#col-PENDING / PREPARING / COMPLETED .ticket`, `#tables .table-row` (thẻ nhóm; thẻ bàn trống không có lớp này), `#pay-strip`, `#call-strip`, `#review-strip`, `#no-shift`, `#store-btn`, `#shift-btn`, `#conn`, `#queue-eta`, tên nút "Thu tiền", "Chuyển bàn <bàn>", "Sửa ghi chú" | Test E2E hiện có tiếp tục chứng minh nghiệp vụ; chỉ đổi trình bày |
| Đồng bộ giao diện "Mộc" | Dùng token `--c-*`, phông, biểu tượng `icon()` của TASK-065 / 066; không thêm thư viện | Một hệ thiết kế |
| Ngăn trượt lưới bàn | Nút có `aria-expanded`, Esc / nút Đóng / bấm nền mờ để đóng, focus vào ngăn khi mở và trả về nút khi đóng | Dùng được bằng bàn phím và cảm ứng |

## Hệ quả

- Chỉ đổi giao diện màn quầy (`pos/index.html`, `css/pos.css`, `js/pos-shell.js`, `js/pages/pos-dashboard.js`, `js/icons.js` thêm vài biểu tượng). Không đổi API, nghiệp vụ, dữ liệu.
- Task: [TASK-072](../công-việc/TASK-072.md). Ảnh chuẩn màn quầy chụp lại.
