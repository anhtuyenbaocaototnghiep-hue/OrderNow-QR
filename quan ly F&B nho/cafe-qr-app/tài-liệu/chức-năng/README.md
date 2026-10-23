# Đặc tả chức năng (features)

> **Nguồn:** `tài-liệu/nguồn/huong-dan-web-app-v1.2.md` §8 (bản 1.2, 14/10/2026). **Trạng thái tài liệu:** BẢN NHÁP — trạng thái từng mục ghi tại chỗ (CONFIRMED / PROPOSED / NEEDS_CONFIRMATION / UNKNOWN / N/A). Quyết định đã chốt: [ADR-000](../quyết-định/ADR-000-thanh-toan-tien-mat.md) (D-1/D-2/D-3).

Mỗi feature dưới đây đủ để agent triển khai và kiểm. AC viết dạng Given/When/Then rút từ Word, có bổ sung AC về quyền và dữ liệu không bị thay đổi sai. Feature chỉ **link** rule ID, không chép rule.

## Bảng tổng hợp feature ↔ nguồn ↔ trạng thái

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai (14/10/2026) | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-001](FEATURE-001.md) | Quét QR, tách/gộp phiên | Khách | CONFIRMED (+ADR-003 Q-012) | READY_FOR_REVIEW | api.test "quét QR…", "sau khi đóng…"; E2E "quét QR…", "phiên đã đóng…" |
| [F-002](FEATURE-002.md) | Menu & giỏ | Khách | CONFIRMED | READY_FOR_REVIEW | E2E "gọi món trong 3 chạm", "admin tắt còn bán…" |
| [F-003](FEATURE-003.md) | Gửi đơn + kiểm kho | Khách | CONFIRMED (+ADR-001, Q-005, Q-013) | READY_FOR_REVIEW | sp.test (20 phiên/1 suất, §13.2 ×10), api.test, E2E "món vừa hết nguyên liệu…", `npm run load` |
| [F-004](FEATURE-004.md) | Theo dõi đơn realtime | Khách | CONFIRMED | READY_FOR_REVIEW | api.test (phiên khác không nhận sự kiện), E2E "tiếp nhận → hoàn tất…" |
| [F-005](FEATURE-005.md) | Gọi thanh toán | Khách | CONFIRMED | READY_FOR_REVIEW | sp.test, api.test "gọi thanh toán…", E2E "gọi thanh toán → …" |
| [F-006](FEATURE-006.md) | Thu tiền mặt, in bill, đóng phiên | Staff | CONFIRMED | READY_FOR_REVIEW (in máy nhiệt thật: NOT_RUN) | sp.test (settle đồng thời, submit⇄settle), api.test, E2E thu tiền + trang in 80 mm |
| [F-007](FEATURE-007.md) | Dashboard quầy: tiếp nhận, hoàn tất & trừ kho | Staff | CONFIRMED (+ADR-003 Q-004b, Q-006) | READY_FOR_REVIEW | sp.test, api.test (complete đồng thời), E2E realtime + mất mạng/đơn trễ |
| [F-008](FEATURE-008.md) | Bán mang đi (tiền mặt) | Staff | CONFIRMED | READY_FOR_REVIEW | sp.test, api.test "Bán mang đi", E2E "bán mang đi…" |
| [F-009](FEATURE-009.md) | Đăng nhập & tài khoản | Staff/Admin | CONFIRMED | READY_FOR_REVIEW | api.test (ma trận quyền, khóa, trùng username, hash), E2E đăng nhập + trùng tên |
| [F-010](FEATURE-010.md) | Menu/danh mục/bàn/QR | Admin | CONFIRMED | READY_FOR_REVIEW | api.test "menu…", "bàn + QR…", E2E realtime hết món |
| [F-011](FEATURE-011.md) | Nguyên liệu/BOM/kho | Admin | CONFIRMED (+ADR-003 Q-011) | READY_FOR_REVIEW | sp.test adjust, api.test BOM/kho, E2E BOM -10 |
| [F-012](FEATURE-012.md) | Báo cáo + lịch sử đơn | Admin | CONFIRMED (+ADR-003 Q-014) | READY_FOR_REVIEW | api.test báo cáo (seed 55 đơn = 3.190.000đ), E2E báo cáo |

