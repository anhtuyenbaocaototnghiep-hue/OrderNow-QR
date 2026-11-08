# TASK-101 — Kế hoạch: giao diện tinh gọn, đợt 1 (nền tảng) + đợt 2 (màn khách) — ADR-042

## Khảo sát (ảnh chụp 13 màn ngày 07/11/2026, CafeQrTest)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Token màu / phông | `css/base.css` `:root`, `@font-face` (Be Vietnam Pro + Lora) | Nền kem `#f6efe5`, nâu rang `#7a4527`, caramel; Impeccable báo `cream-palette` (ngoại lệ ADR-013 D-57) |
| Thực đơn khách | `t/menu.html`, `css/customer.css`, `js/pages/t-menu.js` (`itemCard`, `renderMenu`, `renderControl`) | Thẻ bo tròn đổ bóng, ô chữ cái thay ảnh, "+" nâu đặc có bóng, tiêu đề nhóm có biểu tượng (sparkles…), chip viên thuốc |
| Phản hồi thêm món | `openItem` / `editLine` → `toast(…, 'success')` | Thông báo xanh lá chồng nhau, che nội dung |
| Bảng chọn món | `js/options.js` `pickItem` | Nút "Hủy" + "Thêm vào giỏ", số lượng + "Giá 1 phần" trong thân bảng |
| Hộp thoại / thông báo | `js/ui.js` `modal`, `toast` | Đóng là biến mất ngay, không tay nắm; thông báo nền màu theo loại, không giới hạn số |
| Theo dõi đơn | `js/pages/t-track.js` `progress` | 3 vạch không chữ; hộp xanh dương thời gian chờ |
| Trang quầy dùng chung | `pos/takeaway.html`, `pos/table-order.html` nạp `customer.css` (`.c-tabs`, chip, `.recall-card`) | Phải giới hạn kiểu thanh nhóm món mới vào `body.customer` |

## Thiết kế
- Token mới (D-188), Cormorant Garamond (D-189), bo góc / độ nổi (D-190), chuyển động + đóng qua View Transition + kéo để đóng (D-191), phản hồi tại chỗ (D-192), màn khách (D-193), quy tắc không AI hóa (D-194).
- **Vòng sửa 08/11 (D-195)** sau khi chủ dự án xem trên máy tính 1920 px ("khó nhìn quá làm lại đi"): bỏ Cormorant → Be Vietnam Pro đậm 700; màu chính về nâu rang `#7a4527`, nền xám ấm `#f3f2ef`; đầu trang khách nền espresso; nhóm món nút tròn; thẻ món trắng viền mảnh, nút "+" đặc, giá đậm nâu rang, chấm số gắn góc nút; `--page` / `--gutter` căn đầu trang + nhóm món + thực đơn một cột, ≥ 1024 px thẻ 2 cột, thanh giỏ giữa; `pos.css` / `admin.css` về cỡ tiêu đề trước ADR-042. Giữ nguyên chuyển động, phản hồi tại chỗ, bảng chọn, điểm bám E2E.
- Giữ các điểm bám E2E: `.c-section.cat .c-item`, `.add-btn` (aria-label "Thêm …"), `.qty-badge`, `.stepper span`, `#open-cart`, `.opt-row`, `#item-qty`, `#item-note`, `.item-sheet`, `.modal-foot .btn-primary`, nút "Chọn size / tùy chọn ›", `#cart-eta`, `#eta`, `.member-box(.on)`, `.recall-card`, chữ "tiền mặt hoặc chuyển khoản".

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Hộp thoại đang chạy hiệu ứng ra vẫn nằm trong trang → E2E / trình đọc màn hình thấy hai hộp thoại | Bỏ `role` / `id` / `inert` ngay lúc đóng; gỡ khỏi DOM trong View Transition (hiệu ứng trên ảnh chụp) |
| Phông mới làm vỡ chữ tiếng Việt | Kiểm ảnh dấu chồng ầ ẩ ẫ ổ ữ… ở 20–40 px trước khi dùng |
| Tương phản thấp với màu mới | Tính trước (chữ phụ ≥ 5,08:1) + `a11y.spec.js` trên trang thật |
| Trang quầy nạp `customer.css` | Kiểu mới của thanh nhóm món chỉ trong `body.customer` |
| Chuyển trang bằng View Transitions | Đã thử: Chromium 156 hủy ở trang mới, báo lỗi trang → bỏ (ghi ở ADR-042) |
| Hiện dần khi mở trang | Đã thử: hoãn khung hình đầu → bỏ |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` (flow + a11y) · `npm run trace -- --check` · script Playwright thử kéo để đóng / đóng bằng "×" / chuyển trang / lỗi console (`check-motion101.cjs` trong thư mục tạm) · ảnh trước / sau 390 px + 1366 px. Không migration, không đổi máy chủ.
