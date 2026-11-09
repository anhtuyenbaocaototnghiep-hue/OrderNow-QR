# Design system — bước 09

> **Nguồn:** CSS và JS thật trong `ứng-dụng/giao-diện/public/` (`css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`, `css/print.css`, `js/ui.js`, `js/admin-shell.js`), đối chiếu ngày 20/10/2026; **cập nhật 23/10/2026 theo chủ đề "Mộc"** ([ADR-012](../quyết-định/ADR-012-giao-dien-moc.md), [TASK-065](../công-việc/TASK-065.md)); **cập nhật 08/11/2026 theo bảng màu "giấy – mực – cà phê"** ([ADR-042](../quyết-định/ADR-042-giao-dien-tinh-gon.md), [TASK-101](../công-việc/TASK-101.md) — đợt 1 nền tảng + đợt 2 màn khách; máy quầy / trang Quản lý mới nhận màu + phông, bố cục riêng làm ở đợt 3 / 4); **sửa cùng ngày theo D-195** sau khi chủ dự án xem ảnh ("khó nhìn"): bỏ Cormorant, màu chính về nâu rang, màn khách thẻ món + nút "+" đặc + đầu trang tối, căn một cột trên máy tính. **Trạng thái tài liệu:** BẢN NHÁP — chờ chủ dự án duyệt ở Gate G2. Mọi giá trị dưới đây **lấy từ code**. Phần nào chỉ là đề xuất thì ghi PROPOSED.

FE là HTML/CSS/JS thuần, không framework, không thư viện UI (ADR-002, D-4). Phông chữ tự lưu trong `public/fonts/` (ADR-012 D-53). Mỗi khu vực gắn một class trên `<body>` và nạp `base.css` cùng một file riêng:

| Khu vực | `<body>` | CSS | Thiết bị chính |
| --- | --- | --- | --- |
| Khách | `body.customer` | `base.css` + `customer.css` | Điện thoại |
| Quầy (POS) | `body.pos` | `base.css` + `pos.css` | Máy tính / tablet ở quầy |
| Quản lý | `body.admin` | `base.css` + `admin.css` | Laptop; riêng SCR-42 dùng cả điện thoại |
| Trang in | `body.receipt-page` | `base.css` + `print.css` | Máy in nhiệt 58 / 80 mm |

