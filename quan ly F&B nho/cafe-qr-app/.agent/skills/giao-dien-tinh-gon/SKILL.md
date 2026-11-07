---
name: giao-dien-tinh-gon
description: Giao diện tinh gọn "giấy – mực – cà phê" của cafe-qr-app (ADR-042 / TASK-101, đợt 1 nền tảng + đợt 2 màn khách; đợt 3 máy quầy, đợt 4 trang Quản lý chờ chủ dự án duyệt ảnh) — token màu nền ngà #f7f6f3 / chữ mực #1d1a17 / màu chính cà phê rang #3b2a1f / một màu nhấn đồng #a07444, phông tiêu đề Cormorant Garamond (chỉ chữ lớn, không cho số tiền / mã) + Be Vietnam Pro, token chuyển động (--ease-out / --ease-in / --ease-sheet, --dur-1/2/3), modal({ foot }) + đóng qua document.startViewTransition (hộp thoại rời trang ngay, hiệu ứng trên ảnh chụp) + dragToDismiss (kéo tay nắm sheet xuống để đóng) + trả focus, toast gọn nền mực tối đa 3, announce() thay thông báo thành công, màn khách danh sách phẳng (bấm cả dòng, ảnh thật, vạch nhóm món trượt + theo cuộn, thanh giỏ nảy), quy tắc "không AI hóa". Dùng khi sửa CSS / giao diện bất kỳ màn nào, thêm màu / phông / hiệu ứng, làm đợt 3 / 4, hoặc khi nhắc "sang trọng", "mượt", "không AI hóa", "Impeccable", "design system", "token", "hiệu ứng", "toast", "bottom sheet", "kéo để đóng".
---

# Mục đích

