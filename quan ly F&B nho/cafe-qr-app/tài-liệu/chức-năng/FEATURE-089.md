# FEATURE-089 — Kho nguyên liệu gọn: cột Hạn sử dụng, "⋯", Theo dõi hạn một chạm; Nhà cung cấp & đặt hàng gộp vào "Nhập kho & kiểm kê"

> **Nguồn:** chủ dự án 14/11/2026 — "kho nguyên liệu hiện thêm cái hạn sử dụng và test thử, còn nhà cung cấp gộp chung với nhập khi kiểm kê thiết kế lại giao diện dễ dàng sử dụng" (kèm ảnh trang `/admin/ingredients`). Nền: [F-011](FEATURE-011.md) kho nguyên liệu, [F-028](FEATURE-028.md) lô & hạn dùng (BR-041), [F-075](FEATURE-075.md) hộp đang mở, [F-023](FEATURE-023.md) nhập kho & kiểm kê, [F-029](FEATURE-029.md) đề xuất nhập hàng, [F-030](FEATURE-030.md) nhà cung cấp & đơn đặt hàng, [F-085](FEATURE-085.md) ảnh nguyên liệu.

- **Status:** CONFIRMED (yêu cầu chủ dự án 14/11) · Triển khai: [TASK-109](../công-việc/TASK-109.md)
- **Actor:** **ACT-ADMIN / ACT-STORE** (quyền `admin.stock` — không đổi).
- **Màn hình:**
  - **Quản lý → Kho nguyên liệu** (SCR-23): cột Nguyên liệu · Còn dùng được · **Hạn sử dụng** · Trạng thái; mỗi dòng **Điều chỉnh** (nút chính) · **Sửa** · **⋯**; dải "Sắp hết hạn"; nút **Theo dõi hạn**.
  - **Quản lý → Nhập kho & kiểm kê** (SCR-31 + SCR-35): một mục ở thanh bên, một hàng thẻ chung cho hai trang.
- **Dữ liệu:** không đổi schema, không migration. `GET /api/admin/ingredients` (và `/api/ops/ingredients`) thêm `nextExpiry`, `nextExpiryDays`, `nextExpiryQty`.
- **Quyền:** không đổi — hai trang cùng quyền `admin.stock`; "Theo dõi hạn" dùng `PUT /api/admin/ingredients/{id}/advanced` sẵn có.

## User Story

- **US-089-1:** Là chủ quán / quản lý cửa hàng, tôi muốn thấy ngay ở Kho nguyên liệu hạn sử dụng gần nhất của từng nguyên liệu (còn mấy ngày, lô đó còn bao nhiêu), được nhắc khi sắp hết hạn và bật theo dõi hạn chỉ bằng một chạm, để dùng hàng trước khi hỏng mà không phải mở từng hộp thoại.
- **US-089-2:** Là chủ quán, tôi muốn nhập hàng, kiểm kê, đặt hàng và nhà cung cấp nằm chung một mục với một hàng thẻ, còn việc ít dùng của nguyên liệu nằm sau nút "⋯", để màn hình gọn và dễ tìm.

## Quy tắc

1. **Hạn sử dụng gần nhất** = ngày hết hạn nhỏ nhất trong các lô **còn hàng** (`IsClosed = 0`, `Qty > 0`) **có ghi hạn** của nguyên liệu **đang theo lô** (BR-041). Số ngày tính theo ngày giờ quán (UTC+7), âm = đã hết hạn. Lượng = tổng các lô có cùng ngày đó. Nguyên liệu không theo lô, hoặc chỉ còn lô "Tồn đầu" (không hạn) → không có hạn (`null`).
2. Nhãn: còn > 3 ngày → "Còn N ngày" (xanh); ≤ 3 ngày → vàng; hôm nay → "Hết hạn hôm nay"; đã qua → "Hết hạn N ngày trước" (đỏ). Ngưỡng 3 ngày như tab Hạn dùng ở quầy (F-028). Nguyên liệu đang dùng có hạn ≤ 3 ngày → dải "Sắp hết hạn: …" đầu trang. Hộp đang mở (F-075) ghi "Hộp đang mở: dùng trước …".
3. **Theo dõi hạn** (nguyên liệu chưa theo lô): bật theo lô một chạm, giữ nguyên các thiết lập Kho nâng cao khác (loại, dùng trong … giờ, hao hụt, hộp & hạn sau khi mở). Tồn hiện có thành lô "Tồn đầu" (BR-041) → ô ghi "Chưa có lô ghi hạn — ghi hạn ở dòng nhập kho"; phiếu nhập kho có ô Hạn sử dụng + Mã lô cho nguyên liệu đó. Tắt theo dõi vẫn ở ⋯ → Kho nâng cao.
4. Mỗi dòng: **Điều chỉnh** (nút chính) · **Sửa** · **⋯**. "⋯" mở ngăn: tóm tắt (còn dùng được, hạn sử dụng), **Lịch sử kho**, **Lô & hạn dùng** (nguyên liệu theo lô), **Công thức** (bán thành phẩm), **Kho nâng cao**, **Xóa nguyên liệu**. Chọn một việc → ngăn đóng, hộp việc đó mở; đóng hộp → focus về "⋯". Cột "Còn dùng được" = tồn − đang giữ − hết hạn; tồn / đang giữ / hết hạn chỉ ghi khi khác 0; ngưỡng ghi "báo khi dưới …".
5. **Nhập kho & kiểm kê** gồm cả Nhà cung cấp & đặt hàng: thanh bên chỉ còn một mục. Hai trang `/admin/stock`, `/admin/purchasing` (giữ đường dẫn, API, quyền) dùng chung hàng thẻ — hàng trên: Nhập kho · Kiểm kê · Đề xuất nhập hàng · Đơn đặt hàng · Nhà cung cấp; hàng dưới "Báo cáo kho:" Giá vốn & hao hụt · Giá vốn thực tế · Thất thoát · Giá & giao hàng · Đơn vị. Thẻ cùng trang đổi tại chỗ và ghi `?tab=` vào địa chỉ (tải lại / gửi link mở đúng thẻ); thẻ của trang kia → chuyển trang tới đúng thẻ. Mục "Nhập kho & kiểm kê" sáng ở cả hai trang; tiêu đề hai trang là "Nhập kho & kiểm kê". "Việc cần làm" ở trang Hôm nay (đơn đặt hàng đến hạn nhận) mở thẳng thẻ Đơn đặt hàng.

