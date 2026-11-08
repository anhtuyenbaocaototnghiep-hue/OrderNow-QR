# FEATURE-084 — Tài khoản Chủ quán chỉ dùng trang Quản lý

> **Nguồn:** chủ dự án 08/11/2026 (kèm ảnh trang Quản lý — Hôm nay): "tài khoản admin chỉ ở trong này thôi không có ra màn hình quầy cố định luôn". Quyết định: [ADR-043](../quyết-định/ADR-043-chu-quan-chi-quan-ly.md) D-196…D-198. Nền: [F-077](FEATURE-077.md) (vai), [F-080](FEATURE-080.md) (trang Quản lý riêng).

- **Status:** CONFIRMED (ADR-043) · Triển khai: [TASK-102](../công-việc/TASK-102.md)
- **Actor:** **ACT-ADMIN** (Chủ quán). Quản lý cửa hàng, trưởng ca, nhân viên không đổi.
- **Màn hình:**
  - **Đăng nhập quầy** (SCR-09): gõ tài khoản chủ quán → sang **Hôm nay** (SCR-42) của trang Quản lý.
  - **Khung trang Quản lý**: chủ quán không có "Mở màn hình quầy".
  - **Lịch sử ca** (SCR-32): chủ quán không có "Mở trang ca ở quầy".
  - **Hôm nay**: việc cần làm dẫn tới Sổ quỹ / Đặt hàng / Nguyên liệu / Kho.
  - **Báo cáo** (SCR-25): in lại hóa đơn bằng phiên Quản lý.
- **Dữ liệu:** không đổi bảng, không cài đặt.

## User Story

- **US-084-1:** Là chủ quán, tôi muốn tài khoản của mình chỉ dùng trang Quản lý, không vào màn hình quầy, để tách hẳn việc quản lý với việc đứng quầy: mọi thao tác bán, thu tiền ở quầy đứng tên nhân viên.

## Quy tắc (BR-122)

1. Màn đăng nhập quầy gửi `area: 'pos'`; vai ADMIN → `403 OWNER_ADMIN_ONLY`. Lỗi chỉ trả khi đúng mật khẩu; không chấm công, không cấp token.
2. Màn quầy nhận lỗi đó → đăng nhập trang Quản lý bằng mật khẩu vừa gõ → Hôm nay (hoặc `next` trong `/admin`). Phiên máy quầy cũ đứng tên chủ quán → đổi thành phiên Quản lý, bỏ phiên quầy.
3. Trang Quản lý không có lối sang máy quầy cho chủ quán. Việc cần làm của chủ quán dẫn tới trang Quản lý. In lại hóa đơn dùng phiên Quản lý.
4. Không đổi: chủ quán duyệt hộ ở quầy bằng cách nhập tài khoản vào hộp duyệt; API không gửi `area` vẫn đăng nhập được; ca chủ quán mở trước đó do nhân viên đóng ở quầy.

## API

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| `POST /api/auth/login` | Công khai | `area` thành tùy chọn (`pos` \| `admin`). `area = 'pos'` + vai ADMIN → `403 OWNER_ADMIN_ONLY` (sau khi đúng mật khẩu) |

## Acceptance Criteria

- AC-084-01: Chủ quán gõ đúng mật khẩu ở màn quầy (`area = pos`) → `403 OWNER_ADMIN_ONLY`, không token, không chấm công. Sai mật khẩu → `401` như mọi tài khoản. `area = admin` và không gửi `area` → `200`. Quản lý cửa hàng, nhân viên đăng nhập quầy được và chấm công như cũ. "Đổi người" bằng PIN không chọn được chủ quán.
- AC-084-02: Trên trình duyệt:
  - gõ tài khoản chủ quán ở `/pos/login` → vào `/admin/today`, máy không có phiên máy quầy;
  - mở `/pos` → màn đăng nhập quầy;
  - máy còn phiên máy quầy cũ đứng tên chủ quán, mở trang quầy (`/pos/takeaway`) → sang `/admin/today` và phiên máy quầy bị bỏ.
- AC-084-03: Chủ quán ở trang Quản lý:
  - không thấy "Mở màn hình quầy" (thanh bên) và "Mở trang ca ở quầy" (Lịch sử ca);
  - việc cần làm ở Hôm nay không có link `/pos…`;
  - mở trang in hóa đơn mang đi bằng `?area=admin` → in được bằng phiên Quản lý.

## Bằng chứng

`tests/owner-admin-only.test.js` (AC-084-01) · E2E "chủ quán chỉ dùng trang Quản lý…" (AC-084-02, AC-084-03).