Màn hình và route: [sitemap.md](sitemap.md). Trạng thái giao diện từng màn: [screens-flows.md](screens-flows.md#ui-states). Yêu cầu khả năng tiếp cận: [nfr.md](../sản-phẩm/nfr.md) (nhóm Accessibility).

## Token (`:root` trong `css/base.css`)

### Màu (ADR-042 D-188, sửa theo D-195; trước đó chủ đề "Mộc" — ADR-012 D-52)

Nền xám ấm nhạt (không kem) để thẻ trắng nổi rõ, chữ mực nâu, màu chính **nâu rang** (nút "+", giá món, nhóm đang chọn, thanh giỏ), **một màu nhấn** (đồng) chỉ dùng cho điểm nhỏ; xanh / vàng / đỏ chỉ cho trạng thái. Ở màn khách không tô khối màu lớn (hộp thông tin, ô hội viên, ưu đãi: nền trắng viền tóc). Giá trị "Mộc" (23/10/2026) ghi trong ngoặc.

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--c-bg` | `#f3f2ef` xám ấm nhạt (bản đầu ADR-042 `#f7f6f3`; "Mộc" `#f6efe5` kem sữa) | Nền trang khách, quản lý, thanh nhóm món khách |
| `--c-surface` | `#ffffff` (`#fffdf9`) | Nền thẻ, hộp thoại, nút thường, ô nhập, "+" khách |
| `--c-surface-2` | `#efebe5` (`#f0e6d8`) | Hover nút, tiêu đề bảng, badge mặc định |
| `--c-border` | `#e5e0d8` (`#e2d3bf`) | Viền thẻ món / thẻ đơn, bảng, viền chip và nút nhóm món |
| `--c-input-border` | `#cfc8be` (mới; trước `#d9c8b2` viết thẳng) | Viền ô nhập, bước số lượng, tay nắm sheet, viền thẻ món khi rê chuột |
| `--c-text` | `#221a14` mực nâu (`#2a1b12`) | Chữ chính; nền thông báo |
| `--c-muted` | `#665d54` (`#68533f`) | Chữ phụ, tùy chọn trong giỏ, thành phần combo |
| `--c-primary` | `#7a4527` nâu rang (giữ từ "Mộc"; bản đầu ADR-042 `#3b2a1f`) | Nút chính, link, chip / nhóm món đang chọn, nút "+" khách, giá món, "Chọn size / tùy chọn ›", thanh giỏ |
| `--c-primary-600` | `#5f341c` | Hover nút chính, "+", thanh giỏ |
| `--c-primary-50` | `#f6eee6` (`#f5e9dc`) | Nền nhãn "Bán chạy" (`.tag`), ảnh thu nhỏ, dòng giỏ vừa sửa (sáng rồi nhạt), đầu thẻ thành viên |
| `--c-accent` | `#a07444` đồng (`#c8873f` caramel) | Điểm nhấn nhỏ: đồng hồ thời gian chờ, sao ô hội viên, biểu đồ — ≥ 3,8:1 với nền, không làm chữ nhỏ |
| `--c-accent-600` | `#8c5220` | Nền có chữ trắng: mục menu đang chọn (quầy, quản lý) — 6,28:1 |
| `--c-accent-100` | `#f3dcb8` | Bôi chọn chữ, vòng dấu hiệu quán (quầy / quản lý) |
| `--c-focus` | `#8c5220`; trên nền tối đặt lại `--c-focus-dark` | Viền `:focus-visible` 2 px (trước 3 px), ≥ 3:1 với nền (WCAG 1.4.11) |
| `--c-espresso` / `--c-espresso-2` | `#24170f` / `#33231a` | Nền tối: `.pos-top`, `.admin-side`, đầu trang khách `.c-header` (D-195 — bản đầu ADR-042 để nền sáng); `theme-color` 6 trang khách |
| `--c-on-dark` / `--c-on-dark-muted` | `#eadccb` / `#cdb59a` | Chữ / chữ phụ trên nền espresso |
| `--c-focus-dark` | `#ffd38a` | Viền focus trên nền espresso |
| `--c-success` / `--c-success-50` | `#2f6a45` / `#e6f0e6` | Trạng thái thành công; vạch bước đã qua ở theo dõi đơn; dấu ✓ trong thông báo (bản sáng `#9fd8b0` trên nền mực) |
| `--c-warning` / `--c-warning-50` | `#b7791f` / `#fbf0dc` | Viền / biểu đồ cảnh báo |
| `--c-warning-text` | `#85550f` | Chữ cảnh báo, ghi chú món, nền thông báo cảnh báo |
| `--c-danger` / `--c-danger-50` | `#b3261e` / `#fbeae6` | Nút xóa, lỗi, nhãn khuyến mãi (chữ đỏ viền nhạt), nền thông báo lỗi |
| `--c-info` / `--c-info-50` | `#2c5d88` / `#e6eef6` | Badge `preparing`, cột "Đang pha" ở quầy, alert thông tin ở quầy / quản lý (màn khách: hộp thông tin nền trắng) |

### Màu dữ liệu biểu đồ (ADR-015 D-60 — chủ dự án chọn)

Chỉ tô nét / cột / điểm, **không làm màu chữ** (nhãn, số, chú thích dùng `--c-text` / `--c-muted`). Thứ tự cố định, không xoay vòng.

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--viz-1` | `#3a9efd` xanh | Doanh thu thuần (Lãi / lỗ, Báo cáo), đường thực tế ở Dự báo |
| `--viz-2` | `#f7a400` cam | Giá vốn (Lãi / lỗ); đường dự báo nét đứt + dải ± 1 độ lệch chuẩn + điểm dự báo |
| `--viz-3` | `#1a1b4b` tím đen | Chi phí (Lãi / lỗ); vạch "Hôm nay" ở Dự báo |
| `--viz-grid` / `--viz-axis` | `#ece3d7` / `#c9b8a2` | Lưới mảnh / đường gốc 0 |

Validator dataviz trên nền thẻ `#fffdf9`: phân biệt mù màu ΔE 29,3, mắt thường ΔE 34,7 (đạt); xanh 2,76 : 1, cam 2,01 : 1 với nền (< 3 : 1) → luôn có bảng số liệu + hộp số liệu khi rê chuột / bàn phím. Đồ nghề chung: `js/chart-kit.js` (`svg`, `niceScale`, `compact`, `barPath`, `attachHover`). Nét vẽ: cột ≤ 24 px bo đầu 4 px chân vuông, khe 2 px; đường 2 px; điểm 8 px viền nền 2 px; ngưỡng (hòa vốn) nét đứt màu mực; nhãn trục ngày thưa (≤ 16 nhãn / dự báo mỗi 7 ngày) để không chồng chữ. Hộp số liệu: nền espresso, chữ `--c-on-dark` / trắng `#fff`, viền ô màu `rgba(255, 255, 255, 0.5)`. Lãi / lỗ kỳ dài (> ~45 kỳ) đổi sang 3 đường. Màn hẹp: biểu đồ giữ ≥ 80 % cỡ thiết kế, cuộn ngang trong khung. Biểu đồ cũ (giờ cao điểm, menu engineering, dự báo nhập hàng) giữ màu `.chart .bar` / `.grid` chung.

Màu cố định ngoài token (dùng trực tiếp trong CSS): viền ô mời nhập SĐT `#e3c9b3`, nền `body.pos` `#eceae7` (D-195), hover dòng bảng `#faf9f7`, số món trên thanh giỏ `rgba(255, 255, 255, 0.18)` trên nền nâu rang, nút "Đơn của bạn" trên đầu trang tối (viền `rgba(234, 220, 203, 0.4)`, hover nền `rgba(255, 255, 255, 0.08)`), bóng thẻ món `0 1px 2px rgba(34, 26, 20, 0.04)`, lớp phủ hộp thoại `rgba(29, 26, 23, 0.42)`, skeleton `#ecebe7` / `#f5f4f1`, thanh cuộn `#8a8279` (nền sáng) / `#9a7d62` (thanh bên tối); còn từ "Mộc" (đợt 3 / 4 sẽ xem lại): viền alert / dải (`#efd5a6`, `#f1c4bc`, `#c3d5e8`, `#bcd8c0`), chữ alert cảnh báo `#7a4f10`, công tắc đang tắt `#c4af97`, nền / viền cột bảng đơn quầy (`#fbf1df` / `#efd9b4`, `#edf2f8` / `#cfdcea`, `#ecf3ec` / `#cadfcd`), viền phiếu đơn khi rê chuột `#d5c2aa`, hover nút trên nền tối `#45311f`, nền đăng nhập quầy (espresso → `#4a2a17` + vầng sáng caramel), nền trang in `#e9e4de`, chữ / viền ô màu trong hộp số liệu biểu đồ `#fff` / `rgba(255, 255, 255, 0.5)`.

Tương phản (vòng sửa D-195, 08/11/2026 — công thức WCAG, kiểm lại bằng `a11y.spec.js`): chữ chính / nền 15,30:1, / bề mặt 17,13:1, / `--c-surface-2` 14,43:1; `--c-muted` / nền 5,76:1, / bề mặt 6,44:1, / `--c-surface-2` 5,43:1, / `--c-primary-50` 5,61:1, / `--c-accent-100` 4,83:1 (thấp nhất); chữ trắng / `--c-primary` 7,75:1, / `--c-primary-600` 10,53:1; `--c-primary` (giá, nhãn, link) / nền 6,93:1, / bề mặt 7,75:1, / `--c-primary-50` 6,75:1, / nền quầy 6,46:1; đầu trang khách: chữ trắng / espresso 17,44:1, tên bàn `--c-on-dark-muted` 8,86:1; `--c-accent` / nền 3,70:1 (chỉ đồ họa).

Tương phản bản đầu ADR-042 (đã thay bởi đoạn trên) — tính bằng công thức WCAG, kiểm lại bằng `a11y.spec.js`): chữ chính / nền 16,03:1, / bề mặt 17,32:1, / `--c-surface-2` 14,94:1; `--c-muted` / nền 5,82:1, / bề mặt 6,29:1, / `--c-surface-2` 5,42:1, / `--c-primary-50` 5,40:1, / `--c-accent-100` 4,71:1 (thấp nhất — lần chạy a11y đầu với `#6a635b` báo 4,44:1 ở thẻ quà); chữ trắng / `--c-primary` 13,66:1; `--c-accent` (chỉ đồ họa) / nền 3,83:1, / bề mặt 4,14:1; viền focus `#8c5220` / nền 5,81:1, / bề mặt 6,28:1; chữ cảnh báo / nền 5,88:1; thành công 5,95:1; lỗi 6,05:1; thông tin 6,42:1; chữ trắng / thông báo nền mực 17:1.

Tương phản (cập nhật 23/10/2026, ADR-012 — tính trước bằng công thức WCAG và kiểm tự động bằng `kiểm-thử/e2e/a11y.spec.js` trên trang thật): chữ chính / nền 14,55:1; `--c-muted` trên `--c-surface` 7,13:1 (trên `#fff` 7,25:1), trên `--c-surface-2` 5,87:1; chữ trắng / `--c-primary` 7,75:1; `--c-primary` trên `--c-primary-50` 6,49:1; menu đang chọn 6,28:1; badge `pending` 5,63:1; badge `completed` / `paid` 5,50:1; badge `preparing` 5,92:1; badge lỗi 5,61:1; banner "đơn trễ" 6,36:1; chữ trên nền espresso 12,95:1, nhãn nhóm thanh bên 8,86:1; viền focus 5,09–6,18:1 trên nền sáng, 12,40:1 trên nền tối. Lịch sử: 20/10/2026 (DEF-006) đã nâng `pending` từ 3,31:1, `completed` 4,41:1, menu đang chọn 2,70:1, viền focus 2,45:1 lên ≥ ngưỡng.

