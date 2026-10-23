# Actor & Actor Function Matrix (bước 02 + 03)

> **Mẫu:** Sổ tay quy trình 15 bước, bước 02 "Actor Identification" và bước 03 "Actor Functions", Mẫu 02. **Phiên bản:** v1.0 — 20/10/2026 ([TASK-057](../công-việc/TASK-057.md)). **Nguồn:** [roles-permissions.md](roles-permissions.md) (§4.1–4.5, ma trận `PERMISSIONS`), [chức-năng/README.md](../chức-năng/README.md) + FEATURE-001…047, [business-rules.md](business-rules.md), [vận-hành/local-development.md](../vận-hành/local-development.md) (job nền), [project-brief.md](../sản-phẩm/project-brief.md). **Trạng thái tài liệu:** CHỜ DUYỆT G1 — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION).

Quy ước ID theo [TASK-057](../công-việc/TASK-057.md): Actor `ACT-…` / hệ thống ngoài `EXT-…`; chức năng theo Actor `AF-<ACTOR>-<nn>`. Quyền chi tiết (ai được gọi endpoint nào) vẫn lấy từ [roles-permissions.md](roles-permissions.md) — file này không chép lại ma trận, chỉ tóm tắt theo Actor.

## 1. Actor Register

| ID | Actor | Mô tả | Mục tiêu chính | Mức quyền | Lưu ý (dữ liệu / riêng tư) | Liên hệ / người đại diện UAT |
| --- | --- | --- | --- | --- | --- | --- |
| ACT-GUEST | Khách quét QR | Khách ngồi tại bàn, quét mã QR trên bàn bằng điện thoại, dùng trình duyệt (không cài app). Không có tài khoản | Gọi món nhanh (≤ 3 chạm — NFR-003), theo dõi đơn, gọi thanh toán, gọi nhân viên, chia bill | **Không đăng nhập.** Cookie `cf_client` (HttpOnly, 1 năm); chỉ thấy phiên mình đang tham gia (`SessionClients`) và đơn trong phiên đó; không có API nào đổi trạng thái thanh toán (BR-007) | Phiên cá nhân trên cùng bàn không thấy nhau; khi gộp chỉ thấy số món + tổng tạm tính của nhóm, không thấy ghi chú bàn / người mở bàn (BR-032) | Người đại diện thật: NEEDS_CONFIRMATION (chưa có Q). UAT nội bộ: Sáng (Testing) đóng vai — PROPOSED |
| ACT-MEMBER | Khách hội viên | **Dạng đặc biệt của ACT-GUEST:** khách đã gắn SĐT hội viên vào phiên của chính điện thoại (tự nhập hoặc nhân viên gắn). Không có tài khoản, không OTP (D-6, D-37) | Nhận ưu đãi hạng / đơn đầu, tích điểm & tem, đổi quà, dùng voucher, gọi lại đơn lần trước, xem Thẻ thành viên | Như ACT-GUEST **+** xem / gọi lại / ♥ / Thẻ thành viên của **hội viên đang gắn vào phiên chưa đóng của chính điện thoại** (khác → 403 — BR-033, BR-072) | Lưu SĐT + họ tên **chỉ khi đồng ý** (`ConsentAt`, D-16, BR-024); khách chỉ thấy tên che, SĐT che; không thấy mã voucher; có "Ẩn danh theo yêu cầu" và từ chối nhận tin (opt-out) | Như ACT-GUEST — NEEDS_CONFIRMATION (chưa có Q) |
| ACT-STAFF | Nhân viên quầy | Thu ngân kiêm pha chế (một dashboard — Q-017); đứng quầy hoặc cầm tablet ra bàn | Nhận đơn realtime, tiếp nhận, hoàn tất & trừ kho, thu tiền mặt, in bill, bán mang đi, gọi món giúp khách, sơ chế / hủy hàng / nhận hàng | Đăng nhập, vai **STAFF**: `pos.use`, `shift.manage`, `cash.create`, `prep.post`, `waste.create`, `po.receive`. Giảm tay tự duyệt ≤ 10 % **và** ≤ 20.000đ; hoàn tiền, sửa / xóa món đơn đã tiếp nhận cần trưởng ca / quản lý nhập tài khoản | Thấy tên đầy đủ hội viên ở quầy; nhiều người có thể dùng chung một tài khoản (roles-permissions §4.3); đăng nhập = chấm công vào (BR-052) | Người đại diện thật: NEEDS_CONFIRMATION (chưa có Q). UAT nội bộ: Sáng — PROPOSED |
| ACT-LEAD | Trưởng ca | Nhân viên có quyền trưởng ca, thêm ở ADR-006 (D-24) | Duyệt / xử lý ngoại lệ trong ca: giảm tay lớn hơn, hoàn tiền trong ca, duyệt chi quỹ, sửa chấm công hôm nay, điều chỉnh kho, kiểm kê | Đăng nhập, vai **MANAGER**: mọi quyền STAFF **+** `cash.approve` (≤ 2.000.000đ), `attendance.edit` (chỉ hôm nay), `inventory.adjust`, `stocktake.post`, `dashboard.view` (bản rút gọn). Giảm tay ≤ 20 % **và** ≤ 50.000đ. **Không** vào `/api/admin/*`, `/admin/*` (trừ `/admin/today`) | Server bỏ giá vốn, lãi gộp, tổng tiền chi chờ duyệt khỏi dashboard của trưởng ca (BR-065); không xem báo cáo tài chính, tài khoản | Người đại diện thật: NEEDS_CONFIRMATION (chưa có Q). UAT nội bộ: Sáng — PROPOSED |
| ACT-ADMIN | Quản lý / chủ quán | Người cấu hình và theo dõi quán; cấp tài khoản cho nhân viên | Cấu hình menu, bàn + QR, kho, giá, khuyến mãi, hội viên; xem báo cáo, lãi / lỗ, phân tích; quản lý tài khoản, nhật ký | Đăng nhập, vai **ADMIN**: mọi quyền (`admin.all`), kể cả quyền STAFF / MANAGER; giảm tay không giới hạn. Luôn còn ≥ 1 ADMIN đang hoạt động (BR-047). Không tự chấm công (BR-052) | Quyền nhạy cảm: mọi thao tác đổi dữ liệu dưới `/api/admin/*` ghi nhật ký chỉ đọc 12 tháng (BR-055); xem được SĐT đầy đủ trong CSV chiến dịch (mỗi lần tải ghi nhật ký — BR-062) | Chủ dự án (người duyệt G1) — NEEDS_CONFIRMATION (Q-000) |
| EXT-ZALO | Zalo OA | Hệ thống ngoài nhận tin chiến dịch gửi tới SĐT hội viên (`src/channels/zaloOa.js`) | Gửi tin chiến dịch theo phân khúc | **Chỉ bật khi có `ZALO_OA_TOKEN`** (+ `ZALO_OA_URL`); chưa có → `400 CHANNEL_NOT_CONFIGURED`. Mặc định chiến dịch dùng kênh `EXPORT` (CSV) | Nhận SĐT + nội dung tin của hội viên trong phân khúc (đã loại opt-out, ẩn danh). Gửi thật: NOT_RUN (chưa có token) | Liên hệ kỹ thuật: Nhật Anh (Back-end) — PROPOSED theo Q-000; chủ tài khoản OA: NEEDS_CONFIRMATION (chưa có Q) |
| EXT-PRINTER | Máy in bill | Máy in nhiệt ở quầy nhận lệnh in từ trình duyệt máy POS (iframe ẩn, `@media print`) | In bill thanh toán, phiếu tạm tính, phiếu chốt ca, phiếu đặt hàng | Không có API; chỉ nhận lệnh in của trình duyệt. Khổ **58 / 80 mm** chọn trên trang in (nhớ theo máy). Không mở ngăn kéo tiền (Q-007 — làm sau) | Bill có thể in khối "Thẻ thành viên (lúc in)": điểm, tem, voucher còn hạn — không có mã voucher (BR-073). In máy thật: NOT_RUN | Liên hệ kỹ thuật: Tuyến (Front-end, trang in S-12) — PROPOSED theo Q-000 |
| EXT-SCHEDULER | Bộ lập lịch job nền | `setInterval` 30 giây trong cùng tiến trình server (`src/jobs/scheduler.js`), khóa trong DB, ghi `JobRuns`; tắt bằng `JOBS_ENABLED=false` | Tính sẵn số liệu, cảnh báo kho, đóng chấm công quên đăng xuất, chạy chiến dịch hẹn giờ, dọn nhật ký | Chạy như hệ thống (không qua HTTP); ADMIN chạy thủ công một job bằng `POST /api/admin/jobs/{name}/run` | Job `audit-retention` xóa nhật ký quá 12 tháng (BR-055). Job theo giờ thật: NOT_RUN (đã kiểm bằng chạy tay) | Liên hệ kỹ thuật: Nhật Anh (Back-end) — PROPOSED theo Q-000 |

