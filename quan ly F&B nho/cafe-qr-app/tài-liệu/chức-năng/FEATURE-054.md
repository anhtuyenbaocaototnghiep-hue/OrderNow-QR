# FEATURE-054 — Người mở ca phải đóng ca trước khi đăng xuất

> **Nguồn:** chủ dự án yêu cầu 23/10/2026: "khi đăng xuất bắt buộc phải đóng ca để có thể kiểm soát được"; chọn phương án "Người mở ca". Quyết định: [ADR-014](../quyết-định/ADR-014-dang-xuat-phai-dong-ca.md) D-59.

- **Status:** CONFIRMED (ADR-014 D-59) · Triển khai: [TASK-068](../công-việc/TASK-068.md)
- **Actor:** **ACT-STAFF**, **ACT-LEAD**, **ACT-ADMIN** — ai đã mở ca đang chạy.
- **Màn hình:** nút **Đăng xuất** ở thanh quầy / thanh bên quản lý / bản "Hôm nay" → hộp xác nhận → **Ca & hoàn tiền** (SCR-15, `/pos/shift?then=logout`).
- **Dữ liệu:** không có bảng / cột mới (dùng `Shifts.OpenedBy`).

## User Story

- **US-054-1:** Là chủ quán, tôi muốn người mở ca phải đếm tiền và đóng ca rồi mới đăng xuất được, để ca nào cũng có người chịu trách nhiệm và chênh lệch két được ghi lại trước khi người đó về.

## Quy tắc (BR-086)

1. Đăng xuất (`POST /api/auth/logout`) khi **mình là người mở ca đang chạy** → `409 SHIFT_OPEN` ("Bạn đang giữ ca #N …"), `details.shiftId`, `details.cashPending`; không ghi giờ ra chấm công, phiên đăng nhập trên máy giữ nguyên.
2. Người không mở ca (kể cả khi ca đang mở) và mọi người khi không có ca mở → đăng xuất như trước (ghi giờ ra chấm công nếu có).
3. Áp cho mọi vai; quản lý mở ca cũng phải đóng ca trước khi đăng xuất.
4. Giao diện: hộp "Đóng ca trước khi đăng xuất" → **Đến trang đóng ca** mở `/pos/shift?then=logout` (hộp đóng ca tự mở) hoặc **Ở lại**. Đóng ca xong: màn "Đã đóng ca" có **In phiếu chốt ca** và **Đăng xuất**. Ca đã bị người khác đóng trước → trang tự đăng xuất.
5. Không chặn được khi không bấm Đăng xuất (đóng trình duyệt, token hết hạn, mất mạng) — xem ADR-014 "Giới hạn đã biết".
6. Còn khoản chi chờ duyệt thì chưa đóng được ca (`CASH_PENDING`) → hộp nhắc ghi số khoản, cần trưởng ca / quản lý duyệt hoặc từ chối trước.
7. Chặn theo người, không theo máy: người mở ca đăng xuất ở bất kỳ máy nào cũng bị yêu cầu đóng ca.
8. Trang Ca bỏ `?then=logout` khỏi địa chỉ ngay khi đọc — tải lại / Back / người đăng nhập sau không bị tự đăng xuất.

## API (thay đổi trên endpoint đã có)

- `POST /api/auth/logout`: thêm `409 SHIFT_OPEN` khi người gọi là người mở ca đang chạy. Thành công không đổi: `{ clockedOut }`.

## Acceptance Criteria

- AC-054-01: Nhân viên mở ca rồi gọi `POST /api/auth/logout` → `409 SHIFT_OPEN`, `details.shiftId` = ca đang mở; chấm công của người đó vẫn mở. Đóng ca (đếm tiền — đóng ca ghi luôn giờ ra chấm công cho người đóng, như trước) rồi gọi lại → `200`.
- AC-054-02: Ca do người khác mở đang chạy: nhân viên / trưởng ca khác đăng xuất → `200`, ca vẫn mở.
- AC-054-03: Quản lý mở ca → đăng xuất bị `409 SHIFT_OPEN`; không có ca mở → mọi vai đăng xuất `200`.
- AC-054-04: Trên trình duyệt, nhân viên đang giữ ca bấm **Đăng xuất**: thấy hộp "Đóng ca trước khi đăng xuất"; **Ở lại** → vẫn ở trang; **Đến trang đóng ca** → trang Ca với hộp đóng ca mở sẵn; nhập tiền đếm, **Đóng ca** → **Đăng xuất** → về trang đăng nhập.
