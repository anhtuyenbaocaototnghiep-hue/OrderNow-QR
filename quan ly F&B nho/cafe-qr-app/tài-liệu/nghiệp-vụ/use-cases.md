# Use Case & User Flow (bước 06)

> **Mẫu:** Sổ tay quy trình 15 bước, bước 06 "Use Case & User Flow", Mẫu 04. **Phiên bản:** v1.0 — 20/10/2026 ([TASK-057](../công-việc/TASK-057.md)). **Nguồn:** [chức-năng/](../chức-năng/README.md) FEATURE-001…047 (luồng, lỗi, AC), [business-rules.md](business-rules.md), [workflows-states.md](workflows-states.md), [roles-permissions.md](roles-permissions.md), [kiến-trúc/api-contract.md](../kiến-trúc/api-contract.md), [kiến-trúc/realtime-events.md](../kiến-trúc/realtime-events.md), [giao-diện/screens-flows.md](../giao-diện/screens-flows.md). **Trạng thái tài liệu:** CHỜ DUYỆT G1.

**Quy ước:**

- Actor: `ACT-…` / `EXT-…` theo [actors.md](actors.md).
- Story: `US-<FFF>-*` = các User Story của FEATURE `FFF` (tài liệu User Story của TASK-057 do agent khác viết); `US-046-1…3`, `US-047-1…3` đã có trong FEATURE-046 / FEATURE-047.
- **`SCR-xx` = màn hình `S-xx`** trong [screens-flows.md](../giao-diện/screens-flows.md) (giữ nguyên số, theo TASK-057). `SCR-12` là trang in.
- Ngoại lệ ghi đúng mã HTTP / mã lỗi trong FEATURE, api-contract và business-rules. Chỗ nguồn không ghi mã lỗi thì ghi rõ "mã lỗi không ghi trong nguồn".
- Use Case tập trung tương tác và ngoại lệ; dòng **User Flow** tập trung đường đi và điểm quyết định.
- "Log cần ghi" gồm nhật ký thao tác (`AuditLogs`, BR-055 — chỉ ghi khi thành công, sau commit) và sự kiện realtime (phát sau commit, [realtime-events.md](../kiến-trúc/realtime-events.md)).

## Danh mục Use Case

| UC | Tên | Actor chính | FEATURE | SCR |
| --- | --- | --- | --- | --- |
| UC-01 | Quét QR vào bàn (tách / gộp phiên) | ACT-GUEST | F-001 (F-024) | SCR-01, SCR-02 |
| UC-02 | Khách gọi món qua QR | ACT-GUEST | F-002, F-003, F-004 (F-013, F-015, F-016, F-017, F-025, F-040, F-055) | SCR-02, SCR-03, SCR-05 |
| UC-03 | Quầy tiếp nhận / hoàn tất / hủy đơn (giữ & trừ kho) | ACT-STAFF | F-007 (F-025, F-028, F-031, F-055) | SCR-10, SCR-11 |
| UC-04 | Gọi thanh toán & thu tiền tại bàn, in bill | ACT-GUEST, ACT-STAFF, EXT-PRINTER | F-005, F-006 (F-018, F-022, F-047) | SCR-05, SCR-04, SCR-10, SCR-14, SCR-12 |
| UC-05 | Bán mang đi | ACT-STAFF, EXT-PRINTER | F-008 (F-013, F-015, F-022, F-040, F-045) | SCR-13, SCR-12, SCR-10 |
| UC-06 | Chia bill thu từng phần | ACT-GUEST, ACT-STAFF | F-026 | SCR-05, SCR-14, SCR-12 |
| UC-07 | Hoàn tiền sau khi thu | ACT-LEAD, ACT-ADMIN, ACT-STAFF (có duyệt) | F-019 (F-036, F-039, F-046) | SCR-15, SCR-32 |
| UC-08 | Nhân viên mở bàn & gọi món tại bàn (gắn hội viên) | ACT-STAFF | F-024, F-047 | SCR-16, SCR-14 |
| UC-09 | Sửa / xóa món, xóa đơn, hủy bàn | ACT-STAFF, ACT-LEAD, ACT-ADMIN | F-046 | SCR-14, SCR-10 |
| UC-10 | Hội viên: gắn SĐT, tích điểm / tem, đổi quà, voucher, giới thiệu, xem Thẻ thành viên | ACT-GUEST → ACT-MEMBER, ACT-STAFF | F-014, F-038, F-039, F-045, F-047 | SCR-02, SCR-03, SCR-05, SCR-13, SCR-14, SCR-12 |
| UC-11 | Mở / đóng ca và sổ quỹ | ACT-STAFF, ACT-LEAD, ACT-ADMIN | F-018, F-033 (F-036, F-054) | SCR-10, SCR-15, SCR-32, SCR-36 |
| UC-12 | Chấm công, lịch làm | ACT-STAFF, ACT-LEAD, ACT-ADMIN, EXT-SCHEDULER | F-035 | SCR-09, SCR-15, SCR-37 |
| UC-13 | Kho: nhập hàng / PO / kiểm kê / hao hụt / sơ chế / lô | ACT-STAFF, ACT-LEAD, ACT-ADMIN, EXT-SCHEDULER | F-011, F-023, F-027…F-032, F-036 | SCR-17, SCR-23, SCR-24, SCR-31, SCR-35 |
| UC-14 | Quản lý menu, BOM, tùy chọn, combo, khuyến mãi, lịch thực đơn | ACT-ADMIN | F-010, F-011, F-013, F-015, F-016, F-017, F-020, F-040 | SCR-21, SCR-22, SCR-24, SCR-27…SCR-30, SCR-34 |
| UC-15 | Chiến dịch marketing | ACT-ADMIN, EXT-SCHEDULER, EXT-ZALO | F-037 (F-038) | SCR-40, SCR-26 |
| UC-16 | Báo cáo, lãi lỗ, phân tích, dashboard Hôm nay | ACT-ADMIN, ACT-LEAD, EXT-SCHEDULER | F-012, F-034, F-041, F-042, F-043 | SCR-42, SCR-25, SCR-39, SCR-41 |
| UC-17 | Tài khoản, phân quyền, nhật ký thao tác | ACT-ADMIN, ACT-STAFF | F-009, F-036, F-035 (F-052, F-053) | SCR-09, SCR-20, SCR-33, SCR-38, SCR-46 |
| UC-18 | Khách gọi nhân viên | ACT-GUEST, ACT-STAFF | F-021 | SCR-05, SCR-10 |
| UC-19 | Tạm ngưng nhận đơn QR / giờ bán | ACT-STAFF, ACT-ADMIN | F-020, F-040 | SCR-10, SCR-02, SCR-21, SCR-33, SCR-34 |

Mọi FEATURE F-001…F-043, F-045…F-047 có mặt ở ít nhất một UC (không có F-044).

---

## UC-01 — Quét QR vào bàn (tách / gộp phiên)

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST (ACT-MEMBER dùng như ACT-GUEST) |
| Actor phụ | ACT-STAFF — bàn có thể do nhân viên mở trước (UC-08) |
| Story | `US-001-*` |
| FEATURE | [F-001](../chức-năng/FEATURE-001.md); liên quan [F-024](../chức-năng/FEATURE-024.md) |
| Tiền điều kiện | Bàn tồn tại, đang bật, chưa bị xóa; `qrToken` hợp lệ (QR chưa bị tạo lại). Không cần đăng nhập |
| Kích hoạt | Khách quét mã QR trên bàn → trình duyệt mở `/t/{qrToken}` |
| Luồng chính | **1.** Mở SCR-01; server cấp cookie `cf_client` nếu trình duyệt chưa có. **2.** Client gọi `POST /api/sessions/scan`. **3.** Server tìm bàn và các phiên `OPEN` của bàn. **4.** Bàn chưa có phiên mở → tạo phiên `OPEN` mới, gắn `cf_client`. **5.** Vào thẳng menu SCR-02, không hỏi gì (AC-001-01) |
| Luồng thay thế | **A1.** Bàn có phiên mở (`state = OCCUPIED`) → hộp thoại "Bàn 05 đang có đơn. Gộp chung nhóm hay Tạo đơn cá nhân?" (chỉ hiện số món, tổng tạm tính; không lộ đơn / ghi chú khách khác). Gộp → `POST /api/sessions/{id}/join`, thấy các đơn nhóm đã gọi (AC-001-02); Cá nhân → phiên mới song song, hai phiên không thấy đơn của nhau (AC-001-03). **A2.** Bàn có nhiều phiên mở → hộp thoại liệt kê các phiên theo thời gian mở (PROPOSED trong FEATURE-001). **A3.** Trình duyệt đã thuộc một phiên mở của bàn (`state = MEMBER`) → vào lại phiên cũ (đóng tab rồi quét lại). **A4.** Bàn do nhân viên mở (UC-08) → khách thấy bàn đang có người, Gộp được, thấy đơn nhân viên đã nhập nhưng **không** thấy ghi chú bàn / người mở bàn (AC-024-03, BR-032) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | `qrToken` sai, QR cũ đã "Tạo lại", hoặc bàn đã xóa | `404 TABLE_NOT_FOUND` "Mã bàn không hợp lệ"; không tạo phiên (AC-001-05, AC-010-04, ADR-004) |
| E2 | Chọn Gộp vào phiên vừa thu tiền xong | `409 SESSION_CLOSED`; client báo "Đơn hàng nhóm đã được thanh toán, hệ thống sẽ tạo phiên mới cho bạn" và tự tạo phiên mới (BR-008, AC-001-04) |
| E3 | `join` vào phiên thuộc bàn khác | `404` (api-contract) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Sessions` | +1 dòng `OPEN` khi tạo mới (không đổi khi Gộp) |
| `SessionClients` | +1 dòng (`sessionId`, `cf_client`) |
| Cookie `cf_client` | Cấp mới nếu chưa có (32 hex, HttpOnly, 1 năm) |

- **Log cần ghi:** không thuộc danh sách nhật ký thao tác (BR-055); nguồn không có sự kiện realtime riêng cho quét QR. Client vào room `session:{id}` lúc handshake để nhận sự kiện của phiên.
- **BR liên quan:** BR-008, BR-020, BR-032.
- **User Flow:** `SCR-01 -> [bàn có phiên mở?] -> (không) SCR-02` · `SCR-01 -> [Gộp chung / Cá nhân] -> SCR-02` · `SCR-01 -> [phiên vừa đóng: 409] -> tạo phiên mới -> SCR-02` · `SCR-01 -> [QR sai: 404] -> SCR-01 (báo lỗi)`

---

## UC-02 — Khách gọi món qua QR

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST (ACT-MEMBER) |
| Actor phụ | ACT-STAFF nhận đơn (UC-03) |
| Story | `US-002-*`, `US-003-*`, `US-004-*`, `US-013-*`, `US-015-*`, `US-016-*`, `US-017-*`, `US-025-*`, `US-040-*` |
| FEATURE | [F-002](../chức-năng/FEATURE-002.md), [F-003](../chức-năng/FEATURE-003.md), [F-004](../chức-năng/FEATURE-004.md) (theo dõi đơn sau khi gửi); liên quan [F-013](../chức-năng/FEATURE-013.md), [F-015](../chức-năng/FEATURE-015.md), [F-016](../chức-năng/FEATURE-016.md), [F-017](../chức-năng/FEATURE-017.md), [F-025](../chức-năng/FEATURE-025.md), [F-040](../chức-năng/FEATURE-040.md) |
| Tiền điều kiện | Có phiên `OPEN` hoặc `PAYMENT_REQUESTED` thuộc `cf_client` (UC-01); quán đang nhận đơn QR; giỏ ≥ 1 món |
| Kích hoạt | Khách chạm "+" trên một món ở SCR-02 |
| Luồng chính | **1.** SCR-02 tải `GET /api/menu`: danh mục, món theo lịch thực đơn, mục Ưu đãi / Gợi ý / Combo; món hết hiện mờ "Hết món". **2.** Khách chạm "+" (món có tùy chọn: thêm ngay theo mặc định). **3.** Thanh nổi "Xem giỏ · Gửi đơn" → giỏ SCR-03: số lượng 1…50, ghi chú ≤ 200 ký tự, tổng theo báo giá server, "⏱ Dự kiến có món sau khoảng a–b phút". **4.** Bấm **Gửi đơn** (nút khóa sau lần bấm đầu, kèm `Idempotency-Key`). **5.** Server tính giá từ DB (bỏ qua giá client gửi — AC-003-03), áp và khóa khuyến mãi; `sp_SubmitOrder` khóa phiên, kiểm khả dụng **mọi** nguyên liệu (gồm BOM tùy chọn, thành phần combo, trừ lô hết hạn), tăng `ReservedQty`, ghi đơn `PENDING` / `UNPAID`. **6.** Phát `order.created` tới quầy và phiên. **7.** Trả `201`; client chuyển SCR-05 "Đặt món thành công". Luồng chuẩn = 3 chạm từ menu (NFR-003). **8.** SCR-05 tải ảnh chụp phiên (`GET /api/sessions/{id}`) rồi cập nhật theo sự kiện của room `session:{id}`: "Chờ xác nhận" → "Đang chuẩn bị" → pop-up "Đã xong, vui lòng nhận tại quầy" (≤ 2 s — AC-004-01); tổng tạm tính = Σ đơn không hủy (AC-004-04) |
| Luồng thay thế | **A1.** Món có tùy chọn: "Chọn size / tùy chọn ›" mở sheet theo Min/Max; cùng món khác tùy chọn là hai dòng giỏ. **A2.** Gọi combo: một dòng cha + các dòng con giá 0; giữ kho theo BOM thành phần. **A3.** Khuyến mãi theo đơn tranh lượt cuối (`MaxUsesPerDay`) mà thua → server tính lại đơn không khuyến mãi, khách không thấy lỗi (F-016). **A4.** Phiên đang `PAYMENT_REQUESTED` → gửi đơn đưa phiên về `OPEN`, phát `session.payment_cancelled` để POS gỡ cảnh báo (ADR-003 Q-013). **A5.** Gửi lặp cùng `Idempotency-Key` trong 60 giây → trả lại cùng đơn. **A6.** Gửi thêm đơn trong cùng phiên → SCR-05 hiện mọi đơn, tổng phiên = tổng các đơn (AC-003-06). **A7.** Hội viên gắn vào phiên dùng "Gọi lại" / món yêu thích → UC-10. **A8.** Mất kết nối ở SCR-05 → "Đang kết nối lại"; kết nối lại → tải lại ảnh chụp, không tin sự kiện bị nhỡ (AC-004-02); client phiên khác không nhận sự kiện của phiên này (AC-004-03) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Không đủ nguyên liệu cho ít nhất một món | `409 OUT_OF_STOCK { items: [{ menuItemId, name }] }`; rollback, không ghi dòng nào, `ReservedQty` không đổi; client bỏ món khỏi giỏ, báo "Rất tiếc, Trà đào vừa hết món. Vui lòng chọn món khác" (BR-009, AC-003-02) |
| E2 | Món bị tắt "còn bán", ngoài giờ bán danh mục, ngoài lịch thực đơn, hoặc combo có thành phần hết | `409 ITEM_UNAVAILABLE` (kèm tên món / combo) (BR-030, BR-034, AC-015-02) |
| E3 | Thiếu nhóm tùy chọn bắt buộc, quá tối đa, tùy chọn không thuộc món | `400 INVALID_OPTIONS` |
| E4 | Phiên không thuộc `cf_client` | `403`; không ghi dữ liệu (AC-003-05) |
| E5 | Phiên đã `CLOSED` | `409 SESSION_CLOSED`; client hướng dẫn quét lại QR (BR-020) |
| E6 | Quán đang tạm ngưng nhận đơn QR | `503 STORE_CLOSED` (UC-19) |
| E7 | Quá 10 đơn / phút / khách | `429 RATE_LIMITED` |
| E8 | Số lượng ngoài 1…50, ghi chú quá dài, dữ liệu sai | `400 VALIDATION_ERROR` (BR-015) |
| E9 | Hai bàn cùng gửi khi kho chỉ đủ 1 suất | Đúng 1 đơn `201`, các đơn còn lại `409 OUT_OF_STOCK`; `StockQty − ReservedQty ≥ 0` (AC-003-04, NFR-002) |
| E10 | Quầy chưa mở ca | `409 NO_OPEN_SHIFT` "Quán chưa mở ca nên chưa nhận đơn"; không ghi đơn; menu vẫn xem được, nút gửi khóa tới khi quầy mở ca (BR-087, AC-055-01) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Orders` | +1 dòng `DINE_IN`, `PENDING`, `UNPAID`; `TotalAmount` tính ở server (BR-012) |
| `OrderItems`, `OrderItemModifiers` | Dòng món (+ dòng con combo, tùy chọn); `UnitPrice` chốt lúc đặt (BR-011) |
| `OrderIngredients` | Lượng nguyên liệu giữ cho đơn, chụp lúc gửi (ADR-001) |
| `Ingredients.ReservedQty` | Tăng đúng Σ BOM (BR-010) |
| `PromotionUsages` | +1 khi đơn được khuyến mãi (BR-022, BR-023) |
| `Sessions.Status` | `PAYMENT_REQUESTED` → `OPEN` nếu khách gọi thêm |

