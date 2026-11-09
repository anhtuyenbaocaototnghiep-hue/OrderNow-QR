# TASK-103 — Kế hoạch: ảnh nguyên liệu ở kho (F-085, ADR-046)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Ảnh món | `MenuItems.ImageUrl` (0001), `routes/admin.js itemBody.imageUrl`, `admin-menu.js` (ô "Ảnh (URL, không bắt buộc)", `thumb()` trong bảng) | Có — đường dẫn, không tải tệp |
| Nguyên liệu | `Ingredients` (không có cột ảnh), `ingredientsRepo` (`SELECT i.*`, `mapIngredient`, `create`, `update`), `routes/admin.js ingredientBase` | Chỉ chữ |
| Kho trang Quản lý | `admin-ingredients.js` (SCR-23) — bảng + hộp Thêm / Sửa | Chỉ chữ |
| Kho máy quầy | `pos-stock.js renderStock` (SCR-17, tab Tồn kho) — `GET /api/ops/ingredients` dùng chung `ingredientsRepo.list` | Chỉ chữ |
| Tải tệp | Chỉ có ảnh hóa đơn sổ quỹ (F-033, `uploadsDir/receipts`) | — |

## Thiết kế
- Migration 0056: `Ingredients.ImageUrl NVARCHAR(500) NULL` (kiểm `COL_LENGTH` trước, chỉ thêm).
- Route: `ingredientImage` — kiểm như ảnh món nhưng `undefined` giữ nguyên (không biến thành `null`) → repo `update` dùng `CASE WHEN @keepImg = 1 THEN ImageUrl ELSE @img END`.
- Giao diện: `thumb(name, url, { small })` + `.thumb.sm` (40 px); bảng Kho nguyên liệu bọc ô tên thành `.row` (ảnh + chữ); hộp Thêm / Sửa thêm ô ảnh (`#ing-image`, nhãn có `for`).
- Ảnh mẫu `public/img/nguyen-lieu/` (5 ảnh Pexels, cắt vuông); gắn vào dữ liệu thử CafeQrDev qua API sau khi máy chủ chạy bản mới.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Bản cũ / chỗ khác `PUT` nguyên liệu không gửi ảnh → mất ảnh | Vắng = giữ (D-204); test AC-085-02 |
| Máy chủ demo của chủ dự án chạy thẳng `server.js`, không tự migrate → mã mới gặp DB chưa có cột | Sao lưu rồi áp 0056 vào CafeQrDev trước (chỉ thêm cột NULL — mã cũ vẫn chạy) |
| Dòng bảng cao hơn ở máy quầy | Ảnh 40 px; trang Quản lý 64 px như trang Món |
| Biểu thức kiểm URL bị hỏng khi chèn bằng script (đã gặp: mất `\/`) | Test AC-085-02 thử nhiều dạng sai + E2E kiểm câu báo lỗi |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check` · `npm run db:migrate` (0056) · ảnh 1920 px trang Quản lý + 1366 px máy quầy + 390 px.