### Giai đoạn 2 — skill `extend-features` (ADR-005, 16/10/2026)

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-013](FEATURE-013.md) | Tùy chọn món (size, topping) | Admin/Khách/Staff | CONFIRMED (ADR-005 D-13) | READY_FOR_REVIEW | pricing.test, sales.test, E2E "tùy chọn món + combo" |
| [F-014](FEATURE-014.md) | Hội viên SĐT + họ tên | Khách/Staff/Admin | CONFIRMED (D-5, D-6, D-16) | READY_FOR_REVIEW | members.test, pricing.test, E2E "hội viên…" |
| [F-015](FEATURE-015.md) | Combo cố định | Admin/Khách/Staff | CONFIRMED (D-9) | READY_FOR_REVIEW | sales.test, pricing.test, E2E |
| [F-016](FEATURE-016.md) | Khuyến mãi | Admin | CONFIRMED (D-8, D-10) | READY_FOR_REVIEW | pricing.test (lịch), sales.test (tranh lượt đồng thời) |
| [F-017](FEATURE-017.md) | Gợi ý / bán chạy / ghim | Admin/Khách | CONFIRMED (D-11) | READY_FOR_REVIEW | sales.test |
| [F-018](FEATURE-018.md) | Chốt ca tiền mặt | Staff/Admin | CONFIRMED | READY_FOR_REVIEW | members.test, operations.test, E2E "ca…" |
| [F-019](FEATURE-019.md) | Hoàn tiền sau thu | Admin (Staff + duyệt) | CONFIRMED (D-15; Q-020) | READY_FOR_REVIEW | operations.test (hoàn đồng thời), E2E "ca…" |
| [F-020](FEATURE-020.md) | Tự hết món, tạm ngưng nhận đơn QR, giờ bán | Staff/Admin | CONFIRMED (D-12) | READY_FOR_REVIEW | sales.test, E2E "tạm ngưng…" |
| [F-021](FEATURE-021.md) | Gọi nhân viên | Khách/Staff | CONFIRMED | READY_FOR_REVIEW | sales.test, E2E "gọi nhân viên…" |
| [F-022](FEATURE-022.md) | Giảm giá tay trên bill | Staff/Admin | CONFIRMED (D-14; Q-019) | READY_FOR_REVIEW | members.test, pricing.test |
| [F-023](FEATURE-023.md) | Nhập kho & kiểm kê, giá vốn | Admin | CONFIRMED | READY_FOR_REVIEW | operations.test |

### Theo yêu cầu chủ dự án (16/10/2026)

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-024](FEATURE-024.md) | Gọi món tại bàn (nhân viên nhập giúp) + ghi chú bàn | Staff/Admin | PROPOSED (mặc định — Q-021) | READY_FOR_REVIEW | table-order.test (11), E2E "gọi món tại bàn" |

### Giai đoạn 4–8 — skill `advanced-features` (ADR-006, 17–18/10/2026)

