# FEATURE-079 — Quyền riêng từng tài khoản và Xin quyền / Duyệt

> **Nguồn:** chủ dự án 07/11/2026 ("tôi muốn admin có nhiều quyền hơn giống như có thể duyệt hoặc cấp quyền để truy cập ở mỗi tài khoản"; duyệt đề xuất: "ok"). Quyết định: [ADR-037](../quyết-định/ADR-037-quyen-rieng-tung-tai-khoan.md) D-167…D-172. Nền: [F-077](FEATURE-077.md), [F-078](FEATURE-078.md).

- **Status:** CONFIRMED (ADR-037) · Triển khai: [TASK-096](../công-việc/TASK-096.md)
- **Actor:** **ACT-ADMIN** (đặt quyền riêng, duyệt / từ chối); **ACT-STAFF / ACT-LEAD / ACT-STORE** (bị chặn → xin quyền).
- **Màn hình:**
  - **Tài khoản** (SCR-20): nút **Quyền** mỗi dòng (trừ chủ quán) → hộp "Quyền của …" chia nhóm Máy quầy / Trang Quản lý: mỗi quyền chọn **Theo vai trò (có / không)** / **Cho phép** / **Không cho** + **Hạn** (luôn / hết hôm nay / 7 ngày / đến ngày…), nhãn "Tiền" ở quyền dính tiền; nhãn **Có quyền riêng** ở dòng tài khoản; khung **Xin quyền chờ duyệt** (người, quyền, lý do, giờ; chọn hạn + Duyệt / Từ chối).
  - **Hôm nay** (SCR-42): việc cần làm "n yêu cầu xin quyền chờ duyệt" → Tài khoản.
  - **Mọi trang quầy / Quản lý**: thanh **Bạn chưa có quyền: … [Xin quyền]** → hộp lý do → "Đã gửi — chờ chủ quán duyệt"; kết quả báo bằng thanh (duyệt → "Tải lại").
- **Dữ liệu:** `UserGrants`, `AccessRequests`, `Alerts.Kind` + `ACCESS_GRANT` (migration 0055).

## User Story

- **US-079-1:** Là chủ quán, tôi muốn cho phép hoặc không cho từng người một việc cụ thể, có thể chỉ trong hôm nay, để xử lý những hôm thiếu người hay giới hạn riêng một người mà không phải đổi vai trò.
- **US-079-2:** Là nhân viên, tôi muốn xin quyền ngay khi bị chặn và được chủ quán duyệt từ xa, để làm tiếp việc mà không phải gọi điện hay chờ chủ quán tới quán.

## Quy tắc (BR-117)

1. 17 quyền cấp / thu được, mặc định theo vai trò / vị trí (giữ đúng quyền hiện có). Chủ quán luôn đủ mọi quyền, không đặt riêng được.
2. Đặt riêng: Cho phép / Không cho, hạn tùy chọn; đặt riêng thắng mặc định; hết hạn tự về theo vai trò; có hiệu lực ở request kế tiếp.
3. Không cấp được: tài khoản & phân quyền, cài đặt chung, cách chấm công, email cảnh báo, việc chạy nền khác, sửa danh mục thu chi, ẩn danh hội viên, Tra cứu API, duyệt xin quyền. Duyệt tiền vẫn theo vai trò + ngưỡng.
4. Xin quyền: chỉ với quyền cấp được và chưa có; mỗi người một yêu cầu chờ cho mỗi quyền, tối đa 5 yêu cầu chờ; chủ quán duyệt (hết hôm nay / 7 ngày / luôn) hoặc từ chối (ghi chú).
5. Cho phép quyền dính tiền → cảnh báo `ACCESS_GRANT` (chỉ chủ quán xem).

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `GET /api/access/capabilities` | Nhân viên | Danh mục quyền (khóa, nhóm, tên, dính tiền) |
| `POST /api/access-requests` · `GET …/mine` | Nhân viên | Gửi yêu cầu (`capability`, `reason`) — 201 mới / 200 đã có; yêu cầu của mình 7 ngày |
| `GET` · `PUT /api/admin/users/{id}/grants` | ADMIN (GET: thêm người có quyền Nhân sự / Lương) | Xem / thay toàn bộ quyền riêng (`grants: [{ capability, effect, expiresAt }]`) |
| `GET /api/admin/access-requests` · `POST …/{id}/approve` · `…/reject` | ADMIN | Danh sách chờ; duyệt (`duration`); từ chối (`note`) |
| `GET /api/auth/me` | Nhân viên | `user.caps` — quyền đang có |

