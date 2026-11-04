# TASK-085 — Thu thập ngày sinh hội viên
Status: READY_FOR_REVIEW (04/11/2026)
Quyết định: [ADR-026](../quyết-định/ADR-026-thu-thap-ngay-sinh.md) D-101…D-106 · Feature: [FEATURE-068](../chức-năng/FEATURE-068.md) · BR-105
Module: MOD-LOYALTY · Màn hình: SCR-03 / SCR-05 (đăng ký hội viên, Thẻ thành viên), SCR-13 / SCR-14 (khung Hội viên ở quầy), SCR-26 (Hội viên), SCR-40 (Tích điểm & voucher), SCR-22 (In QR), SCR-48 (Chính sách dữ liệu)
Nguồn: chủ dự án 04/11/2026 — dán danh sách "Cách lấy ngày sinh": "tiến hành làm khi làm xog tiến hành đưa thêm ý tưởng". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-085-thu-thap-ngay-sinh` chồng lên `task/TASK-084-qua-sinh-nhat` (chưa gộp `main`) · Kế hoạch: [TASK-085-plan.md](../kế-hoạch/TASK-085-plan.md)

## Mục tiêu
Quán có ngày sinh của nhiều khách quen hơn để quà sinh nhật (F-067) chạy được: hỏi lúc đăng ký, năm không bắt buộc, quầy nhắc hỏi khách còn thiếu, thẻ QR trên bàn mời khách tự thêm, chủ quán thấy đã có bao nhiêu và ai còn thiếu.

## Phạm vi
1. Migration 0045 (`Members.BirthDateDeclinedAt`).
2. Máy chủ: đọc / kiểm / đổi dạng ngày sinh không năm (`domain/birthday.js`, repository); đăng ký nhận `birthDate`; tra cứu trả `askBirthDate`; nhân viên thêm ngày sinh / ghi "khách không muốn cho"; `loyalty.askBirthDate`; bộ lọc `nobirth`; `coverage` ở tab Quà sinh nhật.
3. Giao diện: ô ngày sinh dùng chung (ngày, tháng, năm không bắt buộc) ở đăng ký khách / quầy, Thẻ thành viên, hồ sơ hội viên; dòng nhắc ở quầy; khối "Thu thập ngày sinh"; bộ lọc "Chưa có ngày sinh"; dòng trên thẻ QR in; câu đồng ý + Chính sách dữ liệu.
4. Test integration + E2E; tài liệu; skill `thu-thap-ngay-sinh`.

## Không được sửa
Luật quà sinh nhật (BR-104: tuần sinh nhật, một quà / năm, 30 ngày, tự áp), quyền sửa ngày sinh của quản lý, luồng đăng ký hội viên khi không có ngày sinh.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Kết quả thực chạy (04/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **402/402 PASS** (39 file; thêm `birthdate-collect.test.js` 4 test — AC-068-01…04; `members.test.js` cập nhật kết quả tra cứu có `askBirthDate`; mọi test F-067 vẫn xanh) |
| `npm run test:e2e` | **62/62 PASS** (59 luồng + 3 khả năng tiếp cận; thêm 1 E2E — AC-068-05) |
| `npm run trace -- --check` | 153 US, 416 AC — PASS 416, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0045 đã áp (chỉ thêm cột `BirthDateDeclinedAt`) |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Đăng ký khách, Thẻ thành viên, khung quầy, tab Quà sinh nhật, Hội viên "Chưa có ngày sinh", hồ sơ, thẻ QR: không cuộn ngang ở 390 px. Đã sửa theo ảnh: ô "Ngày" bị cắt chữ ở khung quầy và "Tháng 11" bị cắt trong hồ sơ (đổi tỉ lệ cột, ô ngày sinh chiếm cả hàng trong hồ sơ); các khung trong tab Quà sinh nhật dính nhau; câu "danh sách dưới đây" sai chỗ |

Chưa có review G3 độc lập; chưa gộp `main`, chưa đẩy GitHub — chờ chủ dự án.
