# Người dùng và quyền

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §4 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

## 4.1. Tác nhân chính

| Actor | Định danh | Hành động được phép | Phạm vi dữ liệu | Điều kiện | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| **Khách (CUSTOMER)** | Không đăng nhập; nhận **session token** (cookie/localStorage) khi quét QR | Quét QR, chọn gộp/tách phiên, xem menu, gửi đơn (nhiều lần), theo dõi đơn, **bấm Gọi thanh toán** (D-2) | Chỉ phiên mình đang tham gia và các đơn trong phiên đó | Token hợp lệ, phiên còn mở | CONFIRMED |
| **Nhân viên quầy (STAFF)** | Đăng nhập username/password | Xem **tất cả** đơn/phiên đang xử lý; tiếp nhận đơn (Q-004b); hoàn tất đơn; nhận yêu cầu thanh toán; **thu tiền mặt tại bàn & đóng phiên**; in bill; **bán mang đi** (D-3); hủy đơn PENDING (Q-010); sửa / xóa món chưa thu, xóa đơn, hủy bàn (F-046 — đơn đã tiếp nhận / đã pha cần trưởng ca / quản lý nhập tài khoản, ADR-007 D-33) | Toàn bộ đơn/phiên của quán | Tài khoản `IsActive = true` | CONFIRMED (hủy: PROPOSED) |
| **Trưởng ca (MANAGER)** — thêm ở ADR-006 (D-24) | Đăng nhập | Mọi quyền của STAFF **+** giảm tay đến 20 %/50.000đ, hoàn tiền lượt thu trong ca đang mở, duyệt chi quỹ ≤ 2.000.000đ, sửa chấm công trong ngày, điều chỉnh kho tay, kiểm kê, xem dashboard "Hôm nay" bản rút gọn, tự sửa / xóa món đã tiếp nhận / đã pha và hủy bàn (ADR-007). **Không** vào `/api/admin/*` và trang `/admin/*` (trừ `/admin/today`) | Toàn bộ đơn/phiên; kho qua `/api/ops/*`; không xem giá vốn, lãi/lỗ, báo cáo tài chính, tài khoản | Tài khoản `IsActive = true`, role MANAGER | CONFIRMED (D-24) — chi tiết ở 4.5 |
| **Quản lý (ADMIN)** | Đăng nhập | Mọi quyền của STAFF (và MANAGER) **+** CRUD menu/danh mục, bàn + QR, nguyên liệu, BOM, điều chỉnh kho, tài khoản nhân viên, báo cáo | Toàn bộ | Tài khoản `IsActive = true`, role ADMIN | CONFIRMED (ADMIN kế thừa STAFF: PROPOSED — Word không nói rõ, nhưng hợp lý cho quán nhỏ) |

## 4.2. Tác nhân hệ thống (secondary)

| Actor | Vai trò | Ghi chú |
| --- | --- | --- |
| ~~Cổng thanh toán VietQR~~ | — | Bỏ theo D-1; làm sau |
| SQL Server | Thực thi SP trừ kho trong transaction; rollback khi thiếu | Nơi giữ invariant BR-001/BR-002 |
| Realtime hub (Socket.io) | Phát sự kiện đến đúng nhóm client (quầy / phiên khách) | Không phải nguồn sự thật; client phải fetch lại khi reconnect |
| Máy in nhiệt | Nhận lệnh in từ trình duyệt máy POS | Khổ 58/80 mm |
| Cron job | Chốt ca, tổng hợp ngày, dọn giỏ rác | Từ ADR-006 có **bộ lập lịch job nền** (`src/jobs/scheduler.js`): thống kê thời gian pha, dự báo nhập hàng, cảnh báo lô, đóng chấm công quên đăng xuất, dọn nhật ký, chạy chiến dịch hẹn giờ, tổng hợp ngày — danh sách ở `vận-hành/local-development.md`. Chốt ca vẫn thủ công; dọn giỏ rác vẫn làm sau (REQ-020) |
| Storage ảnh | Lưu/nén ảnh món | Ảnh món: làm sau (REQ-021). Ảnh hóa đơn sổ quỹ (F-033) lưu đĩa trong `uploads/receipts/` (`UPLOADS_DIR`), xem cần đăng nhập |
| Kênh Zalo OA | Gửi tin chiến dịch (F-037) | Chỉ bật khi có `ZALO_OA_TOKEN`; mặc định chiến dịch dùng Xuất danh sách (CSV) |

