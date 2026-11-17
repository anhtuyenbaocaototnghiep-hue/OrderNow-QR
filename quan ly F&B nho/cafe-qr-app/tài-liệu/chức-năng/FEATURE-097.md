# FEATURE-097 — Quét QR bàn có nhóm: tự vào nhóm của bàn

> **Nguồn:** chủ dự án — "bạn bỏ cái cá nhân với gộp bàn rồi bạn xem tích hợp sao" → duyệt phương án: "okay" (17/11/2026). Quyết định: [ADR-059](../quyết-định/ADR-059-tu-vao-nhom-cua-ban.md) D-238, D-239. Thay phần "chọn Gộp chung / Cá nhân" của [F-001](FEATURE-001.md); dùng [F-026](FEATURE-026.md) chia bill, [F-058](FEATURE-058.md) tách hóa đơn, [F-086](FEATURE-086.md) đổi bàn khi quét, [F-092](FEATURE-092.md) màn chào.

- **Status:** CONFIRMED (ADR-059) · Triển khai: [TASK-118](../công-việc/TASK-118.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (điện thoại khách).
- **Màn hình:** **SCR-01** `/t/{qrToken}` (vào bàn, màn chọn nhóm khi bàn có ≥ 2 nhóm, màn đổi bàn F-086, màn chào), **SCR-05** Theo dõi đơn (`?act=split` mở Chia bill).
- **Dữ liệu / API:** không đổi.

## User Story

- **US-097-1:** Là khách, khi quét QR ở bàn bạn bè đã gọi món, tôi muốn vào thẳng nhóm của bàn mà không phải chọn "gộp" hay "cá nhân", và nếu cần trả riêng thì chia bill theo người, để gọi món nhanh và không nhầm hóa đơn.

## Quy tắc

1. Bàn trống → mở nhóm mới (như cũ). Bàn có **1 nhóm** → tự vào nhóm đó, báo "Đã vào nhóm của Bàn …". Bàn có **≥ 2 nhóm** → hỏi "Bạn đi cùng nhóm nào?" (mỗi nhóm một nút "Vào nhóm này"). Không có nút "Tạo đơn cá nhân" ở bất kỳ màn nào.
2. Nhóm vừa thanh toán / đóng lúc đang vào → mở nhóm mới và báo (BR-008).
3. Điện thoại có nhóm ở bàn khác (F-086): "Chuyển sang Bàn …" / "Nhờ quầy chuyển…" như cũ; "Gọi món ở Bàn …" → vào nhóm của bàn mới (hoặc mở nhóm mới nếu trống), nhóm cũ giữ nguyên.
4. Trả riêng: "Chia bill theo người" ở Theo dõi đơn; màn chào có dòng "Trả riêng từng người? Chia bill theo người" khi nhóm đã có món (mở thẳng hộp chia bill). Quầy giữ "Tách hóa đơn", "Thu chung với bàn khác".

## Acceptance Criteria

- AC-097-01: Bàn NB1 có nhóm (đã gửi món) → điện thoại khác quét QR → vào thẳng thực đơn, báo "Đã vào nhóm của Bàn NB1", không có nút "Tạo đơn cá nhân"; Theo dõi đơn thấy món của nhóm; bàn vẫn chỉ 1 nhóm.
- AC-097-02: Bàn NB2 có 2 nhóm → điện thoại mới thấy "Bàn đang có 2 nhóm. Bạn đi cùng nhóm nào?" với 2 nút "Vào nhóm này", không có "Tạo đơn cá nhân"; chọn → vào thực đơn, bàn không thêm nhóm.
- AC-097-03: Điện thoại có nhóm ở NB1 (đã gửi món) quét NB3 đang có nhóm → màn "Bạn đã chuyển sang Bàn NB3?" → "Gọi món ở Bàn NB3" → vào nhóm của NB3 (thực đơn ghi Bàn NB3), NB1 và NB3 mỗi bàn vẫn 1 nhóm.
- AC-097-04: Màn chào bật, nhóm đã có món → dòng "Trả riêng từng người? Chia bill theo người" → trang Theo dõi đơn mở sẵn hộp "Chia bill theo người".

## Bằng chứng

- E2E: `kiểm-thử/e2e/flow.spec.js` bài "vào nhóm của bàn…" (AC-097-01…04); `kiểm-thử/e2e/a11y.spec.js` bài "khách (điện thoại)…" quét màn chọn nhóm khi bàn có 2 nhóm (AC-097-02).
