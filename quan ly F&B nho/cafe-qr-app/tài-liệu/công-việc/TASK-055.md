# TASK-055 — Sửa / xóa món đã gọi, hủy lượt phục vụ bàn
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 229/229, `npm run test:e2e` 28/28, `npm run load` 10/10, lint + prettier PASS — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-046 (US-046-1…3, AC-046-01…07) · BR-066…BR-070
Nguồn: yêu cầu chủ dự án 18/10/2026 · Quyết định: ADR-007 (D-33…D-35, chủ dự án chọn trước khi code) · Agent: Claude (lead) · Reviewer: chủ dự án / nhóm

## Mục tiêu
Ở drawer Thu tiền bàn: giảm / xóa món chưa thu, xóa cả đơn, hủy lượt phục vụ bàn — đúng phân quyền, kho, tiền; có lịch sử.

## Phạm vi sửa
- Migration `0033_sua_xoa_mon.sql`:
  - `OrderItemVoids`;
  - loại giao dịch kho `VOID_BACK`, `InventoryTransactions.VoidId`;
  - `Sessions.CancelledBy/CancelReason`;
  - `WasteLogs.VoidId`.
- SP:
  - mới `sp_VoidOrderItem.sql` (`sp_VoidLineCore`, `sp_RecalcOrder`, `sp_CloseIfSettled`, `sp_VoidOrderItem`), `sp_CancelOrders.sql`;
  - sửa `sp_RefundPayment` (trừ phần đã `VOID_BACK` khi hoàn kho).
- Backend:
  - `voidRepo`, `voidService`;
  - route trong `routes/staff.js`;
  - luật nhật ký `middleware/audit.js`;
  - mã lỗi `errors.js`.
- Frontend: `js/pages/pos-dashboard.js` (drawer Thu tiền), CSS.
- Test:
  - `tests/void.test.js`;
  - bất biến trong `tests/helpers/testDb.js`;
  - E2E `kiểm-thử/e2e/flow.spec.js`.
- Docs:
  - FEATURE-046, ADR-007, BR-066…070;
  - data-model, api-contract, realtime-events, screens-flows, roles-permissions, workflows-states;
  - `chức-năng-mới/` (hướng dẫn 25).

## Không được sửa
- Luồng thu tiền / chia bill / hoàn tiền ngoài phần ghi ở trên.
- Migration cũ.
- Dữ liệu `CafeQrDev` ngoài việc chạy migration thêm.

## Phụ thuộc
F-007 (đơn), F-019 (hoàn tiền), F-026 (chia bill), F-028 (lô), F-031 (giá vốn), F-032 (hủy hàng), F-035 (nhật ký), F-036 (quyền).

## Validation
- `npm test`: toàn bộ + `void.test.js`, bất biến mới.
- `npm run test:e2e`, `npm run load`, `npm run lint`, `npm run format:check`.

### Kết quả thực chạy (18/10/2026, máy local, SQL Server thật)

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm test` | **229/229 PASS** (trước task: 217; thêm 12 test của `void.test.js`) |
| `tests/void.test.js` | **12/12 PASS**: AC-046-01…06, "Xóa đơn đã pha + hoàn kho theo lô", "Combo & tùy chọn", "đua với tiếp nhận đơn ×6", "hai máy cùng xóa một dòng", "nhật ký thao tác", "xóa tài khoản chỉ có lịch sử sửa / xóa món" |
| AC-046-07 | PASS — bất biến `OVER_RESTOCK`, `ORDER_LINES_MISMATCH`, `COGS_MISMATCH` (trừ `CogsReduction`) rỗng sau mọi file test |
| `npm run test:e2e` | **28/28 PASS** (trước: 27; thêm "sửa / xóa món + hủy bàn") |
| `npm run lint`, `npm run format:check` | PASS (0 lỗi) |
| `npm run db:migrate` trên `CafeQrDev` | `0033_sua_xoa_mon.sql` áp thành công; dữ liệu cũ giữ nguyên, không reset |
| `npm run load` | **10/10 vòng PASS**, NFR-001 p95 89 ms (máy local, 18/10/2026 sau F-046) |

## Lệch phạm vi (đã làm, trong các file SP thuộc phạm vi)
- **`sp_CloseIfSettled`** (trong `sp_VoidOrderItem.sql`): phiên đã thu một phần (chia bill) mà bỏ nốt món / đơn chưa thu cuối cùng → đơn còn toàn dòng đã thu thành `PAID`, phiên đóng như lượt thu phần cuối. Không có bước này thì bàn bị kẹt mở (không còn gì để thu, nhưng cũng không hủy bàn được vì đã có lượt thu). Ghi ở ADR-007 "Thích nghi kỹ thuật", BR-070.
- **`sp_DeleteUser`**: tính `OrderItemVoids.CreatedBy/ApprovedBy` và `Sessions.CancelledBy` là lịch sử → tài khoản chỉ từng sửa / xóa món, duyệt hoặc hủy bàn bị **xóa mềm** (trước đó xóa hẳn sẽ vướng khóa ngoại mới của `0033` → lỗi 500). Test: "xóa tài khoản chỉ có lịch sử sửa / xóa món".
- **`sp_RefundPayment`**: ngoài phần đã `VOID_BACK`, hoàn kho còn trừ phần đã **ghi hủy hàng** khi xóa món (`WasteLogs` gắn `VoidId`). Ghi ở ADR-007, BR-068.

## Phát hiện ngoài phạm vi (chưa sửa)
- E2E "chia bill…" thỉnh thoảng không ổn định: sheet chia bill của khách (`t-track.js`, `openSplit().refresh()`) vẽ lại khi có cập nhật realtime nên ô "Tên phần" mất focus lúc khách đang gõ → phần được lưu tên mặc định "Tôi". Ngoài phạm vi ("không sửa luồng chia bill") — ghi ở [Q-023](../open-questions.md).

## Cần hỏi duyệt nếu
Đổi quy tắc ADR-007, đổi API đã có, xóa dữ liệu thật.

## Đầu ra
Code + test + docs đồng bộ (FEATURE-046, ADR-007); hướng dẫn `chức-năng-mới/25-sửa-xóa-món-hủy-bàn.md`; bàn giao: `tài-liệu/chất-lượng/handover-2026-10-18.md` mục "Bổ sung F-046".
