# ADR-043 — Tài khoản Chủ quán chỉ dùng trang Quản lý

- **Trạng thái:** ACCEPTED (08/11/2026). D-196 (phiên quầy cũ của chủ quán) sửa bởi [ADR-044](ADR-044-quan-ly-luon-dang-nhap.md) D-200. Chủ dự án hỏi "vì sao admin vẫn có thể vào màn hình quầy"; agent trả lời là theo bảng quyền ADR-035 và đề xuất giữ (chủ quán đứng quầy thay khi vắng người) hoặc chặn. Chủ dự án chọn (kèm ảnh trang Quản lý — Hôm nay): "tài khoản admin chỉ ở trong này thôi không có ra màn hình quầy cố định luôn".
- **Bối cảnh:**
  - Bảng quyền [ADR-035](ADR-035-phan-quyen-quan-ly-cua-hang.md) §4.6: dòng "Bán, thu tiền, mở / đóng ca, ghi chi quỹ…" — Chủ quán: Có.
  - Màn đăng nhập quầy (`/pos/login`) nhận mọi tài khoản đang hoạt động. Trang Quản lý có lối "Mở màn hình quầy" (F-080) và nút "Mở trang ca ở quầy". Hôm nay có việc cần làm dẫn về `/pos/shift`, `/pos/stock`.
  - Trang in hóa đơn (`/pos/…/receipt`) chỉ đọc phiên máy quầy, nên chủ quán đăng nhập riêng trang Quản lý không in lại được.
  - Duyệt ở quầy (giảm giá vượt ngưỡng, chi quỹ, hoàn tiền) kiểm tài khoản người duyệt ngay trong yêu cầu (`resolveApproval`), không qua đăng nhập.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-196 | **Chủ quán không đăng nhập máy quầy — cố định, không có cài đặt bật / tắt.** <br>• Màn đăng nhập quầy luôn gửi `area: 'pos'`. Máy chủ trả `403 OWNER_ADMIN_ONLY` "Tài khoản Chủ quán chỉ dùng trang Quản lý — không đăng nhập máy quầy" cho vai ADMIN. Lỗi này chỉ trả **sau khi đúng mật khẩu**: sai mật khẩu vẫn chỉ là "Sai tên đăng nhập hoặc mật khẩu", không lộ vai trò. Lần bị từ chối không tính là gõ sai, không chấm công, không cấp token. <br>• Màn đăng nhập quầy nhận lỗi này thì **tự đăng nhập trang Quản lý** bằng chính mật khẩu vừa gõ (`area: 'admin'`, phiên Quản lý riêng) và chuyển sang Hôm nay, hoặc trang `/admin/…` trong `next`. <br>• Trang quầy gặp **phiên máy quầy cũ đứng tên chủ quán** (đăng nhập trước khi có luật) thì bỏ phiên đó, sang `/admin/login?reason=owner` — **phải gõ mật khẩu** (sửa bởi [ADR-044](ADR-044-quan-ly-luon-dang-nhap.md) D-200; bản đầu đổi thẳng thành phiên Quản lý). Không gọi đăng xuất máy chủ vì chủ quán không chấm công. <br>• Chỉ vai **Chủ quán**. Quản lý cửa hàng, trưởng ca, nhân viên đứng quầy như cũ. "Đổi người" bằng PIN vốn đã không cho chọn chủ quán. |
