---
name: giao-dien-tinh-gon
description: Giao diện tinh gọn của cafe-qr-app (ADR-042 / TASK-101, đợt 1 nền tảng + đợt 2 màn khách, sửa theo D-195 sau khi chủ dự án thấy bản đầu "khó nhìn"; đợt 3 máy quầy, đợt 4 trang Quản lý chờ chủ dự án duyệt ảnh) — token màu nền xám ấm #f3f2ef / chữ #221a14 / màu chính nâu rang #7a4527 / một màu nhấn đồng #a07444, một phông Be Vietnam Pro (tiêu đề đậm 700 — Cormorant đã bỏ), token chuyển động (--ease-out / --ease-in / --ease-sheet, --dur-1/2/3), modal({ foot }) + đóng qua document.startViewTransition (hộp thoại rời trang ngay, hiệu ứng trên ảnh chụp) + dragToDismiss (kéo tay nắm sheet xuống để đóng) + trả focus, toast gọn nền mực tối đa 3, announce() thay thông báo thành công, màn khách thẻ món trắng (bấm cả thẻ, nút "+" tròn đặc nâu rang, giá đậm, chấm số gắn góc nút, đầu trang espresso, nhóm món nút tròn tự đổi theo cuộn, --page / --gutter căn một cột + 2 cột thẻ ≥ 1024 px, thanh giỏ giữa nảy khi thêm), quy tắc "không AI hóa". Dùng khi sửa CSS / giao diện bất kỳ màn nào, thêm màu / phông / hiệu ứng, làm đợt 3 / 4, hoặc khi nhắc "sang trọng", "mượt", "dễ nhìn", "khó nhìn", "không AI hóa", "Impeccable", "design system", "token", "hiệu ứng", "toast", "bottom sheet", "kéo để đóng".
---

# Mục đích

Ghi lại **giao diện tinh gọn** (08/11/2026, TASK-101 + vòng sửa D-195) để agent sau sửa giao diện mà không kéo app quay lại "giao diện AI" (nền kem, ô chữ cái, thông báo xanh chồng nhau), cũng không quay lại bản đầu bị chủ dự án chê "khó nhìn" (phông có chân mảnh, dòng món không khung, nút "+" chỉ có viền, lệch cột trên máy tính), không phá hiệu ứng / trợ năng / E2E.

| Tài liệu        | Đường dẫn                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Quyết định      | `tài-liệu/quyết-định/ADR-042-giao-dien-tinh-gon.md` (D-188…D-195; D-195 thay một phần D-188 / D-189 / D-190 / D-193)          |
| Design system   | `tài-liệu/giao-diện/design-system.md` (token, phông, chữ, mục "Chuyển động", thành phần, quy tắc)                             |
| Task / kế hoạch | `tài-liệu/công-việc/TASK-101.md` (mục "Vòng sửa 1"), `tài-liệu/kế-hoạch/TASK-101-plan.md` · UAT-53 (`chất-lượng/uat-plan.md`) |

# Khi dùng

- **Chủ dự án xem trên máy tính 1920 px** chứ không chỉ điện thoại: luôn chụp cả 390 px và 1920 px (màn khách), 1366 px (quầy / quản lý) trước khi báo xong.
- **Thêm màu:** thêm token vào `:root` của `css/base.css`, tính tương phản (chữ ≥ 4,5:1, đồ họa ≥ 3:1) trước, ghi vào `design-system.md`. Màn khách: không tô khối màu lớn — trạng thái là chấm / chữ nhỏ / viền.
- **Tiêu đề mới:** Be Vietnam Pro đậm 700 (`--font-display` = `var(--font)`), `letter-spacing` âm nhẹ; phân cấp bằng cỡ + độ đậm, không thêm phông thứ hai. Số tiền, số đếm `font-variant-numeric: tabular-nums`.
- **Hộp thoại / bảng trượt mới:** luôn qua `modal()` trong `js/ui.js` (đủ: hiệu ứng vào, đóng qua View Transition, tay nắm + kéo để đóng cho `sheet`, Esc, bấm ra ngoài, trả focus). Chân tự dựng → `modal({ foot })`. Đừng tự `overlay.remove()`.
- **Báo thành công:** việc thường ngày (thêm / sửa món) → phản hồi tại chỗ + `announce()`; `toast` cho lỗi, cảnh báo, việc ít gặp. Không xếp nhiều toast liên tiếp.
- **Hiệu ứng mới:** dùng `--ease-*` / `--dur-*`, chỉ `transform` / `opacity` / màu; thêm vào khối `@media (prefers-reduced-motion: reduce)`; JS kiểm `reducedMotion()`.
- **Trang khách mới / phần mới trong trang khách:** đặt nội dung trong cột `max-width: var(--page)`, lề `var(--gutter)` để thẳng với đầu trang.
- **Đợt 3 (máy quầy) / đợt 4 (trang Quản lý):** chỉ làm khi chủ dự án đã duyệt ảnh đợt 1 + 2. Gợi ý trong ADR-042: gom thanh trên quầy, bảng đơn nền trung tính (màu chỉ ở chấm / số đếm), bàn trống nhạt hơn, nút "Thu tiền" chưa dùng được thì xám + lý do; "Hôm nay" số lớn, bảng không ngắt chữ, công tắc trung tính, "Xóa" vào trong "Sửa", bỏ nền vầng sáng ở đăng nhập. Hai trang quầy `pos/takeaway.html`, `pos/table-order.html` nạp cả `customer.css` — kiểu riêng của khách phải nằm trong `body.customer`.

# Quy tắc (ADR-042 + D-195)

