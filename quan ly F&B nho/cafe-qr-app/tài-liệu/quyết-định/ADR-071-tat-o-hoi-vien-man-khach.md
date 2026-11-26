# ADR-071 — Công tắc bật / tắt ô "Nhập SĐT để nhận ưu đãi" trên màn khách

- **Trạng thái:** ACCEPTED (26/11/2026).
- **Chủ dự án yêu cầu (26/11/2026):** gửi ảnh ô "Nhập SĐT để nhận ưu đãi — Đơn đầu tiên giảm 10%, hội viên giảm 3–8% — Nhận ngay" và nhờ "làm cho tôi nút tắt cái này trong cài đặt bật tắt".
- **Liên quan:** [FEATURE-101](../chức-năng/FEATURE-101.md); ô hội viên trên điện thoại khách có từ F-014 / F-047 (ADR-005, ADR-008), làm nổi bật ở TASK-101; màn chào F-092.

## Quyết định

| ID | Quyết định |
| --- | --- |
| D-264 | **Cài đặt mới "Ô Nhập SĐT để nhận ưu đãi"** (`guest.member_box`, mặc định **bật** — quán đang dùng không đổi gì).<ul><li>**Ai đổi:** chỉ chủ quán (không thêm vào `STORE_MGR_SETTINGS` — ô này mời khách nhận giảm giá, liên quan tiền).</li><li>**Khi tắt, điện thoại khách:** không hiện ô hội viên ở màn chào, giỏ hàng và trang theo dõi đơn (cả ô mời lẫn thẻ thành viên). `/api/menu` trả `ui.memberBox = false`, `/api/shop` trả `memberBox = false`.</li><li>**Khi tắt, máy chủ:** khách (không có đăng nhập nhân viên) tự tra SĐT, đăng ký hội viên, gắn SĐT vào phiên, thêm ngày sinh → `403 MEMBER_SELF_OFF` ("Quán đang tắt đăng ký hội viên trên điện thoại — nhờ nhân viên ở quầy"). Tắt là tắt thật, không chỉ ẩn giao diện.</li><li>**Không đổi:** nhân viên ở quầy vẫn tra / đăng ký / gắn hội viên (Gọi món tại bàn, Thu tiền); giảm giá hội viên, điểm, quà sinh nhật / quay lại vẫn tính khi thu tiền nếu phiên có hội viên do quầy gắn; khách vẫn gỡ được SĐT đã gắn (`DELETE /api/sessions/{id}/member`).</li><li>**Bật lại** → mọi thứ như trước.</li></ul> |

## Phương án đã cân nhắc

- **Chỉ ẩn giao diện:** người rành vẫn gọi API để tự đăng ký lấy giảm giá đơn đầu. Bỏ: chặn ở máy chủ.
- **Chỉ ẩn ô mời, vẫn hiện thẻ thành viên khi quầy đã gắn:** chủ quán nhờ tắt "cái này" — hiện một nửa dễ gây hiểu nhầm là chưa tắt. Bỏ.
- **Tắt hẳn chương trình hội viên:** chủ quán chỉ nhờ tắt ô trên màn khách; quầy vẫn cần gắn hội viên. Bỏ.

## Hệ quả

- **Mã nguồn:** `settingsService` (`guestMemberBox`), `routes/operations.js` (trường cài đặt), `menuService` (`ui.memberBox`), `/api/shop` (`memberBox`), `routes/public.js` (chặn khách ở 4 endpoint hội viên); `t-entry.js`, `t-menu.js`, `t-track.js` (không gắn ô khi tắt); `admin-settings.js` (công tắc ở thẻ "Màn gọi món của khách").
- **Dữ liệu:** khóa cài đặt `guest.member_box` (không migration).
- **Vận hành:** phải khởi động lại máy chủ; điện thoại khách đổi theo khi tải lại trang.
- **Tài liệu:** FEATURE-101 (AC-101-01…03), BR-131, US-101-1, api-contract, screens-flows, tc-map.
