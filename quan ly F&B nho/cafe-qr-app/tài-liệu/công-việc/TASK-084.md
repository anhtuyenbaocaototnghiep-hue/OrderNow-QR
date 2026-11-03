# TASK-084 — Quà sinh nhật hội viên
Status: READY_FOR_REVIEW (03/11/2026)
Quyết định: [ADR-025](../quyết-định/ADR-025-qua-sinh-nhat.md) D-95…D-100 · Feature: [FEATURE-067](../chức-năng/FEATURE-067.md) · BR-104
Module: MOD-LOYALTY, MOD-BILLING · Màn hình: SCR-14 / SCR-13 (khung Hội viên ở Thu tiền bàn / Bán mang đi), SCR-03 / SCR-05 (ô hội viên của khách, Thẻ thành viên), SCR-12 (hóa đơn), SCR-40 (Tích điểm & voucher), SCR-48 (Chính sách dữ liệu)
Nguồn: chủ dự án 03/11/2026 — chọn ý "Sinh nhật hội viên": "làm thêm cái này rồi ghi thành file skill.md". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-084-qua-sinh-nhat` chồng lên `task/TASK-083-vong-quay-hen-gio-ra-mon` (chưa gộp `main`) · Kế hoạch: [TASK-084-plan.md](../kế-hoạch/TASK-084-plan.md)

## Mục tiêu
Khách quen được quán nhớ sinh nhật: quầy thấy ngay "Sinh nhật khách", điện thoại khách có lời chúc, quà tự trừ khi thanh toán — mỗi năm một lần, chủ quán chọn quà và thấy ai sắp sinh nhật.

## Phạm vi
1. Migration 0044 (`Members.BirthDateSelfAt`, `Vouchers.MenuItemId` + nguồn `BIRTHDAY`, bảng `BirthdayGifts`).
2. Máy chủ: `domain/birthday.js`, `birthdayRepo`, `birthdayService`; `loyaltyService` (trạng thái sinh nhật, tự áp quà, voucher tặng món), `billingService` (`skipBirthday`, `birthdayApplied`), nhãn "Quà sinh nhật" ở bảng tính tiền và hóa đơn; route `GET / PUT /api/admin/birthday`, `POST /api/sessions/{id}/member/birthday`.
3. Giao diện: dải sinh nhật ở khung thu tiền; lời chúc + "Thêm ngày sinh" ở ô hội viên / Thẻ thành viên; tab "Quà sinh nhật"; nhãn nguồn voucher; trang Chính sách dữ liệu.
4. Test integration (6) + E2E (1) + quét a11y tab mới; tài liệu; skill `qua-sinh-nhat-hoi-vien`.

## Không được sửa
Quy tắc voucher (một lần, một voucher / lượt thu, đúng chủ), `sp_Loyalty`, quyền sửa ngày sinh của quản lý, luồng tích điểm.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (03/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **398/398 PASS** (38 file; thêm `birthday.test.js` 6 test — AC-067-01…06; mọi test voucher / thu tiền cũ vẫn xanh) |
| `npm run test:e2e` | **61/61 PASS** (58 luồng + 3 khả năng tiếp cận; thêm 1 E2E — AC-067-07; a11y quét thêm tab Quà sinh nhật ở 320 / 390 px) |
| `npm run trace -- --check` | 151 US, 411 AC — PASS 411, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0044 đã áp (chỉ thêm); quà sinh nhật **đang tắt** — chủ quán bật ở Tích điểm & voucher → Quà sinh nhật |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Quầy, ô hội viên, Thẻ thành viên, tab quản lý đọc được, 390 px không cuộn ngang. Đã sửa theo ảnh: dòng "Bạn có N voucher — báo nhân viên" không đếm quà sinh nhật (quà tự trừ); nút "Lưu ngày sinh" không xuống dòng |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
