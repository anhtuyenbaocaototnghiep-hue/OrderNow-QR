# FEATURE-046 — Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn

> **Nguồn:** yêu cầu chủ dự án 18/10/2026 (ảnh drawer "Thu tiền bàn": "muốn có thể sửa xóa món và có thể xóa bàn"). Quyết định: [ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md) D-33…D-35. Rule: BR-066…BR-070 ([business-rules](../nghiệp-vụ/business-rules.md)).

- **Status:** CONFIRMED (ADR-007 D-33…D-35) · Triển khai: READY_FOR_REVIEW (18/10/2026)
- **Actor:**
  - STAFF: món của đơn chờ tiếp nhận; món đã tiếp nhận / đã pha thì cần người duyệt;
  - MANAGER / ADMIN: tự duyệt.
  - Khách: chỉ thấy kết quả (đơn, tổng tiền cập nhật realtime).
- **Màn hình:**
  - **Quầy → Đơn hàng → drawer Thu tiền bàn** (S-14):
    - mỗi dòng món **chưa thu** có nút **✎** (cả khi bàn đang chia bill) → hộp thoại: số lượng mới (0 = xóa, nút đổi thành **Xóa món**), lý do bắt buộc + chip lý do nhanh, cách xử lý kho nếu đơn đã pha xong, ô tài khoản trưởng ca / quản lý nếu nhân viên sửa đơn đã tiếp nhận;
    - đơn đã tiếp nhận / đã pha chưa thu có nút **Xóa đơn** (đơn chờ tiếp nhận vẫn dùng nút **Hủy** cũ);
    - đầu drawer có nút **Hủy bàn** (ẩn khi bàn đã thu một phần);
    - cuối danh sách đơn có mục thu gọn **Đã sửa / xóa món (n)**.
  - Phiếu bếp / màn khách cập nhật ngay.
- **Dữ liệu:** migration `0033_sua_xoa_mon.sql`:
  - `OrderItemVoids(OrderId, OrderItemId, SessionId, MenuItemId, ItemName, Qty, UnitPrice, Amount, OrderStatus, StockMode, CogsReduction, Reason, ApprovedBy, CreatedBy, CreatedAt)` — `OrderItemId` không có FK vì dòng có thể đã bị xóa hẳn;
  - loại giao dịch kho `VOID_BACK`; `InventoryTransactions.VoidId`, `WasteLogs.VoidId`;
  - `Sessions.CancelledBy`, `CancelReason`.
- **SP:**
  - mới `sp_VoidOrderItem` (dùng `sp_VoidLineCore`, `sp_RecalcOrder`, `sp_CloseIfSettled`), `sp_CancelOrders`;
  - `sp_RefundPayment`: hoàn kho không tính lại phần đã `VOID_BACK` / đã ghi hủy hàng khi xóa món.

## User Story

- **US-046-1:** Là nhân viên quầy, tôi muốn giảm số lượng hoặc xóa món khách gọi nhầm / đổi ý trước khi thu tiền, để bill đúng món khách dùng.
- **US-046-2:** Là trưởng ca, tôi muốn duyệt việc xóa món đã pha / đã tiếp nhận và chọn ghi hủy hàng hay hoàn kho, để kho và báo cáo hao hụt đúng thực tế.
- **US-046-3:** Là nhân viên quầy, tôi muốn hủy cả lượt phục vụ của bàn khi khách bỏ về / mở nhầm bàn, để bàn trống lại cho khách mới.

## Quy tắc

1. **Phạm vi:**
   - chỉ món **chưa thu tiền** của đơn **tại bàn** đang `PENDING` / `PREPARING` / `COMPLETED`, phiên chưa đóng;
   - món đã thu (chia bill), đơn mang đi (đã thu ngay), đơn đã hủy / đã hoàn, phiên đã đóng → `409 ITEM_NOT_EDITABLE` (dùng Hoàn tiền — F-019).
2. **Sửa / xóa:**
   - chỉ **giảm** số lượng: số mới phải nhỏ hơn số đang gọi (sai → `400 INVALID_QTY`); số mới 0 → xóa hẳn dòng, kèm thành phần combo, tùy chọn và lượt dùng khuyến mãi của dòng;
   - thêm / tăng món dùng "Gọi thêm món".
   - **Xóa đơn:** đơn chuyển `CANCELLED`, các dòng **giữ lại** làm lịch sử. Đơn đã có dòng được thu (chia bill) → `409 ITEM_NOT_EDITABLE`, xóa từng món chưa thu.
   - Đơn hết dòng → `CANCELLED`, trả nốt phần kho còn giữ.
