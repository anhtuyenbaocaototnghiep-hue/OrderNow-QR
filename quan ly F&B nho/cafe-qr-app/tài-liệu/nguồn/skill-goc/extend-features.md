---
name: extend-features
description: Bổ sung chức năng mới cho cafe-qr-app đã triển khai (hội viên SĐT, combo, khuyến mãi, gợi ý/bán chạy, tùy chọn món, chốt ca, hủy sau thu tiền, tự hết món, gọi nhân viên, giảm giá tay, nhập kho/kiểm kê). Dùng khi task nói "thêm chức năng", "giai đoạn 2", "hội viên", "combo", "khuyến mãi", "gợi ý", "chốt ca", "kiểm kê" — hoặc khi được giao một FEATURE-013…023 ở mục 4 của skill này.
---

# Mục đích

Mở rộng hệ thống **đang chạy** (FE HTML/CSS/JS thuần, BE Node.js/Express, SQL Server, Socket.io, thu tiền mặt, gọi thanh toán, bán mang đi) bằng các chức năng ở mục 4, **không phá** luồng lõi đã có (đặt món → tiếp nhận → hoàn tất/trừ kho → gọi thanh toán → thu tiền → in bill), và giữ nguyên các bất biến kho (BR-001, BR-002) và thanh toán (BR-007, BR-019).

Skill này tự chứa đủ đặc tả để làm việc; nếu repo có `docs/` (features, business-rules, data-model, api-contract) thì **docs là nguồn chính**, skill chỉ bổ sung. Khi hai bên lệch nhau, ghi Q mới vào `docs/open-questions.md` và làm theo docs.

# Khi dùng

- Task giao một trong FEATURE-013…023 hoặc một giai đoạn ở mục 3.
- Task nói "thêm hội viên / combo / khuyến mãi / gợi ý / best-seller / modifier / chốt ca / hoàn tiền / kiểm kê / nhập kho / gọi nhân viên".
- Không dùng cho sửa lỗi luồng lõi hay chỉnh giao diện đơn thuần (dùng `implement-feature` / `verify-change` nếu có).

# Điều kiện trước

- Repo có source thật và chạy được local (SQL Server Docker, `npm run dev`). Lệnh lấy từ `docs/operations/local-development.md` hoặc `package.json`; **không bịa lệnh**.
- Đã đọc `AGENTS.md`, `.agent/rules.md` (nếu có) và mục 2 "Quyết định mặc định" dưới đây.
- Có quyền tạo migration mới trong `db/migrations/` và sửa SP trong `db/procs/` bằng `CREATE OR ALTER`.

---

# 1. Bước 0 bắt buộc: khảo sát hiện trạng trước khi thêm bất cứ gì

Hệ thống đã được triển khai bởi người/agent khác; tên bảng, cột, route, file có thể **khác** tài liệu. Trước mỗi feature:

1. Liệt kê schema thật: `db/migrations/*.sql`, `db/procs/*.sql` (hoặc query `INFORMATION_SCHEMA.TABLES/COLUMNS`, `sys.procedures` trên DB dev). Ghi tên thật của: bảng đơn, dòng đơn, phiên, thanh toán, món, nguyên liệu, BOM, giao dịch kho; SP gửi đơn / hoàn tất / thu tiền.
2. Liệt kê route thật trong `apps/api/src/routes/*` (hoặc nơi tương đương) và service/repository đang gọi SP.
3. Liệt kê trang FE thật trong `apps/web/public/**` và module dùng chung (`api.js`, `socket.js`, `cart.js`, `print.js`…).
4. Chạy test hiện có để biết baseline (PASS/FAIL trước khi sửa).
5. Viết `docs/plans/<TASK>-plan.md` **trước khi code** với: bảng map "tên trong skill → tên thật trong repo", file sẽ sửa, file sẽ tạo, migration số kế tiếp, SP bị ảnh hưởng, test sẽ thêm.

Nếu tìm thấy hành vi lõi đang lệch docs (ví dụ trừ kho ở thời điểm khác), **không sửa trong task này** — ghi Q và báo.

---

# 2. Quyết định mặc định (áp dụng nếu `docs/decisions/` không nói khác)

Chủ dự án đã yêu cầu: hội viên đăng ký **không bắt buộc** bằng **SĐT + họ tên**; lần sau chỉ nhập SĐT là tự chiết khấu; khách mang đi đọc SĐT để nhân viên nhập tay; menu QR có mục **Combo**, **Ưu đãi**, **Gợi ý/Bán chạy**; tất cả quản lý ở admin. Các chi tiết chưa chốt lấy mặc định sau (ghi thành ADR khi bắt đầu Giai đoạn 1; đổi được bằng cách sửa ADR, không sửa code rải rác):

