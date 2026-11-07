# ADR-040 — Giỏ hàng gọn: bấm món trong giỏ để sửa

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án (kèm ảnh giỏ hàng còn ô ghi chú + 6 nút): "khi click chọn nó hiện ra luôn không cần hiện trong giỏ hàng nữa và vào giỏ hàng khách muốn sửa đổi thì chỉ cần bấm vào cái món đó và sửa thôi" — tức mục 2 của đề xuất ở ADR-039.
- **Bối cảnh:** sau F-081 khách chọn tùy chọn, ghi chú, số lượng ở bảng chọn ngay khi bấm món, nhưng giỏ hàng vẫn hiện ô ghi chú + hàng 6 nút nhanh dưới mỗi món → giỏ dài, rối, trùng việc đã làm ở bảng chọn.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-182 | Giỏ của khách **không còn ô ghi chú và hàng nút nhanh**. Mỗi món một dòng gọn: tên, tùy chọn, **"Ghi chú: …"** (chữ, nếu có), giá (giá gạch / tên khuyến mãi khi có), chữ **"Sửa ›"**, bước số lượng [−] n [+] bên phải (bấm − tới 0 vẫn bỏ món). |
| D-183 | **Bấm vào món trong giỏ** (cả khối tên / tùy chọn / ghi chú / giá) → mở lại **bảng chọn** của F-081 với lựa chọn cũ của dòng (tùy chọn, ghi chú, số lượng), nút **"Cập nhật · tổng"** → thay dòng **tại chỗ** (giữ vị trí). Sau khi sửa mà trùng món + tùy chọn + ghi chú với dòng khác → gộp số lượng vào dòng đó (tối đa 50). Món đã hết → báo "bấm − để bỏ khỏi giỏ". |
| D-184 | Chỉ giỏ của khách; máy quầy không đổi. Không đổi máy chủ / dữ liệu. |

## Phương án đã cân nhắc

- **Nút "Sửa" nhỏ riêng thay vì bấm cả dòng:** vùng chạm nhỏ, khách lớn tuổi khó bấm; chọn cả khối thông tin món là nút (vẫn có chữ "Sửa ›" để khách biết bấm được).
- **Thu gọn ô ghi chú (bấm mới mở):** vẫn hai chỗ sửa ghi chú; chọn một chỗ duy nhất là bảng chọn.

## Hệ quả

- `cart.js`: `replaceLine` (thay tại chỗ / gộp khi trùng), tách `newLine`, `sameLine`, `freeKey` dùng chung với `addItem`. `options.js pickItem`: `initial`, `confirmLabel`. `t-menu.js`: `lineNode` gọn, `editLine`, `itemHead` dùng chung. CSS `.cart-line-main` (vùng chạm ≥ 44 px cao).
- E2E: bài "giỏ còn sau khi tải lại…" (AC-002-04) và bài bảng chọn món (AC-081-02) đổi cách nhập / kiểm ghi chú sang bảng chọn + chữ "Ghi chú: …" trong giỏ.
