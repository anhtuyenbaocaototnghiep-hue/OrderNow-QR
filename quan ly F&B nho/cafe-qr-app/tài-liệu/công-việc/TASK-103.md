# TASK-103 — Ảnh nguyên liệu ở kho (F-085)
Status: READY_FOR_REVIEW (09/11/2026)
Quyết định: [ADR-046](../quyết-định/ADR-046-anh-nguyen-lieu.md) D-203…D-205 · Feature: [FEATURE-085](../chức-năng/FEATURE-085.md) (US-085-1, AC-085-01…03) · BR-123
Module: MOD-INVENTORY · Màn hình: SCR-23 (Kho nguyên liệu), SCR-17 (Kho & sơ chế → Tồn kho)
Nguồn: chủ dự án 09/11/2026, sau khi agent gắn ảnh cho các món nước: "với hình mình chưa làm cái tồn kho". · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-103-anh-nguyen-lieu` chồng lên `task/TASK-102-chu-quan-chi-quan-ly` (chưa gộp `main`) · Kế hoạch: [TASK-103-plan.md](../kế-hoạch/TASK-103-plan.md)

## Mục tiêu
Nguyên liệu có ảnh như món, để chủ quán và nhân viên nhìn là nhận ra hàng khi xem tồn, đếm kho, sơ chế.

## Phạm vi
1. Migration `0056_anh_nguyen_lieu.sql` (`Ingredients.ImageUrl`).
2. Máy chủ: `routes/admin.js` (`ingredientImage` — vắng = giữ), `ingredientsRepo` (`mapIngredient.imageUrl`, `create`, `update` với `@keepImg`).
3. Giao diện: `admin-ingredients.js` (ảnh 64 px trong bảng, ô "Ảnh (URL, không bắt buộc)"), `pos-stock.js` (ảnh 40 px tab Tồn kho), `ui.js thumb(…, { small })`, `base.css .thumb.sm`.
4. Ảnh mẫu `public/img/nguyen-lieu/` (5 ảnh Pexels, cắt vuông 640) + gắn vào dữ liệu thử CafeQrDev qua API.
5. Test: `tests/ingredient-image.test.js` (AC-085-01, 02), E2E "ảnh nguyên liệu…" (AC-085-03). Tài liệu + skill `anh-nguyen-lieu` (bản gốc `skill anh nguyen lieu.md`).
6. **DEF-024** (lộ ra khi E2E AC-085-03 chạy lần đầu): nút chính của hộp khóa mãi sau khi máy chủ báo lỗi — 8 handler ở 6 tệp (`admin-ingredients.js`, `stock-adjust.js`, `admin-menu.js`, `admin-tables.js`, `admin-users.js` ×2, `pos-stock.js` ×2) giữ nút trong `btn` trước `await`; E2E hồi quy "báo lỗi xong vẫn lưu được (DEF-024)" (FAIL với code cũ, PASS với code mới).
7. **DEF-026** (thấy khi chụp tab Tồn kho máy quầy): kẻ dòng cột cuối lệch nửa hàng vì `td` mang class `row` (flex) → bọc trong `div.row`.
8. Ghi **DEF-025** (MỞ, chưa sửa): trang vừa mở có thể bỏ lỡ cập nhật trước khi kết nối realtime xong — làm E2E "quà sinh nhật" hỏng một lần (chạy lại đạt); cách sửa đề xuất trong sổ lỗi, chờ chủ dự án.

## Không được sửa
Ảnh món (`PUT /api/admin/menu-items` vắng ảnh vẫn bỏ ảnh như cũ); quyền; hành vi phiếu nhập / kiểm kê / hủy hàng / sơ chế / hạn dùng (chỉ sửa nút bị khóa của DEF-024, không đổi luồng).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0056).

## Kết quả thực chạy (09/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **472/472 PASS** (thêm `ingredient-image.test.js` — AC-085-01, 02; chạy trước khi sửa DEF-024 / DEF-026 — hai lỗi này chỉ ở giao diện, không có test máy chủ chạm tới) |
| `npm run test:e2e` | **81/81 PASS**, mã thoát 0 (thêm E2E "ảnh nguyên liệu…" — AC-085-03 và "báo lỗi xong vẫn lưu được (DEF-024)"). Một lần chạy giữa chừng hỏng bài "quà sinh nhật" (AC-067-07) do DEF-025, chạy lại cả bộ đạt |
| `npm run trace -- --check` | 184 US, 505 AC — PASS 505, GAP 0 |
| `npm run db:migrate` (CafeQrDev) | 0056 đã áp (lần chạy lại báo `skip 0056`); sao lưu trước `CafeQrDev_20261109-1848_truoc-0056-anh-nguyen-lieu.bak` |
| `npm run lint`, `npm run format:check` | PASS |
| Đi luồng thật — dữ liệu thử CafeQrDev (máy chủ bản mới chạy tạm cổng 3200, tắt job nền), tài khoản Chủ quán | Kho nguyên liệu 1920 / 390 px: 6 dòng, 5 ảnh 64 px tải được + 1 ô chữ "S" (Sữa đặc), hộp Sửa có ô Ảnh điền sẵn, không cuộn ngang trang, không lỗi trang. Gắn ảnh mẫu qua API: tồn, ngưỡng, đơn vị, trạng thái giữ nguyên |
| Đi luồng thật — CafeQrTest, `staff1` | Kho & sơ chế → Tồn kho 1366 / 390 px: 5 ảnh 40 px + 1 ô chữ, kẻ dòng thẳng (sau DEF-026), không lỗi trang |

Chưa có review G3 độc lập; chưa gộp `main` ở máy; chưa đẩy GitHub.