### Bo góc, bóng, phông, khoảng cách, chuyển động

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--radius` | `12px` (`14px`) | `.card`, `.modal`, `.table-wrap`, thẻ đơn khách, hộp thông tin, ô hội viên |
| `--radius-sm` | `8px` (`10px`) | `.btn`, `.input`, `.chip` (trước viên thuốc), `.alert`, `.skeleton`; `.btn-lg` `10px`; thanh giỏ `14px` |
| `--radius-lg` | `18px` (mới; trước `22px` viết thẳng) | Góc trên của `.sheet` |
| (không token) | `999px` | Chỉ còn: số trong giỏ (`.qty-badge`), `.switch`, nút tròn "+" khách |
| (không token) | `6px` / `4px` | `.badge` / `.tag`, nhãn "Bắt buộc chọn 1" (`.opt-hint.req`) |
| `--shadow` | `0 1px 2px rgba(29,26,23,.04), 0 4px 14px -6px rgba(29,26,23,.1)` | Phiếu đơn / ô món quầy khi rê chuột, trang in (thẻ món / thẻ đơn khách **không còn bóng** — ADR-042 D-190) |
| `--shadow-lg` | `0 24px 60px -18px rgba(29,26,23,.34)` | `.modal`, `.drawer`, `.sheet`, `.toast`, thanh giỏ, thẻ đăng nhập |
| `--space-1…6` | `0.25 / 0.5 / 0.75 / 1 / 1.5 / 2rem` (mới) | Khoảng cách cho CSS mới (CSS cũ còn giá trị `rem` rời) |
| `--ease-out` / `--ease-in` / `--ease-sheet` | `cubic-bezier(.22,1,.36,1)` / `(.55,0,1,.45)` / `(.32,.72,0,1)` | Vào (chậm dần) / ra / bảng trượt kiểu iOS — xem mục Chuyển động |
| `--dur-1` / `--dur-2` / `--dur-3` | `140 / 220 / 380 ms` | Bấm, rê chuột / hộp thoại, thông báo, đổi màu nhóm món / sheet, ngăn kéo |
| `--font` | `'Be Vietnam Pro', system-ui, …` | Toàn bộ chữ thường, số tiền, mã — phông thiết kế cho dấu tiếng Việt (ADR-012 D-53) |
| `--font-display` | `var(--font)` (D-195; bản đầu ADR-042 `'Cormorant Garamond'`, "Mộc" `'Lora'`) | Giữ tên token cho các quy tắc tiêu đề (`h1`, tên quán ở thanh quầy / thanh bên quản lý, tiêu đề hộp thoại, tên bàn trên thẻ QR, chữ cái ảnh món ở quầy / quản lý) — nay cùng Be Vietnam Pro, phân cấp bằng cỡ + độ đậm 700 |
| `--mono` | `ui-monospace, 'Cascadia Mono', Consolas, monospace` | `.mono`, hóa đơn in |

**Phông tự lưu** (`public/fonts/`, SIL OFL 1.1 — `OFL-BeVietnamPro.txt`; gói `@fontsource/be-vietnam-pro@5.3.0`): Be Vietnam Pro 400 / 500 / 600 / 700 / 800; mỗi độ đậm hai tệp `.woff2` — latin và tiếng Việt, khai báo `unicode-range` nên trình duyệt chỉ tải phần cần (10 tệp). Lora (TASK-101) và Cormorant Garamond (vòng sửa D-195) đã gỡ cả tệp lẫn giấy phép. `font-display: swap`; không gọi CDN — chạy được khi LAN của quán không có Internet.

Token cục bộ: `--w` (`print.css`: `80mm` / `58mm` — bề rộng hóa đơn), `--heat` (`admin.css`: độ đậm ô bản đồ nhiệt giờ cao điểm).

## Chữ (typography)

Không đặt cỡ chữ gốc cho `html`, nên `1rem` theo trình duyệt (thường 16 px). `body` đặt `font-size: 15px`, `line-height: 1.5` (`1.45` trước 23/10); `h1`–`h4` có `line-height: 1.25`, `margin: 0 0 0.5rem`, `letter-spacing: -0.01em`; `h1` dùng `--font-display` (= Be Vietnam Pro) đậm 700, `line-height: 1.2`, `letter-spacing: -0.015em`.

| Vai trò | Cỡ / độ đậm | Ở đâu |
| --- | --- | --- |
| Tiêu đề trang | `1.65rem` quản lý, `1.6rem` vào bàn (khách), `1.55rem` đăng nhập quầy, `1.5rem` đăng nhập quản lý / chính sách dữ liệu — đậm 700 | `.admin-head h1`, `.c-hero h1`, `.login-card h1`, `.admin-login-card h1`, `.policy h1` |
| Tiêu đề nhóm món (khách) | `1.2rem`, đậm 700, không biểu tượng, không gạch trang trí | `.c-section h2` |
| Tiêu đề hộp thoại / bảng trượt | `1.25rem`, đậm 700 | `.modal-head h2` |
| Tên quán | đậm 700: `1.05rem` chữ trắng (đầu trang khách), `1.1rem` (thanh quầy), `1.2rem` (thanh bên quản lý) | `.c-shop`, `.pos-top .brand`, `.admin-side .brand` |
| Tên bàn ở đầu trang khách | `0.875rem`, đậm 500, `--c-on-dark-muted`, tối đa 2 dòng (không cắt tên — review G3 TASK-065) | `.c-table` |
| Nhóm món (thanh dính) | `0.92rem`, đậm 500 → 600 chữ trắng nền nâu rang khi đang chọn | `body.customer .c-tabs .chip` |
| Tên món / giá (khách) | `1.02rem` đậm 600 / `1rem` đậm 700 màu `--c-primary`, số thẳng cột | `.c-item-name` / `.c-item-price` |
| Số lớn (KPI) | `1.65rem` (quản lý), `1.45rem` (quầy), `1.7rem` (`.today-card .big`) | `.kpi .value` |
| Ô nhập tiền | `1.4rem`, đậm 700 | `.money-input` (S-13, S-14) |
| Thân bài | `15px` | `body` |
| Nhãn form | `0.9rem`, đậm 600 | `label` |
| Nút | kế thừa, đậm 600, giãn chữ `0.005em`; `.btn-sm` `0.875rem`; `.btn-lg` `1.05rem` | `.btn` |
| Chip | `0.9rem`, đậm 500 (trước 600) | `.chip` |
| Chữ nhỏ | `0.85rem` | `.small`, `.field-error` |
| Gợi ý nhóm tùy chọn | `0.78rem`, đậm 500; "Bắt buộc…" có viền | `.opt-hint`, `.opt-hint.req` |
| Tiêu đề cột bảng | `0.8rem`, IN HOA, `letter-spacing: 0.03em` | `.table th` |
| Badge | `0.78rem`, đậm 600 (trước 700) | `.badge` |
| Hóa đơn in | `12px`, `--mono`, `line-height: 1.35` | `.receipt` |
| Chữ trên biểu đồ SVG | `11px` (trục `10px`) | `svg.chart text` |

Cột số trong bảng (`td.num`, `th.num`) căn phải và dùng `font-variant-numeric: tabular-nums`.

## Khoảng cách

Token `--space-1…6` có từ ADR-042 (dùng cho CSS mới); CSS cũ còn giá trị `rem` rời: `0.25rem`, `0.4rem`, `0.5rem`, `0.75rem`, `0.85rem`, `1rem`, `1.25rem`.

| Mẫu | Giá trị |
| --- | --- |
| `.row` (flex ngang) | `gap: 0.5rem` |
| `.stack > * + *` (xếp dọc) | `margin-top: 0.75rem` |
| `.card` | `padding: 1rem` |
| `.field` (một ô form) | `margin-bottom: 0.85rem` |
| `.modal-head` / `.modal-body` / `.modal-foot` | `1rem 1.25rem 0.5rem` / `0.5rem 1.25rem 1rem` / `0.75rem 1.25rem 1.1rem` |
| `.table th, td` | `0.6rem 0.75rem` |
| `.admin-main` ở ≤ 480 px | lề ngang `16px` |

Gom hết CSS cũ sang `--space-*`: làm dần khi sửa từng màn (đợt 3 / 4 của ADR-042).

## Thành phần (components)

### Nút

| Class | Mô tả | Kích thước |
| --- | --- | --- |
| `.btn` | Nút thường: nền `--c-surface`, viền `--c-border`, chữ đậm 600; hover `--c-surface-2`; `:disabled` / `[aria-disabled='true']` mờ 50 % | `min-height: 42px` (quầy, khách: `44px` — ADR-012 D-54), `padding: 0.5rem 1.05rem` |
| `.btn-primary` | Nền `--c-primary` (cà phê rang đậm), chữ trắng, **không bóng** (ADR-042); hover `--c-primary-600`; mọi `.btn` lún nhẹ khi bấm (`scale(0.98)`, tắt khi giảm chuyển động) | — |
| `.btn-success` | Nền `--c-success`, chữ trắng (ví dụ "Đã thu tiền & In bill") | — |
| `.btn-danger` | **Nút viền đỏ** (nền trắng, chữ / viền `--c-danger`); hover `--c-danger-50` — nút Xóa, Hủy bàn | — |
| `.btn-ghost` | Trong suốt, không viền | — |
| `.btn-sm` / `.btn-lg` / `.btn-block` | Nhỏ / lớn / rộng 100 % | 36 px (trước 32) / 52 px |
| `.btn.loading` | Ẩn chữ, hiện vòng quay 18 px; bật bằng `setBusy(button, true)` (đồng thời `disabled`) | — |
| `.icon-btn` | Nút tròn chỉ có ký hiệu (ví dụ "×" đóng hộp thoại, kèm `aria-label`) | 40 × 40 px (trước 36) |
| `.link-btn` | Nút trông như link (ví dụ "Xem thẻ thành viên ›") | — |
| `.add-btn` (khách) | Nút tròn viền mảnh `--c-input-border`, nền trắng, biểu tượng `plus` nét 1.75; rê chuột → nền `--c-primary` chữ trắng; co `0.92` khi bấm (ADR-042 — trước: nâu đặc có bóng) | 44 × 44 px |
| `.stepper` (khách) | Nhóm − số lượng +, viền mảnh, góc 10 px, nền trắng (trước viên thuốc nền nâu nhạt); nút đang khóa chữ nhạt | nút 40 × 40 px; ở chân bảng chọn món 40 × 50 px |
| `.c-cartbar .btn` (khách) | Thanh giỏ nổi nền mực, góc 14 px; số món trên nền trắng 16 % (trước caramel nhạt); thanh trượt lên khi hiện, **nảy nhẹ khi thêm món** (`.c-cartbar.bump`) | cao 56 px |
| `.qty-ctl` (quầy) | − / + trong giỏ mang đi, gọi món tại bàn | nút 38 × 38 px (trước 30) |
| `.line-edit` (quầy) | Nút ✎ sửa món trong drawer Thu tiền bàn | ≥ 38 × 38 px (trước 32) |
| `.tile`, `.table-chip` (quầy) | Ô món (viền đáy caramel nhạt) / ô bàn bấm được; `.in-cart` hiện số lượng trong giỏ | ô món cao ≥ 96 px; ô bàn: lưới `minmax(132px, 1fr)`, cao ≥ 68 px |

### Menu quản lý (thanh bên — ADR-013 D-58)

`admin-shell.js` dựng thanh bên: dấu hiệu quán + tên quán → **Hôm nay** (luôn ở trên) → 6 nhóm `<details class="nav-sec">` → "Màn hình quầy" → người đăng nhập + Đăng xuất.

| Nhóm (biểu tượng) | Mục (tên ngắn trên menu — tên đầy đủ là tiêu đề trang, hiện khi rê chuột) |
| --- | --- |
| Tổng quan (`chart-column`) | Báo cáo & lịch sử · Phân tích · Lãi / lỗ |
| Thực đơn (`utensils-crossed`) | Món & định lượng · Tùy chọn món · Combo · Lịch thực đơn |
| Kho hàng (`package`) | Nguyên liệu · Nhập kho & kiểm kê · Nhà cung cấp |
| Khách hàng (`users`) | Hội viên · Tích điểm & voucher · Khuyến mãi · Gợi ý & ghim · Đánh giá món |
| Thu chi & nhân sự (`wallet`) | Ca & hoàn tiền · Sổ quỹ · Nhân sự & chấm công |
| Hệ thống (`settings`) | Bàn & mã QR · Tài khoản · Nhật ký thao tác · Cài đặt · Tra cứu API |

- Tiêu đề nhóm và mục cùng một hàng (cao ≥ 38 px, mục con ≥ 34 px, thụt thẳng chữ tiêu đề nhóm); biểu tượng màu `--c-on-dark-muted`; mũi tên `chevron-down` xoay khi mở.
- Nhóm chứa trang đang mở tự mở; nhóm người dùng bấm mở / đóng được nhớ trong `localStorage` (`admin.nav.open`, bị chặn lưu thì chỉ mất ghi nhớ).
- Trang đang mở: nền `--c-accent-600`, chữ trắng (6,28:1), `aria-current="page"`; không vạch màu một bên.
- Màn ≤ 860 px: thanh bên nằm trên nội dung (hết dính), vẫn dạng nhóm thu gọn.

### Chip, badge, tag

- `.chip` (`base.css`): góc bo `8px` (ADR-042 D-190 — trước viên thuốc), viền `--c-border`, cao ≥ 38 px, `padding: 0.4rem 0.9rem`, chữ `0.9rem` đậm 500; hover viền `--c-input-border`. Đang chọn: `.active` hoặc `[aria-pressed='true']` → nền `--c-primary`, chữ trắng. Dùng cho chip danh mục ở quầy (Bán mang đi / Gọi món tại bàn dùng lại `.c-tabs`), ghi chú nhanh (`.note-chips`, cao ≥ 36 px), chọn lúc làm món, chip lý do sửa món. **Thanh nhóm món của khách** (`body.customer .c-tabs`, D-195) là nút tròn (`999px`) cao 40 px nền trắng viền `--c-border`, thanh cao 61 px dính dưới đầu trang 66 px; nhóm đang chọn nền `--c-primary` chữ trắng 600 (đổi màu `--dur-2`) và tự đổi theo nhóm đang xem khi cuộn (`t-menu.js` `spyOnScroll`, mép = `8.75rem + 16px`); nhóm đang chọn có `aria-current="true"`. Bản đầu ADR-042 là chữ + vạch đồng trượt (`.tab-ink`) — đã bỏ.
- `.badge`: góc bo `6px` (ADR-042 — trước viên thuốc), chữ `0.78rem` đậm 600. Biến thể trạng thái:

| Class | Màu | Nhãn (JS) |
| --- | --- | --- |
| `.badge.pending` | cảnh báo | "Chờ xác nhận" (`PENDING`) |
| `.badge.preparing` | thông tin | "Đang chuẩn bị" (`PREPARING`) |
| `.badge.completed`, `.paid`, `.ok` | thành công | "Đã xong" (`COMPLETED`), "Đã thu" |
| `.badge.cancelled`, `.danger`, `.voided` | lỗi | "Đã hủy" (`CANCELLED`), "Đã hoàn tiền" (`VOIDED`) |
| `.badge.unpaid` | trung tính | "Chưa thu" |
| `.badge.primary` | màu chủ đạo | nhãn chung (ví dụ "Chủ quán" ở trang Tài khoản) |

  `statusBadge(status)` và `paymentBadge(paymentStatus)` trong `js/ui.js` tạo badge từ trạng thái API, nhãn lấy từ `ORDER_STATUS`.
  **Mác vai cạnh tên** (thanh trên máy quầy `.pos-user .user-name` và trang Tài khoản) dùng chung `ROLE_BADGE` / `ROLE_LABEL` (`js/roles.js`): Nhân viên `.badge` trung tính, Trưởng ca `.ok`, Quản lý cửa hàng `.preparing`, Chủ quán `.primary` (chỉ ở trang Tài khoản — chủ quán không đứng quầy, F-084); nhân viên thử việc thêm `.badge.pending` "Thử việc" (08/11/2026: trước đó máy quầy không có mác cho nhân viên).
- `.tag`, `.tag.promo` (khách): nhãn nhỏ `0.72rem` trên tên món (khuyến mãi, "Bán chạy") — viền tóc góc 4 px, chữ phụ (khuyến mãi: chữ đỏ, viền `#efc9c3`), không tô nền (ADR-042). `.pill` (quản lý): nhãn trong bảng.