**Không coi là Actor** (thành phần bên trong hệ thống, mô tả ở roles-permissions §4.2 và `kiến-trúc/`): SQL Server (giữ bất biến kho trong stored procedure), realtime hub Socket.io, nơi lưu ảnh hóa đơn sổ quỹ (`uploads/receipts/`). Actor "Cổng thanh toán VietQR" của Word đã bỏ theo D-1 (ADR-000).

**Đối chiếu tên cũ:** "Khách (CUSTOMER)" ở roles-permissions §4.1 = ACT-GUEST / ACT-MEMBER; STAFF = ACT-STAFF; MANAGER = ACT-LEAD; ADMIN = ACT-ADMIN; "Kênh Zalo OA", "Máy in nhiệt", "Cron job / bộ lập lịch" ở §4.2 = EXT-ZALO, EXT-PRINTER, EXT-SCHEDULER.

**Một người nhiều vai:** một người thật có thể vừa là khách vừa là hội viên (ACT-GUEST → ACT-MEMBER khi gắn SĐT); nhưng mỗi tài khoản đăng nhập chỉ có một vai (roles-permissions §4.3 — PROPOSED). ACT-LEAD có mọi chức năng của ACT-STAFF; ACT-ADMIN có mọi chức năng của ACT-STAFF và ACT-LEAD (trừ tự chấm công).

## 2. Actor Function Matrix

**Quy tắc (sổ tay bước 03):** Chức năng theo Actor (AF) **không đồng nghĩa với Module**. Bảng này chỉ liệt kê việc mỗi Actor làm để không bỏ sót nhu cầu; đến bước 07 các AF mới được gom thành Module (`MOD-ORDER`, `MOD-BILLING`, `MOD-INVENTORY`, … theo TASK-057), và một Module phục vụ nhiều Actor với quyền khác nhau.

**Quy tắc ưu tiên:** **Must** = FEATURE MVP F-001…F-012 (phạm vi bản đầu, overview §1.2) và F-046…F-055 (chủ dự án yêu cầu, ADR-007…ADR-011, ADR-014, ADR-017; F-053 yêu cầu trực tiếp 23/10/2026); **Should** = mọi FEATURE còn lại (đã được chủ dự án duyệt qua ADR-005, ADR-006 và yêu cầu 16/10/2026, nhưng nguồn không ghi mức ưu tiên riêng); **Could** = không có dòng nào (chưa nguồn nào hạ ưu tiên). Một dòng AF chỉ gắn nhiều FEATURE khi các FEATURE cùng mức ưu tiên.

Cột "Quyền / phạm vi" là quyền sơ bộ; quyền chính thức kiểm ở server theo `PERMISSIONS` (BR-044).

