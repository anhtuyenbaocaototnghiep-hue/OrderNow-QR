---
name: them-gop-tach-chuyen-khoan
description: Thêm gộp hóa đơn, tách hóa đơn, thu bằng chuyển khoản cho cafe-qr-app — chọn Tiền mặt / Chuyển khoản ở mọi lượt thu (két chỉ tính tiền mặt, đóng ca không "thiếu tiền" giả), "Thu chung với bàn khác" (gộp nhiều bàn thu một lần, một bill), "Tách hóa đơn" theo món bằng ô tích. Dùng khi task giao FEATURE-056…058 / ADR-019 / TASK-073, hoặc nhắc "chuyển khoản", "két thiếu tiền", "cách trả", "gộp hóa đơn", "gộp bàn", "thu chung", "tách hóa đơn", "tách bill", "Phần còn lại".
---

# Mục đích

Ghi lại đầy đủ ba chức năng **thêm gộp, tách hóa đơn và chuyển khoản** (làm ngày 24/10/2026, TASK-073) để agent sau có thể **sửa, mở rộng hoặc làm lại** mà không phá luồng thu tiền:

| Feature | Tên | Một câu |
| --- | --- | --- |
| F-056 | Thu bằng chuyển khoản | Nhân viên chọn **Chuyển khoản** → không nhập tiền khách đưa; lượt thu ghi `TRANSFER`, **không cộng vào két** |
| F-057 | Gộp hóa đơn = thu chung nhiều bàn | Ngăn thu bàn A → **"Thu chung với bàn khác"** → tích bàn B, C… → thu một lần, in một bill, đóng tất cả |
| F-058 | Tách hóa đơn theo món | Ngăn thu → **"Tách hóa đơn"** → tích món, đặt tên → món đó thành hóa đơn riêng, món còn lại vào **"Phần còn lại"** |

Lý do gốc (chủ dự án): khách chuyển khoản mà nhân viên vẫn bấm "Đã thu tiền" → lượt thu tính vào tiền mặt → đóng ca thấy **thiếu tiền** dù không mất tiền thật, không phân biệt được với thất thoát thật.

Nguồn chính là tài liệu trong repo; skill này tóm tắt và chỉ chỗ. Lệch nhau → làm theo tài liệu, ghi câu hỏi vào `tài-liệu/open-questions.md`.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-019-chuyen-khoan-gop-tach-hoa-don.md` (D-71…D-74) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-056.md`, `FEATURE-057.md`, `FEATURE-058.md` |
| Business rule | `tài-liệu/nghiệp-vụ/business-rules.md` BR-088…BR-091 |
| Task, kết quả, review | `tài-liệu/công-việc/TASK-073.md`, `tài-liệu/kế-hoạch/TASK-073-plan.md` |
| API, dữ liệu, màn hình | `tài-liệu/kiến-trúc/api-contract.md`, `tài-liệu/kiến-trúc/data-model.md`, `tài-liệu/giao-diện/screens-flows.md` |

# Khi dùng

- Sửa / mở rộng thu tiền có liên quan cách trả, két, đóng ca, hoàn tiền, báo cáo theo cách trả.
- Sửa thu chung (gộp) hoặc tách hóa đơn; thêm cách trả mới (ví, thẻ); thêm QR chuyển khoản.
- Làm lại ba chức năng này trên một bản code khác (ví dụ bản trên GitHub) — đi theo mục 7.

Không dùng cho chia bill do khách tự chọn trên điện thoại (F-026, skill `advanced-features`) — trừ khi đụng phần "Tách hóa đơn" ở quầy.

# Điều kiện trước

- Đã có: thu tiền bàn (`sp_SettleSession`), chia bill (F-026: `SessionSplits`, `OrderItems.SplitId`, `sp_SettleSplit`), chốt ca (F-018: `sp_CloseShift`), hoàn tiền (F-019), bắt buộc mở ca (F-055).
- Đọc `AGENTS.md`, `.agent/rules.md`, skill `change-database` (migration chỉ thêm, SP `CREATE OR ALTER`).
- `CafeQrDev` là dữ liệu thử của chủ dự án: **không reset**, migration chỉ thêm. `CafeQrTest` bị test xóa — không chạy `npm test` và E2E song song.

---

# 1. Bước 0: khảo sát rồi mới sửa