| Mã | Quyết định mặc định | Có thể đổi thành |
| --- | --- | --- |
| D-5 | Ưu đãi hội viên = **hạng + chiết khấu %** (Thành viên 3 %, Thân thiết 5 % từ 1.000.000đ lũy kế, VIP 8 % từ 3.000.000đ) + **đơn đầu tiên −10 %**. Có lưu `TotalSpent`, `Points` để sau này thêm đổi điểm | Tích điểm đổi quà; tem mua 10 tặng 1 |
| D-6 | **Không OTP**. Nhận diện bằng SĐT; hiển thị tên che một phần để xác nhận; rate-limit tra cứu | OTP qua Zalo/SMS (giai đoạn sau) |
| D-7 | Thứ tự tính tiền: **giá khuyến mãi/combo của dòng → giảm theo đơn → chiết khấu hội viên trên phần còn lại (chỉ dòng cho phép cộng dồn) → giảm giá tay → làm tròn XUỐNG 500đ** | Làm tròn 1.000đ; hội viên áp trước |
| D-8 | Khuyến mãi dòng (giá đặc biệt) **khóa lúc gửi đơn**; chiết khấu hội viên và giảm giá tay **tính lúc thu tiền** | Tính tất cả lúc thu tiền |
| D-9 | Combo **cố định** (danh sách món + số lượng), giá do admin đặt; BOM = tổng BOM thành phần | Combo "chọn 1 trong N" |
| D-10 | Hai loại khuyến mãi: `ITEM_PRICE` (giá đặc biệt cho món/danh mục theo lịch) và `ORDER_PERCENT`/`ORDER_AMOUNT` (giảm theo đơn tối thiểu). Mỗi khuyến mãi có cờ `StackWithMember` | Mua N tặng 1, voucher mã |
| D-11 | Gợi ý = **tự động** top 8 theo số lượng bán 7 ngày (tính lại mỗi 15 phút, cache) **+ món ghim tay** xếp trước | Chỉ ghim tay |
| D-12 | Khi nguyên liệu khả dụng không đủ **1 suất** → món tự chuyển "Hết món" trên menu (không cần admin tắt); admin có thể bật lại sau nhập kho | Giữ thủ công như hiện tại |
| D-13 | Tùy chọn món (modifier): nhóm có tối thiểu/tối đa chọn, mỗi tùy chọn có `PriceDelta` và BOM riêng (cộng thêm) | Size thay toàn bộ BOM |
| D-14 | Giảm giá tay: STAFF tối đa 10 % hoặc 20.000đ/bill; vượt ngưỡng cần ADMIN nhập mật khẩu (xác thực lại) | Ngưỡng khác |
| D-15 | Hủy/hoàn sau thu tiền: chỉ ADMIN (hoặc STAFF có ADMIN xác thực), bắt buộc lý do; tùy chọn "hoàn kho" nếu món chưa làm | — |
| D-16 | Dữ liệu cá nhân (NĐ 13/2023): ô đồng ý + mục đích khi đăng ký; danh sách admin che số (`09xx***123`); có chức năng "xóa/ẩn danh theo yêu cầu" | — |

---

# 3. Thứ tự triển khai (giai đoạn) và phụ thuộc

| Giai đoạn | Feature | Lý do thứ tự |
| --- | --- | --- |
| **1 — theo yêu cầu chủ dự án** | F-014 Hội viên → F-017 Gợi ý/bán chạy → F-015 Combo → F-016 Khuyến mãi → Admin "Marketing & Khách hàng" + báo cáo | Hội viên chỉ chạm thu tiền; gợi ý rẻ; combo mở đường cho bộ tính giá; khuyến mãi cần bộ tính giá hoàn chỉnh |
| **2 — vận hành quán** | F-013 Tùy chọn món → F-018 Chốt ca → F-022 Giảm giá tay → F-020 Tự hết món + công tắc nhận đơn → F-021 Gọi nhân viên | Modifier ảnh hưởng BOM/giá, nên làm trước khi dữ liệu thật nhiều; chốt ca cần cho tiền mặt |
| **3 — kiểm soát kho/tiền** | F-019 Hủy/hoàn sau thu → F-023 Nhập kho & kiểm kê | Phụ thuộc chốt ca (hoàn tiền trừ vào ca) |

Mỗi feature là một task riêng, có migration riêng, có thể bàn giao độc lập. **Không gộp nhiều feature vào một PR.**

Bộ tính giá (`pricing`) được tạo ở F-015 và dùng lại ở F-016, F-014, F-022 — xem mục 5.

---

# 4. Đặc tả các feature mới

Quy ước: tên bảng/cột dưới đây là **đề xuất**; map sang tên thật ở Bước 0. Mọi tiền là VND nguyên `DECIMAL(12,0)`. Thời gian UTC.

## F-014 — Hội viên (SĐT + họ tên, không bắt buộc)