| D-197 | **Trang Quản lý không còn lối sang máy quầy cho chủ quán.** <br>• Ẩn "Mở màn hình quầy" ở thanh bên và "Mở trang ca ở quầy →" ở Lịch sử ca; người khác có trang Quản lý vẫn thấy. <br>• Việc cần làm ở Hôm nay dẫn tới trang Quản lý tương ứng: khoản chi chờ duyệt → **Sổ quỹ** (`/admin/cash`, duyệt / từ chối khi ca còn mở); đơn đặt hàng đến hạn → **Đặt hàng** (`/admin/purchasing`, "Nhận hàng"); lô hết hạn → **Nguyên liệu** (`/admin/ingredients`, hủy lô); kiểm kê → **Kho** (như cũ). <br>• In lại hóa đơn từ Báo cáo mở `/pos/…/receipt?area=admin`. Trang in có `area=admin` dùng phiên Quản lý (`auth-store.isAdminArea`). |
| D-198 | **Giữ nguyên:** <br>• **Duyệt hộ ở quầy:** chủ quán vẫn nhập tài khoản vào hộp duyệt trên máy của nhân viên (giảm giá vượt ngưỡng, chi quỹ, hoàn tiền). Đây là duyệt từng việc, không mở phiên máy quầy. <br>• **Gọi API không gửi `area`** (công cụ, script, test tự động) vẫn đăng nhập được như trước. Luật nằm ở màn đăng nhập quầy và các trang quầy. <br>• **Ca do chủ quán mở từ trước:** nhân viên đếm tiền, đóng ca ở quầy như ca thường, vì đóng ca không cần đúng người mở. <br>• Thay bảng ADR-035 §4.6: dòng "Bán, thu tiền, mở / đóng ca, ghi chi quỹ, sơ chế, hủy hàng, nhận hàng" — cột Chủ quán **Không (chỉ trang Quản lý; duyệt hộ bằng tài khoản)**. |

## Phương án đã cân nhắc

- **Giữ như cũ (chủ quán đứng quầy được):** agent đề xuất vì quán nhỏ hay cần chủ quán bán thay. Chủ dự án chọn chặn, muốn tách hẳn việc quản lý với việc đứng quầy.
- **Cài đặt bật / tắt:** chủ dự án nói "cố định luôn".
- **Chặn mọi API quầy với token chủ quán:** trang Quản lý dùng chung nhiều endpoint với quầy (đơn, ca, sổ quỹ, in). Công cụ và test cũng gọi bằng token chủ quán. Hộp duyệt ở quầy dùng tài khoản chủ quán. Luật là "không đứng quầy" nên chặn ở cửa vào: đăng nhập quầy và trang quầy.
- **Báo lỗi ở màn quầy, bắt sang trang khác gõ lại:** thêm một bước vô ích. Tự chuyển bằng mật khẩu vừa gõ thì nhanh và vẫn rõ ràng, vì chủ quán luôn nằm ở trang Quản lý.

## Hệ quả

- **Máy chủ:**
  - `routes/public.js`: `area` của `POST /api/auth/login` thành tùy chọn.
  - `userService.login`: thêm `OWNER_ADMIN_ONLY` khi `area === 'pos'` và vai ADMIN.
  - Không migration, không đổi dữ liệu.
- **Giao diện:**
  - `pos-login.js`: gửi `area: 'pos'`; `ownerToAdmin`.
  - `auth.js`: `requireStaffPage` bỏ phiên quầy cũ của chủ quán, sang trang Đăng nhập Quản lý (ADR-044 D-200).
  - `auth-store.js`: `isAdminArea` nhận trang in có `area=admin`.
  - `admin-shell.js`, `admin-shifts.js`: ẩn lối sang quầy cho chủ quán.
  - `admin-today.js`: việc cần làm dẫn tới trang Quản lý.
  - `admin-reports.js`: in lại thêm `area=admin`.
- **Vận hành:** quán cần ít nhất một tài khoản nhân viên / trưởng ca / quản lý cửa hàng để bán hàng. Chủ quán tạo ở Hệ thống → Tài khoản.
- **Kiểm thử:**
  - E2E: trang dùng chung `P` vào trang Quản lý bằng chủ quán ở `/admin/login` và đứng quầy bằng quản lý cửa hàng `quay-ql`.
  - Bài F-080: máy quầy đăng nhập bằng quản lý cửa hàng (sau đó ADR-044 bỏ hẳn "Vào bằng tài khoản này").
  - a11y: đăng nhập trang Quản lý ở `/admin/login`.
