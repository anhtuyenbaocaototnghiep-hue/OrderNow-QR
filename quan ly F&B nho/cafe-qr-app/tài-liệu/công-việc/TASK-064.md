# TASK-064 — Tra cứu API trong Quản lý
Status: READY_FOR_REVIEW (23/10/2026)
Feature: [FEATURE-052](../chức-năng/FEATURE-052.md) · Quyết định: [ADR-011](../quyết-định/ADR-011-tra-cuu-api.md) D-49…D-51 · Module: MOD-ADMIN · Màn hình: SCR-46 (mới — Quản lý → Vận hành → Tra cứu API)
Nguồn: chủ dự án hỏi 23/10/2026 ("sao bạn không làm tra cứu API trên localhost:3000 luôn"); chọn: mọi môi trường, chỉ ADMIN xem. · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-064-tra-cuu-api` · Phụ thuộc: F-009 (đăng nhập, quyền), F-036 (ma trận quyền `PERMISSIONS`)

## Mục tiêu
- Quản lý xem được mọi API đang chạy (method, đường dẫn, quyền) ngay trong trang Quản lý, kèm request / response / mã lỗi từ `api-contract.md`.
- Danh sách tự đúng với code: thêm API mới là trang tự có.
- Chỉ ADMIN xem được.

## Kế hoạch
1. Tài liệu trước code: ADR-011, FEATURE-052, BR-084, US-052-1…2, task này.
2. `app.js`: bảng router dưới `/api` (tiền tố + router) dùng để gắn route và lưu `app.locals.apiRouters`.
3. `auth/permissions.js`: hàm do `requirePermission(p)` tạo mang `permission = p`.
4. `routes/apiDocs.js` (mới): duyệt router lấy method + đường dẫn + middleware quyền → mức quyền; `GET /api/admin/api-docs` gắn dưới `adminRouter`.
5. `services/apiDocsService.js` (mới): đọc bảng trong `api-contract.md` (đọc lại khi file đổi), ghép mô tả theo method + đường dẫn, gán khu vực / tài nguyên.
6. Giao diện: `admin/api-docs.html` + `js/pages/admin-api-docs.js` (mới), mục "Tra cứu API" trong `admin-shell.js`, CSS ở `admin.css`.
7. Test: `tests/api-docs.test.js`; E2E "tra cứu API…"; a11y quét thêm `/admin/api-docs`.
8. Đồng bộ docs, chạy toàn bộ lệnh kiểm chứng, review G3 độc lập, gộp `main`.

## Phạm vi sửa
- **Server:**
  - `app.js` (bảng router);
  - `config.js` (`apiContractFile`);
  - `auth/permissions.js` (`permission` trên middleware);
  - `routes/apiDocs.js`, `services/apiDocsService.js` (mới);
  - `routes/admin.js` (gắn `apiDocsRouter`), `routes/pages.js` (trang mới).
- **Giao diện:**
  - `admin/api-docs.html`, `js/pages/admin-api-docs.js` (mới);
  - `admin-shell.js` (menu);
  - `css/admin.css`.
- **Test:**
  - `tests/api-docs.test.js`;
  - E2E "tra cứu API…";
  - a11y quét thêm `/admin/api-docs`.
- **Tài liệu:**
  - ADR-011, FEATURE-052, BR-084, US-052-1…2, AF-ADMIN-37, UC-17 (E8);
  - `tc-map`, `traceability`, `api-contract`, `roles-permissions`, `sitemap`, `module-map`, `uat-plan` (UAT-28);
  - số liệu tổng: `test-strategy`, `local-development`, `quy-trình-15-bước`;
  - hướng dẫn `chức-năng-mới/29-tra-cứu-api.md`.

## Không được sửa
- Đường dẫn, quyền, request / response của mọi API hiện có (chỉ thêm `GET /api/admin/api-docs`).
- Thứ tự gắn router dưới `/api` (đổi thứ tự làm đổi middleware nào chạy trước).
- Không thêm dependency (không Swagger / OpenAPI), không migration.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`.

## Cần hỏi duyệt nếu
- Muốn gọi thử API ngay trên trang (nút "Gửi" thật, kể cả POST / DELETE).
- Muốn mở trang cho trưởng ca / nhân viên, hoặc cho người chưa đăng nhập.
- Muốn xuất file OpenAPI / Swagger.