### 2.1. ACT-GUEST — Khách quét QR

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-GUEST-01 | Quét QR vào bàn, chọn Gộp chung / Cá nhân | `Tables`, `Sessions`, `SessionClients` | Công khai; cookie `cf_client`; chỉ thấy số món + tổng của phiên đang mở | Must | [F-001](../chức-năng/FEATURE-001.md) |
| AF-GUEST-02 | Xem menu, thêm món vào giỏ | `MenuItems`, `Categories`; giỏ lưu ở client | Công khai; món hết hiện mờ "Hết món" | Must | [F-002](../chức-năng/FEATURE-002.md) |
| AF-GUEST-03 | Gửi đơn gọi món | `Orders`, `OrderItems`, `OrderIngredients`, `Ingredients.ReservedQty` | Chỉ phiên của mình, phiên chưa đóng; giá do server tính | Must | [F-003](../chức-năng/FEATURE-003.md) |
| AF-GUEST-04 | Theo dõi trạng thái đơn và tổng tạm tính | `Orders` của phiên; sự kiện room `session:{id}` | Chỉ phiên của mình | Must | [F-004](../chức-năng/FEATURE-004.md) |
| AF-GUEST-05 | Gọi thanh toán | `Sessions.Status`, `PaymentRequestedAt` | Phiên của mình, `OPEN`, có ≥ 1 đơn không hủy | Must | [F-005](../chức-năng/FEATURE-005.md) |
| AF-GUEST-06 | Xem đơn / tổng tiền cập nhật khi quầy sửa / xóa món hoặc hủy bàn | `Orders` (tổng tính lại), `Sessions` | Chỉ xem kết quả; không tự sửa / xóa | Must | [F-046](../chức-năng/FEATURE-046.md) |
| AF-GUEST-07 | Chọn tùy chọn món (size, topping) | `ModifierGroups`, `ModifierOptions`, `OrderItemModifiers` | Theo Min/Max của nhóm | Should | [F-013](../chức-năng/FEATURE-013.md) |
| AF-GUEST-08 | Gọi combo cố định | `ComboComponents`, dòng cha / dòng con `OrderItems` | Combo hết khi thành phần hết | Should | [F-015](../chức-năng/FEATURE-015.md) |
| AF-GUEST-09 | Xem ưu đãi và được áp khuyến mãi tự động | `Promotions`, `PromotionUsages` | Khuyến mãi khóa lúc gửi đơn | Should | [F-016](../chức-năng/FEATURE-016.md) |
| AF-GUEST-10 | Xem mục Gợi ý / Bán chạy | `MenuItems.IsPinned`, thống kê bán chạy | Công khai | Should | [F-017](../chức-năng/FEATURE-017.md) |
| AF-GUEST-11 | Tra cứu / đăng ký hội viên bằng SĐT và gắn vào phiên (→ trở thành ACT-MEMBER) | `Members` (`ConsentAt`), `Sessions.MemberId` | Phiên của mình; bắt buộc đồng ý; giới hạn 10 lần/phút/IP, 20 lần/phút/thiết bị | Should | [F-014](../chức-năng/FEATURE-014.md) |
| AF-GUEST-12 | Nhập SĐT người giới thiệu khi đăng ký hội viên | `Members.ReferredByMemberId` | Người giới thiệu phải là hội viên đang hoạt động, khác mình, ≤ 5 lượt / tháng | Should | [F-038](../chức-năng/FEATURE-038.md) |
| AF-GUEST-13 | Gọi nhân viên (nước lọc, đá, khăn giấy, dọn bàn…) | `StaffCalls` | Phiên của mình, 60 giây / lần | Should | [F-021](../chức-năng/FEATURE-021.md) |
| AF-GUEST-14 | Xem thời gian chờ ước tính | Hàng chờ đơn, `ItemPrepStats` | Công khai (giỏ) / phiên của mình (theo dõi đơn) | Should | [F-025](../chức-năng/FEATURE-025.md) |
| AF-GUEST-15 | Tạo "phần của tôi", nhận / bỏ dòng món khi chia bill | `SessionSplits`, `OrderItems.SplitId` | Mỗi điện thoại một phần; chỉ gán / bỏ dòng Chung hoặc dòng của phần mình | Should | [F-026](../chức-năng/FEATURE-026.md) |
| AF-GUEST-16 | Xem thông báo quán tạm ngưng nhận đơn QR / danh mục ngoài giờ bán | `Settings.store.*`, `Categories.SellFrom/SellTo` | Bị chặn gửi đơn khi tạm ngưng (503) | Should | [F-020](../chức-năng/FEATURE-020.md) |
| AF-GUEST-17 | Xem menu theo lịch thực đơn hiện hành | `MenuSchedules`, `MenuScheduleItems` | Món ngoài lịch bị ẩn với khách | Should | [F-040](../chức-năng/FEATURE-040.md) |
| AF-GUEST-18 | Điện thoại tự theo nhóm khi nhóm được chuyển bàn | `Sessions` (bàn mới), mã QR bàn mới | Chỉ người trong nhóm nhận mã QR bàn mới | Must | [F-049](../chức-năng/FEATURE-049.md) |
| AF-GUEST-19 | Chấm sao từng món + góp ý sau khi thanh toán; xem sao trung bình trên menu | `Reviews`, `ReviewItems` | Điện thoại thuộc nhóm, 1 lần / lượt, 24 giờ | Must | [F-051](../chức-năng/FEATURE-051.md) |
| AF-GUEST-20 | Thấy "Quán chưa mở ca" khi quầy chưa mở ca (vẫn xem menu); nút gửi tự bật lại khi quầy mở ca | `Shifts` (có ca mở không) | Không gửi được đơn khi chưa có ca | Must | [F-055](../chức-năng/FEATURE-055.md) |

### 2.2. ACT-MEMBER — Khách hội viên (có mọi AF-GUEST)

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-MEMBER-01 | Xem Thẻ thành viên (điểm, ≤ 10 giao dịch điểm, thẻ tem, quà đổi được, voucher còn dùng + nguồn + hạn) | `Members`, `PointTransactions`, `StampCards`, `RewardCatalog`, `Vouchers` (không mã) | Phiên còn mở, đang gắn hội viên, thiết bị thuộc phiên | Must | [F-047](../chức-năng/FEATURE-047.md) |
| AF-MEMBER-02 | Nhận bill có khối "Thẻ thành viên (lúc in)" | Số liệu điểm / tem / voucher lúc in | Bill thanh toán có hội viên đang hoạt động, chưa ẩn danh | Must | [F-047](../chức-năng/FEATURE-047.md) |
| AF-MEMBER-03 | Nhận chiết khấu hội viên (theo hạng, đơn đầu −10 %) khi thanh toán | `MemberTiers`, `Members.TotalSpent`, `Payments` | Tính lúc thu tiền (D-8); tự nâng hạng, không tự hạ | Should | [F-014](../chức-năng/FEATURE-014.md) |
| AF-MEMBER-04 | Yêu cầu ẩn danh dữ liệu cá nhân (quản lý thực hiện) | `Members` (xóa tên, băm SĐT) | Theo yêu cầu khách; giữ lịch sử thanh toán | Should | [F-014](../chức-năng/FEATURE-014.md) |
| AF-MEMBER-05 | Xem điểm, thẻ tem, số voucher ở ô hội viên | `Members.Points`, `StampCards`, `Vouchers` | Không thấy mã voucher | Should | [F-039](../chức-năng/FEATURE-039.md) |
| AF-MEMBER-06 | Nhận voucher giới thiệu sau lượt thu đầu ≥ 30.000đ | `Vouchers` (`REFERRAL`) | Chỉ xét lượt thu đầu tiên (Q-022) | Should | [F-038](../chức-năng/FEATURE-038.md) |
| AF-MEMBER-07 | Gọi lại đơn lần trước | Đơn đã thu của hội viên, `skipped[]` | Chỉ hội viên đang gắn vào phiên chưa đóng của chính điện thoại | Should | [F-045](../chức-năng/FEATURE-045.md) |
| AF-MEMBER-08 | Đánh dấu ♥ / xem món yêu thích | `MemberFavorites` | Như AF-MEMBER-07 | Should | [F-045](../chức-năng/FEATURE-045.md) |
| AF-MEMBER-09 | Nhận tin / voucher chiến dịch, hoặc yêu cầu từ chối nhận tin | `CampaignDeliveries`, `Vouchers` (`CAMPAIGN`), `Members.OptOut` | Tối đa 1 tin / 7 ngày; opt-out do quản lý đặt theo yêu cầu | Should | [F-037](../chức-năng/FEATURE-037.md) |

