# FEATURE-078 — Phân quyền rõ ràng, đợt 2: vị trí và cấp của nhân viên

> **Nguồn:** chủ dự án 07/11/2026 ("…nhân viên chia ra từng cấp để dễ giải quyết công việc của mỗi người một cách hiệu quả tối ưu công việc"; duyệt: "tiến hành làm những cái tôi vừa nhắn"). Quyết định: [ADR-036](../quyết-định/ADR-036-vi-tri-va-cap-nhan-vien.md) D-162…D-166. Nền: [F-077](FEATURE-077.md), [F-036](FEATURE-036.md).

- **Status:** CONFIRMED (ADR-036) · Triển khai: [TASK-095](../công-việc/TASK-095.md)
- **Actor:** **ACT-ADMIN** (đặt vị trí, cấp); **ACT-STAFF** (làm việc theo vị trí); **ACT-LEAD** (duyệt cho nhân viên thử việc).
- **Màn hình:**
  - **Tài khoản** (SCR-20): hộp Thêm / Sửa nhân viên có **Vị trí** (Thu ngân / Pha chế / Phục vụ — để trống = mọi việc) và **Cấp** (Chính thức / Thử việc), chỉ hiện khi vai trò là Nhân viên quầy; cột Vai trò ghi vị trí + nhãn "Thử việc"; bảng "Mỗi vai trò làm được gì?" có phần vị trí.
  - **Máy quầy** (SCR-10 và các trang quầy): menu theo vị trí, nhãn "Thử việc", nút theo vị trí ở Đơn hàng; mở trang không thuộc vị trí → về Đơn hàng + lời nhắc.
- **Dữ liệu:** `Users.Positions`, `Users.StaffLevel` (migration 0054).

## User Story

- **US-078-1:** Là chủ quán, tôi muốn chia nhân viên theo vị trí thu ngân / pha chế / phục vụ để mỗi người chỉ thấy và làm phần việc của mình, tiền chỉ qua tay thu ngân.
- **US-078-2:** Là chủ quán, tôi muốn nhân viên thử việc không tự giảm giá, tự chi tiền hay tự xóa món mà phải có trưởng ca duyệt, để yên tâm khi nhận người mới.

## Quy tắc (BR-116)

1. Vị trí chỉ áp cho vai Nhân viên; để trống = mọi vị trí; trưởng ca trở lên không bị giới hạn. Chỉ chủ quán đặt.
2. Thu ngân: bán mang đi, thu tiền, mở / đóng ca, hoàn tiền, ghi thu chi quỹ, bán ly treo. Pha chế: tiếp nhận / hoàn tất đơn, sơ chế, hủy hàng, hủy lô, nhận hàng. Phục vụ: mở bàn, gọi món tại bàn, chuyển bàn. Việc khác: mọi người. Sai vị trí → `403 POSITION_REQUIRED`.
3. Thử việc: giảm giá tay luôn cần trưởng ca trở lên duyệt; mọi khoản chi chờ duyệt; mọi lần sửa / xóa món cần người duyệt.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/admin/users`, `PUT …/{id}` | ADMIN | Thêm `positions` (mảng `CASHIER` / `BARISTA` / `SERVER`, ≥ 1, không trùng; `null` = mọi vị trí; vắng khi sửa = giữ) và `level` (`PROBATION` / `OFFICIAL`); vai khác STAFF bỏ qua |
| `GET /api/admin/users`, `GET /api/auth/me` | — | Thêm `positions`, `level` |
| Việc theo vị trí (D-163) | Nhân viên đúng vị trí | Sai → `403 POSITION_REQUIRED` |
| `GET /api/admin/api-docs` | ADMIN | Mỗi dòng thêm `positions` |

## Acceptance Criteria

- AC-078-01: Chủ quán tạo / sửa tài khoản với vị trí + cấp; tài khoản cũ = mọi vị trí, chính thức; trưởng ca gửi vị trí / cấp → bỏ qua; vị trí sai / rỗng / trùng → 400; sửa không gửi vị trí → giữ; `/auth/me` trả vị trí; nhân viên sửa tài khoản → 403.
- AC-078-02: Pha chế tiếp nhận + hoàn tất đơn QR được, sơ chế / hủy hàng / hủy lô / nhận hàng qua cửa vị trí; bán mang đi, thu tiền bàn / chia bill, mở / đóng ca, hoàn tiền, ghi chi quỹ, bán ly treo, mở bàn, gọi món tại bàn, chuyển bàn → `403 POSITION_REQUIRED` (lời nhắn có "Thu ngân").
- AC-078-03: Phục vụ mở bàn, gọi món, chuyển bàn được; hoàn tất, thu tiền, bán mang đi → 403; thu ngân thu tiền bàn đó được.
- AC-078-04: Thu ngân bán mang đi, ghi chi quỹ được; hoàn tất, mở bàn → 403; nhân viên chưa đặt vị trí và trưởng ca không bị chặn; Tra cứu API: bán mang đi `CASHIER`, tiếp nhận `BARISTA`, gọi món tại bàn `SERVER`, xem đơn `null`.
- AC-078-05: Thử việc: báo giá giảm 5 % → cần duyệt (chính thức thì không); bán không người duyệt → `ADMIN_APPROVAL_REQUIRED`, trưởng ca duyệt → ghi người duyệt; chi 1.000đ → `PENDING` (chính thức `APPROVED`); xóa món đơn chưa tiếp nhận → `ADMIN_APPROVAL_REQUIRED`, có trưởng ca duyệt → được, ghi người duyệt.
- AC-078-06: Trên trình duyệt: chủ quán tạo nhân viên chỉ "Pha chế", cấp "Thử việc" → danh sách ghi "Thử việc", "Pha chế"; người đó đăng nhập → menu quầy đúng Đơn hàng, Kho & sơ chế, Giờ công, có nhãn "Thử việc"; mở thẳng Bán mang đi → về Đơn hàng với lời nhắc "không thuộc vị trí của bạn (Pha chế)".

## Bằng chứng

`tests/staff-positions.test.js` (AC-078-01…05) · E2E "vị trí + cấp: chủ quán tạo nhân viên…" (AC-078-06).