Ghi lại **giao diện tinh gọn** (08/11/2026, TASK-101) để agent sau sửa giao diện mà không kéo app quay lại "giao diện AI" (nền kem, ô chữ cái, thẻ đổ bóng, thông báo xanh chồng nhau), không phá hiệu ứng / trợ năng / E2E.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-042-giao-dien-tinh-gon.md` (D-188…D-194; thay một phần ADR-012 D-52 / D-53, ADR-013 D-56 / D-57) |
| Design system | `tài-liệu/giao-diện/design-system.md` (token, phông, chữ, mục "Chuyển động", thành phần, quy tắc) |
| Task / kế hoạch | `tài-liệu/công-việc/TASK-101.md`, `tài-liệu/kế-hoạch/TASK-101-plan.md` · UAT-53 (`chất-lượng/uat-plan.md`) |

# Khi dùng

- **Thêm màu:** thêm token vào `:root` của `css/base.css`, tính tương phản (chữ ≥ 4,5:1, đồ họa ≥ 3:1) trước, ghi vào `design-system.md`. Màn khách: không tô khối màu lớn — trạng thái là chấm / chữ nhỏ / viền.
- **Tiêu đề mới:** `font-family: var(--font-display)` + `font-variant-numeric: lining-nums` (Cormorant mặc định số kiểu cổ, "1" giống "ı"), đậm 600, cỡ ≥ 1.35rem (Cormorant thấp chữ — nhỏ hơn thì dùng `--font`). Số tiền, mã, số đếm luôn `--font` + `font-variant-numeric: tabular-nums`.
- **Hộp thoại / bảng trượt mới:** luôn qua `modal()` trong `js/ui.js` (đủ: hiệu ứng vào, đóng qua View Transition, tay nắm + kéo để đóng cho `sheet`, Esc, bấm ra ngoài, trả focus). Chân tự dựng → `modal({ foot })`. Đừng tự `overlay.remove()`.
- **Báo thành công:** việc thường ngày (thêm / sửa món) → phản hồi tại chỗ + `announce()`; `toast` cho lỗi, cảnh báo, việc ít gặp. Không xếp nhiều toast liên tiếp.
- **Hiệu ứng mới:** dùng `--ease-*` / `--dur-*`, chỉ `transform` / `opacity`; thêm vào khối `@media (prefers-reduced-motion: reduce)`; JS kiểm `reducedMotion()`.
- **Đợt 3 (máy quầy) / đợt 4 (trang Quản lý):** chỉ làm khi chủ dự án đã duyệt ảnh đợt 1 + 2. Gợi ý trong ADR-042: gom thanh trên quầy, bảng đơn nền trung tính (màu chỉ ở chấm / số đếm), bàn trống nhạt hơn, nút "Thu tiền" chưa dùng được thì xám + lý do; "Hôm nay" số lớn, bảng không ngắt chữ, công tắc trung tính, "Xóa" vào trong "Sửa", bỏ nền vầng sáng ở đăng nhập. Hai trang quầy `pos/takeaway.html`, `pos/table-order.html` nạp cả `customer.css` — kiểu riêng của khách phải nằm trong `body.customer`.

# Quy tắc (ADR-042)

- **Không AI hóa (D-194):** không biểu tượng trang trí trước tiêu đề; không ô chữ cái thay ảnh ở màn khách (`thumb()` chỉ gọi khi có `imageUrl`); không gradient / vầng sáng / kính mờ mới; không hộp viền gạch kiểu phiếu giảm giá; một màu nhấn; chữ đậm có chủ đích (tên món 500, giá 400).
- **Đóng hộp thoại (D-191):** `leave()` bỏ `role` / `aria-modal` / mọi `id`, đặt `inert` + `aria-hidden` NGAY (để E2E / trình đọc màn hình không thấy hai hộp thoại), rồi `document.startViewTransition(gone)` với `view-transition-name` `vt-dialog` / `vt-scrim` + `html[data-vt-leave=sheet|drawer|modal]` → CSS `::view-transition-old(vt-dialog)` chạy `sheet-out` / `drawer-out` / `modal-out`. Bắt cả `ready`, `updateCallbackDone`, `finished` (bị hủy khi trang chuyển đi lúc gửi đơn → không được báo `pageerror`); đường lùi `setTimeout(gone, 600)`.
- **Kéo để đóng:** `dragToDismiss(box, [head, grabber])` — pointer events, bỏ qua khi bấm vào nút / ô nhập; > 90 px hoặc > 0,6 px/ms (đã kéo > 30 px) → đóng; ít hơn → bật về. `.sheet > .modal-head { touch-action: none }`.
- **Toast:** nền mực; `success` có `circle-check`; tối đa 3 (`MAX_TOASTS`); ra bằng `.leaving`. E2E bắt toast theo chữ — giữ nội dung chữ trong `span`.
- **Màn khách:** dòng món phẳng; `.c-name-btn::after` phủ cả dòng; `.c-control`, `.fav-btn`, `.link-btn` có `z-index: 1`; "+" là `icon('plus')` (aria-label "Thêm …" — E2E dùng); vạch `.tab-ink` dịch bằng `transform: translateX(left) scaleX(width)`; `spyOnScroll` đổi nhóm theo vị trí cuộn (tạm dừng 900 ms sau khi bấm nhóm); thanh giỏ `.bump` khi số món tăng; dòng giỏ vừa sửa `.updated`.
- **Bảng chọn món:** chân = `.item-foot` (`.stepper` có `#item-qty` + nút `.btn-primary` "Thêm vào giỏ · tổng") — nút "+" số lượng nằm NGOÀI `.item-sheet` (E2E: `getByRole('dialog').getByRole('button', { name: 'Thêm …' })`). Không còn "Hủy", "Giá 1 phần" (`.opt-total` chỉ còn ở `pickOptions` của quầy).

# Đã thử rồi bỏ (đừng làm lại nếu chưa có lý do mới)

- **View Transitions giữa các trang** (`@view-transition { navigation: auto }`): trang cũ có `pageswap.viewTransition` nhưng trang mới `pagereveal` không có → Chromium 156 hủy, báo `pageerror` "Transition was aborted because of invalid state. ViewTransition opt-in disabled" ở mọi lần chuyển trang (E2E `watch()` sẽ hỏng).
- **Hiện dần nội dung khi mở trang** (opacity 0 → 1): Chrome giữ khung hình trang cũ tới khi trang mới có nội dung nhìn thấy → hiệu ứng đứng ở 0 ms ~1,3 s. (Môi trường thử vẽ khung đầu ~1,38 s cả ở bản gốc.)
- **Giữ khung hộp thoại trong DOM để chạy hiệu ứng ra:** E2E gặp lỗi strict mode (hai `.sheet .modal-foot .btn-primary`).

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` (flow + a11y: tương phản, vùng chạm ≥ 24 px, không cuộn ngang 320 / 390, focus) · `npm run trace -- --check` · ảnh 390 px + 1366 px · bộ dò `npx impeccable@4.7.0 detect <public>` chạy từ thư mục ngoài repo (0 phát hiện ngày 08/11/2026). Không migration.
