# FEATURE-052 — Tra cứu API trong Quản lý

> **Nguồn:** chủ dự án hỏi 23/10/2026: "sao bạn không làm tra cứu API trên localhost:3000 luôn", chọn "Mọi nơi, chỉ ADMIN xem". Quyết định: [ADR-011](../quyết-định/ADR-011-tra-cuu-api.md) D-49…D-51.

- **Status:** CONFIRMED (ADR-011 D-49…D-51) · Triển khai: [TASK-064](../công-việc/TASK-064.md)
- **Actor:** **ACT-ADMIN** — quản lý / người bảo trì app, tra cứu API khi sửa, kiểm thử hoặc nối thêm phần mềm khác.
- **Màn hình:** **Quản lý → Vận hành → Tra cứu API** (SCR-46, mới, `/admin/api-docs`):
  - dòng tóm tắt: số endpoint đang chạy, số endpoint có mô tả trong `api-contract.md`, cách đăng nhập lấy token;
  - ô **Tìm** (đường dẫn, mô tả, mã lỗi; gõ không dấu được), chọn **Method**, **Quyền**, **Khu vực**;
  - danh sách theo khu vực (Khách / Quầy / Quản lý) → nhóm theo tài nguyên (`/sessions`, `/orders`, `/admin/members`…);
  - mỗi dòng: method, đường dẫn, quyền, mục đích; bấm để mở request / response / mã lỗi (ghi rõ lấy từ mục nào của `api-contract.md`), quyền chi tiết, nút **Sao chép lệnh curl**.
- **Dữ liệu:** không có bảng mới. Đọc router Express lúc chạy + file `tài-liệu/kiến-trúc/api-contract.md`.

## User Story

- **US-052-1:** Là quản lý (người bảo trì app), tôi muốn tra cứu mọi API đang chạy cùng quyền cần có và request / response ngay trong trang Quản lý, để biết gọi API nào, cần đăng nhập vai gì mà không phải đọc code.
- **US-052-2:** Là chủ quán, tôi muốn chỉ tài khoản quản lý xem được danh sách API, để nhân viên hay người ngoài không dò được các chức năng quản trị.

## Quy tắc (D-49…D-51)

1. **Ai xem:** chỉ ADMIN (`admin.all`). Nhân viên / trưởng ca → `403`; chưa đăng nhập → `401`. Bật ở mọi môi trường.
2. **Danh sách lấy từ code lúc chạy:** mọi route đăng ký dưới `/api` (method + đường dẫn đầy đủ). Không sót, không trùng.
3. **Quyền theo middleware của route:**
   - không có middleware quyền → **Công khai** (khách, cookie `cf_client`);
   - `optionalStaff` → **Khách hoặc quầy** (khách dùng cookie; quầy gửi kèm Bearer);
   - `requireStaff` → **Nhân viên** (STAFF, MANAGER, ADMIN);
   - `requirePermission(p)` → vai trong `PERMISSIONS[p]`: có STAFF → **Nhân viên**, chỉ MANAGER + ADMIN → **Trưởng ca**, chỉ ADMIN → **Quản lý**; ghi kèm tên quyền `p`;
   - `requireAdmin` (mọi route dưới `/api/admin`) → **Quản lý**.
   - Kiểm tra sâu hơn trong service (hạn mức giảm giá, khoản chi lớn cần duyệt…) không hiện ở đây.
4. **Mô tả ghép từ `api-contract.md`:** mọi dòng bảng có ô đầu nhắc tới endpoint (so khớp method + đường dẫn, `{id}` = `:id`). Không có dòng nào → "Chưa có mô tả trong api-contract.md". Không đọc được file → vẫn trả đủ danh sách, báo thiếu file.
5. **Chỉ đọc:** không gọi thử API, không hiện mã nguồn / secret / dữ liệu quán. Lệnh curl sao chép có `<token>` để trống.

## API

| Method & path | Quyền | Ghi chú |
| --- | --- | --- |
| `GET /api/admin/api-docs` | ADMIN | `{ generatedAt, contract: { file, found, documented }, total, endpoints[{ method, path, area, resource, access, roles[], permission, contract[{ section, fields[[tên, nội dung]] }] }] }`. `access` ∈ `PUBLIC`, `CLIENT_OR_STAFF`, `STAFF`, `MANAGER`, `ADMIN`; `area` ∈ `GUEST`, `POS`, `ADMIN` |

## Acceptance Criteria

- AC-052-01: Quản lý gọi `GET /api/admin/api-docs` → 200, mỗi endpoint đúng method, đường dẫn, quyền:
  - `POST /api/orders` → Công khai;
  - `GET /api/menu` → Khách hoặc quầy;
  - `POST /api/sessions/:id/settle` → Nhân viên;
  - `POST /api/ops/stocktakes` → Trưởng ca, quyền `stocktake.post`;
  - `POST /api/cash-transactions` → Nhân viên, quyền `cash.create`;
  - `GET /api/admin/reviews` và chính `GET /api/admin/api-docs` → Quản lý.
- AC-052-02: Không sót, không trùng: số endpoint của trang = số route khai báo trong `ứng-dụng/máy-chủ/src/routes/*.js` (trừ trang HTML); không có hai endpoint cùng method + đường dẫn.
- AC-052-03: Mô tả ghép từ `api-contract.md`:
  - `POST /api/orders` có request nhắc `Idempotency-Key` và lỗi `OUT_OF_STOCK`;
  - `PUT /api/members/:id/favorites/:menuItemId` (bảng ghi `` `PUT` / `DELETE …` ``) có mô tả;
  - endpoint chưa có dòng nào → mô tả rỗng;
  - không đọc được file → vẫn đủ danh sách, `contract.found = false`.
- AC-052-04: Nhân viên, trưởng ca gọi `GET /api/admin/api-docs` → `403`; chưa đăng nhập → `401`.
- AC-052-05: Trên trình duyệt, quản lý mở Quản lý → Tra cứu API:
  - thấy số endpoint đang chạy;
  - gõ "settle" → còn `POST /api/sessions/:id/settle`; mở dòng → thấy `INSUFFICIENT_AMOUNT`;
  - chọn quyền "Trưởng ca" → chỉ còn endpoint của trưởng ca;
  - trang đạt kiểm tra khả năng tiếp cận như các trang quản lý khác.

## Bằng chứng

`tests/api-docs.test.js` (AC-052-01…04) · E2E "tra cứu API…" (AC-052-05) · a11y quét `/admin/api-docs`.