- **Log cần ghi:** realtime `order.created` (room `staff`, `session:{id}`); có thể `menu.availability_changed`, `session.payment_cancelled`. Nhật ký thao tác: **không** ghi (gọi món thường — BR-055).
- **BR liên quan:** BR-001, BR-009, BR-010, BR-011, BR-012, BR-015, BR-020, BR-022, BR-023, BR-029, BR-030, BR-034, BR-035, BR-087.
- **User Flow:** `SCR-02 -> SCR-03 -> [đủ kho, món còn bán, quán đang nhận đơn?] -> SCR-05` · `SCR-03 -> [409 OUT_OF_STOCK / ITEM_UNAVAILABLE] -> SCR-03 (bỏ món, báo lỗi) -> SCR-02`

---

## UC-03 — Quầy tiếp nhận / hoàn tất / hủy đơn (giữ & trừ kho)

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (ACT-LEAD, ACT-ADMIN cùng quyền `pos.use`) |
| Actor phụ | ACT-GUEST nhận cập nhật trạng thái |
| Story | `US-007-*`, `US-025-*` |
| FEATURE | [F-007](../chức-năng/FEATURE-007.md); liên quan [F-025](../chức-năng/FEATURE-025.md) (hàng chờ), [F-031](../chức-năng/FEATURE-031.md) (giá vốn lúc hoàn tất), [F-028](../chức-năng/FEATURE-028.md) (trừ lô FEFO) |
| Tiền điều kiện | Đăng nhập, tài khoản đang hoạt động; đơn ở `PENDING` (tiếp nhận / hủy) hoặc `PREPARING` (hoàn tất) |
| Kích hoạt | Sự kiện `order.created` — âm "Ting", thẻ đơn nảy vào cột **Mới** của SCR-10 |
| Luồng chính | **1.** SCR-10 tải đơn `PENDING` / `PREPARING` và phiên đang phục vụ, vào room `staff`. **2.** Đơn mới vào cột Mới, kèm dòng "Hàng chờ: N món · khách mới chờ ~a–b phút". **3.** Nhân viên mở chi tiết SCR-11, bấm **Tiếp nhận** → `PENDING → PREPARING`; khách thấy "Đang chuẩn bị" ≤ 2 s (AC-004-01). **4.** Pha xong, bấm **Hoàn tất** → `sp_CompleteOrder` trong một transaction: `PREPARING → COMPLETED` đúng một lần, trừ `StockQty` và `ReservedQty` theo lượng đã giữ, trừ lô theo FEFO, ghi `InventoryTransactions(DEDUCT)` có giá vốn, chốt `OrderItems.CogsAmount`. **5.** Phát `order.status_changed`; khách nhận pop-up "Đã xong, vui lòng nhận tại quầy" |
| Luồng thay thế | **A1.** "Tiếp nhận & Hoàn tất" (2 lệnh tuần tự — ADR-003). **A2.** Hủy đơn `PENDING` kèm lý do → `CANCELLED`, trả `ReservedQty`, phát `order.cancelled` (ADR-003 Q-010). **A3.** Đơn mang đi (UC-05) và đơn nhân viên nhập tại bàn (UC-08) đã ở `PREPARING`, chỉ cần Hoàn tất. **A4.** Mất kết nối → icon "Mất kết nối"; kết nối lại → tải lại từ `lastEventAt`, có đơn / yêu cầu mới thì banner "Có đơn hàng bị trễ" (AC-007-05). **A5.** Đơn đã tiếp nhận / đã pha cần bỏ trước khi thu tiền → UC-09 |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Hai máy cùng bấm Hoàn tất một đơn | Máy sau `409 ALREADY_PROCESSED` "Đơn hàng này đã được nhân viên khác xử lý"; kho trừ đúng một lần (BR-002, AC-007-04) |
| E2 | Tiếp nhận đơn đã được người khác tiếp nhận / hoàn tất | `409 ALREADY_PROCESSED`; đơn đã hủy → `409 INVALID_STATE` |
| E3 | Hoàn tất đơn còn `PENDING` (chưa tiếp nhận) | `409 INVALID_STATE` (BR-013) |
| E4 | Hủy đơn không ở `PENDING` | `409 INVALID_STATE` (BR-013) — đơn đã tiếp nhận / đã pha xóa theo UC-09 |
| E5 | Kho không đủ lúc hoàn tất (chỉ khi kho bị điều chỉnh tay giảm) | `409 OUT_OF_STOCK`; rollback, đơn vẫn `PREPARING`, quầy được báo cần điều chỉnh kho / hủy (BR-001) |
| E6 | Khách / không token gọi `accept` / `complete` | `401`; đơn không đổi (AC-007-07) |
| E7 | Chưa mở ca (ca trước đã đóng, đơn còn chờ) | Tiếp nhận / hoàn tất / hủy → `409 NO_OPEN_SHIFT` "Chưa mở ca — hãy mở ca trước khi xử lý đơn"; đơn và kho không đổi; mở ca rồi làm tiếp (BR-087, AC-055-03) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Orders` | `Status`, `AcceptedAt`, `CompletedAt`, `CompletedBy`; hủy: `CancelReason`, `CancelledBy` |
| `Ingredients` | Hoàn tất: `StockQty` và `ReservedQty` giảm đúng lượng đã giữ; hủy: `ReservedQty` trả lại |
| `InventoryTransactions` | +N dòng `DEDUCT` (mỗi nguyên liệu × lô), có `UnitCost`, `CostAmount` |
| `IngredientLots` | `Qty` giảm theo FEFO (nguyên liệu theo lô) |
| `OrderItems.CogsAmount` | Chốt giá vốn dòng lúc hoàn tất (BR-038) |

- **Log cần ghi:** realtime `order.status_changed`, `order.cancelled`, `inventory.low`, `menu.availability_changed`. Nhật ký thao tác: **hủy đơn** có ghi; tiếp nhận / hoàn tất không ghi (BR-055).
- **BR liên quan:** BR-001, BR-002, BR-010, BR-013, BR-016, BR-035, BR-038, BR-041, BR-087.
- **User Flow:** `SCR-10 -> SCR-11 -> [PENDING: Tiếp nhận / Hủy · PREPARING: Hoàn tất] -> SCR-10` · `SCR-11 -> [409 đã được xử lý] -> SCR-10 (tải lại)`

---

## UC-04 — Gọi thanh toán & thu tiền tại bàn, in bill

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST (gọi thanh toán), ACT-STAFF (thu tiền) |
| Actor phụ | EXT-PRINTER; ACT-LEAD / ACT-ADMIN (duyệt giảm tay vượt ngưỡng) |
| Story | `US-005-*`, `US-006-*`, `US-018-*`, `US-022-*`, `US-047-3` |
| FEATURE | [F-005](../chức-năng/FEATURE-005.md), [F-006](../chức-năng/FEATURE-006.md); liên quan [F-018](../chức-năng/FEATURE-018.md) (ca mở), [F-022](../chức-năng/FEATURE-022.md) (giảm tay), [F-047](../chức-năng/FEATURE-047.md) (khối thẻ trên bill); hội viên / voucher / đổi thưởng → UC-10; bàn đã chia bill → UC-06 |
| Tiền điều kiện | Phiên `OPEN` / `PAYMENT_REQUESTED` có ≥ 1 đơn không hủy; quầy đã mở ca; phiên chưa chia bill |
| Kích hoạt | Khách bấm **Gọi thanh toán** ở SCR-05 (hoặc quầy chủ động chọn bàn ở danh sách "Bàn đang phục vụ") |
| Luồng chính | **1.** Khách bấm Gọi thanh toán → hộp xác nhận SCR-04 "Gọi nhân viên ra thu tiền 125.000đ (tiền mặt)?" liệt kê đơn → Xác nhận. **2.** `POST /api/sessions/{id}/request-payment` → phiên `PAYMENT_REQUESTED`; phát `session.payment_requested` → POS phát chuông riêng, thẻ ở dải "Gọi thanh toán" ≤ 2 s (AC-005-01). **3.** SCR-05 hiện "Đã gọi thanh toán · Nhân viên sẽ đến bàn trong giây lát" + đồng hồ chờ. **4.** Nhân viên nhấp thẻ → drawer Thu tiền bàn SCR-14: đơn + món, tổng phải thu do server tính (`settle/preview`); có thể **In tạm tính**. **5.** Ra bàn thu tiền mặt, nhập Tiền khách đưa → tiền thừa. **6.** Bấm **Đã thu tiền & In bill** → `POST /api/sessions/{id}/settle` (kèm `expectedAmountDue`): `sp_SettleSession` khóa phiên, kiểm không còn đơn `PENDING`, đóng phiên, mọi đơn không hủy → `PAID`, ghi một `Payments(CASH)` gắn ca đang mở; hội viên / voucher / đổi thưởng / tích điểm trong cùng transaction. **7.** Phát `session.settled`; POS mở trang in SCR-12 (khổ 58 / 80 mm); bàn biến khỏi danh sách; khách thấy "Cảm ơn, đã thanh toán" |
| Luồng thay thế | **A1.** Bấm Gọi thanh toán lần nữa → `200`, cập nhật thời gian gọi, phát lại sự kiện; POS vẫn một thẻ (BR-018, AC-005-04); UI cho "Gọi lại" sau 2 phút (PROPOSED). **A2.** Quá 5 phút chưa được thu → "Nhân viên đang bận, bạn có thể ra quầy thanh toán" + nút Gọi lại. **A3.** Khách gọi thêm món sau khi gọi thanh toán → phiên về `OPEN` (UC-02 A4). **A4.** Quầy thu khi khách chưa gọi thanh toán (khách ra quầy trả) — Q-009, PROPOSED. **A5.** Còn đơn `PENDING` → Tiếp nhận / Hủy ngay trong drawer rồi thu. **A6.** Giảm giá tay có lý do; vượt ngưỡng người thao tác → trưởng ca / quản lý nhập tài khoản (BR-027, BR-045); hội viên, voucher, đổi thưởng → UC-10. **A7.** Phiên có đơn `PREPARING` chưa xong → vẫn thu; đơn hoàn tất sau như thường. **A8.** Phiên không có đơn nào khác `CANCELLED` → **Đóng bàn trống** (`POST /api/sessions/{id}/close`), không tạo lượt thu (Q-018). **A9.** In lại bill bao nhiêu lần cũng được; bill có hội viên in khối "THẺ THÀNH VIÊN (lúc in)" (BR-073) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Khách gọi thanh toán khi phiên chưa có đơn | Nút ẩn; gọi API → `409 NO_ORDERS`, trạng thái phiên không đổi (AC-005-02) |
| E2 | Khách gọi thanh toán khi phiên đã đóng | `409 SESSION_CLOSED`, không phát sự kiện (AC-005-03) |
| E3 | Client phiên khác gọi với `sessionId` này | `403` (AC-005-05) |
| E4 | Hai máy cùng bấm "Đã thu tiền" | Máy sau `409 ALREADY_SETTLED` "Phiên này đã được thu tiền"; chỉ một `Payments` (AC-006-02) |
| E5 | Tiền khách đưa < phải thu | `400 INSUFFICIENT_AMOUNT` (không hỗ trợ trả thiếu / nợ — PROPOSED) |
| E6 | Còn đơn `PENDING` | `409 HAS_PENDING_ORDERS { orderIds }`; không đổi gì (BR-019, AC-006-03) |
| E7 | Phiên chỉ còn đơn đã hủy | `409 NO_ORDERS` → dùng Đóng bàn trống (Q-018) |
| E8 | Chưa mở ca | `409 NO_OPEN_SHIFT` (BR-026, AC-018-01) |
| E9 | Số tiền POS đang hiển thị lệch số server tính | `409 AMOUNT_CHANGED` |
| E10 | Bàn đã chia bill | `409 SESSION_HAS_SPLITS` → thu từng phần (UC-06) |
| E11 | Giảm tay vượt ngưỡng không có người duyệt / người duyệt sai hoặc không đủ vai | `403 ADMIN_APPROVAL_REQUIRED` / `403 ADMIN_APPROVAL_INVALID`; thiếu lý do giảm → `400` (AC-022-02, AC-022-03) |
| E12 | Khách / không token gọi `settle`; nhân viên bị khóa | `401`; tài khoản khóa → `403` (BR-007, AC-006-05) |
| E13 | Đóng bàn trống khi phiên còn đơn | `409 HAS_ORDERS` |
| E14 | In bill chính thức (`mode=final`) khi chưa thu | `409 UNPAID` (BR-014) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Sessions` | Gọi thanh toán: `PAYMENT_REQUESTED`, `PaymentRequestedAt`; thu xong: `CLOSED` |
| `Orders` | Mọi đơn không hủy: `PaymentStatus = PAID`, `PaidAt`, `PaymentMethod = CASH` |
| `Payments` | +1 dòng: `AmountDue`, `AmountReceived`, `ChangeGiven`, `ReceivedBy`, `ShiftId`, breakdown (khuyến mãi, hội viên, voucher, đổi thưởng, giảm tay, làm tròn), `ApprovedBy` |
| Hội viên | Như UC-10 (tổng chi, hạng, điểm, tem, voucher) |