1. Kiểm migration 0039 đã có chưa: `cơ-sở-dữ-liệu/chuyển-đổi/0039_chuyen_khoan_gop_hoa_don.sql`. Chưa có → đây là bản code cũ, làm theo mục 7.
2. Đọc chữ ký thật của `sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder`, `sp_CloseShift`, `sp_MergeSessions` trong `cơ-sở-dữ-liệu/thủ-tục/`.
3. Chạy test nền: `npm test` (ghi số PASS), rồi `npm run test:e2e`.
4. Thay đổi chạm DB / API / ≥ 2 module → viết `tài-liệu/kế-hoạch/TASK-xxx-plan.md` trước khi code.

---

# 2. Quyết định đã chốt (ADR-019) — không tự đổi

| Mã | Quyết định | Chủ dự án KHÔNG chọn |
| --- | --- | --- |
| D-71 | Chuyển khoản = nhân viên xem app ngân hàng rồi bấm **"Đã nhận chuyển khoản & In bill"**. Không QR, không đối soát tự động. **Mỗi lượt thu một cách trả.** Số phải thu không đổi theo cách trả | Mã VietQR ở quầy; webhook SePay / Casso; trả lẫn tiền mặt + chuyển khoản trong một lượt |
| D-72 | **Két chỉ tính tiền mặt**: dự kiến = đầu ca + Σ thu `CASH` − Σ hoàn của lượt `CASH` + thu khác − chi quỹ đã duyệt. Hoàn tiền theo cách của lượt thu gốc | — |
| D-73 | "Gộp hóa đơn" = **thu chung nhiều bàn đúng lúc thu**, cùng một transaction với lượt thu; lỗi → không gộp gì. Không gộp bàn đang chia bill | Gộp hẳn nhóm vào nhau trước lúc thu |
| D-74 | "Tách hóa đơn" = chọn món bằng **ô tích** → một lần bấm tạo phần mới; bàn chưa chia thì món còn lại vào **"Phần còn lại"** | Chia đều theo đầu người; tách theo số tiền |

Muốn đổi một dòng trên → hỏi chủ dự án, viết ADR mới. Không tự làm.

---

# 3. Dữ liệu và thủ tục

**Migration 0039** (chỉ thêm / nới, chạy lại an toàn):
- `CK_Payments_Method`, `CK_Orders_PaymentMethod` → `IN ('CASH','TRANSFER')` (chỉ thay khi định nghĩa cũ chưa có `TRANSFER`). Lượt thu cũ giữ `CASH`.
- `Sessions.MergedIntoSessionId UNIQUEIDENTIFIER NULL` + FK tự tham chiếu `FK_Sessions_MergedInto` + index lọc `IX_Sessions_MergedInto`.

**Thủ tục:**

| SP | Thay đổi |
| --- | --- |
| `sp_SettleSession`, `sp_SettleSplit` | Tham số `@Method VARCHAR(10) = 'CASH'`, kiểm `IN ('CASH','TRANSFER')`. `TRANSFER` → `SET @AmountReceived = @AmountDue` **trước** kiểm thiếu tiền. Ghi `Orders.PaymentMethod` và `Payments.Method` |
| `sp_SubmitOrder` (mang đi) | `@PaymentMethod IN ('CASH','TRANSFER')`; chuyển khoản → nhận đủ, tiền thừa 0 |
| `sp_CloseShift` | `ExpectedCash` chỉ cộng `Method = 'CASH'`, chỉ trừ hoàn tiền của lượt `CASH` |
| `sp_VoidOrderItem` (`sp_CloseIfSettled`) | Xóa món cuối làm phiên đủ tiền → `PaymentMethod` lấy theo lượt thu gần nhất, không cố định `CASH` |
| **Mới** `sp_MergeSessions @TargetSessionId, @SourceIds (CSV), @UserId` | Kiểm 1–10 GUID không trùng, khác đích (50210). Khóa đích (`UPDLOCK, HOLDLOCK`; 50005 / 50031) rồi các nguồn (50211 không thấy, 50212 đã đóng). Không chia bill (50113 đích, 50213 nguồn). Chuyển `Orders.SessionId` → đích **giữ `TableId` bàn gốc**; chuyển `OrderItemVoids.SessionId`; chép `SessionClients` sang đích; đóng nguồn, ghi `MergedIntoSessionId` |

