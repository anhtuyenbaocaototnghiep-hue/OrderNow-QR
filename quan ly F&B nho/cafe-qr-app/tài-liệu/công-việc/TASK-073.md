# TASK-073 — Thu bằng chuyển khoản, thu chung nhiều bàn, tách hóa đơn theo món
Status: READY_FOR_REVIEW (24/10/2026)
Quyết định: [ADR-019](../quyết-định/ADR-019-chuyen-khoan-gop-tach-hoa-don.md) D-71…D-74 · Feature: [FEATURE-056](../chức-năng/FEATURE-056.md), [FEATURE-057](../chức-năng/FEATURE-057.md), [FEATURE-058](../chức-năng/FEATURE-058.md) · BR-088…BR-091
Module: MOD-BILLING, MOD-SHIFT, MOD-REPORT, MOD-TABLE · Màn hình: SCR-14 (ngăn thu tiền), SCR-13 (mang đi), SCR-15 (ca), SCR-12 (bill), SCR-21 (báo cáo), SCR-05 (theo dõi đơn của khách)
Nguồn: chủ dự án yêu cầu 24/10/2026 và trả lời 4 câu hỏi (chỉ bấm xác nhận chuyển khoản; mỗi lượt một cách trả; gộp = thu chung nhiều bàn; tách theo món dễ thấy hơn). · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-073-chuyen-khoan-gop-tach` tách từ `release/2026-10-23` (bản đã đẩy GitHub) · Kế hoạch: [TASK-073-plan.md](../kế-hoạch/TASK-073-plan.md)

## Mục tiêu
- Lượt thu chuyển khoản được ghi đúng, không làm két "thiếu tiền" khi đóng ca.
- Thu một lần cho nhiều bàn; tách vài món ra hóa đơn riêng bằng vài lần tích chọn.

## Phạm vi
1. Migration 0039: `Payments.Method` / `Orders.PaymentMethod` nhận `TRANSFER`; `Sessions.MergedIntoSessionId`.
2. Thủ tục: `sp_SettleSession`, `sp_SettleSplit`, `sp_SubmitOrder` nhận cách trả; `sp_CloseShift` chỉ tính tiền mặt; mới `sp_MergeSessions`.
3. Service / API: `method` ở mọi lượt thu; thu chung (`mergeSessionIds`, một transaction); `POST /api/sessions/{id}/splits/separate`; số liệu ca, báo cáo, bill có cách trả; phiên được gộp có `mergedInto`.
4. Giao diện: ngăn thu tiền (cách trả, thu chung, tách hóa đơn), bán mang đi, trang Ca, báo cáo, bill, điện thoại khách ở bàn được gộp.
5. Test: integration (`payment-method.test.js`, `merge-bills.test.js`), E2E cho AC-056-06, AC-057-05, AC-058-03; cập nhật tài liệu (business-rules, data-model, api-contract, screens-flows, user-stories, tc-map, test-strategy…).

## Không được sửa
- Cách tính số phải thu (pricing), luồng chia bill hiện có của khách, dữ liệu cũ (lượt thu cũ là `CASH`).
- Không tích hợp cổng thanh toán / QR / webhook ngân hàng.

## Lệnh kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run load` · `npm run trace -- --check` · `npm run db:migrate` (CafeQrDev, chỉ thêm).

