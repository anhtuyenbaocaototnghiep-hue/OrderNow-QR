# FEATURE-050 — Hủy / sửa khoản sổ quỹ đã duyệt

> **Nguồn:** chủ dự án yêu cầu 21/10/2026: "sửa hủy khoản sổ quỹ đã duyệt". Quyết định: [ADR-010](../quyết-định/ADR-010-chuyen-ban-so-quy-danh-gia.md) D-44, D-45. Bổ sung cho [FEATURE-033](FEATURE-033.md).

- **Status:** CONFIRMED (ADR-010 D-44, D-45) · Triển khai: [TASK-062](../công-việc/TASK-062.md)
- **Actor:**
  - **ACT-LEAD:** khoản ≤ 2.000.000đ, không phải khoản mình ghi;
  - **ACT-ADMIN:** mọi khoản;
  - **ACT-STAFF:** chỉ khi trưởng ca / quản lý nhập tài khoản.
- **Màn hình:** **Quầy → Ca & hoàn tiền → Sổ quỹ trong ca** (S-15), và **Quản lý → Sổ quỹ** (S-36).
  - Khoản **Đã duyệt** của ca đang mở có nút **Sửa** và **Hủy**.
  - **Hủy:** hộp hỏi lý do (+ tài khoản người duyệt nếu cần).
  - **Sửa:** form như ghi khoản mới, điền sẵn danh mục / số tiền / nội dung, + lý do sửa.
  - Khoản đã hủy hiện nhãn **Đã hủy** (dòng mờ), kèm người / lúc / lý do và "Thay bằng khoản #M" nếu là sửa.
- **Dữ liệu:** migration `0037_huy_khoan_so_quy.sql`. `CashTransactions`:
  - `CK_CashTxn_Status` thêm `VOIDED`;
  - thêm `VoidedBy`, `VoidedAt`, `VoidReason`, `ReplacedById` (khoản thay thế), `ReplacesId` (khoản bị thay).
- **SP:** `sp_VoidCashTxn` (mới).

## User Story

- **US-050-1:** Là trưởng ca, tôi muốn hủy một khoản chi / thu đã duyệt bị ghi nhầm mà vẫn giữ lịch sử, để tiền dự kiến trong két đúng trước khi chốt ca.
- **US-050-2:** Là trưởng ca, tôi muốn sửa số tiền / danh mục / nội dung của khoản đã duyệt trong một thao tác, để không phải hủy rồi ghi lại bằng tay.

## Quy tắc (D-44, D-45)

1. Chỉ khoản **đã duyệt** (`APPROVED`).
   - Khoản chờ duyệt → dùng Từ chối.
   - Khoản đã từ chối / đã hủy → `409 CASH_NOT_APPROVED`.
2. Chỉ khi **ca của khoản còn mở**. Ca đã đóng → `409 SHIFT_CLOSED`. SP khóa ca như `sp_CreateCashTxn`, nên chạy tuần tự với đóng ca.
3. **Bắt buộc lý do** → nếu thiếu: `400`.
4. **Quyền:** như duyệt (F-033).
   - Trưởng ca: khoản ≤ `manager.cash_out_approve_max`. Quản lý: mọi khoản.
   - Không tự hủy khoản do chính mình ghi, trừ quản lý → `403 SELF_APPROVAL`.
   - Nhân viên: cần trưởng ca / quản lý nhập tài khoản.
5. **Hủy:** khoản → `VOIDED`, không còn tính vào tiền dự kiến, sổ quỹ, lãi / lỗ (các tổng chỉ tính `APPROVED`). Ảnh hóa đơn giữ lại.
6. **Sửa** = hủy khoản cũ + tạo khoản thay thế, **cùng transaction**.
   - Khoản mới theo quy tắc ghi khoản: chi vượt ngưỡng / danh mục cần duyệt → **chờ duyệt**, còn lại được duyệt ngay.
   - Nội dung khoản mới tự thêm "(thay khoản #N)".
   - Khoản mới do **người sửa** ghi.
   - Khoản cũ ghi `ReplacedById`, khoản mới ghi `ReplacesId`.
7. **Realtime:** `cash.reviewed` (khoản cũ) + `cash.created` (khoản thay thế) tới quầy.
8. **Nhật ký thao tác:** `cash.void`.
9. **Xuất CSV** (review G3): có cột Khoản #, **Tính vào tổng** (chỉ khoản đã duyệt), Trạng thái "Đã hủy", Người hủy, Lý do hủy, Thay bằng khoản #. Lọc được trạng thái "Đã hủy".
10. **Ảnh hóa đơn** của khoản đã hủy / từ chối giữ nguyên làm chứng từ: không gắn / thay được (`409`). Ảnh không chuyển sang khoản thay thế.

## API

| Method & path | Quyền | Body → kết quả |
| --- | --- | --- |
| `POST /api/cash-transactions/{id}/void` | `cash.create` + quyền duyệt (D-45) | `{ reason, replacement?: { categoryId, amount, reason }, adminUsername?, adminPassword? }` → `{ voided, replacement }` |

## Acceptance Criteria

- AC-050-01: Ca đang mở, khoản chi "Mua đá" 50.000đ đã duyệt (nhân viên ghi) → trưởng ca hủy kèm lý do. Kết quả:
  - khoản "Đã hủy" (người / lúc / lý do);
  - tiền dự kiến trong két tăng lại 50.000đ;
  - đóng ca đếm đúng → chênh 0;
  - sổ quỹ quản lý không còn tính khoản này.
- AC-050-02: Sửa khoản 50.000đ thành 80.000đ (cùng danh mục) → khoản cũ "Đã hủy", khoản mới 80.000đ "Đã duyệt" ghi "(thay khoản #N)", két chỉ trừ 80.000đ. Sửa thành 800.000đ (vượt ngưỡng) → khoản mới **chờ duyệt**, két chưa trừ; đóng ca → `409 CASH_PENDING`.
- AC-050-03: Quyền và trạng thái:
  - nhân viên tự hủy → `403`; nhân viên kèm tài khoản trưởng ca → được;
  - trưởng ca hủy khoản > 2.000.000đ → `403`;
  - trưởng ca hủy khoản do chính mình ghi → `403 SELF_APPROVAL`; quản lý hủy khoản mình ghi → được;
  - thiếu lý do → `400`;
  - khoản đang chờ / đã từ chối / đã hủy → `409 CASH_NOT_APPROVED`.
- AC-050-04: Khoản thuộc ca đã đóng → `409 SHIFT_CLOSED`, không đổi gì; tiền dự kiến / chênh lệch của ca đã đóng giữ nguyên.
- AC-050-05: Màn Ca & hoàn tiền:
  - khoản đã duyệt có nút Sửa / Hủy; Hủy hỏi lý do;
  - khoản thành "Đã hủy", ô "Chi quỹ (đã duyệt)" và "Tiền dự kiến trong két" cập nhật;
  - Sửa mở form điền sẵn → khoản mới xuất hiện.

## Bằng chứng

`tests/cash-void.test.js` (AC-050-01…04) · E2E "sổ quỹ: hủy / sửa khoản đã duyệt" (AC-050-05) · bất biến `SHIFT_EXPECTED_CASH` (F-033) vẫn đúng với khoản đã hủy.