**Hành vi**
- Điểm vào: (a) khách — trên màn giỏ hàng và màn theo dõi đơn có ô "Nhập SĐT để nhận ưu đãi"; (b) quầy — ô SĐT trên drawer Thu tiền bàn, màn Bán mang đi, chi tiết phiên.
- Nhập SĐT → chuẩn hóa (bỏ khoảng trắng/dấu, `0xxxxxxxxx` 10 số → lưu `+84xxxxxxxxx`) → tra cứu:
  - chưa có → hiện ô Họ tên + checkbox đồng ý ("Tôi đồng ý cho quán lưu SĐT và tên để tích lũy ưu đãi") → tạo hội viên hạng Thành viên, gắn vào phiên/đơn, báo "Đơn đầu tiên giảm 10 %".
  - đã có → hiện "Nguyễn V. A · Thân thiết · giảm 5 %" (tên che: giữ họ và chữ cái đầu tên) → nút Xác nhận → gắn vào phiên (dine-in: `Sessions.MemberId`) hoặc đơn (mang đi: `Orders.MemberId`).
- Chiết khấu tính lúc **thu tiền** (D-8) theo hạng tại thời điểm đó; in trên bill dòng "Hội viên … − x%: −y đ".
- Sau thu tiền: ghi `MemberTransactions`, cộng `TotalSpent` (số thực trả), `VisitCount`, `LastVisitAt`; nếu vượt ngưỡng → nâng hạng (không hạ hạng tự động).
- Gỡ hội viên khỏi phiên trước khi thu tiền được (nhầm số).

**Bảo mật/quyền**
- Tra cứu SĐT: public cho khách nhưng rate-limit 10 lần/phút/IP và 20 lần/phút/`clientToken`; chỉ trả tên che + hạng + %. Quầy (JWT) được trả tên đầy đủ.
- Admin: danh sách che số, tìm theo SĐT đầy đủ, xem lịch sử, sửa tên/hạng/ghi chú, "Ẩn danh theo yêu cầu" (xóa tên, đổi SĐT thành hash, giữ giao dịch).
- Không có API cho khách tự đổi hạng/điểm.

**Dữ liệu**
```sql
CREATE TABLE MemberTiers (
  TierCode VARCHAR(20) PRIMARY KEY, Name NVARCHAR(50) NOT NULL,
  MinSpent DECIMAL(12,0) NOT NULL, DiscountPercent DECIMAL(5,2) NOT NULL, SortOrder INT NOT NULL);
-- seed: MEMBER 0 3.00 | LOYAL 1000000 5.00 | VIP 3000000 8.00

CREATE TABLE Members (
  MemberId INT IDENTITY PRIMARY KEY,
  Phone VARCHAR(15) NOT NULL UNIQUE,            -- +84...
  FullName NVARCHAR(100) NOT NULL,
  TierCode VARCHAR(20) NOT NULL REFERENCES MemberTiers(TierCode),
  TotalSpent DECIMAL(12,0) NOT NULL DEFAULT 0, VisitCount INT NOT NULL DEFAULT 0, Points INT NOT NULL DEFAULT 0,
  FirstOrderDiscountUsed BIT NOT NULL DEFAULT 0,
  BirthDate DATE NULL, Note NVARCHAR(200) NULL,
  ConsentAt DATETIME2(0) NOT NULL, IsActive BIT NOT NULL DEFAULT 1,
  CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(), LastVisitAt DATETIME2(0) NULL);

ALTER TABLE Sessions ADD MemberId INT NULL REFERENCES Members(MemberId);
ALTER TABLE Orders   ADD MemberId INT NULL REFERENCES Members(MemberId);   -- mang đi
ALTER TABLE Payments ADD MemberId INT NULL REFERENCES Members(MemberId),
  SubtotalAmount DECIMAL(12,0) NULL, PromoDiscount DECIMAL(12,0) NOT NULL DEFAULT 0,
  MemberDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, ManualDiscount DECIMAL(12,0) NOT NULL DEFAULT 0,
  RoundingAdj DECIMAL(12,0) NOT NULL DEFAULT 0;      -- AmountDue = Subtotal - Promo - Member - Manual - RoundingAdj

CREATE TABLE MemberTransactions (
  TxnId BIGINT IDENTITY PRIMARY KEY, MemberId INT NOT NULL REFERENCES Members(MemberId),
  PaymentId INT NOT NULL REFERENCES Payments(PaymentId),
  SpentAmount DECIMAL(12,0) NOT NULL, DiscountAmount DECIMAL(12,0) NOT NULL,
  TierBefore VARCHAR(20) NOT NULL, TierAfter VARCHAR(20) NOT NULL,
  CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
```
`sp_SettleSession` (và nhánh mang đi của `sp_SubmitOrder`) nhận thêm `@MemberId`, `@MemberDiscount`, `@ManualDiscount`, `@ManualReason`, `@ApprovedBy`; **số tiền giảm do service tính bằng bộ `pricing` rồi truyền vào**, SP chỉ kiểm `AmountReceived ≥ AmountDue` và ghi; cập nhật `Members` trong cùng transaction.

