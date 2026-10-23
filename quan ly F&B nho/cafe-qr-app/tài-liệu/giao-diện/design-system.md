# Design system — bước 09

> **Nguồn:** CSS và JS thật trong `ứng-dụng/giao-diện/public/` (`css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`, `css/print.css`, `js/ui.js`, `js/admin-shell.js`), đối chiếu ngày 20/10/2026; **cập nhật 23/10/2026 theo chủ đề "Mộc"** ([ADR-012](../quyết-định/ADR-012-giao-dien-moc.md), [TASK-065](../công-việc/TASK-065.md)). **Trạng thái tài liệu:** BẢN NHÁP — chờ chủ dự án duyệt ở Gate G2. Mọi giá trị dưới đây **lấy từ code**. Phần nào chỉ là đề xuất thì ghi PROPOSED.

FE là HTML/CSS/JS thuần, không framework, không thư viện UI (ADR-002, D-4). Phông chữ tự lưu trong `public/fonts/` (ADR-012 D-53). Mỗi khu vực gắn một class trên `<body>` và nạp `base.css` cùng một file riêng:

| Khu vực | `<body>` | CSS | Thiết bị chính |
| --- | --- | --- | --- |
| Khách | `body.customer` | `base.css` + `customer.css` | Điện thoại |
| Quầy (POS) | `body.pos` | `base.css` + `pos.css` | Máy tính / tablet ở quầy |
| Quản lý | `body.admin` | `base.css` + `admin.css` | Laptop; riêng SCR-42 dùng cả điện thoại |
| Trang in | `body.receipt-page` | `base.css` + `print.css` | Máy in nhiệt 58 / 80 mm |

