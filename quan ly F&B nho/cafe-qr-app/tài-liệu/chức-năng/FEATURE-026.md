# FEATURE-026 — Chia bill theo người trong phiên gộp

> **Nguồn:** skill `advanced-features` §4 F-026. Quyết định: [ADR-006](../quyết-định/ADR-006-mo-rong-giai-doan-4-8.md) D-17.

- **Status:** CONFIRMED (ADR-006 D-17) · Triển khai: READY_FOR_REVIEW (17/10/2026)
- **Actor:** khách trong phiên gộp (mỗi điện thoại); STAFF thu từng phần.
- **Màn hình:**
  - **Khách — theo dõi đơn:**
    - nút **🧾 Chia bill theo người** → sheet: tạo "phần của tôi" (đặt tên), chạm **Của tôi** / **Bỏ** trên từng món;
    - món người khác đã nhận hiện tên phần;
    - thẻ "Bàn đang chia bill" ghi số tiền tạm tính từng phần.
  - **Quầy — bàn đang phục vụ:** "🧾 Chia N phần · đã thu X".
  - **Quầy — drawer Thu tiền** khi bàn có chia:
    - danh sách phần → **Thu phần này** (hội viên / giảm tay riêng phần đó);
    - mỗi dòng có ô chuyển phần;
    - **+ Thêm phần**, **Thu chung**;
    - phần đã thu có **In lại**. Bill in riêng từng phần: `/pos/payments/{id}/receipt`.
- **Dữ liệu:** migration `0018_chia_bill.sql`:
  - `SessionSplits(SessionId, Label, ClientToken, MemberId, IsCommon, Status, PaymentId)`;
  - `OrderItems.SplitId` (NULL = Chung), `PaidAt`, `PaymentId`;
  - `Payments.SplitId`.
  - Unique: `UX_Payments_Session` chỉ cho phiên không chia; `UX_Payments_Split` mỗi phần một lượt thu.
- **SP:**
  - mới `sp_SettleSplit`;
  - `sp_SettleSession` từ chối phiên đã chia (`50113 SESSION_HAS_SPLITS`) và ghi `PaidAt`/`PaymentId` lên dòng;
  - `sp_RefundPayment`: lượt thu của một phần chỉ hoàn tiền, không hủy đơn.

## Quy tắc (D-17)

1. **Chia theo dòng món** (dòng khách chọn; dòng con combo đi theo dòng cha). Dòng chưa ai nhận thuộc phần **Chung** (`IsCommon`, tạo tự động khi có phần đầu tiên).
2. **Mỗi điện thoại một phần.** Khách chỉ gán / bỏ dòng **Chung** hoặc dòng của phần mình (khác → 403 / 409 `LINE_LOCKED`). Quầy chuyển được mọi dòng chưa thu.
3. **Phần cuối còn mở tự gộp các dòng Chung chưa thu**; SP kiểm lại, thiếu → `50111 COMMON_REQUIRED`. Phần Chung thu riêng được khi còn phần khác mở.
4. **Tiền mỗi phần:**
   - khuyến mãi dòng đã khóa;
   - khuyến mãi đơn **phân bổ theo dòng** (tỉ lệ thành tiền, phần dư cho phần lẻ lớn nhất), tính trên toàn bộ dòng của đơn nên Σ các phần = khuyến mãi đơn;
   - hội viên của phần (chỉ áp cho phần đó);
   - giảm tay;
   - làm tròn.

   Dùng `pricing.partOrders` → `settleTotals`, cùng bộ tính với thu cả bàn (D-7).
5. **Thu một phần:** một `Payments(SplitId)`, đánh dấu dòng `PaidAt` / `PaymentId`, đơn đủ dòng → `PAID`. Hết dòng chưa thu → **đóng phiên**, phát `session.settled`. Thu đồng thời cùng một phần → một lượt thành công, lượt kia `409` (khóa phiên + `UX_Payments_Split`).
6. **"Thu chung":**
   - chưa có lượt thu nào → bỏ chia hẳn, phiên thu bình thường;
   - đã thu ≥ 1 phần → dồn các phần còn mở về Chung để thu nốt.
