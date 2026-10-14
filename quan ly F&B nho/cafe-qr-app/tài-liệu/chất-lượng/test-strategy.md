# Chiến lược kiểm thử và Definition of Done

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §13 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 13.1. Loại kiểm thử theo rủi ro

| Rủi ro | Kiểm thử | Môi trường | Người phụ trách |
| --- | --- | --- | --- |
| **Âm kho / trừ 2 lần** (BR-001, BR-002, NFR-002) | Integration test gọi SP trên **SQL Server thật** với N luồng song song; k6 bắn `POST /api/orders` và `POST /api/orders/{id}/complete` đồng thời; assert bất biến sau test | SQL Server Docker | Sáng + Nhật Anh |
| Thu tiền sai / thu 2 lần (BR-019) | Integration test `sp_SettleSession`: đồng thời 2 request, còn đơn PENDING, tiền đưa thiếu; kiểm `Payments` đúng 1 dòng | SQL Server Docker | Nhật Anh + Sáng |
| Quyền | Test ma trận actor × endpoint (khách gọi API quầy, STAFF gọi admin) | Backend test | Sáng |
| Realtime < 2 s (NFR-001) | Script đo timestamp gửi → nhận trên 2 trình duyệt; p95 | Staging + Wi-Fi quán | Sáng |
| Reconnect | Playwright: tắt mạng (route abort) 30 s, tạo đơn, bật lại → kiểm thẻ đơn + banner | FE E2E | Tuyến + Sáng |
| Luồng khách end-to-end | Playwright 2 trình duyệt: khách quét (mở URL) → menu → gửi → theo dõi → Gọi thanh toán; quầy tiếp nhận → hoàn tất → thu tiền → khách thấy "Cảm ơn" | Staging | Sáng |
| In bill | Kiểm thủ công trên Chrome print preview khổ 80 mm + máy in thật ở tuần 7 | Quán thử | Tuyến |
| Validation form | Unit test FE + BE cho AC-xx-02 (exception path) | — | Tuyến/Nhật Anh |

## 13.2. Kịch bản ép tải tranh chấp kho (NFR-002) — mẫu

```
Setup: nguyên liệu "Cốt trà đào" StockQty = 150 ml; BOM "Trà đào" = 50 ml → đủ 3 suất.
Hành động: 30 phiên khách khác nhau gửi POST /api/orders [Trà đào ×1] trong cùng 100 ms (k6 vus=30, iterations=1).
Kỳ vọng: đúng 3 response 201, 27 response 409 OUT_OF_STOCK; Ingredients.ReservedQty = 150; StockQty = 150.
Tiếp: quầy complete 3 đơn, mỗi đơn bắn 2 request đồng thời.
Kỳ vọng: 3 × (một 200 + một 409 ALREADY_PROCESSED); StockQty = 0; ReservedQty = 0; InventoryTransactions có đúng 3 dòng DEDUCT; không có lỗi CHECK constraint (nếu có → logic SP sai, phải sửa SP chứ không nới constraint).
Lặp 10 lần với seed ngẫu nhiên số suất; tất cả phải pass.
```

## 13.3. Definition of Done (chung cho mọi task)