## 4.3. Câu hỏi quyền đã trả lời / chưa trả lời

| Câu hỏi | Trả lời | Trạng thái |
| --- | --- | --- |
| Khách có tự đăng ký tài khoản không? | Không. Khách không có tài khoản | CONFIRMED |
| Ai cấp tài khoản STAFF? | ADMIN | CONFIRMED |
| Tài khoản ADMIN đầu tiên tạo thế nào? | Seed khi khởi tạo DB (username/password đặt qua biến môi trường) | PROPOSED |
| Một người có nhiều vai trò không? | Không; mỗi tài khoản một role (STAFF / MANAGER / ADMIN — MANAGER thêm ở ADR-006) | PROPOSED |
| Ai cấp tài khoản Trưởng ca? | ADMIN (Quản lý → Tài khoản → vai trò "Trưởng ca") | CONFIRMED (D-24) |
| Khách A có xem được đơn của khách B không? | Chỉ khi cùng phiên (đã chọn "Gộp chung"). Phiên cá nhân trên cùng bàn **không** thấy nhau | CONFIRMED (suy trực tiếp từ US1) |
| Nhiều nhân viên dùng chung một tài khoản trên nhiều máy? | Word giả định có thể xảy ra (US5 AC2 bản 2) → hệ thống phải an toàn trong trường hợp đó, nhưng không khuyến khích | CONFIRMED |
| STAFF có sửa menu/kho không? | Không sửa menu/giá/BOM. Từ ADR-006, STAFF được sơ chế, hủy hàng, hủy lô hết hạn, nhận hàng theo PO ở quầy; điều chỉnh kho tay và kiểm kê cần MANAGER/ADMIN | CONFIRMED (D-24) |

> **Nguyên tắc bắt buộc:** Quyền được kiểm ở **server** cho mọi endpoint; ẩn/disable nút trên UI chỉ là trải nghiệm. Khách gọi thẳng API hoàn tất đơn phải bị từ chối 401/403.

## 4.4. Bổ sung giai đoạn 2 (ADR-005, 16/10/2026)

| Hành động | Khách | STAFF | ADMIN |
| --- | --- | --- | --- |
| Tra cứu / đăng ký hội viên | Có (tên che, bị giới hạn tần suất) | Có (tên đầy đủ) | Có |
| Gắn / gỡ hội viên vào phiên | Phiên của mình, bằng SĐT | Mọi phiên chưa thu (từ F-047 làm được cả ở Gọi món tại bàn) | Có |
| Gọi nhân viên | Phiên của mình, 60 giây/lần | Xử lý ("Đã xử lý") | Có |
| Mở / đóng ca, xem phiếu chốt ca | — | Có | Có + lịch sử ca |
| Bật/tắt nhận đơn QR | — | Có | Có (+ Cài đặt) |
| Giảm giá tay | — | Trong ngưỡng; vượt cần quản lý nhập tài khoản | Có (tự duyệt) |
| Hoàn tiền sau thu | — | Khi quản lý nhập tài khoản | Có |
| Hội viên/hạng, combo, khuyến mãi, gợi ý, tùy chọn món, nhập kho, kiểm kê, cài đặt, báo cáo marketing/giá vốn | — | — | Có |
| Mở bàn, gọi món giúp khách tại bàn (F-024) | — (chỉ gọi qua QR phiên của mình) | Có | Có |
| Xem / sửa ghi chú bàn (F-024) | **Không thấy** | Có | Có |

Kiểm ở server cho mọi endpoint (`/api/admin/*` → `requireAdmin`; quầy → `requireStaff`; xác thực lại quản lý → `userService.resolveApproval`). Test: ma trận quyền trong `members.test.js`, `operations.test.js`, `sales.test.js`.

> Từ ADR-006, cột STAFF ở bảng trên áp cho cả MANAGER; "quản lý nhập tài khoản" ở giảm giá tay và hoàn tiền gồm cả Trưởng ca trong ngưỡng của mình — xem 4.5.

## 4.5. Bổ sung giai đoạn 4–8 — Trưởng ca (MANAGER) và ma trận quyền (ADR-006, 18/10/2026)

