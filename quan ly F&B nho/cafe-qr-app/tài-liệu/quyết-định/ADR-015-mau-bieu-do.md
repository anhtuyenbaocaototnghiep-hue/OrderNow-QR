# ADR-015 — Màu và cách vẽ biểu đồ (dự báo doanh thu, lãi / lỗ)

- **Trạng thái:** PROPOSED (23/10/2026) — chờ chủ dự án xem biểu đồ rồi duyệt gộp `main`.
- **Bối cảnh:**
  - Chủ dự án yêu cầu ngày 23/10/2026: "bên phân tích phần dự báo doanh thu bạn chỉnh màu sắc nó thực tế và chuyên nghiệp và ở lãi lỗ cũng vậy màu sắc biểu đồ phải chuyên nghiệp dễ nhìn"; sau đó chỉ ra lỗi và chọn màu: "lỗi và chỉnh sài các màu cam #F7A400, xanh #3A9EFD, tím đen #1A1B4B" (kèm ảnh chụp hai biểu đồ cũ).
  - Biểu đồ Lãi / lỗ vẽ 3 chuỗi (doanh thu thuần, giá vốn, chi phí) bằng ba sắc nâu gần nhau (`--c-primary`, `--c-accent`, `--c-muted`) — khó phân biệt, nhất là với người mù màu; cột bo cả 4 góc, không có hộp số liệu khi rê chuột (chỉ `title` của từng cột).
  - Biểu đồ dự báo: đường thực tế nâu, đường dự báo caramel đứt, dải caramel; hai đường không nối nhau, không có chú thích, không có mốc "hôm nay", không rê chuột xem được; **lỗi:** nhãn ngày của 7 ngày dự báo chồng lên nhau ("22/1023/1024/10…").
  - Áp dụng skill `dataviz`: chọn dạng trước, màu theo việc (phân loại), **chạy validator** thay vì ước lượng bằng mắt, chuẩn nét vẽ, lớp rê chuột, chữ dùng màu chữ.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-60 | **Bảng 3 màu dữ liệu do chủ dự án chọn** (token trong `base.css`, thứ tự cố định): `--viz-1` xanh `#3A9EFD`, `--viz-2` cam `#F7A400`, `--viz-3` tím đen `#1A1B4B`. <br>• Kết quả `validate_palette.js` (dataviz) trên nền thẻ `#fffdf9`: phân biệt mù màu ΔE 29,3 (mục tiêu ≥ 8) **đạt**; phân biệt mắt thường ΔE 34,7 (sàn ≥ 15) **đạt**; tương phản với nền: xanh 2,76 : 1, cam 2,01 : 1 (< 3 : 1) → **cảnh báo**, bù bằng hộp số liệu cho từng ngày (rê chuột / chạm / bàn phím, có vùng đọc cho trình đọc màn hình) + chú thích + bảng: 7 ngày dự báo ngay dưới biểu đồ dự báo, doanh thu từng ngày đã qua ở Báo cáo, tổng kỳ ở các thẻ số Lãi / lỗ; dải sáng (cam quá sáng, tím đen quá tối) và độ bão hòa (tím đen gần xám) **không đạt** — đây là phép kiểm độ đều tông, không ảnh hưởng việc phân biệt; chủ dự án chọn đúng mã màu nên giữ nguyên. (Bộ đề xuất trước `#2a78d6 · #eb6834 · #6250d6` đạt cả 5 phép, được thay theo lựa chọn của chủ dự án.) <br>• Lãi / lỗ: doanh thu thuần = xanh, giá vốn = cam, chi phí = tím đen; doanh thu ở Báo cáo cũng dùng xanh (cùng đại lượng, cùng màu). <br>• Dự báo: thực tế = xanh nét liền (cùng màu doanh thu); dự báo = cam nét đứt **nối tiếp từ ngày thực tế cuối** + điểm từng ngày; dải ± 1 độ lệch chuẩn = lớp cam mờ 22 %; vạch "Hôm nay" mảnh màu tím đen. Trục ngày chỉ ghi mỗi 7 ngày tính từ hôm nay + ngày cuối (hết chồng chữ). <br>• Lãi / lỗ kỳ dài: bề rộng hình có trần; khi cột nhóm quá mỏng (> ~45 kỳ) đổi sang 3 đường cùng màu; nhãn ngày ghi kèm tháng ở nhãn đầu và khi sang tháng. <br>• Nét vẽ (đơn vị của khung vẽ SVG — hình co giãn theo bề rộng thẻ nên kích thước thật thay đổi theo màn hình): cột ≤ 24, đầu bo 4 chân vuông, khe 2 giữa các cột cạnh nhau; đường 2; điểm đường kính 8 có viền màu nền 2; lưới / trục mảnh 1 nét liền, trục giá trị chia tròn (1 / 2 / 2,5 / 5 × 10ⁿ); đường hòa vốn nét đứt màu mực (ngưỡng, không phải chuỗi dữ liệu); nhãn / số dùng màu chữ. <br>• Rê chuột / chạm / bàn phím: vạch dọc + hộp số liệu theo ngày gần nhất (`js/chart-kit.js`); chạm chọn ngày, kéo ngang để dò; Tab vào biểu đồ rồi ← / → (Home / End) đổi ngày; Esc ẩn hộp kể cả khi đang rê chuột (WCAG 1.4.13); vùng `role="status"` ẩn đọc ngày + số cho trình đọc màn hình. Màn hẹp: biểu đồ giữ ≥ 80 % cỡ thiết kế và cuộn ngang trong khung thay vì thu nhỏ chữ. Chú thích luôn có khi ≥ 2 chuỗi. |

## Phương án đã cân nhắc

- **Giữ tông nâu của quán cho dữ liệu:** bị loại — ba sắc nâu không phân biệt được; màu thương hiệu dành cho khung giao diện, dữ liệu cần màu phân loại đã kiểm.
- **Bộ `#2a78d6 · #eb6834 · #6250d6`** (đạt cả 5 phép kiểm): đề xuất đầu tiên, thay bằng bộ chủ dự án chọn.
- **Làm đậm cam / xanh cho đủ 3 : 1:** không làm — chủ dự án chỉ định mã màu; đã bù bằng bảng số liệu + hộp số liệu. Có thể đổi sau nếu chủ dự án muốn.
- **Đỏ / xanh lá cho chi phí / doanh thu:** bị loại — đỏ / xanh lá là màu trạng thái (lỗi / thành công) trong app; dùng cho chuỗi dữ liệu dễ đọc nhầm là cảnh báo.
- **Thư viện biểu đồ (Chart.js…):** bị loại theo ADR-002.

## Hệ quả

- Sửa: `css/base.css` (token `--viz-*`), `css/admin.css`, `js/pages/admin-pnl.js`, `js/pages/admin-analytics.js` (biểu đồ dự báo; dùng chung `svg()` của chart-kit); thêm `js/chart-kit.js`. Biểu đồ khác (giờ cao điểm, menu engineering, dự báo nhập hàng) giữ dạng và màu (`.chart .bar` / `.grid` chung không đổi); chỉ cột doanh thu ở Báo cáo đổi sang `--viz-1` (lớp `rev-chart`). Nhãn số trên trục / ô dùng chung `compact()` (0 · 750 · 2,5k · 1,5tr).
- Không đổi API, dữ liệu, số liệu hiển thị.
- Task: [TASK-069](../công-việc/TASK-069.md).
