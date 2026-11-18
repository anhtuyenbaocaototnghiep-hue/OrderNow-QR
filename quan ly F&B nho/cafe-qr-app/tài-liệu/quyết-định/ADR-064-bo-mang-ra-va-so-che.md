# ADR-064 — Gọn màn quầy: bỏ dải "Mang ra" / nút "Đã mang" và bỏ "Sơ chế"

- **Trạng thái:** ACCEPTED (18/11/2026).
- **Chủ dự án duyệt:**
  - ảnh dải "Mang ra · Bàn 01 · 1 ly · Đã mang" kèm câu "bỏ ko cần thiết có phần này đâu";
  - ảnh thẻ "Sơ chế" (Pha một mẻ) ở Kho của máy quầy kèm câu "bỏ sơ chế ko cần thiết".
- **Thay một phần:**
  - [ADR-049](ADR-049-man-quay-mot-man-hinh.md) D-217 — bước "Đã mang" ra bàn;
  - phần giao diện sơ chế của F-027 (bán thành phẩm, ADR-006 giai đoạn 5).
- **Bối cảnh:**
  - **Bước "Đã mang" (F-088):** người đứng quầy phải bấm thêm một nút cho mỗi đơn đã pha xong. Quán nhỏ, nhân viên mang món ra là xong, không cần ghi lại.
  - **Thẻ "Sơ chế":** quán không pha mẻ bán thành phẩm ở quầy. Nguyên liệu làm sẵn (như cà phê cốt) được nhập / kiểm kê như nguyên liệu thường.
  - Hai phần này làm màn quầy rối hơn mà không dùng tới.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-253 | **Bỏ dải "Mang ra" và nút "Đã mang".**<ul><li>Món tại bàn pha xong (Hoàn tất / Xong) là xong.</li><li>Điện thoại khách về lại 3 bước (Đã gửi · Đang chuẩn bị · Xong); nhãn khi xong là "Đã xong".</li><li>Hộp báo món xong vẫn ghi theo cài đặt "Món tại bàn pha xong": "nhân viên đang mang ra bàn" hoặc "vui lòng nhận tại quầy". Cài đặt này giữ nguyên, chỉ còn đổi lời báo cho khách.</li><li>API `POST /api/orders/{id}/served`, sự kiện `order.served` và trường `servedAt` của đơn bị bỏ.</li><li>Cột `Orders.ServedAt` / `ServedBy` giữ nguyên (không xóa dữ liệu cũ), không ghi nữa.</li></ul> |
| D-254 | **Bỏ "Sơ chế" khỏi giao diện.**<ul><li>Kho ở quầy không còn thẻ "Sơ chế" (pha một mẻ); mở vào thẻ **Tồn kho**. Mục điều hướng "Kho & sơ chế" đổi tên thành **"Kho"**.</li><li>Trang Nguyên liệu không còn chọn loại "Bán thành phẩm", không còn "Công thức" sơ chế. Nguyên liệu đã là bán thành phẩm vẫn giữ loại khi lưu.</li><li>Nhãn quyền vị trí Pha chế còn "Nhận / làm đơn, hủy hàng, nhận hàng".</li><li>**Giữ ở máy chủ:**<ul><li>API sơ chế / công thức (`/api/prep/*`, `/api/admin/ingredients/{id}/recipe`);</li><li>cách trừ kho và tính giá vốn qua bán thành phẩm, lịch sử mẻ, lô nguồn "Sơ chế".</li></ul>Nhờ vậy dữ liệu cũ vẫn đúng và báo cáo cũ không đổi.</li><li>Bán thành phẩm cũ (ví dụ "Cà phê cốt") vẫn bán, nhập kho, kiểm kê như nguyên liệu thường.</li></ul> |

## Phương án đã cân nhắc

- **Chỉ đổi cài đặt "Món tại bàn" sang "khách nhận tại quầy" để dải Mang ra tự ẩn:** không đúng thực tế (quán vẫn mang món ra bàn), khách sẽ bị mời ra quầy nhận. Bỏ.
- **Xóa hẳn F-027 ở máy chủ** (API, bảng, cách trừ kho qua bán thành phẩm): phải đổi cách tính giá vốn, hạn dùng, kiểm kê đang dùng dữ liệu cũ, và cần migration xóa dữ liệu (phá hủy). Bỏ: chỉ bỏ giao diện.
- **Ẩn bằng công tắc ở Cài đặt** (như chế độ cơ bản F-061): chủ quán nói "không cần thiết", thêm công tắc là thêm việc. Bỏ.

## Hệ quả

- **Mã nguồn:**
  - **Màn quầy:** bỏ dải "Mang ra" (`#serve-strip`, kiểu chữ, vòng xét lại mỗi phút, sự kiện).
  - **Điện thoại khách:** bỏ bước 4, bỏ nhãn "Đang / Đã mang ra bàn".
  - **Máy chủ:** bỏ route `served`, `orderService.markServed`, `ordersRepo.markServed`, trường `servedAt` của đơn.
  - **Kho ở quầy:** bỏ thẻ Sơ chế, Tồn kho là thẻ đầu.
  - **Trang Nguyên liệu:** bỏ chọn loại, bỏ công thức.
  - **Nhãn và lời nhắc:** "Kho & sơ chế" → "Kho" (thanh quầy, lời nhắc hết hạn trong cảnh báo / email, mô tả nhóm Kho hàng); nhãn quyền Pha chế bỏ chữ "sơ chế".
- **CSDL:** không migration. Cột `ServedAt` / `ServedBy` và bảng sơ chế giữ.
- **Tài liệu:**
  - FEATURE-088: BR-126.4, AC-088-03, AC-088-07, AC-088-08;
  - FEATURE-027: ghi chú bỏ giao diện, AC-027-01 chỉ còn bằng chứng API;
  - api-contract, realtime-events, data-model, screens-flows, sitemap, roles-permissions;
  - các FEATURE nhắc "Kho & sơ chế".
- **Test:**
  - `single-screen.test.js` AC-088-03 (không còn bước "Đã mang": `/served` → 404, đơn không có `servedAt`);
  - E2E AC-088-07 / AC-088-08 (không có dải "Mang ra", khách thấy "Đã xong" 3 bước);
  - E2E kho ở quầy (không còn thẻ Sơ chế, mở thẻ Tồn kho);
  - nhãn "Kho".
