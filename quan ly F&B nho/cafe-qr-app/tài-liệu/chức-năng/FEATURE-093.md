# FEATURE-093 — Màn khách chỉ cho điện thoại

> **Nguồn:** chủ dự án 16/11/2026 — "bạn làm giao diện oder của khách thuần về điện thoại thôi". Quyết định: [ADR-055](../quyết-định/ADR-055-man-khach-chi-cho-dien-thoai.md) D-230 (thay phần máy tính của ADR-042 D-195). Nền: [F-001](FEATURE-001.md), [F-002](FEATURE-002.md), [F-003](FEATURE-003.md), [F-004](FEATURE-004.md), [F-092](FEATURE-092.md).

- **Status:** CONFIRMED (ADR-055) · Triển khai: [TASK-114](../công-việc/TASK-114.md)
- **Actor:** **ACT-GUEST / ACT-MEMBER** (điện thoại khách; chủ quán xem thử trên máy tính thấy đúng màn đó).
- **Màn hình:** mọi trang khách — **SCR-01** vào bàn / màn chào, **SCR-02** thực đơn, **SCR-03** giỏ, **SCR-05** theo dõi đơn, **SCR-48** chính sách dữ liệu, **SCR-49** vòng quay, **SCR-50** trang quà.
- **Dữ liệu / API:** không đổi.

## User Story

- **US-093-1:** Là khách, tôi muốn màn gọi món luôn là giao diện điện thoại gọn một cột — kể cả khi mở trên máy tính bảng hay máy tính — để chữ, nút bấm và thanh giỏ quen tay như một ứng dụng điện thoại.

## Quy tắc

1. Trang khách là một cột rộng tối đa 480 px. Điện thoại ≤ 480 px: cột chiếm cả bề ngang (như trước).
2. Màn rộng hơn 480 px: cột ở giữa; hai bên nền xám ấm đậm hơn nền cột, cột có viền / bóng mảnh.
3. Đầu trang, thanh nhóm món, thanh giỏ, thanh nút đáy, bảng chọn kéo từ đáy, hộp thoại và thông báo nằm trong cột; thẻ món luôn xếp một cột.
4. Màn quầy (Bán mang đi, Gọi món tại bàn) không đổi.

## Acceptance Criteria

- AC-093-01: (máy tính 1366 × 860) màn chào, thực đơn, giỏ, theo dõi đơn: trang là một cột rộng 480 px nằm giữa màn (lệch ≤ 1 px), nền hai bên khác màu nền cột; đầu trang và thanh nhóm món rộng đúng cột; mọi thẻ món thẳng một cột; thanh giỏ, bảng giỏ và thanh nút đáy (Gọi thêm món / Gọi thanh toán) nằm trọn trong cột.
- AC-093-02: (điện thoại 390 px) cột rộng đủ 390 px, không cuộn ngang; thanh giỏ trải đủ bề ngang màn hình.

## Bằng chứng

- E2E: `kiểm-thử/e2e/flow.spec.js` bài "màn khách chỉ cho điện thoại…" (AC-093-01, AC-093-02). Các bài khách cũ (390 / 320 px) và a11y khách chạy lại không đổi.
