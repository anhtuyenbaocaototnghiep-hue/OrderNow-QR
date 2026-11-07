# TASK-098 — Bảng chọn món của khách: bấm món là chọn tùy chọn, ghi chú, số lượng ngay (F-081)
Status: READY_FOR_REVIEW (07/11/2026)
Quyết định: [ADR-039](../quyết-định/ADR-039-bang-chon-mon.md) D-178…D-181 · Feature: [FEATURE-081](../chức-năng/FEATURE-081.md) (US-081-1, AC-081-01, 02) · BR-119 · NFR-003 (ghi chú thay đổi)
Module: MOD-MENU, MOD-ORDER · Màn hình: SCR-02 (Menu), SCR-57 (Bảng chọn món — mới), SCR-03 (Giỏ)
Nguồn: chủ dự án 07/11/2026 "khi chọn món nó sẽ hiện lựa chọn side hay gì đó nó hiện ra luôn thay vì vào giỏ hàng xem rất bất tiện…"; agent đề xuất 4 mục; chủ dự án chọn mục 1 "Bấm món là hiện ngay bảng chọn, trượt lên từ dưới màn hình: cái này". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-098-bang-chon-mon` chồng lên `task/TASK-097-trang-quan-ly-rieng` (chưa gộp `main`) · Kế hoạch: [TASK-098-plan.md](../kế-hoạch/TASK-098-plan.md)

## Mục tiêu
Khách bấm món là thấy ngay và chọn hết size, topping, ghi chú, số lượng ở một bảng trượt lên; vào giỏ chỉ để xem lại và gửi.

## Phạm vi
1. Giao diện: `js/options.js` (`pickItem` mới + phần nhóm tùy chọn dùng chung, `pickOptions` của quầy giữ hành vi), `js/cart.js` (`addItem(…, { quantity, note })`), `js/pages/t-menu.js` (`openItem`, tên món / ảnh mở bảng, "+" món có tùy chọn mở bảng, "Gọi lại" giữ ghi chú + số lượng, ô điều khiển khi món có nhiều dòng), `css/customer.css`.
2. Không đổi máy chủ / dữ liệu; test integration xác nhận máy chủ nhận nhiều dòng cùng món khác ghi chú.
3. Test integration + E2E; tài liệu (ADR-039, FEATURE-081, BR-119, NFR-003, F-013, SCR-57, UAT-50); skill `bang-chon-mon`.

## Không được sửa
Máy quầy (Bán mang đi, Gọi món tại bàn — vẫn "+" nhanh + hộp chọn cũ); giỏ hàng (mục "gọn giỏ" chưa được chọn); giá / báo giá ở máy chủ.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.

## Kết quả thực chạy (07/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **465/465 PASS** (53 file; thêm `item-sheet.test.js` — AC-081-01) |
| `npm run test:e2e` | **74/74 PASS** (thêm E2E "bảng chọn món…" — AC-081-02). Lần chạy đầu: (1) bài chính sách dữ liệu (F-062) bấm "+" món đầu danh mục — nay là Bạc xỉu có tùy chọn nên mở bảng chọn, chặn bước mở giỏ → sửa bài sang Cà phê đen; (2) kiểm tra trợ năng báo nút tên món chỉ cao 22 px (< 24 px, WCAG 2.5.8) → nút cao tối thiểu 28 px |
| `npm run trace -- --check` | 180 US, 493 AC — PASS 493, GAP 0 |
| Chụp màn hình 390 / 1366 px (CafeQrTest, tự tạo nhóm Size + Topping cho Latte) | Bảng chọn: Size L + Trân châu + nút "Ít đá" + số lượng 2 → "Thêm vào giỏ · 98.000đ"; bấm tên Nước suối → bảng ghi chú; giỏ đúng tùy chọn, ghi chú, số lượng — không cuộn ngang |
| `npm run lint`, `npm run format:check` | PASS |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