3. **Quyền (D-33):**
   - đơn `PENDING`: mọi nhân viên;
   - đơn `PREPARING` / `COMPLETED`: trưởng ca / quản lý tự làm; nhân viên gửi kèm `adminUsername` / `adminPassword` của trưởng ca / quản lý — thiếu → `403 ADMIN_APPROVAL_REQUIRED`; sai mật khẩu hoặc tài khoản nhân viên khác → `403 ADMIN_APPROVAL_INVALID`.
   - SP kiểm lại trạng thái khi ghi (đơn vừa được tiếp nhận → cần duyệt, `403 ADMIN_APPROVAL_REQUIRED`).
   - Lý do bắt buộc (≤ 200 ký tự; thiếu → `400 VALIDATION_ERROR`).
4. **Kho (D-34):**
   - `PENDING` / `PREPARING`: trả phần đang giữ (`RELEASE`) theo định lượng của phần bị bỏ.
   - `COMPLETED`:
     - **Ghi hủy hàng** (`WASTE`, mặc định): dòng `WasteLogs` lý do `OTHER` gắn `VoidId`, tồn không đổi, giá vốn dòng giảm theo tỉ lệ số lượng bỏ;
     - **Hoàn kho** (`RESTOCK`): giao dịch `VOID_BACK` cộng lại theo giá vốn đã trừ, lô mới nguồn `RESTOCK` nếu nguyên liệu theo lô, giá vốn dòng giảm đúng phần hoàn.
   - Lượng xử lý không vượt phần đơn **còn giữ** (chưa pha xong) hoặc phần **đã trừ − đã hoàn − đã ghi hủy** ở các lần xóa trước (đã pha xong).
   - Hoàn tiền sau đó (F-019) **không hoàn kho lần hai** phần đã `VOID_BACK` hoặc đã ghi hủy hàng khi xóa món.
5. **Combo & tùy chọn:**
   - định lượng phần bị bỏ = BOM món × số lượng bỏ + thành phần combo theo tỉ lệ + BOM tùy chọn đã chọn;
   - giảm combo → số lượng dòng con giảm theo; xóa dòng → xóa cả dòng con và tùy chọn.
6. **Tiền:**
   - tổng đơn tính lại (giá niêm yết / giá khuyến mãi dòng giữ như lúc gọi);
   - khuyến mãi đơn đã áp tính lại theo số mới, bỏ nếu dưới đơn tối thiểu;
   - lượt dùng khuyến mãi cập nhật / xóa theo;
   - giá vốn dòng (`CogsAmount`) giảm; phần giảm ghi ở `OrderItemVoids.CogsReduction`.
7. **Hủy bàn (D-35):**
   - hủy mọi đơn chưa thu của phiên (cùng quy tắc quyền + kho), đóng phiên không tạo lượt thu, ghi người hủy + lý do (`Sessions.CancelledBy`, `CancelReason`);
   - phiên đã có lượt thu (chia bill một phần) → `409 SESSION_HAS_PAYMENTS`; khi đó xóa từng món / đơn chưa thu.
   - Phiên đã thu một phần mà bỏ nốt món / đơn chưa thu cuối cùng → đơn còn toàn dòng đã thu thành `PAID`, phiên **tự đóng** như lượt thu phần cuối (`sp_CloseIfSettled`), phát `session.closed`.
8. **Đồng thời:**
   - SP khóa theo thứ tự Sessions → Orders → Ingredients (+ lô), cùng thứ tự với gửi đơn / thu tiền / hoàn tất;
   - nhân viên xóa đúng lúc đơn được tiếp nhận → hoặc xóa xong trước (không cần duyệt), hoặc `403 ADMIN_APPROVAL_REQUIRED`; kho không lệch;
   - hai máy cùng xóa một dòng → một máy thành công, máy sau `404 ITEM_NOT_FOUND`; lịch sử chỉ một dòng.
9. **Lịch sử:** mỗi lần sửa / xóa ghi `OrderItemVoids` (món, SL bỏ, giá, lý do, trạng thái đơn lúc đó, cách xử lý kho, người làm, người duyệt) + nhật ký thao tác `order.item-void` / `order.void` / `session.cancel` (không lưu mật khẩu người duyệt).

## API

