# FEATURE-068 — Thu thập ngày sinh hội viên

> **Nguồn:** chủ dự án 04/11/2026. Quyết định: [ADR-026](../quyết-định/ADR-026-thu-thap-ngay-sinh.md) D-101…D-106.

- **Status:** CONFIRMED (ADR-026) · Triển khai: [TASK-085](../công-việc/TASK-085.md)
- **Actor:** **ACT-MEMBER** (ghi ngày sinh lúc đăng ký hoặc trong Thẻ thành viên, năm không bắt buộc); **ACT-STAFF / ACT-LEAD** (ghi ngày sinh lúc đăng ký nhanh, được nhắc hỏi khách quen còn thiếu); **ACT-ADMIN** (xem đã có bao nhiêu ngày sinh, ai còn thiếu, sửa ngày sinh không năm).
- **Màn hình:**
  - **Khách → ô hội viên → Đăng ký** (S-03, S-05) và **Thẻ thành viên**: ô ngày sinh (ngày, tháng, năm không bắt buộc).
  - **Quầy → Thu tiền bàn / Bán mang đi** (S-13, S-14): ô ngày sinh trong "Đăng ký nhanh"; dòng nhắc "Chưa có ngày sinh" + câu mẫu, Lưu / Khách không muốn cho.
  - **Quản lý → Hội viên** (S-26): bộ lọc "Chưa có ngày sinh"; sửa ngày sinh không năm.
  - **Quản lý → Tích điểm & voucher → Quà sinh nhật** (S-40): khối "Thu thập ngày sinh".
  - **Quản lý → Bàn → In QR** (S-22): dòng mời thêm ngày sinh trên thẻ.
- **Dữ liệu:** `Members.BirthDate` (năm 1904 = không rõ năm), `Members.BirthDateSelfAt`, `Members.BirthDateDeclinedAt`.

## User Story

- **US-068-1:** Là nhân viên hoặc khách, tôi muốn ghi ngày sinh ngay lúc đăng ký hoặc khi khách ghé, năm sinh không bắt buộc, để khách quen nhận được quà sinh nhật.
- **US-068-2:** Là chủ quán, tôi muốn biết bao nhiêu hội viên đã có ngày sinh và ai còn thiếu, để nhắc nhân viên hỏi dần.

## Quy tắc (BR-105)

1. Ngày sinh `YYYY-MM-DD` (năm 1910…năm nay, không sau hôm nay) hoặc `--MM-DD` (không năm; 29/02 hợp lệ). CSDL lưu không năm bằng năm 1904.
2. Ô ngày sinh ở form đăng ký chỉ hiện khi quà sinh nhật bật; không bắt buộc. Ngày sinh sai → 400, không tạo hội viên.
3. Ngày sinh ghi lúc đăng ký, khách tự thêm, nhân viên ghi hộ = tự khai (điều kiện 30 ngày, BR-104). Quản lý lưu hồ sơ = đã xác minh.
4. Quầy nhắc khi hội viên chưa có ngày sinh, tính năng bật, chưa có "khách không muốn cho" trong 365 ngày. Nhân viên chỉ thêm khi còn trống; đã có → 409.
5. Thẻ QR in có dòng mời thêm ngày sinh khi tính năng bật.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/members/lookup` | như cũ | Không tìm thấy → thêm `askBirthDate` (quà sinh nhật đang bật) |
| `POST /api/members` | như cũ | Body thêm `birthDate` (`YYYY-MM-DD` \| `--MM-DD` \| null) |
| `POST /api/members/{id}/birth-date` | Nhân viên | `{ birthDate }` → thông tin điểm / quà của hội viên (như `GET …/loyalty`); đã có ngày sinh → `409 BIRTHDATE_SET` |
| `POST /api/members/{id}/birth-date/decline` | Nhân viên | Ghi "khách không muốn cho" → thông tin điểm / quà (`askBirthDate: false`) |
| `GET /api/members/{id}/loyalty` | Nhân viên | Thêm `askBirthDate` |
| `GET /api/admin/members?view=nobirth` | ADMIN | Hội viên chưa có ngày sinh, ghé gần đây trước; mỗi dòng có `birthDateDeclinedAt`; tổng quan thêm `noBirthDate` |
| `GET /api/admin/birthday` | ADMIN | Thêm `coverage: { total, withBirthDate, recentTotal, recentWithBirthDate }` |
| `PUT /api/admin/members/{id}`, `POST /api/sessions/{id}/member/birthday` | như cũ | `birthDate` nhận thêm `--MM-DD` |

## Acceptance Criteria

- AC-068-01: (unit) đọc ngày sinh: `YYYY-MM-DD` và `--MM-DD` hợp lệ; 29/02 không năm hợp lệ, 29/02/2023, 31/04, ngày mai, năm trước 1910 → sai; đổi qua lại dạng lưu CSDL (năm 1904); tuần sinh nhật đúng với ngày sinh không năm; quầy hỏi lại sau 365 ngày kể từ "khách không muốn cho".
- AC-068-02: Tra cứu số chưa là hội viên trả `askBirthDate` theo bật / tắt; đăng ký (khách tự đăng ký và quầy) kèm ngày sinh có năm hoặc không năm → lưu, là tự khai (sát ngày → `WAITING`); không gửi ngày sinh → đăng ký bình thường; ngày sinh sai → 400, không tạo hội viên.
- AC-068-03: Quầy: `loyalty.askBirthDate` khi hội viên chưa có ngày sinh và tính năng bật; nhân viên thêm ngày sinh → lưu tự khai, hết nhắc; đã có ngày sinh → 409; "Khách không muốn cho" → hết nhắc ở quầy, Thẻ thành viên của khách vẫn mời; chưa đăng nhập → 401.
- AC-068-04: Quản lý: lưu / đọc ngày sinh không năm (`--MM-DD`) ở hồ sơ, quà sinh nhật áp đúng cho ngày sinh không năm; bộ lọc "Chưa có ngày sinh" (ghé gần đây trước, có số đếm); tab Quà sinh nhật trả `coverage`.
- AC-068-05: Trên trình duyệt: đăng ký nhanh ở quầy có ô ngày sinh (để trống năm); gắn hội viên chưa có ngày sinh → dòng nhắc kèm câu mẫu, Lưu → hết nhắc; hội viên khác "Khách không muốn cho" → hết nhắc; khách tự đăng ký trên điện thoại có ô ngày sinh; tab Quà sinh nhật hiện "Thu thập ngày sinh" và mở được danh sách "Chưa có ngày sinh"; thẻ QR in có dòng mời thêm ngày sinh.

## Bằng chứng

`tests/birthdate-collect.test.js` (AC-068-01…04) · E2E "thu thập ngày sinh…" (AC-068-05).
