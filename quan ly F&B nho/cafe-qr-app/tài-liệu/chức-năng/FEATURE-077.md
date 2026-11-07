# FEATURE-077 — Phân quyền rõ ràng, đợt 1: Quản lý cửa hàng và Chủ quán

> **Nguồn:** chủ dự án 07/11/2026 ("đề xuất phân quyền rõ ràng giữa khi vào admin thì chỉ thấy và làm cái gì, quản lý cũng vậy, và nhân viên chia ra từng cấp…"; duyệt: "tiến hành làm những cái tôi vừa nhắn"). Quyết định: [ADR-035](../quyết-định/ADR-035-phan-quyen-quan-ly-cua-hang.md) D-156…D-161. Nền: [F-036](FEATURE-036.md) trưởng ca & ma trận quyền, [F-009](FEATURE-009.md) tài khoản.

- **Status:** CONFIRMED (ADR-035) · Triển khai: [TASK-094](../công-việc/TASK-094.md)
- **Actor:** **ACT-ADMIN** (Chủ quán — tạo tài khoản, nhận báo đổi giá); **ACT-STORE** (Quản lý cửa hàng — điều hành hằng ngày).
- **Màn hình:**
  - **Tài khoản** (SCR-20): vai **Quản lý cửa hàng** trong ô Vai trò; vai ADMIN hiện **Chủ quán**; bảng thu gọn **Mỗi vai trò làm được gì?**.
  - **Máy quầy** (SCR-10): nhãn "Quản lý cửa hàng" cạnh tên; mục **Quản lý** → Hôm nay.
  - **Trang Quản lý** (thanh bên): Quản lý cửa hàng chỉ thấy Hôm nay, Báo cáo & lịch sử, Thực đơn (4 mục), Kho hàng (3 mục), Khách hàng (5 mục), Ca & hoàn tiền, Sổ quỹ (không có tab Danh mục thu chi), Cảnh báo, Nhân sự & chấm công (không có thẻ Cách chấm công), Bàn & QR; dưới tên có "Quản lý cửa hàng". Mở thẳng trang khác → về quầy.
  - **Cảnh báo** (SCR-47): loại **Quản lý cửa hàng đổi giá món** (chỉ chủ quán thấy).
- **Dữ liệu:** `Users.Role` thêm `STORE_MGR`; `Alerts.Kind` thêm `PRICE_CHANGE` (migration 0053).

## User Story

- **US-077-1:** Là chủ quán, tôi muốn giao cho quản lý cửa hàng điều hành thực đơn, kho, khuyến mãi, lịch làm và duyệt chi mà không thấy lương từng người, lãi / lỗ hay sửa tài khoản, để yên tâm giao việc mà không đưa mật khẩu của mình.
- **US-077-2:** Là chủ quán, tôi muốn được báo khi quản lý cửa hàng đổi giá hay thêm món, và quản lý cửa hàng không tự đóng cảnh báo về chính họ, để vẫn nắm được những thay đổi ảnh hưởng tới tiền.

## Quy tắc (BR-115)

1. Vai: STAFF < MANAGER (Trưởng ca) < STORE_MGR (Quản lý cửa hàng) < ADMIN (Chủ quán). Chỉ chủ quán tạo / đổi vai. Quản lý cửa hàng chấm công, có bảng lương, cần PIN như nhân viên.
2. `/api/admin`: chủ quán mọi thứ; quản lý cửa hàng theo `STORE_MGR_AREAS` (được làm / chỉ xem / mở thêm / chặn) — ngoài danh sách `403 OWNER_ONLY`. Trưởng ca, nhân viên vẫn 403 như cũ.
3. Ở quầy: mọi quyền trưởng ca; giảm tay không giới hạn; hoàn tiền mọi ca; duyệt chi quỹ ≤ 3 × `manager.cash_out_approve_max`; sửa chấm công mọi ngày (không của mình); Hôm nay bản đủ; không tự duyệt khoản của mình.
4. Đổi giá / thêm món → cảnh báo `PRICE_CHANGE` cho chủ quán.
5. Cảnh báo: không thấy / không xử lý `AUTH_LOCK`, `PRICE_CHANGE`; không xử lý cảnh báo về chính mình (`SELF_ALERT`).
6. Cài đặt: xem được (email nhận cảnh báo để trống); chỉ đổi nhận đơn QR, lời nhắn tạm ngưng, cài đặt bếp, quy trình 1 chạm.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `/api/admin/*` | ADMIN; STORE_MGR theo `STORE_MGR_AREAS` | Ngoài phạm vi → `403 OWNER_ONLY` |
| `POST` · `PUT /api/admin/users` | ADMIN | `role` thêm `STORE_MGR` |
| `PUT /api/admin/settings` | ADMIN; STORE_MGR (một số ô) | Ô ngoài phạm vi → `403 OWNER_ONLY`, `details.fields` |
| `GET /api/admin/alerts`, `PATCH …/{id}` | ADMIN; STORE_MGR | Bỏ loại chỉ chủ quán; `403 SELF_ALERT` |
| `POST /api/cash-transactions/{id}/approve` · `…/reject` · `…/void` | Như cũ | Quản lý cửa hàng tự duyệt ≤ 3 × ngưỡng trưởng ca |