## Acceptance Criteria

- AC-079-01: Hộp Quyền trả mặc định / đặt riêng / đang có; cho phép "Thu tiền" có hạn cho người Phục vụ → bán mang đi được ngay với cùng phiên đăng nhập, `/auth/me` có `pos.cashier`; đặt cho chủ quán → `OWNER_ALWAYS`; quyền lạ / hạn đã qua / trùng → 400; trưởng ca, quản lý cửa hàng, nhân viên đặt → 403; xóa tài khoản có quyền riêng (chưa có lịch sử) → `DELETED`; danh sách tài khoản có `grantCount`.
- AC-079-02: "Không cho" Thực đơn & giá với quản lý cửa hàng → `403 OWNER_ONLY` kèm `details.capability` + tên; Kho hàng vẫn dùng được; quyền hết hạn → tự về theo vai trò.
- AC-079-03: Trưởng ca chưa có quyền trang Quản lý → `403 FORBIDDEN` kèm quyền cần; cho phép Lương → vào bảng lương, ngày lễ, xem cài đặt; Lãi / lỗ → `403 OWNER_ONLY` kèm `admin.pnl`; sửa tài khoản, đổi cài đặt chung, xem xin quyền, Tra cứu API → 403 không kèm quyền (không mời xin).
- AC-079-04: Phục vụ bấm hoàn tất đơn → `403 POSITION_REQUIRED` kèm `pos.barista`; xin quyền (201), xin lại → cùng yêu cầu (200); chủ quán thấy (người, tên quyền, lý do) + Hôm nay `pendingAccess` (trưởng ca không thấy); duyệt "hết hôm nay" → hạn = 0 giờ ngày mai (giờ VN), hoàn tất được ngay; yêu cầu thành `APPROVED`; duyệt lại → `REQUEST_DECIDED`; xin quyền đã có → `ALREADY_ALLOWED`.
- AC-079-05: Từ chối kèm ghi chú → người xin thấy `REJECTED` + ghi chú + người duyệt; nhân viên / quản lý cửa hàng duyệt → 403; yêu cầu chờ thứ 6 → `TOO_MANY_REQUESTS`; quyền lạ → 400.
- AC-079-06: Cho phép Thu tiền (đặt riêng) và Lương (đặt riêng) → 2 cảnh báo `ACCESS_GRANT` (người được cấp, quyền); duyệt Pha chế (không dính tiền) → không cảnh báo; quản lý cửa hàng không thấy loại này; Tra cứu API: `capability` của dòng Lương = `admin.payroll`, sửa món = `admin.menu`, tạo tài khoản / đặt quyền = null.
- AC-079-07: Trên trình duyệt: nhân viên Phục vụ mở Bán mang đi → về `/pos?denied=position&cap=pos.cashier` với thanh "Bạn chưa có quyền: Thu tiền…" → Xin quyền + lý do → "Đã gửi"; chủ quán: Hôm nay → "1 yêu cầu xin quyền chờ duyệt" → Tài khoản (`#xin-quyen`) thấy lý do, hạn mặc định "Hết hôm nay" → Duyệt → dòng tài khoản "Có quyền riêng"; nhân viên mở Bán mang đi được; chủ quán mở Quyền, đặt lại "Theo vai trò" → Lưu → hết nhãn, nhân viên lại bị chuyển về.

## Bằng chứng

`tests/access-grants.test.js` (AC-079-01…06) · E2E "quyền riêng: nhân viên Phục vụ mở Bán mang đi…" (AC-079-07).