### 2.3. ACT-STAFF — Nhân viên quầy

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-STAFF-01 | Đăng nhập / đăng xuất máy quầy | `Users`, token | Tài khoản `IsActive`; khóa → 403 | Must | [F-009](../chức-năng/FEATURE-009.md) |
| AF-STAFF-02 | Nhận đơn mới realtime và tiếp nhận đơn | `Orders` (`PENDING` → `PREPARING`) | `pos.use`; mọi đơn của quán | Must | [F-007](../chức-năng/FEATURE-007.md) |
| AF-STAFF-03 | Hoàn tất đơn và trừ kho | `Orders`, `Ingredients`, `InventoryTransactions(DEDUCT)`, `OrderItems.CogsAmount` | `pos.use`; trừ đúng một lần | Must | [F-007](../chức-năng/FEATURE-007.md) |
| AF-STAFF-04 | Hủy đơn chờ tiếp nhận kèm lý do | `Orders` (`CANCELLED`), `ReservedQty` | `pos.use`; chỉ đơn `PENDING` (BR-013) | Must | [F-007](../chức-năng/FEATURE-007.md) |
| AF-STAFF-05 | Nhận yêu cầu gọi thanh toán, thu tiền mặt tại bàn, đóng phiên | `Sessions`, `Orders.PaymentStatus`, `Payments` | `pos.use`; cần ca mở; phiên không còn đơn `PENDING` | Must | [F-006](../chức-năng/FEATURE-006.md) |
| AF-STAFF-06 | In phiếu tạm tính, in / in lại bill | Dữ liệu hóa đơn phiên | `pos.use`; bill chính thức chỉ khi đã thu (BR-014) | Must | [F-006](../chức-năng/FEATURE-006.md) |
| AF-STAFF-07 | Đóng bàn trống | `Sessions` (`CLOSED`, không lượt thu) | Phiên không có đơn nào khác `CANCELLED` (Q-018) | Must | [F-006](../chức-năng/FEATURE-006.md) |
| AF-STAFF-08 | Bán mang đi, thu tiền ngay, in bill | `Orders` (`TAKE_AWAY`, `PAID`), `Payments` | `pos.use`; cần ca mở; tiền đưa ≥ phải thu | Must | [F-008](../chức-năng/FEATURE-008.md) |
| AF-STAFF-09 | Sửa số lượng / xóa món chưa thu | `OrderItems`, `OrderItemVoids`, kho (`RELEASE` / `WASTE` / `RESTOCK`) | Đơn `PENDING`: tự làm; đơn `PREPARING` / `COMPLETED`: cần trưởng ca / quản lý nhập tài khoản; lý do bắt buộc | Must | [F-046](../chức-năng/FEATURE-046.md) |
| AF-STAFF-10 | Xóa đơn tại bàn chưa thu, hủy bàn | `Orders` (`CANCELLED`), `Sessions` (`CancelledBy`, `CancelReason`) | Như AF-STAFF-09; phiên đã có lượt thu không hủy bàn được | Must | [F-046](../chức-năng/FEATURE-046.md) |
| AF-STAFF-11 | Tra cứu / đăng ký nhanh / gắn / gỡ hội viên ở Gọi món tại bàn | `Members`, `Sessions.MemberId` | `pos.use`; đăng ký phải tick khách đồng ý | Must | [F-047](../chức-năng/FEATURE-047.md) |
| AF-STAFF-12 | Chấm công vào / ra tự động khi đăng nhập, đăng xuất, đóng ca | `Attendance` | Tự động; tối đa một bản ghi mở / người | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-STAFF-13 | Chọn tùy chọn món và combo khi bán | `OrderItemModifiers`, `ComboComponents` | `pos.use` | Should | [F-013](../chức-năng/FEATURE-013.md), [F-015](../chức-năng/FEATURE-015.md) |
| AF-STAFF-14 | Tra cứu / đăng ký nhanh / gắn hội viên khi thu tiền hoặc bán mang đi | `Members`, `Sessions.MemberId`, `Orders.MemberId` | `pos.use`; thấy tên đầy đủ; không bị giới hạn tần suất | Should | [F-014](../chức-năng/FEATURE-014.md) |
| AF-STAFF-15 | Áp mã voucher, đăng ký hội viên có người giới thiệu | `Vouchers`, `Payments.VoucherId` | `pos.use`; một voucher / lượt thu | Should | [F-038](../chức-năng/FEATURE-038.md) |
| AF-STAFF-16 | Đổi thưởng điểm / lượt món miễn phí khi thu tiền | `PointTransactions`, `StampCards`, `RewardRedemptions` | `pos.use`; một thưởng / lượt thu; cần hội viên | Should | [F-039](../chức-năng/FEATURE-039.md) |
| AF-STAFF-17 | Giảm giá tay trên bill kèm lý do | `Payments.ManualDiscount`, `ManualReason`, `ApprovedBy` | Tự duyệt ≤ 10 % và ≤ 20.000đ; vượt → người cao hơn nhập tài khoản | Should | [F-022](../chức-năng/FEATURE-022.md) |
| AF-STAFF-18 | Mở / đóng ca, đếm tiền, in phiếu chốt ca | `Shifts` | `shift.manage` (STAFF vẫn được — lệch D-24, Q-022) | Should | [F-018](../chức-năng/FEATURE-018.md) |
| AF-STAFF-19 | Hoàn tiền lượt thu khi có người duyệt | `Refunds`, `Orders` (`VOIDED`) | Luôn cần trưởng ca / quản lý nhập tài khoản; trong ngày thu | Should | [F-019](../chức-năng/FEATURE-019.md) |
| AF-STAFF-20 | Bật / tắt nhận đơn QR | `Settings.store.accepting_orders` | `pos.use` (`PUT /api/store`) | Should | [F-020](../chức-năng/FEATURE-020.md) |
| AF-STAFF-21 | Xử lý yêu cầu "Gọi nhân viên" | `StaffCalls.HandledAt/HandledBy` | `pos.use`; một người thắng | Should | [F-021](../chức-năng/FEATURE-021.md) |
| AF-STAFF-22 | Mở bàn, gọi món giúp khách tại bàn, ghi chú bàn | `Sessions` (`OpenedBy`, `Note`), `Orders` (`CreatedBy`) | `pos.use`; đơn vào thẳng `PREPARING` (mặc định Q-021 — PROPOSED) | Should | [F-024](../chức-năng/FEATURE-024.md) |
| AF-STAFF-23 | Xem hàng chờ và thời gian khách mới phải chờ | Hàng chờ đơn | `pos.use` | Should | [F-025](../chức-năng/FEATURE-025.md) |
| AF-STAFF-24 | Chuyển dòng giữa các phần, thu từng phần, "Thu chung" | `SessionSplits`, `Payments.SplitId` | `pos.use`; chuyển được mọi dòng chưa thu | Should | [F-026](../chức-năng/FEATURE-026.md) |
| AF-STAFF-25 | Pha mẻ sơ chế bán thành phẩm | `PrepBatches`, `InventoryTransactions(PREP_OUT/PREP_IN)` | `prep.post` | Should | [F-027](../chức-năng/FEATURE-027.md) |
| AF-STAFF-26 | Xem lô sắp / đã hết hạn, hủy lô hết hạn | `IngredientLots`, `WasteLogs` | STAFF+ (`GET /api/lots/expiring`, `POST /api/lots/{id}/write-off`) | Should | [F-028](../chức-năng/FEATURE-028.md) |
| AF-STAFF-27 | Nhận hàng theo đơn đặt hàng (PO) | `PurchaseOrders`, `StockReceipts`, `IngredientLots` | `po.receive`; PO `SENT` / `PARTIAL` | Should | [F-030](../chức-năng/FEATURE-030.md) |
| AF-STAFF-28 | Ghi phiếu hủy hàng | `WasteLogs`, `InventoryTransactions(ADJUST "WASTE:…")` | `waste.create`; không hủy vào phần đang giữ | Should | [F-032](../chức-năng/FEATURE-032.md) |
| AF-STAFF-29 | Ghi thu / chi sổ quỹ, gắn ảnh hóa đơn | `CashTransactions`, `uploads/receipts/` | `cash.create`; chi > 500.000đ hoặc "Khác (chi)" chờ duyệt (Q-022) | Should | [F-033](../chức-năng/FEATURE-033.md) |
| AF-STAFF-30 | Bán món đang "Ngoài lịch" ở mang đi / gọi món tại bàn | `MenuSchedules` (quầy thấy đủ) | `pos.use` | Should | [F-040](../chức-năng/FEATURE-040.md) |
| AF-STAFF-31 | Gọi lại đơn lần trước cho hội viên ở Bán mang đi | Đơn đã thu của hội viên | `pos.use`; mọi hội viên | Should | [F-045](../chức-năng/FEATURE-045.md) |
| AF-STAFF-32 | Chuyển cả nhóm (phiên) sang bàn khác — bàn trống hoặc có nhóm khác, bill riêng | `Sessions`, `Orders.TableId`, `SessionTableMoves` | `pos.use` | Must | [F-049](../chức-năng/FEATURE-049.md) |
| AF-STAFF-33 | Nhận báo đánh giá thấp, bấm Đã xử lý | `Reviews.HandledBy / HandledAt` | `pos.use` | Must | [F-051](../chức-năng/FEATURE-051.md) |
| AF-STAFF-34 | Người mở ca: đếm tiền, đóng ca rồi mới đăng xuất (trưởng ca / quản lý mở ca cũng vậy) | `Shifts.OpenedBy`, `Shifts.ClosedAt` | đăng nhập | Must | [F-054](../chức-năng/FEATURE-054.md) |
| AF-STAFF-35 | Mở ca trước khi nhận / xử lý đơn (tiếp nhận, hoàn tất, hủy, gọi món tại bàn, sửa / xóa món, chuyển bàn, chia bill) | `Shifts`, `Orders` | `pos.use` + có ca mở | Must | [F-055](../chức-năng/FEATURE-055.md) |