## API

- `GET /api/admin/ingredients`, `GET /api/ops/ingredients`: mỗi nguyên liệu thêm `nextExpiry` (`'YYYY-MM-DD' | null`), `nextExpiryDays` (`int | null`, âm = đã hết hạn), `nextExpiryQty` (số, `0` khi không có hạn).

## Acceptance Criteria

- AC-089-01: Nguyên liệu chưa theo lô → `nextExpiry = null`, `nextExpiryDays = null`, `nextExpiryQty = 0`; bật theo lô (tồn thành lô "Tồn đầu" không hạn) → vẫn không có hạn; nhập lô hạn +8 ngày 500 → (+8 ngày, 8, 500); thêm hai lô cùng hạn +2 ngày (300 + 200, hai phiếu) → (+2 ngày, 2, 500); thêm lô đã hết hạn hôm qua 100 → (−1 ngày, −1, 100); nguyên liệu khác không bị ảnh hưởng.
- AC-089-02: Hủy lô đã hết hạn → hạn sang lô kế tiếp (+2 ngày, 500); hủy hàng 500 (FEFO lấy hai lô +2 ngày) → (+8 ngày, 8, 500); tắt theo lô → không có hạn.
- AC-089-03: (Kho nguyên liệu, 1366 px) cột Nguyên liệu · Còn dùng được · Hạn sử dụng · Trạng thái; nguyên liệu có lô +2 ngày (400 ml) và +10 ngày: ô hạn ghi ngày dd/mm/yyyy, nhãn "Còn 2 ngày", "400 ml của lô này"; còn dùng được 1.400; dải "Sắp hết hạn" có tên nguyên liệu; dòng chỉ có Điều chỉnh · Sửa · ⋯; "⋯" mở ngăn có Lịch sử kho / Lô & hạn dùng / Kho nâng cao / Xóa nguyên liệu, tóm tắt có "Còn 2 ngày"; Lô & hạn dùng mở hộp Lô có cả hai lô, đóng → focus về "⋯"; nguyên liệu chưa theo dõi → "Chưa theo dõi" + "Theo dõi hạn" → báo đã bật, ô ghi "Chưa có lô ghi hạn — ghi hạn ở dòng nhập kho", focus về "⋯" của dòng đó, API trả `trackLots = true` và giữ loại / hao hụt; phiếu nhập kho chọn nguyên liệu đó → có ô Hạn sử dụng. (Bài Xóa nguyên liệu — ADR-004 — và Kho nâng cao — F-075 — đi qua "⋯".)
- AC-089-04: Thanh bên không còn mục "Nhà cung cấp" (`/admin/purchasing`), còn mục "Nhập kho & kiểm kê"; trang có hàng thẻ (tablist "Nhập kho, đặt hàng & kiểm kê") đủ 10 thẻ đúng thứ tự; chọn "Nhà cung cấp" → `/admin/purchasing?tab=suppliers`, thẻ được chọn, có "+ Thêm nhà cung cấp", mục "Nhập kho & kiểm kê" vẫn `aria-current="page"`, tiêu đề "Nhập kho & kiểm kê"; "Đơn đặt hàng" → `?tab=pos`, tải lại vẫn thẻ đó; "Kiểm kê" → `/admin/stock?tab=stocktakes`.
- AC-089-05: Quét khả năng tiếp cận trang quản lý gồm Kho nguyên liệu, ngăn "⋯", Nhập kho & kiểm kê, Nhà cung cấp & đặt hàng — nhãn, tên nút, tương phản, vùng chạm ≥ 24 px; ngăn "⋯" và trang có hàng thẻ kho không cuộn ngang ở 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/ingredient-expiry.test.js` (AC-089-01, 02).
- E2E: `kiểm-thử/e2e/flow.spec.js` (AC-089-03, 04); `kiểm-thử/e2e/a11y.spec.js` bài "quản lý (máy tính): mọi trang quản trị…" (AC-089-05).