Mã skill **F-024 "Gọi lại đơn / món yêu thích" → [FEATURE-045](FEATURE-045.md)** vì FEATURE-024 đã là "Gọi món tại bàn"; các mã còn lại giữ nguyên (F-025…F-043 = FEATURE-025…043). Dòng xếp theo thứ tự làm (giai đoạn 4 → 8), task TASK-035…054 ([plan](../kế-hoạch/TASK-035-054-plan.md)). Bằng chứng 18/10/2026: `npm test` 217/217, `npm run test:e2e` 27/27, `npm run load` 10/10.

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-045](FEATURE-045.md) | Gọi lại đơn lần trước & món yêu thích (skill F-024) | Khách/Staff | CONFIRMED (ADR-006) | READY_FOR_REVIEW | phase4.test (3), E2E "gọi lại đơn lần trước + thời gian chờ…" |
| [F-040](FEATURE-040.md) | Thực đơn theo mùa / khung giờ tự động | Admin/Khách/Staff | CONFIRMED (ADR-006) | READY_FOR_REVIEW | phase4-unit (5), phase4.test (3), sales.test giờ bán F-020 không sửa |
| [F-025](FEATURE-025.md) | Thời gian chờ ước tính | Khách/Staff/Admin | CONFIRMED (D-18) | READY_FOR_REVIEW | phase4-unit (3), phase4.test (2, job chạy trùng → SKIPPED), E2E "gọi lại đơn lần trước + thời gian chờ…" |
| [F-026](FEATURE-026.md) | Chia bill theo người trong phiên gộp | Khách/Staff | CONFIRMED (D-17) | READY_FOR_REVIEW | phase4-unit (2), phase4.test (4, thu đồng thời), bất biến chia bill, E2E "chia bill…" |
| [F-031](FEATURE-031.md) | Đổi đơn vị & giá vốn bình quân / FIFO | Admin | CONFIRMED (D-21) | READY_FOR_REVIEW | inventory-unit, inventory2.test (4), bất biến `COGS_MISMATCH`, E2E "kho nâng cao…" |
| [F-027](FEATURE-027.md) | Bán thành phẩm / BOM 2 cấp / phiếu sơ chế | Admin/Staff | CONFIRMED (D-19) | READY_FOR_REVIEW | inventory-unit, inventory2.test (3), E2E "kho nâng cao…" |
| [F-032](FEATURE-032.md) | Hao hụt định mức & phiếu hủy hàng | Staff/Admin | CONFIRMED (ADR-006) | READY_FOR_REVIEW | inventory-unit, inventory2.test (2), E2E "kho nâng cao…" |
| [F-028](FEATURE-028.md) | Lô & hạn sử dụng (FEFO) | Admin/Staff | CONFIRMED (D-20) | READY_FOR_REVIEW | inventory2.test (4, 40 thao tác ngẫu nhiên), bất biến `LOTS_MISMATCH` |
| [F-030](FEATURE-030.md) | Nhà cung cấp & đơn đặt hàng (PO) | Admin/Staff | CONFIRMED (ADR-006) | READY_FOR_REVIEW | inventory2.test (2), E2E "kho nâng cao…" |
| [F-029](FEATURE-029.md) | Dự báo nhập hàng | Admin | CONFIRMED (D-22) | READY_FOR_REVIEW | inventory-unit (3), inventory2.test, E2E "kho nâng cao…" |
| [F-036](FEATURE-036.md) | Vai Trưởng ca (MANAGER) & ma trận quyền | Admin/Manager | CONFIRMED (D-24; lệch docs — Q-022) | READY_FOR_REVIEW | finance.test (ma trận sinh từ `PERMISSIONS`, `LAST_ADMIN` đồng thời), finance-unit, E2E "trưởng ca + sổ quỹ…" |
| [F-033](FEATURE-033.md) | Sổ quỹ (thu / chi ngoài bán hàng) | Staff/Manager/Admin | CONFIRMED (D-23; Q-022) | READY_FOR_REVIEW | finance.test (10), finance-unit (CSV), E2E "trưởng ca + sổ quỹ…" |
| [F-035](FEATURE-035.md) | Chấm công, lịch làm, năng suất, nhật ký thao tác | Hệ thống/Manager/Admin | CONFIRMED (D-25, D-26) | READY_FOR_REVIEW | finance.test (6 + 3), finance-unit (luật nhật ký), E2E "trưởng ca + sổ quỹ…" |
| [F-034](FEATURE-034.md) | Lãi / lỗ đơn giản & điểm hòa vốn | Admin | CONFIRMED (D-31) | READY_FOR_REVIEW | finance.test (4), finance-unit, E2E "trưởng ca + sổ quỹ…" |
| [F-039](FEATURE-039.md) | Tích điểm đổi quà & tem | Khách/Staff/Admin | CONFIRMED (D-27) | READY_FOR_REVIEW | loyalty.test (7, hai quầy cùng đổi), members.test, E2E "CRM: …" |
| [F-038](FEATURE-038.md) | Giới thiệu bạn & voucher | Khách/Staff/Admin | CONFIRMED (D-28) | READY_FOR_REVIEW | loyalty.test (6, đăng ký / dùng mã đồng thời), E2E "CRM: …" |
| [F-037](FEATURE-037.md) | Chiến dịch theo phân khúc | Admin | CONFIRMED (D-29) | READY_FOR_REVIEW | loyalty.test (6), E2E "CRM: …" |
| [F-041](FEATURE-041.md) | Menu engineering | Admin | CONFIRMED (D-30) | READY_FOR_REVIEW | analytics.test (unit + integration), E2E "phân tích + dashboard…" |
| [F-042](FEATURE-042.md) | Giờ cao điểm, dự báo doanh thu, so sánh kỳ, theo bàn | Admin | CONFIRMED (ADR-006) | READY_FOR_REVIEW | analytics.test (unit + 4 integration), E2E "phân tích + dashboard…" |
| [F-043](FEATURE-043.md) | Dashboard chủ quán ("Hôm nay") | Admin/Manager | CONFIRMED (D-32) | READY_FOR_REVIEW | analytics.test "dashboard: …", finance.test (`dashboard.view`), E2E "phân tích + dashboard…" |

