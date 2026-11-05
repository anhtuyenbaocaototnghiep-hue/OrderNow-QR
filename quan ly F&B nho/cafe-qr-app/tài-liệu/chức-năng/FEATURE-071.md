# FEATURE-071 — Chống sửa / xóa dữ liệu trái phép

> **Nguồn:** chủ dự án 05/11/2026 ("tăng cường bảo mật ở phần backend để người ta không lợi dụng để sửa"). Quyết định: [ADR-029](../quyết-định/ADR-029-chong-sua-du-lieu.md) D-119…D-123.

- **Status:** CONFIRMED (ADR-029) · Triển khai: [TASK-088](../công-việc/TASK-088.md)
- **Actor:** **ACT-LEAD** (không tự sửa chấm công của mình); **ACT-STAFF / ACT-LEAD** (nhập tài khoản duyệt, đăng nhập); **ACT-ADMIN** (nhận cảnh báo, sửa chấm công mọi người).
- **Màn hình:** **Ca** (SCR-15): dòng chấm công của chính trưởng ca không có nút **Sửa**, ô **Thêm chấm công** không có tên mình. **Cảnh báo bất thường** (SCR-47): loại **"Sai mật khẩu nhiều lần"**. **Đăng nhập** (SCR-09) và mọi hộp "tài khoản duyệt": báo tạm khóa 15 phút.
- **Dữ liệu:** bảng `AuthFailures`; `Alerts.Kind = 'AUTH_LOCK'`; trigger chặn xóa (migration 0048).

## User Story

- **US-071-1:** Là chủ quán, tôi muốn không ai tự sửa giờ công của chính mình hay dò được mật khẩu quản lý ở quầy, và được báo ngay khi có người thử, để giờ công và các khoản duyệt không bị lợi dụng.
- **US-071-2:** Là chủ quán, tôi muốn lịch sử tiền, ca, chấm công, cảnh báo và nhật ký thao tác không xóa được kể cả khi có người vào thẳng cơ sở dữ liệu, để dấu vết sai phạm luôn còn.

## Quy tắc (BR-108)

1. Trưởng ca không sửa / thêm chấm công của chính mình (`403 ATTENDANCE_SELF_EDIT`); quản lý được.
2. Đăng nhập: 10 lần sai / 15 phút cùng tên + cùng máy → `429 LOGIN_LOCKED` (kể cả gõ đúng) tới khi đủ 15 phút; máy khác, tên khác không bị ảnh hưởng.
3. Tài khoản duyệt ở quầy: 5 lần sai tên / mật khẩu / 15 phút cùng tên duyệt + cùng người đứng quầy → `429 APPROVAL_LOCKED`; đúng mật khẩu mà không đủ quyền không bị tính; người đứng quầy khác không bị ảnh hưởng.
4. Chạm ngưỡng → một cảnh báo `AUTH_LOCK` mức cao (+ email tức thì nếu bật). Không lưu mật khẩu đã gõ; dòng đếm quá 1 ngày tự dọn.
5. CSDL: không xóa cứng được `Payments`, `Refunds`, `CashTransactions`, `Shifts`, `Attendance`, `OrderItemVoids`, `GiftDrinks`, `Alerts`; nhật ký thao tác không sửa, không xóa (trừ dòng quá 12 tháng do job giữ 12 tháng).

## API

| Method & path | Thay đổi |
| --- | --- |
| `POST /api/auth/login` | Thêm `429 LOGIN_LOCKED` |
| Mọi API nhận `adminUsername` / `adminPassword` (thu tiền có giảm giá tay, hoàn tiền, xóa món, duyệt / hủy / sửa sổ quỹ…) | Thêm `429 APPROVAL_LOCKED` |
| `POST /api/attendance` · `PUT /api/attendance/{id}` | Thêm `403 ATTENDANCE_SELF_EDIT` |
| `GET /api/admin/alerts` | Thêm loại `AUTH_LOCK` — `detail: { kind: LOGIN \| APPROVAL, username, count, windowMinutes, actor, ip }` |

## Acceptance Criteria

- AC-071-01: Trưởng ca sửa / thêm chấm công của chính mình → 403 `ATTENDANCE_SELF_EDIT`, dữ liệu không đổi; trưởng ca sửa của người khác được; quản lý sửa được của trưởng ca và của mình.
- AC-071-02: Tài khoản duyệt sai 5 lần (cùng tên duyệt, cùng người đứng quầy, không phân biệt hoa thường) → lần 6 bị 429 `APPROVAL_LOCKED` kể cả gõ đúng, khoản không được duyệt; người đứng quầy khác vẫn nhờ duyệt được; đúng mật khẩu mà không đủ quyền không bị tính; một cảnh báo `AUTH_LOCK` mức cao ghi người đứng quầy; không có cột mật khẩu.
- AC-071-03: Đăng nhập sai 10 lần cùng tên + cùng máy → lần 11 bị 429 `LOGIN_LOCKED` kể cả gõ đúng; tên khác vẫn đăng nhập; lần sai từ máy khác không chặn máy này; qua 15 phút đăng nhập lại được; cảnh báo `AUTH_LOCK` loại đăng nhập.
- AC-071-04: Xóa cứng bằng SQL các bảng lịch sử → lỗi `HISTORY_NO_DELETE`, dữ liệu còn nguyên (8 bảng có trigger); nhật ký thao tác không sửa (`AUDIT_READONLY`), không xóa (`AUDIT_NO_DELETE`); job giữ 12 tháng vẫn xóa được dòng quá 12 tháng.
- AC-071-05: Trên trình duyệt: trưởng ca ở màn Ca không có nút Sửa trên dòng chấm công của chính mình, dòng của người khác vẫn có.

## Bằng chứng

`tests/tamper-guard.test.js` (AC-071-01…04) · E2E "trưởng ca + sổ quỹ…" (AC-071-05).
