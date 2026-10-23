# ADR-013 — Nâng chất lượng giao diện theo Impeccable (biểu tượng SVG, độ nổi, bề mặt trình duyệt)

- **Trạng thái:** PROPOSED (23/10/2026) — chờ chủ dự án xem giao diện rồi duyệt gộp `main` (cùng ADR-012).
- **Bối cảnh:**
  - Chủ dự án hỏi ngày 23/10/2026 skill / model làm đẹp frontend nào hợp nhất, được đề xuất **Impeccable** ([pbakaus/impeccable](https://github.com/pbakaus/impeccable), Apache-2.0); rồi yêu cầu "dựa vào đó và biến trang web tôi trở nên tuyệt vời".
  - Không cài Impeccable vào repo (nó tải chương trình chạy trên máy và cài hook): chạy bộ dò `npx impeccable@4.7.0 detect` từ thư mục tạm và áp dụng hướng dẫn `audit`, `polish`, `craft-floor`, chế độ **Operate** (quầy, quản lý, menu gọi món: người dùng đến để làm xong việc — rõ ràng, nhất quán hơn phô trương).
  - Bộ dò trên mã nguồn (23/10/2026) báo 20 điểm: vạch màu dày một bên (phiếu đơn, ô duyệt, thanh bên quản lý), vạch nhấn dày trên góc bo (cột bảng đơn, ô món), nền kem. Hướng dẫn "craft floor" còn cấm: emoji / ký tự làm biểu tượng (68 chỗ trong 22 tệp), thẻ vừa viền vừa bóng ("ghost card"), để mặc định trình duyệt (bôi chọn chữ, con trỏ nhập, thanh cuộn), không có phương án `prefers-reduced-motion`.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-55 | **Một bộ biểu tượng SVG** (`js/icons.js`, hình chép từ Lucide — ISC, giấy phép ở đầu tệp; không thêm dependency) thay mọi emoji / ký tự đóng vai biểu tượng; dấu hiệu quán (tách cà phê trong vòng caramel) thay "☕" trước tên quán. Được sửa JS / HTML **chỉ ở phần hiển thị**: chèn biểu tượng, bỏ emoji khỏi chuỗi; giữ nguyên chữ, nhãn nút, hành vi, API, dữ liệu. Biểu tượng đi kèm chữ thì `aria-hidden`; đứng một mình thì có `aria-label`. Biểu tượng mang nghĩa mà chữ bên cạnh không nói (hội viên trước tên khách, ghi chú, món đã thích) có `label` (review G3). Giữ dạng chữ: ký hiệu trong số liệu (cột "5★", "Bạc xỉu 4★") và ký tự trong nhãn chữ của nút / link ("+ Thêm …", "← Về …", "Sau ›"). Test E2E: bỏ emoji khỏi 6 chuỗi mong đợi; kiểm sao chấm điểm bằng lớp SVG tô đặc / rỗng thay ký tự ★ / ☆ (cùng ý WCAG 1.4.1). |
| D-56 | **Sàn chất lượng (craft floor)**: (1) độ nổi khai báo một lần — thẻ ở quầy / quản lý phẳng có viền, thẻ món / đơn của khách có bóng không viền, lớp nổi (hộp thoại, ngăn kéo, sheet, toast, thanh giỏ) có bóng; (2) không vạch màu dày một bên, không vạch nhấn dày trên góc bo — trạng thái thể hiện bằng chấm màu, tiêu đề cột và badge; (3) tô bề mặt trình duyệt theo bảng màu: bôi chọn chữ, con trỏ nhập, thanh cuộn, `accent-color`, gạch chân link; (4) `prefers-reduced-motion: reduce` — bỏ hiệu ứng lặp và trượt, trạng thái vẫn đổi ngay. |
| D-58 | **Menu quản lý gọn theo nhóm** (chủ dự án 23/10/2026, kèm ảnh thanh bên: "nhìn nhiều quá bị rối"): "Hôm nay" luôn ở trên; 23 trang còn lại chia 6 nhóm thu gọn được — Tổng quan (báo cáo, phân tích, lãi / lỗ), Thực đơn (món, tùy chọn, combo, lịch), Kho hàng, Khách hàng (hội viên, tích điểm, khuyến mãi, gợi ý, đánh giá), Thu chi & nhân sự, Hệ thống (bàn & QR, tài khoản, nhật ký, cài đặt, tra cứu API); thay cách chia nhóm của ADR-005 / ADR-006 (chỉ đổi điều hướng, không đổi trang, quyền, URL). Nhóm chứa trang đang mở tự mở; nhóm người dùng tự mở được nhớ trên trình duyệt. Tên mục ngắn một dòng; tên đầy đủ vẫn là tiêu đề trang và hiện khi rê chuột. Không vạch màu ở mục đang chọn. Test "tra cứu API" thêm bước mở nhóm Hệ thống. |
| D-57 | **Giữ nền kem** dù bộ dò báo `cream-palette`: nền kem sữa thuộc thế giới quán cà phê đã chốt ở ADR-012 D-52 (Impeccable: "The brief wins" — hướng đã chốt thắng cảnh báo mẫu chung). Ghi là ngoại lệ có chủ đích; đổi nền là quyết định của chủ dự án. |

## Phương án đã cân nhắc

- **Cài Impeccable vào dự án (plugin + hook dò tự động):** chưa làm — cần chủ dự án duyệt (tải chương trình chạy trên máy, đổi cấu hình `.claude/`).
- **Thư viện icon dạng font / npm (Lucide package, Font Awesome):** bị loại — thêm dependency, tải cả bộ trong khi chỉ cần ~30 hình.
- **Giữ emoji:** bị loại — hình và màu phụ thuộc hệ điều hành (Windows / Android / iOS khác nhau), không cùng nét, không đổi màu theo bảng màu.

## Hệ quả

- Sửa: `css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`; 28 tệp JS + 4 tệp HTML (chỉ phần hiển thị: chèn biểu tượng, bỏ emoji; `admin-shell.js` dựng menu nhóm D-58; `t-menu.js` cuộn tới nhóm món không mượt khi người dùng tắt chuyển động); thêm `js/icons.js` (38 hình). `kiểm-thử/e2e/flow.spec.js`: 6 chuỗi bỏ emoji, 3 kiểm tra sao đổi sang lớp SVG, 1 bước mở nhóm menu.
- Không đổi API, SP, migration, quyền, business rule, realtime, dữ liệu.
- Tài liệu: [design-system.md](../giao-diện/design-system.md) (biểu tượng, độ nổi, bề mặt trình duyệt, chuyển động), ảnh màn hình.
- Task: [TASK-066](../công-việc/TASK-066.md).