- **Log cần ghi:** realtime `session.payment_requested`, `session.payment_cancelled`, `session.settled`, `member.vouchers_issued` (khi tặng voucher giới thiệu). Nhật ký thao tác: **thu tiền phiên** (BR-055).
- **BR liên quan:** BR-007, BR-014, BR-018, BR-019, BR-021, BR-022, BR-026, BR-027, BR-045, BR-057, BR-073.
- **User Flow:** `SCR-05 -> SCR-04 -> [Xác nhận] -> SCR-05 (đã gọi, đồng hồ chờ)` · `SCR-10 (dải Gọi thanh toán) -> SCR-14 -> [còn PENDING? ca mở? đủ tiền?] -> SCR-12 -> SCR-10` · `SCR-05 -> [session.settled] -> SCR-05 ("Cảm ơn, đã thanh toán")`

---

## UC-05 — Bán mang đi

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (ACT-LEAD, ACT-ADMIN) |
| Actor phụ | EXT-PRINTER; ACT-MEMBER (nếu khách là hội viên) |
| Story | `US-008-*`, `US-045-*` |
| FEATURE | [F-008](../chức-năng/FEATURE-008.md); liên quan [F-013](../chức-năng/FEATURE-013.md), [F-015](../chức-năng/FEATURE-015.md), [F-022](../chức-năng/FEATURE-022.md), [F-040](../chức-năng/FEATURE-040.md), [F-045](../chức-năng/FEATURE-045.md); hội viên / voucher / đổi thưởng → UC-10 |
| Tiền điều kiện | Đăng nhập; ca đang mở |
| Kích hoạt | Nhân viên mở mục **Bán mang đi** (SCR-13) trên thanh POS |
| Luồng chính | **1.** SCR-13: lưới món theo danh mục (chạm = +1), tab Combo, giỏ bên phải. **2.** Chọn món, tùy chọn, số lượng, ghi chú. **3.** (Tùy chọn) tra SĐT hội viên, voucher, đổi thưởng, giảm tay — breakdown do server tính (`takeaway/quote`). **4.** Nhập Tiền khách đưa (nút nhanh đủ tiền / 50k / 100k / 200k / 500k) → tiền thừa. **5.** Bấm **Thu tiền & In bill** → `POST /api/orders/takeaway`: trong một transaction tạo đơn `TAKE_AWAY` `PREPARING` / `PAID`, giữ kho, ghi `Payments(CASH)` gắn ca. **6.** Phát `order.created`; POS in bill (SCR-12, chế độ đơn); thẻ đơn vào cột Đang pha. **7.** Pha xong → Hoàn tất (UC-03), trừ kho (AC-008-04) |
| Luồng thay thế | **A1.** Hội viên: thẻ "Lần trước … gọi" + **Gọi lại** (F-045). **A2.** Món ngoài lịch thực đơn có nhãn "Ngoài lịch", vẫn bán (BR-034). **A3.** Quán tạm ngưng nhận đơn QR → mang đi vẫn bán (BR-030). **A4.** Tab "Đơn mang đi hôm nay" để xem / in lại. **A5.** Khuyến mãi tranh lượt cuối mà thua → `AMOUNT_CHANGED`, quầy xem lại tổng (F-016) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Chưa nhập / thiếu tiền khách đưa | Client chặn, bôi đỏ ô, "Vui lòng nhập tiền khách đưa (tối thiểu 45.000đ)"; gọi thẳng API → `400 INSUFFICIENT_AMOUNT`; không tạo đơn (BR-006, AC-008-02) |
| E2 | Kho không đủ | `409 OUT_OF_STOCK`; không tạo đơn, không có `Payments` (AC-008-03) |
| E3 | Giỏ trống | Nút vô hiệu; server `400` |
| E4 | Chưa mở ca | `409 NO_OPEN_SHIFT` (BR-026) |
| E5 | Tổng tiền đổi so với lúc báo giá | `409 AMOUNT_CHANGED` |
| E6 | Giảm tay vượt ngưỡng / voucher / đổi thưởng lỗi | Như UC-04 E11 và UC-10 E8–E9 |
| E7 | Khách gọi `POST /api/orders/takeaway` | `401` (AC-008-05) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Orders` | +1 dòng `TAKE_AWAY`, `SessionId = NULL`, `CreatedBy`, `PREPARING`, `PAID` |
| `OrderItems` | Dòng món (+ combo, tùy chọn) |
| `Ingredients.ReservedQty` | Tăng (giữ kho); trừ thật khi Hoàn tất |
| `Payments` | +1 dòng (`OrderId`, `CASH`, `AmountReceived`, `ChangeGiven`, `ReceivedBy`, `ShiftId`) |

- **Log cần ghi:** realtime `order.created`; `member.vouchers_issued` (chỉ room `staff`). Nhật ký thao tác: **đơn mang đi** (BR-055).
- **BR liên quan:** BR-006, BR-009, BR-010, BR-021, BR-026, BR-030, BR-034, BR-057, BR-073.
- **User Flow:** `SCR-13 -> [đủ tiền, đủ kho, ca mở?] -> SCR-12 -> SCR-10 (cột Đang pha)` · `SCR-13 -> [400 / 409] -> SCR-13 (bôi đỏ / báo lỗi)`

---

## UC-06 — Chia bill thu từng phần

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST (mỗi điện thoại một phần), ACT-STAFF |
| Actor phụ | EXT-PRINTER |
| Story | `US-026-*` |
| FEATURE | [F-026](../chức-năng/FEATURE-026.md) |
| Tiền điều kiện | Phiên gộp `OPEN` / `PAYMENT_REQUESTED` có đơn; khi thu: ca đang mở, không còn đơn `PENDING` |
| Kích hoạt | Khách bấm **🧾 Chia bill theo người** ở SCR-05 (hoặc quầy bấm **+ Thêm phần** ở SCR-14) |
| Luồng chính | **1.** Khách tạo "phần của tôi" (đặt tên) → phần mới + phần **Chung** tự tạo. **2.** Khách chạm **Của tôi** / **Bỏ** trên dòng món; dòng chưa ai nhận thuộc Chung; dòng con combo đi theo dòng cha. **3.** Mọi máy nhận `session.split_changed`; thẻ "Bàn đang chia bill" ghi tạm tính từng phần. **4.** Quầy mở SCR-14 → danh sách phần → **Thu phần này** (hội viên / voucher / giảm tay chỉ áp cho phần đó). **5.** `POST /api/splits/{id}/settle`: một `Payments(SplitId)`, đánh dấu dòng đã thu, đơn đủ dòng → `PAID`; in bill riêng phần ("Phần: <tên>"). **6.** Thu phần cuối còn mở → tự gộp dòng Chung chưa thu, phiên `CLOSED`, phát `session.settled` (AC-026-02) |
| Luồng thay thế | **A1.** Quầy chuyển dòng bất kỳ chưa thu giữa các phần. **A2.** Thu phần Chung riêng khi còn phần khác mở. **A3.** **Thu chung**: chưa thu phần nào → bỏ chia, thu cả bàn như UC-04; đã thu ≥ 1 phần → dồn các phần còn mở về Chung để thu nốt. **A4.** In lại bill phần đã thu. **A5.** Hoàn tiền lượt thu của một phần → chỉ hoàn tiền, không hủy đơn (UC-07). **A6.** Bỏ món chưa thu ở phiên đã thu một phần → UC-09 (bỏ nốt món cuối → phiên tự đóng) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Khách gán / bỏ dòng không phải Chung, không phải của phần mình | `403` / `409 LINE_LOCKED` (BR-036) |
| E2 | Chuyển dòng thuộc phần đã thu | `409 SPLIT_PAID` |
| E3 | Hai máy cùng thu một phần | Một thành công, máy sau `409`; đúng một `Payments` (AC-026-04) |
| E4 | Thu cả bàn khi đã chia | `409 SESSION_HAS_SPLITS` (AC-026-05) |
| E5 | Phần cuối thiếu dòng Chung; thu phần Chung khi trống | `409 COMMON_REQUIRED`; `409 SPLIT_EMPTY` |
| E6 | Còn đơn `PENDING` | `409 HAS_PENDING_ORDERS` (BR-019) |
| E7 | Chưa mở ca / tổng lệch / thiếu tiền | `409 NO_OPEN_SHIFT` / `409 AMOUNT_CHANGED` / `400 INSUFFICIENT_AMOUNT` |
| E8 | Phiên đã đóng | `409 SESSION_CLOSED` |
| E9 | Lỗi đã biết: sheet chia bill vẽ lại làm mất chữ đang gõ ở ô "Tên phần" (tiền không sai) | Chưa sửa — [Q-023](../open-questions.md), task riêng |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `SessionSplits` | Phần mới + phần Chung (`IsCommon`); `Status` `OPEN` → `PAID`, `PaymentId` |
| `OrderItems` | `SplitId` (NULL = Chung), `PaidAt`, `PaymentId` |
| `Payments` | +1 dòng mỗi phần (`SplitId`) |
| `Orders` / `Sessions` | Đơn đủ dòng → `PAID`; hết dòng chưa thu → phiên `CLOSED` |

- **Log cần ghi:** realtime `session.split_changed`, `session.settled` (phần cuối), `member.vouchers_issued`. Nhật ký thao tác: **thu tiền phần** (BR-055).
- **BR liên quan:** BR-019, BR-026, BR-036, BR-037, BR-057, BR-073.
- **User Flow:** `SCR-05 (sheet Chia bill) -> [Của tôi / Bỏ] -> SCR-05 (tạm tính từng phần)` · `SCR-10 -> SCR-14 -> [phần cuối?] -> SCR-12 -> SCR-14 (còn phần) / SCR-10 (phiên đóng)`

---

## UC-07 — Hoàn tiền sau khi thu

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-LEAD, ACT-ADMIN; ACT-STAFF khi có trưởng ca / quản lý nhập tài khoản duyệt |
| Actor phụ | ACT-MEMBER (điểm / tem bị điều chỉnh) |
| Story | `US-019-*`, `US-036-*` |
| FEATURE | [F-019](../chức-năng/FEATURE-019.md); liên quan [F-036](../chức-năng/FEATURE-036.md) (quyền theo vai), [F-039](../chức-năng/FEATURE-039.md) (trừ / trả điểm, tem), [F-046](../chức-năng/FEATURE-046.md) (không hoàn kho hai lần), [F-026](../chức-năng/FEATURE-026.md) (lượt thu một phần) |
| Tiền điều kiện | Lượt thu thuộc **ngày thu tiền** hiện tại (giờ VN); có ca đang mở |
| Kích hoạt | Quầy → **Ca & hoàn tiền** (SCR-15) → nút **Hoàn tiền** trên một lượt thu |
| Luồng chính | **1.** Hộp thoại: số tiền (mặc định = phần còn lại), lý do (bắt buộc), chọn đơn bị hủy, "Hoàn kho cho món đã làm", ô tài khoản người duyệt. **2.** `POST /api/payments/{id}/refunds`; `sp_RefundPayment` khóa lượt thu, kiểm Σ hoàn ≤ đã thu. **3.** Hoàn đủ hoặc chọn đơn → đơn `VOIDED`: đơn chưa làm trả phần kho đang giữ; đơn đã làm + "hoàn kho" → `RESTOCK` đúng lượng đã trừ (mỗi đơn × nguyên liệu tối đa một lần). **4.** Tiền hoàn trừ vào ca đang mở; hội viên bị trừ `TotalSpent` (không hạ hạng), trừ điểm tích dư (không âm); hoàn toàn bộ → trả điểm / lượt quà đã đổi; đơn bị hủy → trừ tem của món đó. **5.** Phát `payment.refunded` (+ `order.status_changed` cho đơn `VOIDED`); doanh thu ngày giảm đúng (AC-019-01) |
| Luồng thay thế | **A1.** Hoàn một phần → đơn giữ nguyên. **A2.** Trưởng ca tự hoàn lượt thu của ca đang mở; tắt `manager.refund_same_shift_only` → hoàn mọi lượt trong ngày (BR-046). **A3.** Lượt thu của một phần chia bill → chỉ hoàn tiền, không hủy đơn. **A4.** Món đã bị xóa trước đó với "Hoàn kho" / "Ghi hủy hàng" (UC-09) → hoàn tiền không hoàn kho lần hai (BR-068). **A5.** Quản lý xem danh sách hoàn tiền (ai làm, ai duyệt) ở SCR-32 |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Hoàn lượt thu của ngày trước | `409 REFUND_WINDOW_EXPIRED` (BR-028, Q-020) |
| E2 | Tổng hoàn vượt số đã thu; hai lần hoàn đồng thời | `400 REFUND_EXCEEDS`; hoàn đồng thời → chỉ một thành công (AC-019-02, AC-019-04) |
| E3 | Nhân viên hoàn không có người duyệt | `403 ADMIN_APPROVAL_REQUIRED` (AC-019-02) |
| E4 | Trưởng ca hoàn lượt thu của ca khác | Cần quản lý nhập tài khoản duyệt (BR-046; mã lỗi riêng không ghi trong nguồn) |
| E5 | Gửi `orderIds` khi hoàn lượt thu của một phần chia bill | `400 INVALID_REFUND` |
| E6 | Thiếu lý do | `400` (BR-028) |
| E7 | Không có ca đang mở | `409 NO_OPEN_SHIFT` (BR-026) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Refunds` | +1 dòng (số tiền, lý do, người làm, người duyệt, `ShiftId`) |
| `Orders` | Đơn bị hủy: `Status = VOIDED`, `VoidedAt` |
| Kho | Trả `ReservedQty` (đơn chưa làm); `InventoryTransactions(RESTOCK)` + lô `RESTOCK` (đơn đã làm, chọn hoàn kho) |
| Hội viên | `Members.TotalSpent` giảm; `PointTransactions(REFUND)`; `StampEvents(REFUND)`; `RewardRedemptions.ReturnedAt`. Voucher đã dùng **không** được trả lại (Q-022 (6)) |