Mã lỗi (`ứng-dụng/máy-chủ/src/errors.js`): 50210 → 400 `VALIDATION_ERROR`, 50211 → 404 `NOT_FOUND`, 50212 → 409 `SESSION_CLOSED`, 50213 → 409 `SESSION_HAS_SPLITS`. Dùng lại: 50033 `HAS_PENDING_ORDERS`, 50034 `AMOUNT_CHANGED`.

---

# 4. Đặc tả từng chức năng

## F-056 — Thu bằng chuyển khoản

- **API** (`routes/staff.js`): `payFields = { method: z.enum(['CASH','TRANSFER']).default('CASH'), amountReceived?, expectedAmountDue? }`; `refine`: `CASH` bắt buộc `amountReceived` → thiếu thì `400`. Áp cho `POST /api/sessions/{id}/settle`, `POST /api/splits/{id}/settle`, `POST /api/orders/takeaway`. Kết quả có `payment.method`.
- **Ca** (`shiftsRepo`): `cashIn` chỉ tiền mặt; thêm `transferIn`, `transferCount`, `transferRefunds`; `cashOut` = hoàn của lượt tiền mặt; lượt thu và hoàn tiền trong báo cáo ca có `method`. Công thức màn ca đang mở **phải trùng** `sp_CloseShift`.
- **Báo cáo** (`reportsRepo.revenue`): `byMethod: { CASH, TRANSFER }` mỗi loại `{ collected, refunded, revenue, payments }`; tổng doanh thu không đổi. `refundsRepo` trả `method`.
- **Giao diện:**
  - Ngăn Thu tiền (`js/pages/pos-dashboard.js`, hàm `openSettle`): hai nút `.pay-method` **Tiền mặt / Chuyển khoản** (`aria-pressed`); `setMethod()` ẩn ô tiền khách đưa + nút tiền nhanh, đổi chữ nút thu.
  - Mang đi (`pos/takeaway.html`, `js/pages/pos-takeaway.js`): `#method-cash`, `#method-transfer`, `#cash-fields`, `#transfer-note`.
  - Ca (`pos-shift.js`, `admin-shifts.js`): "Tiền mặt đã thu", "Chuyển khoản (n lượt) — không vào két", "Đã hoàn tiền mặt", "Đã hoàn chuyển khoản"; cột "Cách trả" / "Cách hoàn".
  - Bill (`pos-receipt.js`): "Thanh toán: Chuyển khoản", không in tiền khách đưa / tiền thừa. Báo cáo (`admin-reports.js`): ô Tiền mặt / Chuyển khoản.

## F-057 — Gộp hóa đơn (thu chung nhiều bàn)

- **API:** `mergeSessionIds: uuid[]` (tối đa 10) ở `POST /api/sessions/{id}/settle/preview` (trả `mergedSessions[{ sessionId, table, ordersTotal }]`) và `…/settle` (trả `mergedSessionIds`). Phiếu tạm tính: `/api/sessions/{id}/receipt?mode=provisional&merge=<id,id>`.
- **Service** (`sessionService.js`): `mergeCandidates()` kiểm trước (không trùng, không chính nó, tồn tại, chưa đóng, không chia bill — thông báo có tên bàn). `sessionTotals()` gộp đơn của mọi phiên → **dùng nguyên bộ tính giá `pricing`** (hội viên / giảm tay / voucher / làm tròn tính trên tổng chung).
- **Một transaction** (`sessionsRepo.mergeAndSettle`): `inTransaction(tx => sp_MergeSessions → settle(targetId, args, tx))`. Đơn chờ tiếp nhận ở bàn B chỉ bị `sp_SettleSession` phát hiện **sau** bước gộp → nhờ transaction mà rollback cả gộp.
- **Realtime sau commit:** `session.settled` tới `staff` + phòng phiên A (có `mergedSessionIds`); tới từng phòng phiên được gộp: `{ sessionId, table, mergedInto: { sessionId, table } }` — **không có `qrToken`**.
- **Khách:** `GET /api/sessions/{id}` của phiên đã gộp có `mergedInto` (chỉ `tableId, code, name`). `js/customer.js` `followMerged(qr, mergedInto)` lưu phiên A cho URL bàn hiện tại rồi mở `/t/{qr}/track`; `t-track.js` gọi khi tải trang và khi nhận `session.settled`.
- **Bill:** `receipt()` của phiên đã gộp → bill phiên A; có `tables[]`, `lines[].table`; `pos-receipt.js` nhóm món theo bàn (`tr.group`).
- **Giao diện ngăn thu:** nút **"Thu chung với bàn khác"** → `pickMerge()` (ô tích: `Tên bàn · n đơn · tiền · mở hh:mm`, bàn đang chia bill bị khóa) → tiêu đề "Thu chung: A + B", đơn bàn B hiện chỉ đọc (`h4.merge-table`), ghi chú + nút **"Bỏ thu chung"**, cảnh báo đơn chờ của bàn B, ghi chú hội viên bàn B không tự áp. Máy quầy khác đang mở ngăn bàn B → tự đóng ngăn + báo.