### Theo yêu cầu chủ dự án (18/10/2026) — ADR-007

Task [TASK-055](../công-việc/TASK-055.md). Bằng chứng 18/10/2026: `npm test` 229/229, `npm run test:e2e` 28/28, `npm run load` 10/10.

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-046](FEATURE-046.md) | Sửa / xóa món đã gọi, xóa đơn, hủy lượt phục vụ bàn | Staff/Manager/Admin | CONFIRMED (D-33…D-35) | READY_FOR_REVIEW | void.test (12, đua với tiếp nhận đơn, hai máy cùng xóa), bất biến `OVER_RESTOCK` / `ORDER_LINES_MISMATCH`, E2E "sửa / xóa món + hủy bàn" |

### Theo yêu cầu chủ dự án (18/10/2026) — ADR-008

Task [TASK-056](../công-việc/TASK-056.md). Bằng chứng 18/10/2026: `npm test` 234/234, `npm run test:e2e` 29/29.

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-047](FEATURE-047.md) | Hội viên khi gọi món tại bàn, Thẻ thành viên cho khách, quyền lợi trên bill | Staff/Khách | CONFIRMED (D-36…D-38) | READY_FOR_REVIEW | member-card.test (5: đăng ký bắt buộc đồng ý, thẻ không có mã voucher, 403 / 404 / 409, bill có / không khối thẻ), E2E "hội viên tại bàn + thẻ thành viên" |

### Theo yêu cầu chủ dự án (21/10/2026) — ADR-009

Task [TASK-060](../công-việc/TASK-060.md).

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-048](FEATURE-048.md) | Sửa / hủy phiếu nhập kho, sửa / xóa phiếu kiểm kê nháp, hủy phiếu kiểm kê đã chốt | Quản lý / Trưởng ca | CONFIRMED (D-39…D-42) | READY_FOR_REVIEW | stock-revise.test (13 — AC-048-01…10 + 3 test theo review G3) + E2E "sửa / hủy phiếu nhập kho và phiếu kiểm kê" + bất biến RECEIPT_LEDGER / STOCKTAKE_LEDGER / PO_RECEIVED |

