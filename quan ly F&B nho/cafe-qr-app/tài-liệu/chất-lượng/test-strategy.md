# Chiến lược kiểm thử và Definition of Done

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §13 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 13.1. Loại kiểm thử theo rủi ro

| Rủi ro | Kiểm thử | Môi trường | Người phụ trách |
| --- | --- | --- | --- |
| **Âm kho / trừ 2 lần** (BR-001, BR-002, NFR-002) | Integration test gọi SP trên **SQL Server thật** với N luồng song song; k6 bắn `POST /api/orders` và `POST /api/orders/{id}/complete` đồng thời; assert bất biến sau test | SQL Server Docker | Sáng + Nhật Anh |
| Thu tiền sai / thu 2 lần (BR-019) | Integration test `sp_SettleSession`: đồng thời 2 request, còn đơn PENDING, tiền đưa thiếu; kiểm `Payments` đúng 1 dòng | SQL Server Docker | Nhật Anh + Sáng |
| Quyền | Test ma trận actor × endpoint (khách gọi API quầy, STAFF/MANAGER gọi admin); từ ADR-006 sinh tự động từ `PERMISSIONS` | Backend test | Sáng |
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

## Bộ test hiện có (cập nhật 20/10/2026)

Kết quả chạy ngày **20/10/2026** (máy local, TASK-057 / TASK-058): `npm test` **255/255 PASS** (19 file), `npm run test:e2e` **34/34 PASS** (31 luồng + 3 khả năng tiếp cận), `npm run load` NFR-002 **10/10 vòng PASS** (NFR-001 p50 79 ms, p95 239 ms), `npm run lint` + `npm run format:check` PASS, `npm audit` 0 lỗ hổng. Cập nhật **21/10/2026** ([TASK-059](../công-việc/TASK-059.md)): `npm run test:e2e` **35/35 PASS** (32 luồng + 3 khả năng tiếp cận — thêm test hồi quy DEF-011), chạy 2 lần liên tiếp. Cập nhật **21/10/2026** ([TASK-060](../công-việc/TASK-060.md) … [TASK-063](../công-việc/TASK-063.md), F-048…F-051): `npm test` **286/286 PASS** (24 file — thêm `stock-revise`, `table-move`, `cash-void`, `reviews` và các bất biến `RECEIPT_LEDGER_MISMATCH`, `STOCKTAKE_LEDGER_MISMATCH`, `PO_RECEIVED_MISMATCH`, `ORDER_TABLE_MISMATCH`, `CASH_REPLACE_LINK`), `npm run test:e2e` **39/39 PASS** (36 luồng + 3 khả năng tiếp cận — quét thêm `/admin/reviews`). Cập nhật **23/10/2026** ([TASK-064](../công-việc/TASK-064.md), F-052): `npm test` **292/292 PASS** (25 file — thêm `api-docs.test.js` 6 test), `npm run test:e2e` **40/40 PASS** (37 luồng + 3 khả năng tiếp cận — quét thêm `/admin/api-docs`). Cập nhật **23/10/2026** ([TASK-070](../công-việc/TASK-070.md), bước 15): `npm test` **302/302 PASS** (26 file — thêm `ops.test.js` 10 test đơn vị cho script sao lưu / kiểm tra hệ thống); script vận hành thử thật trên máy dev ([backup-restore.md](../vận-hành/backup-restore.md) §6). 1](../công-việc/TASK-071.md), F-055): `npm test` **304/304 PASS** (27 file — thêm `shift-required.test.js` 4 test), `npm run test:e2e` **43/43 PASS** (40 luồng + 3 khả năng tiếp cận — thêm E2E "chưa mở ca…"). Gộp **23/10/2026** (nhánh `release/2026-10-23` = main + TASK-065…072): `npm test` **314/314 PASS** (28 file), `npm run test:e2e` **45/45 PASS** (42 luồng + 3 khả năng tiếp cận), `npm run load` **10/10 vòng PASS** (p95 219 ms). Cập nhật **24/10/2026** ([TASK-073](../công-việc/TASK-073.md), F-056…F-058): `npm test` **328/328 PASS** (30 file — thêm `payment-method.test.js` 5 test, `merge-bills.test.js` 9 test; bất biến két theo tiền mặt + thu chung), `npm run test:e2e` **48/48 PASS** (45 luồng + 3 khả năng tiếp cận — thêm E2E chuyển khoản, thu chung, tách hóa đơn), `npm run load` **10/10 vòng PASS** (p95 262 ms). **Ma trận truy vết** [traceability.md](traceability.md): 349 / 349 AC PASS, 0 GAP (sinh bằng `npm run trace` từ [tc-map.md](tc-map.md) + báo cáo chạy thật). Chạy lại ngày **27/10/2026** ([TASK-074](../công-việc/TASK-074.md), F-059 QR Wi-Fi): `npm test` **333/333 PASS** (31 file — thêm `wifi-qr.test.js` 5 test), `npm run test:e2e` **49/49 PASS** (46 luồng + 3 khả năng tiếp cận — thêm E2E QR Wi-Fi; a11y quét trang In QR có khối Wi-Fi), traceability **353 / 353 AC PASS**, 0 GAP. Chạy lại ngày **27/10/2026** ([TASK-075](../công-việc/TASK-075.md), F-060 cảnh báo bất thường qua email): `npm test` **346/346 PASS** (32 file — thêm `alerts.test.js` 13 test, bộ gửi email giả, không gửi thật kể cả khi `.env` có SMTP), `npm run test:e2e` **50/50 PASS** (47 luồng + 3 khả năng tiếp cận — thêm E2E cảnh báo; a11y quét `/admin/alerts`), traceability **363 / 363 AC PASS**, 0 GAP. Chạy lại ngày **29/10/2026** ([TASK-077](../công-việc/TASK-077.md), F-061…F-063 trên `main` sau khi gộp `v1.0.0-rc.1`): `npm test` **355/355 PASS** (33 file — thêm `basic-mode.test.js` 9 test, gồm chạy lại đúng file migration 0041 trên CSDL giả lập trước nâng cấp), `npm run test:e2e` **54/54 PASS** (51 luồng + 3 khả năng tiếp cận — thêm 4 E2E; a11y quét trang Chính sách dữ liệu và hộp hướng dẫn), traceability **375 / 375 AC PASS**, 0 GAP.