**API**
| Method & path | Ai | Ghi chú |
| --- | --- | --- |
| `POST /api/members/lookup { phone }` | khách / quầy | `200 { found, member: { id, maskedName|fullName, tier, discountPercent, firstOrderDiscount } }`; 400 số sai; 429 |
| `POST /api/members { phone, fullName, consent: true }` | khách / quầy | 201; 409 `PHONE_EXISTS` |
| `POST /api/sessions/{id}/member { memberId }` · `DELETE …/member` | khách (phiên của mình) / quầy | gắn/gỡ |
| `POST /api/sessions/{id}/settle { amountReceived, memberId?, manualDiscount?, manualReason? }` | quầy | mở rộng endpoint cũ; trả `breakdown` |
| `POST /api/orders/takeaway { items, amountReceived, memberId?, … }` | quầy | mở rộng |
| `GET /api/admin/members?q=&page=` · `GET/PUT /api/admin/members/{id}` · `POST /api/admin/members/{id}/anonymize` · `GET/PUT /api/admin/member-tiers` | admin | |

**UI**: khách — ô SĐT + modal đăng ký (họ tên + đồng ý) trên giỏ/theo dõi; hiển thị "Bạn đang nhận ưu đãi x%". Quầy — ô SĐT ở S-13, S-14; dòng breakdown trước khi bấm Đã thu tiền. Admin — trang Hội viên, trang Hạng.

**Kiểm**: đăng ký mới → đơn đầu −10 %; lần 2 nhập SĐT → tên che đúng, −3 %; vượt 1.000.000đ lũy kế → lên Thân thiết ở lần sau; số sai định dạng → 400; 11 lần tra cứu/phút → 429; bill in có dòng hội viên; anonymize xong không còn tên/SĐT nhưng `Payments` vẫn đủ; khách gọi API admin → 401/403.

## F-015 — Combo cố định

**Hành vi**: Admin tạo combo = tên, ảnh, giá combo, danh sách (món, số lượng); hiển thị "Tiết kiệm z đ" = Σ giá lẻ − giá combo. Khách/quầy thêm combo như một món. Kiểm kho dùng BOM của **thành phần**. Hoàn tất trừ kho theo thành phần. Bill in dòng combo + các dòng con thụt vào, giá 0.

**Dữ liệu**
```sql
ALTER TABLE MenuItems ADD ItemType VARCHAR(10) NOT NULL DEFAULT 'SINGLE' CHECK (ItemType IN ('SINGLE','COMBO'));
CREATE TABLE ComboComponents (
  ComboMenuItemId INT NOT NULL REFERENCES MenuItems(MenuItemId),
  ComponentMenuItemId INT NOT NULL REFERENCES MenuItems(MenuItemId),
  Quantity INT NOT NULL CHECK (Quantity > 0),
  PRIMARY KEY (ComboMenuItemId, ComponentMenuItemId));
ALTER TABLE OrderItems ADD ParentOrderItemId INT NULL REFERENCES OrderItems(OrderItemId),
  ListPrice DECIMAL(12,0) NULL;              -- giá niêm yết lúc đặt; UnitPrice = giá sau khuyến mãi dòng
```
Trong `sp_SubmitOrder`: với dòng combo, insert 1 dòng cha (`UnitPrice` = giá combo) + N dòng con (`ParentOrderItemId`, `UnitPrice = 0`, `Quantity = qty_combo × qty_thành_phần`). Phần tính nhu cầu nguyên liệu **chỉ** join BOM của dòng có `ItemType = 'SINGLE'` (dòng con) — combo không có BOM riêng. Kiểm `IsAvailable` của mọi thành phần. Cấm combo lồng combo (CHECK ở service + trigger hoặc kiểm trong SP).

**API**: `GET/POST /api/admin/combos`, `PUT /api/admin/combos/{id}` (thay toàn bộ thành phần), `PATCH …/availability`; `GET /api/menu` trả thêm `combos[]` với `components[]` và `savings`.

**Kiểm**: combo 2 thành phần, kho đủ → đơn có 3 dòng, tổng = giá combo; hoàn tất → kho trừ đúng Σ BOM thành phần; một thành phần hết nguyên liệu → combo báo hết; admin đổi giá lẻ → `savings` đổi, đơn cũ không đổi.

## F-016 — Khuyến mãi