## Acceptance Criteria

- AC-077-01: Chủ quán tạo tài khoản `STORE_MGR`; nhân viên / trưởng ca / quản lý cửa hàng tạo tài khoản → 403 (quản lý cửa hàng: `OWNER_ONLY`); `/auth/me` trả `STORE_MGR`; vai cũ không đổi; mọi quyền quầy trừ `admin.all` có `STORE_MGR`; giảm tay không giới hạn.
- AC-077-02: Quản lý cửa hàng gọi được thực đơn, kho, kiểm kê, đặt hàng, khuyến mãi, hội viên, bàn, lịch làm, báo cáo doanh thu / giá vốn, sổ quỹ, ca, tài khoản (xem), cảnh báo, thêm danh mục món; bị `403 OWNER_ONLY` ở lãi / lỗ, chi phí cố định, lương, hồ sơ lương, nhật ký, menu engineering, cách chấm công, email cảnh báo, Tra cứu API, thêm danh mục thu chi, sửa tài khoản, ẩn danh hội viên, chạy việc nền khác; trưởng ca vẫn 403; mọi khóa / luật trong `STORE_MGR_AREAS` khớp route thật.
- AC-077-03: Quản lý cửa hàng xem cài đặt (email nhận cảnh báo rỗng), đổi được cài đặt bếp / 1 chạm / nhận đơn QR; đổi giảm giá, ngưỡng duyệt, Wi-Fi, tên quán → `403 OWNER_ONLY` kèm `details.fields`, không lưu gì.
- AC-077-04: Quản lý cửa hàng đổi giá → cảnh báo `PRICE_CHANGE` (giá cũ → mới, người đổi); thêm món → cảnh báo giá cũ = null; chỉ đổi tên hoặc chủ quán đổi giá → không có; quản lý cửa hàng không thấy và không đóng được cảnh báo này (404).
- AC-077-05: Khoản chi 2 × ngưỡng: trưởng ca 403, quản lý cửa hàng duyệt được; khoản > 3 × ngưỡng: quản lý cửa hàng → `ADMIN_APPROVAL_REQUIRED` ("chủ quán"), nhập tài khoản quản lý cửa hàng ở quầy → `ADMIN_APPROVAL_INVALID`; khoản của chính mình → `SELF_APPROVAL`; quản lý cửa hàng khác duyệt hộ được.
- AC-077-06: Quản lý cửa hàng không thấy `AUTH_LOCK`; số "Mới" tính theo phần thấy được; cảnh báo về chính mình → `403 SELF_ALERT`; cảnh báo của người khác xử lý được (ghi người xử lý); `AUTH_LOCK` → 404.
- AC-077-07: Quản lý cửa hàng sửa chấm công hôm qua của nhân viên (trưởng ca `ATTENDANCE_NOT_TODAY`); thêm chấm công cho chính mình → `ATTENDANCE_SELF_EDIT`; `/dashboard/today` `full = true` (trưởng ca `false`); Tra cứu API: `PUT /api/admin/menu-items/:id` vai `STORE_MGR` (+ ADMIN), lãi / lỗ, ẩn danh, tạo tài khoản `ADMIN`; quyền ghi trên trang khớp server.
- AC-077-08: Trên trình duyệt: chủ quán mở "Mỗi vai trò làm được gì?", tạo tài khoản "Quản lý cửa hàng"; người đó đăng nhập → máy quầy hiện "Quản lý cửa hàng", bấm "Quản lý" → Hôm nay; thanh bên có Thực đơn, Nguyên liệu, Báo cáo, Ca, Sổ quỹ, Cảnh báo, Bàn & QR, không có Lãi / lỗ, Lương, Tài khoản, Cài đặt, Nhật ký, Phân tích, Tra cứu API; đổi giá Latte → chủ quán thấy cảnh báo "đổi giá" ghi tên người đổi; Sổ quỹ không có tab Danh mục thu chi; mở thẳng /admin/pnl → về quầy (từ F-080: ở lại Hôm nay kèm thanh Xin quyền "Lãi / lỗ…").

## Bằng chứng

`tests/store-manager.test.js` (AC-077-01…07) · `tests/api-docs.test.js` (quyền ghi trên trang khớp server, thêm quản lý cửa hàng) · E2E "phân quyền: chủ quán tạo tài khoản…" (AC-077-08).
