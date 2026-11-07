---
name: bang-chon-mon
description: Bảng chọn món của khách cho cafe-qr-app (FEATURE-081, ADR-039, TASK-098) — bấm "+" món có tùy chọn, tên món hoặc ảnh → sheet trượt lên ngay (pickItem trong js/options.js: nhóm tùy chọn có mặc định, ghi chú nhanh + ô gõ, số lượng, nút "Thêm vào giỏ · tổng"); món không tùy chọn "+" vẫn thêm ngay (NFR-003 ≤ 3 chạm); cart.js addItem(…, { quantity, note }) tách dòng theo ghi chú (khóa key~n), máy quầy không truyền note nên giữ hành vi cũ; máy quầy vẫn dùng pickOptions. Dùng khi task giao F-081 / ADR-039 / TASK-098 / AC-081-xx, khi sửa màn gọi món của khách (t-menu.js), giỏ hàng, tùy chọn món, ghi chú món, hoặc nhắc "bảng chọn món", "chọn size", "topping", "ghi chú món", "bấm món hiện ra luôn", "3 chạm".
---

# Mục đích

Ghi lại **bảng chọn món của khách** (07/11/2026, TASK-098) để agent sau sửa màn gọi món mà không làm mất số lượng / ghi chú, không đổi nhầm máy quầy.

| Tài liệu | Đường dẫn |
| --- | --- |
| Quyết định | `tài-liệu/quyết-định/ADR-039-bang-chon-mon.md` (D-178…D-181) |
| Feature + AC | `tài-liệu/chức-năng/FEATURE-081.md` (AC-081-01, 02) |
| Quy tắc / màn | BR-119 · SCR-57 (`giao-diện/sitemap.md`, `screens-flows.md`) · NFR-003 (`sản-phẩm/nfr.md`) |

# Khi dùng

- Thêm phần mới vào bảng chọn (ví dụ ảnh lớn, mô tả món) → `pickItem` nhận `head` do `t-menu.js openItem` dựng; phần chung với máy quầy là `optionGroups` (đừng đổi hành vi `pickOptions`).
- Đổi luật gộp dòng giỏ → `cart.js addItem`: có `note` (khách) gộp theo món + tùy chọn + ghi chú; không `note` (quầy, "+" nhanh) gộp theo món + tùy chọn.
- Chủ quán muốn máy quầy cũng mở bảng chọn → dùng `pickItem` ở `pos-takeaway.js` / `pos-table-order.js` (cần ADR mới — ADR-039 D-181 giữ quầy nhanh).

# Quy tắc (BR-119)

- Món có tùy chọn: "+", tên (`.c-name-btn`), ảnh → `openItem` → `pickItem`; giỏ chỉ đổi khi bấm "Thêm vào giỏ".
- Món không tùy chọn: "+" → `addItem` ngay; tên / ảnh → `pickItem` (ghi chú, số lượng; combo không có ghi chú).
- Ô điều khiển thẻ món: món có tùy chọn hoặc có nhiều dòng → số trong giỏ (`.qty-badge`) + "+"; một dòng → bước số lượng.
- "Gọi lại" đơn cũ: `addItem(…, { quantity, note })` — ghi chú khác thành dòng riêng.
- Bảng chọn focus nút chính để không bật bàn phím điện thoại.

# Chỗ dễ sai

- Dữ liệu test E2E chỉ gắn tùy chọn cho Bạc xỉu (bài "tùy chọn món + combo"); script chụp màn hình phải tự tạo nhóm tùy chọn qua `/api/admin/modifier-groups`.
- Các bài E2E bấm "+" phải dùng món không tùy chọn — `.add-btn` `.first()` từng trúng Bạc xỉu (đầu danh mục "Cà phê", có Size sau bài "tùy chọn món + combo") và mở bảng chọn chặn bước mở giỏ (bài chính sách dữ liệu, đã sửa sang Cà phê đen).
- Giỏ vẫn còn ô ghi chú + nút nhanh mỗi dòng (mục "gọn giỏ" chưa được chủ quán chọn).

# Kiểm chứng

`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Số liệu: `TASK-098.md`.