**Dữ liệu**
```sql
CREATE TABLE Promotions (
  PromotionId INT IDENTITY PRIMARY KEY, Name NVARCHAR(100) NOT NULL,
  Type VARCHAR(20) NOT NULL CHECK (Type IN ('ITEM_PRICE','ORDER_PERCENT','ORDER_AMOUNT')),
  Value DECIMAL(12,2) NOT NULL,                 -- ITEM_PRICE: giá mới; ORDER_PERCENT: %; ORDER_AMOUNT: số tiền
  MinOrderAmount DECIMAL(12,0) NOT NULL DEFAULT 0,
  StartDate DATE NOT NULL, EndDate DATE NOT NULL,
  DaysOfWeekMask TINYINT NOT NULL DEFAULT 127,  -- bit0=CN … bit6=T7
  StartTime TIME NULL, EndTime TIME NULL,       -- NULL = cả ngày (giờ quán, Asia/Ho_Chi_Minh)
  MaxUsesPerDay INT NULL, StackWithMember BIT NOT NULL DEFAULT 0,
  BadgeText NVARCHAR(30) NULL, IsActive BIT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE PromotionTargets (PromotionId INT REFERENCES Promotions(PromotionId),
  MenuItemId INT NULL REFERENCES MenuItems(MenuItemId), CategoryId INT NULL REFERENCES Categories(CategoryId),
  CHECK ((MenuItemId IS NULL) <> (CategoryId IS NULL)));
CREATE TABLE PromotionUsages (UsageId BIGINT IDENTITY PRIMARY KEY, PromotionId INT NOT NULL, OrderId INT NOT NULL,
  OrderItemId INT NULL, DiscountAmount DECIMAL(12,0) NOT NULL, UsedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME());
ALTER TABLE OrderItems ADD PromotionId INT NULL, LineDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, AllowMemberStack BIT NOT NULL DEFAULT 1;
ALTER TABLE Orders ADD SubtotalAmount DECIMAL(12,0) NULL, PromoDiscount DECIMAL(12,0) NOT NULL DEFAULT 0, OrderPromotionId INT NULL;
```
**Quy tắc**: `ITEM_PRICE` áp cho món (hoặc mọi món trong danh mục) khi `now` trong lịch; một dòng chỉ nhận **một** khuyến mãi dòng (giá thấp nhất thắng); dòng combo không nhận `ITEM_PRICE`. `ORDER_*` áp khi subtotal sau khuyến mãi dòng ≥ `MinOrderAmount`; một đơn chỉ nhận **một** khuyến mãi đơn (giảm nhiều nhất thắng). `MaxUsesPerDay` đếm theo `PromotionUsages` ngày quán. Khuyến mãi dòng và đơn khóa lúc gửi (D-8); thu tiền phiên cộng các đơn đã khóa, không tính lại.

**API**: `GET/POST/PUT /api/admin/promotions`, `PATCH …/active`, `GET /api/admin/promotions/{id}/stats` (lượt dùng, tiền giảm, doanh thu đơn có khuyến mãi); `GET /api/menu` trả `promotions[]` đang hiệu lực + mỗi món có `listPrice`, `price`, `promotionBadge`; `POST /api/orders` trả `breakdown`.

**Kiểm**: happy hour 14–17h: 15h giá 25k thay 35k, 17h01 về 35k; đơn 2 khuyến mãi dòng cùng món → chỉ giá thấp nhất; `MaxUsesPerDay=1` → lượt 2 không giảm; `StackWithMember=0` → thu tiền không chiết khấu hội viên lên dòng đó; thống kê đúng.

## F-017 — Gợi ý / bán chạy / ghim

**Dữ liệu**: `ALTER TABLE MenuItems ADD IsPinned BIT NOT NULL DEFAULT 0, PinLabel NVARCHAR(30) NULL, PinOrder INT NULL, HideFromSuggestions BIT NOT NULL DEFAULT 0;` + bảng `Settings(Key NVARCHAR(50) PK, Value NVARCHAR(200))` với `suggestion.mode = AUTO|PINNED|BOTH`, `suggestion.window_days = 7`, `suggestion.top_n = 8`.

**Tính**: query Σ `Quantity` từ `OrderItems` (dòng SINGLE không phải con combo + dòng combo) của đơn `PAID` trong N ngày; cache trong process 15 phút (hoặc bảng `ItemSalesCache`); `GET /api/menu` trả `suggested[]` = ghim (theo `PinOrder`) + top auto chưa ghim, bỏ `HideFromSuggestions` và món hết. Nhãn: ghim dùng `PinLabel`; auto dùng "Bán chạy".

**Admin**: trang Gợi ý — kéo thả thứ tự ghim, chọn nhãn, ẩn khỏi gợi ý, chọn mode; xem bảng top 20 thực tế.

**Kiểm**: seed 10 đơn → top đúng thứ tự; ghim 2 món → đứng trước; mode PINNED → không có auto; món hết → không xuất hiện.

## Admin "Marketing & Khách hàng" + báo cáo (đi cùng Giai đoạn 1)

Menu admin thêm nhóm: Hội viên · Hạng hội viên · Combo · Khuyến mãi · Gợi ý & ghim. Báo cáo thêm: hội viên mới theo ngày; doanh thu hội viên vs khách lẻ; tỷ lệ quay lại 30 ngày; tổng chiết khấu theo loại (khuyến mãi / hội viên / tay); top khuyến mãi.

## F-013 — Tùy chọn món (modifier)

