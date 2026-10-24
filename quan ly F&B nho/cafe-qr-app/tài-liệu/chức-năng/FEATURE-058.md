# FEATURE-058 — Tách hóa đơn theo món ở quầy

> **Nguồn:** chủ dự án yêu cầu 24/10/2026: "thêm chức năng … tách hóa đơn"; chọn: tách theo món, làm cho dễ thấy hơn (đã có chia bill F-026). Quyết định: [ADR-019](../quyết-định/ADR-019-chuyen-khoan-gop-tach-hoa-don.md) D-74.

- **Status:** CONFIRMED (ADR-019 D-74) · Triển khai: [TASK-073](../công-việc/TASK-073.md) · Mở rộng [FEATURE-026](FEATURE-026.md)
- **Actor:** **ACT-STAFF / ACT-LEAD / ACT-ADMIN**.
- **Màn hình:** **Ngăn Thu tiền bàn** (SCR-14): nút **"Tách hóa đơn"** → hộp thoại liệt kê món chưa thu (mỗi dòng một ô tích, ghi phần hiện tại), ô tên hóa đơn (mặc định "Phần N") → **"Tách ra hóa đơn riêng"**. Sau đó ngăn ở chế độ chia bill như F-026 (thu từng phần bằng tiền mặt hoặc chuyển khoản, "Thu chung" để gộp lại).
- **Dữ liệu:** không thêm bảng / cột (dùng `SessionSplits`, `OrderItems.SplitId`).

## User Story

- **US-058-1:** Là nhân viên thu ngân, tôi muốn tách một số món ra hóa đơn riêng chỉ bằng vài lần tích chọn, để khách trả riêng (kể cả trả bằng cách khác — F-056) mà không phải đổi từng món.

## Quy tắc (BR-091)

1. `POST /api/sessions/{id}/splits/separate` (chỉ quầy) `{ label (1–50 ký tự), orderItemIds (1–100, không trùng) }`.
2. Một transaction: phiên phải đang mở; tạo phần mới tên `label`; chuyển các dòng đã chọn vào phần mới. Bàn **chưa chia bill**: tạo thêm phần "Chung" và đưa các món chưa chọn vào phần **"Phần còn lại"** — hai hóa đơn độc lập (nếu để các món đó ở Chung, phần vừa tách là phần cuối nên sẽ tự gộp món Chung theo F-026). Dòng phải thuộc phiên, chưa thu, là món chính (không phải thành phần combo), đơn chưa hủy / xóa, và đang ở phần Chung hoặc một phần còn mở. Có dòng không hợp lệ → `409 LINE_LOCKED`, không tạo gì.
3. Cần ca mở như chia bill (F-055 → `409 NO_OPEN_SHIFT`).
4. Phát `session.split_changed` như F-026.

## Acceptance Criteria

- AC-058-01: Bàn chưa chia bill có 3 món: tách 2 món ra "Anh A" → `201`; phiên có "Anh A" (2 món) + "Phần còn lại" (1 món), Chung trống; thu "Anh A" đúng tổng 2 món, bàn vẫn mở.
- AC-058-02: Tách với một dòng đã thu / dòng của bàn khác / dòng thành phần combo → `409 LINE_LOCKED`; không có phần mới, các dòng không đổi. Chưa mở ca → `409 NO_OPEN_SHIFT`. Khách gọi endpoint → `401`.
- AC-058-03: Trên trình duyệt: ngăn Thu tiền bàn → "Tách hóa đơn" → tích 1 món, đặt tên → ngăn hiện "Bàn chia bill: 2 phần" (món đó trong phần mới, món khác trong "Phần còn lại"); thu phần mới bằng chuyển khoản, "Phần còn lại" bằng tiền mặt → bàn đóng.

## Bằng chứng

`tests/merge-bills.test.js` (AC-058-01, 02) · E2E "tách hóa đơn theo món…" (AC-058-03).
