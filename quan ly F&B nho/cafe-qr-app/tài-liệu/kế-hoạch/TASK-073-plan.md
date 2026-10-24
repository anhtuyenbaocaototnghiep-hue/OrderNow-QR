# Plan cho TASK-073

## Hiện trạng và mục tiêu
- Chỉ thu tiền mặt (ADR-000): lượt khách chuyển khoản vẫn bị tính vào két → đóng ca "thiếu tiền". `Payments.Method` / `Orders.PaymentMethod` đã có nhưng chỉ cho `CASH`.
- Chưa thu một lần cho nhiều bàn; chia bill (F-026) có nhưng ở quầy phải đổi từng món bằng menu thả xuống.
- Mục tiêu: ADR-019 D-71…D-74 — chuyển khoản (két chỉ tiền mặt), thu chung nhiều bàn, tách hóa đơn theo món.

## Thành phần và consumer bị ảnh hưởng
- CSDL: `Payments`, `Orders`, `Sessions`, `SessionSplits`; thủ tục thu tiền, đóng ca; thủ tục mới gộp phiên.
- Server: `sessionService`, `splitService`, `orderService` (mang đi), `shiftsRepo`, `reportsRepo`, route quầy.
- Giao diện: ngăn Thu tiền bàn (`pos-dashboard.js`), Bán mang đi, Ca & hoàn tiền, Báo cáo, bill in, trang theo dõi của khách.
- Test: bất biến dữ liệu (`tests/helpers/testDb.js`) — công thức két, đơn giữ bàn gốc khi thu chung.

## Files thật cần sửa hoặc files dự kiến tạo
- Mới: `cơ-sở-dữ-liệu/chuyển-đổi/0039_chuyen_khoan_gop_hoa_don.sql`, `cơ-sở-dữ-liệu/thủ-tục/sp_MergeSessions.sql`, `tests/payment-method.test.js`, `tests/merge-bills.test.js`.
- Sửa: `sp_SettleSession.sql`, `sp_SettleSplit.sql`, `sp_SubmitOrder.sql`, `sp_CloseShift.sql`; `errors.js`; `repositories/{sessionsRepo,splitsRepo,ordersRepo,shiftsRepo,reportsRepo}.js`; `services/{sessionService,splitService,orderService}.js`; `routes/staff.js`; `public/js/pages/{pos-dashboard,pos-takeaway,pos-shift,pos-receipt,admin-reports,t-track}.js`; `pos/takeaway.html`; `css/{pos,print}.css`; `tests/helpers/testDb.js`; `kiểm-thử/e2e/flow.spec.js`.

## Tác động dữ liệu / API / UI / quyền
- Dữ liệu: chỉ nới CHECK + thêm cột NULL; lượt thu cũ là `CASH`. Két tính lại theo tiền mặt — ca cũ (đã đóng) giữ số đã chốt.
- API: thêm `method`, `mergeSessionIds`, endpoint tách hóa đơn, số liệu theo cách trả (tương thích ngược: bỏ trống `method` = tiền mặt).
- Quyền: như thu tiền / chia bill hiện có (nhân viên trở lên, cần ca mở).

## Các bước thực hiện
1. Tài liệu: ADR-019, FEATURE-056…058, TASK-073, plan này.
2. Migration 0039 + thủ tục; mã lỗi.
3. Repository / service / route.
4. Test tích hợp (chuyển khoản; thu chung + rollback; tách hóa đơn) + cập nhật bất biến.
5. Giao diện; E2E 3 luồng.
6. Đồng bộ tài liệu, chạy đủ kiểm chứng, review độc lập, sửa, chứng minh test mới đỏ trên code cũ, commit.

## Test scenarios và lệnh validation đã xác minh
- Chuyển khoản bàn / phần / mang đi; két + đóng ca; hoàn tiền theo cách trả; báo cáo `byMethod`; bill.
- Thu chung: tổng chung, một lượt thu, đơn giữ bàn gốc; lỗi sau bước gộp (đơn chờ) → rollback cả gộp; bàn đang chia bill; điện thoại bàn được gộp chuyển sang + đánh giá; bill nhóm theo bàn.
- Tách hóa đơn: "Phần còn lại"; dòng đã thu / bàn khác / thành phần combo → `LINE_LOCKED`; khách 401; chưa mở ca 409.
- Lệnh: `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`, `npm run load`, `npm run trace -- --check`.

## Rủi ro, câu hỏi và cách phục hồi
- Thủ tục lồng transaction (`sp_MergeSessions` + `sp_SettleSession` trong `inTransaction`): lỗi trong thủ tục rollback cả transaction ngoài — đúng ý "không gộp gì"; test AC-057-02 kiểm.
- Hội viên của bàn được gộp không tự chuyển sang bàn A — nhân viên chọn hội viên trong ngăn thu nếu cần (ghi trong FEATURE-057).
- Phục hồi: migration chỉ thêm; quay lại code cũ vẫn chạy với dữ liệu mới trừ lượt `TRANSFER` (code cũ hiển thị như tiền mặt).

## Docs cần đồng bộ
ADR README, công-việc README, chức-năng README, business-rules (BR-088…091), user-stories, tc-map, api-contract, data-model, screens-flows, test-strategy, uat-plan, local-development, quy-trình-15-bước, traceability (sinh lại).