- **Log cần ghi:** nhật ký `payment.refund` có trước / sau (AC-035-03); realtime `payment.refunded`, `order.status_changed`.
- **BR liên quan:** BR-025, BR-026, BR-028, BR-046, BR-059, BR-068.
- **User Flow:** `SCR-15 -> [Hoàn tiền] -> [người làm cần duyệt?] -> nhập tài khoản trưởng ca / quản lý -> SCR-15 (lượt thu đã hoàn)` · quản lý: `SCR-32 (danh sách hoàn tiền)`

---

## UC-08 — Nhân viên mở bàn & gọi món tại bàn (gắn hội viên)

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (ACT-LEAD, ACT-ADMIN) |
| Actor phụ | ACT-GUEST (có thể quét QR gộp vào bàn); ACT-MEMBER (được gắn) |
| Story | `US-024-*`, `US-047-1` |
| FEATURE | [F-024](../chức-năng/FEATURE-024.md) (PROPOSED — Q-021), [F-047](../chức-năng/FEATURE-047.md) (D-36); liên quan [F-014](../chức-năng/FEATURE-014.md), [F-038](../chức-năng/FEATURE-038.md) |
| Tiền điều kiện | Đăng nhập; bàn đang bật. Gửi đơn **không** cần ca mở (chưa thu tiền) |
| Kích hoạt | Nhân viên chọn **Gọi món tại bàn** (SCR-16) hoặc nút Gọi món trên thẻ bàn ở SCR-10 |
| Luồng chính | **1.** SCR-16 hiện sơ đồ bàn: trống / xanh đang phục vụ / vàng gọi thanh toán, 📝 có ghi chú, số đỏ = món chưa gửi. **2.** Chọn bàn; (tùy chọn) nhập ghi chú bàn ≤ 200 ký tự. **3.** (Tùy chọn) khung **⭐ Hội viên**: nhập SĐT → **Tra cứu** → thấy tên đầy đủ · SĐT · mức ưu đãi → **Gắn vào bàn** (bàn trống: **Mở bàn & gắn**). **4.** Chọn món, tùy chọn, ghi chú món vào giỏ riêng của bàn. **5.** Bấm **Gửi đơn Bàn …** (kèm `Idempotency-Key`): bàn trống → mở phiên (khóa dòng bàn); đơn `DINE_IN` vào thẳng `PREPARING`, ghi `CreatedBy`, giữ kho như đơn QR. **6.** Phát `session.opened`, `order.created`, `session.member_changed`; danh sách "Đã gọi" + nút "Thu tiền bàn này" (→ UC-04) |
| Luồng thay thế | **A1.** SĐT chưa là hội viên → đăng ký nhanh: họ tên, SĐT người giới thiệu (không bắt buộc), tick "Khách đồng ý cho quán lưu SĐT + tên để tích lũy ưu đãi" → **Đăng ký & gắn vào bàn** / **Đăng ký & mở bàn & gắn**. **A2.** Phiên đã có hội viên → dòng "⭐ Tên · ưu đãi" + **Gỡ**; gắn số khác = thay. **A3.** Bàn đang có nhóm → chọn Nhóm n hoặc **+ Nhóm mới** (hóa đơn riêng). **A4.** Nhóm đang chọn vừa thu tiền / đóng ở máy khác → trang chuyển sang "Nhóm mới", không gộp nhầm. **A5.** Quán tạm ngưng nhận đơn QR, ngoài giờ bán hoặc ngoài lịch → nhân viên vẫn gửi được; món có nhãn "Ngoài lịch" (BR-031, AC-024-06). **A6.** Chỉ mở bàn kèm ghi chú, chưa gọi món ("Mở bàn & lưu ghi chú"). **A7.** Khách quét QR vào bàn này → UC-01 A4. **A8.** Bấm gửi hai lần cùng key trong 60 giây → trả lại cùng đơn |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Bàn không có / đang tắt | `404 TABLE_NOT_FOUND` |
| E2 | Bàn đang có nhóm mà không chọn "Nhóm mới"; hai máy cùng mở một bàn trống | `409 TABLE_OCCUPIED { sessions }`; đúng một phiên được tạo (AC-024-04, AC-024-05) |
| E3 | Gửi đơn / sửa ghi chú vào phiên đã đóng | `409 SESSION_CLOSED` (AC-024-07) |
| E4 | Kho, món, tùy chọn | `409 OUT_OF_STOCK`, `409 ITEM_UNAVAILABLE`, `400 INVALID_OPTIONS` (như UC-02) |
| E5 | Đăng ký hội viên chưa tick đồng ý | Giao diện chặn "Cần khách đồng ý trước khi đăng ký"; server `400 CONSENT_REQUIRED` (BR-071, AC-047-02) |
| E6 | SĐT sai định dạng; SĐT đã đăng ký | `400 INVALID_PHONE`; `409 PHONE_EXISTS` |
| E7 | SĐT người giới thiệu không phải hội viên; tự giới thiệu; quá 5 lượt / tháng | `404 REFERRER_NOT_FOUND`; `400 SELF_REFERRAL`; `409 REFERRAL_LIMIT` (BR-060) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Sessions` | +1 dòng `OPEN` (`OpenedBy`, `Note`, `NoteUpdatedAt`, `NoteUpdatedBy`); `MemberId` khi gắn hội viên |
| `Orders`, `OrderItems` | Đơn `DINE_IN`, `PREPARING`, `AcceptedAt` = lúc gửi, `CreatedBy`, `UNPAID` |
| `Ingredients.ReservedQty` | Tăng như đơn QR (ADR-001) |
| `Members` | +1 khi đăng ký (`ConsentAt`, `ReferredByMemberId`) |

- **Log cần ghi:** realtime `session.opened`, `order.created`, `session.note_changed` (**chỉ** room `staff`), `session.member_changed` (chỉ tên che). Nhật ký thao tác: không thuộc danh sách BR-055 (gọi món thường); dấu vết nằm ở `OpenedBy`, `CreatedBy`, `NoteUpdatedBy`.
- **BR liên quan:** BR-010, BR-024, BR-031, BR-032, BR-060, BR-071.
- **User Flow:** `SCR-16 -> [bàn trống / đang có nhóm?] -> (chọn nhóm / + Nhóm mới) -> [Gửi đơn] -> SCR-16 (Đã gọi) -> SCR-14` · `SCR-16 (⭐ Hội viên) -> [SĐT đã là hội viên?] -> Gắn / Đăng ký (có đồng ý) -> SCR-16`

---

## UC-09 — Sửa / xóa món, xóa đơn, hủy bàn

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF, ACT-LEAD, ACT-ADMIN |
| Actor phụ | ACT-GUEST (chỉ thấy đơn / tổng cập nhật) |
| Story | `US-046-1`, `US-046-2`, `US-046-3` |
| FEATURE | [F-046](../chức-năng/FEATURE-046.md) ([ADR-007](../quyết-định/ADR-007-sua-xoa-mon-huy-ban.md)) |
| Tiền điều kiện | Đơn **tại bàn chưa thu** ở `PENDING` / `PREPARING` / `COMPLETED`, phiên chưa đóng. Hủy bàn: phiên chưa có lượt thu |
| Kích hoạt | Nhân viên bấm **✎** trên dòng món, **Xóa đơn**, hoặc **Hủy bàn** trong drawer Thu tiền bàn (SCR-14) |
| Luồng chính | **1.** Bấm ✎ → hộp thoại **Sửa món — <tên>**: mã đơn, trạng thái, "đang gọi N × đơn giá". **2.** Nhập số lượng mới (< N; 0 = xóa món) và lý do bắt buộc (≤ 200 ký tự, có chip lý do nhanh). **3.** Đơn đã pha xong: chọn **Ghi hủy hàng** (mặc định) hoặc **Hoàn kho**. **4.** Nhân viên sửa đơn đã tiếp nhận / đã pha: nhập tài khoản + mật khẩu trưởng ca / quản lý. **5.** `POST /api/order-items/{id}/void`: SP khóa Sessions → Orders → Ingredients, kiểm lại trạng thái lúc ghi, giảm / xóa dòng (kèm dòng con combo, tùy chọn, lượt dùng khuyến mãi dòng), xử lý kho (`RELEASE` / `WASTE` / `RESTOCK`), tính lại tổng đơn, khuyến mãi đơn, giá vốn dòng, ghi `OrderItemVoids`. **6.** Phát `order.status_changed` (đơn hết dòng → `order.cancelled`); toast "Đã sửa … · đơn còn …"; mục **Đã sửa / xóa món (n)** cập nhật |
| Luồng thay thế | **A1.** **Xóa đơn** đã tiếp nhận / đã pha: `POST /api/orders/{id}/void` → `CANCELLED`, dòng giữ làm lịch sử, giá vốn dòng chuyển sang `CogsReduction`. Đơn chờ tiếp nhận vẫn dùng nút **Hủy** cũ (UC-03). **A2.** **Hủy bàn**: `POST /api/sessions/{id}/cancel` → mọi đơn chưa thu `CANCELLED`, kho theo BR-068, phiên `CLOSED` không tạo lượt thu, ghi `CancelledBy` + `CancelReason`; toast "Đã hủy Bàn … · N đơn", bàn trống lại (AC-046-05). **A3.** Trưởng ca / quản lý tự làm, không cần người duyệt. **A4.** Phiên đã thu một phần (chia bill) → bỏ từng món / đơn chưa thu; bỏ nốt món chưa thu cuối → đơn còn toàn dòng đã thu thành `PAID`, phiên tự đóng (`session.closed { sessionId, table }`). **A5.** Bỏ hết món mọi đơn ở phiên chưa thu → phiên vẫn mở, dùng "Đóng bàn trống" (Q-018). **A6.** Muốn tăng / thêm món → "Gọi thêm món" (UC-08) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Số lượng mới ≥ số đang gọi | `400 INVALID_QTY` (BR-066) |
| E2 | Thiếu lý do | `400 VALIDATION_ERROR` (AC-046-02) |
| E3 | Nhân viên sửa đơn `PREPARING` / `COMPLETED` không kèm người duyệt; hoặc đơn vừa được tiếp nhận đúng lúc bấm | `403 ADMIN_APPROVAL_REQUIRED` — ô tài khoản tự hiện, hộp thoại không đóng (BR-067, AC-046-02) |
| E4 | Mật khẩu sai hoặc tài khoản người duyệt là nhân viên khác | `403 ADMIN_APPROVAL_INVALID` |
| E5 | Hai máy cùng xóa một dòng | Máy sau `404 ITEM_NOT_FOUND`; lịch sử chỉ một dòng |
| E6 | Dòng đã thu (chia bill), đơn mang đi, đơn đã hủy / hoàn, phiên đã đóng | `409 ITEM_NOT_EDITABLE` → dùng Hoàn tiền (UC-07) (AC-046-06) |
| E7 | Xóa đơn có dòng đã thu | `409 ITEM_NOT_EDITABLE` → xóa từng món chưa thu |
| E8 | Hủy bàn khi phiên đã có lượt thu; phiên đã đóng; không tìm thấy | `409 SESSION_HAS_PAYMENTS`; `409 SESSION_CLOSED`; `404 NOT_FOUND` (BR-070) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `OrderItemVoids` | +1 dòng mỗi lần bỏ món: tên, SL bỏ, đơn giá, thành tiền, trạng thái đơn lúc đó, cách xử lý kho, `CogsReduction`, lý do, người làm, người duyệt |
| `OrderItems`, `Orders` | Giảm / xóa dòng; tổng, khuyến mãi đơn, giá vốn tính lại; đơn hết dòng / bị xóa → `CANCELLED` |
| `PromotionUsages` | Cập nhật / xóa theo dòng và khuyến mãi đơn |
| Kho | `RELEASE` (trả phần giữ) / `WasteLogs` gắn `VoidId` (ghi hủy, tồn không đổi) / `InventoryTransactions(VOID_BACK)` + lô `RESTOCK` (hoàn kho) |
| `Sessions` | Hủy bàn: `CLOSED`, `CancelledBy`, `CancelReason`, không có `Payments` |

- **Log cần ghi:** nhật ký `order.item-void` / `order.void` / `session.cancel` (không lưu mật khẩu người duyệt); realtime `order.status_changed`, `order.cancelled`, `session.closed` (`cancelled: true, reason` khi hủy bàn), có thể `menu.availability_changed`.
- **BR liên quan:** BR-013, BR-036, BR-055, BR-066, BR-067, BR-068, BR-069, BR-070.
- **User Flow:** `SCR-14 -> [✎ / Xóa đơn / Hủy bàn] -> hộp thoại Sửa món -> [đơn đã tiếp nhận và người làm là STAFF?] -> nhập tài khoản trưởng ca / quản lý -> SCR-14 (đã cập nhật) / SCR-10 (bàn đã hủy)`

---

## UC-10 — Hội viên: gắn SĐT, tích điểm / tem, đổi quà, voucher, giới thiệu, xem Thẻ thành viên

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST → ACT-MEMBER; ACT-STAFF (tra cứu, đăng ký nhanh, áp voucher, đổi thưởng khi thu tiền) |
| Actor phụ | ACT-ADMIN (hạng, quà, chương trình tem, voucher tay, ẩn danh, điều chỉnh điểm); EXT-PRINTER |
| Story | `US-014-*`, `US-038-*`, `US-039-*`, `US-045-*`, `US-047-2`, `US-047-3` |
| FEATURE | [F-014](../chức-năng/FEATURE-014.md), [F-038](../chức-năng/FEATURE-038.md), [F-039](../chức-năng/FEATURE-039.md), [F-045](../chức-năng/FEATURE-045.md), [F-047](../chức-năng/FEATURE-047.md); gắn ở Gọi món tại bàn → UC-08; voucher chiến dịch → UC-15 |
| Tiền điều kiện | Khách có phiên chưa đóng (UC-01); đăng ký mới chỉ khi khách đồng ý lưu SĐT + họ tên |
| Kích hoạt | Khách nhập SĐT ở ô "⭐ Nhập SĐT để nhận ưu đãi" (SCR-03 / SCR-05), hoặc nhân viên nhập SĐT ở khung Hội viên khi thu tiền (SCR-14 / SCR-13) |
| Luồng chính | **1.** Nhập SĐT → `POST /api/members/lookup` (chuẩn hóa `+84…`). **2.** Có → khách thấy tên che ("Nguyễn V. A.") → xác nhận → `POST /api/sessions/{id}/member`; phát `session.member_changed`. **3.** Chưa có → đăng ký: họ tên, SĐT người giới thiệu (không bắt buộc), tick đồng ý → `POST /api/members` → gắn. **4.** Ô hội viên hiện điểm, thẻ tem, số voucher (không mã); menu hiện "Lần trước bạn gọi … — Gọi lại", "Món yêu thích của bạn", nút ♡ / ♥. **5.** Khách mở **Xem thẻ thành viên ›** → `GET /api/sessions/{id}/member-card`: tên / SĐT che, hạng, % ưu đãi, điểm, ≤ 10 giao dịch điểm, thẻ tem, quà (đủ / còn thiếu N điểm), voucher còn dùng (giá trị, giảm tối đa, đơn tối thiểu, hạn, nguồn) — **không** mã (AC-047-03). **6.** Khi thu tiền (UC-04 / 05 / 06), quầy chọn voucher / nhập mã, chọn đổi thưởng; server tính theo thứ tự khuyến mãi → hội viên → voucher → đổi thưởng → giảm tay → làm tròn xuống 500đ. **7.** Trong cùng transaction lượt thu: cộng tổng chi, số lần ghé, tự nâng hạng (không hạ), +1 điểm / 10.000đ thực trả, + tem, trừ điểm / lượt quà, đánh dấu voucher đã dùng; lượt thu đầu ≥ 30.000đ của người được giới thiệu → 2 voucher 10 % / 30 ngày. **8.** Bill in "Tích +N điểm / tem" và khối "THẺ THÀNH VIÊN (lúc in)" (AC-047-05) |
| Luồng thay thế | **A1.** Gọi lại đơn: `POST /api/cart/replay` → giỏ theo giá hiện tại; dòng không hợp lệ vào `skipped[]` kèm lý do ("đang hết món", "không còn trên thực đơn lúc này", "tùy chọn đã thay đổi") (BR-033). **A2.** ♥ món yêu thích → lưu, hiện lại lần sau. **A3.** Gỡ hội viên khỏi phiên (`DELETE /api/sessions/{id}/member`). **A4.** Quầy (Bearer) dùng mọi hội viên, thấy tên đầy đủ, không bị giới hạn tần suất. **A5.** Voucher tay `QL…` (quản lý tạo): ai có mã dùng một lần. **A6.** Quản lý sửa hội viên / hạng, ẩn danh theo yêu cầu (xóa tên, băm SĐT, gỡ khỏi phiên mở, giữ thanh toán), điều chỉnh điểm có lý do (SCR-26, SCR-40). **A7.** Hoàn tiền → trừ / trả điểm, tem (UC-07) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | SĐT sai định dạng | `400 INVALID_PHONE` (AC-014-04) |
| E2 | Khách tra cứu vượt 10 lần / phút / IP hoặc 20 lần / phút / thiết bị | `429 RATE_LIMITED` (BR-024, AC-014-04) |
| E3 | Đăng ký không tick đồng ý; SĐT đã đăng ký | `400 CONSENT_REQUIRED`; `409 PHONE_EXISTS` |
| E4 | Khách gắn hội viên vào phiên không phải của mình | `403` |
| E5 | Người giới thiệu không có / tự giới thiệu / quá 5 lượt tháng | `404 REFERRER_NOT_FOUND` / `400 SELF_REFERRAL` / `409 REFERRAL_LIMIT` (BR-060) |
| E6 | Gọi lại / ♥ / xem với hội viên không gắn vào phiên của chính điện thoại | `403` (BR-033, AC-045-03) |
| E7 | Thẻ thành viên: thiết bị không thuộc phiên; phiên chưa gắn hội viên; phiên đã đóng; phiên không có | `403`; `404 NO_MEMBER`; `409 SESSION_CLOSED`; `404 NOT_FOUND` (BR-072, AC-047-04) |
| E8 | Voucher: mã sai; đã dùng; hết hạn; của hội viên khác; chưa đạt đơn tối thiểu; hai quầy cùng dùng một mã | `404 VOUCHER_NOT_FOUND`; `409 VOUCHER_USED` / `VOUCHER_EXPIRED` / `VOUCHER_NOT_OWNER` / `VOUCHER_MIN_ORDER`; `409 VOUCHER_UNAVAILABLE` (BR-061) |
| E9 | Đổi thưởng: không có hội viên; dùng cùng giảm tay; thiếu điểm / hai quầy cùng đổi; hết lượt tem; món quà không có trên bill | `400 MEMBER_REQUIRED`; `400 REWARD_WITH_MANUAL`; `409 POINTS_INSUFFICIENT`; `409 STAMP_REWARD_UNAVAILABLE`; `409 REWARD_ITEM_NOT_IN_BILL` (BR-059) |
| E10 | Quản lý điều chỉnh điểm làm âm | `409` (BR-059) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Members` | Đăng ký: `ConsentAt`, `ReferredByMemberId`; thu tiền: `TotalSpent`, `VisitCount`, hạng, `Points`, `ReferralRewardedAt` |
| `Sessions.MemberId` / `Orders.MemberId` | Gắn / gỡ hội viên |
| `MemberFavorites` | ♥ / bỏ ♥ |
| `PointTransactions`, `StampCards`, `StampEvents`, `RewardRedemptions` | `EARN` (tối đa một / lượt thu), `REDEEM`, `ADJUST`; tem, lượt quà |
| `Vouchers` | Đánh dấu đã dùng (`UsedAt`, `UsedPaymentId`); +2 voucher `REFERRAL` khi đủ điều kiện |
| `Payments` | `MemberId`, `VoucherId`, `VoucherDiscount`, `RewardDiscount`, `PointsEarned`, `StampsEarned` |