## F-058 — Tách hóa đơn theo món

- **API:** `POST /api/sessions/{id}/splits/separate` `{ label (1–50), orderItemIds (1–100, không trùng) }` → `201 { splitId, …view }`. Chỉ quầy (khách → `401`), cần ca mở (`409 NO_OPEN_SHIFT`).
- **Repo** (`splitsRepo.separate`, một `inTransaction`): khóa phiên → tạo "Chung" nếu chưa có → tạo phần mới → UPDATE các dòng hợp lệ: thuộc phiên, đơn chưa `CANCELLED` / `VOIDED`, `ParentOrderItemId IS NULL` (không phải thành phần combo), `PaidAt IS NULL`, đang ở Chung hoặc phần còn `OPEN`. Số dòng đổi ≠ số dòng chọn → rollback → `409 LINE_LOCKED`.
- **"Phần còn lại":** sau khi chuyển, nếu không còn phần mở nào khác (ngoài phần vừa tạo) mà Chung còn món → tạo "Phần còn lại" và dời món Chung vào đó. Thiếu bước này thì phần vừa tách là phần mở cuối cùng và **tự gánh hết món Chung** theo F-026.
- **Giao diện:** nút **"Tách hóa đơn"** → `separateItems()`: mỗi món chưa thu một ô tích (ghi phần hiện tại), ô "Tên hóa đơn tách ra" (mặc định "Phần N"), nút **"Tách ra hóa đơn riêng"** (chống bấm đúp). Sau đó ngăn ở chế độ chia bill; mỗi phần thu bằng tiền mặt hoặc chuyển khoản.
- Phát `session.split_changed` như F-026.

---

# 5. Bẫy đã gặp (review G3) — giữ nguyên cách xử lý

1. **Cách trả phải về Tiền mặt sau mỗi lượt thu** (đổi phần, thu xong một phần, mang đi xong, "Xóa giỏ"). Để nguyên "Chuyển khoản" thì lượt sau dễ ghi nhầm → két lệch, đúng lỗi chủ dự án muốn tránh.
2. **Không gửi mã QR bàn đích** cho người ở bàn được gộp (AC-010-04: người cũ không được giữ QR bàn khác).
3. **Hai nhóm cùng một bàn** thu chung: điện thoại nhóm sau không đổi URL → phải dùng `followMerged` (lưu phiên đích theo mã bàn hiện tại).
4. **Đơn giữ `TableId` bàn gốc** → bất biến `ORDER_TABLE_MISMATCH` phải chấp nhận bàn của phiên đã gộp. Phân tích "Theo bàn" (F-042) tính theo lượt thu → doanh thu ghi vào bàn A (chấp nhận, đã ghi ADR).
5. `OrderItemVoids.SessionId` phải theo đơn sang phiên A, nếu không lịch sử sửa/xóa món mất khỏi bill chung.
6. Hoàn tiền một lượt thu chung có thể hủy đơn của bàn B (`orderIds`) — đơn ở phiên A nên hợp lệ.
7. Mọi công thức két (màn ca, `sp_CloseShift`, test `finance.test.js`, bất biến `SHIFT_EXPECTED_CASH`) phải cùng là "chỉ tiền mặt".
8. Thêm dòng vào `api-contract.md` chỉ với endpoint **có thật** — test F-052 (`api-docs.test.js`) báo dòng mồ côi (đã vấp `GET /api/shifts/{id}` không tồn tại).

---

# 6. Kiểm chứng