- **Không AI hóa (D-194):** không biểu tượng trang trí trước tiêu đề; không ô chữ cái thay ảnh ở màn khách (`thumb()` chỉ gọi khi có `imageUrl`); không gradient / vầng sáng / kính mờ mới; không hộp viền gạch kiểu phiếu giảm giá; một màu nhấn; chữ đậm có chủ đích (tên món 600, giá 700 nâu rang).
- **Dễ nhìn (D-195):** chỗ bấm chính phải đặc màu (nút "+", thanh giỏ, nhóm đang chọn — nâu rang, chữ trắng 7,75:1); mỗi món có khung (thẻ trắng viền `--c-border`, bo 14 px); đầu trang khách nền espresso, chữ trắng.
- **Đóng hộp thoại (D-191):** `leave()` bỏ `role` / `aria-modal` / mọi `id`, đặt `inert` + `aria-hidden` NGAY (để E2E / trình đọc màn hình không thấy hai hộp thoại), rồi `document.startViewTransition(gone)` với `view-transition-name` `vt-dialog` / `vt-scrim` + `html[data-vt-leave=sheet|drawer|modal]` → CSS `::view-transition-old(vt-dialog)` chạy `sheet-out` / `drawer-out` / `modal-out`. Bắt cả `ready`, `updateCallbackDone`, `finished` (bị hủy khi trang chuyển đi lúc gửi đơn → không được báo `pageerror`); đường lùi `setTimeout(gone, 600)`.
- **Kéo để đóng:** `dragToDismiss(box, [head, grabber])` — pointer events, bỏ qua khi bấm vào nút / ô nhập; > 90 px hoặc > 0,6 px/ms (đã kéo > 30 px) → đóng; ít hơn → bật về. `.sheet > .modal-head { touch-action: none }`.
- **Toast:** nền mực; `success` có `circle-check`; tối đa 3 (`MAX_TOASTS`); ra bằng `.leaving`. E2E bắt toast theo chữ — giữ nội dung chữ trong `span`.
- **Màn khách:** `.c-item` thẻ trắng; `.c-name-btn::after` phủ cả thẻ; `.c-control` (`position: relative`), `.fav-btn`, `.link-btn` có `z-index: 1`; "+" là `icon('plus')` (aria-label "Thêm …" — E2E dùng); `.qty-badge` tuyệt đối ở góc trên phải `.c-control`, `pointer-events: none` (E2E đọc chữ số); nhóm món `body.customer .c-tabs .chip` nút tròn, `.active` nền nâu rang; `spyOnScroll` mép `8.75rem + 16px` = `scroll-margin-top` của `.c-section` (đổi chiều cao đầu trang / thanh nhóm thì sửa cả hai); thanh giỏ `.bump` khi số món tăng, chữ `nowrap`; ô mời nhập SĐT `.member-box.invite` là điểm nhấn duy nhất có nền màu (nền `--c-primary-50`, quà trong vòng tròn đặc, "Nhận ngay ›" dưới chữ — đặt bên phải thì ép chữ ở 320 px); dòng giỏ vừa sửa `.updated`. ≥ 1024 px: `.c-section` là lưới 2 cột, con không phải `.c-item` trải hết hàng.
- **Bảng chọn món:** chân = `.item-foot` (`.stepper` có `#item-qty` + nút `.btn-primary` "Thêm vào giỏ · tổng") — nút "+" số lượng nằm NGOÀI `.item-sheet` (E2E: `getByRole('dialog').getByRole('button', { name: 'Thêm …' })`). Không còn "Hủy", "Giá 1 phần" (`.opt-total` chỉ còn ở `pickOptions` của quầy).

# Đã thử rồi bỏ (đừng làm lại nếu chưa có lý do mới)

- **Phông tiêu đề Cormorant Garamond** (bản đầu ADR-042): nét chân mảnh, khó đọc trên màn Windows / điện thoại, số kiểu cổ ("1" giống "ı") → chủ dự án chê "khó nhìn"; đã gỡ tệp + giấy phép.
- **Dòng món phẳng không khung + nút "+" chỉ có viền + giá chữ mỏng màu mực** (bản đầu ADR-042): món "trôi" trên nền, nút trông như bị tắt.
- **Đầu trang / thanh nhóm món sát mép trái, thực đơn cột hẹp giữa, thanh giỏ `max-width` + `margin: auto` trên `.btn`** — trên 1920 px ba phần lệch nhau, thanh giỏ dạt trái. Dùng `--page` / `--gutter`, thanh giỏ `display: flex; width: 100%`.
- **Nền kem + tiêu đề Lora + ô chữ cái** ("Mộc" cũ): dấu hiệu giao diện AI (Impeccable `cream-palette`).
- **View Transitions giữa các trang** (`@view-transition { navigation: auto }`): trang cũ có `pageswap.viewTransition` nhưng trang mới `pagereveal` không có → Chromium 156 hủy, báo `pageerror` "Transition was aborted because of invalid state. ViewTransition opt-in disabled" ở mọi lần chuyển trang (E2E `watch()` sẽ hỏng).
- **Hiện dần nội dung khi mở trang** (opacity 0 → 1): Chrome giữ khung hình trang cũ tới khi trang mới có nội dung nhìn thấy → hiệu ứng đứng ở 0 ms ~1,3 s. (Môi trường thử vẽ khung đầu ~1,38 s cả ở bản gốc.)
- **Giữ khung hộp thoại trong DOM để chạy hiệu ứng ra:** E2E gặp lỗi strict mode (hai `.sheet .modal-foot .btn-primary`).

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` (flow + a11y: tương phản, vùng chạm ≥ 24 px, không cuộn ngang 320 / 390, focus) · `npm run trace -- --check` · ảnh 390 px + 1920 px (khách) + 1366 px (quầy / quản lý) · bộ dò `npx impeccable@4.7.0 detect <public>` chạy từ thư mục ngoài repo. Không migration.
