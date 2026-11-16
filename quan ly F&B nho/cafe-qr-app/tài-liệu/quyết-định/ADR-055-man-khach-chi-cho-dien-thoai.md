# ADR-055 — Màn khách chỉ thiết kế cho điện thoại

- **Trạng thái:** ACCEPTED (16/11/2026). Chủ dự án: "bạn làm giao diện oder của khách thuần về điện thoại thôi".
- **Bối cảnh:** khách gọi món bằng điện thoại quét QR trên bàn. Từ ADR-042 D-195 (08/11/2026), màn khách có thêm bố cục máy tính: cột 720 px, từ 1024 px cột 1040 px và thẻ món xếp 2 cột. Mở trên máy tính / máy tính bảng, màn khách trông như một trang web rộng, khác hẳn cái khách thấy trên điện thoại; chủ quán xem thử trên laptop cũng không thấy đúng màn của khách.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-230 | **Màn khách chỉ có một bố cục: điện thoại.** Mọi trang khách (`body.customer`: SCR-01 vào bàn / màn chào, SCR-02 thực đơn, SCR-03 giỏ, SCR-05 theo dõi đơn + cảm ơn, SCR-48 chính sách dữ liệu, SCR-49 vòng quay, SCR-50 trang quà ly tặng) là **một cột rộng tối đa 480 px** (`--phone`). Điện thoại ≤ 480 px: cột = cả màn hình, không đổi gì so với trước. Màn rộng hơn (máy tính bảng, máy tính): cột nằm giữa, hai bên nền xám ấm đậm hơn (`#ddd7cf`) + viền tóc / bóng mảnh để cột nổi như màn điện thoại; **đầu trang, thanh nhóm món, thanh giỏ, thanh nút đáy (Gọi thêm món / Gọi thanh toán), bảng chọn kéo từ đáy, hộp thoại, thông báo đều nằm trong cột**. Bỏ bố cục máy tính của D-195 (cột 720 / 1040 px, thẻ món 2 cột từ 1024 px) — thẻ món luôn một cột. Màn quầy dùng chung `customer.css` (`body.pos`: Bán mang đi, Gọi món tại bàn) **không đổi**. Không chặn mở bằng máy tính, không thêm thông báo "hãy mở bằng điện thoại". |

## Phương án đã cân nhắc

- **Chặn máy tính / hiện "Hãy mở bằng điện thoại" kèm QR:** chủ quán cần xem thử màn khách trên laptop; khách đôi khi dùng máy tính bảng → không chặn, chỉ hiện đúng màn điện thoại.
- **Khung giả lập điện thoại (viền máy, tai thỏ, chiều cao cố định):** chỉ để trang trí, chiếm chỗ, sinh cuộn lồng trong khung → chỉ dùng cột + nền hai bên.
- **Giữ 2 cột trên máy tính (D-195):** trái yêu cầu chủ dự án.

## Hệ quả

- **Mã nguồn:** `css/customer.css` (`--phone`, cột + nền hai bên, thanh giỏ / thanh nút đáy / bảng chọn / hộp thoại trong cột, bỏ hai khối `@media (min-width: 1024px)`). Không đổi JS, API, CSDL.
- **Test:** E2E "màn khách chỉ cho điện thoại…" (AC-093-01, AC-093-02); các bài khách cũ (390 / 320 px) và a11y giữ nguyên.
- **Tài liệu:** FEATURE-093, ADR-042 (ghi chú D-195 bị thay một phần), design-system (bề ngang màn khách), screens-flows, user-stories, use-cases, tc-map.
