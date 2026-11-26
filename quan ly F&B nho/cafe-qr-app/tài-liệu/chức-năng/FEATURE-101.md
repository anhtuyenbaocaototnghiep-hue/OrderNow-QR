# FEATURE-101 — Bật / tắt ô "Nhập SĐT để nhận ưu đãi" trên màn khách

> **Nguồn:** chủ dự án 26/11/2026 — ảnh ô "Nhập SĐT để nhận ưu đãi" kèm "làm cho tôi nút tắt cái này trong cài đặt bật tắt". Quyết định: [ADR-071](../quyết-định/ADR-071-tat-o-hoi-vien-man-khach.md) D-264.

- **Status:** CONFIRMED (yêu cầu trực tiếp của chủ dự án) · Triển khai: [TASK-137](../công-việc/TASK-137.md)
- **Actor:** ACT-ADMIN (chủ quán bật / tắt), ACT-GUEST (khách thấy / không thấy ô), ACT-STAFF (quầy vẫn gắn hội viên).
- **Màn hình:** SCR-33 Cài đặt → "Màn gọi món của khách"; SCR-01 màn chào, SCR-02 / SCR-03 thực đơn + giỏ hàng, SCR-04 theo dõi đơn.
- **Dữ liệu:** khóa cài đặt `guest.member_box` (`'false'` = tắt; chưa có = bật). Không migration.

## User Story

- **US-101-1:** Là chủ quán, tôi muốn bật / tắt ô "Nhập SĐT để nhận ưu đãi" trên điện thoại khách ngay trong Cài đặt, để khi quán chưa muốn chạy chương trình hội viên thì khách không thấy lời mời giảm giá và không tự đăng ký được, còn nhân viên vẫn gắn hội viên ở quầy khi cần.

## Quy tắc (BR-131)

1. Mặc định **bật** (như trước). Chỉ chủ quán đổi (`PUT /api/admin/settings` `guestMemberBox`); quản lý cửa hàng, trưởng ca, nhân viên → `403`.
2. Tắt → điện thoại khách không hiện ô hội viên ở màn chào, giỏ hàng, trang theo dõi đơn (ô mời và thẻ thành viên).
3. Tắt → khách (không đăng nhập nhân viên) gọi `POST /api/members/lookup`, `POST /api/members`, `POST /api/sessions/{id}/member`, `POST /api/sessions/{id}/member/birthday` → `403 MEMBER_SELF_OFF`. Nhân viên gọi kèm đăng nhập → chạy như cũ.
4. Không đổi giảm giá / điểm / quà khi thu tiền: phiên có hội viên do quầy gắn vẫn được tính như cũ.

## API (thay đổi trên endpoint đã có)

- `GET /api/admin/settings`: thêm `guestMemberBox` (boolean). `PUT /api/admin/settings`: nhận `guestMemberBox` (chỉ chủ quán).
- `GET /api/menu`: `ui.memberBox` (boolean). `GET /api/shop`: `memberBox` (boolean).
- 4 endpoint hội viên của khách ở quy tắc 3: thêm lỗi `403 MEMBER_SELF_OFF` khi tắt.

## Acceptance Criteria

- AC-101-01: Mặc định `guestMemberBox = true`, `/api/menu` `ui.memberBox = true`, `/api/shop` `memberBox = true`. Chủ quán tắt → cả ba trả `false`; bật lại → `true`. Quản lý cửa hàng, trưởng ca, nhân viên đổi → `403`, giá trị không đổi.
- AC-101-02: Tắt → khách tự tra SĐT / đăng ký / gắn SĐT vào phiên / thêm ngày sinh → `403 MEMBER_SELF_OFF`, không tạo hội viên, phiên không có hội viên; nhân viên (Bearer) tra và gắn hội viên cho phiên đó vẫn được. Bật lại → khách tự đăng ký được.
- AC-101-03: Trên trình duyệt: chủ quán bỏ tích "Ô Nhập SĐT để nhận ưu đãi" ở Cài đặt → điện thoại khách không còn ô hội viên ở giỏ hàng và trang theo dõi đơn; tích lại → ô hiện lại.