### Thẻ (card)

**Màn khách (ADR-042 D-193, sửa theo D-195):** mỗi món là **thẻ trắng** (`.c-item`: nền `--c-surface`, viền `--c-border`, bo 14 px, bóng rất nhẹ, cách nhau 10 px; rê chuột → viền `--c-input-border`), ảnh 72 × 72 px góc 10 px chỉ khi có ảnh thật (không ô chữ cái); lớp phủ `.c-name-btn::after` trùm cả thẻ → bấm vào đâu cũng mở bảng chọn, còn `.c-control`, `.fav-btn`, "Chọn size / tùy chọn ›" (`.link-btn`, màu `--c-primary`, không xuống dòng) nằm trên lớp phủ. Nút "+" (`.add-btn`) tròn đặc `--c-primary` 44 px, biểu tượng trắng nét 2,25; số trong giỏ (`.qty-badge`) là chấm số espresso viền trắng gắn góc trên phải nút "+" (không nhận bấm). Nhãn `.tag` nền `--c-primary-50` chữ `--c-primary` (khuyến mãi: nền / chữ đỏ). **Bề ngang:** `body.customer` đặt `--page` (720 px; ≥ 1024 px: 1040 px) và `--gutter` → đầu trang, thanh nhóm món, thực đơn cùng một cột; ≥ 1024 px thẻ món xếp 2 cột (`.c-section` dạng lưới, tiêu đề / ưu đãi / "Lần trước bạn gọi" trải hết hàng); thanh giỏ nền `--c-primary`, rộng tối đa 560 px, nằm giữa. **Ô mời nhập SĐT** (`.member-box.invite`, giỏ + theo dõi đơn — chủ dự án 08/11 muốn khách dễ thấy) là điểm nhấn duy nhất có nền màu ở màn khách: nền `--c-primary-50`, viền `#e3c9b3` (rê chuột → `--c-primary`), quà trong vòng tròn đặc `--c-primary` 40 px, tiêu đề đậm 700, "10%" đậm `--c-primary`, dấu "Nhận ngay ›" là viên tròn `--c-primary` chữ trắng nằm dưới chữ (cả thẻ là nút; không chiếm bề ngang chữ ở 320 px); "3–8%" không ngắt dòng. Thẻ đơn (`.order-card`), ô hội viên đã gắn (`.member-box.on`, nền xanh nhạt), "Lần trước bạn gọi" (`.recall-card`), thẻ ưu đãi (`.promo-card`), hộp thông tin (`body.customer .alert.info`) đều nền trắng viền tóc — bỏ viền gạch caramel / nền vàng / nền xanh dương. **Đầu bảng chọn món** (`.item-sheet-head`, sửa 09/11/2026): có ảnh thật → `.has-photo` xếp ngang, ảnh `.item-photo` vuông 112 × 112 px góc `--radius`, `object-fit: cover`, bên phải là `.item-head-info` (giá, nhãn khuyến mãi, thành phần combo xếp dọc); không ảnh → chỉ giá. Ảnh món nên cắt vuông sẵn, món ở giữa (ảnh mẫu `public/img/mon/` 640 × 640). Bỏ ảnh rộng cả bảng tỉ lệ 16 : 10 — cắt lệch món và đẩy chân bảng xuống.

