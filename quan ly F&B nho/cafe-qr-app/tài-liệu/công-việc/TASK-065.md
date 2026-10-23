# TASK-065 — Làm mới giao diện theo chủ đề quán "Mộc"
Status: READY_FOR_REVIEW (23/10/2026) — chờ chủ dự án xem giao diện, duyệt thì gộp `main`
Quyết định: [ADR-012](../quyết-định/ADR-012-giao-dien-moc.md) D-52…D-54 · Module: MOD-CUSTOMER, MOD-POS, MOD-ADMIN (chỉ giao diện) · Màn hình: mọi SCR (không thêm màn mới) · NFR: nhóm Accessibility ([nfr.md](../sản-phẩm/nfr.md))
Nguồn: chủ dự án yêu cầu 23/10/2026 ("rà soát trên gg và các thư viện liên quan … sửa lại giao diện bố cục và màu sắc phù hợp với đề tài … không được đụng đến dữ liệu project"). · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-065-giao-dien-moc` · Phụ thuộc: TASK-057 (design system, kiểm tra khả năng tiếp cận)

## Mục tiêu
- Giao diện khách, quầy, quản lý mang nét riêng của "Cà phê Mộc": màu espresso / nâu rang / kem sữa / caramel / xanh lá, phông chữ tiếng Việt đẹp, bố cục thoáng, vùng chạm lớn hơn.
- Không đổi chức năng, dữ liệu, API; vẫn đạt WCAG 2.2 AA như trước.

## Kế hoạch
1. Tài liệu trước code: ADR-012, task này.
2. `public/fonts/`: Be Vietnam Pro (400, 500, 600, 700, 800) + Lora (600, 700), phần latin + tiếng Việt, kèm giấy phép OFL.
3. `css/base.css`: token màu mới, `@font-face`, token phông / bo góc / bóng; làm mới nút, ô nhập, thẻ, badge, bảng, hộp thoại, toast.
4. `css/customer.css`: đầu trang espresso, tab danh mục, thẻ món, thanh giỏ, theo dõi đơn, màn vào bàn.
5. `css/pos.css`: thanh trên, bảng 3 cột theo trạng thái, phiếu đơn, panel bàn, bán mang đi, đăng nhập; vùng chạm ≥ 44 px.
6. `css/admin.css`: thanh bên, tiêu đề trang, KPI, bảng, tab.
7. `meta theme-color` ở 3 trang khách.
8. Kiểm chứng: lint, format, `npm test`, `npm run test:e2e` (luồng + a11y, ảnh từng màn); so ảnh trước / sau.
9. Đồng bộ docs: design-system, ảnh màn hình, README task / ADR; review G3 độc lập; chờ chủ dự án duyệt trước khi gộp `main`.

## Phạm vi sửa
- **Giao diện:** `css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`, `css/print.css` (chỉ giữ phông hệ thống cho hóa đơn); `t/index.html`, `t/menu.html`, `t/track.html` (chỉ `meta theme-color`); `fonts/` (mới).
- **Tài liệu:** ADR-012, TASK-065, `quyết-định/README.md`, `công-việc/README.md`, `giao-diện/design-system.md`, `giao-diện/ảnh/`.
- **Không sửa:** JS, server, cơ sở dữ liệu, migration, seed, `.env`, dữ liệu `CafeQrDev`.

## Tiêu chí nghiệm thu
| ID | Tiêu chí | Kiểm bằng |
| --- | --- | --- |
| T65-1 | Mọi màn quét trong a11y đạt: tương phản ≥ 4,5:1 (chữ lớn ≥ 3:1), vùng chạm ≥ 24 px, không cuộn ngang 320 / 390 px, có dấu focus ≥ 3:1 | `npm run test:e2e` (project a11y) |
| T65-2 | Mọi luồng E2E vẫn chạy như trước (không đổi hành vi) | `npm run test:e2e` (project flow) |
| T65-3 | Không đổi JS / server / DB: diff so với `main` chỉ gồm CSS, `meta theme-color`, phông, tài liệu | `git diff --stat main` |
| T65-4 | Phông nạp từ chính app (không gọi ra ngoài), có giấy phép kèm theo | Mở trang, tab Network; `fonts/OFL-*.txt` |
| T65-5 | Test tích hợp, lint, format vẫn đạt | `npm test`, `npm run lint`, `npm run format:check` |

## Kết quả (23/10/2026)
| Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- |
| T65-1 | PASS | `npm run test:e2e` project a11y 3/3 (khách 390 px + 320 px, quầy, 26 trang quản lý) |
| T65-2 | PASS | `npm run test:e2e` project flow 37/37 — tổng 40/40 (2,3 phút) |
| T65-3 | PASS | `git diff main --stat`: chỉ CSS, `meta theme-color`, `fonts/`, tài liệu, ảnh; không JS / server / DB / `package.json` |
| T65-4 | PASS | `fonts/` 14 `.woff2` + `OFL-BeVietnamPro.txt`, `OFL-Lora.txt`; server trả `200 font/woff2` từ `/fonts/…`; CSP mặc định `font-src 'self'` |
| T65-5 | PASS | `npm test` 292/292; `npm run lint`, `npm run format:check` sạch; `npm run trace -- --check` 321/321 AC |

Không chạm `CafeQrDev`: test và E2E chạy trên `CafeQrTest` (E2E server từ chối DB không có hậu tố "Test"); không migration, không seed.

### Review G3 (agent độc lập, chỉ đọc) — đã sửa
| Mục | Vấn đề | Cách sửa |
| --- | --- | --- |
| B1 | `.chip { flex: none }` chuyển sang `base.css` làm nút "Xóa" danh mục ở Quản lý → Thực đơn tràn khỏi thẻ | `flex: none` chỉ cho `.c-tabs .chip`; chip ở quản lý gọn hơn, tên dài xuống dòng |
| S1 | `body.pos/.customer .btn:not(.btn-sm)` (44 px) đè `.btn-lg` 52 px / nút giỏ 56 px | Thêm `:not(.btn-lg)` |
| S2 | `.btn:hover` đổi viền làm nút đỏ / xanh / ghost mất màu viền khi rê chuột | Bỏ đổi viền ở `.btn:hover` |
| S3 | Ghi chú bàn / món `#b4530a` còn 4,30–4,45:1 trên nền xanh / vàng nhạt mới | Dùng `--c-warning-text` (5,44–6,26:1) |
| S4 | Tên bàn dài bị cắt "…" ở đầu trang khách | Tối đa 2 dòng, cỡ chữ `clamp(1rem, 4.6vw, 1.2rem)`; đầu trang + `top` thanh danh mục tính bằng rem |
| Nhỏ | Panel bàn / giỏ dính trượt dưới thanh quầy 2 hàng; viền focus trên banner "đơn trễ" 1,01:1; thanh bên iPad; hóa đơn tự in trước khi web font tải; tay nắm sheet gợi thao tác vuốt không có; số liệu sai trong design-system | `top: 7.25rem`; `--c-focus-dark` trên banner (4,52–4,65:1); `height: 100dvh`; `body.receipt-page` giữ phông hệ thống; bỏ tay nắm; sửa design-system / ADR |

Còn lại (có từ trước TASK-065, không đổi): chữ trong phần tử mờ (`opacity`) — phiếu đã xong, đơn đã hủy, món hết — và ô bản đồ nhiệt rất đậm dưới 4,5:1; bộ kiểm tra tự động bỏ qua các trường hợp này. Banner "Chưa mở ca" dính đè lên thanh quầy khi cuộn (đã có từ trước).
