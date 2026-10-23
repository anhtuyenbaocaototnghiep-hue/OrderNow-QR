# ADR-011 — Trang Tra cứu API trong Quản lý

- **Trạng thái:** ACCEPTED (23/10/2026). Chủ dự án chọn phương án trong phiên làm việc ngày 23/10/2026, trả lời câu hỏi trước khi code: "Mọi nơi, chỉ ADMIN xem".
- **Bối cảnh:**
  - Chủ dự án hỏi "sao không làm tra cứu API trên localhost:3000 luôn" sau khi được xem danh sách API dạng trang rời (bản chụp, không tự cập nhật).
  - App có khoảng 265 endpoint REST dưới `/api`. Tài liệu [api-contract.md](../kiến-trúc/api-contract.md) ghi request / response / mã lỗi nhưng chia theo từng đợt bổ sung, khó tra; một số endpoint chỉ được nhắc gọn trong đoạn văn.
  - Chưa có Swagger / OpenAPI; thêm thư viện đó là dependency lớn (`.agent/rules.md`) và phải viết lại toàn bộ contract theo định dạng mới.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-49 | **Trang "Tra cứu API" trong Quản lý** (`/admin/api-docs`, SCR-46), **chỉ ADMIN** (`admin.all`), dùng được ở **mọi môi trường** (máy cá nhân, máy quán). <br>• Mỗi endpoint: method, đường dẫn, quyền cần có, mô tả request / response / mã lỗi. <br>• Tìm theo chữ (không dấu cũng được), lọc theo method, quyền, khu vực (Khách / Quầy / Quản lý). <br>• Nhân viên, trưởng ca gọi API của trang → `403`; chưa đăng nhập → `401`. |
| D-50 | **Danh sách endpoint lấy từ router Express lúc server chạy**, không chép tay: thêm API mới là trang tự có. <br>• Quyền đọc từ middleware gắn trên route: `requireAdmin`, `requireStaff`, `requirePermission(…)` (theo ma trận `PERMISSIONS`), `optionalStaff`; không có middleware quyền = công khai. <br>• Request / response / mã lỗi ghép từ `api-contract.md` theo method + đường dẫn (mọi dòng bảng nhắc tới endpoint đó). Endpoint chưa có dòng nào → ghi "chưa có mô tả", không tự viết thêm. <br>• Không đọc được `api-contract.md` → trang vẫn hiện đủ danh sách và báo thiếu file. |
| D-51 | **Chỉ để đọc.** Trang không gọi thử API, không hiện mã nguồn, secret hay dữ liệu của quán. Có nút "Sao chép lệnh curl" với token để trống (`<token>`). Xem trang không ghi nhật ký thao tác (nhật ký chỉ ghi thao tác đổi tiền / kho / quyền / giá — D-26). |

Chủ dự án **không chọn**:
- chỉ mở khi chạy trên máy (tắt khi `NODE_ENV=production`);
- mở tự do trên máy, chỉ ADMIN khi chạy thật.

## Thích nghi kỹ thuật

| Vấn đề | Cách làm | Lý do |
| --- | --- | --- |
| Express 5 không lưu tiền tố khi gắn router bằng `api.use('/admin', adminRouter)` | `app.js` khai báo bảng router dưới `/api` (tiền tố + router), dùng bảng này để gắn và lưu vào `app.locals.apiRouters`. Router con gắn không tiền tố (`adminRouter.use(marketingRouter)`) đi theo tiền tố của router cha | Một nguồn duy nhất cho cả gắn route lẫn tra cứu; không phải đoán đường dẫn |
| Nhận ra middleware quyền | So sánh đúng hàm (`requireAdmin`, `requireStaff`, `optionalStaff`); hàm do `requirePermission(p)` tạo mang thuộc tính `permission = p` | Không dựa vào tên hàm, đổi tên vẫn đúng |
| Ghép mô tả từ `api-contract.md` | Đọc mọi bảng có ô đầu ghi `METHOD /đường-dẫn` (kể cả dạng `PUT` / `DELETE …/{id}`), so khớp sau khi đổi `{id}` / `:id` thành cùng một dạng. Đọc lại khi file đổi (theo thời điểm sửa file) | Contract vẫn là tài liệu chính; trang chỉ trình bày lại |
| Kiểm tra không sót endpoint | Test đếm route khai báo trong `routes/*.js` và so với danh sách của trang | Phát hiện router mới gắn có tiền tố mà bảng chưa biết |
| Quyền trên trang lệch với server (review G3) | Middleware cấp router gắn không tiền tố áp cả cho router anh em gắn sau (đúng cách Express chạy); test gọi thật mọi endpoint có quyền: không token → 401, vai thấp hơn → 403 | Thêm `router.use(guard)` mới mà trang vẫn ghi quyền cũ thì test báo ngay |
| Dòng contract gắn nhầm endpoint (review G3) | Test: mọi dòng bảng trong `api-contract.md` phải trỏ tới endpoint đang chạy | Viết gọn mơ hồ (`` `GET` / `POST` / `PUT …/{id}` ``) bị phát hiện thay vì âm thầm gắn sai |

## Hệ quả

- Không có migration, không thêm dependency.
- API mới: `GET /api/admin/api-docs` (ADMIN).
- Feature: [FEATURE-052](../chức-năng/FEATURE-052.md) — [TASK-064](../công-việc/TASK-064.md).
- Business rule: BR-084.
- Màn hình: SCR-46 (Quản lý → Vận hành → Tra cứu API).