`.card` (nền `--c-surface`, viền 1 px, `--radius`, `padding: 1.05rem 1.1rem`, **không bóng**). **Độ nổi khai báo một lần** (ADR-013 D-56): thẻ ở quầy / quản lý phẳng có viền; thẻ món của khách (`.c-item`) viền mảnh + bóng rất nhẹ, thẻ đơn (`.order-card`) viền không bóng; lớp nổi (hộp thoại, ngăn kéo, sheet, toast, thanh giỏ) có bóng; phiếu đơn / ô món quầy chỉ nổi bóng khi rê chuột. **Không vạch màu dày một bên, không vạch nhấn dày trên góc bo** (trước 23/10 có ở phiếu đơn, cột bảng đơn, ô món, KPI, khung duyệt, thanh bên quản lý). Bảng đơn quầy: mỗi cột (`.column.col-pending` / `col-preparing` / `col-completed`) đặt biến `--col` (`--c-warning-text` / `--c-info` / `--c-success`) cho chấm + chữ tiêu đề và ô đếm (chữ trắng), nền tô nhạt `#fbf1df` / `#edf2f8` / `#ecf3ec` (chữ trên nền ≥ 5,6:1); phiếu đơn `.ticket` có chấm trạng thái (`--dot`) trước tên bàn. Khung cần duyệt `.approval`: nền `--c-warning-50` bo góc. Biến thể theo khu vực: `.order-card` (khách — đơn trong phiên; `.completed` viền xanh, `.cancelled`), `.ticket` (quầy — phiếu đơn trong cột), `.pay-card` (dải Gọi thanh toán), `.call-card` (gọi nhân viên), `.split-card` (chia bill; `.selected`), `.kpi`, `.today-card`, `.qr-card`, `.promo-card`, `.recall-card`.

### Modal, drawer, sheet

Một hàm `modal({ title, body, actions, drawer, sheet, dismissable, onClose })` trong `js/ui.js` tạo cả ba dạng:

| Dạng | Class | Kích thước | Dùng cho |
| --- | --- | --- | --- |
| Hộp thoại giữa màn hình | `.overlay` + `.modal` | rộng `min(520px, 100%)`, cao tối đa `100vh − 2rem` | Xác nhận, sửa món, mở ca |
| Ngăn kéo bên phải | `.drawer-overlay` + `.drawer` | rộng `min(560px, 100%)`, cao 100 % | Chi tiết đơn (SCR-11), Thu tiền bàn (SCR-14) |
| Sheet trượt từ dưới | `.sheet-overlay` + `.sheet` | rộng `min(640px, 100%)`, cao tối đa `92vh`, chừa `safe-area-inset-bottom` | Giỏ hàng (SCR-03), tùy chọn món, chia bill, Thẻ thành viên |

