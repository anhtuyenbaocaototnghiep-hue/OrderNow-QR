---
name: advanced-features
description: Giai đoạn 4–8 của cafe-qr-app — gọi lại đơn cũ/món yêu thích, thời gian chờ ước tính, chia bill theo người, kho nâng cao (bán thành phẩm/BOM 2 cấp, lô & hạn dùng FEFO, dự báo nhập hàng, nhà cung cấp & PO, đổi đơn vị & giá vốn, hao hụt định mức), sổ quỹ, lãi/lỗ, chấm công & phân ca & audit log, vai Trưởng ca, chiến dịch CRM, giới thiệu bạn, tích điểm & tem, thực đơn theo lịch, menu engineering, phân tích giờ cao điểm & dự báo, dashboard chủ quán. Dùng khi task giao FEATURE-024…043 hoặc nhắc các từ khóa trên.
---

# Mục đích

Mở rộng hệ thống đã có (đặt món QR, realtime, trừ kho BOM, thu tiền mặt, gọi thanh toán, mang đi, **và** các feature 013–023 của skill `extend-features`: hội viên, combo, khuyến mãi, gợi ý, tùy chọn món, chốt ca, hoàn tiền, tự hết món, gọi nhân viên, giảm giá tay, nhập kho/kiểm kê) bằng 20 chức năng ở mục 4, giữ nguyên bất biến kho (BR-001/002), tiền (BR-007/019) và bộ tính giá `pricing`.

Nguồn chính là `docs/` của repo; skill này chỉ bổ sung. Lệch nhau → ghi `docs/open-questions.md`, làm theo docs.

# Khi dùng

Task giao FEATURE-024…043, một giai đoạn ở mục 3, hoặc nói "gọi lại đơn", "thời gian chờ", "chia bill", "bán thành phẩm/sơ chế", "lô/hạn sử dụng", "dự báo nhập", "nhà cung cấp/PO", "đơn vị/giá vốn", "hao hụt", "sổ quỹ", "lãi lỗ", "chấm công/phân ca/audit", "trưởng ca", "chiến dịch/Zalo", "giới thiệu bạn", "tích điểm/tem", "thực đơn theo mùa", "menu engineering", "giờ cao điểm/dự báo doanh thu", "dashboard chủ quán".

# Điều kiện trước

- Source chạy được local; lệnh lấy từ `docs/operations/local-development.md` / `package.json`. Không bịa lệnh.
- Các feature tiền đề đã DONE (kiểm trong `docs/tasks/README.md`): F-014 hội viên; F-018 chốt ca; F-023 nhập kho & kiểm kê; module `pricing`; F-013 tùy chọn món (cho gọi lại đơn đủ tùy chọn); F-016 khuyến mãi (cho chiến dịch/voucher). Thiếu tiền đề → dừng feature đó, báo, làm feature độc lập khác.
- Đã đọc `AGENTS.md`, `.agent/rules.md`, skill `extend-features` mục 1 (khảo sát) và mục 5 (`pricing`).

---

# 1. Bước 0 bắt buộc: khảo sát rồi mới làm

Như skill `extend-features` mục 1: liệt kê schema/SP/route/trang FE **thật**, chạy test baseline, viết `docs/plans/<TASK>-plan.md` với bảng map "tên trong skill → tên thật". Riêng skill này cần thêm:

- Xác nhận cách `Payments` đang gắn với phiên (một dòng/phiên, unique index) — F-026 sẽ đổi.
- Xác nhận `InventoryTransactions.Type` đang có những giá trị nào — F-027/028/032 thêm giá trị mới.
- Xác nhận `Users.Role` CHECK hiện tại — F-036 thêm `MANAGER`.
- Xác nhận có job nền nào chưa (cron/`setInterval`) — F-029/042/043 cần job đêm; nếu chưa có, tạo một bộ lập lịch duy nhất trong `apps/api/src/jobs/` (dùng `node-cron` hoặc `setInterval` có khóa tránh chạy trùng), không rải nhiều timer.

---

# 2. Quyết định mặc định (áp dụng khi `docs/decisions/` không nói khác; ghi ADR khi dùng)