### Theo yêu cầu chủ dự án (21/10/2026) — ADR-010

| Feature | Tên | Actor | Trạng thái nghiệp vụ | Triển khai | Bằng chứng tự động |
| --- | --- | --- | --- | --- | --- |
| [F-049](FEATURE-049.md) | Chuyển bàn — cả nhóm sang bàn khác, bill riêng; điện thoại khách tự theo | Staff/Khách | CONFIRMED (D-43) | READY_FOR_REVIEW ([TASK-061](../công-việc/TASK-061.md)) | table-move.test (4) + E2E "chuyển bàn…" + bất biến ORDER_TABLE_MISMATCH |
| [F-050](FEATURE-050.md) | Hủy / sửa khoản sổ quỹ đã duyệt (ca còn mở, quyền như duyệt) | Trưởng ca/Quản lý | CONFIRMED (D-44, D-45) | READY_FOR_REVIEW ([TASK-062](../công-việc/TASK-062.md)) | cash-void.test (4) + E2E "sổ quỹ: hủy / sửa…" + bất biến CASH_REPLACE_LINK, SHIFT_EXPECTED_CASH |
| [F-051](FEATURE-051.md) | Đánh giá sau khi dùng món: sao từng món + góp ý, báo quầy khi ≤ 2 sao, sao trên menu, trang Đánh giá món | Khách/Staff/Quản lý | CONFIRMED (D-46…D-48) | READY_FOR_REVIEW ([TASK-063](../công-việc/TASK-063.md)) | reviews.test (5) + E2E "đánh giá sau khi dùng món…" + a11y /admin/reviews |
| [F-052](FEATURE-052.md) | Tra cứu API trong Quản lý: mọi endpoint đang chạy, quyền theo middleware, request / response từ api-contract.md | Quản lý | CONFIRMED (D-49…D-51) | READY_FOR_REVIEW ([TASK-064](../công-việc/TASK-064.md)) | api-docs.test (6) + E2E "tra cứu API…" + a11y /admin/api-docs |
| [F-053](FEATURE-053.md) | Đổi tên quán và địa chỉ in trên hóa đơn ngay trong Cài đặt (không sửa `.env`) | Quản lý | CONFIRMED (chủ dự án 23/10/2026) | READY_FOR_REVIEW ([TASK-067](../công-việc/TASK-067.md)) | shop-info.test (5) + E2E "đổi tên quán…" + a11y `/admin/settings` |
| [F-054](FEATURE-054.md) | Người mở ca phải đếm tiền, đóng ca trước khi đăng xuất | Nhân viên / trưởng ca / quản lý | CONFIRMED (D-59) | READY_FOR_REVIEW ([TASK-068](../công-việc/TASK-068.md)) | logout-shift.test (3) + E2E "đăng xuất khi đang giữ ca…" |
| [F-055](FEATURE-055.md) | Chưa mở ca thì không nhận và không xử lý đơn: khách xem menu nhưng không gửi đơn, quầy khóa xử lý đơn; tự mở lại khi mở ca | Khách/Staff | CONFIRMED (D-64…D-66) | READY_FOR_REVIEW ([TASK-071](../công-việc/TASK-071.md)) | shift-required.test (4) + E2E "chưa mở ca…" |

Không còn feature nào bị chặn bởi câu hỏi mở (ADR-000…011). Q-019, Q-020 đã áp phương án chặt hơn; Q-021 (gọi món tại bàn) và **Q-022** (ma trận quyền Trưởng ca của skill lệch docs: nhân viên vẫn mở / đóng ca và ghi chi quỹ, khoản lớn chờ duyệt) đang chạy theo mặc định — chờ nhóm xác nhận. "READY_FOR_REVIEW" = đã code + test tự động pass, chờ nhóm review theo DoD. Chi tiết câu hỏi: [open-questions.md](../open-questions.md).