**Dữ liệu**
```sql
CREATE TABLE ModifierGroups (GroupId INT IDENTITY PRIMARY KEY, Name NVARCHAR(50) NOT NULL,
  MinSelect INT NOT NULL DEFAULT 0, MaxSelect INT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE ModifierOptions (OptionId INT IDENTITY PRIMARY KEY, GroupId INT NOT NULL REFERENCES ModifierGroups(GroupId),
  Name NVARCHAR(50) NOT NULL, PriceDelta DECIMAL(12,0) NOT NULL DEFAULT 0, IsDefault BIT NOT NULL DEFAULT 0,
  IsActive BIT NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 0);
CREATE TABLE ModifierOptionBom (OptionId INT NOT NULL REFERENCES ModifierOptions(OptionId),
  IngredientId INT NOT NULL REFERENCES Ingredients(IngredientId), Amount DECIMAL(18,3) NOT NULL CHECK (Amount > 0),
  PRIMARY KEY (OptionId, IngredientId));
CREATE TABLE MenuItemModifierGroups (MenuItemId INT NOT NULL, GroupId INT NOT NULL, PRIMARY KEY (MenuItemId, GroupId));
CREATE TABLE OrderItemModifiers (OrderItemId INT NOT NULL REFERENCES OrderItems(OrderItemId),
  OptionId INT NOT NULL, OptionName NVARCHAR(50) NOT NULL, PriceDelta DECIMAL(12,0) NOT NULL, PRIMARY KEY (OrderItemId, OptionId));
```
TVP `OrderItemInput` thêm cột `OptionIds NVARCHAR(200)` (danh sách id, phân tách dấu phẩy) hoặc TVP thứ hai `OrderItemOptionInput(LineNo, OptionId)`. Nhu cầu nguyên liệu = Σ qty × (BomItems + ModifierOptionBom của các option đã chọn). `UnitPrice` dòng = giá món (sau khuyến mãi) + Σ `PriceDelta`. Ghi chú tự do giữ nguyên cho các yêu cầu lặt vặt.

**UI**: khách bấm món có nhóm tùy chọn → sheet chọn (radio/checkbox theo Min/Max) → thêm vào giỏ; dòng giỏ hiển thị "Size M, Ít đường"; bill/phiếu pha in các tùy chọn. Admin: trang Nhóm tùy chọn + gán nhóm cho món (nhiều món dùng chung nhóm "Size", "Đường", "Đá", "Topping").

**Kiểm**: Size M +5k → tổng đúng; BOM size M trừ thêm 20 ml; nhóm `MinSelect=1` không chọn → 400; đơn cũ không bị đổi khi admin sửa giá option.

## F-018 — Chốt ca (mở/đóng ca tiền mặt)

**Dữ liệu**: `Shifts(ShiftId, OpenedBy, OpenedAt, OpeningCash, ClosedBy NULL, ClosedAt NULL, ExpectedCash NULL, CountedCash NULL, Difference NULL, Note NULL)`; `ALTER TABLE Payments ADD ShiftId INT NULL`; `Refunds.ShiftId` (F-019).
**Quy tắc**: phải có ca `OPEN` mới thu tiền được (settle/take-away → 409 `NO_OPEN_SHIFT`); một thời điểm chỉ một ca mở (unique filtered index trên `ClosedAt IS NULL`); đóng ca: `ExpectedCash = OpeningCash + Σ AmountDue (ca) − Σ Refunds (ca)`; nhập `CountedCash`; in phiếu chốt ca (tổng đơn, doanh thu theo nhân viên thu, giảm giá, hoàn tiền, chênh lệch). Ca đã đóng không sửa.
**API**: `GET /api/shifts/current`, `POST /api/shifts/open { openingCash }`, `POST /api/shifts/{id}/close { countedCash, note }`, `GET /api/shifts/{id}/report`, `GET /api/admin/shifts?from&to`.
**UI**: POS — banner "Chưa mở ca" chặn thu tiền; màn Mở ca / Đóng ca; Admin — lịch sử ca, chênh lệch.
**Kiểm**: thu tiền khi chưa mở ca → 409; mở ca 2 lần → 409; đóng ca → `ExpectedCash` khớp Σ; chênh lệch âm hiển thị đỏ.

## F-019 — Hủy / hoàn tiền sau khi đã thu

**Dữ liệu**: `Refunds(RefundId, PaymentId, Amount, Reason NVARCHAR(200) NOT NULL, RestockInventory BIT, ApprovedBy, CreatedBy, ShiftId, CreatedAt)`; `Orders.Status` thêm `VOIDED`; `InventoryTransactions.Type` thêm `RESTOCK`.
**Quy tắc**: chỉ trong ngày (hoặc ca) — mặc định cùng ngày quán; hoàn một phần hoặc toàn bộ phiên/đơn; nếu `RestockInventory=1` và đơn đã `COMPLETED` → cộng lại kho theo BOM với dòng `RESTOCK` (chỉ khi lý do là "pha sai/chưa làm"; nhân viên tự chọn, admin chịu trách nhiệm). Tổng hoàn ≤ `AmountDue`. Báo cáo doanh thu trừ hoàn.
**API**: `POST /api/payments/{id}/refunds { amount, reason, restockInventory, orderIds? }` (ADMIN, hoặc STAFF kèm `adminPassword` xác thực lại); `GET /api/admin/refunds`.
**Kiểm**: hoàn toàn bộ → đơn `VOIDED`, doanh thu ngày giảm đúng; hoàn vượt → 400; STAFF không có mật khẩu admin → 403; restock → kho tăng đúng BOM và có dòng `RESTOCK`.

## F-020 — Tự "hết món" + công tắc nhận đơn

