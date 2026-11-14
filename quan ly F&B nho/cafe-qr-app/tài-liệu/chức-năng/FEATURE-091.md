# FEATURE-091 — Trang riêng "Quyền nâng cao" và số điện thoại tài khoản

> **Nguồn:** chủ dự án 14/11/2026 — "bạn tạo thêm một trang riêng về quyền nâng cao bên tài khoản để thêm mục số điện thoại". Quyết định: [ADR-053](../quyết-định/ADR-053-trang-quyen-nang-cao-va-sdt-tai-khoan.md) D-226, D-227. Nền: [F-090](FEATURE-090.md) công tắc Cho phép / Không cho phép, [F-079](FEATURE-079.md) quyền riêng + xin quyền, [F-009](FEATURE-009.md) tài khoản, [F-014](FEATURE-014.md) chuẩn hóa SĐT (BR-024).

- **Status:** CONFIRMED (ADR-053) · Triển khai: [TASK-112](../công-việc/TASK-112.md)
- **Actor:** **ACT-ADMIN** (chủ quán — tài khoản & phân quyền, SĐT nhân viên).
- **Màn hình:**
  - **Quản lý → Hệ thống → Quyền nâng cao** (SCR-58, `/admin/permissions`): Xin quyền chờ duyệt · danh sách người · công tắc của người đang chọn · Về như vai trò · Lưu quyền.
  - **Quản lý → Tài khoản** (SCR-20): ô "Số điện thoại (không bắt buộc)" trong hộp Thêm / Sửa; cột "Số điện thoại" (bấm gọi); hộp chỉ còn tóm tắt quyền theo vai + liên kết Quyền nâng cao; nhãn "Có quyền nâng cao" mở trang chọn sẵn người đó.
- **Dữ liệu:** migration `0059_so_dien_thoai_tai_khoan.sql` — `Users.Phone`.

## User Story

- **US-091-1:** Là chủ quán, tôi muốn một trang riêng cho quyền nâng cao — thấy ai đang xin quyền, chọn từng người để cho phép / không cho phép từng việc — để hộp tài khoản gọn và việc phân quyền ở một chỗ.
- **US-091-2:** Là chủ quán, tôi muốn lưu số điện thoại của từng nhân viên trong tài khoản và bấm gọi ngay từ danh sách, để liên lạc khi cần (đổi ca, gọi đi làm) mà không phải tìm ở chỗ khác.

## Quy tắc

1. Trang Quyền nâng cao chỉ chủ quán mở (như trang Tài khoản). Danh sách người không có chủ quán (luôn đủ quyền); người đã khóa vẫn hiện, ghi "Đã khóa".
2. Công tắc theo F-090 (ADR-051 D-222): khác vai trò → quyền riêng không hạn; giống → không lưu; quyền tạm (duyệt Xin quyền) ghi "tạm đến …", lưu mà không chạm thì giữ hạn. Lưu quyền chỉ gửi việc khác vai trò.
3. Đổi sang người khác khi còn công tắc chưa lưu → hỏi "Bỏ thay đổi chưa lưu?" (Hủy ở lại; Bỏ thay đổi → sang người kia, không lưu). `?user={id}` chọn sẵn người; không có / không hợp lệ → người đầu tiên có quyền nâng cao, không thì người đầu danh sách.
4. Duyệt / từ chối yêu cầu xin quyền ở trang này (F-079); duyệt xong trang chọn sẵn người vừa duyệt.
5. Số điện thoại: không bắt buộc; chấp nhận `0xxxxxxxxx`, `+84…`, `84…` (bỏ dấu cách, chấm, gạch, ngoặc) → lưu `+84` + 9 chữ số; sai → báo dưới ô "Số điện thoại không hợp lệ — ví dụ 0912 345 678"; không bắt trùng; sửa không gửi = giữ, rỗng = xóa. Chỉ chủ quán thấy (trang Tài khoản, API danh sách); nhật ký thao tác che số.

## API

- `POST /api/admin/users`, `PUT /api/admin/users/{id}`: thêm `phone` (chuỗi, không bắt buộc). Trả về tài khoản kèm `phone` (`'0xxxxxxxxx' | null`).
- `GET /api/admin/users`: chủ quán nhận thêm `phone`; người khác (quyền Nhân sự / Lương) không có trường này.
- Quyền: `GET / PUT /api/admin/users/{id}/grants`, `GET /api/admin/access-requests`, `…/approve`, `…/reject` (F-079, không đổi).

## Acceptance Criteria

- AC-091-01: Tạo tài khoản kèm "0912 345 678" → CSDL lưu `+84912345678`, trả và danh sách (chủ quán) có `phone = '0912345678'`; "+84987654321", "84911222333" chuẩn hóa; không gửi → `null`; sai ("12345", "0912 345", 12 chữ số, chữ, đầu 1) → `400 VALIDATION_ERROR` ô `phone`, không tạo; sửa không gửi số → giữ; số mới → đổi; rỗng → xóa; quản lý cửa hàng đọc danh sách tài khoản → không có trường `phone`; nhật ký thao tác không có nguyên số, có số che `***678`.
- AC-091-02: (Tài khoản) cột thứ ba "Số điện thoại"; + Thêm nhân viên nhập "0912 345" → báo dưới ô "Số điện thoại không hợp lệ — ví dụ 0912 345 678"; sửa thành "0912 345 678" → tạo xong, dòng có liên kết "0912 345 678" (`tel:0912345678`); Sửa → ô có sẵn "0912 345 678" → đổi "+84 987 654 321" → Lưu → dòng "0987 654 321", API `phone = '0987654321'`.
- AC-091-03: (Quyền nâng cao) thanh bên nhóm Hệ thống có "Quyền nâng cao" ngay sau "Tài khoản", đang sáng; danh sách người không có chủ quán; `?user=` chọn sẵn người A; bật "Trang Hôm nay" → dòng "Cấp thêm: Trang Hôm nay"; chọn người B → hỏi "Bỏ thay đổi chưa lưu?" → Hủy: vẫn người A, công tắc vẫn bật → chọn lại B → Bỏ thay đổi → panel người B, địa chỉ `?user=` đổi, API người A không có quyền riêng. (Duyệt xin quyền + đặt lại quyền ở trang này: bài AC-079-07; nhãn "Có quyền nâng cao" mở trang chọn sẵn người: bài AC-090-03.)
- AC-091-04: Quét khả năng tiếp cận hộp "Thêm nhân viên" (ô Số điện thoại có nhãn, tóm tắt quyền) và trang Quyền nâng cao (nút người, công tắc có tên quyền) — nhãn, tên nút, tương phản, vùng chạm ≥ 24 px; không cuộn ngang 320 / 390 px.

## Bằng chứng

- Integration: `ứng-dụng/máy-chủ/tests/staff-phone.test.js` (AC-091-01).
- E2E: `kiểm-thử/e2e/flow.spec.js` (AC-091-02, AC-091-03; AC-079-07, AC-090-02, AC-090-03 chạy trên trang mới); `kiểm-thử/e2e/a11y.spec.js` bài "quản lý (máy tính): mọi trang quản trị…" (AC-091-04).