### 2.4. ACT-LEAD — Trưởng ca (có mọi AF-STAFF)

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-LEAD-01 | Tự sửa / xóa món, xóa đơn đã tiếp nhận / đã pha; duyệt cho nhân viên; chọn Ghi hủy hàng / Hoàn kho | `OrderItemVoids.ApprovedBy`, `WasteLogs`, `InventoryTransactions(VOID_BACK)` | Mọi đơn tại bàn chưa thu; lý do bắt buộc | Must | [F-046](../chức-năng/FEATURE-046.md) |
| AF-LEAD-02 | Hủy bàn không cần người duyệt | `Sessions` (`CLOSED`, `CancelledBy`) | Phiên chưa có lượt thu | Must | [F-046](../chức-năng/FEATURE-046.md) |
| AF-LEAD-03 | Giảm giá tay đến 20 % / 50.000đ; duyệt giảm tay của nhân viên trong ngưỡng trưởng ca | `Payments.ApprovedBy` | Vượt ngưỡng trưởng ca → chỉ quản lý | Should | [F-036](../chức-năng/FEATURE-036.md), [F-022](../chức-năng/FEATURE-022.md) |
| AF-LEAD-04 | Tự hoàn / duyệt hoàn tiền lượt thu thuộc ca đang mở | `Refunds` | `manager.refund_same_shift_only` (bật mặc định) | Should | [F-036](../chức-năng/FEATURE-036.md), [F-019](../chức-năng/FEATURE-019.md) |
| AF-LEAD-05 | Duyệt / từ chối khoản chi sổ quỹ | `CashTransactions` (`APPROVED` / `REJECTED`) | `cash.approve` ≤ 2.000.000đ; không tự duyệt khoản của mình | Should | [F-033](../chức-năng/FEATURE-033.md) |
| AF-LEAD-06 | Sửa / thêm chấm công trong ngày hôm nay | `Attendance` (`EditedBy`, `EditReason`) | `attendance.edit` chỉ hôm nay (giờ VN); lý do bắt buộc | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-LEAD-07 | Điều chỉnh tồn kho tay ở quầy | `InventoryTransactions(ADJUST)` | `inventory.adjust` qua `/api/ops/*` | Should | [F-036](../chức-năng/FEATURE-036.md) |
| AF-LEAD-08 | Kiểm kê ở quầy (tạo phiếu, nhập số đếm, chốt) | `Stocktakes`, `StocktakeLines` | `stocktake.post` qua `/api/ops/*` | Should | [F-036](../chức-năng/FEATURE-036.md), [F-023](../chức-năng/FEATURE-023.md) |
| AF-LEAD-09 | Xem dashboard "Hôm nay" bản rút gọn | `DailySummaries` (không giá vốn / lãi) | `dashboard.view` (rút gọn ở server) | Should | [F-043](../chức-năng/FEATURE-043.md) |
| AF-LEAD-10 | Sửa phiếu kiểm kê nháp (ghi chú, thêm / bớt nguyên liệu), xóa nháp ngay trên danh sách | `Stocktakes`, `StocktakeLines` | `stocktake.post` | Must | [F-048](../chức-năng/FEATURE-048.md) |
| AF-LEAD-11 | Hủy / sửa khoản sổ quỹ đã duyệt của ca đang mở (≤ 2.000.000đ, không phải khoản mình ghi) | `CashTransactions` (`VOIDED`, khoản thay thế) | `cash.approve` + ngưỡng | Must | [F-050](../chức-năng/FEATURE-050.md) |

