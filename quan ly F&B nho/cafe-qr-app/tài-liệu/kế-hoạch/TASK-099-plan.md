# TASK-099 — Kế hoạch: giỏ hàng gọn, bấm món trong giỏ để sửa (F-082, ADR-040)

## Khảo sát (tên thật)
| Thứ | Ở đâu | Tình trạng trước |
| --- | --- | --- |
| Dòng giỏ | `t-menu.js lineNode` — tên, tùy chọn, giá, bước số lượng, **ô ghi chú** (`aria-label="Ghi chú cho …"`) + **6 nút nhanh** (`NOTE_CHIPS`) | Giỏ dài, trùng với bảng chọn F-081 |
| Bảng chọn | `options.js pickItem` (F-081) — chỉ để thêm món | Chưa nhận lựa chọn cũ |
| Giỏ | `cart.js addItem(…, { quantity, note })` | Chưa có thao tác thay một dòng |
| E2E dùng ô ghi chú trong giỏ | "giỏ còn sau khi tải lại…" (AC-002-04), "bảng chọn món…" (AC-081-02) | — |

## Thiết kế
- `cart.js replaceLine(lines, key, item, choice, { quantity, note })`: bỏ dòng cũ, trùng dòng khác → gộp (≤ 50), không thì chèn lại đúng vị trí (giữ khóa nếu cùng món + tùy chọn).
- `pickItem`: `initial` (tùy chọn, ghi chú, số lượng), `confirmLabel` ("Cập nhật").
- `lineNode`: khối thông tin là nút `.cart-line-main` ("Sửa ›", "Ghi chú: …"), bước số lượng bên phải; `editLine` mở bảng chọn → `replaceLine`.

## Rủi ro
| Rủi ro | Xử lý |
| --- | --- |
| Hai lớp sheet chồng (giỏ + bảng chọn) | Bảng chọn đóng xong giỏ vẽ lại (`changed`); E2E kiểm dòng đổi tại chỗ |
| Vùng chạm dòng giỏ nhỏ | `.cart-line-main` cao ≥ 44 px; bài a11y kiểm vùng chạm |
| Bài E2E cũ dùng ô ghi chú trong giỏ | Đổi sang bảng chọn + kiểm chữ "Ghi chú: …" |

## Kiểm chứng
`npm run lint` · `npm run format:check` · `npm test` · `npm run test:e2e` · `npm run trace -- --check`. Không migration.
