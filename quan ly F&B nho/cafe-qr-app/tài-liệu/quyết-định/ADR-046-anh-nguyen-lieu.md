# ADR-046 — Ảnh nguyên liệu ở kho

- **Trạng thái:** PROPOSED (09/11/2026) — đã làm theo yêu cầu chủ dự án (sau khi agent gắn ảnh cho các món nước: "với hình mình chưa làm cái tồn kho"); cách làm cụ thể D-203…D-205 là mặc định agent chọn cho giống ảnh món, **chờ chủ dự án xem trên máy và xác nhận** (`.agent/rules.md`: migration / API contract mới cần chủ dự án duyệt qua ADR). Chủ dự án muốn khác (ví dụ tải ảnh từ điện thoại lên) → ghi ở ADR này rồi sửa.
- **Bối cảnh:** món đã có ảnh (`MenuItems.ImageUrl`, F-001 / F-010), nhưng nguyên liệu trong kho chỉ có chữ. Trang Kho nguyên liệu (SCR-23) và tab Tồn kho ở máy quầy (SCR-17) toàn chữ, khó nhận ra nhanh hàng nào khi xem tồn, đếm kho, sơ chế — nhất là nhân viên mới.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-203 | Nguyên liệu có **ảnh không bắt buộc**, lưu **giống ảnh món**: một đường dẫn (URL `http(s)://…` hoặc đường dẫn trong app bắt đầu bằng `/`, ≤ 500 ký tự) ở cột mới `Ingredients.ImageUrl` (migration 0056, chỉ thêm). Không lưu tệp ảnh trong cơ sở dữ liệu. Ảnh mẫu cho dữ liệu thử để trong app (`public/img/nguyen-lieu/`, cắt vuông 640 × 640, Pexels License — nguồn ghi ở `NGUON-ANH.txt`) để quán không có Internet vẫn hiện. |
| D-204 | API: `POST` / `PUT /api/admin/ingredients` nhận `imageUrl` (kiểm như ảnh món). **`PUT` không gửi `imageUrl` thì giữ ảnh cũ** (bản giao diện cũ, nơi khác sửa nguyên liệu không làm mất ảnh); gửi `''` / `null` = bỏ ảnh. Đường dẫn sai dạng → `400 VALIDATION_ERROR`, ảnh cũ còn nguyên. `GET /api/admin/ingredients` và `GET /api/ops/ingredients` (máy quầy) trả `imageUrl` (`null` khi chưa có). Ai sửa được nguyên liệu (chủ quán, quản lý cửa hàng — quyền kho sẵn có) thì sửa được ảnh; không thêm quyền mới. |
| D-205 | Hiển thị: **Trang Quản lý → Kho nguyên liệu**: ảnh 64 px cạnh tên (chưa có ảnh → ô chữ cái, giống trang Món); hộp Thêm / Sửa nguyên liệu có ô **"Ảnh (URL, không bắt buộc)"**. **Máy quầy → Kho & sơ chế → Tồn kho**: ảnh nhỏ 40 px cạnh tên (`thumb(…, { small: true })`, `.thumb.sm`) để bảng vẫn gọn. Các bảng khác của kho (phiếu nhập, kiểm kê, hủy hàng, sơ chế) chưa đổi. |

## Phương án đã cân nhắc

- **Tải tệp ảnh từ máy lên** (như ảnh hóa đơn sổ quỹ F-033): tiện hơn cho chủ quán (chụp bằng điện thoại rồi chọn tệp), nhưng ảnh món hiện vẫn là đường dẫn; làm riêng cho nguyên liệu sẽ thành hai cách nhập ảnh khác nhau. Đề xuất làm chung một đợt sau cho cả món và nguyên liệu nếu chủ dự án muốn.
- **Ảnh ở mọi bảng kho** (phiếu nhập, kiểm kê, hủy hàng): các bảng này là danh sách chọn / nhập số, thêm ảnh làm dòng cao và chậm hơn; để sau khi chủ quán dùng thử hai màn tồn kho.
- **`PUT` không gửi ảnh = bỏ ảnh** (như món): dễ mất ảnh khi một chỗ khác (bản cũ, script) sửa nguyên liệu mà không biết trường mới → chọn "vắng = giữ".

## Hệ quả

- Migration `0056_anh_nguyen_lieu.sql`; `ingredientsRepo` (`mapIngredient.imageUrl`, `create`, `update` giữ ảnh khi vắng); `routes/admin.js` (`ingredientImage`).
- Giao diện: `admin-ingredients.js` (ảnh trong bảng + ô nhập), `pos-stock.js` (tab Tồn kho), `ui.js thumb(name, url, { small })`, `base.css .thumb.sm`.
- Test: `tests/ingredient-image.test.js` (AC-085-01, 02), E2E "ảnh nguyên liệu…" (AC-085-03).
