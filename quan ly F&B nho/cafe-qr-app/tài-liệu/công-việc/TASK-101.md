# TASK-101 — Giao diện tinh gọn: đợt 1 nền tảng + đợt 2 màn khách (ADR-042)
Status: READY_FOR_REVIEW (08/11/2026, vòng sửa 1) — chủ dự án xem bản đầu: "khó nhìn quá làm lại đi" → sửa theo D-195; chờ chủ dự án xem ảnh bản sửa rồi duyệt đợt 3 (máy quầy), đợt 4 (trang Quản lý)
Quyết định: [ADR-042](../quyết-định/ADR-042-giao-dien-tinh-gon.md) D-188…D-195 (thay một phần ADR-012 D-52 / D-53, ADR-013 D-56 / D-57) · Module: MOD-CUSTOMER (chính), MOD-POS, MOD-ADMIN (chỉ token màu / phông) · Màn hình: SCR-01, SCR-02, SCR-03, SCR-05, SCR-57 (không thêm màn mới) · NFR: nhóm Accessibility ([nfr.md](../sản-phẩm/nfr.md))
Nguồn: chủ dự án 07/11/2026 "nâng cấp đồ án F&B về mặt UX UI trở nên mượt mà sang trọng đẳng cấp dễ thao tác mà không bị quá AI hóa" → đề xuất 4 đợt → "ok" (làm đợt 1 + 2 trước). · Agent: Claude · Reviewer: chủ dự án
Nhánh: `task/TASK-101-giao-dien-tinh-gon` chồng lên `task/TASK-100-cong-mo-bang-chon` (chưa gộp `main`) · Kế hoạch: [TASK-101-plan.md](../kế-hoạch/TASK-101-plan.md)

## Mục tiêu
- Giao diện sang, tiết chế, không mang dấu hiệu "AI làm": bảng màu giấy – mực – cà phê, phông tiêu đề có chân thanh mảnh, danh sách phẳng thay thẻ đổ bóng, một màu nhấn.
- Mượt: hộp thoại / bảng trượt có hiệu ứng vào và ra, kéo xuống để đóng, vạch nhóm món trượt theo nhóm đang xem, phản hồi ngay tại chỗ thay thông báo xanh.
- Dễ thao tác: bấm cả dòng món, số lượng cạnh nút "Thêm vào giỏ".
- Không đổi nghiệp vụ, API, dữ liệu; vẫn đạt WCAG 2.2 AA.

## Phạm vi sửa
- **Giao diện:** `css/base.css`, `css/customer.css`, `css/pos.css` (cỡ tiêu đề, nền trang), `css/admin.css` (cỡ tiêu đề), `js/ui.js`, `js/options.js`, `js/pages/t-menu.js`, `js/pages/t-track.js`, `meta theme-color` ở `t/index.html`, `t/menu.html`, `t/track.html`, `quay.html`, `qua.html`, `chinh-sach-du-lieu.html`, `fonts/` (thêm Cormorant Garamond + `OFL-CormorantGaramond.txt`, gỡ Lora + `OFL-Lora.txt`).
- **Test:** `kiểm-thử/e2e/flow.spec.js` — 3 chỗ đổi bộ chọn (nút "+" số lượng ở chân bảng chọn; giá 1 phần đọc trên nút thêm). `ứng-dụng/máy-chủ/tests/payroll.test.js` — AC-073-08 lấy báo cáo tuần từ **ngày mở ca** thay vì hôm nay (bài cũ hỏng khi chạy lúc 0–5 giờ sáng vì ca mở 5 giờ trước thuộc hôm qua — phát hiện khi chạy kiểm chứng lúc 0 giờ 40; không đổi mã chạy).
- **Tài liệu:** ADR-042, task / kế hoạch này, README công việc / kế hoạch / quyết định, `design-system.md`, ghi chú ở ADR-012 / ADR-013, UAT-53, skill `giao-dien-tinh-gon`.
- **Không sửa:** máy chủ, cơ sở dữ liệu, migration, seed, `.env`, dữ liệu `CafeQrDev`; bố cục riêng của máy quầy / trang Quản lý (đợt 3, 4).

