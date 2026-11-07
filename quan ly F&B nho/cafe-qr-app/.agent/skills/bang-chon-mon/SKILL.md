---
name: bang-chon-mon
description: Bảng chọn món + giỏ gọn của khách cho cafe-qr-app (FEATURE-081 / ADR-039 / TASK-098, FEATURE-082 / ADR-040 / TASK-099) — giỏ không còn ô ghi chú / nút nhanh, bấm món trong giỏ (.cart-line-main, editLine) mở lại bảng chọn với lựa chọn cũ → "Cập nhật" (cart.js replaceLine thay tại chỗ, trùng thì gộp); bấm "+" món có tùy chọn, tên món hoặc ảnh → sheet trượt lên ngay (pickItem trong js/options.js: nhóm tùy chọn có mặc định, ghi chú nhanh + ô gõ, số lượng, nút "Thêm vào giỏ · tổng"); món không tùy chọn "+" vẫn thêm ngay (NFR-003 ≤ 3 chạm); cart.js addItem(…, { quantity, note }) tách dòng theo ghi chú (khóa key~n), máy quầy không truyền note nên giữ hành vi cũ; máy quầy vẫn dùng pickOptions. Dùng khi task giao F-081 / F-082 / ADR-039 / ADR-040 / TASK-098 / TASK-099 / AC-081-xx / AC-082-xx, khi sửa màn gọi món của khách (t-menu.js), giỏ hàng, tùy chọn món, ghi chú món, hoặc nhắc "bảng chọn món", "chọn size", "topping", "ghi chú món", "bấm món hiện ra luôn", "3 chạm".
---

# Mục đích

Ghi lại **bảng chọn món của khách** (07/11/2026, TASK-098) để agent sau sửa màn gọi món mà không làm mất số lượng / ghi chú, không đổi nhầm máy quầy.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-039-bang-chon-mon.md` (D-178…D-181), `ADR-040-gio-hang-gon.md` (D-182…D-184) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-081.md` (AC-081-01, 02), `FEATURE-082.md` (AC-082-01, 02) |
| Quy tắc / màn | BR-119, BR-120 · SCR-57, SCR-03 (`giao-diện/sitemap.md`, `screens-flows.md`) · NFR-003 (`sản-phẩm/nfr.md`) |

# Khi dùng

- Thêm phần mới vào bảng chọn (ví dụ ảnh lớn, mô tả món) → `pickItem` nhận `head` do `t-menu.js openItem` dựng; phần chung với máy quầy là `optionGroups` (đừng đổi hành vi `pickOptions`).
- Đổi luật gộp dòng giỏ → `cart.js addItem`: có `note` (khách) gộp theo món + tùy chọn + ghi chú; không `note` (quầy, "+" nhanh) gộp theo món + tùy chọn.
- Chủ quán muốn máy quầy cũng mở bảng chọn → dùng `pickItem` ở `pos-takeaway.js` / `pos-table-order.js` (cần ADR mới — ADR-039 D-181 giữ quầy nhanh).

# Quy tắc (BR-119)

- Món có tùy chọn: "+", tên (`.c-name-btn`), ảnh → `openItem` → `pickItem`; giỏ chỉ đổi khi bấm "Thêm vào giỏ".
- Món không tùy chọn: "+" → `addItem` ngay; tên / ảnh → `pickItem` (ghi chú, số lượng; combo không có ghi chú).
- Ô điều khiển thẻ món: món có tùy chọn hoặc có nhiều dòng → số trong giỏ (`.qty-badge`) + "+"; một dòng → bước số lượng.
- "Gọi lại" đơn cũ: `addItem(…, { quantity, note })` — ghi chú khác thành dòng riêng.
- F-082: giỏ — `lineNode` chỉ có khối `.cart-line-main` (tên, tùy chọn, "Ghi chú: …", giá, "Sửa ›") + bước số lượng; bấm khối → `editLine` → `pickItem({ initial, confirmLabel: 'Cập nhật' })` → `replaceLine` (giữ vị trí, đổi tùy chọn đổi khóa, trùng dòng khác thì gộp ≤ 50, dòng không còn thì thêm).
- Bảng chọn focus nút chính để không bật bàn phím điện thoại.

# Chỗ dễ sai

- Dữ liệu test E2E chỉ gắn tùy chọn cho Bạc xỉu (bài "tùy chọn món + combo"); script chụp màn hình phải tự tạo nhóm tùy chọn qua `/api/admin/modifier-groups`.
- Các bài E2E bấm "+" phải dùng món không tùy chọn — `.add-btn` `.first()` từng trúng Bạc xỉu (đầu danh mục "Cà phê", có Size sau bài "tùy chọn món + combo") và mở bảng chọn chặn bước mở giỏ (bài chính sách dữ liệu, đã sửa sang Cà phê đen).
- Hai sheet chồng (giỏ + bảng chọn): trong E2E chọn bảng chọn bằng `[role="dialog"]` có `.item-sheet`, giỏ bằng `.sheet` có `.cart-line`; giỏ không còn `input[aria-label="Ghi chú cho …"]` — kiểm chữ "Ghi chú: …" trong dòng.
- Luật gộp / sửa dòng có test đơn vị `tests/cart-unit.test.js` (import thẳng `giao-diện/public/js/cart.js`, không cần CSDL).

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Số liệu: `TASK-098.md`, `TASK-099.md`.
