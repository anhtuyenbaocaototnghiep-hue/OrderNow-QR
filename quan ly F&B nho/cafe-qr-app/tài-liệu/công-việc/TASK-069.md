# TASK-069 — Màu biểu đồ chuyên nghiệp: dự báo doanh thu, lãi / lỗ
Status: READY_FOR_REVIEW (23/10/2026)
Quyết định: [ADR-015](../quyết-định/ADR-015-mau-bieu-do.md) D-60 · Module: MOD-REPORT (chỉ giao diện) · Màn hình: SCR-41 (Phân tích → Dự báo doanh thu), SCR-39 (Lãi / lỗ), SCR-25 (Báo cáo — màu cột doanh thu)
Nguồn: chủ dự án yêu cầu 23/10/2026 ("dự báo doanh thu … màu sắc thực tế và chuyên nghiệp … lãi lỗ cũng vậy, màu sắc biểu đồ phải chuyên nghiệp dễ nhìn"), rồi báo lỗi chồng nhãn ngày và chọn màu "cam #F7A400, xanh #3A9EFD, tím đen #1A1B4B". · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-069-mau-bieu-do` tách từ `task/TASK-068-dang-xuat-dong-ca` (chưa gộp `main`)

## Kế hoạch
1. Tài liệu trước code: ADR-015, task này.
2. Chạy validator dataviz trên nền `#fffdf9` cho bộ màu chủ dự án chọn; ghi kết quả vào ADR-015, bù phần tương phản < 3 : 1 bằng bảng + hộp số liệu.
3. `js/chart-kit.js`: `svg()`, `niceScale()`, `compact()`, `barPath()` (bo đầu, chân vuông), `attachHover()` (vạch dọc + hộp số liệu, bàn phím).
4. `admin-pnl.js`: cột theo chuẩn mark, 3 màu `--viz-*`, khe 2 px, hòa vốn nét đứt màu mực, rê chuột xem 3 số + lợi nhuận.
5. `admin-analytics.js` (dự báo): thực tế xanh nét liền, dự báo cam nét đứt nối tiếp + dải mờ + điểm, vạch "Hôm nay", nhãn ngày thưa, chú thích, rê chuột.
6. CSS token + kiểu; cột doanh thu ở Báo cáo dùng `--viz-1`.
7. Kiểm chứng: lint, format, E2E (luồng + a11y), xem ảnh; review G3; chờ chủ dự án duyệt.

## Tiêu chí nghiệm thu
| ID | Tiêu chí | Kiểm bằng |
| --- | --- | --- |
| T69-1 | Dùng đúng 3 mã màu chủ dự án chọn; validator: phân biệt mù màu + mắt thường đạt; tương phản < 3 : 1 có bảng số liệu + hộp số liệu bù | `node scripts/validate_palette.js "#3A9EFD,#F7A400,#1A1B4B" --surface "#fffdf9"` |
| T69-2 | Lãi / lỗ và dự báo hiển thị đúng số liệu như trước (không đổi API / dữ liệu); có chú thích; rê chuột / bàn phím xem được số từng ngày; nhãn ngày không chồng nhau | E2E luồng phân tích + lãi / lỗ; xem ảnh |
| T69-3 | Trang Lãi / lỗ, Phân tích đạt kiểm tra khả năng tiếp cận | `npm run test:e2e` (a11y) |
| T69-4 | Lint, format, `npm test` đạt | lệnh tương ứng |

## Kết quả (23/10/2026)
| ID | Kết quả | Bằng chứng |
| --- | --- | --- |
| T69-1 | ĐẠT — đúng 3 mã màu chủ dự án chọn. Validator: phân biệt mù màu ΔE 29,3 / mắt thường 34,7 (đạt); tương phản xanh 2,76 : 1, cam 2,01 : 1 → bù bằng hộp số liệu (rê chuột / chạm / bàn phím + vùng đọc) và bảng; dải sáng / độ bão hòa không đạt — ghi trong ADR-015 | `validate_palette.js` |
| T69-2 | ĐẠT — số liệu lấy nguyên từ API cũ; chú thích ở cả hai biểu đồ; hộp số liệu mở bằng rê chuột, phím ← / →, Esc ẩn; nhãn ngày dự báo không còn chồng; Lãi / lỗ "Năm nay" (296 ngày) đổi sang 3 đường; chạm trên điện thoại chọn đúng ngày | E2E luồng (phím mũi tên + Esc ở Lãi / lỗ, rê chuột ở Dự báo, 3 đường khi "Năm nay"); ảnh `quan-ly-analytics-du-bao.jpg`, `quan-ly-pnl-hop-so-lieu.jpg`, `quan-ly-pnl-nam-nay.jpg`; thử chạm bằng Playwright cảm ứng 390 px |
| T69-3 | ĐẠT — a11y 0 lỗi ở Phân tích, Dự báo (đang mở hộp số), Lãi / lỗ (đang mở hộp số, "Năm nay"); khung biểu đồ nằm trong màn 320 / 390 px (biểu đồ cuộn trong khung) | `npm run test:e2e` 42/42 (flow 39 + a11y 3) |
| T69-4 | ĐẠT | lint, format sạch; `npm test` 300/300; `npm run trace -- --check` 131 US / 330 AC PASS |

Review G3 (agent độc lập): 6 lỗi + một số ghi chú, đã sửa: (1) đổi màu `.chart .bar` chung làm biểu đồ dự báo nhập hàng sai chú thích "Cột nâu" → giữ màu chung, chỉ Báo cáo dùng `rev-chart`; lưới mảnh chỉ ở 2 biểu đồ mới; (2) chạm trên cảm ứng luôn nhảy ngày cuối → `pointerdown` chọn ngày, `touch-action: pan-y`, bỏ ẩn khi nhấc ngón tay; (3) kỳ dài chữ / cột co không đọc được → trần bề rộng, đổi sang đường khi dày, nhãn ngày kèm tháng; màn hẹp cuộn trong khung; (4) Esc không ẩn hộp khi rê chuột → lắng nghe Esc trên trang khi hộp mở; (5) dựng lại hộp mỗi lần rê → chỉ dựng khi đổi ngày, vùng đọc riêng luôn có; (6) trục 0 · 0k · 0k và 2.500 hiện "3k" → `compact()` 1 chữ số lẻ, sàn trục 4.000đ. Ghi chú: Home / End, đi tiếp từ ngày đã xem sau Esc, dùng `operatingProfit`, bỏ `short` trùng, sửa tài liệu cho khớp code.
Phát hiện thêm khi kiểm màn hẹp: [DEF-014](../chất-lượng/defect-log.md) — trang Phân tích (thanh tab) và Lãi / lỗ (cột dưới) cuộn ngang ở 320–390 px, có từ trước, chưa sửa (chờ chủ dự án).