## Tiêu chí nghiệm thu
| ID | Tiêu chí | Kiểm bằng |
| --- | --- | --- |
| T101-1 | Mọi màn quét trong a11y đạt: tương phản ≥ 4,5:1 (chữ lớn ≥ 3:1), vùng chạm ≥ 24 px, không cuộn ngang 320 / 390 px, có dấu focus ≥ 3:1 | `npm run test:e2e` (project a11y) |
| T101-2 | Mọi luồng E2E vẫn chạy (chỉ đổi bộ chọn ở 3 chỗ nêu trên) | `npm run test:e2e` (project flow) |
| T101-3 | Không đổi máy chủ / DB: diff chỉ gồm giao diện (CSS / JS / HTML / phông), E2E, một bài test tích hợp (AC-073-08 — chỉ cách lấy ngày), tài liệu, skill — **PASS** (không tệp nào trong `máy-chủ/src`, migration, `.env`) | `git diff --stat task/TASK-100-cong-mo-bang-chon` |
| T101-4 | Phông nạp từ chính app, có giấy phép; không còn tệp / khai báo Lora (vòng sửa: cũng không còn Cormorant — một phông Be Vietnam Pro) | `fonts/OFL-BeVietnamPro.txt`; tìm "lora", "cormorant" trong `public/css`, `public/fonts` = 0 |
| T101-5 | Kéo đầu bảng xuống thì đóng, kéo ít thì bật về; đóng bằng "×" có hiệu ứng ra; chuyển trang không lỗi console | script Playwright `check-motion101.cjs` (thư mục tạm) |
| T101-6 | Test tích hợp, lint, định dạng, truy vết vẫn đạt | `npm test`, `npm run lint`, `npm run format:check`, `npm run trace -- --check` |
| T101-7 | Bật "giảm chuyển động": không trượt / nảy / sáng / đổi màu dần; hộp thoại đóng ngay | CSS `@media (prefers-reduced-motion: reduce)` + `reducedMotion()` trong `ui.js` |
| T101-8 | (Vòng sửa) Màn khách ở 1920 px: đầu trang, thanh nhóm món, thực đơn cùng một cột; thẻ món 2 cột; thanh giỏ ở giữa. Ở 390 px: mỗi món một thẻ, nút "+" đặc, giá đậm, chữ thanh giỏ một dòng | Ảnh `w1-menu-1920`, `p1-menu-top`, `p3-menu-with-cart` (script `shot-v2.cjs`, thư mục tạm) |
| T101-9 | (Vòng sửa) Bộ dò Impeccable không còn `cream-palette` với nền mới | `npx impeccable@4.7.0 detect public` = 0 |

## Kết quả thực chạy (08/11/2026)
| Lệnh | Kết quả |
| --- | --- |
| `npm run lint`, `npm run format:check` | PASS |
| `npm test` | **467/467 PASS** (54 file; gồm AC-073-08 đã sửa không phụ thuộc giờ chạy) |
| `npm run test:e2e` | **76/76 PASS** (4,5 phút) — flow 73/73, a11y 3/3 (khách 390 / 320 px, quầy, mọi trang quản lý: tương phản, vùng chạm, không cuộn ngang, focus) |
| `npm run trace -- --check` | **182 US, 497 AC — PASS 497, FAIL 0, NOT_RUN 0, GAP 0** |
| Bộ dò Impeccable (`npx impeccable@4.7.0 detect public`) | 0 phát hiện (77 tệp CSS / JS) — không còn `cream-palette` |
| Script chuyển động (`check-motion101.cjs`) | Kéo 160 px → đóng (0 hộp thoại, 0 lớp phủ); kéo 40 px → bật về; "×" → hộp thoại thôi là `dialog` ngay, `data-vt-leave="sheet"`; thanh nhóm món tự đổi sang "Trà & đồ uống khác" khi cuộn; lỗi console: không |

Ảnh trước / sau cho chủ dự án duyệt (ngoài repo): `quan ly F&B nho/ảnh trước sau giao diện (TASK-101)/` — 5 màn khách (thực đơn, bảng chọn, thực đơn có món trong giỏ, giỏ, theo dõi đơn) + máy quầy + trang Quản lý (hai màn sau chỉ đổi màu / phông). Ảnh chuẩn từng màn trong `giao-diện/ảnh/` đã chụp lại từ lần chạy a11y mới nhất.

Lần chạy kiểm chứng đầu (08/11, 0 giờ 40): luồng E2E 73/73 đạt; a11y báo 1 lỗi — chữ phụ `#6a635b` trên thẻ quà nền caramel nhạt (`/qua/{token}`) 4,44:1 → thẻ quà nền trắng viền đồng, chữ phụ đậm hơn `#665f57` (≥ 4,71:1 trên mọi nền sáng); `npm test` 466/467 — AC-073-08 hỏng vì giờ chạy (đã sửa bài test, xem Phạm vi). Kết quả trên là lần chạy lại sau khi sửa.

Đã thử rồi bỏ (ghi ở ADR-042): View Transitions giữa các trang (Chromium 156 hủy ở trang mới, báo `pageerror`), hiện dần khi mở trang (hoãn khung hình đầu). Chưa có review G3 độc lập; chưa gộp `main`; chưa đẩy GitHub.

## Vòng sửa 1 — "khó nhìn" (08/11/2026, D-195)

**Phản hồi chủ dự án** (ảnh chụp thực đơn trên máy tính 1920 px, dữ liệu dùng thử): "bạn thiết kế khó nhìn quá làm lại đi".

