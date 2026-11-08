# ADR-044 — Trang Quản lý luôn phải đăng nhập bằng mật khẩu

- **Trạng thái:** ACCEPTED (08/11/2026).
- **Nguồn:** chủ dự án gửi ảnh trang Đăng nhập Quản lý có thẻ "Máy này đang đăng nhập màn hình quầy: Quản lý (Chủ quán) [Vào bằng tài khoản này]": "sao bấm nó vào luôn vậy phải đăng nhập hay j chứ bạn làm vậy còn gì là bảo mật nữa".
- **Bối cảnh:**
  - [ADR-038](ADR-038-trang-quan-ly-rieng.md) D-174 cho phiên trang Quản lý **đi theo phiên máy quầy** để đỡ gõ lại mật khẩu, qua ba lối:
    1. nút **"Vào bằng tài khoản này"** ở trang Đăng nhập Quản lý;
    2. nút "Quản lý" của máy quầy (`?from=pos`);
    3. mở `/admin` khi chưa có phiên Quản lý mà máy đang đăng nhập quầy — tự dùng phiên máy quầy.
  - [ADR-043](ADR-043-chu-quan-chi-quan-ly.md) D-196 thêm một lối nữa: phiên máy quầy cũ đứng tên chủ quán được đổi thẳng thành phiên Quản lý.
  - Cả bốn lối cho bất kỳ ai đứng trước máy quầy (máy dùng chung, đang đăng nhập bằng người có quyền Quản lý) vào trang Quản lý **mà không gõ mật khẩu**.
  - Ảnh của chủ dự án là phiên quầy cũ của chủ quán còn sót trên máy từ trước F-084.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-199 | **Phiên trang Quản lý chỉ có được bằng đăng nhập (gõ mật khẩu).** <br>• Bỏ "Vào bằng tài khoản này". <br>• Bỏ `?from=pos`: nút "Quản lý" của máy quầy mở trang Quản lý; chưa đăng nhập trang Quản lý thì sang `/admin/login?next=…`, gõ xong về đúng trang. <br>• Bỏ việc tự dùng phiên máy quầy khi mở `/admin`. <br>• Phiên "đi theo" cũ còn trong máy (`adopted`) bị bỏ khi đọc; khóa `cf_admin_skip` được dọn. <br>• Hai cách tạo phiên Quản lý: gõ mật khẩu ở `/admin/login`, hoặc chủ quán gõ mật khẩu ở màn đăng nhập quầy (F-084: chuyển sang trang Quản lý bằng chính mật khẩu vừa gõ). |
| D-200 | **Phiên máy quầy cũ đứng tên chủ quán** (sửa ADR-043 D-196): bị **bỏ**, sang `/admin/login?reason=owner` ("Tài khoản Chủ quán chỉ dùng trang Quản lý — đăng nhập để tiếp tục") — phải gõ mật khẩu, không đổi thành phiên Quản lý. |

## Phương án đã cân nhắc

- **Giữ "đi theo" nhưng hỏi lại mật khẩu khi bấm:** thực chất vẫn là đăng nhập lại; một trang đăng nhập duy nhất rõ ràng hơn.
- **Giữ "đi theo" cho người không phải chủ quán:** vẫn là lối không mật khẩu vào sổ quỹ, báo cáo, kho trên máy dùng chung — chủ dự án đặt bảo mật lên trước.

## Hệ quả

- **Giao diện:**
  - `auth-store.js`: `getAdminSession` chỉ nhận phiên đăng nhập; bỏ `SKIP` và `follow`.
  - `auth.js`: bỏ `followPosIfAsked`; phiên quầy cũ của chủ quán → `/admin/login?reason=owner`.
  - `admin-login.js`: bỏ thẻ "Vào bằng tài khoản này"; thêm thông báo `reason=owner`. `admin/login.html` bỏ `#follow`.
  - `pos-shell.js`: nút "Quản lý" không còn `?from=pos`.
  - `admin.css`: bỏ `.admin-login-follow`.
  - Máy chủ không đổi: quyền vẫn kiểm mỗi request.
- **Người dùng:**
  - Người đứng quầy bấm "Quản lý" lần đầu phải gõ mật khẩu. Phiên Quản lý giữ tới khi bấm Đăng xuất hoặc hết hạn.
  - Máy quầy dùng chung: nhớ bấm Đăng xuất trang Quản lý khi rời máy.
- **E2E:**
  - Nhân viên / trưởng ca đứng quầy mở `/admin/…` → trang Đăng nhập Quản lý.
  - Trưởng ca mở Hôm nay ở `/admin/login`.
  - Quản lý cửa hàng bấm "Quản lý" → gõ mật khẩu.
  - Bài F-080 kiểm không có "Vào bằng tài khoản này".
  - Bài F-084 kiểm phiên quầy cũ của chủ quán → trang đăng nhập.
