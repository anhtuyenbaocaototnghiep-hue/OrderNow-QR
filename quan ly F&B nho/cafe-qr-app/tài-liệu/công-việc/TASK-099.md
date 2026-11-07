# TASK-099 — Giỏ hàng gọn: bấm món trong giỏ để sửa (F-082)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-040](../quyết-định/ADR-040-gio-hang-gon.md) D-182…D-184 · Feature: [FEATURE-082](../chức-năng/FEATURE-082.md) (US-082-1, AC-082-01, 02) · BR-120
Module: MOD-ORDER · Màn hình: SCR-03 (Giỏ), SCR-57 (Bảng chọn món — mở lại để sửa)
Nguồn: chủ dự án 07/11/2026 (kèm ảnh giỏ còn ô ghi chú + 6 nút) "khi click chọn nó hiện ra luôn không cần hiện trong giỏ hàng nữa và vào giỏ hàng khách muốn sửa đổi thì chỉ cần bấm vào cái món đó và sửa thôi" (= mục 2 của đề xuất ở TASK-098). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-099-gon-gio-hang` chồng lên `task/TASK-098-bang-chon-mon` (chưa gộp `main`) · Kế hoạch: [TASK-099-plan.md](../kế-hoạch/TASK-099-plan.md)

## Mục tiêu
Giỏ chỉ để xem lại và gửi: mỗi món một dòng gọn; muốn đổi thì bấm vào món, sửa ở bảng chọn.

## Phạm vi
1. Giao diện: `js/cart.js` (`replaceLine`, hàm dùng chung `newLine` / `sameLine` / `freeKey`), `js/options.js` (`pickItem`: `initial`, `confirmLabel`), `js/pages/t-menu.js` (`lineNode` gọn, `editLine`, `itemHead`), `css/customer.css` (`.cart-line-main`).
2. Test đơn vị giỏ (`tests/cart-unit.test.js`) + E2E mới; sửa 2 bài E2E đang gõ ghi chú trong giỏ (AC-002-04, AC-081-02) sang bảng chọn + chữ "Ghi chú: …".
3. Tài liệu; mở rộng skill `bang-chon-mon` (cùng màn).

## Không được sửa
Máy quầy; máy chủ / dữ liệu; luật giá.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **466/466 PASS** (54 file; thêm `cart-unit.test.js` — AC-082-01, test đơn vị đầu tiên cho mã giao diện, import thẳng `js/cart.js`) |
| `npm run test:e2e` | **75/75 PASS** (thêm E2E "giỏ gọn…" — AC-082-02; bài trợ năng kiểm giỏ mới đạt) |
| `npm run trace -- --check` | 181 US, 495 AC — PASS 495, GAP 0 |
| Chụp màn hình 390 / 1366 px (CafeQrTest) | Giỏ: "Latte / Size L, Trân châu / Ghi chú: Ít đá / 49.000đ / Sửa ›" + [−] 2 [+]; bấm món → bảng chọn đúng lựa chọn cũ, nút "Cập nhật · 98.000đ" — không cuộn ngang |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
