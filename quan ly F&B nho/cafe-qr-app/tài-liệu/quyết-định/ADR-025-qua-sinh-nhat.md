# ADR-025 — Quà sinh nhật hội viên

- **Trạng thái:** ACCEPTED (03/11/2026). Chủ dự án chọn ý "Sinh nhật hội viên" trong danh sách ý tưởng: "làm thêm cái này rồi ghi thành file skill.md".
- **Bối cảnh:** app đã lưu `Members.BirthDate` (quản lý nhập ở hồ sơ hội viên) và có bộ lọc "Sinh nhật tháng này" (TASK-082), nhưng chưa dùng ngày sinh vào việc gì. Quán nhỏ muốn khách quen nhớ quán bằng một món quà nhỏ đúng dịp, không phải nhớ tay ai sinh nhật hôm nay.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-95 | **Tuần sinh nhật:** từ `birthday.window_days` (mặc định 3) ngày trước tới 3 ngày sau ngày sinh năm nay, theo giờ quán (tổng 7 ngày). Sinh 29/02 → năm không nhuận tính 28/02. Cửa sổ có thể vắt qua năm (sinh 01/01 → từ 29/12 năm trước). |
| D-96 | **Quà = voucher nguồn `BIRTHDAY` gắn hội viên, mỗi năm một lần** (bảng `BirthdayGifts`, khóa `MemberId + năm`). Tạo khi hội viên xuất hiện trong tuần sinh nhật (quầy tra cứu / gắn vào bàn, điện thoại khách xem ô hội viên, tính tiền) — không cần job chạy nền; hạn tới hết tuần sinh nhật. Ba loại: **giảm %** (có trần, mặc định 20% tối đa 50.000đ), **giảm số tiền**, **tặng 1 món** (`Vouchers.MenuItemId`; số giảm = giá món đó trên bill lúc thu). |
| D-97 | **Tự áp khi thu tiền:** hội viên có quà chưa dùng, lượt thu chưa chọn voucher khác → máy chủ tự áp quà vào bill (xem trước và lúc thu cùng một luật). Quà tặng món chỉ áp khi bill có món đó. Nhân viên bấm "Không dùng quà lần này" → gửi `skipBirthday`, quà giữ tới hết hạn. Một lượt thu vẫn chỉ một voucher (F-038). |
| D-98 | **Thấy ở đâu:** quầy (khung Hội viên của Thu tiền bàn / Bán mang đi) có dải "Sinh nhật khách" + trạng thái quà; điện thoại khách (ô hội viên, Thẻ thành viên) hiện lời chúc + quà, **không có mã**; hóa đơn ghi dòng "Quà sinh nhật". |
| D-99 | **Chống lạm dụng:** chỉ hội viên đang hoạt động, chưa ẩn danh, có ngày sinh. Khách **tự thêm** ngày sinh ở Thẻ thành viên được một lần (khi còn trống); ngày sinh tự thêm chỉ tính quà khi đã thêm **từ 30 ngày trước** ngày sinh nhật — tránh "hôm nay sinh nhật" để lấy quà. Quản lý sửa ngày sinh ở hồ sơ = đã xác minh (bỏ điều kiện 30 ngày). Nhân viên quầy không sửa được ngày sinh. |
| D-100 | **Bật / tắt:** mặc định **tắt** (quà là chi phí thật). Quản lý bật, chọn loại quà và số ngày ở **Khách hàng → Tích điểm & voucher → Quà sinh nhật**; trang này có danh sách sinh nhật 14 ngày tới và số quà đã tặng / đã dùng trong năm. |

## Không chọn

- **Job hằng ngày phát voucher cho mọi hội viên sắp sinh nhật:** phát cả cho người không ghé, voucher chết; phải có job + chống chạy trùng. Phát lúc khách xuất hiện là đủ và tự nhiên.
- **Giảm giá tay "sinh nhật" do nhân viên bấm:** không giới hạn một lần / năm, không đếm được, dễ lạm dụng.
- **Gửi lời chúc qua Zalo / SMS:** chưa có kênh gửi (F-037 chỉ xuất CSV); để sau.
- **Cho khách sửa ngày sinh nhiều lần:** mở đường đổi ngày để lấy quà nhiều lần trong năm.

## Hệ quả

- Migration `0044`: `Members.BirthDateSelfAt`; `Vouchers.MenuItemId` + nguồn `BIRTHDAY`; bảng `BirthdayGifts`.
- API: `GET / PUT /api/admin/birthday`; `POST /api/sessions/{id}/member/birthday` (khách tự thêm ngày sinh); `loyalty.birthday` trong thông tin hội viên; trường `skipBirthday` khi xem trước / thu tiền; `totals.birthdayApplied`.
- Feature: [FEATURE-067](../chức-năng/FEATURE-067.md). Task: [TASK-084](../công-việc/TASK-084.md). BR-104.
- Trang Chính sách dữ liệu (F-062) ghi thêm ngày sinh: không bắt buộc, dùng để tặng quà sinh nhật.
