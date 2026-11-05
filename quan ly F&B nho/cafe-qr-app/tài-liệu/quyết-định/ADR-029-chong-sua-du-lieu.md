# ADR-029 — Chống sửa / xóa dữ liệu trái phép

- **Trạng thái:** ACCEPTED (05/11/2026). Chủ dự án hỏi "có lỗ hổng nào không", "có cách nào ngăn chặn triệt để không", rồi: "bạn có thể tăng cường bảo mật để ở phần backend để người ta ko lợi dụng để sửa".
- **Bối cảnh:** rà backend (05/11/2026) thấy:
  1. Trưởng ca (`attendance.edit`) sửa / thêm được chấm công **của chính mình** trong ngày — chỉ có nhật ký, không ai được báo. Sổ quỹ thì đã chặn tự duyệt (D-23).
  2. Ô "tài khoản duyệt" ở quầy (`resolveApproval`: giảm giá vượt ngưỡng, hoàn tiền, xóa món đã pha, duyệt / hủy sổ quỹ) kiểm mật khẩu quản lý / trưởng ca **không giới hạn số lần** — người đứng quầy dò được mật khẩu quản lý. Đăng nhập chỉ có giới hạn 5 lần / phút / máy (đủ để dò ~7.000 lần / ngày).
  3. Nhật ký thao tác đã chặn **sửa** (trigger 0027) nhưng **xóa** được bằng SQL; bảng tiền / ca / chấm công xóa cứng được bằng SQL dù app không bao giờ xóa.
  4. Tài khoản CSDL của app (`cafe_app`) là `db_owner` (cần cho migration) — không phải `sysadmin`.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-119 | **Không ai tự sửa / tự thêm chấm công của chính mình** trừ quản lý (chủ quán): trưởng ca → `403 ATTENDANCE_SELF_EDIT` ("nhờ quản lý sửa giúp"). Màn Ca ẩn nút **Sửa** trên dòng của chính mình và bỏ tên mình khỏi ô chọn khi **Thêm chấm công**. |
| D-120 | **Khóa tạm đăng nhập:** 10 lần sai / 15 phút **cùng tên + cùng máy** → tên đó tạm khóa trên máy đó (`429 LOGIN_LOCKED`), kể cả khi lần này gõ đúng. Máy khác vẫn đăng nhập được (người dò không khóa được chủ quán ở máy khác). Giới hạn cũ 5 lần / phút / máy giữ nguyên. |
| D-121 | **Khóa tạm tài khoản duyệt ở quầy:** 5 lần sai **tên hoặc mật khẩu** / 15 phút **cùng tên duyệt + cùng người đứng quầy** → `429 APPROVAL_LOCKED`. Gõ đúng mật khẩu mà tài khoản không đủ quyền (trưởng ca duyệt mức cần quản lý) không bị tính. Người đứng quầy khác vẫn nhờ duyệt được. |
| D-122 | **Báo chủ quán:** lần sai chạm ngưỡng khóa (đăng nhập hoặc duyệt) → cảnh báo tức thì loại `AUTH_LOCK` (mức cao) trên trang Cảnh báo bất thường + email tức thì (nếu đã bật email cảnh báo, F-060): tài khoản bị thử, người đứng quầy / máy gửi, số lần. Một cảnh báo cho một lần khóa. Không lưu mật khẩu đã gõ; bảng `AuthFailures` tự dọn dòng quá 1 ngày. |
| D-123 | **CSDL chặn xóa cứng lịch sử:** trigger `AFTER DELETE` → `THROW 50250 HISTORY_NO_DELETE` trên `Payments`, `Refunds`, `CashTransactions`, `Shifts`, `Attendance`, `OrderItemVoids`, `GiftDrinks`, `Alerts` (app chỉ hủy / đánh dấu, không xóa). Nhật ký thao tác: thêm trigger chặn xóa (`50251 AUDIT_NO_DELETE`) trừ dòng quá 12 tháng (job `audit-retention`); chặn sửa đã có từ 0027. |

## Phương án đã cân nhắc

- **Chuỗi mã kiểm (hash chain) cho nhật ký:** không làm lúc này — khóa bí mật sẽ nằm cùng máy, cùng `.env` với mật khẩu CSDL và mã nguồn công khai, nên người có quyền CSDL vẫn tính lại được chuỗi. Chỉ có ý nghĩa khi có **neo bên ngoài** (gửi mã đầu chuỗi qua email mỗi ngày) và **tách tài khoản CSDL** — đề xuất ở mục Hệ quả.
- **Khóa hẳn tài khoản sau N lần sai:** người đứng quầy cố tình gõ sai sẽ khóa được tài khoản quản lý ở mọi máy (từ chối dịch vụ). Chọn khóa theo **tên + máy** / **tên + người đứng quầy**, có hạn 15 phút.
- **Captcha:** app chạy trong mạng quán, người dò là người trong quán — captcha không chặn được; khóa tạm + báo chủ quán hiệu quả hơn.
- **Bắt buộc người thứ hai duyệt hoàn tiền / xóa món của chính lượt thu mình thu (kể cả trưởng ca):** đổi cách làm việc của ca chỉ có một người — để chủ dự án quyết cùng phương án chấm công.
- **Đếm lần sai trong bộ nhớ:** mất khi khởi động lại máy chủ (người dò chỉ cần làm máy chủ khởi động lại) — chọn lưu CSDL.

## Hệ quả

- Migration `0048_chong_sua_du_lieu.sql`: bảng `AuthFailures`; `CK_Alerts_Kind` thêm `AUTH_LOCK`; trigger `TR_AuditLogs_NoDelete`, `TR_{bảng}_NoDelete` (8 bảng).
- Máy chủ: `authGuardRepo`, `authGuardService`; `userService.login` / `resolveApproval`; `attendanceService.update` / `createManual`; `alertService.onAuthLock`. API: `POST /api/auth/login` và mọi API nhận `adminUsername` / `adminPassword` có thêm `429 LOGIN_LOCKED` / `APPROVAL_LOCKED`; `POST` / `PUT /api/attendance` thêm `403 ATTENDANCE_SELF_EDIT`.
- Giao diện: màn Ca (ẩn Sửa dòng của mình), trang Cảnh báo (loại "Sai mật khẩu nhiều lần").
- **Đề xuất vận hành (chủ dự án làm, không tự động):** tách tài khoản CSDL — `cafe_app` chạy app chỉ có đọc / ghi + `EXECUTE` (không `db_owner`), tài khoản riêng cho migration; máy chủ đặt tài khoản Windows riêng, nhân viên dùng tài khoản Windows thường không có quyền SQL Server; Windows tự đồng bộ giờ.
- Feature: [FEATURE-071](../chức-năng/FEATURE-071.md). Task: [TASK-088](../công-việc/TASK-088.md). BR-108.