- Sau mỗi lần kho thay đổi (hoàn tất, điều chỉnh, nhập kho): tính `available` cho món có BOM; nếu < 1 suất → `IsAvailable = 0`, `AutoSoldOut = 1`; nếu ≥ 1 và `AutoSoldOut = 1` → bật lại. Phát `menu.availability_changed`. Admin tắt tay (`AutoSoldOut = 0`) không bị bật tự động.
- `Settings`: `store.accepting_orders = true|false`, `store.closed_message`. Khi `false`: `POST /api/orders` từ khách → 503 `STORE_CLOSED`; menu khách hiện thông báo; quầy vẫn bán mang đi. Nút bật/tắt trên POS (STAFF) và admin.
- Giờ bán theo danh mục: `Categories.SellFrom TIME NULL, SellTo TIME NULL` — ngoài giờ ẩn danh mục trên menu khách.

## F-021 — Gọi nhân viên

- `StaffCalls(CallId, SessionId, Type VARCHAR(20) ('STAFF'), Message NVARCHAR(100) NULL, RequestedAt, HandledBy NULL, HandledAt NULL)`.
- Khách: nút "Gọi nhân viên" (chọn nhanh: Xin nước / Xin thêm đá / Khác + ghi chú) trên màn theo dõi; chống spam 60 s/phiên.
- POS: dải thông báo riêng (cùng kiểu dải Gọi thanh toán, âm thanh thứ ba), nút "Đã xử lý".
- API: `POST /api/sessions/{id}/call-staff { type, message }`, `POST /api/staff-calls/{id}/handle`; realtime `session.staff_called`, `session.staff_call_handled`.

## F-022 — Giảm giá tay trên bill

- Tham số `manualDiscount` (số tiền hoặc %) + `manualReason` bắt buộc trên `settle` và `takeaway`; ngưỡng D-14 trong `Settings` (`discount.staff_max_percent`, `discount.staff_max_amount`); vượt ngưỡng → yêu cầu `adminUsername/adminPassword` trong body (xác thực lại, không dùng token của STAFF) → lưu `ApprovedBy`.
- Ghi vào `Payments.ManualDiscount`, `ManualReason`, `ApprovedBy`. Báo cáo: tổng giảm tay theo nhân viên/ngày.

## F-023 — Nhập kho & kiểm kê

- `StockReceipts(ReceiptId, Supplier NVARCHAR(100), ReceivedBy, ReceivedAt, Note)` + `StockReceiptLines(ReceiptId, IngredientId, Qty, UnitCost)` → mỗi dòng tạo `InventoryTransactions(IMPORT, +Qty)` trong một transaction; cập nhật `Ingredients.LastUnitCost`.
- `Stocktakes(StocktakeId, CountedBy, CountedAt, Status DRAFT|POSTED)` + `StocktakeLines(IngredientId, SystemQty, CountedQty, Diff, Note)` → khi POST: tạo `ADJUST` cho từng chênh lệch; báo cáo hao hụt theo kỳ (Σ Diff × LastUnitCost).
- Báo cáo giá vốn: COGS món = Σ BOM × `LastUnitCost`; lợi nhuận gộp theo món/ngày (giai đoạn 3, chỉ khi có giá nhập).
- Quy tắc: kiểm kê đang DRAFT khóa điều chỉnh tay nguyên liệu liên quan; không được POST kiểm kê làm `StockQty < ReservedQty`.

---

# 5. Bộ tính giá dùng chung (`pricing`) — tạo ở F-015, bắt buộc dùng ở mọi nơi có tiền

Tạo module thuần (không phụ thuộc Express/DB) ví dụ `apps/api/src/pricing/pricing.js` với hàm thuần, có unit test đầy đủ:

```
priceLines(items, catalog, promotions, now, channel) -> { lines:[{menuItemId, qty, listPrice, unitPrice, lineDiscount, promotionId, allowMemberStack, modifiers:[…], children:[…]}], subtotal, orderPromotion:{id, discount}|null, promoDiscount }
settleTotals({ orders | order, member, tiers, manual:{amount|percent, reason}, settings }) -> { subtotal, promoDiscount, memberDiscount, manualDiscount, roundingAdj, amountDue, memberPercent, firstOrderDiscount, breakdownLines:[…] }
```
Quy tắc cố định (D-7/D-8): giá niêm yết → khuyến mãi dòng (giá thấp nhất) → combo giữ giá combo → cộng `PriceDelta` modifier → subtotal → khuyến mãi đơn (một cái, lớn nhất, nếu đạt tối thiểu) → chiết khấu hội viên = % × Σ(các dòng `allowMemberStack`) (+ đơn đầu −10 % thay thế % hạng nếu lớn hơn) → giảm tay → làm tròn **xuống** 500đ (`roundingAdj` ≥ 0) → `amountDue`. Không được âm; không được giảm quá subtotal.

Service gọi `pricing` **trước** khi gọi SP và truyền số đã tính; SP kiểm lại ràng buộc tối thiểu (`AmountDue ≥ 0`, `AmountReceived ≥ AmountDue`) và ghi. Bill in và màn hình đều lấy từ cùng `breakdownLines` — không tính lại ở FE.

