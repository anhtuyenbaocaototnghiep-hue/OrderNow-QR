# FEATURE-033 — Sổ quỹ (thu / chi tiền mặt ngoài bán hàng)

> **Nguồn:** skill `advanced-features` §4 F-033. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-23; lệch ma trận ghi ở Q-022.

- **Status:** CONFIRMED (ADR-006 D-23) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:**
  - STAFF / MANAGER / ADMIN ghi khoản;
  - MANAGER (≤ 2.000.000đ) và ADMIN duyệt;
  - ADMIN xem sổ quỹ, xuất CSV, quản lý danh mục.
- **Màn hình:**
  - **Quầy → Ca & hoàn tiền:**
    - thẻ "Sổ quỹ trong ca" với nút **Chi tiền** / **Thu khác**;
    - bảng khoản có nút Duyệt / Từ chối / Gắn ảnh / 🧾 Ảnh;
    - ô số "Chi quỹ (đã duyệt)", "Thu khác".
    - Phiếu chốt ca in kèm bảng thu chi.
  - **Quản lý → Sổ quỹ:**
    - lọc theo ngày, loại, danh mục, trạng thái;
    - tổng theo danh mục;
    - nút **Xuất CSV**;
    - tab "Danh mục thu chi".
- **Dữ liệu:** migration `0026_so_quy.sql`:
  - `CashCategories(Name, Direction IN/OUT, IsExpense, RequiresApproval, IsActive, SortOrder)`. Seed:
    - chi: Mua đá, Điện nước, Trả shipper, Lương tạm ứng, Mua vật tư nhỏ, Nộp tiền về két tổng (không phải chi phí), Khác (chi) (luôn cần duyệt);
    - thu: Bổ sung tiền lẻ, Thu khác.
  - `CashTransactions(ShiftId, CategoryId, Direction, Amount > 0, Reason NOT NULL, ReceiptImagePath, Status PENDING|APPROVED|REJECTED, CreatedBy, ApprovedBy, ApprovedAt, RejectReason)`.
  - Setting `cash.approve_threshold = 500000`.
- **SP:**
  - `sp_CreateCashTxn`: khóa S trên ca đang mở → chạy tuần tự với `sp_CloseShift`;
  - `sp_ReviewCashTxn`: khóa dòng; hai người cùng duyệt → một người thắng, người sau nhận `409 CASH_NOT_PENDING`;
  - `sp_CloseShift` (viết lại).

## Quy tắc

1. **Phải có ca đang mở** (`409 NO_OPEN_SHIFT`). Khoản gắn vào ca hiện tại.
2. **Chi lớn hơn ngưỡng** (500.000đ) **hoặc danh mục "cần duyệt"** → `PENDING`.
   - Khoản chưa duyệt chưa trừ vào két.
   - Thu (IN) luôn được duyệt ngay.
3. **Duyệt / từ chối:**
   - trưởng ca duyệt khoản ≤ `manager.cash_out_approve_max` (2.000.000đ); lớn hơn → chỉ quản lý;
   - nhân viên đứng quầy duyệt bằng cách cho trưởng ca / quản lý nhập tài khoản (như giảm giá vượt ngưỡng);
   - **không tự duyệt khoản do chính mình tạo** (`403 SELF_APPROVAL`), trừ quản lý;
   - từ chối bắt buộc lý do.
4. **Chốt ca:**
   - `ExpectedCash = OpeningCash + Σ thu bán − Σ hoàn + Σ thu khác (đã duyệt) − Σ chi (đã duyệt)`;
   - ca còn khoản `PENDING` → `409 CASH_PENDING`;
   - người đóng ca được chấm công ra (F-035).
5. **Ảnh hóa đơn:**
   - jpg / png / webp, ≤ 2 MB; server kiểm chữ ký file, không tin `Content-Type`;
   - gửi bằng thân request là ảnh (không dùng multipart — ADR-006);
   - lưu `uploads/receipts/<id>-<ngẫu nhiên>.<đuôi>`, thư mục cấu hình bằng `UPLOADS_DIR`;
   - chỉ người ghi khoản hoặc trưởng ca / quản lý được gắn;
   - xem ảnh cần đăng nhập.
6. **Danh mục đã dùng** → xóa thành "ngừng dùng" (ADR-004).

## API

| Method & path | Quyền / ghi chú |
| --- | --- |
| `GET /api/cash-categories` | nhân viên — danh mục đang dùng |
| `POST /api/cash-transactions` | `cash.create` — `{ categoryId, amount, reason }` → `{ cashTxnId, status, … }` |
| `GET /api/cash-transactions?shiftId` | `cash.create` — mặc định ca đang mở |
| `PUT /api/cash-transactions/{id}/receipt` | thân = ảnh (`image/jpeg\|png\|webp`) ≤ 2 MB. Lỗi: `400 RECEIPT_TOO_LARGE`, `400 RECEIPT_INVALID` |
| `GET /api/cash-transactions/{id}/receipt` | nhân viên đăng nhập |
| `POST /api/cash-transactions/{id}/approve` | `{ adminUsername?, adminPassword? }`. Lỗi: `403` (không đủ quyền / tự duyệt), `409 CASH_NOT_PENDING` |
| `POST /api/cash-transactions/{id}/reject` | `{ rejectReason, adminUsername?, adminPassword? }` |
| `GET /api/admin/cash-transactions?from&to&categoryId&status&direction` | `{ rows, summary{ totalIn, totalOut, net, pending, byCategory[] } }` |
| `GET /api/admin/cash-transactions/export.csv?…` | CSV UTF-8 có BOM, chặn công thức Excel |
| `GET/POST /api/admin/cash-categories` · `PUT/DELETE …/{id}` | ADMIN |

Realtime `staff`: `cash.created`, `cash.reviewed` `{ txn }`.

## Acceptance Criteria

- AC-033-01: Chi 50.000đ mua đá → tiền dự kiến trong két giảm đúng 50.000đ; đóng ca đếm đúng số dự kiến → chênh 0.
- AC-033-02: Chi 800.000đ → `PENDING`; đóng ca → 409 `CASH_PENDING`; nhân viên duyệt → 403; trưởng ca duyệt → két trừ 800.000đ.
- AC-033-03: Ảnh > 2 MB → 400; file không phải ảnh → 400; png hợp lệ → lưu và tải lại đúng byte.
- AC-033-04: Trưởng ca không duyệt khoản > 2.000.000đ; không tự duyệt khoản của mình.
- AC-033-05: Bất biến:
  - `SHIFT_EXPECTED_CASH`: ca đã đóng có `ExpectedCash` đúng công thức;
  - `CLOSED_SHIFT_CASH_PENDING`: ca đã đóng không còn khoản chờ duyệt.

## Bằng chứng

- `tests/finance.test.js` → "Sổ quỹ (F-033)": 10 test.
- `tests/finance-unit.test.js` → CSV.
- E2E "trưởng ca + sổ quỹ…" (chi tiền ở màn Ca, duyệt khoản 800.000đ, sổ quỹ quản lý).
