# TASK-066 — Nâng chất lượng giao diện theo Impeccable
Status: READY_FOR_REVIEW (23/10/2026) — chờ chủ dự án duyệt gộp `main` (cùng TASK-065)
Quyết định: [ADR-013](../quyết-định/ADR-013-giao-dien-impeccable.md) D-55…D-57 (tiếp ADR-012) · Module: MOD-CUSTOMER, MOD-POS, MOD-ADMIN (chỉ giao diện) · Màn hình: mọi SCR · NFR: nhóm Accessibility
Nguồn: chủ dự án yêu cầu 23/10/2026 ("dựa vào đó và biến trang web tôi trở nên tuyệt vời" — sau đề xuất skill Impeccable). · Agent: Claude · Reviewer: agent review độc lập + chủ dự án
Nhánh: `task/TASK-066-giao-dien-impeccable` tách từ `task/TASK-065-giao-dien-moc` (chưa gộp `main`) · Phụ thuộc: TASK-065

## Mục tiêu
- Giao diện đạt "sàn chất lượng" của Impeccable: biểu tượng vẽ cùng nét thay emoji, độ nổi nhất quán, không vạch màu một bên, bề mặt trình duyệt theo bảng màu, tôn trọng người tắt chuyển động.
- Không đổi chức năng, chữ, dữ liệu, API; vẫn đạt WCAG 2.2 AA.

## Kế hoạch
1. Tài liệu trước code: ADR-013, task này.
2. `js/icons.js`: 38 hình Lucide (ISC) + `icon()`, `brandMark()`.
3. Thay emoji / ký tự làm biểu tượng trong 28 tệp JS + 4 tệp HTML (chỉ phần hiển thị); cập nhật chuỗi / kiểm tra sao tương ứng trong `flow.spec.js`.
3b. Menu quản lý gọn theo 6 nhóm thu gọn (D-58 — chủ dự án gửi ảnh thanh bên "nhìn nhiều quá bị rối").
4. CSS: `.ic`, dấu hiệu quán; bỏ vạch một bên / vạch trên góc bo; độ nổi một lần; bề mặt trình duyệt; `prefers-reduced-motion`.
5. Kiểm chứng: bộ dò Impeccable (mã nguồn), lint, format, `npm test`, `npm run test:e2e`; so ảnh; review G3 độc lập.
6. Đồng bộ design-system, ảnh màn hình, README task / ADR; chờ chủ dự án duyệt.

## Tiêu chí nghiệm thu
| ID | Tiêu chí | Kiểm bằng |
| --- | --- | --- |
| T66-1 | Mọi màn quét trong a11y đạt (tương phản, vùng chạm, cuộn ngang, focus, nút / ảnh có tên) | `npm run test:e2e` (a11y) |
| T66-2 | Mọi luồng E2E chạy như trước; test chỉ đổi phần hiển thị (chuỗi có emoji, sao SVG tô đặc / rỗng, bước mở nhóm menu) | `npm run test:e2e` (flow), `git diff` test |
| T66-3 | Bộ dò Impeccable trên mã nguồn: không còn `side-tab`, `border-accent-on-rounded`; `cream-palette` là ngoại lệ D-57 | `npx impeccable@4.7.0 detect <public>` |
| T66-4 | Không còn emoji / ký tự đóng vai biểu tượng trong JS / HTML (trừ ký hiệu trong số liệu và ký tự trong nhãn chữ, D-55) | quét `Extended_Pictographic` + các ký tự `✓ ✔ ✗ ✕ × ✎ ↑ ↓ ★ ☆ ♥ ♡ ›` đứng một mình trong nút / ô |
| T66-6 | Menu quản lý: "Hôm nay" + 6 nhóm; chỉ nhóm của trang đang mở mở sẵn; mục một dòng; quản lý vẫn tới được mọi trang | E2E "tra cứu API" (mở nhóm rồi bấm), a11y 26 trang quản lý, ảnh `quan-ly-*.jpg` |
| T66-5 | `npm test`, lint, format đạt; không đổi API / DB / dữ liệu | lệnh tương ứng, `git diff --stat` |

## Kết quả (23/10/2026)
| Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- |
| T66-1 | PASS | `npm run test:e2e` project a11y 3/3 (khách, quầy, 26 trang quản lý — nút chỉ có biểu tượng đều có `aria-label`) |
| T66-2 | PASS | `npm run test:e2e` flow 37/37 — tổng 40/40 |
| T66-3 | PASS | `npx impeccable@4.7.0 detect`: 20 → 12 điểm; còn `cream-palette` ×11 (ngoại lệ D-57) và `cramped-padding` ×1 ở `po-print.html` (báo nhầm: trang in bỏ lề, lề giấy thay) |
| T66-4 | PASS | không còn ký tự `Extended_Pictographic`; `✓ ✔ ✗ ✕ × ✎ ↑ ↓ ☆ ♥ ♡ ›` không còn đứng một mình trong nút / ô; `★` chỉ trong số liệu ("5★") |
| T66-5 | PASS | `npm test` 292/292; lint, format sạch; `git diff` không chạm server / DB / `package.json` |
| T66-6 | PASS | menu "Hôm nay" + 6 nhóm (ảnh `quan-ly-today.jpg`, `quan-ly-loyalty.jpg`); E2E "tra cứu API" mở nhóm Hệ thống rồi bấm |

### Review G3 (agent độc lập, chỉ đọc) — không có blocker, đã sửa
| Mục | Vấn đề | Cách sửa |
| --- | --- | --- |
| S1 | `.tile:active` / `.add-btn:active` vẫn co lại khi người dùng tắt chuyển động (luật trong `base.css` bị `pos.css` ghi đè) | Chuyển vào khối `prefers-reduced-motion` của `pos.css`, thêm khối ở `customer.css` |
| S2 | Tab danh mục khách vẫn cuộn mượt khi tắt chuyển động | `scrollIntoView` dùng `auto` khi `prefers-reduced-motion: reduce` |
| S3 | Biểu tượng mang nghĩa bị `aria-hidden` (sao hội viên trước tên, sổ ghi chú, tim "đã thích") | Thêm `label` "Hội viên", "Ghi chú", "Đã thích" |
| S4 | Nút ↑ / ↓ (Gợi ý & ghim) và mũi tên › (ô hội viên) còn là ký tự | `arrow-up`, `arrow-down`, `chevron-right` |
| S5 | Mục menu đang chọn có vạch sáng 3 px bên trái | Bỏ (menu làm lại theo D-58) |
| S6 | ADR-013 / TASK-066 ghi sai số tệp, mô tả thay đổi test chưa đủ; README chưa có dòng | Sửa số liệu, ghi đủ thay đổi test, thêm dòng README |
| Nhỏ | Bút chì lệch tâm; khoảng cách đôi cạnh biểu tượng; 6 hình không dùng; `icon()` phụ thuộc hoàn toàn CSS; thanh cuộn tương phản thấp; cùng biểu tượng chuông cho 2 nghĩa | `.line-edit > .ic` bỏ lề; bỏ khoảng trắng thừa; xóa hình thừa (còn 38, đều dùng); `icon()` tự đặt `fill / stroke / stroke-width` như Lucide; thanh cuộn `#94795a` / `#9a7d62` (≥ 3:1); âm thanh bật dùng `volume-2` |

Còn lại (ghi nhận): ký tự trong nhãn chữ ("+ Thêm …", "← Về …", "Sau ›") giữ dạng chữ theo D-55.
