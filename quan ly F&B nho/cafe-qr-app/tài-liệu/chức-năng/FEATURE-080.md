# FEATURE-080 — Trang Quản lý riêng

> **Nguồn:** chủ dự án 07/11/2026 ("tôi muốn admin nó là một trang riêng biệt thì được không"; duyệt đề xuất: "duyệt"). Quyết định: [ADR-038](../quyết-định/ADR-038-trang-quan-ly-rieng.md) D-173…D-177. Nền: [F-009](FEATURE-009.md) đăng nhập, [F-079](FEATURE-079.md) quyền riêng.

- **Status:** CONFIRMED (ADR-038) · Triển khai: [TASK-097](../công-việc/TASK-097.md)
- **Bổ sung F-084 (ADR-043, 08/11/2026):** chủ quán chỉ dùng trang Quản lý — không đăng nhập máy quầy, không có lối "Mở màn hình quầy"; sau đó [ADR-044](../quyết-định/ADR-044-quan-ly-luon-dang-nhap.md) bỏ hẳn "Vào bằng tài khoản này" / đi theo phiên máy quầy — trang Quản lý luôn phải gõ mật khẩu.
- **Actor:** **ACT-ADMIN**, **ACT-STORE** (dùng trang Quản lý); **ACT-STAFF / ACT-LEAD** (máy quầy — không đổi; xin quyền khi cần).
- **Màn hình:** **Đăng nhập Quản lý** (SCR-56, `/admin/login`) — ô tên đăng nhập / mật khẩu, nút **Vào trang Quản lý**, khung xin quyền khi chưa có quyền, liên kết "Nhân viên đứng quầy? Mở màn hình quầy"; thanh bên Quản lý: **Mở màn hình quầy** (tab mới), **Đăng xuất** (chỉ trang Quản lý).
- **Dữ liệu:** không đổi bảng.

## User Story

- **US-080-1:** Là chủ quán, tôi muốn trang Quản lý có địa chỉ và đăng nhập riêng, tách khỏi màn hình quầy, để mở thẳng trên điện thoại / máy tính mà không đụng tới máy quầy và không bị tính là vào ca.

## Quy tắc (BR-118)

1. `/admin` → Hôm nay; chưa đăng nhập → `/admin/login`. Đăng nhập xong vào Hôm nay (hoặc trang Quản lý đầu tiên được mở / `next`).
2. Phiên trang Quản lý riêng với máy quầy và **chỉ có được bằng đăng nhập** (ADR-044 — không đi theo phiên máy quầy); đăng xuất trang Quản lý chỉ thoát trang Quản lý. Chiều ngược lại: đã đăng nhập trang Quản lý thì "Mở màn hình quầy" vào thẳng máy quầy (ADR-045 — chấm công vào, không hỏi lại mật khẩu; máy quầy đang có người khác thì giữ người đó).
3. Đăng nhập ở trang Quản lý không chấm công vào; đăng xuất không chấm công ra, không bắt đóng ca.
4. Chỉ người có trang Quản lý / Hôm nay vào được; người khác được mời xin quyền ngay ở trang đăng nhập.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/auth/login` | Công khai | Thêm `area`: `pos` (mặc định — chấm công vào như cũ) / `admin` (không chấm công) |
| `GET /admin` · `GET /admin/login` | Công khai (trang) | `/admin` → 302 `/admin/today`; trang Đăng nhập Quản lý |

## Acceptance Criteria

- AC-080-01: Đăng nhập `area = admin` (quản lý cửa hàng, nhân viên) → không có bản ghi chấm công mở; token dùng được như thường (`/auth/me` có quyền); đăng nhập máy quầy (mặc định / `pos`) → chấm công vào như cũ; `area` lạ → 400; sai mật khẩu → 401.
- AC-080-02: `GET /admin` → 302 `/admin/today`; `GET /admin/login` → trang HTML "Đăng nhập Quản lý" (nạp `admin-login.js`, không phải `pos-login.js`).
- AC-080-03: Trên trình duyệt mới: mở `/admin` → `/admin/login?next=/admin/today`; chủ quán đăng nhập → Hôm nay (F-084: chủ quán không có "Mở màn hình quầy"; người khác có — mở tab mới); mở `/pos` cùng trình duyệt → vẫn phải đăng nhập quầy; trang Quản lý khác vẫn dùng được; Đăng xuất → `/admin/login`; nhân viên đăng nhập ở đây → "chưa có quyền vào trang Quản lý" + ô chọn quyền để xin, không vào được; đăng nhập máy quầy bằng quản lý cửa hàng rồi mở `/admin` → vẫn `/admin/login?next=/admin/today`, không có "Vào bằng tài khoản này" — gõ mật khẩu mới vào Hôm nay (ADR-044).
- AC-080-04: Đã đăng nhập trang Quản lý (`area = admin`, chưa vào ca) → `POST /api/auth/pos-session` → `200 { user }` (không có token mới), chấm công vào; gọi lại vẫn một bản ghi đang mở; chủ quán → `403 OWNER_ADMIN_ONLY`; không token → `401` (ADR-045).
- AC-080-05: Trên trình duyệt máy tính 1920 px: quản lý cửa hàng đăng nhập trang Quản lý trên máy còn phiên quầy cũ đã hết hạn → "Mở màn hình quầy" (tab mới) vào thẳng `/pos`, đúng tên người đó, không hỏi mật khẩu → "Quản lý" ở máy quầy về `/admin/today` không hỏi; máy quầy đang có nhân viên đăng nhập → "Mở màn hình quầy" giữ nhân viên đó; chủ quán mở `/pos?from=admin` → trang đăng nhập quầy (ADR-045).

## Bằng chứng

`tests/admin-area.test.js` (AC-080-01, 02) · E2E "trang Quản lý riêng: máy mới mở /admin…" (AC-080-03) · `tests/admin-area.test.js` (AC-080-04) · E2E "đăng nhập một lần…" (AC-080-05). Cập nhật E2E F-077 (AC-077-08): quản lý cửa hàng mở thẳng Lãi / lỗ → ở lại Hôm nay kèm thanh Xin quyền.
