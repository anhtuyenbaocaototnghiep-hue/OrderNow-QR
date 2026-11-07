# FEATURE-082 — Giỏ hàng gọn: bấm món trong giỏ để sửa

> **Nguồn:** chủ dự án 07/11/2026 ("khi click chọn nó hiện ra luôn không cần hiện trong giỏ hàng nữa và vào giỏ hàng khách muốn sửa đổi thì chỉ cần bấm vào cái món đó và sửa thôi", kèm ảnh giỏ). Quyết định: [ADR-040](../quyết-định/ADR-040-gio-hang-gon.md) D-182…D-184. Nền: [F-081](FEATURE-081.md) bảng chọn món, [F-002](FEATURE-002.md) giỏ hàng.

- **Status:** CONFIRMED (ADR-040) · Triển khai: [TASK-099](../công-việc/TASK-099.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER**.
- **Màn hình:** **Giỏ hàng** (SCR-03): mỗi món một dòng gọn (tên, tùy chọn, "Ghi chú: …", giá, "Sửa ›", [−] n [+]); bấm món → **Bảng chọn món** (SCR-57) với lựa chọn cũ, nút **Cập nhật · tổng**.
- **Dữ liệu:** không đổi.

## User Story

- **US-082-1:** Là khách, tôi muốn giỏ hàng chỉ liệt kê gọn các món đã chọn và bấm vào món nào thì sửa món đó, để xem lại nhanh và gửi đơn mà không bị rối.

## Quy tắc (BR-120)

1. Giỏ không có ô ghi chú, không có hàng nút nhanh; ghi chú hiện dạng chữ "Ghi chú: …".
2. Bấm món → bảng chọn với tùy chọn, ghi chú, số lượng của dòng → "Cập nhật" thay dòng tại chỗ; trùng dòng khác → gộp (≤ 50); món hết → không mở, báo bỏ khỏi giỏ.
3. [−] [+] trong giỏ giữ nguyên (− tới 0 bỏ món).

## API

Không có API mới.

## Acceptance Criteria

- AC-082-01: (đơn vị, `js/cart.js`) thêm từ bảng chọn: cùng món + tùy chọn + ghi chú cộng dồn, ghi chú khác thành dòng `key~n`; "+" nhanh / quầy (không ghi chú) cộng vào dòng gốc; sửa dòng: đổi ghi chú / số lượng giữ vị trí + khóa, đổi tùy chọn đổi khóa (vẫn vị trí cũ), trùng dòng khác → gộp, tối đa 50, dòng không còn → thêm mới; gửi đơn mỗi dòng một mục giữ ghi chú + tùy chọn.
- AC-082-02: Trên điện thoại: giỏ 2 món không có ô nhập, không có hàng nút nhanh; dòng Bạc xỉu ghi "Size L", "Ghi chú: Ít đá", "Sửa ›"; bấm dòng → bảng chọn có Size L đã chọn, ghi chú "Ít đá", số lượng 2, nút "Cập nhật · …đ"; đổi Size M + "Mang về" + số lượng 3 → Cập nhật → dòng đầu vẫn là Bạc xỉu với "Size M", "Ghi chú: Ít đá, Mang về", 3; tổng đổi; thẻ món hiện 3; không cuộn ngang.

## Bằng chứng

`tests/cart-unit.test.js` (AC-082-01) · E2E "giỏ gọn: giỏ không còn ô ghi chú…" (AC-082-02).