---

# 6. Quy trình cho mỗi feature

1. **Khảo sát** (mục 1) → `docs/plans/<TASK>-plan.md` với bảng map tên.
2. **ADR**: nếu feature dùng quyết định D-5…D-16 chưa có ADR → tạo `docs/decisions/ADR-0xx.md` ghi mặc định đã áp dụng (một dòng/quyết định).
3. **Migration**: file mới `db/migrations/NNNN_<feature>.sql` — chỉ `ALTER/CREATE`, có kiểm `IF NOT EXISTS`; không sửa file cũ; seed dữ liệu cấu hình (hạng, settings) trong migration hoặc `db/seed/`.
4. **SP**: sửa bằng `CREATE OR ALTER` trong `db/procs/`; giữ `SET XACT_ABORT ON`, một transaction, khóa `Ingredients WITH (UPDLOCK, HOLDLOCK)`; thêm tham số có **giá trị mặc định** để code cũ vẫn gọi được; không bỏ constraint bảo vệ kho/thanh toán.
5. **Backend**: thêm module mới (`members/`, `promotions/`, `combos/`, `shifts/`, …) theo tầng `routes → services → repositories`; mở rộng endpoint cũ bằng trường tùy chọn (tương thích ngược); map lỗi mới vào error mapper; phát realtime **sau commit**.
6. **Frontend**: thêm trang/sheet mới trong khu vực tương ứng; dùng `api.js`/`socket.js` hiện có; không thêm framework/thư viện ngoài danh sách tech-stack; cập nhật `print.js`/trang receipt khi bill đổi.
7. **Test**: unit `pricing`; integration endpoint + SP trên SQL Server thật (gồm đồng thời ở F-015/F-019); E2E luồng chính của feature; chạy lại toàn bộ test cũ (không được fail thêm).
8. **Docs**: cập nhật `docs/features/FEATURE-0xx.md` (tạo mới từ mục 4), `business-rules.md` (thêm BR mới có ID), `data-model.md`, `api-contract.md`, `realtime-events.md`, `screens-flows.md`, `local-development.md` (lệnh mới), `tasks/README.md`.
9. **Bàn giao** theo mẫu: thay đổi, AC đạt/chưa, lệnh test thực chạy + kết quả, NOT_RUN + lý do, docs cập nhật, Q mới, trạng thái.

# 7. Validation chung

- Luồng lõi vẫn chạy: đặt món → tiếp nhận → hoàn tất (kho trừ đúng) → gọi thanh toán → thu tiền → in bill; bán mang đi. Có E2E regression cho hai luồng này; chạy sau mỗi feature.
- Bất biến kho sau mọi test: `StockQty ≥ 0`; `ReservedQty` = Σ nhu cầu đơn chưa hoàn tất; mỗi (OrderId, IngredientId) ≤ 1 dòng `DEDUCT`.
- Bất biến tiền: `AmountDue = Subtotal − Promo − Member − Manual − RoundingAdj`; `AmountReceived ≥ AmountDue`; Σ `Refunds` ≤ `AmountDue`; một phiên một `Payments`.
- Quyền: khách không gọi được API quầy/admin; STAFF không gọi được admin; tra cứu hội viên bị rate-limit.
- Dữ liệu cá nhân: không log SĐT/tên ra console; danh sách admin che số.

# 8. Khi thất bại / không chắc

- SP cũ có chữ ký/tên khác đề xuất → thích nghi theo tên thật, ghi vào plan; không tạo SP trùng chức năng.
- Phát hiện luồng lõi lệch docs → ghi Q, không sửa trong task này.
- Thiếu quyết định nghiệp vụ ngoài D-5…D-16 (ví dụ giới hạn hoàn tiền sau bao lâu) → chọn phương án an toàn nhất (chặt hơn), ghi Q + ADR "tạm", báo trong bàn giao.
- Test đồng thời fail do deadlock → kiểm thứ tự khóa theo `IngredientId`; app retry 1205 ≤ 3 lần; không nới lock/constraint.

# 9. Không làm

- Không thêm OTP/SMS, cổng thanh toán, ví điện tử, Zalo OA, tích điểm đổi quà, combo tùy chọn, voucher mã, multi-chi-nhánh — tất cả nằm ngoài skill này (ghi "làm sau").
- Không đổi stack (giữ HTML/CSS/JS thuần, Node/Express, SQL Server, Socket.io).
- Không tính tiền ở FE; không bỏ qua `pricing` để "tính nhanh" trong route.
- Không gộp nhiều feature vào một migration/PR; không sửa migration đã chạy.
- Không bịa lệnh, kết quả test, hay tên file chưa tồn tại.

# 10. Hoàn thành khi

Feature được giao có: migration + SP + API + UI + test (gồm regression lõi) PASS trên SQL Server thật; docs đồng bộ; ADR cho quyết định mặc định đã dùng; báo cáo bàn giao có PASS/FAIL/NOT_RUN thật; diff không chạm phần ngoài phạm vi.
