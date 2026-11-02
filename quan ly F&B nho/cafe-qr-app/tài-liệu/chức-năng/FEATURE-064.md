# FEATURE-064 — Báo động giá vốn khi nhập hàng giá cao hơn

> **Nguồn:** chủ dự án 02/11/2026. Quyết định: [ADR-023](../quyết-định/ADR-023-bao-dong-gia-von.md) D-84…D-88.

- **Status:** CONFIRMED (ADR-023) · Triển khai: [TASK-079](../công-việc/TASK-079.md)
- **Actor:** **ACT-ADMIN** (nhận cảnh báo, đặt ngưỡng, đổi giá). **ACT-STAFF / ACT-LEAD** nhập kho như cũ, không thấy cảnh báo.
- **Màn hình:** **Cảnh báo** (SCR-47) — bảng món tụt lãi, giá gợi ý, link "Đổi giá"; **Cài đặt** (SCR-33) — 3 ngưỡng; **Thực đơn** (SCR-21), **Combo** (SCR-27) — `?edit={id}` mở sẵn hộp sửa món.
- **Dữ liệu:** `Alerts.Kind = 'COST_RISE'`, bảng `CostAlertMarks`, khóa cài đặt `alert.cost_rise_pct`, `alert.cost_margin_drop`, `alert.cost_margin_min`.

## User Story

- **US-064-1:** Là chủ quán, tôi muốn được báo ngay khi nhập hàng giá cao hơn làm món nào tụt lãi, mất bao nhiêu tiền mỗi tháng và nên bán giá nào, để quyết định trước khi lãi mất dần.
- **US-064-2:** Là chủ quán, tôi muốn app không báo lặp hay báo giả khi nhập nhầm giá, để còn tin vào cảnh báo.

## Quy tắc (BR-100, BR-101)

**Khi nào xét:** phiếu nhập tay, nhận hàng theo đơn đặt (F-030), sửa phiếu có đổi giá. Xét dòng có giá, giá quy về đơn vị gốc; bỏ qua dòng đã có phiếu mới hơn cùng nguyên liệu.

**Giá mốc** (D-85): giá ở lần báo gần nhất, giảm theo các phiếu rẻ hơn trong 90 ngày sau đó. Chưa báo lần nào → giá thấp nhất trong 90 ngày, không có thì giá phiếu gần nhất. Chưa từng có giá → không báo.

**Giá vốn món:** Σ định lượng × giá nguyên liệu; bán thành phẩm = Σ công thức ÷ sản lượng mẻ (lồng tối đa 3 cấp); combo = Σ số lượng × giá vốn món thành phần. Nguyên liệu trên phiếu dùng giá mốc (cũ) / giá phiếu (mới); nguyên liệu khác dùng giá nhập gần nhất, chưa có thì giá vốn bình quân. Chưa tính hao hụt, giống báo cáo giá vốn hiện có.

**Món bị báo:** đang hiện trên menu, giá bán > 0, dùng nguyên liệu tăng từ `alert.cost_rise_pct` (5%), giá vốn tăng, và tỷ lệ lãi tụt từ `alert.cost_margin_drop` điểm (2) **hoặc** xuống dưới `alert.cost_margin_min` % (60). Thiếu giá nguyên liệu hoặc combo có thành phần chưa có định lượng → danh sách "chưa tính được". Tùy chọn có định lượng dùng nguyên liệu đó → liệt kê để tham khảo, không gợi ý giá.

**Số liệu mỗi món:** giá vốn cũ → mới; tỷ lệ lãi cũ → mới; số bán 30 ngày gần nhất; tiền mất/tháng = phần giá vốn tăng × số bán; giá gợi ý giữ tiền lãi và giữ % lãi (làm tròn lên 1.000đ). Xếp theo tiền mất giảm dần.

**Nghi nhập nhầm** (D-88): giá tăng trên 50% so với mốc **và** so với phiếu trước → chỉ hỏi kiểm tra, không dùng giá đó để tính lãi, không dời mốc. Phiếu sau vẫn giá đó → không còn nghi.