**Chuyển động + thao tác (ADR-042 D-191):** `.modal` mờ + phóng nhẹ khi mở (`--dur-2`), `.sheet` trượt lên từ đáy (`--dur-3`, `--ease-sheet`), `.drawer` trượt từ phải. **Đóng:** hộp thoại thôi là `dialog` ngay (bỏ `role`, `aria-modal`, mọi `id`; `inert`, `aria-hidden`), rồi được gỡ khỏi trang trong `document.startViewTransition` — ảnh chụp của khung trượt xuống (sheet) / sang phải (ngăn kéo) / lùi ra (hộp thoại), lớp phủ mờ đi (`::view-transition-old(vt-dialog | vt-scrim)`, chọn kiểu theo `html[data-vt-leave]`); không hỗ trợ / giảm chuyển động / đang có hộp thoại khác đóng → gỡ ngay; đường lùi 600 ms. **Sheet có tay nắm** (`.sheet-grabber`, trang trí) — kéo tay nắm / đầu bảng xuống > 90 px hoặc vuốt nhanh (> 0,6 px/ms) thì đóng, ít hơn thì bật về (`dragToDismiss` trong `ui.js`). Đóng xong focus trở về nút đã mở hộp thoại. `modal({ foot })` nhận chân hộp thoại tự dựng thay hàng nút `actions` — bảng chọn món dùng: số lượng + "Thêm vào giỏ · tổng" trên một hàng, không còn nút "Hủy" / dòng "Giá 1 phần".

Hành vi chung: `role="dialog"`, `aria-modal="true"`, `aria-label` = tiêu đề; nút "×" có `aria-label="Đóng"`; Esc hoặc bấm ra ngoài thì đóng (trừ khi `dismissable: false`); khi mở, focus vào ô nhập / nút chính đầu tiên. Chưa giữ focus trong hộp thoại (focus trap); đã trả focus khi đóng (ADR-042). `confirmDialog(title, message, { okLabel, danger })` là hộp xác nhận hai nút ("Hủy" / nút đồng ý — đỏ nếu `danger`).

### Toast, alert, banner

- `toast(message, type = 'info', ms = 3500)`: hộp `.toasts` ở giữa đáy màn hình (rộng tối đa `min(440px, 100% − 2rem)`, thông báo co theo chữ), `role="status"`, `aria-live="polite"`. Kiểu ADR-042 D-192: nền mực, chữ trắng đậm 500, góc 12 px; `success` thêm dấu ✓ (`circle-check`, xanh sáng `#9fd8b0`); `error` nền `--c-danger`, `warning` nền `--c-warning-text`. **Tối đa 3** — cái cũ nhất lùi ra khi có cái thứ 4; vào / ra có hiệu ứng (`toast-in` / `.leaving`). Màn khách **không dùng thông báo cho việc thành công thường ngày** (thêm món, sửa món trong giỏ): phản hồi ngay tại chỗ + `announce(message)` (vùng `#live-status` chỉ cho trình đọc màn hình).
- `.alert` + `info` / `success` / `warning` / `danger`: thông báo trong trang hoặc trong hộp thoại. Lỗi API hiển thị bằng `el('div', { class: 'alert danger' }, errorMessage(err))`. Hiện `.alert` **không** có `role="alert"`.
- `.banner` (dính đầu trang): `.offline` (đỏ — "Mất kết nối…"), `.late` (cảnh báo — "Có đơn hàng bị trễ…"), `.closed` (khách — quán tạm ngưng nhận đơn, có `role="status"`).
- `.conn` (quầy): chấm xanh "Đã kết nối" / chấm đỏ nhấp nháy "Mất kết nối".

### Form

- `label` khối, đậm 600, `0.9rem`; `.field` bọc nhãn + ô.
- `.input` (cả `select`, `textarea`): `min-height: 40px`; focus đổi viền `--c-accent` + vòng `0 0 0 3px rgba(217,140,59,.2)`.
- Lỗi theo trường: `.input.invalid` (viền + nền đỏ nhạt) và `.field-error` (chữ đỏ `0.85rem`) ngay sau ô. `showFieldErrors(form, err)` gắn lỗi theo `err.details.fields[].path` của API (`400 VALIDATION_ERROR`) vào ô có `name` trùng.
- `.check`: checkbox + chữ trên một dòng. `.switch` (quản lý): công tắc 44 × 24 px, tạo bằng `toggle(checked, onChange, label)` (có `aria-label`).
- `moneyInput()` / `moneyValue()` / `setMoney()`: ô tiền tự chèn dấu chấm hàng nghìn theo `vi-VN`.

### Bảng

`.table-wrap` (cuộn ngang khi hẹp, viền, `--radius`) bọc `table.table` (rộng 100 %, `border-collapse`). Tiêu đề cột: IN HOA, `--c-muted` trên `--c-surface-2`. Cột số: `.num`. Biến thể: `table.cash-book` (sổ quỹ — `td.neg` đỏ, dòng `.muted` mờ 60 %).

### Tab

- Quản lý: `.tabs` (`admin.css`) — hàng nút gạch chân, nút đang chọn có `aria-selected='true'` (màu `--c-primary`). Một số trang gắn `role="tab"` (ví dụ `admin-analytics.js`, `admin-cash.js`).
- Khách: `.c-tabs` — hàng `.chip` cuộn ngang theo danh mục / Ưu đãi / Gợi ý / Combo.

### Trạng thái chung

| Class | Dùng cho |
| --- | --- |
| `.skeleton` | Khung xám nhấp nháy khi tải (SCR-02, SCR-05) |
| `.c-loading` + `.spinner` | Vòng quay 34 px ở SCR-01 ("Đang mở thực đơn…") |
| `<p class="muted">Đang tải…</p>` | Chữ chờ có sẵn trong HTML của mọi trang quầy / quản lý |
| `.empty` | Khối rỗng căn giữa, chữ `--c-muted` |
| `.thumb` | Ảnh món 64 × 64; không có ảnh thì hiện chữ cái đầu (`thumb(name, imageUrl)`) |
| `.kv`, `.minus`, `.total` | Dòng breakdown tiền do server tính (`breakdownRows(lines)`); dòng giảm màu xanh |

### Trang in (`css/print.css`)

`.receipt` rộng `var(--w)` (80 mm mặc định, 58 mm khi chọn), chữ `--mono` 12 px; `body.receipt-page` đặt lại `--font` / `--font-display` về phông hệ thống (trang tự in sau 150 ms, không chờ web font — TASK-065), nền trắng chữ đen. Khổ giấy đặt động bằng `@page { size: <w>mm auto; margin: 0 }` ghi vào thẻ `#page-size`, lựa chọn khổ nhớ theo máy. Thanh công cụ `.receipt-toolbar.no-print` ẩn khi in (`.no-print { display: none }` trong `@media print`). Phiếu tạm tính có watermark "TẠM TÍNH" (`.watermark`, `aria-hidden`) và tiêu đề "PHIẾU TẠM TÍNH"; bill đã thu có tiêu đề "HÓA ĐƠN THANH TOÁN". Trang in QR bàn (`admin/qr-print.html`) và đơn đặt hàng (`admin/po-print.html`, `.po-print`) dùng `@media print` trong `admin.css`.

## Chuyển động (ADR-042 D-191)

