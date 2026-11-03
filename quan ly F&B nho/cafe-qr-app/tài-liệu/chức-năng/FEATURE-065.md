# FEATURE-065 — Vòng quay may mắn sau khi thanh toán

> **Nguồn:** chủ dự án 03/11/2026. Quyết định: [ADR-024](../quyết-định/ADR-024-vong-quay-hen-gio-ra-mon.md) D-89…D-92.

- **Status:** CONFIRMED (ADR-024) · Triển khai: [TASK-083](../công-việc/TASK-083.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (quét QR trên hóa đơn hoặc bấm nút ở màn cảm ơn, quay, nhận quà); **ACT-ADMIN** (bật / tắt, ô quà, xem kết quả); **ACT-STAFF** (in hóa đơn có QR, nhận voucher ở lần sau).
- **Màn hình:**
  - **Khách → `/quay/{mã}`** (SCR-49, mới): vòng quay, nút "Quay", kết quả (mã voucher + hạn, hoặc điểm, hoặc "Chúc may mắn lần sau"); đã quay thì hiện lại kết quả.
  - **Khách → màn cảm ơn** (S-05): nút "Bạn có 1 lượt quay may mắn".
  - **Hóa đơn in** (S-12): khối "Quét để quay may mắn" + QR + hạn.
  - **Quản lý → Khách hàng → Tích điểm & voucher → Vòng quay may mắn** (S-40): bật / tắt, mức hóa đơn tối thiểu, số lượt trúng tối đa / ngày, hạn voucher, bảng ô quà, kết quả 7 ngày.
- **Dữ liệu:** `SpinPrizes`, `LuckySpins`, `Vouchers.Source = 'GAME'`, khóa cài đặt `spin.*`.

## User Story

- **US-065-1:** Là khách vừa thanh toán, tôi muốn quét QR trên hóa đơn để quay nhận quà cho lần sau, để có thêm lý do quay lại quán.
- **US-065-2:** Là chủ quán, tôi muốn tự đặt ô quà, tỷ lệ và số quà tối đa mỗi ngày, để trò chơi không làm lỗ.

## Quy tắc (BR-102)

1. Mỗi lượt thu từ `spin.min_amount` (30.000đ) có một lượt quay, hạn `spin.expire_hours` (24 giờ) từ lúc thu. Lượt thu đã hoàn tiền → không quay. Tính năng tắt → không tạo mã, hóa đơn không in QR.
2. Ô quà: `PERCENT` (voucher %, trần `MaxDiscount`), `AMOUNT` (voucher tiền), `POINTS` (cộng điểm — chỉ khi lượt thu có hội viên; ô này ẩn với khách vãng lai), `NONE`. 2–8 ô, ít nhất một ô `NONE`, tổng trọng số > 0; tỷ lệ của ô = trọng số ÷ tổng trọng số các ô đang hiện.
3. Máy chủ chọn ô bằng số ngẫu nhiên an toàn; trình duyệt chỉ quay tới ô đó.
4. Đủ `spin.daily_win_cap` (20) lượt trúng trong ngày (giờ quán) → lượt sau ra ô `NONE`. Đếm và ghi kết quả trong một transaction có khóa.
5. Trúng voucher: mã 8 ký tự, nguồn `GAME`, `IssuedForPaymentId` = lượt thu, hạn `spin.voucher_days` (14) ngày, gắn hội viên của lượt thu nếu có. Trúng điểm: `Members.Points` + sổ `PointTransactions` (ADJUST, "Vòng quay may mắn").
6. Một mã chỉ quay một lần; mở lại thấy kết quả cũ. Quay khi đã hết hạn → `410 SPIN_EXPIRED`.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/lucky-spins/{token}` | Công khai (mã) | `{ status: NEW \| SPUN \| EXPIRED \| REFUNDED, shopName, expiresAt, member, slices: [{ prizeId, label, kind }], result }` |
| `POST /api/lucky-spins/{token}/spin` | Công khai (mã), giới hạn tần suất | `{ result: { prizeId, label, kind, voucher: { code, percent, amount, maxDiscount, expiresAt } \| null, points, spunAt } }`; đã quay → trả lại kết quả cũ |
| `GET /api/sessions/{id}/lucky-spins` | Thiết bị trong phiên / nhân viên | Lượt quay của các lượt thu trong phiên `[{ token, status, expiresAt, label }]` |
| `GET /api/admin/lucky-spin` · `PUT …` | ADMIN | Cài đặt + ô quà; `GET` kèm `stats` 7 ngày |
| Hóa đơn (`/api/sessions/{id}/receipt`, `/api/orders/{id}/receipt`, `/api/payments/{id}/receipt`) | Nhân viên | Thêm `luckySpin: { url, qr (data URL), expiresAt } \| null` |

## Acceptance Criteria

- AC-065-01: Bật vòng quay, lượt thu ≥ mức tối thiểu → hóa đơn có `luckySpin` (URL `/quay/{mã}` + QR); lượt thu dưới mức, tính năng tắt, hoặc đã hoàn tiền → `luckySpin: null`; in lại hóa đơn giữ đúng mã cũ.
- AC-065-02: Quay → kết quả đúng ô do máy chủ chọn; voucher tạo đúng loại / giá trị / hạn / nguồn `GAME`, gắn hội viên nếu có; điểm cộng vào số dư và sổ điểm; quay lần hai trả lại kết quả cũ, không tạo thêm quà.
- AC-065-03: Đủ số lượt trúng trong ngày → lượt sau ra "Chúc may mắn lần sau"; hai lượt quay đồng thời không vượt ngân sách.
- AC-065-04: Mã hết hạn → `410`; mã sai → `404`; lượt thu không có hội viên thì vòng không có ô điểm.
- AC-065-05: Cài đặt: lưu ô quà hợp lệ; thiếu ô "Chúc may mắn" (không có quà), quá 8 ô, trọng số âm, tổng trọng số 0 → `400`; nhân viên → `403`; thống kê đếm đúng lượt quay / trúng / voucher đã dùng.
- AC-065-06: Voucher trúng dùng được ở lần thu sau (mã ở khung thu tiền); không dùng được sau hạn.
- AC-065-07: Trên trình duyệt: hóa đơn in có QR; khách ở màn cảm ơn bấm "quay may mắn" → trang quay → bấm Quay → thấy kết quả; quản lý bật / sửa ô quà ở trang Vòng quay.

## Bằng chứng

`tests/lucky-spin.test.js` (AC-065-01…06) · E2E "vòng quay may mắn…" (AC-065-07).
