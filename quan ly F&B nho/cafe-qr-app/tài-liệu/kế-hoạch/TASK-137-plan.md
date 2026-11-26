# TASK-137 — Kế hoạch: bật / tắt ô hội viên trên màn khách (F-101, ADR-071)

- **Vì sao cần plan:** đổi hợp đồng API (`guestMemberBox`, `ui.memberBox`, `/api/shop` `memberBox`, lỗi `MEMBER_SELF_OFF`) và chạm ≥ 2 module (Cài đặt, màn khách, hội viên).
- **Không đổi:** CSDL (khóa Settings mới, không migration), quyền của quầy, cách tính giảm giá hội viên khi thu tiền.

## Các bước

1. Máy chủ: `settingsService.guestMemberBox` ← `guest.member_box` (khác `'false'` = bật) + `KEYS`; `publicShop().memberBox`; `menuService` `ui.memberBox`; `routes/operations.js` trường `guestMemberBox` (chỉ chủ quán — không thêm vào `STORE_MGR_SETTINGS`); `routes/public.js` middleware `guestMemberOn` trước 4 endpoint hội viên của khách.
2. Giao diện: `admin-settings.js` công tắc; `t-entry.js`, `t-menu.js` (theo `menu.ui.memberBox`), `t-track.js` (theo `/api/shop` `memberBox`) không gắn ô khi tắt.
3. Test: `tests/guest-member-box.test.js` (AC-101-01/02); E2E AC-101-03; cập nhật 2 test so danh sách khóa `/api/shop`.
4. Tài liệu: ADR-071, FEATURE-101, BR-131, US-101-1, api-contract, screens-flows, tc-map, README chỉ mục.
5. Vận hành: khởi động lại máy chủ của quán.

## Rủi ro

- Test cũ đăng ký hội viên từ điện thoại khách: mặc định bật nên không đổi; test mới bật lại sau khi tắt.