| Mã | Mặc định | Có thể đổi |
| --- | --- | --- |
| D-17 | **Chia bill**: mỗi phần (split) là một nhóm món; món chưa ai nhận thuộc phần "Chung"; phần Chung phải thanh toán trước hoặc cùng phần cuối; mỗi phần một `Payments`; phiên đóng khi mọi phần đã thu; chiết khấu hội viên áp theo hội viên của từng phần | Chia đều theo đầu người |
| D-18 | **ETA** = `base` (Settings, mặc định 2 phút) + Σ thời gian chuẩn của các món đang xếp hàng trước (PENDING/PREPARING chưa xong) ÷ `kitchen.parallelism` (mặc định 1) + thời gian chuẩn của giỏ hiện tại; hiển thị khoảng ±25 %; thời gian chuẩn món = trung vị 30 ngày (`AcceptedAt→CompletedAt`) hoặc admin nhập, mặc định 3 phút | Chỉ dùng số admin nhập |
| D-19 | **Bán thành phẩm** là một `Ingredients` có `Kind='SEMI'` và công thức sơ chế; được lồng tối đa 3 cấp, cấm vòng; BOM món trỏ vào SEMI như nguyên liệu thường nên SP trừ kho hiện có không đổi | Chỉ 1 cấp |
| D-20 | **Theo lô** là tùy chọn theo nguyên liệu (`TrackLots`); khi bật, trừ kho tiêu thụ lô theo FEFO (hết hạn sớm trước); `StockQty` tổng vẫn là nguồn sự thật cho khả dụng, Σ lô = `StockQty` là bất biến | Bắt buộc mọi nguyên liệu |
| D-21 | **Giá vốn**: bình quân gia quyền (`AVG`) mặc định; `FIFO` chỉ khi nguyên liệu `TrackLots`; COGS dòng đơn chốt lúc **hoàn tất** | FIFO toàn bộ |
| D-22 | **Dự báo** tiêu thụ theo ngày-trong-tuần bằng trung bình trượt có trọng số 4 tuần (0,4/0,3/0,2/0,1) nhân (1 + hao hụt định mức); tồn an toàn = 20 % nhu cầu kỳ; job chạy 02:00 giờ quán | 8 tuần; trọng số khác |
| D-23 | **Sổ quỹ**: chi từ két cần lý do + danh mục; > 500.000đ hoặc danh mục "Khác" cần ADMIN/MANAGER duyệt; ảnh hóa đơn lưu thư mục `uploads/receipts/` (≤ 2 MB, jpg/png/webp) | Ngưỡng khác; lưu cloud |
| D-24 | **Vai MANAGER** (Trưởng ca): mọi quyền STAFF + giảm giá tay đến 20 %/50.000đ, hoàn tiền trong ca, duyệt chi quỹ ≤ 2.000.000đ, mở/đóng ca, sửa chấm công trong ngày; **không** vào báo cáo tài chính, lãi/lỗ, cấu hình giá/BOM, tài khoản | Ngưỡng khác |
| D-25 | **Chấm công** tự động theo đăng nhập/đăng xuất POS (và đóng ca); sửa tay phải có lý do và ghi audit | Chấm công bằng mã PIN |
| D-26 | **Audit log** cho mọi endpoint đổi tiền/kho/quyền/giá; lưu before/after JSON; giữ 12 tháng; ADMIN chỉ đọc | — |
| D-27 | **Tích điểm** 1 điểm/10.000đ thực trả (sau giảm), làm tròn xuống; đổi tại quầy lúc thu tiền; điểm không hết hạn trong bản đầu. **Tem**: chương trình theo danh sách món, đủ 10 tem → 1 món miễn phí (món rẻ nhất trong danh sách hoặc món chỉ định) | Tỷ lệ/ngưỡng khác; hết hạn 12 tháng |
| D-28 | **Giới thiệu bạn**: người mới nhập SĐT người giới thiệu lúc đăng ký; khi người mới thanh toán lần đầu ≥ 30.000đ → cả hai nhận voucher 10 % (dùng trong 30 ngày); một SĐT chỉ được giới thiệu một lần, không tự giới thiệu | Thưởng điểm thay voucher |
| D-29 | **Chiến dịch**: kênh mặc định `EXPORT` (xuất CSV danh sách + nội dung để gửi tay) và `ZALO_OA` qua adapter (chỉ bật khi có `ZALO_OA_TOKEN`); SMS để sau; tôn trọng `Members.OptOut`; mỗi hội viên tối đa 1 tin/7 ngày | Thêm SMS |
| D-30 | **Menu engineering** phân loại theo trung vị số lượng bán và trung vị lợi nhuận gộp/món trong kỳ (mặc định 30 ngày); bỏ món bán < 5 lần khỏi phân loại | Ngưỡng 70 % theo Kasavana–Smith |
| D-31 | **P&L** là ước tính: doanh thu thuần (− hoàn, − giảm) − COGS (từ `OrderItems.CogsAmount`, thiếu thì BOM × giá vốn hiện tại) − chi quỹ (danh mục "chi phí") − chi phí cố định phân bổ theo ngày; luôn ghi nhãn "ước tính" trên UI | — |
| D-32 | **Dashboard chủ quán** là trang `/admin/today` responsive, số liệu tính sẵn 1 lần/ngày (job 00:30) + nút "Tính lại"; không push notification trong bản đầu | Push qua Zalo sau |

---

# 3. Thứ tự giai đoạn và phụ thuộc

| Giai đoạn | Feature theo thứ tự | Tiền đề |
| --- | --- | --- |
| **4 — Khách & hội viên** | F-024 Gọi lại đơn/yêu thích → F-040 Thực đơn theo lịch → F-025 Thời gian chờ → F-026 Chia bill | F-014, F-013, F-020 |
| **5 — Kho nâng cao** | F-031 Đơn vị & giá vốn → F-027 Bán thành phẩm → F-032 Hao hụt định mức → F-028 Lô & FEFO → F-030 Nhà cung cấp & PO → F-029 Dự báo nhập hàng | F-023 |
| **6 — Tài chính & nhân sự** | F-036 Vai Trưởng ca → F-033 Sổ quỹ → F-035 Chấm công/phân ca/audit → F-034 Lãi/lỗ | F-018, F-031 (cho COGS) |
| **7 — CRM** | F-039 Tích điểm & tem → F-038 Giới thiệu bạn → F-037 Chiến dịch | F-014, F-016 |
| **8 — Phân tích** | F-041 Menu engineering → F-042 Giờ cao điểm/dự báo/so sánh/theo bàn → F-043 Dashboard chủ quán | F-031, F-033, F-034 |

Mỗi feature = một task, một migration, một PR. Giai đoạn 5 phải làm đúng thứ tự (đơn vị/giá vốn trước, dự báo sau cùng).

---

# 4. Đặc tả feature

Tên bảng/cột là đề xuất — map sang tên thật ở Bước 0. Tiền `DECIMAL(12,0)` VND; số lượng kho `DECIMAL(18,3)`; thời gian UTC.

## Giai đoạn 4 — Khách & hội viên

### F-024 — Gọi lại đơn lần trước & món yêu thích

- **Hành vi**: sau khi tra cứu SĐT (khách trên điện thoại, hoặc quầy ở màn Bán mang đi), hiện thẻ "Lần trước bạn gọi: Cà phê sữa (ít đường) ×1, Bánh croissant ×1 — Gọi lại?" và dải "Món yêu thích" (top 5 món hội viên mua nhiều nhất + món tự đánh dấu ♥). Bấm "Gọi lại" → nạp vào giỏ **sau khi kiểm**: món còn bán, tùy chọn còn hợp lệ, giá lấy **hiện tại** (không lấy giá cũ); món không còn → báo và bỏ qua.
- **Dữ liệu**: `MemberFavorites(MemberId, MenuItemId, CreatedAt, PRIMARY KEY)`; không cần bảng mới cho "lần trước" (query `Orders`/`OrderItems`/`OrderItemModifiers` theo `MemberId` qua phiên hoặc đơn mang đi, `PaymentStatus='PAID'`).
- **API**: `GET /api/members/{id}/recent-orders?limit=3` (khách: chỉ khi `memberId` đang gắn vào phiên của mình; quầy: JWT), `GET /api/members/{id}/favorites`, `PUT/DELETE /api/members/{id}/favorites/{menuItemId}`, `POST /api/cart/replay { orderId }` → trả giỏ đã kiểm (`items[]`, `skipped[]`).
- **UI**: khách — thẻ trên màn menu/giỏ sau khi nhập SĐT; nút ♥ trên thẻ món (chỉ khi đã gắn hội viên). Quầy — ở S-13 sau khi nhập SĐT.
- **Kiểm**: gọi lại đơn có món đã hết → giỏ thiếu món đó + thông báo; giá đã đổi → giỏ dùng giá mới; khách phiên khác gọi API với `memberId` lạ → 403; ♥ lưu và hiện lại lần sau.

### F-040 — Thực đơn theo mùa / khung giờ tự động

