# 29. Tra cứu API

> Trang dành cho **quản lý / người bảo trì app**: xem mọi API mà server đang chạy, mỗi API cần đăng nhập vai gì, gửi gì lên và nhận gì về. Dùng khi sửa app, kiểm thử bằng Postman / curl, hoặc nối thêm phần mềm khác. Nhân viên và trưởng ca không mở được trang này.

**Ai dùng:** **Quản lý** (tài khoản ADMIN).

## Mở trang

**Quản lý → Tra cứu API** (cuối nhóm Vận hành), hoặc gõ thẳng `/admin/api-docs` (ví dụ `http://localhost:3000/admin/api-docs`).

Dòng đầu trang cho biết có bao nhiêu API đang chạy và bao nhiêu API có mô tả chi tiết. Danh sách đọc thẳng từ code mỗi lần mở trang, nên thêm API mới là trang tự có, không phải sửa tay.

## Tìm và lọc

- Ô **Tìm**: gõ một phần đường dẫn, chức năng hoặc mã lỗi. Gõ không dấu cũng được. Ví dụ `settle`, `chia bill`, `OUT_OF_STOCK`.
- **Method**: GET (đọc), POST (tạo / làm một việc), PUT / PATCH (sửa), DELETE (xóa).
- **Quyền**: ai gọi được API đó:
  - **Công khai**: khách, không cần đăng nhập;
  - **Khách hoặc quầy**: khách dùng được; quầy gọi kèm đăng nhập thì thấy rộng hơn;
  - **Nhân viên**: mọi tài khoản quầy;
  - **Trưởng ca**: trưởng ca hoặc quản lý;
  - **Quản lý**: chỉ quản lý.
- **Khu vực**: Khách / Quầy / Quản lý.

## Xem chi tiết một API

Bấm vào một dòng (có mũi tên ở đầu dòng) để mở:

- **Request / Response / Lỗi**: lấy nguyên văn từ tài liệu `tài-liệu/kiến-trúc/api-contract.md`, ghi rõ lấy từ mục nào. API chưa có dòng trong tài liệu hiện *"Chưa có mô tả trong api-contract.md"*.
- **Quyền**: các vai gọi được, kèm tên quyền chi tiết nếu có (ví dụ `stocktake.post`).
- **Sao chép lệnh curl**: chép sẵn lệnh để chạy thử trong cửa sổ dòng lệnh. Thay `<token>` bằng mã đăng nhập: gọi `POST /api/auth/login` với tên đăng nhập + mật khẩu, lấy giá trị `accessToken`.

**Lưu ý:**

- Trang **chỉ để xem**, không gửi thử API và không đổi dữ liệu của quán.
- Không có mật khẩu, mã bí mật hay dữ liệu khách nào trên trang.
- Quyền hiện trên trang là lớp kiểm tra đầu tiên. Một số giới hạn sâu hơn (hạn mức giảm giá, khoản chi lớn cần duyệt…) vẫn kiểm trong server.

*Kỹ thuật: [FEATURE-052](../tài-liệu/chức-năng/FEATURE-052.md).*