> Kết quả trước đó (18/10/2026, sau F-047): `npm test` 234/234, E2E 29/29 — giữ trong các bàn giao cũ.

| Bộ | Lệnh | Phạm vi | Kết quả |
| --- | --- | --- | --- |
| SP integration | `npm test` (file `ứng-dụng/máy-chủ/tests/sp.test.js`) | 18 test: gửi đơn, thiếu kho, món tắt, **20 phiên/1 suất**, mang đi, hoàn tất/hủy, **§13.2 ×10 vòng**, gọi thanh toán, settle (PENDING/thiếu tiền/AMOUNT_CHANGED/**đồng thời**), **submit ⇄ settle ×10 (Q-013)**, đóng bàn trống, điều chỉnh kho | 18/18 PASS |
| Xóa trong Quản lý (ADR-004) | `npm test` (file `ứng-dụng/máy-chủ/tests/delete.test.js`) | 7 test: xóa hẳn / xóa mềm từng loại, chặn khi đang dùng, QR bàn đã xóa chết, token người bị xóa 401, tên/mã dùng lại, báo cáo giữ tên | 7/7 PASS |
| API + quyền + realtime | `npm test` (file `ứng-dụng/máy-chủ/tests/api.test.js`) | 21 test: ma trận quyền, luồng khách → quầy → thu tiền, Idempotency-Key, OUT_OF_STOCK, socket phiên khác không nhận sự kiện, quản trị, báo cáo seed | 21/21 PASS |
| Bộ tính giá (unit, ADR-005) | `npm test` (file `ứng-dụng/máy-chủ/tests/pricing.test.js`) | 14 test: lịch/khung giờ (qua nửa đêm, thứ trong tuần), giá KM thấp nhất, combo không nhận KM dòng, tùy chọn Min/Max, KM đơn lớn nhất + tối thiểu, hội viên chỉ trên dòng cộng dồn, đơn đầu 10%, giảm tay, làm tròn xuống 500đ, ngưỡng duyệt | 14/14 PASS |
| Hội viên + ca + giảm tay (F-014, F-018, F-022) | `npm test` (file `members.test.js`) | 12 test: SĐT sai/đồng ý/trùng, tên che, gắn phiên + realtime, đơn đầu −10% + làm tròn + bill, lên hạng, giảm tay trong/vượt ngưỡng + duyệt quản lý, mở/đóng ca + chênh lệch, ẩn danh, hạng, **rate-limit 429** | 12/12 PASS |
| Bán hàng (F-013, F-015, F-016, F-017, F-020, F-021) | `npm test` (file `sales.test.js`) | 14 test: tùy chọn (BOM thêm, đơn cũ giữ phụ thu), combo (dòng con, trừ kho thành phần, hết theo thành phần, IN_COMBO), khuyến mãi (giá thấp nhất, ngoài giờ, **MaxUsesPerDay tranh lượt đồng thời**, StackWithMember), gợi ý/ghim, tạm ngưng nhận đơn, giờ bán, gọi nhân viên | 14/14 PASS |
| Vận hành (F-019, F-023) | `npm test` (file `operations.test.js`) | 12 test: hoàn một phần/đủ + RESTOCK, **hoàn đồng thời không vượt**, hoàn đơn chưa pha trả kho giữ, quá ngày, ca ghi tiền hoàn, phiếu nhập, kiểm kê (khóa điều chỉnh, chốt, dưới phần giữ), giá vốn/hao hụt, báo cáo marketing, cài đặt | 12/12 PASS |
| Gọi món tại bàn + ghi chú bàn (F-024) | `npm test` (file `table-order.test.js`) | 11 test: mở bàn kèm ghi chú, đơn nhân viên → `PREPARING` + giữ kho, khách gộp nhóm không thấy ghi chú, `TABLE_OCCUPIED` / Nhóm mới, **2 máy mở cùng bàn đồng thời → 1 phiên**, nhập khi tạm ngưng QR, Idempotency-Key, gọi thêm sau gọi thanh toán, phiên đã thu, `session.note_changed` không tới khách, kiểm tra đầu vào + quyền | 11/11 PASS |
| Giai đoạn 4 — unit (F-040, F-025, F-026) | `npm test` (file `phase4-unit.test.js`) | 10 test: **Lịch thực đơn** (5: khung sáng 05:30–10:00, lịch theo mùa cả danh mục, SHOW + HIDE → ẩn, thứ trong tuần + qua nửa đêm + lịch tắt, `nextChangeAt`; đồng hồ giả lập); **Thời gian chờ** (3: thời gian chuẩn quản lý nhập > trung vị > 180 s, combo theo thành phần; hàng chờ 0, `parallelism` 2, khoảng ±25 %; tham số `items`); **Chia khuyến mãi đơn theo dòng** (2: phân bổ đúng tổng, phần dư cho phần lẻ lớn nhất; Σ hai phần = tổng đơn, hội viên chỉ phần có hội viên) | 10/10 PASS (18/10) |
| Giai đoạn 4 — integration (F-045, F-040, F-025, F-026) | `npm test` (file `phase4.test.js`) | 12 test: **Gọi lại đơn & món yêu thích** (3: giá hiện tại + giữ tùy chọn/ghi chú; món hết → bỏ + lý do; ♥, "hay gọi", khách phiên khác → 403); **Thực đơn theo lịch** (3: khách không thấy / không đặt món ngoài lịch, quầy vẫn bán; xem trước + tắt lịch; giờ bán F-020 đồng bộ thành lịch); **Thời gian chờ** (2: ETA theo hàng chờ / `parallelism` / thời gian quản lý nhập; job `prep-stats` trung vị, chạy lại không nhân đôi, **hai lần cùng lúc → một `SKIPPED`**); **Chia bill** (4: 2 khách 4 dòng + phần Chung, không lấy dòng người khác; thu phần A rồi phần cuối tự gộp Chung + hội viên chỉ phần B → phiên đóng; **thu đồng thời cùng một phần → 1 OK, 1 409**; `SPLIT_EMPTY`, "Thu chung" khi chưa thu phần nào) | 12/12 PASS (18/10) |
| Giai đoạn 5 — unit (F-031, F-027, F-032, F-029) | `npm test` (file `inventory-unit.test.js`) | 6 test: quy đổi thùng → lon → ml; công thức vòng lặp / quá 3 cấp; thất thoát (thiếu 40 → bình thường, thiếu 120 → 70, tô đỏ); dự báo WMA 0,4/0,3/0,2/0,1 bỏ tuần đóng cửa × (1 + hao hụt), đề xuất = nhu cầu + an toàn − khả dụng − đang về theo gói, ngày giao kế tiếp theo lịch | 6/6 PASS (18/10) |
| Giai đoạn 5 — integration kho nâng cao (F-031, F-027, F-032, F-028, F-030, F-029) | `npm test` (file `inventory2.test.js`) | 16 test: **Đơn vị & giá vốn** (4: nhập 1 thùng → +7.920 ml, `UNIT_MISMATCH`; `AvgCost` sau 2 lần nhập; `CogsAmount` lúc hoàn tất, giá đổi không tính lại, thiếu giá → NULL; báo cáo COGS + quản lý đơn vị); **Bán thành phẩm** (3: pha ×2, thiếu hạt → 409 không đổi gì, `RECIPE_CYCLE`, bán ly trừ cốt); **Hao hụt & phiếu hủy** (2); **Lô FEFO** (4: lô sớm trước + tách 2 dòng, hoàn tất qua nhiều lô + FIFO giá lô, lô hết hạn không vào khả dụng + hủy lô, **40 thao tác ngẫu nhiên giữ Σ lô = tồn**); **Nhà cung cấp & PO** (2: `PARTIAL` → `RECEIVED`, nhận vượt 409 / có xác nhận, hủy PO đã nhận → 409, quầy không sửa được nhà cung cấp); **Dự báo nhập hàng** (1) | 16/16 PASS (18/10) |
| Giai đoạn 6 — unit (F-035, F-033, F-034, F-036) | `npm test` (file `finance-unit.test.js`) | 8 test: luật nhật ký thao tác (route quầy theo bảng luật, mọi thao tác đổi dữ liệu dưới `/admin` đều ghi, che mật khẩu/hash/token, SĐT còn 3 số cuối); CSV (BOM UTF-8, bọc ô, chặn công thức Excel); lãi/lỗ (cố định/ngày theo số ngày tháng, công thức chỉ tiêu); thời hạn token → giờ; ngưỡng giảm tay theo vai + `can` | 8/8 PASS (18/10) |
| Giai đoạn 6 — integration (F-036, F-033, F-035, F-034) | `npm test` (file `finance.test.js`) | 29 test: **Vai Trưởng ca & ma trận quyền** (6: **ma trận actor × endpoint sinh từ `PERMISSIONS`**, khách không token → 401, giảm tay theo vai, trưởng ca duyệt 15 % / không duyệt 25 %, **hai quản lý hạ quyền nhau đồng thời → đúng một thành công** + `LAST_ADMIN`, trưởng ca điều chỉnh kho + kiểm kê, nhân viên 403); **Sổ quỹ** (10: chi nhỏ duyệt ngay, chi 800k chờ duyệt + `CASH_PENDING` + nhân viên duyệt 403, "Khác" luôn chờ duyệt, trưởng ca ≤ 2.000.000đ + không tự duyệt, thu khác, ảnh > 2 MB / không phải ảnh / png đúng byte, CSV + phiếu chốt ca, công thức `ExpectedCash`, đóng ca → chấm công ra, hoàn tiền theo vai); **Chấm công, lịch làm, năng suất** (6: đăng nhập/đăng xuất, **đăng nhập đồng thời 5 lần → một bản ghi mở**, quên đăng xuất 12 giờ + job thời hạn token, sửa tay 400/403/409, lịch làm vắng / muộn / kéo ca / chép tuần, năng suất); **Nhật ký thao tác** (3); **Lãi / lỗ** (4: số liệu một ngày, theo tháng + MANAGER 403, ước tính giá vốn, chi phí cố định hết hiệu lực giữa tháng) | 29/29 PASS (18/10) |
| Giai đoạn 7 — CRM (F-039, F-038, F-037) | `npm test` (file `loyalty.test.js`) | 19 test: **Tích điểm & tem** (7: điểm = ⌊thực trả / 10.000⌋ + `EARN`, +2 tem; đủ 10 tem → lượt miễn phí; đổi quà thiếu điểm 409, quà món phải có trên bill, không cùng giảm tay; **hai quầy cùng đổi 100 điểm khi có 150 → một lượt**; hoàn toàn bộ → trừ điểm tích, trả điểm đổi, trừ tem; điều chỉnh điểm 400/409 + nhật ký + trưởng ca 403; khách thấy điểm/tem, không thấy mã voucher); **Giới thiệu bạn + voucher** (6: tự giới thiệu 400 / không có 404; lần đầu ≥ 30.000đ → 2 voucher + realtime; lần đầu < 30.000đ → không tặng; voucher dùng lần 2 / người khác / hết hạn → 409, mã sai 404; voucher tay **hai quầy cùng dùng → một bên thắng**; **5 lượt/tháng với đăng ký đồng thời**); **Chiến dịch** (6: phân khúc + loại opt-out; EXPORT tạo voucher, CSV + nhật ký, chạy lại 409; 7 ngày → `SKIPPED`; Zalo OA chưa token 400 / kênh giả lỗi → `FAILED`, SMS chưa hỗ trợ; hẹn giờ + job `campaigns-due` + hiệu quả; opt-out) | 19/19 PASS (18/10) |
| Giai đoạn 8 — phân tích + dashboard (F-041, F-042, F-043) | `npm test` (file `analytics.test.js`) | 8 test: 2 unit hàm thuần (8 món → 4 nhóm + "Chưa đủ dữ liệu"; heatmap Thứ Hai = hàng 0, WMA ± độ lệch chuẩn, % thay đổi, cờ bàn) + 6 integration (menu engineering 30 ngày + ghim + trưởng ca 403; heatmap ô T7 10h; dự báo doanh thu = WMA trên doanh thu thuần; so sánh tuần; bàn ngồi 3 giờ 60.000đ bị gắn cờ; job `daily-summary` tạo dòng hôm qua khớp báo cáo, trưởng ca không thấy lãi, nhân viên 403, "Tính lại hôm nay") | 8/8 PASS (18/10) |
| Sửa / xóa món, xóa đơn, hủy bàn (F-046, ADR-007) | `npm test` (file `void.test.js`) | 12 test: AC-046-01 (giảm 2 → 1 ở đơn chờ: tổng −25.000đ, kho giữ −1 ly, lịch sử; SL 0 = xóa dòng); AC-046-02 (không / sai người duyệt → 403, thiếu lý do → 400, trưởng ca duyệt → OK); AC-046-03 (món đã pha: hoàn kho / ghi hủy hàng, giá vốn dòng giảm, **hoàn tiền sau đó không hoàn lại phần đã xử lý**); xóa đơn đã pha + hoàn kho nguyên liệu theo lô (lô `RESTOCK`, Σ lô = tồn); AC-046-04 (khuyến mãi đơn tính lại / bỏ dưới tối thiểu, xóa hết món → `CANCELLED`); combo & tùy chọn; AC-046-05 (hủy bàn, cần duyệt khi có đơn đã tiếp nhận); AC-046-06 (món đã thu / mang đi → 409, phiên đã thu một phần → không hủy bàn, bỏ nốt món chưa thu → phiên đóng); **xóa đua với tiếp nhận đơn ×6**; **hai máy cùng xóa một dòng → 1 thành công**; nhật ký thao tác không lưu mật khẩu; xóa tài khoản chỉ có lịch sử sửa / xóa món → xóa mềm | 12/12 PASS (18/10) |
| Hội viên tại bàn, Thẻ thành viên, quyền lợi trên bill (F-047, ADR-008) | `npm test` (file `member-card.test.js`) | 5 test: **AC-047-01/02** (nhân viên mở bàn trống, tra cứu không thấy, đăng ký không đồng ý → `400 CONSENT_REQUIRED`, có đồng ý → 201, gắn → quầy thấy tên đầy đủ, `session.member_changed` chỉ tên che, tổng quan bàn hiện hội viên, gọi món + thu tiền → tích điểm); chuẩn bị chiến dịch "Tri ân tháng 10" (xuất danh sách, 15 %, 7 ngày); **AC-047-03** (khách trong phiên mở thẻ: tên / SĐT che, điểm, lịch sử `EARN`, tem 2/10, quà còn thiếu điểm, voucher 15 % nguồn `Chiến dịch "Tri ân tháng 10"`, **JSON không có mã voucher**, quầy cũng đọc được); **AC-047-04** (thiết bị khác 403, chưa gắn hội viên `404 NO_MEMBER`, phiên đóng 409, phiên không có 404); **AC-047-05** (bill cuối có `memberCard`, tạm tính `null`, bill không hội viên `null`, mang đi có hội viên có khối) | 5/5 PASS (18/10) |
| E2E giao diện | `npm run test:e2e` (`kiểm-thử/e2e/flow.spec.js`, Chromium) | 29 test: 15 test MVP (đăng nhập, gộp/tách, **≤ 3 chạm**, realtime < 2 s, hết món, **mất mạng quầy**, thu tiền, mang đi, in 80 mm, báo cáo, BOM, Xóa) + 5 test giai đoạn 2 (hội viên ở giỏ → giảm đơn đầu khi thu, Size L + combo, gọi nhân viên, tạm ngưng nhận đơn, ca + hoàn tiền + đóng ca) + 1 test F-024 (gọi món tại bàn → khách gộp nhóm → sửa ghi chú → thu tiền) + 6 test giai đoạn 4–8: gọi lại đơn + thời gian chờ (F-045, F-025); chia bill 2 khách, thu từng phần, in bill riêng (F-026); kho nâng cao — pha mẻ, phiếu hủy, nhận hàng theo PO, đề xuất nhập, giá vốn thực tế (F-027, F-032, F-030, F-029, F-031); trưởng ca + sổ quỹ — chi tiền, duyệt 800.000đ ở màn Ca, tab Kiểm kê, sổ quỹ, kéo ca, lãi/lỗ, nhật ký (F-036, F-033, F-035, F-034); CRM — đăng ký có người giới thiệu, điểm/tem dự kiến, tặng + dùng voucher, chạy chiến dịch xuất danh sách (F-039, F-038, F-037); phân tích + dashboard — trưởng ca mở "Hôm nay" trên điện thoại không cuộn ngang, không thấy lãi (F-041, F-042, F-043) + 1 test F-046: sửa / xóa món + hủy bàn — nhân viên giảm món đã tiếp nhận bị đòi duyệt → trưởng ca nhập tài khoản → tổng 35.000đ, lịch sử "duyệt: …"; Hủy bàn → bàn biến khỏi danh sách + 1 test F-047: hội viên tại bàn + thẻ thành viên — nhân viên đăng ký nhanh SĐT mới ở Gọi món tại bàn (chưa tick đồng ý bị chặn), khách cùng bàn thấy tên che và mở Thẻ thành viên (SĐT che, lịch sử điểm, không cuộn ngang ở 390 px), thu tiền → bill có "THẺ THÀNH VIÊN (lúc in)" + "Điểm hiện có" | 29/29 PASS (18/10) |
| Ép tải HTTP | `npm run load` | §13.2: 10 vòng × 30 khách đồng thời; hoàn tất 2 request/đơn; đo NFR-001 | 10/10 PASS; NFR-001 p50 78 ms, p95 89 ms (máy local, 18/10/2026 sau F-046) |
| Lint + định dạng | `npm run lint`, `npm run format:check` | ESLint 9, Prettier 3 trên `ứng-dụng/`, `kịch-bản/`, `kiểm-thử/` | PASS (18/10) |

Mọi bộ đều kiểm **bất biến kho/thu tiền** sau khi chạy (`inventoryViolations`): kho không âm, `ReservedQty` khớp, không trừ/hoàn kho 2 lần, không còn đơn chưa thu trong phiên đã đóng, **`AmountDue = Subtotal − Promo − Member − Voucher − Reward − Manual − RoundingAdj`** (từ giai đoạn 7 gồm voucher và đổi thưởng), Σ đơn của lượt thu = tạm tính − khuyến mãi (lượt thu không chia bill), **Σ hoàn ≤ đã thu**, tối đa một ca mở. Test chạy trên SQL Server thật, không mock.

Bất biến thêm ở giai đoạn 4–8 (`ứng-dụng/máy-chủ/tests/helpers/testDb.js`):

| Mã vi phạm | Kiểm | Feature |
| --- | --- | --- |
| `LOTS_MISMATCH` | Nguyên liệu theo lô: Σ `Qty` lô mở = `StockQty` | F-028 |
| `CLOSED_LOT_HAS_QTY` | Lô đã đóng không còn hàng | F-028 |
| `DEDUCT_QTY_MISMATCH` | Σ DEDUCT (qua nhiều lô) của đơn × nguyên liệu = lượng đã giữ (`OrderIngredients`) | F-028 |
| `PREP_UNBALANCED` | Mỗi mẻ sơ chế: Σ giá trị `PREP_OUT` = `PREP_IN` | F-027 |
| `COGS_MISMATCH` | Σ `CogsAmount` dòng đơn = Σ `CostAmount` các dòng DEDUCT của đơn − Σ `OrderItemVoids.CogsReduction` (từ F-046) | F-031, F-046 |
| `SPLIT_SESSION_MISMATCH` | Phiên chia bill đã đóng: Σ (tạm tính − khuyến mãi) các phần = Σ đơn | F-026 |
| `SPLIT_UNPAID_LINE` | Phiên đã đóng: mọi dòng của đơn không hủy có `PaidAt` | F-026 |
| `LINE_PAYMENT_OTHER_SESSION` | Dòng chỉ được thu bởi lượt thu của đúng phiên (hoặc đúng đơn mang đi) chứa nó | F-026 |
| `SPLIT_PAID_NO_PAYMENT` | Phần `PAID` (không phải Chung, có dòng) có `PaymentId` | F-026 |
| `SHIFT_EXPECTED_CASH` | Ca đã đóng: `ExpectedCash` = đầu ca + thu − hoàn + thu khác đã duyệt − chi đã duyệt | F-033 |
| `CLOSED_SHIFT_CASH_PENDING` | Ca đã đóng không còn khoản quỹ chờ duyệt | F-033 |
| `MANY_OPEN_ATTENDANCE` | Mỗi người tối đa một lần chấm công đang mở | F-035 |
| `POINTS_LEDGER_MISMATCH` | `Members.Points` = Σ sổ điểm | F-039 |
| `EARN_MISMATCH` | `Payments.PointsEarned` = dòng `EARN` của lượt thu | F-039 |
| `VOUCHER_PAYMENT_MISMATCH` | Voucher đã dùng gắn đúng lượt thu có `VoucherId` đó | F-038 |
| `STAMP_CARD_OVERFLOW` | Không thẻ tem nào có `Stamps ≥ RequiredStamps` | F-039 |
| `OVER_RESTOCK` | Mỗi đơn × nguyên liệu: `RESTOCK` + `VOID_BACK` + lượng ghi hủy khi xóa món ≤ `DEDUCT` | F-046 |
| `ORDER_LINES_MISMATCH` | Đơn không hủy: tạm tính = Σ SL × giá niêm yết dòng cấp trên; tổng = Σ SL × đơn giá − khuyến mãi đơn | F-046 |

**Test ma trận quyền sinh từ `PERMISSIONS`** (`finance.test.js`, F-036, AC-036-01): mỗi quyền trong `src/auth/permissions.js` có một request đại diện (`PROBES`); test **fail nếu có quyền mới chưa có probe**. Với mỗi quyền × mỗi vai (STAFF, MANAGER, ADMIN): vai được phép không nhận 401/403, vai không được phép nhận đúng 403. Test kế tiếp kiểm khách không token → 401 trên endpoint quầy / trưởng ca / quản lý.

**Job nền trong test:** `testDb.js` và `kịch-bản/e2e-server.js` đặt `JOBS_ENABLED=false`; test gọi job qua `POST /api/admin/jobs/{name}/run` (`prep-stats`, `demand-forecast`, `attendance-autoclose`, `campaigns-due`, `daily-summary`). Ảnh hóa đơn test lưu ở thư mục tạm (`UPLOADS_DIR`), không vào `uploads/` thật. Kênh Zalo OA thay bằng kênh giả (`setSender`), không gọi mạng.

**NOT_RUN:** in trên máy in nhiệt thật, NFR-001 trên Wi-Fi quán (TASK-020); k6 (dùng `npm run load` thay); CI GitHub Actions (chưa có remote — đã chạy tương đương local); gửi tin Zalo OA thật (F-037, chỉ kiểm bằng kênh giả); bộ lập lịch tự chạy job đúng giờ trong tiến trình thật (test tắt `JOBS_ENABLED`, chỉ gọi job thủ công); `npm run load` sau F-047 (không đổi luồng gửi đơn / thu tiền).

**Đã sửa (20/10/2026):** E2E "chia bill…" chập chờn do ô "Tên phần" mất focus (Q-023 / DEF-001) — sửa ở [TASK-058](../công-việc/TASK-058.md), test có thêm bước hồi quy (fail với code cũ, pass với code mới).

### Bổ sung theo quy trình 15 bước — bước 14 (TASK-057, 20/10/2026)

| Lớp (sổ tay) | Bộ / công cụ | Nội dung | Kết quả 20/10/2026 |
| --- | --- | --- | --- |
| Integration — AC còn thiếu | `ứng-dụng/máy-chủ/tests/acceptance.test.js` | 21 test cho AC trước chưa có / chỉ có một phần bằng chứng: AC-005-03, 008-03, 017-01, 020-03, 026-05, 030-03, 047-01; 13 AC lỗi / biên bổ sung ở bước 05 (AC-003-09, 009-05, 016-07 đua 4 quầy cho lượt khuyến mãi cuối, 021-04, 026-09, 027-07, 032-05, 035-08, 037-08, 039-09, 045-05, 047-06); trang chủ / 404 (AC-001-07/08); header bảo mật | 21/21 PASS |
| E2E — AC còn thiếu | `kiểm-thử/e2e/flow.spec.js` | "giỏ còn sau khi tải lại trang…" (AC-002-04, 004-02 ≤ 2 s sau khi có mạng, 013-04, 006-04); "thực đơn trống / lỗi mạng…" (AC-002-06, chặn mạng bằng Playwright); bước hồi quy Q-023 | PASS |
| Accessibility | `kiểm-thử/e2e/a11y.spec.js` (project `a11y`, chạy sau `flow`) | 30+ màn hình khách / quầy / quản lý: nhãn ô nhập, tên nút, `lang`, `alt`, vùng chạm ≥ 24 px (2.5.8), tương phản chữ ≥ 4.5:1 (1.4.3), viền focus ≥ 3:1 (1.4.11 / 2.4.7), không cuộn ngang 320 / 390 px (1.4.10); chụp ảnh chuẩn | 3/3 PASS (sau khi sửa DEF-006…008) |
| Security | [security-check.md](security-check.md) | `npm audit`, quét secret / PII, ma trận quyền, sở hữu dữ liệu, header, đối chiếu OWASP ASVS, sổ rủi ro SEC-R1…R10 | 0 lỗ hổng thư viện; rủi ro chờ chủ dự án quyết |
| Traceability | `kịch-bản/traceability.js` (`npm run trace`) | AC → US → UC → MOD → SCR → TC → kết quả thật; phát hiện Story / AC / BR / màn hình thiếu liên kết | 289 / 289 AC PASS |
| UAT | [uat-plan.md](uat-plan.md) | Kịch bản theo Actor trên thiết bị thật + kiểm tay (máy in, Wi-Fi quán, Safari / Android, Zalo) | **CHỜ NGƯỜI THẬT** |
| CI | `.github/workflows/ci.yml` | Repo chưa có remote GitHub → CI NOT_RUN; đã chạy **tương đương trên máy local** đủ các bước của workflow (lint, format, skills, test, load, E2E) | PASS local |

Lỗi phát hiện / đã sửa: [defect-log.md](defect-log.md). DoD áp dụng: [dod.md](dod.md). Hồ sơ Gate: [quality-gates.md](quality-gates.md).

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