- **Dữ liệu**: `MenuSchedules(ScheduleId, Name, StartDate NULL, EndDate NULL, DaysOfWeekMask TINYINT DEFAULT 127, StartTime TIME NULL, EndTime TIME NULL, IsActive BIT)`; `MenuScheduleItems(ScheduleId, MenuItemId NULL, CategoryId NULL, Mode VARCHAR(10) CHECK IN ('SHOW','HIDE'))`. Thay thế/khái quát `Categories.SellFrom/SellTo` của F-020 (giữ cột cũ, map thành một schedule khi migrate).
- **Quy tắc**: món/danh mục hiển thị khi (không thuộc schedule nào) hoặc (thuộc ≥ 1 schedule `SHOW` đang hiệu lực) và không thuộc schedule `HIDE` đang hiệu lực. Áp cho menu khách và gợi ý; quầy vẫn bán được món bị ẩn (có cảnh báo). Thời gian theo giờ quán.
- **API/UI**: `GET/POST/PUT /api/admin/menu-schedules`, `PATCH …/active`; `GET /api/menu` lọc theo lịch và trả `nextChangeAt` để FE tự tải lại menu khi đổi khung giờ. Admin: trang Lịch thực đơn (xem trước "menu lúc 15:00 thứ 7").
- **Kiểm**: 06:00 thấy bánh mì, 11:00 không; lịch theo mùa 01/12–31/12 → ngoài khoảng ẩn; món vừa `SHOW` (lịch A) vừa `HIDE` (lịch B) → ẩn.

### F-025 — Thời gian chờ ước tính

- **Dữ liệu**: `ALTER TABLE MenuItems ADD PrepSeconds INT NULL;` `Settings`: `kitchen.base_seconds=120`, `kitchen.parallelism=1`, `eta.spread_percent=25`; bảng `ItemPrepStats(MenuItemId, MedianSeconds, SampleCount, ComputedAt)` do job đêm tính từ `Orders.AcceptedAt→CompletedAt` chia đều cho số dòng trong đơn (xấp xỉ) — nếu chưa có `AcceptedAt`, thêm cột và ghi khi Tiếp nhận.
- **API**: `GET /api/queue/eta?items=<menuItemId:qty,…>` → `{ minMinutes, maxMinutes, queueLength }`; tính theo D-18; cache 10 giây.
- **UI**: khách — dòng "Dự kiến khoảng 8–12 phút" ở giỏ trước nút Gửi và trên màn theo dõi (cập nhật khi có sự kiện); POS — cột Mới hiển thị "Hàng chờ: 6 món · ~9 phút". Admin: sửa `PrepSeconds` từng món, xem thống kê thực tế vs chuẩn.
- **Kiểm**: hàng chờ 0 → ETA = base + thời gian giỏ; thêm 3 đơn vào hàng chờ → ETA tăng; `parallelism=2` → giảm ~½; món chưa có thống kê → dùng 180 s mặc định.

### F-026 — Chia bill theo người trong phiên gộp

- **Hành vi**: trên màn theo dõi đơn của phiên gộp có nút "Chia bill" → mỗi khách (theo `clientToken`) chạm chọn các dòng món là của mình (đặt tên phần: "Anh A", "Chị B"); dòng chưa ai nhận thuộc phần "Chung". Khi Gọi thanh toán, quầy thấy phiên có N phần với tổng từng phần; thu tiền **từng phần** (có thể gắn hội viên riêng từng phần), in bill riêng; phiên đóng khi mọi phần đã thu. Nhân viên có thể gộp lại thành một phần ("Thu chung").
- **Dữ liệu**
```sql
CREATE TABLE SessionSplits (SplitId INT IDENTITY PRIMARY KEY, SessionId UNIQUEIDENTIFIER NOT NULL REFERENCES Sessions(SessionId),
  Label NVARCHAR(50) NOT NULL, ClientToken CHAR(32) NULL, MemberId INT NULL, IsCommon BIT NOT NULL DEFAULT 0,
  Status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (Status IN ('OPEN','PAID')), PaymentId INT NULL);
ALTER TABLE OrderItems ADD SplitId INT NULL REFERENCES SessionSplits(SplitId);   -- NULL = Chung
ALTER TABLE Payments ADD SplitId INT NULL REFERENCES SessionSplits(SplitId);
-- Đổi unique: bỏ UX_Payments_Session; thêm UX_Payments_Split (SplitId) WHERE SplitId IS NOT NULL;
-- giữ UX_Payments_Session chỉ cho phiên KHÔNG chia (SplitId IS NULL).
```
- **SP**: `sp_SettleSplit(@SplitId, @AmountReceived, @UserId, @MemberId, @MemberDiscount, @ManualDiscount…)` — khóa phiên; phần Chung phải `PAID` trước hoặc gộp vào phần cuối (D-17); tính tổng phần = Σ dòng `SplitId` (+ dòng Chung nếu kèm); ghi `Payments(SplitId)`; đánh dấu `OrderItems`/đơn đã trả (thêm `OrderItems.PaidAt`); khi mọi phần `PAID` → `Sessions.Status='CLOSED'`. `sp_SettleSession` cũ = trường hợp phiên không có split.
- **API**: `POST /api/sessions/{id}/splits { label }`, `PUT /api/sessions/{id}/items/{orderItemId}/split { splitId|null }` (khách chỉ được gán/bỏ dòng cho phần của chính mình hoặc dòng Chung), `GET /api/sessions/{id}/splits`, `POST /api/splits/{id}/settle`, `POST /api/sessions/{id}/splits/merge`.
- **Realtime**: `session.split_changed` tới `session:{id}` và `staff`.
- **Kiểm**: 2 khách, 4 dòng, mỗi người nhận 2 → 2 phần, tổng đúng; thu phần A → phiên vẫn `OPEN`; thu phần B → `CLOSED`; dòng Chung còn lại khi thu phần cuối → tự gộp; chiết khấu hội viên chỉ áp lên phần có hội viên; đồng thời thu cùng một phần → 1 OK 1 409.

## Giai đoạn 5 — Kho nâng cao

### F-031 — Đổi đơn vị & giá vốn bình quân/FIFO

