# FEATURE-056 — Thu bằng chuyển khoản, két chỉ tính tiền mặt

> **Nguồn:** chủ dự án yêu cầu 24/10/2026: "khi thanh toán nhân viên có thêm mục chuyển khoản … lưu lại để biết, chứ trên máy có tiền mặt, khi thanh toán chuyển khoản bấm vậy sẽ thiếu tiền và thất thoát"; chọn: chỉ bấm xác nhận (không QR), mỗi lượt thu một cách trả. Quyết định: [ADR-019](../quyết-định/ADR-019-chuyen-khoan-gop-tach-hoa-don.md) D-71, D-72.

- **Status:** CONFIRMED (ADR-019 D-71, D-72) · Triển khai: [TASK-073](../công-việc/TASK-073.md)
- **Actor:** **ACT-STAFF / ACT-LEAD / ACT-ADMIN** (thu tiền, đóng ca, xem báo cáo).
- **Màn hình:**
  - **Ngăn Thu tiền bàn** (SCR-14) và thu từng phần chia bill: hai nút chọn **Tiền mặt** / **Chuyển khoản**. Chuyển khoản → ẩn ô "Tiền khách đưa" và nút tiền nhanh, nút thu thành **"Đã nhận chuyển khoản & In bill"**.
  - **Bán mang đi** (SCR-13): cùng lựa chọn.
  - **Ca & hoàn tiền** (SCR-15): "Tiền mặt thu" và "Chuyển khoản" tách riêng; tiền dự kiến trong két chỉ gồm tiền mặt; danh sách lượt thu có cột cách trả.
  - **Bill in** (SCR-12): dòng "Thanh toán: Tiền mặt (khách đưa …, tiền thừa …)" hoặc "Thanh toán: Chuyển khoản".
  - **Báo cáo** (SCR-21): tổng thu chia theo Tiền mặt / Chuyển khoản; danh sách lượt thu có cách trả.
- **Dữ liệu:** `Payments.Method`, `Orders.PaymentMethod` nhận thêm `'TRANSFER'` (migration 0039).

## User Story

- **US-056-1:** Là nhân viên thu ngân, tôi muốn chọn "Chuyển khoản" khi khách chuyển tiền, để lượt thu được ghi đúng và không bị tính vào tiền mặt trong két.
- **US-056-2:** Là trưởng ca / chủ quán, tôi muốn tiền dự kiến trong két chỉ gồm tiền mặt và thấy riêng tổng chuyển khoản, để đóng ca không bị "thiếu tiền" giả và phát hiện được thất thoát thật.

## Quy tắc (BR-088, BR-089)

1. Mọi lượt thu (`/api/sessions/{id}/settle`, `/api/splits/{id}/settle`, `/api/orders/takeaway`) nhận `method: 'CASH' | 'TRANSFER'` (bỏ trống = `CASH`, giữ tương thích).
2. `CASH`: bắt buộc `amountReceived ≥ số phải thu` như trước. `TRANSFER`: không cần `amountReceived` (gửi lên thì bỏ qua); lưu `AmountReceived = AmountDue`, tiền thừa 0.
3. Số phải thu không phụ thuộc cách trả (khuyến mãi, hội viên, giảm giá tay, voucher, làm tròn như cũ). Mỗi lượt thu một cách trả.
4. Thu chuyển khoản vẫn cần ca mở và gắn ca (F-018); vẫn tính doanh thu, điểm / tem hội viên như tiền mặt.
5. **Két:** tiền mặt dự kiến = đầu ca + Σ thu `CASH` − Σ hoàn tiền của lượt `CASH` + thu khác − chi quỹ (đã duyệt). Áp dụng cho màn ca đang mở và lúc đóng ca (`sp_CloseShift`).
6. **Hoàn tiền** theo cách của lượt thu gốc: lượt `TRANSFER` → hoàn bằng chuyển khoản, không trừ két.
7. Bill, màn ca, báo cáo, danh sách lượt thu ghi cách trả. Lượt thu cũ (trước migration) là `CASH`.

## API (thay đổi)

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/sessions/{id}/settle`, `POST /api/splits/{id}/settle` | Body thêm `method` (`CASH` mặc định / `TRANSFER`); `amountReceived` chỉ bắt buộc khi `CASH`. Kết quả `payment.method` |
| `POST /api/orders/takeaway` | Như trên |
| `GET /api/shifts/current`, `GET /api/shifts/{id}/report`, `GET /api/admin/shifts` | Thêm `transferIn`, `transferCount`, `transferRefunds`; `cashIn` chỉ còn tiền mặt; `expectedCash` theo Quy tắc 5; mỗi lượt thu có `method` |
| `GET /api/admin/reports/*` (tổng hợp) | Thêm `byMethod: { CASH, TRANSFER }`; danh sách lượt thu có `method` |
| Bill (`/api/sessions/{id}/receipt`, `/api/payments/{id}/receipt`, `/api/orders/{id}/receipt`) | Thêm `payment.method` |

## Acceptance Criteria

- AC-056-01: Thu tiền bàn bằng `TRANSFER` không gửi `amountReceived` → `200`; Payments `Method = TRANSFER`, `AmountReceived = AmountDue`, tiền thừa 0; các đơn `PaymentMethod = TRANSFER`, phiên đóng. Thu `CASH` thiếu `amountReceived` → `400`.
- AC-056-02: Ca có thu tiền mặt 50.000đ và chuyển khoản 30.000đ: màn ca có `cashIn = 50.000`, `transferIn = 30.000`, tiền dự kiến = đầu ca + 50.000; đóng ca với tiền đếm = đầu ca + 50.000 → chênh lệch 0.
- AC-056-03: Hoàn 30.000đ cho lượt chuyển khoản → tiền dự kiến trong két không đổi, `transferRefunds = 30.000`; hoàn lượt tiền mặt → tiền dự kiến giảm như trước.
- AC-056-04: Thu từng phần chia bill bằng chuyển khoản và bán mang đi bằng chuyển khoản → ghi `TRANSFER` đúng như AC-056-01.
- AC-056-05: Báo cáo khoảng ngày có cả hai cách trả → `byMethod` đúng tổng từng loại, tổng thu không đổi; bill in ghi "Chuyển khoản".
- AC-056-06: Trên trình duyệt: ngăn Thu tiền bàn chọn **Chuyển khoản** → ô tiền khách đưa ẩn, bấm "Đã nhận chuyển khoản & In bill" → bàn đóng; trang Ca hiện dòng "Chuyển khoản" và tiền dự kiến trong két không cộng khoản đó.

## Bằng chứng

`tests/payment-method.test.js` (AC-056-01…05) · E2E "thu bằng chuyển khoản…" (AC-056-06).