**Sửa / hủy phiếu** (D-88): sửa có đổi giá hoặc hủy → cảnh báo cũ của phiếu chuyển "Đã xử lý" kèm ghi chú, bỏ mốc, xếp thư đính chính; sửa thì tính lại theo giá đúng. Sửa không đổi giá → không làm gì.

**Mức độ:** cao khi có món xuống dưới mức tối thiểu hoặc có giá nghi nhầm; còn lại mức vừa.

**Email:** một thư mỗi phiếu qua hàng đợi F-060; theo công tắc "Cảnh báo tức thì" và giờ yên lặng. Tên nhà cung cấp được che số điện thoại.

## API

Không thêm endpoint. `GET /api/admin/alerts` trả thêm `kind: 'COST_RISE'` với `detail` như [api-contract](../kiến-trúc/api-contract.md). `GET` / `PUT /api/admin/settings` thêm `alertCostRisePct` (1–100), `alertCostMarginDrop` (1–100), `alertCostMarginMin` (0–100).

## Acceptance Criteria

- AC-064-01: Nhập phiếu có nguyên liệu tăng từ ngưỡng → một cảnh báo `COST_RISE` nêu đúng giá vốn và tỷ lệ lãi cũ → mới, tiền mất/tháng theo số bán 30 ngày, hai giá gợi ý làm tròn lên 1.000đ, xếp theo tiền mất; giá bán không đổi.
- AC-064-02: Dò được món dùng nguyên liệu qua bán thành phẩm và combo; phiếu nhập theo đơn vị đóng gói so đúng theo đơn vị gốc; tùy chọn có định lượng được liệt kê; món ẩn / đã xóa không bị báo.
- AC-064-03: Không báo khi: tăng dưới ngưỡng, giá giảm, dòng không có giá, lần đầu có giá, lãi không vượt ngưỡng. Món thiếu giá nguyên liệu vào danh sách "chưa tính được".
- AC-064-04: Giá tăng dần dưới ngưỡng mỗi lần vẫn bị báo khi cộng dồn đủ ngưỡng; đã báo rồi nhập lại cùng giá không báo nữa; giá giảm thì mốc giảm theo.
- AC-064-05: Giá tăng trên 50% → cảnh báo hỏi nhập nhầm, không có giá gợi ý, không dời mốc; phiếu sau vẫn giá đó → cảnh báo bình thường có giá gợi ý.
- AC-064-06: Sửa giá trên phiếu → cảnh báo cũ "Đã xử lý" kèm ghi chú, thư đính chính, tính lại theo giá đúng; hủy phiếu → mốc trở về như trước phiếu đó; sửa không đổi giá → không có cảnh báo hay thư mới.
- AC-064-07: Mỗi phiếu một email qua hàng đợi, nhận theo đơn đặt cũng được báo; tắt "Cảnh báo tức thì" thì không có email nhưng vẫn có cảnh báo trong app; giờ yên lặng hoãn email; lỗi phần cảnh báo không làm hỏng phiếu nhập; email che số điện thoại nhà cung cấp.
- AC-064-08: Ba ngưỡng có mặc định 5 / 2 / 60, lưu được, giá trị sai → `400`; đổi ngưỡng → thư báo như các cài đặt cảnh báo khác.
- AC-064-09: Nhân viên / trưởng ca nhập kho được nhưng phản hồi không chứa số liệu cảnh báo, không đọc được `/api/admin/alerts` (`403`) và không nhận `alert.created`.
- AC-064-10: Trên trình duyệt: cảnh báo tới trang Cảnh báo qua realtime, hiện bảng món với giá gợi ý; "Đổi giá" mở sẵn hộp sửa đúng món; ở Cài đặt sửa được ngưỡng.

## Bằng chứng

`tests/cost-alert.test.js` (AC-064-01…09) · E2E "báo động giá vốn…" (AC-064-10).