- **Dữ liệu**: `Units(UnitCode PK, Name, BaseUnitCode NULL, Factor DECIMAL(18,6))` (ví dụ `thung → lon ×24`, `lon → ml ×330`, `kg → g ×1000`); `ALTER TABLE Ingredients ADD BaseUnitCode VARCHAR(10), AvgCost DECIMAL(18,2) NOT NULL DEFAULT 0, LastCost DECIMAL(18,2) NULL;` `StockReceiptLines` thêm `UnitCode, PackQty` (nhập "2 thùng" → quy ra base 15.840 ml); `InventoryTransactions` thêm `UnitCost DECIMAL(18,2) NULL, CostAmount DECIMAL(18,2) NULL`; `OrderItems ADD CogsAmount DECIMAL(12,0) NULL`; `Settings cost.method = AVG`.
- **Quy tắc**: mọi tồn kho/BOM lưu theo base unit; nhập kho quy đổi và cập nhật `AvgCost = (tồn × AvgCost + nhập × giá)/(tồn + nhập)`; hoàn tất đơn → `CogsAmount` = Σ nhu cầu × `AvgCost` (hoặc FIFO theo lô khi F-028 và `cost.method=FIFO`), ghi `CostAmount` lên dòng `DEDUCT` trong cùng transaction (sửa `sp_CompleteOrder`).
- **UI/API**: admin quản lý Đơn vị; form nhập kho chọn đơn vị đóng gói; báo cáo giá vốn theo nguyên liệu. `GET /api/admin/reports/cogs?from&to` (theo món: số lượng, doanh thu, COGS, biên %).
- **Kiểm**: nhập 1 thùng 24 lon 330 ml → tồn +7.920 ml; AvgCost đúng sau 2 lần nhập giá khác; hoàn tất ly cà phê → `CogsAmount` = 25 ml × AvgCost cốt + …; đơn cũ không bị tính lại khi giá đổi.

### F-027 — Bán thành phẩm / BOM 2 cấp / phiếu sơ chế

- **Dữ liệu**
```sql
ALTER TABLE Ingredients ADD Kind VARCHAR(5) NOT NULL DEFAULT 'RAW' CHECK (Kind IN ('RAW','SEMI')), ShelfLifeHours INT NULL;
CREATE TABLE SemiRecipes (SemiIngredientId INT PRIMARY KEY REFERENCES Ingredients(IngredientId),
  OutputQty DECIMAL(18,3) NOT NULL CHECK (OutputQty > 0), Instructions NVARCHAR(500) NULL);
CREATE TABLE SemiRecipeLines (SemiIngredientId INT NOT NULL REFERENCES SemiRecipes(SemiIngredientId),
  InputIngredientId INT NOT NULL REFERENCES Ingredients(IngredientId), Qty DECIMAL(18,3) NOT NULL CHECK (Qty > 0),
  PRIMARY KEY (SemiIngredientId, InputIngredientId));
CREATE TABLE PrepBatches (BatchId INT IDENTITY PRIMARY KEY, SemiIngredientId INT NOT NULL, Multiplier DECIMAL(9,3) NOT NULL DEFAULT 1,
  OutputQty DECIMAL(18,3) NOT NULL, UnitCost DECIMAL(18,2) NOT NULL, PreparedBy INT NOT NULL, PreparedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
  ExpiresAt DATETIME2(0) NULL, Note NVARCHAR(200) NULL);
-- InventoryTransactions.Type thêm 'PREP_OUT' (trừ nguyên liệu đầu vào), 'PREP_IN' (cộng bán thành phẩm)
```
- **SP `sp_PostPrepBatch`**: một transaction; khóa các nguyên liệu đầu vào `WITH (UPDLOCK, HOLDLOCK)`; kiểm đủ (`StockQty − ReservedQty ≥ Qty × Multiplier`); trừ đầu vào (`PREP_OUT`, kèm `CostAmount` theo `AvgCost`/FIFO); cộng đầu ra `OutputQty × Multiplier` (`PREP_IN`); `UnitCost` bán thành phẩm = Σ chi phí đầu vào ÷ đầu ra; cập nhật `AvgCost` của SEMI; nếu F-028 bật → tạo lô với `ExpiresAt = now + ShelfLifeHours`. Kiểm vòng lặp công thức khi lưu (DFS ≤ 3 cấp).
- **Hành vi**: BOM món trỏ vào SEMI như nguyên liệu bình thường → trừ kho/khả dụng/tự hết món hoạt động không đổi. POS/admin có màn "Sơ chế": chọn công thức, hệ số (×2 = pha 2 mẻ), xem nguyên liệu sẽ trừ, bấm Hoàn tất mẻ. Cảnh báo "cốt cà phê còn 300 ml — nên pha thêm" theo ngưỡng hiện có.
- **Kiểm**: công thức cốt: 100 g hạt + 1.000 ml nước → 900 ml cốt; pha ×2 → hạt −200, nước −2.000, cốt +1.800; thiếu hạt → 409, không đổi gì; công thức A dùng B dùng A → 400 `RECIPE_CYCLE`; bán ly cà phê trừ cốt đúng 25 ml; COGS ly = 25 × UnitCost cốt.

### F-032 — Hao hụt định mức & phiếu hủy hàng

- **Dữ liệu**: `ALTER TABLE Ingredients ADD WastePercent DECIMAL(5,2) NOT NULL DEFAULT 0;` `WasteLogs(WasteId, IngredientId, Qty, Reason VARCHAR(20) CHECK IN ('SPILL','EXPIRED','QUALITY','OTHER'), Note, CreatedBy, CreatedAt)` → mỗi phiếu tạo `InventoryTransactions(ADJUST, Reason='WASTE:…')`.
- **Báo cáo kiểm kê (mở rộng F-023)**: cho mỗi nguyên liệu trong kỳ: tiêu thụ lý thuyết (Σ DEDUCT + PREP_OUT), hao hụt định mức = tiêu thụ × `WastePercent`, hủy đã ghi (WasteLogs), chênh lệch kiểm kê; **thất thoát bất thường** = chênh lệch − định mức − hủy đã ghi; tô đỏ khi > 0 và > 2 % tiêu thụ. Dự báo (F-029) nhân `(1 + WastePercent)`.
- **Kiểm**: WastePercent 5 %, tiêu thụ 1.000 ml, kiểm kê thiếu 40 ml → "bình thường"; thiếu 120 ml → thất thoát 70 ml.

### F-028 — Lô & hạn sử dụng (FEFO)

