# ADR-045 — Từ trang Quản lý mở máy quầy không phải đăng nhập lại

- **Trạng thái:** ACCEPTED (08/11/2026).
- **Nguồn:** chủ dự án (tài khoản Quản lý cửa hàng): "tôi đăng nhập bằng nik chủ cửa hàng nó vào quản lý mà khi bấm trở lại màn hình quầy nó lại bị văng ra kêu nhập đăng nhập lại nó mới vào màn hình quầy vậy rất mất thời gian làm một lần thôi".
- **Bối cảnh:**
  - F-080 (ADR-038) tách phiên trang Quản lý với phiên máy quầy. Đăng nhập trang Quản lý không tạo phiên máy quầy, vì đăng nhập máy quầy kéo theo chấm công vào.
  - Người làm cả hai bên (quản lý cửa hàng, trưởng ca) đăng nhập trang Quản lý xong, bấm "Mở màn hình quầy" thì bị hỏi đăng nhập lần nữa. Máy còn phiên quầy cũ đã hết hạn (8 giờ) cũng bị đẩy ra trang đăng nhập.
  - [ADR-044](ADR-044-quan-ly-luon-dang-nhap.md) vừa chốt: vào trang Quản lý phải gõ mật khẩu, vì máy quầy dùng chung.
- **Nguyên tắc chung (ADR-044 + ADR-045):**
  - Vào khu nhiều quyền hơn (trang Quản lý) thì phải gõ mật khẩu.
  - Đã gõ mật khẩu ở trang Quản lý thì sang máy quầy không hỏi lại: cùng một người, máy quầy ít quyền hơn.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-201 | **"Mở màn hình quầy"** (thanh bên Quản lý) và **"← Màn hình quầy"** (Hôm nay bản gọn của trưởng ca) mở `/pos?from=admin`. Máy quầy chưa có ai đăng nhập (hoặc phiên quầy cũ hết hạn / đứng tên chủ quán) thì dùng luôn phiên Quản lý của người vừa đăng nhập: gọi `POST /api/auth/pos-session` để chấm công vào như đăng nhập quầy, rồi lưu chính token đó làm phiên máy quầy. **Không hỏi lại mật khẩu, không cấp token mới** (không kéo dài phiên — vẫn hết hạn theo lần đăng nhập). Máy quầy **đang có người khác** đăng nhập (còn hạn) thì giữ nguyên người đó, không đá người đang đứng quầy ra. |
| D-202 | **Không đổi:** <br>• Quầy → trang Quản lý: chưa đăng nhập trang Quản lý thì vẫn phải gõ mật khẩu (ADR-044). Quản lý bắt đầu ở quầy sẽ gõ mật khẩu thêm **một lần** khi mở trang Quản lý lần đầu; sau đó cả hai phiên còn tới khi đăng xuất / hết hạn, đi qua lại không hỏi nữa. <br>• Chủ quán: `pos-session` → `403 OWNER_ADMIN_ONLY`, không có lối này (F-084). <br>• Đăng xuất hai bên vẫn riêng (F-080). |

## Phương án đã cân nhắc

- **Đăng nhập ở trang Quản lý thì tạo luôn phiên máy quầy:** sẽ chấm công vào cả khi quản lý chỉ xem báo cáo từ nhà (F-080 đã bỏ việc này). Chỉ tạo khi bấm mở máy quầy.
- **Cấp token mới cho máy quầy:** dùng một token để lấy token mới thì phiên sẽ không bao giờ hết hạn. Dùng lại token đang có là đủ, vì máy chủ kiểm quyền theo tài khoản chứ không theo khu.
- **Tự dùng phiên Quản lý mỗi khi mở `/pos` (không cần `?from=admin`):** đăng xuất máy quầy xong, mở lại `/pos` sẽ tự đăng nhập lại người đó. Chỉ làm khi bấm nút từ trang Quản lý.
- **Cả chiều quầy → trang Quản lý cũng không hỏi:** ai đứng máy quầy đang đăng nhập bằng tài khoản quản lý cũng mở được trang Quản lý. Đó đúng là điều ADR-044 vừa bỏ theo yêu cầu bảo mật của chủ dự án.

## Hệ quả

- **Máy chủ:** `POST /api/auth/pos-session` (`requireStaff`) → `userService.startPosSession`: chặn chủ quán, `attendanceService.onLogin` (chế độ theo đăng nhập; `sp_ClockIn` không tạo bản ghi thứ hai), trả `{ user }`.
- **Giao diện:** `auth.js` (`openPosFromAdmin` chạy đầu `requireStaffPage`, `whoIs`), `admin-shell.js` và `admin-today.js` (link `?from=admin`).
- **Test:** integration AC-080-04 (`admin-area.test.js`), E2E AC-080-05.