| Chỗ | Hiệu ứng | Thời lượng / đường cong |
| --- | --- | --- |
| Nút `.btn`, `.add-btn`, `.c-choice` | Lún nhẹ khi bấm (`scale` 0.98 / 0.92 / 0.99) | `--dur-1`, `--ease-out` |
| Hộp thoại / sheet / ngăn kéo | Vào: mờ + phóng / trượt lên / trượt ngang; ra: trên ảnh chụp View Transition | vào `--dur-2` / `--dur-3` (`--ease-sheet`); ra `--dur-2`, `--ease-in` |
| Sheet | Theo ngón tay khi kéo tay nắm; bật về nếu thả sớm | `--dur-2`, `--ease-out` |
| Thông báo | Nhích lên + hiện dần; ra mờ dần | `--dur-2` / `--dur-1` |
| Thanh nhóm món khách | Vạch đồng trượt + giãn tới nhóm đang chọn | `--dur-3`, `--ease-out` |
| Thanh giỏ khách | Trượt lên khi hiện; nảy `scale(1.03)` khi thêm món | `--dur-3` |
| Số trong giỏ trên dòng món | Bật ra (`badge-pop`) mỗi lần đổi | `--dur-2` |
| Dòng giỏ vừa sửa | Nền `--c-primary-50` nhạt dần | 1,2 s |
| Bước tiến trình đơn | Đổi màu vạch / chữ | `--dur-3` |

**Không dùng (đã thử, ghi ở ADR-042):** View Transitions giữa các trang (`@view-transition { navigation: auto }` — Chromium 156 hủy ở trang mới, báo lỗi trang) và hiện dần nội dung khi mở trang (làm Chrome hoãn khung hình đầu). Chuyển trang dựa vào việc trình duyệt giữ khung hình trang cũ tới khi trang mới sẵn sàng. **Giảm chuyển động** (`prefers-reduced-motion: reduce`): tắt mọi hiệu ứng trên; `reducedMotion()` trong `ui.js` cho JS biết để đóng hộp thoại ngay, không nảy thanh giỏ, cuộn tới nhóm món không mượt.

## Vùng chạm (touch target)

Lấy từ CSS khai báo (chưa đo trên trang đã render — xem NFR-A11Y-05):

| Thành phần | Kích thước |
| --- | --- |
| `.btn-lg`, nút giỏ nổi khách | cao 52 px / 56 px |
| `.btn` ở quầy và khách, `.add-btn`, `.tabs button`, nhóm món khách | cao 44 px (`.add-btn` 44 × 44) |
| `.btn` ở quản lý, `.input` | cao 42 px |
| `.stepper button`, `.icon-btn`, `.stars .star`, mục menu quầy | 40 × 40 px |
| `.qty-ctl button`, `.line-edit`, `.reason-chips .chip`, `.chip` | 38 px |
| `.btn-sm`, `.ta-line .input` | cao 36 px |
| `.schedule-targets select` (quản lý), `.split-move` (quầy) | cao 30 px / 28 px — giữ như trước TASK-065, nhỏ nhất trong các control đã khai báo kích thước |
| `.switch` | 44 × 24 px |

Theo ADR-012 D-54: nút thường ở quầy và khách ≥ 44 px (WCAG 2.5.5 / Apple HIG 44 pt), nút nhỏ ≥ 36 px; mọi control vẫn ≥ 24 × 24 px (WCAG 2.5.8). Nút có `touch-action: manipulation` để bỏ độ trễ chạm đúp trên điện thoại.

## Breakpoint

Khách thiết kế mobile-first một cột, **không có media query**; bề rộng giới hạn bằng `max-width`: `.c-menu` / `.c-track` 720 px, `.c-entry` 480 px, nút giỏ nổi 640 px, `.sheet` 640 px.

| File | Điều kiện | Thay đổi |
| --- | --- | --- |
| `pos.css` | `max-width: 1100px` | `.pos-main` từ 2 cột (nội dung + 300 px bàn) → 1 cột |
| `pos.css` | `max-width: 960px` | `.takeaway` (lưới món + giỏ) → 1 cột |
| `pos.css` | `max-width: 820px` | `.board` 3 cột (Mới / Đang pha / Đã xong) → 1 cột |
| `pos.css` | `max-width: 800px` | `.pos-page .grid-2` → 1 cột |
| `admin.css` | `max-width: 1000px` | `.grid-2`, `.me-grid` (menu engineering) → 1 cột |
| `admin.css` | `max-width: 860px` | `.admin-layout` (thanh bên 236 px dính khi cuộn, cao 100vh + nội dung) → 1 cột; thanh bên thành thanh ngang xuống dòng, hết dính |
| `admin.css` | `max-width: 700px` | `.receipt-row` (dòng phiếu nhập) → 2 cột |
| `admin.css` | `max-width: 480px` | `.admin-main` lề 16 px, đầu trang xuống dòng (SCR-42 trên điện thoại) |
| `print.css`, `admin.css` (2 chỗ), `pos.css` | `@media print` | Ẩn `.no-print`, thanh điều hướng (`.pos-top`, `.admin-side`), banner, toast khi in |

Khung thiết kế đã kiểm bằng E2E: điện thoại 390 × 844 (khách, SCR-42), máy tính 1366 × 860 (quầy, quản lý). Yêu cầu viewport đích: [nfr.md](../sản-phẩm/nfr.md) nhóm Compatibility.

## Biểu tượng (ADR-013 D-55)