- **Dữ liệu**
```sql
ALTER TABLE Ingredients ADD TrackLots BIT NOT NULL DEFAULT 0;
CREATE TABLE IngredientLots (LotId INT IDENTITY PRIMARY KEY, IngredientId INT NOT NULL, LotCode NVARCHAR(30) NULL,
  Qty DECIMAL(18,3) NOT NULL CHECK (Qty >= 0), ExpiryDate DATE NULL, UnitCost DECIMAL(18,2) NOT NULL,
  Source VARCHAR(10) NOT NULL CHECK (Source IN ('RECEIPT','PREP','ADJUST')), SourceId INT NULL,
  ReceivedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), IsClosed BIT NOT NULL DEFAULT 0);
CREATE INDEX IX_Lots_FEFO ON IngredientLots (IngredientId, IsClosed, ExpiryDate, ReceivedAt);
ALTER TABLE InventoryTransactions ADD LotId INT NULL;
```
- **Quy tắc**: nhập kho/sơ chế nguyên liệu `TrackLots` phải tạo lô (hạn dùng bắt buộc nếu `ShelfLifeHours`/ngày hết hạn có); trừ kho (`sp_CompleteOrder`, `sp_PostPrepBatch`) tiêu thụ lô theo `ExpiryDate ASC, ReceivedAt ASC` (set-based với running total hoặc vòng lặp trong SP, cùng transaction, cùng khóa); có thể tách một `DEDUCT` thành nhiều dòng theo lô. **Bất biến**: Σ `Qty` lô mở = `StockQty` (test sau mọi kịch bản). Lô hết hạn: job 06:00 phát `inventory.expiring` (≤ 2 ngày) và `inventory.expired`; nhân viên "Hủy lô hết hạn" → WasteLogs(EXPIRED) + đóng lô. Kiểm kê (F-023) theo lô khi `TrackLots`. Điều chỉnh tay giảm → trừ lô FEFO; tăng → lô `ADJUST`.
- **API/UI**: `GET /api/admin/ingredients/{id}/lots`, `POST /api/admin/lots/{id}/write-off`; dải cảnh báo hạn dùng ở trang kho và dashboard; chọn hạn dùng ở form nhập kho.
- **Kiểm**: 2 lô sữa (hạn 20/10 và 25/10), bán 300 ml → trừ lô 20/10 trước; bán vượt lô 1 → phần dư sang lô 2, 2 dòng `DEDUCT`; Σ lô = StockQty sau 50 thao tác ngẫu nhiên; lô hết hạn vẫn còn Qty → cảnh báo, và bị **bỏ qua** khi trừ (D-20: không bán hàng hết hạn — hệ quả: khả dụng = Σ lô chưa hết hạn, cần cập nhật công thức khả dụng khi `TrackLots`).

### F-030 — Nhà cung cấp & đơn đặt hàng (PO)

- **Dữ liệu**: `Suppliers(SupplierId, Name, Phone, Email, LeadTimeDays INT DEFAULT 1, DeliveryDaysMask TINYINT DEFAULT 127, Note, IsActive)`; `SupplierIngredients(SupplierId, IngredientId, PackUnitCode, PackSize, LastPrice, IsPreferred, PRIMARY KEY)`; `PurchaseOrders(PoId, SupplierId, Status CHECK IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED'), ExpectedDate, CreatedBy, CreatedAt, SentAt, Note)`; `PurchaseOrderLines(PoLineId, PoId, IngredientId, PackUnitCode, OrderedPacks, OrderedBaseQty, ReceivedBaseQty DEFAULT 0, UnitPrice)`; `StockReceipts ADD PoId INT NULL`.
- **Hành vi**: tạo PO tay hoặc từ gợi ý F-029 (chọn nhà cung cấp ưu tiên); "Gửi" = in/PDF/xuất Zalo (không tích hợp EDI); nhận hàng chọn PO → điền sẵn số lượng, sửa thực nhận → `ReceivedBaseQty` cộng dồn, trạng thái `PARTIAL/RECEIVED`; giá nhập cập nhật `LastPrice` và lịch sử giá (`SupplierPriceHistory`). Báo cáo: giá theo nhà cung cấp theo thời gian, tỷ lệ giao đúng hạn/đủ hàng.
- **Kiểm**: PO 10 thùng, nhận 6 → `PARTIAL`, tồn +6 thùng quy đổi; nhận thêm 4 → `RECEIVED`; nhận vượt → cảnh báo cần xác nhận; hủy PO đã nhận một phần → 409.

### F-029 — Dự báo nhập hàng

- **Dữ liệu**: `DemandForecasts(IngredientId, ForecastDate, ForecastQty, ComputedAt, PRIMARY KEY (IngredientId, ForecastDate))`; job 02:00 tính 14 ngày tới theo D-22 từ `InventoryTransactions` (DEDUCT + PREP_OUT) nhóm theo ngày quán và thứ; bỏ ngày quán đóng cửa (ngày không có `Payments`).
- **API**: `GET /api/admin/inventory/replenishment?nextDeliveryDate=&supplierId=` → mỗi nguyên liệu: tồn khả dụng, đang về (PO `SENT/PARTIAL`), nhu cầu đến ngày giao kế tiếp + lead time, tồn an toàn, **đề xuất nhập** = max(0, nhu cầu + an toàn − khả dụng − đang về) quy ra đơn vị đóng gói (làm tròn lên), ngày dự kiến hết (`runOutDate`), cờ "hết trước ngày giao". `POST /api/admin/purchase-orders/from-suggestion`.
- **UI**: trang Đề xuất nhập hàng: bảng, lọc theo nhà cung cấp, tick → tạo PO; biểu đồ tiêu thụ 4 tuần + dự báo cho một nguyên liệu. Dashboard: "3 nguyên liệu sẽ hết trước thứ 2".
- **Kiểm**: seed tiêu thụ 4 tuần có mẫu thứ 7 cao → dự báo thứ 7 cao hơn thứ 3; tồn 1.000, nhu cầu 3 ngày 1.500 → đề xuất ≥ 500 + an toàn; có PO đang về 800 → giảm tương ứng; nguyên liệu chưa có lịch sử → "Không đủ dữ liệu", không đề xuất.

## Giai đoạn 6 — Tài chính & nhân sự

### F-036 — Vai Trưởng ca (MANAGER) và ma trận quyền

- **Dữ liệu**: `Users.Role` CHECK thêm `'MANAGER'`; `Settings` cho ngưỡng D-24 (`manager.discount_max_percent`, `manager.discount_max_amount`, `manager.refund_same_shift_only`, `manager.cash_out_approve_max`).
- **Ma trận** (server kiểm bằng middleware `requireRole`/`requirePermission`; FE chỉ ẩn/hiện):

| Hành động | STAFF | MANAGER | ADMIN |
| --- | --- | --- | --- |
| Bán, tiếp nhận, hoàn tất, thu tiền, mang đi, in | ✔ | ✔ | ✔ |
| Giảm giá tay | ≤ 10 %/20k | ≤ 20 %/50k | không giới hạn |
| Hoàn tiền | ✘ (cần duyệt) | trong ca | ✔ |
| Mở/đóng ca, chi quỹ ≤ ngưỡng, duyệt chi | ✘ | ✔ | ✔ |
| Sửa chấm công (trong ngày) | ✘ | ✔ | ✔ |
| Sơ chế, nhập kho theo PO, hủy hàng | ✔ | ✔ | ✔ |
| Kiểm kê POST, điều chỉnh kho tay | ✘ | ✔ | ✔ |
| Menu/giá/BOM/khuyến mãi/hội viên cấu hình, tài khoản, báo cáo tài chính, P&L, audit | ✘ | ✘ | ✔ |