- [ ] Mọi AC trong scope task có bằng chứng: test tự động pass, hoặc ghi rõ kiểm thủ công + kết quả.
- [ ] Lint/type-check/build pass ở phần bị thay đổi.
- [ ] Test liên quan đã chạy; test chưa chạy được ghi `NOT_RUN` + lý do (không giả PASS).
- [ ] Quyền được kiểm ở server cho endpoint mới.
- [ ] Thay đổi schema có migration + cập nhật `tài-liệu/kiến-trúc/data-model.md`; SP trong `cơ-sở-dữ-liệu/thủ-tục/`.
- [ ] Endpoint/sự kiện mới hoặc đổi → cập nhật `api-contract.md`.
- [ ] Không có secret trong code/tài-liệu/log.
- [ ] Diff không chứa thay đổi ngoài phạm vi task.
- [ ] Câu hỏi mới phát hiện đã ghi vào `tài-liệu/open-questions.md`.
- [ ] Báo cáo bàn giao theo [mẫu bàn giao](#ban-giao) bên dưới.

> **AC** là điều kiện riêng từng feature; **DoD** là chuẩn chung. Không dùng "có N test" làm bằng chứng duy nhất.

## 13.4. Kịch bản đồng thời bổ sung — chờ Q-013

Thêm sau khi nhóm chốt Q-013 (xem `tài-liệu/open-questions.md`): một phiên `PAYMENT_REQUESTED`, bắn đồng thời `POST /api/sessions/{id}/settle` và `POST /api/orders` (cùng phiên). Kỳ vọng: **không** có đơn nào thuộc phiên `CLOSED` mà vẫn `UNPAID`. Tức là hoặc đơn mới được tạo trước rồi settle trả 409 `HAS_PENDING_ORDERS`, hoặc settle chạy trước rồi gửi đơn trả 409 `SESSION_CLOSED`.

## Bộ test hiện có (14/10/2026)

| Bộ | Lệnh | Phạm vi | Kết quả |
| --- | --- | --- | --- |
| SP integration | `npm test` (file `ứng-dụng/máy-chủ/tests/sp.test.js`) | 18 test: gửi đơn, thiếu kho, món tắt, **20 phiên/1 suất**, mang đi, hoàn tất/hủy, **§13.2 ×10 vòng**, gọi thanh toán, settle (PENDING/thiếu tiền/AMOUNT_CHANGED/**đồng thời**), **submit ⇄ settle ×10 (Q-013)**, đóng bàn trống, điều chỉnh kho | 18/18 PASS |
| Xóa trong Quản lý (ADR-004) | `npm test` (file `ứng-dụng/máy-chủ/tests/delete.test.js`) | 7 test: xóa hẳn / xóa mềm từng loại, chặn khi đang dùng, QR bàn đã xóa chết, token người bị xóa 401, tên/mã dùng lại, báo cáo giữ tên | 7/7 PASS |
| API + quyền + realtime | `npm test` (file `ứng-dụng/máy-chủ/tests/api.test.js`) | 21 test: ma trận quyền, luồng khách → quầy → thu tiền, Idempotency-Key, OUT_OF_STOCK, socket phiên khác không nhận sự kiện, quản trị, báo cáo seed | 21/21 PASS |
| E2E giao diện | `npm run test:e2e` (`kiểm-thử/e2e/flow.spec.js`, Chromium) | 15 test (có nút Xóa trong Quản lý): đăng nhập, phân quyền trang, gộp/tách phiên, **≤ 3 chạm**, realtime < 2 s, pop-up "Đã xong", hết món realtime, hết nguyên liệu lúc gửi, **mất mạng quầy → đơn trễ**, gọi thanh toán → thu tiền → cảm ơn, mang đi, hóa đơn 80 mm, báo cáo, BOM -10 | 15/15 PASS |
| Ép tải HTTP | `npm run load` | §13.2: 10 vòng × 30 khách đồng thời; hoàn tất 2 request/đơn; đo NFR-001 | 10/10 PASS; p95 165 ms (máy local) |

Mọi bộ đều kiểm **bất biến kho/thu tiền** sau khi chạy (`inventoryViolations`). Test chạy trên SQL Server thật, không mock.

**NOT_RUN:** in trên máy in nhiệt thật, NFR-001 trên Wi-Fi quán (TASK-020); k6 (dùng `npm run load` thay); CI GitHub Actions (chưa có remote).

<a id="ban-giao"></a>

## Bàn giao

Mẫu báo cáo bàn giao bắt buộc cho mọi task (`AGENTS.md` → "Bàn giao"; skill `verify-change` bước 8):

```markdown
Task: TASK-0xx
Thay đổi: <hành vi và thành phần chính; file chính>
AC:
  - AC-00x-01: PASS — <test/bằng chứng>
  - AC-00x-04: NOT_RUN — <lý do, cách kiểm sau>
Validation thực chạy: <lệnh, môi trường, kết quả tóm tắt>
Validation chưa chạy: <NOT_RUN + lý do>
Docs cập nhật: <đường dẫn>
Q mới / blocker: <Q-0xx hoặc "không có">
Trạng thái đề xuất: READY_FOR_REVIEW | BLOCKED
```

Làm xong docs chưa có nghĩa là sản phẩm đã hoàn thành, và build pass cũng không chứng minh được nghiệp vụ đúng. Nếu quy trình cho agent tự đánh dấu DONE thì vẫn phải có bằng chứng đáp ứng DoD.
