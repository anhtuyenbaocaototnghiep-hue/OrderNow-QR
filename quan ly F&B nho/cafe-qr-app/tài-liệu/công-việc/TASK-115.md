# TASK-115 — Giao diện màn khách theo giờ và theo mùa (F-094)
Status: READY_FOR_REVIEW (16/11/2026)
Feature: [FEATURE-094](../chức-năng/FEATURE-094.md) · ADR: [ADR-056](../quyết-định/ADR-056-giao-dien-khach-theo-gio-va-mua.md) (D-231, D-232, D-233) · AC-094-01…04 · US-094-1 · UC-01 · MOD-ORDER · SCR-01, SCR-02, SCR-03, SCR-05, SCR-33
Nguồn: chủ dự án 16/11/2026 — "cái dạo này có thể làm sáng tối theo thời gian được không, giống như vào buổi tối giao diện sẽ khác buổi sáng giao diện khác, và theo mùa xuân hạ thu đông" (kèm ảnh màn chào) → đồng ý phương án: "ok tiến hành làm". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-115-giao-dien-theo-gio-va-mua` chồng lên `task/TASK-114-man-khach-chi-dien-thoai` · Kế hoạch: [TASK-115-plan](../kế-hoạch/TASK-115-plan.md)

## Phạm vi
- `js/guest-theme.js` (script sớm trong `<head>` ba trang khách): giờ / mùa Việt Nam → `data-daypart`, `data-theme`, `data-season`; nhớ cài đặt ở máy; đọc `/api/shop`; tự đổi khi đang mở.
- CSS: bảng màu tối cho trang khách, quầng nắng / chấm sao, 4 mùa cho khung giới thiệu; `--c-on-primary`.
- Màn chào: hình theo mùa, lời chào đổi theo giờ.
- Cài đặt `guestDaypartTheme`, `guestSeasonDecor` (mặc định bật) + `/api/shop` `guestTheme`.
- Ngoài phạm vi: giờ mặt trời thật, lịch âm, đổi màu theo mùa ngoài khung giới thiệu, màn quầy / Quản lý.

## Test
- Integration mới `guest-theme.test.js` (AC-094-01); `basic-mode.test.js` theo hợp đồng `/api/shop` mới.
- E2E mới "giao diện khách theo giờ…" (AC-094-02), "trang trí theo mùa…" (AC-094-03); a11y mới "khách giao diện tối…" (AC-094-04).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`