- **Kiểm**: ma trận actor × endpoint tự động (bảng test sinh từ ma trận); hạ ADMIN cuối cùng xuống MANAGER → 409 `LAST_ADMIN`.

### F-033 — Sổ quỹ (thu/chi tiền mặt ngoài bán hàng)

- **Dữ liệu**: `CashCategories(CategoryId, Name, Direction CHECK IN ('IN','OUT'), IsExpense BIT, IsActive)` (seed: Mua đá, Điện nước, Trả shipper, Lương tạm ứng, Nộp tiền về két tổng, Bổ sung tiền lẻ…); `CashTransactions(CashTxnId, ShiftId NOT NULL, CategoryId, Direction, Amount, Reason NVARCHAR(200) NOT NULL, ReceiptImagePath NULL, CreatedBy, ApprovedBy NULL, Status CHECK IN ('PENDING','APPROVED','REJECTED'), CreatedAt)`.
- **Quy tắc**: phải có ca mở; chi > ngưỡng D-23 → `PENDING` đến khi MANAGER/ADMIN duyệt (duyệt trên POS bằng xác thực lại hoặc trên admin); **chốt ca** (F-018) tính `ExpectedCash = OpeningCash + Σ thu bán − Σ hoàn + Σ CashIN − Σ CashOUT(APPROVED)`; phiếu chốt ca in cả bảng thu/chi quỹ; ca có giao dịch `PENDING` không đóng được (phải duyệt/từ chối).
- **API/UI**: `POST /api/cash-transactions` (multipart ảnh), `GET /api/cash-transactions?shiftId`, `POST /api/cash-transactions/{id}/approve|reject`; POS: nút "Chi tiền / Thu khác" trong màn ca; admin: Sổ quỹ theo ngày/danh mục, xuất CSV.
- **Kiểm**: chi 50k mua đá → chốt ca lệch −50k so với trước và khớp két; chi 800k → `PENDING`, đóng ca → 409; ảnh > 2 MB → 400; STAFF duyệt → 403.

### F-035 — Chấm công, phân ca, năng suất, audit log

- **Dữ liệu**: `Attendance(AttId, UserId, ClockIn, ClockOut NULL, ShiftId NULL, Source CHECK IN ('LOGIN','MANUAL'), EditedBy NULL, EditReason NULL)`; `Rosters(RosterId, UserId, WorkDate, StartTime, EndTime, Note)`; `AuditLogs(AuditId BIGINT, UserId, Role, Action, Entity, EntityId, BeforeJson NVARCHAR(MAX), AfterJson, Ip, UserAgent, At)`.
- **Hành vi**: đăng nhập POS tạo `ClockIn` nếu chưa có bản ghi mở trong 12 giờ; đăng xuất/đóng ca/hết hạn token → `ClockOut`; MANAGER sửa trong ngày có lý do; admin lịch tuần kéo thả, cảnh báo "đi muộn > 15 phút"; năng suất = Σ `Payments.AmountDue` theo `ReceivedBy` và số đơn hoàn tất theo `CompletedBy` trong kỳ. Audit: middleware bọc các route đổi tiền/kho/quyền/giá/BOM/khuyến mãi; ghi sau commit; không ghi mật khẩu/token; admin xem, lọc theo người/thực thể/thời gian; không sửa/xóa.
- **Kiểm**: đăng nhập → có ClockIn; đóng ca → ClockOut; sửa chấm công không lý do → 400; hoàn tiền → 1 dòng audit có before/after; audit không chứa `PasswordHash`.

### F-034 — Lãi/lỗ đơn giản & điểm hòa vốn

- **Dữ liệu**: `FixedCosts(CostId, Name, MonthlyAmount, EffectiveFrom DATE, EffectiveTo NULL)` (mặt bằng, lương cố định, Internet…).
- **API**: `GET /api/admin/reports/pnl?from&to&groupBy=day|month` → `{ revenueGross, discounts, refunds, revenueNet, cogs, grossMargin, grossMarginPct, cashExpenses (theo danh mục IsExpense), fixedCostsAllocated, operatingProfit, breakEvenPerDay, note:"ước tính" }`; hòa vốn/ngày = chi phí cố định/ngày ÷ biên gộp %. Thiếu `CogsAmount` (đơn trước F-031) → fallback BOM × AvgCost hiện tại và gắn cờ `estimatedCogsRows`.
- **UI**: trang P&L với biểu đồ cột doanh thu thuần – COGS – chi phí theo ngày, đường hòa vốn; nhãn "Ước tính" cố định. Chỉ ADMIN.
- **Kiểm**: seed 1 ngày: thu 2.000.000, hoàn 100.000, COGS 600.000, chi quỹ 150.000, cố định 30.000.000/tháng → kết quả đúng theo công thức; MANAGER gọi → 403.

## Giai đoạn 7 — CRM

### F-039 — Tích điểm đổi quà & tem

- **Dữ liệu**: `Members ADD Points` (đã có), `PointTransactions(PtId, MemberId, PaymentId NULL, Delta INT, Type CHECK IN ('EARN','REDEEM','ADJUST','EXPIRE'), Note, CreatedBy, CreatedAt)`; `RewardCatalog(RewardId, Name, PointsCost, RewardType CHECK IN ('DISCOUNT','FREE_ITEM'), DiscountAmount NULL, MenuItemId NULL, IsActive)`; `RewardRedemptions(RedId, MemberId, RewardId, PaymentId, PointsSpent, CreatedAt)`; `StampPrograms(ProgramId, Name, RequiredStamps DEFAULT 10, RewardMenuItemId NULL, IsActive)`, `StampProgramItems(ProgramId, MenuItemId)`, `StampCards(MemberId, ProgramId, Stamps INT, CompletedCards INT, PRIMARY KEY)`, `StampEvents(...)`.
- **Quy tắc**: tích điểm/tem **khi thu tiền** (trong `sp_SettleSession/Split` và nhánh mang đi) theo D-27, trên số thực trả, trừ dòng đã đổi thưởng; đổi thưởng chọn ở drawer thu tiền → đi qua `pricing` như dòng giảm `REWARD` (không cộng dồn với giảm tay trên cùng phần), trừ điểm/tem trong cùng transaction; hoàn tiền → trả lại điểm/tem tương ứng (F-019 mở rộng). Admin điều chỉnh điểm có lý do (audit).
- **UI**: khách thấy điểm/tem trên màn theo dõi ("8/10 tem — còn 2 ly nữa được tặng"); quầy thấy ở ô SĐT; admin: Danh mục thưởng, Chương trình tem, lịch sử.
- **Kiểm**: trả 125.000 → +12 điểm; đổi thưởng 100 điểm khi có 80 → 409; mua 2 ly thuộc chương trình → +2 tem; đủ 10 → thẻ hoàn thành, tem về 0, có 1 lượt "món miễn phí"; hoàn tiền đơn → điểm trừ lại.

