# FEATURE-062 — Trang chính sách dữ liệu cho khách

> **Nguồn:** chủ dự án 29/10/2026 ("câu đồng ý lưu SĐT + nút xóa hội viên"). Quyết định: [ADR-021](../quyết-định/ADR-021-che-do-co-ban-chinh-sach-qr.md) D-81.

- **Status:** CONFIRMED (ADR-021) · Triển khai: [TASK-077](../công-việc/TASK-077.md)
- **Đã có từ trước (không làm lại):** ô đồng ý khi đăng ký hội viên ở phía khách và ở quầy, server từ chối khi thiếu (`400 CONSENT_REQUIRED`), lưu `Members.ConsentAt` (F-014); quản lý **"Ẩn danh theo yêu cầu"** — xóa tên, băm SĐT, giữ lịch sử thanh toán (F-014 / NĐ 13/2023); khách từ chối nhận tin chiến dịch (F-037). Xem `members.test.js`.
- **Phần mới:** trang công khai **"Chính sách dữ liệu"** (SCR-48, `/chinh-sach-du-lieu`) + link tới trang ngay ở các câu đồng ý.
- **Actor:** **ACT-GUEST / ACT-MEMBER** (đọc), **ACT-STAFF** (mở cho khách xem khi đăng ký hộ), **ACT-ADMIN** (xử lý yêu cầu xóa bằng "Ẩn danh theo yêu cầu").

## User Story

- **US-062-1:** Là khách được mời đăng ký hội viên bằng số điện thoại, tôi muốn đọc được quán lưu gì, để làm gì và muốn xóa thì làm sao, để yên tâm đồng ý.

## Quy tắc (BR-098)

- Trang mở được không cần đăng nhập, trên điện thoại không cuộn ngang; ghi **tên quán** (Cài đặt → Thông tin quán) và địa chỉ (nếu có).
- Nội dung: dữ liệu lưu (SĐT, họ tên, lịch sử mua, điểm / tem / voucher — khách không đăng ký thì app không lưu SĐT), mục đích (tích lũy ưu đãi, hạng hội viên, thông báo khuyến mãi nếu không từ chối), ai xem (chủ quán, nhân viên khi thu tiền; màn khách chỉ hiện SĐT / tên đã che), không bán / chia sẻ cho bên khác, lưu tới khi khách yêu cầu xóa, quyền của khách (xem, sửa, từ chối nhận tin, xóa), cách yêu cầu (báo nhân viên hoặc quản lý tại quầy; quản lý bấm "Ẩn danh theo yêu cầu" — lịch sử thanh toán giữ cho kế toán nhưng không còn gắn với SĐT / tên), căn cứ Nghị định 13/2023/NĐ-CP.
- Link "Chính sách dữ liệu" ở: câu đồng ý phía khách (ô "Nhập SĐT để nhận ưu đãi"), hộp đăng ký hội viên ở Thu tiền bàn và Gọi món tại bàn (mở tab mới để không mất dữ liệu đang nhập), trang chủ `/`.
- Khách **không** tự xóa qua mạng (không xác minh được chủ số điện thoại).

## API

Không thêm endpoint. Trang đọc tên / địa chỉ quán từ `GET /api/shop` (mới, công khai — chỉ `{ name, address }`).

## Acceptance Criteria

- AC-062-01: `GET /chinh-sach-du-lieu` → `200` không cần đăng nhập; `GET /api/shop` → `{ name, address }` theo Cài đặt (đổi tên quán → trang ghi tên mới), không lộ khóa cài đặt khác.
- AC-062-02: Câu đồng ý phía khách và 2 hộp đăng ký ở quầy có link tới `/chinh-sach-du-lieu`; đăng ký thiếu đồng ý vẫn `400 CONSENT_REQUIRED` (hồi quy F-014).
- AC-062-03: Trên trình duyệt: khách mở link từ ô đăng ký trong giỏ → trang chính sách có tên quán, mục "Quyền của bạn" và cách yêu cầu xóa; trên 390 px không cuộn ngang.

## Bằng chứng

`tests/basic-mode.test.js` (AC-062-01, 02) · E2E "chính sách dữ liệu…".
