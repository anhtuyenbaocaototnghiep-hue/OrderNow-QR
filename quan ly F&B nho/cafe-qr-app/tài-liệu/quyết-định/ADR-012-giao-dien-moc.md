# ADR-012 — Làm mới giao diện theo chủ đề quán "Mộc"

- **Trạng thái:** PROPOSED (23/10/2026) — chờ chủ dự án xem giao diện mới rồi duyệt gộp `main`.
- **Bối cảnh:**
  - Chủ dự án yêu cầu ngày 23/10/2026: "rà soát trên gg và trên các thư viện liên quan tới chủ đề project … sửa lại giao diện bố cục và màu sắc phù hợp với đề tài project … không được đụng đến dữ liệu project".
  - Giao diện hiện tại (design-system bước 09) đã dùng tông nâu / kem nhưng còn phông hệ thống, bố cục phẳng, chưa có nét riêng của quán. Tên quán trong dữ liệu là "Cà phê Mộc" (mộc = gỗ, tự nhiên, mộc mạc).
  - ADR-002 (D-4): FE HTML/CSS/JS thuần, không thư viện UI (Bootstrap, React…). App chạy trong LAN của quán, có thể không có Internet.
- **Nguồn tham khảo (tra cứu 23/10/2026):**
  - Bảng màu quán cà phê: tông trung tính ấm (latte → espresso), chỉ một màu nhấn, chữ tương phản cao — [media.io coffee shop palette](https://www.media.io/color-palette/coffee-shop-color-palette.html), [Figma coffee color](https://www.figma.com/colors/coffee/), [Linearity espresso](https://www.linearity.io/academy/colors/espresso/), [Designyourway coffee palettes](https://www.designyourway.net/blog/coffee-color-palettes/).
  - Menu QR / app gọi món: bo góc, bóng nhẹ, chữ dễ đọc, vùng chạm lớn, thời gian chờ rõ — [Uxcel QR digital menu for cafe](https://app.uxcel.com/showcase/qr-digital-menu-for-cafe-579), [Double R Cafe ordering app](https://anastasiakai.notion.site/Double-R-Cafe-Mobile-ordering-app-42915224b4e649cb97e3e418253e8dd5), [cafe design skill](https://skillselion.com/skills/bergside/awesome-design-skills/cafe) (kem + espresso, bóng mềm, tiêu đề có chân).
  - Màn quầy / bếp: bảng 3 cột Mới → Đang làm → Xong, màu theo trạng thái, nhấn đơn chờ lâu; vùng chạm 44–64 px — [POS restaurant UI standard](https://skills.cat/skills/peterbamuhigire/skills-web-dev/pos-restaurant-ui-standard), [Lightspeed kitchen order flow](https://www.lightspeedhq.com/blog/master-kitchen-order-flow/), [Webstaurant KDS](https://www.webstaurantstore.com/article/1002/kitchen-display-systems.html).
  - Vùng chạm: WCAG 2.5.8 (AA) ≥ 24 px, 2.5.5 (AAA) ≥ 44 px, Apple HIG 44 pt, Material 48 dp — [Adrian Roselli](https://adrianroselli.com/2019/06/target-size-and-2-5-5.html), [TestParty WCAG target size](https://testparty.ai/blog/wcag-target-size-guide).
  - Phông tiếng Việt: Be Vietnam Pro (thiết kế cho dấu tiếng Việt, OFL-1.1) — [fontalternatives](https://fontalternatives.com/fonts/be-vietnam-pro/); gói `@fontsource/be-vietnam-pro@5.3.0`, `@fontsource/lora@5.3.0` (OFL-1.1) trên npm.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-52 | **Bảng màu "Mộc"**: espresso (chữ, thanh điều hướng tối), nâu rang (màu chính), kem sữa (nền), caramel (nhấn — chỉ trang trí hoặc nền có chữ trắng ở bản đậm), xanh lá (thành công — gợi "mộc", tự nhiên). Màu chính khai báo là token trong `:root` của `css/base.css` (vài sắc viền / hover phụ ghi cố định — liệt kê trong design-system); mọi cặp chữ / nền ≥ 4,5:1 và viền focus ≥ 3:1 (WCAG 2.2 AA), kiểm tự động bằng `kiểm-thử/e2e/a11y.spec.js`. |
| D-53 | **Phông chữ tự lưu trong app** (`public/fonts/`, kèm giấy phép OFL): **Be Vietnam Pro** 400–800 cho chữ giao diện, **Lora** 600–700 cho tiêu đề / tên quán. Chỉ nạp phần latin + tiếng Việt (`unicode-range`), `font-display: swap`. Không dùng CDN (chạy được khi LAN không có Internet), không thêm dependency npm. |
| D-54 | **Bố cục chỉ đổi bằng CSS** (thêm `meta theme-color` theo màu mới): giữ nguyên DOM, class, JS, API, realtime, dữ liệu. Không migration, không seed, không chạm `CafeQrDev`. Vùng chạm: nút thường ≥ 44 px ở quầy và khách (WCAG 2.5.5 / Apple HIG); nút nhỏ ≥ 36 px. |

## Phương án đã cân nhắc

- **Thư viện UI (Bootstrap, Tailwind, Pico…)**: bị loại theo ADR-002 / D-4; phải sửa class ở hơn 50 trang.
- **Nạp phông từ Google Fonts (CDN)**: bị loại — quán có thể không có Internet; thêm một bên thứ ba nhận địa chỉ IP khách.
- **Chủ đề tối hoàn toàn cho quầy**: bị loại — quầy thường sáng, màn tối khó đọc khi nắng; chỉ thanh điều hướng dùng nền tối.
- **Vùng chạm 56–64 px ở quầy** (theo hướng dẫn POS): bị loại lúc này — bảng 3 cột + panel bàn ở 1366 px sẽ phải cuộn nhiều; chọn 44 px (chuẩn HIG / WCAG AAA).

## Hệ quả

- Sửa: `css/base.css`, `css/customer.css`, `css/pos.css`, `css/admin.css`, `css/print.css` (hóa đơn giữ phông hệ thống); `meta theme-color` ở `t/index.html`, `t/menu.html`, `t/track.html`. Thêm: `public/fonts/` (14 tệp `.woff2` + 2 giấy phép).
- Không đổi API, SP, migration, quyền, business rule, realtime.
- Tài liệu: [design-system.md](../giao-diện/design-system.md) (token, phông, vùng chạm), ảnh màn hình `tài-liệu/giao-diện/ảnh/`.
- Task: [TASK-065](../công-việc/TASK-065.md).
