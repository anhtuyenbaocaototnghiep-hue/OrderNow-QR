# FEATURE-085 — Ảnh nguyên liệu ở kho

> **Nguồn:** chủ dự án 09/11/2026, sau khi agent gắn ảnh cho các món nước: "với hình mình chưa làm cái tồn kho". Quyết định: [ADR-046](../quyết-định/ADR-046-anh-nguyen-lieu.md) D-203…D-205. Nền: [F-011](FEATURE-011.md) kho nguyên liệu, [F-023](FEATURE-023.md) kho ở quầy.

- **Status:** PROPOSED (chủ dự án yêu cầu 09/11; cách làm chi tiết ở ADR-046 là mặc định agent chọn — chờ chủ dự án xác nhận) · Triển khai: [TASK-103](../công-việc/TASK-103.md) READY_FOR_REVIEW
- **Actor:** **ACT-ADMIN**, **ACT-STORE** (gắn / đổi ảnh); **ACT-STAFF**, **ACT-LEAD** (xem ảnh ở máy quầy).
- **Màn hình:** **Kho nguyên liệu** (SCR-23): ảnh cạnh tên, ô "Ảnh (URL, không bắt buộc)" trong hộp Thêm / Sửa. **Kho & sơ chế → Tồn kho** (SCR-17): ảnh nhỏ cạnh tên.
- **Dữ liệu:** `Ingredients.ImageUrl NVARCHAR(500) NULL` (migration 0056).

## User Story

- **US-085-1:** Là chủ quán / quản lý cửa hàng, tôi muốn gắn ảnh cho từng nguyên liệu trong kho, để tôi và nhân viên nhìn là nhận ra đúng hàng khi xem tồn, đếm kho, sơ chế.

## Quy tắc (BR-123)

1. Ảnh không bắt buộc; là đường dẫn `http(s)://…` hoặc bắt đầu bằng `/`, ≤ 500 ký tự — sai dạng thì báo ngay dưới ô, không lưu.
2. Sửa nguyên liệu mà không gửi ảnh → giữ ảnh cũ; xóa trống ô ảnh rồi lưu → bỏ ảnh.
3. Ai sửa được nguyên liệu thì sửa được ảnh (chủ quán, quản lý cửa hàng); nhân viên chỉ xem.
4. Chưa có ảnh: trang Quản lý hiện ô chữ cái (như trang Món), máy quầy hiện ô chữ cái nhỏ.

## API

- `POST /api/admin/ingredients`, `PUT /api/admin/ingredients/{id}`: thêm trường `imageUrl` (không bắt buộc; `PUT` vắng = giữ, `''` / `null` = bỏ).
- `GET /api/admin/ingredients`, `GET /api/ops/ingredients`: mỗi nguyên liệu có `imageUrl` (`null` khi chưa có).

## Acceptance Criteria

- AC-085-01: Chủ quán thêm nguyên liệu kèm `imageUrl` → `201`, trả ảnh; danh sách kho trang Quản lý và `GET /api/ops/ingredients` (nhân viên) đều trả ảnh; nguyên liệu cũ chưa có ảnh trả `null`; quản lý cửa hàng đổi ảnh được; nhân viên sửa nguyên liệu → `403`.
- AC-085-02: `PUT` không gửi `imageUrl` → giữ ảnh (các trường khác vẫn đổi); `imageUrl` sai dạng (`javascript:…`, không có `/` đầu, có khoảng trắng, quá 500 ký tự) → `400 VALIDATION_ERROR`, ảnh cũ còn nguyên; gửi `''` → bỏ ảnh; thêm mới không gửi ảnh → `null`.
- AC-085-03: Trên trang Quản lý (máy tính): Kho nguyên liệu → Sửa "Cốt trà đào" → dán đường dẫn sai → báo "Ảnh phải là URL http(s) hoặc đường dẫn bắt đầu bằng /" dưới ô; dán `/img/nguyen-lieu/cot-tra-dao.jpg` → Lưu → dòng hiện ảnh tải được; nguyên liệu chưa có ảnh vẫn là ô chữ cái; nhân viên mở Kho & sơ chế → Tồn kho thấy ảnh 40 px.

## Bằng chứng

`tests/ingredient-image.test.js` (AC-085-01, 02) · E2E "ảnh nguyên liệu: …" (AC-085-03).
