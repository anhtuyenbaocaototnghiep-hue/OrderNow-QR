# ADR-026 — Thu thập ngày sinh hội viên

- **Trạng thái:** ACCEPTED (04/11/2026). Chủ dự án dán lại danh sách "Cách lấy ngày sinh" (hỏi lúc đăng ký, năm không bắt buộc, nhân viên hỏi khi gắn số, bảng trên bàn, hỏi dần hội viên cũ): "tiến hành làm".
- **Bối cảnh:** quà sinh nhật (ADR-025) chỉ chạy khi hồ sơ có ngày sinh. Trước đây chỉ có hai đường: quản lý sửa hồ sơ, khách tự thêm trong Thẻ thành viên. Form đăng ký (khách / quầy) không hỏi ngày sinh, ô ngày bắt buộc có năm, quầy không biết khách nào còn thiếu.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-101 | **Hỏi lúc đăng ký:** form đăng ký hội viên trên điện thoại khách và ô "Đăng ký nhanh" ở quầy có ô **"Ngày sinh (để quán tặng quà)" không bắt buộc**, chỉ hiện khi quà sinh nhật đang bật (tra cứu số chưa là hội viên trả `askBirthDate`). Câu đồng ý lưu thông tin ghi thêm "ngày sinh (nếu có)". |
| D-102 | **Năm sinh không bắt buộc:** ô ngày sinh dùng chung (đăng ký, Thẻ thành viên, quầy, hồ sơ hội viên) gồm chọn ngày, chọn tháng, gõ năm (để trống được). API nhận / trả `birthDate` dạng `YYYY-MM-DD` hoặc `--MM-DD` (ISO 8601, không năm). CSDL lưu ngày sinh không năm với **năm 1904** (năm nhuận để 29/02 hợp lệ); chỉ tầng repository biết quy ước này. Năm hợp lệ từ 1910 tới năm nay, ngày không sau hôm nay. |
| D-103 | **Mọi ngày sinh không do quản lý nhập đều là "tự khai"** (`BirthDateSelfAt` = lúc ghi): nhập lúc đăng ký, khách tự thêm, nhân viên quầy ghi hộ → áp điều kiện 30 ngày của D-99. Quản lý lưu hồ sơ ở trang Hội viên vẫn là đã xác minh. |
| D-104 | **Quầy nhắc hỏi:** hội viên gắn vào lượt thu chưa có ngày sinh, quà sinh nhật đang bật → khung Hội viên hiện "Chưa có ngày sinh" + câu mẫu *"Anh/chị cho em xin ngày sinh để quán tặng quà tuần sinh nhật nhé?"* + ô ngày sinh + **Lưu** + **Khách không muốn cho**. Nhân viên chỉ **thêm khi còn trống** (sửa vẫn chỉ quản lý — giữ D-99). "Khách không muốn cho" ghi `Members.BirthDateDeclinedAt`; quầy không nhắc lại khách đó trong **365 ngày**; Thẻ thành viên của khách vẫn mời tự thêm. |
| D-105 | **Bảng trên bàn:** thẻ QR in ở Quản lý → Bàn → In QR có thêm dòng *"Hội viên: thêm ngày sinh trong Thẻ thành viên — quán tặng quà tuần sinh nhật"* khi quà sinh nhật đang bật. |
| D-106 | **Hội viên cũ:** tab Quà sinh nhật có khối **"Thu thập ngày sinh"**: đã có ngày sinh X / Y hội viên (%), riêng khách ghé 30 ngày qua A / B, cách lấy ngày sinh (câu mẫu cho nhân viên, in lại QR), nút tới trang Hội viên lọc **"Chưa có ngày sinh"** (khách ghé gần đây trước — người sắp quay lại được hỏi trước). |

## Không chọn

- **Bắt buộc ngày sinh khi đăng ký:** khách ngại, bỏ đăng ký; trái nguyên tắc chỉ thu thông tin cần thiết (F-062).
- **Cột riêng ngày / tháng / năm:** đổi mọi chỗ đọc `BirthDate` (bộ lọc tháng, chiến dịch, quà sinh nhật); năm quy ước 1904 đủ dùng và gói trong repository.
- **Nhân viên quầy sửa ngày sinh đã có:** mở đường đổi ngày để lấy quà; sai thì quản lý sửa.
- **Tặng điểm / voucher để đổi lấy ngày sinh:** khuyến khích khai bừa; quà sinh nhật đã là lý do đủ.
- **Nhắc mãi mỗi lần khách ghé:** khách đã từ chối mà bị hỏi lại mỗi lần sẽ khó chịu — nhắc lại sau một năm.

## Hệ quả

- Migration `0045`: `Members.BirthDateDeclinedAt`.
- API: `birthDate` dạng `--MM-DD` ở mọi chỗ nhận / trả ngày sinh; `POST /api/members` nhận `birthDate`; tra cứu trả `askBirthDate`; `POST /api/members/{id}/birth-date`, `POST /api/members/{id}/birth-date/decline` (nhân viên); `loyalty.askBirthDate` cho quầy; `GET /api/admin/birthday` thêm `coverage`; `GET /api/admin/members?view=nobirth`.
- Feature: [FEATURE-068](../chức-năng/FEATURE-068.md). Task: [TASK-085](../công-việc/TASK-085.md). BR-105. Cập nhật một phần D-99 (nhân viên được **thêm** ngày sinh khi còn trống).
