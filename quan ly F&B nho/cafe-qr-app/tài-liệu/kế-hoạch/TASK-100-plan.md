# TASK-100 — Kế hoạch: "+" mở bảng chọn cho mọi món (F-083, ADR-041)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Nút "+" | `t-menu.js quickAdd` — món có tùy chọn → `openItem`; không tùy chọn → `addItem` ngay | Món không tùy chọn không mở bảng chọn |
| Thẻ món | `renderControl` — món một dòng không tùy chọn hiện bước −/+ | — |
| Cài đặt | `settingsService` (`KEYS`, `getSettings`), `PUT /api/admin/settings` (`operations.js`), `admin-settings.js`; menu khách đọc `GET /api/menu` (`menuService.getPublicMenu`) | — |
| Dữ liệu test | `tests/helpers/testDb.js`, `kịch-bản/e2e-server.js` ghi cài đặt cũ | ~20 bước E2E bấm "+" món không tùy chọn và chờ vào giỏ ngay |

## Thiết kế
- Cài đặt `menu.sheet_all` (mặc định bật) → `GET /api/menu` `ui.sheetAll`; quản lý cửa hàng đổi được.
- `quickAdd`: `sheetAll() || có tùy chọn` → `openItem`; `renderControl`: bật → luôn số trong giỏ + "+".
- Dữ liệu test cũ ghi `menu.sheet_all = false` → bài cũ (kể cả "gọi món trong 3 chạm") không đổi; bài mới bật qua Cài đặt rồi tắt lại.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Luồng chuẩn thành 4 chạm (NFR-003) | Chủ quán yêu cầu; ghi NFR-003 + ADR-041 D-187; tắt cài đặt về ≤ 3 chạm |
| Đường bật (mặc định thật) ít được E2E chạy | E2E AC-083-02 + các bài F-081 / F-082 (món có tùy chọn luôn mở bảng) |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration; khởi động lại máy chủ (cài đặt + dữ liệu menu ở máy chủ).
