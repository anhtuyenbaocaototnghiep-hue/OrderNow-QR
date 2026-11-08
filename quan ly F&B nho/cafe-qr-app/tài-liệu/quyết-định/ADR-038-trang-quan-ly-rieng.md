# ADR-038 — Trang Quản lý riêng: đăng nhập riêng, phiên riêng với máy quầy

- **Trạng thái:** ACCEPTED (07/11/2026). Chủ dự án: "tôi muốn admin nó là một trang riêng biệt thì được không"; agent đề xuất "Trang Quản lý riêng"; chủ dự án: "duyệt".
- **Bổ sung bởi [ADR-043](ADR-043-chu-quan-chi-quan-ly.md) (08/11/2026):** chủ quán không đăng nhập máy quầy → "đi theo phiên máy quầy" / "Vào bằng tài khoản này" chỉ còn cho quản lý cửa hàng và người được cấp trang Quản lý; chủ quán không có lối "Mở màn hình quầy".
- **Bối cảnh:** chủ quán đăng nhập ở `/pos/login` (màn đăng nhập quầy), vào màn hình quầy trước rồi mới bấm "Quản lý". Trang Quản lý và máy quầy dùng chung một phiên trên máy: đăng xuất trang Quản lý là đăng xuất máy quầy (kèm kiểm đóng ca, chấm công ra); quản lý cửa hàng đăng nhập từ nhà để xem báo cáo bị tính là vào ca.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-173 | Địa chỉ riêng cho chủ quán lưu: **`/admin`** → Hôm nay; chưa đăng nhập → trang **Đăng nhập Quản lý** (`/admin/login`, SCR-56, giao diện trang Quản lý). Đăng nhập xong vào thẳng Hôm nay (hoặc trang Quản lý đầu tiên được mở; có `next` thì về trang đó). |
| D-174 | **Phiên riêng** trên trình duyệt: trang Quản lý (`/admin/…`) giữ phiên khác máy quầy (`/pos/…`) — đăng nhập / đăng xuất bên này không làm văng bên kia. Đi từ nút "Quản lý" của máy quầy (`?from=pos`) hoặc mở `/admin` khi chưa có phiên Quản lý mà máy đang đăng nhập quầy → phiên Quản lý **đi theo** phiên máy quầy (máy quầy đổi người / đăng xuất thì bỏ theo). Đăng xuất trang Quản lý khi đang đi theo → không tự dùng lại phiên máy quầy đó. Trang Đăng nhập Quản lý có nút **"Vào bằng tài khoản này"** khi máy đang đăng nhập quầy bằng người có quyền. |
| D-175 | Đăng nhập ở trang Quản lý (`POST /api/auth/login` `area: 'admin'`) **không chấm công vào**; **Đăng xuất** ở trang Quản lý chỉ xóa phiên Quản lý trên máy (không gọi đăng xuất máy chủ → không chấm công ra, không bắt đóng ca). Sai mật khẩu vẫn tính khóa tạm như đăng nhập thường. |
| D-176 | Chỉ người có trang Quản lý (chủ quán, quản lý cửa hàng, người được cấp — F-079) hoặc trang Hôm nay (trưởng ca) vào được; người khác thấy "chưa có quyền vào trang Quản lý" + chọn phần cần xin + **Xin quyền** ngay ở trang đăng nhập (phiên vừa đăng nhập dùng để gửi, không lưu). Mở trang Quản lý không được phép mà còn trang Quản lý khác → ở lại trang Quản lý (trang đầu tiên được mở) kèm thanh Xin quyền; không còn trang nào → về máy quầy (nếu máy đang đăng nhập quầy) hoặc trang Đăng nhập Quản lý. |
| D-177 | Thanh bên Quản lý: **"Mở màn hình quầy"** mở ở tab mới. Máy quầy giữ nút "Quản lý" cho người có quyền. Quyền, dữ liệu, máy chủ không đổi. |

## Phương án đã cân nhắc

- **Cổng / ứng dụng riêng cho trang Quản lý:** phải chạy và bảo vệ thêm một máy chủ, đổi địa chỉ QR / cấu hình — không cần cho mạng nội bộ quán.
- **Tách hẳn, không đi theo phiên máy quầy:** chủ quán đang đứng quầy bấm "Quản lý" phải đăng nhập lại mỗi lần — phiền; chọn "đi theo" khi đi từ máy quầy, độc lập khi đăng nhập ở `/admin/login`.
- **Bắt mọi người dùng `/admin/login`:** người đang quen đăng nhập ở máy quầy vẫn dùng được như cũ.

## Hệ quả

- Không migration. Máy chủ: `area` ở đăng nhập; `/admin` → `/admin/today`; trang `/admin/login`.
- Giao diện: `auth-store.js` (phiên Quản lý `cf_admin_session` + `cf_admin_skip`), `auth.js` (`requireStaffPage` theo khu, `adminLogout`), `api.js` (hết phiên → đúng trang đăng nhập), `admin-shell.js`, `admin-today.js`, `pos-shell.js` (`?from=pos`), trang `admin/login.html` + `admin-login.js`.
- Máy quầy dùng chung: chủ quán đăng nhập trang Quản lý trên máy quầy nên bấm Đăng xuất trang Quản lý khi rời máy (phiên Quản lý không hết khi máy quầy đổi người nếu đăng nhập riêng).
