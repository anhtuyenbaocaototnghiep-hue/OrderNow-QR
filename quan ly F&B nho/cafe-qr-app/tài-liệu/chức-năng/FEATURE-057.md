# FEATURE-057 — Thu chung nhiều bàn (gộp hóa đơn lúc thu)

> **Nguồn:** chủ dự án yêu cầu 24/10/2026: "thêm chức năng gộp hóa đơn"; chọn: gộp nhiều bàn để thu một lần (không gộp hẳn nhóm trước lúc thu). Quyết định: [ADR-019](../quyết-định/ADR-019-chuyen-khoan-gop-tach-hoa-don.md) D-73.

- **Status:** CONFIRMED (ADR-019 D-73) · Triển khai: [TASK-073](../công-việc/TASK-073.md)
- **Actor:** **ACT-STAFF / ACT-LEAD / ACT-ADMIN** (thu tiền); **ACT-GUEST / ACT-MEMBER** (điện thoại ở bàn được gộp).
- **Màn hình:**
  - **Ngăn Thu tiền bàn** (SCR-14): nút **"Thu chung với bàn khác"** → hộp chọn các bàn / nhóm đang phục vụ (ô tích) → ngăn hiện "Thu chung: Bàn A + Bàn B…", đơn xếp theo bàn, tổng chung; nút **"Bỏ thu chung"**. In tạm tính in tổng chung.
  - **Bill in** (SCR-12): các món nhóm theo bàn, đầu bill ghi các bàn.
  - **Điện thoại khách** ở bàn được gộp (SCR-05): chuyển sang màn "Đã thanh toán" của bàn A, đánh giá món được.
- **Dữ liệu:** `Sessions.MergedIntoSessionId` (migration 0039); thủ tục `sp_MergeSessions`.

## User Story

- **US-057-1:** Là nhân viên thu ngân, tôi muốn thu một lần cho một nhóm khách ngồi nhiều bàn (hoặc nhiều nhóm muốn trả chung), để in một bill và đóng tất cả các bàn cùng lúc.

## Quy tắc (BR-090)

1. Thu chung chỉ làm từ ngăn thu tiền của **bàn A** (phiên A), chọn thêm 1–10 phiên khác đang mở (`OPEN` / `PAYMENT_REQUESTED`). Không chọn chính A, không chọn trùng.
2. Không thu chung khi A hoặc phiên được chọn **đang chia bill** (`409 SESSION_HAS_SPLITS`), đã đóng (`409 SESSION_CLOSED`) hoặc còn đơn chờ tiếp nhận (`409 HAS_PENDING_ORDERS`).
3. Tổng phải thu tính trên **tất cả đơn** của các phiên (khuyến mãi từng đơn giữ nguyên); hội viên của phiên A (hoặc chọn trong ngăn) áp cho cả tổng; giảm giá tay, voucher, đổi thưởng, làm tròn, `expectedAmountDue`, cách trả (F-056) như thu một bàn.
4. Lúc bấm thu, **một transaction**: chuyển mọi đơn của các phiên được chọn sang phiên A (đơn **giữ bàn gốc**), chép điện thoại của các phiên đó vào phiên A, đóng các phiên đó (`MergedIntoSessionId = A`), rồi thu phiên A. Bất kỳ lỗi nào → không gộp, không thu. Phân tích "Theo bàn" (F-042) tính theo lượt thu nên doanh thu lượt thu chung ghi vào bàn A.
5. Sau khi thu: phát `session.settled` tới quầy, phiên A và từng phiên được gộp (kèm `mergedInto`); điện thoại ở bàn được gộp chuyển sang phiên A. Bill / tra cứu phiên được gộp trỏ tới phiên A.

## API (thay đổi)

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/sessions/{id}/settle/preview` | Body thêm `mergeSessionIds: uuid[]` (0–10) → tổng chung + `mergedSessions[{ sessionId, table, ordersTotal }]` |
| `POST /api/sessions/{id}/settle` | Body thêm `mergeSessionIds`; kết quả thêm `mergedSessionIds` |
| `GET /pos/sessions/{id}/receipt?mode=provisional&merge=…` | Phiếu tạm tính tổng chung (danh sách sessionId cách nhau bằng dấu phẩy) |
| `GET /api/sessions/{id}` (khách / quầy) | Phiên đã gộp có `mergedInto: { sessionId, table }` |

## Acceptance Criteria

- AC-057-01: Bàn A (30.000đ) và bàn B (25.000đ) đang mở: xem trước thu chung → tổng 55.000đ; thu chung → `200`, một lượt thu 55.000đ ở phiên A; phiên A và B đều `CLOSED`, B có `mergedInto = A`; đơn của B nằm ở phiên A nhưng vẫn ghi bàn B.
- AC-057-02: Thu chung với `expectedAmountDue` sai / bàn B còn đơn chờ tiếp nhận / bàn B đang chia bill → `409` (`AMOUNT_CHANGED` / `HAS_PENDING_ORDERS` / `SESSION_HAS_SPLITS`); phiên A, B vẫn mở, đơn B vẫn ở phiên B, không có lượt thu.
- AC-057-03: Điện thoại ở bàn B nhận `session.settled` có `mergedInto`; xem phiên B thấy `mergedInto`; đánh giá món được trên phiên A.
- AC-057-04: Bill in sau khi thu chung liệt kê món theo từng bàn, tổng đúng.
- AC-057-05: Trên trình duyệt: ngăn Thu tiền Bàn A → "Thu chung với bàn khác" → tích Bàn B → ngăn hiện tổng chung → thu → cả hai bàn biến khỏi danh sách bàn đang phục vụ.

## Bằng chứng

`tests/merge-bills.test.js` (AC-057-01…04) · E2E "thu chung nhiều bàn…" (AC-057-05).
