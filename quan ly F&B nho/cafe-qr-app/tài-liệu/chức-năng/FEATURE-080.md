# FEATURE-080 — Trang Quản lý riêng

> **Nguồn:** chủ dự án 07/11/2026 ("tôi muốn admin nó là một trang riêng biệt thì được không"; duyệt đề xuất: "duyệt"). Quyết định: [ADR-038](../quyết-định/ADR-038-trang-quan-ly-rieng.md) D-173…D-177. Nền: [F-009](FEATURE-009.md) đăng nhập, [F-079](FEATURE-079.md) quyền riêng.

- **Status:** CONFIRMED (ADR-038) · Triển khai: [TASK-097](../công-việc/TASK-097.md)
- **Bổ sung F-084 (ADR-043, 08/11/2026):** chủ quán chỉ dùng trang Quản lý — không đăng nhập máy quầy, không có lối "Mở màn hình quầy"; "Vào bằng tài khoản này" dành cho người khác có trang Quản lý.
- **Actor:** **ACT-ADMIN**, **ACT-STORE** (dùng trang Quản lý); **ACT-STAFF / ACT-LEAD** (máy quầy — không đổi; xin quyền khi cần).
- **Màn hình:** **Đăng nhập Quản lý** (SCR-56, `/admin/login`) — thẻ "Máy này đang đăng nhập màn hình quầy: … [Vào bằng tài khoản này]", ô tên đăng nhập / mật khẩu, nút **Vào trang Quản lý**, khung xin quyền khi chưa có quyền, liên kết "Nhân viên đứng quầy? Mở màn hình quầy"; thanh bên Quản lý: **Mở màn hình quầy** (tab mới), **Đăng xuất** (chỉ trang Quản lý).
- **Dữ liệu:** không đổi bảng.

## User Story

- **US-080-1:** Là chủ quán, tôi muốn trang Quản lý có địa chỉ và đăng nhập riêng, tách khỏi màn hình quầy, để mở thẳng trên điện thoại / máy tính mà không đụng tới máy quầy và không bị tính là vào ca.

## Quy tắc (BR-118)

1. `/admin` → Hôm nay; chưa đăng nhập → `/admin/login`. Đăng nhập xong vào Hôm nay (hoặc trang Quản lý đầu tiên được mở / `next`).
2. Phiên trang Quản lý riêng với máy quầy; đi từ máy quầy thì đi theo phiên máy quầy; đăng xuất trang Quản lý chỉ thoát trang Quản lý.
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
- AC-080-03: Trên trình duyệt mới: mở `/admin` → `/admin/login?next=/admin/today`; chủ quán đăng nhập → Hôm nay; "Mở màn hình quầy" mở tab mới; mở `/pos` cùng trình duyệt → vẫn phải đăng nhập quầy; trang Quản lý khác vẫn dùng được; Đăng xuất → `/admin/login`; nhân viên đăng nhập ở đây → "chưa có quyền vào trang Quản lý" + ô chọn quyền để xin, không vào được; đăng nhập máy quầy bằng chủ quán rồi mở `/admin/login` → "Vào bằng tài khoản này" → Hôm nay.

## Bằng chứng

`tests/admin-area.test.js` (AC-080-01, 02) · E2E "trang Quản lý riêng: máy mới mở /admin…" (AC-080-03). Cập nhật E2E F-077 (AC-077-08): quản lý cửa hàng mở thẳng Lãi / lỗ → ở lại Hôm nay kèm thanh Xin quyền.