| Lớp | Ở đâu | Gồm |
| --- | --- | --- |
| Integration | `ứng-dụng/máy-chủ/tests/payment-method.test.js` (5) | AC-056-01…05: TRANSFER không cần tiền khách đưa; két chỉ tiền mặt, đóng ca chênh 0; hoàn chuyển khoản không trừ két; chia bill + mang đi; `byMethod` |
| Integration | `ứng-dụng/máy-chủ/tests/merge-bills.test.js` (9) | AC-057-01…04, AC-058-01…02 + rollback khi lỗi **sau** `sp_MergeSessions` (gọi thẳng `sessionsRepo.mergeAndSettle` với tổng cũ → 50034, bàn B nguyên vẹn); hội viên trên tổng chung; hoàn tiền lượt thu chung; hai nhóm cùng bàn; combo |
| Bất biến | `tests/helpers/testDb.js` | `MERGED_SESSION_STATE`, `TRANSFER_WITH_CHANGE`, `SHIFT_EXPECTED_CASH` (chỉ tiền mặt), `ORDER_TABLE_MISMATCH` (cho phép bàn gốc) |
| E2E | `kiểm-thử/e2e/flow.spec.js` | AC-056-06 chuyển khoản; AC-057-05 thu chung (bàn GH1 + GH2); AC-058-03 tách (TH1) + kiểm nút Tiền mặt `aria-pressed="true"` ở phần sau |

Lưu ý khi viết test: dữ liệu mẫu test chỉ có bàn 01–06 → dùng lại bàn đã đóng; combo phải tạo bằng `POST /api/admin/combos`; import module app **sau** `startApp()`. E2E dự án `flow` chạy nối tiếp — test lẻ bằng `-g` sẽ lỗi vì thiếu bước trước.

Lệnh (lấy từ `package.json`): `npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load` · `npm run trace -- --check` · `npm run db:migrate`.

Kết quả lúc làm (24/10/2026): `npm test` 328/328, E2E 48/48, load 10/10, trace 137 US / 349 AC PASS. Test mới chạy trên code cũ: đỏ đủ 14/14 integration và 3/3 E2E.

---

# 7. Làm lại trên bản code chưa có (thứ tự)

1. Tài liệu trước: ADR-019, FEATURE-056…058, BR-088…091, US, dòng tc-map, TASK + plan.
2. Migration 0039 → SP (`sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder`, `sp_CloseShift`, `sp_VoidOrderItem`, mới `sp_MergeSessions`) → `errors.js`.
3. Repo → service → route (F-056 trước vì F-057 / F-058 dùng `method`).
4. Giao diện: ngăn thu → mang đi → ca / báo cáo / bill → điện thoại khách (`followMerged`).
5. Test integration + bất biến → E2E → cập nhật api-contract, data-model, screens-flows, test-strategy, traceability.
6. Review độc lập (agent chỉ đọc) → sửa → chứng minh test mới đỏ trên code cũ (worktree tách rời) → commit theo Task ID, tác giả là chủ dự án.

---

# 8. Khi thất bại / không chắc

- Két lệch sau khi sửa → so ba chỗ: `shiftsRepo` (ca đang mở), `sp_CloseShift`, bất biến `SHIFT_EXPECTED_CASH`.
- Thu chung lỗi nhưng bàn B đã đóng → kiểm `mergeAndSettle` còn bọc **cả hai** SP trong một `inTransaction` và SP dùng `SET XACT_ABORT ON`.
- Phần vừa tách "ăn" hết món → kiểm bước "Phần còn lại".
- Yêu cầu nằm ngoài D-71…D-74 → dừng, hỏi chủ dự án.

# 9. Không làm

- Không tích hợp cổng thanh toán, QR động, webhook ngân hàng; không lưu số tài khoản khách.
- Không cho một lượt thu hai cách trả; không bỏ gộp sau khi đã thu (chỉ hoàn tiền / hủy đơn).
- Không đổi bộ tính giá `pricing` theo cách trả; không sửa dữ liệu lượt thu cũ.
- Không reset `CafeQrDev`; không đẩy GitHub / gộp `main` khi chủ dự án chưa bảo.

# 10. Hoàn thành khi

- AC-056-01…06, AC-057-01…05, AC-058-01…03 PASS, có test chạy được; test mới đỏ trên code cũ.
- Đóng ca có lượt chuyển khoản → chênh lệch 0 khi đếm đúng tiền mặt.
- Lint, format, `npm test`, E2E, load, `trace --check` sạch; tài liệu liên quan cập nhật cùng task; TASK ghi kết quả và chuyển `READY_FOR_REVIEW`.
