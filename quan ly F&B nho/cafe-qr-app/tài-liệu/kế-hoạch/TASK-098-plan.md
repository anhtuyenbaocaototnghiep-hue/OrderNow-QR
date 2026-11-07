# TASK-098 — Kế hoạch: bảng chọn món của khách (F-081, ADR-039)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Thẻ món | `t-menu.js` `itemCard` (ảnh `thumb`, tên, giá, dòng "Chọn size / tùy chọn ›"), `renderControl` ("+" / bước số lượng / số trong giỏ) | Tên, ảnh không bấm được |
| Thêm món | `quickAdd` → `defaultChoice` → `addItem` (món có mặc định thêm ngay); `chooseOptions` → `pickOptions` (chỉ tùy chọn) | Ghi chú, số lượng chỉ chỉnh trong giỏ |
| Giỏ | `cart.js addItem(lines, item, choice)` gộp theo món + tùy chọn; `lineNode` (ô ghi chú + 6 nút nhanh, bước số lượng) | — |
| Quầy | `pos-takeaway.js`, `pos-table-order.js` dùng `pickOptions` + `addItem` | — |
| Máy chủ | `zOrderItems` cho phép nhiều dòng cùng món; `OrderItems` không có ràng buộc trùng | Đã nhận dòng trùng (cần test) |

## Thiết kế
- `options.js`: tách phần nhóm tùy chọn dùng chung (`optionGroups`); `pickOptions` giữ nguyên hành vi (quầy); `pickItem` mới cho khách: đầu bảng, nhóm tùy chọn, ghi chú (nút nhanh + ô), số lượng, nút "Thêm vào giỏ · tổng" cập nhật trực tiếp; focus nút chính (không bật bàn phím).
- `cart.js addItem(…, { quantity, note })`: có `note` → gộp theo món + tùy chọn + ghi chú, khác ghi chú → khóa `key~n`; không có `note` → như cũ (quầy).
- `t-menu.js`: `openItem` (bảng chọn), tên món là nút, bấm ảnh mở; `quickAdd` món có tùy chọn → `openItem`; "Gọi lại" thêm đúng số lượng + ghi chú; ô điều khiển thẻ món hiện số trong giỏ khi món có nhiều dòng.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Món có tùy chọn thêm 1 chạm (NFR-003) | Chủ quán chọn; ghi ở NFR-003, ADR-039 D-179; món không tùy chọn giữ ≤ 3 chạm (E2E cũ vẫn chạy) |
| Đổi `addItem` làm lệch giỏ ở quầy | Chỉ tách theo ghi chú khi truyền `note`; quầy không truyền |
| Máy chủ gộp / từ chối dòng trùng | Test integration AC-081-01 |
| Bàn phím điện thoại bật khi mở bảng | Focus nút "Thêm vào giỏ" |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.
