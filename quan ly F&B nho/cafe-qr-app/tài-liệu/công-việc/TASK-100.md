# TASK-100 — "+" mở bảng chọn cho mọi món (F-083)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-041](../quyết-định/ADR-041-cong-mo-bang-chon-moi-mon.md) D-185…D-187 · Feature: [FEATURE-083](../chức-năng/FEATURE-083.md) (US-083-1, AC-083-01, 02) · BR-121 · NFR-003 (ghi chú thay đổi)
Module: MOD-MENU, MOD-ORDER · Màn hình: SCR-02 (Menu), SCR-57 (Bảng chọn món), SCR-33 (Cài đặt)
Nguồn: chủ dự án 07/11/2026 (kèm ảnh nút "+") "khi click vào nó sẽ hiện tất cả để người dùng thao tác một lần luôn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-100-cong-mo-bang-chon` chồng lên `task/TASK-099-gon-gio-hang` (chưa gộp `main`) · Kế hoạch: [TASK-100-plan.md](../kế-hoạch/TASK-100-plan.md)

## Mục tiêu
Bấm "+" ở bất kỳ món nào khách cũng thấy ngay bảng chọn (tùy chọn nếu có, ghi chú, số lượng) — chọn một lần là xong.

## Phạm vi
1. Máy chủ: cài đặt `menu.sheet_all` (`settingsService.menuSheetAll`, mặc định bật), `PUT /api/admin/settings` thêm `menuSheetAll`, `STORE_MGR_SETTINGS`, `GET /api/menu` thêm `ui.sheetAll`; dữ liệu test cũ ghi `false`.
2. Giao diện: `t-menu.js` (`sheetAll()`, `quickAdd`, `renderControl`), `admin-settings.js` (thẻ "Màn gọi món của khách").
3. Test integration + E2E; tài liệu (ADR-041, FEATURE-083, BR-121, NFR-003, F-081, ADR-039 D-179, UAT-52); mở rộng skill `bang-chon-mon`.

## Không được sửa
Máy quầy; luật giá; bảng chọn / giỏ của F-081, F-082.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration; khởi động lại máy chủ thử nghiệm.

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **467/467 PASS** (54 file; thêm AC-083-01 trong `item-sheet.test.js`) |
| `npm run test:e2e` | **76/76 PASS** (3,6 phút; thêm E2E AC-083-02 "+" Nước suối mở bảng chọn, đặt số lượng 2, gửi đơn) |
| `npm run trace -- --check` | **182 US, 497 AC — PASS 497, FAIL 0, NOT_RUN 0, GAP 0** |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