### F-038 — Giới thiệu bạn

- **Dữ liệu**: `Members ADD ReferredByMemberId INT NULL, ReferralRewardedAt NULL`; `Vouchers(VoucherId, Code UNIQUE, MemberId NULL, PromotionId NULL, DiscountPercent NULL, DiscountAmount NULL, MinOrderAmount, ExpiresAt, UsedAt NULL, UsedPaymentId NULL, Source CHECK IN ('REFERRAL','CAMPAIGN','MANUAL'))`.
- **Quy tắc** D-28: lúc đăng ký (khách hoặc quầy) có ô "SĐT người giới thiệu" (tùy chọn); kiểm tồn tại, ≠ chính mình, người mới chưa có `ReferredBy`; khi người mới có `Payments` đầu tiên ≥ 30.000đ → job sau commit tạo 2 voucher 10 %/30 ngày, phát realtime/thông báo trên màn khách. Voucher áp ở thu tiền qua `pricing` (một voucher/phần, không cộng dồn với voucher khác; có cộng dồn với % hạng nếu voucher cho phép). Chống lạm dụng: giới hạn 5 lượt giới thiệu/tháng/người, audit.
- **API**: `POST /api/members { …, referrerPhone? }`, `GET /api/members/{id}/vouchers`, `POST /api/vouchers/validate { code, splitId|orderDraft }`, áp trong `settle`/`takeaway` body `voucherCode`.
- **Kiểm**: giới thiệu hợp lệ → sau thanh toán đầu 2 voucher; tự giới thiệu → 400; voucher hết hạn → 409; dùng 2 lần → 409.

### F-037 — Chiến dịch theo phân khúc

- **Dữ liệu**: `Members ADD OptOut BIT DEFAULT 0, LastContactedAt NULL`; `Segments(SegmentId, Name, RuleJson)` — rule đơn giản AND: `tier in`, `lastVisitDaysGte/Lte`, `visitCountGte/Lte`, `totalSpentGte`, `birthdayMonth`, `hasPointsGte`; `Campaigns(CampaignId, Name, SegmentId, Channel CHECK IN ('EXPORT','ZALO_OA','SMS'), MessageTemplate NVARCHAR(500), VoucherPercent NULL, VoucherDays NULL, ScheduledAt NULL, Status CHECK IN ('DRAFT','SCHEDULED','RUNNING','DONE','FAILED'), CreatedBy)`; `CampaignDeliveries(CampaignId, MemberId, VoucherId NULL, Status, SentAt, Error)`.
- **Hành vi**: tạo phân khúc → xem trước số người → tạo chiến dịch (nội dung có placeholder `{name} {voucher} {expires}`) → chạy ngay/lên lịch; mỗi người nhận một voucher riêng (Source `CAMPAIGN`); kênh `EXPORT` sinh CSV (SĐT đầy đủ chỉ trong file tải về, có audit); `ZALO_OA` qua adapter `channels/zaloOa.js` (interface `send({phone, text}) → {ok, error}`), bật khi có token; tôn trọng `OptOut` và tần suất D-29. Đo hiệu quả: số voucher dùng, doanh thu từ voucher, khách quay lại trong 14 ngày.
- **Kiểm**: phân khúc "Thân thiết, 30 ngày chưa ghé" trả đúng tập seed; chạy chiến dịch EXPORT → CSV đúng số dòng, voucher tạo đúng; hội viên OptOut không có trong danh sách; gửi lại trong 7 ngày → bỏ qua và ghi lý do.

## Giai đoạn 8 — Phân tích

### F-041 — Menu engineering

- **API**: `GET /api/admin/reports/menu-engineering?from&to` → mỗi món: `qty, revenue, cogs, margin, marginPerUnit, share`; phân loại D-30: `STAR` (cao–cao), `PLOWHORSE` (bán nhiều, lãi thấp), `PUZZLE` (lãi cao, bán ít), `DOG` (thấp–thấp); kèm gợi ý theo luật: STAR → giữ giá, ưu tiên gợi ý; PLOWHORSE → xem lại BOM/định lượng hoặc tăng giá nhẹ; PUZZLE → đẩy khuyến mãi/ghim/upsell; DOG → cân nhắc bỏ hoặc gộp combo. Kỳ mặc định 30 ngày; loại trừ combo con; combo tính như một món.
- **UI**: biểu đồ phân tán (trục X số lượng, Y lợi nhuận/món, 4 ô theo trung vị) + bảng có bộ lọc danh mục, nút "Ghim món này" (nối F-017) và "Tạo khuyến mãi" (nối F-016). Chỉ ADMIN.
- **Kiểm**: seed 8 món với số liệu biết trước → đúng 4 nhóm; món < 5 lần bán → "Chưa đủ dữ liệu".

### F-042 — Giờ cao điểm, dự báo doanh thu, so sánh kỳ, doanh thu theo bàn

- **API**: `GET /api/admin/reports/heatmap?from&to&metric=orders|revenue` (ma trận 7×24 theo giờ quán); `GET /api/admin/reports/revenue-forecast?days=7` (WMA theo thứ như D-22 trên `Payments.PaidAt`, kèm khoảng ±1 độ lệch chuẩn); `GET /api/admin/reports/compare?period=week|month&offset=` (doanh thu, số đơn, bill trung bình, hội viên mới, COGS % — kỳ này vs kỳ trước, % thay đổi); `GET /api/admin/reports/tables?from&to` (mỗi bàn: số phiên, doanh thu, thời gian ngồi trung bình = `ClosedAt − OpenedAt`, doanh thu/giờ ngồi, bàn "ngồi lâu – doanh thu thấp" khi dưới trung vị doanh thu/giờ).
- **UI**: trang Phân tích với 4 thẻ; heatmap vẽ bằng bảng HTML tô màu (không cần thư viện); biểu đồ đường dự báo Chart.js nếu đã có.
- **Kiểm**: seed đơn 10–11 h thứ 7 dày → ô (T7, 10h) đậm nhất; so sánh tuần: số liệu khớp tính tay; bàn 3 ngồi 3 giờ doanh thu 60k → bị gắn cờ.

