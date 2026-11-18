# TASK-126 — Hộp Nhận hàng dễ dùng: ô có nhãn, không tràn (DEF-033, F-030); thẻ trang Nhập kho không vẽ nhầm (DEF-034)

- **Status:** READY_FOR_REVIEW (18/11/2026)
- **Tài liệu:** [FEATURE-030](../chức-năng/FEATURE-030.md) · DEF-033 ([defect-log](../chất-lượng/defect-log.md))
- **Màn hình:** SCR-17 (Kho ở quầy → Nhận hàng), SCR-35 (Nhà cung cấp & đặt hàng → Nhận hàng)
- **Nguồn:** chủ dự án 18/11/2026 "bạn làm vài cái ví dụ ở nhận hàng dc không". Khi tạo 3 đơn ví dụ và mở thử hộp Nhận hàng, Claude thấy lỗi hiển thị (DEF-033).
- **Người làm:** Agent: Claude · Reviewer: chủ dự án
- **Nhánh:** `task/TASK-126-hop-nhan-hang`, chồng lên `task/TASK-125-in-bill-co-ma-qr`

## Phạm vi

- `receive-po.js` (dùng chung trang quản lý + máy quầy), mỗi dòng gồm:
  - tên + "đặt … · đã nhận …" cùng đơn vị gói (trước: "đã nhận" theo đơn vị gốc);
  - các ô có nhãn: "Số nhận (gói)", "Giá / gói (đ)", "Hạn sử dụng" (nguyên liệu theo lô);
  - lưới tự xuống hàng theo bề ngang hộp.
- `base.css`: `.recv-line`, `.recv-head`, `.recv-fields`, `.recv-field`.
- DEF-034 (gặp khi chạy E2E): `admin-stock.js` tải thẻ nối tiếp nhau — bấm thẻ khác lúc thẻ trước còn tải thì thẻ trước không vẽ đè.
- **Dữ liệu ví dụ trên CafeQrDev** (chủ quán nhờ, tạo qua API như ở trang Quản lý):
  - 3 nhà cung cấp "Ví dụ — …";
  - 3 đơn đặt hàng đã gửi (#1 cà phê bột 2 kg; #2 sữa tươi 12 hộp theo lô + sữa đặc 5 l; #3 nước suối, đường, đào ngâm — thử nhận thiếu);
  - không đổi tồn kho cho tới khi bấm Nhập kho.

## Test

E2E "hộp Nhận hàng (DEF-033)…", ở trang quản lý và máy quầy:

- có nhãn;
- đơn vị đúng;
- không ô nào ra ngoài hộp;
- tên một dòng.

## Lệnh kiểm chứng

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run test:e2e`
- `npm run trace -- --check`
