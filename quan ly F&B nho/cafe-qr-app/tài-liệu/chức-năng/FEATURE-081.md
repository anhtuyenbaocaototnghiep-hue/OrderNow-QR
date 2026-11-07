# FEATURE-081 — Bảng chọn món: bấm món là chọn hết tùy chọn ngay

> **Nguồn:** chủ dự án 07/11/2026 ("khi chọn món nó sẽ hiện lựa chọn… hiện ra luôn thay vì vào giỏ hàng xem rất bất tiện"; chọn: "Bấm món là hiện ngay bảng chọn, trượt lên từ dưới màn hình: cái này"). Quyết định: [ADR-039](../quyết-định/ADR-039-bang-chon-mon.md) D-178…D-181. Nền: [F-002](FEATURE-002.md) menu & giỏ, [F-013](FEATURE-013.md) tùy chọn món.

- **Status:** CONFIRMED (ADR-039) · Triển khai: [TASK-098](../công-việc/TASK-098.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (khách gọi món bằng điện thoại).
- **Màn hình:** **Bảng chọn món** (SCR-57 — sheet trên SCR-02): ảnh + giá, nhóm tùy chọn, **Ghi chú** (6 nút nhanh + ô gõ), **Số lượng**, "Giá 1 phần", nút **Thêm vào giỏ · tổng**; **Menu** (SCR-02): tên món là nút mở bảng chọn, "+" món có tùy chọn mở bảng chọn.
- **Dữ liệu:** không đổi.

## User Story

- **US-081-1:** Là khách, tôi muốn bấm món là chọn ngay size, topping, ghi chú và số lượng ở một chỗ, để không phải vào giỏ hàng mới chỉnh được, giỏ chỉ để xem lại và gửi.

## Quy tắc (BR-119)

1. Món có tùy chọn: "+", tên món, ảnh → bảng chọn (chưa vào giỏ); mặc định chọn sẵn; nhóm bắt buộc phải đủ mới thêm được.
2. Món không tùy chọn: "+" thêm ngay (≤ 3 chạm); tên / ảnh → bảng chọn (ghi chú, số lượng). Combo: không có ghi chú. _Từ F-083 (ADR-041): mặc định "+" mọi món đều mở bảng chọn; quy tắc này áp khi chủ quán tắt cài đặt `menu.sheet_all`._
3. Cùng món + tùy chọn + ghi chú → cộng dồn; ghi chú khác → dòng riêng; máy chủ nhận đủ từng dòng. _Từ F-082 (ADR-040): giỏ không còn ô ghi chú — bấm món trong giỏ để sửa ở bảng chọn._
4. Chỉ màn của khách; máy quầy không đổi.

## API

Không có API mới. `POST /api/orders/quote`, `POST /api/orders` nhận nhiều dòng cùng món + cùng tùy chọn khác ghi chú (đã hỗ trợ — có test).

## Acceptance Criteria

- AC-081-01: Báo giá với 2 dòng Bạc xỉu Size L (2 phần "Ít đá", 1 phần "Không đường") + Nước suối 3 phần "Không lạnh" → 2 dòng Bạc xỉu riêng, cùng đơn giá; gửi đơn → 3 dòng món đúng số lượng, ghi chú, tùy chọn; tổng đơn = tổng báo giá.
- AC-081-02: Trên điện thoại: bấm "+" Bạc xỉu (có Size) → bảng chọn hiện, giỏ chưa đổi; chọn Size L, nút "Ít đá" (ô ghi chú = "Ít đá"), số lượng 2 → nút "Thêm vào giỏ · …đ" → thẻ món hiện 2; bấm tên "Nước suối" → bảng không có nhóm tùy chọn, gõ ghi chú → thêm 1; "+" Bánh croissant → thêm ngay, không mở bảng; giỏ: Bạc xỉu Size L × 2 ghi chú "Ít đá", Nước suối ghi chú "không lạnh"; điện thoại không cuộn ngang.

## Bằng chứng

`tests/item-sheet.test.js` (AC-081-01) · E2E "bảng chọn món: khách bấm "+" món có tùy chọn…" (AC-081-02).