**Nguồn:** [FEATURE-036](../chức-năng/FEATURE-036.md), `ứng-dụng/máy-chủ/src/auth/permissions.js` (bảng `PERMISSIONS`, `can`, middleware `requirePermission`, `discountLimits`). Thứ bậc STAFF < MANAGER < ADMIN. Server kiểm mọi endpoint: chưa đăng nhập → 401, không đủ quyền → 403; giao diện chỉ ẩn/hiện. Rule chi tiết: BR-044…BR-047, BR-049, BR-053, BR-065; sửa / xóa món, hủy bàn (ADR-007): BR-067, BR-070; hội viên tại bàn, Thẻ thành viên (ADR-008): BR-071, BR-072.

### Ma trận quyền

| Quyền (`PERMISSIONS`) | Phạm vi | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- | --- |
| `pos.use` | Bán, tiếp nhận, hoàn tất, thu tiền (bàn, từng phần chia bill, mang đi), in; hội viên, voucher, đổi thưởng ở quầy; sửa / xóa món, xóa đơn, hủy bàn (F-046 — STAFF cần người duyệt khi đơn đã tiếp nhận, xem bảng dưới); tra cứu / đăng ký nhanh / gắn / gỡ hội viên ở Gọi món tại bàn (F-047) | ✔ | ✔ | ✔ |
| `shift.manage` | Mở / đóng ca | ✔ (lệch D-24 — Q-022) | ✔ | ✔ |
| `cash.create` | Ghi thu / chi quỹ, gắn ảnh hóa đơn | ✔ (khoản lớn / "Khác" chờ duyệt — Q-022) | ✔ | ✔ |
| `cash.approve` | Duyệt / từ chối chi quỹ | ✘ | ≤ 2.000.000đ | ✔ |
| `attendance.edit` | Xem / sửa / thêm chấm công | ✘ | Chỉ ngày hôm nay | ✔ mọi ngày |
| `prep.post`, `waste.create`, `po.receive` | Sơ chế, hủy hàng, hủy lô hết hạn, nhận hàng theo PO | ✔ | ✔ | ✔ |
| `inventory.adjust`, `stocktake.post` | Điều chỉnh kho tay, kiểm kê (tạo, nhập số, chốt) qua `/api/ops/*` | ✘ | ✔ | ✔ |
| `dashboard.view` | `/admin/today` | ✘ | Bản rút gọn (F-043) | ✔ |
| `admin.all` | `/api/admin/*`: menu, giá, BOM, lịch thực đơn, khuyến mãi, hội viên/điểm/voucher/chiến dịch, tài khoản, nhà cung cấp & PO, báo cáo tài chính, lãi/lỗ, phân tích, sổ quỹ tổng, nhân sự, nhật ký thao tác, cài đặt, chạy job | ✘ | ✘ | ✔ |

### Ngưỡng và quy tắc theo vai