Một bộ biểu tượng SVG vẽ cùng nét, thay emoji / ký tự Unicode (trước 23/10/2026 hình và màu emoji phụ thuộc hệ điều hành). Hình chép từ [Lucide](https://lucide.dev) (giấy phép ISC — ghi ở đầu `js/icons.js`), không thêm dependency.

- `icon(name, { label, filled })` trong `js/icons.js` tạo `<svg class="ic ic-<name>">` (viewBox 24, nét 2 px theo `currentColor`, cỡ `1.15em`, cách chữ `0.35em`). Mặc định `aria-hidden` vì luôn đi kèm chữ; biểu tượng đứng một mình truyền `label` → `role="img"` + `aria-label` (ví dụ dấu ✓ trong ô bảng: "Có", "Đủ", "Đã thu"). `filled: true` tô đặc (sao đã chọn, tim đã thích, nhà cung cấp ưu tiên).
- `brandMark()`: dấu hiệu quán — tách cà phê trong vòng tròn `--c-accent-100` — trước tên quán ở thanh quầy, thanh bên quản lý, bản "Hôm nay".
- Trang tĩnh (`index.html`, `404.html` — kính lúp, `pos/login.html`, `pos/table-order.html`) chèn SVG cùng hình trực tiếp.
- `icon()` tự đặt thuộc tính mặc định như Lucide (`fill="none" stroke="currentColor" stroke-width="2"`, 24 × 24) nên vẫn vẽ đúng khi thiếu `base.css`; CSS `.ic` ghi đè cỡ / màu.
- Biểu tượng mang nghĩa mà chữ bên cạnh không nói có `label`: sao trước tên khách → "Hội viên", sổ ghi chú → "Ghi chú", tim trong dải món yêu thích → "Đã thích".

| Biểu tượng | Ý nghĩa | Ở đâu |
| --- | --- | --- |
| `coffee` | Dấu hiệu quán, màn cảm ơn | Thanh quầy / quản lý, đăng nhập, trang chủ, vào bàn (SCR-01) |
| `star` (rỗng / đặc) | Hội viên; chấm sao; nhà cung cấp ưu tiên | Ô hội viên, quầy, báo cáo; màn đánh giá; menu khách; nhà cung cấp |
| `ticket`, `stamp`, `gift`, `award` | Voucher, thẻ tem, quà đổi điểm, điểm | Thẻ thành viên, khung hội viên quầy, quản lý hội viên |
| `sparkles` | Kết quả vòng quay may mắn — **không** dùng trước tiêu đề nhóm món nữa (ADR-042 D-194: tiêu đề "Gợi ý cho bạn", "Ưu đãi hôm nay", "Combo" là chữ) | Trang vòng quay |
| `timer` | Thời gian chờ | Giỏ, theo dõi đơn |
| `receipt` | Chia bill / ảnh hóa đơn | Theo dõi đơn, quầy, sổ quỹ |
| `hand` | Gọi nhân viên | Theo dõi đơn, dải quầy |
| `bell-ring` | Gọi thanh toán | Dải quầy |
| `volume-2` / `volume-x` | Âm thanh bật / tắt | Thanh quầy |
| `notebook-pen` | Ghi chú bàn | Gọi món tại bàn, quầy |
| `heart` (rỗng / đặc) | Món yêu thích; cảm ơn đã đánh giá | Menu khách; màn cảm ơn |
| `triangle-alert`, `wifi-off` | Cảnh báo ("Chưa mở ca", đánh giá thấp, mã bàn sai), lỗi mạng | Quầy, SCR-01 |
| `corner-down-right` | Chuyển từ bàn khác | Panel bàn quầy |
| `printer` | In QR | Bàn & mã QR |
| `check`, `circle-check`, `x`, `pencil`, `party-popper`, `arrow-up` / `arrow-down`, `chevron-right`, `plus` | Đạt / có / không có việc tồn, dấu ✓ trong thông báo thành công; bỏ dòng, đóng hộp thoại; sửa món; món đã xong; đổi thứ tự ghim; mở ô hội viên; nút "+" thêm món của khách (ADR-042) | Nhiều nơi |
| `house`, `chart-column`, `utensils-crossed`, `package`, `users`, `wallet`, `settings`, `chevron-down`, `monitor`, `log-out` | Menu quản lý: Hôm nay, 6 nhóm, mũi tên nhóm, sang màn quầy, đăng xuất | Thanh bên quản lý (D-58) |

Giữ dạng chữ: ký hiệu trong số liệu (`5★`, "Bạc xỉu 4★" trong bảng đánh giá / dải quầy), mũi tên trong câu (`▲ ▼ → ←`) và ký tự trong nhãn chữ của nút / link ("+ Thêm …", "← Về …", "Sau ›"). Biểu đồ (lãi / lỗ, phân tích, dự báo) là SVG vẽ bằng JS (`svg.chart`), không dùng thư viện biểu đồ.

## Định dạng tiếng Việt (`js/ui.js`)

Mọi hàm dùng locale `vi-VN` và múi giờ `Asia/Ho_Chi_Minh` (UTC+7). DB lưu UTC.

| Hàm | Kết quả | Ví dụ |
| --- | --- | --- |
| `money(n)` | Làm tròn số nguyên, dấu chấm hàng nghìn, hậu tố `đ` | `95.000đ` |
| `num(n)` | Tối đa 3 chữ số thập phân, dấu phẩy thập phân | `1,5` |
| `time(d)` | Giờ:phút | `14:05` |
| `dateTime(d)` | Giờ:phút ngày/tháng/năm | `14:05 20/10/2026` |
| `dateOnly(d)` | Ngày/tháng/năm (hạn voucher, lịch sử điểm) | `20/10/2026` |
| `todayVn()` | Ngày quán dạng ISO cho bộ lọc | `2026-10-20` |
| `elapsed(from)` | Thời gian đã chờ: dưới 1 giờ `phút:giây`, từ 1 giờ `h giờ mm phút` | `3:05`, `1 giờ 05 phút` |
| `voucherValue(v)` | Giá trị voucher | `−10% (tối đa 50.000đ)`, `−20.000đ` |
| `moneyInput()` | Ô nhập tiền tự định dạng khi gõ | `150.000` |

Nhãn trạng thái đơn tiếng Việt lấy từ `ORDER_STATUS` (xem bảng badge). Trang khách có nhãn riêng (`CUSTOMER_STATUS` trong `js/customer.js`).

## Âm thanh (quầy)

`playSound(kind)` dùng Web Audio, không cần file: `ting` (đơn mới), `chime` (chuông 3 nốt — gọi thanh toán), `bell` (gọi nhân viên). Trình duyệt chặn tự phát nên nhân viên phải bấm "🔇 Bật âm thanh" một lần (hoặc âm thanh tự mở ở lần chạm đầu).

## Quy tắc khi sửa giao diện

- Dữ liệu người dùng chỉ chèn qua `el()` / `clear()` (dùng `textContent`), không dùng `innerHTML` (chống XSS — NFR-SEC-08).
- Số tiền hiển thị luôn lấy từ breakdown do server tính; FE không tự tính tiền (`.agent/rules.md`).
- Thêm màu mới thì thêm token vào `:root` của `base.css`, và kiểm tương phản theo NFR-A11Y-06 (PROPOSED).
- Chữ trên nền tối dùng màu đặc (`--c-on-dark`, `--c-on-dark-muted`), không dùng `opacity`: kiểm tra tự động bỏ qua phần tử mờ nên sẽ không bắt được lỗi tương phản.
- Nền gradient chỉ đặt ở lớp trang trí (khung đăng nhập, ảnh món, lớp mờ dưới thanh giỏ); chữ luôn nằm trên nền màu đặc để kiểm tra tự động đo được.
- Biểu tượng: chỉ dùng `icon()` / SVG trong `js/icons.js`, không dùng emoji; biểu tượng đứng một mình phải có `label` (ADR-013 D-55).
- **Bề mặt trình duyệt** theo bảng màu (ADR-013 D-56): `::selection` nền `--c-accent-100`; `accent-color` / `caret-color` `--c-primary`; `scrollbar-color` `#94795a` (thanh bên tối `#9a7d62`) — ≥ 3:1 với nền; link gạch chân cách chữ `0.2em`, dày 1 px (rê chuột 2 px).
- **Giảm chuyển động** (`prefers-reduced-motion: reduce`): bỏ hiệu ứng mở / đóng hộp thoại / ngăn kéo / sheet / thông báo, nhấp nháy "Mất kết nối", shimmer khung chờ, lún nút (`.btn`, `.add-btn`, `.c-choice`, ô món quầy), xoay mũi tên nhóm menu, đổi màu nút nhóm món, thanh giỏ trượt / nảy, số trong giỏ bật ra, dòng giỏ sáng; hộp thoại đóng là gỡ ngay (`reducedMotion()`); bấm tab danh mục khách thì nhảy thẳng tới nhóm món thay vì cuộn mượt; dải "Gọi thanh toán" và đơn mới dùng vòng viền tĩnh thay nhịp đập / bật nảy. Vòng quay chờ vẫn quay (là phản hồi đang tải).
- Bộ dò Impeccable (`npx impeccable@4.7.0 detect <thư-mục public>`, chạy từ thư mục ngoài repo vì `npx` lỗi với đường dẫn có `&`) không được báo `side-tab`, `border-accent-on-rounded`, `cream-palette` — ngoại lệ nền kem (ADR-013 D-57) đã bỏ ở ADR-042; lần quét 08/11/2026 (77 tệp CSS / JS): 0 phát hiện. `cramped-padding` ở `po-print.html` là báo nhầm (trang in bỏ lề, lề giấy thay).
- **Không AI hóa (ADR-042 D-194):** không biểu tượng trang trí trước tiêu đề; không ô chữ cái thay ảnh ở màn khách; không gradient / vầng sáng / kính mờ ở phần mới; không hộp viền gạch kiểu phiếu giảm giá; một màu nhấn (đồng); chữ đậm có chủ đích (tên món 500, giá 400); thành công thường ngày phản hồi tại chỗ, không bằng thông báo.
