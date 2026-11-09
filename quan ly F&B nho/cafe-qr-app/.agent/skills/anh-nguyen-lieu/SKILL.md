---
name: anh-nguyen-lieu
description: Ảnh nguyên liệu ở kho của cafe-qr-app (F-085, ADR-046 D-203…D-205, BR-123, TASK-103, migration 0056) — Ingredients.ImageUrl là đường dẫn (URL http(s) hoặc "/…", ≤ 500) giống ảnh món; PUT /api/admin/ingredients không gửi imageUrl thì GIỮ ảnh (ingredientImage + @keepImg), '' / null bỏ ảnh; GET /api/admin/ingredients và /api/ops/ingredients trả imageUrl; ảnh 64 px ở Kho nguyên liệu (admin-ingredients.js), 40 px ở tab Tồn kho máy quầy (pos-stock.js, thumb(…, { small: true }), .thumb.sm); ảnh mẫu public/img/nguyen-lieu/ (Pexels, cắt vuông 640). Dùng khi sửa kho nguyên liệu, thêm ảnh vào bảng kho khác (phiếu nhập, kiểm kê, hủy hàng), làm tải ảnh từ máy lên, hoặc khi nhắc "ảnh nguyên liệu", "hình tồn kho", "ảnh kho".
---

# Mục đích

Ghi lại F-085 (09/11/2026) để agent sau thêm ảnh vào chỗ khác của kho, hoặc đổi cách nhập ảnh, mà không làm mất ảnh đã gắn, không phá kiểm đường dẫn, không lệch với ảnh món.

| Tài liệu   | Đường dẫn                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Quyết định | `tài-liệu/quyết-định/ADR-046-anh-nguyen-lieu.md` (D-203…D-205)                                  |
| Chức năng  | `tài-liệu/chức-năng/FEATURE-085.md` (US-085-1, AC-085-01…03, BR-123)                            |
| Việc       | `tài-liệu/công-việc/TASK-103.md`, kế hoạch `tài-liệu/kế-hoạch/TASK-103-plan.md`                 |
| Dữ liệu    | `cơ-sở-dữ-liệu/chuyển-đổi/0056_anh_nguyen_lieu.sql` (`Ingredients.ImageUrl NVARCHAR(500) NULL`) |

# Luật (đã chạy)

- **Lưu đường dẫn, không lưu tệp** — giống `MenuItems.ImageUrl`. Hợp lệ: `''`, `null`, `http(s)://…` hoặc bắt đầu bằng `/`, không khoảng trắng, ≤ 500 ký tự. Sai → `400 VALIDATION_ERROR` với `fields[].path = "imageUrl"`, hộp Sửa hiện câu báo dưới ô (`showFieldErrors`).
- **`PUT` vắng `imageUrl` = giữ ảnh** (`routes/admin.js ingredientImage`: transform trả `undefined` khi vắng; `ingredientsRepo.update`: `ImageUrl = CASE WHEN @keepImg = 1 THEN ImageUrl ELSE @img END`). Món thì khác: `PUT /api/admin/menu-items/{id}` vắng ảnh vẫn là bỏ ảnh (hành vi cũ, đừng "sửa" cho giống mà không hỏi).
- `mapIngredient` trả `imageUrl: r.ImageUrl ?? null` → mọi nơi dùng `ingredientsRepo.list/getById` (trang Quản lý, `/api/ops/ingredients`) đều có ảnh.
- Quyền: không thêm quyền mới — ai sửa được nguyên liệu (chủ quán; quản lý cửa hàng qua `STORE_MGR_AREAS` `ingredients: full`) thì sửa được ảnh.
- Giao diện: `thumb(name, url)` 64 px ở Kho nguyên liệu (chưa ảnh → ô chữ cái — trang Quản lý được dùng ô chữ cái; màn khách thì KHÔNG, xem skill `giao-dien-tinh-gon`); `thumb(name, url, { small: true })` → `.thumb.sm` 40 px ở tab Tồn kho máy quầy. Ô nhập `#ing-image` có nhãn `for` (bài a11y).

# Cạm bẫy đã gặp

- **Chèn mã bằng script heredoc làm mất dấu thoát** trong biểu thức `/^(https?:\/\/|\/)[^\s]*$/` → server không khởi động ("Unterminated group"). Viết script sửa tệp bằng công cụ Write, hoặc kiểm `git diff` trước khi chạy test.
- Máy chủ demo của chủ dự án (`DEMO-ĐIỂM-PHÁT/2-chạy-app-demo.cmd`) chạy thẳng `server.js`, **không tự migrate** → mỗi migration mới phải sao lưu rồi `npm run db:migrate` vào CafeQrDev trước khi chủ dự án mở lại demo (cột NULL thêm vào không làm hỏng mã cũ đang chạy).

- **DEF-024:** hộp Sửa nguyên liệu (và 7 nút khác) từng khóa mãi nút "Lưu" sau khi máy chủ báo lỗi vì `setBusy(e.currentTarget, false)` chạy sau `await` (`e.currentTarget` đã `null`). Handler `async` mới: `const btn = e.currentTarget` trước mọi `await`.

# Ảnh mẫu

`ứng-dụng/giao-diện/public/img/nguyen-lieu/`: `ca-phe-hat`, `duong`, `sua-tuoi`, `dao-ngam`, `cot-tra-dao` (Pexels License, nguồn trong `NGUON-ANH.txt`, cắt vuông 640 × 640 bằng canvas của Playwright). Sữa đặc chưa có ảnh mẫu hợp (Pexels không có lon sữa đặc rõ) — để trống cho quán tự chụp. Unsplash chặn tải tự động (401); Pexels tải thẳng được `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=800`.

# Chưa làm (đề xuất sau)

- Tải ảnh từ máy / điện thoại lên (như ảnh hóa đơn sổ quỹ F-033, `uploadsDir`) — làm chung cho món + nguyên liệu để một cách nhập ảnh.
- Ảnh ở phiếu nhập, kiểm kê, hủy hàng, sơ chế.

# Kiểm thử

`npm run lint` · `npm run format:check` · `npm test` (`tests/ingredient-image.test.js` — AC-085-01, 02) · `npm run test:e2e` (E2E "ảnh nguyên liệu: …" — AC-085-03) · `npm run trace -- --check` · `npm run db:migrate` (0056) · ảnh 1920 px trang Quản lý, 1366 px máy quầy.