- **Log cần ghi:** realtime `session.member_changed` (chỉ tên che), `member.vouchers_issued` (room `staff` có mã; room phiên không mã); không có sự kiện cho tích điểm / đổi thưởng. Nhật ký thao tác: thu tiền (BR-055), thao tác quản lý dưới `/api/admin/*` (ẩn danh, điều chỉnh điểm `members.points`, voucher tay). SĐT / tên không ghi ra log; nhật ký chỉ giữ 3 số cuối SĐT.
- **BR liên quan:** BR-021, BR-024, BR-025, BR-033, BR-057, BR-058, BR-059, BR-060, BR-061, BR-071, BR-072, BR-073.
- **User Flow:** `SCR-03 / SCR-05 (ô hội viên) -> [SĐT đã là hội viên?] -> xác nhận tên che / đăng ký + đồng ý -> SCR-02 (Gọi lại, Món yêu thích) -> SCR-05 (sheet Thẻ thành viên)` · `SCR-14 / SCR-13 (khung Hội viên · voucher · đổi thưởng) -> [mã hợp lệ? đủ điểm?] -> SCR-12 (bill có khối Thẻ thành viên)`

---

## UC-11 — Mở / đóng ca và sổ quỹ

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (mở / đóng ca, ghi khoản — theo docs, lệch D-24: Q-022), ACT-LEAD (duyệt chi ≤ 2.000.000đ), ACT-ADMIN |
| Actor phụ | EXT-PRINTER (phiếu chốt ca) |
| Story | `US-018-*`, `US-033-*`, `US-036-*` |
| FEATURE | [F-018](../chức-năng/FEATURE-018.md), [F-033](../chức-năng/FEATURE-033.md); liên quan [F-036](../chức-năng/FEATURE-036.md), [F-035](../chức-năng/FEATURE-035.md) |
| Tiền điều kiện | Đăng nhập; mở ca: chưa có ca nào mở; ghi quỹ / đóng ca: có ca đang mở |
| Kích hoạt | Banner "Chưa mở ca — chưa nhận, xử lý đơn và thu tiền được" + nút Mở ca (SCR-10, F-055), hoặc mục **Ca & hoàn tiền** (SCR-15) |
| Luồng chính | **1.** Mở ca: nhập tiền đầu ca → `POST /api/shifts/open`; phát `shift.opened`; thanh trên hiện "Ca #n · từ hh:mm". **2.** Trong ca, thu bàn / mang đi / hoàn tiền gắn vào ca (UC-04, UC-05, UC-07). **3.** Sổ quỹ: **Chi tiền** / **Thu khác** → danh mục, số tiền > 0, lý do → `POST /api/cash-transactions`; mọi khoản thu và chi ≤ 500.000đ (danh mục không cần duyệt) → `APPROVED`; chi > 500.000đ hoặc danh mục "Khác (chi)" → `PENDING`, chưa trừ két. **4.** (Tùy chọn) gắn ảnh hóa đơn jpg / png / webp ≤ 2 MB. **5.** Trưởng ca / quản lý **Duyệt** / **Từ chối** (có lý do) khoản chờ. **6.** Đóng ca: đếm tiền → `POST /api/shifts/{id}/close`; tiền dự kiến = đầu ca + Σ thu bán − Σ hoàn + Σ thu khác đã duyệt − Σ chi đã duyệt; chênh lệch âm hiện đỏ; người đóng ca được chấm công ra. **7.** In phiếu chốt ca (theo nhân viên thu, giảm giá theo loại, hoàn tiền, bảng thu chi quỹ); phát `shift.closed` |
| Luồng thay thế | **A1.** Nhân viên đứng quầy duyệt khoản chờ bằng cách cho trưởng ca / quản lý nhập tài khoản. **A2.** Quản lý xem lịch sử ca (SCR-32), sổ quỹ tổng + lọc + **Xuất CSV**, quản lý danh mục thu chi (SCR-36); danh mục đã dùng → xóa thành "ngừng dùng" (ADR-004). **A3.** Thu tiền khi chưa mở ca → bị chặn (UC-04 E8) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Mở ca khi đã có ca mở | `409 SHIFT_ALREADY_OPEN` (AC-018-02) |
| E2 | Đóng ca đã đóng | `409 SHIFT_NOT_OPEN` |
| E3 | Ghi quỹ khi không có ca mở | `409 NO_OPEN_SHIFT` (BR-048) |
| E4 | Đóng ca khi còn khoản chi chờ duyệt | `409 CASH_PENDING` (BR-050, AC-033-02) |
| E5 | Danh mục không hợp lệ | `400 CASH_CATEGORY_INVALID` |
| E6 | Tự duyệt khoản do mình tạo (trừ quản lý); nhân viên duyệt; trưởng ca duyệt khoản > 2.000.000đ | `403 SELF_APPROVAL`; `403` (AC-033-02, AC-033-04) |
| E7 | Thiếu / sai tài khoản người duyệt khi nhân viên đứng quầy | `403 ADMIN_APPROVAL_REQUIRED` / `ADMIN_APPROVAL_INVALID` |
| E8 | Hai người cùng duyệt một khoản | Người sau `409 CASH_NOT_PENDING` (BR-049) |
| E9 | Ảnh > 2 MB; file không phải ảnh (kiểm chữ ký file) | `400 RECEIPT_TOO_LARGE`; `400 RECEIPT_INVALID` (BR-051, AC-033-03) |
| E10 | Từ chối khoản không ghi lý do | Bị chặn — bắt buộc lý do (BR-049; mã lỗi không ghi trong FEATURE-033) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Shifts` | Mở: `OpeningCash`; đóng: `ExpectedCash`, `CountedCash`, `Difference`, đóng ca (không sửa được nữa) |
| `CashTransactions` | +1 dòng mỗi khoản (`Status` `APPROVED` / `PENDING` / `REJECTED`, `ApprovedBy`, `RejectReason`, `ReceiptImagePath`) |
| `uploads/receipts/` | File ảnh hóa đơn |
| `Attendance` | `ClockOut` cho người đóng ca (BR-052) |

- **Log cần ghi:** realtime `shift.opened`, `shift.closed`, `cash.created`, `cash.reviewed`. Nhật ký thao tác: mở / đóng ca, sổ quỹ (tạo, duyệt, từ chối, gắn ảnh — ảnh chỉ ghi kích thước) (BR-055).
- **BR liên quan:** BR-026, BR-044, BR-048, BR-049, BR-050, BR-051, BR-052, BR-055.
- **User Flow:** `SCR-10 (banner Chưa mở ca) -> SCR-15 (Mở ca) -> SCR-10` · `SCR-15 (Chi tiền / Thu khác) -> [> 500.000đ hoặc cần duyệt?] -> chờ duyệt -> Duyệt / Từ chối -> SCR-15` · `SCR-15 (Đóng ca) -> [còn khoản chờ duyệt?] -> phiếu chốt ca (in)` · quản lý: `SCR-32`, `SCR-36`

---

## UC-12 — Chấm công, lịch làm

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF, ACT-LEAD (tự chấm khi đăng nhập; trưởng ca sửa trong ngày), ACT-ADMIN (sửa mọi ngày, lịch làm, năng suất) |
| Actor phụ | EXT-SCHEDULER (`attendance-autoclose`) |
| Story | `US-035-*` |
| FEATURE | [F-035](../chức-năng/FEATURE-035.md) |
| Tiền điều kiện | Tài khoản STAFF / MANAGER đang hoạt động (ADMIN không tự chấm — thêm tay nếu cần) |
| Kích hoạt | Đăng nhập POS (SCR-09); đăng xuất / đóng ca; trưởng ca / quản lý mở thẻ "Chấm công hôm nay" (SCR-15) hoặc **Nhân sự & chấm công** (SCR-37) |
| Luồng chính | **1.** Đăng nhập → `sp_ClockIn` tạo bản ghi mở nếu chưa có (đăng nhập đồng thời 5 lần vẫn một bản ghi — AC-035-01). **2.** Làm việc. **3.** Đăng xuất (`POST /api/auth/logout`) hoặc đóng ca → `ClockOut`. **4.** Quản lý lập lịch làm tuần ở SCR-37 (lưới người × ngày, kéo ca sang ô khác, + thêm ca, chép lịch tuần trước); hệ thống gắn trạng thái `ON_TIME` / `LATE` / `ABSENT` / `UPCOMING`. **5.** Quản lý xem năng suất: tiền thu, đơn hoàn tất, giờ làm, tiền thu / giờ |
| Luồng thay thế | **A1.** Quên đăng xuất: bản ghi mở quá 12 giờ → đóng tại `ClockIn + 12 giờ` khi đăng nhập lại; job `attendance-autoclose` (mỗi 15 phút) đóng tại `ClockIn + JWT_EXPIRES_IN`. **A2.** Sửa / thêm chấm công tay có lý do (trưởng ca: chỉ hôm nay; quản lý: mọi ngày). **A3.** Ca qua nửa đêm (giờ kết thúc < giờ bắt đầu). **A4.** Chép tuần bỏ qua ca đã có (cùng người, ngày, giờ bắt đầu) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Sửa / thêm chấm công thiếu lý do | `400` (AC-035-02) |
| E2 | Trưởng ca sửa / thêm bản ghi không phải hôm nay | `403 ATTENDANCE_NOT_TODAY` (BR-053) |
| E3 | Chồng giờ với bản ghi khác của cùng người | `409 ATTENDANCE_OVERLAP` |
| E4 | Một lần > 24 giờ hoặc ở tương lai | Bị từ chối (BR-053; mã lỗi không ghi trong FEATURE-035) |
| E5 | Nhân viên gọi API sửa chấm công / lịch làm | `403` (`attendance.edit`, `admin.all` — AC-036-01) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Attendance` | `ClockIn`, `ClockOut`, `Source` (`LOGIN` / `MANUAL`), `EditedBy`, `EditReason`, `EditedAt` |
| `Rosters` | Ca làm theo người × ngày |
| `JobRuns` | Lần chạy `attendance-autoclose` |