### 2.5. ACT-ADMIN — Quản lý / chủ quán (có mọi AF-STAFF, AF-LEAD, trừ tự chấm công)

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-ADMIN-01 | Tạo / sửa / khóa / đặt lại mật khẩu / xóa tài khoản nhân viên | `Users` (hash, `IsActive`, `DeletedAt`) | `admin.all`; không tự khóa / tự xóa; xóa mềm khi đã có lịch sử (ADR-004) | Must | [F-009](../chức-năng/FEATURE-009.md) |
| AF-ADMIN-02 | Quản lý món, danh mục, bật / tắt "còn bán" | `MenuItems`, `Categories` | `admin.all` | Must | [F-010](../chức-năng/FEATURE-010.md) |
| AF-ADMIN-03 | Quản lý bàn và mã QR (tạo, tạo lại, in QR) | `Tables.qrToken` | `admin.all`; bàn đang có khách không xóa được | Must | [F-010](../chức-năng/FEATURE-010.md) |
| AF-ADMIN-04 | Quản lý nguyên liệu, BOM, điều chỉnh kho tay | `Ingredients`, `BomItems`, `InventoryTransactions(ADJUST)` | `admin.all`; định lượng > 0 | Must | [F-011](../chức-năng/FEATURE-011.md) |
| AF-ADMIN-05 | Xem báo cáo doanh thu, lịch sử đơn, in lại bill | `Payments`, `Orders`, `Refunds` | `admin.all`; khoảng ngày hợp lệ (BR-005) | Must | [F-012](../chức-năng/FEATURE-012.md) |
| AF-ADMIN-06 | Gán vai Trưởng ca; chỉnh ngưỡng trưởng ca & sổ quỹ | `Users.Role`, `Settings.manager.*`, `cash.approve_threshold` | `admin.all`; luôn còn ≥ 1 ADMIN (BR-047) | Should | [F-036](../chức-năng/FEATURE-036.md) |
| AF-ADMIN-07 | Cấu hình nhóm tùy chọn món | `ModifierGroups`, `ModifierOptions`, `ModifierOptionBom` | `admin.all` | Should | [F-013](../chức-năng/FEATURE-013.md) |
| AF-ADMIN-08 | Quản lý hội viên, hạng, ẩn danh theo yêu cầu | `Members`, `MemberTiers` | `admin.all`; danh sách che số | Should | [F-014](../chức-năng/FEATURE-014.md) |
| AF-ADMIN-09 | Tạo / sửa combo | `MenuItems (COMBO)`, `ComboComponents` | `admin.all`; không combo lồng combo | Should | [F-015](../chức-năng/FEATURE-015.md) |
| AF-ADMIN-10 | Tạo khuyến mãi theo lịch, bật / tắt, xem thống kê | `Promotions`, `PromotionTargets`, `PromotionUsages` | `admin.all` | Should | [F-016](../chức-năng/FEATURE-016.md) |
| AF-ADMIN-11 | Cấu hình gợi ý & ghim món | `MenuItems.IsPinned`, `Settings.suggestion.*` | `admin.all` | Should | [F-017](../chức-năng/FEATURE-017.md) |
| AF-ADMIN-12 | Hoàn tiền mọi lượt thu trong ngày; xem lịch sử ca, danh sách hoàn tiền | `Shifts`, `Refunds` | `admin.all` | Should | [F-018](../chức-năng/FEATURE-018.md), [F-019](../chức-năng/FEATURE-019.md) |
| AF-ADMIN-13 | Đặt giờ bán danh mục, cài đặt nhận đơn QR | `Categories.SellFrom/SellTo`, `Settings.store.*` | `admin.all` | Should | [F-020](../chức-năng/FEATURE-020.md) |
| AF-ADMIN-14 | Lập phiếu nhập kho, kiểm kê, xem giá vốn & hao hụt | `StockReceipts`, `Stocktakes`, `Ingredients.LastUnitCost` | `admin.all` | Should | [F-023](../chức-năng/FEATURE-023.md) |
| AF-ADMIN-15 | Chỉnh thời gian pha chuẩn, cài đặt bếp; xem / chạy lại job nền | `MenuItems.PrepSeconds`, `ItemPrepStats`, `JobRuns` | `admin.all` (`POST /api/admin/jobs/{name}/run`) | Should | [F-025](../chức-năng/FEATURE-025.md) |
| AF-ADMIN-16 | Khai báo bán thành phẩm và công thức | `Ingredients.Kind`, `SemiRecipes`, `SemiRecipeLines` | `admin.all`; lồng ≤ 3 cấp, cấm vòng | Should | [F-027](../chức-năng/FEATURE-027.md) |
| AF-ADMIN-17 | Bật theo dõi lô, xem / hủy lô | `Ingredients.TrackLots`, `IngredientLots` | `admin.all` | Should | [F-028](../chức-năng/FEATURE-028.md) |
| AF-ADMIN-18 | Xem đề xuất nhập hàng, tạo PO từ đề xuất | `DemandForecasts`, `PurchaseOrders` | `admin.all` | Should | [F-029](../chức-năng/FEATURE-029.md) |
| AF-ADMIN-19 | Quản lý nhà cung cấp và PO (tạo, gửi & in, nhận, hủy) | `Suppliers`, `SupplierIngredients`, `PurchaseOrders`, `SupplierPriceHistory` | `admin.all`; chỉ sửa PO nháp | Should | [F-030](../chức-năng/FEATURE-030.md) |
| AF-ADMIN-20 | Quản lý đơn vị quy đổi, chọn AVG / FIFO, xem giá vốn thực tế | `Units`, `Ingredients.AvgCost`, `OrderItems.CogsAmount` | `admin.all` | Should | [F-031](../chức-năng/FEATURE-031.md) |
| AF-ADMIN-21 | Đặt hao hụt định mức, xem báo cáo thất thoát | `Ingredients.WastePercent`, `WasteLogs` | `admin.all` | Should | [F-032](../chức-năng/FEATURE-032.md) |
| AF-ADMIN-22 | Xem / lọc / xuất CSV sổ quỹ, quản lý danh mục thu chi, duyệt mọi khoản | `CashTransactions`, `CashCategories` | `admin.all`; tự duyệt được khoản của mình | Should | [F-033](../chức-năng/FEATURE-033.md) |
| AF-ADMIN-23 | Xem lãi / lỗ ước tính, quản lý chi phí cố định | `Payments`, `Refunds`, `OrderItems.CogsAmount`, `FixedCosts` | `admin.all` | Should | [F-034](../chức-năng/FEATURE-034.md) |
| AF-ADMIN-24 | Xem / sửa chấm công mọi ngày, lập lịch làm tuần, xem năng suất | `Attendance`, `Rosters` | `admin.all` | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-ADMIN-25 | Xem nhật ký thao tác (chỉ đọc) | `AuditLogs` | `admin.all`; không sửa / xóa qua ứng dụng | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-ADMIN-26 | Tạo phân khúc, chiến dịch; chạy / hẹn giờ; tải CSV; đặt opt-out | `Segments`, `Campaigns`, `CampaignDeliveries`, `Members.OptOut` | `admin.all`; mỗi lần tải CSV ghi nhật ký | Should | [F-037](../chức-năng/FEATURE-037.md) |
| AF-ADMIN-27 | Tạo voucher tay, xem danh sách voucher | `Vouchers` (`MANUAL`, mã `QL…`) | `admin.all` | Should | [F-038](../chức-năng/FEATURE-038.md) |
| AF-ADMIN-28 | Cấu hình quà đổi điểm, chương trình tem; điều chỉnh điểm có lý do | `RewardCatalog`, `StampPrograms`, `PointTransactions(ADJUST)` | `admin.all`; không để điểm âm | Should | [F-039](../chức-năng/FEATURE-039.md) |
| AF-ADMIN-29 | Cài lịch thực đơn, xem trước menu theo thời điểm | `MenuSchedules`, `MenuScheduleItems` | `admin.all` | Should | [F-040](../chức-năng/FEATURE-040.md) |
| AF-ADMIN-30 | Xem menu engineering; ghim món / tạo khuyến mãi từ kết quả | `OrderItems`, `MenuItems.IsPinned` | `admin.all` | Should | [F-041](../chức-năng/FEATURE-041.md) |
| AF-ADMIN-31 | Xem giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn | `Orders`, `Payments`, `Sessions` | `admin.all` | Should | [F-042](../chức-năng/FEATURE-042.md) |
| AF-ADMIN-32 | Xem dashboard "Hôm nay" đầy đủ, tính lại hôm nay | `DailySummaries` | `dashboard.view` | Should | [F-043](../chức-năng/FEATURE-043.md) |
| AF-ADMIN-33 | Sửa / hủy phiếu nhập kho (bắt buộc lý do, giữ lịch sử) | `StockReceipts`, `StockReceiptLines`, `InventoryTransactions`, `IngredientLots`, `PurchaseOrderLines`, `SupplierPriceHistory` | `admin.all` | Must | [F-048](../chức-năng/FEATURE-048.md) |
| AF-ADMIN-34 | Hủy phiếu kiểm kê đã chốt (hoàn lại chênh lệch) | `Stocktakes`, `InventoryTransactions`, `IngredientLots` | `admin.all` | Must | [F-048](../chức-năng/FEATURE-048.md) |
| AF-ADMIN-35 | Hủy / sửa mọi khoản sổ quỹ đã duyệt của ca đang mở | `CashTransactions` | `admin.all` | Must | [F-050](../chức-năng/FEATURE-050.md) |
| AF-ADMIN-36 | Xem trang Đánh giá món (trung bình, phân bố, góp ý); chỉnh ngưỡng hiện sao trên menu | `Reviews`, `ReviewItems`, `Settings` | `admin.all` | Must | [F-051](../chức-năng/FEATURE-051.md) |
| AF-ADMIN-37 | Tra cứu mọi API đang chạy (method, đường dẫn, quyền, request / response) | Router lúc chạy, `api-contract.md` (không có bảng dữ liệu) | `admin.all` | Must | [F-052](../chức-năng/FEATURE-052.md) |
| AF-ADMIN-38 | Đổi tên quán và địa chỉ in trên hóa đơn | `Settings` (`shop.name`, `shop.address`) | `admin.all` | Must | [F-053](../chức-năng/FEATURE-053.md) |

