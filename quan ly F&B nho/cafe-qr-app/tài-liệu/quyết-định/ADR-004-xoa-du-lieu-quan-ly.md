# ADR-004 — Xóa trong trang Quản lý: xóa hẳn nếu chưa có lịch sử, ngược lại xóa mềm

- **Trạng thái:** ACCEPTED
- **Ngày:** 14/10/2026. Chủ dự án phản hồi: "phần quản lý thiếu phần xóa, thêm mà không xóa được".
- **Thay đổi so với:** ghi chú thiết kế ở `tài-liệu/kiến-trúc/data-model.md` ("Không xóa cứng `Users`, `MenuItems`, `Ingredients` (dùng `IsActive`) vì có FK từ lịch sử") và FEATURE-009 ("Không xóa cứng").

## Quyết định

Có nút **Xóa** cho món, danh mục, bàn, nguyên liệu và tài khoản nhân viên. Mỗi lần xóa đi qua một stored procedure:

| Đối tượng | Xóa hẳn khi | Xóa mềm (`DeletedAt`) khi | Chặn |
| --- | --- | --- | --- |
| Món | Chưa từng có trong đơn nào (xóa luôn BOM của món) | Đã có trong đơn → ẩn vĩnh viễn, không bán được | — |
| Danh mục | Không còn món nào | Chỉ còn món đã xóa mềm | Còn món đang dùng → `409 HAS_ITEMS` |
| Bàn | Chưa từng có phiên | Đã có phiên → mã QR hết hiệu lực ngay | Bàn đang có khách (phiên mở) → `409 TABLE_BUSY` |
| Nguyên liệu | Chưa có giao dịch kho/đơn nào | Đã có lịch sử kho | Đang nằm trong BOM của món chưa xóa → `409 IN_USE`; đang giữ cho đơn → `409 HAS_RESERVED` |
| Tài khoản | Chưa từng thao tác (tạo/hoàn tất/hủy đơn, thu tiền, đóng phiên, điều chỉnh kho) | Đã có thao tác → không đăng nhập được, token cũ hết hiệu lực | Tự xóa mình → `400 CANNOT_DELETE_SELF` |

Bản ghi đã xóa mềm:

- biến mất khỏi mọi danh sách quản lý, menu khách và màn hình quầy;
- vẫn còn cho báo cáo, lịch sử đơn và lịch sử kho (tên món, tên nhân viên… hiển thị đúng);
- tên/mã của nó **được dùng lại** cho bản ghi mới (unique index lọc `WHERE DeletedAt IS NULL`).

Xóa không khôi phục được qua giao diện.

## Hệ quả

- Migration `0002_xoa_mem.sql`: thêm `DeletedAt` cho `Users`, `Tables`, `Categories`, `MenuItems`, `Ingredients`; đổi unique của `Username`, `Tables.Code`, `Ingredients.Name` thành index có lọc.
- SP mới: `sp_DeleteMenuItem`, `sp_DeleteCategory`, `sp_DeleteTable`, `sp_DeleteIngredient`, `sp_DeleteUser` (trả `DELETED` | `ARCHIVED`).
- API: `DELETE /api/admin/{menu-items|categories|tables|ingredients|users}/{id}` → `200 { result }`.
- Mọi truy vấn danh sách/tra cứu loại bản ghi có `DeletedAt`; báo cáo và lịch sử thì không.