## Kết quả thực chạy (23/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **292/292 PASS** (25 file — thêm `api-docs.test.js` 6 test, gồm 2 test review G3) |
| `npm run test:e2e` | **40/40 PASS** (37 luồng + 3 khả năng tiếp cận; thêm E2E "tra cứu API…", a11y quét thêm `/admin/api-docs`) |
| `npm run trace -- --check` | 129 US, 321 AC — PASS 321, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Chụp màn hình thử trên `CafeQrDev` (1366px, 390px) | Trang hiện 266 endpoint, 232 có mô tả (sau khi thêm dòng `GET /api/admin/api-docs` và sửa 2 dòng viết gọn mơ hồ trong api-contract); tìm "settle" còn 4 dòng; không lỗi JS; điện thoại không cuộn ngang |

**Phát hiện khi làm:** 34 endpoint quản lý (hội viên, hạng, combo, khuyến mãi, gợi ý, tùy chọn món, kiểm kê / phiếu nhập bản quản lý, cài đặt…) chỉ được nhắc gọn trong đoạn văn của `api-contract.md`, chưa có dòng bảng → trang ghi "chưa có mô tả". Bổ sung bảng cho các endpoint này là việc tài liệu riêng, chưa làm trong task này.

## Review G3 (agent độc lập, 23/10/2026)
Kết luận lần 1: **Request changes** (1 phải sửa, còn lại nên làm). Đã kiểm đúng: thứ tự gắn router không đổi; 266 endpoint không trùng, không route nào bị route trước che; quyền trên trang khớp middleware ở mọi route hiện có; chỉ ADMIN gọi được; giao diện không chèn HTML từ api-contract. Đã sửa:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | Dòng `` `GET /api/admin/purchase-orders?status=` · `GET` / `POST` / `PUT …/{id}` `` bị hiểu thành `POST …/{id}` (không tồn tại) → `POST /api/admin/purchase-orders` hiện "chưa có mô tả". Dòng `` `POST` / `PUT /api/admin/menu-items` `` gắn ghi chú `prepSeconds` vào `PUT` không tồn tại | Viết lại 2 dòng trong api-contract. Test mới: mọi dòng bảng phải trỏ tới endpoint đang chạy — **FAIL với api-contract cũ** (2 khóa mồ côi), PASS sau khi sửa |
| N1 | `…` trơn làm `joinRelative` lỗi → `catch` chung nuốt mất, trang báo "không đọc được file"; chữ như `TARGET /api/x` bị hiểu là `GET` | Bỏ qua `…` không có đường dẫn; chỉ lỗi đọc file mới là "không có file"; regex có ``. Có trong test mới |
| N2 | `contract.file` tính theo thư mục đang chạy → hiện `../..` khi server chạy từ chỗ khác | Tính theo gốc repo (`config.repoRoot`) |
| N3 | Duyệt router không giống Express: middleware cấp router gắn không tiền tố cũng chặn router anh em gắn sau; middleware gắn có tiền tố bị coi như chặn tất cả | Mang middleware sang router anh em gắn sau; bỏ qua middleware gắn có tiền tố. Test mới gọi thật mọi endpoint có quyền (> 500 lần): không token 401, vai thấp hơn 403 — trang ghi sai quyền là test báo |
| N4 | E2E không chứng minh ô Tìm có lọc | Thêm: dòng `/api/menu` ẩn sau khi tìm "settle", số dòng hiện = "Đang hiện N / M", N < M |
| N5 | a11y không quét phần chi tiết (dựng khi mở dòng) | Mở một dòng rồi quét, kèm kiểm không cuộn ngang ở 320 / 390 px |
| N6 | Quyền "Nhân viên" ở duyệt / hủy khoản quỹ dễ hiểu nhầm (server còn kiểm vai trong service) | Dòng ghi chú trên trang: quyền là lớp chặn đầu tiên, một số thao tác còn kiểm thêm |
| N7 | Không có dấu hiệu dòng bấm mở được; nút "Mở trong tab mới" ở `/api/queue/eta` trả 400 | Thêm mũi tên mở / đóng; bỏ nút mở tab (đúng D-51: trang chỉ đọc, không gọi thử) |
| N8 | Tên quyền gõ sai trong code sẽ hiện "Quản lý" dù server chặn mọi vai | Test mới kiểm mọi quyền con có ít nhất một vai |