### F-043 — Dashboard chủ quán

- **Dữ liệu**: `DailySummaries(SummaryDate PK, RevenueNet, OrderCount, AvgBill, CashVariance, NewMembers, TopItemsJson, LowStockJson, ExpiringJson, PendingApprovals, ComputedAt)` — job 00:30 cho ngày hôm qua + nút "Tính lại hôm nay".
- **UI**: `/admin/today` (và MANAGER được xem bản rút gọn không có tiền lãi): 5 thẻ lớn — doanh thu hôm qua (so với cùng thứ tuần trước), lệch két ca gần nhất, nguyên liệu sắp hết/sắp hết hạn, top 3 món, hội viên mới + voucher đã dùng; dưới là "việc cần làm": chi quỹ chờ duyệt, PO đến hạn nhận, lô hết hạn, kiểm kê quá 7 ngày chưa làm. Responsive ≤ 400 px, tải < 1 s (đọc từ bảng tổng hợp, không query nặng).
- **Kiểm**: job chạy → có dòng summary; số khớp báo cáo chi tiết; trang mở trên điện thoại không cuộn ngang; MANAGER không thấy thẻ lợi nhuận.

---

# 5. Mở rộng bộ `pricing` (bắt buộc khi làm F-026, F-038, F-039)

Thêm vào `settleTotals` đầu vào: `splitLines` (chỉ dòng của phần đang thu), `voucher` (một), `rewards[]` (đổi điểm/tem), và đầu ra thêm `voucherDiscount`, `rewardDiscount`, `pointsEarned`, `stampsEarned`. Thứ tự: khuyến mãi dòng (đã khóa) → khuyến mãi đơn → **voucher** (nếu có, thay thế khuyến mãi đơn nếu lớn hơn, không cộng cả hai) → **thưởng** (dòng REWARD, giảm bằng giá món/số tiền) → chiết khấu hội viên trên phần cho phép → giảm tay → làm tròn xuống 500đ. Điểm/tem tính trên `amountDue` cuối cùng, trừ dòng REWARD. Unit test cho mọi tổ hợp.

# 6. Job nền (một bộ lập lịch duy nhất `apps/api/src/jobs/`)

| Giờ (giờ quán) | Job | Feature |
| --- | --- | --- |
| mỗi 15 phút | thống kê gợi ý, cache ETA | F-017, F-025 |
| 00:30 | `DailySummaries` hôm qua | F-043 |
| 02:00 | `DemandForecasts`, `ItemPrepStats`, menu-engineering cache | F-029, F-025, F-041 |
| 06:00 | cảnh báo lô sắp/đã hết hạn, nguyên liệu sẽ hết trước ngày giao | F-028, F-029 |
| theo lịch | chạy chiến dịch `SCHEDULED` | F-037 |

Job phải: idempotent (chạy lại không nhân đôi), có khóa (`Settings.job.<name>.running` + timeout), ghi `JobRuns(Name, StartedAt, FinishedAt, Status, Error)`, không chạy khi biến `JOBS_ENABLED=false` (môi trường test).

# 7. Quy trình cho mỗi feature

1. Khảo sát (mục 1) → plan. 2. ADR cho D-17…D-32 đã dùng. 3. Migration mới có `IF NOT EXISTS`; không sửa migration cũ. 4. SP `CREATE OR ALTER`, tham số mới có mặc định, giữ khóa và constraint; **thêm test bất biến mới** (Σ lô = StockQty; mỗi phần một Payments; điểm không âm). 5. Backend module mới theo tầng; realtime sau commit; job vào bộ lập lịch chung. 6. FE thuần HTML/CSS/JS, dùng `api.js/socket.js`; Chart.js chỉ nếu tech-stack đã cho phép. 7. Test: unit (`pricing`, dự báo, phân loại), integration + SP trên SQL Server thật (đồng thời ở F-026/027/028/039), E2E luồng chính, **regression hai luồng lõi + luồng hội viên/thu tiền của giai đoạn 1–3**. 8. Docs: feature mới, BR mới, data-model, api-contract, realtime-events, screens-flows, local-development (job, env), tasks. 9. Bàn giao PASS/FAIL/NOT_RUN thật.

# 8. Validation chung (chạy sau mỗi feature)

- Bất biến kho: `StockQty ≥ 0`; `ReservedQty` khớp đơn chưa hoàn tất; Σ lô mở = `StockQty` (nguyên liệu `TrackLots`); (OrderId, IngredientId, LotId) ≤ 1 dòng DEDUCT; `PREP_OUT`/`PREP_IN` của một mẻ cân bằng giá trị.
- Bất biến tiền: mỗi phần/phiên không chia một `Payments`; `AmountDue` = tổng − các khoản giảm − làm tròn; Σ hoàn ≤ thu; `ExpectedCash` chốt ca khớp công thức có sổ quỹ; điểm/tem không âm, mỗi `PaymentId` tối đa một `EARN`.
- Quyền: ma trận F-036 pass; khách không gọi được endpoint quầy/admin; MANAGER không vào tài chính; audit có dòng cho mọi hành động nhạy cảm trong test.
- Dữ liệu cá nhân: SĐT đầy đủ chỉ xuất hiện ở tra cứu quầy và file export có audit; log không chứa SĐT/tên.

# 9. Khi thất bại / không chắc

- Tên bảng/SP thật khác → thích nghi, ghi plan; không tạo bản sao song song.
- Tiền đề (F-014/018/023/`pricing`) thiếu hoặc khác → dừng feature, báo, làm feature khác trong giai đoạn.
- Deadlock trong FEFO/sơ chế → khóa theo `IngredientId` tăng dần, giữ transaction ngắn, retry 1205 ≤ 3; không bỏ khóa.
- Quyết định nghiệp vụ ngoài D-17…D-32 → chọn phương án chặt hơn, ghi Q + ADR tạm.

# 10. Không làm

- Không tích hợp SMS/thanh toán/kế toán/EDI; không máy học (dự báo chỉ WMA); không đa chi nhánh; không push notification.
- Không đổi stack; không tính tiền/điểm ở FE; không bỏ qua `pricing`; không nới constraint để test pass.
- Không gộp nhiều feature một PR; không sửa migration cũ; không bịa lệnh/kết quả/tên file.

# 11. Hoàn thành khi

Feature có migration + SP + API + UI + job (nếu có) + test gồm bất biến và regression PASS trên SQL Server thật; docs và ADR đồng bộ; bàn giao có bằng chứng thật; diff đúng phạm vi.