7. **BR-019 giữ nguyên:** còn đơn chưa tiếp nhận → không thu phần nào (`HAS_PENDING_ORDERS`).

## API

| Method & path | Ghi chú |
| --- | --- |
| `GET /api/sessions/{id}/splits` | `{ hasSplits, splits[{ splitId, label, isCommon, status, mine, member, lines[], unpaidAmount, paidAmount }], lines[] }` |
| `POST /api/sessions/{id}/splits { label }` | Khách: phần của điện thoại này (tạo lại → trả phần cũ, đổi tên); quầy: phần mới |
| `PUT /api/sessions/{id}/items/{orderItemId}/split { splitId \| null }` | Gán / bỏ dòng; `409 LINE_LOCKED` / `SPLIT_PAID`, `403` |
| `POST /api/splits/{id}/settle/preview` · `POST /api/splits/{id}/settle` | Như thu cả bàn (`memberId`, `manualDiscount`, `expectedAmountDue`…) + `includeCommon`, `sessionClosed` |
| `POST /api/sessions/{id}/splits/merge` | "Thu chung" → `{ removed, unsplit }` |
| `GET /api/payments/{id}/receipt` | Bill riêng của một lượt thu (chỉ dòng của lượt đó, có tên phần) |

Realtime: `session.split_changed { sessionId }` tới room `staff` + `session:{id}`.

## Acceptance Criteria

- AC-026-01: 2 khách gộp bàn, 4 dòng (A gọi Cà phê sữa, Bạc xỉu; B gọi Latte, Trà đào); A nhận 2 dòng của mình, B nhận Latte → 3 phần: "Anh A" = {Cà phê sữa, Bạc xỉu} (tạm tính 29.000 + 32.000 = 61.000đ), "Chị B" = {Latte}, "Chung" = {Trà đào}; mỗi dòng thuộc đúng một phần. _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-026-02: Thu phần A → phiên vẫn `OPEN`; thu phần B (cuối) → tự gộp Chung, phiên `CLOSED`.
- AC-026-03: Hội viên chỉ giảm phần có hội viên.
- AC-026-04: Thu đồng thời cùng một phần → 1 OK, 1 409; đúng một `Payments`.
- AC-026-05: Bàn đã chia bill → thu cả bàn → 409 `SESSION_HAS_SPLITS`; bấm "Thu chung" khi chưa thu phần nào → bỏ chia (không còn phần nào), thu cả bàn như bàn không chia: một lượt thu bằng tổng bàn (ví dụ Cà phê đen 25.000 + Nước suối 10.000 = 35.000đ). _(viết lại cho kiểm được — TASK-057, 20/10/2026)_
- AC-026-06: Bất biến: Σ (tạm tính − khuyến mãi) các phần = Σ đơn; mọi dòng phiên đã đóng có `PaidAt`; mỗi phần một lượt thu.
- AC-026-07: Khách nhận dòng đã thuộc phần người khác → 409 (`LINE_LOCKED`); khách gán dòng vào phần của người khác → 403. _(bổ sung — TASK-057, 20/10/2026)_
- AC-026-08: Phần Chung không còn món (mọi dòng đã có chủ) → thu phần Chung → 409 `SPLIT_EMPTY`. _(bổ sung — TASK-057, 20/10/2026)_
- AC-026-09: Bàn đã chia bill còn đơn chưa tiếp nhận → thu một phần → 409 `HAS_PENDING_ORDERS` (BR-019), không tạo lượt thu. _(bổ sung — TASK-057, 20/10/2026)_

## Bằng chứng

- `tests/phase4-unit.test.js` → "Chia khuyến mãi đơn theo dòng": 2 test.
- `tests/phase4.test.js` → "Chia bill theo người (F-026)": 4 test, gồm thu đồng thời và hoàn tiền phần.
- `helpers/testDb.js`: bất biến `SPLIT_SESSION_MISMATCH`, `SPLIT_UNPAID_LINE`, `LINE_PAYMENT_OTHER_SESSION`, `SPLIT_PAID_NO_PAYMENT`.
- E2E "chia bill: 2 khách gộp bàn…".