- **Log cần ghi:** nhật ký thao tác cho sửa chấm công và lịch làm (BR-053, BR-055); không có sự kiện realtime cho chấm công.
- **BR liên quan:** BR-052, BR-053, BR-054, BR-055.
- **User Flow:** `SCR-09 -> [đăng nhập = chấm công vào] -> SCR-10 -> [Đăng xuất / Đóng ca] -> chấm công ra` · `SCR-15 (Chấm công hôm nay) -> [bản ghi hôm nay?] -> Sửa / Thêm` · `SCR-37 (Chấm công · Lịch làm tuần · Năng suất)`

---

## UC-13 — Kho: nhập hàng / PO / kiểm kê / hao hụt / sơ chế / lô

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (sơ chế, hủy hàng, hủy lô, nhận hàng theo PO), ACT-LEAD (+ điều chỉnh, kiểm kê ở quầy), ACT-ADMIN (nguyên liệu, BOM, nhập kho, kiểm kê, đơn vị, công thức, lô, nhà cung cấp, PO, báo cáo) |
| Actor phụ | EXT-SCHEDULER (`demand-forecast`, `lot-expiry`, `runout-alert`); EXT-PRINTER (phiếu đặt hàng) |
| Story | `US-011-*`, `US-023-*`, `US-027-*`, `US-028-*`, `US-029-*`, `US-030-*`, `US-031-*`, `US-032-*`, `US-036-*` |
| FEATURE | [F-011](../chức-năng/FEATURE-011.md), [F-023](../chức-năng/FEATURE-023.md), [F-027](../chức-năng/FEATURE-027.md), [F-028](../chức-năng/FEATURE-028.md), [F-029](../chức-năng/FEATURE-029.md), [F-030](../chức-năng/FEATURE-030.md), [F-031](../chức-năng/FEATURE-031.md), [F-032](../chức-năng/FEATURE-032.md), [F-036](../chức-năng/FEATURE-036.md) |
| Tiền điều kiện | Đăng nhập đúng quyền; nguyên liệu tồn tại, chưa xóa |
| Kích hoạt | Quầy mở **Kho & sơ chế** (SCR-17); quản lý mở Kho nguyên liệu (SCR-23), Nhập kho & kiểm kê (SCR-31), Nhà cung cấp & đặt hàng (SCR-35); job 02:00 / 06:00 / 06:05 |
| Luồng chính (nhập hàng theo PO) | **1.** Quản lý xem **Đề xuất nhập hàng** (SCR-35): khả dụng, đang về, nhu cầu đến ngày giao, an toàn 20 %, đề xuất theo gói, ngày dự kiến hết. **2.** Tick dòng → **Tạo đơn đặt hàng từ dòng đã chọn** (mỗi nhà cung cấp một PO nháp). **3.** Sửa PO nháp → **Gửi & in** (in / PDF / chép gửi Zalo) → `SENT`. **4.** Hàng về: nhân viên ở SCR-17 → tab Nhận hàng → chọn PO, sửa thực nhận / giá / hạn dùng → **Nhập kho**. **5.** `sp_ReceiveStock` trong một transaction: quy đổi gói về đơn vị gốc, cộng tồn, giá vốn bình quân, tạo lô (nguyên liệu theo lô), lịch sử giá; PO → `PARTIAL` / `RECEIVED` (AC-030-01). **6.** Món "Hết món" tự bán lại khi đủ kho; phát `inventory.received` |
| Luồng thay thế | **A1.** Phiếu nhập kho không theo PO (SCR-31), có đơn vị đóng gói, hạn dùng, mã lô. **A2.** **Kiểm kê**: tạo phiếu nháp (chụp tồn) → nhập số đếm → chốt; chênh lệch theo tồn lúc chốt → `ADJUST` (trưởng ca ở SCR-17, quản lý ở SCR-31). **A3.** **Sơ chế**: chọn bán thành phẩm, số mẻ, xem trước đủ / thiếu + giá vốn → **Hoàn tất mẻ** (`PREP_OUT` / `PREP_IN` cân bằng giá trị). **A4.** **Hủy hàng**: nguyên liệu, số lượng, lý do (`SPILL` / `EXPIRED` / `QUALITY` / `OTHER`), ghi chú. **A5.** **Hủy lô** hết hạn → phiếu hủy `EXPIRED`, đóng lô. **A6.** Điều chỉnh tồn tay có lý do (trưởng ca qua `/api/ops/*`, quản lý qua `/api/admin/*`). **A7.** Quản lý cấu hình nguyên liệu, BOM, đơn vị quy đổi, công thức bán thành phẩm, theo lô, hao hụt định mức, AVG / FIFO; xem giá vốn thực tế, thất thoát (tô đỏ khi > 0 và > 2 % tiêu thụ). **A8.** Job: `demand-forecast` 02:00; `lot-expiry` 06:00 → `inventory.expiring` / `inventory.expired`; `runout-alert` 06:05 → `inventory.runout`. **A9.** Nhận vượt số đặt khi có xác nhận (`confirmOver`) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Sơ chế thiếu khả dụng đầu vào; chưa có công thức; thiếu lô | `409 PREP_SHORT` (kèm tên, không đổi gì); `404 NO_RECIPE`; `409 LOT_SHORT` (BR-039, AC-027-02) |
| E2 | Nguyên liệu đang trong phiếu kiểm kê nháp (điều chỉnh, sơ chế, hủy hàng) | `409 STOCKTAKE_LOCKED` (BR-030, AC-023-02) |
| E3 | Công thức vòng lặp / quá 3 cấp | `400 RECIPE_CYCLE` / `400 RECIPE_TOO_DEEP` (AC-027-03) |
| E4 | Hủy hàng, điều chỉnh hoặc số đếm thấp hơn phần đang giữ cho đơn | `409 BELOW_RESERVED` (kèm tên) (BR-040, AC-023-03) |
| E5 | Điều chỉnh làm tồn âm / không hợp lệ | Lỗi `NEGATIVE_STOCK` / `INVALID_ADJUSTMENT` (api-contract) |
| E6 | Nhận vượt số đặt; PO không ở `SENT` / `PARTIAL` | `409 OVER_RECEIPT` (trừ khi xác nhận); `409 PO_NOT_RECEIVABLE` (BR-042) |
| E7 | Sửa PO không còn nháp; hủy PO đã nhận; thao tác PO đã hủy | `409 PO_NOT_DRAFT`; `409 PO_HAS_RECEIPTS`; `409 PO_CANCELLED` |
| E8 | Không quy đổi được đơn vị; xóa đơn vị đang dùng | `400 UNIT_MISMATCH`; `409 IN_USE` (BR-038) |
| E9 | Chốt kiểm kê thiếu số đếm; chốt lại phiếu đã chốt | `400 STOCKTAKE_INCOMPLETE`; `409` |
| E10 | BOM định lượng ≤ 0 hoặc thiếu nguyên liệu | `400 VALIDATION_ERROR` "Định lượng không hợp lệ, phải lớn hơn 0"; BOM cũ giữ nguyên (BR-003, AC-011-02) |
| E11 | Xóa nguyên liệu đang trong BOM; đang giữ cho đơn; trùng tên nguyên liệu | `409 IN_USE` (kèm tên món); `409 HAS_RESERVED`; `409 DUPLICATE_NAME` |
| E12 | Nhân viên điều chỉnh / kiểm kê; trưởng ca gọi `/api/admin/*` | `403` (AC-036-05, BR-044) |
| E13 | Lý do hủy hàng ngoài danh sách | `400` |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Ingredients` | `StockQty`, `AvgCost`, `LastUnitCost`; `ReservedQty` không đổi khi nhập / sơ chế |
| `InventoryTransactions` | `IMPORT`, `ADJUST` (gồm "WASTE:…"), `PREP_OUT` / `PREP_IN` — có `UnitCost`, `CostAmount`, `LotId` |
| `StockReceipts` / `StockReceiptLines`, `Stocktakes` / `StocktakeLines`, `PrepBatches`, `WasteLogs` | Phiếu nhập, kiểm kê, mẻ sơ chế, phiếu hủy |
| `IngredientLots` | Lô mới (`RECEIPT` / `PREP` / `ADJUST`), trừ FEFO, đóng lô; Σ lô mở = tồn (BR-041) |
| `PurchaseOrders` / `PurchaseOrderLines`, `SupplierPriceHistory` | Trạng thái PO, `ReceivedBaseQty`, lịch sử giá |
| `DemandForecasts`, `JobRuns` | Dự báo 14 ngày; lần chạy job |

- **Log cần ghi:** realtime `inventory.received`, `inventory.prepared`, `inventory.low`, `inventory.expiring`, `inventory.expired`, `inventory.runout`, `menu.availability_changed`. Nhật ký thao tác: sơ chế, hủy hàng, hủy lô, nhận PO, điều chỉnh / kiểm kê của trưởng ca, mọi thao tác `/api/admin/*` (BR-055).
- **BR liên quan:** BR-001, BR-003, BR-010, BR-016, BR-030, BR-038, BR-039, BR-040, BR-041, BR-042, BR-043, BR-044.
- **User Flow:** `SCR-35 (Đề xuất nhập hàng) -> [tick dòng] -> SCR-35 (PO nháp -> Gửi & in) -> SCR-17 (Nhận hàng) -> [nhận vượt?] -> SCR-17 (đã nhập)` · `SCR-17 (Sơ chế / Hủy hàng / Hạn dùng / Tồn kho / Kiểm kê) -> [đủ khả dụng? đang kiểm kê?] -> SCR-17` · `SCR-23 -> SCR-24 (BOM)` · `SCR-31 (Nhập kho · Kiểm kê · Giá vốn · Thất thoát · Đơn vị)`

---

## UC-14 — Quản lý menu, BOM, tùy chọn, combo, khuyến mãi, lịch thực đơn

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-ADMIN |
| Actor phụ | ACT-GUEST (thấy menu mới), ACT-STAFF (bán theo menu) |
| Story | `US-010-*`, `US-011-*`, `US-013-*`, `US-015-*`, `US-016-*`, `US-017-*`, `US-020-*`, `US-040-*` |
| FEATURE | [F-010](../chức-năng/FEATURE-010.md), [F-011](../chức-năng/FEATURE-011.md) (BOM), [F-013](../chức-năng/FEATURE-013.md), [F-015](../chức-năng/FEATURE-015.md), [F-016](../chức-năng/FEATURE-016.md), [F-017](../chức-năng/FEATURE-017.md), [F-020](../chức-năng/FEATURE-020.md) (giờ bán), [F-040](../chức-năng/FEATURE-040.md) |
| Tiền điều kiện | Đăng nhập vai ADMIN |
| Kích hoạt | Quản lý mở Thực đơn (SCR-21), Bàn (SCR-22), BOM (SCR-24), Combo (SCR-27), Khuyến mãi (SCR-28), Gợi ý & ghim (SCR-29), Tùy chọn món (SCR-30), Lịch thực đơn & thời gian pha (SCR-34) |
| Luồng chính (thêm một món bán được) | **1.** Tạo / sửa danh mục (có giờ bán) và món (tên ≤ 100, giá ≥ 0, ảnh, thời gian pha chuẩn). **2.** Lưu BOM của món (thay toàn bộ, định lượng > 0, không trùng nguyên liệu). **3.** Gán nhóm tùy chọn (Min / Max, phụ thu, BOM cộng thêm). **4.** (Tùy chọn) tạo combo, khuyến mãi theo lịch, ghim gợi ý, lịch thực đơn Hiện / Ẩn (nút **Xem trước menu lúc…**). **5.** Lưu → phát `menu.updated` / `menu.availability_changed`; menu khách cập nhật (AC-010-01, AC-010-02) |
| Luồng thay thế | **A1.** Bật / tắt "còn bán" nhanh → khách đang mở menu thấy "Hết món" không cần tải lại. **A2.** Bàn: tạo bàn → sinh `qrToken` + ảnh QR; **Tạo lại QR** làm QR cũ hết hiệu lực; **In QR** (lưới QR). **A3.** Xóa (ADR-004): chưa có lịch sử → xóa hẳn; đã có → xóa mềm, vẫn giữ cho báo cáo. **A4.** Giờ bán danh mục được đồng bộ thành lịch "Giờ bán — …" (chỉ sửa ở SCR-21). **A5.** Đổi giá / phụ thu / khuyến mãi sau khi đã có đơn → đơn cũ giữ nguyên (BR-011, BR-022, AC-013-03) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Nhân viên / trưởng ca gọi `/api/admin/*`; khách không token | `403`; `401` (AC-010-05, BR-044) |
| E2 | BOM định lượng ≤ 0 / thiếu nguyên liệu | `400 VALIDATION_ERROR` "Định lượng không hợp lệ, phải lớn hơn 0"; BOM cũ giữ nguyên (BR-003) |
| E3 | Đặt BOM cho combo; combo lồng combo | `400 COMBO_HAS_NO_BOM`; `400 COMBO_INVALID` (BR-029) |
| E4 | Xóa món đang là thành phần combo; xóa danh mục còn món; xóa bàn đang có khách | `409 IN_COMBO` (kèm tên combo); `409 HAS_ITEMS`; `409 TABLE_BUSY` |
| E5 | Trùng mã bàn | `409 DUPLICATE_CODE` |
| E6 | Sửa / xóa lịch "Giờ bán — …" ở trang Lịch thực đơn | Không cho phép — chỉ sửa ở Thực đơn (F-040) |
| E7 | Khách quét QR cũ sau khi tạo lại | `404` (UC-01 E1) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Categories`, `MenuItems` | Món, danh mục, `IsAvailable`, `PrepSeconds`, `IsPinned`, `SellFrom` / `SellTo`, `DeletedAt` |
| `Tables` | `qrToken` mới khi tạo / tạo lại QR |
| `BomItems` | Thay toàn bộ BOM của món |
| `ModifierGroups`, `ModifierOptions`, `ModifierOptionBom`, `MenuItemModifierGroups` | Nhóm tùy chọn và gán món |
| `ComboComponents`, `Promotions`, `PromotionTargets`, `MenuSchedules`, `MenuScheduleItems`, `Settings` (`suggestion.*`) | Combo, khuyến mãi, lịch thực đơn, cấu hình gợi ý |

- **Log cần ghi:** nhật ký thao tác mọi `POST` / `PUT` / `PATCH` / `DELETE` dưới `/api/admin/*` (BR-055); realtime `menu.updated`, `menu.availability_changed`.
- **BR liên quan:** BR-003, BR-011, BR-022, BR-023, BR-029, BR-030, BR-034, BR-044, BR-055.
- **User Flow:** `SCR-21 -> SCR-24 (BOM) -> [định lượng > 0?] -> SCR-21` · `SCR-21 / SCR-30 / SCR-27 / SCR-28 / SCR-29 / SCR-34 -> [Lưu] -> SCR-02 (khách thấy menu mới)` · `SCR-22 -> [Tạo lại QR] -> In QR`

---

## UC-15 — Chiến dịch marketing

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-ADMIN |
| Actor phụ | EXT-SCHEDULER (`campaigns-due`), EXT-ZALO (khi có token), ACT-MEMBER (người nhận) |
| Story | `US-037-*` |
| FEATURE | [F-037](../chức-năng/FEATURE-037.md); liên quan [F-038](../chức-năng/FEATURE-038.md) (voucher `CD…`), [F-047](../chức-năng/FEATURE-047.md) (voucher hiện trên Thẻ thành viên kèm tên chiến dịch) |
| Tiền điều kiện | Đăng nhập vai ADMIN; có hội viên; kênh `ZALO_OA` cần `ZALO_OA_TOKEN` |
| Kích hoạt | Quản lý mở **Tích điểm, voucher & chiến dịch** → tab **Phân khúc & chiến dịch** (SCR-40) |
| Luồng chính | **1.** Tạo phân khúc = AND các điều kiện (hạng, ngày ghé cuối, số lần ghé, tổng chi, tháng sinh, điểm) → **Xem trước số người** (số người, số bị loại vì từ chối nhận tin, số vừa nhận tin, 20 người mẫu đã che). **2.** Tạo chiến dịch: nội dung có `{name}` `{voucher}` `{expires}`, voucher riêng, kênh (mặc định `EXPORT`), hẹn giờ (tùy chọn). **3.** **Chạy ngay** (hoặc job `campaigns-due` mỗi 5 phút khi đến giờ) → một tiến trình giành quyền chạy (`RUNNING`). **4.** Mỗi hội viên một bản ghi gửi: đã nhận tin trong 7 ngày → `SKIPPED` kèm lý do, không voucher; còn lại → voucher riêng `CD…` + `EXPORTED` (hoặc `SENT` qua Zalo OA), cập nhật `LastContactedAt`. **5.** Chiến dịch `DONE`; tab "Kết quả": voucher đã dùng, doanh thu, khách quay lại trong 14 ngày; **Tải danh sách CSV** (SĐT đầy đủ chỉ có trong file) |
| Luồng thay thế | **A1.** Kênh `ZALO_OA` → gửi qua EXT-ZALO; gửi lỗi từng người → `FAILED`, không voucher (AC-037-04). **A2.** Đặt "Khách từ chối nhận tin chiến dịch (opt-out)" ở hồ sơ hội viên (SCR-26). **A3.** Sửa / xóa chiến dịch khi còn `DRAFT` / `SCHEDULED` |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Điều kiện phân khúc lạ | `400` (BR-062) |
| E2 | Xóa phân khúc đang được chiến dịch dùng | `409 IN_USE` |
| E3 | Sửa / xóa chiến dịch đã chạy; chạy lại chiến dịch đã chạy | `409 CAMPAIGN_LOCKED`; `409 CAMPAIGN_NOT_RUNNABLE` |
| E4 | Kênh `ZALO_OA` chưa có token; kênh `SMS` | `400 CHANNEL_NOT_CONFIGURED`; `400 CHANNEL_NOT_SUPPORTED` |
| E5 | Lỗi trong khi chạy | Chiến dịch `FAILED`, ghi `Error` |
| E6 | Nhân viên / trưởng ca gọi API chiến dịch | `403` (BR-044) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Segments`, `Campaigns` | Phân khúc; chiến dịch `DRAFT` / `SCHEDULED` → `RUNNING` → `DONE` / `FAILED` |
| `CampaignDeliveries` | Một bản ghi / hội viên: `EXPORTED` / `SENT` / `SKIPPED` / `FAILED` |
| `Vouchers` | Voucher `CAMPAIGN` (`CampaignId`) cho người nhận |
| `Members` | `LastContactedAt`; `OptOut` |

- **Log cần ghi:** nhật ký mọi thao tác `/api/admin/*` và `campaigns.export` mỗi lần tải CSV (BR-062); không có sự kiện realtime cho chiến dịch.
- **BR liên quan:** BR-061, BR-062.
- **User Flow:** `SCR-40 (Phân khúc) -> [Xem trước số người] -> SCR-40 (Chiến dịch) -> [Chạy ngay / hẹn giờ] -> SCR-40 (Kết quả) -> Tải CSV`

---

## UC-16 — Báo cáo, lãi lỗ, phân tích, dashboard Hôm nay

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-ADMIN |
| Actor phụ | ACT-LEAD (dashboard bản rút gọn), EXT-SCHEDULER (`daily-summary`) |
| Story | `US-012-*`, `US-034-*`, `US-041-*`, `US-042-*`, `US-043-*` |
| FEATURE | [F-012](../chức-năng/FEATURE-012.md), [F-034](../chức-năng/FEATURE-034.md), [F-041](../chức-năng/FEATURE-041.md), [F-042](../chức-năng/FEATURE-042.md), [F-043](../chức-năng/FEATURE-043.md); báo cáo giá vốn / thất thoát → UC-13 |
| Tiền điều kiện | Đăng nhập vai ADMIN (dashboard "Hôm nay": ADMIN hoặc MANAGER) |
| Kích hoạt | Quản lý mở **Hôm nay** (SCR-42, mục đầu thanh bên), **Báo cáo** (SCR-25), **Lãi / lỗ** (SCR-39), **Phân tích & menu engineering** (SCR-41); trưởng ca bấm "Hôm nay" trên thanh quầy |
| Luồng chính | **1.** SCR-42 đọc `GET /api/dashboard/today` (dòng tổng hợp hôm qua do job `daily-summary` 00:30 tính sẵn; thiếu thì tính một lần rồi lưu): doanh thu hôm qua (so cùng thứ tuần trước), lệch két ca gần nhất, kho cần chú ý, top 3 món, hội viên mới + voucher đã dùng; **Việc cần làm**: chi quỹ chờ duyệt, PO đến hạn nhận, lô hết hạn còn hàng, kiểm kê quá 7 ngày. **2.** Bấm việc cần làm → màn xử lý tương ứng. **3.** Báo cáo SCR-25: chọn khoảng ngày (Hôm nay / 7 ngày / Tháng này) → doanh thu theo ngày thu, số hóa đơn, top món, theo giờ, theo nhân viên, nguyên liệu sắp hết; tab Lịch sử đơn (lọc, xem, in lại); tab Marketing. **4.** Lãi / lỗ SCR-39 (nhãn "Ước tính"): doanh thu thuần, giá vốn, lãi gộp, chi quỹ, cố định phân bổ, lợi nhuận, hòa vốn / ngày; quản lý chi phí cố định. **5.** Phân tích SCR-41: menu engineering (Ngôi sao / Ngựa kéo / Câu đố / DOG / Chưa đủ dữ liệu) → **Ghim món này** / **Tạo khuyến mãi**; giờ cao điểm 7 × 24; dự báo doanh thu 7 ngày; so sánh kỳ; theo bàn |
| Luồng thay thế | **A1.** **Tính lại hôm nay** (`POST /api/dashboard/recompute`). **A2.** Trưởng ca: bản rút gọn — **server** bỏ giá vốn, lãi gộp, tổng tiền chi chờ duyệt (AC-043-02). **A3.** Quản lý chạy job thủ công (`POST /api/admin/jobs/{name}/run`). **A4.** Đơn chưa có giá vốn chốt → ước tính, có cờ (`estimatedCogsRows`). **A5.** Mở trên điện thoại ≤ 400 px không cuộn ngang (AC-043-03) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | `from > to` hoặc `to` sau hôm nay | Nút Xem vô hiệu, "Khoảng thời gian không hợp lệ"; server `400 INVALID_RANGE` (BR-005, AC-012-02) |
| E2 | Nhân viên mở `/admin/today`; nhân viên / trưởng ca mở `/admin/*` khác | `403` / chuyển về quầy; trang khác → `/pos?denied=admin`, API `403` (BR-044, BR-065, AC-034-04, AC-041-03) |
| E3 | Món bán < 5 lần trong kỳ | "Chưa đủ dữ liệu" (`INSUFFICIENT`) (BR-063) |
| E4 | Kỳ trước = 0; lãi gộp ≤ 0 | Không tính %; không tính hòa vốn (BR-056, BR-064) |
| E5 | Chi phí cố định có ngày kết thúc trước ngày bắt đầu | `400` |
| E6 | Nguyên liệu chưa có lịch sử tiêu thụ | Dự báo nhập: "Không đủ dữ liệu", không đề xuất (BR-043) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| Báo cáo | Chỉ đọc |
| `DailySummaries` | Job / tính lại — `MERGE` theo ngày, chạy lại không nhân đôi (AC-043-04) |
| `MenuItems.IsPinned` | Khi bấm "Ghim món này" |
| `FixedCosts`, `JobRuns` | Chi phí cố định; lần chạy job |

- **Log cần ghi:** nhật ký `jobs.run`, ghim món, chi phí cố định (thao tác `/api/admin/*`); không có sự kiện realtime cho dashboard.
- **BR liên quan:** BR-005, BR-056, BR-063, BR-064, BR-065.
- **User Flow:** `SCR-42 -> [Việc cần làm] -> SCR-36 / SCR-35 / SCR-17` · `SCR-25 -> [khoảng ngày hợp lệ?] -> SCR-25 (biểu đồ, Lịch sử đơn) -> SCR-12 (in lại)` · `SCR-41 (Menu engineering) -> [Ghim / Tạo khuyến mãi] -> SCR-29 / SCR-28` · `SCR-39`

---

## UC-17 — Tài khoản, phân quyền, nhật ký thao tác

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-ADMIN |
| Actor phụ | ACT-STAFF, ACT-LEAD (đăng nhập) |
| Story | `US-009-*`, `US-036-*`, `US-035-*`, `US-052-*` |
| FEATURE | [F-009](../chức-năng/FEATURE-009.md), [F-036](../chức-năng/FEATURE-036.md), [F-035](../chức-năng/FEATURE-035.md) (nhật ký thao tác), [F-052](../chức-năng/FEATURE-052.md) (tra cứu API) |
| Tiền điều kiện | Tài khoản ADMIN đầu tiên được seed từ biến môi trường (PROPOSED — roles-permissions §4.3) |
| Kích hoạt | Nhân viên mở `/pos/login` (SCR-09); quản lý mở **Tài khoản** (SCR-20), **Nhật ký thao tác** (SCR-38), **Cài đặt** (SCR-33) |
| Luồng chính | **1.** Quản lý tạo tài khoản (username, mật khẩu, họ tên, vai STAFF / MANAGER / ADMIN) → đăng nhập được ngay (AC-009-01). **2.** Nhân viên đăng nhập SCR-09 → `POST /api/auth/login` → token (8 giờ — PROPOSED) + chấm công vào (UC-12). **3.** Mỗi request: server kiểm token, tài khoản còn hoạt động, quyền theo `PERMISSIONS`. **4.** Điều hướng theo vai: STAFF → SCR-10; MANAGER → SCR-10 + nút "Hôm nay" (SCR-42 rút gọn); ADMIN → trang quản lý và vẫn vào SCR-10. **5.** Quản lý xem nhật ký thao tác SCR-38 (chỉ đọc; lọc thời gian, người, đối tượng, hành động; xem trước / sau) |
| Luồng thay thế | **A1.** Sửa họ tên / vai, đặt lại mật khẩu, khóa / mở. **A2.** Xóa tài khoản: chưa có thao tác → xóa hẳn; đã có → xóa mềm, không đăng nhập được, username dùng lại được (ADR-004). **A3.** Chỉnh ngưỡng trưởng ca & sổ quỹ ở Cài đặt (SCR-33). **A4.** Đăng xuất → chấm công ra (UC-12) |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Sai tên đăng nhập hoặc mật khẩu | `401` "Sai tên đăng nhập hoặc mật khẩu" (không lộ tài khoản có tồn tại hay không) |
| E2 | Tài khoản bị khóa | `403 ACCOUNT_LOCKED` "Tài khoản đã bị khóa"; token cũ bị từ chối ở request kế tiếp (BR-017, AC-009-03) |
| E3 | Trùng username (không phân biệt hoa / thường) | `409 USERNAME_TAKEN` "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" (BR-004, AC-009-02) |
| E4 | Hạ vai / khóa / xóa ADMIN đang hoạt động cuối cùng; hai quản lý hạ quyền nhau cùng lúc | `409 LAST_ADMIN`; đúng một thành công (BR-047, AC-036-04) |
| E5 | Tự đổi vai / tự khóa / tự xóa | `400 CANNOT_CHANGE_OWN_ROLE` / `400 CANNOT_LOCK_SELF` / `400 CANNOT_DELETE_SELF` (Q-022 (4)) |
| E6 | Không token; sai vai; trưởng ca / nhân viên mở trang `/admin/*` | `401`; `403`; chuyển về `/pos?denied=admin` (BR-044, AC-036-01, AC-036-02) |
| E7 | Sửa / xóa nhật ký thao tác | Không có API; `UPDATE AuditLogs` bị trigger chặn (AC-035-04) |
| E8 | Nhân viên / trưởng ca gọi `GET /api/admin/api-docs` (Tra cứu API, SCR-46) | `403`; chưa đăng nhập `401` (BR-084, AC-052-04) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Users` | `PasswordHash` (hash, không plaintext — AC-009-04), `Role`, `IsActive`, `DeletedAt` |
| `Settings` | `manager.*`, `cash.approve_threshold` |
| `AuditLogs` | Bản ghi chỉ đọc, giữ 12 tháng |
| `Attendance` | Chấm công vào khi STAFF / MANAGER đăng nhập |

- **Log cần ghi:** nhật ký mọi thay đổi tài khoản / cài đặt (`/api/admin/*`), bỏ password / hash / token (BR-055); đăng nhập không có sự kiện realtime.
- **BR liên quan:** BR-004, BR-017, BR-044, BR-047, BR-052, BR-055, BR-084.
- **User Flow:** `SCR-09 -> [sai / bị khóa?] -> SCR-09 (báo lỗi) | [vai?] -> SCR-10 (STAFF) / SCR-10 + SCR-42 rút gọn (MANAGER) / trang quản lý SCR-20…SCR-42 (ADMIN)` · `SCR-20 -> [trùng tên / LAST_ADMIN?] -> SCR-20` · `SCR-38`

---

## UC-18 — Khách gọi nhân viên

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-GUEST |
| Actor phụ | ACT-STAFF |
| Story | `US-021-*` |
| FEATURE | [F-021](../chức-năng/FEATURE-021.md) |
| Tiền điều kiện | Khách thuộc phiên chưa đóng |
| Kích hoạt | Khách bấm **🙋 Gọi nhân viên** ở SCR-05 |
| Luồng chính | **1.** Sheet chọn nhanh (Xin nước lọc / Xin thêm đá / Xin khăn giấy / Dọn bàn) hoặc ghi yêu cầu khác. **2.** `POST /api/sessions/{id}/call-staff`. **3.** Quầy nhận `session.staff_called`: dải xanh "🙋 Gọi nhân viên" + âm `bell`, kèm tên bàn + yêu cầu (AC-021-01). **4.** Nhân viên xử lý, bấm **Đã xử lý** (`POST /api/staff-calls/{id}/handle`). **5.** Phát `session.staff_call_handled`; khách được báo (AC-021-03) |
| Luồng thay thế | **A1.** Sau 60 giây khách gọi lại được |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Gọi lại trong 60 giây | `429 TOO_SOON { retryAfter }` (AC-021-02) |
| E2 | Khách không thuộc phiên | `403` |
| E3 | Phiên đã đóng | `409` |
| E4 | Bấm "Đã xử lý" lần 2 / máy khác đã xử lý | `409 ALREADY_PROCESSED` |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `StaffCalls` | +1 dòng; khi xử lý: `HandledAt`, `HandledBy` |

- **Log cần ghi:** realtime `session.staff_called`, `session.staff_call_handled` (room `staff` + phiên); không ghi nhật ký thao tác.
- **BR liên quan:** chưa có BR riêng — quy tắc nằm ở FEATURE-021 và roles-permissions §4.4 ("60 giây / lần").
- **User Flow:** `SCR-05 -> [đã quá 60 giây từ lần gọi trước?] -> SCR-10 (dải Gọi nhân viên) -> [Đã xử lý] -> SCR-05 (được báo)`

---

## UC-19 — Tạm ngưng nhận đơn QR / giờ bán

| Trường | Đặc tả |
| --- | --- |
| Actor chính | ACT-STAFF (bật / tắt nhận đơn QR), ACT-ADMIN (giờ bán danh mục, cài đặt, lịch thực đơn) |
| Actor phụ | ACT-GUEST (bị áp) |
| Story | `US-020-*`, `US-040-*` |
| FEATURE | [F-020](../chức-năng/FEATURE-020.md), [F-040](../chức-năng/FEATURE-040.md) |
| Tiền điều kiện | Đăng nhập (nhân viên trở lên cho công tắc; ADMIN cho giờ bán / lịch / cài đặt) |
| Kích hoạt | Nhân viên bấm nút "QR: đang nhận đơn / tạm ngưng" trên thanh quầy; quản lý sửa giờ bán danh mục (SCR-21), Cài đặt (SCR-33), lịch (SCR-34) |
| Luồng chính | **1.** Nhân viên tắt nhận đơn QR (kèm thông báo) → `PUT /api/store`. **2.** Phát `store.status_changed` tới khách và quầy. **3.** Menu khách hiện banner, nút Gửi đơn bị khóa; khách gửi → `503 STORE_CLOSED`. **4.** Quầy vẫn bán mang đi (UC-05) và gọi món tại bàn (UC-08). **5.** Bật lại → khách đặt được (AC-020-01) |
| Luồng thay thế | **A1.** Giờ bán danh mục: ngoài giờ → menu khách ẩn danh mục; quầy vẫn thấy và bán; giờ kết thúc < giờ bắt đầu = qua nửa đêm (AC-020-02). **A2.** Giờ bán được đồng bộ thành lịch SHOW "Giờ bán — <danh mục>" (F-040); các lịch thực đơn khác áp cùng cơ chế (UC-14). **A3.** Trang khách tự tải lại menu đúng mốc `nextChangeAt` |

**Ngoại lệ**

| # | Tình huống | Hệ thống phản hồi |
| --- | --- | --- |
| E1 | Khách gửi đơn khi quán tạm ngưng | `503 STORE_CLOSED` (BR-030) |
| E2 | Khách gửi món ngoài giờ bán / ngoài lịch | `409 ITEM_UNAVAILABLE` ("… ngoài giờ bán") (BR-034, AC-040-04) |
| E3 | Nhân viên / trưởng ca sửa giờ bán, cài đặt, lịch (`/api/admin/*`) | `403` (BR-044) |
| E4 | Khách (không token) gọi `PUT /api/store` | `401` (AC-036-02) |

**Hậu điều kiện / dữ liệu thay đổi**

| Dữ liệu | Thay đổi |
| --- | --- |
| `Settings` | `store.accepting_orders`, `store.closed_message` |
| `Categories` | `SellFrom` / `SellTo` |
| `MenuSchedules` | Lịch "Giờ bán — …" (`SourceCategoryId`) tạo / sửa / xóa theo giờ bán |

- **Log cần ghi:** nhật ký **tạm ngưng nhận đơn** (`PUT /api/store`) và thao tác `/api/admin/*` (BR-055); realtime `store.status_changed`, `menu.updated`.
- **BR liên quan:** BR-030, BR-031, BR-034, BR-055.
- **User Flow:** `SCR-10 (nút QR: đang nhận / tạm ngưng) -> [tắt?] -> SCR-02 (banner, khóa Gửi đơn)` · `SCR-21 (giờ bán danh mục) / SCR-33 / SCR-34 -> [ngoài giờ / ngoài lịch?] -> SCR-02 (ẩn danh mục / món)`

---

## Gate G1 — Nghiệp vụ

Theo sổ tay (bước 06): chỉ chuyển sang bước 07 (chia Module) sau khi xác nhận phạm vi MVP, Actor, danh sách chức năng, Story ưu tiên, AC/BR, Use Case và các ngoại lệ cốt lõi; điểm chưa quyết định phải nằm trong Decision / Open Questions Log.

| Hạng mục G1 | Tài liệu / bằng chứng | Tình trạng hồ sơ |
| --- | --- | --- |
| Bài toán, mục tiêu đo được, phạm vi MVP + phạm vi hiện hành, ngoài phạm vi, ràng buộc, rủi ro | [project-brief.md](../sản-phẩm/project-brief.md) (mục 2, 4–9) | Có |
| Actor | [actors.md](actors.md) mục 1 — 8 Actor (5 người dùng + 3 hệ thống ngoài) | Có |
| Danh sách chức năng theo Actor (AF) | [actors.md](actors.md) mục 2 — 112 dòng AF, phủ 46 FEATURE | Có |
| Story ưu tiên | `US-<FFF>-<n>` — tài liệu User Story của TASK-057 (agent khác đang viết); `US-046-1…3`, `US-047-1…3` đã có trong [FEATURE-046](../chức-năng/FEATURE-046.md), [FEATURE-047](../chức-năng/FEATURE-047.md). Ưu tiên Must / Should theo quy tắc ở actors.md mục 2 | Đang hoàn thiện |
| AC / BR | AC-xxx trong từng FEATURE ([chức-năng/README.md](../chức-năng/README.md)); BR-001…BR-073 ([business-rules.md](business-rules.md)) | Có |
| Use Case + User Flow | File này — UC-01…UC-19 | Có |
| Ngoại lệ cốt lõi + trạng thái nghiệp vụ | Bảng "Ngoại lệ" của từng UC; máy trạng thái ở [workflows-states.md](workflows-states.md) | Có |
| Decision / Open Questions Log | [open-questions.md](../open-questions.md): Q-000, Q-008 mở; Q-019…Q-022 đã áp, chờ xác nhận; Q-023 chờ mở task. Quyết định: [quyết-định/README.md](../quyết-định/README.md) (ADR-000…008) | Có — còn điểm mở |

| Người duyệt | Phạm vi | Trạng thái | Ngày duyệt |
| --- | --- | --- | --- |
| Chủ dự án (tên người ký: Q-000) | Gate G1 — toàn bộ hạng mục trên | **Chờ chủ dự án duyệt** | — |