### 2.6. EXT-ZALO — Zalo OA

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-ZALO-01 | Nhận tin chiến dịch gửi tới SĐT hội viên, trả kết quả gửi được / lỗi | `send({ phone, text }) → { ok, error }`; `CampaignDeliveries` (`SENT` / `FAILED`) | Chỉ khi có `ZALO_OA_TOKEN`; gửi lỗi → `FAILED`, không tạo voucher | Should | [F-037](../chức-năng/FEATURE-037.md) |

### 2.7. EXT-PRINTER — Máy in bill

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-PRINTER-01 | In bill thanh toán (phiên, mang đi) và phiếu tạm tính khổ 58 / 80 mm | Dữ liệu hóa đơn (`mode=final` / `provisional`) | Lệnh in từ trình duyệt máy quầy | Must | [F-006](../chức-năng/FEATURE-006.md), [F-008](../chức-năng/FEATURE-008.md) |
| AF-PRINTER-02 | In khối "THẺ THÀNH VIÊN (lúc in)" trên bill có hội viên | `memberCard` (điểm, tem, voucher còn hạn — không mã) | Không in ở phiếu tạm tính / bill không hội viên | Must | [F-047](../chức-năng/FEATURE-047.md) |
| AF-PRINTER-03 | In phiếu chốt ca kèm bảng thu chi sổ quỹ | Báo cáo ca | Lệnh in từ trình duyệt | Should | [F-018](../chức-năng/FEATURE-018.md), [F-033](../chức-năng/FEATURE-033.md) |
| AF-PRINTER-04 | In bill riêng từng phần chia bill | Lượt thu của một phần ("Phần: <tên>") | Lệnh in từ trình duyệt | Should | [F-026](../chức-năng/FEATURE-026.md) |
| AF-PRINTER-05 | In / lưu PDF phiếu đặt hàng (PO) | Trang in `/admin/purchase-orders/{id}/print` | Lệnh in từ trình duyệt | Should | [F-030](../chức-năng/FEATURE-030.md) |

### 2.8. EXT-SCHEDULER — Bộ lập lịch job nền

Lịch theo giờ quán UTC+7 ([local-development.md](../vận-hành/local-development.md) mục "Job nền"). Job idempotent: chạy lại không nhân đôi; hai tiến trình chạy trùng → một lần `SKIPPED`.

