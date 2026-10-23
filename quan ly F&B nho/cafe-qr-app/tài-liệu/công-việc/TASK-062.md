# TASK-062 — Hủy / sửa khoản sổ quỹ đã duyệt
Status: READY_FOR_REVIEW (21/10/2026)
Feature: [FEATURE-050](../chức-năng/FEATURE-050.md) · Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-44, D-45 · Module: MOD-SHIFT, MOD-ADMIN (nhật ký) · Màn hình: SCR-15 (Ca & hoàn tiền), SCR-36 (Sổ quỹ)
Nguồn: chủ dự án yêu cầu 21/10/2026 ("sửa hủy khoản sổ quỹ đã duyệt"); chọn "hủy giữ lịch sử, chỉ khi ca còn mở" + "trưởng ca + quản lý". · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-062-huy-khoan-so-quy` (tách từ TASK-061) · Phụ thuộc: TASK-045 (F-033 sổ quỹ), TASK-044 (F-036 trưởng ca)

## Mục tiêu
- Khoản thu / chi đã duyệt nhập sai thì hủy được (giữ lịch sử, bắt buộc lý do), hoặc sửa trong một thao tác (hủy + khoản thay thế đi qua duyệt như thường).
- Chỉ khi ca còn mở. Quyền như duyệt.
- Tiền dự kiến trong két, chốt ca, sổ quỹ, lãi / lỗ tự đúng.

## Phạm vi sửa
- **CSDL:**
  - `chuyển-đổi/0037_huy_khoan_so_quy.sql`;
  - `thủ-tục/sp_VoidCashTxn.sql`;
  - `sp_DeleteUser.sql` (`VoidedBy` là lịch sử).
- **Server:**
  - `errors.js` (50142…50145);
  - `cashRepo` (cột hủy / thay thế, `shiftOpen`, `voidTxn`);
  - `cashService.voidTxn`;
  - `routes/finance.js`;
  - `middleware/audit.js` (`cash.void`).
- **Giao diện:** `js/cash-book.js` (nút Sửa / Hủy, hộp `voidDialog`, nhãn "Đã hủy"), dùng chung cho màn Ca và Sổ quỹ quản lý.
- **Test:**
  - `tests/cash-void.test.js`;
  - bất biến `CASH_REPLACE_LINK`;
  - E2E "sổ quỹ: hủy / sửa…".
- **Tài liệu:**
  - FEATURE-050, BR-079, BR-080, US-050-1…2, AF;
  - `tc-map`, `api-contract`, `data-model`, `roles-permissions`, `sitemap`;
  - hướng dẫn `chức-năng-mới/18-sổ-quỹ.md`.

## Không được sửa
- Số liệu của ca đã đóng.
- Cách ghi khoản / duyệt hiện có.
- Công thức tiền dự kiến (vẫn chỉ tính `APPROVED`).

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` (gồm `SHIFT_EXPECTED_CASH`) · `npm run test:e2e` · `npm run trace -- --check`.

## Cần hỏi duyệt nếu
- Muốn hủy khoản của ca đã đóng.
- Muốn nới quyền cho nhân viên.

## Kết quả thực chạy (21/10/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **276/276 PASS** (22 file — thêm `cash-void.test.js` 4 test; bất biến `SHIFT_EXPECTED_CASH`, `CASH_REPLACE_LINK` đúng sau mọi bộ) |
| `npm run test:e2e` | **38/38 PASS** (gồm E2E "sổ quỹ: hủy / sửa…") |
| `node kịch-bản/traceability.js --check` | 123 US, 310 AC — PASS 310, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| Sau khi sửa theo review G3 | `npm test` **279/279** (`cash-void.test.js` 6 test), E2E **38/38**, truy vết 310/310 |

## Review G3 (agent độc lập, 21/10/2026)
Kết luận: **Approve with comments**. Khóa / tổng / quyền đúng; không lách được ngưỡng duyệt (sửa thành khoản lớn → khoản mới chờ duyệt, người sửa không tự duyệt được). Đã xử lý:

| # | Phát hiện | Xử lý |
| --- | --- | --- |
| M1 (phải sửa) | CSV sổ quỹ: khoản đã hủy có cột Trạng thái trống, không có người / lý do hủy. Cộng cột Số tiền sẽ tính cả khoản đã hủy | `STATUS_VI` thêm "Đã hủy". Thêm cột: Khoản #, **Tính vào tổng** (chỉ khoản đã duyệt), Người hủy, Lý do hủy, Thay bằng khoản #. Thêm lọc `status=VOIDED` (API + màn quản lý). Có test |
| N1 | Bảng chưa hiện lúc hủy và số khoản; dưới nhãn "Đã hủy" lại ghi người duyệt cũ | Hiện `#số khoản`, dòng "Hủy <lúc>: lý do (người)"; dưới nhãn "Đã hủy" ghi người hủy |
| N2 | "Gắn ảnh" hiện cả ở khoản đã hủy / từ chối; API cho thay ảnh (xóa ảnh cũ) | Ẩn nút; API trả `409` cho khoản đã hủy / từ chối (ảnh giữ làm chứng từ). Có test |
| N3 | Thiếu test cho các trường hợp: khoản thay thế sai, sửa vào danh mục cần duyệt, trưởng ca sửa thành khoản lớn, nhân viên nhập tài khoản, hủy cùng lúc | Thêm 1 test gộp. Hủy song song với đóng ca: đã phân tích khóa (không deadlock), chưa có test riêng |
| N4 | Bất biến chỉ kiểm một chiều | `CASH_REPLACE_LINK` kiểm hai chiều. CSDL thêm vào `0037` (chưa chạy trên `CafeQrDev`): <br>• `CK_CashTxn_Voided`: khoản đã hủy phải có người / lúc / lý do; <br>• `UX_CashTxn_Replaces`: một khoản bị thay chỉ có một khoản thay thế |
| N5 | Hộp Sửa: <br>• danh mục cũ đã ngừng dùng → tự chọn nhầm danh mục đầu; <br>• nội dung cũ dài quá 180 ký tự → 400; <br>• sửa mà không đổi gì vẫn tạo khoản trùng | Hiện "(ngừng dùng — chọn danh mục khác)" và bắt chọn; cắt nội dung còn 180 ký tự; chặn "Chưa thay đổi gì". Ghi rõ trên hộp: khoản mới chờ duyệt mà bị từ chối thì cả hai không tính; ảnh không chuyển sang khoản mới |

**Cần chủ dự án quyết (ghi lại, chưa đổi):**
- **N6:** theo D-45, trưởng ca một mình hủy được khoản **thu** ≤ 2.000.000đ do người khác ghi, làm giảm tiền dự kiến trong két mà không cần người thứ hai. Trong khi đó ghi khoản chi > 500.000đ lại cần hai người.
  - Đã có dấu vết: `VoidedBy`, nhật ký `cash.void`.
  - Muốn chặt hơn: hủy khoản thu cần quản lý, hoặc hiện các lần hủy lên màn "Hôm nay".
- **N7:** khoản thay thế mang thời điểm **lúc sửa**. Ca qua nửa đêm thì chi phí sang ngày hôm sau ở lãi / lỗ và bộ lọc ngày.
