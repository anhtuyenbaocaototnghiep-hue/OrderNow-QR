# TASK-085 — Kế hoạch: thu thập ngày sinh hội viên (F-068), ADR-026

## Khảo sát (tên thật)
| Thứ | Ở đâu |
| --- | --- |
| Đăng ký hội viên | `POST /api/members` (`routes/public.js`) → `memberService.register` → `membersRepo.create`; form ở `member-box.js` (khách) và `billing-controls.js` `lookup()` (quầy) |
| Ngày sinh | `Members.BirthDate` DATE; `BirthDateSelfAt` (0044); đọc ở `membersRepo.map`, `birthdayRepo.membersWithBirthDate`; ghi ở `membersRepo.update` (quản lý), `birthdayRepo.setSelfBirthDate` (khách) |
| Luật quà | `domain/birthday.js` (`birthdayIn`, `currentWindow`, `selfDateCounts`), `birthdayService.statusFor` |
| Quầy | `GET /api/members/{id}/loyalty` (`routes/loyalty.js`) → `loyaltyService.summary`; khung ở `billing-controls.js` (`birthdaySlot`) |
| Quản lý | `admin-members.js` (`VIEWS`, `VIEW_SQL` ở `membersRepo`), `admin-loyalty.js` `renderBirthday()`, `admin-qr-print.js` |

## Thiết kế
- `domain/birthday.js`: `parseBirthDate`, `toDbBirthDate` / `fromDbBirthDate` (năm 1904), `birthdayIn` đọc ngày / tháng từ 5 ký tự cuối (chạy với cả hai dạng), `staffShouldAsk` (365 ngày).
- Repository đổi dạng ở cửa vào / ra; service chỉ thấy `YYYY-MM-DD` / `--MM-DD`.
- `zBirthDate()` ở `middleware/validate.js`; kiểm chi tiết ở service (một câu báo lỗi).
- `ui.js`: `birthDateInput()` (chọn ngày, chọn tháng, ô năm) + `birthLabel()`; dùng ở 5 chỗ.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Đổi dạng ngày sinh làm sai quà sinh nhật / bộ lọc tháng | `MONTH()` / `DAY()` trong SQL không đổi; `birthdayIn` dùng 5 ký tự cuối; test F-067 cũ phải xanh + test mới cho ngày sinh không năm |
| Khách khai ngày sinh lúc đăng ký để lấy quà ngay | Đăng ký / nhân viên ghi hộ = tự khai (30 ngày) |
| Nhân viên bị nhắc mãi một khách đã từ chối | `BirthDateDeclinedAt`, nhắc lại sau 365 ngày |
| Hai người cùng ghi ngày sinh | `UPDATE … WHERE BirthDate IS NULL` — người sau nhận 409 |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).
