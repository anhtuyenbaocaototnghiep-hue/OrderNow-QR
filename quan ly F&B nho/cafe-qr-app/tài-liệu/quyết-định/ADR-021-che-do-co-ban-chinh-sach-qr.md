# ADR-021 — Chế độ cơ bản, hướng dẫn quầy, trang chính sách dữ liệu, cảnh báo QR sai địa chỉ

- **Trạng thái:** ACCEPTED (29/10/2026). Chủ dự án chọn 4 việc từ góp ý xây dựng ("Chế độ cơ bản … hướng dẫn 5 bước … Gộp nhánh … Câu đồng ý lưu SĐT + nút xóa hội viên … Cảnh báo QR đã sai địa chỉ … tiến hành làm"). Việc gộp nhánh: [TASK-076](../công-việc/TASK-076.md).
- **Bối cảnh:**
  - Menu quản lý có 26 trang trong 6 nhóm — quán nhỏ mới dùng dễ ngợp; nhân viên mới không biết bắt đầu từ đâu ở màn quầy.
  - Khi khảo sát lại code: **câu đồng ý lưu SĐT và "Ẩn danh theo yêu cầu" đã có từ F-014 / F-037** (server từ chối `CONSENT_REQUIRED`, lưu `Members.ConsentAt`; quản lý ẩn danh hội viên, NĐ 13/2023). Góp ý trước đó nói "chưa có" là **sai** (chỉ tìm ở trang khách, sót `member-box.js`). Phần còn thiếu thật: câu đồng ý nói "có thể yêu cầu xóa" nhưng **không có chỗ nào cho khách đọc** quán lưu gì, để làm gì, xin xóa thế nào.
  - QR bàn = địa chỉ máy chủ + mã bàn. Laptop đổi mạng là IP đổi → QR đã in trỏ địa chỉ cũ → cả quán không gọi được món, không ai biết vì sao (đã gặp 27/10: QR trỏ `localhost`).

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-79 | **Chế độ cơ bản = ẩn mục khỏi menu, không tắt chức năng.** 5 nhóm nâng cao bật / tắt riêng ở Cài đặt (khóa `ui.modules`, danh sách): `inventory` Kho hàng (Nguyên liệu, Nhập kho & kiểm kê, Nhà cung cấp + mục "Kho & sơ chế" ở màn quầy), `customers` Khách hàng (Hội viên, Tích điểm & voucher, Khuyến mãi, Gợi ý & ghim, Đánh giá món), `finance` Sổ quỹ & nhân sự (Sổ quỹ, Nhân sự & chấm công), `analytics` Phân tích & lãi lỗ, `advanced` Công cụ nâng cao (Lịch thực đơn, Nhật ký thao tác, Tra cứu API). Luôn hiện: Hôm nay, Báo cáo, Món / Tùy chọn / Combo, Ca & hoàn tiền, Cảnh báo, Bàn & QR, Tài khoản, Cài đặt. Quán **mới** (chưa lưu `ui.modules`) = cơ bản; CSDL **đã có đơn** lúc nâng cấp → migration bật đủ 5 nhóm (không ai tự dưng mất menu); dữ liệu mẫu (`--demo`, E2E) bật đủ. Mở thẳng đường dẫn trang đang ẩn vẫn dùng được, có dải nhắc bật lại. Quyền và API **không đổi**. |
| D-80 | **Hướng dẫn 5 bước ở màn quầy** cho tài khoản chưa xem (cột mới `Users.TourSeenAt`): Mở ca → Đơn mới (Tiếp nhận) → Đang pha (Hoàn tất) → Bàn & thu tiền → Đóng ca. Lớp phủ khoanh đúng chỗ trên màn thật, Tiếp / Quay lại / Bỏ qua, Esc đóng. Xong hoặc bỏ qua → lưu theo **tài khoản** (đổi máy không hiện lại). Nút **"Hướng dẫn"** trên thanh quầy xem lại bất cứ lúc nào. Tài khoản có sẵn lúc nâng cấp và tài khoản do lệnh cài đặt tạo coi như đã xem. |
| D-81 | **Trang công khai `/chinh-sach-du-lieu`** (SCR-48): tên quán (Cài đặt), dữ liệu lưu, mục đích, ai xem, lưu bao lâu, quyền của khách (xem / sửa / từ chối nhận tin / xóa = ẩn danh), cách yêu cầu (báo nhân viên hoặc quản lý; quản lý bấm "Ẩn danh theo yêu cầu"), căn cứ NĐ 13/2023/NĐ-CP. Link ngay ở câu đồng ý phía khách và 2 hộp đăng ký hội viên ở quầy. **Không** làm khách tự xóa qua mạng (không xác minh được chủ số điện thoại). |
| D-82 | **Cảnh báo QR sai địa chỉ.** Quản lý bấm **In** (hoặc Ctrl+P) ở trang In mã QR → lưu địa chỉ đang in + giờ (`qr.printed_base_url`, `qr.printed_at`). Địa chỉ app đang chạy (`PUBLIC_BASE_URL`) khác địa chỉ lúc in → dải đỏ trên mọi trang quản lý và màn quầy. Địa chỉ là `localhost` / `127.0.0.1` → cảnh báo "điện thoại không quét được" **chỉ ở trang In mã QR và Bàn & mã QR** (chạy thử trên máy không bị nhắc ở mọi trang) + máy chủ in cảnh báo lúc khởi động. Chưa in lần nào → không báo lệch. Thêm (review G3): `PUBLIC_BASE_URL` là IPv4 mà máy chủ không còn giữ (so với card mạng hiện tại) → cảnh báo kèm IP hiện tại — trường hợp `.env` ghi cứng IP rồi laptop đổi mạng. Bấm In / Ctrl+P tính là đã in (trình duyệt không cho biết bấm Hủy). |

## Không chọn

- Tắt hẳn chức năng của nhóm ẩn (chặn API, bỏ ô hội viên phía khách…): đổi nghiệp vụ, dễ lỗi dữ liệu; ẩn menu là đủ cho mục tiêu "đỡ ngợp".
- Lưu "đã xem hướng dẫn" trong trình duyệt: đổi máy / xóa lịch sử là hiện lại; nhân viên dùng chung máy quầy với tài khoản khác nhau.
- Tự đổi QR theo IP / tên miền động: cần router hoặc dịch vụ ngoài; cảnh báo + hướng dẫn đặt IP cố định là đủ cho quán một máy (ADR-016).

## Hệ quả

- Migration **0041**: `Users.TourSeenAt DATETIME2(0) NULL` (tài khoản có sẵn = đã xem); bật đủ `ui.modules` cho CSDL đã có đơn. Chỉ thêm.
- Settings mới: `ui.modules`, `qr.printed_base_url`, `qr.printed_at`. API mới: `POST /api/auth/tour-seen`, `GET /api/qr-check`, `POST /api/admin/qr-printed`; `GET /api/auth/me` thêm `modules`, `user.tourSeenAt`.
- Trang mới SCR-48 `/chinh-sach-du-lieu`.
- Feature: [FEATURE-061](../chức-năng/FEATURE-061.md), [FEATURE-062](../chức-năng/FEATURE-062.md), [FEATURE-063](../chức-năng/FEATURE-063.md) · Task: [TASK-077](../công-việc/TASK-077.md) · BR-096…BR-099.
