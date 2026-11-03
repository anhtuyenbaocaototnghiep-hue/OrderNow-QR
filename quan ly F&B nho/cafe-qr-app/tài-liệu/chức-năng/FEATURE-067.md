# FEATURE-067 — Quà sinh nhật hội viên

> **Nguồn:** chủ dự án 03/11/2026. Quyết định: [ADR-025](../quyết-định/ADR-025-qua-sinh-nhat.md) D-95…D-100.

- **Status:** CONFIRMED (ADR-025) · Triển khai: [TASK-084](../công-việc/TASK-084.md)
- **Actor:** **ACT-MEMBER** (nhận lời chúc + quà, tự thêm ngày sinh một lần); **ACT-STAFF / ACT-LEAD** (thấy dải "Sinh nhật khách", quà tự áp khi thu tiền, có thể không dùng lần này); **ACT-ADMIN** (bật / tắt, chọn quà, xem sinh nhật sắp tới).
- **Màn hình:**
  - **Quầy → Thu tiền bàn / Bán mang đi** (S-13, S-14): dải "Sinh nhật khách — 12/11 (hôm nay)" + trạng thái quà, nút "Không dùng quà lần này" / "Dùng quà".
  - **Khách → ô hội viên** (S-03, S-05) + **Thẻ thành viên**: lời chúc, quà và hạn; ô "Thêm ngày sinh" khi chưa có.
  - **Hóa đơn** (S-12): dòng "Quà sinh nhật".
  - **Quản lý → Khách hàng → Tích điểm & voucher → Quà sinh nhật** (S-40): bật / tắt, loại quà, số ngày, sinh nhật 14 ngày tới, số quà năm nay.
- **Dữ liệu:** `BirthdayGifts`, `Vouchers.Source = 'BIRTHDAY'`, `Vouchers.MenuItemId`, `Members.BirthDateSelfAt`, khóa cài đặt `birthday.*`.

## User Story

- **US-067-1:** Là hội viên, tôi muốn được quán chúc mừng và tặng quà trong tuần sinh nhật mà không phải tự nhắc, để thấy mình được quán nhớ tới.
- **US-067-2:** Là chủ quán, tôi muốn chọn quà sinh nhật và biết ai sắp sinh nhật, quà đã tặng / đã dùng, để chăm khách quen mà kiểm soát được chi phí.

## Quy tắc (BR-104)

1. Tuần sinh nhật = ngày sinh năm nay ± `birthday.window_days` (3) ngày, giờ quán; 29/02 → 28/02 năm không nhuận; vắt qua năm được.
2. Tính năng bật + hội viên đang hoạt động, chưa ẩn danh, có ngày sinh, đang trong tuần sinh nhật, năm đó chưa có quà → tạo **một** voucher `BIRTHDAY` gắn hội viên, hạn hết tuần sinh nhật. Hai yêu cầu cùng lúc không tạo hai quà.
3. Ngày sinh khách tự thêm (`BirthDateSelfAt`) chỉ tính khi thêm trước ngày sinh nhật ≥ 30 ngày; quản lý sửa ngày sinh → bỏ dấu tự thêm.
4. Quà: `PERCENT` (1–50%, trần `birthday.max_discount`), `AMOUNT` (≥ 1.000đ), `FREE_ITEM` (một món đang bán; số giảm = đơn giá món đó trên bill, bill không có món → không áp).
5. Thu tiền có hội viên, chưa chọn voucher, không gửi `skipBirthday` → tự áp quà còn dùng được. Một lượt thu một voucher.
6. Khách chỉ thấy lời chúc + giá trị quà + hạn, không thấy mã.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/admin/birthday` · `PUT …` | ADMIN | Cài đặt `{ enabled, kind, value, maxDiscount, menuItemId, windowDays }`; `GET` kèm `upcoming` (14 ngày tới) và `stats` năm nay |
| `POST /api/sessions/{id}/member/birthday` | Thiết bị trong phiên / nhân viên | `{ birthDate }` — chỉ khi hội viên của phiên chưa có ngày sinh; đã có → `409 BIRTHDATE_SET` |
| `GET /api/members/{id}/loyalty`, thông tin hội viên của phiên, Thẻ thành viên | như cũ | Thêm `birthday: { inWindow, date, offset, status: READY \| USED \| EXPIRED \| WAITING \| OFF, gift } \| null` (khách: không có `gift.code`) |
| Xem trước / thu tiền (bàn, chia bill, mang đi) | Nhân viên | Body thêm `skipBirthday`; `totals.birthdayApplied` |

## Acceptance Criteria

- AC-067-01: (unit) tuần sinh nhật đúng với 29/02, vắt qua năm, ngoài cửa sổ; điều kiện 30 ngày với ngày sinh tự thêm.
- AC-067-02: Bật + hội viên trong tuần sinh nhật → quầy thấy `birthday.status = READY` kèm mã; gọi lại không tạo quà thứ hai, kể cả hai yêu cầu cùng lúc; tắt → `OFF`, không có quà; ngoài tuần → `birthday: null`.
- AC-067-03: Thu tiền bàn có hội viên → quà tự áp (giảm đúng %, có trần), voucher thành đã dùng, hóa đơn ghi "Quà sinh nhật"; lần sau cùng năm → `USED`, không quà mới; `skipBirthday` → không áp, quà vẫn còn; chọn voucher khác → dùng voucher đó.
- AC-067-04: Quà tặng món: bill chưa có món → không áp, không lỗi; có món → giảm đúng đơn giá món.
- AC-067-05: Điện thoại khách thấy lời chúc + quà, không có mã; khách tự thêm ngày sinh một lần (lần 2 → 409); tự thêm sát ngày → `WAITING`, không quà; quản lý sửa ngày sinh → có quà.
- AC-067-06: Cài đặt: giá trị hợp lệ lưu được, sai (% ngoài 1–50, tặng món chưa chọn món) → 400; nhân viên → 403; `upcoming` liệt kê hội viên sinh nhật 14 ngày tới kèm trạng thái quà.
- AC-067-07: Trên trình duyệt: quản lý bật ở tab Quà sinh nhật; quầy gắn hội viên đang sinh nhật → dải "Sinh nhật khách", tổng đã trừ quà; điện thoại khách thấy lời chúc; thu xong hóa đơn có dòng "Quà sinh nhật".

## Bằng chứng

`tests/birthday.test.js` (AC-067-01…06) · E2E "quà sinh nhật…" (AC-067-07).
