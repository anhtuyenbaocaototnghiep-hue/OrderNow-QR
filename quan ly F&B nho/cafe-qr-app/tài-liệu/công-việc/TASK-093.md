# TASK-093 — Quy trình 1 chạm ở màn Đơn hàng (F-076)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-034](../quyết-định/ADR-034-quy-trinh-1-cham.md) D-153…D-155 · Feature: [FEATURE-076](../chức-năng/FEATURE-076.md) (US-076-1, AC-076-01…03) · BR-114
Module: MOD-ORDER, MOD-INVENTORY · Màn hình: SCR-10 (Đơn hàng), SCR-33 (Cài đặt)
Nguồn: chủ dự án 07/11/2026 "mình có thể tinh chỉnh gọn lại dc không bỏ mục đang pha đi để nhân viên đỡ thao tác"; agent đề xuất "quy trình 1 chạm"; chủ dự án: "tiến hành làm những cái tôi vừa nhắn". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-093-quy-trinh-1-cham` chồng lên `task/TASK-092-han-dung-nguyen-lieu` (chưa gộp `main`) · Kế hoạch: [TASK-093-plan.md](../kế-hoạch/TASK-093-plan.md)

## Mục tiêu
Nhân viên quầy bấm một lần "Xong" cho mỗi đơn (thay vì Tiếp nhận rồi Hoàn tất), không còn đơn bị bỏ quên ở cột "Đang pha" nên kho trừ đúng và khách được báo kịp; thời gian chờ báo khách vẫn tính đúng.

## Phạm vi
1. Máy chủ: cài đặt `pos.one_tap` (`settingsService`, `PUT /api/admin/settings` thêm `oneTap`), `/api/auth/me` thêm `pos.oneTap`; `etaRepo.recomputePrepStats` tính thời gian làm của đơn "nhận + xong" < 10 giây từ max(lúc sẵn sàng, lúc đơn trước xong).
2. Giao diện: `pos-dashboard.js` (gộp cột "Cần làm", nút "Xong" trên phiếu và trong hộp chi tiết), `pos.css` (lưới phiếu), `admin-settings.js` (thẻ "Màn Đơn hàng ở quầy"), `auth.js` (`current.pos`).
3. Dữ liệu test cũ giữ 3 cột (`pos.one_tap = false` trong `tests/helpers/testDb.js`, `kịch-bản/e2e-server.js`).
4. Test integration + E2E; tài liệu; skill `quy-trinh-1-cham`.

## Không được sửa
Luồng trạng thái ở máy chủ (PENDING → PREPARING → COMPLETED), trừ kho ở `sp_CompleteOrder`, báo khách, luật hủy món (F-046), quyền. Không migration.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **444/444 PASS** (48 file; thêm `one-tap.test.js` 2 test — AC-076-01, 02) |
| `npm run test:e2e` | **69/69 PASS** (thêm E2E "quy trình 1 chạm…" — AC-076-03; E2E cũ của màn Đơn hàng 3 cột vẫn qua) |
| `npm run trace -- --check` | 172 US, 467 AC — PASS 467, GAP 0 |
| Chụp màn hình 1366 / 390 px (CafeQrTest) | Cột "Cần làm" xếp lưới 3 phiếu / hàng ở 1366 px, 1 phiếu / hàng ở 390 px, nút "Xong" lớn; thẻ Cài đặt "Màn Đơn hàng ở quầy" — không cuộn ngang |
| `npm run lint`, `npm run format:check` | PASS (sửa định dạng `one-tap.test.js`) |
| Lỗi tìm được khi làm | Thiết kế: nếu chỉ gọi nhận + xong liền tay thì thống kê thời gian làm ra 0–1 giây và kéo thời gian chờ báo khách về 0 → đổi cách tính trong `recomputePrepStats` (AC-076-02) |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