**Nguyên nhân (đối chiếu ảnh chụp lại cùng khổ 1920 px):**
- Phông tiêu đề Cormorant mảnh, nét chân nhỏ, khó đọc trên màn Windows.
- Nút "+" chỉ có viền mảnh, trông như bị tắt.
- Giá chữ mỏng màu mực.
- Dòng món không khung, món trôi trên nền.
- Trên máy tính, đầu trang và thanh nhóm món sát mép trái, thực đơn một cột hẹp ở giữa, thanh giỏ dạt trái (`max-width` + `margin: auto` trên nút `inline-flex`).

**Sửa** (chi tiết ở ADR-042 D-195):
- Bỏ Cormorant; tiêu đề Be Vietnam Pro đậm 700.
- Màu chính về nâu rang `#7a4527`; nền xám ấm `#f3f2ef`.
- Đầu trang khách nền espresso; nhóm món là nút tròn (bỏ vạch trượt).
- Mỗi món một thẻ trắng viền mảnh, nút "+" tròn đặc nâu rang, giá đậm nâu rang; số trong giỏ là chấm số gắn góc nút "+".
- `--page` / `--gutter` căn một cột; từ 1024 px thẻ món xếp 2 cột; thanh giỏ ở giữa, chữ không bẻ dòng.
- `pos.css` / `admin.css` lấy lại bản trước ADR-042 (cỡ tiêu đề cho phông thân), chỉ đổi nền quầy sang `#eceae7`.
- Giữ nguyên chuyển động, phản hồi tại chỗ, bảng chọn món, điểm bám E2E (không sửa test).

**Tệp:**
- CSS: `css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`.
- JS / HTML: `js/pages/t-menu.js`, `theme-color` ở 6 trang khách.
- Phông: gỡ `fonts/cormorant-garamond-*.woff2` + `OFL-CormorantGaramond.txt`.
- Tài liệu: ADR-042, design-system, kế hoạch, README công việc / quyết định, local-development, skill.

**Kết quả thực chạy (08/11/2026, sau vòng sửa):**
- `npm run lint`, `npm run format:check`: PASS.
- `npm test`: **467/467 PASS**.
- `npm run test:e2e`: **76/76 PASS** (4,5 phút; flow 73/73, a11y 3/3 — tương phản, vùng chạm, không cuộn ngang 320 / 390 px, focus). Không sửa bài E2E nào.
- `npm run trace -- --check`: **182 US, 497 AC — PASS 497**.
- Bộ dò Impeccable: 0 phát hiện. Lần đầu với nền `#f4f2ee` / quầy `#ebe8e3` báo 15 `cream-palette`; thử 10 màu cho thấy bộ dò gắn cờ khi R − B ≥ 6 → nền `#f3f2ef`, quầy `#eceae7`.
- Ảnh 390 / 1920 / 1366 px không lỗi trang.

Ảnh so sánh cho chủ dự án (ngoài repo): `quan ly F&B nho/ảnh giao diện sửa lại (TASK-101)/`. Có 9 cặp ảnh "bản đầu ↔ bản sửa": thực đơn và bảng chọn ở 1920 px; thực đơn, có giỏ, bảng chọn, giỏ, theo dõi đơn ở 390 px; máy quầy; trang Quản lý.

**Bổ sung cùng ngày — ô mời nhập SĐT:** chủ dự án gửi ảnh ô "Nhập SĐT để nhận ưu đãi" (nền trắng viền mảnh): "chỗ này bạn làm thêm điểm nhấn để khách dễ thấy" → `js/member-box.js` (lớp `invite`, quà trong vòng tròn, "Đơn đầu tiên giảm **10%**, hội viên giảm 3–8%", dấu "Nhận ngay ›") + `css/customer.css` (`.member-box.invite`, `.member-ic`, `.member-sub`, `.member-cta`; bỏ quy tắc mũi tên cũ). Bản đầu đặt "Nhận ngay" bên phải → chữ bị ép 4–5 dòng ở 320 px → chuyển xuống dưới chữ. Ảnh 390 / 320 px (giỏ, theo dõi đơn) không lỗi trang; E2E vẫn bấm `.member-box` như cũ.

**Câu hỏi kèm của chủ dự án (không sửa mã):** "vì sao admin vẫn có thể vào màn hình quầy" — theo thiết kế. `roles-permissions.md` §4.1: ADMIN có mọi quyền của STAFF (dòng này còn đánh dấu PROPOSED); bảng §4.6 (ADR-035, F-077): "Bán, thu tiền, mở / đóng ca…" — Chủ quán: Có. `requireStaff` nhận mọi tài khoản đang hoạt động; trang Quản lý tách phiên riêng (ADR-038) nhưng không chặn chủ quán đứng quầy. Chờ chủ dự án quyết giữ hay chặn.