## Review độc lập (G3, agent chỉ đọc) — đã sửa
| # | Phát hiện | Sửa |
| --- | --- | --- |
| 1 | Sau khi thu một phần bằng chuyển khoản, phần sau / đơn mang đi sau vẫn để "Chuyển khoản" → dễ ghi nhầm, két thiếu | Mỗi lượt thu về mặc định **Tiền mặt** (ngăn thu khi đổi phần / sau khi thu phần, trang mang đi sau khi thu và khi "Xóa giỏ"); E2E kiểm `aria-pressed` |
| 2 | Hai nhóm **cùng một bàn** thu chung: điện thoại nhóm được gộp không tự chuyển sang bill chung | `followMerged()` ở trang theo dõi: nhận `mergedInto` (sự kiện hoặc lúc tải) → lưu phiên đích cho URL bàn hiện tại, mở bill chung |
| 3 | Gửi mã QR bàn đích cho người bàn được gộp (trái AC-010-04) | Bỏ `qrToken` khỏi `mergedInto` (chi tiết phiên và sự kiện); test kiểm không có |
| 4 | Trang Ca của quản lý vẫn ghi "Tiền thu" gộp chung | Cột "Tiền mặt thu", "Hoàn tiền mặt", "Chuyển khoản", "Dự kiến trong két"; danh sách hoàn tiền có "Cách hoàn" |
| + | Tách món khiến phần vừa tách là phần mở cuối cùng → "Chung" dồn vào phần đó | Tạo thêm **"Phần còn lại"** chứa các món chưa tách |
| + | `sp_CloseIfSettled` ghi cách trả cố định; lịch sử xóa món không theo đơn sang bill chung; bấm đúp "Tách"; máy quầy khác đang mở ngăn bàn vừa bị gộp; hội viên bàn được gộp không tự áp | Lấy cách trả của lượt thu cuối; `OrderItemVoids` chuyển theo; chống bấm đúp; đóng ngăn + thông báo; ghi chú trong ngăn thu |
| + | ADR/FEATURE nói "báo cáo theo bàn vẫn đúng bàn gốc" | Sửa câu chữ: đơn / bill giữ bàn gốc; phân tích "Theo bàn" (F-042) tính theo lượt thu nên ghi vào bàn thu |
| + | Thiếu test | Thêm: rollback cả bước gộp khi lỗi **sau** `sp_MergeSessions` (gọi thẳng repo, tổng cũ → 50034); hội viên trên tổng chung; hoàn tiền lượt thu chung kèm hủy đơn bàn B; hai nhóm cùng bàn; combo (tạo bằng API, không còn `if`); đóng ca sau hoàn tiền → chênh 0; `finance.test` dùng công thức chỉ tiền mặt |

## Kết quả thực chạy (24/10/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **328/328 PASS** (30 file; mới `payment-method.test.js` 5 test, `merge-bills.test.js` 9 test; bất biến `testDb.js`: két chỉ tiền mặt, phiên đã gộp, chuyển khoản không có tiền thừa) |
| `npm run test:e2e` | **48/48 PASS** (45 luồng + 3 khả năng tiếp cận; thêm 3 E2E: AC-056-06, AC-057-05, AC-058-03) |
| Cùng test mới chạy trên code cũ `15bb5f1` (worktree tạm, đã xóa) | **Đỏ đủ:** 14/14 integration FAIL; E2E chạy cả chuỗi flow, mỗi lần giữ một test mới ở cuối → 42 test cũ PASS, test mới FAIL đúng chỗ thiếu nút "Chuyển khoản" / "Thu chung với bàn khác" / "Tách hóa đơn" |
| `npm run load` | NFR-002 10/10 vòng PASS; NFR-001 p50 77 ms, p95 262 ms |
| `npm run trace -- --check` | 137 US, 349 AC — PASS 349, GAP 0 |
| `npm run lint`, `npm run format:check` | PASS |
| `npm run db:migrate` (CafeQrDev) | 0039 chỉ thêm (nới CHECK cách trả, thêm cột + FK + index); dữ liệu cũ giữ `CASH` |

## Cần hỏi duyệt nếu
- Muốn hiện mã QR / số tài khoản để khách quét chuyển khoản (hiện chỉ bấm xác nhận "Đã nhận chuyển khoản").
- Muốn một lượt thu trả bằng hai cách (một phần tiền mặt, một phần chuyển khoản) — hiện mỗi lượt một cách; dùng "Tách hóa đơn" để thu từng phần.
- Muốn bỏ thu chung sau khi đã thu (hiện chỉ hoàn tiền / hủy đơn theo lượt thu chung).