Màn hình và route: [sitemap.md](sitemap.md). Trạng thái giao diện từng màn: [screens-flows.md](screens-flows.md#ui-states). Yêu cầu khả năng tiếp cận: [nfr.md](../sản-phẩm/nfr.md) (nhóm Accessibility).

## Token (`:root` trong `css/base.css`)

### Màu — chủ đề "Mộc" (ADR-012 D-52)

Ý tưởng lấy từ tên quán "Cà phê Mộc" và nghiên cứu bảng màu quán cà phê (nguồn trong ADR-012): **espresso** (chữ, thanh tối), **nâu rang** (màu chính), **kem sữa** (nền), **caramel** (màu nhấn duy nhất), **xanh lá** (thành công — gợi "mộc", tự nhiên). Giá trị trước 23/10/2026 ghi trong ngoặc.

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--c-bg` | `#f6efe5` kem sữa (`#f7f3ef`) | Nền trang (khách, quản lý) |
| `--c-surface` | `#fffdf9` (`#ffffff`) | Nền thẻ, modal, nút thường, ô nhập |
| `--c-surface-2` | `#f0e6d8` bọt latte (`#f2ece6`) | Nền hover nút, tiêu đề bảng, badge mặc định |
| `--c-border` | `#e2d3bf` (`#e4dad0`) | Viền thẻ, nút, dòng bảng |
| `--c-text` | `#2a1b12` espresso (`#2b2118`) | Chữ chính |
| `--c-muted` | `#68533f` (`#6f6053`) | Chữ phụ (`.muted`), tiêu đề bảng, nút biểu tượng |
| `--c-primary` | `#7a4527` nâu rang (`#8a4b2a`) | Nút chính, link, chip đang chọn, nút "+", giá món |
| `--c-primary-600` | `#5f341c` (`#733d21`) | Hover nút chính |
| `--c-primary-50` | `#f5e9dc` (`#f6ebe4`) | Nền badge `primary`, nền ảnh thu nhỏ, stepper |
| `--c-accent` | `#c8873f` caramel (`#d98c3b`) | Viền nhấn (đầu trang khách, thanh quầy, thanh bên quản lý, vạch trên thẻ KPI), viền chip khi rê chuột, biểu đồ — không làm nền có chữ trắng |
| `--c-accent-600` | `#8c5220` (`#9d5a1a`) | Nền có chữ trắng: mục menu đang chọn (quầy, quản lý) — 6,28:1 |
| `--c-accent-100` | `#f3dcb8` (mới) | Nền có chữ espresso: số món trên thanh giỏ khách — 13,07:1 |
| `--c-focus` | `#8c5220`; trên nền tối đặt lại `--c-focus-dark` | Viền `:focus-visible` (≥ 3:1 với nền — WCAG 1.4.11) |
| `--c-espresso` / `--c-espresso-2` | `#24170f` / `#33231a` (mới; trước dùng thẳng `#2b2118`) | Nền tối: `.c-header` (khách), `.pos-top`, `.admin-side`, toast mặc định, nút giỏ nổi / nút trên nền tối |
| `--c-on-dark` / `--c-on-dark-muted` | `#eadccb` / `#cdb59a` (mới; trước `#e9dccf` + `opacity`) | Chữ / chữ phụ trên nền espresso — 12,95:1 / 8,86:1 |
| `--c-focus-dark` | `#ffd38a` | Viền focus trên nền espresso — 12,40:1 |
| `--c-success` / `--c-success-50` | `#2f6a45` xanh lá / `#e6f0e6` (`#2b7349` / `#e6f3eb`) | Nút / badge / alert / toast thành công; cột "Đã xong"; chấm "Đã kết nối" |
| `--c-warning` / `--c-warning-50` | `#b7791f` / `#fbf0dc` (`#fdf3e1`) | Viền / biểu đồ cảnh báo (không dùng làm màu chữ) |
| `--c-warning-text` | `#85550f` (`#8f5d12`) | Chữ cảnh báo, ghi chú món / ghi chú bàn ở quầy (thay `#b4530a` — review G3), cột "Mới" của quầy, nền banner "đơn trễ" / toast cảnh báo có chữ trắng |
| `--c-danger` / `--c-danger-50` | `#b3261e` / `#fbeae6` (`#b42318` / `#fdecea`) | Nút xóa, lỗi, banner mất kết nối, ô nhập sai |
| `--c-info` / `--c-info-50` | `#2c5d88` / `#e6eef6` (`#2563a8` / `#e8f0fa`) | Badge `preparing`, cột "Đang pha", alert thông tin, dải "gọi nhân viên" |

### Màu dữ liệu biểu đồ (ADR-015 D-60 — chủ dự án chọn)

Chỉ tô nét / cột / điểm, **không làm màu chữ** (nhãn, số, chú thích dùng `--c-text` / `--c-muted`). Thứ tự cố định, không xoay vòng.

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--viz-1` | `#3a9efd` xanh | Doanh thu thuần (Lãi / lỗ, Báo cáo), đường thực tế ở Dự báo |
| `--viz-2` | `#f7a400` cam | Giá vốn (Lãi / lỗ); đường dự báo nét đứt + dải ± 1 độ lệch chuẩn + điểm dự báo |
| `--viz-3` | `#1a1b4b` tím đen | Chi phí (Lãi / lỗ); vạch "Hôm nay" ở Dự báo |
| `--viz-grid` / `--viz-axis` | `#ece3d7` / `#c9b8a2` | Lưới mảnh / đường gốc 0 |

Validator dataviz trên nền thẻ `#fffdf9`: phân biệt mù màu ΔE 29,3, mắt thường ΔE 34,7 (đạt); xanh 2,76 : 1, cam 2,01 : 1 với nền (< 3 : 1) → luôn có bảng số liệu + hộp số liệu khi rê chuột / bàn phím. Đồ nghề chung: `js/chart-kit.js` (`svg`, `niceScale`, `compact`, `barPath`, `attachHover`). Nét vẽ: cột ≤ 24 px bo đầu 4 px chân vuông, khe 2 px; đường 2 px; điểm 8 px viền nền 2 px; ngưỡng (hòa vốn) nét đứt màu mực; nhãn trục ngày thưa (≤ 16 nhãn / dự báo mỗi 7 ngày) để không chồng chữ. Hộp số liệu: nền espresso, chữ `--c-on-dark` / trắng `#fff`, viền ô màu `rgba(255, 255, 255, 0.5)`. Lãi / lỗ kỳ dài (> ~45 kỳ) đổi sang 3 đường. Màn hẹp: biểu đồ giữ ≥ 80 % cỡ thiết kế, cuộn ngang trong khung. Biểu đồ cũ (giờ cao điểm, menu engineering, dự báo nhập hàng) giữ màu `.chart .bar` / `.grid` chung.

Màu cố định ngoài token (dùng trực tiếp trong CSS): viền alert / dải (`#efd5a6`, `#f1c4bc`, `#c3d5e8`, `#bcd8c0`), chữ alert cảnh báo `#7a4f10`, viền ô nhập `#d9c8b2`, viền thẻ "Lần trước bạn gọi" `#e8d3bd`, công tắc đang tắt `#c4af97`, nền / viền cột bảng đơn quầy (`#fbf1df` / `#efd9b4`, `#edf2f8` / `#cfdcea`, `#ecf3ec` / `#cadfcd`), viền phiếu đơn khi rê chuột `#d5c2aa`, thanh cuộn `#94795a` (nền sáng) / `#9a7d62` (thanh bên tối) — ≥ 3:1, hover dòng bảng `#fbf6ef`, hover nút trên nền tối `#45311f`, nền `body.pos` `#efe6da`, nền ảnh món khách (dải `#f4e4d0` → `#e7d0b3`), nền đăng nhập (espresso → `#4a2a17` + vầng sáng caramel), nền trang in `#e9e4de`, chữ / viền ô màu trong hộp số liệu biểu đồ `#fff` / `rgba(255, 255, 255, 0.5)`, skeleton `#ece1d3` / `#f6efe5`, overlay `rgba(36, 23, 15, 0.5)`.

Tương phản (cập nhật 23/10/2026, ADR-012 — tính trước bằng công thức WCAG và kiểm tự động bằng `kiểm-thử/e2e/a11y.spec.js` trên trang thật): chữ chính / nền 14,55:1; `--c-muted` trên `--c-surface` 7,13:1 (trên `#fff` 7,25:1), trên `--c-surface-2` 5,87:1; chữ trắng / `--c-primary` 7,75:1; `--c-primary` trên `--c-primary-50` 6,49:1; menu đang chọn 6,28:1; badge `pending` 5,63:1; badge `completed` / `paid` 5,50:1; badge `preparing` 5,92:1; badge lỗi 5,61:1; banner "đơn trễ" 6,36:1; chữ trên nền espresso 12,95:1, nhãn nhóm thanh bên 8,86:1; viền focus 5,09–6,18:1 trên nền sáng, 12,40:1 trên nền tối. Lịch sử: 20/10/2026 (DEF-006) đã nâng `pending` từ 3,31:1, `completed` 4,41:1, menu đang chọn 2,70:1, viền focus 2,45:1 lên ≥ ngưỡng.

### Bo góc, bóng, phông

| Token | Giá trị | Dùng cho |
| --- | --- | --- |
| `--radius` | `14px` (`12px`) | `.card`, `.modal`, `.table-wrap`, ô món quầy (`.tile`, `.table-chip`); thẻ món / đơn khách dùng `16px` |
| `--radius-sm` | `10px` (`8px`) | `.btn`, `.input`, `.alert`, `.toast`, `.skeleton`; `.btn-lg` `12px`, nút giỏ nổi `16px` |
| (không token) | `999px` | Dạng viên thuốc: `.badge`, `.chip`, `.stepper`, `.switch`, mục menu quầy |
| (không token) | `22px 22px 0 0` (`18px`) | `.sheet` (bottom sheet khách) |
| (không token) | `12px` (`10px`); thẻ món khách `14px` | `.thumb` (ảnh món 64 × 64; trên menu khách 72 × 72) |
| `--shadow` | `0 1px 2px rgba(42,27,18,.05), 0 6px 18px -6px rgba(42,27,18,.12)` | Thẻ món / thẻ đơn khách, phiếu đơn và ô món quầy khi rê chuột, trang in (`.card` không còn bóng — ADR-013 D-56) |
| `--shadow-lg` | `0 18px 48px -12px rgba(42,27,18,.32)` | `.modal`, `.drawer`, `.sheet`, `.toast`, nút giỏ nổi, thẻ đăng nhập |
| `--font` | `'Be Vietnam Pro', system-ui, …` (`system-ui, …` — không tải web font) | Toàn bộ chữ giao diện — phông thiết kế cho dấu tiếng Việt (ADR-012 D-53) |
| `--font-display` | `'Lora', Georgia, 'Times New Roman', serif` (mới) | Tiêu đề có chân: `h1`, tên quán (đầu trang khách, thanh quầy, thanh bên quản lý), tiêu đề nhóm món, tiêu đề hộp thoại, chữ cái ảnh món, tên bàn trên thẻ QR |
| `--mono` | `ui-monospace, 'Cascadia Mono', Consolas, monospace` | `.mono`, hóa đơn in |

**Phông tự lưu** (`public/fonts/`, giấy phép `OFL-BeVietnamPro.txt`, `OFL-Lora.txt` — SIL OFL 1.1, lấy từ gói `@fontsource/be-vietnam-pro@5.3.0`, `@fontsource/lora@5.3.0`): Be Vietnam Pro 400 / 500 / 600 / 700 / 800, Lora 600 / 700; mỗi độ đậm hai tệp `.woff2` — phần latin và phần tiếng Việt, khai báo `unicode-range` nên trình duyệt chỉ tải phần cần (tổng 14 tệp, ≈ 230 KB). `font-display: swap`: chữ hiện ngay bằng phông hệ thống rồi đổi khi tải xong. Không gọi CDN — chạy được khi LAN của quán không có Internet.

Token cục bộ: `--w` (`print.css`: `80mm` / `58mm` — bề rộng hóa đơn), `--heat` (`admin.css`: độ đậm ô bản đồ nhiệt giờ cao điểm).

## Chữ (typography)

Không đặt cỡ chữ gốc cho `html`, nên `1rem` theo trình duyệt (thường 16 px). `body` đặt `font-size: 15px`, `line-height: 1.5` (`1.45` trước 23/10); `h1`–`h4` có `line-height: 1.25`, `margin: 0 0 0.5rem`, `letter-spacing: -0.01em`; `h1` dùng `--font-display` đậm 700.

| Vai trò | Cỡ / độ đậm | Ở đâu |
| --- | --- | --- |
| Tiêu đề trang | `1.65rem` quản lý, `1.6rem` khách, `1.55rem` đăng nhập — Lora | `.admin-head h1`, `.c-hero h1`, `.login-card h1` |
| Tiêu đề nhóm món (khách) | `1.25rem`, Lora 700, kèm đường kẻ mảnh | `.c-section h2` |
| Tiêu đề hộp thoại | `1.2rem`, Lora 700 | `.modal-head h2` |
| Tên quán | Lora: `0.95rem` (đầu trang khách), `1.15rem` (thanh quầy), `1.2rem` (thanh bên quản lý) | `.c-shop`, `.pos-top .brand`, `.admin-side .brand` |
| Tên bàn ở đầu trang khách | `clamp(1rem, 4.6vw, 1.2rem)`, đậm 800, tối đa 2 dòng (không cắt tên — review G3) | `.c-table` |
| Số lớn (KPI) | `1.65rem` (quản lý), `1.45rem` (quầy), `1.7rem` (`.today-card .big`) | `.kpi .value` |
| Ô nhập tiền | `1.4rem`, đậm 700 | `.money-input` (S-13, S-14) |
| Thân bài | `15px` | `body` |
| Nhãn form | `0.9rem`, đậm 600 | `label` |
| Nút | kế thừa, đậm 600; `.btn-sm` `0.875rem`; `.btn-lg` `1.05rem` | `.btn` |
| Chữ nhỏ | `0.85rem` | `.small`, `.field-error` |
| Tiêu đề cột bảng | `0.8rem`, IN HOA, `letter-spacing: 0.03em` | `.table th` |
| Badge | `0.78rem`, đậm 700 | `.badge` |
| Hóa đơn in | `12px`, `--mono`, `line-height: 1.35` | `.receipt` |
| Chữ trên biểu đồ SVG | `11px` (trục `10px`) | `svg.chart text` |

Cột số trong bảng (`td.num`, `th.num`) căn phải và dùng `font-variant-numeric: tabular-nums`.

## Khoảng cách

Chưa có token khoảng cách: CSS dùng trực tiếp giá trị `rem`. Các giá trị lặp lại: `0.25rem`, `0.4rem`, `0.5rem`, `0.75rem`, `0.85rem`, `1rem`, `1.25rem`.

| Mẫu | Giá trị |
| --- | --- |
| `.row` (flex ngang) | `gap: 0.5rem` |
| `.stack > * + *` (xếp dọc) | `margin-top: 0.75rem` |
| `.card` | `padding: 1rem` |
| `.field` (một ô form) | `margin-bottom: 0.85rem` |
| `.modal-head` / `.modal-body` / `.modal-foot` | `1rem 1.25rem 0.5rem` / `0.5rem 1.25rem 1rem` / `0.75rem 1.25rem 1.1rem` |
| `.table th, td` | `0.6rem 0.75rem` |
| `.admin-main` ở ≤ 480 px | lề ngang `16px` |

PROPOSED: gom thành token `--space-1…6` khi có task sửa CSS (không làm trong TASK-057).

## Thành phần (components)

### Nút

| Class | Mô tả | Kích thước |
| --- | --- | --- |
| `.btn` | Nút thường: nền `--c-surface`, viền `--c-border`, chữ đậm 600; hover `--c-surface-2`; `:disabled` / `[aria-disabled='true']` mờ 50 % | `min-height: 42px` (quầy, khách: `44px` — ADR-012 D-54), `padding: 0.5rem 1.05rem` |
| `.btn-primary` | Nền `--c-primary`, chữ trắng, bóng nâu nhẹ; hover `--c-primary-600` | — |
| `.btn-success` | Nền `--c-success`, chữ trắng (ví dụ "Đã thu tiền & In bill") | — |
| `.btn-danger` | **Nút viền đỏ** (nền trắng, chữ / viền `--c-danger`); hover `--c-danger-50` — nút Xóa, Hủy bàn | — |
| `.btn-ghost` | Trong suốt, không viền | — |
| `.btn-sm` / `.btn-lg` / `.btn-block` | Nhỏ / lớn / rộng 100 % | 36 px (trước 32) / 52 px |
| `.btn.loading` | Ẩn chữ, hiện vòng quay 18 px; bật bằng `setBusy(button, true)` (đồng thời `disabled`) | — |
| `.icon-btn` | Nút tròn chỉ có ký hiệu (ví dụ "×" đóng hộp thoại, kèm `aria-label`) | 40 × 40 px (trước 36) |
| `.link-btn` | Nút trông như link (ví dụ "Xem thẻ thành viên ›") | — |
| `.add-btn` (khách) | Nút tròn "+" thêm món, bóng nâu | 44 × 44 px (trước 40) |
| `.stepper` (khách) | Nhóm − số lượng +, nền `--c-primary-50` | nút 40 × 40 px (trước 36) |
| `.c-cartbar .btn` (khách) | Nút giỏ nổi espresso; số món trên nền `--c-accent-100` | cao 56 px |
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

- `.chip` (`base.css` — trước 23/10 nằm ở `customer.css`, nên chip danh mục ở Quản lý → Thực đơn hiện như nút trình duyệt): viên thuốc viền, cao ≥ 38 px, `padding: 0.4rem 0.95rem`, chữ `0.9rem`; hover viền caramel. Đang chọn: `.active` hoặc `[aria-pressed='true']` → nền `--c-primary`, chữ trắng. Dùng cho tab danh mục (`.c-tabs`, cuộn ngang, dính ngay dưới đầu trang 66 px), ghi chú nhanh (`.note-chips`), chip lý do sửa món (`.reason-chips .chip`, cao ≥ 38 px).
- `.badge`: viên thuốc chữ `0.78rem` đậm. Biến thể trạng thái:

| Class | Màu | Nhãn (JS) |
| --- | --- | --- |
| `.badge.pending` | cảnh báo | "Chờ xác nhận" (`PENDING`) |
| `.badge.preparing` | thông tin | "Đang chuẩn bị" (`PREPARING`) |
| `.badge.completed`, `.paid`, `.ok` | thành công | "Đã xong" (`COMPLETED`), "Đã thu" |
| `.badge.cancelled`, `.danger`, `.voided` | lỗi | "Đã hủy" (`CANCELLED`), "Đã hoàn tiền" (`VOIDED`) |
| `.badge.unpaid` | trung tính | "Chưa thu" |
| `.badge.primary` | màu chủ đạo | nhãn chung (ví dụ "Trưởng ca") |

  `statusBadge(status)` và `paymentBadge(paymentStatus)` trong `js/ui.js` tạo badge từ trạng thái API, nhãn lấy từ `ORDER_STATUS`.
- `.tag`, `.tag.promo` (khách): nhãn nhỏ `0.72rem` trên thẻ món (khuyến mãi, "Bán chạy"). `.pill` (quản lý): nhãn trong bảng.

### Thẻ (card)

`.card` (nền `--c-surface`, viền 1 px, `--radius`, `padding: 1.05rem 1.1rem`, **không bóng**). **Độ nổi khai báo một lần** (ADR-013 D-56): thẻ ở quầy / quản lý phẳng có viền; thẻ món và thẻ đơn của khách (`.c-item`, `.order-card`) có bóng `--shadow` không viền; lớp nổi (hộp thoại, ngăn kéo, sheet, toast, thanh giỏ) có bóng; phiếu đơn / ô món quầy chỉ nổi bóng khi rê chuột. **Không vạch màu dày một bên, không vạch nhấn dày trên góc bo** (trước 23/10 có ở phiếu đơn, cột bảng đơn, ô món, KPI, khung duyệt, thanh bên quản lý). Bảng đơn quầy: mỗi cột (`.column.col-pending` / `col-preparing` / `col-completed`) đặt biến `--col` (`--c-warning-text` / `--c-info` / `--c-success`) cho chấm + chữ tiêu đề và ô đếm (chữ trắng), nền tô nhạt `#fbf1df` / `#edf2f8` / `#ecf3ec` (chữ trên nền ≥ 5,6:1); phiếu đơn `.ticket` có chấm trạng thái (`--dot`) trước tên bàn. Khung cần duyệt `.approval`: nền `--c-warning-50` bo góc. Biến thể theo khu vực: `.order-card` (khách — đơn trong phiên; `.completed` viền xanh, `.cancelled`), `.ticket` (quầy — phiếu đơn trong cột), `.pay-card` (dải Gọi thanh toán), `.call-card` (gọi nhân viên), `.split-card` (chia bill; `.selected`), `.kpi`, `.today-card`, `.qr-card`, `.promo-card`, `.recall-card`.

### Modal, drawer, sheet

Một hàm `modal({ title, body, actions, drawer, sheet, dismissable, onClose })` trong `js/ui.js` tạo cả ba dạng:

| Dạng | Class | Kích thước | Dùng cho |
| --- | --- | --- | --- |
| Hộp thoại giữa màn hình | `.overlay` + `.modal` | rộng `min(520px, 100%)`, cao tối đa `100vh − 2rem` | Xác nhận, sửa món, mở ca |
| Ngăn kéo bên phải | `.drawer-overlay` + `.drawer` | rộng `min(560px, 100%)`, cao 100 % | Chi tiết đơn (SCR-11), Thu tiền bàn (SCR-14) |
| Sheet trượt từ dưới | `.sheet-overlay` + `.sheet` | rộng `min(640px, 100%)`, cao tối đa `92vh`, chừa `safe-area-inset-bottom` | Giỏ hàng (SCR-03), tùy chọn món, chia bill, Thẻ thành viên |

Hành vi chung: `role="dialog"`, `aria-modal="true"`, `aria-label` = tiêu đề; nút "×" có `aria-label="Đóng"`; Esc hoặc bấm ra ngoài thì đóng (trừ khi `dismissable: false`); khi mở, focus vào ô nhập / nút chính đầu tiên. Chưa giữ focus trong hộp thoại (focus trap). `confirmDialog(title, message, { okLabel, danger })` là hộp xác nhận hai nút ("Hủy" / nút đồng ý — đỏ nếu `danger`).

### Toast, alert, banner

- `toast(message, type = 'info', ms = 3500)`: hộp `.toasts` ở giữa đáy màn hình (rộng `min(440px, 100% − 2rem)`), có `role="status"` và `aria-live="polite"`. Loại: mặc định (nền `--c-text`), `success`, `error`, `warning`.
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

## Vùng chạm (touch target)

Lấy từ CSS khai báo (chưa đo trên trang đã render — xem NFR-A11Y-05):

| Thành phần | Kích thước |
| --- | --- |
| `.btn-lg`, nút giỏ nổi khách | cao 52 px / 56 px |
| `.btn` ở quầy và khách, `.add-btn`, `.tabs button` | cao 44 px (`.add-btn` 44 × 44) |
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
| `sparkles`, `utensils` | Nhóm "Gợi ý cho bạn", "Combo" | Menu khách |
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
| `check`, `circle-check`, `x`, `pencil`, `party-popper`, `arrow-up` / `arrow-down`, `chevron-right` | Đạt / có / không có việc tồn; bỏ dòng, đóng hộp thoại; sửa món; món đã xong; đổi thứ tự ghim; mở ô hội viên | Nhiều nơi |
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
- **Giảm chuyển động** (`prefers-reduced-motion: reduce`): bỏ hiệu ứng mở hộp thoại / ngăn kéo / sheet / toast, nhấp nháy "Mất kết nối", shimmer khung chờ, nảy nút (`.btn`, ô món quầy, nút "+" khách), xoay mũi tên nhóm menu; bấm tab danh mục khách thì nhảy thẳng tới nhóm món thay vì cuộn mượt; dải "Gọi thanh toán" và đơn mới dùng vòng viền tĩnh thay nhịp đập / bật nảy. Vòng quay chờ vẫn quay (là phản hồi đang tải).
- Bộ dò Impeccable (`npx impeccable@4.7.0 detect <thư-mục public>`) không được báo `side-tab`, `border-accent-on-rounded`; `cream-palette` là ngoại lệ có chủ đích (ADR-013 D-57), `cramped-padding` ở `po-print.html` là báo nhầm (trang in bỏ lề, lề giấy thay).