| Hành động | STAFF | MANAGER | ADMIN | Ghi chú |
| --- | --- | --- | --- | --- |
| Giảm giá tay tự duyệt | ≤ 10 % **và** ≤ 20.000đ | ≤ 20 % **và** ≤ 50.000đ | Không giới hạn | Vượt ngưỡng → người cao hơn nhập tài khoản; MANAGER duyệt được khi mức giảm trong ngưỡng trưởng ca; `Payments.ApprovedBy` = người duyệt |
| Hoàn tiền | Luôn cần người duyệt nhập tài khoản | Tự hoàn / duyệt lượt thu thuộc **ca đang mở** | ✔ | Lượt thu ca khác → chỉ ADMIN; tắt `manager.refund_same_shift_only` → MANAGER hoàn mọi lượt thu trong ngày |
| Chi quỹ | Ghi; > 500.000đ hoặc danh mục cần duyệt → chờ duyệt | Duyệt ≤ 2.000.000đ | Duyệt mọi khoản | Không tự duyệt khoản do mình tạo (`403 SELF_APPROVAL`), trừ ADMIN; nhân viên đứng quầy duyệt bằng cách cho trưởng ca / quản lý nhập tài khoản |
| Chấm công tự động khi đăng nhập | Có | Có | Không (thêm tay) | Đăng xuất / đóng ca → chấm công ra |
| Sửa chấm công | ✘ | Trong ngày hôm nay (giờ VN) | Mọi ngày | Bắt buộc lý do; MANAGER sửa ngày khác → `403 ATTENDANCE_NOT_TODAY` |
| Dashboard `/admin/today` | 403 / chuyển về quầy | Bản rút gọn: **server** bỏ giá vốn, lãi gộp, tổng tiền chi chờ duyệt | Đủ | Trưởng ca có nút "Hôm nay" trên thanh quầy |
| Các trang `/admin/*` khác | Chuyển về `/pos?denied=admin` | Chuyển về `/pos?denied=admin` | ✔ | API `/api/admin/*` → 403 |
| Hạ vai trò / khóa / xóa ADMIN cuối cùng | — | — | `409 LAST_ADMIN` | Tự đổi vai trò / tự khóa chính mình → 400 như FEATURE-009 (Q-022) |
| Sửa / xóa món, xóa đơn, hủy bàn (F-046, ADR-007 D-33) | Đơn chờ tiếp nhận (`PENDING`): tự làm. Đơn đã tiếp nhận / đã pha (`PREPARING` / `COMPLETED`): cần trưởng ca / quản lý nhập tài khoản | Tự làm mọi đơn chưa thu | Tự làm | Luôn bắt buộc lý do. Thiếu người duyệt → `403 ADMIN_APPROVAL_REQUIRED`; sai mật khẩu hoặc tài khoản nhân viên khác → `403 ADMIN_APPROVAL_INVALID`. SP kiểm lại trạng thái lúc ghi. `OrderItemVoids.ApprovedBy` = người duyệt; nhật ký không lưu mật khẩu. BR-066…BR-070 |
| Sửa / hủy phiếu nhập kho, hủy phiếu kiểm kê đã chốt (F-048, ADR-009 D-42) | ✘ | ✘ (`/api/admin/*` → 403) | ✔ | Bắt buộc lý do; chỉ khi chưa kiểm kê sau lúc nhập và còn đủ hàng (BR-075); hủy kiểm kê chỉ phiếu chốt gần nhất (BR-077) |
| Hủy / sửa khoản sổ quỹ đã duyệt (F-050, ADR-010 D-45) | Cần trưởng ca / quản lý nhập tài khoản | Khoản ≤ 2.000.000đ, không phải khoản mình ghi, ca còn mở | Mọi khoản (kể cả khoản mình ghi), ca còn mở | Bắt buộc lý do; ca đã đóng → `409 SHIFT_CLOSED` |
| Sửa / xóa phiếu kiểm kê nháp (F-048) | ✘ | ✔ (quầy — `stocktake.post`, `PUT /api/ops/stocktakes/{id}`) | ✔ | Như tạo / chốt kiểm kê (F-036) |

Ngưỡng chỉnh ở Quản lý → Cài đặt → thẻ **"Trưởng ca & sổ quỹ"**: `manager.discount_max_percent` = 20, `manager.discount_max_amount` = 50.000, `manager.refund_same_shift_only` = bật, `manager.cash_out_approve_max` = 2.000.000, `cash.approve_threshold` = 500.000. Ngưỡng STAFF ở thẻ "Giảm giá tay của nhân viên".

### Hành động mới theo tác nhân

