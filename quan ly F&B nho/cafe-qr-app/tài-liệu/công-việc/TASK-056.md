# TASK-056 — Hội viên khi gọi món tại bàn, Thẻ thành viên, quyền lợi trên bill
Status: READY_FOR_REVIEW (18/10/2026). Bằng chứng: `npm test` 234/234, `npm run test:e2e` 29/29, lint + prettier PASS; `npm run load` NOT_RUN (không đổi luồng gửi đơn / thu tiền) — xem tài-liệu/chất-lượng/test-strategy.md
Feature: FEATURE-047 (US-047-1…3, AC-047-01…05) · BR-071…BR-073
Nguồn: yêu cầu chủ dự án 18/10/2026 · Quyết định: ADR-008 (D-36…D-38, chủ dự án chọn trước khi code) · Agent: Claude (lead) · Reviewer: chủ dự án / nhóm

## Mục tiêu
Nhân viên gắn / đăng ký hội viên ngay ở trang Gọi món tại bàn; hội viên xem được quyền lợi của mình (điểm, tem, quà, voucher + nguồn chiến dịch) trên điện thoại khi ngồi ở quán; bill thanh toán in quyền lợi.

## Phạm vi sửa
- Backend:
  - `loyaltyService` (thẻ thành viên, khối bill), `sessionService` / `orderService` (receipt thêm `memberCard`);
  - `loyaltyRepo` (voucher kèm tên chiến dịch);
  - route `GET /api/sessions/{id}/member-card` (`routes/engagement.js`).
- Frontend:
  - `js/pages/pos-table-order.js` + `pos/table-order.html` (khung hội viên);
  - `js/member-box.js` (nút + màn Thẻ thành viên);
  - `js/pages/pos-receipt.js` (khối Thẻ thành viên);
  - CSS.
- Test: `tests/member-card.test.js`; E2E `kiểm-thử/e2e/flow.spec.js`.
- Docs: FEATURE-047, ADR-008, BR-071…073, api-contract, screens-flows, roles-permissions, realtime-events, hướng dẫn `chức-năng-mới/26`.

## Không được sửa
- Cách tính ưu đãi / điểm / tem / voucher lúc thu tiền.
- API ghi hội viên đã có (lookup / đăng ký / gắn / gỡ) — chỉ dùng lại.
- Schema (không migration).

## Phụ thuộc
F-014 (hội viên), F-024 (gọi món tại bàn), F-037 (chiến dịch), F-038 (voucher), F-039 (điểm / tem).

## Validation
- `npm test`: toàn bộ + `member-card.test.js`.
- `npm run test:e2e`, `npm run lint`, `npm run format:check`.

### Kết quả thực chạy (18/10/2026, máy local, SQL Server thật)

| Lệnh / việc | Kết quả |
| --- | --- |
| `npm test` | **234/234 PASS** (18 file; trước task: 229; thêm 5 test của `member-card.test.js`) |
| `tests/member-card.test.js` | **5/5 PASS**: "AC-047-01/02" (đăng ký nhanh bắt buộc đồng ý → `400 CONSENT_REQUIRED`, gắn → `session.member_changed` chỉ tên che, thu tiền → tích điểm), "chuẩn bị: chiến dịch tặng voucher cho mọi hội viên", "AC-047-03" (thẻ: tên / SĐT che, lịch sử điểm, tem, quà, voucher nguồn `Chiến dịch "Tri ân tháng 10"`, không có mã), "AC-047-04" (403 / `404 NO_MEMBER` / 409 / 404), "AC-047-05" (bill cuối có `memberCard`, tạm tính và bill không hội viên `null`, mang đi có hội viên có khối) |
| `npm run test:e2e` | **29/29 PASS** (trước: 28; thêm "hội viên tại bàn + thẻ thành viên": nhân viên đăng ký nhanh SĐT mới ở Bàn 01 — chưa tick đồng ý bị chặn, tick → "Đã gắn hội viên Trần Thị Bình vào Bàn 01"; khách cùng bàn thấy "Trần T. B.", mở Thẻ thành viên ("09xx***543", "Lịch sử điểm gần đây", không cuộn ngang ở 390 px); thu tiền → bill có "THẺ THÀNH VIÊN (lúc in)" + "Điểm hiện có") |
| `npm run lint`, `npm run format:check` | PASS (0 lỗi) |
| `npm run db:migrate` | Không cần — task không đổi schema; migration kế tiếp vẫn là `0034` |
| `npm run load` | NOT_RUN — task không đổi luồng gửi đơn / thu tiền; lần chạy gần nhất (18/10/2026, sau F-046): 10/10 |

## Lệch phạm vi
Không có. API ghi hội viên (tra cứu / đăng ký / gắn / gỡ) chỉ dùng lại; cách tính ưu đãi, điểm, tem, voucher lúc thu tiền không đổi; không migration.

## Cần hỏi duyệt nếu
Hiện mã voucher cho khách, cho xem thẻ ngoài phiên, thêm hộp tin chiến dịch.

## Đầu ra
Code + test + docs đồng bộ; bàn giao bổ sung ở `tài-liệu/chất-lượng/handover-2026-10-18.md`.