| AF-ID | Hành động (động từ + đối tượng) | Dữ liệu | Quyền / phạm vi | Ưu tiên | FEATURE |
| --- | --- | --- | --- | --- | --- |
| AF-SCHEDULER-01 | Làm mới thống kê gợi ý và bảng thời gian pha chuẩn (`refresh-caches`, mỗi 15 phút) | Cache bán chạy, `ItemPrepStats` | Hệ thống | Should | [F-017](../chức-năng/FEATURE-017.md), [F-025](../chức-năng/FEATURE-025.md) |
| AF-SCHEDULER-02 | Tính trung vị thời gian pha 30 ngày (`prep-stats`, 02:00) | `ItemPrepStats` | Hệ thống | Should | [F-025](../chức-năng/FEATURE-025.md) |
| AF-SCHEDULER-03 | Dự báo tiêu thụ 14 ngày (`demand-forecast`, 02:00) và cảnh báo sẽ hết trước ngày giao (`runout-alert`, 06:05) | `DemandForecasts`; sự kiện `inventory.runout` | Hệ thống | Should | [F-029](../chức-năng/FEATURE-029.md) |
| AF-SCHEDULER-04 | Cảnh báo lô sắp / đã hết hạn (`lot-expiry`, 06:00) | `IngredientLots`; sự kiện `inventory.expiring` / `inventory.expired` | Hệ thống | Should | [F-028](../chức-năng/FEATURE-028.md) |
| AF-SCHEDULER-05 | Đóng chấm công quá thời hạn token (`attendance-autoclose`, mỗi 15 phút) | `Attendance.ClockOut` | Hệ thống | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-SCHEDULER-06 | Xóa nhật ký thao tác quá 12 tháng (`audit-retention`, 03:00) | `AuditLogs` (lô 5.000 dòng) | Hệ thống | Should | [F-035](../chức-năng/FEATURE-035.md) |
| AF-SCHEDULER-07 | Chạy chiến dịch hẹn giờ đã đến hạn (`campaigns-due`, mỗi 5 phút) | `Campaigns`, `CampaignDeliveries`, `Vouchers` | Hệ thống | Should | [F-037](../chức-năng/FEATURE-037.md) |
| AF-SCHEDULER-08 | Tổng hợp số liệu hôm qua cho dashboard (`daily-summary`, 00:30) | `DailySummaries` (`MERGE` theo ngày) | Hệ thống | Should | [F-043](../chức-năng/FEATURE-043.md) |

## 3. Độ phủ FEATURE

Mỗi FEATURE trong [chức-năng/README.md](../chức-năng/README.md) (46 FEATURE: F-001…F-043, F-045…F-047; **không có F-044**) xuất hiện ở ít nhất một dòng AF:

| FEATURE | AF (dòng chính) | FEATURE | AF (dòng chính) |
| --- | --- | --- | --- |
| F-001 | AF-GUEST-01 | F-024 | AF-STAFF-22 |
| F-002 | AF-GUEST-02 | F-025 | AF-GUEST-14, AF-STAFF-23, AF-ADMIN-15 |
| F-003 | AF-GUEST-03 | F-026 | AF-GUEST-15, AF-STAFF-24 |
| F-004 | AF-GUEST-04 | F-027 | AF-STAFF-25, AF-ADMIN-16 |
| F-005 | AF-GUEST-05 | F-028 | AF-STAFF-26, AF-ADMIN-17 |
| F-006 | AF-STAFF-05…07 | F-029 | AF-ADMIN-18, AF-SCHEDULER-03 |
| F-007 | AF-STAFF-02…04 | F-030 | AF-STAFF-27, AF-ADMIN-19 |
| F-008 | AF-STAFF-08 | F-031 | AF-ADMIN-20 |
| F-009 | AF-STAFF-01, AF-ADMIN-01 | F-032 | AF-STAFF-28, AF-ADMIN-21 |
| F-010 | AF-ADMIN-02, AF-ADMIN-03 | F-033 | AF-STAFF-29, AF-LEAD-05, AF-ADMIN-22 |
| F-011 | AF-ADMIN-04 | F-034 | AF-ADMIN-23 |
| F-012 | AF-ADMIN-05 | F-035 | AF-STAFF-12, AF-LEAD-06, AF-ADMIN-24, AF-ADMIN-25 |
| F-013 | AF-GUEST-07, AF-ADMIN-07 | F-036 | AF-LEAD-03, AF-LEAD-07, AF-ADMIN-06 |
| F-014 | AF-GUEST-11, AF-STAFF-14, AF-ADMIN-08 | F-037 | AF-ADMIN-26, AF-ZALO-01 |
| F-015 | AF-GUEST-08, AF-ADMIN-09 | F-038 | AF-GUEST-12, AF-STAFF-15, AF-ADMIN-27 |
| F-016 | AF-GUEST-09, AF-ADMIN-10 | F-039 | AF-MEMBER-05, AF-STAFF-16, AF-ADMIN-28 |
| F-017 | AF-GUEST-10, AF-ADMIN-11 | F-040 | AF-GUEST-17, AF-STAFF-30, AF-ADMIN-29 |
| F-018 | AF-STAFF-18 | F-041 | AF-ADMIN-30 |
| F-019 | AF-STAFF-19, AF-LEAD-04 | F-042 | AF-ADMIN-31 |
| F-020 | AF-GUEST-16, AF-STAFF-20, AF-ADMIN-13 | F-043 | AF-LEAD-09, AF-ADMIN-32 |
| F-021 | AF-GUEST-13, AF-STAFF-21 | F-045 | AF-MEMBER-07, AF-MEMBER-08, AF-STAFF-31 |
| F-022 | AF-STAFF-17 | F-046 | AF-STAFF-09, AF-STAFF-10, AF-LEAD-01, AF-LEAD-02 |
| F-023 | AF-ADMIN-14 | F-047 | AF-MEMBER-01, AF-MEMBER-02, AF-STAFF-11 |
|  |  | F-048 | AF-LEAD-10, AF-ADMIN-33, AF-ADMIN-34 |
|  |  | F-049 | AF-GUEST-18, AF-STAFF-32 |
|  |  | F-050 | AF-LEAD-11, AF-ADMIN-35 |
|  |  | F-051 | AF-GUEST-19, AF-STAFF-33, AF-ADMIN-36 |
|  |  | F-052 | AF-ADMIN-37 |
|  |  | F-053 | AF-ADMIN-38 |
|  |  | F-054 | AF-STAFF-34 |
|  |  | F-055 | AF-GUEST-20, AF-STAFF-35 |

**Tổng:** 8 Actor (5 người dùng + 3 hệ thống ngoài), 127 dòng AF (GUEST 20 · MEMBER 9 · STAFF 35 · LEAD 11 · ADMIN 38 · ZALO 1 · PRINTER 5 · SCHEDULER 8). Use Case dùng các Actor này: [use-cases.md](use-cases.md).