| Hành động | Khách | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- | --- |
| Xem thời gian chờ ước tính (F-025) | Giỏ, theo dõi đơn | Hàng chờ ở cột Mới | Như STAFF | Như STAFF + chỉnh thời gian pha, cài đặt bếp |
| Chia bill (F-026) | Phần của điện thoại mình; nhận/bỏ dòng Chung hoặc dòng của phần mình | Chuyển mọi dòng chưa thu, thêm phần, thu từng phần, "Thu chung" | Như STAFF | Như STAFF |
| Gọi lại đơn, ♥ món yêu thích (F-045) | Chỉ hội viên gắn vào phiên chưa đóng của chính điện thoại | Mọi hội viên (Bán mang đi) | Như STAFF | Như STAFF |
| Xem điểm / tem / voucher (F-039, F-038) | Điểm, thẻ tem, số voucher — **không thấy mã** | Đủ, kèm mã voucher | Như STAFF | Như STAFF + sổ điểm |
| Xem **Thẻ thành viên** (F-047) — điểm, 10 giao dịch điểm gần nhất, tem, quà, voucher còn dùng + nguồn | Thiết bị thuộc phiên **còn mở** đang gắn hội viên (khác → 403); tên / SĐT che, **không** có mã voucher, không có tên nhân viên | Có (Bearer, cùng nội dung) | Như STAFF | Như STAFF |
| Tra cứu / đăng ký nhanh / gắn / gỡ hội viên ở **Gọi món tại bàn** (F-047, S-16) | — (khách tự nhập SĐT ở giỏ / theo dõi đơn như F-014) | Có — đăng ký phải tick khách đồng ý (`400 CONSENT_REQUIRED`) | Như STAFF | Như STAFF |
| Đăng ký hội viên có SĐT người giới thiệu (F-038) | Có | Có | Có | Có |
| Dùng voucher, đổi thưởng khi thu tiền | — | Có | Có | Có |
| Sơ chế, hủy hàng, hủy lô, nhận hàng theo PO (S-17) | — | Có | Có | Có |
| Sửa / xóa món chưa thu, xóa đơn, hủy bàn (F-046, S-14) | — (chỉ thấy đơn / tổng cập nhật) | Đơn chờ tiếp nhận; đơn đã tiếp nhận / đã pha khi trưởng ca / quản lý nhập tài khoản | Có | Có |
| Xem lịch sử "Đã sửa / xóa món" của bàn (F-046) | — | Có | Có | Có |
| Chuyển bàn — cả nhóm sang bàn khác, bill riêng (F-049, S-10) | — (điện thoại tự theo) | Có | Có | Có |
| Hủy / sửa khoản sổ quỹ đã duyệt (F-050, S-15 / S-36) | — | Khi trưởng ca / quản lý nhập tài khoản | Có (≤ 2.000.000đ, không phải khoản mình ghi) | Có |
| Đánh giá món sau khi thanh toán (F-051, SCR-05) | Có (điện thoại trong nhóm, 1 lần / lượt, 24 giờ) | — | — | — |
| Xem / xử lý dải "Đánh giá thấp" (F-051, SCR-10) | — | Có | Có | Có |
| Trang Đánh giá món, ngưỡng hiện sao (F-051, SCR-45 / SCR-33) | — | — | — | Có |
| Gửi đơn QR / xử lý đơn khi **chưa mở ca** (F-055, BR-087) | Không (xem menu được) | Không (phải mở ca) | Không (phải mở ca) | Không (phải mở ca) |
| Tra cứu API — mọi endpoint, quyền, request / response (F-052, SCR-46; `GET /api/admin/api-docs`) | — | — (403) | — (403) | Có |
| Đổi tên quán / địa chỉ in trên hóa đơn (F-053, SCR-33; `PUT /api/admin/settings`) | — | — (403) | — (403) | Có |
| Điều chỉnh điểm, quà đổi điểm, chương trình tem, voucher tay, phân khúc & chiến dịch, opt-out | — | — | — | Có |
| Lịch thực đơn, đơn vị, bán thành phẩm & công thức, bật theo lô, nhà cung cấp & PO (tạo / gửi / hủy) | — | — | — | Có |
| Sửa / hủy phiếu nhập kho, hủy phiếu kiểm kê đã chốt (F-048, S-31) | — | — | — | Có |
| Sửa / xóa phiếu kiểm kê nháp (F-048, S-17 / S-31) | — | — | Có | Có |
| Sổ quỹ tổng + CSV, danh mục thu chi, lịch làm, năng suất, nhật ký thao tác, lãi/lỗ & chi phí cố định, phân tích, chạy job thủ công | — | — | — | Có |

Test: `member-card.test.js` → AC-047-01/02 (quầy đăng ký nhanh + gắn ở Gọi món tại bàn), AC-047-04 (thiết bị khác 403, chưa gắn hội viên 404, phiên đóng 409); `void.test.js` → AC-046-02 (nhân viên không / sai người duyệt → 403, trưởng ca duyệt → OK), AC-046-05 (hủy bàn cần duyệt khi có đơn đã tiếp nhận), "đua với tiếp nhận đơn"; `finance.test.js` → "ma trận actor × endpoint sinh từ PERMISSIONS" (mỗi quyền × mỗi vai: vai được phép không nhận 401/403, vai khác nhận 403) và "khách (không token) … → 401"; `finance-unit.test.js` → ngưỡng giảm tay theo vai, `can`.
