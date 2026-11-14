# TASK-109 — Kế hoạch: Kho nguyên liệu gọn + gộp Nhà cung cấp vào Nhập kho & kiểm kê (F-089)

| Thứ | Ở đâu | Việc |
| --- | --- | --- |
| API | `repositories/ingredientsRepo.js` (`SELECT` dùng chung cho `list`, `getById`, `lowStock`) | `OUTER APPLY` lấy `MIN(ExpiryDate)` của lô mở còn hàng có hạn (chỉ khi `TrackLots = 1`) + `DATEDIFF` theo ngày VN + tổng lượng các lô cùng ngày; `mapIngredient` trả `nextExpiry`, `nextExpiryDays`, `nextExpiryQty`. Không đổi SP / schema |
| Kho nguyên liệu | `js/pages/admin-ingredients.js`, `css/admin.css` | 4 cột (gộp tồn / giữ / khả dụng / ngưỡng vào "Còn dùng được"), cột Hạn sử dụng, dải Sắp hết hạn; dòng: Điều chỉnh · Sửa · ⋯; "⋯" = ngăn `modal({ drawer: true })` gọi lại các hộp sẵn có (`history`, `lotsDialog`, `recipeDialog`, `advancedDialog`, `confirmAndDelete`); "Theo dõi hạn" = `PUT …/advanced` với các giá trị hiện có + `trackLots: true` |
| Hàng thẻ chung | `js/stock-nav.js` (mới), `admin-stock.js`, `admin-purchasing.js`, `admin/purchasing.html` | `stockTabs(page, active, onPick)`, `initialTab(page, fallback)` (`?tab=`); thẻ trang kia → `location.href` |
| Thanh bên | `js/admin-shell.js` | Bỏ mục `purchasing`; `NAV_ALIAS = { purchasing: 'stock' }` để mục sáng + nhóm mở; quyền / ẩn nhóm (`MODULE_OF`) giữ nguyên |
| Hôm nay | `js/pages/admin-today.js` | Link "đơn đặt hàng đến hạn nhận" → `/admin/purchasing?tab=pos` |
| Test | `tests/ingredient-expiry.test.js` (mới), `flow.spec.js`, `a11y.spec.js` | AC-089-01…05; sửa 2 bài bấm nút cũ trên dòng nguyên liệu |

Rủi ro:
- Hai bài E2E cũ bấm "Xóa" / "Kho nâng cao" trên dòng → đã chuyển sang "⋯" (giữ nguyên ý kiểm).
- Ngăn "⋯" đóng (View Transition) rồi mở hộp khác ngay: focus trả về "⋯" trước khi hộp mới mở nên hộp mới nhận "⋯" làm nơi trả focus.
- Bảng nguyên liệu ở 320 px nằm trong `.table-wrap` (cuộn trong khung), trang không cuộn ngang.
