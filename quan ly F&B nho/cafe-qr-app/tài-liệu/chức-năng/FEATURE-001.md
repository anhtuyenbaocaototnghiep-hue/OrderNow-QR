# FEATURE-001 — Quét QR và khởi tạo phiên (tách/gộp bàn)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

- **Status:** CONFIRMED. Phần đóng phiên đã chốt theo ADR-000 (D-2: phiên đóng khi nhân viên bấm "Đã thu tiền"). Cách hiểu "giỏ hàng chung" khi Gộp còn mở ở Q-012
- **Source:** demo.docx US1 (cả 2 bản), User flow bước 1–3, Module 1.1
- **Actor:** Khách
- **Mục tiêu:** Khách quét QR → được gắn vào một phiên trên đúng bàn → vào menu.
- **Điều kiện trước:** Bàn tồn tại và `IsActive`; `qrToken` hợp lệ.
- **Đầu vào**

| Trường | Ý nghĩa | Bắt buộc | Validation |
| --- | --- | --- | --- |
| `qrToken` (URL) | Định danh bàn | Có | Tồn tại, bàn active |
| `clientToken` (cookie) | Định danh trình duyệt | Không (server cấp nếu chưa có) | Chuỗi ngẫu nhiên ≥ 32 ký tự |
| `choice` | `JOIN` hoặc `NEW` | Chỉ khi bàn có phiên mở | Enum |

- **Luồng thành công**
  1. Khách mở `/t/{qrToken}` → client gọi `POST /api/sessions/scan`.
  2. Server tìm bàn; đếm phiên `OPEN` của bàn.
  3. Không có phiên mở → tạo phiên mới, gắn `clientToken`, trả `sessionId` → chuyển menu.
  4. Có phiên mở → trả `state = OCCUPIED` kèm thông tin phiên (số món, tổng tạm tính, **không** lộ chi tiết khách khác) → client hiện hộp thoại "Bàn 05 đang có đơn. Gộp chung nhóm hay Tạo đơn cá nhân?".
  5. `JOIN` → `POST /api/sessions/{id}/join` → gắn `clientToken` vào phiên đó; `NEW` → tạo phiên mới song song.
- **Lỗi và biên:** `qrToken` sai → 404 "Mã bàn không hợp lệ"; `JOIN` vào phiên đã `CLOSED` → 409 `SESSION_CLOSED`, client tự chuyển sang tạo mới và báo (BR-008); bàn có **nhiều** phiên mở (do nhiều khách "cá nhân") → hộp thoại liệt kê các phiên hoặc chỉ cho "tạo mới" (PROPOSED: liệt kê theo thời gian mở, hiển thị "Phiên 1 – 3 món", "Phiên 2 – 1 món").
- **Quyền:** Công khai, không cần đăng nhập. Chỉ thấy tổng tạm tính của phiên, không thấy ghi chú/tên.
- **Acceptance Criteria**
  - AC-001-01: Bàn 05 không có phiên mở; quét QR → có `sessionId` mới, `Sessions` có 1 dòng `OPEN` cho bàn 05, vào thẳng menu không hỏi.
  - AC-001-02: Bàn 05 có phiên A `OPEN`; khách B quét → thấy hộp thoại; chọn Gộp → B có cùng `sessionId` A; GET đơn của phiên trả về các đơn A đã đặt.
  - AC-001-03: Như trên, chọn Cá nhân → phiên B mới, `TableId` = 05, B không thấy đơn của A; A không thấy đơn của B.
  - AC-001-04: Phiên A vừa `CLOSED`; B bấm Gộp → nhận 409, client báo "Đơn hàng nhóm đã được thanh toán, hệ thống sẽ tạo phiên mới cho bạn" và tạo phiên mới tự động.
  - AC-001-05: `qrToken` không tồn tại → 404; không tạo phiên.
  - AC-001-06: Bàn đã bị xóa mềm (ADR-004) hoặc đang tắt → quét QR cũ của bàn → 404 `TABLE_NOT_FOUND`, không vào được menu. _(bổ sung — TASK-057, 20/10/2026)_
  - AC-001-07: Mở địa chỉ gốc `/` (không qua QR) → HTTP 200, trang SCR-43 hướng dẫn "quét mã QR dán trên bàn" và có 2 nút "Màn hình quầy (nhân viên)" → `/pos`, "Quản lý" → `/admin`; không tạo phiên. _(bổ sung — TASK-057, 20/10/2026: màn hình SCR-43 chưa có Story)_
  - AC-001-08: Mở đường dẫn trang không tồn tại → HTTP 404, trang SCR-44 "Không tìm thấy trang" nhắc khách quét lại QR, có nút "Về trang chủ"; đường dẫn `/api/...` không tồn tại → luôn trả JSON, không trả trang HTML: chưa đăng nhập → 401 (không lộ API nào tồn tại), nhân viên đã đăng nhập → 404 mã `NOT_FOUND`. _(bổ sung — TASK-057, 20/10/2026: màn hình SCR-44 chưa có Story)_
- **Liên kết:** Data: `Tables`, `Sessions`, `SessionClients` · API: `POST /api/sessions/scan`, `POST /api/sessions/{id}/join` · UI: màn hình S-01 · Rule: BR-008 · Hỏi: Q-009 (đã chốt — ADR-000), Q-012.