| Method & path | Body | Kết quả / lỗi |
| --- | --- | --- |
| `POST /api/order-items/{id}/void` | `{ quantity (SL mới, 0 = xóa), reason, stockMode?: 'WASTE' \| 'RESTOCK', adminUsername?, adminPassword? }` | `{ order, cancelled, sessionClosed }`; `400 INVALID_QTY` / `VALIDATION_ERROR`, `403 ADMIN_APPROVAL_REQUIRED` / `ADMIN_APPROVAL_INVALID`, `404 ITEM_NOT_FOUND`, `409 ITEM_NOT_EDITABLE` |
| `POST /api/orders/{id}/void` | `{ reason, stockMode?, adminUsername?, adminPassword? }` | `{ order, sessionClosed }` — xóa cả đơn tại bàn chưa thu (mọi trạng thái còn hiệu lực); `404 NOT_FOUND`, `409 ITEM_NOT_EDITABLE`, 400, 403 |
| `POST /api/sessions/{id}/cancel` | `{ reason, stockMode?, adminUsername?, adminPassword? }` | `{ session, cancelledOrders }`; `409 SESSION_HAS_PAYMENTS`, `409 SESSION_CLOSED`, `404 NOT_FOUND`, 400, 403 |
| `GET /api/sessions/{id}/voids` | — | `[{ voidId, orderId, orderCode, itemName, qty, amount, orderStatus, stockMode, reason, createdAt, createdBy, approvedBy }]`, mới nhất trước |

Quyền: NV (`pos.use`). Realtime: `order.status_changed` / `order.cancelled` (staff + phiên) sau mỗi lần sửa / xóa; `session.closed { sessionId, table, cancelled: true, reason }` khi hủy bàn; `session.closed { sessionId, table }` khi bỏ món làm phiên đã thu một phần tự đóng.

## Acceptance Criteria

- AC-046-01: Nhân viên giảm "Cà phê đen" 2 → 1 ở đơn chờ tiếp nhận → tổng đơn giảm 25.000đ, kho giữ giảm đúng định lượng 1 ly, có lịch sử.
- AC-046-02: Nhân viên xóa món đơn "Đang chuẩn bị" không có người duyệt → 403; kèm tài khoản trưởng ca → thành công; thiếu lý do → 400.
- AC-046-03: Xóa món đã pha + "Hoàn kho" → tồn cộng lại đúng lượng đã trừ; giá vốn đơn giảm; "Ghi hủy hàng" → tồn không đổi, có dòng hủy hàng.
- AC-046-04: Xóa hết món → đơn `CANCELLED`; khuyến mãi đơn bỏ khi tổng dưới tối thiểu.
- AC-046-05: Hủy bàn → mọi đơn chưa thu `CANCELLED`, phiên đóng, bàn trống; phiên đã thu một phần → 409.
- AC-046-06: Món đã thu (chia bill) / đơn mang đi → 409.
- AC-046-07: Bất biến kho / tiền giữ nguyên sau mọi thao tác (giữ kho khớp đơn, Σ lô = tồn, không hoàn kho quá lượng đã trừ, tổng đơn khớp dòng).

## Bằng chứng

- `tests/void.test.js` — 12 test, PASS:
  - AC-046-01…06 (AC-046-03 gồm cả "hoàn tiền sau đó không hoàn lại phần đã xử lý"; AC-046-06 gồm cả "bỏ nốt món chưa thu → phiên đóng như lượt thu cuối");
  - "Xóa đơn đã pha + hoàn kho, nguyên liệu theo lô" (lô `RESTOCK` mới, Σ lô = tồn);
  - "Combo & tùy chọn";
  - "nhân viên xóa món đua với tiếp nhận đơn" (lặp 6 lần), "hai máy cùng xóa một dòng";
  - "nhật ký thao tác" (không lưu mật khẩu người duyệt);
  - "xóa tài khoản chỉ có lịch sử sửa / xóa món" (người làm / người duyệt → xóa mềm, không lỗi khóa ngoại).
- AC-046-07: bất biến `OVER_RESTOCK`, `ORDER_LINES_MISMATCH`, `COGS_MISMATCH` (trừ `CogsReduction`) kiểm sau mọi file test (`tests/helpers/testDb.js`).
- E2E "sửa / xóa món + hủy bàn" (`kiểm-thử/e2e/flow.spec.js`).
- 18/10/2026: `npm test` 229/229, `npm run test:e2e` 28/28, `npm run load` 10/10 — xem [TASK-055](../công-việc/TASK-055.md).
